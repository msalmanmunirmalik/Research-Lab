# DRM Database Consolidation Plan

Date: 4 October 2026.  
Status: planning only. Do not apply this SQL until the product owner approves the sprint that contains it.

Related: `DRM_MODERNIZATION_MASTER_PLAN.md`, `DRM_SECURITY_MODERNIZATION_PLAN.md`, `DRM_INCREMENTAL_IMPLEMENTATION_ROADMAP.md`.  
Inventory: `DRM_CURRENT_SYSTEM_AUDIT.md`, checked against `database/migrations/` and handler SQL.

---

## 1. Rules

1. Forward migrations only. Do not drop and recreate the database. Do not run `pnpm db:reset` (`psql` against `digital_research_manager`).
2. Pattern for every consolidation: **OLD, TRANSFORM, CANONICAL**. Source rows stay until the new read path is verified.
3. A database created only by `pnpm db:migrate` must satisfy every mounted handler. Production handlers must not `CREATE TABLE`.
4. Identifiers stay `VARCHAR(64)` generated in application code. Booleans stay `TINYINT(1)`. Status values stay `VARCHAR` until a later, separate constraint sprint. Do not convert the schema to `AUTO_INCREMENT` or MySQL `ENUM` as part of consolidation.
5. Add a foreign key only after an orphan query returns zero rows. Otherwise add an index, quarantine or null the orphans, then add the key in a following migration.
6. Idempotent repairs use the `information_schema` plus prepared-statement style already in `database/migrations/mysql_workflow_links.sql` and `database/migrations/mysql_schema_heal_common.sql`. `mysql_schema_heal_common.sql` re-runs on every migrate. Put one-shot data moves in a new `mysql_*.sql` file that `schema_migrations` records once.
7. New files land in `database/migrations/` only. Regenerate `directadmin-package/` with `pnpm pack:directadmin`. Do not hand-edit both trees.
8. Set `MYSQL_DB` explicitly. `database/config.ts` defaults to `digital_research_manager`. `database/migrate.ts` defaults to `researchlab`. A migrate with an empty `MYSQL_DB` can alter a different database than the API.
9. Before any shared-database sprint: logical backup, documented restore, dry-run on a copy, row-count comparison, rollback note. Rollback is restore plus a compatibility read of the old table. These plans do not assume a down migration.
10. Multi-step data moves run in a transaction when the engine and the statement size allow it. `ALTER` that implicitly commits is called out in the sprint, and the backup is the rollback.

---

## 2. How to read each section

| Heading | Meaning |
|---|---|
| Current | Tables and writers that exist today |
| Canonical | The table new code reads and writes |
| Migration | OLD to TRANSFORM to CANONICAL |
| Compatibility | What keeps working during the window |
| Retirement | When the old object may be dropped or the dead query removed |

---

## 3. Projects

### Current

- `projects` in `mysql_migration.sql`: `id`, `name`, `description`, `owner_id` foreign key to `users`. Early `experiments.project_id` pointed here.
- `research_projects` in `mysql_research_projects.sql`: lab, code, title, description, PI, type, field, budget, dates, status default `planning`, progress. No foreign keys. Child tables: `project_work_packages`, `lab_team_hierarchy`, `member_progress_reports`, `pi_reviews`, `progress_notifications`, `team_meetings`.
- `workspace_tasks.project_id`: optional string, no foreign key.
- Live APIs: `/api/project-management` uses `research_projects`. Lab Workspace tasks store a free-text project id. `/project-management` is hidden and uses a fixed lab UUID in one team call.

### Canonical

`research_projects` is the project. Lab Workspace is where users open it. `pi_reviews` stays a child of that project. Workspace tasks, experiments, and notebook entries point at `research_projects.id`.

### Migration

1. Count rows in `projects`, `research_projects`, and distinct `workspace_tasks.project_id`, `experiments.project_id`, `lab_notebook_entries.project_id`.
2. For each legacy `projects` row that is still referenced, insert a `research_projects` row when no match exists. Copy `name` to `project_title`, `description` to `project_description`, `owner_id` to `principal_investigator_id`. Leave `lab_id` null only when the owner has no membership. Record the map in `project_id_map` (`old_id`, `new_id`, `source`) created by this migration and kept until retirement.
3. Point `experiments.project_id`, `lab_notebook_entries.project_id`, and `workspace_tasks.project_id` at `new_id` where the map matches.
4. Do not delete `projects` in this migration.

