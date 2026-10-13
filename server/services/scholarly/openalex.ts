/**
 * OpenAlex scholarly provider — primary discovery engine.
 * https://docs.openalex.org/
 */

import axios from 'axios';
import { CanonicalPaper, normalizeDoi, normalizeTitle } from './types.js';
import {
  aggregateFunders,
  mapAuthor,
  mapInstitution,
  mapInstitutionGroups,
  mapTopic,
  mapWorkHit,
  mapYearGroups,
  stripOpenAlexId,
  type FunderHit,
  type InstitutionHit,
  type PersonHit,
  type TopicHit,
  type WorkHit,
  type YearCount,
} from './intelligenceBrief.js';

const BASE = 'https://api.openalex.org';

function mailto(): string {
  return process.env.OPENALEX_MAILTO || process.env.NCBI_EMAIL || 'research@digitalresearchmanager.com';
}

function headers() {
  const h: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.OPENALEX_API_KEY;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

function mapWork(w: any): CanonicalPaper {
  const doi = normalizeDoi(w.doi || w.ids?.doi);
  const authors = (w.authorships || [])
    .map((a: any) => ({
      name: a.author?.display_name || '',
      orcid: a.author?.orcid || undefined,
      affiliation: a.institutions?.[0]?.display_name,
    }))
    .filter((a: { name: string }) => a.name && !/^unknown$/i.test(a.name));
  const oaUrl =
    w.open_access?.oa_url ||
    w.primary_location?.pdf_url ||
    w.best_oa_location?.pdf_url ||
    null;
  const pdfUrl = w.primary_location?.pdf_url || w.best_oa_location?.pdf_url || oaUrl;
  const year = w.publication_year || null;
  return {
    title: (() => {
      const candidates = [w.title, w.display_name]
        .map((t: unknown) => String(t || '').trim())
        .filter(Boolean);
      const isPlaceholder = (t: string) =>
        /^(full\s*length\s*article|original\s*article|research\s*article|brief\s*report|editorial|untitled|article)$/i.test(
          t
        );
      return (
        candidates.find((t) => !isPlaceholder(t)) ||
        candidates[0] ||
        'Untitled'
      );
    })(),
    abstract: invertAbstract(w.abstract_inverted_index) || null,
    publicationType: w.type || null,
    publicationYear: year,
    publicationDate: w.publication_date || null,
    doi,
    pmid: w.ids?.pmid?.replace?.('https://pubmed.ncbi.nlm.nih.gov/', '') || null,
    pmcid: w.ids?.pmcid || null,
    openalexId: w.id?.replace?.('https://openalex.org/', '') || w.id || null,
    journalName: w.primary_location?.source?.display_name || null,
    journalIssn: w.primary_location?.source?.issn_l || null,
    publisher: w.primary_location?.source?.host_organization_name || null,
    volume: w.biblio?.volume || null,
    issue: w.biblio?.issue || null,
    pages:
      w.biblio?.first_page && w.biblio?.last_page
        ? `${w.biblio.first_page}-${w.biblio.last_page}`
        : w.biblio?.first_page || null,
    authors,
    topics: (w.topics || []).map((t: any) => t.display_name).filter(Boolean),
    keywords: (w.keywords || []).map((k: any) => k.display_name || k).filter(Boolean),
    citationCount: w.cited_by_count ?? 0,
    isOpenAccess: Boolean(w.open_access?.is_oa),
    openAccessStatus: w.open_access?.oa_status || null,
    openAccessUrl: oaUrl,
    pdfUrl: pdfUrl || null,
    sourceUrl: w.id || (doi ? `https://doi.org/${doi}` : null),
    metadataSource: 'openalex',
    abstractAvailable: Boolean(invertAbstract(w.abstract_inverted_index)),
    pdfAvailable: Boolean(pdfUrl),
    pdfAccessType: pdfUrl ? 'open_access' : 'none',
    normalizedTitle: normalizeTitle(w.title || w.display_name),
  };
}

async function oaGet(path: string, params: Record<string, string | number> = {}): Promise<any | null> {
  try {
    const { data } = await axios.get(`${BASE}${path}`, {
      params: { ...params, mailto: mailto() },
      headers: headers(),
      timeout: 15000,
    });
    return data ?? null;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    console.warn(`OpenAlex request failed ${path} ${status ?? 'network'}`);
    return null;
  }
}

function invertAbstract(inv: Record<string, number[]> | undefined): string | null {
  if (!inv || typeof inv !== 'object') return null;
  const pairs: Array<{ word: string; pos: number }> = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) pairs.push({ word, pos });
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => a.pos - b.pos);
  return pairs.map((p) => p.word).join(' ');
}

