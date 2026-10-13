// Load environment variables from .env.local first, then .env
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Load .env.local first
dotenv.config(); // Then load .env (will not override .env.local values)

import express, { type Application } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../database/config.js';
import { User, UserRole, UserStatus } from '../types.js';
import AIPresentationService from './aiPresentationService.js';
import { UnifiedPresentationService } from './services/presentations/UnifiedPresentationService.js';
import AdvancedStatisticalService from './advancedStatsService.js';
import { ActivityTracker } from './services/activityTracker.js';
import { authenticateToken } from './middleware/auth.js';
import { apiRateLimit, authRateLimit, securityHeaders } from './middleware/security.js';
import {
  changePasswordSchema,
  formatZodError,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  resolveSignupRole
} from './validation/authSchemas.js';
import authRecoveryRoutes from './routes/authRecovery.js';
import { replacePassword, revokeUserTokens, startEmailVerification, verificationNotice } from './services/accountRecovery.js';
import {
  assertActiveLabMember,
  assertCanWriteLifecycleRecord,
  canReadLifecycleRecord,
  findActiveLabMembership,
} from './policies/labAccess.js';
import { getRequiredJwtSecret } from './utils/authEnvironment.js';

// Revolutionary features route modules
import scientistPassportRoutes from './routes/scientistPassport.js';
import serviceMarketplaceRoutes from './routes/serviceMarketplace.js';
import negativeResultsRoutes from './routes/negativeResults.js';
import aiTrainingRoutes from './routes/aiTraining.js';
import aiProviderKeysRoutes from './routes/aiProviderKeys.js';
import settingsRoutes from './routes/settings.js';
import apiTaskAssignmentsRoutes from './routes/apiTaskAssignments.js';
import agentsRoutes from './routes/agents.js';
import orchestratorRoutes from './routes/orchestrator.js';
import labWorkspaceRoutes from './routes/labWorkspace.js';
import protocolExecutionRoutes from './routes/protocolExecution.js';
import protocolCollaborationRoutes from './routes/protocolCollaboration.js';
import protocolSemanticSearchRoutes from './routes/protocolSemanticSearch.js';
import protocolAIRoutes from './routes/protocolAI.js';
import protocolComparisonRoutes from './routes/protocolComparison.js';
import protocolsExternalRoutes from './routes/protocolsExternal.js';
import springerProtocolRoutes from './routes/springerProtocols.js';
import experimentTrackerRoutes from './routes/experimentTracker.js';
import projectManagementRoutes from './routes/projectManagement.js';
import recommendationsRoutes from './routes/recommendations.js';
import notebookSummariesRoutes from './routes/notebookSummaries.js';
import complianceRoutes from './routes/compliance.js';
import supportRoutes from './routes/support.js';
import grantsRoutes from './routes/grants.js';
import researchEventsRoutes from './routes/researchEvents.js';
import marketplaceDirectoryRoutes from './routes/marketplaceDirectory.js';
import networkingPostsRoutes from './routes/networkingPosts.js';
import networkingDirectoryRoutes from './routes/networkingDirectory.js';
import networkingSocialRoutes from './routes/networkingSocial.js';
import { parseJsonList, toJsonList } from './utils/labShowcase.js';
import { canManageResource } from './utils/ownership.js';
import helpForumRoutes from './routes/helpForum.js';
import notificationsRoutes from './routes/notifications.js';
import communityNewsRoutes from './routes/communityNews.js';
import aiResearchAgentRoutes from './routes/aiResearchAgent.js';
import wellbeingRoutes from './routes/wellbeing.js';
import onboardingDemoRoutes from './routes/onboardingDemo.js';
import labTrainingRoutes from './routes/labTraining.js';
import evidenceAIRoutes from './routes/evidenceAI.js';
import statsGuideRoutes from './routes/statsGuide.js';
import writingRoutes from './routes/writing.js';
import researchRoutes from './routes/research.js';
import dashboardRoutes from './routes/dashboard.js';
import autoIndexing from './utils/autoIndexing.js';
import { mountFrontendStatic } from './middleware/serveFrontend.js';

// Note: Exports moved to separate files to avoid circular dependencies

const app: Application = express();
const PORT = process.env.PORT || 5002;
const ENABLE_DEMO_AUTH = process.env.ENABLE_DEMO_AUTH === 'true';
const DEMO_AUTH_EMAIL = process.env.DEMO_AUTH_EMAIL || 'researcher@researchlab.com';
const DEMO_AUTH_PASSWORD = process.env.DEMO_AUTH_PASSWORD || 'researcher123';
const DEMO_AUTH_TOKEN = process.env.DEMO_AUTH_TOKEN || 'demo-token-123';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const demoAuthUser = {
  id: 'demo-user-0001',
  email: DEMO_AUTH_EMAIL,
  username: DEMO_AUTH_EMAIL.split('@')[0] || 'demo_user',
  first_name: 'Fatima',
  last_name: 'Martinez',
  role: 'researcher',
  status: 'active',
  avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
  current_institution: 'Stanford University'
};

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Trust proxy when behind a reverse proxy so rate limits use real client IPs
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);

// --- CORS Setup ---
const allowedOrigins: string[] = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

const isProd = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!isProd) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// --- JSON Body Parser ---
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRateLimit);

// JWT Secret (boot already validated via auth middleware import)
const JWT_SECRET = getRequiredJwtSecret();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: 'MySQL',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'API healthy', 
    timestamp: new Date().toISOString(),
    database: 'MySQL'
  });
});

