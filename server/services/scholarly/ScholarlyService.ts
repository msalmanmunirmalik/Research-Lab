/**
 * Scholarly search orchestrator — provider strategy + cache + ranking.
 */

import { CanonicalPaper, normalizeDoi, mergeCanonical } from './types.js';
import { openAlexProvider } from './openalex.js';
import { crossrefProvider } from './crossref.js';
import { pubMedProvider } from './pubmed.js';
import { europePmcProvider } from './europepmc.js';
import { unpaywallProvider } from './unpaywall.js';
import { cacheKey, getCached, setCached } from './cache.js';
import { PaperRepository } from './PaperRepository.js';

function looksBiomedical(q: string): boolean {
  return /\b(pubmed|pmid|clinical|patient|disease|therapy|trial|genome|protein|cell|cancer|drug|vaccine|epidemiolog)\b/i.test(
    q
  );
}

function isDoi(q: string): boolean {
  return /10\.\d{4,}\/\S+/i.test(q) || /doi\.org\/10\./i.test(q);
}

function isPmid(q: string): boolean {
  return /^(pmid[:\s]*)?\d{5,9}$/i.test(q.trim());
}

function dedupeResults(papers: CanonicalPaper[]): CanonicalPaper[] {
  const seen = new Set<string>();
  const out: CanonicalPaper[] = [];
  for (const p of papers) {
    const key =
      normalizeDoi(p.doi) ||
      (p.pmid && `pmid:${p.pmid}`) ||
      (p.openalexId && `oa:${p.openalexId}`) ||
      `t:${(p.normalizedTitle || p.title).slice(0, 80)}:${p.publicationYear || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function rank(
  papers: CanonicalPaper[],
  query: string,
  sort: 'relevance' | 'newest' | 'oldest' | 'cited'
): CanonicalPaper[] {
  const q = query.toLowerCase();
  const scored = papers.map((p) => {
    let score = 0;
    const title = (p.title || '').toLowerCase();
    const abs = (p.abstract || '').toLowerCase();
    if (title.includes(q)) score += 40;
    for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
      if (title.includes(token)) score += 8;
      if (abs.includes(token)) score += 2;
    }
    score += Math.min(20, Math.log10((p.citationCount || 0) + 1) * 6);
    const age = p.publicationYear ? new Date().getFullYear() - p.publicationYear : 20;
    score += Math.max(0, 10 - age * 0.4);
    if (p.isOpenAccess) score += 3;
    if (p.abstract) score += 2;
    return { p, score };
  });

  if (sort === 'newest') {
    return scored
      .sort((a, b) => (b.p.publicationYear || 0) - (a.p.publicationYear || 0))
      .map((x) => x.p);
  }
  if (sort === 'oldest') {
    return scored
      .sort((a, b) => (a.p.publicationYear || 9999) - (b.p.publicationYear || 9999))
      .map((x) => x.p);
  }
  if (sort === 'cited') {
    return scored
      .sort((a, b) => (b.p.citationCount || 0) - (a.p.citationCount || 0))
      .map((x) => x.p);
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.p);
}

export class ScholarlyService {
  static async search(opts: {
    query: string;
    limit?: number;
    yearFrom?: number;
    yearTo?: number;
    openAccessOnly?: boolean;
    biomedicalOnly?: boolean;
    sort?: 'relevance' | 'newest' | 'oldest' | 'cited';
  }): Promise<{ papers: CanonicalPaper[]; providers: string[] }> {
    const query = opts.query.trim();
    if (!query) return { papers: [], providers: [] };

    const key = cacheKey(['search', opts]);
    const cached = await getCached<{ papers: CanonicalPaper[]; providers: string[] }>(key);
    if (cached) return cached;

    const providersUsed: string[] = [];
    let papers: CanonicalPaper[] = [];

    try {
      if (isDoi(query)) {
        const doiPaper = await this.resolveDoi(query);
        if (doiPaper) papers.push(doiPaper);
        providersUsed.push('crossref', 'openalex');
      } else if (isPmid(query)) {
        const pmid = query.replace(/\D/g, '');
        const [pm, epmc, oaPmid] = await Promise.all([
          pubMedProvider.getByPmid(pmid),
          europePmcProvider.getByPmid(pmid),
          openAlexProvider.getByPmid(pmid),
        ]);
        if (oaPmid) papers.push(oaPmid);
        if (pm) papers.push(pm);
        if (epmc) papers.push(epmc);
        providersUsed.push('openalex', 'pubmed', 'europepmc');
      } else {
        const bio = opts.biomedicalOnly || looksBiomedical(query);
        const oa = await openAlexProvider
          .search({
            query,
            limit: opts.limit || 20,
            yearFrom: opts.yearFrom,
            yearTo: opts.yearTo,
            openAccessOnly: opts.openAccessOnly,
            sort: opts.sort === 'relevance' ? 'relevance' : opts.sort,
          })
          .catch(() => []);
        providersUsed.push('openalex');
        papers.push(...oa);

        if (bio) {
          const [pm, epmc] = await Promise.all([
            pubMedProvider.search(query, 10).catch(() => []),
            europePmcProvider.search(query, 10).catch(() => []),
          ]);
          papers.push(...pm, ...epmc);
          providersUsed.push('pubmed', 'europepmc');
        }
      }
    } catch (e) {
      console.error('Scholarly search error:', e instanceof Error ? e.message : 'failed');
    }

    papers = rank(dedupeResults(papers), query, opts.sort || 'relevance');
    if (opts.openAccessOnly) papers = papers.filter((p) => p.isOpenAccess);
    papers = papers.slice(0, opts.limit || 20);

    const result = { papers, providers: [...new Set(providersUsed)] };
    await setCached(key, result);
    return result;
  }

  static async resolveDoi(doi: string): Promise<CanonicalPaper | null> {
    const cleaned = normalizeDoi(doi);
    if (!cleaned) return null;
    const key = cacheKey(['doi', cleaned]);
    const cached = await getCached<CanonicalPaper>(key);
    if (cached) return cached;

    let paper =
      (await crossrefProvider.getByDoi(cleaned).catch(() => null)) ||
      (await openAlexProvider.getByDoi(cleaned).catch(() => null));

    if (paper) {
      const oa = await openAlexProvider.getByDoi(cleaned).catch(() => null);
      if (oa) paper = mergeCanonical(paper, oa);
      const up = await unpaywallProvider.lookup(cleaned).catch(() => null);
      if (up?.pdfUrl) {
        paper.pdfUrl = paper.pdfUrl || up.pdfUrl;
        paper.isOpenAccess = paper.isOpenAccess || up.isOa;
        paper.openAccessStatus = paper.openAccessStatus || up.oaStatus;
        paper.pdfAvailable = true;
        paper.pdfAccessType = 'open_access';
      }
      await setCached(key, paper);
    }
    return paper;
  }

  static async resolveAndStore(input: CanonicalPaper | string): Promise<CanonicalPaper & { id: string }> {
    let paper: CanonicalPaper | null =
      typeof input === 'string' ? await this.resolveDoi(input) : input;
    if (!paper && typeof input === 'string' && isPmid(input)) {
      paper = await pubMedProvider.getByPmid(input);
    }
    if (!paper) throw new Error('Could not resolve paper metadata');
    return PaperRepository.upsert(paper);
  }

  static async related(paperId: string) {
    const paper = await PaperRepository.getById(paperId);
    if (!paper) return { related: [], citedBy: [], references: [] };
    let related: CanonicalPaper[] = [];
    let citedBy: CanonicalPaper[] = [];
    let references: CanonicalPaper[] = [];
    if (paper.openalexId) {
      const [rel, cb, refs] = await Promise.all([
        openAlexProvider.related(paper.openalexId, 10),
        openAlexProvider.citedBy(paper.openalexId, 10),
        openAlexProvider.references(paper.openalexId, 8),
      ]);
      related = rel.related;
      citedBy = cb;
      references = refs;
    } else if (paper.title) {
      related = (await openAlexProvider.search({ query: paper.title, limit: 10, sort: 'cited' })).filter(
        (p) => normalizeDoi(p.doi) !== normalizeDoi(paper.doi)
      );
    }
    return { related, citedBy, references, paper };
  }
}
