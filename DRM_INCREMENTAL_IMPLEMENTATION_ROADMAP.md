# DRM Incremental Implementation Roadmap

Date: 4 October 2026.  
Status: planning only. Do not start sprint 2 until the product owner approves it and a backup exists for any shared database.

Related: `DRM_MODERNIZATION_MASTER_PLAN.md`, `DRM_DATABASE_CONSOLIDATION_PLAN.md`, `DRM_SECURITY_MODERNIZATION_PLAN.md`.

Each sprint is independently deployable. Do not combine them into a rewrite. Later sprints stay blocked while a P0 item from an earlier sprint is open.

Rollback for schema work is a MySQL restore plus a compatibility read of the old table. These sprints do not ship down migrations. Application rollback is the previous deploy artifact. Schema that has already been applied stays compatible with the previous artifact until the sprint’s definition of done says the old read path can go.

New SQL files go in `database/migrations/` only. Refresh `directadmin-package/` with `pnpm pack:directadmin` in the same sprint that adds a migration. Do not edit the package SQL by hand.

---

## Enhancement and innovation permission

Accepted 4 October 2026. This permission applies while integrating external APIs. It does not reopen finished sprints, and it does not cancel the gates in “Order and gates.” An enhancement ships inside the sprint that already owns that module, or as its own later sprint with the same file, test, security, and rollback shape. Do not start it in parallel with a sprint that edits the same files.

Connecting an API to the screen that already calls it is the minimum. When the new data makes a clearer research workflow possible, design and implement that improvement.

Authorized when it gives researchers or labs a concrete gain:

- A meaningful improvement to a feature that already exists.
- Useful behaviour added to an existing module.
- A link between DRM areas that are currently isolated.
- A clearer dashboard, analytic, or visualization.
- Automation of a research workflow.
- New Research Intelligence.
- A recommendation or alert a researcher can act on.
- Better discovery of researchers, labs, funding, publications, datasets, or collaborators.
- A new feature when no existing module can hold it without distortion.

Prefer work that joins more than one part of the research lifecycle: lab, project, protocol, experiment, notebook, evidence, analysis, writing, publication, funding, and collaboration.

Examples that fit this permission: research trends, opportunity matching, collaborator recommendations, topic intelligence, funding intelligence, clinical translation signals, dataset recommendations, institutional intelligence, literature relationships, and research alerts. Build the ones the data actually supports. Leave the ones that would only duplicate an existing page.

Constraints:

- Skip features that do not change a researcher’s work, and do not add a second copy of a module that already exists.
- Put the enhancement in the existing module that already owns that job. Add a new surface only when no current module can carry it.
- Keep the current stack, route style, and visual language.
- Keep authorization, privacy, and provenance. Imported facts record source, provider id, and retrieved time. Do not overwrite a stored citation count from one provider with another.
- Write the decision into this roadmap, or into the master plan if it changes architecture, before the feature is treated as done.
- Server-side connectors only. Browser code calls DRM routes. It does not call the provider.

### OpenAlex

OpenAlex is an approved core Research Intelligence source. Use it where it improves publications, researchers, institutions, topics, citation relationships, trends, recommendations, and the DRM features that depend on them.

The connector is `server/services/scholarly/openalex.ts`, reached through `server/services/scholarly/ScholarlyService.ts` and `/api/research/*`. Extend that connector. Do not add a second OpenAlex client, and do not call `https://api.openalex.org` from React.

Key handling:

- Read the key only from `OPENALEX_API_KEY` in the server environment. `OPENALEX_MAILTO` stays the polite-pool contact and is not a substitute for the key.
- Do not hard-code the key, send it to the browser, commit it, or write it in logs, errors, or this document.
- The value belongs in `.env` or `.env.local`, which are gitignored. `env.example` may keep an empty `OPENALEX_API_KEY=` line.
- If `OPENALEX_API_KEY` is missing, OpenAlex calls fail soft: search and related DRM screens keep working with the other providers or with an empty OpenAlex result. A missing key must not take down login, labs, notebook, writing, or any route that does not need OpenAlex.

Provenance for OpenAlex rows stays on the scholarly cache and audit path (sprint 20). Saved works still land in `papers` and the user library. Do not copy the OpenAlex corpus into DRM.

Shipped on 4 October 2026, under this permission. Writing Studio’s library (the live literature surface) and the Evidence & References component have an Intelligence tab, `GET /api/research/intelligence?q=`. The brief is built in `server/services/scholarly/researchIntelligence.ts` through `openalex.ts` only. It returns the matched topic, a publication-year trend, researchers, institutions, funders named on sampled works, dataset records, recent works, and clinical-trial works when the topic is biomedical. Open DRM grants whose title, summary, or programme matches the topic are linked to Funding. Those grant rows are read on each request and are not stored in `scholarly_cache`. Related papers use OpenAlex `related_works`, with a title search only when that list is empty. A failed OpenAlex call returns an unavailable brief and leaves search, login, and the rest of DRM working. The key stays in `OPENALEX_API_KEY` and is not logged.

---

## Sprint 1 — Baseline and backup

Status: done on 4 October 2026. Record is `docs/BACKUP_AND_RESTORE.md`. Decisions in the master plan section 14.9 are accepted.

**Objective.** Freeze the stack and make the next schema sprint recoverable. No product behaviour change.

**Phase.** 0.

**Files / modules.** `docs/BACKUP_AND_RESTORE.md` (new). `package.json` script comment or `docs` note that `db:reset` is not the MySQL procedure. No change to `server/index.ts`.

