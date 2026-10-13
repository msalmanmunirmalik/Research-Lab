/**
 * Springer Nature Meta API client for protocol discovery.
 * The API key stays in this process. Callers receive metadata only.
 */

import axios from 'axios';
import { cacheKey, getCached, setCached } from '../scholarly/cache.js';
import {
  dedupeSpringerRecords,
  normalizeSpringerRecord,
  springerSearchQuery,
  toCanonicalPaper,
  type SpringerProtocolMeta,
} from './springerNormalize.js';

export type { SpringerProtocolMeta };
export { dedupeSpringerRecords, normalizeSpringerRecord, springerSearchQuery, toCanonicalPaper };

const ORIGIN = 'https://api.springernature.com';
const SEARCH_TTL_SEC = 7 * 24 * 60 * 60;
const RECORD_TTL_SEC = 30 * 24 * 60 * 60;
const EMPTY_TTL_SEC = 24 * 60 * 60;
const DAILY_CAP = 120;

const recentCalls: number[] = [];
let dayStamp = '';
let dayCount = 0;
let blockedUntil = 0;

function apiKey(): string | null {
  const value = (
    process.env.SPRINGER_NATURE_API_KEY
    || process.env.SPRINGER_NATURE_METADATA_API_KEY
    || ''
  ).trim();
  return value || null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allowCall(): boolean {
  if (Date.now() < blockedUntil) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_CAP) return false;
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60_000) recentCalls.shift();
  if (recentCalls.length >= 8) return false;
  recentCalls.push(now);
  dayCount += 1;
  return true;
}

async function metaGet(params: Record<string, string | number>): Promise<{ ok: boolean; missingKey: boolean; limited: boolean; data: any | null }> {
  const key = apiKey();
  if (!key) return { ok: false, missingKey: true, limited: false, data: null };
  if (!allowCall()) return { ok: false, missingKey: false, limited: true, data: null };

  const send = () =>
    axios.get(`${ORIGIN}/meta/v2/json`, {
      params: { ...params, api_key: key },
      headers: { Accept: 'application/json' },
      timeout: 12000,
      maxRedirects: 0,
    });

  try {
    const response = await send();
    return { ok: true, missingKey: false, limited: false, data: response.data };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 429) blockedUntil = Date.now() + 60 * 60 * 1000;
    if (status === 429 || status === 503) {
      await delay(1500);
      if (!allowCall()) return { ok: false, missingKey: false, limited: true, data: null };
      try {
        const retry = await send();
        return { ok: true, missingKey: false, limited: false, data: retry.data };
      } catch (retryError) {
        const retryStatus = axios.isAxiosError(retryError) ? retryError.response?.status : undefined;
        if (retryStatus === 429) blockedUntil = Date.now() + 60 * 60 * 1000;
        console.warn(`springer metadata request failed ${retryStatus ?? 'network'}`);
        return { ok: false, missingKey: false, limited: retryStatus === 429, data: null };
      }
    }
    console.warn(`springer metadata request failed ${status ?? 'network'}`);
    return { ok: false, missingKey: false, limited: false, data: null };
  }
}

function readRecords(data: any, retrievedAt: string): SpringerProtocolMeta[] {
  const rows = Array.isArray(data?.records) ? data.records : [];
  return dedupeSpringerRecords(
    rows
      .map((row: any) => normalizeSpringerRecord(row, retrievedAt))
      .filter(Boolean) as SpringerProtocolMeta[]
  );
}

export class SpringerProtocolsClient {
  static configured(): boolean {
    return Boolean(apiKey());
  }

  static async search(query: string, page = 1): Promise<{
    available: boolean;
    missingKey: boolean;
    limited: boolean;
    protocols: SpringerProtocolMeta[];
    page: number;
    total: number;
  }> {
    const q = query.trim();
    const empty = { available: false, missingKey: !apiKey(), limited: false, protocols: [], page, total: 0 };
    if (q.length < 2) return empty;
    const safePage = Math.min(4, Math.max(1, page));
    const key = cacheKey(['springer_protocols', 'search', 'v2', q.toLowerCase(), safePage]);
    const cached = await getCached<typeof empty>(key);
    if (cached) return cached;

    const result = await metaGet({
      q: springerSearchQuery(q),
      p: 10,
      s: (safePage - 1) * 10 + 1,
    });
    if (!result.ok || !result.data) {
      return { ...empty, missingKey: result.missingKey, limited: result.limited };
    }
    const retrievedAt = new Date().toISOString();
    const protocols = readRecords(result.data, retrievedAt);
    const payload = {
      available: true,
      missingKey: false,
      limited: false,
      protocols,
      page: safePage,
      total: protocols.length,
    };
    await setCached(key, payload, protocols.length ? SEARCH_TTL_SEC : EMPTY_TTL_SEC);
    return payload;
  }

  static async record(doiOrId: string): Promise<{
    available: boolean;
    missingKey: boolean;
    limited: boolean;
    protocol: SpringerProtocolMeta | null;
  }> {
    const id = doiOrId.trim();
    if (!id) return { available: false, missingKey: !apiKey(), limited: false, protocol: null };
    const key = cacheKey(['springer_protocols', 'record', 'v1', id.toLowerCase()]);
    const cached = await getCached<SpringerProtocolMeta>(key);
    if (cached) return { available: true, missingKey: false, limited: false, protocol: cached };

    const result = await metaGet({ q: `doi:${id.replace(/^doi:/i, '')}`, p: 1, s: 1 });
    if (!result.ok || !result.data) {
      return { available: false, missingKey: result.missingKey, limited: result.limited, protocol: null };
    }
    const protocol = readRecords(result.data, new Date().toISOString())[0] || null;
    if (protocol) await setCached(key, protocol, RECORD_TTL_SEC);
    return { available: Boolean(protocol), missingKey: false, limited: false, protocol };
  }
}
