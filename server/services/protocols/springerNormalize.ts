/**
 * Pure mapping for Springer Nature Meta API records.
 * Metadata only. No protocol steps, figures, or full text.
 */

import type { CanonicalPaper } from '../scholarly/types.js';

export type SpringerProtocolMeta = {
  source: 'springer_protocols';
  externalId: string;
  springerId: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  doi: string | null;
  publishedOn: string | null;
  series: string | null;
  publisher: string | null;
  subjects: string[];
  sourceUrl: string | null;
  retrievedAt: string;
};

export function springerSearchQuery(userQuery: string): string {
  const term = userQuery.replace(/["\\()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  // Fielded boolean queries are a premium Meta API feature and return 403 on a basic key.
  return `"${term}" protocol`;
}

export function cleanSpringerDoi(value: unknown): string | null {
  const doi = String(value || '')
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  return doi || null;
}

function plain(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeAbstract(value: unknown): string | null {
  const text = plain(value);
  if (!text) return null;
  const steps = text.match(/\bstep\s+\d+/gi) || [];
  if (steps.length >= 3) return null;
  return text.slice(0, 1200);
}

function authorsFrom(raw: any): string[] {
  const creators = Array.isArray(raw?.creators) ? raw.creators : Array.isArray(raw?.authors) ? raw.authors : [];
  return creators
    .map((creator: any) => plain(creator?.creator || creator?.name || creator))
    .filter(Boolean);
}

function sourceUrl(raw: any, doi: string | null): string | null {
  const urls = Array.isArray(raw?.url) ? raw.url : [];
  const values = urls
    .map((item: any) => plain(typeof item === 'string' ? item : item?.value))
    .filter(Boolean);
  const publisher = values.find((value: string) => /link\.springer\.com|springer\.com|nature\.com/i.test(value));
  if (publisher) return publisher;
  if (doi) return `https://doi.org/${doi}`;
  return values[0] || null;
}

function looksLikeProtocol(raw: any, title: string): boolean {
  const series = plain(raw?.publicationName);
  const type = plain(raw?.contentType);
  return /protocol|methods in molecular biology/i.test(series)
    || /protocol/i.test(type)
    || /\bprotocol\b/i.test(title);
}

export function normalizeSpringerRecord(raw: any, retrievedAt = new Date().toISOString()): SpringerProtocolMeta | null {
  const title = plain(raw?.title);
  if (!title || !looksLikeProtocol(raw, title)) return null;
  const doi = cleanSpringerDoi(raw?.doi || raw?.identifier);
  const springerId = plain(raw?.identifier) || doi;
  const authors = authorsFrom(raw);
  const year = plain(raw?.publicationDate || raw?.onlineDate).slice(0, 10);
  if (!doi && !springerId && !(authors.length && year)) return null;
  const subjects = (Array.isArray(raw?.subjects) ? raw.subjects : [])
    .map((subject: any) => plain(subject?.term || subject))
    .filter(Boolean)
    .slice(0, 12);
  return {
    source: 'springer_protocols',
    externalId: doi || springerId || `${title}|${authors.join(',')}|${year.slice(0, 4)}`,
    springerId: springerId || null,
    title: title.slice(0, 500),
    authors,
    abstract: safeAbstract(raw?.abstract),
    doi,
    publishedOn: year || null,
    series: plain(raw?.publicationName) || null,
    publisher: plain(raw?.publisher) || 'Springer Nature',
    subjects,
    sourceUrl: sourceUrl(raw, doi),
    retrievedAt,
  };
}

function softKey(record: SpringerProtocolMeta): string | null {
  const year = record.publishedOn?.slice(0, 4);
  if (!record.title || !record.authors.length || !year) return null;
  return `${record.title.toLowerCase()}|${record.authors.join(',').toLowerCase()}|${year}`;
}

export function dedupeSpringerRecords(records: SpringerProtocolMeta[]): SpringerProtocolMeta[] {
  const ranked = [...records].sort((a, b) => Number(Boolean(b.doi)) - Number(Boolean(a.doi)));
  const kept: SpringerProtocolMeta[] = [];
  const dois = new Set<string>();
  const ids = new Set<string>();
  const soft = new Set<string>();
  for (const record of ranked) {
    if (record.doi && dois.has(record.doi)) continue;
    if (record.springerId && ids.has(record.springerId)) continue;
    const identity = softKey(record);
    if (!record.doi && identity && soft.has(identity)) continue;
    if (record.doi) dois.add(record.doi);
    if (record.springerId) ids.add(record.springerId);
    if (identity) soft.add(identity);
    kept.push(record);
  }
  return kept;
}

export function toCanonicalPaper(record: SpringerProtocolMeta): CanonicalPaper {
  const year = Number(record.publishedOn?.slice(0, 4));
  return {
    title: record.title,
    abstract: record.abstract,
    publicationType: 'protocol-metadata',
    publicationYear: Number.isFinite(year) ? year : null,
    publicationDate: record.publishedOn,
    doi: record.doi,
    journalName: record.series,
    publisher: record.publisher,
    authors: record.authors.map((name) => ({ name })),
    keywords: record.subjects,
    sourceUrl: record.sourceUrl,
    metadataSource: 'springer_protocols',
    metadataAvailable: true,
    abstractAvailable: Boolean(record.abstract),
    fullTextAvailable: false,
    pdfAvailable: false,
    pdfAccessType: 'publisher',
    isOpenAccess: false,
  };
}
