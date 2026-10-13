# QA Executive Summary - Digital Research Manager
**Date:** 2026-08-03  
**Environment:** Local (`localhost:5173` + API `:5002` + MySQL `researchlab`)  
**Tester:** Auto (lead QA run while owner in meeting)

## Verdict
**Not production-ready yet.** Auth, local CORS, and Personal Notebook CRUD work. Several core APIs fail due to **MySQL schema drift**. Full Playwright was largely failing on a stale post-login URL; the auth suite is now **8/8 green** after fixes.

## Phase results

| Phase | Result | Notes |
|------|--------|-------|
| 0 Environment | PASS with gaps | App + MySQL up; missing compliance/activity/AI tables |
| 1 Auth | PASS | Register/login/me/logout; UI login works; protected redirect works |
| 2 CORS | PASS / security gap | Local CORS OK; `origin: true` allows any origin |
| 3 Database CRUD | MIXED | Notebook CRUD PASS; Protocols create + author R/U/D fixed; Experiments FAIL; protocol list empty |
| 4 Core workflows | MIXED | Main UI pages load; labs/inventory/settings APIs 500 |
| 5 Security | MIXED | No/garbage token → 401; SQL-ish search → 500; compliance → 500 |
| 6 Automated | MIXED | Auth Playwright 8/8; full run 13/35; Jest partial |
| 7 Smoke | PASS | Landing/login/privacy/cookie routes 200; health OK |

## Critical bugs (fix first)

1. **Schema drift (P0)** - code vs MySQL:
   - `labs.principal_researcher_id` missing → `/api/labs` 500
   - `inventory_items.lab_id` missing → `/api/inventory` 500
   - `users.phone` missing → `/api/settings` 500
   - `experiments` too thin for tracker create
   - Missing: `legal_policies`, `cookie_consents`, `platform_activities`, `user_ai_content`

2. **Protocol list empty (P0)** - create works but `GET /api/protocols` returns `[]` for author without lab.

3. **CORS allow-all (P1)** - tighten to `FRONTEND_URL` in production.

4. **Playwright drift (P1)** - expected `/lab-notebook` after login; app uses `/dashboard` (fixed).

## Fixes applied this session
- Protocol author can GET own protocol when `lab_id` is null
- Protocol UPDATE/DELETE use `last_updated`; materials/tags JSON-stringified
- Playwright auth helper + invalid-credentials assertion updated

## What works
- Auth (API + UI), JWT guards, logout redirect
- Personal notebook CRUD
- Protocol create + author get/update/delete (after fix)
- Local CORS, health, privacy/cookie static pages
- Auth Playwright suite 8/8

## Next 48 hours
1. Align MySQL migrations with live queries
2. Fix protocol list for authors
3. Tighten production CORS
4. Re-run full Playwright
5. Hold deploy until P0 items are green

## Artifacts
- `qa-results/QA_EXECUTIVE_SUMMARY.md` (this file)
- `qa-results/e2e-phase-results-*.md`
- `qa-results/playwright.txt` / `playwright-auth-rerun2.txt`
- `qa-results/jest-ci.txt`
