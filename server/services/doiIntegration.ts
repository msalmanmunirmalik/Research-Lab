/**
 * DOI Integration Service
 * Auto-fetch papers from CrossRef, PubMed, arXiv, and other academic databases
 * Implements Salman's suggestion: Fetch papers by DOI with option to save full paper or AI summary
 */

import axios from 'axios';
import { openAlexProvider } from './scholarly/openalex.js';
import type { CanonicalPaper } from './scholarly/types.js';

// ==============================================
// TYPES & INTERFACES
// ==============================================

export interface Paper {
  doi?: string;
  pmid?: string;
  arxivId?: string;
  title: string;
  authors: Author[];
  abstract?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  year: number;
  publicationDate?: string;
  url?: string;
  pdfUrl?: string;
  citationCount?: number;
  keywords?: string[];
  references?: string[];
  meshTerms?: string[]; // For PubMed
  subjects?: string[]; // For arXiv
  // AI-generated content
  aiSummary?: string;
  keyFindings?: string[];
  methodology?: string;
  relevanceScore?: number;
}

interface Author {
  firstName: string;
  lastName: string;
  affiliation?: string;
  orcid?: string;
}

interface CrossRefResponse {
  message: {
    title: string[];
    author: any[];
    abstract?: string;
    'container-title'?: string[];
    volume?: string;
    issue?: string;
    page?: string;
    published: any;
    DOI: string;
    URL?: string;
    'is-referenced-by-count'?: number;
    subject?: string[];
    reference?: any[];
  };
}

/** Prefer a real article title over Crossref article-type placeholders. */
function pickBestCrossrefTitle(titles: string[]): string | null {
  if (!titles.length) return null;
  const isPlaceholder = (t: string) =>
    /^(full\s*length\s*article|original\s*article|research\s*article|brief\s*report|editorial|letter\s*to\s*the\s*editor|corrigendum|erratum|retraction|untitled|article)$/i.test(
      t.trim()
    );
  const ranked = [...titles].sort((a, b) => {
    const ap = isPlaceholder(a) ? 1 : 0;
    const bp = isPlaceholder(b) ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return b.length - a.length;
  });
  const best = ranked.find((t) => !isPlaceholder(t)) || ranked[0];
  return best || null;
}

interface PubMedArticle {
  MedlineCitation: {
    PMID: { _text: string };
    Article: {
      ArticleTitle: { _text: string };
      Abstract?: { AbstractText: any };
      AuthorList?: { Author: any[] };
      Journal: {
        Title: { _text: string };
        JournalIssue: {
          Volume?: { _text: string };
          Issue?: { _text: string };
          PubDate: any;
        };
      };
      Pagination?: { MedlinePgn: { _text: string } };
    };
    MeshHeadingList?: { MeshHeading: any[] };
    KeywordList?: { Keyword: any[] };
  };
  PubmedData?: {
    ArticleIdList?: { ArticleId: any[] };
  };
}

// ==============================================
// CROSSREF API INTEGRATION
// ==============================================

export class CrossRefService {
  private baseUrl = 'https://api.crossref.org/works';
  private email = 'digital-research-manager@researchlab.com'; // Polite API access

  async fetchByDOI(doi: string): Promise<Paper | null> {
    try {
      const cleanDoi = this.cleanDOI(doi);
      const response = await axios.get<CrossRefResponse>(
        `${this.baseUrl}/${encodeURIComponent(cleanDoi)}`,
        {
          params: { mailto: this.email },
          timeout: 10000
        }
      );

      return this.parseCrossRefResponse(response.data);
    } catch (error: any) {
      console.error('CrossRef API error:', error.message);
      return null;
    }
  }

  async searchPapers(query: string, limit: number = 10): Promise<Paper[]> {
    try {
      const response = await axios.get(`${this.baseUrl}`, {
        params: {
          query: query,
          rows: limit,
          mailto: this.email
        },
        timeout: 10000
      });

      if (response.data?.message?.items) {
        return response.data.message.items.map((item: any) => 
          this.parseCrossRefItem(item)
        ).filter((paper: Paper | null) => paper !== null) as Paper[];
      }

      return [];
    } catch (error: any) {
      console.error('CrossRef search error:', error.message);
      return [];
    }
  }

  async fetchByAuthorORCID(orcid: string): Promise<Paper[]> {
    try {
      const response = await axios.get(`${this.baseUrl}`, {
        params: {
          filter: `orcid:${orcid}`,
          rows: 100,
          mailto: this.email
        },
        timeout: 15000
      });

      if (response.data?.message?.items) {
        return response.data.message.items.map((item: any) => 
          this.parseCrossRefItem(item)
        ).filter((paper: Paper | null) => paper !== null) as Paper[];
      }

      return [];
    } catch (error: any) {
      console.error('CrossRef ORCID fetch error:', error.message);
      return [];
    }
  }

