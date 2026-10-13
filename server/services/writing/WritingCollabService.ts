/**
 * Write Together — access control, invitations, presence, section locks.
 * Research-group model: owner grants entire-paper or per-section access;
 * co-authors soft-lock sections while editing; sync via revision + poll/SSE.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import pool from '../../../database/config.js';
import { createNotification } from '../notifications/notificationService.js';
import { WritingDraftContent } from '../../../utils/writingTemplates.js';
import { sendEmail } from '../../integrations/email.js';

export type CollabRole = 'owner' | 'editor' | 'viewer';
export type AccessScope = 'entire' | 'sections';

export type CollabAccess = {
  documentId: string;
  userId: string;
  role: CollabRole;
  accessScope: AccessScope;
  sectionIds: string[];
  isOwner: boolean;
  canEdit: boolean;
  canManage: boolean;
  canRead: boolean;
};

const LOCK_TTL_MS = 90_000;
const PRESENCE_TTL_MS = 45_000;
const PRESENCE_COLORS = ['#0f766e', '#1d4ed8', '#b45309', '#be123c', '#7c3aed', '#047857'];

/** In-process fan-out for SSE clients */
export const writingCollabBus = new EventEmitter();
writingCollabBus.setMaxListeners(200);

function parseJsonArr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function displayNameFromUser(u: {
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
}): string {
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return full || u.username || u.email || 'Collaborator';
}

function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h + userId.charCodeAt(i) * 17) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[h];
}

