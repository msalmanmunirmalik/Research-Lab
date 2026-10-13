import { z } from 'zod';

/** Roles users may self-select at signup. Privileged roles are admin-assigned only. */
export const PUBLIC_SIGNUP_ROLES = ['student', 'researcher'] as const;

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a number');

export const registerSchema = z.object({
  email: z.string().trim().email('Valid email is required').max(255),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens'),
  password: passwordSchema,
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  // Client may still send role; unknown/privileged values are coerced server-side
  role: z.string().trim().optional()
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(255),
  password: z.string().min(1, 'Password is required').max(256)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema
});

export const profileUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(255).optional()
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid email is required').max(255)
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: passwordSchema
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20).max(200)
});

export const resendVerificationSchema = z.object({}).strict();

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ') || 'Invalid input';
}

export function resolveSignupRole(requested?: string): (typeof PUBLIC_SIGNUP_ROLES)[number] {
  if (requested && (PUBLIC_SIGNUP_ROLES as readonly string[]).includes(requested)) {
    return requested as (typeof PUBLIC_SIGNUP_ROLES)[number];
  }
  return 'student';
}
