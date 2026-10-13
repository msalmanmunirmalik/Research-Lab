import type {
  FloorCompletion,
  LabFloorsProgress,
  PathStep,
  RoleId,
  SkillVerdict,
} from './types';

const STORAGE_KEY = 'rilos_lab_floors_progress_v1';
const LEGACY_STORAGE_KEY = 'drm_lab_floors_progress_v1';

function queueSync(floors: LabFloorsProgress) {
  void import('./sync').then((m) => m.scheduleLabFloorsPush(floors));
}

const DEFAULT: LabFloorsProgress = {
  role: 'phd',
  completions: {},
};

function migrateLegacy(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) localStorage.setItem(STORAGE_KEY, legacy);
  } catch {
    /* ignore */
  }
}

function readRaw(): LabFloorsProgress {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT, completions: {} };
    const parsed = JSON.parse(raw) as LabFloorsProgress;
    return {
      role: parsed.role || 'phd',
      completions: parsed.completions && typeof parsed.completions === 'object' ? parsed.completions : {},
    };
  } catch {
    return { ...DEFAULT, completions: {} };
  }
}

function writeRaw(progress: LabFloorsProgress, sync = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* private mode / quota */
  }
  if (sync) queueSync(progress);
}

export function loadLabFloorsProgress(): LabFloorsProgress {
  return readRaw();
}

/** Replace local cache without triggering another server push (used during hydrate). */
export function replaceLabFloorsProgress(progress: LabFloorsProgress): void {
  writeRaw(progress, false);
}

export function setLabFloorsRole(role: RoleId): LabFloorsProgress {
  const next = { ...readRaw(), role };
  writeRaw(next);
  return next;
}

export function getFloorCompletion(floorId: string): FloorCompletion | null {
  return readRaw().completions[floorId] || null;
}

export function mergeSkillVerdicts(
  a: Record<string, SkillVerdict>,
  b: Record<string, SkillVerdict>
): Record<string, SkillVerdict> {
  const rank: Record<SkillVerdict, number> = { miss: 0, ok: 1, good: 2 };
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!out[k] || rank[v] > rank[out[k]]) out[k] = v;
  }
  return out;
}

export function saveFloorCompletion(
  floorId: string,
  role: RoleId,
  path: PathStep[],
  skillResults: Record<string, SkillVerdict>
): LabFloorsProgress {
  const prev = readRaw();
  const existing = prev.completions[floorId];
  const mergedSkills = existing
    ? mergeSkillVerdicts(existing.skillResults, skillResults)
    : skillResults;
  const next: LabFloorsProgress = {
    ...prev,
    role,
    completions: {
      ...prev.completions,
      [floorId]: {
        completedAt: new Date().toISOString(),
        role,
        path,
        skillResults: mergedSkills,
      },
    },
  };
  writeRaw(next);
  return next;
}

export function completedFloorCount(progress: LabFloorsProgress): number {
  return Object.keys(progress.completions).length;
}

export const ROLE_OPTIONS: Array<{ id: RoleId; label: string; blurb: string }> = [
  {
    id: 'phd',
    label: 'PhD student',
    blurb: 'You’re building independence and ownership of a project.',
  },
  {
    id: 'ra',
    label: 'Research assistant',
    blurb: 'You’re supporting projects and learning the lab’s operating system.',
  },
  {
    id: 'intern',
    label: 'Visiting intern',
    blurb: 'You’re new, time-limited, and need to learn fast without creating risk.',
  },
];
