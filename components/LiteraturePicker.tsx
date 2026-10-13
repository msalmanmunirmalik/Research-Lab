/**
 * Focused literature picker for Writing Studio — Ink Folio styled.
 * Used on desk home, overlays, and the immersive Cite sidebar.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, BookOpenIcon } from './icons';
import { getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import ResearchIntelligencePanel from './evidence/ResearchIntelligencePanel';

export type PickerPaper = {
  id?: string;
  title: string;
  abstract?: string | null;
  publicationYear?: number | null;
  doi?: string | null;
  journalName?: string | null;
  authors?: Array<{ name: string }>;
  citationCount?: number | null;
};

type Props = {
  enableClaimCheck?: boolean;
  initialQuery?: string;
  initialClaim?: string;
  /** Initial tab when the picker mounts (desk home defaults to Intelligence). */
  defaultTab?: 'search' | 'intelligence' | 'library' | 'claim';
  /** Button label for adding a paper to the draft/library without inserting a cite. */
  attachLabel?: string;
  /** Button label for attach + insert citation at caret (sidebar / draft). */
  citeLabel?: string;
  /** desk = full-width page; overlay = centered modal; sidebar = Cite panel. */
  layout?: 'overlay' | 'desk' | 'sidebar';
  /** Save to library / draft sources (no caret insert). */
  onAttached?: (paper: PickerPaper) => void;
  /** Save then insert citation at the editor caret. */
  onCite?: (paper: PickerPaper) => void;
  onClose?: () => void;
};

