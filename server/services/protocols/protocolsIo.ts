/**
 * protocols.io public REST client.
 * The access token stays in this process. Callers receive normalized records only.
 */

import axios from 'axios';
import { cacheKey, getCached, setCached } from '../scholarly/cache.js';
import {
  attributionText,
  normalizeProtocol,
  type ExternalProtocol,
} from './protocolsIoNormalize.js';

export type { ExternalProtocol };
export { attributionText, normalizeProtocol };

const ORIGIN = 'https://www.protocols.io';
const SEARCH_TTL_SEC = 6 * 60 * 60;
const DETAIL_TTL_SEC = 24 * 60 * 60;

type FetchResult = { ok: boolean; missingToken: boolean; data: any | null; status?: number };

const recentCalls: number[] = [];

function accessToken(): string | null {
  const value = process.env.PROTOCOLS_IO_ACCESS_TOKEN?.trim();
  return value || null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allowCall(): boolean {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60_000) recentCalls.shift();
  if (recentCalls.length >= 20) return false;
  recentCalls.push(now);
  return true;
}

async function pioGet(path: string, params: Record<string, string | number>): Promise<FetchResult> {
  const token = accessToken();
  if (!token) return { ok: false, missingToken: true, data: null };
  if (!allowCall()) return { ok: false, missingToken: false, data: null, status: 429 };

  const send = async () =>
    axios.get(`${ORIGIN}${path}`, {
      params,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeout: 12000,
      maxRedirects: 0,
    });

  try {
    const response = await send();
    return { ok: true, missingToken: false, data: response.data };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 429 || status === 503) {
      await delay(1000);
      try {
        const retry = await send();
        return { ok: true, missingToken: false, data: retry.data };
      } catch (retryError) {
        const retryStatus = axios.isAxiosError(retryError) ? retryError.response?.status : undefined;
        console.warn(`protocols.io request failed ${path} ${retryStatus ?? 'network'}`);
        return { ok: false, missingToken: false, data: null, status: retryStatus };
      }
    }
    console.warn(`protocols.io request failed ${path} ${status ?? 'network'}`);
    return { ok: false, missingToken: false, data: null, status };
  }
}

export class ProtocolsIoClient {
  static configured(): boolean {
    return Boolean(accessToken());
  }

  static async search(query: string, page = 1, pageSize = 10): Promise<{
    available: boolean;
    missingToken: boolean;
    protocols: ExternalProtocol[];
    page: number;
    total: number;
  }> {
    const q = query.trim();
    const empty = { available: false, missingToken: !accessToken(), protocols: [], page, total: 0 };
    if (q.length < 2) return empty;
    const key = cacheKey(['protocols.io', 'search', q.toLowerCase(), page, pageSize]);
    const cached = await getCached<typeof empty>(key);
    if (cached) return cached;

    const result = await pioGet('/api/v3/protocols', {
      filter: 'public',
      key: q,
      order_field: 'relevance',
      order_dir: 'desc',
      page_size: Math.min(20, Math.max(1, pageSize)),
      page_id: Math.max(1, page),
    });
    if (!result.ok || !result.data || (result.data.status_code != null && Number(result.data.status_code) !== 0)) {
      return { ...empty, missingToken: result.missingToken };
    }
    const retrievedAt = new Date().toISOString();
    const protocols = (result.data.items || result.data.protocols || [])
      .map((item: any) => normalizeProtocol(item, retrievedAt))
      .filter(Boolean) as ExternalProtocol[];
    const payload = {
      available: true,
      missingToken: false,
      protocols,
      page,
      total: Number(result.data.total || protocols.length),
    };
    await setCached(key, payload, SEARCH_TTL_SEC);
    return payload;
  }

  static async detail(externalId: string): Promise<{
    available: boolean;
    missingToken: boolean;
    protocol: ExternalProtocol | null;
  }> {
    const id = externalId.trim();
    if (!id) return { available: false, missingToken: !accessToken(), protocol: null };
    const key = cacheKey(['protocols.io', 'detail', id]);
    const cached = await getCached<ExternalProtocol>(key);
    if (cached) return { available: true, missingToken: false, protocol: cached };

    const result = await pioGet(`/api/v4/protocols/${encodeURIComponent(id)}`, {
      content_format: 'markdown',
    });
    if (!result.ok || !result.data || (result.data.status_code != null && Number(result.data.status_code) !== 0)) {
      return { available: false, missingToken: result.missingToken, protocol: null };
    }
    const raw = result.data.payload || result.data.protocol || result.data;
    const protocol = normalizeProtocol(raw);
    if (!protocol) return { available: false, missingToken: false, protocol: null };
    await setCached(key, protocol, DETAIL_TTL_SEC);
    return { available: true, missingToken: false, protocol };
  }
}

