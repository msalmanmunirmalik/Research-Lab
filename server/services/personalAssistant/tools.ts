/**
 * Personal assistant tools — actions Ask AI can take on behalf of the user.
 * Keep tools user-scoped and low-risk (notes, reminders/tasks, calendar).
 */

import crypto from 'crypto';
import pool from '../../../database/config.js';

export type AssistantToolName =
  | 'create_note'
  | 'list_notes'
  | 'create_reminder'
  | 'list_reminders'
  | 'create_calendar_event'
  | 'list_calendar_events'
  | 'find_protocol'
  | 'find_experiment'
  | 'find_writing_doc';

export type AssistantActionRequest = {
  tool: AssistantToolName;
  args: Record<string, unknown>;
};

export type AssistantActionResult = {
  tool: AssistantToolName;
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  link?: string;
  /** When set, Ask AI UI should navigate here (best single match). */
  navigateTo?: string;
  /** True when search ran but found nothing — caller may fall through to LLM. */
  notFound?: boolean;
};

export const ASSISTANT_TOOL_CATALOG = `
You are the RILOS personal assistant. Prefer INTERNAL tools (no generation).

Library / find tools (always use these first — never invent a protocol):
1. find_protocol — Search the user's protocol library. args: { query: string, open_best?: boolean, limit?: number }
2. find_experiment — Search the user's experiments. args: { query: string, open_best?: boolean, limit?: number }
3. find_writing_doc — Search Writing Studio drafts. args: { query: string, open_best?: boolean, limit?: number }

Personal tools:
4. create_note — args: { content: string, color?: string }
5. list_notes — args: { limit?: number }
6. create_reminder — args: { title: string, due_date?: "YYYY-MM-DD", description?: string, priority?: string }
7. list_reminders — args: { limit?: number }
8. create_calendar_event — args: { title: string, event_date: "YYYY-MM-DD", event_time?: "HH:MM", description?: string }
9. list_calendar_events — args: { limit?: number }

Rules:
- "Find / open / get protocol from my library" → find_protocol ONLY. Do not write a new protocol.
- Prefer create_reminder for "remind me". Prefer create_note for "write in my notes".
- Resolve relative dates using TODAY_ISO and TIMEZONE.
- Never invent tool names. If not an action, mode "chat" with empty actions.
`.trim();

async function getUserLabId(userId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT lab_id FROM lab_members
     WHERE user_id = $1 AND is_active = 1
     ORDER BY joined_at ASC, lab_id ASC
     LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.lab_id || null;
}

