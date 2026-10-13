/**
 * Negative Results Database API Routes
 * Revolutionary feature: Document and share failed experiments
 * Give researchers credit for transparency and save community time/money
 */

import { Router } from 'express';
import pool from "../../database/config.js";
import jwt from 'jsonwebtoken';
import autoIndexing from '../utils/autoIndexing.js';

const router: Router = Router();

const ENABLE_DEMO_AUTH = process.env.ENABLE_DEMO_AUTH === 'true';
const DEMO_AUTH_TOKEN = process.env.DEMO_AUTH_TOKEN || 'demo-token-123';

// Authentication middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    
    if (ENABLE_DEMO_AUTH && token === DEMO_AUTH_TOKEN) {
      req.user = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        email: 'demo@researchlab.com',
        username: 'student',
        first_name: 'Fatima',
        last_name: 'Martinez',
        role: 'student',
        status: 'active',
        lab_id: '650e8400-e29b-41d4-a716-446655440000',
        avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
        current_institution: 'Stanford University'
      };
      return next();
    }
    
    const payload: any = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');

    // Load user from DB
    const result = await pool.query(
      'SELECT id, email, username, first_name, last_name, role, status FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ==============================================
// NEGATIVE RESULTS SUBMISSIONS
// ==============================================

// Browse/search negative results - PUBLIC
router.get('/', async (req: any, res) => {
  try {
    // Safety check for req.user (even though middleware should handle it)
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      research_field, sharing_status = 'public', search,
      sort_by = 'recent', limit = 50
    } = req.query;

    console.log('🔬 Fetching negative results with filters:', { research_field, search, sort_by });

    let query = `
      SELECT 
        nr.*,
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), 'Anonymous') as researcher_name,
        COALESCE(u.email, '') as current_institution,
        CASE WHEN COALESCE(nr.anonymous_sharing, false) THEN 'Anonymous' ELSE COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), 'Anonymous') END as display_name,
        COALESCE(l.name, '') as lab_name,
        COALESCE(nr.helpful_votes, 0) as helpful_votes,
        COALESCE(nr.saved_someone_votes, 0) as saved_someone_votes,
        COALESCE(nr.citation_count, 0) as citation_count,
        COALESCE(nr.views_count, 0) as views_count,
        COALESCE(nr.reproduction_attempts, 0) as reproduction_attempts,
        COALESCE(nr.estimated_cost_usd, 0) as estimated_cost_usd,
        COALESCE(nr.time_spent_hours, 0) as time_spent_hours
      FROM negative_results nr
      LEFT JOIN users u ON nr.researcher_id = u.id
      LEFT JOIN labs l ON nr.lab_id = l.id
      WHERE COALESCE(nr.is_publicly_searchable, true) = true
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (research_field) {
      query += ` AND nr.research_field = $${paramCount}`;
      params.push(research_field);
      paramCount++;
    }

    if (search) {
      query += ` AND (
        nr.experiment_title ILIKE $${paramCount} OR
        nr.original_hypothesis ILIKE $${paramCount} OR
        nr.lessons_learned ILIKE $${paramCount} OR
        COALESCE(array_to_string(nr.tags, ','), '') ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Sorting
    if (sort_by === 'recent') {
      query += ` ORDER BY nr.created_at DESC`;
    } else if (sort_by === 'helpful') {
      query += ` ORDER BY COALESCE(nr.helpful_votes, 0) DESC`;
    } else if (sort_by === 'citations') {
      query += ` ORDER BY COALESCE(nr.citation_count, 0) DESC`;
    } else if (sort_by === 'impact') {
      query += ` ORDER BY COALESCE(nr.saved_someone_votes, 0) DESC`;
    }

    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    console.log('🔬 Executing query...');
    const result = await pool.query(query, params);
    console.log(`✅ Found ${result.rows.length} negative results`);
    res.json(result.rows);
  } catch (error: any) {
    console.error('❌ Error fetching negative results:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Failed to fetch negative results' 
      : error.message || 'Failed to fetch negative results';
    res.status(500).json({ error: errorMessage });
  }
});

// Get a specific negative result
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        nr.*,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as researcher_name,
        u.role as current_position,
        u.email as current_institution,
        CASE WHEN nr.anonymous_sharing THEN 'Anonymous' ELSE CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) END as display_name,
        l.name as lab_name
      FROM negative_results nr
      JOIN users u ON nr.researcher_id = u.id
      LEFT JOIN labs l ON nr.lab_id = l.id
      WHERE nr.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negative result not found' });
    }

    // Increment view count
    await pool.query(`
      UPDATE negative_results
      SET views_count = views_count + 1
      WHERE id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching negative result:', error);
    res.status(500).json({ error: 'Failed to fetch negative result' });
  }
});

// Get my negative results
router.get('/my/submissions', authenticateToken, async (req: any, res) => {
  try {
    const researcherId = req.user.id;

    const result = await pool.query(`
      SELECT 
        nr.*,
        (SELECT COUNT(*) FROM negative_result_comments WHERE negative_result_id = nr.id) as comments_count,
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), 'Anonymous') as researcher_name,
        COALESCE(u.email, '') as current_institution,
        CASE WHEN COALESCE(nr.anonymous_sharing, false) THEN 'Anonymous' ELSE COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), 'Anonymous') END as display_name,
        COALESCE(l.name, '') as lab_name,
        COALESCE(nr.helpful_votes, 0) as helpful_votes,
        COALESCE(nr.saved_someone_votes, 0) as saved_someone_votes,
        COALESCE(nr.citation_count, 0) as citation_count,
        COALESCE(nr.views_count, 0) as views_count,
        COALESCE(nr.reproduction_attempts, 0) as reproduction_attempts,
        COALESCE(nr.estimated_cost_usd, 0) as estimated_cost_usd,
        COALESCE(nr.time_spent_hours, 0) as time_spent_hours
      FROM negative_results nr
      LEFT JOIN users u ON nr.researcher_id = u.id
      LEFT JOIN labs l ON nr.lab_id = l.id
      WHERE nr.researcher_id = $1
      ORDER BY nr.created_at DESC
    `, [researcherId]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching my negative results:', error);
    res.status(500).json({ error: 'Failed to fetch my negative results' });
  }
});

// Submit a negative result
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const researcherId = req.user.id;
    const {
      lab_id, experiment_title, research_field, research_domain, keywords,
      original_hypothesis, expected_outcome, theoretical_basis, literature_citations,
      actual_outcome, unexpected_observations, failure_type, primary_reason,
      secondary_reasons, contributing_factors, reproduction_attempts, consistent_failure,
      variations_tested, methodology_description, protocol_used_id, materials_used,
      equipment_used, key_parameters, experimental_conditions, lessons_learned,
      recommendations_for_others, alternative_approaches_suggested, what_would_you_try_instead,
      estimated_cost_usd, time_spent_hours, sharing_status, is_publicly_searchable,
      allow_citations, anonymous_sharing, experiment_date, tags
    } = req.body;

    const result = await pool.query(`
      INSERT INTO negative_results (
        researcher_id, lab_id, experiment_title, research_field, research_domain,
        keywords, original_hypothesis, expected_outcome, theoretical_basis,
        literature_citations, actual_outcome, unexpected_observations, failure_type,
        primary_reason, secondary_reasons, contributing_factors, reproduction_attempts,
        consistent_failure, variations_tested, methodology_description, protocol_used_id,
        materials_used, equipment_used, key_parameters, experimental_conditions,
        lessons_learned, recommendations_for_others, alternative_approaches_suggested,
        what_would_you_try_instead, estimated_cost_usd, time_spent_hours,
        sharing_status, is_publicly_searchable, allow_citations, anonymous_sharing,
        experiment_date, tags
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37
      )
      RETURNING *
    `, [
      researcherId, lab_id, experiment_title, research_field, research_domain,
      keywords, original_hypothesis, expected_outcome, theoretical_basis,
      literature_citations, actual_outcome, unexpected_observations, failure_type,
      primary_reason, secondary_reasons, contributing_factors, reproduction_attempts,
      consistent_failure, variations_tested, methodology_description, protocol_used_id,
      materials_used, equipment_used, key_parameters, experimental_conditions,
      lessons_learned, recommendations_for_others, alternative_approaches_suggested,
      what_would_you_try_instead, estimated_cost_usd, time_spent_hours,
      sharing_status, is_publicly_searchable, allow_citations, anonymous_sharing,
      experiment_date, tags
    ]);

    const negativeResult = result.rows[0];

    // Auto-index for AI learning (non-blocking)
    autoIndexing.autoIndexContent(
      researcherId,
      'negative_result',
      negativeResult.id,
      negativeResult
    ).catch(err => console.error('Error auto-indexing negative result:', err));

    // Update contributor stats
    await updateContributorStats(researcherId);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error submitting negative result:', error);
    res.status(500).json({ error: 'Failed to submit negative result' });
  }
});

// Update a negative result
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const researcherId = req.user.id;
    const { id } = req.params;
    const {
      sharing_status, is_publicly_searchable, lessons_learned,
      recommendations_for_others
    } = req.body;

    const result = await pool.query(`
      UPDATE negative_results
      SET 
        sharing_status = COALESCE($1, sharing_status),
        is_publicly_searchable = COALESCE($2, is_publicly_searchable),
        lessons_learned = COALESCE($3, lessons_learned),
        recommendations_for_others = COALESCE($4, recommendations_for_others),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = $5 AND researcher_id = $6
      RETURNING *
    `, [sharing_status, is_publicly_searchable, lessons_learned,
        recommendations_for_others, id, researcherId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negative result not found or unauthorized' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating negative result:', error);
    res.status(500).json({ error: 'Failed to update negative result' });
  }
});

// ==============================================
// VARIATION ATTEMPTS
// ==============================================

// Get variation attempts for a negative result
router.get('/:id/variations', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM negative_result_variations
      WHERE negative_result_id = $1
      ORDER BY variation_number
    `, [id]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching variations:', error);
    res.status(500).json({ error: 'Failed to fetch variations' });
  }
});