### Compatibility

Reads of `research_projects` grow. Writes to `projects` stop in application code once the map is applied. A database trigger is not required. The old table remains for rollback reads.

### Retirement

Drop `projects` only when no mounted SQL references it and `project_id_map` covers every former child. Then drop `project_id_map` in a later migration. Retire `/project-management` as a page after Lab Workspace can open `research_projects`.

---

## 4. Notebooks

### Current

- Canonical UI: `lab_notebook_entries`, `lab_notebook_comments`. Heal and workflow migrations add `protocol_id` and `experiment_id`. `project_id` has no foreign key. `quick_notes` is a separate sticky-note table and stays separate.
- Legacy: `notebook_entries`, `content_blocks`. Status default `In Progress`. `content_blocks.data` is TEXT.

### Canonical

`lab_notebook_entries` plus `lab_notebook_comments`. Quick notes stay `quick_notes`.

### Migration

1. Count `notebook_entries` and `content_blocks`. If both are zero in production, skip the copy and schedule retirement.
2. If rows exist, insert into `lab_notebook_entries` with `entry_type` `experiment` or `idea`, `status` mapped from legacy strings onto `planning | in_progress | completed | on_hold | failed`, and `user_id` from the legacy owner. Concatenate ordered `content_blocks` into the methodology or results text. Store the old id in a nullable `legacy_notebook_entry_id` column added for the window.
3. Repoint any `experiments.notebook_entry_id` that still holds a legacy id.

### Compatibility

The personal notebook UI already reads `lab_notebook_entries`. Leave legacy tables in place, unread by new code.

### Retirement

Drop `notebook_entries` and `content_blocks` when the count of unmapped legacy ids referenced by experiments is zero and a backup of the copy exists.

---

## 5. Protocols

### Current

- Live: `protocols`, `protocol_steps`, `protocol_attachments`, `protocol_sharing`, `protocol_executions`, `protocol_embeddings`.
- Parallel: `professional_protocols`. Router `server/routes/professionalProtocols.ts` is not mounted. `/professional-protocols` redirects to `/protocols`.

### Canonical

`protocols` and its child tables.

### Migration

1. Count `professional_protocols`.
2. If rows exist, insert a `protocols` row per document (title, description, lab, author, status mapped to the library’s fields) and one `protocol_steps` row per major section if the long text can be split without invention. Otherwise store the body in `protocols.content` and record `legacy_professional_protocol_id`.
3. If the count is zero, do not invent rows.

### Compatibility

No UI change. The redirect stays.

### Retirement

Drop `professional_protocols` and delete the unmounted router when the row count is zero or the copy is verified. Do not mount the old router.

---

## 6. Experiments

### Current

Two creates:

- Thin table in `mysql_migration.sql`: `id`, `project_id`, `name`, `goal`, `created_at`.
- Tracker-shaped `CREATE TABLE IF NOT EXISTS` in `mysql_experiments_schema.sql`. If the thin table exists, the second create does nothing. Later patches add columns only when those patch files run.
- Expected merged shape when the thin table was created first: tracker columns listed in audit section 5, including `title`, `status`, `lab_id`, `researcher_id`, `protocol_id`, `notebook_entry_id`.
- Children that do exist: `experiment_templates`, `experiment_milestones`, `experiment_progress_logs`.
- Children queried but not created: `experiment_risks`, `experiment_comments` in `server/routes/experimentTracker.ts`.

UI statuses: `planning | ready | running | paused | completed | failed | cancelled`.

### Canonical

One `experiments` table with the tracker columns, plus `experiment_risks` and `experiment_comments` created by migration.

### Migration

1. New file `mysql_experiments_shape_heal.sql` (name can follow the existing prefix style). For each tracker column, add it only if `information_schema.COLUMNS` says it is absent. Match types already used by `mysql_experiments_schema.sql` and `mysql_experiments_patch.sql`.
2. Backfill `title` from `name` where `title` is null and `name` is not.
3. Create `experiment_risks` and `experiment_comments` to match the INSERT/SELECT column lists in `experimentTracker.ts`. Read that file before writing the `CREATE`. Do not guess column names beyond what the handler uses.
4. Index `lab_id`, `protocol_id`, `project_id`, `researcher_id`.
5. Foreign keys to `labs`, `protocols`, `research_projects`, and `users` only after orphan checks. `project_id` waits until section 3 has rewritten legacy ids.