**Tables.** None.

**Migration.** None.

**APIs.** None.

**Frontend.** None.

**Security.** Secret scan of the tree for committed `.env` files, private keys, and live provider keys. Record findings. Do not print secret values into the doc.

**Tests.** List the commands that already exist (`pnpm test`, Playwright auth and notebook specs) and run the auth subset once if a local MySQL is available. Record pass or the exact blocker. Do not expand coverage in this sprint.

**Rollback.** Delete the doc. Nothing else changed.

**Definition of done.**

- Backup command, restore command, and who owns them are written.
- `MYSQL_DB` is documented as required and identical for the API and migrate.
- `pnpm db:reset` is marked do-not-use.
- Secret-scan result is recorded with file names only.
- Product owner has named the first shared database this program may touch, or has confirmed that early sprints run on a copy.

---

## Sprint 2 — Schema truth

Status: done on 4 October 2026 against `researchlab_sprint1_copy` and a throwaway `researchlab_sprint2_empty`. The live `researchlab` database was not migrated.

**Objective.** A database created only by `pnpm db:migrate` contains every table mounted handlers query. The API process does not create tables.

**Phase.** 1.

**Files / modules.**

- New migration under `database/migrations/` for the missing tables listed in the database plan section 16.
- `server/services/platformAiAccess.ts` (remove `CREATE TABLE`).
- `server/routes/negativeResults.ts` (use `negative_result_saves` if the columns match).
- `server/services/ContinuousLearningEngine.ts` only if its upsert is Postgres `ON CONFLICT` and must become MySQL `ON DUPLICATE KEY UPDATE`.
- `database/migrate.ts` and `database/config.ts` defaults: both fall back to the same database name, `digital_research_manager`, so an unset `MYSQL_DB` cannot migrate a different schema than the pool. Prefer failing when `MYSQL_DB` is unset in production instead of relying on the default.

**Tables.** Create only what handlers already use: `calendar_events`, `instrument_maintenance`, `resource_exchange_requests`, `resource_exchange_offers`, `data_templates`, `experiment_risks`, `experiment_comments`, `successful_alternatives`, `failure_patterns`, `negative_results_contributor_stats`, `user_ai_failure_patterns`. Reuse `negative_result_saves` and `ai_platform_usage`. Alter `users` defaults for `role` and `status` (`student`, `active`). Do not rewrite existing user rows.

**Migration.** One new forward file plus, if required, a small `ALTER` for `users` defaults. Column lists are copied from the INSERT and SELECT in the handler, not invented. Regenerate the DirectAdmin package.

**APIs.** Existing calendar, maintenance, resource-exchange, data-template, experiment risk and comment, negative-result, and AI usage routes start returning empty lists instead of failing on a missing table. Paths stay the same.

**Frontend.** None expected. If a screen already calls those APIs, it should load an empty state. Verify the instrument maintenance panel and the negative-results save action.

**Security.** Creating tables does not add authorization. Do not widen who can call these routes. User default `active` matches middleware. It does not verify email.

**Tests.**

- Migration test: empty database, `pnpm db:migrate`, then `information_schema` contains each table above.
- Boot the API and assert it does not issue `CREATE TABLE` (spy or log grep in a test harness).
- One handler test per new table: authenticated insert or select returns 200 and not a “table does not exist” error.

**Rollback.** Restore the database backup. Redeploy the previous API so `platformAiAccess.ts` can create `ai_platform_usage` again on old databases that lack the migration. Do not drop the new tables on a database that has started to store rows. Leave them. They are unused by the old code except where the old code already expected them.

**Definition of done.** Fresh migrate plus API boot satisfies the acceptance list in the database plan section 21. No `CREATE TABLE` remains in `platformAiAccess.ts`. Existing user rows are unchanged.

---

## Sprint 3 — Experiment shape heal

Status: done on 4 October 2026. Applied to `researchlab` and `researchlab_sprint1_copy`. Both already had the tracker columns and zero experiment rows. The heal added `idx_experiments_lab`, `idx_experiments_protocol`, and `idx_experiments_researcher`. A thin-table fixture backfilled `title` from `name` and kept `name` and `goal`. A second apply did not error.

**Objective.** `experiments` has the tracker columns on every database, whether or not the thin table from `mysql_migration.sql` was created first.

**Phase.** 1.

**Files / modules.** New `database/migrations/mysql_experiments_shape_heal.sql`. Read `mysql_experiments_schema.sql` and `mysql_experiments_patch.sql` for the column types. No change to historical migration files that may already be in `schema_migrations`.

**Tables.** `experiments`. Add only missing columns: `title`, `description`, `hypothesis`, `objectives`, `methodology`, `expected_outcomes`, `status`, `priority`, `category`, durations and dates, `lab_id`, `researcher_id`, `collaborators`, `equipment`, `materials`, `reagents`, `safety_requirements`, `budget`, `tags`, `notes`, `template_id`, `actual_cost`, `updated_at`, `protocol_id`, `notebook_entry_id`. Backfill `title` from `name` where `title` is null. Add indexes on `lab_id`, `protocol_id`, `researcher_id`. No foreign keys in this sprint.

**Migration.** Idempotent `information_schema` checks, same style as `mysql_workflow_links.sql`.

**APIs.** `/api/experiment-tracker` and `/api/experiments` (same router, mounted twice). Responses gain columns that were previously absent. Clients that ignore unknown fields stay valid.

**Frontend.** `/experiment-tracker`. Open an existing experiment and a new one. Status values remain `planning | ready | running | paused | completed | failed | cancelled`.