  private parseCrossRefResponse(data: CrossRefResponse): Paper {
    const msg = data.message as CrossRefResponse['message'] & {
      subtitle?: string[];
      short_title?: string[];
    };

    const titles = [
      ...(Array.isArray(msg.title) ? msg.title : msg.title ? [msg.title] : []),
      ...(Array.isArray(msg.subtitle) ? msg.subtitle : []),
      ...(Array.isArray(msg.short_title) ? msg.short_title : []),
    ]
      .map((t) => String(t || '').trim())
      .filter(Boolean);

    const title = pickBestCrossrefTitle(titles) || 'Untitled';

    return {
      doi: msg.DOI,
      title,
      authors: this.parseAuthors(msg.author || []),
      abstract: msg.abstract,
      journal: msg['container-title']?.[0],
      volume: msg.volume,
      issue: msg.issue,
      pages: msg.page,
      year: this.extractYear(msg.published),
      publicationDate: this.formatDate(msg.published),
      url: msg.URL,
      citationCount: msg['is-referenced-by-count'],
      keywords: msg.subject || [],
    };
  }

  private parseCrossRefItem(item: any): Paper | null {
    try {
      return this.parseCrossRefResponse({ message: item });
    } catch (error) {
      return null;
    }
  }

  private parseAuthors(authors: any[]): Author[] {
    return authors
      .map((author) => {
        const lastName = String(author.family || '').trim();
        const firstName = String(author.given || '').trim();
        // Crossref sometimes only has a literal name (organizations / anonymous)
        const literal = String(author.name || author.literal || '').trim();
        if (!lastName && !firstName && literal) {
          return {
            firstName: '',
            lastName: literal,
            affiliation: author.affiliation?.[0]?.name,
            orcid: author.ORCID?.replace('http://orcid.org/', ''),
          };
        }
        return {
          firstName,
          lastName,
          affiliation: author.affiliation?.[0]?.name,
          orcid: author.ORCID?.replace('http://orcid.org/', ''),
        };
      })
      .filter((a) => a.firstName || a.lastName);
  }

  private extractYear(published: any): number {
    if (published?.['date-parts']?.[0]?.[0]) {
      return published['date-parts'][0][0];
    }
    return new Date().getFullYear();
  }

  private formatDate(published: any): string | undefined {
    if (published?.['date-parts']?.[0]) {
      const parts = published['date-parts'][0];
      return `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}`;
    }
    return undefined;
  }

  private cleanDOI(doi: string): string {
    // Remove common prefixes
    return doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '');
  }
}

// ==============================================
// PUBMED API INTEGRATION
// ==============================================

export class PubMedService {
  private baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

  async fetchByPMID(pmid: string): Promise<Paper | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/efetch.fcgi`, {
        params: {
          db: 'pubmed',
          id: pmid,
          retmode: 'xml'
        },
        timeout: 10000
      });

      return this.parsePubMedXML(response.data);
    } catch (error: any) {
      console.error('PubMed API error:', error.message);
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/esearch.fcgi`, {
        params: {
          db: 'pubmed',
          term: query,
          retmax: limit,
          retmode: 'json'
        },
        timeout: 10000
      });

      return response.data?.esearchresult?.idlist || [];
    } catch (error: any) {
      console.error('PubMed search error:', error.message);
      return [];
    }
  }

  async fetchByAuthorName(authorName: string, limit: number = 50): Promise<string[]> {
    return this.search(`${authorName}[Author]`, limit);
  }

  private parsePubMedXML(xml: string): Paper | null {
    // Simplified XML parsing - in production, use xml2js or similar library
    // This is a placeholder implementation
    try {
      const titleMatch = xml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
      const pmidMatch = xml.match(/<PMID.*?>(.*?)<\/PMID>/);
      
      if (!titleMatch || !pmidMatch) return null;

      return {
        pmid: pmidMatch[1],
        title: titleMatch[1],
        authors: [], // Would parse from XML
        year: new Date().getFullYear(), // Would parse from XML
      };
    } catch (error) {
      return null;
    }
  }
}

// ==============================================
// ARXIV API INTEGRATION
// ==============================================

export class ArXivService {
  private baseUrl = 'http://export.arxiv.org/api/query';