export class OpenAlexProvider {
  async search(opts: {
    query: string;
    limit?: number;
    yearFrom?: number;
    yearTo?: number;
    openAccessOnly?: boolean;
    sort?: 'relevance' | 'newest' | 'oldest' | 'cited';
  }): Promise<CanonicalPaper[]> {
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const filters: string[] = [];
    if (opts.yearFrom) filters.push(`from_publication_date:${opts.yearFrom}-01-01`);
    if (opts.yearTo) filters.push(`to_publication_date:${opts.yearTo}-12-31`);
    if (opts.openAccessOnly) filters.push('is_oa:true');

    let sort = 'relevance_score:desc';
    if (opts.sort === 'newest') sort = 'publication_date:desc';
    if (opts.sort === 'oldest') sort = 'publication_date:asc';
    if (opts.sort === 'cited') sort = 'cited_by_count:desc';

    const params: Record<string, string | number> = {
      search: opts.query,
      per_page: limit,
      sort,
      mailto: mailto(),
    };
    if (filters.length) params.filter = filters.join(',');

    const data = await oaGet('/works', params);
    return (data?.results || []).map(mapWork);
  }

  async getByPmid(pmid: string): Promise<CanonicalPaper | null> {
    const clean = pmid.replace(/\D/g, '');
    if (!clean) return null;
    const data = await oaGet('/works', { filter: `pmid:${clean}`, per_page: 1 });
    const work = data?.results?.[0];
    return work ? mapWork(work) : null;
  }

  async getByDoi(doi: string): Promise<CanonicalPaper | null> {
    const cleaned = normalizeDoi(doi);
    if (!cleaned) return null;
    try {
      const { data } = await axios.get(`${BASE}/works/doi:${encodeURIComponent(cleaned)}`, {
        params: { mailto: mailto() },
        headers: headers(),
        timeout: 12000,
      });
      return mapWork(data);
    } catch {
      return null;
    }
  }