**Security.** No auth change. Confirm the heal script contains no dynamic SQL built from request input. It is a migration, not a handler.

**Tests.** Two fixtures: a table created from the thin definition only, and a table that already has tracker columns. After heal, both have `title` and `protocol_id`. Second run of the migration is a no-op. Existing ids are unchanged.

**Rollback.** Restore backup. Previous application code tolerated missing columns only on databases that never had them. A heal that has run is still readable by new code. Old code that only selected `id, project_id, name, goal` still works if those columns remain.

**Definition of done.** Both fixtures match. A duplicate apply does not error. Row count of `experiments` is unchanged.

---

## Sprint 4 — Account recovery

Status: done on 4 October 2026. Applied to `researchlab` and `researchlab_sprint1_copy`. Existing users were backfilled to `email_verified = 1` (12 rows, none left unverified). A new insert stayed unverified. Password reset succeeded once, failed on reuse, and failed after expiry. The dev email port returns `delivered: false`, and the forgot-password response does not say an email was sent. Old JWTs still work after a reset until sprint 5 sets `tokens_invalid_before`.

**Objective.** Users can verify email and reset a password. The app never claims an email was sent when it was only logged. Existing users keep logging in.

**Phase.** 2.

**Files / modules.**

- `server/integrations/email.ts` (new port).
- `server/index.ts` auth section, or a new `server/routes/authRecovery.ts` mounted from `index.ts` without moving the rest of the file.
- `server/validation` for the new bodies.
- `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`, and a small reset page or login panel.
- Writing invite call site that currently logs mail, switched to the port only. Invite copy still must not say “sent” when `delivered` is false.

**Tables.** `email_verification_tokens`, `password_reset_tokens` (`token_hash`, `expires_at`, `used_at`). Data migration: `UPDATE users SET email_verified = 1` where `email_verified = 0` for rows that existed before this migration. New signups insert `email_verified = 0`.

**Migration.** Create token tables. One-time backfill of `email_verified`. After this file is in `schema_migrations`, do not run the backfill again.

**APIs.**

- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- Existing `POST /api/auth/register` and `POST /api/auth/login` stay. Login still allows backfilled users. Register triggers verification through the port.

**Frontend.** Login gains a reset entry. Register explains verification. If the dev adapter returns `delivered: false`, the UI says delivery is not configured and, in development only, may show that the token was logged. Production UI does not show the token.

**Security.** Token stored as a hash. Reset response does not reveal whether the email exists. Reset and resend use `authRateLimit`. Reset sets the password and will set `tokens_invalid_before` in sprint 5. If sprint 5 has not shipped, document that old JWTs survive a reset until sprint 5. Prefer shipping sprint 5 immediately after this one, not weeks later. Email change on profile sets `email_verified = 0`.

**Tests.** Jest or API tests: forgot-password for a missing user and a real user return the same status. Reset token cannot be reused. Expired token fails. Backfilled user can log in. New user has `email_verified = 0`. Dev email port returns `delivered: false` by default.

**Rollback.** Redeploy previous API. Leave token tables in place. Backfill of `email_verified` is not reversed. That is safe because login already ignored the flag.

**Definition of done.** The five API cases above pass. A manual check shows the UI does not say “email sent” when the port returns `delivered: false`. Product-owner decision 5 (new accounts only) is the behaviour implemented.

---

## Sprint 5 — Token revocation

Status: done on 4 October 2026. Applied to `researchlab` and `researchlab_sprint1_copy`. Logout with a bearer token sets `users.tokens_invalid_before`. A later call with that token returns 401. A new login works. Password change does the same. Logout without a token still returns 200 and revokes nothing. The SPA still stores the bearer token in localStorage. JWT lifetime stays 24 hours. A token issued in the same second as the cutoff is still accepted, because `iat` is whole seconds.

**Objective.** Logout and password change invalidate existing JWTs without changing how the SPA stores the token.

**Phase.** 2.

**Files / modules.** `server/middleware/auth.ts`, `server/index.ts` logout and change-password, settings change-password route, `contexts/AuthContext.tsx` only if the logout request must send the bearer token (it already can). JWT sign sites include `jti` or the implementation uses `tokens_invalid_before` only.

**Tables.** `users.tokens_invalid_before` DATETIME NULL. Optional `revoked_tokens` if per-device logout is included. Default this sprint to the timestamp only.

**Migration.** Add the nullable column. No row updates.

**APIs.** `POST /api/auth/logout` with a valid bearer token sets `tokens_invalid_before`. Password change and reset do the same. Login issues a new JWT whose `iat` is after that timestamp. Unauthenticated logout still returns 200 and revokes nothing.

**Frontend.** Logout still clears `authToken` and `token`. No cookie work.

**Security.** `authenticateToken` compares token `iat` with `tokens_invalid_before`. Clock skew allowance is a few seconds, not hours. Demo token path is unchanged and still blocked in production. This sprint does not shorten the 24-hour lifetime.

**Tests.** Login, call a protected route, logout, call again with the same token, expect 401. Second login with the new token succeeds. Password change kills the previous token.

**Rollback.** Redeploy old middleware that ignores the column. The column can stay. Old tokens become valid again. Say that in the release note. Restore is not required.

**Definition of done.** The three tests pass. A token issued before `tokens_invalid_before` is rejected. A token issued after is accepted. localStorage is still the client store.

---

## Sprint 6 — Lab policy on the lifecycle