### Compatibility

Existing tracker rows keep their ids. Handlers that already select the merged shape start working on databases that only had the thin table.

### Retirement

Remove nothing. The thin create in `mysql_migration.sql` stays so old migration history remains valid. The heal file is what makes the shape complete. Do not edit `mysql_migration.sql` in place if it may already be recorded in `schema_migrations`.

---

## 7. Evidence and legacy results

### Current

- `research_data` (`mysql_forms_crud_alignment.sql`): evidence packs. Status path `draft | under_review | published | archived`. JSON `files` and `metadata`. Link columns `protocol_id`, `experiment_id`, `notebook_entry_id` from `mysql_workflow_links.sql`.
- `results` (`mysql_migration.sql`): older shared-results table, `source` default `Manual`. Not the evidence-pack UI.

### Canonical

`research_data`.

### Migration

1. Count `results`.
2. If non-zero, insert `research_data` rows with `type` `experiment`, `status` `draft`, and a metadata JSON that preserves the old source and id. Do not publish them automatically.
3. If zero, skip the copy.

### Compatibility

`/data-results` keeps reading `research_data`. Old `results` stays until retirement.

### Retirement

Drop `results` when no mounted handler selects it and the copy count matches. Confirm handler references before the drop migration.

---

## 8. Bookings and maintenance

### Current

- `bookings`: `instrument_id`, `user_id`, `title`, start and end. No `lab_id`. Used by inline instrument routes in `server/index.ts`. `GET /api/instruments/:id/bookings` is declared twice.
- `instrument_bookings`: workspace booking with `lab_id`, `purpose`, `status` default `confirmed`, `notes`. From `mysql_lab_workspace.sql`.
- `instrument_maintenance`: inserted and selected in `server/index.ts`. No `CREATE TABLE` in `database/migrations/`.

These are the same product workflow (who uses which instrument, when) plus a missing service log. They are not a personal calendar.

### Canonical

`instrument_bookings` for reservations. `instrument_maintenance` for service history. `instruments` stays the asset (`status` default `Operational`, `lab_id`, model, manufacturer, description).

Product-owner decision 2 in the master plan recommends this merge. If it is rejected, stop after creating `instrument_maintenance` and document the two booking tables as intentional. Do not write both from one UI either way.

### Migration

1. Create `instrument_maintenance` from the INSERT column list in `server/index.ts` (status written as `scheduled`). Include `instrument_id`, `lab_id` if the handler sends it, timestamps, and an index on `instrument_id`.
2. Add `bookings.id` to `instrument_bookings` as `legacy_booking_id` if the column is absent, unique where not null.
3. Copy `bookings` rows into `instrument_bookings`. Set `lab_id` from `instruments.lab_id`. Set `status` to `confirmed`. Set `purpose` from `title`. Skip rows whose instrument is missing. Record skips.
4. Point new API writes at `instrument_bookings` only after the copy.

### Compatibility

Keep reading `bookings` in the old handler until the instrument UI is switched. After the switch, the old table is read-only. A one-release dual-read (prefer `instrument_bookings`, fall back to `bookings` by `legacy_booking_id`) is the compatibility window.

### Retirement

Drop `bookings` when the dual-read fallback has logged zero hits for a release and row counts match. Remove the duplicate route declaration in the same sprint that switches the handler.

---

## 9. Inventory

### Current

`inventory_items` carries two quantity styles after patches: `quantity_value` / `quantity_unit` and `quantity` / `unit` / `min_quantity`. Both `expiry_date` and `expiration_date` may exist. `lab_id` is present. Stock changes update the row. There is no `inventory_transactions` table.

### Canonical

`inventory_items` is the balance. `inventory_transactions` is the history. One quantity pair is authoritative.

### Migration