async function resolveWorkspaceInbox(userId: string): Promise<{
  workspaceId: string;
  listId: string;
  spaceId: string;
} | null> {
  const labId = await getUserLabId(userId);
  if (!labId) return null;

  let ws = await pool.query(
    `SELECT id FROM lab_workspaces WHERE lab_id = $1 LIMIT 1`,
    [labId]
  );
  let workspaceId = ws.rows[0]?.id as string | undefined;
  if (!workspaceId) {
    workspaceId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO lab_workspaces (id, lab_id, name, created_by)
       VALUES ($1, $2, 'Lab Workspace', $3)`,
      [workspaceId, labId, userId]
    );
  }

  const inbox = await pool.query(
    `SELECT l.id AS list_id, l.space_id
     FROM workspace_lists l
     JOIN workspace_spaces s ON s.id = l.space_id
     WHERE s.workspace_id = $1 AND l.name = 'Inbox' AND l.is_archived = 0
     ORDER BY l.created_at ASC LIMIT 1`,
    [workspaceId]
  );
  if (inbox.rows[0]) {
    return {
      workspaceId,
      listId: inbox.rows[0].list_id,
      spaceId: inbox.rows[0].space_id,
    };
  }

  let spaceId: string;
  const spaceRes = await pool.query(
    `SELECT id FROM workspace_spaces WHERE workspace_id = $1 AND is_archived = 0
     ORDER BY position ASC LIMIT 1`,
    [workspaceId]
  );
  if (spaceRes.rows[0]) {
    spaceId = spaceRes.rows[0].id;
  } else {
    spaceId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO workspace_spaces (id, workspace_id, name, created_by, position)
       VALUES ($1, $2, 'General', $3, 0)`,
      [spaceId, workspaceId, userId]
    );
  }

  const listId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO workspace_lists (id, space_id, name, created_by, position)
     VALUES ($1, $2, 'Inbox', $3, 0)`,
    [listId, spaceId, userId]
  );
  return { workspaceId, listId, spaceId };
}

export async function executeAssistantTool(
  userId: string,
  action: AssistantActionRequest
): Promise<AssistantActionResult> {
  const { tool, args } = action;
  try {
    switch (tool) {
      case 'create_note': {
        const content = String(args.content || '').trim();
        if (!content) {
          return { tool, ok: false, summary: 'Note content is required', error: 'missing_content' };
        }
        const color = String(args.color || 'yellow');
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO quick_notes (id, user_id, content, color) VALUES ($1, $2, $3, $4)`,
          [id, userId, content, color]
        );
        return {
          tool,
          ok: true,
          summary: `Saved note: “${content.slice(0, 80)}${content.length > 80 ? '…' : ''}”`,
          data: { id, content, color },
          link: '/dashboard',
        };
      }
      case 'list_notes': {
        const limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(
          `SELECT id, content, color, created_at FROM quick_notes
           WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [userId, limit]
        );
        const lines = r.rows.map(
          (n: { content: string; created_at: string }, i: number) =>
            `${i + 1}. ${String(n.content).slice(0, 120)}`
        );
        return {
          tool,
          ok: true,
          summary:
            lines.length > 0
              ? `Recent notes:\n${lines.join('\n')}`
              : 'You have no quick notes yet.',
          data: { notes: r.rows },
          link: '/dashboard',
        };
      }
      case 'create_reminder': {
        const title = String(args.title || '').trim();
        if (!title) {
          return { tool, ok: false, summary: 'Reminder title is required', error: 'missing_title' };
        }
        const inbox = await resolveWorkspaceInbox(userId);
        if (!inbox) {
          return {
            tool,
            ok: false,
            summary: 'Could not find or create your lab workspace for reminders.',
            error: 'no_workspace',
          };
        }
        const due = args.due_date ? String(args.due_date).slice(0, 10) : null;
        const description = args.description ? String(args.description) : null;
        const priority = String(args.priority || 'normal');
        const id = crypto.randomUUID();
        const pos = await pool.query(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
           FROM workspace_tasks WHERE list_id = $1`,
          [inbox.listId]
        );
        await pool.query(
          `INSERT INTO workspace_tasks (
            id, workspace_id, space_id, list_id, title, description, status, priority,
            due_date, assignee_id, created_by, tags, position
          ) VALUES ($1,$2,$3,$4,$5,$6,'to_do',$7,$8,$9,$10,'[]',$11)`,
          [
            id,
            inbox.workspaceId,
            inbox.spaceId,
            inbox.listId,
            title,
            description,
            priority,
            due,
            userId,
            userId,
            pos.rows[0]?.next_position ?? 0,
          ]
        );
        return {
          tool,
          ok: true,
          summary: due
            ? `Reminder set: “${title}” (due ${due})`
            : `Reminder set: “${title}”`,
          data: { id, title, due_date: due },
          link: '/lab-workspace',
        };
      }
      case 'list_reminders': {
        const limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(
          `SELECT id, title, due_date, status, priority
           FROM workspace_tasks
           WHERE assignee_id = $1 AND status NOT IN ('done', 'cancelled')
           ORDER BY
             CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
             due_date ASC,
             created_at DESC
           LIMIT $2`,
          [userId, limit]
        );
        const lines = r.rows.map(
          (t: { title: string; due_date?: string }, i: number) =>
            `${i + 1}. ${t.title}${t.due_date ? ` (due ${String(t.due_date).slice(0, 10)})` : ''}`
        );
        return {
          tool,
          ok: true,
          summary:
            lines.length > 0
              ? `Open reminders:\n${lines.join('\n')}`
              : 'No open reminders.',
          data: { tasks: r.rows },
          link: '/lab-workspace',
        };
      }
      case 'create_calendar_event': {
        const title = String(args.title || '').trim();
        const eventDate = String(args.event_date || '').slice(0, 10);
        if (!title || !eventDate) {
          return {
            tool,
            ok: false,
            summary: 'Calendar events need a title and date (YYYY-MM-DD).',
            error: 'missing_fields',
          };
        }
        const eventTime = args.event_time ? String(args.event_time) : null;
        const description = args.description ? String(args.description) : null;
        const r = await pool.query(
          `INSERT INTO calendar_events (user_id, title, description, start_time, end_time, event_type, all_day)
           VALUES ($1, $2, $3, $4, $5, 'meeting', $6)
           RETURNING *`,
          [userId, title, description, eventDate, eventTime, !eventTime]
        );
        return {
          tool,
          ok: true,
          summary: `Calendar event added: “${title}” on ${eventDate}${eventTime ? ` at ${eventTime}` : ''}`,
          data: r.rows[0],
          link: '/dashboard',
        };
      }
      case 'list_calendar_events': {
        const limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(
          `SELECT id, title, start_time, end_time, event_type
           FROM calendar_events
           WHERE user_id = $1 AND start_time >= CURDATE()
           ORDER BY start_time ASC
           LIMIT $2`,
          [userId, limit]
        );
        const lines = r.rows.map(
          (e: { title: string; start_time: string }, i: number) =>
            `${i + 1}. ${e.title} (${String(e.start_time).slice(0, 10)})`
        );
        return {
          tool,
          ok: true,
          summary:
            lines.length > 0
              ? `Upcoming events:\n${lines.join('\n')}`
              : 'No upcoming calendar events.',
          data: { events: r.rows },
          link: '/dashboard',
        };
      }
      case 'find_protocol': {
        return findProtocolsForUser(userId, args);
      }
      case 'find_experiment': {
        return findExperimentsForUser(userId, args);
      }
      case 'find_writing_doc': {
        return findWritingDocsForUser(userId, args);
      }
      default:
        return {
          tool,
          ok: false,
          summary: `Unknown tool: ${tool}`,
          error: 'unknown_tool',
        };
    }
  } catch (err: unknown) {
    console.error(`Personal assistant tool ${tool} failed:`, err);
    return {
      tool,
      ok: false,
      summary: `Failed to run ${tool}: ${(err as Error).message || 'error'}`,
      error: (err as Error).message,
    };
  }
}

