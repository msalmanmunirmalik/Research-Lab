/**
 * Server authorization for lab notebooks, protocols, experiments, and evidence.
 * Account role is not a substitute for lab membership. lab_members.permissions is ignored.
 */

export type LifecycleResource = 'notebook' | 'protocol' | 'experiment' | 'research_data';

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const LAB_VISIBLE = new Set(['lab', 'shared', 'institution']);
const WORLD_VISIBLE = new Set(['public', 'global']);

export function normalizePrivacy(value: unknown): string {
  const privacy = String(value ?? '').trim().toLowerCase();
  return privacy || 'lab';
}

export function isListedCollaborator(raw: unknown, userId: string): boolean {
  if (!userId) return false;
  if (Array.isArray(raw)) {
    return raw.some((item) => {
      if (typeof item === 'string') return item === userId || item.includes(userId);
      if (item && typeof item === 'object' && 'id' in item) return String((item as { id: unknown }).id) === userId;
      return false;
    });
  }
  if (typeof raw === 'string') return raw.includes(userId);
  return false;
}

export function canReadLifecycleRecord(input: {
  resource: LifecycleResource;
  userId: string;
  ownerId: string | null;
  labId: string | null;
  privacyLevel?: string | null;
  activeMember: boolean;
  collaborators?: unknown;
}): { allowed: boolean; status: 403 | 404 } {
  const owner = Boolean(input.ownerId && input.ownerId === input.userId);
  if (input.resource === 'experiment') {
    if (owner || isListedCollaborator(input.collaborators, input.userId)) {
      return { allowed: true, status: 403 };
    }
    return { allowed: false, status: 404 };
  }

  if (owner) return { allowed: true, status: 403 };
  const privacy = normalizePrivacy(input.privacyLevel);
  if (WORLD_VISIBLE.has(privacy)) return { allowed: true, status: 403 };
  if (LAB_VISIBLE.has(privacy) && input.labId && input.activeMember) {
    return { allowed: true, status: 403 };
  }
  return { allowed: false, status: 403 };
}

export async function findActiveLabMembership(
  db: Queryable,
  userId: string,
  labId: string
): Promise<{ role: string } | null> {
  const found = await db.query(
    `SELECT role FROM lab_members
     WHERE lab_id = $1 AND user_id = $2 AND COALESCE(is_active, 1) = 1
     LIMIT 1`,
    [labId, userId]
  );
  const role = found.rows[0]?.role;
  return role ? { role: String(role) } : null;
}

export async function assertActiveLabMember(
  db: Queryable,
  userId: string,
  labId: string
): Promise<{ ok: true; role: string } | { ok: false; status: 403; error: string }> {
  const membership = await findActiveLabMembership(db, userId, labId);
  if (!membership) {
    return { ok: false, status: 403, error: 'Not a member of this lab' };
  }
  return { ok: true, role: membership.role };
}

export async function hasActiveLabRole(
  db: Queryable,
  userId: string,
  labId: string | null,
  roles: readonly string[]
): Promise<boolean> {
  if (!labId) return false;
  const membership = await findActiveLabMembership(db, userId, labId);
  return Boolean(membership && roles.includes(membership.role));
}

const WRITE_MANAGER_ROLES = new Set(['principal_researcher', 'admin']);

/**
 * Owner always writes. Active PI/admin may edit/delete/share lab-scoped rows.
 * Co-supervisor may write only when allowCoSupervisor (e.g. evidence edit, not delete).
 */
export function canWriteLifecycleRecord(input: {
  userId: string;
  ownerId: string | null;
  labRole: string | null;
  allowCoSupervisor?: boolean;
}): boolean {
  if (input.ownerId && input.ownerId === input.userId) return true;
  if (!input.labRole) return false;
  if (WRITE_MANAGER_ROLES.has(input.labRole)) return true;
  if (input.allowCoSupervisor && input.labRole === 'co_supervisor') return true;
  return false;
}

/** Resolve lab role then apply canWriteLifecycleRecord. */
export async function assertCanWriteLifecycleRecord(
  db: Queryable,
  input: {
    userId: string;
    ownerId: string | null;
    labId: string | null;
    allowCoSupervisor?: boolean;
  }
): Promise<boolean> {
  if (input.ownerId && input.ownerId === input.userId) return true;
  if (!input.labId) return false;
  const membership = await findActiveLabMembership(db, input.userId, input.labId);
  return canWriteLifecycleRecord({
    userId: input.userId,
    ownerId: input.ownerId,
    labRole: membership?.role ?? null,
    allowCoSupervisor: input.allowCoSupervisor,
  });
}
