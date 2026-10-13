import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/apiBase';
import { CATEGORY_LABEL } from './types';

type LessonDraft = {
  key: string;
  title: string;
  item_type: 'document' | 'video' | 'link' | 'checklist';
  content_markdown: string;
  videoUrlsText: string;
  external_url: string;
  checklistText: string;
  estimated_minutes: number;
};

type QuestionDraft = {
  key: string;
  type: 'mcq' | 'tf' | 'reflect';
  prompt: string;
  choicesText: string;
  correct: string;
  explanation: string;
};

type Props = {
  categories: string[];
  onCancel: () => void;
  onCreated?: () => void;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugPreview(title: string, custom: string) {
  const raw = (custom || title || 'course')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return raw || 'course';
}

function emptyLesson(partial?: Partial<LessonDraft>): LessonDraft {
  return {
    key: newKey(),
    title: '',
    item_type: 'document',
    content_markdown: '',
    videoUrlsText: '',
    external_url: '',
    checklistText: '',
    estimated_minutes: 10,
    ...partial,
  };
}

function emptyQuestion(): QuestionDraft {
  return {
    key: newKey(),
    type: 'tf',
    prompt: '',
    choicesText: '',
    correct: 'true',
    explanation: '',
  };
}

const CourseComposer: React.FC<Props> = ({ categories, onCancel, onCreated }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [category, setCategory] = useState('orientation');
  const [audience, setAudience] = useState('new_members');
  const [level, setLevel] = useState('beginner');
  const [estimatedMinutes, setEstimatedMinutes] = useState(45);
  const [isRequired, setIsRequired] = useState(true);
  const [passScore, setPassScore] = useState(80);
  const [status, setStatus] = useState<'published' | 'draft'>('published');
  const [lessons, setLessons] = useState<LessonDraft[]>([
    emptyLesson({
      title: 'Course introduction',
      item_type: 'document',
      content_markdown: '',
      estimated_minutes: 10,
    }),
    emptyLesson({
      title: 'Demo / training videos',
      item_type: 'video',
      estimated_minutes: 15,
    }),
  ]);
  const [includeQuiz, setIncludeQuiz] = useState(false);
  const [quizTitle, setQuizTitle] = useState('Self-assessment');
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);

  const previewSlug = useMemo(() => slugPreview(title, slug), [title, slug]);
  const previewPath = `/tools-trainings/courses/${previewSlug}`;

  const updateLesson = (key: string, patch: Partial<LessonDraft>) => {
    setLessons((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('Course title is required');
      return;
    }
    const readyLessons = lessons.filter((l) => l.title.trim());
    if (!readyLessons.length && !introduction.trim()) {
      setError('Add an introduction or at least one lesson before publishing');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        slug: previewSlug,
        summary: summary.trim(),
        introduction: introduction.trim(),
        category,
        audience,
        level,
        estimated_minutes: estimatedMinutes,
        is_required: isRequired,
        pass_score: passScore,
        status,
        lessons: readyLessons.map((l, idx) => ({
          title: l.title.trim(),
          item_type: l.item_type,
          content_markdown:
            l.content_markdown ||
            (idx === 0 && l.item_type === 'document' ? introduction.trim() : undefined) ||
            undefined,
          videos: l.videoUrlsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((url, i) => ({ url, title: `Video ${i + 1}` })),
          external_url: l.external_url || undefined,
          checklist: l.checklistText
            ? l.checklistText
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
            : undefined,
          estimated_minutes: l.estimated_minutes,
          sort_order: idx,
          is_required: true,
        })),
      };

      if (includeQuiz) {
        const qs = questions
          .filter((q) => q.prompt.trim())
          .map((q, idx) => {
            const choices =
              q.type === 'mcq'
                ? q.choicesText
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((label, i) => ({
                      id: String.fromCharCode(97 + i),
                      label,
                    }))
                : undefined;
            return {
              id: `q${idx + 1}`,
              type: q.type,
              prompt: q.prompt.trim(),
              choices,
              correct: q.type === 'reflect' ? undefined : q.correct.trim(),
              explanation: q.explanation.trim() || undefined,
            };
          });
        if (qs.length) {
          payload.assessment = {
            title: quizTitle.trim() || 'Self-assessment',
            pass_score: passScore,
            questions: qs,
          };
        }
      }

      const res = await axios.post('/api/lab-training', payload, { headers: getAuthHeaders() });
      const path = res.data.path || res.data.training?.path;
      onCreated?.();
      if (path) navigate(path);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create course');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-composer">
      <header className="tt-composer-head">
        <div>
          <p className="tt-kicker">Publish a course</p>
          <h2>New training course</h2>
          <p className="tt-muted">
            Fill course details, lessons, and videos now — so the course page is ready when you
            publish.
          </p>
        </div>
        <button type="button" className="tt-btn tt-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <section className="tt-composer-section">
        <h3>1. Course identity</h3>
        <label className="tt-field">
          <span>Title *</span>
          <input
            className="tt-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Biosafety Level 2 induction"
          />
        </label>
        <label className="tt-field">
          <span>URL slug (course ID in the link)</span>
          <input
            className="tt-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={previewSlug}
          />
        </label>
        <p className="tt-course-id-line">
          <span className="tt-badge is-muted">Course link</span>
          <code>{previewPath}</code>
        </p>
        <label className="tt-field">
          <span>Short summary (catalog card)</span>
          <textarea
            className="tt-input"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One or two sentences for the course list"
          />
        </label>
        <label className="tt-field">
          <span>Course introduction / details *</span>
          <textarea
            className="tt-input"
            rows={8}
            value={introduction}
            onChange={(e) => setIntroduction(e.target.value)}
            placeholder={
              '## What you will learn\n\n- Outcomes\n- Who this is for\n- What to complete before independent work\n\nUse markdown headings and bullets.'
            }
          />
        </label>
        <div className="tt-composer-grid">
          <label className="tt-field">
            <span>Category</span>
            <select className="tt-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {(categories.length ? categories : Object.keys(CATEGORY_LABEL)).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] || c}
                </option>
              ))}
            </select>
          </label>
          <label className="tt-field">
            <span>Audience</span>
            <select className="tt-input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">All members</option>
              <option value="new_members">New members</option>
              <option value="phd">PhD / MSc</option>
              <option value="staff">Staff / techs</option>
            </select>
          </label>
          <label className="tt-field">
            <span>Level</span>
            <select className="tt-input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className="tt-field">
            <span>Estimated minutes</span>
            <input
              className="tt-input"
              type="number"
              min={5}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value) || 30)}
            />
          </label>
          <label className="tt-field">
            <span>Quiz pass score %</span>
            <input
              className="tt-input"
              type="number"
              min={50}
              max={100}
              value={passScore}
              onChange={(e) => setPassScore(Number(e.target.value) || 80)}
            />
          </label>
          <label className="tt-field">
            <span>Status</span>
            <select
              className="tt-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'published' | 'draft')}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>
        </div>
        <label className="tt-check">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
          />
          Required for new members (hard quiz gate if assessment included)
        </label>
      </section>

      <section className="tt-composer-section">
        <div className="tt-composer-section-head">
          <h3>2. Lessons & videos</h3>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={() => setLessons((rows) => [...rows, emptyLesson()])}
          >
            Add lesson
          </button>
        </div>
        <p className="tt-muted">
          Each lesson can include markdown notes and multiple YouTube URLs (one per line).
        </p>
        {lessons.map((lesson, idx) => (
          <div key={lesson.key} className="tt-lesson-draft">
            <div className="tt-composer-section-head">
              <strong>
                Lesson {idx + 1}
                {lesson.title ? `: ${lesson.title}` : ''}
              </strong>
              {lessons.length > 1 ? (
                <button
                  type="button"
                  className="tt-btn tt-btn-ghost"
                  onClick={() => setLessons((rows) => rows.filter((r) => r.key !== lesson.key))}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="tt-composer-grid">
              <label className="tt-field">
                <span>Lesson title</span>
                <input
                  className="tt-input"
                  value={lesson.title}
                  onChange={(e) => updateLesson(lesson.key, { title: e.target.value })}
                  placeholder="e.g. PPE & house rules"
                />
              </label>
              <label className="tt-field">
                <span>Type</span>
                <select
                  className="tt-input"
                  value={lesson.item_type}
                  onChange={(e) =>
                    updateLesson(lesson.key, {
                      item_type: e.target.value as LessonDraft['item_type'],
                    })
                  }
                >
                  <option value="document">Document / reading</option>
                  <option value="video">Video lesson</option>
                  <option value="link">External / internal link</option>
                  <option value="checklist">Checklist</option>
                </select>
              </label>
              <label className="tt-field">
                <span>Minutes</span>
                <input
                  className="tt-input"
                  type="number"
                  min={1}
                  value={lesson.estimated_minutes}
                  onChange={(e) =>
                    updateLesson(lesson.key, {
                      estimated_minutes: Number(e.target.value) || 10,
                    })
                  }
                />
              </label>
            </div>
            <label className="tt-field">
              <span>Lesson content (markdown)</span>
              <textarea
                className="tt-input"
                rows={4}
                value={lesson.content_markdown}
                onChange={(e) => updateLesson(lesson.key, { content_markdown: e.target.value })}
                placeholder="Reading notes, steps, or what to watch for"
              />
            </label>
            {(lesson.item_type === 'video' || lesson.item_type === 'document') && (
              <label className="tt-field">
                <span>YouTube video links (one per line)</span>
                <textarea
                  className="tt-input"
                  rows={3}
                  value={lesson.videoUrlsText}
                  onChange={(e) => updateLesson(lesson.key, { videoUrlsText: e.target.value })}
                  placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...'}
                />
              </label>
            )}
            {lesson.item_type === 'link' ? (
              <label className="tt-field">
                <span>Link URL or path</span>
                <input
                  className="tt-input"
                  value={lesson.external_url}
                  onChange={(e) => updateLesson(lesson.key, { external_url: e.target.value })}
                  placeholder="/protocols or https://..."
                />
              </label>
            ) : null}
            {lesson.item_type === 'checklist' ? (
              <label className="tt-field">
                <span>Checklist items (one per line)</span>
                <textarea
                  className="tt-input"
                  rows={3}
                  value={lesson.checklistText}
                  onChange={(e) => updateLesson(lesson.key, { checklistText: e.target.value })}
                />
              </label>
            ) : null}
          </div>
        ))}
      </section>

      <section className="tt-composer-section">
        <label className="tt-check">
          <input
            type="checkbox"
            checked={includeQuiz}
            onChange={(e) => setIncludeQuiz(e.target.checked)}
          />
          Include self-assessment quiz on this course
        </label>
        {includeQuiz ? (
          <>
            <label className="tt-field">
              <span>Quiz title</span>
              <input
                className="tt-input"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
              />
            </label>
            {questions.map((q, idx) => (
              <div key={q.key} className="tt-lesson-draft">
                <div className="tt-composer-section-head">
                  <strong>Question {idx + 1}</strong>
                  {questions.length > 1 ? (
                    <button
                      type="button"
                      className="tt-btn tt-btn-ghost"
                      onClick={() =>
                        setQuestions((rows) => rows.filter((r) => r.key !== q.key))
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="tt-composer-grid">
                  <label className="tt-field">
                    <span>Type</span>
                    <select
                      className="tt-input"
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(q.key, {
                          type: e.target.value as QuestionDraft['type'],
                        })
                      }
                    >
                      <option value="tf">True / false</option>
                      <option value="mcq">Multiple choice</option>
                      <option value="reflect">Reflection</option>
                    </select>
                  </label>
                  {q.type !== 'reflect' ? (
                    <label className="tt-field">
                      <span>Correct answer</span>
                      <input
                        className="tt-input"
                        value={q.correct}
                        onChange={(e) => updateQuestion(q.key, { correct: e.target.value })}
                        placeholder={q.type === 'tf' ? 'true or false' : 'a / b / c'}
                      />
                    </label>
                  ) : null}
                </div>
                <label className="tt-field">
                  <span>Prompt</span>
                  <textarea
                    className="tt-input"
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => updateQuestion(q.key, { prompt: e.target.value })}
                  />
                </label>
                {q.type === 'mcq' ? (
                  <label className="tt-field">
                    <span>Choices (one per line; first = a, second = b…)</span>
                    <textarea
                      className="tt-input"
                      rows={3}
                      value={q.choicesText}
                      onChange={(e) => updateQuestion(q.key, { choicesText: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className="tt-field">
                  <span>Explanation after answer</span>
                  <input
                    className="tt-input"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(q.key, { explanation: e.target.value })}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="tt-btn tt-btn-ghost"
              onClick={() => setQuestions((rows) => [...rows, emptyQuestion()])}
            >
              Add question
            </button>
          </>
        ) : null}
      </section>

      {error ? <p className="tt-error">{error}</p> : null}

      <div className="tt-composer-actions">
        <button type="button" className="tt-btn tt-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-primary"
          disabled={busy || !title.trim()}
          onClick={() => void submit()}
        >
          {busy ? 'Publishing…' : status === 'draft' ? 'Save draft course' : 'Publish course'}
        </button>
      </div>
    </div>
  );
};

export default CourseComposer;
