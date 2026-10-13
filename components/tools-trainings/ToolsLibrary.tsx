import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  KIND_LABEL,
  LAB_TOOLS,
  TOOL_CATEGORIES,
  type ToolCategoryId,
  type ToolDef,
  type ToolKind,
} from '../../utils/toolCatalog';

/** Bench essentials shown first in the Tools library. */
const PINNED_IDS = [
  'dilution',
  'molar-solution',
  'ph-buffer',
  'primer-designer',
  'primer-check',
  'pcr-master-mix',
  'beer-lambert',
  'cell-count',
  'seeding',
  'protein-assay',
];

function toolHref(id: string) {
  return `/research-tools?tool=${encodeURIComponent(id)}`;
}

function sortTools(tools: ToolDef[]): ToolDef[] {
  const pin = new Map(PINNED_IDS.map((id, i) => [id, i]));
  return [...tools].sort((a, b) => {
    const ai = pin.has(a.id) ? (pin.get(a.id) as number) : 1000;
    const bi = pin.has(b.id) ? (pin.get(b.id) as number) : 1000;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

const ToolsLibrary: React.FC = () => {
  const [category, setCategory] = useState<ToolCategoryId | 'all'>('all');
  const [kind, setKind] = useState<ToolKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTools(
      LAB_TOOLS.filter((t) => {
        if (category !== 'all' && t.category !== category) return false;
        if (kind !== 'all' && t.kind !== kind) return false;
        if (!q) return true;
        return (
          t.name.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          t.id.includes(q)
        );
      })
    );
  }, [category, kind, query]);

  return (
    <section className="tt-tools">
      <header className="tt-section-head">
        <p className="tt-kicker">Tools library</p>
        <h2>Bench calculators & designers</h2>
        <p>
          Dilutions, molarity, buffer pH, primers, PCR setup, cell culture math, and more — open a
          tool and run it in place.
        </p>
      </header>

      <div className="tt-tools-controls">
        <input
          className="tt-input"
          type="search"
          placeholder="Search tools (e.g. dilution, primer, buffer)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search lab tools"
        />
        <div className="tt-filters">
          {TOOL_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`tt-chip ${category === c.id ? 'is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="tt-filters">
          {(
            [
              { id: 'all', label: 'All kinds' },
              { id: 'calculator', label: 'Calculators' },
              { id: 'designer', label: 'Designers' },
              { id: 'simulator', label: 'Simulators' },
              { id: 'visualizer', label: 'Visualizers' },
            ] as const
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              className={`tt-chip ${kind === k.id ? 'is-active' : ''}`}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {tools.length === 0 ? (
        <div className="tt-panel">
          <p className="tt-muted">No tools match that filter.</p>
        </div>
      ) : (
        <ul className="tt-tool-grid">
          {tools.map((tool) => (
            <li key={tool.id} className="tt-tool-card">
              <div className="tt-tool-card-meta">
                <span className="tt-badge is-muted">{KIND_LABEL[tool.kind]}</span>
                <span className="tt-muted">
                  {TOOL_CATEGORIES.find((c) => c.id === tool.category)?.label || tool.category}
                </span>
              </div>
              <h3>{tool.name}</h3>
              <p>{tool.summary}</p>
              {tool.formula ? <p className="tt-tool-formula">{tool.formula}</p> : null}
              <Link to={toolHref(tool.id)} className="tt-btn tt-btn-primary">
                Open tool
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="tt-muted" style={{ marginTop: '1rem' }}>
        Full workspace:{' '}
        <Link to="/research-tools" className="tt-link">
          Research tools
        </Link>
      </p>
    </section>
  );
};

export default ToolsLibrary;
