import dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from "../../database/config.js";
import { assertAuthEnvironment, getRequiredJwtSecret } from '../utils/authEnvironment.js';
import { isTokenRevoked } from '../utils/tokenRevocation.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

assertAuthEnvironment();

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: string;
  status?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  current_institution?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = getRequiredJwtSecret();
const ENABLE_DEMO_AUTH = process.env.ENABLE_DEMO_AUTH === 'true';
const DEMO_TOKEN = process.env.DEMO_AUTH_TOKEN || 'demo-token-123';

const demoUser: AuthenticatedUser = {
  id: 'demo-user-0001',
  username: 'researcher',
  email: process.env.DEMO_AUTH_EMAIL || 'researcher@researchlab.com',
  role: 'researcher',
  status: 'active',
  first_name: 'Fatima',
  last_name: 'Martinez',
  avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
  current_institution: 'Stanford University'
};

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Demo token only when explicitly enabled (blocked in production by boot guard)
    if (ENABLE_DEMO_AUTH && token === DEMO_TOKEN) {
      req.user = demoUser;
      pool
        .query(
          `INSERT INTO users (id, username, email, first_name, last_name, password_hash, role, status, email_verified)
           VALUES ($1, $2, $3, $4, $5, 'demo', $6, 'active', 1)
           ON DUPLICATE KEY UPDATE
             first_name = VALUES(first_name),
             last_name = VALUES(last_name),
             username = VALUES(username),
             email = VALUES(email)`,
          [
            demoUser.id,
            demoUser.username,
            demoUser.email,
            demoUser.first_name,
            demoUser.last_name,
            demoUser.role,
          ]
        )
        .catch((err) => console.warn('Demo user upsert skipped:', err?.message || err));
      return next();
    }

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; iat?: number };
    const result = await pool.query(
      `SELECT id, email, username, first_name, last_name, role, status,
              UNIX_TIMESTAMP(tokens_invalid_before) AS tokens_invalid_before_unix
       FROM users
       WHERE id = $1`,
      [payload.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    if (isTokenRevoked(payload.iat, user.tokens_invalid_before_unix)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      first_name: user.first_name,
      last_name: user.last_name
    };

    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
};

/** @deprecated Use authenticateToken - kept as an alias for older route wiring */
export const demoAuth = authenticateToken;
