/**
 * Pilot onboarding: one-click sample lab + linked evidence-chain records.
 * Protocol → Experiment → Notebook → Evidence pack.
 */

import { Router } from 'express';
import crypto from 'crypto';
import pool from '../../database/config.js';
import { findActiveLabMembership } from '../policies/labAccess.js';

const router = Router();

function toJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

async function resolveLabId(userId: string): Promise<{ labId: string; created: boolean }> {
  const existing = await pool.query(
    `SELECT lm.lab_id AS id
     FROM lab_members lm
     WHERE lm.user_id = $1 AND COALESCE(lm.is_active, 1) = 1
     ORDER BY CASE WHEN lm.role = 'principal_researcher' THEN 0 ELSE 1 END
     LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]?.id) {
    return { labId: String(existing.rows[0].id), created: false };
  }

  const labId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO labs (
      id, name, description, institution, department, principal_researcher_id, is_showcased
    ) VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [
      labId,
      'RILOS Demo Lab',
      'Sample lab created for the pilot evidence-chain walkthrough.',
      'RILOS Pilot Institute',
      'Molecular Biology',
      userId,
    ]
  );
  await pool.query(
    `INSERT INTO lab_members (id, lab_id, user_id, role, permissions, is_active)
     VALUES ($1, $2, $3, 'principal_researcher', '{}', 1)`,
    [crypto.randomUUID(), labId, userId]
  );
  return { labId, created: true };
}

async function experimentHasNameColumn(): Promise<boolean> {
  const result = await pool.query(
    `SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'name'`
  );
  return Number(result.rows[0]?.column_count ?? result.rows[0]?.COLUMN_COUNT ?? 0) > 0;
}

/** POST /api/onboarding/demo-chain */
router.post('/demo-chain', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { labId, created: labCreated } = await resolveLabId(userId);
    const membership = await findActiveLabMembership(pool, userId, labId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of the target lab' });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const protocolId = crypto.randomUUID();
    const experimentId = crypto.randomUUID();
    const notebookId = crypto.randomUUID();
    const evidenceId = crypto.randomUUID();

    const protocolTitle = `Demo protocol — Western blot (${stamp})`;
    const experimentTitle = `Demo experiment — compound X dose response (${stamp})`;
    const notebookTitle = `Demo notebook — run notes (${stamp})`;
    const evidenceTitle = `Demo evidence pack — densitometry (${stamp})`;

    await pool.query(
      `INSERT INTO protocols (
        id, title, description, category, difficulty_level, estimated_duration,
        materials, content, safety_notes, tags, lab_id,
        author_id, privacy_level, is_approved, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        protocolId,
        protocolTitle,
        'Sample method for the RILOS pilot chain.',
        'molecular_biology',
        'intermediate',
        120,
        toJson(['PVDF membrane', 'primary antibody', 'ECL reagent']),
        [
          '1. Lyse cells and quantify protein.',
          '2. Run SDS-PAGE and transfer to membrane.',
          '3. Block, incubate primary/secondary antibodies.',
          '4. Develop and quantify bands.',
        ].join('\n'),
        'Wear gloves; dispose of acrylamide waste per SOP.',
        toJson(['demo', 'rilos-pilot']),
        labId,
        userId,
        'lab',
        1,
        '1.0',
      ]
    );

    const includeName = await experimentHasNameColumn();
    const expColumns = [
      'id',
      'title',
      ...(includeName ? ['name'] : []),
      'description',
      'hypothesis',
      'objectives',
      'methodology',
      'expected_outcomes',
      'priority',
      'category',
      'lab_id',
      'researcher_id',
      'collaborators',
      'equipment',
      'materials',
      'reagents',
      'safety_requirements',
      'budget',
      'tags',
      'notes',
      'protocol_id',
      'status',
    ];
    const expValues = [
      experimentId,
      experimentTitle,
      ...(includeName ? [experimentTitle] : []),
      'Linked demo run created by Load sample chain.',
      'Dose increases band intensity vs vehicle.',
      toJson(['Quantify relative band density across doses']),
      'Follow linked demo protocol; n=3 technical replicates.',
      toJson(['Clear dose-response curve']),
      'medium',
      'molecular_biology',
      labId,
      userId,
      toJson([]),
      toJson([]),
      toJson([]),
      toJson([]),
      toJson([]),
      0,
      toJson(['demo', 'rilos-pilot', `protocol:${protocolId}`]),
      `Linked protocol: ${protocolId}`,
      protocolId,
      'planning',
    ];
    await pool.query(
      `INSERT INTO experiments (${expColumns.join(', ')})
       VALUES (${expValues.map((_, i) => `$${i + 1}`).join(', ')})`,
      expValues
    );

    await pool.query(
      `INSERT INTO lab_notebook_entries (
        id, title, content, entry_type, status, priority, objectives, methodology,
        results, conclusions, next_steps, lab_id, project_id, protocol_id, experiment_id,
        user_id, privacy_level, tags, estimated_duration, actual_duration, cost,
        equipment_used, materials_used, safety_notes, reference_list, collaborators
      ) VALUES (
        $1, $2, $3, 'experiment', 'in_progress', 'medium', $4, $5,
        $6, $7, $8, $9, NULL, $10, $11,
        $12, 'lab', $13, 0, 0, 0,
        '[]', '[]', '', '[]', '[]'
      )`,
      [
        notebookId,
        notebookTitle,
        'Observed bands at expected MW. Vehicle control clean. Ready for densitometry pack.',
        'Document dose response for compound X',
        'Executed demo protocol steps 1–4',
        'Strongest signal at mid dose; high dose plateau.',
        'Supports proceeding to manuscript figure draft.',
        'Create evidence pack and continue in Writing Studio.',
        labId,
        protocolId,
        experimentId,
        userId,
        toJson(['demo', 'rilos-pilot']),
      ]
    );

    await pool.query(
      `INSERT INTO research_data (
        id, title, type, category, status, summary, description, methodology, results, conclusions,
        tags, privacy_level, lab_id, protocol_id, experiment_id, notebook_entry_id, user_id, files, metadata
      ) VALUES (
        $1, $2, 'experiment', 'molecular_biology', 'draft', $3, $4, $5, $6, $7,
        $8, 'lab', $9, $10, $11, $12, $13, '[]', $14
      )`,
      [
        evidenceId,
        evidenceTitle,
        'Demo densitometry pack with full upstream provenance.',
        'Sample evidence folder for the pilot beachhead path.',
        'Western blot + ImageJ densitometry (demo).',
        'Relative density increased with dose; n=3.',
        'Suitable for a figure panel in Writing Studio.',
        toJson(['demo', 'rilos-pilot', 'provenance']),
        labId,
        protocolId,
        experimentId,
        notebookId,
        userId,
        JSON.stringify({ demoChain: true, createdAt: new Date().toISOString() }),
      ]
    );

    res.status(201).json({
      message: 'Demo evidence chain ready',
      labCreated,
      labId,
      chain: {
        protocolId,
        experimentId,
        notebookEntryId: notebookId,
        evidenceId,
        titles: {
          protocol: protocolTitle,
          experiment: experimentTitle,
          notebook: notebookTitle,
          evidence: evidenceTitle,
        },
      },
      next: {
        evidence: `/data-results?highlight=${encodeURIComponent(evidenceId)}`,
        writing: `/writing-studio?notice=evidence&evidenceId=${encodeURIComponent(evidenceId)}&title=${encodeURIComponent(evidenceTitle)}`,
        checklist: [
          'Open Evidence pack (3/3 provenance linked)',
          'Continue in Writing Studio from the pack',
          'Browse Trainings if you want the education path',
        ],
      },
    });
  } catch (error: any) {
    console.error('Demo chain error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create demo chain' });
  }
});

export default router;