Status: done on 4 October 2026. `server/policies/labAccess.ts` is the check for notebooks, protocols, experiments, and research evidence. Account admin is not a bypass. Private rows stay with the owner. Lab-visible rows require an active membership. Experiment reads stay with the owner or a listed collaborator. Creating a row in a lab requires membership. `co_supervisor` sits beside `principal_researcher` in the client hint map and still below `admin`. `ROUTE_ACCESS` remains because `canAccessRoute` imports it. It does not authorize these records.

**Objective.** Notebook, protocols, experiments, and research evidence enforce lab membership and ownership on the server. `co_supervisor` is not treated as role level 0 in the client map.

**Phase.** 2.

**Files / modules.**

- `server/policies/labAccess.ts` (new).
- Handlers that read and write `lab_notebook_entries`, `protocols`, `experiments`, `research_data` in `server/index.ts` and the relevant files under `server/routes/`.
- `utils/roleAccess.ts` hierarchy only.

**Tables.** None. Reads `lab_members`, `labs`, and owner columns.

**Migration.** None.

**APIs.** Same paths. Cross-lab access becomes 403 or 404. Bodies that send another `user_id` do not change the owner. `privacy_level` is enforced as in the security plan section 3.4. Where today’s handler is more open than that, this sprint tightens it. Where today’s handler is already stricter, do not loosen it.

**Frontend.** `utils/roleAccess.ts` adds `co_supervisor`. No new route guards that pretend to be security. Screens should show the server error instead of a blank failure. `ROUTE_ACCESS` is left unused or removed if nothing imports it. Check imports before deleting.

**Security.** This is the control. Policies ignore `lab_members.permissions`. Account role is not a substitute for lab membership except `admin` for platform support actions, and those actions should be explicit in the policy, not a blanket bypass on scientific data. Recommended: `admin` does not silently read every lab’s notebook in this sprint. Platform support access can be a later audited path.

**Tests.** Unit tests for the policy helper: member, non-member, inactive member, manager role, student role. Handler tests can be thin if sprint 7 follows immediately. At least one deny test per resource is included here so the sprint is not policy code with zero callers.

**Rollback.** Redeploy previous handlers. No schema change.

**Definition of done.** Each of the four resources denies a non-member. Owner and lab-visible reads still succeed for a member. `hasMinimumRole('co_supervisor', 'student')` is true. Client map is not described as the authorization layer.

---

## Sprint 7 — IDOR tests

Status: done on 4 October 2026. `tests/integration/idorLifecycle.test.ts` migrates an empty `researchlab_sprint7_idor` database, starts the API on port 5017, and drops that database afterwards. Four users and two labs cover notebooks, protocols, experiments, and research evidence. Owner read and update return 200. A same-lab student can read a lab-visible row and receives 403 on update. A lab B member and a user with no lab receive 403 or 404, and the body does not include the row. A missing id returns 404. A `user_id` in the body does not change the owner. A same-lab member can comment on the owner’s notebook entry; a lab B member cannot post or list that comment. Experiment reads stay with the owner, so a same-lab member receives 404. Listing notebook comments now uses the same read check as the entry. Experiment create writes the legacy `name` column only when that column exists, so a fresh schema no longer returns 500.

**Objective.** Lock the sprint 6 behaviour in with the matrix from the security plan section 3.5.

**Phase.** 2.

**Files / modules.** `server/__tests__/` or `tests/integration/` new spec. Fixtures for two labs and four users. No production code unless a test finds a hole. A hole is fixed in this sprint, not deferred.

**Tables.** Test database only.

**Migration.** None.

**APIs.** Covered: notebook entries, protocols, experiments, `research_data` (the evidence routes the UI uses).

**Frontend.** None, unless a fix requires an error message.

**Security.** The suite is the deliverable. Include body `user_id` substitution and a nested comment or similar child row if one exists on notebook entries.

**Tests.** The matrix itself: owner, same-lab member, other lab, non-member, missing id.

**Rollback.** Remove the tests only if they are wrong. Do not rollback a security fix to make a bad test pass.

**Definition of done.** The matrix is green on a migrate-from-empty test database. Failures found in sprint 6 handlers are fixed and re-run.

---

## Sprint 8 — Inventory ledger

**Objective.** Every stock change writes an `inventory_transactions` row in the same database transaction as the balance update.

**Phase.** 3.

**Files / modules.** Inventory handlers in `server/index.ts` and `server/routes/labWorkspace.ts`. Lab workspace inventory UI: a history list on the item, not a new navigation item.

**Tables.** `inventory_transactions` as specified in the database plan section 9. One opening `adjust` row per existing item. Authoritative quantity pair is whichever pair the current UPDATE writes. Document that choice in the migration comment.

**Migration.** Create the ledger table. Backfill opening balances. Do not drop the second quantity pair or the duplicate expiry column.

**APIs.** Existing inventory update routes also insert a ledger row. Add `GET` history for an item, authorized with the lab policy.

**Frontend.** Item panel shows recent movements. Current quantity display stays on `inventory_items`.

**Security.** History and mutations use `requireLabMember`. A user cannot post a movement against another lab’s item. `user_id` on the ledger row is `req.user.id`.

**Tests.** Receive, consume, adjust. Balance matches the sum of deltas from the opening balance. A second lab’s member receives 403 or 404. Failed insert rolls back the balance (force a failure with a bad action value).

**Rollback.** Redeploy old handlers that only update `inventory_items`. Leave the ledger table. Opening rows can remain. Do not drop it if any new movement rows exist. Restore from backup if a bad backfill changed balances. The backfill must not change `inventory_items` quantities. Test that invariant.

