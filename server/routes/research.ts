/**
 * Evidence & References API — Discover, Library, Collections, Cite, Evidence, Ask Paper.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../../database/config.js';
import { ScholarlyService } from '../services/scholarly/ScholarlyService.js';
import { ResearchIntelligenceService } from '../services/scholarly/researchIntelligence.js';
import { PaperRepository } from '../services/scholarly/PaperRepository.js';
import { PaperRagService } from '../services/scholarly/PaperRagService.js';
import { CitationSupportService } from '../services/scholarly/CitationSupportService.js';
import {
  CSL_STYLES,
  CslStyleId,
  extractCiteIds,
  renderDocumentWithCites,
  buildBibliographyFromIds,
  toRis,
  parseRis,
  formatInTextCsl,
} from '../services/scholarly/cslFormat.js';
import { ScholarSidekickService } from '../services/scholarly/ScholarSidekickService.js';
import { parseBibtex } from '../services/writing/citationFormat.js';
import { CanonicalPaper } from '../services/scholarly/types.js';
import { europePmcProvider } from '../services/scholarly/europepmc.js';

const router = Router();
router.use(authenticateToken);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(process.cwd(), 'uploads', 'research-pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function audit(userId: string, eventType: string, metadata?: Record<string, unknown>) {
  try {
    await pool.query(
      `INSERT INTO scholarly_audit_events (id, user_id, event_type, metadata) VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), userId, eventType, JSON.stringify(metadata || {})]
    );
  } catch {
    /* optional */
  }
}

/** GET /api/research/styles */
router.get('/styles', (_req, res) => {
  res.json({ success: true, styles: CSL_STYLES });
});

/** GET /api/research/search */
router.get('/search', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q is required' });
    const result = await ScholarlyService.search({
      query: q,
      limit: parseInt(String(req.query.limit || '20'), 10),
      yearFrom: req.query.yearFrom ? Number(req.query.yearFrom) : undefined,
      yearTo: req.query.yearTo ? Number(req.query.yearTo) : undefined,
      openAccessOnly: req.query.openAccess === '1' || req.query.openAccess === 'true',
      biomedicalOnly: req.query.biomedical === '1' || req.query.biomedical === 'true',
      sort: (req.query.sort as any) || 'relevance',
    });
    await audit(req.user.id, 'search_performed', { q, count: result.papers.length });
    res.json({ success: true, ...result });
  } catch (e: any) {
    console.error('research search error:', e);
    res.status(500).json({ error: e.message || 'Search failed' });
  }
});

/** GET /api/research/intelligence?q= — OpenAlex brief plus matching DRM grants */
router.get('/intelligence', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q is required' });
    const brief = await ResearchIntelligenceService.brief(q);
    await audit(req.user.id, 'intelligence_brief', {
      q,
      available: brief.available,
      topicId: brief.provenance.topicId,
    });
    res.json({ success: true, brief });
  } catch (e: any) {
    console.error('research intelligence error:', e instanceof Error ? e.message : 'failed');
    res.json({
      success: true,
      brief: {
        query: String(req.query.q || ''),
        available: false,
        notice: 'OpenAlex did not return a brief for this topic. Literature search and the rest of DRM still work.',
        provenance: { source: 'openalex', retrievedAt: new Date().toISOString(), topicId: null },
        topic: null,
        relatedTopics: [],
        trend: [],
        researchers: [],
        institutions: [],
        funders: [],
        grants: [],
        datasets: [],
        clinical: null,
        recent: [],
      },
    });
  }
});

/** GET /api/research/papers/:id */
router.get('/papers/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const paper = await PaperRepository.getById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    res.json({ success: true, paper });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load paper' });
  }
});

/** GET /api/research/papers/:id/related */
router.get('/papers/:id/related', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const data = await ScholarlyService.related(req.params.id);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Related lookup failed' });
  }
});

/** POST /api/research/papers/resolve — DOI/PMID/manual → upsert canonical */
router.post('/papers/resolve', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { doi, pmid, paper } = req.body || {};
    let stored;
    if (doi) stored = await ScholarlyService.resolveAndStore(String(doi));
    else if (pmid) stored = await ScholarlyService.resolveAndStore(String(pmid));
    else if (paper?.title) stored = await PaperRepository.upsert(paper as CanonicalPaper);
    else return res.status(400).json({ error: 'doi, pmid, or paper required' });
    res.json({ success: true, paper: stored });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Resolve failed' });
  }
});