// Authentication Routes
app.post('/api/auth/register', authRateLimit, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const { email, username, password, first_name, last_name } = parsed.data;
    // Never trust client-supplied privileged roles
    const role = resolveSignupRole(parsed.data.role);

    // Check if user already exists (generic message to reduce account enumeration)
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Unable to create account with the provided details' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO users (id, email, username, password_hash, first_name, last_name, role, status, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [userId, email.toLowerCase(), username, hashedPassword, first_name, last_name, role, 'active', false]);

    const user = {
      id: userId,
      email: email.toLowerCase(),
      username,
      first_name,
      last_name,
      role,
      status: 'active'
    };

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    let emailDelivery = { delivered: false };
    try {
      emailDelivery = await startEmailVerification(userId, email.toLowerCase());
    } catch (verifyError) {
      console.error('Verification record failed:', verifyError);
    }

    res.status(201).json({
      message: `Account created. ${verificationNotice(emailDelivery.delivered)}`,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        email_verified: false
      },
      emailDelivery,
      token
    });

  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.code) {
      console.error('Database error code:', error.code);
    }
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const { email, password } = parsed.data;
    const loginId = email.trim();

    // Optional fixed test user for Playwright/E2E only (ENABLE_DEMO_AUTH=true on the server process)
    if (
      ENABLE_DEMO_AUTH &&
      loginId === DEMO_AUTH_EMAIL &&
      password === DEMO_AUTH_PASSWORD
    ) {
      return res.json({
        message: 'Test login successful',
        user: demoAuthUser,
        token: DEMO_AUTH_TOKEN
      });
    }

    // Find user - handle database errors separately
    let result;
    try {
      result = await pool.query(
        'SELECT * FROM users WHERE email = $1 OR username = $2',
        [loginId.toLowerCase(), loginId]
      );
    } catch (dbError: any) {
      console.error('💥 Database error in login:', dbError);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is not active. Please contact administrator.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status
      },
      token
    });

  } catch (error: any) {
    console.error('💥 Login error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/auth/demo-login', authRateLimit, async (req, res) => {
  if (!ENABLE_DEMO_AUTH) {
    return res.status(403).json({ error: 'Demo authentication is disabled' });
  }

  return res.json({
    message: 'Demo login successful',
    user: demoAuthUser,
    token: DEMO_AUTH_TOKEN
  });
});

// Logout - missing or invalid tokens still return 200 and revoke nothing.
app.post('/api/auth/logout', async (req, res) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (token && !(ENABLE_DEMO_AUTH && token === DEMO_AUTH_TOKEN)) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId?: string };
        if (payload.userId) await revokeUserTokens(payload.userId);
      } catch {
        // Expired or forged tokens do not revoke another session.
      }
    }
    return res.json({ message: 'Logged out' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected route example
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Remove sensitive information
    const { password_hash, ...safeUser } = user as any;
    
    res.json({
      user: safeUser
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile endpoints
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    return res.json({ user: req.user });
  } catch (error: any) {
    console.error('💥 Get profile error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const { first_name, last_name, email } = parsed.data;
    const nextEmail = email ? email.toLowerCase() : null;

    if (nextEmail) {
      const conflict = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [nextEmail, req.user!.id]
      );
      if (conflict.rows.length > 0) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
    }

    const current = await pool.query('SELECT email FROM users WHERE id = $1', [req.user!.id]);
    const previousEmail = String(current.rows[0]?.email || '').toLowerCase();
    const emailChanged = Boolean(nextEmail && nextEmail !== previousEmail);

    await pool.query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), email = COALESCE($3, email), email_verified = CASE WHEN $5 = 1 THEN 0 ELSE email_verified END, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [first_name ?? null, last_name ?? null, nextEmail, req.user!.id, emailChanged ? 1 : 0]
    );
    const userResult = await pool.query(
      'SELECT id, email, username, first_name, last_name, role, status, email_verified FROM users WHERE id = $1',
      [req.user!.id]
    );

    let emailDelivery: { delivered: boolean } | undefined;
    if (emailChanged && nextEmail) {
      try {
        emailDelivery = await startEmailVerification(req.user!.id, nextEmail);
      } catch (verifyError) {
        console.error('Verification after email change failed:', verifyError);
        emailDelivery = { delivered: false };
      }
    }

    return res.json({
      user: userResult.rows[0],
      ...(emailDelivery
        ? { emailDelivery, message: verificationNotice(emailDelivery.delivered) }
        : {})
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/auth/change-password', authenticateToken, authRateLimit, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { currentPassword, newPassword } = parsed.data;
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    const user = result.rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
    await replacePassword(req.user!.id, newPassword);
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api/auth', authRecoveryRoutes);

// User Management Routes
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Only admins and principal researchers can view all users
    if (!['admin', 'principal_researcher'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await pool.query(`
      SELECT id, email, username, first_name, last_name, role, status, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users for lab invites (any authenticated user; limited fields)
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
      return res.json({ users: [] });
    }

    const like = `%${q}%`;
    const result = await pool.query(
      `
      SELECT id, email, username, first_name, last_name, avatar_url
      FROM users
      WHERE
        email LIKE $1 OR
        username LIKE $1 OR
        first_name LIKE $1 OR
        last_name LIKE $1 OR
        CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) LIKE $1
      ORDER BY
        CASE WHEN email = $2 THEN 0 WHEN email LIKE $3 THEN 1 ELSE 2 END,
        email ASC
      LIMIT 20
    `,
      [like, q, `${q}%`]
    );

    res.json({
      users: result.rows.map((u: any) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
        avatar_url: u.avatar_url,
        name:
          `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
          u.username ||
          u.email,
      })),
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lab Management Routes
app.post('/api/labs', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      institution,
      department,
      contact_email,
      contact_phone,
      address,
      website_url,
      research_areas,
      looking_for,
      lab_type,
      established_year,
    } = req.body;

    if (!name || !institution || !department) {
      return res.status(400).json({ error: 'Lab name, institution, and department are required' });
    }

    const labId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO labs (
        id, name, description, institution, department, principal_researcher_id,
        contact_email, contact_phone, address, website_url,
        research_areas, looking_for, lab_type, established_year, is_showcased
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0)`,
      [
        labId,
        String(name).trim(),
        description || null,
        String(institution).trim(),
        String(department).trim(),
        req.user.id,
        contact_email || null,
        contact_phone || null,
        address || null,
        website_url || null,
        toJsonList(research_areas),
        toJsonList(looking_for),
        lab_type || null,
        established_year ? Number(established_year) : null,
      ]
    );

    await pool.query(
      `INSERT INTO lab_members (id, lab_id, user_id, role, permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, 1)`,
      [crypto.randomUUID(), labId, req.user.id, 'principal_researcher', '{}']
    );

    const workspaceId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO lab_workspaces (id, lab_id, name, created_by)
       VALUES ($1, $2, $3, $4)`,
      [workspaceId, labId, 'Lab workspace', req.user.id]
    );
    const spaceId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workspace_spaces (id, workspace_id, name, created_by, position)
       VALUES ($1, $2, 'General', $3, 0)`,
      [spaceId, workspaceId, req.user.id]
    );
    await pool.query(
      `INSERT INTO workspace_lists (id, space_id, name, created_by, position)
       VALUES ($1, $2, 'My Tasks', $3, 0)`,
      [crypto.randomUUID(), spaceId, req.user.id]
    );

    const labResult = await pool.query('SELECT * FROM labs WHERE id = $1', [labId]);

    res.status(201).json({
      message: 'Lab created successfully',
      lab: labResult.rows[0],
    });
  } catch (error) {
    console.error('💥 Lab creation error:', error);
    const message =
      process.env.NODE_ENV !== 'production' && error instanceof Error
        ? error.message
        : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/labs/mine', authenticateToken, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(
      `SELECT l.*, lm.role AS membership_role,
        COALESCE(l.is_showcased, 0) AS is_showcased,
        (SELECT COUNT(*) FROM lab_members m WHERE m.lab_id = l.id AND m.is_active = 1) AS member_count
       FROM lab_members lm
       JOIN labs l ON l.id = lm.lab_id
       WHERE lm.user_id = $1 AND lm.is_active = 1
       ORDER BY l.name ASC`,
      [req.user.id]
    );

    const labs = result.rows.map((row: any) => ({
      ...row,
      is_showcased: Boolean(Number(row.is_showcased)),
      research_areas: parseJsonList(row.research_areas),
      looking_for: parseJsonList(row.looking_for),
      member_count: Number(row.member_count) || 0,
    }));

    res.json({ labs });
  } catch (error: any) {
    console.error('💥 Get my labs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/labs', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Public network catalog - only showcased labs
    const query = `
      SELECT l.*, u.first_name, u.last_name, u.username as pi_name,
             (SELECT COUNT(*) FROM lab_members WHERE lab_id = l.id AND is_active = 1) as member_count
      FROM labs l
      LEFT JOIN users u ON l.principal_researcher_id = u.id
      WHERE COALESCE(l.is_showcased, 0) = 1
      ORDER BY l.showcased_at DESC, l.created_at DESC
    `;

    const result = await pool.query(query);
    res.json({
      labs: result.rows.map((row: any) => ({
        ...row,
        is_showcased: true,
        research_areas: parseJsonList(row.research_areas),
        looking_for: parseJsonList(row.looking_for),
      })),
    });
  } catch (error: any) {
    console.error('💥 Get labs error:', error);
    const errorMessage =
      process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});
// Get lab members (for a specific lab, or the user's first lab)
app.get('/api/labs/members', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const requestedLabId =
      typeof req.query.lab_id === 'string' && req.query.lab_id.trim()
        ? req.query.lab_id.trim()
        : null;

    let labId = requestedLabId;
    if (labId) {
      const membership = await pool.query(
        `SELECT lab_id FROM lab_members WHERE user_id = $1 AND lab_id = $2 AND is_active = 1 LIMIT 1`,
        [userId, labId]
      );
      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this lab' });
      }
    } else {
      const labResult = await pool.query(
        `SELECT lab_id FROM lab_members WHERE user_id = $1 AND is_active = 1 LIMIT 1`,
        [userId]
      );
      if (labResult.rows.length === 0) {
        return res.json({ members: [] });
      }
      labId = labResult.rows[0].lab_id;
    }

    const membersResult = await pool.query(
      `SELECT 
        lm.*, 
        u.id as user_id,
        u.first_name, 
        u.last_name, 
        u.username, 
        u.email, 
        u.role as user_role,
        u.avatar_url,
        u.status as user_status
      FROM lab_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.lab_id = $1
      ORDER BY lm.joined_at ASC`,
      [labId]
    );

    res.json({ members: membersResult.rows, lab_id: labId });
  } catch (error) {
    console.error('💥 Get lab members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/labs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Get lab details (LEFT JOIN so labs without PI still load)
    const labResult = await pool.query(`
      SELECT l.*,
        u.first_name, u.last_name, u.username as pi_name
      FROM labs l
      LEFT JOIN users u ON l.principal_researcher_id = u.id
      WHERE l.id = $1
    `, [id]);

    if (labResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    const lab = labResult.rows[0];

    const membership = await pool.query(
      `SELECT role FROM lab_members
       WHERE lab_id = $1 AND user_id = $2 AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
      [id, userId]
    );
    const isMember = membership.rows.length > 0;
    const isAdmin = userRole === 'admin';
    const isShowcased = Boolean(lab.is_showcased);

    if (!isMember && !isAdmin && !isShowcased) {
      return res.status(403).json({ error: 'Access denied to this lab' });
    }

    // Get lab members - emails only for members/admins
    const membersResult = await pool.query(`
      SELECT lm.*, u.first_name, u.last_name, u.username, u.email, u.role as user_role, u.avatar_url
      FROM lab_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.lab_id = $1 AND COALESCE(lm.is_active, 1) = 1
      ORDER BY
        CASE lm.role
          WHEN 'principal_researcher' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        lm.joined_at ASC
    `, [id]);

    const members = membersResult.rows.map((member: any) => {
      if (isMember || isAdmin) return member;
      const { email, ...publicMember } = member;
      return publicMember;
    });

    res.json({
      lab,
      members
    });

  } catch (error) {
    console.error('💥 Get lab error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/labs/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id: labId } = req.params;
    const { user_id, email, role = 'researcher', permissions = {} } = req.body;

    // Lab owners / managers can add members
    const memberCheck = await pool.query(
      `
      SELECT role FROM lab_members
      WHERE lab_id = $1 AND user_id = $2 AND is_active = 1
    `,
      [labId, req.user.id]
    );

    const labOwner = await pool.query(
      `SELECT principal_researcher_id FROM labs WHERE id = $1`,
      [labId]
    );

    const membershipRole = memberCheck.rows[0]?.role;
    const isOwner =
      labOwner.rows[0]?.principal_researcher_id === req.user.id ||
      ['principal_researcher', 'admin', 'co_supervisor'].includes(membershipRole);

    if (!isOwner) {
      return res.status(403).json({ error: 'Insufficient permissions to add members' });
    }

    // Resolve invitee by user_id or email
    let inviteeId = user_id as string | undefined;
    if (!inviteeId && email) {
      const byEmail = await pool.query(
        `SELECT id, username, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [String(email).trim()]
      );
      if (byEmail.rows.length === 0) {
        return res.status(404).json({
          error: 'No account found for that email. They need to register first.',
        });
      }
      inviteeId = byEmail.rows[0].id;
    }

    if (!inviteeId) {
      return res.status(400).json({ error: 'user_id or email is required' });
    }

    if (inviteeId === req.user.id) {
      return res.status(400).json({ error: 'You are already a member of this lab' });
    }

    const userCheck = await pool.query(
      'SELECT id, username, email, first_name, last_name, avatar_url FROM users WHERE id = $1',
      [inviteeId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingMember = await pool.query(
      `
      SELECT id, is_active FROM lab_members WHERE lab_id = $1 AND user_id = $2
    `,
      [labId, inviteeId]
    );

    if (existingMember.rows.length > 0) {
      if (Number(existingMember.rows[0].is_active) === 1) {
        return res.status(400).json({ error: 'User is already a member of this lab' });
      }
      // Reactivate inactive membership
      await pool.query(
        `
        UPDATE lab_members
        SET role = $1, permissions = $2, is_active = 1, updated_at = CURRENT_TIMESTAMP
        WHERE lab_id = $3 AND user_id = $4
      `,
        [role, JSON.stringify(permissions || {}), labId, inviteeId]
      );
    } else {
      await pool.query(
        `
        INSERT INTO lab_members (id, lab_id, user_id, role, permissions, is_active)
        VALUES ($1, $2, $3, $4, $5, 1)
      `,
        [crypto.randomUUID(), labId, inviteeId, role, JSON.stringify(permissions || {})]
      );
    }

    const u = userCheck.rows[0];
    console.log('👥 Lab member added:', {
      labId,
      userId: inviteeId,
      role,
      addedBy: req.user.username,
    });

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        lab_id: labId,
        user_id: inviteeId,
        role,
        permissions,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        username: u.username,
        avatar_url: u.avatar_url,
        is_active: 1,
      },
    });
  } catch (error: any) {
    console.error('💥 Add member error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/labs/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: labId, userId } = req.params;
    const { role, permissions } = req.body;

    // Check if user has permission to modify members (PI or admin)
    const memberCheck = await pool.query(`
      SELECT role FROM lab_members 
      WHERE lab_id = $1 AND user_id = $2
    `, [labId, req.user.id]);

    if (memberCheck.rows.length === 0 || 
        !['principal_researcher', 'admin', 'co_supervisor'].includes(memberCheck.rows[0].role)) {
      return res.status(403).json({ error: 'Insufficient permissions to modify members' });
    }

    // Update member
    await pool.query(`
      UPDATE lab_members 
      SET role = $1, permissions = $2, updated_at = CURRENT_TIMESTAMP
      WHERE lab_id = $3 AND user_id = $4
    `, [role, JSON.stringify(permissions), labId, userId]);

    const updatedMember = await pool.query(
      'SELECT * FROM lab_members WHERE lab_id = $1 AND user_id = $2',
      [labId, userId]
    );

    if (updatedMember.rows.length === 0) {
      return res.status(404).json({ error: 'Lab member not found' });
    }

    console.log('👥 Lab member updated:', { labId, userId, role, updatedBy: req.user.username });

    res.json({
      message: 'Member updated successfully',
      member: updatedMember.rows[0]
    });

  } catch (error) {
    console.error('💥 Update member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/labs/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: labId, userId } = req.params;

    // Check if user has permission to remove members (PI or admin)
    const memberCheck = await pool.query(`
      SELECT role FROM lab_members 
      WHERE lab_id = $1 AND user_id = $2
    `, [labId, req.user.id]);

    if (memberCheck.rows.length === 0 || 
        !['principal_researcher', 'admin', 'co_supervisor'].includes(memberCheck.rows[0].role)) {
      return res.status(403).json({ error: 'Insufficient permissions to remove members' });
    }

    // Prevent removing the principal researcher
    const labCheck = await pool.query('SELECT principal_researcher_id FROM labs WHERE id = $1', [labId]);
    if (labCheck.rows[0].principal_researcher_id === userId) {
      return res.status(400).json({ error: 'Cannot remove the principal researcher from the lab' });
    }

    // Remove member
    const existingMember = await pool.query(
      'SELECT * FROM lab_members WHERE lab_id = $1 AND user_id = $2',
      [labId, userId]
    );

    if (existingMember.rows.length === 0) {
      return res.status(404).json({ error: 'Lab member not found' });
    }

    await pool.query(`
      DELETE FROM lab_members 
      WHERE lab_id = $1 AND user_id = $2
    `, [labId, userId]);

    console.log('👥 Lab member removed:', { labId, userId, removedBy: req.user.username });

    res.json({
      message: 'Member removed successfully',
      member: existingMember.rows[0]
    });

  } catch (error) {
    console.error('💥 Remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/labs/:id', authenticateToken, async (req, res) => {
  try {
    const { id: labId } = req.params;
    const {
      name,
      description,
      institution,
      department,
      contact_email,
      contact_phone,
      address,
      website_url,
      research_areas,
      looking_for,
      lab_type,
      established_year,
      showcase_tagline,
    } = req.body;

    const memberCheck = await pool.query(
      `SELECT role FROM lab_members WHERE lab_id = $1 AND user_id = $2`,
      [labId, req.user.id]
    );

    if (
      memberCheck.rows.length === 0 ||
      !['principal_researcher', 'admin'].includes(memberCheck.rows[0].role)
    ) {
      return res.status(403).json({ error: 'Insufficient permissions to edit lab' });
    }

    const existing = await pool.query('SELECT * FROM labs WHERE id = $1', [labId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }
    const cur = existing.rows[0];

    await pool.query(
      `UPDATE labs SET
        name = $1, description = $2, institution = $3, department = $4,
        contact_email = $5, contact_phone = $6, address = $7, website_url = $8,
        research_areas = $9, looking_for = $10, lab_type = $11, established_year = $12,
        showcase_tagline = $13, updated_at = CURRENT_TIMESTAMP
       WHERE id = $14`,
      [
        name ?? cur.name,
        description ?? cur.description,
        institution ?? cur.institution,
        department ?? cur.department,
        contact_email ?? cur.contact_email,
        contact_phone ?? cur.contact_phone,
        address ?? cur.address,
        website_url ?? cur.website_url,
        research_areas !== undefined ? toJsonList(research_areas) : cur.research_areas,
        looking_for !== undefined ? toJsonList(looking_for) : cur.looking_for,
        lab_type ?? cur.lab_type,
        established_year !== undefined
          ? established_year
            ? Number(established_year)
            : null
          : cur.established_year,
        showcase_tagline ?? cur.showcase_tagline,
        labId,
      ]
    );

    const updatedLab = await pool.query('SELECT * FROM labs WHERE id = $1', [labId]);
    res.json({ message: 'Lab updated successfully', lab: updatedLab.rows[0] });
  } catch (error) {
    console.error('💥 Update lab error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Publish or unpublish a lab on the Networking directory. */
app.put('/api/labs/:id/showcase', authenticateToken, async (req, res) => {
  try {
    const { id: labId } = req.params;
    const {
      isShowcased,
      tagline,
      researchAreas,
      lookingFor,
      address,
      website_url,
      description,
      department,
    } = req.body;

    const memberCheck = await pool.query(
      `SELECT role FROM lab_members WHERE lab_id = $1 AND user_id = $2 AND is_active = 1`,
      [labId, req.user.id]
    );

    if (
      memberCheck.rows.length === 0 ||
      !['principal_researcher', 'admin'].includes(memberCheck.rows[0].role)
    ) {
      return res.status(403).json({ error: 'Only lab admins can manage networking showcase' });
    }

    const existing = await pool.query('SELECT * FROM labs WHERE id = $1', [labId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Lab not found' });
    }
    const cur = existing.rows[0];
    const wantShowcase = Boolean(isShowcased);

    const nextTagline =
      tagline !== undefined ? String(tagline || '').trim() : cur.showcase_tagline || '';
    const nextAreas =
      researchAreas !== undefined ? parseJsonList(researchAreas) : parseJsonList(cur.research_areas);
    const nextLooking =
      lookingFor !== undefined ? parseJsonList(lookingFor) : parseJsonList(cur.looking_for);
    const nextDescription =
      description !== undefined ? description : cur.description;
    const nextDepartment = department !== undefined ? department : cur.department;
    const nextAddress = address !== undefined ? address : cur.address;
    const nextWebsite = website_url !== undefined ? website_url : cur.website_url;

    if (wantShowcase) {
      const hasPitch = Boolean(nextTagline) || Boolean(String(nextDescription || '').trim());
      const hasField =
        nextAreas.length > 0 || (nextDepartment && nextDepartment !== 'General');
      if (!hasPitch || !hasField) {
        return res.status(400).json({
          error:
            'To showcase your lab, add a short pitch (tagline or description) and at least one research field.',
        });
      }
    }

    // MySQL adapter maps each $n → ?; do not reuse the same $n twice.
    const showcasedAt = wantShowcase ? cur.showcased_at || new Date() : null;

    await pool.query(
      `UPDATE labs SET
        is_showcased = $1,
        showcased_at = $2,
        showcase_tagline = $3,
        research_areas = $4,
        looking_for = $5,
        description = $6,
        department = $7,
        address = $8,
        website_url = $9,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        wantShowcase ? 1 : 0,
        showcasedAt,
        nextTagline || null,
        toJsonList(nextAreas),
        toJsonList(nextLooking),
        nextDescription,
        nextDepartment,
        nextAddress,
        nextWebsite,
        labId,
      ]
    );

    const updated = await pool.query('SELECT * FROM labs WHERE id = $1', [labId]);
    const lab = updated.rows[0];
    res.json({
      message: wantShowcase ? 'Lab is now live on Networking' : 'Lab removed from Networking',
      lab: {
        ...lab,
        is_showcased: Boolean(Number(lab.is_showcased)),
        research_areas: parseJsonList(lab.research_areas),
        looking_for: parseJsonList(lab.looking_for),
      },
    });
  } catch (error: any) {
    console.error('💥 Showcase lab error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Protocol Management Routes
app.post('/api/protocols', authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      category, 
      difficulty_level, 
      estimated_duration, 
      materials, 
      content, 
      safety_notes, 
      tags, 
      lab_id,
      privacy_level = 'lab',
      video_url = null,
    } = req.body;

    // Validation
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    if (lab_id) {
      const membership = await assertActiveLabMember(pool, req.user.id, lab_id);
      if (!membership.ok) {
        return res.status(membership.status).json({ error: membership.error });
      }
    }

    // Create protocol
    const protocolId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO protocols (
        id, title, description, category, difficulty_level, estimated_duration, 
        materials, content, safety_notes, tags, lab_id, 
        author_id, privacy_level, is_approved, version, video_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      protocolId,
      title,
      description,
      category,
      difficulty_level,
      estimated_duration,
      JSON.stringify(normalizeArrayInput(materials)),
      content,
      safety_notes,
      JSON.stringify(normalizeArrayInput(tags)),
      lab_id,
      req.user.id,
      privacy_level,
      true,
      req.body.version || '1.0',
      video_url || null,
    ]);

    const protocolResult = await pool.query('SELECT * FROM protocols WHERE id = $1', [protocolId]);
    const protocol = protocolResult.rows[0];

    // Track activity for reference system
    try {
      await ActivityTracker.trackProtocolCreation(req.user.id, {
        id: protocol.id,
        title: title,
        steps: content ? content.split('\n').filter((line: string) => line.trim()) : [],
        materials: materials || [],
        complexity: difficulty_level
      });
    } catch (activityError) {
      console.error('Error tracking protocol activity:', activityError);
      // Don't fail the main request if activity tracking fails
    }

    // Auto-index for AI learning (non-blocking)
    autoIndexing.autoIndexContent(
      req.user.id,
      'protocol',
      protocol.id,
      protocol
    ).catch(err => console.error('Error auto-indexing protocol:', err));

    // Create initial sharing record with the lab
    try {
      await pool.query(`
        INSERT INTO protocol_sharing (protocol_id, shared_with_lab_id, permission_level)
        VALUES ($1, $2, $3)
      `, [protocol.id, lab_id, 'full_access']);
    } catch (shareError) {
      console.log('⚠️ Sharing record creation failed, but protocol was created:', shareError);
    }

    console.log('📋 Protocol created:', { protocolId: protocol.id, title: protocol.title, creator: req.user.username });

    res.status(201).json({
      message: 'Protocol created successfully',
      protocol
    });

  } catch (error) {
    console.error('💥 Protocol creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/protocols', authenticateToken, async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { lab_id, category, difficulty, search, privacy } = req.query;
    
    let query = `
      SELECT p.*, u.first_name, u.last_name, u.username as creator_name,
             l.name as lab_name, l.institution,
             0 as share_count
      FROM protocols p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN labs l ON p.lab_id = l.id
      WHERE p.is_approved = true
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Filter by lab
    if (lab_id) {
      paramCount++;
      query += ` AND p.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    // Filter by category
    if (category) {
      paramCount++;
      query += ` AND p.category = $${paramCount}`;
      params.push(category);
    }

    // Filter by difficulty
    if (difficulty) {
      paramCount++;
      query += ` AND p.difficulty_level = $${paramCount}`;
      params.push(difficulty);
    }

    // Search in title and description
    if (search) {
      paramCount++;
      query += ` AND (LOWER(p.title) LIKE $${paramCount} OR LOWER(p.description) LIKE $${paramCount})`;
      params.push(`%${String(search).toLowerCase()}%`);
    }

    // Filter by privacy level
    if (privacy) {
      paramCount++;
      query += ` AND p.privacy_level = $${paramCount}`;
      params.push(privacy);
    }

    // Owner, world-visible, or lab-visible rows for an active member. Account admin is not a bypass.
    paramCount++;
    const authorParam = paramCount;
    paramCount++;
    const memberParam = paramCount;
    query += ` AND (
      p.author_id = $${authorParam}
      OR p.privacy_level IN ('public', 'global')
      OR (
        p.lab_id IS NOT NULL
        AND COALESCE(p.privacy_level, 'lab') IN ('lab', 'shared', 'institution')
        AND p.lab_id IN (
          SELECT lab_id FROM lab_members WHERE user_id = $${memberParam} AND COALESCE(is_active, 1) = 1
        )
      )
    )`;
    params.push(req.user.id, req.user.id);

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ protocols: result.rows });
  } catch (error: any) {
    console.error('💥 Get protocols error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

app.use('/api/protocols/external/springer', authenticateToken, springerProtocolRoutes);
app.use('/api/protocols/external', authenticateToken, protocolsExternalRoutes);

app.get('/api/protocols/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get protocol details
    const protocolResult = await pool.query(`
      SELECT p.*, u.first_name, u.last_name, u.username as creator_name,
             l.name as lab_name, l.institution
      FROM protocols p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN labs l ON p.lab_id = l.id
      WHERE p.id = $1 AND p.is_approved = true
    `, [id]);

    if (protocolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    const protocol = protocolResult.rows[0];
    const protocolMember = protocol.lab_id
      ? await findActiveLabMembership(pool, req.user.id, protocol.lab_id)
      : null;
    const protocolRead = canReadLifecycleRecord({
      resource: 'protocol',
      userId: req.user.id,
      ownerId: protocol.author_id,
      labId: protocol.lab_id,
      privacyLevel: protocol.privacy_level,
      activeMember: Boolean(protocolMember),
    });
    if (!protocolRead.allowed) {
      return res.status(protocolRead.status).json({ error: 'Access denied to this protocol' });
    }

    // Get sharing information
    const sharingResult = await pool.query(`
      SELECT ps.*, l.name as lab_name, u.first_name, u.last_name, u.username
      FROM protocol_sharing ps
      LEFT JOIN labs l ON ps.shared_with_lab_id = l.id
      LEFT JOIN users u ON ps.shared_with_user_id = u.id
      WHERE ps.protocol_id = $1
    `, [id]);

    res.json({
      protocol,
      sharing: sharingResult.rows
    });

  } catch (error) {
    console.error('💥 Get protocol error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/protocols/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, category, difficulty_level, estimated_duration, 
      materials, content, safety_notes, tags, privacy_level, video_url
    } = req.body;

    // Get current protocol
    const currentProtocol = await pool.query(`
      SELECT * FROM protocols WHERE id = $1
    `, [id]);

    if (currentProtocol.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    const protocol = currentProtocol.rows[0];

    const canEditProtocol = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: protocol.author_id,
      labId: protocol.lab_id,
    });
    if (!canEditProtocol) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this protocol' });
    }

    // Update protocol (MySQL schema uses last_updated, not updated_at)
    await pool.query(`
      UPDATE protocols 
      SET title = $1, description = $2, category = $3, difficulty_level = $4,
          estimated_duration = $5, materials = $6, content = $7, safety_notes = $8,
          tags = $9, privacy_level = $10, video_url = $11, last_updated = CURRENT_TIMESTAMP
      WHERE id = $12
    `, [
      title, description, category, difficulty_level, estimated_duration,
      JSON.stringify(materials || []), content, safety_notes, JSON.stringify(tags || []), privacy_level,
      video_url || null,
      id
    ]);

    const updated = await pool.query('SELECT * FROM protocols WHERE id = $1', [id]);

    console.log('📋 Protocol updated:', { protocolId: id, title, updatedBy: req.user.username });

    res.json({
      message: 'Protocol updated successfully',
      protocol: updated.rows[0]
    });

  } catch (error) {
    console.error('💥 Update protocol error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/protocols/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get protocol
    const protocol = await pool.query(`
      SELECT * FROM protocols WHERE id = $1
    `, [id]);

    if (protocol.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    const protocolRow = protocol.rows[0];
    const canDeleteProtocol = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: protocolRow.author_id,
      labId: protocolRow.lab_id,
    });
    if (!canDeleteProtocol) {
      return res.status(403).json({ error: 'Insufficient permissions to delete this protocol' });
    }

    // Soft delete (mark as not approved) - MySQL schema uses last_updated
    await pool.query(`
      UPDATE protocols SET is_approved = false, last_updated = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);

    console.log('📋 Protocol deleted:', { protocolId: id, deletedBy: req.user.username });

    res.json({ message: 'Protocol deleted successfully' });

  } catch (error) {
    console.error('💥 Delete protocol error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/protocols/:id/share', authenticateToken, async (req, res) => {
  try {
    const { id: protocolId } = req.params;
    const { shared_with_user_id, shared_with_lab_id, permission_level } = req.body;

    // Get protocol
    const protocol = await pool.query(`
      SELECT * FROM protocols WHERE id = $1
    `, [protocolId]);

    if (protocol.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    const protocolRow = protocol.rows[0];
    const canShareProtocol = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: protocolRow.author_id,
      labId: protocolRow.lab_id,
    });
    if (!canShareProtocol) {
      return res.status(403).json({ error: 'Insufficient permissions to share this protocol' });
    }

    // Check if sharing already exists
    const existingShare = await pool.query(`
      SELECT * FROM protocol_sharing 
      WHERE protocol_id = $1 AND (
        (shared_with_user_id = $2 AND $2 IS NOT NULL) OR 
        (shared_with_lab_id = $3 AND $3 IS NOT NULL)
      )
    `, [protocolId, shared_with_user_id, shared_with_lab_id]);

    if (existingShare.rows.length > 0) {
      // Update existing share
      await pool.query(`
        UPDATE protocol_sharing 
        SET permission_level = $1, updated_at = CURRENT_TIMESTAMP
        WHERE protocol_id = $2 AND (
          (shared_with_user_id = $3 AND $3 IS NOT NULL) OR 
          (shared_with_lab_id = $4 AND $4 IS NOT NULL)
        )
      `, [permission_level, protocolId, shared_with_user_id, shared_with_lab_id]);
    } else {
      // Create new share
      await pool.query(`
        INSERT INTO protocol_sharing (protocol_id, shared_with_user_id, shared_with_lab_id, permission_level)
        VALUES ($1, $2, $3, $4)
      `, [protocolId, shared_with_user_id, shared_with_lab_id, permission_level]);
    }

    console.log('📋 Protocol shared:', { protocolId, sharedWithUser: shared_with_user_id, sharedWithLab: shared_with_lab_id, permissionLevel: permission_level, sharedBy: req.user.username });

    res.json({ message: 'Protocol shared successfully' });

  } catch (error) {
    console.error('💥 Share protocol error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/protocols/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category FROM protocols 
      WHERE is_approved = true AND category IS NOT NULL
      ORDER BY category
    `);

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('💥 Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Personal NoteBook Management Routes
const normalizeArrayInput = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return trimmed.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
    return trimmed.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [value];
};

const parseStoredArray = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [value];
};

app.post('/api/lab-notebooks', authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      entry_type, 
      objectives, 
      methodology, 
      results, 
      conclusions, 
      next_steps,
      lab_id,
      project_id,
      protocol_id,
      protocolId,
      experiment_id,
      experimentId,
      tags,
      privacy_level = 'lab',
      status = 'in_progress'
    } = req.body;

    // Validation - removed mandatory checks, only title required
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const linkedProtocolId = protocol_id || protocolId || null;
    const linkedExperimentId = experiment_id || experimentId || null;

    if (lab_id) {
      const membership = await assertActiveLabMember(pool, req.user.id, lab_id);
      if (!membership.ok) {
        return res.status(membership.status).json({ error: membership.error });
      }
    }

    // Create Personal NoteBook entry - include all fields from the form
    const entryId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO lab_notebook_entries (
        id, title, content, entry_type, status, priority, objectives, methodology, 
        results, conclusions, next_steps, lab_id, project_id, protocol_id, experiment_id, user_id, privacy_level, 
        tags, estimated_duration, actual_duration, cost, equipment_used, 
        materials_used, safety_notes, reference_list, collaborators
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    `, [
      entryId,
      title, 
      content, 
      entry_type || 'experiment', 
      req.body.status || 'planning',
      req.body.priority || 'medium',
      req.body.objectives || '',
      req.body.methodology || '',
      results || '', 
      conclusions || '', 
      next_steps || '',
      lab_id || null, 
      project_id || null,
      linkedProtocolId,
      linkedExperimentId,
      req.user.id, 
      privacy_level, 
      JSON.stringify(normalizeArrayInput(tags)),
      req.body.estimated_duration || 0,
      req.body.actual_duration || 0,
      req.body.cost || 0,
      JSON.stringify(normalizeArrayInput(req.body.equipment_used)),
      JSON.stringify(normalizeArrayInput(req.body.materials_used)),
      req.body.safety_notes || '',
      JSON.stringify(normalizeArrayInput(req.body.references)),
      JSON.stringify(normalizeArrayInput(req.body.collaborators))
    ]);

    const entryResult = await pool.query('SELECT * FROM lab_notebook_entries WHERE id = $1', [entryId]);
    const entry = entryResult.rows[0];

    console.log('📓 Personal NoteBook entry created:', { entryId: entry.id, title: entry.title, creator: req.user.username });

    // Auto-index for AI learning (non-blocking)
    autoIndexing.autoIndexContent(
      req.user.id,
      'lab_notebook_entry',
      entry.id,
      entry
    ).catch(err => console.error('Error auto-indexing Personal NoteBook:', err));

    res.status(201).json({
      message: 'Personal NoteBook entry created successfully',
      entry
    });

  } catch (error) {
    console.error('💥 Personal NoteBook creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lab-notebooks', authenticateToken, async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { lab_id, project_id, entry_type, search, tags, privacy } = req.query;
    const userId = req.user!.id;
    
    let query = `
      SELECT e.*, u.first_name, u.last_name, u.username as creator_name,
             l.name as lab_name, l.institution
      FROM lab_notebook_entries e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN labs l ON e.lab_id = l.id
      WHERE (
        e.user_id = $1
        OR e.privacy_level = 'public'
        OR (
          e.lab_id IS NOT NULL
          AND e.privacy_level IN ('lab', 'shared')
          AND e.lab_id IN (
            SELECT lab_id FROM lab_members WHERE user_id = $2 AND COALESCE(is_active, 1) = 1
          )
        )
      )
    `;

    const params: any[] = [userId, userId];
    let paramCount = 2;

    // Filter by lab — only if caller is a member (or owns entries there)
    if (lab_id) {
      const membership = await pool.query(
        `SELECT 1 AS ok FROM lab_members
         WHERE user_id = $1 AND lab_id = $2 AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        [userId, lab_id]
      );
      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this lab' });
      }
      paramCount++;
      query += ` AND e.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    // Filter by entry type
    if (entry_type) {
      paramCount++;
      query += ` AND e.entry_type = $${paramCount}`;
      params.push(entry_type);
    }

    // Search in title and content
    if (search) {
      paramCount++;
      query += ` AND (LOWER(e.title) LIKE $${paramCount} OR LOWER(e.content) LIKE $${paramCount})`;
      params.push(`%${String(search).toLowerCase()}%`);
    }

    if (privacy) {
      paramCount++;
      query += ` AND e.privacy_level = $${paramCount}`;
      params.push(privacy);
    }

    if (project_id) {
      paramCount++;
      query += ` AND e.project_id = $${paramCount}`;
      params.push(project_id);
    }

    if (tags) {
      paramCount++;
      query += ` AND e.tags LIKE $${paramCount}`;
      params.push(`%${tags}%`);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ entries: result.rows });
  } catch (error: any) {
    console.error('💥 Get Personal NoteBooks error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

// Get recent activity for Personal NoteBook
app.get('/api/lab-notebooks/activity', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get recent activities from Personal NoteBook entries
    const activities = await pool.query(`
      SELECT 
        'entry_created' as type,
        CONCAT('Created Personal NoteBook entry: ', e.title) as description,
        u.username as user_name,
        e.created_at as timestamp,
        'entry' as category
      FROM lab_notebook_entries e
      JOIN users u ON e.user_id = u.id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2
    `, [req.user.id, limit]);

    // Format activities for frontend
    const formattedActivities = activities.rows.map(activity => ({
      id: `activity_${activity.timestamp}`,
      type: activity.type,
      description: activity.description,
      user_name: activity.user_name,
      timestamp: activity.timestamp,
      category: activity.category
    }));

    res.json({ activities: formattedActivities });
  } catch (error) {
    console.error('💥 Get activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get smart suggestions for Personal NoteBook
app.get('/api/lab-notebooks/suggestions', authenticateToken, async (req, res) => {
  try {
    const suggestions = [];
    
    // Get user's recent entries to generate suggestions
    const recentEntries = await pool.query(`
      SELECT title, content, entry_type, tags, equipment_used, materials_used
      FROM lab_notebook_entries 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 5
    `, [req.user.id]);

    // Generate rule-based suggestions
    for (const entry of recentEntries.rows) {
      const materials = parseStoredArray(entry.materials_used);
      const equipment = parseStoredArray(entry.equipment_used);
      // Protocol suggestions based on content
      if (entry.content && entry.content.toLowerCase().includes('dna')) {
        suggestions.push({
          id: `suggestion_${entry.title}_protocol`,
          type: 'protocol',
          title: 'Protocol Recommendation',
          description: 'Consider using PCR protocol for DNA amplification based on your recent work',
          confidence: 85,
          priority: 'medium'
        });
      }
      
      // Safety suggestions based on materials
      if (materials.some((material: string) =>
        material.toLowerCase().includes('acid') || material.toLowerCase().includes('chemical'))) {
        suggestions.push({
          id: `suggestion_${entry.title}_safety`,
          type: 'safety',
          title: 'Safety Reminder',
          description: 'Remember to wear appropriate PPE when handling chemicals',
          confidence: 95,
          priority: 'high'
        });
      }
      
      // Equipment suggestions
      if (equipment.length > 0) {
        suggestions.push({
          id: `suggestion_${entry.title}_equipment`,
          type: 'equipment',
          title: 'Equipment Optimization',
          description: 'Consider booking equipment in advance for similar experiments',
          confidence: 75,
          priority: 'low'
        });
      }
    }

    // Add general suggestions if no specific ones found
    if (suggestions.length === 0) {
      suggestions.push(
        {
          id: 'suggestion_general_1',
          type: 'protocol',
          title: 'Protocol Recommendation',
          description: 'Consider documenting your experimental protocols for future reference',
          confidence: 80,
          priority: 'medium'
        },
        {
          id: 'suggestion_general_2',
          type: 'safety',
          title: 'Safety Reminder',
          description: 'Always review safety protocols before starting new experiments',
          confidence: 90,
          priority: 'high'
        }
      );
    }

    res.json({ suggestions: suggestions.slice(0, 5) });
  } catch (error) {
    console.error('💥 Get suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lab-notebooks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get entry details
    const entryResult = await pool.query(`
      SELECT e.*, u.first_name, u.last_name, u.username as creator_name,
             l.name as lab_name, l.institution
      FROM lab_notebook_entries e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN labs l ON e.lab_id = l.id
      WHERE e.id = $1
    `, [id]);

    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }

    const entry = entryResult.rows[0];
    const entryMember = entry.lab_id
      ? await findActiveLabMembership(pool, req.user.id, entry.lab_id)
      : null;
    const entryRead = canReadLifecycleRecord({
      resource: 'notebook',
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
      privacyLevel: entry.privacy_level,
      activeMember: Boolean(entryMember),
    });
    if (!entryRead.allowed) {
      return res.status(entryRead.status).json({ error: 'Access denied to this entry' });
    }

    res.json({
      entry,
      related_data: []
    });

  } catch (error) {
    console.error('💥 Get Personal NoteBook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/lab-notebooks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, content, entry_type, results, conclusions, next_steps,
      tags, privacy_level 
    } = req.body;

    // Get current entry
    const currentEntry = await pool.query(`
      SELECT * FROM lab_notebook_entries WHERE id = $1
    `, [id]);

    if (currentEntry.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }

    const entry = currentEntry.rows[0];

    const canEditEntry = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
    });
    if (!canEditEntry) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this entry' });
    }

    // Update entry with all fields
    await pool.query(`
      UPDATE lab_notebook_entries 
      SET title = $1, content = $2, entry_type = $3, status = $4, priority = $5,
          objectives = $6, methodology = $7, results = $8, conclusions = $9, 
          next_steps = $10, tags = $11, privacy_level = $12, estimated_duration = $13,
          actual_duration = $14, cost = $15, equipment_used = $16, materials_used = $17,
          safety_notes = $18, reference_list = $19, collaborators = $20,
          protocol_id = COALESCE($21, protocol_id),
          experiment_id = COALESCE($22, experiment_id),
          project_id = COALESCE($23, project_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $24
    `, [
      title, content, entry_type, req.body.status || 'draft', req.body.priority || 'medium',
      req.body.objectives || '', req.body.methodology || '', results, conclusions, next_steps,
      JSON.stringify(normalizeArrayInput(tags)),
      privacy_level, req.body.estimated_duration || 0, req.body.actual_duration || 0,
      req.body.cost || 0,
      JSON.stringify(normalizeArrayInput(req.body.equipment_used)),
      JSON.stringify(normalizeArrayInput(req.body.materials_used)),
      req.body.safety_notes || '',
      JSON.stringify(normalizeArrayInput(req.body.references)),
      JSON.stringify(normalizeArrayInput(req.body.collaborators)),
      req.body.protocol_id || req.body.protocolId || null,
      req.body.experiment_id || req.body.experimentId || null,
      req.body.project_id || null,
      id
    ]);

    const updatedResult = await pool.query('SELECT * FROM lab_notebook_entries WHERE id = $1', [id]);

    console.log('📓 Personal NoteBook entry updated:', { entryId: id, title, updatedBy: req.user.username });

    res.json({
      message: 'Personal NoteBook entry updated successfully',
      entry: updatedResult.rows[0]
    });

  } catch (error) {
    console.error('💥 Update Personal NoteBook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Personal NoteBook entry
app.delete('/api/lab-notebooks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current entry
    const currentEntry = await pool.query(`
      SELECT * FROM lab_notebook_entries WHERE id = $1
    `, [id]);

    if (currentEntry.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }

    const entry = currentEntry.rows[0];

    const canDeleteEntry = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
    });
    if (!canDeleteEntry) {
      return res.status(403).json({ error: 'Insufficient permissions to delete this entry' });
    }

    // Delete entry
    await pool.query(`
      DELETE FROM lab_notebook_entries WHERE id = $1
    `, [id]);

    console.log('📓 Personal NoteBook entry deleted:', { entryId: id, deletedBy: req.user.username });

    res.json({
      message: 'Personal NoteBook entry deleted successfully'
    });

  } catch (error) {
    console.error('💥 Delete Personal NoteBook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Share Personal NoteBook entry with individual users
app.post('/api/lab-notebooks/:id/share', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, access_level } = req.body;

    // Check if entry exists
    const entryResult = await pool.query(`
      SELECT * FROM lab_notebook_entries WHERE id = $1
    `, [id]);

    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }

    const entry = entryResult.rows[0];

    const canShareEntry = await assertCanWriteLifecycleRecord(pool, {
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
    });
    if (!canShareEntry) {
      return res.status(403).json({ error: 'Insufficient permissions to share this entry' });
    }

    // Get current collaborators or initialize empty array
    const currentCollaborators = parseStoredArray(entry.collaborators);
    
    // Add new user to collaborators if not already present
    if (!currentCollaborators.includes(user_id)) {
      currentCollaborators.push(user_id);
    }

    // Update entry with new collaborators
    await pool.query(`
      UPDATE lab_notebook_entries 
      SET collaborators = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(currentCollaborators), id]);

    // Get user details for logging
    const userResult = await pool.query(`
      SELECT username, first_name, last_name FROM users WHERE id = $1
    `, [user_id]);

    const userName = userResult.rows[0]?.username || 'Unknown User';

    console.log('🔗 Personal NoteBook entry shared:', { 
      entryId: id, 
      userId: user_id, 
      userName: userName,
      accessLevel: access_level, 
      sharedBy: req.user.username 
    });

    res.json({ 
      message: 'Entry shared successfully',
      shared_with: userName,
      access_level 
    });

  } catch (error) {
    console.error('💥 Share Personal NoteBook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lab members for the current user's lab
app.get('/api/lab-members', authenticateToken, async (req, res) => {
  try {
    // Get the user's lab membership
    const userLab = await pool.query(`
      SELECT lm.lab_id, l.name as lab_name, l.institution
      FROM lab_members lm
      JOIN labs l ON lm.lab_id = l.id
      WHERE lm.user_id = $1 AND lm.is_active = true
      LIMIT 1
    `, [req.user.id]);

    if (userLab.rows.length === 0) {
      return res.json({ members: [] });
    }

    const labId = userLab.rows[0].lab_id;

    // Get all lab members with user details
    const membersResult = await pool.query(`
      SELECT 
        lm.id,
        lm.user_id,
        lm.role,
        lm.joined_at,
        lm.permissions,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url
      FROM lab_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.lab_id = $1 AND lm.is_active = true
      ORDER BY 
        CASE lm.role
          WHEN 'principal_researcher' THEN 1
          WHEN 'co_supervisor' THEN 2
          WHEN 'researcher' THEN 3
          WHEN 'student' THEN 4
          ELSE 5
        END,
        u.first_name, u.last_name
    `, [labId]);

    res.json({ 
      members: membersResult.rows,
      lab: {
        id: labId,
        name: userLab.rows[0].lab_name,
        institution: userLab.rows[0].institution
      }
    });

  } catch (error) {
    console.error('💥 Get lab members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/lab-notebooks/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id: entryId } = req.params;
    const { comment_text, parent_comment_id } = req.body;

    // Check if entry exists and user has access
    const entryAccess = await pool.query(`
      SELECT e.id, e.privacy_level, e.lab_id, e.user_id
      FROM lab_notebook_entries e
      WHERE e.id = $1 AND e.id IS NOT NULL
    `, [entryId]);

    if (entryAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }

    const entry = entryAccess.rows[0];
    const commentMember = entry.lab_id
      ? await findActiveLabMembership(pool, req.user.id, entry.lab_id)
      : null;
    const commentRead = canReadLifecycleRecord({
      resource: 'notebook',
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
      privacyLevel: entry.privacy_level,
      activeMember: Boolean(commentMember),
    });
    if (!commentRead.allowed) {
      return res.status(commentRead.status).json({ error: 'Access denied to this entry' });
    }

    // Create comment
    const commentId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO lab_notebook_comments (
        id, entry_id, user_id, comment_text, parent_comment_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `, [commentId, entryId, req.user.id, comment_text, parent_comment_id || null]);

    const commentResult = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.username
       FROM lab_notebook_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [commentId]
    );

    console.log('💬 Comment added to Personal NoteBook:', { entryId, commentId, user: req.user.username });

    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentResult.rows[0]
    });

  } catch (error) {
    console.error('💥 Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lab-notebooks/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id: entryId } = req.params;
    const entryAccess = await pool.query(
      `SELECT id, privacy_level, lab_id, user_id FROM lab_notebook_entries WHERE id = $1`,
      [entryId]
    );
    if (entryAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Personal NoteBook entry not found' });
    }
    const entry = entryAccess.rows[0];
    const commentMember = entry.lab_id
      ? await findActiveLabMembership(pool, req.user.id, entry.lab_id)
      : null;
    const commentRead = canReadLifecycleRecord({
      resource: 'notebook',
      userId: req.user.id,
      ownerId: entry.user_id,
      labId: entry.lab_id,
      privacyLevel: entry.privacy_level,
      activeMember: Boolean(commentMember),
    });
    if (!commentRead.allowed) {
      return res.status(commentRead.status).json({ error: 'Access denied to this entry' });
    }

    const result = await pool.query(`
      SELECT c.*, u.first_name, u.last_name, u.username
      FROM lab_notebook_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.entry_id = $1 AND c.id IS NOT NULL
      ORDER BY c.created_at ASC
    `, [entryId]);

    res.json({ comments: result.rows });
  } catch (error) {
    console.error('💥 Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lab-notebooks/entry-types', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT entry_type FROM lab_notebook_entries 
      WHERE entry_type IS NOT NULL AND entry_type != ''
      ORDER BY entry_type
    `);

    res.json({ entry_types: result.rows.map(row => row.entry_type) });
  } catch (error) {
    console.error('💥 Get entry types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lab-notebooks/statistics', authenticateToken, async (req, res) => {
  try {
    const { lab_id, user_id, time_period } = req.query;
    
    let whereClause = 'WHERE e.id IS NOT NULL';
    const params: any[] = [];
    let paramCount = 0;

    if (lab_id) {
      paramCount++;
      whereClause += ` AND e.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    if (user_id) {
      paramCount++;
      whereClause += ` AND e.user_id = $${paramCount}`;
      params.push(user_id);
    }

    if (time_period === 'week') {
      whereClause += ` AND e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    } else if (time_period === 'month') {
      whereClause += ` AND e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
    } else if (time_period === 'year') {
      whereClause += ` AND e.created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)`;
    }

    // Get total entries
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM lab_notebook_entries e ${whereClause}
    `, params);

    // Get entries by entry type
    const typeResult = await pool.query(`
      SELECT entry_type, COUNT(*) as count 
      FROM lab_notebook_entries e ${whereClause}
      GROUP BY entry_type
      ORDER BY count DESC
      LIMIT 5
    `, params);

    res.json({
      total_entries: parseInt(totalResult.rows[0].total),
      by_entry_type: typeResult.rows
    });

  } catch (error) {
    console.error('💥 Get statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quick Notes Management Routes
app.post('/api/quick-notes', authenticateToken, async (req, res) => {
  try {
    const { content, color = 'yellow' } = req.body;
    console.log('📝 Creating quick note for user:', req.user.id, 'content:', content);
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const noteId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO quick_notes (id, user_id, content, color)
      VALUES ($1, $2, $3, $4)
    `, [noteId, req.user.id, content.trim(), color]);

    const noteResult = await pool.query('SELECT * FROM quick_notes WHERE id = $1', [noteId]);
    console.log('✅ Quick note created:', noteResult.rows[0]);
    res.status(201).json(noteResult.rows[0]);
  } catch (error) {
    console.error('💥 Create quick note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/quick-notes', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching quick notes for user:', req.user.id);
    const result = await pool.query(`
      SELECT * FROM quick_notes 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    console.log('📝 Found quick notes:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('💥 Get quick notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/quick-notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, color } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    await pool.query(`
      UPDATE quick_notes 
      SET content = $1, color = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND user_id = $4
    `, [content.trim(), color, id, req.user.id]);

    const updatedResult = await pool.query(
      'SELECT * FROM quick_notes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (updatedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quick note not found' });
    }

    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('💥 Update quick note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/quick-notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existingResult = await pool.query(
      'SELECT id FROM quick_notes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quick note not found' });
    }

    await pool.query(`
      DELETE FROM quick_notes 
      WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);

    res.json({ message: 'Quick note deleted successfully' });
  } catch (error) {
    console.error('💥 Delete quick note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calendar Events Management Routes
app.post('/api/calendar-events', authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      event_date, 
      event_time, 
      event_type = 'meeting', 
      priority = 'medium', 
      color = 'blue',
      is_all_day = false
    } = req.body;
    
    console.log('📅 Creating calendar event for user:', req.user.id, 'title:', title);
    console.log('📅 Request body:', req.body);
    
    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and event_date are required' });
    }

    const result = await pool.query(`
      INSERT INTO calendar_events (user_id, title, description, start_time, end_time, event_type, all_day)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, title, description, event_date, event_time, event_type, is_all_day]);

    console.log('✅ Calendar event created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('💥 Create calendar event error:', error);
    console.error('Error details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/calendar-events', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching calendar events for user:', req.user.id);
  const result = await pool.query(`
    SELECT * FROM calendar_events 
    WHERE user_id = $1 
    ORDER BY start_time ASC
  `, [req.user.id]);

    console.log('📅 Found calendar events:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('💥 Get calendar events error:', error);
    console.error('Error details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/calendar-events/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      event_date, 
      event_time, 
      event_type, 
      priority, 
      color,
      is_all_day
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and event_date are required' });
    }

    const result = await pool.query(`
      UPDATE calendar_events 
      SET title = $1, description = $2, start_time = $3, end_time = $4, 
          event_type = $5, all_day = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND user_id = $8
      RETURNING *
    `, [title, description, event_date, event_time, event_type, is_all_day, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('💥 Update calendar event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/calendar-events/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM calendar_events 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    res.json({ message: 'Calendar event deleted successfully' });
  } catch (error) {
    console.error('💥 Delete calendar event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Inventory Management Routes
app.post('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      category, 
      quantity, 
      unit, 
      min_quantity, 
      location, 
      lab_id,
      supplier,
      supplier_contact,
      expiry_date,
      cost_per_unit,
      storage_conditions,
      notes
    } = req.body;

    // Validation
    if (!name || !category || !lab_id) {
      return res.status(400).json({ error: 'Name, category, and lab_id are required' });
    }

    // Check if user has access to the lab
    const labAccess = await pool.query(`
      SELECT role FROM lab_members WHERE lab_id = $1 AND user_id = $2
    `, [lab_id, req.user.id]);

    if (labAccess.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this lab' });
    }

    // Create inventory item
    const result = await pool.query(`
      INSERT INTO inventory_items (
        name, description, category, quantity, unit, min_quantity,
        location, lab_id, supplier, supplier_contact, expiry_date, cost_per_unit,
        storage_conditions, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, description, category, quantity || 0, unit, min_quantity || 0,
      location, lab_id, supplier, supplier_contact, expiry_date, cost_per_unit,
      storage_conditions, notes
    ]);

    const item = result.rows[0];

    console.log('📦 Inventory item created:', { itemId: item.id, name: item.name, creator: req.user.username });

    res.status(201).json({
      message: 'Inventory item created successfully',
      item
    });

  } catch (error) {
    console.error('💥 Inventory creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { lab_id, category, search, low_stock, expired } = req.query;
    
    let query = `
      SELECT i.*,
             COALESCE(i.quantity_value, i.quantity) as quantity,
             COALESCE(i.low_stock_threshold, i.min_quantity) as min_quantity,
             COALESCE(i.expiration_date, i.expiry_date) as expiry_date,
             COALESCE(i.type, i.category) as category,
             l.name as lab_name
      FROM inventory_items i
      LEFT JOIN labs l ON i.lab_id = l.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Filter by lab
    if (lab_id) {
      paramCount++;
      query += ` AND i.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    // Filter by category / type
    if (category) {
      paramCount++;
      query += ` AND (i.category = $${paramCount} OR i.type = $${paramCount})`;
      params.push(category);
    }

    // Search in name and description
    if (search) {
      paramCount++;
      query += ` AND (LOWER(i.name) LIKE $${paramCount} OR LOWER(COALESCE(i.description, '')) LIKE $${paramCount})`;
      params.push(`%${String(search).toLowerCase()}%`);
    }

    // Filter low stock items
    if (low_stock === 'true') {
      query += ` AND COALESCE(i.quantity_value, i.quantity, 0) <= COALESCE(i.low_stock_threshold, i.min_quantity, 0)`;
    }

    // Filter expired items
    if (expired === 'true') {
      query += ` AND COALESCE(i.expiration_date, i.expiry_date) < CURRENT_DATE`;
    }

    // If not admin, only show items from labs where user is a member (or unassigned)
    if (req.user.role !== 'admin') {
      paramCount++;
      query += ` AND (i.lab_id IS NULL OR i.lab_id IN (
        SELECT lab_id FROM lab_members WHERE user_id = $${paramCount} AND is_active = true
      ))`;
      params.push(req.user.id);
    }

    query += ' ORDER BY i.name ASC';

    const result = await pool.query(query, params);

    res.json({ items: result.rows });
  } catch (error: any) {
    console.error('💥 Get inventory error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

app.put('/api/inventory/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, description, category, quantity, unit, min_quantity,
      location, supplier, supplier_contact, expiry_date, cost_per_unit, storage_conditions, notes
    } = req.body;

    // Get current item
    const currentItem = await pool.query(`
      SELECT * FROM inventory_items WHERE id = $1
    `, [id]);

    if (currentItem.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const item = currentItem.rows[0];

    // Check permissions (lab PI or admin)
    if (req.user.role !== 'admin') {
      const labAccess = await pool.query(`
        SELECT role FROM lab_members 
        WHERE lab_id = $1 AND user_id = $2 AND role = 'principal_researcher'
      `, [item.lab_id, req.user.id]);

      if (labAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions to edit this item' });
      }
    }

    // Update item
    const result = await pool.query(`
      UPDATE inventory_items 
      SET name = $1, description = $2, category = $3, quantity = $4,
          unit = $5, min_quantity = $6, location = $7, supplier = $8,
          supplier_contact = $9, expiry_date = $10, cost_per_unit = $11, 
          storage_conditions = $12, notes = $13, updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *
    `, [
      name, description, category, quantity, unit, min_quantity || 0,
      location, supplier, supplier_contact, expiry_date, cost_per_unit, storage_conditions, notes, id
    ]);

    console.log('📦 Inventory item updated:', { itemId: id, name, updatedBy: req.user.username });

    res.json({
      message: 'Inventory item updated successfully',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('💥 Update inventory error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/inventory/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get item
    const item = await pool.query(`
      SELECT * FROM inventory_items WHERE id = $1
    `, [id]);

    if (item.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check permissions (lab PI or admin)
    if (req.user.role !== 'admin') {
      const labAccess = await pool.query(`
        SELECT role FROM lab_members 
        WHERE lab_id = $1 AND user_id = $2 AND role = 'principal_researcher'
      `, [item.rows[0].lab_id, req.user.id]);

      if (labAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions to delete this item' });
      }
    }

    // Hard delete (since there's no is_active column)
    await pool.query(`
      DELETE FROM inventory_items WHERE id = $1
    `, [id]);

    console.log('📦 Inventory item deleted:', { itemId: id, deletedBy: req.user.username });

    res.json({ message: 'Inventory item deleted successfully' });

  } catch (error) {
    console.error('💥 Delete inventory error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/inventory/:id/transactions', authenticateToken, async (req, res) => {
  try {
    const { id: itemId } = req.params;
    const { transaction_type, quantity, notes, recipient_user_id } = req.body;

    // Validation
    if (!transaction_type || !quantity) {
      return res.status(400).json({ error: 'Transaction type and quantity are required' });
    }

    // Get item
    const item = await pool.query(`
      SELECT * FROM inventory_items WHERE id = $1
    `, [itemId]);

    if (item.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const currentItem = item.rows[0];

    // Check access permissions
    const labAccess = await pool.query(`
      SELECT role FROM lab_members WHERE lab_id = $1 AND user_id = $2
    `, [currentItem.lab_id, req.user.id]);

    if (labAccess.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this item' });
    }

    // Calculate new quantity
    let newQuantity = currentItem.quantity;
    if (transaction_type === 'add') {
      newQuantity += quantity;
    } else if (transaction_type === 'remove') {
      if (newQuantity < quantity) {
        return res.status(400).json({ error: 'Insufficient quantity available' });
      }
      newQuantity -= quantity;
    }

    // Update item quantity
    await pool.query(`
      UPDATE inventory_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [newQuantity, itemId]);

    // Note: We don't have inventory_transactions table, so we'll just log this
    console.log('📦 Inventory transaction recorded:', { 
      itemId, transactionType: transaction_type, quantity, user: req.user.username, newQuantity 
    });

    res.status(201).json({
      message: 'Transaction recorded successfully',
      new_quantity: newQuantity
    });

  } catch (error) {
    console.error('💥 Inventory transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/inventory/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category FROM inventory_items 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('💥 Get inventory categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Instrument Management Routes
app.post('/api/instruments', authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      category, 
      model, 
      serial_number, 
      lab_id,
      location,
      status = 'available',
      manufacturer,
      purchase_date,
      warranty_expiry,
      calibration_due_date,
      maintenance_notes,
      user_manual_url
    } = req.body;

    // Validation
    if (!name || !category || !lab_id) {
      return res.status(400).json({ error: 'Name, category, and lab_id are required' });
    }

    // Check if user has access to the lab
    const labAccess = await pool.query(`
      SELECT role FROM lab_members WHERE lab_id = $1 AND user_id = $2
    `, [lab_id, req.user.id]);

    if (labAccess.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this lab' });
    }

    // Create instrument
    const result = await pool.query(`
      INSERT INTO instruments (
        name, description, category, model, serial_number, lab_id,
        location, status, manufacturer, purchase_date, warranty_expiry,
        calibration_due_date, maintenance_notes, user_manual_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, description, category, model, serial_number, lab_id,
      location, status, manufacturer, purchase_date, warranty_expiry,
      calibration_due_date, maintenance_notes, user_manual_url
    ]);

    const instrument = result.rows[0];

    console.log('🔬 Instrument created:', { instrumentId: instrument.id, name: instrument.name, creator: req.user.username });

    res.status(201).json({
      message: 'Instrument created successfully',
      instrument
    });

  } catch (error) {
    console.error('💥 Instrument creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments', authenticateToken, async (req, res) => {
  try {
    const { lab_id, category, status, search } = req.query;
    
    let query = `
      SELECT i.*, l.name as lab_name
      FROM instruments i
      JOIN labs l ON i.lab_id = l.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Filter by lab
    if (lab_id) {
      paramCount++;
      query += ` AND i.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    // Filter by category
    if (category) {
      paramCount++;
      query += ` AND i.category = $${paramCount}`;
      params.push(category);
    }

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
    }

    // Search in name and description
    if (search) {
      paramCount++;
      query += ` AND (i.name ILIKE $${paramCount} OR i.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // If not admin, only show instruments from labs where user is a member
    if (req.user.role !== 'admin') {
      paramCount++;
      query += ` AND i.lab_id IN (
        SELECT lab_id FROM lab_members WHERE user_id = $${paramCount}
      )`;
      params.push(req.user.id);
    }

    query += ' ORDER BY i.name ASC';

    const result = await pool.query(query, params);

    res.json({ instruments: result.rows });
  } catch (error: any) {
    console.error('💥 Get instruments error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/instruments/:id/bookings', authenticateToken, async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const { start_time, end_time, purpose, notes } = req.body;

    // Validation
    if (!start_time || !end_time || !purpose) {
      return res.status(400).json({ error: 'Start time, end time, and purpose are required' });
    }

    // Check if instrument exists and is available
    const instrument = await pool.query(`
      SELECT * FROM instruments WHERE id = $1
    `, [instrumentId]);

    if (instrument.rows.length === 0) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    if (instrument.rows[0].status !== 'available') {
      return res.status(400).json({ error: 'Instrument is not available for booking' });
    }

    // Check for conflicting bookings
    const conflictingBookings = await pool.query(`
      SELECT * FROM instrument_bookings 
      WHERE instrument_id = $1
      AND (
        (start_time <= $2 AND end_time >= $2) OR
        (start_time <= $3 AND end_time >= $3) OR
        (start_time >= $2 AND end_time <= $3)
      )
    `, [instrumentId, start_time, end_time]);

    if (conflictingBookings.rows.length > 0) {
      return res.status(400).json({ error: 'Time slot conflicts with existing booking' });
    }

    // Create booking
    const result = await pool.query(`
      INSERT INTO instrument_bookings (
        instrument_id, user_id, start_time, end_time, purpose, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [instrumentId, req.user.id, start_time, end_time, purpose, notes]);

    // Update instrument status to booked
    await pool.query(`
      UPDATE instruments SET status = 'booked', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [instrumentId]);

    console.log('🔬 Instrument booking created:', { 
      instrumentId, bookingId: result.rows[0].id, user: req.user.username 
    });

    res.status(201).json({
      message: 'Booking created successfully',
      booking: result.rows[0]
    });

  } catch (error) {
    console.error('💥 Instrument booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments/:id/bookings', authenticateToken, async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT b.*, u.first_name, u.last_name, u.username
      FROM instrument_bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.instrument_id = $1
    `;

    const params: any[] = [instrumentId];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND b.start_time >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND b.end_time <= $${paramCount}`;
      params.push(end_date);
    }

    query += ' ORDER BY b.start_time ASC';

    const result = await pool.query(query, params);

    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('💥 Get instrument bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category FROM instruments 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('💥 Get instrument categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule instrument maintenance
app.post('/api/instruments/:id/maintenance', authenticateToken, async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const {
      type, title, description, scheduled_date, priority,
      assigned_to, estimated_duration, cost, parts_used, notes, checklist
    } = req.body;

    // Validation
    if (!type || !title || !scheduled_date) {
      return res.status(400).json({ error: 'Type, title, and scheduled date are required' });
    }

    // Check if instrument exists
    const instrument = await pool.query(`
      SELECT * FROM instruments WHERE id = $1
    `, [instrumentId]);

    if (instrument.rows.length === 0) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin') {
      const labAccess = await pool.query(`
        SELECT role FROM lab_members 
        WHERE lab_id = $1 AND user_id = $2
      `, [instrument.rows[0].lab_id, req.user.id]);

      if (labAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions to schedule maintenance' });
      }
    }

    // Create maintenance record
    const result = await pool.query(`
      INSERT INTO instrument_maintenance (
        instrument_id, type, title, description, scheduled_date, priority,
        assigned_to, estimated_duration, cost, parts_used, notes, checklist,
        created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'scheduled')
      RETURNING *
    `, [
      instrumentId, type, title, description, scheduled_date, priority,
      assigned_to || null, estimated_duration || 60, cost || 0,
      parts_used || [], notes || '', JSON.stringify(checklist || []), req.user.id
    ]);

    // Update instrument status if critical maintenance
    if (priority === 'critical' || priority === 'high') {
      await pool.query(`
        UPDATE instruments SET status = 'maintenance', updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [instrumentId]);
    }

    console.log('🔧 Maintenance scheduled:', { 
      instrumentId, maintenanceId: result.rows[0].id, type, scheduledBy: req.user.username 
    });

    res.status(201).json({
      message: 'Maintenance scheduled successfully',
      maintenance: result.rows[0]
    });

  } catch (error) {
    console.error('💥 Schedule maintenance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get instrument maintenance records
app.get('/api/instruments/:id/maintenance', authenticateToken, async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const { status, limit = 50 } = req.query;

    let query = `
      SELECT 
        m.*,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        creator.first_name || ' ' || creator.last_name as created_by_name
      FROM instrument_maintenance m
      LEFT JOIN users u ON m.assigned_to = u.id
      LEFT JOIN users creator ON m.created_by = creator.id
      WHERE m.instrument_id = $1
    `;

    const params: any[] = [instrumentId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND m.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY m.scheduled_date DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({ maintenance: result.rows });
  } catch (error) {
    console.error('💥 Get maintenance records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update instrument
app.put('/api/instruments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, description, category, model, serial_number,
      location, status, manufacturer, purchase_date, warranty_expiry,
      calibration_due_date, maintenance_notes, user_manual_url
    } = req.body;

    // Get current instrument
    const currentInstrument = await pool.query(`
      SELECT * FROM instruments WHERE id = $1
    `, [id]);

    if (currentInstrument.rows.length === 0) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const instrument = currentInstrument.rows[0];

    // Check permissions (lab member or admin)
    if (req.user.role !== 'admin') {
      const labAccess = await pool.query(`
        SELECT role FROM lab_members 
        WHERE lab_id = $1 AND user_id = $2
      `, [instrument.lab_id, req.user.id]);

      if (labAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions to edit this instrument' });
      }
    }

    // Update instrument
    const result = await pool.query(`
      UPDATE instruments 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          category = COALESCE($3, category),
          model = COALESCE($4, model),
          serial_number = COALESCE($5, serial_number),
          location = COALESCE($6, location),
          status = COALESCE($7, status),
          manufacturer = COALESCE($8, manufacturer),
          purchase_date = COALESCE($9, purchase_date),
          warranty_expiry = COALESCE($10, warranty_expiry),
          calibration_due_date = COALESCE($11, calibration_due_date),
          maintenance_notes = COALESCE($12, maintenance_notes),
          user_manual_url = COALESCE($13, user_manual_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *
    `, [
      name, description, category, model, serial_number,
      location, status, manufacturer, purchase_date, warranty_expiry,
      calibration_due_date, maintenance_notes, user_manual_url, id
    ]);

    console.log('🔬 Instrument updated:', { instrumentId: id, name, updatedBy: req.user.username });

    res.json({
      message: 'Instrument updated successfully',
      instrument: result.rows[0]
    });

  } catch (error) {
    console.error('💥 Update instrument error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete instrument
app.delete('/api/instruments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get instrument
    const instrument = await pool.query(`
      SELECT * FROM instruments WHERE id = $1
    `, [id]);

    if (instrument.rows.length === 0) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    // Check permissions (lab PI or admin)
    if (req.user.role !== 'admin') {
      const labAccess = await pool.query(`
        SELECT role FROM lab_members 
        WHERE lab_id = $1 AND user_id = $2 AND role = 'principal_researcher'
      `, [instrument.rows[0].lab_id, req.user.id]);

      if (labAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Insufficient permissions to delete this instrument' });
      }
    }

    // Check for active bookings
    const activeBookings = await pool.query(`
      SELECT id FROM instrument_bookings 
      WHERE instrument_id = $1 AND status IN ('pending', 'approved')
    `, [id]);

    if (activeBookings.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete instrument with active bookings. Please cancel bookings first.' 
      });
    }

    // Hard delete
    await pool.query(`
      DELETE FROM instruments WHERE id = $1
    `, [id]);

    console.log('🔬 Instrument deleted:', { instrumentId: id, deletedBy: req.user.username });

    res.json({ message: 'Instrument deleted successfully' });

  } catch (error) {
    console.error('💥 Delete instrument error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== RESOURCE EXCHANGE (SUPPLIES) =====
app.post('/api/exchange/requests', authenticateToken, async (req, res) => {
  try {
    const {
      item_name,
      category,
      quantity,
      unit,
      urgency = 'normal',
      needed_by,
      location_preference = 'institution',
      notes,
      lab_id,
      requester_lab_id
    } = req.body;

    // Accept both lab_id and requester_lab_id for compatibility
    const finalLabId = lab_id || requester_lab_id;

    if (!item_name || !finalLabId) {
      return res.status(400).json({ error: 'item_name and lab_id are required' });
    }

    const result = await pool.query(`
      INSERT INTO resource_exchange_requests (
        requester_lab_id, requester_user_id, item_name, category, quantity, unit,
        urgency, needed_by, location_preference, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [finalLabId, req.user.id, item_name, category, quantity, unit, urgency, needed_by, location_preference, notes]);

    res.status(201).json({ request: result.rows[0] });
  } catch (error) {
    console.error('Create exchange request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/exchange/requests', authenticateToken, async (req, res) => {
  try {
    const { status, search, institution, scope } = req.query as any;

    let query = `
      SELECT r.*, l.name as requester_lab_name, l.institution
      FROM resource_exchange_requests r
      JOIN labs l ON r.requester_lab_id = l.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let p = 0;

    if (status) { p++; query += ` AND r.status = $${p}`; params.push(status); }
    if (search) { p++; query += ` AND (r.item_name ILIKE $${p} OR r.category ILIKE $${p})`; params.push(`%${search}%`); }
    if (institution) { p++; query += ` AND l.institution ILIKE $${p}`; params.push(`%${institution}%`); }
    if (scope) { p++; query += ` AND r.location_preference = $${p}`; params.push(scope); }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get exchange requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/exchange/requests/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['open','matched','fulfilled','cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(`
      UPDATE resource_exchange_requests
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    res.json({ request: result.rows[0] });
  } catch (error) {
    console.error('Update exchange request status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/exchange/requests/:id/offers', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, unit, message } = req.body;

    const reqCheck = await pool.query('SELECT id FROM resource_exchange_requests WHERE id = $1', [id]);
    if (reqCheck.rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    // Determine provider lab from current user's active membership
    const labRes = await pool.query(`
      SELECT lab_id FROM lab_members WHERE user_id = $1 AND is_active = true LIMIT 1
    `, [req.user.id]);
    if (labRes.rows.length === 0) return res.status(400).json({ error: 'No active lab membership for provider' });
    const providerLabId = labRes.rows[0].lab_id;

    const result = await pool.query(`
      INSERT INTO resource_exchange_offers (
        request_id, provider_lab_id, provider_user_id, quantity, unit, message
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, providerLabId, req.user.id, quantity, unit, message]);

    res.status(201).json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Create exchange offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/exchange/offers', authenticateToken, async (req, res) => {
  try {
    const { request_id } = req.query as any;
    let query = `
      SELECT o.*, l.name as provider_lab_name
      FROM resource_exchange_offers o
      JOIN labs l ON o.provider_lab_id = l.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let p = 0;
    if (request_id) { p++; query += ` AND o.request_id = $${p}`; params.push(request_id); }
    query += ' ORDER BY o.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ offers: result.rows });
  } catch (error) {
    console.error('Get exchange offers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/exchange/offers/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending','accepted','declined','fulfilled','withdrawn'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(`
      UPDATE resource_exchange_offers
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    res.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Update exchange offer status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== SHARED INSTRUMENTS DIRECTORY =====
app.post('/api/instruments/:id/share', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { sharing_scope = 'institution', access_policy, external_contact_email, is_shared = true } = req.body;

    const existing = await pool.query('SELECT id FROM shared_instruments WHERE instrument_id = $1', [id]);
    if (existing.rows.length > 0) {
      const result = await pool.query(`
        UPDATE shared_instruments
        SET sharing_scope = $1, access_policy = $2, external_contact_email = $3, is_shared = $4, updated_at = CURRENT_TIMESTAMP
        WHERE instrument_id = $5
        RETURNING *
      `, [sharing_scope, access_policy, external_contact_email, is_shared, id]);
      return res.json({ shared: result.rows[0] });
    } else {
      const result = await pool.query(`
        INSERT INTO shared_instruments (instrument_id, sharing_scope, access_policy, external_contact_email, is_shared)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [id, sharing_scope, access_policy, external_contact_email, is_shared]);
      return res.status(201).json({ shared: result.rows[0] });
    }
  } catch (error) {
    console.error('Share instrument error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments/shared', authenticateToken, async (req, res) => {
  try {
    const { scope, institution, availability = 'available', search } = req.query as any;
    let query = `
      SELECT i.*, l.name as lab_name, l.institution, s.sharing_scope, s.access_policy, s.external_contact_email
      FROM shared_instruments s
      JOIN instruments i ON s.instrument_id = i.id
      JOIN labs l ON i.lab_id = l.id
      WHERE s.is_shared = true
    `;
    const params: any[] = [];
    let p = 0;
    if (scope) { p++; query += ` AND s.sharing_scope = $${p}`; params.push(scope); }
    if (institution) { p++; query += ` AND l.institution ILIKE $${p}`; params.push(`%${institution}%`); }
    if (availability) { p++; query += ` AND i.status = $${p}`; params.push(availability); }
    if (search) { p++; query += ` AND (i.name ILIKE $${p} OR i.category ILIKE $${p})`; params.push(`%${search}%`); }
    query += ' ORDER BY i.name ASC';
    const result = await pool.query(query, params);
    res.json({ instruments: result.rows });
  } catch (error) {
    console.error('Get shared instruments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== INSTRUMENT BOOKINGS =====
app.post('/api/instruments/:id/book', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      booking_date,
      start_time,
      end_time,
      duration_minutes,
      purpose,
      research_project,
      urgency = 'normal',
      notes
    } = req.body;

    if (!booking_date || !start_time || !end_time || !duration_minutes || !purpose) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if instrument is available for the requested time
    const conflictCheck = await pool.query(`
      SELECT id FROM instrument_bookings 
      WHERE instrument_id = $1 
      AND booking_date = $2 
      AND status IN ('pending', 'approved')
      AND (
        (start_time <= $3 AND end_time > $3) OR
        (start_time < $4 AND end_time >= $4) OR
        (start_time >= $3 AND end_time <= $4)
      )
    `, [id, booking_date, start_time, end_time]);

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot conflicts with existing booking' });
    }

    // Check if instrument is unavailable (maintenance, etc.)
    const unavailableCheck = await pool.query(`
      SELECT id FROM instrument_unavailable_periods 
      WHERE instrument_id = $1 
      AND start_datetime::date <= $2 
      AND end_datetime::date >= $2
    `, [id, booking_date]);

    if (unavailableCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Instrument unavailable on requested date' });
    }

    const result = await pool.query(`
      INSERT INTO instrument_bookings (
        instrument_id, user_id, lab_id, booking_date, start_time, end_time,
        duration_minutes, purpose, research_project, urgency, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [id, req.user.id, req.user.lab_id || 'c8ace470-5e21-4d3b-ab95-da6084311657', booking_date, start_time, end_time, duration_minutes, purpose, research_project, urgency, notes]);

    res.status(201).json({ booking: result.rows[0] });
  } catch (error) {
    console.error('Create instrument booking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments/:id/bookings', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status } = req.query as any;

    let query = `
      SELECT b.*, u.username, u.first_name, u.last_name, l.name as lab_name
      FROM instrument_bookings b
      JOIN users u ON b.user_id = u.id
      JOIN labs l ON b.lab_id = l.id
      WHERE b.instrument_id = $1
    `;
    const params: any[] = [id];
    let p = 1;

    if (date) { p++; query += ` AND b.booking_date = $${p}`; params.push(date); }
    if (status) { p++; query += ` AND b.status = $${p}`; params.push(status); }

    query += ' ORDER BY b.booking_date DESC, b.start_time ASC';

    const result = await pool.query(query, params);
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('Get instrument bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/instruments/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query as any;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }

    // Get available time slots for the instrument on the specified date
    const dayOfWeek = new Date(date).getDay();
    
    const slotsResult = await pool.query(`
      SELECT * FROM instrument_booking_slots 
      WHERE instrument_id = $1 AND day_of_week = $2 AND is_active = true
    `, [id, dayOfWeek]);

    if (slotsResult.rows.length === 0) {
      return res.json({ available_slots: [], unavailable_periods: [] });
    }

    const slot = slotsResult.rows[0];
    const startTime = slot.start_time;
    const endTime = slot.end_time;
    const slotDuration = slot.slot_duration_minutes;

    // Generate time slots
    const availableSlots = [];
    let currentTime = new Date(`2000-01-01 ${startTime}`);
    const endDateTime = new Date(`2000-01-01 ${endTime}`);

    while (currentTime < endDateTime) {
      const slotStart = currentTime.toTimeString().slice(0, 5);
      const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000).toTimeString().slice(0, 5);
      
      if (new Date(`2000-01-01 ${slotEnd}`) <= endDateTime) {
        availableSlots.push({
          start_time: slotStart,
          end_time: slotEnd,
          duration_minutes: slotDuration
        });
      }
      
      currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
    }

    // Get existing bookings for the date
    const bookingsResult = await pool.query(`
      SELECT start_time, end_time FROM instrument_bookings 
      WHERE instrument_id = $1 AND booking_date = $2 AND status IN ('pending', 'approved')
      ORDER BY start_time
    `, [id, date]);

    // Get unavailable periods
    const unavailableResult = await pool.query(`
      SELECT start_datetime, end_datetime, reason FROM instrument_unavailable_periods 
      WHERE instrument_id = $1 AND start_datetime::date <= $2 AND end_datetime::date >= $2
    `, [id, date]);

    res.json({
      available_slots: availableSlots,
      existing_bookings: bookingsResult.rows,
      unavailable_periods: unavailableResult.rows
    });
  } catch (error) {
    console.error('Get instrument availability error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/bookings/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!['approved', 'rejected', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData: any = { status };
    if (status === 'approved') {
      updateData.approved_by = req.user.id;
      updateData.approved_at = new Date();
    } else if (status === 'rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const result = await pool.query(`
      UPDATE instrument_bookings 
      SET ${Object.keys(updateData).map((key, index) => `${key} = $${index + 2}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, ...Object.values(updateData)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ booking: result.rows[0] });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bookings/my', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, i.name as instrument_name, i.category, l.name as lab_name
      FROM instrument_bookings b
      JOIN instruments i ON b.instrument_id = i.id
      JOIN labs l ON b.lab_id = l.id
      WHERE b.user_id = $1
      ORDER BY b.booking_date DESC, b.start_time ASC
    `, [req.user.id]);

    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// ===== Personal NoteBook ROUTES =====

// Get all Personal NoteBook entries with filters
app.get('/api/lab-notebooks', authenticateToken, async (req, res) => {
  try {
    const {
      lab_id,
      entry_type,
      status,
      priority,
      search,
      privacy_level,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        e.*,
        CONCAT(u.first_name, ' ', u.last_name) as creator_name,
        l.name as lab_name,
        l.institution
      FROM lab_notebook_entries e
      INNER JOIN users u ON e.user_id = u.id
      LEFT JOIN labs l ON e.lab_id = l.id
      WHERE (
        e.user_id = $1
        OR e.privacy_level = 'public'
        OR (
          e.lab_id IS NOT NULL
          AND e.privacy_level IN ('lab', 'shared')
          AND e.lab_id IN (
            SELECT lab_id FROM lab_members WHERE user_id = $2 AND COALESCE(is_active, 1) = 1
          )
        )
      )
    `;

    const params: any[] = [req.user!.id, req.user!.id];
    let paramCount = 2;

    if (lab_id) {
      const membership = await pool.query(
        `SELECT 1 AS ok FROM lab_members
         WHERE user_id = $1 AND lab_id = $2 AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        [req.user!.id, lab_id]
      );
      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this lab' });
      }
      paramCount++;
      query += ` AND e.lab_id = $${paramCount}`;
      params.push(lab_id);
    }

    if (entry_type) {
      paramCount++;
      query += ` AND e.entry_type = $${paramCount}`;
      params.push(entry_type);
    }

    if (status) {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    if (priority) {
      paramCount++;
      query += ` AND e.priority = $${paramCount}`;
      params.push(priority);
    }

    if (privacy_level) {
      paramCount++;
      query += ` AND e.privacy_level = $${paramCount}`;
      params.push(privacy_level);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        e.title ILIKE $${paramCount} OR 
        e.content ILIKE $${paramCount} OR 
        e.objectives ILIKE $${paramCount} OR 
        e.methodology ILIKE $${paramCount} OR 
        e.results ILIKE $${paramCount} OR 
        e.conclusions ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Add pagination
    paramCount++;
    query += ` ORDER BY e.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching Personal NoteBook entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// --- AI PRESENTATION ROUTES ---

// Health check for AI presentation service
app.get('/api/presentations/ai/health', authenticateToken, async (req, res) => {
  try {
    // Validate API key is configured
    aiPresentationService.validateApiKey();
    res.json({
      status: 'healthy',
      service: 'AI Presentation Generation',
      timestamp: new Date().toISOString(),
      features: ['outline_generation', 'content_generation', 'full_presentation', 'content_improvement']
    });
  } catch (error) {
    console.error('AI presentation service health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: (error as Error).message || 'AI Presentation service unavailable'
    });
  }
});

// Get available presentation themes
app.get('/api/presentations/ai/themes', authenticateToken, async (req, res) => {
  try {
    const themes = aiPresentationService.getAvailableThemes();
    res.json({ themes });
  } catch (error) {
    console.error('Error fetching presentation themes:', error);
    res.status(500).json({ error: 'Failed to fetch presentation themes' });
  }
});

// Generate presentation outline
app.post('/api/presentations/ai/outline', authenticateToken, async (req, res) => {
  try {
    const { topic, context, slides = 8 } = req.body;
    const userId = (req as any).user.id;

    // Validate request
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Topic is required and must be a string' });
    }

    if (slides < 3 || slides > 20) {
      return res.status(400).json({ error: 'Number of slides must be between 3 and 20' });
    }

    // Validate API key
    aiPresentationService.validateApiKey();

    // Generate outline
    const result = await aiPresentationService.generatePresentationOutline(topic, context || '', slides);

    // Log generation for audit trail
    console.log(`Presentation outline generated for user ${userId}: "${topic}" with ${slides} slides`);

    res.json({
      success: true,
      outline: result.outline,
      metadata: {
        userId,
        topic,
        context,
        slides,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Presentation outline generation error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Presentation outline generation failed',
      details: 'Please check your topic and try again'
    });
  }
});

// Generate slide content
app.post('/api/presentations/ai/slide-content', authenticateToken, async (req, res) => {
  try {
    const { slideTitle, slideContent, slideType, context } = req.body;
    const userId = (req as any).user.id;

    // Validate request
    if (!slideTitle || !slideContent || !slideType) {
      return res.status(400).json({ 
        error: 'slideTitle, slideContent, and slideType are required' 
      });
    }

    // Validate API key
    aiPresentationService.validateApiKey();

    // Generate slide content
    const result = await aiPresentationService.generateSlideContent(
      slideTitle, 
      slideContent, 
      slideType, 
      context || ''
    );

    // Log generation for audit trail
    console.log(`Slide content generated for user ${userId}: "${slideTitle}"`);

    res.json({
      success: true,
      slideData: result.slideData,
      metadata: {
        userId,
        slideTitle,
        slideType,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Slide content generation error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Slide content generation failed',
      details: 'Please check your slide details and try again'
    });
  }
});

// Generate full presentation (multi-agent pipeline with legacy OpenAI fallback)
app.post('/api/presentations/ai/generate', authenticateToken, async (req, res) => {
  try {
    const { topic, context, slides = 8, theme = 'research-professional' } = req.body;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Topic is required and must be a string' });
    }

    if (slides < 3 || slides > 20) {
      return res.status(400).json({ error: 'Number of slides must be between 3 and 20' });
    }

    const result = await UnifiedPresentationService.generateFull({
      userId,
      topic,
      context: context || '',
      slides,
      theme,
      userRole,
      legacyFallback: async (t, c, s, th) => {
        aiPresentationService.validateApiKey();
        return aiPresentationService.generateFullPresentation(t, c, s, th);
      },
    });

    console.log(
      `Full presentation generated for user ${userId}: "${topic}" (${result.engine}) with ${slides} slides`
    );

    res.json({
      success: true,
      presentation: result.presentation,
      engine: result.engine,
      metadata: {
        userId,
        topic,
        context,
        slides,
        theme,
        engine: result.engine,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Full presentation generation error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Full presentation generation failed',
      details: 'Please check your topic and try again',
    });
  }
});

// Improve presentation content
app.post('/api/presentations/ai/improve', authenticateToken, async (req, res) => {
  try {
    const { presentationId, slideId, feedback, currentContent } = req.body;
    const userId = (req as any).user.id;

    // Validate request
    if (!presentationId || !slideId || !feedback || !currentContent) {
      return res.status(400).json({ 
        error: 'presentationId, slideId, feedback, and currentContent are required' 
      });
    }

    // Validate API key
    aiPresentationService.validateApiKey();

    // Improve content
    const result = await aiPresentationService.improvePresentationContent(
      presentationId,
      slideId,
      feedback,
      currentContent
    );

    // Log improvement for audit trail
    console.log(`Presentation content improved for user ${userId}: slide ${slideId} in presentation ${presentationId}`);

    res.json({
      success: true,
      improvedContent: result.improvedContent,
      metadata: {
        userId,
        presentationId,
        slideId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Presentation content improvement error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Presentation content improvement failed',
      details: 'Please check your feedback and try again'
    });
  }
});

// --- ADVANCED STATISTICAL ANALYSIS ROUTES ---

// Health check for advanced statistical analysis service
app.get('/api/advanced-stats/health', authenticateToken, async (req, res) => {
  try {
    const healthStatus = await advancedStatsService.healthCheck();
    res.json(healthStatus);
  } catch (error) {
    console.error('Advanced stats service health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: (error as Error).message || 'Advanced statistical analysis service unavailable'
    });
  }
});

// Execute statistical analysis workflow
app.post('/api/advanced-stats/workflow/execute', authenticateToken, async (req, res) => {
  try {
    const { workflowNodes, workflowConnections, dataSets } = req.body;
    const userId = (req as any).user.id;

    // Validate request
    if (!workflowNodes || !Array.isArray(workflowNodes)) {
      return res.status(400).json({ error: 'workflowNodes array is required' });
    }

    if (!workflowConnections || !Array.isArray(workflowConnections)) {
      return res.status(400).json({ error: 'workflowConnections array is required' });
    }

    // Execute workflow
    const results = await advancedStatsService.executeWorkflow(
      workflowNodes, 
      workflowConnections, 
      dataSets || {}
    );

    // Log execution for audit trail
    console.log(`Statistical workflow executed for user ${userId}: ${workflowNodes.length} nodes`);

    res.json({
      success: true,
      results: results.results,
      executionOrder: results.executionOrder,
      metadata: {
        userId,
        nodeCount: workflowNodes.length,
        connectionCount: workflowConnections.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Workflow execution error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Workflow execution failed',
      details: 'Please check your workflow configuration and try again'
    });
  }
});

// Load CSV data
app.post('/api/advanced-stats/data/load-csv', authenticateToken, async (req, res) => {
  try {
    const { filePath, options } = req.body;
    const userId = (req as any).user.id;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = await advancedStatsService.loadCSVData(filePath, options);

    console.log(`CSV data loaded for user ${userId}: ${filePath}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        filePath,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('CSV loading error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to load CSV data',
      details: 'Please check the file path and format'
    });
  }
});

// Load Excel data
app.post('/api/advanced-stats/data/load-excel', authenticateToken, async (req, res) => {
  try {
    const { filePath, options } = req.body;
    const userId = (req as any).user.id;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = await advancedStatsService.loadExcelData(filePath, options);

    console.log(`Excel data loaded for user ${userId}: ${filePath}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        filePath,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Excel loading error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to load Excel data',
      details: 'Please check the file path and format'
    });
  }
});

// Get data information
app.post('/api/advanced-stats/preprocessing/data-info', authenticateToken, async (req, res) => {
  try {
    const { data } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.getDataInfo(data);

    console.log(`Data info retrieved for user ${userId}: ${data.length} rows`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        dataRows: data.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Data info error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to get data information',
      details: 'Please check your data format'
    });
  }
});

// Select columns
app.post('/api/advanced-stats/preprocessing/select-columns', authenticateToken, async (req, res) => {
  try {
    const { data, columns } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'Columns array is required' });
    }

    const result = await advancedStatsService.selectColumns(data, columns);

    console.log(`Columns selected for user ${userId}: ${columns.join(', ')}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        selectedColumns: columns,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Column selection error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to select columns',
      details: 'Please check your column names'
    });
  }
});

// Remove duplicates
app.post('/api/advanced-stats/preprocessing/remove-duplicates', authenticateToken, async (req, res) => {
  try {
    const { data, subset } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.removeDuplicates(data, subset);

    console.log(`Duplicates removed for user ${userId}: ${result.duplicatesRemoved} rows`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        duplicatesRemoved: result.duplicatesRemoved,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Duplicate removal error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to remove duplicates',
      details: 'Please check your data format'
    });
  }
});

// Handle missing values
app.post('/api/advanced-stats/preprocessing/handle-missing', authenticateToken, async (req, res) => {
  try {
    const { data, method, fillValue } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.handleMissingValues(data, method, fillValue);

    console.log(`Missing values handled for user ${userId}: ${result.missingHandled} values`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        method,
        missingHandled: result.missingHandled,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Missing values handling error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to handle missing values',
      details: 'Please check your data and method'
    });
  }
});

// Descriptive statistics
app.post('/api/advanced-stats/analysis/descriptive', authenticateToken, async (req, res) => {
  try {
    const { data, columns } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.getDescriptiveStatistics(data, columns);

    console.log(`Descriptive statistics calculated for user ${userId}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        columns: columns || 'all numeric',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Descriptive statistics error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to calculate descriptive statistics',
      details: 'Please check your data format'
    });
  }
});

// Correlation analysis
app.post('/api/advanced-stats/analysis/correlation', authenticateToken, async (req, res) => {
  try {
    const { data, method, columns } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.correlationAnalysis(data, method, columns);

    console.log(`Correlation analysis performed for user ${userId}: ${method}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        method,
        columns: columns || 'all numeric',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Correlation analysis error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to perform correlation analysis',
      details: 'Please check your data format'
    });
  }
});

// Linear regression
app.post('/api/advanced-stats/analysis/regression', authenticateToken, async (req, res) => {
  try {
    const { data, targetColumn, featureColumns } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!targetColumn) {
      return res.status(400).json({ error: 'targetColumn is required' });
    }

    const result = await advancedStatsService.linearRegression(data, targetColumn, featureColumns);

    console.log(`Linear regression performed for user ${userId}: ${targetColumn}`);

    res.json({ 
      ...result,
      success: true,
      metadata: {
        userId,
        targetColumn,
        featureColumns: featureColumns || 'all numeric',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Linear regression error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to perform linear regression',
      details: 'Please check your data and column names'
    });
  }
});

// Clustering analysis
app.post('/api/advanced-stats/analysis/clustering', authenticateToken, async (req, res) => {
  try {
    const { data, nClusters, algorithm, columns } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const result = await advancedStatsService.clusteringAnalysis(data, nClusters, algorithm, columns);

    console.log(`Clustering analysis performed for user ${userId}: ${algorithm}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        algorithm,
        nClusters,
        columns: columns || 'all numeric',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Clustering analysis error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to perform clustering analysis',
      details: 'Please check your data format'
    });
  }
});

// Hypothesis testing
app.post('/api/advanced-stats/analysis/hypothesis-testing', authenticateToken, async (req, res) => {
  try {
    const { data, testType, columns, options } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!testType) {
      return res.status(400).json({ error: 'testType is required' });
    }

    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'columns array is required' });
    }

    const result = await advancedStatsService.hypothesisTesting(data, testType, columns, options);

    console.log(`Hypothesis testing performed for user ${userId}: ${testType}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        testType,
        columns,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Hypothesis testing error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to perform hypothesis testing',
      details: 'Please check your data and test parameters'
    });
  }
});

// ANOVA analysis
app.post('/api/advanced-stats/analysis/anova', authenticateToken, async (req, res) => {
  try {
    const { data, groupColumn, valueColumn } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!groupColumn || !valueColumn) {
      return res.status(400).json({ error: 'groupColumn and valueColumn are required' });
    }

    const result = await advancedStatsService.anovaAnalysis(data, groupColumn, valueColumn);

    console.log(`ANOVA analysis performed for user ${userId}: ${groupColumn} vs ${valueColumn}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        groupColumn,
        valueColumn,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('ANOVA analysis error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to perform ANOVA analysis',
      details: 'Please check your data and column names'
    });
  }
});

// Visualization endpoints
app.post('/api/advanced-stats/visualization/scatter-plot', authenticateToken, async (req, res) => {
  try {
    const { data, xColumn, yColumn, options } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!xColumn || !yColumn) {
      return res.status(400).json({ error: 'xColumn and yColumn are required' });
    }

    const result = await advancedStatsService.createScatterPlot(data, xColumn, yColumn, options);

    console.log(`Scatter plot created for user ${userId}: ${yColumn} vs ${xColumn}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        xColumn,
        yColumn,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Scatter plot creation error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to create scatter plot',
      details: 'Please check your data and column names'
    });
  }
});

// Export endpoints
app.post('/api/advanced-stats/export/csv', authenticateToken, async (req, res) => {
  try {
    const { data, filePath, options } = req.body;
    const userId = (req as any).user.id;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = await advancedStatsService.exportToCSV(data, filePath, options);

    console.log(`Data exported to CSV for user ${userId}: ${filePath}`);

    res.json({
      ...result,
      success: true,
      metadata: {
        userId,
        filePath,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to export to CSV',
      details: 'Please check your data and file path'
    });
  }
});

// --- DATA & RESULTS ROUTES ---

// AI Presentation Service Integration

// Initialize services
const aiPresentationService = new AIPresentationService();
const advancedStatsService = new AdvancedStatisticalService();

const parseJsonField = (value: unknown, fallback: unknown = null) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeResearchDataRow = (row: any) => ({
  ...row,
  tags: parseJsonField(row.tags, []),
  files: parseJsonField(row.files, []),
  metadata: parseJsonField(row.metadata, {}),
  protocolId: row.protocol_id || null,
  experimentId: row.experiment_id || null,
  notebookEntryId: row.notebook_entry_id || null,
});

// Get all results for a lab
app.get('/api/data/results', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { lab_id, data_type, search, date_from, date_to } = req.query;
    const userId = (req as any).user.id;

    let query = `
      SELECT r.*, u.username, u.first_name, u.last_name, l.name as lab_name
      FROM research_data r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN labs l ON r.lab_id = l.id
      WHERE (
        r.user_id = $1
        OR r.privacy_level = 'global'
        OR (
          r.privacy_level IN ('lab', 'institution')
          AND r.lab_id IS NOT NULL
          AND r.lab_id IN (
            SELECT lab_id FROM lab_members WHERE user_id = $2 AND COALESCE(is_active, 1) = 1
          )
        )
      )
    `;

    const queryParams: any[] = [userId, userId];

    if (lab_id) {
      const membership = await pool.query(
        `SELECT 1 AS ok FROM lab_members
         WHERE user_id = $1 AND lab_id = $2 AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        [userId, lab_id]
      );
      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this lab' });
      }
      queryParams.push(lab_id);
      query += ` AND r.lab_id = $${queryParams.length}`;
    }

    if (data_type) {
      queryParams.push(data_type);
      query += ` AND r.type = $${queryParams.length}`;
    }

    if (search) {
      queryParams.push(`%${search}%`);
      query += ` AND (r.title LIKE $${queryParams.length} OR r.summary LIKE $${queryParams.length})`;
    }

    if (date_from) {
      queryParams.push(date_from);
      query += ` AND r.created_at >= $${queryParams.length}`;
    }

    if (date_to) {
      queryParams.push(date_to);
      query += ` AND r.created_at <= $${queryParams.length}`;
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, queryParams);
    res.json({ results: result.rows.map(normalizeResearchDataRow) });
  } catch (error: any) {
    console.error('Error fetching results:', error);
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

// Get a specific result
app.get('/api/data/results/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT r.*, u.username, u.first_name, u.last_name, l.name as lab_name
      FROM research_data r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN labs l ON r.lab_id = l.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    const row = result.rows[0];
    const evidenceMember = row.lab_id
      ? await findActiveLabMembership(pool, req.user.id, row.lab_id)
      : null;
    const evidenceRead = canReadLifecycleRecord({
      resource: 'research_data',
      userId: req.user.id,
      ownerId: row.user_id,
      labId: row.lab_id,
      privacyLevel: row.privacy_level,
      activeMember: Boolean(evidenceMember),
    });
    if (!evidenceRead.allowed) {
      return res.status(evidenceRead.status).json({ error: 'Access denied to this result' });
    }

    res.json({ result: normalizeResearchDataRow(row) });
  } catch (error) {
    console.error('Error fetching result:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new result
app.post('/api/data/results', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      summary,
      type,
      category,
      description,
      methodology,
      results,
      conclusions,
      tags,
      privacy_level,
      lab_id,
      files,
      metadata,
      status,
      protocol_id,
      protocolId,
      experiment_id,
      experimentId,
      notebook_entry_id,
      notebookEntryId,
    } = req.body;

    const userId = (req as any).user.id;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (lab_id) {
      const membership = await assertActiveLabMember(pool, userId, lab_id);
      if (!membership.ok) {
        return res.status(membership.status).json({ error: membership.error });
      }
    }

    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO research_data (
        id, title, type, category, status, summary, description, methodology, results, conclusions,
        tags, privacy_level, lab_id, protocol_id, experiment_id, notebook_entry_id, user_id, files, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `, [
      id,
      title,
      type || 'experiment',
      category || 'other',
      status || 'draft',
      summary || '',
      description || '',
      methodology || '',
      results || '',
      conclusions || '',
      JSON.stringify(tags || []),
      privacy_level || 'lab',
      lab_id || null,
      protocol_id || protocolId || null,
      experiment_id || experimentId || null,
      notebook_entry_id || notebookEntryId || null,
      userId,
      JSON.stringify(files || []),
      JSON.stringify(metadata || {}),
    ]);

    const created = await pool.query(`SELECT * FROM research_data WHERE id = $1`, [id]);
    const researchData = normalizeResearchDataRow(created.rows[0]);

    autoIndexing.autoIndexContent(
      userId,
      'research_data',
      researchData.id,
      researchData
    ).catch((err: unknown) => console.error('Error auto-indexing research data:', err));

    res.status(201).json(researchData);
  } catch (error: any) {
    console.error('Error creating result:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update a result
app.put('/api/data/results/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      summary,
      type,
      category,
      description,
      methodology,
      results,
      conclusions,
      tags,
      privacy_level,
      files,
      metadata,
      status,
      protocol_id,
      protocolId,
      experiment_id,
      experimentId,
      notebook_entry_id,
      notebookEntryId,
    } = req.body;

    const userId = (req as any).user.id;

    const ownershipCheck = await pool.query(`
      SELECT user_id, lab_id FROM research_data WHERE id = $1
    `, [id]);

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    const owned = ownershipCheck.rows[0];
    const canEditEvidence = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: owned.user_id,
      labId: owned.lab_id,
      allowCoSupervisor: true,
    });
    if (!canEditEvidence) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const linkedProtocol = protocol_id ?? protocolId;
    const linkedExperiment = experiment_id ?? experimentId;
    const linkedNotebook = notebook_entry_id ?? notebookEntryId;

    await pool.query(`
      UPDATE research_data SET
        title = COALESCE($1, title),
        summary = COALESCE($2, summary),
        type = COALESCE($3, type),
        category = COALESCE($4, category),
        description = COALESCE($5, description),
        methodology = COALESCE($6, methodology),
        results = COALESCE($7, results),
        conclusions = COALESCE($8, conclusions),
        tags = COALESCE($9, tags),
        privacy_level = COALESCE($10, privacy_level),
        files = COALESCE($11, files),
        metadata = COALESCE($12, metadata),
        status = COALESCE($13, status),
        protocol_id = COALESCE($14, protocol_id),
        experiment_id = COALESCE($15, experiment_id),
        notebook_entry_id = COALESCE($16, notebook_entry_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
    `, [
      title ?? null,
      summary ?? null,
      type ?? null,
      category ?? null,
      description ?? null,
      methodology ?? null,
      results ?? null,
      conclusions ?? null,
      tags != null ? JSON.stringify(tags) : null,
      privacy_level ?? null,
      files != null ? JSON.stringify(files) : null,
      metadata != null ? JSON.stringify(metadata) : null,
      status ?? null,
      linkedProtocol !== undefined ? linkedProtocol || null : null,
      linkedExperiment !== undefined ? linkedExperiment || null : null,
      linkedNotebook !== undefined ? linkedNotebook || null : null,
      id,
    ]);

    const updateResult = await pool.query(`SELECT * FROM research_data WHERE id = $1`, [id]);
    res.json({ result: normalizeResearchDataRow(updateResult.rows[0]) });
  } catch (error: any) {
    console.error('Error updating result:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Delete a result
app.delete('/api/data/results/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const ownershipCheck = await pool.query(`
      SELECT user_id, lab_id FROM research_data WHERE id = $1
    `, [id]);

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    const owned = ownershipCheck.rows[0];
    const canDeleteEvidence = await assertCanWriteLifecycleRecord(pool, {
      userId,
      ownerId: owned.user_id,
      labId: owned.lab_id,
    });
    if (!canDeleteEvidence) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await pool.query('DELETE FROM research_data WHERE id = $1', [id]);
    res.json({ message: 'Result deleted successfully' });
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get data templates
app.get('/api/data/templates', authenticateToken, async (req, res) => {
  try {
    const { lab_id, category, is_public } = req.query;
    const userId = (req as any).user.id;

    let query = `
      SELECT dt.*, u.username, u.first_name, u.last_name
      FROM data_templates dt
      JOIN users u ON dt.created_by = u.id
      WHERE (dt.lab_id = $1 OR dt.is_public = true)
    `;
    
    const queryParams: any[] = [lab_id];
    let paramCount = 1;

    if (category) {
      paramCount++;
      query += ` AND dt.category = $${paramCount}`;
      queryParams.push(category);
    }

    if (is_public !== undefined) {
      paramCount++;
      query += ` AND dt.is_public = $${paramCount}`;
      queryParams.push(is_public === 'true');
    }

    query += ` ORDER BY dt.created_at DESC`;

    const result = await pool.query(query, queryParams);
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a data template
app.post('/api/data/templates', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      fields,
      lab_id,
      is_public
    } = req.body;

    const userId = (req as any).user.id;

    if (!name || !category || !fields || !lab_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO data_templates (
        name, description, category, fields, created_by, lab_id, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, description, category, fields, userId, lab_id, is_public || false]);

    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get results statistics
app.get('/api/data/results/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { lab_id } = req.query;
    const userId = (req as any).user.id;

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_results,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as this_month,
        COUNT(CASE WHEN data_type = 'experiment' THEN 1 END) as experiments,
        COUNT(CASE WHEN data_type = 'observation' THEN 1 END) as observations,
        COUNT(CASE WHEN data_type = 'measurement' THEN 1 END) as measurements,
        COUNT(CASE WHEN source = 'manual' THEN 1 END) as manual_entries,
        COUNT(CASE WHEN source = 'import' THEN 1 END) as imports
      FROM results 
      WHERE lab_id = $1
    `, [lab_id]);

    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== RESEARCH DATA BANK ROUTES =====

// Get all organizations with filtering and pagination
app.get('/api/databank/organizations', authenticateToken, async (req, res) => {
  try {
    const {
      type,
      category,
      country,
      verified,
      search,
      page = 1,
      limit = 20,
      sortBy = 'verified',
      sortOrder = 'desc'
    } = req.query as any;

    let query = `
      SELECT
        o.*,
        (SELECT COUNT(*) FROM databank_data_offers d WHERE d.organization_id = o.id) as data_count,
        COALESCE(
          NULLIF(o.posted_by_name, ''),
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.username
        ) AS posted_by_name,
        u.username AS posted_by_username
      FROM databank_organizations o
      LEFT JOIN users u ON u.id = o.created_by
      WHERE 1=1
    `;

    const params: any[] = [];

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND o.type = $${params.length}`;
    }

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND o.category = $${params.length}`;
    }

    if (country && country !== 'all') {
      params.push(`%${country}%`);
      query += ` AND o.country LIKE $${params.length}`;
    }

    if (verified !== undefined) {
      params.push(verified === 'true' ? 1 : 0);
      query += ` AND o.verified = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (
        o.name LIKE $${params.length} OR
        o.description LIKE $${params.length} OR
        o.specializations LIKE $${params.length}
      )`;
    }

    const validSortFields = ['name', 'rating', 'joined_date', 'verified'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'verified';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY o.${sortField} ${order}, o.joined_date DESC`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM databank_organizations o WHERE 1=1`;
    const countParams: any[] = [];
    if (type && type !== 'all') {
      countParams.push(type);
      countQuery += ` AND o.type = $${countParams.length}`;
    }
    if (category && category !== 'all') {
      countParams.push(category);
      countQuery += ` AND o.category = $${countParams.length}`;
    }
    if (country && country !== 'all') {
      countParams.push(`%${country}%`);
      countQuery += ` AND o.country LIKE $${countParams.length}`;
    }
    if (verified !== undefined) {
      countParams.push(verified === 'true' ? 1 : 0);
      countQuery += ` AND o.verified = $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (
        o.name LIKE $${countParams.length} OR
        o.description LIKE $${countParams.length} OR
        o.specializations LIKE $${countParams.length}
      )`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      organizations: result.rows.map((row: any) => ({
        ...row,
        specializations: typeof row.specializations === 'string'
          ? JSON.parse(row.specializations || '[]')
          : (row.specializations || []),
        verified: Boolean(row.verified),
        postedByName:
          (row.posted_by_name && String(row.posted_by_name).trim()) ||
          row.posted_by_username ||
          null,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error: any) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get organization by ID
app.get('/api/databank/organizations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const orgResult = await pool.query(`
      SELECT
        o.*,
        (SELECT COUNT(*) FROM databank_data_offers d WHERE d.organization_id = o.id) as data_count,
        COALESCE(
          NULLIF(o.posted_by_name, ''),
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.username
        ) AS posted_by_name,
        u.username AS posted_by_username
      FROM databank_organizations o
      LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = $1
    `, [id]);

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const organization = {
      ...orgResult.rows[0],
      specializations: typeof orgResult.rows[0].specializations === 'string'
        ? JSON.parse(orgResult.rows[0].specializations || '[]')
        : (orgResult.rows[0].specializations || []),
      verified: Boolean(orgResult.rows[0].verified),
      postedByName:
        (orgResult.rows[0].posted_by_name && String(orgResult.rows[0].posted_by_name).trim()) ||
        orgResult.rows[0].posted_by_username ||
        null,
    };

    const dataResult = await pool.query(`
      SELECT d.*,
        COALESCE(
          NULLIF(d.posted_by_name, ''),
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          u.username
        ) AS posted_by_name,
        u.username AS posted_by_username
      FROM databank_data_offers d
      LEFT JOIN users u ON u.id = d.created_by
      WHERE d.organization_id = $1
      ORDER BY d.last_updated DESC
    `, [id]);

    organization.data_offers = dataResult.rows.map((row: any) => ({
      ...row,
      postedByName:
        (row.posted_by_name && String(row.posted_by_name).trim()) ||
        row.posted_by_username ||
        null,
    }));
    res.json({ organization });
  } catch (error: any) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Register new organization
app.post('/api/databank/organizations', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      type,
      category,
      country,
      region,
      contactEmail,
      website,
      description,
      specializations
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const userId = (req as any).user.id;
    const posterName =
      [(req as any).user.first_name, (req as any).user.last_name].filter(Boolean).join(' ').trim() ||
      (req as any).user.username ||
      'Unknown';
    await pool.query(`
      INSERT INTO databank_organizations (
        id, created_by, posted_by_name, name, type, category, country, region, contact_email,
        website, description, specializations, verified, rating,
        joined_date, last_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 0.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id,
      userId,
      posterName,
      name,
      type,
      category,
      country,
      region,
      contactEmail,
      website,
      description,
      JSON.stringify(specializations || []),
    ]);

    const created = await pool.query(`SELECT * FROM databank_organizations WHERE id = $1`, [id]);

    res.status(201).json({
      organization: {
        ...created.rows[0],
        specializations: typeof created.rows[0].specializations === 'string'
          ? JSON.parse(created.rows[0].specializations || '[]')
          : created.rows[0].specializations,
        verified: Boolean(created.rows[0].verified),
      },
      message: 'Organization registered successfully.'
    });
  } catch (error: any) {
    console.error('Error registering organization:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update organization
app.put('/api/databank/organizations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const existing = await pool.query(`SELECT * FROM databank_organizations WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const org = existing.rows[0];
    if (!canManageResource(org.created_by, (req as any).user)) {
      return res.status(403).json({ error: 'Only the owner can update this organization' });
    }

    const {
      name, type, category, country, region, contactEmail, website, description, specializations,
    } = req.body;

    await pool.query(`
      UPDATE databank_organizations SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        category = COALESCE($3, category),
        country = COALESCE($4, country),
        region = COALESCE($5, region),
        contact_email = COALESCE($6, contact_email),
        website = COALESCE($7, website),
        description = COALESCE($8, description),
        specializations = COALESCE($9, specializations),
        last_active = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
    `, [
      name ?? null,
      type ?? null,
      category ?? null,
      country ?? null,
      region ?? null,
      contactEmail ?? null,
      website ?? null,
      description ?? null,
      specializations != null ? JSON.stringify(specializations) : null,
      id,
    ]);

    const updated = await pool.query(`SELECT * FROM databank_organizations WHERE id = $1`, [id]);
    const row = updated.rows[0];
    res.json({
      organization: {
        ...row,
        specializations: typeof row.specializations === 'string'
          ? JSON.parse(row.specializations || '[]')
          : (row.specializations || []),
        verified: Boolean(row.verified),
      },
    });
  } catch (error: any) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Delete organization
app.delete('/api/databank/organizations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const existing = await pool.query(`SELECT * FROM databank_organizations WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const org = existing.rows[0];
    if (org.created_by && org.created_by !== userId && (req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the owner can delete this organization' });
    }

    await pool.query(`
      DELETE r FROM databank_data_requests r
      INNER JOIN databank_data_offers d ON r.data_offer_id = d.id
      WHERE d.organization_id = $1
    `, [id]);
    await pool.query(`DELETE FROM databank_data_offers WHERE organization_id = $1`, [id]);
    await pool.query(`DELETE FROM databank_organizations WHERE id = $1`, [id]);
    res.json({ message: 'Organization deleted' });
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Create dataset offer
app.post('/api/databank/organizations/:id/offers', authenticateToken, async (req, res) => {
  try {
    const { id: organizationId } = req.params;
    const userId = (req as any).user.id;
    const org = await pool.query(`SELECT * FROM databank_organizations WHERE id = $1`, [organizationId]);
    if (org.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    if (!canManageResource(org.rows[0].created_by, (req as any).user)) {
      return res.status(403).json({ error: 'Only the owner can publish offers' });
    }

    const {
      title, description, dataType, populationType, sampleSize, timePeriod,
      accessLevel, contactPerson, requirements, diseaseFocus, geographicCoverage,
    } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const offerId = crypto.randomUUID();
    const posterName =
      [(req as any).user.first_name, (req as any).user.last_name].filter(Boolean).join(' ').trim() ||
      (req as any).user.username ||
      'Unknown';
    await pool.query(`
      INSERT INTO databank_data_offers (
        id, organization_id, created_by, posted_by_name, title, description, data_type, disease_focus,
        population_type, sample_size, geographic_coverage, time_period,
        access_level, requirements, contact_person, last_updated, request_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,0)
    `, [
      offerId,
      organizationId,
      userId,
      posterName,
      title,
      description || '',
      dataType || 'clinical',
      JSON.stringify(diseaseFocus || []),
      populationType || 'general',
      sampleSize || 0,
      JSON.stringify(geographicCoverage || []),
      timePeriod || '',
      accessLevel || 'restricted',
      JSON.stringify(requirements || []),
      contactPerson || '',
    ]);

    const created = await pool.query(`SELECT * FROM databank_data_offers WHERE id = $1`, [offerId]);
    res.status(201).json({ offer: created.rows[0] });
  } catch (error: any) {
    console.error('Error creating data offer:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update dataset offer
app.put('/api/databank/offers/:offerId', authenticateToken, async (req, res) => {
  try {
    const { offerId } = req.params;
    const userId = (req as any).user.id;
    const offerRes = await pool.query(`
      SELECT d.*, COALESCE(d.created_by, o.created_by) AS owner_id
      FROM databank_data_offers d
      JOIN databank_organizations o ON o.id = d.organization_id
      WHERE d.id = $1
    `, [offerId]);
    if (offerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    if (!canManageResource(offerRes.rows[0].owner_id, (req as any).user)) {
      return res.status(403).json({ error: 'Only the owner can update this offer' });
    }

    const b = req.body;
    await pool.query(`
      UPDATE databank_data_offers SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        data_type = COALESCE($3, data_type),
        disease_focus = COALESCE($4, disease_focus),
        population_type = COALESCE($5, population_type),
        sample_size = COALESCE($6, sample_size),
        geographic_coverage = COALESCE($7, geographic_coverage),
        time_period = COALESCE($8, time_period),
        access_level = COALESCE($9, access_level),
        requirements = COALESCE($10, requirements),
        contact_person = COALESCE($11, contact_person),
        last_updated = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
    `, [
      b.title ?? null,
      b.description ?? null,
      b.dataType ?? null,
      b.diseaseFocus != null ? JSON.stringify(b.diseaseFocus) : null,
      b.populationType ?? null,
      b.sampleSize ?? null,
      b.geographicCoverage != null ? JSON.stringify(b.geographicCoverage) : null,
      b.timePeriod ?? null,
      b.accessLevel ?? null,
      b.requirements != null ? JSON.stringify(b.requirements) : null,
      b.contactPerson ?? null,
      offerId,
    ]);

    const updated = await pool.query(`SELECT * FROM databank_data_offers WHERE id = $1`, [offerId]);
    res.json({ offer: updated.rows[0] });
  } catch (error: any) {
    console.error('Error updating data offer:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Delete dataset offer
app.delete('/api/databank/offers/:offerId', authenticateToken, async (req, res) => {
  try {
    const { offerId } = req.params;
    const userId = (req as any).user.id;
    const offerRes = await pool.query(`
      SELECT d.*, COALESCE(d.created_by, o.created_by) AS owner_id
      FROM databank_data_offers d
      JOIN databank_organizations o ON o.id = d.organization_id
      WHERE d.id = $1
    `, [offerId]);
    if (offerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    if (!canManageResource(offerRes.rows[0].owner_id, (req as any).user)) {
      return res.status(403).json({ error: 'Only the owner can delete this offer' });
    }

    await pool.query(`DELETE FROM databank_data_requests WHERE data_offer_id = $1`, [offerId]);
    await pool.query(`DELETE FROM databank_data_offers WHERE id = $1`, [offerId]);
    res.json({ message: 'Offer deleted' });
  } catch (error: any) {
    console.error('Error deleting data offer:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Submit data request
app.post('/api/databank/data-requests', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const userRow = (req as any).user;
    const {
      dataOfferId,
      requesterName,
      requesterInstitution,
      requesterEmail,
      purpose,
      methodology,
      timeline,
      collaborationProposed,
      additionalNotes
    } = req.body;

    const displayName =
      requesterName ||
      [userRow.first_name, userRow.last_name].filter(Boolean).join(' ').trim() ||
      userRow.username ||
      'Unknown';

    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO databank_data_requests (
        id, data_offer_id, user_id, requester_name, requester_institution, requester_email,
        purpose, methodology, timeline, collaboration_proposed, additional_notes,
        status, submitted_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', CURRENT_TIMESTAMP)
    `, [
      id,
      dataOfferId || null,
      userId,
      displayName,
      requesterInstitution,
      requesterEmail || userRow.email || '',
      purpose,
      methodology,
      timeline,
      collaborationProposed || '',
      additionalNotes || '',
    ]);

    if (dataOfferId) {
      await pool.query(`
        UPDATE databank_data_offers
        SET request_count = request_count + 1
        WHERE id = $1
      `, [dataOfferId]);
    }

    const created = await pool.query(`SELECT * FROM databank_data_requests WHERE id = $1`, [id]);

    res.json({
      data_request: created.rows[0],
      message: 'Data request submitted successfully. The organization will review your request.'
    });
  } catch (error: any) {
    console.error('Error submitting data request:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get platform statistics
app.get('/api/databank/stats', authenticateToken, async (req, res) => {
  try {
    const [orgStats, dataStats, requestStats] = await Promise.all([
      // Organization statistics
      pool.query(`
        SELECT 
          COUNT(*) as total_organizations,
          COUNT(*) FILTER (WHERE verified = true) as verified_organizations,
          COUNT(*) FILTER (WHERE type = 'research_lab') as research_labs,
          COUNT(*) FILTER (WHERE type = 'hospital') as hospitals,
          COUNT(*) FILTER (WHERE type = 'ngo') as ngos,
          COUNT(*) FILTER (WHERE country = 'United States') as us_organizations
        FROM databank_organizations
      `),
      
      // Data offer statistics
      pool.query(`
        SELECT 
          COUNT(*) as total_data_offers,
          COUNT(*) FILTER (WHERE access_level = 'open') as open_data,
          COUNT(*) FILTER (WHERE access_level = 'restricted') as restricted_data,
          COUNT(*) FILTER (WHERE access_level = 'collaboration_required') as collaboration_data,
          SUM(request_count) as total_requests
        FROM databank_data_offers
      `),
      
      // Request statistics
      pool.query(`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
          COUNT(*) FILTER (WHERE status = 'approved') as approved_requests,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected_requests,
          COUNT(*) FILTER (WHERE submitted_date >= CURRENT_DATE - INTERVAL '30 days') as recent_requests
        FROM databank_data_requests
      `)
    ]);

    const stats = {
      organizations: orgStats.rows[0],
      data_offers: dataStats.rows[0],
      requests: requestStats.rows[0],
      generated_at: new Date().toISOString()
    };

    res.json({ stats });

  } catch (error) {
    console.error('Error fetching platform statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =================================
// TEAM MESSAGING API ROUTES
// =================================

// Get user's conversations
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    
    let whereClause = '';
    const params: any[] = [req.user.id];
    
    if (type && (type === 'group' || type === 'direct')) {
      whereClause = 'AND c.type = $2';
      params.push(type);
    }

    const result = await pool.query(`
      SELECT
        c.*,
        COUNT(DISTINCT cp.user_id) as participants,
        (
          SELECT m.content
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_at
      FROM conversations c
      JOIN conversation_participants cp_user ON c.id = cp_user.conversation_id AND cp_user.user_id = $1
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE 1=1 ${whereClause}
      GROUP BY c.id
      ORDER BY COALESCE(
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
        c.updated_at
      ) DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('💥 Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a conversation
app.get('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const participant = await pool.query(`
      SELECT * FROM conversation_participants 
      WHERE conversation_id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const result = await pool.query(`
      SELECT 
        m.*,
        u.username as sender_name,
        u.first_name as sender_first_name,
        u.last_name as sender_last_name,
        u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
      LIMIT $2
    `, [id, limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('💥 Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message
app.post('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const result = await pool.query(`
      INSERT INTO messages (conversation_id, sender_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, req.user.id, content]);

    // Update conversation updated_at
    await pool.query(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('💥 Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new conversation (direct or group)
app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const { type, name, participant_ids } = req.body;
    
    if (!type || (type !== 'direct' && type !== 'group')) {
      return res.status(400).json({ error: 'Invalid conversation type' });
    }

    if (type === 'direct' && (!participant_ids || participant_ids.length !== 1)) {
      return res.status(400).json({ error: 'Direct conversation requires exactly one participant' });
    }

    // Check if direct conversation already exists
    if (type === 'direct') {
      const existingConv = await pool.query(`
        SELECT c.id
        FROM conversations c
        JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = $1
        JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = $2
        WHERE c.type = 'direct'
        GROUP BY c.id
        HAVING COUNT(DISTINCT cp1.user_id) = 1 AND COUNT(DISTINCT cp2.user_id) = 1
        LIMIT 1
      `, [req.user.id, participant_ids[0]]);

      if (existingConv.rows.length > 0) {
        return res.json(existingConv.rows[0]);
      }
    }

    // Create conversation
    const convResult = await pool.query(`
      INSERT INTO conversations (type, name, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [type, name || null, req.user.id]);

    const conversationId = convResult.rows[0].id;

    // Add current user as participant
    await pool.query(`
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES ($1, $2)
    `, [conversationId, req.user.id]);

    // Add other participants
    if (participant_ids && participant_ids.length > 0) {
      for (const participantId of participant_ids) {
        await pool.query(`
          INSERT INTO conversation_participants (conversation_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `, [conversationId, participantId]);
      }
    }

    res.status(201).json(convResult.rows[0]);
  } catch (error) {
    console.error('💥 Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation participants
app.get('/api/conversations/:id/participants', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is a participant
    const participant = await pool.query(`
      SELECT * FROM conversation_participants 
      WHERE conversation_id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const result = await pool.query(`
      SELECT 
        cp.*,
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url
      FROM conversation_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.conversation_id = $1
      ORDER BY cp.joined_at ASC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('💥 Get participants error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// =================================
// REVOLUTIONARY FEATURES API ROUTES
// =================================

// Mount the revolutionary feature routes with authentication
app.use('/api/scientist-passport', authenticateToken, scientistPassportRoutes);
app.use('/api/services', authenticateToken, serviceMarketplaceRoutes);
// Note: Negative results browse endpoint is public, but authenticated endpoints require auth
app.use('/api/negative-results', negativeResultsRoutes);
app.use('/api/ai-training', authenticateToken, aiTrainingRoutes);
app.use('/api/ai-providers', authenticateToken, aiProviderKeysRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/api-task-assignments', authenticateToken, apiTaskAssignmentsRoutes);
app.use('/api/agents', authenticateToken, agentsRoutes);
app.use('/api/orchestrator', authenticateToken, orchestratorRoutes);
app.use('/api/lab-workspace', authenticateToken, labWorkspaceRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/protocol-execution', authenticateToken, protocolExecutionRoutes);
app.use('/api/protocol-collaboration', authenticateToken, protocolCollaborationRoutes);
app.use('/api/protocol-search', authenticateToken, protocolSemanticSearchRoutes);
app.use('/api/protocol-ai', authenticateToken, protocolAIRoutes);
app.use('/api/protocol-comparison', authenticateToken, protocolComparisonRoutes);
app.use('/api/experiment-tracker', authenticateToken, experimentTrackerRoutes);
app.use('/api/experiments', authenticateToken, experimentTrackerRoutes);
app.use('/api/project-management', authenticateToken, projectManagementRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/notebook-summaries', notebookSummariesRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/grants', authenticateToken, grantsRoutes);
app.use('/api/research-events', authenticateToken, researchEventsRoutes);
app.use('/api/marketplace', authenticateToken, marketplaceDirectoryRoutes);
app.use('/api/networking/posts', authenticateToken, networkingPostsRoutes);
app.use('/api/networking/directory', authenticateToken, networkingDirectoryRoutes);
app.use('/api/networking/social', authenticateToken, networkingSocialRoutes);
app.use('/api/help-forum', authenticateToken, helpForumRoutes);
app.use('/api/notifications', authenticateToken, notificationsRoutes);
app.use('/api/community-news', authenticateToken, communityNewsRoutes);
app.use('/api/ai-research-agent', authenticateToken, aiResearchAgentRoutes);
app.use('/api/wellbeing', authenticateToken, wellbeingRoutes);
app.use('/api/onboarding', authenticateToken, onboardingDemoRoutes);
app.use('/api/lab-training', authenticateToken, labTrainingRoutes);
app.use('/api/evidence-ai', authenticateToken, evidenceAIRoutes);
app.use('/api/stats-guide', authenticateToken, statsGuideRoutes);
app.use('/api/writing', authenticateToken, writingRoutes);
app.use('/api/research', authenticateToken, researchRoutes);

// Alias route for data-results (frontend uses hyphen, backend uses slash)
app.get('/api/data-results', authenticateToken, async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { lab_id, data_type, search, tags, date_from, date_to, experiment_id } = req.query;
    const userId = (req as any).user.id;

    let query = `
      SELECT r.*, u.username, u.first_name, u.last_name, l.name as lab_name
      FROM research_data r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN labs l ON r.lab_id = l.id
      WHERE (
        r.user_id = $1
        OR r.privacy_level = 'global'
        OR (
          r.privacy_level IN ('lab', 'institution')
          AND r.lab_id IS NOT NULL
          AND r.lab_id IN (
            SELECT lab_id FROM lab_members WHERE user_id = $2 AND COALESCE(is_active, 1) = 1
          )
        )
      )
    `;
    
    const queryParams: any[] = [userId, userId];
    let paramCount = 2;

    // Filter by lab_id only when caller is a member
    if (lab_id) {
      const membership = await pool.query(
        `SELECT 1 AS ok FROM lab_members
         WHERE user_id = $1 AND lab_id = $2 AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        [userId, lab_id]
      );
      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this lab' });
      }
      paramCount++;
      query += ` AND r.lab_id = $${paramCount}`;
      queryParams.push(lab_id);
    }

    // Filter by linked experiment
    if (experiment_id) {
      paramCount++;
      query += ` AND r.experiment_id = $${paramCount}`;
      queryParams.push(experiment_id);
    }

    // Filter by data_type
    if (data_type) {
      paramCount++;
      query += ` AND r.data_type = $${paramCount}`;
      queryParams.push(data_type);
    }

    // Search in title and description
    if (search) {
      paramCount++;
      query += ` AND (r.title ILIKE $${paramCount} OR r.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    // Filter by tags
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      paramCount++;
      query += ` AND r.tags && $${paramCount}`;
      queryParams.push(tagArray);
    }

    // Date range filters
    if (date_from) {
      paramCount++;
      query += ` AND r.created_at >= $${paramCount}`;
      queryParams.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND r.created_at <= $${paramCount}`;
      queryParams.push(date_to);
    }

    query += ' ORDER BY r.created_at DESC LIMIT 100';

    const result = await pool.query(query, queryParams);

    res.json({ results: result.rows });
  } catch (error: any) {
    console.error('💥 Get data results error:', error);
    if (error.code) console.error('Database error code:', error.code);
    if (error.message) console.error('Error message:', error.message);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

console.log('✨ Revolutionary features API routes registered:');
console.log('   - /api/scientist-passport (Enhanced profiles & skills)');
console.log('   - /api/services (Service marketplace)');
console.log('   - /api/negative-results (Failed experiments database)');
console.log('   - /api/ai-training (Personalized AI training)');
console.log('   - /api/ai-providers (API key management)');
console.log('   - /api/api-task-assignments (API task assignments)');
console.log('   - /api/agents (Individual Task Agents)');
console.log('   - /api/orchestrator (Multi-Agent Workflow Orchestration)');
console.log('   - /api/notifications (In-app notification inbox)');
console.log('   - /api/lab-workspace (ClickUp-inspired task management)');
console.log('   - /api/settings (User settings & preferences)');
console.log('   - /api/marketplace (Directory: suppliers, service providers & tenders)');
console.log('   - /api/recommendations (Intelligent recommendations system)');

// Production / DirectAdmin: serve Vite build from the same Node process
mountFrontendStatic(app);

// Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Research Data Bank API available at http://localhost:${PORT}/api/databank`);
  console.log(`✨ Revolutionary Features API available at http://localhost:${PORT}/api/scientist-passport`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

export default app;