**Definition of done.** Three movement types pass. Balances unchanged by the opening backfill. Cross-lab deny passes. DirectAdmin package regenerated.

---

## Sprint 9 — Bookings and maintenance

**Objective.** Maintenance persists. New instrument reservations write `instrument_bookings`. Old `bookings` rows are copied, not dropped.

**Phase.** 3.

**Files / modules.** Instrument and booking handlers in `server/index.ts`. Workspace equipment UI. Remove the duplicate `GET /api/instruments/:id/bookings` declaration when the handler is switched.

**Tables.** `instrument_maintenance` (created in sprint 2). `instrument_bookings` gains `legacy_booking_id` if absent. Copy from `bookings` using `instruments.lab_id`. Skip orphan bookings and record the count in the migration output or a small `migration_notes` comment in the PR. No drop.

**Migration.** Copy plus nullable legacy id. Depends on product-owner decision 2 (merge). If the decision is no, this sprint only verifies `instrument_maintenance` and does not copy bookings.

**APIs.** Writes go to `instrument_bookings`. Reads prefer that table and fall back to `bookings` by legacy id for one release. Maintenance GET and POST use the table from sprint 2.

**Frontend.** Equipment booking and maintenance screens in Lab Workspace. Confirm a scheduled maintenance row survives a reload.

**Security.** Booking and maintenance require membership of the instrument’s lab. A user cannot book another lab’s instrument by id.

**Tests.** Copy count equals `bookings` minus skips. New booking does not insert into `bookings`. Maintenance insert survives a new process (no runtime DDL). Cross-lab deny.

**Rollback.** Point reads back at `bookings` by redeploying the previous handlers. Copied rows stay. Do not delete them on rollback.

**Definition of done.** Decision 2 is either implemented as the copy or explicitly deferred in the sprint note. Maintenance round-trips. `bookings` still has its original rows.

---

## Sprint 10 — Lifecycle links

**Objective.** The first product milestone is navigable on data that is already linked, with authorization from sprint 6. Modules are not rebuilt.

**Phase.** 5 (links only). Project row migration is sprint 11, so this sprint does not add foreign keys to `research_projects` if legacy `projects` ids are still in the columns.

**Files / modules.**

- Experiment tracker, lab notebook, data results, protocol page, Writing Studio entry points.
- `hooks/useEntityDeepLink.ts` and existing `highlight` query params.
- A small link API or an extension of existing PATCH handlers to set `protocol_id`, `experiment_id`, `notebook_entry_id`, and `project_id`.
- Optional `writing_document_sources` table if evidence can be attached without parsing manuscript JSON.

**Tables.** Existing workflow-link columns. New `writing_document_sources` (`document_id`, `source_type`, `source_id`) if attachment is in this sprint. Indexes where missing. Foreign keys only for columns whose orphan query is zero and whose parent is not the legacy `projects` table. `ON DELETE SET NULL` for optional links.

**Migration.** Indexes and the link table. Conditional foreign keys in a second file that no-ops or is skipped when orphans exist. The sprint records the orphan count.

**APIs.** PATCH on experiment, notebook entry, and evidence pack accepts the link ids and checks that each target is in the same lab and visible to the user. Writing Studio can list sources. No new top-level sidebar item.

**Frontend.** From a project or experiment, open the protocol, notebook, and evidence that are linked. From evidence, open Writing Studio with the source attached or with `cite` / source state the studio already understands. Hidden routes `/experiment-tracker` and `/project-management` stay hidden. Deep links use the existing pages.

**Security.** Every id in the body is loaded and authorized. A caller cannot link lab B’s protocol to lab A’s experiment. Sprint 7 tests extend to the new PATCH.

**Tests.** Create the chain inside one lab: protocol, experiment, notebook entry, evidence row, writing source. A second lab cannot set those ids. Navigation hits the existing pages. Orphan report is attached to the sprint notes.

**Rollback.** Redeploy previous UI. New nullable columns and an empty link table are harmless. Drop `writing_document_sources` only if it has no rows and the feature is abandoned. Do not drop workflow-link columns. They predate this sprint.

**Definition of done.** A test user can walk the milestone inside one lab using existing screens. Cross-lab link attempts fail. No new protocol, notebook, or editor module was added. Foreign keys are either present with zero orphans or explicitly deferred with a count.

---

## Later sprints

These are sequenced after the first ten. Each is still one deploy. Do not start phase 9 or phase 11 while a P0 from sprints 2–7 is open.

### Sprint 11 — Legacy projects into research projects

**Objective.** Referenced `projects` rows have a `research_projects` twin, and child ids point at the twin.

**Phase.** 3.

**Files / modules.** Migration only, plus any handler that still inserts into `projects`. Lab Workspace project picker reads `research_projects`. `/project-management` stays until sprint 12’s UI note, or this sprint stops writing the legacy table.

**Tables.** `projects`, `research_projects`, `project_id_map`, `experiments.project_id`, `lab_notebook_entries.project_id`, `workspace_tasks.project_id`.

**Migration.** Database plan section 3. No drop.

**APIs.** Project list used by the workspace reads `research_projects` for the active lab.

**Frontend.** Workspace can show the lab’s research projects. The standalone page is unchanged if still routed.

**Security.** List and create require lab membership. `lab_id` on insert is the active lab, not a body field the client can point at another lab.

**Tests.** Map row count equals referenced legacy ids. Unreferenced legacy rows are reported, not deleted. Workspace list does not show another lab’s projects.