/** GET /api/research/library */
router.get('/library', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    // Best-effort: migrate DOI-bearing writing_citations into canonical papers
    try {
      await PaperRepository.syncWritingCitationsForUser(req.user.id);
    } catch {
      /* optional until schema present */
    }
    const items = await PaperRepository.listLibrary(req.user.id, {
      q: req.query.q as string,
      favorite: req.query.favorite === '1',
      hasPdf: req.query.hasPdf === '1',
      openAccess: req.query.openAccess === '1',
      collectionId: req.query.collectionId as string,
      projectId: req.query.projectId as string,
      limit: parseInt(String(req.query.limit || '50'), 10),
      offset: parseInt(String(req.query.offset || '0'), 10),
    });
    res.json({ success: true, items, count: items.length });
  } catch (e: any) {
    console.error('library list error:', e);
    res.status(500).json({
      error: /doesn't exist|ER_NO_SUCH_TABLE/i.test(e.message || '')
        ? 'Run pnpm run db:migrate to install Evidence & References tables'
        : e.message || 'Failed to list library',
    });
  }
});

/** POST /api/research/library — save paper(s) */
router.post('/library', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const papers: CanonicalPaper[] = Array.isArray(req.body.papers)
      ? req.body.papers
      : req.body.paper
        ? [req.body.paper]
        : [];
    if (!papers.length && req.body.doi) {
      const p = await ScholarlyService.resolveAndStore(String(req.body.doi));
      papers.push(p);
    }
    if (!papers.length) return res.status(400).json({ error: 'paper(s) or doi required' });

    const saved = [];
    for (const p of papers) {
      const stored = p.id
        ? (await PaperRepository.getById(p.id)) || (await PaperRepository.upsert(p))
        : await PaperRepository.upsert(p);
      const item = await PaperRepository.addToLibrary(req.user.id, stored.id, {
        projectId: req.body.projectId,
        notes: req.body.notes,
        tags: req.body.tags,
      });
      saved.push({ paper: stored, libraryItem: item });
      await audit(req.user.id, 'reference_saved', { paperId: stored.id });
    }
    res.status(201).json({ success: true, saved });
  } catch (e: any) {
    console.error('library save error:', e);
    res.status(500).json({ error: e.message || 'Save failed' });
  }
});

/** PATCH /api/research/library/:paperId */
router.patch('/library/:paperId', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const sets: string[] = [];
    const params: any[] = [];
    if (typeof req.body.isFavorite === 'boolean') {
      params.push(req.body.isFavorite ? 1 : 0);
      sets.push(`is_favorite = $${params.length}`);
    }
    if (req.body.notes != null) {
      params.push(req.body.notes);
      sets.push(`notes = $${params.length}`);
    }
    if (req.body.tags) {
      params.push(JSON.stringify(req.body.tags));
      sets.push(`tags = $${params.length}`);
    }
    if (req.body.projectId !== undefined) {
      params.push(req.body.projectId || null);
      sets.push(`project_id = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'No updates' });
    params.push(req.user.id, req.params.paperId);
    await pool.query(
      `UPDATE user_library_items SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $${params.length - 1} AND paper_id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Update failed' });
  }
});

/** DELETE /api/research/library/:paperId */
router.delete('/library/:paperId', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    await pool.query(`DELETE FROM user_library_items WHERE user_id = $1 AND paper_id = $2`, [
      req.user.id,
      req.params.paperId,
    ]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Delete failed' });
  }
});

/** Collections CRUD */
router.get('/collections', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const r = await pool.query(
      `SELECT c.*, COUNT(rci.paper_id) AS paper_count
       FROM reference_collections c
       LEFT JOIN reference_collection_items rci ON rci.collection_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, collections: r.rows || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to list collections' });
  }
});

router.post('/collections', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO reference_collections (id, user_id, name, description, project_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.user.id, name, req.body.description || null, req.body.projectId || null]
    );
    res.status(201).json({ success: true, id, name });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Create failed' });
  }
});

router.put('/collections/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    await pool.query(
      `UPDATE reference_collections SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [req.body.name || null, req.body.description ?? null, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Update failed' });
  }
});

