/**
 * Cite-while-writing editor — citations appear inline in the manuscript
 * (Zotero / Mendeley / Word field style), stored as {{cite:id}} tokens.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Button from './ui/Button';
import {
  SparklesIcon,
  BookOpenIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from './icons';
import { CitationRecord } from '../utils/citationFormat';
import { countWords, CitationStyle, CITATION_STYLES } from '../utils/writingTemplates';
import {
  buildNumberIndexMap,
  citationsToMap,
  citeToken,
  extractCiteIdsOrdered,
  formatCiteClusterDisplay,
  listCiteClusters,
  parseCiteParts,
  renderTextWithCitations,
} from '../utils/citeWhileWriting';
import { insertHeadingMarker } from '../utils/writingStructure';
import {
  DEFAULT_WRITING_EDITOR_PREFS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_SPACING_OPTIONS,
  MEASURE_OPTIONS,
  PAGE_TONE_OPTIONS,
  TEXT_ALIGN_OPTIONS,
  loadWritingEditorPrefs,
  saveWritingEditorPrefs,
  writingEditorPrefsToStyle,
  type WritingEditorPrefs,
  type EditorTextAlign,
} from '../utils/writingEditorPrefs';
import { getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import CitationAiPanel from './CitationAiPanel';

type LitSearchPaper = {
  id?: string;
  title: string;
  authors?: Array<{ name: string }>;
  publicationYear?: number | null;
  journalName?: string | null;
  doi?: string | null;
  abstract?: string | null;
};

export type CiteSectionEditorHandle = {
  /** Insert citation(s) at the last caret position in the writing surface. */
  insertCitations: (ids: string[]) => void;
  focus: () => void;
};

type CiteSectionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  citationStyle: CitationStyle | string;
  citations: CitationRecord[];
  /** Full-manuscript text for numbered styles (appearance order across sections). */
  documentTextForCiteOrder?: string;
  suggestedWords?: number;
  aiLoading?: boolean;
  onAssistSection?: () => void;
  onContinueGrounded?: () => void;
  onOpenRefs?: () => void;
  readOnly?: boolean;
  /** Ink Folio look for Writing Studio */
  variant?: 'default' | 'studio';
  /** Attach + cite a paper suggested by Citation AI (parent resolves id, then insert) */
  onCiteSuggestedPaper?: (paper: {
    id: string;
    title: string;
    authors?: Array<{ name: string }>;
    publicationYear?: number | null;
    journalName?: string | null;
    doi?: string | null;
    abstract?: string | null;
  }) => void | Promise<void>;
  /** Change citation style from the writing surface (APA / Vancouver / …) */
  onCitationStyleChange?: (style: CitationStyle) => void;
  /** Manuscript body alignment (persisted on the draft) */
  textAlign?: EditorTextAlign;
  onTextAlignChange?: (align: EditorTextAlign) => void;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeEditor(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.citeIds) {
      const parts = parseCiteParts(el.dataset.citeIds);
      out += citeToken(parts.length ? parts : el.dataset.citeIds.split(';').filter(Boolean));
      return;
    }
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (el.tagName === 'DIV' || el.tagName === 'P') {
      if (out.length && !out.endsWith('\n')) out += '\n';
    }
    Array.from(el.childNodes).forEach(walk);
  };
  Array.from(root.childNodes).forEach(walk);
  return out.replace(/\u00a0/g, ' ');
}

/**
 * Map a live DOM caret to an offset in the serialized {{cite:…}} token string.
 * Survives picker/modals and DOM rebuilds — live Ranges do not.
 */
function getTokenOffsetFromCaret(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  try {
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const probe = document.createElement('div');
    probe.appendChild(pre.cloneContents());
    return serializeEditor(probe).length;
  } catch {
    return null;
  }
}

/** Place caret at a token-string offset after DOM rebuild. */
function setCaretAtTokenOffset(root: HTMLElement, target: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = Math.max(0, target);
  let placed = false;

  const placeInParent = (el: HTMLElement, after: boolean) => {
    const parent = el.parentNode;
    if (!parent) return;
    const idx = Array.from(parent.childNodes).indexOf(el);
    const r = document.createRange();
    r.setStart(parent, after ? idx + 1 : idx);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    placed = true;
  };

  const place = (node: Node, offset: number) => {
    const r = document.createRange();
    r.setStart(node, Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent || '').length : 0));
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    placed = true;
  };

  const walk = (node: Node): boolean => {
    if (placed) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (remaining <= len) {
        place(node, remaining);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.dataset.citeIds) {
      const parts = parseCiteParts(el.dataset.citeIds);
      const token = citeToken(parts.length ? parts : [el.dataset.citeIds]);
      if (remaining <= token.length) {
        placeInParent(el, true);
        return true;
      }
      remaining -= token.length;
      return false;
    }
    if (el.tagName === 'BR') {
      if (remaining <= 1) {
        placeInParent(el, true);
        return true;
      }
      remaining -= 1;
      return false;
    }
    if ((el.tagName === 'DIV' || el.tagName === 'P') && el !== root) {
      // serializeEditor may inject a newline before block contents when prior text exists.
      // Children carry the actual content; skip structural accounting here.
    }
    for (const child of Array.from(el.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) break;
  }
  if (!placed) {
    const r = document.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function insertTokenIntoValue(
  value: string,
  offset: number,
  token: string
): { text: string; cursor: number } {
  const clamped = Math.max(0, Math.min(offset, value.length));
  const before = value.slice(0, clamped);
  const after = value.slice(clamped);
  const needsSpaceBefore = before.length > 0 && !/[\s([{]$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^[\s,.;:)\]}]/.test(after);
  const chunk =
    (needsSpaceBefore ? ' ' : '') + token + (needsSpaceAfter ? ' ' : '');
  return { text: before + chunk + after, cursor: before.length + chunk.length };
}

function buildEditorHtml(
  text: string,
  byId: Record<string, CitationRecord>,
  style: string,
  numberIndexById: Record<string, number>
): string {
  if (!text) return '';
  const re = /\{\{cite:([^}]+)\}\}/g;
  let html = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    html += escapeHtml(text.slice(last, m.index)).replace(/\n/g, '<br>');
    const parts = parseCiteParts(m[1]);
    const ids = parts.map((p) => p.id);
    const label = formatCiteClusterDisplay(parts, byId, style, numberIndexById);
    const title = ids.map((id) => byId[id]?.title || id).join(' · ');
    const encoded = parts
      .map((p) => (p.locator ? `${p.id}|${p.locator}` : p.id))
      .join(';');
    const missing = ids.some((id) => !byId[id]);
    html += `<span contenteditable="false" data-cite-ids="${escapeHtml(
      encoded
    )}" class="cite-field${missing ? ' is-missing' : ''}" title="${escapeHtml(
      title
    )}">${escapeHtml(label)}</span>`;
    last = m.index + m[0].length;
  }
  html += escapeHtml(text.slice(last)).replace(/\n/g, '<br>');
  return html;
}

