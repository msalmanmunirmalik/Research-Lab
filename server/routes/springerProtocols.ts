/**
 * SpringerProtocols metadata inside the protocol library.
 * Mounted at /api/protocols/external/springer.
 */

import { Router, Request, Response } from 'express';
import pool from '../../database/config.js';
import { PaperRepository } from '../services/scholarly/PaperRepository.js';
import { ProtocolsIoClient } from '../services/protocols/protocolsIo.js';
import {
  SpringerProtocolsClient,
  toCanonicalPaper,
} from '../services/protocols/springerProtocols.js';

const router = Router();

function noticeFor(result: { missingKey: boolean; limited: boolean; available: boolean }): string | null {
  if (result.missingKey) return 'SpringerProtocols is not configured. DRM and protocols.io results are unchanged.';
  if (result.limited) return 'SpringerProtocols request limit reached. Cached metadata is unchanged.';
  if (!result.available) return 'SpringerProtocols did not return metadata. DRM and protocols.io results are unchanged.';
  return null;
}

router.get('/search', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q is required' });
    const page = Math.max(1, Number(req.query.page || 1));
    const found = await SpringerProtocolsClient.search(q, page);
    res.json({
      success: true,
      available: found.available,
      notice: noticeFor(found),
      page: found.page,
      total: found.total,
      protocols: found.protocols,
    });
  } catch (error) {
    console.error('springer search error:', error instanceof Error ? error.message : 'failed');
    res.json({
      success: true,
      available: false,
      notice: 'SpringerProtocols did not return metadata. DRM and protocols.io results are unchanged.',
      protocols: [],
      page: 1,
      total: 0,
    });
  }
});

router.get('/record', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const doi = String(req.query.doi || '').trim();
    if (!doi) return res.status(400).json({ error: 'doi is required' });
    const found = await SpringerProtocolsClient.record(doi);
    if (!found.protocol) {
      return res.status(found.missingKey ? 200 : 404).json({
        success: false,
        notice: found.missingKey
          ? 'SpringerProtocols is not configured. DRM and protocols.io results are unchanged.'
          : 'That SpringerProtocols record could not be loaded.',
        protocol: null,
      });
    }
    res.json({ success: true, protocol: found.protocol });
  } catch (error) {
    console.error('springer record error:', error instanceof Error ? error.message : 'failed');
    res.json({
      success: true,
      notice: 'That SpringerProtocols record could not be loaded.',
      protocol: null,
    });
  }
});

router.post('/save', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const doi = String(req.body?.doi || '').trim();
    if (!doi) return res.status(400).json({ error: 'doi is required' });
    const found = await SpringerProtocolsClient.record(doi);
    if (!found.protocol) {
      return res.status(404).json({ error: 'That SpringerProtocols record could not be loaded.' });
    }
    const paper = await PaperRepository.upsert(toCanonicalPaper(found.protocol));
    await PaperRepository.addToLibrary(req.user.id, paper.id, {
      notes: 'SpringerProtocols metadata only. The full protocol is not stored in DRM.',
      tags: ['springer_protocols', 'metadata-only'],
    });
    res.status(201).json({
      success: true,
      paperId: paper.id,
      fullTextAvailable: false,
    });
  } catch (error) {
    console.error('springer save error:', error instanceof Error ? error.message : 'failed');
    res.status(500).json({ error: 'Could not save this metadata.' });
  }
});

router.get('/alternatives', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q is required' });
    const like = `%${q.toLowerCase().replace(/[%_\\]/g, ' ').slice(0, 80)}%`;
    let drm: Array<{ id: string; title: string }> = [];
    try {
      const rows = await pool.query(
        `SELECT p.id, p.title
         FROM protocols p
         WHERE p.is_approved = true
           AND (LOWER(p.title) LIKE $1 OR LOWER(COALESCE(p.description, '')) LIKE $1)
           AND (
             p.author_id = $2
             OR p.privacy_level IN ('public', 'global')
             OR (
               p.lab_id IS NOT NULL
               AND COALESCE(p.privacy_level, 'lab') IN ('lab', 'shared', 'institution')
               AND p.lab_id IN (
                 SELECT lab_id FROM lab_members
                 WHERE user_id = $2 AND COALESCE(is_active, 1) = 1
               )
             )
           )
         ORDER BY p.created_at DESC
         LIMIT 5`,
        [like, req.user.id]
      );
      drm = (rows.rows || []).map((row: any) => ({ id: String(row.id), title: String(row.title) }));
    } catch {
      drm = [];
    }
    const open = await ProtocolsIoClient.search(q, 1, 5);
    res.json({
      success: true,
      drm,
      protocolsIo: open.protocols.map((protocol) => ({
        externalId: protocol.externalId,
        title: protocol.title,
        sourceUrl: protocol.sourceUrl,
        doi: protocol.doi,
      })),
    });
  } catch (error) {
    console.error('springer alternatives error:', error instanceof Error ? error.message : 'failed');
    res.json({ success: true, drm: [], protocolsIo: [] });
  }
});

export default router;