router.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    await pool.query(`DELETE FROM reference_collection_items WHERE collection_id = $1`, [
      req.params.id,
    ]);
    await pool.query(`DELETE FROM reference_collections WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Delete failed' });
  }
});

router.post('/collections/:id/items', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const own = await pool.query(
      `SELECT id FROM reference_collections WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows?.[0]) return res.status(404).json({ error: 'Collection not found' });
    const paperIds: string[] = Array.isArray(req.body.paperIds)
      ? req.body.paperIds
      : [req.body.paperId].filter(Boolean);
    for (const paperId of paperIds) {
      await pool.query(
        `INSERT IGNORE INTO reference_collection_items (collection_id, paper_id) VALUES ($1,$2)`,
        [req.params.id, paperId]
      );
    }
    res.json({ success: true, count: paperIds.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Add failed' });
  }
});

/** Import BibTeX / RIS */
router.post('/import', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const format = String(req.body.format || 'bibtex').toLowerCase();
    const text = String(req.body.text || '');
    let papers: CanonicalPaper[] = [];
    if (format === 'ris') {
      papers = parseRis(text).map((p) => ({
        title: p.title!,
        authors: (p.authors as any) || [],
        publicationYear: p.publicationYear,
        journalName: p.journalName,
        volume: p.volume,
        issue: p.issue,
        pages: p.pages,
        doi: p.doi,
        abstract: p.abstract,
        pmid: p.pmid,
        metadataSource: 'ris_import',
      }));
    } else {
      papers = parseBibtex(text).map((c) => ({
        title: c.title,
        authors: (c.authors || []).map((name) => ({ name })),
        publicationYear: c.year,
        journalName: c.journal,
        volume: c.volume,
        issue: c.issue,
        pages: c.pages,
        doi: c.doi,
        abstract: c.abstract,
        metadataSource: 'bibtex_import',
      }));
    }
    const saved = [];
    for (const p of papers) {
      const stored = await PaperRepository.upsert(p);
      await PaperRepository.addToLibrary(req.user.id, stored.id);
      saved.push(stored);
    }
    res.status(201).json({ success: true, count: saved.length, papers: saved });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Import failed' });
  }
});

/** Export bibliography / BibTeX / RIS / CSV */
router.post('/export', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const format = String(req.body.format || 'bibliography');
    const style = (req.body.style || 'apa') as CslStyleId;
    const paperIds: string[] = req.body.paperIds || [];
    const papers: CanonicalPaper[] = [];
    for (const id of paperIds) {
      const p = await PaperRepository.getById(id);
      if (p) papers.push(p);
    }
    if (!papers.length) {
      const lib = await PaperRepository.listLibrary(req.user.id, { limit: 200 });
      papers.push(...lib.map((i) => i.paper));
    }

    if (format === 'ris') {
      return res.json({
        success: true,
        content: papers.map(toRis).join('\n'),
        mime: 'application/x-research-info-systems',
      });
    }
    if (format === 'bibtex') {
      const content = papers
        .map((p, i) => {
          const key = (p.doi || `ref${i}`).replace(/[^a-zA-Z0-9]/g, '');
          const authors = (p.authors || []).map((a) => a.name).join(' and ');
          return `@article{${key},\n  title={${p.title}},\n  author={${authors}},\n  year={${p.publicationYear || ''}},\n  journal={${p.journalName || ''}},\n  doi={${p.doi || ''}}\n}`;
        })
        .join('\n\n');
      return res.json({ success: true, content, mime: 'application/x-bibtex' });
    }
    if (format === 'csv') {
      const header = 'title,authors,year,journal,doi,pmid\n';
      const rows = papers
        .map((p) =>
          [
            JSON.stringify(p.title),
            JSON.stringify((p.authors || []).map((a) => a.name).join('; ')),
            p.publicationYear || '',
            JSON.stringify(p.journalName || ''),
            p.doi || '',
            p.pmid || '',
          ].join(',')
        )
        .join('\n');
      return res.json({ success: true, content: header + rows, mime: 'text/csv' });
    }

    const byId: Record<string, CanonicalPaper> = {};
    papers.forEach((p) => {
      if (p.id) byId[p.id] = p;
    });
    const ids = papers.map((p) => p.id!).filter(Boolean);
    res.json({
      success: true,
      content: buildBibliographyFromIds(ids, byId, style),
      mime: 'text/plain',
      style,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Export failed' });
  }
});

