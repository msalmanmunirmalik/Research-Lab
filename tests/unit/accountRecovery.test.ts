import { readFileSync } from 'fs';
import { join } from 'path';
import { sendEmail } from '../../server/integrations/email';
import {
  classifyToken,
  hashAccountToken,
  publicForgotPasswordBody,
  requestPasswordReset,
  resetPassword,
} from '../../server/services/accountRecovery';
import { isTokenRevoked } from '../../server/utils/tokenRevocation';

type Row = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
};

function memoryDb(users: { id: string; email: string; password_hash: string; tokens_invalid_before?: number | null }[]) {
  const resets: Row[] = [];
  return {
    resets,
    users,
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('FROM users WHERE email')) {
        const row = users.find((user) => user.email === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('INSERT INTO password_reset_tokens')) {
        resets.push({
          id: String(params[0]),
          user_id: String(params[1]),
          token_hash: String(params[2]),
          expires_at: params[3] as Date,
          used_at: null,
        });
        return { rows: [], affectedRows: 1 };
      }
      if (sql.includes('FROM password_reset_tokens WHERE token_hash')) {
        const row = resets.find((item) => item.token_hash === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('UPDATE password_reset_tokens')) {
        const row = resets.find(
          (item) =>
            item.id === params[0] &&
            item.used_at == null &&
            new Date(item.expires_at).getTime() > Date.now()
        );
        if (!row) return { rows: [], affectedRows: 0 };
        row.used_at = new Date();
        return { rows: [], affectedRows: 1 };
      }
      if (sql.startsWith('UPDATE users SET password_hash')) {
        const user = users.find((item) => item.id === params[1]);
        if (user) {
          user.password_hash = String(params[0]);
          if (sql.includes('tokens_invalid_before')) user.tokens_invalid_before = Math.floor(Date.now() / 1000);
        }
        return { rows: [], affectedRows: 1 };
      }
      return { rows: [], affectedRows: 0 };
    },
  };
}

function tokenFromLogs(logs: string[]): string {
  const line = logs.join('\n');
  const match = line.match(/resetUrl: .*[?&]token=([a-f0-9]+)/);
  if (!match) throw new Error('reset token was not logged');
  return match[1];
}

describe('account recovery', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  test('dev email port returns delivered false', async () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await sendEmail({
      to: 'person@lab.edu',
      template: 'password_reset',
      vars: { resetUrl: 'http://localhost:5173/reset-password?token=abc' },
    });
    expect(result.delivered).toBe(false);
    expect(result.providerMessageId).toBeUndefined();
  });

  test('forgot-password notice is the same for a missing user and a real user', async () => {
    process.env.NODE_ENV = 'test';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = memoryDb([{ id: 'user-1', email: 'real@lab.edu', password_hash: 'old' }]);
    const missing = await requestPasswordReset('missing@lab.edu', db);
    const real = await requestPasswordReset('real@lab.edu', db);
    expect(missing).toEqual(real);
    expect(publicForgotPasswordBody(missing.delivered)).toEqual(publicForgotPasswordBody(real.delivered));
    expect(publicForgotPasswordBody(false).message).not.toMatch(/sent/i);
    expect(publicForgotPasswordBody(false).emailDelivery.delivered).toBe(false);
  });

  test('reset token cannot be reused and an expired token fails', async () => {
    process.env.NODE_ENV = 'test';
    const logs: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const db = memoryDb([{ id: 'user-1', email: 'real@lab.edu', password_hash: 'old' }]);
    await requestPasswordReset('real@lab.edu', db);
    const token = tokenFromLogs(logs);
    expect(hashAccountToken(token)).toHaveLength(64);

    const first = await resetPassword(token, 'NewPass123', db);
    const second = await resetPassword(token, 'NewPass123', db);
    expect(first).toBe('ok');
    expect(second).toBe('invalid');
    expect(db.users[0].password_hash).not.toBe('old');
    expect(db.users[0].tokens_invalid_before).toEqual(expect.any(Number));

    logs.length = 0;
    await requestPasswordReset('real@lab.edu', db);
    const expiredToken = tokenFromLogs(logs);
    db.resets[db.resets.length - 1].expires_at = new Date(Date.now() - 60_000);
    expect(await resetPassword(expiredToken, 'OtherPass123', db)).toBe('invalid');
    expect(classifyToken(undefined)).toBe('missing');
    expect(classifyToken({ id: '1', user_id: 'u', used_at: new Date(), expires_at: new Date(Date.now() + 1000) })).toBe('used');
  });

  test('migration backfills existing users and new signups stay unverified', () => {
    const migration = readFileSync(
      join(process.cwd(), 'database/migrations/mysql_account_recovery.sql'),
      'utf8'
    );
    expect(migration).toContain('email_verification_tokens');
    expect(migration).toContain('password_reset_tokens');
    expect(migration).toContain('UPDATE users SET email_verified = 1 WHERE email_verified = 0');

    const server = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
    const registerStart = server.indexOf("app.post('/api/auth/register'");
    const registerEnd = server.indexOf("app.post('/api/auth/login'");
    const register = server.slice(registerStart, registerEnd);
    expect(register).toContain('email_verified');
    expect(register).toContain('false');

    const loginStart = server.indexOf("app.post('/api/auth/login'");
    const loginEnd = server.indexOf("app.post('/api/auth/demo-login'");
    const login = server.slice(loginStart, loginEnd);
    expect(login).not.toMatch(/email is not verified|!user\.email_verified|email_verified !== 1/);
  });

  test('a token issued before the cutoff is rejected and one issued after is accepted', () => {
    const cutoff = 1_700_000_000;
    expect(isTokenRevoked(cutoff - 60, cutoff)).toBe(true);
    expect(isTokenRevoked(cutoff + 10, cutoff)).toBe(false);
    expect(isTokenRevoked(cutoff - 2, cutoff)).toBe(true);
    expect(isTokenRevoked(cutoff, cutoff)).toBe(false);
    expect(isTokenRevoked(undefined, cutoff)).toBe(true);
    expect(isTokenRevoked(cutoff - 60, null)).toBe(false);
  });
});
