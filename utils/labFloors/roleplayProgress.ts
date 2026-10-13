import type { RoleplayModule, RoleplayRunProgress } from './roleplayTypes';

const STORAGE_KEY = 'rilos_lab_floors_roleplay_v1';
const LEGACY_STORAGE_KEY = 'drm_lab_floors_roleplay_v1';

function queueSync(roleplay: Record<string, RoleplayRunProgress>) {
  void import('./sync').then((m) => m.scheduleLabFloorsPush(undefined, roleplay));
}

function migrateLegacy(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) localStorage.setItem(STORAGE_KEY, legacy);
  } catch {
    /* ignore */
  }
}

function readAll(): Record<string, RoleplayRunProgress> {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, RoleplayRunProgress>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, RoleplayRunProgress>, sync = true): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota */
  }
  if (sync) queueSync(all);
}

export function loadAllRoleplayRuns(): Record<string, RoleplayRunProgress> {
  return readAll();
}

export function replaceAllRoleplayRuns(all: Record<string, RoleplayRunProgress>): void {
  writeAll(all, false);
}

export function loadRoleplayRun(moduleId: string): RoleplayRunProgress | null {
  return readAll()[moduleId] || null;
}

export function saveRoleplayRun(run: RoleplayRunProgress): void {
  const all = readAll();
  all[run.moduleId] = { ...run, updatedAt: new Date().toISOString() };
  writeAll(all);
}

export function startRoleplayRun(module: RoleplayModule): RoleplayRunProgress {
  const first = module.beats[0];
  const run: RoleplayRunProgress = {
    moduleId: module.id,
    currentBeatId: first.id,
    beatProgress: {
      [first.id]: { beatId: first.id, turnCount: 0 },
    },
    updatedAt: new Date().toISOString(),
  };
  saveRoleplayRun(run);
  return run;
}

export function markBeatTurn(run: RoleplayRunProgress, beatId: string): RoleplayRunProgress {
  const prev = run.beatProgress[beatId] || { beatId, turnCount: 0 };
  const next: RoleplayRunProgress = {
    ...run,
    beatProgress: {
      ...run.beatProgress,
      [beatId]: { ...prev, turnCount: prev.turnCount + 1 },
    },
  };
  saveRoleplayRun(next);
  return next;
}

export function completeBeatAndAdvance(
  module: RoleplayModule,
  run: RoleplayRunProgress,
  beatId: string
): RoleplayRunProgress {
  const idx = module.beats.findIndex((b) => b.id === beatId);
  const nextBeat = idx >= 0 ? module.beats[idx + 1] : undefined;
  const prev = run.beatProgress[beatId] || { beatId, turnCount: 0 };
  const next: RoleplayRunProgress = {
    ...run,
    currentBeatId: nextBeat?.id || beatId,
    beatProgress: {
      ...run.beatProgress,
      [beatId]: { ...prev, completedAt: new Date().toISOString() },
      ...(nextBeat
        ? {
            [nextBeat.id]:
              run.beatProgress[nextBeat.id] || { beatId: nextBeat.id, turnCount: 0 },
          }
        : {}),
    },
    completedAt: nextBeat ? run.completedAt : new Date().toISOString(),
  };
  saveRoleplayRun(next);
  return next;
}

export function isRoleplayComplete(module: RoleplayModule, run: RoleplayRunProgress | null): boolean {
  if (!run) return false;
  if (run.completedAt) return true;
  return module.beats.every((b) => Boolean(run.beatProgress[b.id]?.completedAt));
}
