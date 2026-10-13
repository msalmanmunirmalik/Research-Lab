/**
 * Pure mapping from a protocols.io payload to a DRM external protocol.
 * No network, so tests never load the access token.
 */

export type ExternalProtocol = {
  source: 'protocols.io';
  externalId: string;
  title: string;
  description: string | null;
  authors: string[];
  doi: string | null;
  sourceUrl: string | null;
  version: string | null;
  publishedOn: string | null;
  license: 'CC-BY';
  categories: string[];
  materials: Array<{ name: string }>;
  equipment: Array<{ name: string }>;
  steps: Array<{ id: number; title: string; description: string; duration: number; warnings: string[] }>;
  timing: string | null;
  safetyNotes: string[];
  retrievedAt: string;
};

const ORIGIN = 'https://www.protocols.io';

export function plainText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanDoi(value: unknown): string | null {
  const doi = String(value || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^dx\.doi\.org\//i, '');
  return doi || null;
}

function unixToIso(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function normalizeProtocol(raw: any, retrievedAt = new Date().toISOString()): ExternalProtocol | null {
  const externalId = String(raw?.id || raw?.uri || '').trim();
  const title = plainText(raw?.title || raw?.title_html);
  if (!externalId || !title) return null;
  const uri = plainText(raw?.uri);
  const authors = (Array.isArray(raw?.authors) ? raw.authors : [])
    .map((author: any) => plainText(author?.name))
    .filter(Boolean);
  const creator = plainText(raw?.creator?.name);
  if (!authors.length && creator) authors.push(creator);
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).map((step: any, index: number) => {
    const components = Array.isArray(step?.components) ? step.components : [];
    const fromComponents = components
      .map((part: any) => plainText(part?.title || part?.source?.title || part?.description || part?.text))
      .filter(Boolean);
    const description = plainText(step?.step) || fromComponents.join('\n') || `Step ${index + 1}`;
    return {
      id: index + 1,
      title: plainText(step?.title) || `Step ${index + 1}`,
      description,
      duration: Number(step?.duration || 0) || 0,
      warnings: [plainText(step?.warning)].filter(Boolean),
    };
  });
  return {
    source: 'protocols.io',
    externalId,
    title,
    description: plainText(raw?.description) || null,
    authors,
    doi: cleanDoi(raw?.doi),
    sourceUrl: plainText(raw?.url) || (uri ? `${ORIGIN}/view/${uri}` : null),
    version: raw?.version_id == null ? null : String(Number(raw.version_id) + 1),
    publishedOn: unixToIso(raw?.published_on),
    license: 'CC-BY',
    categories: [],
    materials: (Array.isArray(raw?.materials) ? raw.materials : [])
      .map((item: any) => ({ name: plainText(item?.name || item?.title || item) }))
      .filter((item: { name: string }) => item.name),
    equipment: [],
    steps,
    timing: null,
    safetyNotes: [plainText(raw?.warning), plainText(raw?.before_start)].filter(Boolean),
    retrievedAt,
  };
}

export function attributionText(protocol: ExternalProtocol): string {
  const authors = protocol.authors.length ? protocol.authors.join(', ') : 'the original authors';
  return [
    `Adapted from a public protocols.io protocol by ${authors}.`,
    protocol.sourceUrl ? `Original: ${protocol.sourceUrl}.` : '',
    protocol.doi ? `DOI: ${protocol.doi}.` : '',
    `License: ${protocol.license}.`,
    protocol.version ? `protocols.io version ${protocol.version}.` : '',
    `Retrieved ${protocol.retrievedAt}.`,
    'This DRM copy may differ from the original.',
  ]
    .filter(Boolean)
    .join(' ');
}