**Rollback.** Repoint children using `project_id_map` back to `old_id` only if no new `research_projects` were created by users after the migration. Otherwise restore the backup. Prefer taking the backup immediately before this sprint.

**Definition of done.** Referenced legacy ids resolve to `research_projects`. `projects` still exists. Decision 1 (surface projects in the workspace) is visibly true for a lab member.

### Sprint 12 — PI review on the project

**Objective.** PI review uses `pi_reviews` inside the workspace project. The hidden dashboard is not required to load its old lists.

**Phase.** 5.

**Files / modules.** `pages/PIReviewDashboardPage.tsx` left in place but unused, or reduced to a redirect into the workspace project. `server/routes/projectManagement.ts`. Workspace project section.

**Tables.** `pi_reviews`, `member_progress_reports`. No new model.

**Migration.** None unless orphan `project_id` values need the sprint 11 map.

**APIs.** Existing PI review endpoints, filtered by lab membership. Remove the fixed lab UUID.

**Frontend.** A project member with lab role `principal_researcher`, `admin`, or `co_supervisor` can open reviews. Others can submit a progress report if that flow already exists.

**Security.** Lab role check, not the account-role user list. A researcher cannot approve their own review by calling the API.

**Tests.** Manager can create a review on a lab project. Non-member cannot. The hardcoded lab id is gone (grep).

**Rollback.** Redeploy the previous project-management router.

**Definition of done.** A review round-trips on a workspace project. `/pi-review-dashboard` is either unused or redirects. No second review table.

### Sprint 13 — Notebook and results copies

**Objective.** If legacy `notebook_entries` or `results` contain rows, copy them. If they are empty, record that and do not invent data.

**Phase.** 3.

**Files / modules.** Migration. Handlers only if they still write the legacy tables.

**Tables.** `notebook_entries`, `content_blocks`, `lab_notebook_entries`, `results`, `research_data`.

**Migration.** Database plan sections 4 and 7. Conditional on counts.

**APIs.** None new.

**Frontend.** Copied notebook rows appear in the personal notebook as drafts or the mapped status. Copied results appear as draft evidence, not published.

**Security.** Copied rows keep the original owner. If the owner user is missing, skip and report.

**Tests.** Fixture with two legacy notebook rows and one results row. Counts match. Empty fixture writes nothing.

**Rollback.** Delete copied rows by `legacy_*` id if the new UI should hide them, or restore the backup. Legacy tables are not dropped here.

**Definition of done.** Counts are in the sprint note. Legacy tables still present. UI reads only the canonical tables.

### Sprint 14 — Citations point at papers

**Objective.** `writing_citations.paper_id` is set when the DOI already exists in `papers`. No second scholarly corpus.

**Phase.** 6.

**Files / modules.** `database/migrations` alter. Writing citation save path in `server/routes` writing handlers. Library save path stays the creator of `papers` rows.

**Tables.** `writing_citations`, `papers`.

**Migration.** Nullable `paper_id`, index, DOI backfill. No fuzzy title match.

**APIs.** Saving a citation with a DOI reuses an existing `papers` row when present. It does not overwrite citation counts.

**Frontend.** Writing Studio citation UI can show that a library work is linked. Unlinked citations still render.

**Security.** `paper_id` is set by the server after a lookup. A client cannot attach a paper id the matcher did not confirm, except through the existing library permission (the user already saved or can read that work). Do not leak another user’s library notes.

**Tests.** Two citations with the same DOI share one `papers` row. A citation with no DOI has null `paper_id`. Citation count on `papers` is unchanged by the backfill.

**Rollback.** Ignore `paper_id` in the previous deploy. Column stays.

**Definition of done.** DOI backfill count is reported. Writing Studio still opens old documents.

### Sprint 15 — Extract auth from the monolith

**Objective.** Auth HTTP handlers move out of `server/index.ts` without changing paths.

**Phase.** 4.

**Files / modules.** New `server/routes/auth.ts` (or controllers if the file would mix SQL). `server/index.ts` only mounts the router. Recovery routes from sprint 4 move with them.

**Tables.** None.

**Migration.** None.

**APIs.** Identical paths and status codes: register, login, logout, me, profile, change-password, forgot, reset, verify.

**Frontend.** None.

**Security.** No policy weakening during the move. Rate limits stay on the same routes.

**Tests.** Existing `server/__tests__/auth.test.ts` plus sprint 4 and 5 tests still pass.

**Rollback.** Redeploy the previous `index.ts`.

**Definition of done.** Auth paths are absent from `server/index.ts` except the mount. The auth test file passes. Diff does not include unrelated domains.

### Sprint 16 — Storage port for PDFs

**Objective.** Citation and library PDFs go through a storage interface with a server-generated key.

**Phase.** 4, security P1.

**Files / modules.** `server/integrations/storage.ts`. Writing citation PDF route. Research library PDF route.

**Tables.** Existing `pdf_path` columns store the storage key, not the user’s filename. Optional `file_assets` metadata table if the path column cannot hold owner and mime. Prefer a metadata table if `pdf_path` is only a string with no owner check.

**Migration.** Metadata table if needed. Do not delete old path strings. A read falls back to the old path if the key is missing, only when the owner check passes.

**APIs.** Same upload routes. Response does not echo a raw filesystem path outside the storage root.

**Frontend.** Upload and download still work from Writing Studio and the library.

**Security.** Security plan section 4.3. MIME and size checks. Download uses the parent resource policy.

**Tests.** Reject a non-PDF labeled as PDF. Reject a key that belongs to another user. Accept a valid PDF under the size limit.

