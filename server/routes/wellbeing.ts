/**
 * Researcher wellbeing — private, voluntary check-ins.
 * Not clinical. Not shared with PIs or lab admins via these endpoints.
 */

import { Router } from 'express';
import crypto from 'crypto';
import pool from '../../database/config.js';

const router = Router();

function clampScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 5) return null;
  return i;
}

/** GET /api/wellbeing/me — own check-ins only */
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      `SELECT id, workload, energy, note, created_at
       FROM researcher_wellbeing_checkins
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );

    res.json({
      checkins: result.rows,
      privacy: {
        voluntary: true,
        clinical: false,
        sharedWithLab: false,
        note: 'Only you can see these check-ins.',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({
        checkins: [],
        privacy: {
          voluntary: true,
          clinical: false,
          sharedWithLab: false,
          note: 'Only you can see these check-ins.',
        },
        migrateHint: 'Run pnpm run db:migrate',
      });
    }
    console.error('wellbeing list:', error);
    res.status(500).json({ error: 'Failed to load wellbeing check-ins' });
  }
});

/** POST /api/wellbeing/checkins */
router.post('/checkins', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const workload = clampScore(req.body?.workload);
    const energy = clampScore(req.body?.energy);
    if (workload == null || energy == null) {
      return res.status(400).json({ error: 'workload and energy must be integers from 1 to 5' });
    }

    const note =
      typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 2000) : null;
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO researcher_wellbeing_checkins (id, user_id, workload, energy, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, workload, energy, note || null]
    );

    const created = await pool.query(
      `SELECT id, workload, energy, note, created_at
       FROM researcher_wellbeing_checkins WHERE id = $1`,
      [id]
    );

    res.status(201).json({ checkin: created.rows[0], sharedWithLab: false });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Wellbeing table missing. Run pnpm run db:migrate.',
      });
    }
    console.error('wellbeing create:', error);
    res.status(500).json({ error: 'Failed to save check-in' });
  }
});

/** DELETE /api/wellbeing/checkins/:id — own only */
router.delete('/checkins/:id', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      `DELETE FROM researcher_wellbeing_checkins WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Check-in not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('wellbeing delete:', error);
    res.status(500).json({ error: 'Failed to delete check-in' });
  }
});

export default router;
