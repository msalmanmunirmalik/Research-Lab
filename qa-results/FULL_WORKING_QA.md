# Full Working QA - 2026-08-04

## Verdict: PASS

| Suite | Score |
|-------|------:|
| Working QA (routes/forms/CRUD/API) | **77/77** |
| Playwright E2E | **31/31** |

## Fixes applied during this pass

1. **Experiment detail GET** - MySQL-incompatible `ANY()` / progress function; duplicate `$2` placeholder bug
2. **Negative results** - created tables (`mysql_negative_results.sql`); MySQL `CONCAT` instead of `||`
3. **Marketplace** - added `GET /api/marketplace` summary endpoint
4. **Protocol CRUD smoke** - create payload now includes required `content`

## How to re-run

```bash
node qa-results/run-full-working-qa.mjs
pnpm exec playwright test
```

Details: `qa-results/full-working-qa.json`
