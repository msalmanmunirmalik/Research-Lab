/**
 * Write Together panel — invite co-authors, section ACL, live presence.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import { UsersIcon, XMarkIcon } from './icons';
import { getAuthToken, resolveApiBaseUrl } from '../utils/apiBase';

export type CollabAccess = {
  role: string;
  accessScope: 'entire' | 'sections';
  sectionIds: string[];
  isOwner: boolean;
  canEdit: boolean;
  canManage: boolean;
};

type Collaborator = {
  id: string;
  userId: string;
  role: string;
  accessScope: string;
  sectionIds: string[];
  status: string;
  name: string;
  email?: string;
};

type Presence = {
  userId: string;
  displayName: string;
  sectionId?: string | null;
  color?: string;
};

type Lock = {
  sectionId: string;
  userId: string;
  displayName?: string;
};

type PendingInvite = {
  id: string;
  token: string;
  email?: string | null;
  invitedUserId?: string | null;
  role: string;
  accessScope: string;
  sectionIds: string[];
  status: string;
  expiresAt?: string;
  url: string;
  message?: string | null;
};

type SectionOpt = { id: string; title: string };

type Props = {
  documentId: string;
  sections: SectionOpt[];
  activeSectionId: string;
  currentUserId?: string;
  onAccessChange?: (access: CollabAccess | null) => void;
  onRemoteRevision?: (revision: number) => void;
  onLocksChange?: (locks: Lock[]) => void;
  /** Show panel content inline (no floating dropdown) */
  embedded?: boolean;
  /** When false, keep presence/locks alive but hide the UI (parent mounts once). */
  visible?: boolean;
};

const roleLabel = (role: string) => {
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Can write';
  if (role === 'viewer') return 'Read only';
  return role;
};