const CiteSectionEditor = forwardRef<CiteSectionEditorHandle, CiteSectionEditorProps>(
  function CiteSectionEditor(
    {
      value,
      onChange,
      placeholder,
      citationStyle,
      citations,
      documentTextForCiteOrder,
      suggestedWords,
      aiLoading,
      onAssistSection,
      onContinueGrounded,
      onOpenRefs,
      readOnly,
      variant = 'default',
      onCiteSuggestedPaper,
      onCitationStyleChange,
      textAlign: textAlignProp,
      onTextAlignChange,
    },
    ref
  ) {
    const isStudio = variant === 'studio';
    const editorRef = useRef<HTMLDivElement>(null);
    const savedOffsetRef = useRef<number | null>(null);
    const composingRef = useRef(false);
    const lastEmittedRef = useRef(value);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [locator, setLocator] = useState('');
    const [litQuery, setLitQuery] = useState('');
    const [litResults, setLitResults] = useState<LitSearchPaper[]>([]);
    const [litLoading, setLitLoading] = useState(false);
    const [litError, setLitError] = useState<string | null>(null);
    const [litCitingId, setLitCitingId] = useState<string | null>(null);
    const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [prefs, setPrefs] = useState<WritingEditorPrefs>(DEFAULT_WRITING_EDITOR_PREFS);
    const [cursorHint, setCursorHint] = useState(
      variant === 'studio'
        ? 'Place the caret where the citation should appear, then Cite — or select a sentence for Citation AI'
        : 'Click in the text where the citation should appear, then Insert citation'
    );
    const [selectedClaim, setSelectedClaim] = useState('');
    const [selectionCiteIds, setSelectionCiteIds] = useState<string[]>([]);
    const [citationAiOpen, setCitationAiOpen] = useState(false);
    const [aiMenuOpen, setAiMenuOpen] = useState(false);
    const aiMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!aiMenuOpen) return;
      const onDoc = (e: MouseEvent) => {
        if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
          setAiMenuOpen(false);
        }
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setAiMenuOpen(false);
      };
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDoc);
        document.removeEventListener('keydown', onKey);
      };
    }, [aiMenuOpen]);

    const hasAiAssist = Boolean(onAssistSection || onContinueGrounded);
    const sectionHasText = Boolean(value.trim());

    const runAi = (kind: 'draft' | 'continue') => {
      setAiMenuOpen(false);
      if (kind === 'continue') onContinueGrounded?.();
      else onAssistSection?.();
    };

    const aiWriteMenu = hasAiAssist ? (
      <div className="relative" ref={aiMenuRef}>
        <button
          type="button"
          className={
            isStudio
              ? `ws-desk-tool is-ai ${aiMenuOpen ? 'is-active' : ''}`
              : 'inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[12px] font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50'
          }
          disabled={aiLoading}
          aria-expanded={aiMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setHeadingMenuOpen(false);
            setPrefsOpen(false);
            setAiMenuOpen((v) => !v);
          }}
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          {aiLoading ? 'Writing…' : 'Write with AI'}
          {!aiLoading ? <ChevronDownIcon className="h-3 w-3 opacity-70" /> : null}
        </button>
        {aiMenuOpen && !aiLoading ? (
          <div
            role="menu"
            className={
              isStudio
                ? 'absolute right-0 z-30 mt-1 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-xl border border-[var(--ws-rule)] bg-[var(--ws-folio-bright)] p-1 shadow-lg'
                : 'absolute right-0 z-30 mt-1 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg'
            }
          >
            {onAssistSection ? (
              <button
                type="button"
                role="menuitem"
                className={
                  isStudio
                    ? 'block w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--ws-folio)]'
                    : 'block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50'
                }
                onClick={() => runAi('draft')}
              >
                <span className={`block text-[13px] font-semibold ${isStudio ? 'text-[var(--ws-ink)]' : 'text-slate-900'}`}>
                  {sectionHasText ? 'Rewrite this section' : 'Draft this section'}
                </span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${isStudio ? 'text-[var(--ws-ink-soft)]' : 'text-slate-500'}`}>
                  {sectionHasText
                    ? 'Replace the current text using your title and manuscript context.'
                    : 'Generate a first draft from your title and manuscript context.'}
                </span>
              </button>
            ) : null}
            {onContinueGrounded ? (
              <button
                type="button"
                role="menuitem"
                className={
                  isStudio
                    ? 'block w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--ws-folio)]'
                    : 'block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50'
                }
                onClick={() => runAi('continue')}
              >
                <span className={`block text-[13px] font-semibold ${isStudio ? 'text-[var(--ws-ink)]' : 'text-slate-900'}`}>
                  Continue from sources
                </span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${isStudio ? 'text-[var(--ws-ink-soft)]' : 'text-slate-500'}`}>
                  Add paragraphs grounded only in attached references (does not replace existing text).
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

    useEffect(() => {
      if (!isStudio) return;
      const loaded = loadWritingEditorPrefs();
      setPrefs({
        ...loaded,
        textAlign: textAlignProp || loaded.textAlign || 'left',
      });
    }, [isStudio, textAlignProp]);

    const updatePrefs = useCallback(
      (patch: Partial<WritingEditorPrefs>) => {
        setPrefs((prev) => {
          const next = { ...prev, ...patch };
          saveWritingEditorPrefs(next);
          return next;
        });
        if (patch.textAlign && onTextAlignChange) {
          onTextAlignChange(patch.textAlign);
        }
      },
      [onTextAlignChange]
    );

    const words = countWords(value);
    const byId = useMemo(() => citationsToMap(citations), [citations]);

    const orderedIds = useMemo(
      () =>
        extractCiteIdsOrdered(
          `${documentTextForCiteOrder || ''}\n${value}`.trim() || value
        ),
      [documentTextForCiteOrder, value]
    );
    const numberIndexById = useMemo(
      () => buildNumberIndexMap(orderedIds),
      [orderedIds]
    );

    const clusters = useMemo(() => listCiteClusters(value), [value]);

    const filtered = useMemo(() => {
      const q = filter.trim().toLowerCase();
      if (!q) return citations;
      return citations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.authors || []).join(' ').toLowerCase().includes(q) ||
          (c.doi || '').toLowerCase().includes(q) ||
          (c.journal || '').toLowerCase().includes(q)
      );
    }, [citations, filter]);

    const stableId = (c: CitationRecord) => c.paperId || c.id || '';

    const captureSelection = useCallback(() => {
      const sel = window.getSelection();
      const root = editorRef.current;
      if (!sel || !sel.rangeCount || !root) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;

      const offset = getTokenOffsetFromCaret(root);
      if (offset != null) savedOffsetRef.current = offset;

      const text = (sel.toString() || '').replace(/\s+/g, ' ').trim();
      setSelectedClaim(text.length >= 12 ? text : '');

      // Collect cite field ids inside the selection (for verify mode)
      const ids: string[] = [];
      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node: Node | null = walker.nextNode();
        while (node) {
          const el = node as HTMLElement;
          if (el.dataset?.citeIds && range.intersectsNode(el)) {
            ids.push(...parseCiteParts(el.dataset.citeIds).map((p) => p.id));
          }
          node = walker.nextNode();
        }
      } catch {
        /* ignore */
      }
      setSelectionCiteIds([...new Set(ids)]);

      if (text.length >= 12) {
        setCursorHint('Selection ready — Find citation or Verify with Citation AI');
      } else {
        setCursorHint('Cursor set — Cite, or select a sentence for Citation AI');
      }
    }, []);

    const emitFromDom = useCallback(() => {
      const root = editorRef.current;
      if (!root || readOnly) return;
      const next = serializeEditor(root);
      if (next === lastEmittedRef.current) return;
      lastEmittedRef.current = next;
      onChange(next);
    }, [onChange, readOnly]);

    const restoreDom = useCallback(
      (text: string, caretOffset?: number | null) => {
        const root = editorRef.current;
        if (!root) return;
        root.innerHTML =
          buildEditorHtml(text, byId, citationStyle, numberIndexById) || '';
        lastEmittedRef.current = text;
        const at =
          caretOffset != null
            ? caretOffset
            : savedOffsetRef.current != null
              ? savedOffsetRef.current
              : null;
        if (at != null && document.activeElement === root) {
          setCaretAtTokenOffset(root, at);
        }
      },
      [byId, citationStyle, numberIndexById]
    );

    // Rebuild when value / style / library resolution changes from outside
    useEffect(() => {
      const root = editorRef.current;
      if (!root) return;
      const keepOffset =
        savedOffsetRef.current != null
          ? savedOffsetRef.current
          : getTokenOffsetFromCaret(root);

      if (value === lastEmittedRef.current) {
        const after =
          buildEditorHtml(value, byId, citationStyle, numberIndexById) || '';
        if (root.innerHTML !== after) {
          restoreDom(value, keepOffset);
          if (keepOffset != null) savedOffsetRef.current = keepOffset;
        }
        return;
      }
      restoreDom(value, keepOffset);
      if (keepOffset != null) savedOffsetRef.current = keepOffset;
    }, [value, byId, citationStyle, numberIndexById, restoreDom]);

    const insertTokenAtSelection = useCallback(
      (ids: string[], pageLocator?: string) => {
        if (!ids.length || readOnly) return;
        const root = editorRef.current;
        if (!root) return;

        const live = getTokenOffsetFromCaret(root);
        const offset =
          live != null
            ? live
            : savedOffsetRef.current != null
              ? savedOffsetRef.current
              : value.length;

        const loc = (pageLocator || '').trim();
        const token =
          ids.length === 1 && loc
            ? citeToken([{ id: ids[0], locator: loc }])
            : citeToken(ids);
        if (!token) return;
        const { text: next, cursor } = insertTokenIntoValue(value, offset, token);
        savedOffsetRef.current = cursor;
        lastEmittedRef.current = next;
        onChange(next);
        restoreDom(next, cursor);
        root.focus();
        setCaretAtTokenOffset(root, cursor);
        setCursorHint(
          loc
            ? `Cited with locator (${loc}) — style updates live from the toolbar`
            : 'Citation inserted at your cursor — change style anytime from the toolbar'
        );
      },
      [onChange, readOnly, restoreDom, value]
    );

    const insertHeading = useCallback(
      (level: 2 | 3) => {
        if (readOnly) return;
        const root = editorRef.current;
        const live = root ? getTokenOffsetFromCaret(root) : null;
        const offset =
          live != null
            ? live
            : savedOffsetRef.current != null
              ? savedOffsetRef.current
              : value.length;
        const { text: next, cursor } = insertHeadingMarker(value, offset, level);
        savedOffsetRef.current = cursor;
        lastEmittedRef.current = next;
        onChange(next);
        restoreDom(next, cursor);
        root?.focus();
        if (root) setCaretAtTokenOffset(root, cursor);
        setCursorHint(
          level === 2
            ? 'Subheading inserted (##) — shows as H3 in preview/export'
            : 'Sub-subheading inserted (###) — shows as H4 in preview/export'
        );
      },
      [onChange, readOnly, restoreDom, value]
    );

    useImperativeHandle(
      ref,
      () => ({
        insertCitations: (ids: string[]) => insertTokenAtSelection(ids),
        focus: () => editorRef.current?.focus(),
      }),
      [insertTokenAtSelection]
    );

    const toggleSelect = (c: CitationRecord) => {
      const id = stableId(c);
      if (!id) return;
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const resetPickerState = () => {
      setFilter('');
      setSelectedIds([]);
      setLocator('');
      setLitQuery('');
      setLitResults([]);
      setLitError(null);
      setLitLoading(false);
      setLitCitingId(null);
    };

    const openPicker = () => {
      captureSelection();
      setPickerOpen(true);
      setCursorHint('Search literature or select draft papers, then Insert citation');
    };

    const runLitSearch = async () => {
      const q = litQuery.trim();
      if (!q) return;
      setLitLoading(true);
      setLitError(null);
      try {
        const apiBase = resolveApiBaseUrl();
        const token = typeof localStorage !== 'undefined' ? getAuthToken() : null;
        const res = await fetch(
          `${apiBase}/research/search?q=${encodeURIComponent(q)}&limit=12`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');
        setLitResults(data.papers || data.results || []);
      } catch (e: unknown) {
        setLitError(formatApiNetworkError(e) || (e as Error).message);
        setLitResults([]);
      } finally {
        setLitLoading(false);
      }
    };

    const citeLitPaper = async (paper: LitSearchPaper) => {
      if (!onCiteSuggestedPaper || !paper.title) return;
      const key = paper.id || paper.doi || paper.title;
      setLitCitingId(key);
      setLitError(null);
      try {
        await onCiteSuggestedPaper({
          id: paper.id || paper.doi || `tmp-${Date.now()}`,
          title: paper.title,
          authors: paper.authors,
          publicationYear: paper.publicationYear,
          journalName: paper.journalName,
          doi: paper.doi,
          abstract: paper.abstract,
        });
        setPickerOpen(false);
        resetPickerState();
      } catch (e: unknown) {
        setLitError(formatApiNetworkError(e) || (e as Error).message || 'Could not cite paper');
      } finally {
        setLitCitingId(null);
      }
    };

    const insertSelected = () => {
      if (!selectedIds.length) return;
      insertTokenAtSelection(
        selectedIds,
        selectedIds.length === 1 ? locator : undefined
      );
      setPickerOpen(false);
      resetPickerState();
    };

    const insertOne = (c: CitationRecord) => {
      const id = stableId(c);
      if (!id) return;
      insertTokenAtSelection([id], locator);
      setPickerOpen(false);
      resetPickerState();
    };

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (readOnly) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          openPicker();
        }
        if (e.key === 'Escape') {
          setPickerOpen(false);
          resetPickerState();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- openPicker closes over latest capture
    }, [readOnly]);

    const renderedPreview = useMemo(
      () => renderTextWithCitations(value, byId, citationStyle, orderedIds).rendered,
      [value, byId, citationStyle, orderedIds]
    );

    const picker = pickerOpen ? (
      <div
        className={
          isStudio
            ? 'ws-overlay-scrim fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center'
            : 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center'
        }
      >
        <div
          className={
            isStudio
              ? 'ws-overlay-panel flex max-h-[85vh] w-full max-w-lg flex-col'
              : 'flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl'
          }
          role="dialog"
          aria-label="Insert citation"
        >
          <div
            className={
              isStudio
                ? 'ws-overlay-header flex items-start justify-between gap-3 px-5 py-4'
                : 'flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3'
            }
          >
            <div>
              <p className={isStudio ? 'ws-kicker' : 'sr-only'}>Cite</p>
              <h3
                className={
                  isStudio
                    ? 'ws-display mt-1 text-xl font-semibold text-[var(--ws-ink)]'
                    : 'text-[15px] font-semibold text-slate-900'
                }
              >
                Insert citation
              </h3>
              <p
                className={
                  isStudio
                    ? 'mt-1 text-[12px] text-[var(--ws-ink-soft)]'
                    : 'text-[12px] text-slate-500'
                }
              >
                Lands at your cursor · style <strong>{citationStyle}</strong>
              </p>
            </div>
            <button
              type="button"
              className={
                isStudio
                  ? 'ws-btn ws-btn-ghost p-1.5!'
                  : 'rounded-lg p-1 text-slate-400 hover:bg-slate-50'
              }
              onClick={() => {
                setPickerOpen(false);
                resetPickerState();
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div
            className={
              isStudio
                ? 'border-b border-[var(--ws-rule)] px-5 py-3'
                : 'border-b border-slate-100 px-4 py-3'
            }
          >
            <p
              className={
                isStudio
                  ? 'mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ws-ink-soft)]'
                  : 'mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              }
            >
              Find sources
            </p>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon
                  className={
                    isStudio
                      ? 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ws-ink-soft)]'
                      : 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400'
                  }
                />
                <input
                  value={litQuery}
                  onChange={(e) => setLitQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runLitSearch();
                    }
                  }}
                  placeholder="Search literature by topic, title, author, DOI…"
                  className={
                    isStudio
                      ? 'ws-sources-input !pl-9'
                      : 'w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-[14px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'
                  }
                  autoFocus
                />
              </div>
              {isStudio ? (
                <button
                  type="button"
                  className="ws-btn ws-btn-cobalt shrink-0"
                  disabled={litLoading || !litQuery.trim()}
                  onClick={() => void runLitSearch()}
                >
                  {litLoading ? 'Searching…' : 'Search'}
                </button>
              ) : (
                <Button
                  variant="primary"
                  disabled={litLoading || !litQuery.trim()}
                  onClick={() => void runLitSearch()}
                >
                  {litLoading ? 'Searching…' : 'Search'}
                </Button>
              )}
            </div>
            {litError ? (
              <p
                className={
                  isStudio
                    ? 'mt-2 text-[12px] text-red-700'
                    : 'mt-2 text-[12px] text-red-600'
                }
              >
                {litError}
              </p>
            ) : null}

            <p
              className={
                isStudio
                  ? 'mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--ws-ink-soft)]'
                  : 'mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              }
            >
              In this draft
            </p>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter draft papers by title, author, DOI, journal…"
              className={
                isStudio
                  ? 'ws-sources-input'
                  : 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'
              }
            />
            <input
              value={locator}
              onChange={(e) => setLocator(e.target.value)}
              placeholder="Page / locator (optional) — e.g. 12 or p. 12–14"
              className={
                isStudio
                  ? 'ws-sources-input mt-2'
                  : 'mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'
              }
            />
            {selectedIds.length > 0 ? (
              <p
                className={
                  isStudio
                    ? 'mt-2 text-[12px] font-medium text-[var(--ws-cobalt)]'
                    : 'mt-2 text-[12px] text-teal-800'
                }
              >
                {selectedIds.length} selected — insert as one group
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {(litLoading || litResults.length > 0 || (litQuery.trim() && !litLoading && !litError)) ? (
              <div className="mb-2">
                <p
                  className={
                    isStudio
                      ? 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ws-ink-soft)]'
                      : 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                  }
                >
                  Literature results
                </p>
                {litLoading ? (
                  <p
                    className={
                      isStudio
                        ? 'px-4 py-4 text-center text-[13px] text-[var(--ws-ink-soft)]'
                        : 'px-4 py-4 text-center text-[13px] text-slate-400'
                    }
                  >
                    Searching literature…
                  </p>
                ) : litResults.length === 0 ? (
                  <p
                    className={
                      isStudio
                        ? 'px-4 py-4 text-center text-[13px] text-[var(--ws-ink-soft)]'
                        : 'px-4 py-4 text-center text-[13px] text-slate-400'
                    }
                  >
                    No literature matches. Try another query.
                  </p>
                ) : (
                  <ul>
                    {litResults.map((paper) => {
                      const key = paper.id || paper.doi || paper.title;
                      const citing = litCitingId === key;
                      const authors = (paper.authors || [])
                        .map((a) => a.name)
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(', ');
                      return (
                        <li key={key}>
                          <div
                            className={
                              isStudio
                                ? 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5'
                                : 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5'
                            }
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={
                                  isStudio
                                    ? 'line-clamp-2 text-[13px] font-medium text-[var(--ws-ink)]'
                                    : 'line-clamp-2 text-[13px] font-medium text-slate-900'
                                }
                              >
                                {paper.title}
                              </span>
                              <span
                                className={
                                  isStudio
                                    ? 'mt-0.5 block text-[12px] text-[var(--ws-ink-soft)]'
                                    : 'mt-0.5 block text-[12px] text-slate-500'
                                }
                              >
                                {authors || 'No authors listed'}
                                {paper.publicationYear ? ` (${paper.publicationYear})` : ''}
                                {paper.journalName ? ` · ${paper.journalName}` : ''}
                              </span>
                            </span>
                            {onCiteSuggestedPaper ? (
                              isStudio ? (
                                <button
                                  type="button"
                                  className="ws-btn ws-btn-cobalt shrink-0 !px-2.5 !py-1.5 text-[12px]"
                                  disabled={citing || litLoading}
                                  onClick={() => void citeLitPaper(paper)}
                                >
                                  {citing ? 'Citing…' : 'Cite'}
                                </button>
                              ) : (
                                <Button
                                  variant="primary"
                                  disabled={citing || litLoading}
                                  onClick={() => void citeLitPaper(paper)}
                                >
                                  {citing ? 'Citing…' : 'Cite'}
                                </Button>
                              )
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            <p
              className={
                isStudio
                  ? 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ws-ink-soft)]'
                  : 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              }
            >
              Draft papers
            </p>
            <ul>
              {filtered.map((c) => {
                const id = stableId(c);
                const on = id && selectedIds.includes(id);
                const previewLabel = id
                  ? formatCiteClusterDisplay([id], byId, citationStyle, {
                      ...numberIndexById,
                      [id]: numberIndexById[id] ?? orderedIds.length,
                    })
                  : '';
                return (
                  <li key={id || c.title}>
                    <button
                      type="button"
                      className={
                        isStudio
                          ? `flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[rgba(29,78,216,0.06)] ${
                              on ? 'bg-[rgba(29,78,216,0.08)] ring-1 ring-[var(--ws-cobalt)]/30' : ''
                            }`
                          : `flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-teal-50 ${
                              on ? 'bg-teal-50 ring-1 ring-teal-200' : ''
                            }`
                      }
                      onClick={() => toggleSelect(c)}
                      onDoubleClick={() => insertOne(c)}
                    >
                      <span
                        className={
                          isStudio
                            ? `mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                                on
                                  ? 'border-[var(--ws-cobalt)] bg-[var(--ws-cobalt)] text-white'
                                  : 'border-[var(--ws-rule-strong)] text-transparent'
                              }`
                            : `mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                                on
                                  ? 'border-teal-600 bg-teal-600 text-white'
                                  : 'border-slate-300 text-transparent'
                              }`
                        }
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={
                            isStudio
                              ? 'line-clamp-2 text-[13px] font-medium text-[var(--ws-ink)]'
                              : 'line-clamp-2 text-[13px] font-medium text-slate-900'
                          }
                        >
                          {c.title}
                        </span>
                        <span
                          className={
                            isStudio
                              ? 'mt-0.5 block text-[12px] text-[var(--ws-ink-soft)]'
                              : 'mt-0.5 block text-[12px] text-slate-500'
                          }
                        >
                          {(c.authors || []).filter(Boolean).slice(0, 3).join(', ') ||
                            'No authors listed'}
                          {c.year ? ` (${c.year})` : ''}
                          {c.journal ? ` · ${c.journal}` : ''}
                        </span>
                        <span
                          className={
                            isStudio
                              ? 'mt-1 inline-block rounded bg-[rgba(11,28,44,0.06)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ws-ink-soft)]'
                              : 'mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600'
                          }
                        >
                          will show as {previewLabel}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li
                  className={
                    isStudio
                      ? 'px-4 py-8 text-center text-[13px] text-[var(--ws-ink-soft)]'
                      : 'px-4 py-8 text-center text-[13px] text-slate-400'
                  }
                >
                  {citations.length === 0
                    ? 'No papers in this draft yet — search Find sources above, or add DOIs in Sources.'
                    : 'No draft matches. Try another filter.'}
                </li>
              ) : null}
            </ul>
          </div>

          <div
            className={
              isStudio
                ? 'flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ws-rule)] px-5 py-3'
                : 'flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3'
            }
          >
            <button
              type="button"
              className={
                isStudio
                  ? 'text-[12px] font-medium text-[var(--ws-cobalt)] hover:underline'
                  : 'text-[12px] text-slate-500 hover:underline'
              }
              onClick={() => {
                setPickerOpen(false);
                resetPickerState();
                onOpenRefs?.();
              }}
            >
              Add papers to library…
            </button>
            <div className="flex gap-2">
              {isStudio ? (
                <>
                  <button
                    type="button"
                    className="ws-btn ws-btn-ghost"
                    onClick={() => {
                      setPickerOpen(false);
                      resetPickerState();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ws-btn ws-btn-cobalt"
                    disabled={!selectedIds.length}
                    onClick={insertSelected}
                  >
                    Insert
                    {selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
                  </button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPickerOpen(false);
                      resetPickerState();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!selectedIds.length}
                    onClick={insertSelected}
                  >
                    Insert citation
                    {selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null;

    const editorHandlers = {
      onMouseUp: captureSelection,
      onKeyUp: captureSelection,
      onBlur: () => {
        captureSelection();
        emitFromDom();
      },
      onInput: () => {
        if (composingRef.current) return;
        emitFromDom();
      },
      onCompositionStart: () => {
        composingRef.current = true;
      },
      onCompositionEnd: () => {
        composingRef.current = false;
        emitFromDom();
      },
      onPaste: (e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== 'Backspace' && e.key !== 'Delete') return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (e.key === 'Backspace' && range.startOffset === 0) {
          const prev =
            node.nodeType === Node.TEXT_NODE
              ? node.previousSibling
              : (node as HTMLElement).previousSibling;
          if (prev && (prev as HTMLElement).dataset?.citeIds) {
            e.preventDefault();
            prev.parentNode?.removeChild(prev);
            emitFromDom();
          }
        }
        if (
          e.key === 'Delete' &&
          node.nodeType === Node.TEXT_NODE &&
          range.startOffset === (node.textContent || '').length
        ) {
          const next = node.nextSibling;
          if (next && (next as HTMLElement).dataset?.citeIds) {
            e.preventDefault();
            next.parentNode?.removeChild(next);
            emitFromDom();
          }
        }
      },
    };

    if (isStudio) {
      const aimPct =
        suggestedWords && suggestedWords > 0
          ? Math.min(100, Math.round((words / suggestedWords) * 100))
          : null;

      const prefsPanel = prefsOpen ? (
        <div className="ws-format-panel" role="dialog" aria-label="Writing format">
          <div className="ws-format-panel-head">
            <p className="ws-kicker">Writing format</p>
            <button
              type="button"
              className="ws-desk-tool"
              onClick={() => setPrefsOpen(false)}
              aria-label="Close format options"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          {onCitationStyleChange ? (
            <div className="ws-format-row">
              <span className="ws-format-label">Citation style</span>
              <select
                value={String(citationStyle)}
                onChange={(e) =>
                  onCitationStyleChange(e.target.value as CitationStyle)
                }
                className="ws-sources-input max-w-[12rem] py-1.5 text-[13px]"
                aria-label="Citation style"
              >
                {CITATION_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="ws-format-row">
            <span className="ws-format-label">Font size</span>
            <div className="ws-format-seg">
              {FONT_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`ws-format-chip ${prefs.fontSize === opt.id ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ fontSize: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row">
            <span className="ws-format-label">Line spacing</span>
            <div className="ws-format-seg ws-format-seg-wrap">
              {LINE_SPACING_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`ws-format-chip ${prefs.lineSpacing === opt.id ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ lineSpacing: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row">
            <span className="ws-format-label">Typeface</span>
            <div className="ws-format-seg ws-format-seg-wrap">
              {FONT_FAMILY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  className={`ws-format-chip ${prefs.fontFamily === opt.id ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ fontFamily: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row">
            <span className="ws-format-label">Alignment</span>
            <div className="ws-format-seg">
              {TEXT_ALIGN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  aria-label={opt.hint}
                  className={`ws-format-chip ws-format-align ws-format-align-${opt.id} ${
                    prefs.textAlign === opt.id ? 'is-on' : ''
                  }`}
                  onClick={() => updatePrefs({ textAlign: opt.id })}
                >
                  <span className="ws-format-align-ico" aria-hidden />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row">
            <span className="ws-format-label">Column width</span>
            <div className="ws-format-seg">
              {MEASURE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`ws-format-chip ${prefs.measure === opt.id ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ measure: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row">
            <span className="ws-format-label">Page tone</span>
            <div className="ws-format-seg">
              {PAGE_TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`ws-format-chip ${prefs.pageTone === opt.id ? 'is-on' : ''}`}
                  onClick={() => updatePrefs({ pageTone: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-format-row ws-format-row-toggle">
            <div>
              <p className="ws-format-label">Focus mode</p>
              <p className="ws-format-hint">Quieter chrome while you write</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.focusMode}
              className={`ws-format-switch ${prefs.focusMode ? 'is-on' : ''}`}
              onClick={() => updatePrefs({ focusMode: !prefs.focusMode })}
            >
              <span />
            </button>
          </div>

          <button
            type="button"
            className="ws-format-reset"
            onClick={() => {
              setPrefs(DEFAULT_WRITING_EDITOR_PREFS);
              saveWritingEditorPrefs(DEFAULT_WRITING_EDITOR_PREFS);
              onTextAlignChange?.(DEFAULT_WRITING_EDITOR_PREFS.textAlign);
            }}
          >
            Reset to defaults
          </button>
        </div>
      ) : null;

      return (
        <div
          className={`ws-desk ${focused ? 'is-focused' : ''} ${
            prefs.focusMode ? 'is-focus-mode' : ''
          } ws-tone-${prefs.pageTone}`}
          style={writingEditorPrefsToStyle(prefs)}
        >
          {!readOnly ? (
            <div className="ws-desk-toolbar">
              <div className="ws-desk-toolbar-group">
                <button type="button" onClick={openPicker} className="ws-desk-tool is-primary">
                  <BookOpenIcon className="h-3.5 w-3.5" />
                  Cite
                  <span className="ws-desk-kbd">⌘⇧C</span>
                </button>
                {selectedClaim ? (
                  <button
                    type="button"
                    className="ws-desk-tool is-ai"
                    onClick={() => setCitationAiOpen(true)}
                    title="Find or verify a reference for the selected sentence"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Find citation
                  </button>
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    className={`ws-desk-tool ${headingMenuOpen ? 'is-active' : ''}`}
                    title="Insert a heading in this section"
                    onClick={() => setHeadingMenuOpen((v) => !v)}
                  >
                    Heading
                  </button>
                  {headingMenuOpen ? (
                    <div className="absolute left-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-[var(--ws-rule)] bg-[var(--ws-folio-bright)] p-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-[12px] font-semibold hover:bg-[var(--ws-folio)]"
                        onClick={() => {
                          insertHeading(2);
                          setHeadingMenuOpen(false);
                        }}
                      >
                        Subsection (H2)
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-[12px] font-semibold hover:bg-[var(--ws-folio)]"
                        onClick={() => {
                          insertHeading(3);
                          setHeadingMenuOpen(false);
                        }}
                      >
                        Subheading (H3)
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`ws-desk-tool ${prefsOpen ? 'is-active' : ''}`}
                  onClick={() => {
                    setHeadingMenuOpen(false);
                    setPrefsOpen((v) => !v);
                  }}
                  aria-expanded={prefsOpen}
                  aria-label="Writing format options"
                >
                  <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
                  Format
                </button>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 ws-desk-ai">
                {aiWriteMenu}
              </div>
            </div>
          ) : (
            <div className="ws-desk-toolbar">
              <div className="ws-desk-toolbar-group">
                <button
                  type="button"
                  className={`ws-desk-tool ${prefsOpen ? 'is-active' : ''}`}
                  onClick={() => setPrefsOpen((v) => !v)}
                  aria-expanded={prefsOpen}
                  aria-label="Writing format options"
                >
                  <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
                  Format
                </button>
              </div>
            </div>
          )}

          {prefsPanel}
          {picker}
          {citationAiOpen && selectedClaim ? (
            <CitationAiPanel
              claim={selectedClaim}
              citedPaperIds={citations
                .map((c) => c.paperId || c.id)
                .filter(Boolean) as string[]}
              selectionPaperIds={selectionCiteIds}
              onClose={() => setCitationAiOpen(false)}
              onUsePaper={async (paper) => {
                setCitationAiOpen(false);
                setSelectedClaim('');
                if (onCiteSuggestedPaper) {
                  await onCiteSuggestedPaper(paper);
                } else if (paper.id) {
                  insertTokenAtSelection([paper.id]);
                }
              }}
            />
          ) : null}

          <div className="ws-manuscript-page">
            <div className="ws-manuscript-frame">
              <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                aria-label="Section text"
                contentEditable={!readOnly}
                suppressContentEditableWarning
                data-placeholder={placeholder || 'Start writing this section…'}
                className="cite-editor ws-manuscript-body"
                onFocus={() => setFocused(true)}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                onBlur={() => {
                  setFocused(false);
                  captureSelection();
                  emitFromDom();
                }}
                onInput={() => {
                  if (composingRef.current) return;
                  emitFromDom();
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                  emitFromDom();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  document.execCommand('insertText', false, text);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    document.execCommand('insertText', false, '    ');
                    return;
                  }
                  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                  const sel = window.getSelection();
                  if (!sel || !sel.isCollapsed || !sel.rangeCount) return;
                  const range = sel.getRangeAt(0);
                  const node = range.startContainer;
                  if (e.key === 'Backspace' && range.startOffset === 0) {
                    const prev =
                      node.nodeType === Node.TEXT_NODE
                        ? node.previousSibling
                        : (node as HTMLElement).previousSibling;
                    if (prev && (prev as HTMLElement).dataset?.citeIds) {
                      e.preventDefault();
                      prev.parentNode?.removeChild(prev);
                      emitFromDom();
                    }
                  }
                  if (
                    e.key === 'Delete' &&
                    node.nodeType === Node.TEXT_NODE &&
                    range.startOffset === (node.textContent || '').length
                  ) {
                    const next = node.nextSibling;
                    if (next && (next as HTMLElement).dataset?.citeIds) {
                      e.preventDefault();
                      next.parentNode?.removeChild(next);
                      emitFromDom();
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="ws-desk-meta">
            <div className="ws-desk-aim">
              <span>
                {words} word{words === 1 ? '' : 's'}
                {suggestedWords ? ` / ~${suggestedWords}` : ''}
                {readOnly ? ' · read only' : ''}
              </span>
              {aimPct != null ? (
                <span className="ws-desk-aim-bar" title={`${aimPct}% of suggested length`}>
                  <span style={{ width: `${aimPct}%` }} />
                </span>
              ) : null}
            </div>
            <span>
              {clusters.length > 0
                ? `${clusters.length} citation${clusters.length === 1 ? '' : 's'}${
                    renderedPreview.includes('[missing') ? ' · needs Sources' : ''
                  }`
                : cursorHint}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <style>{`
          .cite-field {
            display: inline;
            white-space: nowrap;
            background: #ccfbf1;
            color: #115e59;
            border-radius: 0.25rem;
            padding: 0 0.2em;
            font-weight: 600;
            font-style: normal;
            cursor: default;
            user-select: all;
          }
          .cite-editor:empty:before {
            content: attr(data-placeholder);
            color: #94a3b8;
            pointer-events: none;
          }
        `}</style>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-teal-800"
            >
              <BookOpenIcon className="h-3.5 w-3.5" />
              Insert citation
            </button>
            {selectedClaim ? (
              <button
                type="button"
                onClick={() => setCitationAiOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[12px] font-semibold text-teal-900 hover:bg-teal-100"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                Citation AI
              </button>
            ) : null}
            <span className="hidden text-[11px] text-slate-400 sm:inline">
              ⌘/Ctrl+Shift+C
            </span>
            {onOpenRefs ? (
              <button
                type="button"
                className="text-[12px] text-teal-800 hover:underline"
                onClick={onOpenRefs}
              >
                Manage library
              </button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {aiWriteMenu}
            </div>
          </div>
        ) : null}

        <p className="text-[12px] text-slate-500">{cursorHint}</p>
        {picker}
        {citationAiOpen && selectedClaim ? (
          <CitationAiPanel
            claim={selectedClaim}
            citedPaperIds={citations
              .map((c) => c.paperId || c.id)
              .filter(Boolean) as string[]}
            selectionPaperIds={selectionCiteIds}
            onClose={() => setCitationAiOpen(false)}
            onUsePaper={async (paper) => {
              setCitationAiOpen(false);
              setSelectedClaim('');
              if (onCiteSuggestedPaper) {
                await onCiteSuggestedPaper(paper);
              } else if (paper.id) {
                insertTokenAtSelection([paper.id]);
              }
            }}
          />
        ) : null}

        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Section text"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          data-placeholder={placeholder || 'Start writing here…'}
          className="cite-editor min-h-[280px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 font-serif text-[16px] leading-relaxed text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 empty:before:content-[attr(data-placeholder)] disabled:bg-slate-50"
          {...editorHandlers}
        />

        {clusters.length > 0 ? (
          <p className="text-[12px] text-slate-500">
            {clusters.length} citation{clusters.length === 1 ? '' : 's'} in this section
            {renderedPreview.includes('[missing')
              ? ' · some markers need library papers'
              : ''}
            . Click a teal citation in the text to select it; Backspace removes it.
          </p>
        ) : null}

        <p className="text-[12px] text-slate-400">
          {words} words
          {suggestedWords ? ` · aim for ~${suggestedWords}` : ''}
          {readOnly ? ' · read only' : ''}
          {' · '}
          Citations stay linked; change style anytime.
        </p>
      </div>
    );
  }
);

export default CiteSectionEditor;
