/**
 * Lab Floors AI roleplay — character replies for PhD Starter Year etc.
 * Uses the same platform/user AI access path as other chat features.
 * Also persists floors + roleplay progress per user.
 */

import express, { type Router } from 'express';
import pool from '../../database/config.js';
import { getApiForTask } from './apiTaskAssignments.js';
import { getApiKeyWithFallback } from './aiProviderKeys.js';
import {
  consumePlatformQuota,
  getAiAccessStatus,
  tryPlatformAiAccess,
} from '../services/platformAiAccess.js';
import { AIProviderFactory } from '../services/AIProviderFactory.js';
import type { ChatMessage } from '../services/AIProvider.js';

const router: Router = express.Router();

const EMPTY_FLOORS = { role: 'phd', completions: {} };
const EMPTY_ROLEPLAY = {};

function parseJsonField(value: unknown, fallback: unknown) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

/** GET /api/lab-floors/progress */
router.get('/progress', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      `SELECT floors_json, roleplay_json, updated_at FROM lab_floors_progress WHERE user_id = $1`,
      [userId]
    );

    if (!result.rows.length) {
      return res.json({
        floors: EMPTY_FLOORS,
        roleplay: EMPTY_ROLEPLAY,
        updatedAt: null,
      });
    }

    const row = result.rows[0];
    res.json({
      floors: parseJsonField(row.floors_json, EMPTY_FLOORS),
      roleplay: parseJsonField(row.roleplay_json, EMPTY_ROLEPLAY),
      updatedAt: row.updated_at || null,
    });
  } catch (error: any) {
    // Table may not exist until migrate — fail soft for clients with local cache
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ floors: EMPTY_FLOORS, roleplay: EMPTY_ROLEPLAY, updatedAt: null });
    }
    console.error('lab-floors progress get:', error);
    res.status(500).json({ error: 'Failed to load Lab Floors progress' });
  }
});