const WriteTogetherPanel: React.FC<Props> = ({
  documentId,
  sections = [],
  activeSectionId,
  currentUserId,
  onAccessChange,
  onRemoteRevision,
  onLocksChange,
  embedded = false,
  visible = true,
}) => {
  const apiBase = resolveApiBaseUrl();
  const token = typeof localStorage !== 'undefined' ? getAuthToken() : null;
  const headers = useCallback(
    (): HeadersInit => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const [open, setOpen] = useState(embedded);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [access, setAccess] = useState<CollabAccess | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteMode, setInviteMode] = useState<'user' | 'email' | 'link'>('link');
  const [userQuery, setUserQuery] = useState('');
  const [userHits, setUserHits] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [accessScope, setAccessScope] = useState<'entire' | 'sections'>('entire');
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [inviteNote, setInviteNote] = useState('');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sectionTitle = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.title || id,
    [sections]
  );

  const loadInvites = useCallback(async () => {
    if (!token || !documentId || !access?.canManage) {
      setPendingInvites([]);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/writing/documents/${documentId}/invitations`, {
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) return;
      const rows: PendingInvite[] = (data.invitations || []).filter(
        (i: PendingInvite) => i.status === 'pending'
      );
      setPendingInvites(rows);
    } catch {
      /* optional */
    }
  }, [access?.canManage, apiBase, documentId, headers, token]);

  const loadState = useCallback(async () => {
    if (!token || !documentId) return;
    try {
      const res = await fetch(`${apiBase}/writing/documents/${documentId}/collab-state`, {
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load collaboration');
      setCollaborators(data.collaborators || []);
      setAccess(data.access || null);
      setPresence(data.presence || []);
      setLocks(data.locks || []);
      onAccessChange?.(data.access || null);
      onLocksChange?.(data.locks || []);
      if (typeof data.revision === 'number') onRemoteRevision?.(data.revision);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [apiBase, documentId, headers, token, onAccessChange, onLocksChange, onRemoteRevision]);

  const heartbeat = useCallback(async () => {
    if (!token || !documentId || !activeSectionId) return;
    try {
      await fetch(`${apiBase}/writing/documents/${documentId}/presence`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ sectionId: activeSectionId }),
      });
    } catch {
      /* ignore */
    }
  }, [apiBase, documentId, headers, token, activeSectionId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites, collaborators]);

  useEffect(() => {
    void heartbeat();
    const t = window.setInterval(() => void heartbeat(), 15000);
    return () => window.clearInterval(t);
  }, [heartbeat]);

  useEffect(() => {
    if (!token || !documentId) return;
    const poll = window.setInterval(() => void loadState(), 10000);
    return () => window.clearInterval(poll);
  }, [token, documentId, loadState]);

  // Acquire soft lock when entering an editable section
  useEffect(() => {
    if (!token || !documentId || !access?.canEdit || !activeSectionId) return;
    if (access.accessScope === 'sections' && !access.sectionIds.includes(activeSectionId)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await fetch(`${apiBase}/writing/documents/${documentId}/locks/${activeSectionId}`, {
          method: 'POST',
          headers: headers(),
        });
        if (!cancelled) void loadState();
      } catch {
        /* conflict handled by server */
      }
    })();
    return () => {
      cancelled = true;
      void fetch(`${apiBase}/writing/documents/${documentId}/locks/${activeSectionId}`, {
        method: 'DELETE',
        headers: headers(),
      }).catch(() => undefined);
    };
  }, [activeSectionId, access, apiBase, documentId, headers, token, loadState]);

  const searchUsers = async (q: string) => {
    setUserQuery(q);
    if (q.trim().length < 2) {
      setUserHits([]);
      return;
    }
    const res = await fetch(`${apiBase}/users/search?q=${encodeURIComponent(q)}`, {
      headers: headers(),
    });
    const data = await res.json();
    if (res.ok) setUserHits(data.users || []);
  };

  const toggleSection = (id: string) => {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage('Invite link copied — share it with your co-author.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link and copy manually.');
    }
  };

  const sendInvite = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (accessScope === 'sections' && sectionIds.length === 0) {
        throw new Error('Select at least one section for limited access.');
      }
      const body: Record<string, unknown> = {
        role,
        accessScope,
        sectionIds: accessScope === 'sections' ? sectionIds : [],
        message: inviteNote || undefined,
      };
      if (inviteMode === 'user') {
        if (!selectedUser?.id) throw new Error('Select a platform user');
        body.userId = selectedUser.id;
      } else if (inviteMode === 'email') {
        if (!email.trim()) throw new Error('Email is required');
        body.email = email.trim();
      } else {
        body.linkOnly = true;
      }

      const res = await fetch(`${apiBase}/writing/documents/${documentId}/invitations`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');

      const url = data.invitation?.url || null;
      setLastInviteUrl(url);
      const delivery = data.invitation?.delivery;
      if (inviteMode === 'email') {
        setMessage(
          delivery?.emailDelivered
            ? 'Invitation email sent. A shareable link is also ready.'
            : 'Invitation recorded. Email delivery is not configured. Copy the link to share it.'
        );
        if (url) void copyLink(url);
      } else if (inviteMode === 'link' || !delivery?.inApp) {
        setMessage('Invite link ready — copy and send it to your co-author.');
        if (url) void copyLink(url);
      } else if (delivery?.inApp) {
        setMessage('Invitation sent in-app. A shareable link is also ready if they need it.');
      } else {
        setMessage('Invitation created. Copy the link to share.');
      }
      setSelectedUser(null);
      setUserQuery('');
      setEmail('');
      setInviteNote('');
      void loadState();
      void loadInvites();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const updateCollab = async (
    collabId: string,
    patch: { role?: string; accessScope?: string; sectionIds?: string[]; status?: string }
  ) => {
    setError(null);
    const res = await fetch(
      `${apiBase}/writing/documents/${documentId}/collaborators/${collabId}`,
      {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(patch),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Update failed');
      return;
    }
    setCollaborators(data.collaborators || []);
    setMessage(patch.status === 'revoked' ? 'Collaborator removed.' : 'Access updated.');
  };

  const revokeInvite = async (inviteId: string) => {
    setError(null);
    const res = await fetch(
      `${apiBase}/writing/documents/${documentId}/invitations/${encodeURIComponent(inviteId)}`,
      { method: 'DELETE', headers: headers() }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Could not revoke invite');
      return;
    }
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    setMessage('Invitation revoked.');
  };

  const othersHere = useMemo(
    () => presence.filter((p) => p.userId !== currentUserId),
    [presence, currentUserId]
  );

  const lockOnActive = locks.find(
    (l) => l.sectionId === activeSectionId && l.userId !== currentUserId
  );

  const accessSummary = useMemo(() => {
    if (!access) return 'Loading access…';
    if (access.isOwner) return 'You are the main author';
    const scope =
      access.accessScope === 'sections'
        ? `sections: ${access.sectionIds.map(sectionTitle).join(', ') || 'none'}`
        : 'the full manuscript';
    return `${roleLabel(access.role)} · ${scope}`;
  }, [access, sectionTitle]);

  const panelBody = (
    <>
      {error ? <p className="mb-2 text-[12px] text-rose-700">{error}</p> : null}
      {message ? <p className="mb-2 text-[12px] text-teal-800">{message}</p> : null}

      {!access?.canManage ? (
        <p className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          {accessSummary}
          {lockOnActive
            ? ` · ${lockOnActive.displayName || 'Someone'} is editing this section`
            : ''}
        </p>
      ) : null}

      {access?.canManage ? (
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">Invite a co-author</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Share a link, notify a platform user, or invite by email. Co-authors open the link
              while signed in to join.
            </p>
          </div>

          <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
            {(
              [
                ['link', 'Copy link'],
                ['user', 'Find user'],
                ['email', 'By email'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] ${
                  inviteMode === id ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
                onClick={() => setInviteMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {inviteMode === 'user' ? (
            <div>
              <input
                value={userQuery}
                onChange={(e) => void searchUsers(e.target.value)}
                placeholder="Search name or email…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
              />
              {selectedUser ? (
                <p className="mt-1 text-[11px] text-teal-800">
                  Selected: {selectedUser.name || selectedUser.email}
                </p>
              ) : null}
              {userHits.length > 0 ? (
                <ul className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-slate-100">
                  {userHits.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 ${
                          selectedUser?.id === u.id ? 'bg-teal-50' : ''
                        }`}
                        onClick={() => {
                          setSelectedUser(u);
                          setUserQuery(u.name || u.email);
                          setUserHits([]);
                        }}
                      >
                        {u.name} · {u.email}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {inviteMode === 'email' ? (
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coauthor@university.edu"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Creates a link for that email. If they already have an account, they also get an
                in-app notification.
              </p>
            </div>
          ) : null}

          {inviteMode === 'link' ? (
            <p className="text-[11px] text-slate-500">
              Anyone with the link who is signed in can join with the role you choose below.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-slate-600">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] font-normal"
              >
                <option value="editor">Can write</option>
                <option value="viewer">Read only</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-600">
              Access
              <select
                value={accessScope}
                onChange={(e) => setAccessScope(e.target.value as 'entire' | 'sections')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] font-normal"
              >
                <option value="entire">Entire paper</option>
                <option value="sections">Some sections</option>
              </select>
            </label>
          </div>

          {accessScope === 'sections' ? (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
              {(sections || [])
                .filter((s) => s.id !== 'title')
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[12px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={sectionIds.includes(s.id)}
                      onChange={() => toggleSection(s.id)}
                    />
                    {s.title}
                  </label>
                ))}
            </div>
          ) : null}

          <input
            value={inviteNote}
            onChange={(e) => setInviteNote(e.target.value)}
            placeholder="Optional note (e.g. please draft Methods)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
          />

          <Button variant="primary" disabled={busy} onClick={() => void sendInvite()}>
            {inviteMode === 'link'
              ? busy
                ? 'Creating…'
                : 'Create & copy invite link'
              : busy
                ? 'Sending…'
                : 'Send invitation'}
          </Button>

          {lastInviteUrl ? (
            <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/60 p-2">
              <input
                readOnly
                value={lastInviteUrl}
                className="min-w-0 flex-1 truncate bg-transparent text-[11px] text-slate-700"
              />
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-teal-900 hover:bg-teal-100"
                onClick={() => void copyLink(lastInviteUrl)}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {access?.canManage && pendingInvites.length > 0 ? (
        <div className="mt-3 space-y-2 border-b border-slate-100 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pending invites
          </p>
          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-slate-800">
                  {inv.email || 'Open invite link'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {roleLabel(inv.role)} ·{' '}
                  {inv.accessScope === 'entire'
                    ? 'entire paper'
                    : (inv.sectionIds || []).map(sectionTitle).join(', ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  className="text-[10px] font-semibold text-teal-800 hover:underline"
                  onClick={() => void copyLink(inv.url)}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="text-[10px] text-rose-700 hover:underline"
                  onClick={() => void revokeInvite(inv.id)}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          People on this manuscript
        </p>
        {collaborators.length === 0 ? (
          <p className="text-[12px] text-slate-500">Only you so far — invite a co-author above.</p>
        ) : null}
        {collaborators.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-800">
                {c.name}
                {c.userId === currentUserId ? (
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(you)</span>
                ) : null}
                {c.status === 'pending' ? (
                  <span className="ml-1 text-[10px] font-normal text-amber-700">pending</span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {roleLabel(c.role)} ·{' '}
                {c.accessScope === 'entire'
                  ? 'entire paper'
                  : (c.sectionIds || []).map(sectionTitle).join(', ') || 'no sections'}
              </p>
            </div>
            {access?.canManage && c.role !== 'owner' ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.status === 'active' ? (
                  <select
                    className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"
                    value={c.role}
                    onChange={(e) =>
                      void updateCollab(c.id, { role: e.target.value })
                    }
                    aria-label={`Role for ${c.name}`}
                  >
                    <option value="editor">Can write</option>
                    <option value="viewer">Read only</option>
                  </select>
                ) : null}
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-rose-700"
                  onClick={() => {
                    if (window.confirm(`Remove ${c.name} from this manuscript?`)) {
                      void updateCollab(c.id, { status: 'revoked' });
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );

  const presenceStrip =
    othersHere.length > 0 || presence.length > 0 ? (
      <div className="mb-3 flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {presence.slice(0, 6).map((p) => (
            <span
              key={p.userId}
              title={`${p.displayName}${p.sectionId ? ` · ${sectionTitle(p.sectionId)}` : ''}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
              style={{ backgroundColor: p.color || '#0f766e' }}
            >
              {(p.displayName || '?').slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <span className="text-[12px] text-slate-500">
          {presence.length} online
          {lockOnActive
            ? ` · ${lockOnActive.displayName || 'Someone'} editing ${sectionTitle(lockOnActive.sectionId)}`
            : ''}
        </span>
      </div>
    ) : (
      <p className="mb-3 text-[11px] text-slate-400">No one else is online on this draft.</p>
    );

  // Keep hooks/presence alive even when parent hides the panel
  if (!visible && embedded) {
    return <div className="hidden" aria-hidden />;
  }

  if (embedded) {
    return (
      <div>
        {presenceStrip}
        {panelBody}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <UsersIcon className="h-3.5 w-3.5" />
            Invite co-authors
            {othersHere.length > 0 ? (
              <span className="rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-900">
                {othersHere.length + 1}
              </span>
            ) : null}
          </span>
        </Button>
        <div className="flex -space-x-1.5">
          {presence.slice(0, 6).map((p) => (
            <span
              key={p.userId}
              title={`${p.displayName}${p.sectionId ? ` · ${sectionTitle(p.sectionId)}` : ''}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
              style={{ backgroundColor: p.color || '#0f766e' }}
            >
              {(p.displayName || '?').slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        {lockOnActive ? (
          <span className="text-[11px] text-amber-800">
            {lockOnActive.displayName || 'Someone'} is editing this section
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(100vw-2rem,420px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Invite co-authors</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Share the whole paper or just the sections they should own.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          {presenceStrip}
          {panelBody}
        </div>
      ) : null}
    </div>
  );
};

export default WriteTogetherPanel;