  async getByOpenAlexId(id: string): Promise<CanonicalPaper | null> {
    const clean = id.replace(/^https?:\/\/openalex\.org\//i, '');
    try {
      const { data } = await axios.get(`${BASE}/works/${clean}`, {
        params: { mailto: mailto() },
        headers: headers(),
        timeout: 12000,
      });
      return mapWork(data);
    } catch {
      return null;
    }
  }

  async getWorksByIds(ids: string[]): Promise<CanonicalPaper[]> {
    const clean = ids.map(stripOpenAlexId).filter(Boolean).slice(0, 20);
    if (!clean.length) return [];
    const data = await oaGet('/works', {
      filter: `openalex_id:${clean.join('|')}`,
      per_page: clean.length,
    });
    if (!data) return [];
    return (data.results || []).map(mapWork);
  }

  async related(openalexId: string, limit = 10): Promise<{
    related: CanonicalPaper[];
    referenced: string[];
    citedByCount: number;
  }> {
    const clean = stripOpenAlexId(openalexId);
    const data = clean ? await oaGet(`/works/${clean}`) : null;
    if (!data) return { related: [], referenced: [], citedByCount: 0 };
    const ids = ((data.related_works || []) as string[]).slice(0, limit);
    let related = await this.getWorksByIds(ids);
    if (!related.length && data.display_name) {
      related = (await this.search({ query: String(data.display_name), limit, sort: 'cited' }).catch(() => []))
        .filter((paper) => paper.openalexId !== clean);
    }
    return {
      related: related.slice(0, limit),
      referenced: [],
      citedByCount: Number(data.cited_by_count || 0),
    };
  }

  async citedBy(openalexId: string, limit = 15): Promise<CanonicalPaper[]> {
    const clean = openalexId.replace(/^https?:\/\/openalex\.org\//i, '');
    try {
      const { data } = await axios.get(`${BASE}/works`, {
        params: {
          filter: `cites:${clean}`,
          per_page: limit,
          sort: 'cited_by_count:desc',
          mailto: mailto(),
        },
        headers: headers(),
        timeout: 15000,
      });
      return (data.results || []).map(mapWork);
    } catch {
      return [];
    }
  }

  async references(openalexId: string, limit = 15): Promise<CanonicalPaper[]> {
    const clean = stripOpenAlexId(openalexId);
    const data = clean ? await oaGet(`/works/${clean}`, { select: 'referenced_works' }) : null;
    if (!data) return [];
    const ids = ((data.referenced_works || []) as string[]).slice(0, Math.min(limit, 10));
    return this.getWorksByIds(ids);
  }

  async searchTopics(query: string, limit = 5): Promise<{ ok: boolean; topics: TopicHit[] }> {
    const data = await oaGet('/topics', { search: query, per_page: Math.min(5, limit) });
    if (!data) return { ok: false, topics: [] };
    return {
      ok: true,
      topics: (data.results || []).map(mapTopic).filter(Boolean) as TopicHit[],
    };
  }

  async topicYears(topicId: string): Promise<{ ok: boolean; years: YearCount[] }> {
    const data = await oaGet('/works', {
      filter: `primary_topic.id:${stripOpenAlexId(topicId)}`,
      group_by: 'publication_year',
    });
    if (!data) return { ok: false, years: [] };
    return { ok: true, years: mapYearGroups(data.group_by || []) };
  }

  async topicResearchers(topicId: string): Promise<{ ok: boolean; people: PersonHit[] }> {
    const data = await oaGet('/authors', {
      filter: `topics.id:${stripOpenAlexId(topicId)}`,
      sort: 'cited_by_count:desc',
      per_page: 5,
    });
    if (!data) return { ok: false, people: [] };
    return { ok: true, people: (data.results || []).map(mapAuthor).filter(Boolean) as PersonHit[] };
  }

  async topicInstitutionCounts(topicId: string): Promise<{ ok: boolean; institutions: InstitutionHit[] }> {
    const data = await oaGet('/works', {
      filter: `primary_topic.id:${stripOpenAlexId(topicId)}`,
      group_by: 'authorships.institutions.id',
    });
    if (!data) return { ok: false, institutions: [] };
    return { ok: true, institutions: mapInstitutionGroups(data.group_by || []) };
  }

  async topicInstitutions(topicId: string): Promise<{ ok: boolean; institutions: InstitutionHit[] }> {
    const data = await oaGet('/institutions', {
      filter: `topics.id:${stripOpenAlexId(topicId)}`,
      sort: 'works_count:desc',
      per_page: 5,
    });
    if (!data) return { ok: false, institutions: [] };
    return {
      ok: true,
      institutions: (data.results || []).map(mapInstitution).filter(Boolean) as InstitutionHit[],
    };
  }

  async topicFunders(topicId: string): Promise<{ ok: boolean; funders: FunderHit[] }> {
    const data = await oaGet('/works', {
      filter: `primary_topic.id:${stripOpenAlexId(topicId)}`,
      sort: 'cited_by_count:desc',
      per_page: 25,
      select: 'id,grants',
    });
    if (!data) return { ok: false, funders: [] };
    return { ok: true, funders: aggregateFunders(data.results || []) };
  }

  async topicWorks(opts: {
    topicId?: string | null;
    query: string;
    search?: string;
    extraFilter?: string;
    sort?: string;
    fromDate?: string;
    limit?: number;
  }): Promise<{ ok: boolean; works: WorkHit[] }> {
    const filters: string[] = [];
    if (opts.topicId) filters.push(`primary_topic.id:${stripOpenAlexId(opts.topicId)}`);
    if (opts.extraFilter) filters.push(opts.extraFilter);
    if (opts.fromDate) filters.push(`from_publication_date:${opts.fromDate}`);
    const params: Record<string, string | number> = {
      per_page: Math.min(8, opts.limit || 5),
      sort: opts.sort || 'cited_by_count:desc',
      select: 'id,display_name,publication_year,doi,cited_by_count,open_access',
    };
    if (opts.search) params.search = opts.search;
    else if (!opts.topicId) params.search = opts.query;
    if (filters.length) params.filter = filters.join(',');
    const data = await oaGet('/works', params);
    if (!data) return { ok: false, works: [] };
    return { ok: true, works: (data.results || []).map(mapWorkHit).filter(Boolean) as WorkHit[] };
  }
}

export const openAlexProvider = new OpenAlexProvider();