1. Choose the pair the live UPDATE statements write. Read the inventory handlers in `server/index.ts` and `server/routes/labWorkspace.ts` before altering. The other pair becomes a generated or periodically synced copy during the window, not a second source of truth.
2. Backfill nulls so the chosen pair matches the other pair when one side is null.
3. Create `inventory_transactions`: `id`, `item_id`, `lab_id`, `user_id`, `action` (`receive | consume | adjust | transfer | dispose`), `quantity_delta`, `unit`, `balance_after`, `note`, `created_at`. Index `(item_id, created_at)`.
4. Change each stock write to insert a transaction in the same request as the balance update. Use a transaction.
5. Opening balance: one `adjust` row per existing item with `note` `opening-balance` so history does not start empty. Do this once.

### Compatibility

Screens that show current quantity keep reading `inventory_items`. History is a new panel, not a replacement of the item form.

### Retirement

Drop the non-authoritative quantity columns and the duplicate expiry column only after every reader uses the chosen names. That drop is its own migration, later than the ledger sprint.

---

## 10. Scholarly library and writing citations

### Current

- Canonical works: `papers`, `paper_identifiers`, `user_library_items`, `reference_collections`, `reference_collection_items`, `paper_chunks`, `scholarly_cache`, `scholarly_audit_events` (`mysql_evidence_references.sql`).
- Manuscript citations: `writing_citations`, `writing_document_citations`. JSON authors and CSL, BibTeX, and later `source_text` and `pdf_path`.
- Legacy: `user_papers`, created at runtime in unmounted `server/routes/paperLibrary.ts` with Postgres `UUID` and `JSONB`. Not a MySQL table.

### Canonical

`papers` is the work. `user_library_items` is the save. `writing_citations` is the manuscript relationship. A citation may store `paper_id` when a deterministic match exists (DOI, then PMID/PMCID, then OpenAlex id).

### Migration

1. Add nullable `writing_citations.paper_id` and an index, if absent. Foreign key after orphans are impossible by construction (only set when `papers.id` exists).
2. Backfill `paper_id` where DOI matches `papers` unique DOI. Do not fuzzy-match titles in the first migration.
3. Do not copy `writing_citations` into `papers` automatically. Discovery code creates `papers` rows when a user saves a work, which is the current library path.
4. Do not create `user_papers`.

### Compatibility

Writing Studio keeps rendering `writing_citations` even when `paper_id` is null. Library UI keeps using `/api/research/*`.

### Retirement

Leave `writing_citations` in place permanently. Delete `server/routes/paperLibrary.ts` when confirmed unmounted. If a non-MySQL database somewhere has `user_papers`, it is out of band and is not migrated by these MySQL files.

Provider metrics on `papers` (citation counts and similar) gain a provenance column or a child `paper_metric_snapshots` table in the Research Intelligence phase, not in this consolidation. Do not overwrite one provider’s count with another’s in the backfill.

---

## 11. Manuscripts

### Current

`writing_documents.content` JSON holds sections. There is no sections table. Collaboration tables: `writing_collaborators`, `writing_invitations`, `writing_section_locks`, `writing_presence`.

### Canonical

Keep the JSON document. Do not normalize sections into rows as part of consolidation. That would be a rewrite of Writing Studio.

### Migration

None for shape. A later lifecycle sprint may add nullable `writing_documents.project_id` or a link table `writing_document_sources` (`document_id`, `source_type`, `source_id`) so evidence and analysis attach without stuffing ids only inside JSON. Prefer the link table so authorization can see the edge.

### Compatibility

Existing documents stay valid if the new link table is empty.

### Retirement

None.

---

## 12. Notifications

### Current

- `notifications`: in-app inbox, `type` default `system`.
- `progress_notifications`: project management.
- `grant_notifications`: grant matches, `channel` default `in_app`, `status` default `sent`.

### Canonical

`notifications`, with a stable `type` string per producer (`project_progress`, `grant_match`, and the types already written).

### Migration

1. Inventory distinct `type` values and the columns each side table has that `notifications` lacks.
2. Add only the missing nullable columns or a `payload` JSON column. Do not drop side tables in the same migration as the copy.
3. Copy rows. Set `notifications.type` so the bell can tell them apart. Store the old id in payload.
4. Switch writers one producer at a time.

### Compatibility

