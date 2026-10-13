import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeaders, getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  BeakerIcon,
  DocumentTextIcon,
  BookOpenIcon,
  ArrowRightIcon,
  PlusIcon,
  CalendarDaysIcon,
  QuestionMarkCircleIcon,
  NewspaperIcon,
  ChatBubbleLeftRightIcon,
  MapPinIcon,
  BellAlertIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  PencilIcon,
  TrashIcon,
  ChartBarIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { evidenceFromRecordUrl } from '../utils/evidenceChain';
import { DASHBOARD_SYNC_EVENT, notifyDashboardSync } from '../utils/dashboardSync';
import DashboardNoteForm, { type DashboardNoteFormValues } from '../components/DashboardNoteForm';
import DashboardReminderForm, {
  type DashboardReminderFormValues,
} from '../components/DashboardReminderForm';
import { PageHeader, PagePanel, PageStat } from '../components/PageHeader';

const API_BASE = resolveApiBaseUrl();

const apiUrl = (path: string) => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p.startsWith('/api/') ? p.slice(4) : p}`;
};

interface PulseEvent {
  id: string;
  title: string;
  type?: string;
  location?: string;
  startDate?: string;
  status?: string;
}

interface PulseForum {
  id: string;
  title: string;
  category?: string;
  urgency?: string;
  responses?: number;
  createdAt?: string;
}

interface PulseNews {
  id: string;
  title: string;
  postType?: string;
  authorName?: string;
  createdAt?: string;
}

interface ReminderItem {
  id: string;
  kind: 'task' | 'event';
  title: string;
  subtitle: string;
  dueAt?: string | null;
  urgency: 'overdue' | 'today' | 'soon' | 'open';
  link: string;
  source: string;
}

interface NoteItem {
  id: string;
  content: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

type HubTab = 'all' | 'reminders' | 'notes';

const POLL_MS = 25000;

const formatShortDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatRelative = (iso?: string) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(iso);
};

const noteColorClass = (color?: string) => {
  switch (color) {
    case 'blue':
      return 'bg-sky-50 border-sky-200/80';
    case 'green':
      return 'bg-emerald-50 border-emerald-200/80';
    case 'pink':
      return 'bg-rose-50 border-rose-200/80';
    case 'purple':
      return 'bg-violet-50 border-violet-200/80';
    default:
      return 'bg-amber-50 border-amber-200/80';
  }
};

const urgencyBadge = (urgency: ReminderItem['urgency']) => {
  switch (urgency) {
    case 'overdue':
      return 'bg-rose-50 text-rose-800 border border-rose-100';
    case 'today':
      return 'bg-amber-50 text-amber-900 border border-amber-100';
    case 'soon':
      return 'bg-sky-50 text-sky-800 border border-sky-100';
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-100';
  }
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [forumItems, setForumItems] = useState<PulseForum[]>([]);
  const [newsItems, setNewsItems] = useState<PulseNews[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [counts, setCounts] = useState({ reminders: 0, notes: 0, overdue: 0 });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>('all');
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [noteFormMode, setNoteFormMode] = useState<'create' | 'edit'>('create');
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [noteFormError, setNoteFormError] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [reminderFormError, setReminderFormError] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const fetchPulse = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const headers = authHeaders();
      const res = await axios.get(apiUrl('/dashboard/pulse'), { headers });
      setReminders(res.data.reminders || []);
      setNotes(res.data.notes || []);
      setCounts({
        reminders: res.data.counts?.reminders ?? 0,
        notes: res.data.counts?.notes ?? 0,
        overdue: res.data.counts?.overdue ?? 0,
      });
      setUpdatedAt(res.data.updatedAt || new Date().toISOString());
    } catch (error) {
      console.error('Dashboard pulse error:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [authHeaders]);

  const fetchCommunity = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [eventsRes, forumRes, newsRes] = await Promise.all([
        axios.get(apiUrl('/research-events'), { headers }).catch(() => null),
        axios.get(apiUrl('/help-forum/requests'), { headers }).catch(() => null),
        axios
          .get(apiUrl('/community-news'), { headers, params: { limit: 4 } })
          .catch(() => null),
      ]);

      const rawEvents: any[] = Array.isArray(eventsRes?.data?.events)
        ? eventsRes.data.events
        : Array.isArray(eventsRes?.data)
          ? eventsRes.data
          : [];
      const now = Date.now();
      setEvents(
        rawEvents
          .filter((e) => {
            if (!e.startDate) return e.status === 'upcoming' || e.status === 'ongoing';
            return new Date(e.startDate).getTime() >= now - 24 * 60 * 60 * 1000;
          })
          .sort(
            (a, b) =>
              new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime()
          )
          .slice(0, 3)
          .map((e) => ({
            id: String(e.id),
            title: e.title,
            type: e.type,
            location: e.location || e.country,
            startDate: e.startDate,
            status: e.status,
          }))
      );

      const rawForum: any[] = Array.isArray(forumRes?.data?.requests)
        ? forumRes.data.requests
        : Array.isArray(forumRes?.data)
          ? forumRes.data
          : [];
      setForumItems(
        [...rawForum]
          .sort(
            (a, b) =>
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          )
          .slice(0, 3)
          .map((r) => ({
            id: String(r.id),
            title: r.title,
            category: r.category,
            urgency: r.urgency,
            responses: Array.isArray(r.responses) ? r.responses.length : Number(r.responses) || 0,
            createdAt: r.createdAt,
          }))
      );

      const rawNews: any[] = Array.isArray(newsRes?.data?.posts)
        ? newsRes.data.posts
        : Array.isArray(newsRes?.data)
          ? newsRes.data
          : [];
      setNewsItems(
        rawNews.slice(0, 3).map((p) => ({
          id: String(p.id),
          title: p.title,
          postType: p.postType,
          authorName: p.authorName,
          createdAt: p.createdAt,
        }))
      );
    } catch (error) {
      console.error('Community pulse error:', error);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchPulse();
    void fetchCommunity();
  }, [fetchPulse, fetchCommunity]);

  // Live updates: poll while visible + sync events from other pages/tabs
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void fetchPulse(true);
      }
    };
    pollRef.current = setInterval(tick, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchPulse(true);
    };
    const onSync = () => void fetchPulse(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'researchlab:dashboard-sync-at') void fetchPulse(true);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(DASHBOARD_SYNC_EVENT, onSync as EventListener);
    window.addEventListener('focus', onSync);
    window.addEventListener('storage', onStorage);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(DASHBOARD_SYNC_EVENT, onSync as EventListener);
      window.removeEventListener('focus', onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [fetchPulse]);

  const openCreateNote = () => {
    setNoteFormMode('create');
    setEditingNote(null);
    setNoteFormError('');
    setNoteFormOpen(true);
  };

  const openCreateReminder = () => {
    setReminderFormError('');
    setReminderFormOpen(true);
  };

  const handleReminderFormSubmit = async (values: DashboardReminderFormValues) => {
    if (!user?.id) {
      setReminderFormError('Sign in to add a reminder.');
      return;
    }
    setSavingReminder(true);
    setReminderFormError('');
    try {
      await axios.post(
        apiUrl('/lab-workspace/tasks'),
        {
          title: values.title,
          description: values.description || undefined,
          due_date: values.due_date || undefined,
          priority: values.priority,
          status: 'to_do',
          assignee_id: user.id,
        },
        { headers: authHeaders() }
      );
      setReminderFormOpen(false);
      notifyDashboardSync('dashboard-reminder');
      await fetchPulse(true);
    } catch (err: any) {
      console.error(err);
      setReminderFormError(
        err?.response?.data?.error ||
          err?.message ||
          'Could not save reminder. Check that you are signed in and have a lab workspace.'
      );
    } finally {
      setSavingReminder(false);
    }
  };

  const openEditNote = (note: NoteItem) => {
    setNoteFormMode('edit');
    setEditingNote(note);
    setNoteFormError('');
    setNoteFormOpen(true);
  };

  const handleNoteFormSubmit = async (values: DashboardNoteFormValues) => {
    setSavingNote(true);
    setNoteFormError('');
    try {
      const headers = authHeaders();
      if (noteFormMode === 'edit' && editingNote) {
        const res = await axios.put(apiUrl(`/quick-notes/${editingNote.id}`), values, {
          headers,
        });
        const updated = res.data;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id
              ? {
                  id: updated.id,
                  content: updated.content,
                  color: updated.color || values.color,
                  createdAt: updated.created_at,
                  updatedAt: updated.updated_at,
                }
              : n
          )
        );
      } else {
        const res = await axios.post(apiUrl('/quick-notes'), values, { headers });
        const created = res.data;
        setNotes((prev) => [
          {
            id: created.id,
            content: created.content,
            color: created.color || values.color,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
          },
          ...prev,
        ]);
        setCounts((c) => ({ ...c, notes: c.notes + 1 }));
      }
      setNoteFormOpen(false);
      setEditingNote(null);
      notifyDashboardSync('dashboard-note');
      await fetchPulse(true);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Could not save note. Check that you are signed in.';
      setNoteFormError(msg);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await axios.delete(apiUrl(`/quick-notes/${id}`), { headers: authHeaders() });
      notifyDashboardSync('dashboard-note-delete');
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setCounts((c) => ({ ...c, notes: Math.max(0, c.notes - 1) }));
      if (editingNote?.id === id) {
        setNoteFormOpen(false);
        setEditingNote(null);
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'Could not delete note');
    }
  };

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const loadDemoChain = async () => {
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      const { data } = await axios.post(
        apiUrl('/onboarding/demo-chain'),
        {},
        { headers: authHeaders() }
      );
      setDemoMessage(data.message || 'Demo chain ready');
      const nextUrl = data?.next?.evidence || evidenceFromRecordUrl({
        protocolId: data?.chain?.protocolId,
        experimentId: data?.chain?.experimentId,
        notebookEntryId: data?.chain?.notebookEntryId,
        evidenceId: data?.chain?.evidenceId,
      });
      navigate(nextUrl);
    } catch (err: any) {
      setDemoMessage(err?.response?.data?.error || 'Could not create demo chain');
    } finally {
      setDemoLoading(false);
    }
  };

  /** Evidence chain shortcuts: protocol → experiment → notebook → evidence → write */
  const quickActions = [
    {
      icon: DocumentTextIcon,
      title: 'Add protocol',
      description: 'Idea → method',
      well: 'from-emerald-500 to-teal-700 shadow-emerald-200/50',
      link: '/experiment-tracker?tab=protocols',
    },
    {
      icon: BeakerIcon,
      title: 'Start experiment',
      description: 'Method → run',
      well: 'from-sky-500 to-sky-700 shadow-sky-200/50',
      link: '/experiment-tracker',
    },
    {
      icon: BookOpenIcon,
      title: 'Open notebook',
      description: 'Run → record',
      well: 'from-slate-600 to-slate-800 shadow-slate-200/50',
      link: '/lab-notebook',
    },
    {
      icon: ChartBarIcon,
      title: 'Create evidence',
      description: 'Record → pack',
      well: 'from-cyan-500 to-sky-700 shadow-cyan-200/50',
      link: evidenceFromRecordUrl({}),
    },
    {
      icon: PencilSquareIcon,
      title: 'Writing studio',
      description: 'Evidence → manuscript',
      well: 'from-teal-600 to-cyan-800 shadow-teal-200/40',
      link: '/writing-studio',
    },
  ];

  const showReminders = hubTab === 'all' || hubTab === 'reminders';
  const showNotes = hubTab === 'all' || hubTab === 'notes';

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={`Welcome back, ${user?.first_name || 'Researcher'}`}
        subtitle="Your RILOS pulse — notes, reminders, and the path from protocol to publication."
        accent="sky"
        icon={<BeakerIcon />}
        actions={
          <button
            type="button"
            onClick={() => void fetchPulse()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PageStat
            label="Overdue"
            value={counts.overdue}
            accent={counts.overdue > 0 ? 'orange' : 'sky'}
          />
          <PageStat label="Reminders" value={counts.reminders} accent="amber" />
          <PageStat label="Notes" value={counts.notes} accent="sky" />
          <PageStat
            label="Updated"
            value={updatedAt ? formatRelative(updatedAt) : '—'}
            accent="teal"
          />
        </div>
      </PageHeader>

      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 py-16 text-center shadow-sm">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
          <p className="mt-4 text-[13px] text-slate-500">Loading dashboard…</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                Notes & reminders
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {counts.overdue > 0 ? `${counts.overdue} overdue · ` : ''}
                Focus on what needs attention next
              </p>
            </div>
            <div
              className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm"
              role="tablist"
              aria-label="Hub filter"
            >
              {(
                [
                  { id: 'all' as const, label: 'All' },
                  { id: 'reminders' as const, label: 'Reminders' },
                  { id: 'notes' as const, label: 'Notes' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={hubTab === tab.id}
                  onClick={() => setHubTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    hubTab === tab.id
                      ? 'bg-sky-700 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              hubTab === 'all' ? 'md:grid-cols-2' : 'md:grid-cols-1'
            }`}
          >
            {showReminders ? (
              <PagePanel
                accent="amber"
                className="min-h-[280px] flex flex-col"
                title={
                  <span className="inline-flex items-center gap-2">
                    <BellAlertIcon className="h-4 w-4 text-amber-700" />
                    Reminders
                  </span>
                }
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreateReminder}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-amber-800"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lab-workspace?section=tasks')}
                      className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-900"
                    >
                      Workspace
                      <ArrowRightIcon className="h-3 w-3" />
                    </button>
                  </div>
                }
              >
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[360px]">
                  {reminders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-amber-200/80 bg-gradient-to-br from-amber-50/50 to-white px-3 py-8 text-center">
                      <p className="text-[13px] text-slate-700">Nothing due right now</p>
                      <p className="mt-1 mb-3 text-[12px] text-slate-400">
                        Add a reminder here — it becomes a task assigned to you
                      </p>
                      <button
                        type="button"
                        onClick={openCreateReminder}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm hover:bg-amber-800"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Create reminder
                      </button>
                    </div>
                  ) : (
                    reminders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.link)}
                        className="group w-full rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-amber-100 hover:bg-amber-50/40"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${urgencyBadge(item.urgency)}`}
                          >
                            {item.urgency}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-slate-900 line-clamp-2 group-hover:text-slate-800">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {item.subtitle} · {item.source}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </PagePanel>
            ) : null}

            {showNotes ? (
              <PagePanel
                accent="sky"
                className="min-h-[280px] flex flex-col"
                title={
                  <span className="inline-flex items-center gap-2">
                    <PencilSquareIcon className="h-4 w-4 text-sky-700" />
                    Notes
                  </span>
                }
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreateNote}
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-800"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lab-notebook')}
                      className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-900"
                    >
                      Notebook
                      <ArrowRightIcon className="h-3 w-3" />
                    </button>
                  </div>
                }
              >
                <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px]">
                  {notes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/50 to-white px-3 py-8 text-center">
                      <p className="text-[13px] text-slate-700">No sticky notes yet</p>
                      <p className="mt-1 mb-3 text-[12px] text-slate-400">
                        Capture a thought — syncs with notebook quick notes
                      </p>
                      <button
                        type="button"
                        onClick={openCreateNote}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm hover:bg-sky-800"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Create note
                      </button>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className={`group relative rounded-xl border px-3 py-2.5 ${noteColorClass(note.color)}`}
                      >
                        <p className="pr-14 whitespace-pre-wrap text-[13px] text-slate-800">
                          {note.content}
                        </p>
                        <p className="mt-1.5 text-[10px] text-slate-500">
                          {formatRelative(note.updatedAt || note.createdAt)}
                        </p>
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => openEditNote(note)}
                            className="rounded-md p-1 text-slate-500 hover:bg-white/70 hover:text-slate-800"
                            aria-label="Edit note"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteNote(note.id)}
                            className="rounded-md p-1 text-slate-500 hover:bg-white/70 hover:text-rose-700"
                            aria-label="Delete note"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </PagePanel>
            ) : null}
          </div>

          <PagePanel
            accent="sky"
            title={
              <span className="inline-flex items-center gap-2">
                <PlusIcon className="h-4 w-4 text-slate-500" />
                Quick actions
              </span>
            }
            action={
              <button
                type="button"
                onClick={() => void loadDemoChain()}
                disabled={demoLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-60"
              >
                <SparklesIcon className={`h-3.5 w-3.5 ${demoLoading ? 'animate-pulse' : ''}`} />
                {demoLoading ? 'Creating…' : 'Load sample chain'}
              </button>
            }
          >
            {demoMessage ? (
              <p className="mb-2 text-[12px] text-slate-600">{demoMessage}</p>
            ) : (
              <p className="mb-2 text-[12px] text-slate-500">
                Follow the evidence chain, or load a linked demo protocol → experiment → notebook →
                pack.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    type="button"
                    onClick={() => navigate(action.link)}
                    className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/60 p-3 text-left transition-colors hover:border-sky-100 hover:from-sky-50/40 hover:to-white"
                  >
                    <div
                      className={`rounded-xl bg-gradient-to-br p-2.5 shadow-md ${action.well}`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-900">{action.title}</p>
                      <p className="truncate text-[11px] text-slate-500">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </PagePanel>

          <section className="space-y-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                Stay connected
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Events, open questions, and what the community is sharing
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <PagePanel
                accent="sky"
                className="flex flex-col"
                title={
                  <span className="inline-flex items-center gap-2">
                    <CalendarDaysIcon className="h-4 w-4 text-sky-700" />
                    Events
                  </span>
                }
                action={
                  <button
                    type="button"
                    onClick={() => navigate('/events-opportunities')}
                    className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-900"
                  >
                    Browse
                    <ArrowRightIcon className="h-3 w-3" />
                  </button>
                }
              >
                <div className="flex-1 space-y-1">
                  {events.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('/events-opportunities')}
                      className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-6 text-left transition-colors hover:bg-slate-50"
                    >
                      <p className="text-[13px] text-slate-600">Nothing upcoming</p>
                      <p className="mt-1 text-[11px] text-slate-400">Explore events →</p>
                    </button>
                  ) : (
                    events.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => navigate('/events-opportunities')}
                        className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sky-50/50"
                      >
                        <p className="text-[13px] font-medium text-slate-900 line-clamp-2 group-hover:text-slate-800">
                          {event.title}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {event.startDate ? <span>{formatShortDate(event.startDate)}</span> : null}
                          {event.location ? (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPinIcon className="h-3 w-3" />
                              <span className="max-w-[9rem] truncate">{event.location}</span>
                            </span>
                          ) : null}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </PagePanel>

              <PagePanel
                accent="amber"
                className="flex flex-col"
                title={
                  <span className="inline-flex items-center gap-2">
                    <QuestionMarkCircleIcon className="h-4 w-4 text-amber-700" />
                    Help forum
                  </span>
                }
                action={
                  <button
                    type="button"
                    onClick={() => navigate('/help-forum')}
                    className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-900"
                  >
                    Browse
                    <ArrowRightIcon className="h-3 w-3" />
                  </button>
                }
              >
                <div className="flex-1 space-y-1">
                  {forumItems.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('/help-forum')}
                      className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-6 text-left transition-colors hover:bg-slate-50"
                    >
                      <p className="text-[13px] text-slate-600">No open questions</p>
                      <p className="mt-1 text-[11px] text-slate-400">Ask or help someone →</p>
                    </button>
                  ) : (
                    forumItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate('/help-forum')}
                        className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-amber-50/50"
                      >
                        <p className="text-[13px] font-medium text-slate-900 line-clamp-2 group-hover:text-slate-800">
                          {item.title}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {item.category ? <span>{item.category}</span> : null}
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            <ChatBubbleLeftRightIcon className="h-3 w-3" />
                            {item.responses ?? 0}
                          </span>
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </PagePanel>

              <PagePanel
                accent="emerald"
                className="flex flex-col"
                title={
                  <span className="inline-flex items-center gap-2">
                    <NewspaperIcon className="h-4 w-4 text-emerald-700" />
                    News & updates
                  </span>
                }
                action={
                  <button
                    type="button"
                    onClick={() => navigate('/current-trends')}
                    className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-900"
                  >
                    Browse
                    <ArrowRightIcon className="h-3 w-3" />
                  </button>
                }
              >
                <div className="flex-1 space-y-1">
                  {newsItems.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('/current-trends')}
                      className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-6 text-left transition-colors hover:bg-slate-50"
                    >
                      <p className="text-[13px] text-slate-600">Feed is quiet</p>
                      <p className="mt-1 text-[11px] text-slate-400">Share news or an idea →</p>
                    </button>
                  ) : (
                    newsItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          navigate(`/current-trends?post=${encodeURIComponent(item.id)}`)
                        }
                        className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-emerald-50/50"
                      >
                        <p className="text-[13px] font-medium text-slate-900 line-clamp-2 group-hover:text-slate-800">
                          {item.title}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {item.postType ? (
                            <span className="capitalize">{item.postType}</span>
                          ) : null}
                          {item.authorName ? <span>{item.authorName}</span> : null}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </PagePanel>
            </div>
          </section>
        </div>
      )}

      <DashboardNoteForm
        isOpen={noteFormOpen}
        mode={noteFormMode}
        initial={
          editingNote
            ? { content: editingNote.content, color: editingNote.color || 'yellow' }
            : null
        }
        submitting={savingNote}
        error={noteFormError}
        onClose={() => {
          if (!savingNote) {
            setNoteFormOpen(false);
            setEditingNote(null);
            setNoteFormError('');
          }
        }}
        onSubmit={handleNoteFormSubmit}
      />

      <DashboardReminderForm
        isOpen={reminderFormOpen}
        submitting={savingReminder}
        error={reminderFormError}
        onClose={() => {
          if (!savingReminder) {
            setReminderFormOpen(false);
            setReminderFormError('');
          }
        }}
        onSubmit={handleReminderFormSubmit}
      />
    </div>
  );
};


export default DashboardPage;
