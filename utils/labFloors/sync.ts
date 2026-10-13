/**
 * Sync Lab Floors progress with the account while keeping localStorage as offline cache.
 */

import { getAuthHeaders, getAuthToken, resolveApiBaseUrl } from '../apiBase';
import type { LabFloorsProgress } from './types';
import type { RoleplayRunProgress } from './roleplayTypes';
import { loadLabFloorsProgress, replaceLabFloorsProgress } from './progress';
import {
  loadAllRoleplayRuns,
  replaceAllRoleplayRuns,
} from './roleplayProgress';

const API = () => `${resolveApiBaseUrl()}/lab-floors/progress`;

export type LabFloorsServerPayload = {
  floors: LabFloorsProgress;
  roleplay: Record<string, RoleplayRunProgress>;
  updatedAt?: string;
};

function mergeFloors(local: LabFloorsProgress, remote: LabFloorsProgress): LabFloorsProgress {
  const completions = { ...local.completions };
  for (const [id, remoteDone] of Object.entries(remote.completions || {})) {
    const localDone = completions[id];
    if (!localDone) {
      completions[id] = remoteDone;
      continue;
    }
    const localAt = Date.parse(localDone.completedAt || '') || 0;
    const remoteAt = Date.parse(remoteDone.completedAt || '') || 0;
    completions[id] = remoteAt >= localAt ? remoteDone : localDone;
  }
  return {
    role: remote.role || local.role || 'phd',
    completions,
  };
}

function mergeRoleplay(
  local: Record<string, RoleplayRunProgress>,
  remote: Record<string, RoleplayRunProgress>
): Record<string, RoleplayRunProgress> {
  const out = { ...local };
  for (const [id, remoteRun] of Object.entries(remote || {})) {
    const localRun = out[id];
    if (!localRun) {
      out[id] = remoteRun;
      continue;
    }
    const localAt = Date.parse(localRun.updatedAt || localRun.completedAt || '') || 0;
    const remoteAt = Date.parse(remoteRun.updatedAt || remoteRun.completedAt || '') || 0;
    out[id] = remoteAt >= localAt ? remoteRun : localRun;
  }
  return out;
}

/** Pull server state, merge with local cache, write both sides if needed. */
export async function hydrateLabFloorsFromServer(): Promise<LabFloorsServerPayload | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(API(), { headers: getAuthHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as LabFloorsServerPayload;
    const localFloors = loadLabFloorsProgress();
    const localRoleplay = loadAllRoleplayRuns();
    const floors = mergeFloors(localFloors, data.floors || { role: 'phd', completions: {} });
    const roleplay = mergeRoleplay(localRoleplay, data.roleplay || {});
    replaceLabFloorsProgress(floors);
    replaceAllRoleplayRuns(roleplay);

    // If local had newer completions, push merged result
    const localNewer =
      JSON.stringify(localFloors) !== JSON.stringify(data.floors) ||
      JSON.stringify(localRoleplay) !== JSON.stringify(data.roleplay);
    if (localNewer) {
      void pushLabFloorsToServer(floors, roleplay);
    }

    return { floors, roleplay, updatedAt: data.updatedAt };
  } catch {
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleLabFloorsPush(
  floors?: LabFloorsProgress,
  roleplay?: Record<string, RoleplayRunProgress>
): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushLabFloorsToServer(
      floors || loadLabFloorsProgress(),
      roleplay || loadAllRoleplayRuns()
    );
  }, 400);
}

export async function pushLabFloorsToServer(
  floors: LabFloorsProgress,
  roleplay: Record<string, RoleplayRunProgress>
): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;
  try {
    const res = await fetch(API(), {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ floors, roleplay }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