const LiteraturePicker: React.FC<Props> = ({
  enableClaimCheck = true,
  initialQuery = '',
  initialClaim = '',
  defaultTab = 'search',
  attachLabel = 'Use in manuscript',
  citeLabel = 'Cite here',
  layout = 'overlay',
  onAttached,
  onCite,
  onClose,
}) => {
  const apiBase = resolveApiBaseUrl();
  const token = typeof localStorage !== 'undefined' ? getAuthToken() : null;
  const [tab, setTab] = useState<'search' | 'intelligence' | 'library' | 'claim'>(defaultTab);
  const [q, setQ] = useState(initialQuery);
  const [claim, setClaim] = useState(initialClaim);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<PickerPaper[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [evidenceHits, setEvidenceHits] = useState<any[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [claimNote, setClaimNote] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): HeadersInit => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadLibrary = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/research/library?limit=50`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok) setLibrary(data.items || data.library || []);
    } catch {
      /* optional */
    }
  }, [apiBase, authHeaders, token]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (initialQuery.trim()) setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (initialClaim.trim()) {
      setTab('claim');
      setClaim(initialClaim);
    }
  }, [initialClaim]);

  const runSearch = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/research/search?q=${encodeURIComponent(q.trim())}&limit=12`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.papers || data.results || []);
    } catch (e: unknown) {
      setError(formatApiNetworkError(e) || (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveAndAttach = async (paper: PickerPaper, mode: 'attach' | 'cite' = 'attach') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/research/library`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ papers: [paper] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save paper');
      const saved = data.saved?.[0]?.paper || paper;
      setMessage(`Saved: ${(saved.title || paper.title).slice(0, 80)}`);
      void loadLibrary();
      if (mode === 'cite' && onCite) {
        onCite(saved);
      } else if (onAttached) {
        onAttached(saved);
      } else if (onCite) {
        onCite(saved);
      }
    } catch (e: unknown) {
      setError(formatApiNetworkError(e) || (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runClaimFind = async () => {
    if (!claim.trim()) return;
    setLoading(true);
    setError(null);
    setClaimNote(null);
    try {
      const res = await fetch(`${apiBase}/research/evidence/find`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ claim: claim.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Evidence search failed');
      const hits = data.results || data.candidates || [];
      setEvidenceHits(hits);
      setDisclaimer(data.disclaimer || '');
      if (!data.found || !hits.length) {
        setClaimNote(
          data.message ||
            'Sorry — I could not find a suitable reference that accurately supports this statement. Please search manually.'
        );
      }
    } catch (e: unknown) {
      setError(formatApiNetworkError(e) || (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const actionButtons = (paper: PickerPaper) => {
    const hasBoth = Boolean(onAttached && onCite);
    return (
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {hasBoth ? (
          <>
            <button
              type="button"
              className="ws-btn ws-btn-line"
              disabled={loading}
              onClick={() => void saveAndAttach(paper, 'attach')}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {attachLabel}
            </button>
            <button
              type="button"
              className="ws-btn ws-btn-cobalt"
              disabled={loading}
              onClick={() => void saveAndAttach(paper, 'cite')}
            >
              {citeLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ws-btn ws-btn-cobalt"
            disabled={loading}
            onClick={() => void saveAndAttach(paper, onCite && !onAttached ? 'cite' : 'attach')}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {onCite && !onAttached ? citeLabel : attachLabel}
          </button>
        )}
      </div>
    );
  };

  const paperRow = (paper: PickerPaper, key: string) => (
    <li key={key} className="ws-folio-quiet px-3 py-3">
      <p className="text-[13px] font-semibold leading-snug text-[var(--ws-ink)]">{paper.title}</p>
      <p className="mt-1 text-[11px] text-[var(--ws-ink-soft)]">
        {(paper.authors || []).slice(0, 3).map((a) => a.name).filter(Boolean).join(', ') ||
          'No authors listed'}
        {paper.publicationYear ? ` · ${paper.publicationYear}` : ''}
        {paper.journalName ? ` · ${paper.journalName}` : ''}
        {paper.doi ? ` · ${paper.doi}` : ''}
      </p>
      {paper.abstract ? (
        <p className="mt-2 line-clamp-2 text-[12px] text-[var(--ws-ink-soft)]">{paper.abstract}</p>
      ) : null}
      {actionButtons(paper)}
    </li>
  );

  const rootClass =
    layout === 'desk'
      ? 'ws-picker ws-picker-desk space-y-4'
      : layout === 'sidebar'
        ? 'ws-picker ws-picker-sidebar space-y-3'
        : 'ws-picker ws-picker-overlay mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6';

  return (
    <div className={rootClass}>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['search', 'Search'],
            ['intelligence', 'Intelligence'],
            ['library', 'My library'],
            ...(enableClaimCheck ? [['claim', 'Claim → evidence'] as const] : []),
          ] as Array<[string, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as typeof tab)}
            className={`ws-type-chip ${tab === id ? 'is-active' : ''}`}
          >
            {label}
          </button>
        ))}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[12px] font-semibold text-[var(--ws-cobalt)] hover:underline"
          >
            Back to draft
          </button>
        ) : null}
      </div>

      {(error || message) && (
        <p className={`ws-alert ${error ? 'ws-alert-error' : 'ws-alert-ok'}`}>
          {error || message}
        </p>
      )}

      {tab === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--ws-ink-soft)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
                placeholder="Search title, topic, or keywords…"
                className="ws-sources-input pl-9"
              />
            </div>
            <button
              type="button"
              className="ws-btn ws-btn-ink"
              disabled={loading}
              onClick={() => void runSearch()}
            >
              {loading ? '…' : 'Search'}
            </button>
          </div>
          {layout === 'sidebar' && initialQuery.trim() ? (
            <p className="text-[11px] text-[var(--ws-ink-soft)]">
              Seeded from this section — edit the query or search as-is.
            </p>
          ) : null}
          <ul className="ws-picker-list">
            {results.map((p, i) => paperRow(p, p.id || p.doi || `${p.title}-${i}`))}
          </ul>
          {!loading && results.length === 0 ? (
            <div className="ws-empty">
              <p className="text-[13px] text-[var(--ws-ink-soft)]">
                Search scholarly sources, then cite at the cursor or add to the draft.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'intelligence' && (
        <ResearchIntelligencePanel key={q || 'intel'} initialQuery={q} tone="folio" />
      )}

      {tab === 'library' && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]">
            <BookOpenIcon className="h-3.5 w-3.5" />
            Papers already in your library
          </p>
          <ul className="ws-picker-list">
            {library.map((item: any, i: number) => {
              const p = item.paper || item;
              const paperId = p.id || item.paperId;
              return (
                <li key={paperId || `lib-${i}`} className="ws-folio-quiet px-3 py-3">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--ws-ink)]">
                    {p.title}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ws-ink-soft)]">
                    {(p.authors || [])
                      .slice(0, 3)
                      .map((a: any) => (typeof a === 'string' ? a : a.name))
                      .filter(Boolean)
                      .join(', ') || 'No authors listed'}
                    {p.publicationYear ? ` · ${p.publicationYear}` : ''}
                    {p.journalName ? ` · ${p.journalName}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="ws-btn ws-btn-line text-rose-700"
                      disabled={loading}
                      onClick={async () => {
                        if (!paperId) return;
                        if (
                          !window.confirm(
                            `Remove “${String(p.title || 'this reference').slice(0, 80)}” from your library?`
                          )
                        ) {
                          return;
                        }
                        setLoading(true);
                        try {
                          await fetch(
                            `${apiBase}/research/library/${encodeURIComponent(paperId)}`,
                            { method: 'DELETE', headers: authHeaders() }
                          );
                          await fetch(
                            `${apiBase}/writing/citations/${encodeURIComponent(paperId)}?fromLibrary=true`,
                            { method: 'DELETE', headers: authHeaders() }
                          );
                          setLibrary((prev) =>
                            prev.filter((x: any) => (x.paper?.id || x.paperId || x.id) !== paperId)
                          );
                          setMessage('Removed from library');
                        } catch (e: unknown) {
                          setError((e as Error).message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Remove
                    </button>
                    {onAttached && onCite ? (
                      <>
                        <button
                          type="button"
                          className="ws-btn ws-btn-line"
                          disabled={loading}
                          onClick={() => void saveAndAttach(p, 'attach')}
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                          {attachLabel}
                        </button>
                        <button
                          type="button"
                          className="ws-btn ws-btn-cobalt"
                          disabled={loading}
                          onClick={() => void saveAndAttach(p, 'cite')}
                        >
                          {citeLabel}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ws-btn ws-btn-cobalt"
                        disabled={loading}
                        onClick={() =>
                          void saveAndAttach(p, onCite && !onAttached ? 'cite' : 'attach')
                        }
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        {onCite && !onAttached ? citeLabel : attachLabel}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {library.length === 0 ? (
            <div className="ws-empty">
              <p className="text-[13px] text-[var(--ws-ink-soft)]">
                Library is empty — search and save papers first.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'claim' && enableClaimCheck && (
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--ws-ink-soft)]">
            Paste a claim from your manuscript (or select text in the editor and use Citation AI). We
            search your library first, then literature — and only offer references that accurately
            support the claim. If none qualify, we say so.
          </p>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={layout === 'sidebar' ? 3 : 4}
            placeholder="e.g. Treatment X significantly reduced inflammation in murine models…"
            className="ws-sources-input"
          />
          <button
            type="button"
            className="ws-btn ws-btn-cobalt"
            disabled={loading || !claim.trim()}
            onClick={() => void runClaimFind()}
          >
            {loading ? 'Searching library + literature…' : 'Find accurate supporting reference'}
          </button>
          {disclaimer ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {disclaimer}
            </p>
          ) : null}
          {!loading && evidenceHits.length === 0 && claimNote ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              {claimNote}
            </p>
          ) : null}
          <ul className="space-y-2">
            {evidenceHits.map((r: any, i: number) => {
              const p = r.paper || r;
              return (
                <li key={p.id || i} className="ws-folio-quiet px-3 py-3">
                  <p className="ws-kicker">
                    {(r.verdict || r.label || 'Related').toString().replace(/_/g, ' ')}
                    {r.confidence ? ` · ${r.confidence}` : ''}
                    {r.source ? ` · ${r.source}` : ''}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--ws-ink)]">{p.title}</p>
                  {r.note || r.rationale ? (
                    <p className="mt-1 text-[12px] text-[var(--ws-ink-soft)]">
                      {r.note || r.rationale}
                    </p>
                  ) : null}
                  {r.evidencePreview || r.preview || r.excerpt ? (
                    <p className="mt-2 text-[12px] italic text-[var(--ws-ink-soft)]">
                      {r.evidencePreview || r.preview || r.excerpt}
                    </p>
                  ) : null}
                  {actionButtons(p)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LiteraturePicker;