  async fetchByArXivId(arxivId: string): Promise<Paper | null> {
    try {
      const cleanId = arxivId.replace(/^arxiv:/i, '').replace(/^https?:\/\/arxiv\.org\/abs\//i, '');
      const response = await axios.get(this.baseUrl, {
        params: {
          id_list: cleanId,
          max_results: 1
        },
        timeout: 10000
      });

      return this.parseArXivAtom(response.data);
    } catch (error: any) {
      console.error('arXiv API error:', error.message);
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<Paper[]> {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          search_query: `all:${query}`,
          max_results: limit,
          sortBy: 'relevance'
        },
        timeout: 10000
      });

      return this.parseArXivAtomFeed(response.data);
    } catch (error: any) {
      console.error('arXiv search error:', error.message);
      return [];
    }
  }

  private parseArXivAtom(atom: string): Paper | null {
    // Simplified ATOM parsing - in production, use xml2js
    try {
      const titleMatch = atom.match(/<title>(.*?)<\/title>/);
      const summaryMatch = atom.match(/<summary>(.*?)<\/summary>/s);
      const publishedMatch = atom.match(/<published>(.*?)<\/published>/);
      const idMatch = atom.match(/<id>(.*?)<\/id>/);

      if (!titleMatch || !idMatch) return null;

      const arxivId = idMatch[1].split('/').pop()?.replace('v', '');
      
      return {
        arxivId: arxivId,
        title: titleMatch[1].replace(/\s+/g, ' ').trim(),
        abstract: summaryMatch?.[1].replace(/\s+/g, ' ').trim(),
        year: publishedMatch ? new Date(publishedMatch[1]).getFullYear() : new Date().getFullYear(),
        authors: [], // Would parse from ATOM
        url: idMatch[1],
        pdfUrl: idMatch[1].replace('/abs/', '/pdf/') + '.pdf'
      };
    } catch (error) {
      return null;
    }
  }

  private parseArXivAtomFeed(atom: string): Paper[] {
    // Would parse multiple entries from ATOM feed
    // Placeholder implementation
    return [];
  }
}

function canonicalToPaper(paper: CanonicalPaper): Paper {
  const authors = (paper.authors || []).map((author) => {
    const parts = author.name.trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : author.name;
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    return { firstName, lastName, orcid: author.orcid };
  });
  return {
    doi: paper.doi || undefined,
    pmid: paper.pmid || undefined,
    title: paper.title,
    authors,
    abstract: paper.abstract || undefined,
    journal: paper.journalName || undefined,
    volume: paper.volume || undefined,
    issue: paper.issue || undefined,
    pages: paper.pages || undefined,
    year: paper.publicationYear || new Date().getFullYear(),
    publicationDate: paper.publicationDate || undefined,
    url: paper.doi ? `https://doi.org/${paper.doi}` : paper.sourceUrl || undefined,
    pdfUrl: paper.pdfUrl || undefined,
    citationCount: paper.citationCount ?? undefined,
    keywords: paper.keywords,
  };
}

// ==============================================
// UNIFIED PAPER FETCHING SERVICE
// ==============================================

export class PaperFetchingService {
  private crossRef: CrossRefService;
  private pubMed: PubMedService;
  private arXiv: ArXivService;

  constructor() {
    this.crossRef = new CrossRefService();
    this.pubMed = new PubMedService();
    this.arXiv = new ArXivService();
  }

