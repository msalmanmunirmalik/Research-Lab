import { createHash, randomBytes, randomUUID } from 'crypto';
import { hash as hashPassword } from 'bcrypt';
import { sendEmail, type EmailResult } from '../integrations/email.js';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }>;
};

export type TokenRow = {
  id: string;
  user_id: string;
  used_at: Date | string | null;
  expires_at: Date | string;
};

export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function classifyToken(
  row: TokenRow | undefined,
  now = new Date()
): 'missing' | 'used' | 'expired' | 'ok' {
  if (!row) return 'missing';
  if (row.used_at) return 'used';
  const expires = new Date(row.expires_at).getTime();
  if (Number.isNaN(expires) || expires <= now.getTime()) return 'expired';
  return 'ok';
}

export function publicForgotPasswordBody(delivered: boolean): {
  message: string;
  emailDelivery: { delivered: boolean };
} {
  return {
    message: delivered
      ? 'If an account exists for that email, reset instructions were sent.'
      : 'If an account exists for that email, reset instructions were recorded. Email delivery is not configured.',
    emailDelivery: { delivered },
  };
}

export function verificationNotice(delivered: boolean): string {
  return delivered
    ? 'Verification message was sent.'
    : 'Verification was recorded. Email delivery is not configured.';
}

function appBase(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function resolveDb(db?: Queryable): Promise<Queryable> {
  if (db) return db;
  const mod = await import('../../database/config.js');
  return mod.default;
}

async function issueToken(
  db: Queryable,
  table: 'password_reset_tokens' | 'email_verification_tokens',
  userId: string,
  ttlMs: number
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const id = randomUUID();
  const expires = new Date(Date.now() + ttlMs);
  await db.query(
    `INSERT INTO ${table} (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [id, userId, hashAccountToken(token), expires]
  );
  return token;
}

export async function requestPasswordReset(
  email: string,
  db?: Queryable
): Promise<{ delivered: boolean }> {
  const database = await resolveDb(db);
  const found = await database.query(
    'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()]
  );
  const user = found.rows[0];
  if (!user) return { delivered: false };

  const token = await issueToken(database, 'password_reset_tokens', user.id, RESET_TTL_MS);
  const sent = await sendEmail({
    to: user.email,
    template: 'password_reset',
    vars: { resetUrl: `${appBase()}/reset-password?token=${encodeURIComponent(token)}` },
  });
  return { delivered: sent.delivered };
}

export async function resetPassword(
  token: string,
  newPassword: string,
  db?: Queryable
): Promise<'ok' | 'invalid'> {
  const database = await resolveDb(db);
  const found = await database.query(
    'SELECT id, user_id, used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1',
    [hashAccountToken(token)]
  );
  const row = found.rows[0] as TokenRow | undefined;
  if (classifyToken(row) !== 'ok' || !row) return 'invalid';

  const claim = await database.query(
    'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
    [row.id]
  );
  if (!claim.affectedRows) return 'invalid';

  const newHash = await hashPassword(newPassword, BCRYPT_ROUNDS);
  await database.query(
    'UPDATE users SET password_hash = $1, tokens_invalid_before = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newHash, row.user_id]
  );
  return 'ok';
}

export async function revokeUserTokens(userId: string, db?: Queryable): Promise<void> {
  const database = await resolveDb(db);
  await database.query('UPDATE users SET tokens_invalid_before = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
}

export async function replacePassword(
  userId: string,
  newPassword: string,
  db?: Queryable
): Promise<void> {
  const database = await resolveDb(db);
  const newHash = await hashPassword(newPassword, BCRYPT_ROUNDS);
  await database.query(
    'UPDATE users SET password_hash = $1, tokens_invalid_before = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newHash, userId]
  );
}

export async function startEmailVerification(
  userId: string,
  email: string,
  db?: Queryable
): Promise<EmailResult> {
  const database = await resolveDb(db);
  const token = await issueToken(database, 'email_verification_tokens', userId, VERIFY_TTL_MS);
  return sendEmail({
    to: email,
    template: 'email_verification',
    vars: { verifyUrl: `${appBase()}/verify-email?token=${encodeURIComponent(token)}` },
  });
}

export async function verifyEmail(
  token: string,
  db?: Queryable
): Promise<'ok' | 'invalid'> {
  const database = await resolveDb(db);
  const found = await database.query(
    'SELECT id, user_id, used_at, expires_at FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1',
    [hashAccountToken(token)]
  );
  const row = found.rows[0] as TokenRow | undefined;
  if (classifyToken(row) !== 'ok' || !row) return 'invalid';

  const claim = await database.query(
    'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
    [row.id]
  );
  if (!claim.affectedRows) return 'invalid';

  await database.query(
    'UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [row.user_id]
  );
  return 'ok';
}