/** POST /api/research/bibliography — from manuscript text with {{cite:id}} */
router.post('/bibliography', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const text = String(req.body.text || '');
    const style = (req.body.style || 'apa') as CslStyleId;
    const preferSidekick = req.body.preferSidekick !== false;
    const ids = extractCiteIds(text);
    const byId: Record<string, CanonicalPaper> = {};
    for (const id of ids) {
      const p = await PaperRepository.getById(id);
      if (p) byId[id] = p;
    }
    const { rendered, bibliographyIds } = renderDocumentWithCites(text, byId, style);
    const papers = bibliographyIds.map((id) => byId[id]).filter(Boolean);

    let bibliography = buildBibliographyFromIds(bibliographyIds, byId, style);
    let biblioProvider: 'scholar-sidekick' | 'local' = 'local';
    let styleUsed = String(style);

    if (preferSidekick && papers.length) {
      try {
        const sk = await ScholarSidekickService.formatBibliography(
          papers,
          style,
          bibliographyIds
        );
        bibliography = sk.bibliography;
        biblioProvider = sk.provider;
        styleUsed = sk.styleUsed;
      } catch {
        /* keep local */
      }
    }

    res.json({
      success: true,
      rendered,
      bibliography,
      citationIds: bibliographyIds,
      style,
      styleUsed,
      provider: biblioProvider,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Bibliography failed' });
  }
});

/** POST /api/research/sidekick/verify — fabrication check (real DOI + invented title) */
router.post('/sidekick/verify', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    const result = await ScholarSidekickService.verifyClaimedPaper({
      title,
      doi: req.body.doi || null,
      pmid: req.body.pmid || null,
      pmcid: req.body.pmcid || null,
      authors: Array.isArray(req.body.authors) ? req.body.authors.map(String) : undefined,
      year: req.body.year != null ? Number(req.body.year) : null,
      journal: req.body.journal || null,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Sidekick verify failed' });
  }
});

/** POST /api/research/sidekick/retraction — Retraction Watch via Crossref */
router.post('/sidekick/retraction', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const id = String(req.body.id || req.body.doi || '').trim();
    if (!id) return res.status(400).json({ error: 'id (DOI/PMID) required' });
    const result = await ScholarSidekickService.checkRetraction(id);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Retraction check failed' });
  }
});

/** POST /api/research/sidekick/oa — Unpaywall OA status via Sidekick */
router.post('/sidekick/oa', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const id = String(req.body.id || req.body.doi || '').trim();
    if (!id) return res.status(400).json({ error: 'id (DOI/PMID) required' });
    const result = await ScholarSidekickService.checkOpenAccess(id);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'OA check failed' });
  }
});

/** POST /api/research/sidekick/enrich — verify + retraction + OA for a small batch */
router.post('/sidekick/enrich', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const papers = Array.isArray(req.body.papers) ? req.body.papers : [];
    const rows = papers.slice(0, 8).map((p: any) => ({
      title: String(p.title || ''),
      doi: p.doi || null,
      pmid: p.pmid || null,
      authors: Array.isArray(p.authors) ? p.authors.map(String) : undefined,
      year: p.year != null ? Number(p.year) : null,
      journal: p.journal || null,
      paperId: p.paperId || p.id || undefined,
    }));
    const enriched = await ScholarSidekickService.enrichCandidatesIntegrity(rows);
    res.json({ success: true, papers: enriched });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Sidekick enrich failed' });
  }
});

/** POST /api/research/sidekick/audit — batch fabrication + retraction on draft refs */
router.post('/sidekick/audit', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const claims = Array.isArray(req.body.claims) ? req.body.claims : [];
    const paperIds: string[] = Array.isArray(req.body.paperIds)
      ? req.body.paperIds.map(String)
      : [];

    const rows: Array<{
      title: string;
      doi?: string | null;
      pmid?: string | null;
      year?: number | null;
      journal?: string | null;
    }> = [];

    for (const c of claims) {
      if (c?.title) {
        rows.push({
          title: String(c.title),
          doi: c.doi || null,
          pmid: c.pmid || null,
          year: c.year != null ? Number(c.year) : null,
          journal: c.journal || null,
        });
      }
    }
    // Chunked audit supports long manuscripts (Sidekick cap is 25/call)
    for (const id of paperIds.slice(0, 100)) {
      const p = await PaperRepository.getById(id);
      if (p) {
        rows.push({
          title: p.title,
          doi: p.doi,
          pmid: p.pmid,
          year: p.publicationYear,
          journal: p.journalName,
        });
      }
    }

    const result = await ScholarSidekickService.auditClaims(rows);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Sidekick audit failed' });
  }
});

