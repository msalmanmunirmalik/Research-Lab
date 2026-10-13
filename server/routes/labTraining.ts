/**
 * Tools & Trainings — lab-authored curricula for new researchers.
 * Coursera-style courses: lessons, multi-video playlists, self-assessments.
 */

import crypto from 'crypto';
import express, { type Router } from 'express';
import pool from '../../database/config.js';
import {
  assertActiveLabMember,
  findActiveLabMembership,
} from '../policies/labAccess.js';

const router: Router = express.Router();

const MANAGER_ROLES = new Set([
  'principal_researcher',
  'admin',
  'co_supervisor',
  'lab_manager',
  'pi',
]);

const CATEGORIES = [
  'orientation',
  'safety',
  'biosafety',
  'techniques',
  'equipment',
  'tools',
  'data_management',
  'compliance',
  'language',
  'skills',
  'culture',
  'emergency',
  'other',
] as const;

const ITEM_TYPES = ['document', 'video', 'link', 'checklist'] as const;

type VideoEntry = { url: string; title?: string; minutes?: number };

function toBoolInt(v: unknown): number {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeVideos(input: unknown, fallbackUrl?: string | null): VideoEntry[] {
  const out: VideoEntry[] = [];
  if (Array.isArray(input)) {
    for (const row of input) {
      if (typeof row === 'string' && row.trim()) {
        out.push({ url: row.trim() });
      } else if (row && typeof row === 'object' && typeof (row as any).url === 'string') {
        const url = String((row as any).url).trim();
        if (!url) continue;
        out.push({
          url,
          title: (row as any).title ? String((row as any).title).trim() : undefined,
          minutes: Number((row as any).minutes) || undefined,
        });
      }
    }
  }
  if (!out.length && fallbackUrl && String(fallbackUrl).trim()) {
    out.push({ url: String(fallbackUrl).trim() });
  }
  return out;
}

async function getUserLabId(userId: string, requested?: string | null): Promise<string | null> {
  if (requested) {
    const m = await findActiveLabMembership(pool, userId, requested);
    if (m) return requested;
  }
  const result = await pool.query(
    `SELECT lab_id FROM lab_members
     WHERE user_id = $1 AND COALESCE(is_active, 1) = 1
     ORDER BY
       CASE role
         WHEN 'principal_researcher' THEN 0
         WHEN 'admin' THEN 1
         ELSE 2
       END,
       joined_at ASC,
       lab_id ASC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.lab_id || null;
}

async function canManageLab(userId: string, labId: string): Promise<boolean> {
  const m = await findActiveLabMembership(pool, userId, labId);
  if (!m) return false;
  if (MANAGER_ROLES.has(String(m.role).toLowerCase())) return true;
  const owner = await pool.query(
    `SELECT 1 AS ok FROM labs WHERE id = $1 AND principal_researcher_id = $2 LIMIT 1`,
    [labId, userId]
  );
  return owner.rows.length > 0;
}

async function loadTraining(id: string) {
  const t = await pool.query(`SELECT * FROM lab_trainings WHERE id = $1 LIMIT 1`, [id]);
  return t.rows[0] || null;
}

function slugify(title: string): string {
  const s = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return s || 'course';
}

async function allocateSlug(
  labId: string,
  title: string,
  preferred?: string | null,
  excludeId?: string | null
) {
  const base = slugify(preferred || title);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await pool.query(
      `SELECT 1 AS ok FROM lab_trainings
       WHERE lab_id = $1 AND slug = $2 AND id <> COALESCE($3, '')
       LIMIT 1`,
      [labId, candidate, excludeId || null]
    );
    if (!hit.rows.length) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Resolve by UUID or human slug (slug unique per lab; if ambiguous globally, null). */
async function loadTrainingByRef(ref: string, labIdHint?: string | null) {
  const byId = await loadTraining(ref);
  if (byId) return byId;
  if (labIdHint) {
    const scoped = await pool.query(
      `SELECT * FROM lab_trainings WHERE lab_id = $1 AND slug = $2 LIMIT 1`,
      [labIdHint, ref]
    );
    if (scoped.rows[0]) return scoped.rows[0];
  }
  const bySlug = await pool.query(`SELECT * FROM lab_trainings WHERE slug = $1 LIMIT 2`, [ref]);
  if (bySlug.rows.length === 1) return bySlug.rows[0];
  return null;
}

function coursePath(row: { id: string; slug?: string | null }) {
  const key = row.slug || row.id;
  return `/tools-trainings/courses/${encodeURIComponent(key)}`;
}

async function insertLesson(trainingId: string, item: any, sortOrder: number) {
  const id = item.id || crypto.randomUUID();
  const item_type = ITEM_TYPES.includes(item.item_type) ? item.item_type : 'document';
  const videos = normalizeVideos(item.videos, item.video_url);
  const checklist = Array.isArray(item.checklist)
    ? JSON.stringify(item.checklist)
    : item.checklist_json || null;
  await pool.query(
    `INSERT INTO lab_training_items (
      id, training_id, title, item_type, content_markdown, video_url,
      external_url, checklist_json, videos_json, estimated_minutes, sort_order, is_required
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      trainingId,
      String(item.title || 'Lesson').trim(),
      item_type,
      item.content_markdown ? String(item.content_markdown) : null,
      videos[0]?.url || null,
      item.external_url ? String(item.external_url).trim() : null,
      checklist,
      videos.length ? JSON.stringify(videos) : null,
      Number(item.estimated_minutes) || 10,
      Number(item.sort_order ?? sortOrder) || sortOrder,
      toBoolInt(item.is_required ?? true),
    ]
  );
  return id;
}

async function loadItems(trainingId: string) {
  const items = await pool.query(
    `SELECT * FROM lab_training_items WHERE training_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [trainingId]
  );
  return items.rows.map((row: any) => {
    const videos = normalizeVideos(
      row.videos_json && typeof row.videos_json === 'string'
        ? safeJson(row.videos_json)
        : row.videos_json,
      row.video_url
    );
    return {
      ...row,
      is_required: Boolean(Number(row.is_required)),
      checklist:
        row.checklist_json && typeof row.checklist_json === 'string'
          ? safeJson(row.checklist_json)
          : row.checklist_json || null,
      videos,
      video_url: videos[0]?.url || row.video_url || null,
    };
  });
}

async function loadAssessment(trainingId: string) {
  const r = await pool.query(
    `SELECT * FROM lab_training_assessments WHERE training_id = $1 LIMIT 1`,
    [trainingId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const questions =
    typeof row.questions_json === 'string' ? safeJson(row.questions_json) : row.questions_json;
  return {
    id: row.id,
    training_id: row.training_id,
    title: row.title || 'Self-assessment',
    pass_score: Number(row.pass_score) || 80,
    questions: Array.isArray(questions) ? questions : [],
  };
}

function publicAssessment(assessment: NonNullable<Awaited<ReturnType<typeof loadAssessment>>>) {
  return {
    id: assessment.id,
    training_id: assessment.training_id,
    title: assessment.title,
    pass_score: assessment.pass_score,
    questions: assessment.questions.map((q: any) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      choices: q.choices || undefined,
      // never send correct answers to the client before submit
    })),
  };
}

function gradeAssessment(
  questions: any[],
  answers: Record<string, unknown>,
  passScore: number
): { score: number; passed: boolean; feedback: any[] } {
  const gradable = questions.filter((q) => q.type === 'mcq' || q.type === 'tf');
  const total = gradable.length || 1;
  let correct = 0;
  const feedback: any[] = [];

  for (const q of questions) {
    const given = answers?.[q.id];
    if (q.type === 'reflect') {
      feedback.push({
        id: q.id,
        type: 'reflect',
        ok: true,
        explanation: q.explanation || 'Reflection recorded.',
      });
      continue;
    }
    const ok = String(given ?? '').trim().toLowerCase() === String(q.correct ?? '').trim().toLowerCase();
    if (ok) correct += 1;
    feedback.push({
      id: q.id,
      type: q.type,
      ok,
      correct: q.correct,
      explanation: q.explanation || (ok ? 'Correct.' : 'Review the course materials and try again.'),
    });
  }

  const score = Math.round((correct / total) * 100);
  return { score, passed: score >= passScore, feedback };
}

function mapTraining(row: any, extras: Record<string, unknown> = {}) {
  return {
    id: row.id,
    slug: row.slug || null,
    path: coursePath(row),
    lab_id: row.lab_id,
    title: row.title,
    summary: row.summary || '',
    introduction: row.introduction || '',
    category: row.category,
    audience: row.audience || 'all',
    estimated_minutes: Number(row.estimated_minutes) || 0,
    is_required: Boolean(Number(row.is_required)),
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
    level: row.level || 'beginner',
    pass_score: Number(row.pass_score) || 80,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...extras,
  };
}

function starterPackSummaries() {
  return starterPacks().map((p: any) => ({
    id: `preview:${p.slug}`,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    category: p.category,
    audience: p.audience,
    estimated_minutes: p.estimated_minutes,
    is_required: Boolean(p.is_required),
    item_count: Array.isArray(p.items) ? p.items.length : 0,
    completed_count: 0,
    progress_pct: 0,
    has_assessment: Boolean(p.assessment),
    assessment_passed: false,
    course_complete: false,
    preview: true,
  }));
}

/** List trainings for active lab + viewer progress */
router.get('/', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const labId = await getUserLabId(userId, typeof req.query.lab_id === 'string' ? req.query.lab_id : null);
    if (!labId) {
      return res.json({
        labId: null,
        canManage: false,
        trainings: [],
        starterPreview: starterPackSummaries(),
        categories: CATEGORIES,
      });
    }
    const member = await assertActiveLabMember(pool, userId, labId);
    if (!member.ok) return res.status(member.status).json({ error: member.error });

    const requestedCategory =
      typeof req.query.category === 'string' ? req.query.category : '';
    const safeCategory = (CATEGORIES as readonly string[]).find((c) => c === requestedCategory);
    const result = safeCategory
      ? await pool.query(
          `SELECT * FROM lab_trainings
           WHERE lab_id = $1 AND status != 'archived' AND category = $2
           ORDER BY is_required DESC, sort_order ASC, title ASC`,
          [labId, safeCategory]
        )
      : await pool.query(
          `SELECT * FROM lab_trainings
           WHERE lab_id = $1 AND status != 'archived'
           ORDER BY is_required DESC, sort_order ASC, title ASC`,
          [labId]
        );

    const progress = await pool.query(
      `SELECT training_id, COUNT(*) AS completed_items
       FROM lab_training_item_completions
       WHERE lab_id = $1 AND user_id = $2
       GROUP BY training_id`,
      [labId, userId]
    );
    const progressMap = new Map(
      progress.rows.map((r: any) => [r.training_id, Number(r.completed_items) || 0])
    );

    const itemCounts = await pool.query(
      `SELECT training_id, COUNT(*) AS total_items
       FROM lab_training_items
       WHERE training_id IN (SELECT id FROM lab_trainings WHERE lab_id = $1)
       GROUP BY training_id`,
      [labId]
    );
    const countMap = new Map(
      itemCounts.rows.map((r: any) => [r.training_id, Number(r.total_items) || 0])
    );

    const passedAttempts = await pool.query(
      `SELECT training_id FROM lab_training_assessment_attempts
       WHERE lab_id = $1 AND user_id = $2 AND passed = 1
       GROUP BY training_id`,
      [labId, userId]
    );
    const passedSet = new Set(passedAttempts.rows.map((r: any) => r.training_id));

    const assessments = await pool.query(
      `SELECT training_id FROM lab_training_assessments
       WHERE training_id IN (SELECT id FROM lab_trainings WHERE lab_id = $1)`,
      [labId]
    );
    const hasAssessment = new Set(assessments.rows.map((r: any) => r.training_id));

    const canManage = await canManageLab(userId, labId);
    const trainings = result.rows.map((row: any) => {
      const total = countMap.get(row.id) || 0;
      const done = progressMap.get(row.id) || 0;
      const lessonsPct = total ? Math.round((done / total) * 100) : 0;
      const needsQuiz = hasAssessment.has(row.id);
      const quizPassed = passedSet.has(row.id);
      const courseComplete =
        total > 0 && done >= total && (!needsQuiz || quizPassed || !Number(row.is_required));
      return mapTraining(row, {
        item_count: total,
        completed_count: done,
        progress_pct: courseComplete ? 100 : lessonsPct,
        has_assessment: needsQuiz,
        assessment_passed: quizPassed,
        course_complete: courseComplete,
      });
    });
    res.json({
      labId,
      canManage,
      categories: CATEGORIES,
      trainings,
      starterPreview: trainings.length === 0 ? starterPackSummaries() : [],
    });
  } catch (error: any) {
    console.error('lab-training list error:', error);
    res.status(500).json({ error: 'Failed to list trainings', details: error?.message });
  }
});

/** Seed a starter orientation pack for the lab (managers only, if empty or force) */
router.post('/seed-starter', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const labId = await getUserLabId(userId, req.body?.lab_id || null);
    if (!labId) return res.status(400).json({ error: 'Join or create a lab first' });
    if (!(await canManageLab(userId, labId))) {
      return res.status(403).json({ error: 'Only lab managers can seed training packs' });
    }

    const existing = await pool.query(
      `SELECT COUNT(*) AS c FROM lab_trainings WHERE lab_id = $1 AND status != 'archived'`,
      [labId]
    );
    if (Number(existing.rows[0]?.c || 0) > 0 && !req.body?.force) {
      return res.status(409).json({ error: 'Lab already has trainings. Pass force:true to add starter pack anyway.' });
    }

    const packs = starterPacks();
    for (const pack of packs) {
      const slug = await allocateSlug(labId, pack.title, pack.slug || pack.title);
      await pool.query(
        `INSERT INTO lab_trainings (
          id, lab_id, title, summary, introduction, slug, category, audience, estimated_minutes,
          is_required, sort_order, status, created_by, pass_score, level
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published',$12,$13,$14)`,
        [
          pack.id,
          labId,
          pack.title,
          pack.summary,
          pack.introduction || pack.summary || null,
          slug,
          pack.category,
          pack.audience,
          pack.estimated_minutes,
          pack.is_required,
          pack.sort_order,
          userId,
          pack.pass_score ?? 80,
          pack.level || 'beginner',
        ]
      );
      for (const item of pack.items as any[]) {
        const videos = normalizeVideos(item.videos, item.video_url);
        await pool.query(
          `INSERT INTO lab_training_items (
            id, training_id, title, item_type, content_markdown, video_url,
            external_url, checklist_json, videos_json, estimated_minutes, sort_order, is_required
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            item.id,
            pack.id,
            item.title,
            item.item_type,
            item.content_markdown || null,
            videos[0]?.url || item.video_url || null,
            item.external_url || null,
            item.checklist_json || null,
            videos.length ? JSON.stringify(videos) : null,
            item.estimated_minutes,
            item.sort_order,
            item.is_required,
          ]
        );
      }
      if (pack.assessment) {
        await pool.query(
          `INSERT INTO lab_training_assessments (
            id, training_id, title, pass_score, questions_json
          ) VALUES ($1,$2,$3,$4,$5)`,
          [
            crypto.randomUUID(),
            pack.id,
            pack.assessment.title,
            pack.assessment.pass_score,
            JSON.stringify(pack.assessment.questions),
          ]
        );
      }
    }

    res.status(201).json({ ok: true, created: packs.length });
  } catch (error: any) {
    console.error('lab-training seed error:', error);
    res.status(500).json({ error: 'Failed to seed starter pack', details: error?.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const labHint = await getUserLabId(userId, typeof req.query.lab_id === 'string' ? req.query.lab_id : null);
    const training = await loadTrainingByRef(req.params.id, labHint);
    if (!training) return res.status(404).json({ error: 'Training not found' });
    const member = await assertActiveLabMember(pool, userId, training.lab_id);
    if (!member.ok) return res.status(member.status).json({ error: member.error });

    const items = await loadItems(training.id);
    const comps = await pool.query(
      `SELECT item_id, completed_at, notes FROM lab_training_item_completions
       WHERE training_id = $1 AND user_id = $2`,
      [training.id, userId]
    );
    const completed = new Map(comps.rows.map((r: any) => [r.item_id, r]));

    const assessment = await loadAssessment(training.id);
    let assessmentPassed = false;
    let lastAttempt: any = null;
    if (assessment) {
      const att = await pool.query(
        `SELECT id, score, passed, created_at FROM lab_training_assessment_attempts
         WHERE training_id = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [training.id, userId]
      );
      lastAttempt = att.rows[0] || null;
      assessmentPassed = att.rows.some((r: any) => Number(r.passed) === 1);
    }

    const canManage = await canManageLab(userId, training.lab_id);
    const done = items.filter((i: any) => completed.has(i.id)).length;
    const total = items.length;
    const lessonsPct = total ? Math.round((done / total) * 100) : 0;
    const needsHardQuiz = Boolean(assessment) && Boolean(Number(training.is_required));
    const courseComplete =
      total > 0 && done >= total && (!needsHardQuiz || assessmentPassed);

    res.json({
      canManage,
      training: mapTraining(training, {
        item_count: total,
        completed_count: done,
        progress_pct: courseComplete ? 100 : lessonsPct,
        has_assessment: Boolean(assessment),
        assessment_passed: assessmentPassed,
        course_complete: courseComplete,
      }),
      items: items.map((item: any) => ({
        ...item,
        completed: completed.has(item.id),
        completed_at: completed.get(item.id)?.completed_at || null,
      })),
      assessment: assessment ? publicAssessment(assessment) : null,
      assessment_passed: assessmentPassed,
      last_attempt: lastAttempt
        ? {
            id: lastAttempt.id,
            score: Number(lastAttempt.score),
            passed: Boolean(Number(lastAttempt.passed)),
            created_at: lastAttempt.created_at,
          }
        : null,
    });
  } catch (error: any) {
    console.error('lab-training get error:', error);
    res.status(500).json({ error: 'Failed to load training', details: error?.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const labId = await getUserLabId(userId, req.body?.lab_id || null);
    if (!labId) return res.status(400).json({ error: 'Join or create a lab first' });
    if (!(await canManageLab(userId, labId))) {
      return res.status(403).json({ error: 'Only lab managers can create trainings' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'orientation';
    const id = crypto.randomUUID();
    const slug = await allocateSlug(labId, title, req.body?.slug);
    const introduction = String(req.body?.introduction || '').trim();
    const summary = String(req.body?.summary || '').trim();

    await pool.query(
      `INSERT INTO lab_trainings (
        id, lab_id, title, summary, introduction, slug, category, audience, estimated_minutes,
        is_required, sort_order, status, created_by, pass_score, level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        labId,
        title,
        summary,
        introduction || null,
        slug,
        category,
        String(req.body?.audience || 'all').trim() || 'all',
        Number(req.body?.estimated_minutes) || 30,
        toBoolInt(req.body?.is_required),
        Number(req.body?.sort_order) || 0,
        req.body?.status === 'draft' ? 'draft' : 'published',
        userId,
        Number(req.body?.pass_score) || 80,
        String(req.body?.level || 'beginner').slice(0, 32),
      ]
    );

    const lessons = Array.isArray(req.body?.lessons) ? req.body.lessons : [];
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      if (!lesson?.title || !String(lesson.title).trim()) continue;
      await insertLesson(id, lesson, i);
    }

    // If manager pasted course-level videos with no lessons, create a video lesson.
    const courseVideos = normalizeVideos(req.body?.videos, req.body?.video_url);
    if (!lessons.length && courseVideos.length) {
      await insertLesson(
        id,
        {
          title: 'Course videos',
          item_type: 'video',
          content_markdown: introduction || summary || null,
          videos: courseVideos,
          estimated_minutes: Number(req.body?.estimated_minutes) || 15,
        },
        0
      );
    }

    // Default intro document when creating with introduction but no lessons
    if (!lessons.length && !courseVideos.length && introduction) {
      await insertLesson(
        id,
        {
          title: 'Course introduction',
          item_type: 'document',
          content_markdown: introduction,
          estimated_minutes: 10,
        },
        0
      );
    }

    if (req.body?.assessment && Array.isArray(req.body.assessment.questions)) {
      const questions = req.body.assessment.questions.filter((q: any) => q?.prompt);
      if (questions.length) {
        await pool.query(
          `INSERT INTO lab_training_assessments (id, training_id, title, pass_score, questions_json)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            crypto.randomUUID(),
            id,
            String(req.body.assessment.title || 'Self-assessment').trim(),
            Number(req.body.assessment.pass_score ?? req.body?.pass_score) || 80,
            JSON.stringify(
              questions.map((q: any, idx: number) => ({
                id: q.id || `q${idx + 1}`,
                type: q.type === 'mcq' || q.type === 'tf' || q.type === 'reflect' ? q.type : 'mcq',
                prompt: String(q.prompt),
                choices: q.choices || undefined,
                correct: q.correct != null ? String(q.correct) : undefined,
                explanation: q.explanation ? String(q.explanation) : undefined,
              }))
            ),
          ]
        );
      }
    }

    const created = await loadTraining(id);
    const items = await loadItems(id);
    const assessment = await loadAssessment(id);
    res.status(201).json({
      training: mapTraining(created, { item_count: items.length }),
      items,
      assessment: assessment ? publicAssessment(assessment) : null,
      path: coursePath(created),
    });
  } catch (error: any) {
    console.error('lab-training create error:', error);
    res.status(500).json({ error: 'Failed to create training', details: error?.message });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const labHint = await getUserLabId(userId, null);
    const training = await loadTrainingByRef(req.params.id, labHint);
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can edit trainings' });
    }

    const title = String(req.body?.title ?? training.title).trim();
    const category = CATEGORIES.includes(req.body?.category)
      ? req.body.category
      : training.category;
    let slug = training.slug;
    if (req.body?.slug !== undefined) {
      slug = await allocateSlug(
        training.lab_id,
        title,
        String(req.body.slug || title),
        training.id
      );
    } else if (!slug) {
      slug = await allocateSlug(training.lab_id, title, title, training.id);
    }

    await pool.query(
      `UPDATE lab_trainings SET
        title = $1, summary = $2, introduction = $3, slug = $4, category = $5, audience = $6,
        estimated_minutes = $7, is_required = $8, sort_order = $9, status = $10,
        pass_score = $11, level = $12
       WHERE id = $13`,
      [
        title,
        String(req.body?.summary ?? training.summary ?? '').trim(),
        req.body?.introduction !== undefined
          ? String(req.body.introduction || '').trim() || null
          : training.introduction,
        slug,
        category,
        String(req.body?.audience ?? training.audience ?? 'all'),
        Number(req.body?.estimated_minutes ?? training.estimated_minutes) || 30,
        toBoolInt(req.body?.is_required ?? training.is_required),
        Number(req.body?.sort_order ?? training.sort_order) || 0,
        req.body?.status === 'draft' || req.body?.status === 'archived' || req.body?.status === 'published'
          ? req.body.status
          : training.status,
        Number(req.body?.pass_score ?? training.pass_score) || 80,
        String(req.body?.level ?? training.level ?? 'beginner').slice(0, 32),
        training.id,
      ]
    );

    const updated = await loadTraining(training.id);
    res.json({ training: mapTraining(updated), path: coursePath(updated) });
  } catch (error: any) {
    console.error('lab-training update error:', error);
    res.status(500).json({ error: 'Failed to update training', details: error?.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can delete trainings' });
    }
    await pool.query(`UPDATE lab_trainings SET status = 'archived' WHERE id = $1`, [training.id]);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to archive training', details: error?.message });
  }
});

router.post('/:id/items', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can add lessons' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Lesson title is required' });
    const item_type = ITEM_TYPES.includes(req.body?.item_type) ? req.body.item_type : 'document';
    const id = crypto.randomUUID();
    const checklist = Array.isArray(req.body?.checklist)
      ? JSON.stringify(req.body.checklist)
      : null;
    const videos = normalizeVideos(req.body?.videos, req.body?.video_url);

    await pool.query(
      `INSERT INTO lab_training_items (
        id, training_id, title, item_type, content_markdown, video_url,
        external_url, checklist_json, videos_json, estimated_minutes, sort_order, is_required
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        training.id,
        title,
        item_type,
        req.body?.content_markdown ? String(req.body.content_markdown) : null,
        videos[0]?.url || null,
        req.body?.external_url ? String(req.body.external_url).trim() : null,
        checklist,
        videos.length ? JSON.stringify(videos) : null,
        Number(req.body?.estimated_minutes) || 10,
        Number(req.body?.sort_order) || 0,
        toBoolInt(req.body?.is_required ?? true),
      ]
    );

    const items = await loadItems(training.id);
    res.status(201).json({ items });
  } catch (error: any) {
    console.error('lab-training add item error:', error);
    res.status(500).json({ error: 'Failed to add lesson', details: error?.message });
  }
});

router.put('/:id/items/:itemId', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can edit lessons' });
    }

    const existing = await pool.query(
      `SELECT * FROM lab_training_items WHERE id = $1 AND training_id = $2 LIMIT 1`,
      [req.params.itemId, training.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Lesson not found' });
    const row = existing.rows[0];
    const item_type = ITEM_TYPES.includes(req.body?.item_type) ? req.body.item_type : row.item_type;
    const checklist = Array.isArray(req.body?.checklist)
      ? JSON.stringify(req.body.checklist)
      : row.checklist_json;
    const videos =
      req.body?.videos !== undefined || req.body?.video_url !== undefined
        ? normalizeVideos(req.body?.videos, req.body?.video_url ?? row.video_url)
        : normalizeVideos(
            row.videos_json && typeof row.videos_json === 'string'
              ? safeJson(row.videos_json)
              : row.videos_json,
            row.video_url
          );

    await pool.query(
      `UPDATE lab_training_items SET
        title = $1, item_type = $2, content_markdown = $3, video_url = $4,
        external_url = $5, checklist_json = $6, videos_json = $7, estimated_minutes = $8,
        sort_order = $9, is_required = $10
       WHERE id = $11`,
      [
        String(req.body?.title ?? row.title).trim(),
        item_type,
        req.body?.content_markdown !== undefined
          ? String(req.body.content_markdown)
          : row.content_markdown,
        videos[0]?.url || null,
        req.body?.external_url !== undefined
          ? String(req.body.external_url || '').trim() || null
          : row.external_url,
        checklist,
        videos.length ? JSON.stringify(videos) : null,
        Number(req.body?.estimated_minutes ?? row.estimated_minutes) || 10,
        Number(req.body?.sort_order ?? row.sort_order) || 0,
        toBoolInt(req.body?.is_required ?? row.is_required),
        row.id,
      ]
    );

    const items = await loadItems(training.id);
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update lesson', details: error?.message });
  }
});

router.delete('/:id/items/:itemId', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can delete lessons' });
    }
    await pool.query(`DELETE FROM lab_training_items WHERE id = $1 AND training_id = $2`, [
      req.params.itemId,
      training.id,
    ]);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete lesson', details: error?.message });
  }
});

router.post('/:id/items/:itemId/complete', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    const member = await assertActiveLabMember(pool, userId, training.lab_id);
    if (!member.ok) return res.status(member.status).json({ error: member.error });

    const item = await pool.query(
      `SELECT id FROM lab_training_items WHERE id = $1 AND training_id = $2 LIMIT 1`,
      [req.params.itemId, training.id]
    );
    if (!item.rows[0]) return res.status(404).json({ error: 'Lesson not found' });

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO lab_training_item_completions (
        id, training_id, item_id, user_id, lab_id, notes
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON DUPLICATE KEY UPDATE completed_at = CURRENT_TIMESTAMP, notes = VALUES(notes)`,
      [
        id,
        training.id,
        req.params.itemId,
        userId,
        training.lab_id,
        req.body?.notes ? String(req.body.notes).slice(0, 2000) : null,
      ]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error('lab-training complete error:', error);
    res.status(500).json({ error: 'Failed to mark complete', details: error?.message });
  }
});

