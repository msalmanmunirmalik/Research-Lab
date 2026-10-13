# QA Progress Update - after P0 fixes
**Date:** 2026-08-03 (continued)

## Status
P0 blockers from the earlier QA run are largely **fixed and retested**.

## Fixed
- Protocol list now includes author-owned protocols (MySQL placeholder bug fixed)
- Protocol author GET / UPDATE / DELETE
- Schema alignment applied via `scripts/apply-qa-p0-schema.cjs` (labs, users profile fields, inventory, instruments, experiments, compliance tables)
- Labs / inventory / settings / cookie policy APIs return 200
- Experiment create works (MySQL id + JSON fields + nullable `project_id`)
- Production CORS tightened to `FRONTEND_URL` allowlist (`NODE_ENV=production`); local still open for tooling
- Playwright helpers/specs updated for dashboard landing + current Protocols/Notebook UI

## Retest results
| Check | Result |
|------|--------|
| GET/POST protocols (author sees own) | PASS |
| labs / inventory / settings | PASS 200 |
| compliance cookies policy | PASS 200 |
| POST /api/experiments | PASS |
| Playwright auth+notebook+protocols | **14/14 PASS** |
| **Full Playwright suite** | **35/35 PASS** |

## How to re-apply schema on another machine
```bash
node scripts/apply-qa-p0-schema.cjs
```

## Still open (next)
- Remaining Playwright suites (experiment tracker, research tools) may still use stale selectors
- Inventory create path may still expect Postgres-style RETURNING
- Broader Jest suite failures (grants/compliance mocks)
- Codacy MCP currently unavailable in this environment
