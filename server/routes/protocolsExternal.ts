/**
 * Public protocols.io search, save, and adapt.
 * Mounted at /api/protocols/external so it stays inside the protocol API.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../../database/config.js';
import {
  attributionText,
  ProtocolsIoClient,
  type ExternalProtocol,
} from '../services/protocols/protocolsIo.js';

const router = Router();

function rowToProtocol(row: any): ExternalProtocol & { id: string; saved: true } {
  const parse = (value: unknown, fallback: unknown) => {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  return {
    id: String(row.id),
    saved: true,
    source: 'protocols.io',
    externalId: String(row.external_id),
    title: String(row.title),
    description: row.description || null,
    authors: parse(row.authors, []),
    doi: row.doi || null,
    sourceUrl: row.source_url || null,
    version: row.version || null,
    publishedOn: row.published_on ? String(row.published_on) : null,
    license: 'CC-BY',
    categories: parse(row.categories, []),
    materials: parse(row.materials, []),
    equipment: parse(row.equipment, []),
    steps: parse(row.steps, []),
    timing: row.timing || null,
    safetyNotes: parse(row.safety_notes, []),
    retrievedAt: row.retrieved_at ? new Date(row.retrieved_at).toISOString() : new Date().toISOString(),
  };
}

async function loadProtocol(externalId: string): Promise<ExternalProtocol | null> {
  const detail = await ProtocolsIoClient.detail(externalId);
  return detail.protocol;
}

router.get('/search', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q is required' });
    const page = Math.max(1, Number(req.query.page || 1));
    const found = await ProtocolsIoClient.search(q, page, 10);
    let savedIds = new Set<string>();
    try {
      const saved = await pool.query(
        `SELECT external_id FROM external_protocols WHERE user_id = $1 AND provider = 'protocols.io'`,
        [req.user.id]
      );
      savedIds = new Set((saved.rows || []).map((row: any) => String(row.external_id)));
    } catch {
      savedIds = new Set();
    }
    res.json({
      success: true,
      available: found.available,
      notice: found.missingToken
        ? 'protocols.io is not configured. DRM protocols are unchanged.'
        : found.available
          ? null
          : 'protocols.io did not return results. DRM protocols are unchanged.',
      page: found.page,
      total: found.total,
      protocols: found.protocols.map((protocol) => ({
        ...protocol,
        saved: savedIds.has(protocol.externalId),
      })),
    });
  } catch (error) {
    console.error('protocols.io search error:', error instanceof Error ? error.message : 'failed');
    res.json({
      success: true,
      available: false,
      notice: 'protocols.io did not return results. DRM protocols are unchanged.',
      protocols: [],
      page: 1,
      total: 0,
    });
  }
});

router.get('/:externalId', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const detail = await ProtocolsIoClient.detail(req.params.externalId);
    if (!detail.protocol) {
      return res.status(detail.missingToken ? 200 : 404).json({
        success: false,
        available: false,
        notice: detail.missingToken
          ? 'protocols.io is not configured. DRM protocols are unchanged.'
          : 'That public protocol could not be loaded.',
        protocol: null,
      });
    }
    res.json({ success: true, available: true, protocol: detail.protocol });
  } catch (error) {
    console.error('protocols.io detail error:', error instanceof Error ? error.message : 'failed');
    res.json({
      success: true,
      available: false,
      notice: 'That public protocol could not be loaded.',
      protocol: null,
    });
  }
});

router.post('/:externalId/save', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const protocol = await loadProtocol(req.params.externalId);
    if (!protocol) {
      return res.status(404).json({ error: 'That public protocol could not be loaded.' });
    }
    const existing = await pool.query(
      `SELECT * FROM external_protocols WHERE user_id = $1 AND provider = 'protocols.io' AND external_id = $2`,
      [req.user.id, protocol.externalId]
    );
    if (existing.rows.length) {
      return res.json({ success: true, protocol: rowToProtocol(existing.rows[0]), created: false });
    }
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO external_protocols (
        id, user_id, provider, external_id, title, description, authors, doi, source_url,
        version, published_on, license, categories, materials, equipment, steps, timing,
        safety_notes, retrieved_at
      ) VALUES ($1,$2,'protocols.io',$3,$4,$5,$6,$7,$8,$9,$10,'CC-BY',$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        req.user.id,
        protocol.externalId,
        protocol.title,
        protocol.description,
        JSON.stringify(protocol.authors),
        protocol.doi,
        protocol.sourceUrl,
        protocol.version,
        protocol.publishedOn ? protocol.publishedOn.slice(0, 19).replace('T', ' ') : null,
        JSON.stringify(protocol.categories),
        JSON.stringify(protocol.materials),
        JSON.stringify(protocol.equipment),
        JSON.stringify(protocol.steps),
        protocol.timing,
        JSON.stringify(protocol.safetyNotes),
        protocol.retrievedAt.slice(0, 19).replace('T', ' '),
      ]
    );
    const stored = await pool.query(`SELECT * FROM external_protocols WHERE id = $1`, [id]);
    res.status(201).json({ success: true, protocol: rowToProtocol(stored.rows[0]), created: true });
  } catch (error) {
    console.error('protocols.io save error:', error instanceof Error ? error.message : 'failed');
    res.status(500).json({ error: 'Could not save this protocol. Apply the protocols.io migration if this database is new.' });
  }
});

router.post('/:externalId/adapt', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const protocol = await loadProtocol(req.params.externalId);
    if (!protocol) {
      return res.status(404).json({ error: 'That public protocol could not be loaded.' });
    }
    const existing = await pool.query(
      `SELECT id FROM protocols
       WHERE author_id = $1 AND adapted_from_external_id = $2 AND is_approved = true
       LIMIT 1`,
      [req.user.id, protocol.externalId]
    );
    if (existing.rows.length) {
      return res.json({ success: true, protocolId: existing.rows[0].id, created: false });
    }
    const id = crypto.randomUUID();
    const attribution = attributionText(protocol);
    await pool.query(
      `INSERT INTO protocols (
        id, title, description, category, difficulty_level, estimated_duration,
        materials, content, safety_notes, tags, lab_id, author_id, privacy_level,
        is_approved, version, source_name, source_url, source_doi, source_license,
        source_attribution, adapted_from_external_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,'private',true,'1.0',
        'protocols.io',$12,$13,'CC-BY',$14,$15
      )`,
      [
        id,
        protocol.title.slice(0, 255),
        attribution,
        'external',
        null,
        null,
        JSON.stringify(protocol.materials),
        JSON.stringify(protocol.steps),
        protocol.safetyNotes.join('\n'),
        JSON.stringify(['protocols.io', 'adapted', 'CC-BY']),
        req.user.id,
        protocol.sourceUrl,
        protocol.doi,
        attribution,
        protocol.externalId,
      ]
    );
    res.status(201).json({ success: true, protocolId: id, created: true });
  } catch (error) {
    console.error('protocols.io adapt error:', error instanceof Error ? error.message : 'failed');
    res.status(500).json({ error: 'Could not adapt this protocol.' });
  }
});

export default router;
