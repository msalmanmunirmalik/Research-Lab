import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import pool from "../../database/config.js";
import {
  assertActiveLabMember,
  assertCanWriteLifecycleRecord,
  canReadLifecycleRecord,
} from '../policies/labAccess.js';
// Auth is applied by server/index.ts when mounting /api/experiments (shared authenticateToken)

let experimentsIncludeName: boolean | null = null;

async function experimentInsertIncludesName(): Promise<boolean> {
  if (experimentsIncludeName !== null) return experimentsIncludeName;
  const result = await pool.query(
    `SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'name'`
  );
  const raw = result.rows[0]?.column_count ?? result.rows[0]?.COLUMN_COUNT ?? 0;
  experimentsIncludeName = Number(raw) > 0;
  return experimentsIncludeName;
}

type ExperimentProjectIdMode = 'missing' | 'optional' | 'required';
let cachedExperimentProjectIdMode: ExperimentProjectIdMode | null = null;

async function getExperimentProjectIdMode(): Promise<ExperimentProjectIdMode> {
  if (cachedExperimentProjectIdMode !== null) return cachedExperimentProjectIdMode;
  const result = await pool.query(
    `SELECT IS_NULLABLE AS is_nullable FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'project_id'
     LIMIT 1`
  );
  if (!result.rows[0]) {
    cachedExperimentProjectIdMode = 'missing';
    return cachedExperimentProjectIdMode;
  }
  const nullable =
    String(result.rows[0].is_nullable ?? result.rows[0].IS_NULLABLE ?? 'YES').toUpperCase() ===
    'YES';
  cachedExperimentProjectIdMode = nullable ? 'optional' : 'required';
  return cachedExperimentProjectIdMode;
}