function scoreTextMatch(query: string, haystack: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const h = haystack.toLowerCase();
  let score = 0;
  if (h.includes(q)) score += 20;
  for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
    if (h.includes(token)) score += 3;
  }
  return score;
}

async function findProtocolsForUser(
  userId: string,
  args: Record<string, unknown>
): Promise<AssistantActionResult> {
  const query = String(args.query || '').trim();
  const limit = Math.min(Number(args.limit) || 8, 20);
  const openBest = args.open_best !== false;

  const result = await pool.query(
    `SELECT p.id, p.title, p.description, p.category, p.tags, p.research_area,
            p.techniques, p.updated_at
     FROM protocols p
     WHERE (p.is_approved = 1 OR p.is_approved = true OR p.is_approved IS NULL)
       AND (
         p.author_id = $1
         OR p.privacy_level = 'public'
         OR (p.lab_id IS NOT NULL AND p.lab_id IN (
           SELECT lab_id FROM lab_members WHERE user_id = $2 AND is_active = 1
         ))
       )
     ORDER BY p.updated_at DESC
     LIMIT 200`,
    [userId, userId]
  );

  type ProtoRow = {
    id: string;
    title: string;
    description?: string;
    category?: string;
    tags?: unknown;
    research_area?: string;
    techniques?: string;
  };

  let ranked = (result.rows as ProtoRow[]).map((row) => {
    const tags =
      typeof row.tags === 'string'
        ? row.tags
        : Array.isArray(row.tags)
          ? row.tags.join(' ')
          : '';
    const blob = [
      row.title,
      row.description,
      row.category,
      row.research_area,
      row.techniques,
      tags,
    ]
      .filter(Boolean)
      .join(' ');
    return { row, score: scoreTextMatch(query, blob) };
  });

  if (query) {
    ranked = ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  }

  const top = ranked.slice(0, limit).map((r) => r.row);

  if (!top.length) {
    return {
      tool: 'find_protocol',
      ok: true,
      notFound: true,
      summary: query
        ? `No protocols in your library matched “${query}”.`
        : 'No protocols found in your library.',
      data: { protocols: [], query },
      link: '/protocols',
    };
  }

  const lines = top.map(
    (p, i) => `${i + 1}. ${p.title}${p.category ? ` (${p.category})` : ''}`
  );
  const best = top[0];
  const navigateTo =
    openBest && top.length === 1
      ? `/protocols/${best.id}`
      : openBest && ranked[0] && ranked[0].score >= 8
        ? `/protocols/${best.id}`
        : undefined;

  return {
    tool: 'find_protocol',
    ok: true,
    summary:
      top.length === 1
        ? `Found in your library: “${best.title}”.`
        : `Found ${top.length} protocols in your library for “${query || 'all'}”:\n${lines.join('\n')}`,
    data: {
      protocols: top.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        link: `/protocols/${p.id}`,
      })),
      query,
    },
    link: `/protocols/${best.id}`,
    navigateTo,
  };
}

