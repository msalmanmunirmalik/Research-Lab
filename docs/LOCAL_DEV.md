# Local development (current stack)

Product branding: **RILOS** — see `docs/RILOS_ALIGNMENT_PLAN.md`.

## Canonical ports

| Service | Port |
|---------|------|
| Vite frontend | 5173 |
| Express API | 5002 |
| Stats (optional) | 5003 |
| MySQL (XAMPP) | 3306 |

Do **not** run Homebrew MySQL alongside XAMPP.

## Start

```bash
# Free stale Node listeners
pnpm run fix-ports

# Frontend + API only (recommended daily)
pnpm run dev:app
```

Open http://localhost:5173 — browser calls `/api/*` which Vite proxies to Express on 5002.

Health check: `pnpm run wait:api` or `curl http://127.0.0.1:5002/api/health`

## Env

- `VITE_API_URL=/api` — same-origin via Vite proxy (see `.env`)
- `PORT=5002` — Express
- `MYSQL_*` — XAMPP MySQL. This machine has used database name `researchlab`. `env.example` uses `digital_research_manager`. Set `MYSQL_DB` explicitly to the database the API already uses before migrating. Backup and restore: `docs/BACKUP_AND_RESTORE.md`. Do not run `pnpm db:reset`.

## If login shows “API not reachable”

1. Confirm XAMPP MySQL is running  
2. `pnpm run wait:api`  
3. Restart with `pnpm run dev:clean`
