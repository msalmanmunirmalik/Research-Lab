# Pre-deploy E2E QA - final · 2026-08-04

## Verdict: GO (with notes)

**Playwright: 31/31 passed** (`qa-results/playwright-predeploy-green.txt`)

## What cleared the gate

1. Removed stale E2E for `/research-tools` and `/research-assistant` (redirect to dashboard).
2. Fixed notebook search crash when `tags` is null.
3. Fixed experiments route double-auth rejecting demo/JWT path incorrectly; hardened client array parsing.
4. Re-baselined experiment / notebook / protocols Playwright selectors and API mocks.

## Production notes

- Keep `ENABLE_DEMO_AUTH=false`
- Do not commit `.env`
- Re-add Gemini key if AI features are required
- Optional follow-ups: `negative_results` table; recommendations SQL cleanup
