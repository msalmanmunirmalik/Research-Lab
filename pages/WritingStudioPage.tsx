import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WriteTogetherPanel, { CollabAccess } from '../components/WriteTogetherPanel';
import WritingStudioOverlay, {
  type StudioOverlayKind,
} from '../components/WritingStudioOverlay';
import StudioShell from '../components/writing-studio/StudioShell';
import ManuscriptPreview from '../components/writing-studio/ManuscriptPreview';
import StudioSidebar, {
  type StudioWorkspaceTab,
} from '../components/writing-studio/StudioSidebar';
import { PageHeader, PagePanel } from '../components/PageHeader';
import {
  PlusIcon,
  TrashIcon,
  LightBulbIcon,
  DocumentTextIcon,
  EyeIcon,
} from '../components/icons';
import { getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import { useAuth } from '../contexts/AuthContext';
import CiteSectionEditor, {
  type CiteSectionEditorHandle,
} from '../components/CiteSectionEditor';
import {
  buildBibliography,
  formatInText,
  type CitationRecord,
} from '../utils/citationFormat';
import {
  downloadWritingDoc,
  downloadWritingMarkdown,
  downloadWritingPdf,
  downloadWritingBibtex,
} from '../utils/writingExport';
import {
  analyzeWritingDraft,
  type DraftAnalysisResult,
} from '../utils/writingDraftAnalysis';
import {
  buildOrderedBibliography,
  citationsToMap,
  extractCiteIdsOrdered,
  renderTextWithCitations,
  stripCiteIdsFromText,
} from '../utils/citeWhileWriting';
import { auditManuscriptCitations } from '../utils/citationAudit';
import {
  JOURNAL_PRESETS,
  applyJournalPreset,
  getJournalPreset,
} from '../utils/journalPresets';
import {
  addSubsection,
  buildSectionTree,
  ensureDraftSections,
  getNumberingPolicy,
  mergeCustomSections,
  removeSubsection,
  type OutlineNode,
} from '../utils/writingStructure';
import {
  WritingDocType,
  WritingDraftContent,
  WritingTemplate,
  DOC_TYPE_LABELS,
  CITATION_STYLES,
  CitationStyle,
  emptyWritingDraft,
  getWritingTemplate,
  getSectionContent,
  setSectionContent,
  draftCompletion,
  draftWordCount,
  draftToMarkdown,
  listWritingTemplates,
  collapseLegacyPaperSections,
} from '../utils/writingTemplates';
import {
  parseStudioPath,
  legacyStudioSearchToLocation,
  studioDeskPath,
  studioNewPath,
  studioComposePath,
  studioManuscriptPath,
  studioToolPath,
  isStudioPanelId,
  type StudioPanelId,
  STUDIO_DOC_TYPES,
} from '../utils/writingStudioRoutes';

type StudioMode = 'list' | 'pick' | 'edit';
type StudioDrawer = StudioPanelId | null;

type SavedDoc = {
  id: string;
  docType: WritingDocType;
  templateId: string;
  title: string;
  status: string;
  citationStyle: string;
  content: WritingDraftContent;
  updatedAt?: string;
  isShared?: boolean;
  myRole?: string;
};

type Citation = CitationRecord & {
  id: string;
  paperId?: string | null;
  writingCitationId?: string;
  sourceText?: string | null;
};

const DOC_TYPES = STUDIO_DOC_TYPES;

type WritingStudioPageProps = {
  /** When true, rendered inside an overlay (hide duplicate chrome). */
  embedded?: boolean;
};

function OutlineChip({
  node,
  activeId,
  draft,
  bibliography,
  sectionLocks,
  currentUserId,
  onSelect,
}: {
  node: OutlineNode;
  activeId: string;
  draft: WritingDraftContent;
  bibliography: string;
  sectionLocks: Array<{ sectionId: string; userId: string; displayName?: string }>;
  currentUserId?: string;
  onSelect: (id: string) => void;
}) {
  if (node.section.id === 'title') {
    return (
      <>
        {node.children.map((child) => (
          <OutlineChip
            key={child.section.id}
            node={child}
            activeId={activeId}
            draft={draft}
            bibliography={bibliography}
            sectionLocks={sectionLocks}
            currentUserId={currentUserId}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  const filled =
    node.section.id === 'references'
      ? Boolean(bibliography.trim())
      : getSectionContent(draft, node.section.id).trim().length > 0;
  const lock = sectionLocks.find(
    (l) => l.sectionId === node.section.id && l.userId !== currentUserId
  );
  const isChild = node.depth > 0 || Boolean(node.section.parentId);

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.section.id)}
        title={lock ? `${lock.displayName || 'Someone'} is editing` : node.displayTitle}
        className={`ws-chip ${isChild ? 'is-sub' : ''} ${
          activeId === node.section.id ? 'is-active' : filled ? 'is-filled' : ''
        }`}
      >
        {node.numberLabel ? (
          <span className="ws-chip-num">{node.numberLabel}</span>
        ) : null}
        {node.section.title.replace(/^\d+(\.\d+)*\s+/, '')}
      </button>
      {node.children.map((child) => (
        <OutlineChip
          key={child.section.id}
          node={child}
          activeId={activeId}
          draft={draft}
          bibliography={bibliography}
          sectionLocks={sectionLocks}
          currentUserId={currentUserId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

const WritingStudioPage: React.FC<WritingStudioPageProps> = ({ embedded = false }) => {
  const apiBase = resolveApiBaseUrl();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = typeof localStorage !== 'undefined' ? getAuthToken() : null;

  const [mode, setMode] = useState<StudioMode>('list');
  const [overlay, setOverlay] = useState<StudioOverlayKind | null>(null);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);
  const [pickType, setPickType] = useState<WritingDocType>('research_paper');
  const [docId, setDocId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WritingDraftContent>(() => emptyWritingDraft());
  const [sectionId, setSectionId] = useState<string>('abstract');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [library, setLibrary] = useState<Citation[]>([]);
  const [bibtex, setBibtex] = useState('');
  const [bibliography, setBibliography] = useState('');
  const [doiQuery, setDoiQuery] = useState('');
  const [doiLoading, setDoiLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<Citation[]>([]);
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [manualCite, setManualCite] = useState({ title: '', authors: '', year: '', doi: '' });
  const [collabAccess, setCollabAccess] = useState<CollabAccess | null>(null);
  const [contentRevision, setContentRevision] = useState(1);
  const [sectionLocks, setSectionLocks] = useState<
    Array<{ sectionId: string; userId: string; displayName?: string }>
  >([]);
  /** Writer-facing drawers (synced to URL panel segment) */
  const [drawer, setDrawer] = useState<StudioDrawer>(null);
  const [analysis, setAnalysis] = useState<DraftAnalysisResult & { aiNotes?: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [slidesExporting, setSlidesExporting] = useState(false);
  const [slidesPreview, setSlidesPreview] = useState<Array<{ title?: string; content?: string; number?: number }> | null>(null);
  const [claimSeed, setClaimSeed] = useState('');
  /** Sidekick integrity (verify / retract / OA) keyed by citation id */
  const [citeIntegrity, setCiteIntegrity] = useState<
    Record<
      string,
      {
        verifyVerdict?: string;
        isRetracted?: boolean;
        hasConcern?: boolean;
        isOa?: boolean;
        oaStatus?: string | null;
        oaUrl?: string | null;
      }
    >
  >({});
  const autoSaveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const citeEditorRef = useRef<CiteSectionEditorHandle>(null);
  const loadedDocRef = useRef<string | null>(null);
  const loadedComposeRef = useRef<string | null>(null);
  dirtyRef.current = dirty;

  const studioRoute = useMemo(
    () => parseStudioPath(location.pathname),
    [location.pathname]
  );

  /** Navigate to a studio path without losing ephemeral query (invite/notice/cite/grantId). */
  const goStudio = useCallback(
    (path: string, opts?: { replace?: boolean; state?: unknown }) => {
      const keep = new URLSearchParams();
      for (const key of ['invite', 'notice', 'cite', 'grantId'] as const) {
        const v = searchParams.get(key);
        if (v) keep.set(key, v);
      }
      const qs = keep.toString();
      navigate({ pathname: path, search: qs ? `?${qs}` : '' }, {
        replace: opts?.replace,
        state: opts?.state,
      });
    },
    [navigate, searchParams]
  );

  const pathForEditor = useCallback(
    (nextSectionId: string, nextPanel?: StudioDrawer, nextDocId?: string | null) => {
      const id = nextDocId !== undefined ? nextDocId : docId;
      const panel = nextPanel === undefined ? drawer : nextPanel;
      if (id) return studioManuscriptPath(id, nextSectionId, panel || undefined);
      return studioComposePath(draft.templateId, nextSectionId, panel || undefined);
    },
    [docId, drawer, draft.templateId]
  );

  const templateBase = useMemo(() => getWritingTemplate(draft.templateId), [draft.templateId]);
  const template = useMemo(() => {
    const sections = mergeCustomSections(templateBase.sections, draft);
    return {
      ...templateBase,
      sections,
      numberingPolicy: getNumberingPolicy(templateBase, draft),
    };
  }, [templateBase, draft]);
  const outlineTree = useMemo(
    () => buildSectionTree(template.sections, getNumberingPolicy(template, draft)),
    [template, draft]
  );
  const completion = useMemo(() => draftCompletion(draft), [draft]);
  const words = useMemo(() => draftWordCount(draft), [draft]);
  const activeSection =
    template.sections.find((s) => s.id === sectionId) ||
    template.sections.find((s) => s.id !== 'title') ||
    template.sections[0];
  const liveBibliography = useMemo(() => {
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    const ordered = extractCiteIdsOrdered(fullText);
    const byId = citationsToMap([...citations, ...library]);
    if (ordered.length) {
      return buildOrderedBibliography(ordered, byId, draft.citationStyle);
    }
    return buildBibliography(citations, draft.citationStyle);
  }, [citations, library, draft.citationStyle, draft.sections]);

  useEffect(() => {
    if (liveBibliography) setBibliography(liveBibliography);
  }, [liveBibliography]);

  // Keep the References section in sync with ordered cites (authoring source of truth)
  useEffect(() => {
    const bib = (bibliography || liveBibliography || '').trim();
    if (!bib) return;
    const current = getSectionContent(draft, 'references').trim();
    if (current === bib) return;
    markDirty((d) => setSectionContent(d, 'references', bib));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sync when bib text changes
  }, [bibliography, liveBibliography]);

  const authHeaders = useCallback(
    (): HeadersInit => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  // Structural cites {{cite:paperId}} → CSL bibliography via research API
  useEffect(() => {
    if (!token) return;
    const text = draft.sections.map((s) => s.content || '').join('\n');
    if (!/\{\{cite:[a-zA-Z0-9_;-]+\}\}/.test(text)) return;
    const styleMap: Record<string, string> = {
      APA: 'apa',
      Vancouver: 'vancouver',
      Chicago: 'chicago',
      IEEE: 'ieee',
      Nature: 'nature',
      MLA: 'apa',
      Science: 'nature',
    };
    const style = styleMap[draft.citationStyle] || 'apa';
    const expectedIds = extractCiteIdsOrdered(
      draft.sections
        .filter((s) => s.sectionId !== 'references')
        .map((s) => s.content || '')
        .join('\n')
    );
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`${apiBase}/research/bibliography`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ text, style }),
          });
          const data = await res.json();
          if (!res.ok || !data.bibliography) return;
          const returnedIds: string[] = Array.isArray(data.citationIds)
            ? data.citationIds.map(String)
            : [];
          // Never replace a complete local bibliography with a partial server one
          // (happens when a cite id is not yet in the papers table).
          const coversAll =
            expectedIds.length === 0 ||
            expectedIds.every((id) => returnedIds.includes(id));
          if (!coversAll) return;
          setBibliography(data.bibliography);
        } catch {
          /* keep hand-rolled fallback */
        }
      })();
    }, 600);
    return () => window.clearTimeout(t);
  }, [draft.sections, draft.citationStyle, token, apiBase, authHeaders]);

  // Scholar Sidekick: enrich draft citations (verify / retract / OA) for Cite panel badges
  useEffect(() => {
    if (!token || !citations.length) {
      setCiteIntegrity({});
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const papers = citations.slice(0, 8).map((c) => ({
            paperId: c.paperId || c.id,
            title: c.title,
            doi: c.doi,
            authors: c.authors,
            year: c.year,
            journal: c.journal,
          }));
          const res = await fetch(`${apiBase}/research/sidekick/enrich`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ papers }),
          });
          const data = await res.json();
          if (!res.ok || !Array.isArray(data.papers)) return;
          const next: typeof citeIntegrity = {};
          for (const p of data.papers) {
            const key = String(p.paperId || '');
            if (!key || !p.integrity) continue;
            next[key] = {
              verifyVerdict: p.integrity.verifyVerdict,
              isRetracted: p.integrity.isRetracted,
              hasConcern: p.integrity.hasConcern,
              isOa: p.integrity.isOa,
              oaStatus: p.integrity.oaStatus,
              oaUrl: p.integrity.oaUrl,
            };
          }
          setCiteIntegrity(next);
        } catch {
          /* optional */
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enrich when citation list identity changes
  }, [citations, token, apiBase, authHeaders]);

  const markDirty = (updater: (prev: WritingDraftContent) => WritingDraftContent) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  };

  const hydrateDraft = useCallback((content: WritingDraftContent) => {
    const collapsed = collapseLegacyPaperSections(content);
    const tpl = getWritingTemplate(collapsed.templateId);
    const withCustoms = {
      ...collapsed,
      customSections: collapsed.customSections || [],
    };
    return ensureDraftSections(withCustoms, {
      ...tpl,
      sections: mergeCustomSections(tpl.sections, withCustoms),
    });
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${apiBase}/writing/templates`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.templates) setTemplates(data.templates);
    } catch {
      /* templates also available client-side */
    }
  };

  const loadDocs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/writing/documents`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load documents');
      setDocs(data.documents || []);
    } catch (e: unknown) {
      setError(formatApiNetworkError(e) || (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadLibrary = async () => {
    if (!token) return;
    try {
      const [writingRes, researchRes] = await Promise.all([
        fetch(`${apiBase}/writing/citations`, { headers: authHeaders() }),
        fetch(`${apiBase}/research/library?limit=100`, { headers: authHeaders() }),
      ]);
      const writingData = await writingRes.json();
      const researchData = researchRes.ok ? await researchRes.json() : { items: [] };
      const fromWriting: Citation[] = writingRes.ok ? writingData.citations || [] : [];
      const fromResearch: Citation[] = (researchData.items || []).map((item: any) => {
        const p = item.paper || {};
        return {
          id: p.id || item.paperId,
          paperId: p.id || item.paperId,
          title: p.title,
          authors: (p.authors || []).map((a: any) =>
            typeof a === 'string' ? a : a.name || [a.lastName, a.firstName].filter(Boolean).join(', ')
          ),
          year: p.publicationYear ?? p.year,
          journal: p.journalName || p.journal,
          volume: p.volume,
          issue: p.issue,
          pages: p.pages,
          doi: p.doi,
          url: p.sourceUrl || p.url,
          abstract: p.abstract,
          sourceText: item.userPdfText || null,
        } as Citation;
      });
      const byKey = new Map<string, Citation>();
      for (const c of [...fromResearch, ...fromWriting]) {
        const key = (c.doi || c.id || c.title).toLowerCase();
        if (!byKey.has(key)) byKey.set(key, c);
      }
      setLibrary([...byKey.values()]);
    } catch {
      /* optional */
    }
  };

  useEffect(() => {
    void loadTemplates();
    void loadDocs();
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Migrate legacy ?doc=&flow=&type= links → canonical paths
  useEffect(() => {
    const migrated = legacyStudioSearchToLocation(location.pathname, location.search);
    if (!migrated) return;
    navigate(
      { pathname: migrated.pathname, search: migrated.search },
      { replace: true, state: location.state }
    );
  }, [location.pathname, location.search, location.state, navigate]);

  // SideNav → desk
  useEffect(() => {
    const state = location.state as { studioHome?: boolean; studioHomeAt?: number } | null;
    if (!state?.studioHome && !state?.studioHomeAt) return;
    loadedDocRef.current = null;
    loadedComposeRef.current = null;
    setMode('list');
    setDocId(null);
    setDraft(emptyWritingDraft());
    setSectionId('abstract');
    setCitations([]);
    setDrawer(null);
    setOverlay(null);
    setDirty(false);
    setError(null);
    setMessage(null);
    void loadDocs();
    navigate(studioDeskPath(), { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // One-shot notices (?notice=slides|evidence)
  useEffect(() => {
    const notice = searchParams.get('notice');
    if (notice !== 'slides' && notice !== 'evidence') return;
    if (notice === 'slides') {
      setMessage(
        'Slides are an export from a manuscript. Open a draft, then use Export → Slides.'
      );
    } else {
      const evidenceTitle = searchParams.get('title');
      setMessage(
        evidenceTitle
          ? `Continue from evidence “${evidenceTitle}”. Open or create a draft, then cite sources from your library.`
          : 'Continue from an evidence pack. Open or create a draft, then cite sources from your library.'
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete('notice');
    next.delete('evidenceId');
    next.delete('title');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Collab invite (?invite=) — preview, then accept when signed in
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (!invite) return;

    if (!token) {
      try {
        sessionStorage.setItem('ws_pending_invite', invite);
      } catch {
        /* ignore */
      }
      setError('Sign in to accept the co-author invitation.');
      navigate(`/login?next=${encodeURIComponent(`/writing-studio?invite=${invite}`)}`, {
        replace: true,
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        // Preview first so we can show a clear message
        const previewRes = await fetch(`${apiBase}/writing/invitations/${invite}`, {
          headers: authHeaders(),
        });
        const preview = await previewRes.json().catch(() => ({}));
        if (!previewRes.ok) {
          throw new Error(preview.error || 'Invitation not found or expired');
        }
        const inv = preview.invitation;
        const label = inv
          ? `Join “${inv.documentTitle || 'manuscript'}” as ${inv.role === 'viewer' ? 'read-only' : 'co-author'}${
              inv.inviterName ? ` (invited by ${inv.inviterName})` : ''
            }?`
          : 'Accept this co-author invitation?';
        if (!window.confirm(label)) {
          const next = new URLSearchParams(searchParams);
          next.delete('invite');
          setSearchParams(next, { replace: true });
          return;
        }

        const res = await fetch(`${apiBase}/writing/invitations/${invite}/accept`, {
          method: 'POST',
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not accept invitation');
        if (cancelled) return;
        try {
          sessionStorage.removeItem('ws_pending_invite');
        } catch {
          /* ignore */
        }
        const next = new URLSearchParams(searchParams);
        next.delete('invite');
        setMessage('You joined the manuscript — Invite Co-authors is active.');
        if (data.documentId) {
          loadedDocRef.current = null;
          navigate(
            {
              pathname: studioManuscriptPath(String(data.documentId)),
              search: next.toString() ? `?${next}` : '',
            },
            { replace: true }
          );
        } else {
          setSearchParams(next, { replace: true });
          await loadDocs();
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, searchParams.get('invite')]);

  const filteredTemplates = useMemo(() => {
    const list = templates.length ? templates : listWritingTemplates();
    return list.filter((t) => t.docType === pickType);
  }, [templates, pickType]);

  const canEditActiveSection = useMemo(() => {
    if (!collabAccess) return true; // new unsaved draft
    if (!collabAccess.canEdit) return false;
    if (collabAccess.accessScope === 'entire' || collabAccess.isOwner) return true;
    return collabAccess.sectionIds.includes(sectionId);
  }, [collabAccess, sectionId]);

  const foreignLock = sectionLocks.find(
    (l) => l.sectionId === sectionId && l.userId !== user?.id
  );

  const sectionReadOnly = !canEditActiveSection || Boolean(foreignLock);

  useEffect(() => {
    if (!dirty || !docId || !token || sectionReadOnly) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      void saveDocument(false);
    }, 1800);
    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, docId, sectionReadOnly]);

  const handleRemoteRevision = useCallback(
    (rev: number) => {
      if (!docId) return;
      if (rev <= contentRevision) return;
      setContentRevision(rev);
      if (dirtyRef.current) {
        setMessage('Co-authors updated the manuscript — save your section, then reload if needed.');
        return;
      }
      void (async () => {
        try {
          const res = await fetch(`${apiBase}/writing/documents/${docId}`, {
            headers: authHeaders(),
          });
          const data = await res.json();
          if (res.ok && data.document?.content) {
            setDraft(hydrateDraft(data.document.content));
            setContentRevision(data.document.contentRevision || rev);
            if (data.access) setCollabAccess(data.access);
          }
        } catch {
          /* ignore */
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiBase, contentRevision, docId]
  );

  const startFromTemplate = (tplId: string) => {
    const d = emptyWritingDraft(tplId);
    const firstSection =
      d.sections.find((s) => s.sectionId !== 'title')?.sectionId ||
      d.sections[0]?.sectionId ||
      'abstract';
    setDraft(d);
    setSectionId(firstSection);
    setDocId(null);
    setCitations([]);
    setBibliography('');
    setCollabAccess(null);
    setDirty(true);
    setMode('edit');
    setMessage(null);
    setError(null);
    setDrawer(null);
    setOverlay(null);
    loadedDocRef.current = null;
    loadedComposeRef.current = tplId;
    goStudio(studioComposePath(tplId, firstSection));
  };

  const openDoc = async (
    id: string,
    preferredSection?: string,
    opts?: { syncUrl?: boolean; panel?: StudioPanelId | null }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/writing/documents/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open');
      const content = hydrateDraft(data.document.content as WritingDraftContent);
      const tpl = getWritingTemplate(content.templateId);
      const sectionIds = tpl.sections.map((s) => s.id);
      const firstBody =
        sectionIds.find((id) => id !== 'title') || sectionIds[0] || 'abstract';
      const firstSection =
        preferredSection && sectionIds.includes(preferredSection)
          ? preferredSection === 'title'
            ? firstBody
            : preferredSection
          : firstBody;
      setDocId(id);
      setDraft(content);
      setCitations(data.citations || []);
      setSectionId(firstSection);
      setCollabAccess(data.access || null);
      setContentRevision(data.document.contentRevision || 1);
      setMode('edit');
      setDirty(false);
      setOverlay(null);
      if (opts?.panel !== undefined) {
        setDrawer(opts.panel);
      }
      loadedDocRef.current = id;
      loadedComposeRef.current = null;
      if (opts?.syncUrl ?? true) {
        goStudio(
          studioManuscriptPath(id, firstSection, opts?.panel || undefined),
          { replace: true }
        );
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // URL → studio state (path is source of truth for view / doc / section / panel / tool)
  useEffect(() => {
    if (!studioRoute) return;
    if (legacyStudioSearchToLocation(location.pathname, location.search)) return;

    switch (studioRoute.view) {
      case 'desk':
        setMode('list');
        setOverlay(null);
        setDrawer(null);
        setDocId(null);
        loadedDocRef.current = null;
        loadedComposeRef.current = null;
        break;
      case 'new':
        setMode('pick');
        setOverlay(null);
        setDrawer(null);
        setDocId(null);
        if (studioRoute.docType) setPickType(studioRoute.docType);
        break;
      case 'tool':
        setMode('list');
        setOverlay(studioRoute.toolId);
        setDrawer(null);
        break;
      case 'compose': {
        setMode('edit');
        setOverlay(null);
        setDocId(null);
        if (loadedComposeRef.current !== studioRoute.templateId) {
          const d = emptyWritingDraft(studioRoute.templateId);
          setDraft(d);
          setCitations([]);
          setCollabAccess(null);
          setDirty(true);
          loadedComposeRef.current = studioRoute.templateId;
          loadedDocRef.current = null;
        }
        const fallback =
          emptyWritingDraft(studioRoute.templateId).sections[0]?.sectionId || 'abstract';
        if (!studioRoute.sectionId) {
          goStudio(studioComposePath(studioRoute.templateId, fallback), { replace: true });
          break;
        }
        setSectionId(studioRoute.sectionId);
        setDrawer(studioRoute.panel && isStudioPanelId(studioRoute.panel) ? studioRoute.panel : null);
        break;
      }
      case 'manuscript': {
        setMode('edit');
        setOverlay(null);
        const panel =
          studioRoute.panel && isStudioPanelId(studioRoute.panel) ? studioRoute.panel : null;
        setDrawer(panel);
        if (loadedDocRef.current !== studioRoute.docId) {
          void openDoc(studioRoute.docId, studioRoute.sectionId, {
            syncUrl: !studioRoute.sectionId,
          });
        } else if (studioRoute.sectionId) {
          setSectionId(studioRoute.sectionId);
        } else {
          goStudio(studioManuscriptPath(studioRoute.docId, sectionId), { replace: true });
        }
        break;
      }
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioRoute, token]);

  const saveDocument = async (notify = true) => {
    if (!token) {
      setError('Sign in to save drafts.');
      return;
    }
    setSaving(true);
    if (notify) setError(null);
    try {
      if (docId) {
        const res = await fetch(`${apiBase}/writing/documents/${docId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            title: draft.title,
            content: draft,
            citationStyle: draft.citationStyle,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        if (typeof data.document?.contentRevision === 'number') {
          setContentRevision(data.document.contentRevision);
        }
        if (data.access) setCollabAccess(data.access);
      } else {
        const res = await fetch(`${apiBase}/writing/documents`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            templateId: draft.templateId,
            title: draft.title || 'Untitled',
            content: draft,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed');
        const newId = String(data.document.id);
        setDocId(newId);
        if (typeof data.document?.contentRevision === 'number') {
          setContentRevision(data.document.contentRevision);
        }
        loadedDocRef.current = newId;
        loadedComposeRef.current = null;
        goStudio(studioManuscriptPath(newId, sectionId), { replace: true });
      }
      setDirty(false);
      if (notify) setMessage('Saved');
      void loadDocs();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm('Delete this draft?')) return;
    try {
      await fetch(`${apiBase}/writing/documents/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (docId === id) {
        loadedDocRef.current = null;
        goStudio(studioDeskPath());
      }
      void loadDocs();
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const runAssist = async (assistMode: 'section' | 'full' | 'citations' | 'continue') => {
    if (!token) {
      setError('Sign in to use AI assist.');
      return;
    }
    if (!draft.title.trim() && assistMode !== 'citations') {
      setError('Add a title before generating.');
      return;
    }
    if (assistMode === 'continue' && citations.length === 0) {
      setError('Attach at least one reference (with abstract or source text) for grounded continue.');
      return;
    }
    setAiLoading(true);
    setError(null);
    setMessage(null);
    try {
      let id = docId;
      if (!id) {
        const createRes = await fetch(`${apiBase}/writing/documents`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            templateId: draft.templateId,
            title: draft.title || 'Untitled',
            content: draft,
          }),
        });
        const created = await createRes.json();
        if (!createRes.ok) throw new Error(created.error || 'Could not create draft');
        id = created.document.id;
        setDocId(id);
        loadedDocRef.current = id;
        loadedComposeRef.current = null;
        goStudio(studioManuscriptPath(id, sectionId), { replace: true });
      }

      const groundedSources =
        assistMode === 'continue'
          ? citations.map((c, i) => ({
              title: c.title,
              authors: c.authors,
              year: c.year,
              doi: c.doi,
              abstract: c.abstract,
              sourceText: c.sourceText,
              inText: formatInText(c, draft.citationStyle, i),
            }))
          : undefined;

      const res = await fetch(`${apiBase}/writing/documents/${id}/assist`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          draft,
          mode: assistMode,
          sectionId:
            assistMode === 'section' || assistMode === 'continue'
              ? activeSection?.id
              : undefined,
          instruction: activeSection?.assistHint,
          groundedSources,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI assist failed');

      if (assistMode === 'citations') {
        setBibliography(data.bibliography || liveBibliography);
        setMessage('Citation suggestions ready — review before inserting.');
        goStudio(pathForEditor(sectionId, 'sources'));
      } else if (Array.isArray(data.sectionUpdates)) {
        markDirty((prev) => {
          let next = { ...prev };
          for (const u of data.sectionUpdates) {
            next = setSectionContent(next, u.sectionId, u.content);
            if (u.sectionId === 'title' && u.content) {
              next = { ...next, title: u.content.split('\n')[0].slice(0, 200) };
            }
          }
          return next;
        });
        setMessage(
          assistMode === 'full'
            ? 'Draft sections filled where empty.'
            : assistMode === 'continue'
              ? 'Continued from your attached sources.'
              : `Updated “${activeSection?.title}”.`
        );
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const addFromDoi = async (overrideQuery?: string): Promise<Citation | null> => {
    const q = (overrideQuery ?? doiQuery).trim();
    if (!q) return null;
    setDoiLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/writing/citations/from-doi`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ doi: q, documentId: docId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(
          data.error ||
            'Too many requests — wait a minute and try again. Tip: paste a DOI (10.…) rather than retrying the same link.'
        );
      }
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setDoiQuery('');
      setSearchHits([]);
      const title = String(data.citation?.title || 'reference');
      setMessage(
        title.length > 120
          ? `Added: ${title.slice(0, 117)}…`
          : `Added: ${title}`
      );
      void loadLibrary();
      const citation = data.citation as Citation | undefined;
      if (citation) {
        setCitations((prev) =>
          prev.some((c) => c.id === citation.id || (c.doi && citation.doi && c.doi === citation.doi))
            ? prev
            : [...prev, citation]
        );
        if (!docId) {
          setLibrary((prev) => [citation, ...prev]);
        }
        return citation;
      }
      return null;
    } catch (e: unknown) {
      setError((e as Error).message);
      return null;
    } finally {
      setDoiLoading(false);
    }
  };

  const attachPickerPaper = async (paper: {
    id?: string;
    title: string;
    doi?: string | null;
    authors?: Array<{ name: string }>;
    publicationYear?: number | null;
  }): Promise<Citation | null> => {
    try {
      if (paper.doi) {
        return await addFromDoi(paper.doi);
      }
      const res = await fetch(`${apiBase}/writing/citations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: paper.title,
          authors: (paper.authors || []).map((a) => a.name).join(', '),
          year: paper.publicationYear ? String(paper.publicationYear) : undefined,
          paperId: paper.id,
          documentId: docId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not attach paper');
      void loadLibrary();
      if (data.citation) {
        const attached: Citation = {
          ...data.citation,
          id: data.citation.paperId || data.citation.id || paper.id,
          paperId: data.citation.paperId || paper.id || null,
        };
        setCitations((prev) =>
          prev.some(
            (c) =>
              c.id === attached.id ||
              (c.paperId && attached.paperId && c.paperId === attached.paperId)
          )
            ? prev
            : [...prev, attached]
        );
        setMessage(`Attached: ${paper.title.slice(0, 80)}`);
        return attached;
      }
      if (paper.id) {
        return {
          id: paper.id,
          paperId: paper.id,
          title: paper.title,
          authors: (paper.authors || []).map((a) => a.name),
          year: paper.publicationYear ?? null,
          doi: paper.doi ?? null,
        };
      }
      return null;
    } catch (e: unknown) {
      setError((e as Error).message);
      return null;
    }
  };

  const attachAndCitePaper = async (paper: {
    id?: string;
    title: string;
    doi?: string | null;
    authors?: Array<{ name: string }>;
    publicationYear?: number | null;
  }) => {
    const attached = await attachPickerPaper(paper);
    if (attached) {
      citeIntoActiveSection(attached);
      return;
    }
    if (paper.id) {
      citeIntoActiveSection({
        id: paper.id,
        paperId: paper.id,
        title: paper.title,
        authors: (paper.authors || []).map((a) => a.name),
        year: paper.publicationYear ?? null,
        doi: paper.doi ?? null,
      });
    }
  };

  const openFindSources = (withClaim = false) => {
    if (withClaim) {
      const text = getSectionContent(draft, activeSection?.id || sectionId).trim();
      const seed =
        text.length > 400 ? `${text.slice(0, 400).trim()}…` : text;
      setClaimSeed(seed);
    } else {
      setClaimSeed('');
    }
    setOverlay('library');
  };

  const searchLiterature = async () => {
    if (!doiQuery.trim()) return;
    setDoiLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/writing/search?q=${encodeURIComponent(doiQuery.trim())}&limit=8`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setSearchHits((data.results || []).map((r: any) => ({ ...r.citation, id: r.citation.doi || r.citation.title })));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setDoiLoading(false);
    }
  };

  const saveSourceNote = async (citationId: string) => {
    try {
      const res = await fetch(`${apiBase}/writing/citations/${encodeURIComponent(citationId)}/source`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ sourceText: sourceNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save source');
      const updated = data.citation;
      const match = (c: Citation) =>
        c.id === citationId ||
        c.writingCitationId === citationId ||
        c.paperId === citationId ||
        (updated &&
          (c.id === updated.id ||
            c.paperId === updated.paperId ||
            c.writingCitationId === updated.writingCitationId));
      setCitations((prev) =>
        prev.map((c) =>
          match(c) ? { ...c, ...updated, sourceText: updated.sourceText } : c
        )
      );
      setLibrary((prev) =>
        prev.map((c) =>
          match(c) ? { ...c, ...updated, sourceText: updated.sourceText } : c
        )
      );
      setSourceNoteId(null);
      setMessage('Source notes saved for grounding');
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const uploadPdf = async (citationId: string, file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/writing/citations/${citationId}/pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setCitations((prev) =>
        prev.map((c) => (c.id === citationId ? { ...c, ...data.citation } : c))
      );
      setMessage(`Extracted ${data.extractedChars || 0} characters from PDF`);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const importBibtex = async () => {
    if (!bibtex.trim()) return;
    try {
      const res = await fetch(`${apiBase}/writing/citations/import-bibtex`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ bibtex, documentId: docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setBibtex('');
      setMessage(`Imported ${data.count} reference(s)`);
      void loadLibrary();
      if (docId) void openDoc(docId);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const addManualCitation = async () => {
    if (!manualCite.title.trim()) return;
    try {
      const res = await fetch(`${apiBase}/writing/citations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: manualCite.title,
          authors: manualCite.authors,
          year: manualCite.year || undefined,
          doi: manualCite.doi || undefined,
          documentId: docId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Add failed');
      setManualCite({ title: '', authors: '', year: '', doi: '' });
      void loadLibrary();
      if (docId) {
        setCitations((prev) => [...prev, data.citation]);
      }
      setMessage('Reference added');
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const attachFromLibrary = async (c: Citation, alsoCite = true) => {
    if (!docId) {
      setError('Save the document first to attach references.');
      return;
    }
    const attachId = c.paperId || c.id;
    if (!attachId) {
      setError('This library item has no id.');
      return;
    }
    try {
      const res = await fetch(`${apiBase}/writing/citations/${encodeURIComponent(attachId)}/attach`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ documentId: docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Attach failed');

      const attached: Citation = data.citation
        ? {
            ...data.citation,
            id: data.citation.paperId || data.citation.id || attachId,
            paperId: data.citation.paperId || data.paperId || c.paperId || null,
          }
        : {
            ...c,
            id: data.paperId || c.paperId || c.id,
            paperId: data.paperId || c.paperId || null,
          };

      setCitations((prev) => {
        const key = (x: Citation) =>
          (x.paperId || x.id || x.doi || x.title || '').toLowerCase();
        if (prev.some((p) => key(p) === key(attached))) return prev;
        return [...prev, attached];
      });
      void loadLibrary();
      setMessage(`Added to draft: ${attached.title?.slice(0, 80) || 'reference'}`);

      if (alsoCite) {
        citeIntoActiveSection(attached);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const buildRenderedSectionsForExport = () => {
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    const ordered = extractCiteIdsOrdered(fullText);
    const byId = citationsToMap([...citations, ...library]);
    const map: Record<string, string> = {};
    for (const s of template.sections) {
      if (s.id === 'references') {
        map[s.id] = bibliography || liveBibliography || '';
        continue;
      }
      const raw = getSectionContent(draft, s.id);
      map[s.id] = renderTextWithCitations(
        raw,
        byId,
        draft.citationStyle,
        ordered
      ).rendered;
    }
    return map;
  };

  const copyMarkdown = async () => {
    const rendered = buildRenderedSectionsForExport();
    const renderedDraft = {
      ...draft,
      sections: template.sections.map((s) => ({
        sectionId: s.id,
        content: rendered[s.id] || getSectionContent(draft, s.id),
      })),
    };
    const md = draftToMarkdown(renderedDraft);
    await navigator.clipboard.writeText(md);
    setMessage('Copied markdown with formatted citations');
  };

  const citeIntoActiveSection = (c: Citation) => {
    if (!activeSection || sectionReadOnly) return;
    if (activeSection.id === 'references') {
      setMessage('Switch to a body section, place the cursor, then Cite here.');
      return;
    }
    const id = c.paperId || c.id;
    if (!id) return;
    // Ensure it appears in draft sources list for bibliography / picker
    setCitations((prev) => {
      const key = (x: Citation) =>
        (x.paperId || x.id || x.doi || x.title || '').toLowerCase();
      if (prev.some((p) => key(p) === key(c))) return prev;
      return [...prev, { ...c, id, paperId: c.paperId || id }];
    });
    citeEditorRef.current?.insertCitations([id]);
    setMessage(`Cited in text: ${c.title.slice(0, 80)}`);
  };

  const citationKeys = (c: Citation) =>
    [c.paperId, c.writingCitationId, c.id, c.doi].filter(Boolean).map(String);

  const removeCitationFromDraft = async (c: Citation) => {
    const ids = citationKeys(c);
    if (!ids.length) return;
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    const usedInText = extractCiteIdsOrdered(fullText).some((id) => ids.includes(id));
    const ok = window.confirm(
      usedInText
        ? `Remove “${c.title.slice(0, 80)}” from this draft and clear its in-text citations?`
        : `Remove “${c.title.slice(0, 80)}” from this draft?`
    );
    if (!ok) return;

    if (usedInText) {
      markDirty((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.sectionId === 'references'
            ? s
            : { ...s, content: stripCiteIdsFromText(s.content || '', ids) }
        ),
      }));
    }

    setCitations((prev) =>
      prev.filter((x) => !citationKeys(x).some((k) => ids.includes(k)))
    );

    const deleteId = c.writingCitationId || c.paperId || c.id;
    if (docId && deleteId && token) {
      try {
        await fetch(
          `${apiBase}/writing/citations/${encodeURIComponent(deleteId)}?documentId=${encodeURIComponent(docId)}&fromLibrary=false`,
          { method: 'DELETE', headers: authHeaders() }
        );
      } catch {
        /* local state already updated */
      }
    }
    setMessage('Removed from this draft');
  };

  const removeCitationFromLibrary = async (c: Citation) => {
    const ids = citationKeys(c);
    if (!ids.length) return;
    const ok = window.confirm(
      `Remove “${c.title.slice(0, 80)}” from your library? It will also leave this draft.`
    );
    if (!ok) return;

    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    if (extractCiteIdsOrdered(fullText).some((id) => ids.includes(id))) {
      markDirty((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.sectionId === 'references'
            ? s
            : { ...s, content: stripCiteIdsFromText(s.content || '', ids) }
        ),
      }));
    }

    setCitations((prev) =>
      prev.filter((x) => !citationKeys(x).some((k) => ids.includes(k)))
    );
    setLibrary((prev) =>
      prev.filter((x) => !citationKeys(x).some((k) => ids.includes(k)))
    );

    const deleteId = c.writingCitationId || c.paperId || c.id;
    if (deleteId && token) {
      try {
        const res = await fetch(
          `${apiBase}/writing/citations/${encodeURIComponent(deleteId)}?fromLibrary=true`,
          { method: 'DELETE', headers: authHeaders() }
        );
        if (!res.ok) {
          // Fallback: research library delete by paper id
          const paperId = c.paperId || c.id;
          if (paperId) {
            await fetch(`${apiBase}/research/library/${encodeURIComponent(paperId)}`, {
              method: 'DELETE',
              headers: authHeaders(),
            });
          }
        }
      } catch (e: unknown) {
        setError((e as Error).message);
        return;
      }
    }
    setMessage('Removed from library');
    void loadLibrary();
  };

  const saveAndClose = async () => {
    await saveDocument(true);
    loadedDocRef.current = null;
    loadedComposeRef.current = null;
    goStudio(studioDeskPath());
    void loadDocs();
  };

  const runAnalyze = async (enrichWithAi = false) => {
    setAnalyzing(true);
    setError(null);
    goStudio(pathForEditor(sectionId, 'analyze'));
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    const citeAudit = auditManuscriptCitations({
      fullText,
      citations: [...citations, ...library],
      sectionTexts: draft.sections.map((s) => ({
        sectionId: s.sectionId,
        content: s.content || '',
      })),
    });

    // Scholar Sidekick: fabrication + retraction audit on cited refs
    const sidekickChecks: DraftAnalysisResult['checks'] = [];
    try {
      const cited = extractCiteIdsOrdered(fullText);
      const allRefs = [...citations, ...library];
      const claims = cited
        .map((id) => {
          const c = allRefs.find((r) => r.paperId === id || r.id === id);
          if (!c) return null;
          return {
            title: c.title,
            doi: c.doi || null,
            pmid: (c as { pmid?: string | null }).pmid || null,
            year: c.year ?? null,
            journal: c.journal || null,
          };
        })
        .filter(Boolean);
      if (claims.length && token) {
        const skRes = await fetch(`${apiBase}/research/sidekick/audit`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ claims, paperIds: cited }),
        });
        const skData = await skRes.json();
        if (skRes.ok && skData.summary) {
          const s = skData.summary as {
            matched?: number;
            mismatch?: number;
            retracted?: number;
            not_found?: number;
            total?: number;
          };
          if (s.retracted && s.retracted > 0) {
            sidekickChecks.push({
              id: 'sidekick_retracted',
              category: 'Citation integrity',
              title: `${s.retracted} retracted reference(s)`,
              detail:
                'Scholar Sidekick found retracted paper(s) in your bibliography. Remove or replace before submission.',
              severity: 'fail',
            });
          }
          if (s.mismatch && s.mismatch > 0) {
            sidekickChecks.push({
              id: 'sidekick_mismatch',
              category: 'Citation integrity',
              title: `${s.mismatch} citation(s) may be fabricated`,
              detail:
                'Title/metadata does not match the DOI record (common AI fabrication pattern). Verify each flagged reference.',
              severity: 'fail',
            });
          }
          if (s.matched && s.matched > 0 && !(s.mismatch || s.retracted)) {
            sidekickChecks.push({
              id: 'sidekick_ok',
              category: 'Citation integrity',
              title: `${s.matched} reference(s) verified`,
              detail: 'Scholar Sidekick confirmed metadata matches resolved identifiers.',
              severity: 'pass',
            });
          } else if (s.not_found && s.not_found > 0) {
            sidekickChecks.push({
              id: 'sidekick_not_found',
              category: 'Citation integrity',
              title: `${s.not_found} reference(s) could not be resolved`,
              detail: 'Add a DOI or PMID so integrity checks can run.',
              severity: 'warn',
            });
          }
        }
      }
    } catch {
      /* Sidekick optional */
    }

    try {
      const url = docId
        ? `${apiBase}/writing/documents/${docId}/analyze`
        : `${apiBase}/writing/analyze`;
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          draft,
          bibliography: bibliography || liveBibliography,
          citationCount: citations.length,
          enrichWithAi,
          citationAudit: citeAudit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      const serverAnalysis = data.analysis as DraftAnalysisResult;
      // Merge local integrity issues if server omitted them
      const mergedChecks = [
        ...(serverAnalysis.checks || []),
        ...citeAudit.issues
          .filter((i) => i.severity !== 'pass')
          .filter((i) => !(serverAnalysis.checks || []).some((c) => c.id === `cite_audit_${i.id}`))
          .map((i) => ({
            id: `cite_audit_${i.id}`,
            category: 'Citation integrity',
            title: i.title,
            detail: i.detail,
            severity: i.severity,
          })),
        ...sidekickChecks.filter(
          (c) => !(serverAnalysis.checks || []).some((x) => x.id === c.id)
        ),
      ];
      setAnalysis({ ...serverAnalysis, checks: mergedChecks });
    } catch (e: unknown) {
      const local = analyzeWritingDraft(draft, {
        citationCount: citations.length,
        bibliography: bibliography || liveBibliography,
        citationAuditIssues: citeAudit.issues,
      });
      setAnalysis({
        ...local,
        checks: [...(local.checks || []), ...sidekickChecks],
      });
      setMessage((e as Error).message || 'Used local checklist (server analysis unavailable).');
    } finally {
      setAnalyzing(false);
    }
  };

  const exportViaSidekick = async (
    format:
      | 'bibtex'
      | 'ris'
      | 'csl-json'
      | 'nbib'
      | 'csv'
      | 'txt'
      | 'endnote-xml'
      | 'refworks'
      | 'rdf'
  ) => {
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    const orderedIds = extractCiteIdsOrdered(fullText);
    const allRefs = [...citations, ...library];
    const papers = (orderedIds.length
      ? orderedIds.map((id) => allRefs.find((r) => r.paperId === id || r.id === id)).filter(Boolean)
      : allRefs
    ).map((c) => ({
      id: c!.paperId || c!.id,
      paperId: c!.paperId || c!.id,
      title: c!.title,
      authors: c!.authors || [],
      year: c!.year,
      journal: c!.journal,
      volume: c!.volume,
      issue: c!.issue,
      pages: c!.pages,
      doi: c!.doi,
      url: c!.url,
    }));

    if (!papers.length) {
      setError('No references to export. Cite papers first.');
      return;
    }

    const extMap: Record<string, string> = {
      bibtex: 'bib',
      ris: 'ris',
      'csl-json': 'json',
      nbib: 'nbib',
      csv: 'csv',
      txt: 'txt',
      'endnote-xml': 'xml',
      refworks: 'txt',
      rdf: 'rdf',
    };
    const mimeMap: Record<string, string> = {
      bibtex: 'application/x-bibtex',
      ris: 'application/x-research-info-systems',
      'csl-json': 'application/json',
      nbib: 'application/nbib',
      csv: 'text/csv',
      txt: 'text/plain',
      'endnote-xml': 'application/xml',
      refworks: 'text/plain',
      rdf: 'application/rdf+xml',
    };

    try {
      const res = await fetch(`${apiBase}/research/sidekick/export`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          format,
          style: draft.citationStyle?.toLowerCase() || 'apa',
          paperIds: papers.map((p) => p.paperId).filter(Boolean),
          papers,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.content) throw new Error(data.error || 'Export failed');
      const blob = new Blob([data.content], {
        type: mimeMap[format] || 'text/plain',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(draft.title || 'manuscript').replace(/[^\w\s-]/g, '').slice(0, 60)}.${extMap[format] || 'txt'}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage(
        `Downloaded ${format} via Scholar Sidekick (${data.provider || 'sidekick'})`
      );
    } catch (e: unknown) {
      if (format === 'bibtex') {
        downloadWritingBibtex(draft, allRefs, orderedIds);
        setMessage('Downloaded local BibTeX (Sidekick unavailable)');
      } else {
        setError((e as Error).message || `${format} export failed`);
      }
    }
  };

  const exportSlidesFromDraft = async () => {
    setSlidesExporting(true);
    setError(null);
    setShowExportMenu(false);
    try {
      const context = draft.sections
        .map((s) => {
          const meta = template.sections.find((t) => t.id === s.sectionId);
          const body = (s.content || '').trim();
          if (!body) return '';
          return `## ${meta?.title || s.sectionId}\n${body}`;
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 12000);
      const topic = (draft.title || 'Research presentation').slice(0, 200);
      const res = await fetch(`${apiBase}/presentations/ai/generate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic,
          context: context || `Manuscript sections for: ${topic}`,
          slides: 8,
          theme: 'research-professional',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Slide export failed');
      const slides =
        data.presentation?.slides ||
        data.presentation?.presentation?.slides ||
        data.result?.presentation?.slides ||
        [];
      setSlidesPreview(Array.isArray(slides) ? slides : []);
      setMessage(
        Array.isArray(slides) && slides.length
          ? `Generated ${slides.length} slides from this manuscript.`
          : 'Slides generated — open the preview below.'
      );
    } catch (e: unknown) {
      setError((e as Error).message || 'Could not export slides');
    } finally {
      setSlidesExporting(false);
    }
  };

  const sectionContent = activeSection ? getSectionContent(draft, activeSection.id) : '';

  const sectionIndex = Math.max(
    0,
    template.sections.findIndex((s) => s.id === (activeSection?.id || sectionId))
  );
  const isFirstSection = sectionIndex <= 0;
  const isLastSection = sectionIndex >= template.sections.length - 1;

  const goToSection = (dir: -1 | 1) => {
    const next = template.sections[sectionIndex + dir];
    if (next) goStudio(pathForEditor(next.id, drawer));
  };

  const nextEmptySection = () => {
    const empty = template.sections.find((s) => {
      if (s.id === 'references') return !(bibliography || liveBibliography)?.trim();
      return !getSectionContent(draft, s.id).trim();
    });
    if (empty) goStudio(pathForEditor(empty.id, drawer));
  };

  const openDrawer = (id: StudioDrawer) => {
    goStudio(pathForEditor(sectionId, id));
  };

  const closeDrawer = () => {
    goStudio(pathForEditor(sectionId, null));
  };

  const openTool = (tool: 'generate' | 'library') => {
    goStudio(studioToolPath(tool));
  };

  const closeOverlay = () => {
    setOverlay(null);
    if (studioRoute?.view === 'tool') goStudio(studioDeskPath());
  };

  const liveCiteAudit = useMemo(() => {
    const fullText = draft.sections
      .filter((s) => s.sectionId !== 'references')
      .map((s) => s.content || '')
      .join('\n');
    return auditManuscriptCitations({
      fullText,
      citations: [
        ...citations,
        ...library.filter(
          (l) => !citations.some((c) => c.id === l.id || (c.doi && c.doi === l.doi))
        ),
      ],
    });
  }, [draft.sections, citations, library]);

  // ——— List ———
  if (mode === 'list') {
    return (
      <StudioShell>
        <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-4 sm:px-6">
          <PageHeader
            title="Writing studio"
            accent="teal"
            icon={<DocumentTextIcon />}
            subtitle="Draft manuscripts, cite as you write, check readiness, and export — grounded in your lab work."
            actions={
              <>
                <button
                  type="button"
                  onClick={() => openTool('generate')}
                  className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white/90 px-3.5 py-2 text-[13px] font-medium text-teal-900 transition-colors hover:bg-teal-50"
                >
                  <LightBulbIcon className="h-4 w-4" />
                  Start from research
                </button>
                <button
                  type="button"
                  onClick={() => goStudio(studioNewPath())}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <PlusIcon className="h-4 w-4" />
                  New manuscript
                </button>
              </>
            }
          />

          {error ? <p className="ws-alert ws-alert-error">{error}</p> : null}
          {message ? <p className="ws-alert ws-alert-ok">{message}</p> : null}

          <PagePanel
            accent="teal"
            title="Your manuscripts"
            action={
              <span className="text-[12px] font-medium text-slate-500">
                {docs.length} draft{docs.length === 1 ? '' : 's'}
              </span>
            }
            className="!p-0 overflow-hidden"
          >
            {loading ? (
              <p className="px-5 py-8 text-[13px] text-slate-500">Loading drafts…</p>
            ) : docs.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-semibold text-slate-900">No manuscripts yet</p>
                <p className="mt-1 text-[13px] text-slate-500">
                  Start a blank draft or seed one from research.
                </p>
                <button
                  type="button"
                  onClick={() => goStudio(studioNewPath())}
                  className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-slate-800"
                >
                  New manuscript
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((d, idx) => {
                  const pct = draftCompletion(
                    d.content || emptyWritingDraft(d.templateId)
                  ).percent;
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-teal-50/40 sm:px-5"
                    >
                      <button
                        type="button"
                        onClick={() => void openDoc(d.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="w-6 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-slate-900">
                            {d.title || 'Untitled draft'}
                          </p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {DOC_TYPE_LABELS[d.docType] || d.docType}
                            {d.isShared ? ` · Shared (${d.myRole || 'collaborator'})` : ''}
                            {d.updatedAt
                              ? ` · ${new Date(d.updatedAt).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                        <div className="ws-progress" title={`${pct}%`}>
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openDoc(d.id, undefined, { panel: 'view' })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-teal-900 transition-colors hover:bg-teal-50"
                          aria-label={`View ${d.title || 'draft'}`}
                        >
                          <EyeIcon className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void openDoc(d.id)}
                          className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
                          aria-label={`Open ${d.title || 'draft'}`}
                        >
                          Open
                        </button>
                        {!d.isShared ? (
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Delete draft"
                            onClick={() => void deleteDoc(d.id)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </PagePanel>
        </div>
        {overlay ? (
          <WritingStudioOverlay
            kind={overlay}
            claimSeed={claimSeed}
            onClose={() => {
              closeOverlay();
              setClaimSeed('');
            }}
            onPaperAttached={(paper) => void attachAndCitePaper(paper)}
          />
        ) : null}
      </StudioShell>
    );
  }

  // ——— Template picker ———
  if (mode === 'pick') {
    return (
      <StudioShell>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 sm:px-6">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900"
            onClick={() => goStudio(studioDeskPath())}
          >
            ← Back to desk
          </button>
          <PageHeader
            title="What are you writing?"
            accent="teal"
            icon={<DocumentTextIcon />}
            subtitle="Pick a document type, then a template with the right sections."
          />

          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => goStudio(studioNewPath(t))}
                className={`ws-type-chip ${pickType === t ? 'is-active' : ''}`}
              >
                {DOC_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <PagePanel accent="teal" className="!p-0 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {filteredTemplates.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => startFromTemplate(t.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-teal-50/50 sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="text-[15px] font-semibold text-slate-900">{t.name}</p>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                        {t.description}
                      </p>
                      <p className="mt-1.5 text-[12px] font-medium text-teal-800">
                        {(t as WritingTemplate).sections?.length || (t as any).sectionCount || 0}{' '}
                        sections
                        {t.wordLimit ? ` · ~${t.wordLimit} words` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-slate-900">
                      Begin →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PagePanel>
        </div>
      </StudioShell>
    );
  }

  // ——— Guided editor ———
  const progressLabel = `${sectionIndex + 1} of ${template.sections.length}`;

  const drawerToTab = (d: StudioDrawer): StudioWorkspaceTab | null => {
    if (d === 'sources') return 'cite';
    if (d === 'analyze') return 'review';
    if (d === 'share') return 'share';
    if (d === 'view') return 'preview';
    return null;
  };
  const tabToDrawer = (t: StudioWorkspaceTab): StudioDrawer => {
    if (t === 'cite') return 'sources';
    if (t === 'review') return 'analyze';
    if (t === 'preview') return 'view';
    return 'share';
  };
  const workspaceTab = drawerToTab(drawer);
  const previewMode = drawer === 'view';
  const setWorkspaceTab = (tab: StudioWorkspaceTab | null) => {
    setShowExportMenu(false);
    setShowMoreMenu(false);
    if (!tab) {
      openDrawer(null);
      return;
    }
    openDrawer(tabToDrawer(tab));
  };

  const citePool = [
    ...citations,
    ...library.filter(
      (l) => !citations.some((c) => c.id === l.id || (c.doi && c.doi === l.doi))
    ),
  ];

  const severityClass = (s: string) => {
    if (s === 'pass') return 'border-emerald-200 bg-emerald-50/80 text-emerald-900';
    if (s === 'warn') return 'border-amber-200 bg-amber-50/80 text-amber-950';
    if (s === 'fail') return 'border-rose-200 bg-rose-50/80 text-rose-900';
    return 'border-[var(--ws-rule)] bg-[var(--ws-folio)] text-[var(--ws-ink-soft)]';
  };

  const refsPanel = (
    <div className="ws-sources">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="ws-kicker">Sources</p>
          <p className="mt-1 text-[12px] text-[var(--ws-ink-soft)]">
            {citations.length} in this draft
          </p>
        </div>
        <button
          type="button"
          onClick={() => openFindSources(false)}
          className="text-[11px] font-semibold text-[var(--ws-cobalt)] hover:underline"
        >
          Find papers
        </button>
      </div>

      {liveCiteAudit.missingIds.length || liveCiteAudit.unusedIds.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-950">
          {liveCiteAudit.missingIds.length ? (
            <p>
              {liveCiteAudit.missingIds.length} cite(s) missing from library — markers show in rose.
            </p>
          ) : null}
          {liveCiteAudit.unusedIds.length ? (
            <p className={liveCiteAudit.missingIds.length ? 'mt-0.5' : ''}>
              {liveCiteAudit.unusedIds.length} attached ref(s) unused in text.
            </p>
          ) : null}
        </div>
      ) : liveCiteAudit.citedIds.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-[11px] text-emerald-900">
          {liveCiteAudit.citedIds.length} unique cite(s) · all resolve ·{' '}
          {liveCiteAudit.clusterCount} marker(s)
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={doiQuery}
          onChange={(e) => setDoiQuery(e.target.value)}
          placeholder="DOI, PubMed / doi.org link, or paper title…"
          className="ws-sources-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addFromDoi();
          }}
        />
        <button
          type="button"
          className="ws-btn ws-btn-ink shrink-0"
          disabled={doiLoading}
          onClick={() => void addFromDoi()}
        >
          {doiLoading ? '…' : 'Add'}
        </button>
      </div>
      <p className="text-[10px] leading-snug text-[var(--ws-ink-soft)]">
        Prefer a DOI (<span className="font-mono">10.…</span>) or doi.org / PubMed link. Plain
        publisher URLs without a DOI are rejected so we don’t import the wrong paper.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ws-btn ws-btn-ghost"
          disabled={doiLoading}
          onClick={() => void searchLiterature()}
        >
          Search
        </button>
        <button
          type="button"
          className="ws-btn ws-btn-ghost"
          onClick={() => openFindSources(true)}
        >
          Check claim
        </button>
        <button
          type="button"
          className="ws-btn ws-btn-ghost"
          disabled={aiLoading}
          onClick={() => void runAssist('citations')}
        >
          Suggest
        </button>
      </div>

      {searchHits.length > 0 ? (
        <ul className="mb-3 max-h-28 space-y-1 overflow-y-auto rounded-xl bg-[rgba(11,28,44,0.04)] p-2 text-[12px]">
          {searchHits.slice(0, 8).map((h, i) => (
            <li key={`${h.doi || h.title}-${i}`} className="flex gap-2">
              <span className="min-w-0 flex-1 line-clamp-2 text-[var(--ws-ink-soft)]">
                {h.title}
              </span>
              <button
                type="button"
                className="ws-source-link shrink-0"
                onClick={() => void addFromDoi(h.doi || h.title)}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mb-3 text-[12px] text-[var(--ws-ink-soft)]">
        <summary className="cursor-pointer font-medium text-[var(--ws-ink)]">
          Import BibTeX / manual
        </summary>
        <textarea
          value={bibtex}
          onChange={(e) => setBibtex(e.target.value)}
          rows={3}
          placeholder="Paste BibTeX…"
          className="ws-form-input mt-2 font-mono text-[11px]!"
        />
        <button type="button" className="ws-btn ws-btn-line mt-2" onClick={() => void importBibtex()}>
          Import BibTeX
        </button>
        <div className="mt-2 space-y-1">
          <input
            value={manualCite.title}
            onChange={(e) => setManualCite((m) => ({ ...m, title: e.target.value }))}
            placeholder="Title"
            className="ws-form-input"
          />
          <input
            value={manualCite.authors}
            onChange={(e) => setManualCite((m) => ({ ...m, authors: e.target.value }))}
            placeholder="Authors"
            className="ws-form-input"
          />
          <button
            type="button"
            className="ws-btn ws-btn-line mt-1"
            onClick={() => void addManualCitation()}
          >
            Add reference
          </button>
        </div>
      </details>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto text-[12px]">
        {citations.map((c, idx) => {
          const ikey = c.paperId || c.id;
          const integ = citeIntegrity[ikey];
          return (
          <li key={c.id} className="ws-source-card">
            <p className="font-medium text-[var(--ws-ink)] line-clamp-2">{c.title}</p>
            <p className="text-[var(--ws-ink-soft)]">
              {formatInText(c, draft.citationStyle, idx)}
              {c.year ? ` · ${c.year}` : ''}
            </p>
            {integ ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {integ.verifyVerdict === 'matched' ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Verified</span>
                ) : null}
                {integ.verifyVerdict === 'mismatch' ? (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Fabrication risk</span>
                ) : null}
                {integ.isRetracted ? (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Retracted</span>
                ) : null}
                {integ.hasConcern ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Concern</span>
                ) : null}
                {integ.isOa ? (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
                    OA{integ.oaStatus ? ` · ${integ.oaStatus}` : ''}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              <button
                type="button"
                className="ws-source-link"
                onClick={() => citeIntoActiveSection(c)}
              >
                Cite here
              </button>
              {integ?.oaUrl ? (
                <a
                  href={integ.oaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ws-source-link"
                >
                  OA PDF
                </a>
              ) : null}
              <button
                type="button"
                className="ws-source-link"
                onClick={() => {
                  setSourceNoteId(c.writingCitationId || c.id);
                  setSourceNote(c.sourceText || c.abstract || '');
                }}
              >
                Source notes
              </button>
              <label className="ws-source-link cursor-pointer">
                PDF
                <input
                  type="file"
                  accept=".pdf,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPdf(c.writingCitationId || c.paperId || c.id, f);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="ws-source-link text-rose-700"
                onClick={() => void removeCitationFromDraft(c)}
              >
                Remove
              </button>
            </div>
            {sourceNoteId === c.id ||
            sourceNoteId === c.writingCitationId ||
            sourceNoteId === c.paperId ? (
              <div className="mt-2 space-y-1">
                <textarea
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  rows={3}
                  className="ws-form-input"
                  placeholder="Paste key lines for grounded continue…"
                />
                <button
                  type="button"
                  className="ws-btn ws-btn-line"
                  onClick={() =>
                    void saveSourceNote(c.writingCitationId || c.paperId || c.id)
                  }
                >
                  Save notes
                </button>
              </div>
            ) : null}
          </li>
          );
        })}
        {citations.length === 0 ? (
          <li className="ws-empty px-3 py-6 text-[12px] text-[var(--ws-ink-soft)]">
            Add papers here, then Cite while writing.
          </li>
        ) : null}
      </ul>

      {library.filter(
        (l) =>
          !citations.some(
            (c) =>
              c.id === l.id ||
              (c.paperId && l.paperId && c.paperId === l.paperId) ||
              (c.doi && l.doi && c.doi === l.doi)
          )
      ).length > 0 ? (
        <div className="mt-3 border-t border-[var(--ws-rule)] pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ws-ink-soft)]">
            From your library
          </p>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto text-[11px]">
            {library
              .filter(
                (l) =>
                  !citations.some(
                    (c) =>
                      c.id === l.id ||
                      (c.paperId && l.paperId && c.paperId === l.paperId) ||
                      (c.doi && l.doi && c.doi === l.doi)
                  )
              )
              .slice(0, 20)
              .map((c) => (
              <li key={c.paperId || c.id} className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-[var(--ws-ink-soft)]">{c.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="ws-source-link font-semibold"
                    onClick={() => void attachFromLibrary(c, true)}
                    title="Add to this draft and insert citation at cursor"
                  >
                    Cite
                  </button>
                  <button
                    type="button"
                    className="ws-source-link text-rose-700"
                    onClick={() => void removeCitationFromLibrary(c)}
                    title="Remove from your library"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bibliography ? (
        <div className="mt-3 border-t border-[var(--ws-rule)] pt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ws-ink-soft)]">
            Live bibliography
          </p>
          <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[rgba(11,28,44,0.04)] p-2 text-[10px] text-[var(--ws-ink)]">
            {bibliography}
          </pre>
        </div>
      ) : null}
    </div>
  );

  const exportMenu = (
    <div className="ws-sb-export-menu">
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { downloadWritingPdf(draft, bibliography, { renderedSections: buildRenderedSectionsForExport() }); setShowExportMenu(false); }}>PDF</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { downloadWritingDoc(draft, bibliography, { renderedSections: buildRenderedSectionsForExport() }); setShowExportMenu(false); }}>Word (.doc)</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { const rendered = buildRenderedSectionsForExport(); const renderedDraft = { ...draft, sections: template.sections.map((s) => ({ sectionId: s.id, content: rendered[s.id] || getSectionContent(draft, s.id) })) }; downloadWritingMarkdown(renderedDraft, draftToMarkdown(renderedDraft)); setShowExportMenu(false); }}>Markdown</button>
      <div className="my-1 border-t border-[var(--ws-rule)]" />
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ws-ink-soft)]">References (Sidekick)</p>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('bibtex'); setShowExportMenu(false); }}>BibTeX (.bib)</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('ris'); setShowExportMenu(false); }}>RIS (Zotero / Mendeley)</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('endnote-xml'); setShowExportMenu(false); }}>EndNote XML</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('nbib'); setShowExportMenu(false); }}>MEDLINE / NBIB</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('csl-json'); setShowExportMenu(false); }}>CSL-JSON</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('csv'); setShowExportMenu(false); }}>CSV</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void exportViaSidekick('txt'); setShowExportMenu(false); }}>Plain text (styled)</button>
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => { void copyMarkdown(); setShowExportMenu(false); }}>Copy markdown</button>
      <div className="my-1 border-t border-[var(--ws-rule)]" />
      <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" onClick={() => void exportSlidesFromDraft()}>Slides</button>
      {!sectionReadOnly ? (
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[var(--ws-folio)]" disabled={aiLoading} onClick={() => { void runAssist('full'); setShowExportMenu(false); }}>Draft empty sections</button>
      ) : null}
    </div>
  );

  const sidebarPanelBody = (
    <div className="ws-sb-compact space-y-3 text-[12px]">
      {workspaceTab === 'cite' ? refsPanel : null}
      {workspaceTab === 'review' ? (
        analysis ? (
          <div className="space-y-3">
            <p className="ws-kicker">Readiness</p>
            <p className="text-[13px] font-semibold text-[var(--ws-ink)]">Score {analysis.score} · {analysis.readiness.replace(/_/g, ' ')}</p>
            <p className="text-[12px] text-[var(--ws-ink-soft)]">{analysis.summary}</p>
            <button type="button" className="ws-btn ws-btn-line" disabled={analyzing} onClick={() => void runAnalyze(true)}>{analyzing ? 'Checking…' : 'Re-check with AI'}</button>
            <ul className="space-y-2">
              {(analysis.checks || []).slice(0, 12).map((c) => (
                <li key={c.id} className={`rounded-lg border px-2.5 py-2 ${severityClass(c.severity)}`}>
                  <p className="text-[11px] font-semibold">{c.title}</p>
                  <p className="mt-0.5 text-[11px] opacity-90">{c.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="ws-kicker">Readiness</p>
            <p className="text-[12px] text-[var(--ws-ink-soft)]">Run a pre-submission check for structure, citations, and length.</p>
            <button type="button" className="ws-btn ws-btn-ink" disabled={analyzing} onClick={() => void runAnalyze(false)}>{analyzing ? 'Checking…' : 'Run readiness check'}</button>
          </div>
        )
      ) : null}
      {workspaceTab === 'share' ? (
        docId ? (
          <p className="sr-only">Co-author panel below</p>
        ) : (
          <p className="text-[12px] text-[var(--ws-ink-soft)]">
            Save the manuscript once to invite co-authors.
          </p>
        )
      ) : null}
      {docId ? (
        <div className={workspaceTab === 'share' ? 'block' : 'hidden'} aria-hidden={workspaceTab !== 'share'}>
          <WriteTogetherPanel
            documentId={docId}
            sections={template.sections.map((s) => ({ id: s.id, title: s.title }))}
            activeSectionId={activeSection?.id || sectionId}
            currentUserId={user?.id}
            embedded
            visible={workspaceTab === 'share'}
            onAccessChange={(a) => setCollabAccess(a)}
            onLocksChange={setSectionLocks}
            onRemoteRevision={handleRemoteRevision}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <StudioShell immersive className="ws-editor-shell">
      <div className="ws-immersive-layout">
        <StudioSidebar
          title={draft.title || 'Untitled manuscript'}
          statusLine={`${progressLabel} · ${words}w · ${completion.percent}% · ${draft.citationStyle}`}
          dirty={dirty}
          saving={saving}
          canSave={!(Boolean(collabAccess) && !collabAccess?.canEdit)}
          previewMode={previewMode}
          activeTab={workspaceTab}
          outlineTree={outlineTree}
          activeSectionId={activeSection?.id || sectionId}
          draft={draft}
          bibliography={bibliography || liveBibliography || ''}
          sectionLocks={sectionLocks}
          currentUserId={user?.id}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onExit={() => { goStudio(studioDeskPath()); void loadDocs(); }}
          onSave={() => void saveDocument(true)}
          onSelectSection={(id) => { if (id === 'title') return; goStudio(pathForEditor(id, null)); }}
          onSetTab={setWorkspaceTab}
          exportMenu={exportMenu}
          showExportMenu={showExportMenu}
          onToggleExport={() => { setShowMoreMenu(false); setShowExportMenu((v) => !v); }}
          panelBody={sidebarPanelBody}
          analyzing={analyzing}
          onRunAnalyze={() => void runAnalyze(false)}
        />

        <div className="ws-immersive-canvas">
          <div className="ws-immersive-mobile-bar">
            <button type="button" className="ws-btn ws-btn-line" onClick={() => setMobileSidebarOpen(true)}>Menu</button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--ws-ink)]">{draft.title || 'Untitled'}</p>
              <p className="truncate text-[11px] text-[var(--ws-ink-soft)]">{progressLabel}</p>
            </div>
            <button type="button" className="ws-btn ws-btn-ink" onClick={() => void saveDocument(true)} disabled={saving || (Boolean(collabAccess) && !collabAccess?.canEdit)}>{saving ? '…' : 'Save'}</button>
          </div>

          {(error || message) && (
            <div className="px-4 pt-3 sm:px-6">
              <p className={`ws-alert ${error ? 'ws-alert-error' : 'ws-alert-ok'}`}>
                {error || message}
                <button type="button" className="ml-2 underline" onClick={() => { setError(null); setMessage(null); }}>Dismiss</button>
              </p>
            </div>
          )}

          <div className="ws-immersive-canvas-scroll">
            {previewMode ? (
              <ManuscriptPreview
                draft={draft}
                template={template}
                citations={citePool}
                bibliography={bibliography || liveBibliography || ''}
                onEditSection={(id) => goStudio(pathForEditor(id, null))}
                onClose={() => openDrawer(null)}
              />
            ) : (
              <>
                <div className="mb-6">
                  <input
                    value={draft.title}
                    onChange={(e) => markDirty((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Manuscript title"
                    className="ws-display w-full border-0 border-b border-[var(--ws-rule-strong)] bg-transparent px-1 py-2.5 text-[1.75rem] font-semibold leading-tight text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-soft)]/40 focus:border-[var(--ws-cobalt)] focus:outline-none sm:text-3xl"
                    disabled={Boolean(collabAccess) && !collabAccess?.canEdit}
                  />
                  <input
                    value={draft.subtitle || ''}
                    onChange={(e) => markDirty((d) => ({ ...d, subtitle: e.target.value }))}
                    placeholder="Subtitle (optional)"
                    className="w-full border-0 bg-transparent px-1 py-1 text-[15px] italic text-[var(--ws-ink-soft)] placeholder:text-[var(--ws-ink-soft)]/40 focus:outline-none focus:text-[var(--ws-ink)]"
                    disabled={Boolean(collabAccess) && !collabAccess?.canEdit}
                  />
                </div>

                {activeSection ? (
                  <div className="ws-writing-surface space-y-4">
                    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-1">
                      <div className="min-w-0">
                        <h2 className="ws-display text-xl font-semibold text-[var(--ws-ink)] sm:text-2xl">
                          {(() => {
                            const node = outlineTree
                              .flatMap(function flatten(n: OutlineNode): OutlineNode[] {
                                return [n, ...n.children.flatMap(flatten)];
                              })
                              .find((n) => n.section.id === activeSection.id);
                            return node?.displayTitle || activeSection.title;
                          })()}
                        </h2>
                        {activeSection.description ? (
                          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">{activeSection.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-[12px] text-[var(--ws-ink-soft)]">
                        {activeSection.suggestedWords ? <span>~{activeSection.suggestedWords} words</span> : null}
                        {!sectionReadOnly && (activeSection.level ?? 1) === 1 && !activeSection.parentId && activeSection.id !== 'references' && activeSection.id !== 'title' ? (
                          <button
                            type="button"
                            className="font-semibold text-[var(--ws-cobalt)] hover:underline"
                            onClick={() => {
                              const title = window.prompt('Subsection title', 'New subsection');
                              if (!title?.trim()) return;
                              const result = addSubsection(draft, template, activeSection.id, title.trim());
                              if (!result.newId) return;
                              markDirty(() => result.draft);
                              goStudio(pathForEditor(result.newId, null));
                              setMessage(`Added subsection “${title.trim()}”`);
                            }}
                          >
                            Add subsection
                          </button>
                        ) : null}
                        {!sectionReadOnly &&
                        (draft.customSections || []).some((s) => s.id === activeSection.id) ? (
                          <button
                            type="button"
                            className="font-semibold text-rose-700 hover:underline"
                            onClick={() => {
                              const hasText = Boolean(
                                getSectionContent(draft, activeSection.id).trim()
                              );
                              const ok = window.confirm(
                                hasText
                                  ? `Remove subsection “${activeSection.title}” and its text?`
                                  : `Remove subsection “${activeSection.title}”?`
                              );
                              if (!ok) return;
                              const result = removeSubsection(draft, activeSection.id);
                              if (!result.removed) return;
                              markDirty(() => result.draft);
                              goStudio(
                                pathForEditor(result.parentId || 'introduction', null)
                              );
                              setMessage(`Removed subsection “${activeSection.title}”`);
                            }}
                          >
                            Remove subsection
                          </button>
                        ) : null}
                      </div>
                    </header>

                    {sectionReadOnly ? (
                      <p className="mb-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[13px] text-amber-950">
                        {!canEditActiveSection ? 'View-only for this section.' : `${foreignLock?.displayName || 'Another author'} is writing here.`}
                      </p>
                    ) : null}

                    {activeSection.id === 'references' ? (
                      <div className="space-y-5">
                        <details className="ws-refs-details group">
                          <summary className="ws-refs-details-summary">
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ws-ink-soft)]">
                                Manuscript & style
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[var(--ws-ink)]">
                                <span className="font-semibold">{draft.citationStyle}</span>
                                {draft.targetVenue ? (
                                  <>
                                    <span className="text-[var(--ws-ink-soft)]">·</span>
                                    <span className="truncate text-[var(--ws-ink-soft)]">
                                      {draft.targetVenue}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-[var(--ws-ink-soft)]">·</span>
                                    <span className="text-[var(--ws-ink-soft)]">No venue set</span>
                                  </>
                                )}
                                {(draft.keywords || []).length > 0 ? (
                                  <>
                                    <span className="text-[var(--ws-ink-soft)]">·</span>
                                    <span className="text-[var(--ws-ink-soft)]">
                                      {(draft.keywords || []).length} keyword
                                      {(draft.keywords || []).length === 1 ? '' : 's'}
                                    </span>
                                  </>
                                ) : null}
                              </span>
                            </span>
                            <span className="ws-refs-details-cta shrink-0">
                              <span className="group-open:hidden">Edit</span>
                              <span className="hidden group-open:inline">Done</span>
                            </span>
                          </summary>
                          <div className="ws-refs-details-body">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="ws-form-label sm:col-span-2">
                                Journal / venue preset
                                <select
                                  value={draft.journalPresetId || ''}
                                  onChange={(e) => {
                                    const preset = getJournalPreset(e.target.value);
                                    if (!preset) {
                                      markDirty((d) => ({ ...d, journalPresetId: undefined }));
                                      return;
                                    }
                                    const applied = applyJournalPreset(preset, draft.targetVenue);
                                    markDirty((d) => ({
                                      ...d,
                                      targetVenue: applied.targetVenue,
                                      citationStyle: applied.citationStyle,
                                      journalPresetId: applied.journalPresetId,
                                      wordLimitHint: applied.wordLimitHint,
                                      abstractLimitHint: applied.abstractLimitHint,
                                      numberingPolicy: applied.numberingPolicy,
                                    }));
                                  }}
                                  className="ws-form-input"
                                  disabled={sectionReadOnly}
                                >
                                  <option value="">Choose a venue preset…</option>
                                  {JOURNAL_PRESETS.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="ws-form-label">
                                Citation style
                                <select
                                  value={draft.citationStyle}
                                  onChange={(e) =>
                                    markDirty((d) => ({
                                      ...d,
                                      citationStyle: e.target.value as CitationStyle,
                                    }))
                                  }
                                  className="ws-form-input"
                                  disabled={sectionReadOnly}
                                >
                                  {CITATION_STYLES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="ws-form-label">
                                Section numbering
                                <select
                                  value={draft.numberingPolicy || template.numberingPolicy || 'none'}
                                  onChange={(e) =>
                                    markDirty((d) => ({
                                      ...d,
                                      numberingPolicy: e.target.value as 'none' | 'decimal',
                                    }))
                                  }
                                  className="ws-form-input"
                                  disabled={sectionReadOnly}
                                >
                                  <option value="none">Unnumbered</option>
                                  <option value="decimal">Decimal (1, 1.1…)</option>
                                </select>
                              </label>
                              <label className="ws-form-label sm:col-span-2">
                                Target journal / funder
                                <input
                                  value={draft.targetVenue}
                                  onChange={(e) =>
                                    markDirty((d) => ({ ...d, targetVenue: e.target.value }))
                                  }
                                  className="ws-form-input"
                                  disabled={sectionReadOnly}
                                />
                              </label>
                              <label className="ws-form-label sm:col-span-2">
                                Research question
                                <input
                                  value={draft.researchQuestion}
                                  onChange={(e) =>
                                    markDirty((d) => ({ ...d, researchQuestion: e.target.value }))
                                  }
                                  className="ws-form-input"
                                  disabled={sectionReadOnly}
                                />
                              </label>
                              <label className="ws-form-label sm:col-span-2">
                                Keywords
                                <input
                                  value={(draft.keywords || []).join('; ')}
                                  onChange={(e) =>
                                    markDirty((d) => ({
                                      ...d,
                                      keywords: e.target.value
                                        .split(/[;,\n]+/)
                                        .map((k) => k.trim())
                                        .filter(Boolean),
                                    }))
                                  }
                                  className="ws-form-input"
                                  placeholder="keyword1; keyword2"
                                  disabled={sectionReadOnly}
                                />
                              </label>
                            </div>
                            <p className="mt-2 text-[11px] text-[var(--ws-ink-soft)]">{template.name}</p>
                          </div>
                        </details>

                        <div className="space-y-2">
                          <p className="ws-kicker">Bibliography</p>
                          {(bibliography || liveBibliography)?.trim() ? (
                            <pre className="ws-biblio">{bibliography || liveBibliography}</pre>
                          ) : (
                            <div className="ws-empty text-[14px] text-[var(--ws-ink-soft)]">
                              Citations you insert while writing appear here automatically (
                              {draft.citationStyle}).
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <CiteSectionEditor
                        ref={citeEditorRef}
                        value={getSectionContent(draft, activeSection.id)}
                        onChange={(next) => markDirty((d) => setSectionContent(d, activeSection.id, next))}
                        placeholder={activeSection.placeholder}
                        readOnly={sectionReadOnly}
                        citations={citePool}
                        citationStyle={draft.citationStyle}
                        onOpenRefs={() => setWorkspaceTab('cite')}
                        onAssistSection={() => void runAssist('section')}
                        onContinueGrounded={() => void runAssist('continue')}
                        onCitationStyleChange={(style) => markDirty((d) => ({ ...d, citationStyle: style }))}
                        onCiteSuggestedPaper={(paper) => void attachAndCitePaper(paper)}
                      />
                    )}
                  </div>
                ) : null}

                <div className="ws-footer-nav mt-8">
                  <button type="button" className="ws-btn ws-btn-line" disabled={sectionIndex <= 0} onClick={() => goToSection(-1)}>← Previous</button>
                  <p className="text-[12px] text-[var(--ws-ink-soft)]">{progressLabel}</p>
                  <button type="button" className="ws-btn ws-btn-cobalt" disabled={isLastSection} onClick={() => goToSection(1)}>Next →</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {overlay ? (
        <WritingStudioOverlay
          kind={overlay}
          claimSeed={claimSeed}
          onClose={() => {
            closeOverlay();
            setClaimSeed('');
          }}
          onPaperAttached={(paper) => void attachAndCitePaper(paper)}
        />
      ) : null}
      {slidesPreview ? (
        <div className="ws-overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="ws-overlay-panel max-h-[85vh] w-full max-w-2xl">
            <div className="ws-overlay-header flex items-center justify-between px-5 py-4">
              <div>
                <p className="ws-kicker">Export outcome</p>
                <h3 className="ws-display mt-1 text-xl font-semibold text-[var(--ws-ink)]">
                  Slides from this draft
                </h3>
              </div>
              <button
                type="button"
                className="ws-btn ws-btn-ghost"
                onClick={() => setSlidesPreview(null)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {slidesPreview.length === 0 ? (
                <p className="text-[13px] text-[var(--ws-ink-soft)]">No slide content returned.</p>
              ) : (
                slidesPreview.map((slide, i) => (
                  <div
                    key={slide.number || slide.title || i}
                    className="ws-folio-quiet px-4 py-3"
                  >
                    <p className="ws-folio-num">
                      Slide {slide.number ?? i + 1}
                    </p>
                    <p className="ws-display mt-0.5 text-lg font-semibold text-[var(--ws-ink)]">
                      {slide.title || 'Untitled'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--ws-ink-soft)]">
                      {slide.content || ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </StudioShell>
  );

};

export default WritingStudioPage;
