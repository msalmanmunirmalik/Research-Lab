import React from 'react';

export type ProvenanceIds = {
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
};

type Props = {
  ids: ProvenanceIds;
  className?: string;
  /** Compact single-chip style for cards */
  compact?: boolean;
};

const PARTS: Array<{ key: keyof ProvenanceIds; label: string }> = [
  { key: 'protocolId', label: 'protocol' },
  { key: 'experimentId', label: 'experiment' },
  { key: 'notebookEntryId', label: 'notebook' },
];

/**
 * Evidence-chain provenance signal: how many of protocol / experiment / notebook are linked.
 */
const ProvenanceBadge: React.FC<Props> = ({ ids, className = '', compact = false }) => {
  const linked = PARTS.filter((part) => Boolean(ids[part.key]));
  const count = linked.length;
  const orphan = count === 0;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
          orphan
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : count === 3
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-sky-200 bg-sky-50 text-sky-800'
        } ${className}`}
        title={
          orphan
            ? 'No upstream links — orphan evidence'
            : `Linked: ${linked.map((p) => p.label).join(' · ')}`
        }
      >
        {orphan ? 'Orphan' : `${count}/3 linked`}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] ${
        orphan
          ? 'border-amber-200 bg-amber-50/80 text-amber-900'
          : 'border-slate-200 bg-white text-slate-700'
      } ${className}`}
      role="status"
    >
      <span className="font-semibold text-slate-800">
        {orphan ? 'No provenance links' : 'Provenance'}
      </span>
      {PARTS.map((part) => {
        const on = Boolean(ids[part.key]);
        return (
          <span
            key={part.key}
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${
              on
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                : 'bg-slate-50 text-slate-400 border border-slate-100'
            }`}
          >
            {part.label}
          </span>
        );
      })}
    </div>
  );
};

export function provenanceScore(ids: ProvenanceIds): number {
  return PARTS.filter((part) => Boolean(ids[part.key])).length;
}

export default ProvenanceBadge;