/** POST /api/research/sidekick/export — BibTeX / RIS / EndNote / NBIB / etc via Sidekick */
router.post('/sidekick/export', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const format = String(req.body.format || 'bibtex') as
      | 'bibtex'
      | 'ris'
      | 'csl-json'
      | 'nbib'
      | 'csv'
      | 'txt'
      | 'endnote-xml'
      | 'refworks'
      | 'rdf';
    const style = req.body.style ? String(req.body.style) : undefined;
    const paperIds: string[] = Array.isArray(req.body.paperIds)
      ? req.body.paperIds.map(String)
      : [];
    const papers: CanonicalPaper[] = [];
    for (const id of paperIds.slice(0, 100)) {
      const p = await PaperRepository.getById(id);
      if (p) papers.push(p);
    }
    if (!papers.length && Array.isArray(req.body.papers)) {
      for (const raw of req.body.papers.slice(0, 100)) {
        if (raw?.title) {
          papers.push({
            id: raw.id || raw.paperId,
            title: String(raw.title),
            authors: Array.isArray(raw.authors)
              ? raw.authors.map((a: any) =>
                  typeof a === 'string' ? { name: a } : { name: a.name || '' }
                )
              : [],
            publicationYear: raw.year ?? raw.publicationYear ?? null,
            journalName: raw.journal || raw.journalName || null,
            volume: raw.volume || null,
            issue: raw.issue || null,
            pages: raw.pages || null,
            doi: raw.doi || null,
            pmid: raw.pmid || null,
            sourceUrl: raw.url || null,
          });
        }
      }
    }
    if (!papers.length) return res.status(400).json({ error: 'No papers to export' });

    const result = await ScholarSidekickService.exportCitations(papers, format, style);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Sidekick export failed' });
  }
});

/** POST /api/research/cite/format — in-text marker for a paper */
router.post('/cite/format', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const paper = await PaperRepository.getById(String(req.body.paperId));
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const style = (req.body.style || 'apa') as CslStyleId;
    const index = Number(req.body.index || 0);
    res.json({
      success: true,
      token: `{{cite:${paper.id}}}`,
      inText: formatInTextCsl(paper, style, index),
      paper,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Cite format failed' });
  }
});

/** PDF upload for library item */
router.post('/library/:paperId/pdf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) return res.status(400).json({ error: 'file required' });

    const own = await pool.query(
      `SELECT id FROM user_library_items WHERE user_id = $1 AND paper_id = $2`,
      [req.user.id, req.params.paperId]
    );
    if (!own.rows?.[0]) return res.status(404).json({ error: 'Not in your library' });

    let text = '';
    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const require = createRequire(import.meta.url);
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(file.buffer);
      text = (parsed.text || '').slice(0, 500_000);
    } else {
      text = file.buffer.toString('utf8').slice(0, 500_000);
    }

    const safeId = req.params.paperId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const filename = `${req.user.id.slice(0, 8)}-${safeId}-${Date.now()}.pdf`;
    const dest = path.resolve(PDF_DIR, filename);
    if (!dest.startsWith(path.resolve(PDF_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    fs.writeFileSync(dest, file.buffer);
    const rel = path.posix.join('uploads', 'research-pdfs', filename);

    await pool.query(
      `UPDATE user_library_items SET user_pdf_path = $1, user_pdf_text = $2, updated_at = NOW()
       WHERE user_id = $3 AND paper_id = $4`,
      [rel, text || null, req.user.id, req.params.paperId]
    );

    const chunks = await PaperRagService.indexText({
      paperId: req.params.paperId,
      userId: req.user.id,
      text,
      sectionName: 'full_text',
    });

    await audit(req.user.id, 'pdf_uploaded', { paperId: req.params.paperId, chunks });
    res.json({ success: true, path: rel, extractedChars: text.length, chunks });
  } catch (e: any) {
    console.error('pdf upload error:', e);
    res.status(500).json({ error: e.message || 'PDF upload failed' });
  }
});