The bell keeps polling `GET /api/notifications`. Old tables remain readable for one release after each writer moves.

### Retirement

Drop `progress_notifications` and `grant_notifications` when their writers and readers are gone and counts match. This is P2. It does not block the lifecycle milestone.

---

## 13. Events, conference news, and community

### Current

- `research_events`, `research_event_bookmarks`, `research_event_applications`. This is the events product. `server/routes/researchEvents.ts` states it is distinct from personal `calendar_events`.
- `calendar_events`: personal calendar. Queried in `server/index.ts`, `server/routes/dashboard.ts`, and `server/services/personalAssistant/tools.ts`. No migration creates it.
- `community_posts` and like, comment, and save tables. Post types include news, update, idea, blog, opinion, opportunity.
- Conference news page has no data source.

### Canonical

Keep three concepts separate:

- Personal calendar: `calendar_events` (must be created, or the handlers removed).
- Research events: `research_events`.
- Community posts: `community_posts`.

Conference news is not a fourth table. Recommended canonical view is `research_events`. Product-owner decision 3 can override that.

### Migration

Create `calendar_events` to match the INSERT in `server/index.ts`: `user_id`, `title`, `description`, `start_time`, `end_time`, `event_type`, `all_day`, plus `id` and timestamps if the handler sends them. Read the handler before writing the `CREATE`. Index `(user_id, start_time)`.

Do not copy community posts into `research_events`.

### Compatibility

Dashboard and the assistant keep their calendar queries once the table exists.

### Retirement

Retire the conference-news page or point it at `research_events` when the product owner confirms. Do not drop `community_posts`.

---

## 14. Negative results side tables

### Current

Migration `mysql_negative_results.sql` creates `negative_results`, `negative_result_comments`, `negative_result_votes`, `negative_result_saves`.

Handlers in `server/routes/negativeResults.ts` also use:

- `saved_negative_results` (the migration name is `negative_result_saves`)
- `successful_alternatives`
- `failure_patterns`
- `negative_results_contributor_stats`

### Canonical

`negative_results` and the tables the migration already creates, plus the extra tables the mounted router actually writes, with one save table.

### Migration

1. Compare `negative_result_saves` columns with the INSERT into `saved_negative_results`.
2. If they match, change the router to `negative_result_saves` and do not create a second save table. If they do not match, add the missing columns to `negative_result_saves` and then switch the SQL.
3. Create `successful_alternatives`, `failure_patterns`, and `negative_results_contributor_stats` from the handler SQL. The contributor upsert uses `ON DUPLICATE` style updates. The MySQL table must use a unique key the handler’s conflict target expects. If the SQL is Postgres `ON CONFLICT`, rewrite the handler to `ON DUPLICATE KEY UPDATE` in the same sprint. That is a code fix, not a second table.

### Compatibility

The negative-results page starts succeeding on a fresh migrate. Existing `negative_result_saves` rows remain the saves.

### Retirement

Do not create `saved_negative_results` if the code can use `negative_result_saves`.

---

## 15. AI usage and failure patterns

### Current

- `ai_platform_usage` has a migration (`mysql_ai_platform_usage.sql`) and a second `CREATE TABLE IF NOT EXISTS` in `server/services/platformAiAccess.ts`.
- `user_ai_failure_patterns` is inserted by `server/services/ContinuousLearningEngine.ts` and is not in migrations.
- `ai_provider_keys`, `ai_provider_configs`, `ai_training_data`, `user_ai_content` already have migrations. Keys are encrypted by the app before insert.

### Canonical

`ai_platform_usage` from the migration file only. `user_ai_failure_patterns` created by migration if the learning engine stays mounted.

### Migration

1. Confirm `mysql_ai_platform_usage.sql` matches the runtime CREATE. If the runtime CREATE has columns the file lacks, add a forward `ALTER`. Then delete the runtime CREATE.
2. Create `user_ai_failure_patterns` from the INSERT in `ContinuousLearningEngine.ts`. Replace Postgres `ON CONFLICT` / `EXCLUDED` with MySQL `ON DUPLICATE KEY UPDATE` if that is what the file contains.

### Compatibility

Usage counts already in the table stay. The daily cap behaviour does not change.

### Retirement

Runtime DDL is removed in the schema-truth sprint. The table stays.

