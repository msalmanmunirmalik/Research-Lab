import React, { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders, getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import { Link, useSearchParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';

const SUGGESTED_AMOUNTS = [10, 25, 50, 100] as const;


interface SupportConfig {
  stripeEnabled: boolean;
  paypalEnabled: boolean;
  contactEmail: string;
  currency: string;
  minAmount: number;
  maxAmount: number;
  suggestedAmounts: number[];
}

const DEFAULT_CONFIG: SupportConfig = {
  stripeEnabled: false,
  paypalEnabled: false,
  contactEmail: 'support@digitalresearchmanager.com',
  currency: 'USD',
  minAmount: 3,
  maxAmount: 10000,
  suggestedAmounts: [...SUGGESTED_AMOUNTS],
};

function SupportUsPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  const [config, setConfig] = useState<SupportConfig>(DEFAULT_CONFIG);
  const [selectedAmount, setSelectedAmount] = useState<number>(25);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const response = await fetch(`${apiBaseUrl}/support/config`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Partial<SupportConfig>;
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          suggestedAmounts: data.suggestedAmounts?.length
            ? data.suggestedAmounts
            : DEFAULT_CONFIG.suggestedAmounts,
        });
      } catch {
        // Keep defaults when API is unavailable.
      }
    };

    void loadConfig();
  }, [apiBaseUrl]);

  const amountToCharge = useCustom
    ? Number.parseFloat(customAmount)
    : selectedAmount;

  const checkoutAvailable = config.stripeEnabled || config.paypalEnabled;

  const handleContribute = async (): Promise<void> => {
    setError('');

    if (!Number.isFinite(amountToCharge) || amountToCharge < config.minAmount) {
      setError(`Please enter at least $${config.minAmount}.`);
      return;
    }

    if (amountToCharge > config.maxAmount) {
      setError(`Maximum contribution is $${config.maxAmount}.`);
      return;
    }

    if (!checkoutAvailable) {
      window.location.href = `mailto:${config.contactEmail}?subject=${encodeURIComponent(
        'Support RILOS'
      )}&body=${encodeURIComponent(
        `I would like to contribute $${amountToCharge.toFixed(2)} to support the platform.\n\n${message}`
      )}`;
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/support/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(amountToCharge * 100) / 100,
          currency: 'usd',
          message: message.trim() || undefined,
        }),
      });

      const data = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
        contactEmail?: string;
      };

      if (!response.ok || !data.checkoutUrl) {
        setError(
          data.error ||
            `Unable to start checkout. Contact ${data.contactEmail || config.contactEmail}.`
        );
        return;
      }

      window.location.assign(data.checkoutUrl);
    } catch {
      setError('Network error while starting checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="landing-page min-h-screen bg-[#F7F8F6] text-slate-900 antialiased">
      <header className="border-b border-slate-200/80 bg-[#F7F8F6]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <BrandMark to="/" variant="app" wordmark />
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14 lg:px-8 lg:py-20">
        {status === 'success' ? (
          <div className="mb-10 border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-900">
            Thank you. Your contribution helps keep RILOS free and improving for
            every lab.
          </div>
        ) : null}
        {status === 'cancelled' ? (
          <div className="mb-10 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700">
            Checkout was cancelled. You can contribute anytime-no pressure.
          </div>
        ) : null}

        <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <section>
            <p className="text-xs font-semibold tracking-[0.18em] text-teal-800">SUPPORT US</p>
            <h1 className="landing-serif mt-3 text-4xl tracking-tight text-slate-900 sm:text-5xl">
              Keep the platform free-and moving forward
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              RILOS is free for researchers and labs. Contributions fund hosting,
              AI tooling, security, and new features so science teams can keep working without paywalls.
            </p>

            <ul className="mt-10 space-y-5 border-t border-slate-200 pt-8">
              <li>
                <h2 className="text-base font-semibold text-slate-900">Keep infrastructure online</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Servers, databases, storage, and uptime for notebooks, protocols, and collaboration.
                </p>
              </li>
              <li>
                <h2 className="text-base font-semibold text-slate-900">Fund product innovation</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  New AI protocol tools, databank capabilities, grants discovery, and lab workflows.
                </p>
              </li>
              <li>
                <h2 className="text-base font-semibold text-slate-900">Stay accessible</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Your support helps us remain free for students, independent researchers, and labs
                  everywhere.
                </p>
              </li>
            </ul>
          </section>

          <section className="border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="landing-serif text-2xl tracking-tight text-slate-900">
              Choose an amount
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              One-time contribution in {config.currency}. Every amount helps.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {config.suggestedAmounts.map((amount) => {
                const isActive = !useCustom && selectedAmount === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setUseCustom(false);
                      setSelectedAmount(amount);
                      setError('');
                    }}
                    className={[
                      'border px-3 py-3 text-sm font-semibold transition-colors',
                      isActive
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400',
                    ].join(' ')}
                  >
                    ${amount}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <label htmlFor="customAmount" className="mb-1.5 block text-sm font-medium text-slate-700">
                Custom amount (USD)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                  $
                </span>
                <input
                  id="customAmount"
                  type="number"
                  min={config.minAmount}
                  max={config.maxAmount}
                  step="1"
                  value={customAmount}
                  onChange={(e) => {
                    setUseCustom(true);
                    setCustomAmount(e.target.value);
                    setError('');
                  }}
                  onFocus={() => {
                    setUseCustom(true);
                  }}
                  className="w-full border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 outline-none transition-colors focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                  placeholder="Other"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="supportMessage" className="mb-1.5 block text-sm font-medium text-slate-700">
                Optional note
              </label>
              <textarea
                id="supportMessage"
                rows={3}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                placeholder="What should we build next?"
              />
            </div>

            {error ? (
              <div className="mt-4 border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                void handleContribute();
              }}
              className="mt-6 w-full bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? 'Opening checkout…'
                : checkoutAvailable
                  ? `Contribute $${Number.isFinite(amountToCharge) ? amountToCharge : '-'}`
                  : 'Email to contribute'}
            </button>

            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              {checkoutAvailable
                ? 'You will be redirected to a secure checkout. RILOS remains free for all users.'
                : `Online payments are not configured yet. You can reach us at ${config.contactEmail}.`}
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} RILOS</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/" className="transition-colors hover:text-slate-800">
              Home
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-slate-800">
              Privacy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-slate-800">
              Terms
            </Link>
            <a
              href={`mailto:${config.contactEmail}`}
              className="transition-colors hover:text-slate-800"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default SupportUsPage;