async function ensureUserDefaultProjectId(userId: string): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM projects WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );
  const row = existing.rows[0];
  if (row?.id) return String(row.id);
  const projectId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO projects (id, name, description, owner_id) VALUES ($1, $2, $3, $4)`,
    [projectId, 'General experiments', 'Auto-created for the experiment tracker', userId]
  );
  return projectId;
}

const normalizeOptionalId = (value: unknown): string | null => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const toJsonText = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const router: Router = Router();

const mapExperimentRow = (row: any) => {
  if (!row) return row;
  const tags = (() => {
    if (Array.isArray(row.tags)) return row.tags;
    if (typeof row.tags === 'string') {
      try {
        const parsed = JSON.parse(row.tags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return row.tags ? [row.tags] : [];
      }
    }
    return [];
  })();
  const protocolFromTag = tags
    .map((t: unknown) => String(t))
    .find((t: string) => t.startsWith('protocol:'))
    ?.replace('protocol:', '');
  return {
    ...row,
    tags,
    protocolId: row.protocol_id || protocolFromTag || null,
    notebookEntryId: row.notebook_entry_id || null,
  };
};

const mapRunRow = (row: any) => {
  if (!row) return row;
  return {
    id: row.id,
    experimentId: row.experiment_id,
    userId: row.user_id,
    userName: row.user_name || null,
    recordedAt: row.recorded_at,
    title: row.title || null,
    modifications: row.modifications || '',
    observations: row.observations || '',
    outcomeSummary: row.outcome_summary || '',
    status: row.status || 'completed',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

async function loadExperimentForAccess(experimentId: string) {
  const result = await pool.query(
    `SELECT id, researcher_id, lab_id, collaborators, protocol_id, title, status
     FROM experiments WHERE id = $1`,
    [experimentId]
  );
  return result.rows[0] || null;
}

// Get all experiments for a user
export const getExperiments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { status, category, priority, search } = req.query;

    let query = `
      SELECT 
        e.*,
        u.username as researcher_name,
        l.name as lab_name,
        0 as progress_percentage,
        0 as total_milestones,
        0 as completed_milestones,
        0 as overdue_milestones
      FROM experiments e
      LEFT JOIN users u ON e.researcher_id = u.id
      LEFT JOIN labs l ON e.lab_id = l.id
      WHERE e.researcher_id = $1
    `;

    const params: any[] = [userId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    if (category && category !== 'all') {
      paramCount++;
      query += ` AND e.category = $${paramCount}`;
      params.push(category);
    }

    if (priority && priority !== 'all') {
      paramCount++;
      query += ` AND e.priority = $${paramCount}`;
      params.push(priority);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        LOWER(COALESCE(e.title, e.name, '')) LIKE $${paramCount}
        OR LOWER(COALESCE(e.description, '')) LIKE $${paramCount}
        OR LOWER(COALESCE(e.tags, '')) LIKE $${paramCount}
      )`;
      params.push(`%${String(search).toLowerCase()}%`);
    }

    query += ` ORDER BY e.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows.map(mapExperimentRow));
  } catch (error) {
    console.error('Error fetching experiments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get a single experiment by ID
export const getExperiment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const experimentResult = await pool.query(
      `SELECT e.*, u.username as researcher_name, l.name as lab_name, 0 as progress_percentage
       FROM experiments e
       LEFT JOIN users u ON e.researcher_id = u.id
       LEFT JOIN labs l ON e.lab_id = l.id
       WHERE e.id = $1`,
      [id]
    );

    if (experimentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const experiment = experimentResult.rows[0];
    const experimentRead = canReadLifecycleRecord({
      resource: 'experiment',
      userId,
      ownerId: experiment.researcher_id,
      labId: experiment.lab_id,
      activeMember: false,
      collaborators: experiment.collaborators,
    });
    if (!experimentRead.allowed) {
      return res.status(experimentRead.status).json({ error: 'Experiment not found' });
    }

    const safeQuery = async (sql: string, params: unknown[]) => {
      try {
        return await pool.query(sql, params);
      } catch (err: any) {
        // Missing optional child tables should not 500 the detail view
        if (err?.code === 'ER_NO_SUCH_TABLE') {
          return { rows: [] };
        }
        throw err;
      }
    };

    const milestonesResult = await safeQuery(
      `SELECT * FROM experiment_milestones WHERE experiment_id = $1 ORDER BY due_date ASC`,
      [id]
    );
    const risksResult = await safeQuery(
      `SELECT * FROM experiment_risks WHERE experiment_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    const progressResult = await safeQuery(
      `SELECT pl.*, u.username as user_name
       FROM experiment_progress_log pl
       LEFT JOIN users u ON pl.user_id = u.id
       WHERE pl.experiment_id = $1
       ORDER BY pl.created_at DESC`,
      [id]
    );
    const commentsResult = await safeQuery(
      `SELECT c.*, u.username as user_name
       FROM experiment_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.experiment_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );
    const runsResult = await safeQuery(
      `SELECT r.*, u.username as user_name
       FROM experiment_runs r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.experiment_id = $1
       ORDER BY r.recorded_at DESC, r.created_at DESC`,
      [id]
    );

    res.json({
      ...mapExperimentRow(experiment),
      milestones: milestonesResult.rows,
      risks: risksResult.rows,
      progress_log: progressResult.rows,
      comments: commentsResult.rows,
      runs: (runsResult.rows || []).map(mapRunRow),
    });
  } catch (error) {
    console.error('Error fetching experiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new experiment
export const createExperiment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      title,
      description,
      hypothesis,
      objectives,
      methodology,
      expectedOutcomes,
      priority,
      category,
      estimatedDuration,
      dueDate,
      labId,
      collaborators,
      equipment,
      materials,
      reagents,
      safetyRequirements,
      budget,
      tags,
      notes,
      templateId,
      protocolId,
      milestones,
      risks
    } = req.body;

    const normalizedLabId = normalizeOptionalId(labId);
    if (normalizedLabId) {
      const membership = await assertActiveLabMember(pool, userId, normalizedLabId);
      if (!membership.ok) {
        return res.status(membership.status).json({ error: membership.error });
      }
    }

    const projectMode = await getExperimentProjectIdMode();
    const requestedProjectId = normalizeOptionalId(
      req.body.projectId ?? req.body.project_id
    );
    let projectIdForInsert: string | null = requestedProjectId;
    if (projectMode === 'required') {
      projectIdForInsert = projectIdForInsert || (await ensureUserDefaultProjectId(userId));
    }

    const client = await pool.connect();
    const experimentId = crypto.randomUUID();
    const linkedNotes = protocolId
      ? [`Linked protocol: ${protocolId}`, notes].filter(Boolean).join('\n')
      : notes;
    const linkedTags = Array.isArray(tags)
      ? (protocolId && !tags.some((t: string) => String(t).startsWith('protocol:'))
          ? [...tags, `protocol:${protocolId}`]
          : tags)
      : (protocolId ? [`protocol:${protocolId}`] : []);

    try {
      await client.query('BEGIN');

      // MySQL: explicit id, no RETURNING; store arrays as JSON text
      const includeName = await experimentInsertIncludesName();
      const insertColumns = [
        'id',
        ...(projectMode !== 'missing' &&
        (projectMode === 'required' || projectIdForInsert)
          ? ['project_id']
          : []),
        'title',
        ...(includeName ? ['name'] : []),
        'description', 'hypothesis', 'objectives', 'methodology', 'expected_outcomes',
        'priority', 'category', 'estimated_duration', 'due_date', 'lab_id', 'researcher_id',
        'collaborators', 'equipment', 'materials', 'reagents', 'safety_requirements',
        'budget', 'tags', 'notes', 'template_id', 'protocol_id', 'status',
      ];
      const insertValues = [
        experimentId,
        ...(projectMode !== 'missing' &&
        (projectMode === 'required' || projectIdForInsert)
          ? [projectIdForInsert]
          : []),
        title,
        ...(includeName ? [title] : []),
        description,
        hypothesis,
        toJsonText(objectives || []),
        methodology,
        toJsonText(expectedOutcomes || []),
        priority || 'medium',
        category || 'other',
        estimatedDuration,
        dueDate,
        normalizedLabId,
        userId,
        toJsonText(collaborators || []),
        toJsonText(equipment || []),
        toJsonText(materials || []),
        toJsonText(reagents || []),
        toJsonText(safetyRequirements || []),
        budget || 0,
        toJsonText(linkedTags || []),
        linkedNotes,
        templateId || null,
        protocolId || null,
        'planning',
      ];
      const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(
        `INSERT INTO experiments (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        insertValues
      );

      if (milestones && milestones.length > 0) {
        for (const milestone of milestones) {
          await client.query(
            `INSERT INTO experiment_milestones (
              id, experiment_id, title, description, due_date
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              crypto.randomUUID(),
              experimentId,
              milestone.title,
              milestone.description,
              milestone.dueDate
            ]
          );
        }
      }

      // Risks table is optional; skip quietly if missing
      if (risks && risks.length > 0) {
        for (const risk of risks) {
          try {
            await client.query(
              `INSERT INTO experiment_risks (
                id, experiment_id, title, description, probability, impact, mitigation
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                crypto.randomUUID(),
                experimentId,
                risk.title,
                risk.description,
                risk.probability,
                risk.impact,
                risk.mitigation
              ]
            );
          } catch (riskError) {
            console.warn('Skipping experiment risk insert:', riskError);
          }
        }
      }

      await client.query('COMMIT');
      const experimentResult = await pool.query('SELECT * FROM experiments WHERE id = $1', [experimentId]);
      res.status(201).json(mapExperimentRow(experimentResult.rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating experiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update an experiment
export const updateExperiment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const updateData = req.body;

    const checkResult = await pool.query(
      `SELECT researcher_id, lab_id FROM experiments WHERE id = $1`,
      [id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const existing = checkResult.rows[0];
    const canEdit = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: existing.researcher_id,
      labId: existing.lab_id,
    });
    if (!canEdit) {
      // Match experiment read posture: do not confirm existence to non-writers.
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    // Build dynamic update query
    const allowedFields = [
      'title', 'description', 'hypothesis', 'objectives', 'methodology', 'expected_outcomes',
      'status', 'priority', 'category', 'estimated_duration', 'actual_duration',
      'start_date', 'end_date', 'due_date', 'collaborators', 'equipment', 'materials',
      'reagents', 'safety_requirements', 'budget', 'actual_cost', 'tags', 'notes',
      'results', 'conclusions', 'next_steps', 'attachments', 'protocol_id', 'notebook_entry_id'
    ];

    const camelToSnake: Record<string, string> = {
      expectedOutcomes: 'expected_outcomes',
      estimatedDuration: 'estimated_duration',
      actualDuration: 'actual_duration',
      startDate: 'start_date',
      endDate: 'end_date',
      dueDate: 'due_date',
      safetyRequirements: 'safety_requirements',
      actualCost: 'actual_cost',
      nextSteps: 'next_steps',
      protocolId: 'protocol_id',
      notebookEntryId: 'notebook_entry_id',
    };

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      const column = camelToSnake[key] || key;
      if (allowedFields.includes(column) && value !== undefined) {
        updateFields.push(`${column} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    const query = `
      UPDATE experiments 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
    `;

    await pool.query(query, values);
    const result = await pool.query(`SELECT * FROM experiments WHERE id = $1`, [id]);
    res.json(mapExperimentRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating experiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete an experiment
export const deleteExperiment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const checkResult = await pool.query(
      'SELECT researcher_id, lab_id FROM experiments WHERE id = $1',
      [id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const existing = checkResult.rows[0];
    const canDelete = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: existing.researcher_id,
      labId: existing.lab_id,
    });
    if (!canDelete) {
      return res.status(403).json({ error: 'Insufficient permissions to delete this experiment' });
    }

    const deleteQuery = 'DELETE FROM experiments WHERE id = $1';
    await pool.query(deleteQuery, [id]);
    
    res.json({ message: 'Experiment deleted successfully' });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get experiment templates
export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;

    let query = `
      SELECT * FROM experiment_templates 
      WHERE is_public = true
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (category && category !== 'all') {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (search) {
      paramCount++;
      query += ` AND (LOWER(name) LIKE $${paramCount} OR LOWER(description) LIKE $${paramCount})`;
      params.push(`%${String(search).toLowerCase()}%`);
    }

    query += ` ORDER BY usage_count DESC, created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create experiment template
export const createTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      name,
      category,
      description,
      methodology,
      estimatedDuration,
      equipment,
      materials,
      reagents,
      safetyRequirements,
      isPublic
    } = req.body;

    const query = `
      INSERT INTO experiment_templates (
        name, category, description, methodology, estimated_duration,
        equipment, materials, reagents, safety_requirements, created_by, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      name, category, description, methodology, estimatedDuration,
      equipment || [], materials || [], reagents || [], safetyRequirements || [],
      userId, isPublic || false
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add milestone to experiment
export const addMilestone = async (req: Request, res: Response) => {
  try {
    const { experimentId } = req.params;
    const userId = (req as any).user.id;
    const { title, description, dueDate } = req.body;

    // Check if user has permission
    const checkQuery = `
      SELECT researcher_id, collaborators FROM experiments 
      WHERE id = $1 AND (researcher_id = $2 OR $2 = ANY(collaborators))
    `;
    const checkResult = await pool.query(checkQuery, [experimentId, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    const query = `
      INSERT INTO experiment_milestones (experiment_id, title, description, due_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [experimentId, title, description, dueDate]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update milestone status
export const updateMilestoneStatus = async (req: Request, res: Response) => {
  try {
    const { milestoneId } = req.params;
    const userId = (req as any).user.id;
    const { status, notes } = req.body;

    // Check if user has permission
    const checkQuery = `
      SELECT e.researcher_id, e.collaborators 
      FROM experiment_milestones em
      JOIN experiments e ON em.experiment_id = e.id
      WHERE em.id = $1 AND (e.researcher_id = $2 OR $2 = ANY(e.collaborators))
    `;
    const checkResult = await pool.query(checkQuery, [milestoneId, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Milestone not found or no permission' });
    }

    const updateFields = ['status'];
    const values = [status];
    let paramCount = 1;

    if (notes !== undefined) {
      updateFields.push('notes');
      values.push(notes);
      paramCount++;
    }

    if (status === 'completed') {
      updateFields.push('completed_at');
      values.push(new Date());
      paramCount++;
    }

    values.push(milestoneId);
    const query = `
      UPDATE experiment_milestones 
      SET ${updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// List bench runs for an experiment
export const listExperimentRuns = async (req: Request, res: Response) => {
  try {
    const { experimentId } = req.params;
    const userId = (req as any).user.id;
    const experiment = await loadExperimentForAccess(experimentId);
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const canRead = canReadLifecycleRecord({
      resource: 'experiment',
      userId,
      ownerId: experiment.researcher_id,
      labId: experiment.lab_id,
      activeMember: false,
      collaborators: experiment.collaborators,
    });
    if (!canRead.allowed) {
      return res.status(canRead.status).json({ error: 'Experiment not found' });
    }

    try {
      const result = await pool.query(
        `SELECT r.*, u.username as user_name
         FROM experiment_runs r
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.experiment_id = $1
         ORDER BY r.recorded_at DESC, r.created_at DESC`,
        [experimentId]
      );
      return res.json({ runs: result.rows.map(mapRunRow) });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ runs: [] });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error listing experiment runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a bench run
export const createExperimentRun = async (req: Request, res: Response) => {
  try {
    const { experimentId } = req.params;
    const userId = (req as any).user.id;
    const {
      recordedAt,
      title,
      modifications,
      observations,
      outcomeSummary,
      status = 'completed',
    } = req.body || {};

    const experiment = await loadExperimentForAccess(experimentId);
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const canWrite = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: experiment.researcher_id,
      labId: experiment.lab_id,
    });
    if (!canWrite) {
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    const id = crypto.randomUUID();
    const when = recordedAt ? new Date(recordedAt) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Invalid recordedAt' });
    }

    const allowedStatus = ['planned', 'completed', 'failed', 'needs_repeat'];
    const runStatus = allowedStatus.includes(String(status)) ? String(status) : 'completed';

    await pool.query(
      `INSERT INTO experiment_runs (
        id, experiment_id, user_id, recorded_at, title, modifications, observations, outcome_summary, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        experimentId,
        userId,
        when,
        title || null,
        modifications || '',
        observations || '',
        outcomeSummary || '',
        runStatus,
      ]
    );

    // Promote experiment to running if still planning
    if (experiment.status === 'planning' || experiment.status === 'ready') {
      await pool.query(
        `UPDATE experiments SET status = 'running', start_date = COALESCE(start_date, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [experimentId]
      );
    }

    const created = await pool.query(
      `SELECT r.*, u.username as user_name
       FROM experiment_runs r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );
    res.status(201).json(mapRunRow(created.rows[0]));
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'experiment_runs table missing — run database migrations (pnpm db:migrate)',
      });
    }
    console.error('Error creating experiment run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a bench run
export const updateExperimentRun = async (req: Request, res: Response) => {
  try {
    const { experimentId, runId } = req.params;
    const userId = (req as any).user.id;
    const experiment = await loadExperimentForAccess(experimentId);
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const canWrite = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: experiment.researcher_id,
      labId: experiment.lab_id,
    });
    if (!canWrite) {
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    const existing = await pool.query(
      `SELECT * FROM experiment_runs WHERE id = $1 AND experiment_id = $2`,
      [runId, experimentId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const body = req.body || {};
    const fields: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    const set = (col: string, val: unknown) => {
      fields.push(`${col} = $${n}`);
      values.push(val);
      n += 1;
    };

    if (body.recordedAt !== undefined) {
      const when = new Date(body.recordedAt);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ error: 'Invalid recordedAt' });
      }
      set('recorded_at', when);
    }
    if (body.title !== undefined) set('title', body.title || null);
    if (body.modifications !== undefined) set('modifications', body.modifications || '');
    if (body.observations !== undefined) set('observations', body.observations || '');
    if (body.outcomeSummary !== undefined) set('outcome_summary', body.outcomeSummary || '');
    if (body.status !== undefined) {
      const allowedStatus = ['planned', 'completed', 'failed', 'needs_repeat'];
      if (!allowedStatus.includes(String(body.status))) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      set('status', body.status);
    }

    if (fields.length === 0) {
      return res.json(mapRunRow(existing.rows[0]));
    }

    values.push(runId);
    await pool.query(
      `UPDATE experiment_runs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    );
    const updated = await pool.query(
      `SELECT r.*, u.username as user_name
       FROM experiment_runs r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [runId]
    );
    res.json(mapRunRow(updated.rows[0]));
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: 'experiment_runs table missing — run database migrations' });
    }
    console.error('Error updating experiment run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a bench run
export const deleteExperimentRun = async (req: Request, res: Response) => {
  try {
    const { experimentId, runId } = req.params;
    const userId = (req as any).user.id;
    const experiment = await loadExperimentForAccess(experimentId);
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    const canWrite = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: experiment.researcher_id,
      labId: experiment.lab_id,
    });
    if (!canWrite) {
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    const result = await pool.query(
      `DELETE FROM experiment_runs WHERE id = $1 AND experiment_id = $2`,
      [runId, experimentId]
    );
    const affected = (result as any).rowCount ?? (result as any).affectedRows ?? 0;
    if (!affected) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: 'experiment_runs table missing — run database migrations' });
    }
    console.error('Error deleting experiment run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add progress log entry
export const addProgressLog = async (req: Request, res: Response) => {
  try {
    const { experimentId } = req.params;
    const userId = (req as any).user.id;
    const { status, notes, durationLogged, costLogged, attachments } = req.body;

    // Check if user has permission
    const checkQuery = `
      SELECT researcher_id, collaborators FROM experiments 
      WHERE id = $1 AND (researcher_id = $2 OR $2 = ANY(collaborators))
    `;
    const checkResult = await pool.query(checkQuery, [experimentId, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found or no permission' });
    }

    const query = `
      INSERT INTO experiment_progress_log (
        experiment_id, user_id, status, notes, duration_logged, cost_logged, attachments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      experimentId, userId, status, notes, durationLogged || 0, costLogged || 0, attachments || []
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding progress log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get experiment analytics
export const getExperimentAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { timeframe = '30' } = req.query;

    const query = `
      SELECT 
        COUNT(*) as total_experiments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_experiments,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_experiments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_experiments,
        AVG(actual_duration) as avg_duration,
        AVG(actual_cost) as avg_cost,
        COUNT(CASE WHEN due_date < CURRENT_TIMESTAMP AND status != 'completed' THEN 1 END) as overdue_experiments
      FROM experiments 
      WHERE researcher_id = $1 
      AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $2 DAY)
    `;

    const result = await pool.query(query, [userId, Number(timeframe) || 30]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Define routes
router.get('/', getExperiments);
router.get('/analytics', getExperimentAnalytics);
router.get('/templates', getTemplates);
router.get('/:id', getExperiment);
router.get('/:experimentId/runs', listExperimentRuns);
router.post('/', createExperiment);
router.post('/templates', createTemplate);
router.post('/:experimentId/milestones', addMilestone);
router.post('/:experimentId/progress', addProgressLog);
router.post('/:experimentId/runs', createExperimentRun);
router.put('/:id', updateExperiment);
router.put('/milestones/:milestoneId', updateMilestoneStatus);
router.put('/:experimentId/runs/:runId', updateExperimentRun);
router.delete('/:id', deleteExperiment);
router.delete('/:experimentId/runs/:runId', deleteExperimentRun);

export default router;