---

## 16. Other missing tables

Mounted or live-service SQL with no `CREATE TABLE` under `database/migrations/` (confirmed by search on 4 October 2026):

| Table | Writer | Action |
|---|---|---|
| `calendar_events` | `server/index.ts`, dashboard, personal assistant | Create. Section 13 |
| `instrument_maintenance` | `server/index.ts` | Create. Section 8 |
| `resource_exchange_requests` | `server/index.ts` | Create from the INSERT, or remove the route if the product owner says the exchange UI is dead |
| `resource_exchange_offers` | `server/index.ts` | Same as requests |
| `data_templates` | `server/index.ts` | Create from the INSERT, or remove the route if unused by the current evidence UI |
| `experiment_risks` | `server/routes/experimentTracker.ts` | Create. Section 6 |
| `experiment_comments` | `server/routes/experimentTracker.ts` | Create. Section 6 |
| `saved_negative_results` | `server/routes/negativeResults.ts` | Point at `negative_result_saves`. Section 14 |
| `successful_alternatives` | `server/routes/negativeResults.ts` | Create. Section 14 |
| `failure_patterns` | `server/routes/negativeResults.ts` | Create. Section 14 |
| `negative_results_contributor_stats` | `server/routes/negativeResults.ts` | Create. Section 14 |
| `user_ai_failure_patterns` | `ContinuousLearningEngine.ts` | Create. Section 15 |

`complianceService.ts` lists `calendar_events` among export tables. Creating the table is also a privacy-export requirement.

For `resource_exchange_*` and `data_templates`, the schema-truth sprint prefers **create the table the handler already expects** so fresh migrate matches production behaviour. Removing the route is allowed only when the product owner confirms no UI calls it. Do not leave the handler in place against a missing table.

---

## 17. Users, labs, and membership

### Current

`users` defaults: `role` `Research Assistant`, `status` `Offline`, `email_verified` 0. Signup inserts `student` or `researcher`, `status` `active`, `email_verified` false. Middleware requires `active`.

`labs.principal_researcher_id` has no foreign key. `research_areas` and `looking_for` are TEXT treated as JSON.

`lab_members`: foreign keys to `labs` and `users`, `ON DELETE CASCADE`, `role` default `student`, `permissions` TEXT, `is_active`.

### Canonical

Account role values: `admin`, `principal_researcher`, `co_supervisor`, `researcher`, `student`. Status values: `active`, `inactive`, `suspended`, `pending_verification`. Lab role stays on `lab_members` and is not a copy of the account role.

### Migration

1. `ALTER` the defaults for new rows: `role` default `student`, `status` default `pending_verification` or `active`. Recommended default status is `active` until email verification ships, then `pending_verification` for new rows only. Do not update existing `active` users.
2. Report rows whose `status` is not in the allowed set (`Offline` and similar). Do not mass-rewrite them until a human looks at the count. A follow-up data migration can map `Offline` to `active` only when `password_hash` is present and the account is in use.
3. Do not add a foreign key from `labs.principal_researcher_id` until orphans are zero.
4. Leave `lab_members.permissions` as TEXT. Policies in the security plan must not parse it as an ACL until a later design replaces it.

### Compatibility

Signup already writes the correct role and status. The default change only affects inserts that omit the columns.

### Retirement

None. The old default strings disappear from new rows. Historical odd values are cleaned by the explicit data migration, not by dropping the column.

---

## 18. Grants, datasets, marketplace

No consolidation sprint merges these into lab tables.

| Area | Keep | Do not merge with |
|---|---|---|
| Grants | `grants`, `grant_sources`, `grant_matches`, `user_grant_preferences`, `grant_writeups`, `grant_embeddings` | Writing Studio documents. Handoff remains `grantId` to a new manuscript |
| Data bank | `databank_organizations`, `databank_data_offers`, `databank_data_requests` | `research_data` evidence packs |
| Marketplace directory | `marketplace_suppliers`, `marketplace_supplier_catalog`, `marketplace_service_providers`, `marketplace_service_offerings`, `marketplace_tenders` | Older `service_categories`, `service_listings`, `service_requests`, `service_portfolio_items` |

