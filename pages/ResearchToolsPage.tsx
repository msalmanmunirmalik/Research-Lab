import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  KIND_LABEL,
  LAB_TOOLS,
  TOOL_CATEGORIES,
  ToolCategoryId,
  ToolDef,
  ToolKind,
  WORKFLOW_KITS,
  getToolById,
} from '../utils/toolCatalog';
import { ToolResultsPanel } from '../components/tools/ToolVisuals';
import { PageHeader } from '../components/PageHeader';
import { MagnifyingGlassIcon, WrenchScrewdriverIcon } from '../components/icons';
import '../styles/toolsTrainings.css';
import '../styles/researchTools.css';

const KIND_FILTER: { id: ToolKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All kinds' },
  { id: 'calculator', label: 'Calculators' },
  { id: 'designer', label: 'Designers' },
  { id: 'simulator', label: 'Simulators' },
  { id: 'visualizer', label: 'Visualizers' },
];

const CATEGORY_FROM_QUERY: Record<string, ToolCategoryId> = {
  solutions: 'solutions',
  molecular: 'molecular',
  bioinformatics: 'sequence',
  sequence: 'sequence',
  cells: 'cells',
  kinetics: 'kinetics',
  design: 'design',
};

const ResearchToolsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const toolParam = params.get('tool');
  const tabParam = (params.get('tab') || '').toLowerCase();
  const workflowParam = params.get('workflow');

  const initialCategory: ToolCategoryId | 'all' =
    CATEGORY_FROM_QUERY[tabParam] || 'all';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategoryId | 'all'>(initialCategory);
  const [kind, setKind] = useState<ToolKind | 'all'>('all');
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(
    workflowParam && WORKFLOW_KITS.some((w) => w.id === workflowParam) ? workflowParam : null
  );
  const [activeId, setActiveId] = useState(() => {
    if (toolParam && getToolById(toolParam)) return toolParam;
    if (workflowParam) {
      const kit = WORKFLOW_KITS.find((w) => w.id === workflowParam);
      if (kit?.toolIds[0]) return kit.toolIds[0];
    }
    if (tabParam === 'bioinformatics' || tabParam === 'sequence') return 'sequence-browser';
    if (tabParam === 'molecular') return 'primer-designer';
    return 'dilution';
  });
  const [values, setValues] = useState<Record<string, string>>({});

  const active = getToolById(activeId) || LAB_TOOLS[0];
  const workflow = WORKFLOW_KITS.find((w) => w.id === activeWorkflow) || null;

  useEffect(() => {
    const defaults = active.defaults || {};
    setValues({ ...defaults });
  }, [activeId, active.defaults]);

  useEffect(() => {
    const currentTool = params.get('tool');
    const currentWorkflow = params.get('workflow');
    const nextWorkflow = activeWorkflow || '';
    if (currentTool === activeId && (currentWorkflow || '') === nextWorkflow && !params.get('tab')) {
      return;
    }
    const n = new URLSearchParams(params);
    n.set('tool', activeId);
    if (activeWorkflow) n.set('workflow', activeWorkflow);
    else n.delete('workflow');
    n.delete('tab');
    setParams(n, { replace: true });
  }, [activeId, activeWorkflow, params, setParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = workflow
      ? (workflow.toolIds.map((id) => getToolById(id)).filter(Boolean) as ToolDef[])
      : LAB_TOOLS;
    return pool.filter((t) => {
      if (!workflow && category !== 'all' && t.category !== category) return false;
      if (!workflow && kind !== 'all' && t.kind !== kind) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.kind.includes(q) ||
        t.category.includes(q)
      );
    });
  }, [query, category, kind, workflow]);

  const result = useMemo(() => active.compute(values), [active, values]);

  const selectTool = (id: string, keepWorkflow = false) => {
    setActiveId(id);
    if (!keepWorkflow) setActiveWorkflow(null);
    setCategory('all');
    setKind('all');
  };

  const startWorkflow = (id: string) => {
    if (!id) {
      setActiveWorkflow(null);
      return;
    }
    const kit = WORKFLOW_KITS.find((w) => w.id === id);
    if (!kit) return;
    setActiveWorkflow(id);
    setActiveId(kit.toolIds[0]);
    setCategory('all');
    setKind('all');
    setQuery('');
  };

  const loadSample = () => {
    if (!active.sample) return;
    setValues({ ...(active.defaults || {}), ...active.sample });
  };

  const workflowStepIndex = workflow ? workflow.toolIds.indexOf(activeId) : -1;
  const categoryLabel =
    TOOL_CATEGORIES.find((c) => c.id === active.category)?.label || active.category;

  return (
    <div className="tt-page space-y-5">
      <PageHeader
        title="Research tools"
        subtitle="Calculators and designers for solutions, sequences, and cell work. Results update as you type."
        accent="teal"
        icon={<WrenchScrewdriverIcon />}
        actions={
          <div className="rt-search">
            <MagnifyingGlassIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              className="tt-input"
              aria-label="Search tools"
            />
          </div>
        }
      />

      <div className="rt-layout">
        <aside className="rt-aside">
          {workflow ? (
            <div className="tt-panel">
              <div className="rt-kit-top">
                <div className="min-w-0">
                  <p className="tt-kicker">Kit</p>
                  <p className="truncate text-sm font-semibold">{workflow.name}</p>
                </div>
                <button type="button" onClick={() => setActiveWorkflow(null)} className="tt-link">
                  Exit kit
                </button>
              </div>
              <ol className="rt-kit-steps">
                {workflow.toolIds.map((id, i) => {
                  const t = getToolById(id);
                  if (!t) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => selectTool(id, true)}
                        className={`rt-kit-step ${activeId === id ? 'is-active' : ''}`}
                      >
                        <span
                          className={`rt-kit-num ${
                            activeId !== id && i < workflowStepIndex ? 'is-done' : ''
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate">{t.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <div className="tt-panel rt-filters">
              <label>
                <span className="rt-field-label">Kit</span>
                <select
                  value=""
                  onChange={(e) => startWorkflow(e.target.value)}
                  className="tt-input"
                >
                  <option value="">None — browse all tools</option>
                  {WORKFLOW_KITS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="rt-field-label">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ToolCategoryId | 'all')}
                  className="tt-input"
                >
                  {TOOL_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="rt-field-label">Kind</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ToolKind | 'all')}
                  className="tt-input"
                >
                  {KIND_FILTER.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <nav className="rt-tool-list" aria-label="Tools">
            {filtered.length === 0 ? (
              <p className="rt-empty">No matching tools</p>
            ) : null}
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTool(t.id, Boolean(workflow))}
                className={`rt-tool-item ${activeId === t.id ? 'is-active' : ''}`}
              >
                <div className="rt-tool-item-head">
                  <strong>{t.name}</strong>
                  <span>{KIND_LABEL[t.kind]}</span>
                </div>
                <p>{t.summary}</p>
              </button>
            ))}
          </nav>
        </aside>

        <section className="tt-panel">
          <div className="rt-workspace-head">
            <div className="min-w-0">
              <p className="tt-kicker">
                {KIND_LABEL[active.kind]} · {categoryLabel}
              </p>
              <h2>{active.name}</h2>
              <p className="rt-summary">{active.summary}</p>
              {active.formula ? <p className="rt-formula">{active.formula}</p> : null}
            </div>
            {active.sample ? (
              <button type="button" onClick={loadSample} className="tt-btn tt-btn-ghost">
                Load example
              </button>
            ) : null}
          </div>

          <div className="rt-fields">
            {active.fields.map((field) => (
              <label
                key={field.id}
                className={field.kind === 'text' ? 'rt-span-2' : undefined}
              >
                <span className="rt-label">
                  {field.label}
                  {field.unit ? <span className="rt-unit">({field.unit})</span> : null}
                </span>
                {field.kind === 'text' ? (
                  <textarea
                    value={values[field.id] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    rows={5}
                    placeholder={field.placeholder}
                    className="tt-input"
                  />
                ) : field.kind === 'select' ? (
                  <select
                    value={values[field.id] || field.options?.[0]?.value || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    className="tt-input"
                  >
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    step="any"
                    value={values[field.id] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    className="tt-input"
                  />
                )}
                {field.hint ? <span className="rt-hint">{field.hint}</span> : null}
              </label>
            ))}
          </div>

          <div>
            <p className="tt-kicker rt-result-kicker">Result</p>
            <ToolResultsPanel result={result} />
          </div>

          {workflow &&
          workflowStepIndex >= 0 &&
          workflowStepIndex < workflow.toolIds.length - 1 ? (
            <div className="rt-footer-actions">
              <button
                type="button"
                onClick={() => selectTool(workflow.toolIds[workflowStepIndex + 1], true)}
                className="tt-btn tt-btn-primary"
              >
                Next: {getToolById(workflow.toolIds[workflowStepIndex + 1])?.name}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default ResearchToolsPage;