**Rollback.** Redeploy previous multer handlers. New keys may 404 on the old handler. Keep the files on disk. Restore is not automatic.

**Definition of done.** The three tests pass. User filename is not the storage key.

### Sprint 17 — One analysis path for descriptive stats

**Objective.** Research evidence asks the FastAPI service for descriptive statistics instead of maintaining a second implementation for that one analysis. The Python service remains the numerical engine.

**Phase.** 7.

**Files / modules.** `pages/DataResultsPage.tsx`, `utils/researchStats.ts` (keep as fallback only if the stats process is down, and label the fallback). `server/index.ts` proxy. `stats_service/advanced_main.py` unchanged unless a request-shape bug blocks the call.

**Tables.** None, unless a small `analysis_runs` row is needed to attach a result to `research_data`. Prefer storing the last result inside evidence metadata only if it already has a JSON blob for that. Do not create a third stats product.

**Migration.** None required for the first analysis type.

**APIs.** Existing `/api/advanced-stats/analysis/descriptive` with the user’s evidence columns. The proxy stays authenticated.

**Frontend.** Evidence page shows the same descriptive numbers as before for a fixture column, now from the service when it is up.

**Security.** The proxy does not accept a URL. It forwards the authenticated user’s payload to `PYTHON_STATS_SERVICE_URL` only. Another user’s evidence id is rejected by the sprint 6 policy before the proxy runs.

**Tests.** Fixture column: mean matches the known value from the Python service. Service down: UI shows unavailable, and does not invent a number unless the documented fallback runs. Cross-user evidence id does not reach the proxy.

**Rollback.** Redeploy the previous evidence page that uses `utils/researchStats.ts` only.

**Definition of done.** One analysis type is served by FastAPI for the evidence page. Clustering, ANOVA, and the hidden `/data-analysis` page are not rewritten in this sprint.

### Sprint 18 — Hide the duplicate analysis page behind the evidence flow

**Objective.** `/data-analysis` and `/data-analytics` redirect to research evidence or to a single analysis route that uses the same proxy. The paste-in page is not deleted until the redirect is in place.

**Phase.** 7.

**Files / modules.** `App.tsx` routes. `pages/DataAnalyticsPage.tsx`.

**Tables.** None.

**Migration.** None.

**APIs.** None new.

**Frontend.** Both URLs leave the duplicate calculator. Sidebar stays unchanged (the page is already hidden).

**Security.** No new public route.

**Tests.** Both paths redirect. Evidence analysis from sprint 17 still runs.

**Rollback.** Restore the route elements.

**Definition of done.** One analysis UI remains on the milestone path.

### Sprint 19 — Auth domain services, not a rewrite

**Objective.** Move lab membership handlers for create-lab and invite into `server/routes` and `server/policies`, still mounted from `index.ts`.

**Phase.** 4.

**Files / modules.** `server/index.ts` lab section, `server/routes` lab router if one does not already cover invites, `server/policies/labAccess.ts`.

**Tables.** `labs`, `lab_members`.

**Migration.** None.

**APIs.** `POST /api/labs`, invite, member update, member delete. Same codes.

**Frontend.** Lab workspace team section still invites.

**Security.** Invite and role change require lab role `principal_researcher`, `admin`, or `co_supervisor`. A member cannot change their own role to principal researcher.

**Tests.** Existing lab tests plus a privilege-escalation case.

**Rollback.** Redeploy previous `index.ts` lab handlers.

**Definition of done.** Those handlers are not inline, or the remainder is listed with line ranges for the next extract. Behaviour matches the tests.

### Sprint 20 — Provenance on scholarly cache

**Objective.** Cached provider payloads record source, provider id, and retrieved time without a new database product.

**Phase.** 8.

**Files / modules.** `server/services/scholarly/*`, `scholarly_cache` writer.

**Tables.** `scholarly_cache` and, if needed, columns on the cache row. `papers` citation counts are not overwritten by a second provider.

**Migration.** Additive columns only if the current JSON payload does not already store retrieved time.

**APIs.** `/api/research/*` search responses unchanged for the client.

**Frontend.** None required. A source label can wait.

**Security.** Cache keys must not include another user’s private library notes. Live discovery stays server-side.

**Tests.** Two providers returning different citation counts do not replace a stored count in one write. Cache row has a retrieved timestamp.

**Rollback.** Redeploy previous scholarly writer. New columns stay nullable.

**Definition of done.** A search writes provenance. `papers` metrics from a previous provider remain.

### Sprint 21 — Lab Floors progress on the server

**Objective.** Choice-floor and roleplay progress survive a new browser. localStorage remains a cache.

**Phase.** 10. Starts only after the lifecycle milestone (sprint 10) is done.

**Files / modules.** `utils/labFloors/progress.ts`, `utils/labFloors/roleplayProgress.ts`, `server/routes/labFloorsRoleplay.ts`, new progress routes.

**Tables.** `lab_floors_progress` (`user_id` primary key, `choice_json`, `roleplay_json`, `updated_at`).

**Migration.** Create the table. No import of other users’ browsers. On first login after release, the client may POST its local JSON if the server row is empty.

**APIs.** GET and PUT progress for the authenticated user only.

**Frontend.** `/lab-floors` reads the server and writes through it. Existing keys `drm_lab_floors_progress_v1` and `drm_lab_floors_roleplay_v1` still update as a cache.

**Security.** `user_id` comes from the token. A body `user_id` is ignored. Roleplay prompts still must not include another lab’s records.

