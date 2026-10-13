import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveApiBaseUrl } from '../utils/apiBase';
import BrandMark from '../components/BrandMark';

const inputClassName =
  'w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-teal-700 focus:ring-1 focus:ring-teal-700';

function RecoveryShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="landing-page flex min-h-screen items-center justify-center bg-[#F7F8F6] px-6 py-16 text-slate-900">
      <div className="w-full max-w-md">
        <BrandMark to="/" variant="app" wordmark compact className="mb-8" />
        <h1 className="landing-serif text-3xl tracking-tight text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Could not record a reset request');
        return;
      }
      setMessage(data.message || 'Reset instructions were recorded. Email delivery is not configured.');
    } catch {
      setError('Could not reach the server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RecoveryShell title="Reset password">
      <p className="mt-2 text-sm text-slate-600">
        We record a reset message for the account if it exists. This screen does not confirm whether that email is registered.
      </p>
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
            placeholder="you@lab.edu"
          />
        </div>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {isLoading ? 'Recording…' : 'Record reset request'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        <Link to="/login" className="font-medium text-teal-800">
          Back to sign in
        </Link>
      </p>
    </RecoveryShell>
  );
}

export function ResetPasswordPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Reset link is invalid or expired');
        return;
      }
      setMessage(data.message || 'Password updated.');
    } catch {
      setError('Could not reach the server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RecoveryShell title="Choose a new password">
      <p className="mt-2 text-sm text-slate-600">
        Use the link from the server log while email delivery is not configured. The link works once.
      </p>
      {!token ? <p className="mt-4 text-sm text-red-700">This reset link is missing a token.</p> : null}
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClassName}
            autoComplete="new-password"
          />
        </div>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading || !token}
          className="flex w-full items-center justify-center bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {isLoading ? 'Updating…' : 'Update password'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        <Link to="/login" className="font-medium text-teal-800">
          Sign in
        </Link>
      </p>
    </RecoveryShell>
  );
}

export function VerifyEmailPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [message, setMessage] = useState(token ? 'Checking the verification link…' : 'This verification link is missing a token.');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${resolveApiBaseUrl()}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (cancelled) return;
        setMessage(response.ok ? data.message || 'Email verified' : data.error || 'Verification link is invalid or expired');
      } catch {
        if (!cancelled) setMessage('Could not reach the server');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <RecoveryShell title="Verify email">
      <p className="mt-4 text-sm text-slate-700">{message}</p>
      <p className="mt-6 text-sm text-slate-600">
        <Link to="/login" className="font-medium text-teal-800">
          Sign in
        </Link>
      </p>
    </RecoveryShell>
  );
}