// Add a variation attempt
router.post('/:id/variations', authenticateToken, async (req: any, res) => {
  try {
    const researcherId = req.user.id;
    const { id } = req.params;
    const { variation_description, parameters_changed, outcome, success_level, observations } = req.body;

    // Verify ownership
    const ownerCheck = await pool.query(`
      SELECT researcher_id FROM negative_results WHERE id = $1
    `, [id]);

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].researcher_id !== researcherId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get next variation number
    const maxVariation = await pool.query(`
      SELECT COALESCE(MAX(variation_number), 0) as max_num
      FROM negative_result_variations
      WHERE negative_result_id = $1
    `, [id]);

    const variationNumber = maxVariation.rows[0].max_num + 1;

    const result = await pool.query(`
      INSERT INTO negative_result_variations (
        negative_result_id, variation_number, variation_description,
        parameters_changed, outcome, success_level, observations
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, variationNumber, variation_description, parameters_changed,
        outcome, success_level, observations]);

    // Update reproduction attempts count
    await pool.query(`
      UPDATE negative_results
      SET reproduction_attempts = reproduction_attempts + 1
      WHERE id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error adding variation:', error);
    res.status(500).json({ error: 'Failed to add variation' });
  }
});

// ==============================================
// COMMENTS & DISCUSSION
// ==============================================