**Tests.** User A cannot read user B’s progress. A second session sees stamps saved by the first.

**Rollback.** Redeploy client that uses localStorage only. Server table can stay.

**Definition of done.** Two sessions for one user share progress. Cross-user read fails.

### Sprint 22 — Events source

**Objective.** Conference news is no longer a second empty product. `research_events` is the events list unless decision 3 said otherwise.

**Phase.** 11.

**Files / modules.** `pages/ConferenceNewsPage.tsx`, `App.tsx`, `pages/EventsOpportunitiesPage.tsx`, `server/routes/researchEvents.ts`.

**Tables.** `research_events`. Do not merge `community_posts` or `calendar_events`.

**Migration.** None if the decision is a redirect.

**APIs.** Existing events API.

**Frontend.** `/conference-news` redirects to the events page. Community and personal calendar stay.

**Security.** Public event fields stay public. Applications stay tied to the authenticated user.

**Tests.** Redirect works. A personal calendar event does not appear as a research event.

**Rollback.** Restore the conference-news route.

**Definition of done.** Decision 3 is implemented. Three concepts remain three stores.

### Sprint 23 — Request logging and CSP report-only

**Objective.** Production responses stay generic, auth logs have a request id, and CSP is report-only rather than disabled without a record.

**Phase.** 12.

**Files / modules.** `server/middleware/security.ts`, `server/index.ts` error handler, log helper.

**Tables.** None. Optional use of existing `audit_logs` for login failure.

**Migration.** None.

**APIs.** Error JSON in production has no stack and no SQL text.

**Frontend.** CSP report-only must not break the SPA. If it would, the sprint stops at a written policy draft instead of shipping a broken header. Enforcing CSP is not this sprint.

**Security.** Logger redacts `Authorization`, cookies, and password fields. `validateInput` is mounted only if a review shows it does not reject normal scientific text. Otherwise leave it unmounted and say so.

**Tests.** A thrown error in production mode returns the generic body. A log line from login does not contain the password or the bearer token.

**Rollback.** Redeploy previous security middleware.

**Definition of done.** The two tests pass. CSP is either report-only on the production path or explicitly deferred with the breakage noted.

### Sprint 24 — Journey regression and restore drill

**Objective.** The milestone path is an automated test, and a backup restore has been performed on a copy.

**Phase.** 12.

**Files / modules.** Playwright spec under `tests/e2e/` for the journey. `docs/BACKUP_AND_RESTORE.md` updated with the drill date and outcome.

**Tables.** Test data only.

**Migration.** None.

**APIs.** The journey calls the real API against a test database.

**Frontend.** The spec clicks through lab, project, protocol, experiment, notebook, evidence, analysis, and Writing Studio as far as sprint 10 and 17 actually reached. Steps that are not built yet are not faked. The spec’s header lists which sprint it requires.

**Security.** The spec includes one cross-lab denial.

**Tests.** The spec itself. Restore drill is a written record, not a unit test.

**Rollback.** Remove the spec if the product path changes. The drill record stays.

**Definition of done.** The spec passes locally or in CI against a migrated test database. The restore drill record includes the backup time, the restore target, and whether row counts matched.

---

## Order and gates

| Sprints | Gate to start |
|---|---|
| 1 | Planning approval |
| 2–3 | Sprint 1 backup notes, and a backup if the database is shared |
| 4–5 | Sprint 2 applied on that database |
| 6–7 | Sprint 5 so password reset can kill sessions. Sprint 4 may merge its invalidation call once the column exists |
| 8–9 | Sprint 6 policy exists so new writes are authorized |
| 10 | Sprint 7 green |
| 11–14 | Sprint 10, and a fresh backup |
| 15–16 | Can follow sprint 7 in parallel only on a branch that does not also edit the same handlers. Do not parallelize on `server/index.ts` |
| 17–18 | Sprint 10 evidence links, stats process available |
| 19 | After sprint 15 so auth extraction patterns exist |
| 20 | Any time after sprint 2. Does not block the milestone |
| 21 | After sprint 10 |
| 22 | Product-owner decision 3 |
| 23–24 | After sprint 10. Sprint 24 requires the journey steps it claims to cover |

Sprints 20 and 23 are the only later sprints that may be pulled forward without waiting for the full consolidation, and only if they do not edit the same files as the active sprint.

OpenAlex and other provider enhancements follow “Enhancement and innovation permission.” They still wait until the active sprint is finished when they would edit the same files. A missing `OPENALEX_API_KEY` is not a reason to block an unrelated sprint.

---

## Product-owner decisions that change a sprint

| Decision | If rejected |
|---|---|
| 1. Projects inside Lab Workspace | Sprint 11 still maps ids, but sprint 11’s UI slice is dropped |
| 2. Merge bookings | Sprint 9 stops after maintenance verification |
| 3. `research_events` as the events source | Sprint 22 is rewritten to the chosen source |
| 4. Email provider | Sprint 4 ships the port and the dev adapter only. Production delivery waits on the adapter |
| 5. Verify new accounts only | Sprint 4 backfill changes. Do not enforce verification for old users without a support plan |
| 6. Keep Bearer tokens for now | No cookie sprint is scheduled above. Add one later. Do not fold it into sprint 5 |
| 7. Retire old marketplace and PeerCred | A future retire sprint, not in the first ten |
| 8. Lab Floors after the milestone | Sprint 21 stays where it is |
| 10. User list is admin-only | A small sprint after sprint 6. Not in the first ten. If rejected, document the current `GET /api/users` behaviour as accepted |
