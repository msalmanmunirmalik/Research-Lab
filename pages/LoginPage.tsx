import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import LegalFooterLinks from '../components/LegalFooterLinks';
import BrandMark from '../components/BrandMark';

const inputClassName =
  'w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-teal-700 focus:ring-1 focus:ring-teal-700';

function safeNextPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch {
    /* ignore */
  }
  return '/dashboard';
}

function LoginPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      await login(email, password);
      navigate(safeNextPath(searchParams.get('next')), { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="landing-page flex min-h-screen bg-[#F7F8F6] text-slate-900 antialiased">
      <div className="relative hidden w-[42%] overflow-hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1600&q=80"
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
          <BrandMark to="/" variant="light" />
          <div className="max-w-sm">
            <p className="landing-serif text-3xl leading-tight tracking-tight">
              Your lab, one operating system.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Sign in to continue protocols, notebooks, experiments, and writing in RILOS.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-6 lg:px-12">
          <BrandMark to="/" variant="app" compact className="lg:invisible" />
          <Link
            to="/register"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            Create account
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:px-12">
          <div className="w-full max-w-md">
            <h1 className="landing-serif text-3xl tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-2 text-sm text-slate-600">
              Welcome back to RILOS.
            </p>

            <form className="mt-10 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  className={inputClassName}
                  placeholder="you@lab.edu"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                    className={`${inputClassName} pr-10`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-600"
                    onClick={() => {
                      setShowPassword(!showPassword);
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-medium text-teal-800 hover:text-teal-700">
                  Forgot password?
                </Link>
              </div>

              {error ? (
                <div
                  className="border border-red-200 bg-red-50 px-3 py-2.5"
                  data-testid="login-error"
                >
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-8 text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-teal-800 transition-colors hover:text-teal-700"
              >
                Create one
              </Link>
            </p>

            <LegalFooterLinks className="mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