/** Index OA full text from Europe PMC when permitted */
router.post('/papers/:id/index-oa', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const paper = await PaperRepository.getById(req.params.id);
    if (!paper?.pmcid) {
      return res.status(400).json({ error: 'PMCID required for Europe PMC full text' });
    }
    const text = await europePmcProvider.fetchFullText(paper.pmcid);
    if (!text) {
      return res.status(404).json({ error: 'OA full text not available' });
    }
    const chunks = await PaperRagService.indexText({
      paperId: paper.id!,
      userId: req.user.id,
      text,
      sectionName: 'oa_full_text',
    });
    res.json({ success: true, chunks, chars: text.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'OA index failed' });
  }
});

/** Ask Paper */
router.post('/papers/ask', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const paperIds: string[] = Array.isArray(req.body.paperIds)
      ? req.body.paperIds
      : [req.body.paperId].filter(Boolean);
    const question = String(req.body.question || '').trim();
    if (!paperIds.length || !question) {
      return res.status(400).json({ error: 'paperIds and question required' });
    }
    const titles: Record<string, string> = {};
    for (const id of paperIds) {
      const p = await PaperRepository.getById(id);
      if (p) titles[id] = p.title;
    }
    const result = await PaperRagService.ask({
      userId: req.user.id,
      userRole: req.user.role,
      paperIds,
      question,
      paperTitles: titles,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Ask failed' });
  }
});

/** Compare papers */
router.post('/papers/compare', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const paperIds: string[] = req.body.paperIds || [];
    const question = String(
      req.body.question ||
        'Compare methodologies, sample sizes, main findings, and limitations. Identify agreements and disagreements.'
    );
    if (paperIds.length < 2) {
      return res.status(400).json({ error: 'Select at least two papers' });
    }
    const result = await PaperRagService.ask({
      userId: req.user.id,
      userRole: req.user.role,
      paperIds,
      question,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Compare failed' });
  }
});

/** Evidence Finder — library-first + accurate support (author/reviewer quality) */
router.post('/evidence/find', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const claim = String(req.body.claim || '').trim();
    if (claim.length < 10) return res.status(400).json({ error: 'claim is required' });
    const result = await CitationSupportService.suggestForClaim({
      userId: req.user.id,
      claim,
      excludePaperIds: Array.isArray(req.body.excludePaperIds)
        ? req.body.excludePaperIds.map(String)
        : [],
      webLimit: Number(req.body.limit || 10),
    });
    await audit(req.user.id, 'evidence_search', {
      claimLen: claim.length,
      found: result.found,
    });
    // Back-compat shape for LiteraturePicker + richer Citation AI fields
    res.json({
      success: true,
      ...result,
      results: result.candidates.map((c) => ({
        paper: {
          id: c.paperId,
          title: c.title,
          authors: c.authors.map((name) => ({ name })),
          publicationYear: c.year,
          journalName: c.journal,
          doi: c.doi,
          abstract: c.abstract,
        },
        label:
          c.verdict === 'supports'
            ? 'potentially_supporting'
            : c.verdict === 'partially_supports'
              ? 'relevant_background'
              : 'insufficient_evidence',
        relevanceScore: c.confidence === 'high' ? 90 : c.confidence === 'medium' ? 70 : 40,
        evidencePreview: c.excerpt,
        note: c.rationale,
        verdict: c.verdict,
        confidence: c.confidence,
        source: c.source,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Evidence find failed' });
  }
});

/** Citation Checker — verify cited papers against a claim */
router.post('/evidence/check', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const claim = String(req.body.claim || '').trim();
    const paperIds: string[] = req.body.paperIds || [];
    if (!claim || !paperIds.length) {
      return res.status(400).json({ error: 'claim and paperIds required' });
    }
    const result = await CitationSupportService.verifyCitations({
      userId: req.user.id,
      claim,
      paperIds,
    });
    res.json({
      success: true,
      ...result,
      assessments: result.assessments.map((a) => ({
        paperId: a.paperId,
        title: a.title,
        status:
          a.verdict === 'supports'
            ? 'support'
            : a.verdict === 'partially_supports'
              ? 'partially_support'
              : a.verdict === 'contradicts'
                ? 'contradict'
                : a.verdict === 'insufficient_text' || a.verdict === 'cannot_judge'
                  ? 'cannot_verify'
                  : 'not_clearly_support',
        explanation: `${a.rationale} ${a.reviewerNote}`,
        excerpt: a.excerpt,
        verdict: a.verdict,
        confidence: a.confidence,
        reviewerNote: a.reviewerNote,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Citation check failed' });
  }
});

export default router;