The older service-listing tables retire only after a production count and a confirmation that no mounted route is the live marketplace. The live UI is `MarketplacePage` on the directory tables.

`grant_writeups.content` is JSON in `mysql_grant_writeups.sql`. A later `CREATE TABLE IF NOT EXISTS` must not be allowed to recreate it as TEXT. Same rule as experiments: heal with `ALTER`, do not rely on `IF NOT EXISTS` to fix an old shape.

---

## 19. Workflow link columns

`mysql_workflow_links.sql` already adds, when missing:

- `experiments.protocol_id`, `experiments.notebook_entry_id`
- `lab_notebook_entries.protocol_id`, `lab_notebook_entries.experiment_id`
- `research_data.protocol_id`, `research_data.experiment_id`, `research_data.notebook_entry_id`

### Canonical

Those columns, plus `experiments.project_id` and `lab_notebook_entries.project_id` pointing at `research_projects`, plus a `writing_document_sources` link table (section 11).

### Migration

1. Orphan report for each column.
2. Indexes if the workflow file’s indexes are missing on a given database (the file adds them with the column; heal if a column exists without the index).
3. Foreign keys in a later migration: `protocol_id` to `protocols`, `experiment_id` to `experiments`, `notebook_entry_id` to `lab_notebook_entries`, `project_id` to `research_projects`. Use `ON DELETE SET NULL` for optional links so deleting a protocol does not delete the experiment. Use `ON DELETE CASCADE` only for true children (steps, comments, transactions).

### Compatibility

Null links remain valid. The UI may show “not linked” until the user connects them.

### Retirement

None. The columns are the canonical edges.

---

## 20. Tables that are not consolidated

Leave these as they are during phases 1–5:

- GDPR and consent tables (`consents`, `cookie_consents`, `gdpr_requests`, `retention_policies`, `legal_policies`, `audit_logs`). The GDPR migration drops and recreates some of them. Do not reorder historical files that are already in `schema_migrations`.
- `approval_requests`, `action_snapshots`, `rollback_requests`.
- Networking tables (`user_follows`, `user_connections`, `lab_follows`, `lab_join_requests`, `networking_posts`).
- Help forum (`help_requests`, `help_responses`).
- Messaging (`conversations`, `conversation_participants`, `messages`). `conversation_participants` has a unique pair and no declared foreign keys. Adding keys is a hardening sprint after orphan checks, not a merge.
- Lab Floors. There is no progress table. Phase 10 adds one. Schema sketch, not to be applied now: `lab_floors_progress` (`user_id` PK, `choice_json`, `roleplay_json`, `updated_at`) matching `drm_lab_floors_progress_v1` and `drm_lab_floors_roleplay_v1`.
- PeerCred tables in `mysql_api_missing_tables.sql` (`peercred_users`, `reference_analytics`, and related). The router is unmounted. Do not build on them.

---

## 21. Fresh-migrate acceptance check

After the schema-truth and experiment-heal migrations, a empty database that has run only `pnpm db:migrate` must allow these statements to prepare (tables exist), even if they return zero rows:

- The INSERT/SELECT lists for `calendar_events`, `instrument_maintenance`, `resource_exchange_requests`, `resource_exchange_offers`, `data_templates`, `experiment_risks`, `experiment_comments`, `successful_alternatives`, `failure_patterns`, `negative_results_contributor_stats`, `user_ai_failure_patterns`.
- Saves against `negative_result_saves` from the updated negative-results router.
- `ai_platform_usage` without the process having created it.
- `experiments` containing `title`, `status`, `lab_id`, `protocol_id`, and `notebook_entry_id`.

The roadmap’s schema sprint turns this list into an automated test.

---

## 22. Order

Apply consolidations in this order so later foreign keys have a parent:

1. User defaults and missing operational tables (no cross-table data move).
2. Experiment shape heal and experiment child tables.
3. Inventory ledger (no dependency on projects).
4. Maintenance table, then booking copy.
5. Project id map and repoint.
6. Notebook legacy copy, if rows exist.
7. Evidence copy from `results`, if rows exist.
8. Workflow foreign keys.
9. Citation `paper_id` backfill.
10. Notification copy.
11. Protocol professional-document copy, if rows exist.
12. Drops, each in its own migration, each behind the retirement condition above.
