import express, { type Request, type Response } from 'express';
import { authRateLimit } from '../middleware/security.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  forgotPasswordSchema,
  formatZodError,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validation/authSchemas.js';
import {
  publicForgotPasswordBody,
  requestPasswordReset,
  resetPassword,
  startEmailVerification,
  verificationNotice,
  verifyEmail,
} from '../services/accountRecovery.js';
import pool from '../../database/config.js';

const router = express.Router();

router.post('/forgot-password', authRateLimit, async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  try {
    const result = await requestPasswordReset(parsed.data.email);
    return res.json(publicForgotPasswordBody(result.delivered));
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', authRateLimit, async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  try {
    const outcome = await resetPassword(parsed.data.token, parsed.data.newPassword);
    if (outcome !== 'ok') {
      return res.status(400).json({ error: 'Reset link is invalid or expired' });
    }
    return res.json({
      message: 'Password updated. Sign in again. Other sessions from before this change were signed out.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-email', authRateLimit, async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  try {
    const outcome = await verifyEmail(parsed.data.token);
    if (outcome !== 'ok') {
      return res.status(400).json({ error: 'Verification link is invalid or expired' });
    }
    return res.json({ message: 'Email verified' });
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/resend-verification',
  authenticateToken,
  authRateLimit,
  async (req: Request, res: Response) => {
    const parsed = resendVerificationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const userId = req.user!.id;
      const found = await pool.query(
        'SELECT email, email_verified FROM users WHERE id = $1 LIMIT 1',
        [userId]
      );
      const user = found.rows[0];
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (user.email_verified) {
        return res.json({
          message: 'Email is already verified',
          emailDelivery: { delivered: false },
        });
      }
      const sent = await startEmailVerification(userId, user.email);
      return res.json({
        message: verificationNotice(sent.delivered),
        emailDelivery: { delivered: sent.delivered },
      });
    } catch (error) {
      console.error('Resend verification error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
