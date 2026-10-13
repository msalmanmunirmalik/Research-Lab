import React from 'react';
import { Link } from 'react-router-dom';

export type LinkedEntityKind = 'protocol' | 'experiment' | 'notebook' | 'data';

export type LinkedEntity = {
  kind: LinkedEntityKind;
  id: string;
  label?: string;
};

const ROUTES: Record<LinkedEntityKind, (id: string) => string> = {
  protocol: (id) =>
    `/experiment-tracker?tab=protocols&protocolId=${encodeURIComponent(id)}`,
  experiment: (id) => `/experiments/${encodeURIComponent(id)}`,
  notebook: (id) => `/lab-notebook?highlight=${encodeURIComponent(id)}`,
  data: (id) => `/data-results?highlight=${encodeURIComponent(id)}`,
};

const LABELS: Record<LinkedEntityKind, string> = {
  protocol: 'Protocol',
  experiment: 'Experiment',
  notebook: 'Notebook',
  data: 'Evidence',
};

const STYLES: Record<LinkedEntityKind, string> = {
  protocol: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  experiment: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
  notebook: 'bg-amber-50 text-amber-900 hover:bg-amber-100',
  data: 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
};

type Props = {
  links: LinkedEntity[];
  className?: string;
  title?: string;
};

/** Compact navigation chips for protocol / experiment / notebook / data FKs. */
const LinkedEntityChips: React.FC<Props> = ({
  links,
  className = '',
  title = 'Linked',
}) => {
  const usable = links.filter((link) => link.id);
  if (usable.length === 0) return null;

  return (
    <div className={className}>
      {title ? (
        <p className="text-xs font-medium text-slate-500 mb-1.5">{title}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {usable.map((link) => (
          <Link
            key={`${link.kind}-${link.id}`}
            to={ROUTES[link.kind](link.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${STYLES[link.kind]}`}
            title={`Open ${LABELS[link.kind]}`}
          >
            <span className="opacity-70">{LABELS[link.kind]}</span>
            <span>{link.label || 'Open'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export function buildWorkflowLinks(ids: {
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
  dataResultId?: string | null;
}): LinkedEntity[] {
  const links: LinkedEntity[] = [];
  if (ids.protocolId) links.push({ kind: 'protocol', id: ids.protocolId });
  if (ids.experimentId) links.push({ kind: 'experiment', id: ids.experimentId });
  if (ids.notebookEntryId) links.push({ kind: 'notebook', id: ids.notebookEntryId });
  if (ids.dataResultId) links.push({ kind: 'data', id: ids.dataResultId });
  return links;
}

export default LinkedEntityChips;
