/**
 * Pure shaping for the OpenAlex research-intelligence brief.
 * No network and no database, so tests stay off the pool.
 */

export type TopicHit = {
  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  worksCount: number;
  citedByCount: number;
};

export type YearCount = { year: number; count: number };

export type PersonHit = {
  id: string;
  name: string;
  institution: string | null;
  worksCount: number;
  citedByCount: number;
  sourceUrl: string;
};

export type InstitutionHit = {
  id: string;
  name: string;
  country: string | null;
  worksCount: number;
  citedByCount: number;
  sourceUrl: string;
};

export type FunderHit = { name: string; works: number };

export type WorkHit = {
  id: string | null;
  title: string;
  year: number | null;
  doi: string | null;
  citationCount: number;
  sourceUrl: string | null;
  isOpenAccess: boolean;
};

export type GrantHit = {
  id: string;
  title: string;
  sponsor: string | null;
  deadline: string | null;
};

export type IntelligenceBrief = {
  query: string;
  available: boolean;
  notice: string | null;
  provenance: { source: 'openalex'; retrievedAt: string; topicId: string | null };
  topic: TopicHit | null;
  relatedTopics: TopicHit[];
  trend: YearCount[];
  researchers: PersonHit[];
  institutions: InstitutionHit[];
  funders: FunderHit[];
  grants: GrantHit[];
  datasets: WorkHit[];
  clinical: WorkHit[] | null;
  recent: WorkHit[];
};

export function stripOpenAlexId(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/openalex\.org\//i, '');
}

export function looksClinical(query: string, domain?: string | null): boolean {
  if (domain && /health|medicine|biomed/i.test(domain)) return true;
  return /\b(clinical|patient|disease|therapy|trial|cancer|drug|vaccine|diagnos)\b/i.test(query);
}

export function searchTerm(value: string): string {
  return value.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function mapTopic(raw: any): TopicHit | null {
  const id = stripOpenAlexId(raw?.id);
  const name = String(raw?.display_name || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: raw?.description ? String(raw.description) : null,
    domain: raw?.domain?.display_name ? String(raw.domain.display_name) : null,
    worksCount: Number(raw?.works_count || 0),
    citedByCount: Number(raw?.cited_by_count || 0),
  };
}

export function mapYearGroups(groups: any[], nowYear = new Date().getFullYear()): YearCount[] {
  return (groups || [])
    .map((row) => ({
      year: Number(row?.key_display_name || row?.key),
      count: Number(row?.count || 0),
    }))
    .filter((row) => Number.isFinite(row.year) && row.year > 1900 && row.year <= nowYear + 1)
    .sort((a, b) => a.year - b.year)
    .slice(-12);
}

export function mapInstitutionGroups(groups: any[]): InstitutionHit[] {
  const mapped: InstitutionHit[] = [];
  for (const row of groups || []) {
    const id = stripOpenAlexId(row?.key);
    const name = String(row?.key_display_name || '').trim();
    if (!id || !name || name === id) continue;
    mapped.push({
      id,
      name,
      country: null,
      worksCount: Number(row?.count || 0),
      citedByCount: 0,
      sourceUrl: `https://openalex.org/${id}`,
    });
  }
  return mapped.sort((a, b) => b.worksCount - a.worksCount).slice(0, 5);
}

export function mapAuthor(raw: any): PersonHit | null {
  const id = stripOpenAlexId(raw?.id);
  const name = String(raw?.display_name || '').trim();
  if (!id || !name) return null;
  const institution = raw?.last_known_institutions?.[0]?.display_name || raw?.affiliations?.[0]?.institution?.display_name || null;
  return {
    id,
    name,
    institution: institution ? String(institution) : null,
    worksCount: Number(raw?.works_count || 0),
    citedByCount: Number(raw?.cited_by_count || 0),
    sourceUrl: `https://openalex.org/${id}`,
  };
}

export function mapInstitution(raw: any): InstitutionHit | null {
  const id = stripOpenAlexId(raw?.id);
  const name = String(raw?.display_name || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    country: raw?.country_code ? String(raw.country_code) : null,
    worksCount: Number(raw?.works_count || 0),
    citedByCount: Number(raw?.cited_by_count || 0),
    sourceUrl: `https://openalex.org/${id}`,
  };
}

export function aggregateFunders(works: any[]): FunderHit[] {
  const counts = new Map<string, number>();
  for (const work of works || []) {
    const grants = Array.isArray(work?.grants) ? work.grants : [];
    const seen = new Set<string>();
    for (const grant of grants) {
      const name = String(grant?.funder_display_name || grant?.funder?.display_name || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, works]) => ({ name, works }))
    .sort((a, b) => b.works - a.works)
    .slice(0, 5);
}

export function mapWorkHit(raw: any): WorkHit | null {
  const title = String(raw?.display_name || raw?.title || '').trim();
  if (!title) return null;
  const doi = raw?.doi ? String(raw.doi).replace(/^https?:\/\/doi\.org\//i, '') : null;
  const id = stripOpenAlexId(raw?.id) || null;
  return {
    id,
    title,
    year: raw?.publication_year ? Number(raw.publication_year) : null,
    doi,
    citationCount: Number(raw?.cited_by_count || 0),
    sourceUrl: id ? `https://openalex.org/${id}` : doi ? `https://doi.org/${doi}` : null,
    isOpenAccess: Boolean(raw?.open_access?.is_oa),
  };
}

export function assembleBrief(input: {
  query: string;
  retrievedAt: string;
  openAlexReached: boolean;
  topics: TopicHit[];
  trend: YearCount[];
  researchers: PersonHit[];
  institutions: InstitutionHit[];
  funders: FunderHit[];
  grants: GrantHit[];
  datasets: WorkHit[];
  clinical: WorkHit[] | null;
  recent: WorkHit[];
}): IntelligenceBrief {
  const topic = input.topics[0] || null;
  const hasLiterature = Boolean(
    topic || input.recent.length || input.datasets.length || input.researchers.length
  );
  const available = input.openAlexReached && hasLiterature;
  return {
    query: input.query,
    available,
    notice: available
      ? null
      : 'OpenAlex did not return a brief for this topic. Literature search and the rest of DRM still work.',
    provenance: {
      source: 'openalex',
      retrievedAt: input.retrievedAt,
      topicId: topic?.id || null,
    },
    topic,
    relatedTopics: input.topics.slice(1, 5),
    trend: input.trend,
    researchers: input.researchers,
    institutions: input.institutions,
    funders: input.funders,
    grants: input.grants,
    datasets: input.datasets,
    clinical: input.clinical,
    recent: input.recent,
  };
}