/** PUT /api/lab-floors/progress */
router.put('/progress', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const floors = req.body?.floors && typeof req.body.floors === 'object' ? req.body.floors : EMPTY_FLOORS;
    const roleplay =
      req.body?.roleplay && typeof req.body.roleplay === 'object' ? req.body.roleplay : EMPTY_ROLEPLAY;

    await pool.query(
      `INSERT INTO lab_floors_progress (user_id, floors_json, roleplay_json)
       VALUES ($1, $2, $3)
       ON DUPLICATE KEY UPDATE
         floors_json = $2,
         roleplay_json = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(floors), JSON.stringify(roleplay)]
    );

    res.json({ success: true, floors, roleplay });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Lab Floors progress table missing. Run pnpm run db:migrate.',
      });
    }
    console.error('lab-floors progress put:', error);
    res.status(500).json({ error: 'Failed to save Lab Floors progress' });
  }
});


type HistoryItem = { role: 'user' | 'character' | 'narrator'; content: string; characterId?: string };

type RoleplayBody = {
  moduleId?: string;
  beatId?: string;
  characterId?: string;
  message?: string;
  history?: HistoryItem[];
  moduleContext?: {
    title?: string;
    beatTitle?: string;
    chapter?: string;
    setting?: string;
    objective?: string;
    characterName?: string;
    characterTitle?: string;
    characterVoice?: string;
    turnCount?: number;
    minTurns?: number;
  };
};

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function resolveChatProvider(
  userId: string
): Promise<{ provider: string; providerName: string; apiKey: string; source: 'user' | 'platform' } | null> {
  let apiAssignment = await getApiForTask(userId, 'content_writing');
  if (!apiAssignment) {
    apiAssignment = await getApiForTask(userId, 'summarization');
  }
  if (apiAssignment && !apiAssignment.apiKeyId) {
    const platformTry = await tryPlatformAiAccess(userId);
    if (!platformTry.ok) return null;
    await consumePlatformQuota(userId);
    return {
      provider: platformTry.access.provider,
      providerName: platformTry.access.providerName,
      apiKey: platformTry.access.apiKey,
      source: 'platform',
    };
  }
  if (apiAssignment?.apiKey) {
    return {
      provider: apiAssignment.provider,
      providerName: apiAssignment.providerName,
      apiKey: apiAssignment.apiKey,
      source: 'user',
    };
  }

  const key = await getApiKeyWithFallback(userId, 'google_gemini', true);
  if (key) {
    return await resolvePlatformIfKeyMatches(userId, key);
  }

  const platformTry = await tryPlatformAiAccess(userId);
  if (!platformTry.ok) return null;
  await consumePlatformQuota(userId);
  return {
    provider: platformTry.access.provider,
    providerName: platformTry.access.providerName,
    apiKey: platformTry.access.apiKey,
    source: 'platform',
  };
}

async function resolvePlatformIfKeyMatches(
  userId: string,
  key: string
): Promise<{ provider: string; providerName: string; apiKey: string; source: 'user' | 'platform' }> {
  const platformTry = await tryPlatformAiAccess(userId);
  if (platformTry.ok && platformTry.access.apiKey === key) {
    await consumePlatformQuota(userId);
    return {
      provider: platformTry.access.provider,
      providerName: platformTry.access.providerName,
      apiKey: platformTry.access.apiKey,
      source: 'platform',
    };
  }
  return {
    provider: 'google_gemini',
    providerName: 'Google Gemini',
    apiKey: key,
    source: 'user',
  };
}

function buildSystemPrompt(ctx: NonNullable<RoleplayBody['moduleContext']>): string {
  const name = ctx.characterName || 'Lab colleague';
  const title = ctx.characterTitle || 'lab member';
  const voice = ctx.characterVoice || 'Stay in character as a realistic research lab colleague.';
  return [
    `You are roleplaying inside Lab Floors: "${ctx.title || 'PhD Starter Year'}".`,
    `Chapter: ${ctx.chapter || '—'} · Scene: ${ctx.beatTitle || '—'}.`,
    `Setting: ${ctx.setting || 'a research lab'}.`,
    `Student objective (do NOT quiz them; respond in character): ${ctx.objective || 'practice starting a PhD'}.`,
    '',
    `YOU ARE: ${name} (${title}).`,
    voice,
    '',
    'RULES:',
    '- Stay fully in character. Never say you are an AI, LLM, or chatbot.',
    '- The human is a brand-new PhD student. Treat them as a real colleague-in-training.',
    '- Do not offer multiple-choice options. Have a real conversation.',
    '- Be specific to lab life (notebooks, controls, meetings, credit, reagents, timelines).',
    '- Keep replies concise (roughly 40–160 words). Prefer natural dialogue.',
    '- You may include a brief stage direction in stageDirection (optional, one sentence).',
    '- Set suggestAdvance=true only if the student has substantially practiced the objective',
    `  and turnCount (${ctx.turnCount ?? 0}) is at least minTurns (${ctx.minTurns ?? 3}).`,
    '- coachWhisper is a one-line tip for the STUDENT sidebar (second person). Optional; omit if none.',
    '',
    'Respond with ONLY valid JSON:',
    '{"reply":"...","stageDirection":null,"suggestAdvance":false,"coachWhisper":null}',
  ].join('\n');
}

function historyToMessages(history: HistoryItem[], speakingAs: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const h of history.slice(-16)) {
    if (h.role === 'narrator') {
      out.push({ role: 'user', content: `[Narration] ${h.content}` });
      continue;
    }
    if (h.role === 'user') {
      out.push({ role: 'user', content: h.content });
      continue;
    }
    const who = h.characterId === speakingAs ? 'assistant' : 'user';
    const prefix =
      h.characterId && h.characterId !== speakingAs
        ? `[${h.characterId} said] `
        : '';
    out.push({ role: who, content: `${prefix}${h.content}` });
  }
  return out;
}

router.get('/access', async (req: any, res) => {
  try {
    const access = await getAiAccessStatus(req.user?.id);
    res.json(access);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to read AI access' });
  }
});

router.post('/roleplay', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const body = req.body as RoleplayBody;
    const message = (body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!body.characterId || !body.moduleContext?.characterVoice) {
      return res.status(400).json({ error: 'Character context is required' });
    }

    const provider = await resolveChatProvider(userId);
    if (!provider) {
      const access = await getAiAccessStatus(userId);
      return res.status(402).json({
        error:
          access.message ||
          'AI is not available. Add an API key in Settings or wait for platform allowance to reset.',
        access,
      });
    }

    const system = buildSystemPrompt(body.moduleContext || {});
    const history = Array.isArray(body.history) ? body.history : [];
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...historyToMessages(history, body.characterId),
      { role: 'user', content: message },
    ];

    const ai = AIProviderFactory.createProvider(provider.provider, provider.apiKey);
    const resp = await ai.chat(messages, { temperature: 0.75, maxTokens: 500 });
    const content = resp.content || '';

    const parsed = extractJson(content);
    const reply =
      (typeof parsed?.reply === 'string' && parsed.reply.trim()) ||
      content.replace(/^```json\s*|\s*```$/g, '').trim() ||
      '…';
    const stageDirection =
      typeof parsed?.stageDirection === 'string' && parsed.stageDirection.trim()
        ? parsed.stageDirection.trim()
        : null;
    const suggestAdvance = Boolean(parsed?.suggestAdvance);
    const coachWhisper =
      typeof parsed?.coachWhisper === 'string' && parsed.coachWhisper.trim()
        ? parsed.coachWhisper.trim()
        : null;

    const access = await getAiAccessStatus(userId);
    res.json({
      reply,
      stageDirection,
      suggestAdvance,
      coachWhisper,
      provider: provider.providerName,
      source: provider.source,
      access,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Lab Floors roleplay error:', error?.message || error);
    res.status(500).json({
      error: 'Failed to generate roleplay reply',
      details: error?.message || String(error),
    });
  }
});

router.post('/roleplay/debrief', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { moduleTitle, beatSummaries, skills } = req.body || {};
    const provider = await resolveChatProvider(userId);
    if (!provider) {
      return res.json({
        reflection:
          'AI debrief unavailable right now. Revisit the authored tips on the debrief card — they are the curriculum.',
        usedLlm: false,
      });
    }

    const ai = AIProviderFactory.createProvider(provider.provider, provider.apiKey);
    const resp = await ai.chat(
      [
        {
          role: 'system',
          content:
            'You write a short, warm debrief (120–180 words) for a new PhD student who finished a lab roleplay. No bullet quiz. Mention 2–3 habits to try next week. Do not say you are AI.',
        },
        {
          role: 'user',
          content: [
            `Module: ${moduleTitle || 'PhD Starter Year'}`,
            `Chapters touched: ${JSON.stringify(beatSummaries || [])}`,
            `Skills tagged: ${JSON.stringify(skills || [])}`,
            'Write the debrief in second person.',
          ].join('\n'),
        },
      ],
      { temperature: 0.6, maxTokens: 350 }
    );

    res.json({ reflection: resp.content || '', usedLlm: true });
  } catch (error: any) {
    res.json({
      reflection:
        'You practiced asking early, scoping work, and staying professional. Carry one habit into your real lab this week.',
      usedLlm: false,
    });
  }
});

export default router;
