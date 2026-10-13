/**
 * API Task Assignments Routes
 * Allow users to assign specific tasks to their configured APIs
 * This makes the system flexible - users control which API handles which task
 */

import { Router } from 'express';
import pool from "../../database/config.js";
import { authenticateToken } from '../middleware/auth.js';

const router: Router = Router();

// Common task types available
const AVAILABLE_TASKS = [
  { type: 'paper_finding', name: 'Find Research Papers', description: 'Search and find research papers' },
  { type: 'abstract_writing', name: 'Write Abstracts', description: 'Generate research abstracts' },
  { type: 'content_writing', name: 'Content Writing', description: 'General content writing' },
  { type: 'idea_generation', name: 'Generate Ideas', description: 'Generate research ideas and hypotheses' },
  { type: 'proposal_writing', name: 'Write Proposals', description: 'Write research proposals and grants' },
  { type: 'data_analysis', name: 'Data Analysis', description: 'Analyze experimental data' },
  { type: 'image_creation', name: 'Create Images', description: 'Generate images and figures' },
  { type: 'paper_generation', name: 'Generate Papers', description: 'Generate full research papers' },
  { type: 'presentation_generation', name: 'Generate Presentations', description: 'Create presentations' },
  { type: 'code_generation', name: 'Generate Code', description: 'Write code and scripts' },
  { type: 'translation', name: 'Translation', description: 'Translate content' },
  { type: 'summarization', name: 'Summarization', description: 'Summarize content' }
];

// Get all available task types
router.get('/tasks', authenticateToken, async (req: any, res) => {
  try {
    res.json({ tasks: AVAILABLE_TASKS });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get user's task assignments
router.get('/assignments', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        a.id,
        a.task_type,
        a.task_name,
        a.priority,
        a.is_active,
        a.created_at,
        k.id as api_key_id,
        k.provider,
        k.provider_name
      FROM api_task_assignments a
      JOIN ai_provider_keys k ON a.api_key_id = k.id
      WHERE a.user_id = $1
      ORDER BY a.task_type, a.priority DESC, a.created_at DESC`,
      [userId]
    );
    
    res.json({ assignments: result.rows });
  } catch (error) {
    console.error('Error fetching task assignments:', error);
    res.status(500).json({ error: 'Failed to fetch task assignments' });
  }
});

// Get user's API keys (for dropdown)
router.get('/api-keys', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, provider, provider_name, is_active
       FROM ai_provider_keys
       WHERE user_id = $1 AND is_active = true
       ORDER BY provider_name`,
      [userId]
    );
    
    res.json({ apiKeys: result.rows });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create task assignment
router.post('/assignments', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { api_key_id, task_type, task_name, priority = 1 } = req.body;
    
    if (!api_key_id || !task_type || !task_name) {
      return res.status(400).json({ error: 'API key ID, task type, and task name are required' });
    }
    
    // Verify API key belongs to user
    const keyCheck = await pool.query(
      'SELECT id FROM ai_provider_keys WHERE id = $1 AND user_id = $2',
      [api_key_id, userId]
    );
    
    if (keyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    // Insert or update assignment
    const result = await pool.query(
      `INSERT INTO api_task_assignments (
        user_id, api_key_id, task_type, task_name, priority, is_active
      ) VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (user_id, api_key_id, task_type)
      DO UPDATE SET
        task_name = EXCLUDED.task_name,
        priority = EXCLUDED.priority,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, task_type, task_name, priority, is_active`,
      [userId, api_key_id, task_type, task_name, priority]
    );
    
    res.json({
      success: true,
      assignment: result.rows[0],
      message: 'Task assignment created successfully'
    });
  } catch (error) {
    console.error('Error creating task assignment:', error);
    res.status(500).json({ error: 'Failed to create task assignment' });
  }
});

// Update task assignment
router.put('/assignments/:id', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { task_name, priority, is_active } = req.body;
    
    // Verify ownership
    const assignmentCheck = await pool.query(
      'SELECT id FROM api_task_assignments WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task assignment not found' });
    }
    
    const result = await pool.query(
      `UPDATE api_task_assignments
       SET
         task_name = COALESCE($1, task_name),
         priority = COALESCE($2, priority),
         is_active = COALESCE($3, is_active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING id, task_type, task_name, priority, is_active`,
      [task_name, priority, is_active, id, userId]
    );
    
    res.json({
      success: true,
      assignment: result.rows[0],
      message: 'Task assignment updated successfully'
    });
  } catch (error) {
    console.error('Error updating task assignment:', error);
    res.status(500).json({ error: 'Failed to update task assignment' });
  }
});

// Delete task assignment
router.delete('/assignments/:id', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM api_task_assignments WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task assignment not found' });
    }
    
    res.json({
      success: true,
      message: 'Task assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task assignment:', error);
    res.status(500).json({ error: 'Failed to delete task assignment' });
  }
});

// Get API assignment for a specific task (used by AI Research Agent)
async function decryptStoredApiKey(encryptedData: string): Promise<string> {
  const crypto = await import('crypto');
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
  const ALGORITHM = 'aes-256-gcm';
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function resolvePlatformFallback(): Promise<{
  apiKeyId: string;
  provider: string;
  providerName: string;
  apiKey: string;
} | null> {
  const { resolvePlatformProvider } = await import('../services/platformAiAccess.js');
  const platform = resolvePlatformProvider();
  if (!platform) return null;
  return {
    apiKeyId: platform.apiKeyId,
    provider: platform.provider,
    providerName: platform.providerName,
    apiKey: platform.apiKey,
  };
}

export async function getApiForTask(userId: string, taskType: string): Promise<{
  apiKeyId: string;
  provider: string;
  providerName: string;
  apiKey: string;
} | null> {
  try {
    const result = await pool.query(
      `SELECT 
        k.id as api_key_id,
        k.provider,
        k.provider_name,
        k.encrypted_api_key,
        a.priority
      FROM api_task_assignments a
      JOIN ai_provider_keys k ON a.api_key_id = k.id
      WHERE a.user_id = $1 
        AND a.task_type = $2
        AND a.is_active = true
        AND k.is_active = true
      ORDER BY a.priority DESC, a.created_at DESC
      LIMIT 1`,
      [userId, taskType]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const apiKey = await decryptStoredApiKey(row.encrypted_api_key);
      return {
        apiKeyId: row.api_key_id,
        provider: row.provider,
        providerName: row.provider_name,
        apiKey,
      };
    }

    // Any active user key (if assignments table empty / no match)
    try {
      const keys = await pool.query(
        `SELECT id, provider, provider_name, encrypted_api_key
         FROM ai_provider_keys
         WHERE user_id = $1 AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId]
      );
      if (keys.rows.length > 0) {
        const row = keys.rows[0];
        return {
          apiKeyId: row.id,
          provider: row.provider,
          providerName: row.provider_name,
          apiKey: await decryptStoredApiKey(row.encrypted_api_key),
        };
      }
    } catch {
      /* table may be missing */
    }

    return resolvePlatformFallback();
  } catch (error) {
    console.error('Error getting API for task:', error);
    // Missing assignments table or other DB issues — still try platform key
    return resolvePlatformFallback();
  }
}

export default router;

