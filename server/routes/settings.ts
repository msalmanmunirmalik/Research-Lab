/**
 * Settings API Routes
 * User settings and preferences management
 */

import express, { type Router } from 'express';
import crypto from 'crypto';
import pool from '../../database/config.js';
import { authenticateToken } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import { replacePassword } from '../services/accountRecovery.js';

const router: Router = express.Router();

// Get user settings
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    // Safety check for req.user
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    
    // Get user from database
    const userResult = await pool.query(
      `SELECT 
        id, email, first_name, last_name, username, role, status,
        phone, department, specialization, bio, current_position, 
        current_institution, location, timezone, profile_visibility,
        show_email, show_phone, show_location, created_at
      FROM users WHERE id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get user preferences if they exist
    const prefsResult = await pool.query(
      `SELECT * FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    
    const preferences = prefsResult.rows[0] || {
      notifications_email: true,
      notifications_push: true,
      notifications_research_updates: true,
      notifications_lab_updates: true,
      notifications_conference_updates: true,
      theme: 'light',
      language: 'en',
      date_format: 'MM/DD/YYYY',
      currency: 'USD'
    };
    
    res.json({
      profile: user,
      preferences: preferences
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone, department, specialization, bio, location, timezone } = req.body;
    
    await pool.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone = COALESCE($3, phone),
        department = COALESCE($4, department),
        specialization = COALESCE($5, specialization),
        bio = COALESCE($6, bio),
        location = COALESCE($7, location),
        timezone = COALESCE($8, timezone),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      `,
      [first_name, last_name, phone, department, specialization, bio, location, timezone, userId]
    );

    const profileResult = await pool.query(
      `SELECT id, email, first_name, last_name, username, role, phone, department, specialization, bio, location, timezone
       FROM users WHERE id = $1`,
      [userId]
    );

    res.json({ 
      success: true,
      profile: profileResult.rows[0],
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update preferences
router.put('/preferences', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const {
      notifications_email,
      notifications_push,
      notifications_research_updates,
      notifications_lab_updates,
      notifications_conference_updates,
      theme,
      language,
      date_format,
      currency
    } = req.body;
    
    // Insert or update preferences
    const preferencesId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO user_preferences (
        id, user_id, notifications_email, notifications_push,
        notifications_research_updates, notifications_lab_updates,
        notifications_conference_updates, theme, language, date_format, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON DUPLICATE KEY UPDATE
        notifications_email = COALESCE($3, notifications_email),
        notifications_push = COALESCE($4, notifications_push),
        notifications_research_updates = COALESCE($5, notifications_research_updates),
        notifications_lab_updates = COALESCE($6, notifications_lab_updates),
        notifications_conference_updates = COALESCE($7, notifications_conference_updates),
        theme = COALESCE($8, theme),
        language = COALESCE($9, language),
        date_format = COALESCE($10, date_format),
        currency = COALESCE($11, currency),
        updated_at = CURRENT_TIMESTAMP`,
      [
        preferencesId, userId, notifications_email, notifications_push,
        notifications_research_updates, notifications_lab_updates,
        notifications_conference_updates, theme, language, date_format, currency
      ]
    );

    const preferencesResult = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    
    res.json({ 
      success: true,
      preferences: preferencesResult.rows[0],
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Update privacy settings
router.put('/privacy', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { profile_visibility, show_email, show_phone, show_location } = req.body;
    
    await pool.query(
      `UPDATE users SET
        profile_visibility = COALESCE($1, profile_visibility),
        show_email = COALESCE($2, show_email),
        show_phone = COALESCE($3, show_phone),
        show_location = COALESCE($4, show_location),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      `,
      [profile_visibility, show_email, show_phone, show_location, userId]
    );

    const privacyResult = await pool.query(
      `SELECT profile_visibility, show_email, show_phone, show_location
       FROM users WHERE id = $1`,
      [userId]
    );
    
    res.json({ 
      success: true,
      privacy: privacyResult.rows[0],
      message: 'Privacy settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    await replacePassword(userId, new_password);
    
    res.json({ 
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Export user data
router.get('/export-data', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // Get all user data
    const [userData, preferences, apiKeys] = await Promise.all([
      pool.query(
        `SELECT id, email, first_name, last_name, username, role, phone, department, 
        specialization, bio, current_position, current_institution, location, timezone,
        profile_visibility, created_at, updated_at
        FROM users WHERE id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT * FROM user_preferences WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT provider, provider_name, is_active, last_used_at, created_at
        FROM ai_provider_keys WHERE user_id = $1`,
        [userId]
      )
    ]);
    
    const exportData = {
      user: userData.rows[0],
      preferences: preferences.rows[0] || null,
      api_keys: apiKeys.rows.map(key => ({
        provider: key.provider_name,
        active: key.is_active,
        last_used: key.last_used_at,
        added: key.created_at
      })),
      export_date: new Date().toISOString()
    };
    
    res.json({ 
      success: true,
      data: exportData,
      message: 'Data exported successfully'
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Delete account
router.delete('/account', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }
    
    // Verify password
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    const isValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
    
    // Delete user (CASCADE will handle related data)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.json({ 
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;

