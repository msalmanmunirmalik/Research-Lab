# Backup and restore

Sprint 1 of the modernization roadmap. This does not change application behaviour.

The person who operates MySQL owns the backups. On this machine that is the local developer. Dump files belong in `backups/`, which is gitignored. No DirectAdmin production host is named yet, so schema work runs against a copy.

`MYSQL_DB` must be set to the same name for the API (`database/config.ts`) and for migrate (`database/migrate.ts`). If it is unset, the pool defaults to `digital_research_manager` and migrate defaults to `researchlab`. Local notes have used `researchlab`. `env.example` uses `digital_research_manager`. Confirm the live name before dumping.

`pnpm db:reset` is disabled. It used to run `psql` and drop a Postgres schema. It is not a MySQL reset.

## Which server

XAMPP MySQL on port 3306 is the local server. Do not start Homebrew MySQL beside it.

Checked on 4 October 2026:

- XAMPP socket `/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock` answered `mysqld is alive`.
- `mysqladmin` through `/tmp/mysql.sock` failed. That client is not talking to XAMPP.

Use the XAMPP binaries:

```bash
export MYSQL_BIN=/Applications/XAMPP/xamppfiles/bin
export MYSQL_SOCK=/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock
```

Load `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DB` from the environment or from `.env.local`. Do not put those values in this file.

## Dump

```bash
mkdir -p backups
"$MYSQL_BIN/mysqldump" \
  --socket="$MYSQL_SOCK" \
  --single-transaction \
  --routines \
  --triggers \
  -u "$MYSQL_USER" -p \
  "$MYSQL_DB" > "backups/drm-${MYSQL_DB}-$(date +%Y%m%d-%H%M%S).sql"
```

Also copy the local `uploads/` tree if that database has file paths that point at it. Those directories are leftovers today. Include them when a dump is taken for a shared database.

## Restore onto a copy

Restore into a new database name. Do not pipe a dump back onto the database you just dumped unless you are recovering that database on purpose.

```bash
"$MYSQL_BIN/mysql" --socket="$MYSQL_SOCK" -u "$MYSQL_USER" -p \
  -e "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}_copy\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

"$MYSQL_BIN/mysql" --socket="$MYSQL_SOCK" -u "$MYSQL_USER" -p \
  "${MYSQL_DB}_copy" < backups/drm-YYYYMMDD-HHMMSS.sql
```

Point a one-off migrate at the copy:

```bash
MYSQL_DB="${MYSQL_DB}_copy" pnpm db:migrate
```

Compare table counts before and after:

```bash
"$MYSQL_BIN/mysql" --socket="$MYSQL_SOCK" -u "$MYSQL_USER" -p -N -e \
  "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='${MYSQL_DB}' ORDER BY table_name"
```

`table_rows` is approximate for InnoDB. For a table the migration writes, also run `SELECT COUNT(*)`.

## Recover the original database

Stop the API. Restore only after the dump file has been opened and the `CREATE TABLE` statements match the database you intend to replace.

```bash
"$MYSQL_BIN/mysql" --socket="$MYSQL_SOCK" -u "$MYSQL_USER" -p \
  "$MYSQL_DB" < backups/drm-YYYYMMDD-HHMMSS.sql
```

Then start the previous application build. Schema sprints do not ship down migrations. The dump is the rollback.

## Dry run before sprint 2

1. Confirm `MYSQL_DB` with `SHOW DATABASES` on the XAMPP socket.
2. Dump that database into `backups/`.
3. Restore it to `${MYSQL_DB}_copy`.
4. Run `MYSQL_DB=${MYSQL_DB}_copy pnpm db:migrate` only against the copy.
5. Compare table counts.
6. Leave the original database unchanged.

Sprint 2 is the first migration that adds the tables mounted handlers already query. It does not run against `researchlab`. It runs against a copy.

## Drill on 4 October 2026

Local env has `MYSQL_DB=researchlab`, user `root`, empty password, host `127.0.0.1`. That is the database this API is configured to use.

`mysqldump --routines` failed: `mysql.proc` has 20 columns and the client expected 21 (`Created with MariaDB 100108, now running 100428`). The successful dump skipped routines and triggers. This application does not keep its schema in stored procedures. Repair `mysql_upgrade` on XAMPP separately. It is not part of sprint 2.

| Item | Result |
|---|---|
| Dump | `backups/drm-researchlab-20261004-052405.sql` (about 2.2 MB). Ends with `Dump completed`. Gitignored. |
| Live tables | 122 in `researchlab` |
| Restore | `researchlab_sprint1_copy`, 122 tables |

The copy is a restore check only. Drop it when it is no longer useful. Other databases on this MySQL server were not dumped and were not modified.

## Secret scan (4 October 2026)

File names only. Values are not recorded here.

| Path | Result |
|---|---|
| `.env`, `.env.local` | Gitignored. Not tracked. |
| `.env.backup.20251206_154717` | Was tracked. It sets `JWT_SECRET`, `GEMINI_API_KEY`, and a database password. `ENCRYPTION_KEY` is set and is shorter than the 64 hex characters the app expects. Removed from the index. The file remains on disk and remains in git history. |
| `*.pem`, `*.key`, credential JSON, private-key blocks, `AKIA` prefixes | None in tracked files. |

Before sprint 2 against any shared database, rotate `JWT_SECRET`, `GEMINI_API_KEY`, and the database password that appeared in that backup. History rewrite was not done.

`.gitignore` now includes `.env.backup.*` and `backups/`.

## Tests recorded this sprint

Commands that already exist:

- `pnpm test` and `pnpm test:unit` — Jest, `tests/unit` and `tests/integration` only
- `pnpm test:integration`
- `pnpm test:playwright` — needs the API on port 5002 and demo auth
- `pnpm test:e2e` — Cypress

`pnpm exec jest tests/unit/LoginPage.test.tsx --watchAll=false` passed: 2 tests.

`pnpm exec jest server/__tests__/auth.test.ts` ran 0 tests. `jest.config.js` `testMatch` does not include `server/__tests__/` or `contexts/__tests__/`. Those files are outside `pnpm test`. Coverage was not expanded in this sprint.

Playwright was not run. It needs a running API.
