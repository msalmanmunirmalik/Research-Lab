/**
 * Guided stats advice — plain-language recommendations & explanations via AI.
 * POST /api/stats-guide/advise
 * POST /api/stats-guide/explain
 */

import { Router } from 'express';
import { AIProviderFactory } from '../services/AIProviderFactory.js';
import { getApiForTask } from './apiTaskAssignments.js';

const router: Router = Router();

function extractJson(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>;
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function getDataAnalysisProvider(userId: string) {
  const apiAssignment =
    (await getApiForTask(userId, 'data_analysis')) ||
    (await getApiForTask(userId, 'content_writing'));
  if (!apiAssignment) {
    throw new Error(
      'No AI API configured. Add an API key and assign it to data analysis (or content writing) in Settings.'
    );
  }
  const provider = AIProviderFactory.createProvider(
    apiAssignment.provider,
    apiAssignment.apiKey
  );
  return { provider, apiAssignment };
}

/**
 * Suggest which tests fit the dataset + user goal (JSON).
 * Rule-based client already recommends; this enriches with mentoring tone.
 */
router.post('/advise', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { profileContext, goal, recommendations, userIntent } = req.body || {};
    if (!profileContext || typeof profileContext !== 'string') {
      return res.status(400).json({ error: 'profileContext string is required' });
    }

    const intent =
      typeof userIntent === 'string' && userIntent.trim()
        ? userIntent.trim().slice(0, 2_000)
        : '';
    if (!intent) {
      return res.status(400).json({
        error: 'Tell us what you want to analyze (userIntent is required).',
      });
    }

    const { provider, apiAssignment } = await getDataAnalysisProvider(userId);

    const system = `You are an expert scientific data analyst helping lab scientists make decisions from their spreadsheet.
Your job is decision support for ONE scientist request — not a tour of every possible test.
Rules:
- Anchor everything to the scientist's written request.
- Map named variables in the request to sheet columns when possible.
- Never invent p-values, means, or n that were not provided.
- Prefer the simplest valid test that answers their ask.
- Speak plainly; define jargon in a short clause if needed.
- Suggest at most 2–3 tests; drop unrelated ones.
- Respond with valid JSON only.`;

    const user = `Scientist request (primary):
${intent}

Dataset profile:
${String(profileContext).slice(0, 8_000)}

Inferred goal category: ${goal || 'unsure'}

Candidate tests (re-rank / narrow to what the request needs; do not invent numeric results):
${JSON.stringify(recommendations || [], null, 2).slice(0, 5_000)}

Return JSON:
{
  "situation": "2 sentences answering THEIR request with this sheet",
  "data_read": ["factual notes about columns / n relevant to the request"],
  "priority_test": "the one test to run first for their ask",
  "decision_frame": "If significant / strong → …; if not → …",
  "suggested_goal": "explore|compare|multi_compare|factorial|relate|corr_matrix|unsure",
  "suggested_columns": {"factor_x": "", "factor_y": "", "outcome": "", "x": "", "y": "", "outcomes": [], "matrix": []},
  "watch_outs": ["honest limitation that affects the decision"],
  "next_experiment": "one practical next lab step after seeing the result"
}`;

    const response = await provider.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { apiKey: apiAssignment.apiKey, temperature: 0.25, maxTokens: 900 }
    );

    const content = response.content || '';
    const structured = extractJson(content);

    res.json({
      success: true,
      provider: apiAssignment.provider,
      content,
      structured,
    });
  } catch (error: any) {
    const message = error?.message || 'Stats guide advise failed';
    const status = /No AI API configured/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, error: message });
  }
});

/**
 * Explain computed results in plain language.
 */
router.post('/explain', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { profileContext, resultsSummary } = req.body || {};
    if (!resultsSummary || typeof resultsSummary !== 'string') {
      return res.status(400).json({ error: 'resultsSummary string is required' });
    }

    const { provider, apiAssignment } = await getDataAnalysisProvider(userId);

    const system = `You help lab scientists turn statistical output into a clear go / no-go style decision.
Rules:
- Use ONLY the numbers provided in the results summary.
- Never invent significance or effect sizes.
- Separate evidence (what the numbers say) from action (what to do in the lab/paper).
- Do not overclaim with small n.
- Respond with valid JSON only.`;

    const user = `Dataset context:
${String(profileContext || '').slice(0, 6_000)}

Results to explain:
${String(resultsSummary).slice(0, 10_000)}

Return JSON:
{
  "headline": "decision-ready one-liner (e.g. groups differ / no clear effect / trend present)",
  "verdict": "supported | not_supported | inconclusive",
  "what_it_means": "2-4 sentences: evidence only",
  "what_you_can_claim": "one careful sentence suitable for a Results note",
  "what_not_to_claim": "one sentence on overclaiming to avoid",
  "what_to_do_next": ["lab or analysis next step"],
  "caveats": ["limitation tied to sample/design if visible"]
}`;

    const response = await provider.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { apiKey: apiAssignment.apiKey, temperature: 0.25, maxTokens: 1400 }
    );

    const content = response.content || '';
    const structured = extractJson(content);

    res.json({
      success: true,
      provider: apiAssignment.provider,
      content,
      structured,
    });
  } catch (error: any) {
    const message = error?.message || 'Stats guide explain failed';
    const status = /No AI API configured/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