  /**
   * Extract DOI / PMID / arXiv from pasted identifiers or publisher URLs.
   * Returns null when the input is a bare URL we cannot safely resolve.
   */
  extractIdentifier(raw: string): {
    kind: 'doi' | 'pmid' | 'arxiv' | 'query';
    value: string;
  } | null {
    const input = String(raw || '').trim();
    if (!input) return null;

    // Explicit DOI URL or bare DOI
    const doiFromUrl = input.match(
      /(?:doi\.org\/|dx\.doi\.org\/|doi:\s*|\/doi\/(?:full\/|abs\/|pdf\/)?|\/doi\/)(10\.\d{4,9}\/[-._;()\/:a-zA-Z0-9]+)/i
    );
    if (doiFromUrl?.[1]) {
      return { kind: 'doi', value: this.cleanDoiValue(doiFromUrl[1]) };
    }
    // Path style …/10.1234/abc
    const doiInPath = input.match(/\/(10\.\d{4,9}\/[-._;()\/:a-zA-Z0-9]+)/);
    if (doiInPath?.[1] && /https?:\/\//i.test(input)) {
      return { kind: 'doi', value: this.cleanDoiValue(doiInPath[1]) };
    }
    if (/^10\.\d{4,9}\/\S+/i.test(input)) {
      return { kind: 'doi', value: this.cleanDoiValue(input) };
    }

    // PubMed
    const pmidUrl = input.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})/i);
    if (pmidUrl?.[1]) return { kind: 'pmid', value: pmidUrl[1] };
    const pmidPref = input.match(/pmid:?\s*(\d{5,9})/i);
    if (pmidPref?.[1]) return { kind: 'pmid', value: pmidPref[1] };
    if (/^\d{5,9}$/.test(input)) return { kind: 'pmid', value: input };

    // arXiv
    const arxivUrl = input.match(/arxiv\.org\/(?:abs|pdf)\/([a-z0-9.\-/]+)/i);
    if (arxivUrl?.[1]) {
      return { kind: 'arxiv', value: arxivUrl[1].replace(/\.pdf$/i, '') };
    }
    if (/^(arxiv:)?(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(v\d+)?$/i.test(input)) {
      return { kind: 'arxiv', value: input.replace(/^arxiv:/i, '') };
    }

    // Bare publisher URL with no extractable id — do NOT free-text search the URL
    // (Crossref returns unrelated hits; first result is often garbage).
    if (/^https?:\/\//i.test(input)) {
      return null;
    }

    // Title / keyword query
    if (input.length >= 8) return { kind: 'query', value: input };
    return null;
  }

  /**
   * Smart paper fetching - detects identifier type and fetches from appropriate source
   */
  async fetchPaper(identifier: string): Promise<Paper | null> {
    const extracted = this.extractIdentifier(identifier);
    if (!extracted) {
      return null;
    }

    if (extracted.kind === 'doi') {
      const fromOpenAlex = await openAlexProvider.getByDoi(extracted.value).catch(() => null);
      if (fromOpenAlex) return canonicalToPaper(fromOpenAlex);
      return this.crossRef.fetchByDOI(extracted.value);
    }
    if (extracted.kind === 'pmid') {
      const fromOpenAlex = await openAlexProvider.getByPmid(extracted.value).catch(() => null);
      if (fromOpenAlex) return canonicalToPaper(fromOpenAlex);
      return this.pubMed.fetchByPMID(extracted.value);
    }
    if (extracted.kind === 'arxiv') {
      return this.arXiv.fetchByArXivId(extracted.value);
    }

    // Title/keyword search — prefer Crossref bibliographic query, take best scored hit
    const papers = await this.crossRef.searchPapers(extracted.value, 5);
    if (!papers.length) {
      const fallback = await this.searchAcrossAll(extracted.value, 5);
      return fallback[0] || null;
    }
    return papers[0] || null;
  }

  /**
   * Fetch all papers by author's ORCID
   */
  async fetchPapersByORCID(orcid: string): Promise<Paper[]> {
    try {
      return await this.crossRef.fetchByAuthorORCID(orcid);
    } catch (error) {
      console.error('Error fetching papers by ORCID:', error);
      return [];
    }
  }

  /**
   * Search across all databases
   */
  async searchAcrossAll(query: string, limit: number = 20): Promise<Paper[]> {
    const extracted = this.extractIdentifier(query);
    // Never free-text search a raw URL
    if (!extracted || (extracted.kind === 'query' && /^https?:\/\//i.test(query))) {
      return [];
    }
    const q = extracted.kind === 'query' ? extracted.value : extracted.value;
    if (extracted.kind === 'doi') {
      const fromOpenAlex = await openAlexProvider.getByDoi(extracted.value).catch(() => null);
      if (fromOpenAlex) return [canonicalToPaper(fromOpenAlex)];
      const p = await this.crossRef.fetchByDOI(extracted.value);
      return p ? [p] : [];
    }
    if (extracted.kind === 'pmid') {
      const fromOpenAlex = await openAlexProvider.getByPmid(extracted.value).catch(() => null);
      if (fromOpenAlex) return [canonicalToPaper(fromOpenAlex)];
      const p = await this.pubMed.fetchByPMID(extracted.value);
      return p ? [p] : [];
    }
    if (extracted.kind === 'arxiv') {
      const p = await this.arXiv.fetchByArXivId(extracted.value);
      return p ? [p] : [];
    }

    const results = await Promise.allSettled([
      openAlexProvider.search({ query: q, limit }).then((rows) => rows.map(canonicalToPaper)),
      this.crossRef.searchPapers(q, limit),
      this.arXiv.search(q, Math.max(1, Math.floor(limit / 2))),
    ]);

    const papers: Paper[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        papers.push(...result.value);
      }
    });
    return this.deduplicatePapers(papers);
  }

  private cleanDoiValue(doi: string): string {
    return doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }

  // Helper methods (kept for callers / tests)
  private isDOI(str: string): boolean {
    return this.extractIdentifier(str)?.kind === 'doi';
  }

  private isPMID(str: string): boolean {
    return /^\d{5,9}$/.test(str.trim()) || /pmid:?\s*\d{5,9}/i.test(str);
  }

  private isArXivId(str: string): boolean {
    return (
      /^(arxiv:)?(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(v\d+)?$/i.test(str) ||
      /arxiv\.org\/abs\//i.test(str)
    );
  }

  private deduplicatePapers(papers: Paper[]): Paper[] {
    const seen = new Set<string>();
    return papers.filter((paper) => {
      const key = paper.doi || paper.pmid || paper.arxivId || paper.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Export singleton instance
export const paperFetchingService = new PaperFetchingService();

