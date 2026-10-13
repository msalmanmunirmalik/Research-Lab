/**
 * Platform AI access — shared Gemini/OpenAI keys for prototype users,
 * with a per-user daily free allowance before BYO keys are required.
 */

import pool from '../../database/config.js';

export type AiKeySource = 'user' | 'platform';

export type ResolvedAiAccess = {
  apiKeyId: string;
  provider: string;
  providerName: string;
  apiKey: string;
  source: AiKeySource;
};

export type PlatformQuota = {
  limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
};

export function getPlatformGeminiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return key || null;
}

export function getPlatformOpenAiKey(): string | null {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  return key || null;
}

export function isPlatformAiConfigured(): boolean {
  return Boolean(getPlatformGeminiKey() || getPlatformOpenAiKey());
}

export function getPlatformAiDailyLimit(): number {
  const n = Number(process.env.PLATFORM_AI_DAILY_LIMIT || 25);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
}

/** Prefer Gemini (free-tier friendly), then OpenAI if configured. */
export function resolvePlatformProvider(): ResolvedAiAccess | null {
  const gemini = getPlatformGeminiKey();
  if (gemini) {
    return {
      apiKeyId: '',
      provider: 'google_gemini',
      providerName: 'Google Gemini (included)',
      apiKey: gemini,
      source: 'platform',
    };
  }
  const openai = getPlatformOpenAiKey();
  if (openai) {
    return {
      apiKeyId: '',
      provider: 'openai',
      providerName: 'OpenAI (included)',
      apiKey: openai,
      source: 'platform',
    };
  }
  return null;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPlatformQuota(userId: string): Promise<PlatformQuota> {
  const limit = getPlatformAiDailyLimit();
  if (!userId) {
    return { limit, used: 0, remaining: limit, allowed: true };
  }
  try {
    const result = await pool.query(
      `SELECT message_count FROM ai_platform_usage WHERE user_id = $1 AND usage_date = $2`,
      [userId, todayUtcDate()]
    );
    const used = Number(result.rows[0]?.message_count || 0);
    const remaining = Math.max(0, limit - used);
    return { limit, used, remaining, allowed: used < limit };
  } catch (error) {
    console.error('getPlatformQuota error:', error);
    // Fail open for prototype so AI still works if usage table has issues
    return { limit, used: 0, remaining: limit, allowed: true };
  }
}

/** Increment today's platform-key usage. Returns updated quota. */
export async function consumePlatformQuota(userId: string): Promise<PlatformQuota> {
  const limit = getPlatformAiDailyLimit();
  try {
    const day = todayUtcDate();
    await pool.query(
      `INSERT INTO ai_platform_usage (user_id, usage_date, message_count)
       VALUES ($1, $2, 1)
       ON DUPLICATE KEY UPDATE message_count = message_count + 1`,
      [userId, day]
    );
    return getPlatformQuota(userId);
  } catch (error) {
    console.error('consumePlatformQuota error:', error);
    return { limit, used: 0, remaining: limit, allowed: true };
  }
}

export type AccessStatus = {
  platformConfigured: boolean;
  platformProvider: string | null;
  hasUserKeys: boolean;
  userKeyCount: number;
  quota: PlatformQuota;
  canUsePlatform: boolean;
  canUseAi: boolean;
  message: string;
};

export async function getAiAccessStatus(userId: string): Promise<AccessStatus> {
  const platformConfigured = isPlatformAiConfigured();
  const platform = resolvePlatformProvider();
  const quota = await getPlatformQuota(userId);

  let userKeyCount = 0;
  try {
    const keys = await pool.query(
      `SELECT COUNT(*) AS c FROM ai_provider_keys WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    userKeyCount = Number(keys.rows[0]?.c || 0);
  } catch {
    userKeyCount = 0;
  }

  const hasUserKeys = userKeyCount > 0;
  const canUsePlatform = platformConfigured && quota.allowed;
  const canUseAi = hasUserKeys || canUsePlatform;

  let message = '';
  if (!canUseAi) {
    if (!platformConfigured && !hasUserKeys) {
      message =
        'AI is not configured yet. Add GEMINI_API_KEY on the server, or connect your own key in Settings.';
    } else if (platformConfigured && !quota.allowed && !hasUserKeys) {
      message = `You've used today's free AI allowance (${quota.limit} messages). Connect your own API key in Settings to continue, or try again tomorrow.`;
    }
  } else if (canUsePlatform && !hasUserKeys) {
    message = `Included AI ready (${platform?.providerName || 'platform'}) — ${quota.remaining} of ${quota.limit} free messages left today.`;
  } else if (hasUserKeys) {
    message = 'Using your connected API keys. Platform allowance is a backup when needed.';
  }

  return {
    platformConfigured,
    platformProvider: platform?.providerName || null,
    hasUserKeys,
    userKeyCount,
    quota,
    canUsePlatform,
    canUseAi,
    message,
  };
}

/**
 * After user assignment / smart select failed, pick platform key if quota allows.
 * Returns null when platform missing or quota exhausted.
 */
export async function tryPlatformAiAccess(
  userId: string
): Promise<
  | { ok: true; access: ResolvedAiAccess; quota: PlatformQuota }
  | { ok: false; reason: 'not_configured' | 'quota_exceeded'; quota: PlatformQuota; message: string }
> {
  const platform = resolvePlatformProvider();
  const quota = await getPlatformQuota(userId);

  if (!platform) {
    return {
      ok: false,
      reason: 'not_configured',
      quota,
      message:
        'No platform AI key configured. Set GEMINI_API_KEY (recommended) or OPENAI_API_KEY on the server, or add your own key in Settings.',
    };
  }

  if (!quota.allowed) {
    return {
      ok: false,
      reason: 'quota_exceeded',
      quota,
      message: `Free AI allowance used for today (${quota.limit} messages). Add your own API key in Settings → API keys to continue, or wait until tomorrow.`,
    };
  }

  return { ok: true, access: platform, quota };
}