export function inviteUrl(token: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/writing-studio?invite=${encodeURIComponent(token)}`;
}

export async function queueInviteEmail(opts: {
  toEmail: string;
  inviterName: string;
  documentTitle: string;
  role: string;
  accessScope: string;
  sectionIds: string[];
  url: string;
  message?: string | null;
}): Promise<{ sent: boolean; logged: boolean; delivered: boolean }> {
  const access =
    opts.accessScope === 'entire'
      ? 'entire manuscript'
      : `sections — ${opts.sectionIds.join(', ') || '(none)'}`;
  const result = await sendEmail({
    to: opts.toEmail,
    template: 'writing_invite',
    vars: {
      inviterName: opts.inviterName,
      documentTitle: opts.documentTitle,
      role: opts.role,
      access,
      note: opts.message || '',
      joinUrl: opts.url,
    },
  });
  return { sent: result.delivered, logged: !result.delivered, delivered: result.delivered };
}

export class WritingCollabService {
  static async getDocumentRow(documentId: string) {
    const r = await pool.query(`SELECT * FROM writing_documents WHERE id = $1`, [documentId]);
    return r.rows?.[0] || null;
  }

  static async resolveAccess(documentId: string, userId: string): Promise<CollabAccess | null> {
    const doc = await this.getDocumentRow(documentId);
    if (!doc) return null;

    if (doc.user_id === userId) {
      return {
        documentId,
        userId,
        role: 'owner',
        accessScope: 'entire',
        sectionIds: [],
        isOwner: true,
        canEdit: true,
        canManage: true,
        canRead: true,
      };
    }

    const r = await pool.query(
      `SELECT * FROM writing_collaborators
       WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
      [documentId, userId]
    );
    const row = r.rows?.[0];
    if (!row) return null;

    const role = (row.role || 'viewer') as CollabRole;
    const accessScope = (row.access_scope || 'entire') as AccessScope;
    const sectionIds = parseJsonArr(row.section_ids);
    const canEdit = role === 'editor' || role === 'owner';
    return {
      documentId,
      userId,
      role,
      accessScope,
      sectionIds,
      isOwner: false,
      canEdit,
      canManage: false,
      canRead: true,
    };
  }

  static canEditSection(access: CollabAccess, sectionId: string): boolean {
    if (!access.canEdit) return false;
    if (access.accessScope === 'entire' || access.isOwner) return true;
    return access.sectionIds.includes(sectionId);
  }

  static filterContentForWrite(
    access: CollabAccess,
    prev: WritingDraftContent,
    next: WritingDraftContent
  ): WritingDraftContent {
    if (access.isOwner || access.accessScope === 'entire') return next;
    if (!access.canEdit) return prev;

    const allowed = new Set(access.sectionIds);
    const prevById = new Map(prev.sections.map((s) => [s.sectionId, s.content]));
    const nextSections = (next.sections || []).map((s) => {
      if (allowed.has(s.sectionId)) return s;
      return { sectionId: s.sectionId, content: prevById.get(s.sectionId) || '' };
    });

    // Keep metadata fields owner-controlled for section-scoped editors
    return {
      ...prev,
      sections: nextSections,
      // Allow title only if they have abstract/title section — keep prev title otherwise
      title: prev.title,
      citationStyle: prev.citationStyle,
      keywords: prev.keywords,
      researchQuestion: prev.researchQuestion,
      targetVenue: prev.targetVenue,
    };
  }

  static async listAccessibleDocumentIds(userId: string): Promise<string[]> {
    const owned = await pool.query(`SELECT id FROM writing_documents WHERE user_id = $1`, [userId]);
    const shared = await pool.query(
      `SELECT document_id AS id FROM writing_collaborators
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    return [...new Set([...(owned.rows || []), ...(shared.rows || [])].map((r: any) => r.id))];
  }

  static async ensureOwnerCollaborator(documentId: string, ownerId: string) {
    await pool.query(
      `INSERT INTO writing_collaborators
         (id, document_id, user_id, role, access_scope, status, joined_at, invited_by)
       VALUES ($1, $2, $3, 'owner', 'entire', 'active', NOW(), $3)
       ON DUPLICATE KEY UPDATE role = 'owner', status = 'active', access_scope = 'entire'`,
      [crypto.randomUUID(), documentId, ownerId]
    );
  }

  static async listCollaborators(documentId: string) {
    const r = await pool.query(
      `SELECT c.*, u.email, u.username, u.first_name, u.last_name, u.avatar_url
       FROM writing_collaborators c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.document_id = $1 AND c.status != 'revoked'
       ORDER BY CASE c.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, c.created_at ASC`,
      [documentId]
    );
    return (r.rows || []).map((row: any) => ({
      id: row.id,
      documentId: row.document_id,
      userId: row.user_id,
      role: row.role,
      accessScope: row.access_scope,
      sectionIds: parseJsonArr(row.section_ids),
      status: row.status,
      joinedAt: row.joined_at,
      email: row.email,
      name: displayNameFromUser(row),
      avatarUrl: row.avatar_url,
    }));
  }

  static async upsertCollaborator(opts: {
    documentId: string;
    userId: string;
    role: CollabRole;
    accessScope: AccessScope;
    sectionIds?: string[];
    invitedBy: string;
    status?: string;
  }) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO writing_collaborators
         (id, document_id, user_id, role, access_scope, section_ids, invited_by, status, joined_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'active' THEN NOW() ELSE NULL END)
       ON DUPLICATE KEY UPDATE
         role = VALUES(role),
         access_scope = VALUES(access_scope),
         section_ids = VALUES(section_ids),
         status = VALUES(status),
         invited_by = VALUES(invited_by),
         joined_at = IF(VALUES(status) = 'active', COALESCE(joined_at, NOW()), joined_at),
         updated_at = NOW()`,
      [
        id,
        opts.documentId,
        opts.userId,
        opts.role === 'owner' ? 'editor' : opts.role,
        opts.accessScope,
        JSON.stringify(opts.sectionIds || []),
        opts.invitedBy,
        opts.status || 'active',
      ]
    );
    return this.listCollaborators(opts.documentId);
  }

  static async updateCollaborator(
    documentId: string,
    collaboratorId: string,
    patch: { role?: CollabRole; accessScope?: AccessScope; sectionIds?: string[]; status?: string }
  ) {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.role) {
      params.push(patch.role);
      sets.push(`role = $${params.length}`);
    }
    if (patch.accessScope) {
      params.push(patch.accessScope);
      sets.push(`access_scope = $${params.length}`);
    }
    if (patch.sectionIds) {
      params.push(JSON.stringify(patch.sectionIds));
      sets.push(`section_ids = $${params.length}`);
    }
    if (patch.status) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (!sets.length) return;
    params.push(collaboratorId, documentId);
    await pool.query(
      `UPDATE writing_collaborators SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND document_id = $${params.length} AND role != 'owner'`,
      params
    );
  }

  static async createInvitation(opts: {
    documentId: string;
    invitedBy: string;
    email?: string | null;
    invitedUserId?: string | null;
    role: CollabRole;
    accessScope: AccessScope;
    sectionIds?: string[];
    message?: string | null;
    expiresInDays?: number;
  }) {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    const days = opts.expiresInDays ?? 14;
    const expires = new Date(Date.now() + days * 86400000);

    await pool.query(
      `INSERT INTO writing_invitations
         (id, document_id, token, invited_by, email, invited_user_id, role, access_scope,
          section_ids, message, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
      [
        id,
        opts.documentId,
        token,
        opts.invitedBy,
        opts.email || null,
        opts.invitedUserId || null,
        opts.role === 'owner' ? 'editor' : opts.role,
        opts.accessScope,
        JSON.stringify(opts.sectionIds || []),
        opts.message || null,
        expires,
      ]
    );

    if (opts.invitedUserId) {
      await this.upsertCollaborator({
        documentId: opts.documentId,
        userId: opts.invitedUserId,
        role: opts.role === 'owner' ? 'editor' : opts.role,
        accessScope: opts.accessScope,
        sectionIds: opts.sectionIds,
        invitedBy: opts.invitedBy,
        status: 'pending',
      });

      const doc = await this.getDocumentRow(opts.documentId);
      const inviter = await pool.query(
        `SELECT first_name, last_name, username, email FROM users WHERE id = $1`,
        [opts.invitedBy]
      );
      const inviterName = displayNameFromUser(inviter.rows?.[0] || {});
      await createNotification({
        userId: opts.invitedUserId,
        type: 'research_update',
        title: 'Write Together invitation',
        body: `${inviterName} invited you to collaborate on “${doc?.title || 'a manuscript'}”.`,
        link: inviteUrl(token),
        entityType: 'writing_document',
        entityId: opts.documentId,
      });
    }

    let emailDelivered = false;
    if (opts.email) {
      const doc = await this.getDocumentRow(opts.documentId);
      const inviter = await pool.query(
        `SELECT first_name, last_name, username, email FROM users WHERE id = $1`,
        [opts.invitedBy]
      );
      const mailed = await queueInviteEmail({
        toEmail: opts.email,
        inviterName: displayNameFromUser(inviter.rows?.[0] || {}),
        documentTitle: doc?.title || 'Untitled manuscript',
        role: opts.role,
        accessScope: opts.accessScope,
        sectionIds: opts.sectionIds || [],
        url: inviteUrl(token),
        message: opts.message,
      });
      emailDelivered = mailed.delivered;

      // If email matches a platform user, also notify in-app
      const byEmail = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [
        opts.email,
      ]);
      if (byEmail.rows?.[0]?.id && byEmail.rows[0].id !== opts.invitedUserId) {
        await createNotification({
          userId: byEmail.rows[0].id,
          type: 'research_update',
          title: 'Write Together invitation',
          body: `You were invited to collaborate on “${doc?.title || 'a manuscript'}”.`,
          link: inviteUrl(token),
          entityType: 'writing_document',
          entityId: opts.documentId,
        });
      }
    }

    return {
      id,
      token,
      url: inviteUrl(token),
      expiresAt: expires,
      delivery: {
        inApp: Boolean(opts.invitedUserId),
        emailQueued: Boolean(opts.email),
        emailDelivered,
        shareLink: true,
      },
    };
  }

  static async getInvitationByToken(token: string) {
    const r = await pool.query(`SELECT * FROM writing_invitations WHERE token = $1`, [token]);
    const inv = r.rows?.[0];
    if (!inv) return null;
    const doc = await this.getDocumentRow(inv.document_id);
    const inviter = await pool.query(
      `SELECT first_name, last_name, username, email FROM users WHERE id = $1`,
      [inv.invited_by]
    );
    return {
      id: inv.id,
      token: inv.token,
      documentId: inv.document_id,
      documentTitle: doc?.title || 'Untitled',
      role: inv.role,
      accessScope: inv.access_scope,
      sectionIds: parseJsonArr(inv.section_ids),
      message: inv.message,
      status: inv.status,
      expiresAt: inv.expires_at,
      inviterName: displayNameFromUser(inviter.rows?.[0] || {}),
      email: inv.email,
    };
  }

  static async acceptInvitation(token: string, userId: string, userEmail?: string) {
    const inv = await pool.query(`SELECT * FROM writing_invitations WHERE token = $1`, [token]);
    const row = inv.rows?.[0];
    if (!row) throw new Error('Invitation not found');
    if (row.status === 'revoked') throw new Error('Invitation was revoked');
    if (row.status === 'accepted' && row.accepted_by && row.accepted_by !== userId) {
      throw new Error('Invitation already used');
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query(`UPDATE writing_invitations SET status = 'expired' WHERE id = $1`, [row.id]);
      throw new Error('Invitation expired');
    }
    if (row.invited_user_id && row.invited_user_id !== userId) {
      throw new Error('This invitation was issued to another account');
    }
    if (row.email && userEmail && row.email.toLowerCase() !== userEmail.toLowerCase()) {
      // Allow accept if no invited_user_id — email hint only
      if (row.invited_user_id) {
        throw new Error('Sign in with the invited email to accept');
      }
    }

    await this.upsertCollaborator({
      documentId: row.document_id,
      userId,
      role: (row.role === 'owner' ? 'editor' : row.role) as CollabRole,
      accessScope: row.access_scope as AccessScope,
      sectionIds: parseJsonArr(row.section_ids),
      invitedBy: row.invited_by,
      status: 'active',
    });

    await pool.query(
      `UPDATE writing_invitations
       SET status = 'accepted', accepted_at = NOW(), accepted_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [userId, row.id]
    );

    this.emit(row.document_id, { type: 'collaborator_joined', userId });
    return { documentId: row.document_id };
  }

  static async touchPresence(opts: {
    documentId: string;
    userId: string;
    displayName: string;
    sectionId?: string | null;
  }) {
    await pool.query(
      `INSERT INTO writing_presence (document_id, user_id, display_name, section_id, color, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         section_id = VALUES(section_id),
         last_seen_at = NOW()`,
      [
        opts.documentId,
        opts.userId,
        opts.displayName,
        opts.sectionId || null,
        colorForUser(opts.userId),
      ]
    );
  }

  static async listPresence(documentId: string) {
    const cutoff = new Date(Date.now() - PRESENCE_TTL_MS);
    const r = await pool.query(
      `SELECT * FROM writing_presence
       WHERE document_id = $1 AND last_seen_at >= $2
       ORDER BY last_seen_at DESC`,
      [documentId, cutoff]
    );
    return (r.rows || []).map((row: any) => ({
      userId: row.user_id,
      displayName: row.display_name,
      sectionId: row.section_id,
      color: row.color,
      lastSeenAt: row.last_seen_at,
    }));
  }

  static async acquireLock(opts: {
    documentId: string;
    sectionId: string;
    userId: string;
    displayName: string;
  }) {
    await this.expireStaleLocks(opts.documentId);
    const existing = await pool.query(
      `SELECT * FROM writing_section_locks WHERE document_id = $1 AND section_id = $2`,
      [opts.documentId, opts.sectionId]
    );
    const lock = existing.rows?.[0];
    if (lock && lock.user_id !== opts.userId) {
      return {
        ok: false as const,
        lock: {
          sectionId: lock.section_id,
          userId: lock.user_id,
          displayName: lock.display_name,
          heartbeatAt: lock.heartbeat_at,
        },
      };
    }
    await pool.query(
      `INSERT INTO writing_section_locks (document_id, section_id, user_id, display_name, locked_at, heartbeat_at)
       VALUES ($1,$2,$3,$4,NOW(),NOW())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), display_name = VALUES(display_name), heartbeat_at = NOW()`,
      [opts.documentId, opts.sectionId, opts.userId, opts.displayName]
    );
    this.emit(opts.documentId, {
      type: 'lock',
      sectionId: opts.sectionId,
      userId: opts.userId,
      displayName: opts.displayName,
    });
    return { ok: true as const };
  }

  static async heartbeatLock(documentId: string, sectionId: string, userId: string) {
    await pool.query(
      `UPDATE writing_section_locks SET heartbeat_at = NOW()
       WHERE document_id = $1 AND section_id = $2 AND user_id = $3`,
      [documentId, sectionId, userId]
    );
  }

  static async releaseLock(documentId: string, sectionId: string, userId: string) {
    await pool.query(
      `DELETE FROM writing_section_locks
       WHERE document_id = $1 AND section_id = $2 AND user_id = $3`,
      [documentId, sectionId, userId]
    );
    this.emit(documentId, { type: 'unlock', sectionId, userId });
  }

  static async expireStaleLocks(documentId: string) {
    const cutoff = new Date(Date.now() - LOCK_TTL_MS);
    await pool.query(
      `DELETE FROM writing_section_locks WHERE document_id = $1 AND heartbeat_at < $2`,
      [documentId, cutoff]
    );
  }

  static async listLocks(documentId: string) {
    await this.expireStaleLocks(documentId);
    const r = await pool.query(
      `SELECT * FROM writing_section_locks WHERE document_id = $1`,
      [documentId]
    );
    return (r.rows || []).map((row: any) => ({
      sectionId: row.section_id,
      userId: row.user_id,
      displayName: row.display_name,
      lockedAt: row.locked_at,
      heartbeatAt: row.heartbeat_at,
    }));
  }

  static async bumpRevision(documentId: string): Promise<number> {
    await pool.query(
      `UPDATE writing_documents SET content_revision = content_revision + 1, updated_at = NOW()
       WHERE id = $1`,
      [documentId]
    );
    const r = await pool.query(`SELECT content_revision FROM writing_documents WHERE id = $1`, [
      documentId,
    ]);
    const rev = Number(r.rows?.[0]?.content_revision || 1);
    this.emit(documentId, { type: 'revision', revision: rev });
    return rev;
  }

  static emit(documentId: string, payload: Record<string, unknown>) {
    writingCollabBus.emit(`doc:${documentId}`, { ...payload, at: Date.now() });
  }

  static subscribe(documentId: string, handler: (ev: any) => void) {
    const key = `doc:${documentId}`;
    writingCollabBus.on(key, handler);
    return () => writingCollabBus.off(key, handler);
  }
}