// Get comments for a negative result
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        nrc.*,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as commenter_name,
        u.current_position as commenter_position
      FROM negative_result_comments nrc
      JOIN users u ON nrc.commenter_id = u.id
      WHERE nrc.negative_result_id = $1
      ORDER BY nrc.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment
router.post('/:id/comments', authenticateToken, async (req: any, res) => {
  try {
    const commenterId = req.user.id;
    const { id } = req.params;
    const {
      comment_text, comment_type, had_similar_failure, found_solution, solution_description
    } = req.body;

    const result = await pool.query(`
      INSERT INTO negative_result_comments (
        negative_result_id, commenter_id, comment_text, comment_type,
        had_similar_failure, found_solution, solution_description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, commenterId, comment_text, comment_type, had_similar_failure,
        found_solution, solution_description]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ==============================================
// VOTING & ENGAGEMENT
// ==============================================

// Vote helpful
router.post('/:id/vote-helpful', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE negative_results
      SET helpful_votes = helpful_votes + 1
      WHERE id = $1
      RETURNING helpful_votes
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negative result not found' });
    }

    res.json({ helpful_votes: result.rows[0].helpful_votes });
  } catch (error: any) {
    console.error('Error voting helpful:', error);
    res.status(500).json({ error: 'Failed to vote helpful' });
  }
});

// Vote "saved me time/money"
router.post('/:id/vote-saved-me', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { estimated_time_saved_hours, estimated_cost_saved_usd } = req.body;

    // Record the save
    await pool.query(`
      INSERT INTO negative_result_saves (
        user_id, negative_result_id, save_reason, 
        avoided_repeating_mistake, estimated_time_saved_hours, estimated_cost_saved_usd
      )
      VALUES ($1, $2, 'avoided_failure', true, $3, $4)
      ON CONFLICT (user_id, negative_result_id) DO UPDATE
      SET 
        estimated_time_saved_hours = EXCLUDED.estimated_time_saved_hours,
        estimated_cost_saved_usd = EXCLUDED.estimated_cost_saved_usd
    `, [userId, id, estimated_time_saved_hours, estimated_cost_saved_usd]);

    // Update the negative result
    const result = await pool.query(`
      UPDATE negative_results
      SET saved_someone_votes = saved_someone_votes + 1
      WHERE id = $1
      RETURNING saved_someone_votes
    `, [id]);

    res.json({ saved_someone_votes: result.rows[0].saved_someone_votes });
  } catch (error: any) {
    console.error('Error voting saved me:', error);
    res.status(500).json({ error: 'Failed to vote saved me' });
  }
});

// ==============================================
// SAVE/BOOKMARK NEGATIVE RESULTS
// ==============================================

// Get my saved negative results
router.get('/my/saved', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT 
        nr.*,
        snr.save_reason,
        snr.notes,
        snr.saved_at,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as researcher_name
      FROM negative_result_saves snr
      JOIN negative_results nr ON snr.negative_result_id = nr.id
      JOIN users u ON nr.researcher_id = u.id
      WHERE snr.user_id = $1
      ORDER BY snr.saved_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching saved negative results:', error);
    res.status(500).json({ error: 'Failed to fetch saved negative results' });
  }
});

// Save/bookmark a negative result
router.post('/:id/save', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { save_reason, notes } = req.body;

    const result = await pool.query(`
      INSERT INTO negative_result_saves (
        user_id, negative_result_id, save_reason, notes
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, negative_result_id) DO UPDATE
      SET save_reason = EXCLUDED.save_reason, notes = EXCLUDED.notes
      RETURNING *
    `, [userId, id, save_reason, notes]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error saving negative result:', error);
    res.status(500).json({ error: 'Failed to save negative result' });
  }
});

// Unsave a negative result
router.delete('/:id/save', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await pool.query(`
      DELETE FROM negative_result_saves
      WHERE user_id = $1 AND negative_result_id = $2
    `, [userId, id]);

    res.json({ message: 'Negative result unsaved' });
  } catch (error: any) {
    console.error('Error unsaving negative result:', error);
    res.status(500).json({ error: 'Failed to unsave negative result' });
  }
});

// ==============================================
// CITATIONS
// ==============================================

// Cite a negative result
router.post('/:id/cite', authenticateToken, async (req: any, res) => {
  try {
    const citingUserId = req.user.id;
    const { id } = req.params;
    const { cited_in, citation_context, how_it_helped, impact_type } = req.body;

    const result = await pool.query(`
      INSERT INTO negative_result_citations (
        negative_result_id, citing_user_id, cited_in, citation_context,
        how_it_helped, impact_type
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, citingUserId, cited_in, citation_context, how_it_helped, impact_type]);

    // Update citation count
    await pool.query(`
      UPDATE negative_results
      SET citation_count = citation_count + 1
      WHERE id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error citing negative result:', error);
    res.status(500).json({ error: 'Failed to cite negative result' });
  }
});

// Get citations for a negative result
router.get('/:id/citations', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        nrc.*,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as citing_user_name,
        u.current_institution
      FROM negative_result_citations nrc
      JOIN users u ON nrc.citing_user_id = u.id
      WHERE nrc.negative_result_id = $1
      ORDER BY nrc.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching citations:', error);
    res.status(500).json({ error: 'Failed to fetch citations' });
  }
});

// ==============================================
// SUCCESSFUL ALTERNATIVES
// ==============================================

// Get successful alternatives for a failed experiment
router.get('/:id/alternatives', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        sa.*,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as researcher_name,
        u.current_institution
      FROM successful_alternatives sa
      JOIN users u ON sa.researcher_id = u.id
      WHERE sa.original_negative_result_id = $1
      ORDER BY sa.helpful_votes DESC
    `, [id]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching alternatives:', error);
    res.status(500).json({ error: 'Failed to fetch alternatives' });
  }
});

// Submit a successful alternative
router.post('/:id/alternatives', authenticateToken, async (req: any, res) => {
  try {
    const researcherId = req.user.id;
    const { id } = req.params;
    const {
      alternative_title, alternative_description, key_differences,
      success_level, outcome_description, methodology
    } = req.body;

    const result = await pool.query(`
      INSERT INTO successful_alternatives (
        original_negative_result_id, researcher_id, alternative_title,
        alternative_description, key_differences, success_level,
        outcome_description, methodology
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, researcherId, alternative_title, alternative_description,
        key_differences, success_level, outcome_description, methodology]);

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error submitting alternative:', error);
    res.status(500).json({ error: 'Failed to submit alternative' });
  }
});

// ==============================================
// CONTRIBUTOR STATISTICS
// ==============================================

// Get contributor statistics
router.get('/contributors/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM negative_results_contributor_stats
      WHERE researcher_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({
        researcher_id: userId,
        total_negative_results_shared: 0,
        total_citations: 0,
        total_helpful_votes: 0,
        total_saved_someone_votes: 0,
        transparency_badges: []
      });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching contributor stats:', error);
    res.status(500).json({ error: 'Failed to fetch contributor stats' });
  }
});

// Get top contributors (leaderboard)
router.get('/leaderboard', async (req, res) => {
  try {
    const { timeframe = 'all_time', limit = 50 } = req.query;

    const result = await pool.query(`
      SELECT 
        nrcs.*,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as researcher_name,
        u.current_position,
        u.current_institution
      FROM negative_results_contributor_stats nrcs
      JOIN users u ON nrcs.researcher_id = u.id
      WHERE nrcs.total_negative_results_shared > 0
      ORDER BY nrcs.overall_trust_score DESC, nrcs.total_saved_someone_votes DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ==============================================
// FAILURE PATTERNS
// ==============================================

// Get common failure patterns
router.get('/patterns', async (req, res) => {
  try {
    const { research_field } = req.query;

    let query = `
      SELECT *
      FROM failure_patterns
      WHERE is_validated = true
    `;

    const params: any[] = [];

    if (research_field) {
      query += ` AND $1 = ANY(research_fields)`;
      params.push(research_field);
    }

    query += ` ORDER BY votes_count DESC LIMIT 20`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching failure patterns:', error);
    res.status(500).json({ error: 'Failed to fetch failure patterns' });
  }
});

// Helper function to update contributor stats
async function updateContributorStats(researcherId: string) {
  await pool.query(`
    INSERT INTO negative_results_contributor_stats (
      researcher_id, total_negative_results_shared, public_negative_results_count
    )
    VALUES ($1, 1, 1)
    ON CONFLICT (researcher_id) DO UPDATE
    SET 
      total_negative_results_shared = negative_results_contributor_stats.total_negative_results_shared + 1,
      public_negative_results_count = negative_results_contributor_stats.public_negative_results_count + 1,
      last_calculated = CURRENT_TIMESTAMP
  `, [researcherId]);
}

export default router;