/** Upsert course self-assessment (managers) */
router.put('/:id/assessment', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    if (!(await canManageLab(userId, training.lab_id))) {
      return res.status(403).json({ error: 'Only lab managers can edit assessments' });
    }

    const questions = Array.isArray(req.body?.questions) ? req.body.questions : null;
    if (!questions || !questions.length) {
      return res.status(400).json({ error: 'questions array is required' });
    }

    const existing = await loadAssessment(training.id);
    const title = String(req.body?.title || existing?.title || 'Self-assessment').trim();
    const pass_score = Number(req.body?.pass_score ?? existing?.pass_score ?? training.pass_score) || 80;
    const id = existing?.id || crypto.randomUUID();

    if (existing) {
      await pool.query(
        `UPDATE lab_training_assessments SET title = $1, pass_score = $2, questions_json = $3 WHERE id = $4`,
        [title, pass_score, JSON.stringify(questions), id]
      );
    } else {
      await pool.query(
        `INSERT INTO lab_training_assessments (id, training_id, title, pass_score, questions_json)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, training.id, title, pass_score, JSON.stringify(questions)]
      );
    }

    const assessment = await loadAssessment(training.id);
    res.json({ assessment: assessment ? publicAssessment(assessment) : null });
  } catch (error: any) {
    console.error('lab-training assessment upsert error:', error);
    res.status(500).json({ error: 'Failed to save assessment', details: error?.message });
  }
});

/** Submit self-assessment attempt */
router.post('/:id/assessment/attempt', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const training = await loadTrainingByRef(req.params.id, await getUserLabId(req.user.id, null));
    if (!training) return res.status(404).json({ error: 'Training not found' });
    const member = await assertActiveLabMember(pool, userId, training.lab_id);
    if (!member.ok) return res.status(member.status).json({ error: member.error });

    const assessment = await loadAssessment(training.id);
    if (!assessment) return res.status(404).json({ error: 'No assessment for this course' });

    const answers =
      req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const { score, passed, feedback } = gradeAssessment(
      assessment.questions,
      answers,
      assessment.pass_score
    );

    // Optional courses: soft complete — any attempt with reflections counts as passed for progress
    const softPass = !Number(training.is_required) && score >= 0;
    const finalPassed = passed || softPass;

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO lab_training_assessment_attempts (
        id, assessment_id, training_id, user_id, lab_id, score, passed, answers_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        assessment.id,
        training.id,
        userId,
        training.lab_id,
        score,
        toBoolInt(finalPassed),
        JSON.stringify(answers),
      ]
    );

    res.json({
      ok: true,
      score,
      passed: finalPassed,
      pass_score: assessment.pass_score,
      hard_gate: Boolean(Number(training.is_required)),
      feedback,
    });
  } catch (error: any) {
    console.error('lab-training assessment attempt error:', error);
    res.status(500).json({ error: 'Failed to submit assessment', details: error?.message });
  }
});

function starterPacks() {
  const mk = () => crypto.randomUUID();
  const orientId = mk();
  const safetyId = mk();
  const techId = mk();
  const languageId = mk();
  const skillsId = mk();
  const cultureId = mk();

  return [
    {
      id: orientId,
      slug: 'lab-orientation-week-one',
      title: 'Lab orientation — Week One',
      summary:
        'Where things live, who to ask, access, meetings, and how this lab runs day to day.',
      introduction:
        '## Welcome to the lab\n\nThis course is your week-one map: people, places, access, and meeting cadence.\n\n**Outcome:** you know who to ask, where things live, and what to finish before independent work.',
      category: 'orientation',
      audience: 'new_members',
      estimated_minutes: 45,
      is_required: 1,
      sort_order: 0,
      level: 'beginner',
      pass_score: 80,
      items: [
        {
          id: mk(),
          title: 'Welcome & lab map',
          item_type: 'document',
          content_markdown:
            '## Welcome\n\nEdit this lesson with your lab’s real map:\n\n- Desks / write-up space\n- Wet bench bays\n- −80 / LN2 / cold room\n- Shared equipment booking\n- Who to ping for access, keys, and IT\n\n**Ask early:** if you don’t know where something lives by day three, ask a named person.',
          estimated_minutes: 15,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'People & meeting cadence',
          item_type: 'document',
          content_markdown:
            '## Who’s who\n\n- PI / supervisors\n- Lab manager / safety officer\n- Senior students & postdocs for day-to-day help\n\n## Cadence\n\n- Group meeting: _(edit day/time)_\n- 1:1 with PI: _(edit)_\n- How to send updates and bad news',
          estimated_minutes: 10,
          sort_order: 1,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Orientation checklist',
          item_type: 'checklist',
          checklist_json: JSON.stringify([
            'Badge / building access works',
            'Safety induction booked or completed',
            'ELN / notebook access',
            'Shared drive / Slack / email lists',
            'Know who to ask for reagents and booking',
          ]),
          content_markdown: 'Tick these with your mentor in week one.',
          estimated_minutes: 10,
          sort_order: 2,
          is_required: 1,
        },
      ],
    },
    {
      id: safetyId,
      slug: 'lab-safety-essentials',
      title: 'Lab safety essentials',
      summary: 'PPE, waste, incidents, and non-negotiable rules before wet work. Ends with a self-assessment (80% to pass).',
      introduction:
        '## Before wet work\n\nComplete this required safety course. Watch any lab videos your manager adds, then pass the self-assessment at 80%.\n\n**Outcome:** you can explain PPE, waste streams, and the incident response path for this lab.',
      category: 'safety',
      audience: 'all',
      estimated_minutes: 50,
      is_required: 1,
      sort_order: 1,
      level: 'beginner',
      pass_score: 80,
      items: [
        {
          id: mk(),
          title: 'PPE & house rules',
          item_type: 'document',
          content_markdown:
            '## Before you start\n\n- Required PPE in each zone\n- No food/drink rules\n- After-hours policy\n- Where SDS / risk assessments live\n\nReplace this text with your institution’s mandatory modules.',
          estimated_minutes: 15,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Waste, spills, and incidents',
          item_type: 'document',
          content_markdown:
            '## If something goes wrong\n\n1. Protect people first\n2. Contain if safe\n3. Notify _(name/role)_\n4. Document the incident\n\nList chemical, biological, and sharps waste streams for *this* lab.',
          estimated_minutes: 15,
          sort_order: 1,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Safety briefing videos',
          item_type: 'video',
          videos: [] as VideoEntry[],
          video_url: '',
          content_markdown:
            'Managers: add one or more YouTube URLs in the lesson editor (playlist-style list). Use your institution’s official safety induction videos.',
          estimated_minutes: 15,
          sort_order: 2,
          is_required: 0,
        },
      ],
      assessment: {
        title: 'Safety self-assessment',
        pass_score: 80,
        questions: [
          {
            id: 's1',
            type: 'tf',
            prompt: 'Food and drink are allowed at the wet bench if you are careful.',
            correct: 'false',
            explanation: 'Food and drink are never allowed in wet-lab zones.',
          },
          {
            id: 's2',
            type: 'mcq',
            prompt: 'If a chemical spill occurs and you are unsure it is safe to clean, you should:',
            choices: [
              { id: 'a', label: 'Clean it quietly so nobody worries' },
              { id: 'b', label: 'Protect people, contain if safe, notify the named contact, document' },
              { id: 'c', label: 'Leave for the next shift' },
            ],
            correct: 'b',
            explanation: 'People first, then contain only if safe, notify, and document.',
          },
          {
            id: 's3',
            type: 'mcq',
            prompt: 'Before independent wet work you must:',
            choices: [
              { id: 'a', label: 'Complete required safety training for this lab' },
              { id: 'b', label: 'Only watch a colleague once' },
              { id: 'c', label: 'Start if the PI is out of town' },
            ],
            correct: 'a',
            explanation: 'Required safety modules are a gate for independent bench work.',
          },
          {
            id: 's4',
            type: 'reflect',
            prompt: 'In one or two sentences: where do SDS / risk assessments live in your lab, and who is your safety contact?',
            explanation: 'Write this down; ask your mentor if you do not know yet.',
          },
        ],
      },
    },
    {
      id: techId,
      slug: 'core-techniques-sops',
      title: 'Core techniques & SOPs',
      summary: 'Point newcomers to methods they must learn and where SOPs live in Protocol library.',
      introduction:
        '## Methods that matter in month one\n\nUse this course to know *which* techniques to learn first, then follow SOPs in Protocol library.',
      category: 'techniques',
      audience: 'new_members',
      estimated_minutes: 40,
      is_required: 0,
      sort_order: 2,
      level: 'beginner',
      pass_score: 80,
      items: [
        {
          id: mk(),
          title: 'How we use the Protocol library',
          item_type: 'document',
          content_markdown:
            '## Methods in this lab\n\nLink the SOPs new members should shadow first.\n\nUse **Protocol library** in DRM for step-by-step methods; use this training module for *which* methods matter in month one.',
          estimated_minutes: 10,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Technique demos (video playlist)',
          item_type: 'video',
          videos: [] as VideoEntry[],
          content_markdown:
            'Add lab-specific technique videos here (pipetting, sterile work, instrument demos). Multiple YouTube URLs appear as a list under the player.',
          estimated_minutes: 20,
          sort_order: 1,
          is_required: 0,
        },
        {
          id: mk(),
          title: 'Open Protocol library',
          item_type: 'link',
          external_url: '/protocols',
          content_markdown: 'Star the methods your mentor assigns.',
          estimated_minutes: 5,
          sort_order: 2,
          is_required: 1,
        },
      ],
    },
    {
      id: languageId,
      slug: 'scientific-english-basics',
      title: 'Scientific English basics',
      summary:
        'Platform-curated starter for clear lab communication: lab talk, abstracts, and slide language. Labs can edit or replace.',
      introduction:
        '## Communicate clearly under pressure\n\nShort emails, clean abstracts, and presentation language for international and local researchers alike.',
      category: 'language',
      audience: 'all',
      estimated_minutes: 55,
      is_required: 0,
      sort_order: 3,
      level: 'beginner',
      pass_score: 70,
      items: [
        {
          id: mk(),
          title: 'Everyday lab English',
          item_type: 'document',
          content_markdown:
            '## Useful phrases\n\n- “Could you show me once, then watch me once?”\n- “I am blocked on X — do you have 10 minutes?”\n- “I need to escalate this to the PI because…”\n\n## Clarity over polish\n\nPrefer short sentences in emails and ELN notes. State the ask in the first line.',
          estimated_minutes: 15,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Abstracts & figure legends',
          item_type: 'document',
          content_markdown:
            '## Abstract skeleton\n\n1. Context (1–2 sentences)\n2. Gap / question\n3. Approach\n4. Key result\n5. Implication\n\n## Figure legends\n\nWhat is shown → how it was made → what to notice. Avoid interpreting beyond the data.',
          estimated_minutes: 20,
          sort_order: 1,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Presentation language (optional videos)',
          item_type: 'video',
          videos: [] as VideoEntry[],
          content_markdown:
            'Optional: paste YouTube talks on scientific presenting. Practice aloud before group meeting.',
          estimated_minutes: 20,
          sort_order: 2,
          is_required: 0,
        },
      ],
      assessment: {
        title: 'Scientific English check',
        pass_score: 70,
        questions: [
          {
            id: 'l1',
            type: 'mcq',
            prompt: 'In a short email asking for help, you should usually:',
            choices: [
              { id: 'a', label: 'Tell the whole project story first' },
              { id: 'b', label: 'State the ask and blocker in the first lines' },
              { id: 'c', label: 'Only use voice notes' },
            ],
            correct: 'b',
            explanation: 'Lead with the ask so busy mentors can respond quickly.',
          },
          {
            id: 'l2',
            type: 'reflect',
            prompt: 'Rewrite this poorly: “I maybe somehow have a problem with the gel and also other things.” Make it clear and polite.',
            explanation: 'Aim for: what failed, what you tried, what you need.',
          },
        ],
      },
    },
    {
      id: skillsId,
      slug: 'finding-literature-citing',
      title: 'Finding literature & citing',
      summary: 'Research skills for month one: search, evaluate, and cite — with links into Data & Results and Writing studio.',
      introduction:
        '## Search with a question\n\nBuild the habit of saving papers with a reason, then cite while you write.',
      category: 'skills',
      audience: 'new_members',
      estimated_minutes: 35,
      is_required: 0,
      sort_order: 4,
      level: 'beginner',
      pass_score: 70,
      items: [
        {
          id: mk(),
          title: 'Search with a question, not a keyword dump',
          item_type: 'document',
          content_markdown:
            '## Habit\n\n1. Write the research question in one sentence\n2. Extract 2–4 concepts\n3. Search, then refine with inclusion/exclusion notes\n4. Save DOIs / PDFs with a reason you kept each paper\n\nOpen **Data & Results** in DRM to practice finding and organizing sources.',
          estimated_minutes: 15,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Open Data & Results',
          item_type: 'link',
          external_url: '/data-results',
          content_markdown: 'Use evidence tools to collect papers for your first project.',
          estimated_minutes: 10,
          sort_order: 1,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Cite while you write',
          item_type: 'link',
          external_url: '/writing-studio',
          content_markdown: 'Draft in Writing studio and attach citations as you go — do not leave citing for the end.',
          estimated_minutes: 10,
          sort_order: 2,
          is_required: 0,
        },
      ],
    },
    {
      id: cultureId,
      slug: 'lab-culture-collaboration',
      title: 'Lab culture & collaboration',
      summary: 'Credit, notebooks, asking for help, and how we treat each other under pressure.',
      introduction:
        '## How we work together\n\nNorms for notebooks, credit, and asking for help — edit with your lab’s real expectations.',
      category: 'culture',
      audience: 'all',
      estimated_minutes: 25,
      is_required: 0,
      sort_order: 5,
      level: 'beginner',
      pass_score: 80,
      items: [
        {
          id: mk(),
          title: 'How we work together',
          item_type: 'document',
          content_markdown:
            '## Norms\n\n- Notebook / ELN expectations\n- Sharing reagents and data\n- Authorship & slide credit\n- How to ask for help without disappearing\n\nEdit this lesson with your lab’s real norms. Soft-skill practice lives in Tools & Trainings culture/skills courses.',
          estimated_minutes: 15,
          sort_order: 0,
          is_required: 1,
        },
        {
          id: mk(),
          title: 'Asking for help — scenarios',
          item_type: 'document',
          content_markdown:
            '## Practice prompts (discuss with your mentor)\n\n1. You are blocked on a method after two attempts — how do you ask a senior student for 15 minutes?\n2. A result looks bad and the PI meeting is tomorrow — what do you say in the first two sentences?\n3. Someone used the last of a shared reagent — how do you raise it without blame?\n\nWrite short answers in your notebook, then review in 1:1.',
          estimated_minutes: 10,
          sort_order: 1,
          is_required: 0,
        },
      ],
    },
  ];
}

export default router;