async function findExperimentsForUser(
  userId: string,
  args: Record<string, unknown>
): Promise<AssistantActionResult> {
  const query = String(args.query || '').trim();
  const limit = Math.min(Number(args.limit) || 8, 20);
  const openBest = Boolean(args.open_best);

  const result = await pool.query(
    `SELECT id, title, status, description, updated_at
     FROM experiments
     WHERE researcher_id = $1 OR created_by = $1
     ORDER BY updated_at DESC
     LIMIT 150`,
    [userId]
  ).catch(async () =>
    pool.query(
      `SELECT id, title, status, description, updated_at
       FROM experiments
       WHERE researcher_id = $1
       ORDER BY updated_at DESC
       LIMIT 150`,
      [userId]
    )
  );

  type ExpRow = { id: string; title: string; status?: string; description?: string };
  let ranked = (result.rows as ExpRow[]).map((row) => ({
    row,
    score: scoreTextMatch(query, `${row.title} ${row.description || ''} ${row.status || ''}`),
  }));
  if (query) {
    ranked = ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  }
  const top = ranked.slice(0, limit).map((r) => r.row);
  if (!top.length) {
    return {
      tool: 'find_experiment',
      ok: true,
      notFound: true,
      summary: `No experiments matched “${query}”.`,
      data: { experiments: [] },
      link: '/experiment-tracker',
    };
  }
  const best = top[0];
  return {
    tool: 'find_experiment',
    ok: true,
    summary:
      top.length === 1
        ? `Found experiment: “${best.title}”.`
        : `Found ${top.length} experiments:\n${top.map((e, i) => `${i + 1}. ${e.title}`).join('\n')}`,
    data: {
      experiments: top.map((e) => ({
        id: e.id,
        title: e.title,
        link: `/experiment-tracker?experimentId=${e.id}`,
      })),
    },
    link: `/experiment-tracker?experimentId=${best.id}`,
    navigateTo:
      openBest && (top.length === 1 || (ranked[0]?.score || 0) >= 8)
        ? `/experiment-tracker?experimentId=${best.id}`
        : undefined,
  };
}

async function findWritingDocsForUser(
  userId: string,
  args: Record<string, unknown>
): Promise<AssistantActionResult> {
  const query = String(args.query || '').trim();
  const limit = Math.min(Number(args.limit) || 8, 20);
  const openBest = Boolean(args.open_best);

  const result = await pool.query(
    `SELECT id, title, status, updated_at
     FROM writing_documents
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 100`,
    [userId]
  );

  type DocRow = { id: string; title: string; status?: string };
  let ranked = (result.rows as DocRow[]).map((row) => ({
    row,
    score: scoreTextMatch(query, `${row.title} ${row.status || ''}`),
  }));
  if (query) {
    ranked = ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  }
  const top = ranked.slice(0, limit).map((r) => r.row);
  if (!top.length) {
    return {
      tool: 'find_writing_doc',
      ok: true,
      notFound: true,
      summary: `No Writing Studio drafts matched “${query}”.`,
      data: { documents: [] },
      link: '/writing-studio',
    };
  }
  const best = top[0];
  return {
    tool: 'find_writing_doc',
    ok: true,
    summary:
      top.length === 1
        ? `Found draft: “${best.title}”.`
        : `Found ${top.length} drafts:\n${top.map((d, i) => `${i + 1}. ${d.title}`).join('\n')}`,
    data: {
      documents: top.map((d) => ({
        id: d.id,
        title: d.title,
        link: `/writing-studio/m/${d.id}`,
      })),
    },
    link: `/writing-studio/m/${best.id}`,
    navigateTo:
      openBest && (top.length === 1 || (ranked[0]?.score || 0) >= 8)
        ? `/writing-studio/m/${best.id}`
        : undefined,
  };
}
