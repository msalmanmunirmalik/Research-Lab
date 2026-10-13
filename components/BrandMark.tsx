import React from 'react';
import { Link } from 'react-router-dom';

type BrandMarkVariant = 'app' | 'light' | 'dark' | 'inverse';

interface BrandMarkProps {
  to?: string;
  variant?: BrandMarkVariant;
  showTagline?: boolean;
  compact?: boolean;
  /** Full pitch wordmark image (best on light backgrounds). */
  wordmark?: boolean;
  className?: string;
  onClick?: () => void;
}

const markBox: Record<BrandMarkVariant, string> = {
  app: 'bg-gradient-to-br from-[#0B1F3A] to-[#0E8F9C] text-white',
  light: 'bg-white text-[#0B1F3A]',
  dark: 'bg-[#0B1F3A] text-white',
  inverse: 'bg-white text-[#0B1F3A]',
};

const titleClass: Record<BrandMarkVariant, string> = {
  app: 'text-slate-900 group-hover:text-teal-900',
  light: 'text-white',
  dark: 'text-white',
  inverse: 'text-slate-900',
};

const subtitleClass: Record<BrandMarkVariant, string> = {
  app: 'text-slate-500',
  light: 'text-white/70',
  dark: 'text-white/65',
  inverse: 'text-slate-500',
};

/**
 * RILOS brand mark.
 * - Default: gradient “RI” lockup + word (works on light/dark chrome)
 * - wordmark: pitch-deck PNG (horizontal logo; prefer light backgrounds)
 */
const BrandMark: React.FC<BrandMarkProps> = ({
  to = '/',
  variant = 'app',
  showTagline = false,
  compact = false,
  wordmark = false,
  className = '',
  onClick,
}) => {
  const content = wordmark ? (
    <img
      src="/rilos-logo.png"
      alt="RILOS — Research Intelligence & Operating System"
      className={compact ? 'h-7 w-auto max-w-[160px] object-contain' : 'h-9 w-auto max-w-[220px] object-contain'}
    />
  ) : (
    <>
      <span
        className={[
          'flex items-center justify-center font-semibold tracking-wide flex-shrink-0 rounded-lg',
          compact ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-sm',
          markBox[variant],
        ].join(' ')}
        aria-hidden="true"
      >
        RI
      </span>
      <span className="min-w-0">
        <span
          className={[
            'block font-semibold leading-tight tracking-tight truncate transition-colors',
            compact ? 'text-[13px]' : 'text-lg landing-serif',
            titleClass[variant],
          ].join(' ')}
        >
          RILOS
        </span>
        {showTagline ? (
          <span
            className={[
              'block truncate leading-tight mt-0.5',
              compact ? 'text-[10px]' : 'text-[11px]',
              subtitleClass[variant],
            ].join(' ')}
          >
            Research Intelligence & OS
          </span>
        ) : compact ? (
          <span className={['block truncate leading-tight mt-0.5 text-[11px]', subtitleClass[variant]].join(' ')}>
            Research OS
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = ['flex items-center gap-2.5 group min-w-0', className].filter(Boolean).join(' ');

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes} aria-label="RILOS home">
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} aria-label="RILOS">
      {content}
    </div>
  );
};

export default BrandMark;
