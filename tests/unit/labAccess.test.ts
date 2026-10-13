import { hasMinimumRole } from '../../utils/roleAccess';
import {
  assertActiveLabMember,
  assertCanWriteLifecycleRecord,
  canReadLifecycleRecord,
  canWriteLifecycleRecord,
  findActiveLabMembership,
  hasActiveLabRole,
} from '../../server/policies/labAccess';

function memoryDb(rows: { user_id: string; lab_id: string; role: string; is_active: number }[]) {
  return {
    async query(_sql: string, params: unknown[] = []) {
      const [labId, userId] = params;
      const row = rows.find(
        (item) => item.lab_id === labId && item.user_id === userId && item.is_active === 1
      );
      return { rows: row ? [{ role: row.role }] : [] };
    },
  };
}

describe('lab lifecycle policy', () => {
  const members = memoryDb([
    { user_id: 'member', lab_id: 'lab-a', role: 'student', is_active: 1 },
    { user_id: 'pi', lab_id: 'lab-a', role: 'principal_researcher', is_active: 1 },
    { user_id: 'inactive', lab_id: 'lab-a', role: 'researcher', is_active: 0 },
    { user_id: 'other', lab_id: 'lab-b', role: 'student', is_active: 1 },
  ]);

  test('co_supervisor is at least a student in the client hint map', () => {
    expect(hasMinimumRole('co_supervisor', 'student')).toBe(true);
    expect(hasMinimumRole('co_supervisor', 'admin')).toBe(false);
  });

  test('active member, non-member, inactive member, manager, and student', async () => {
    expect(await findActiveLabMembership(members, 'member', 'lab-a')).toEqual({ role: 'student' });
    expect(await findActiveLabMembership(members, 'other', 'lab-a')).toBeNull();
    expect(await findActiveLabMembership(members, 'inactive', 'lab-a')).toBeNull();
    expect(await hasActiveLabRole(members, 'pi', 'lab-a', ['principal_researcher'])).toBe(true);
    expect(await hasActiveLabRole(members, 'member', 'lab-a', ['principal_researcher'])).toBe(false);
    const denied = await assertActiveLabMember(members, 'other', 'lab-a');
    expect(denied.ok).toBe(false);
  });

  test('each lifecycle resource denies a non-member and still allows the owner', () => {
    const resources = ['notebook', 'protocol', 'experiment', 'research_data'] as const;
    for (const resource of resources) {
      const owner = canReadLifecycleRecord({
        resource,
        userId: 'owner',
        ownerId: 'owner',
        labId: 'lab-a',
        privacyLevel: resource === 'experiment' ? null : 'private',
        activeMember: false,
      });
      const stranger = canReadLifecycleRecord({
        resource,
        userId: 'stranger',
        ownerId: 'owner',
        labId: 'lab-a',
        privacyLevel: 'lab',
        activeMember: false,
      });
      expect(owner.allowed).toBe(true);
      expect(stranger.allowed).toBe(false);
    }
  });

  test('a lab member can read a lab-visible row and not a private one', () => {
    expect(canReadLifecycleRecord({
      resource: 'notebook',
      userId: 'member',
      ownerId: 'owner',
      labId: 'lab-a',
      privacyLevel: 'lab',
      activeMember: true,
    }).allowed).toBe(true);
    expect(canReadLifecycleRecord({
      resource: 'protocol',
      userId: 'member',
      ownerId: 'owner',
      labId: 'lab-a',
      privacyLevel: 'private',
      activeMember: true,
    }).allowed).toBe(false);
    expect(canReadLifecycleRecord({
      resource: 'research_data',
      userId: 'member',
      ownerId: 'owner',
      labId: 'lab-a',
      privacyLevel: 'lab',
      activeMember: false,
    }).allowed).toBe(false);
    expect(canReadLifecycleRecord({
      resource: 'experiment',
      userId: 'member',
      ownerId: 'owner',
      labId: 'lab-a',
      activeMember: true,
      collaborators: ['someone-else'],
    }).status).toBe(404);
  });

  test('write: owner and PI; co-supervisor only when allowed; students never', () => {
    expect(canWriteLifecycleRecord({
      userId: 'owner',
      ownerId: 'owner',
      labRole: null,
    })).toBe(true);
    expect(canWriteLifecycleRecord({
      userId: 'pi',
      ownerId: 'owner',
      labRole: 'principal_researcher',
    })).toBe(true);
    expect(canWriteLifecycleRecord({
      userId: 'admin',
      ownerId: 'owner',
      labRole: 'admin',
    })).toBe(true);
    expect(canWriteLifecycleRecord({
      userId: 'co',
      ownerId: 'owner',
      labRole: 'co_supervisor',
      allowCoSupervisor: true,
    })).toBe(true);
    expect(canWriteLifecycleRecord({
      userId: 'co',
      ownerId: 'owner',
      labRole: 'co_supervisor',
    })).toBe(false);
    expect(canWriteLifecycleRecord({
      userId: 'member',
      ownerId: 'owner',
      labRole: 'student',
    })).toBe(false);
  });

  test('assertCanWriteLifecycleRecord uses active membership only', async () => {
    expect(await assertCanWriteLifecycleRecord(members, {
      userId: 'pi',
      ownerId: 'owner',
      labId: 'lab-a',
    })).toBe(true);
    expect(await assertCanWriteLifecycleRecord(members, {
      userId: 'member',
      ownerId: 'owner',
      labId: 'lab-a',
    })).toBe(false);
    expect(await assertCanWriteLifecycleRecord(members, {
      userId: 'inactive',
      ownerId: 'owner',
      labId: 'lab-a',
    })).toBe(false);
  });
});
