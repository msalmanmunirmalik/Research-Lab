# Digital Research Manager — Current System Audit

Audit date: 4 October 2026.  
Repository: Digital Research Manager (`digital-research-manager`), workspace root.  
Purpose: inventory of what the current application actually implements, so it can be rebuilt without re-reading this repository.  
This document does not propose a new stack or implementation changes.

Method: routes, mounts, and `CREATE TABLE` names were extracted from source. Column lists for core tables were reconstructed from `database/migrations/*.sql` plus later `ALTER`s. Where a later migration can win or lose depending on apply order, that uncertainty is stated. Handler SQL was used to find tables the API queries that migrations never create.

Stack as it runs today:

- Frontend: React 18, React Router 6, Vite 6, Tailwind, axios. Entry `index.tsx` → `App.tsx`.
- API: Express 4 in `server/index.ts`, run with `tsx` in development and compiled with `tsc` for production.
- Database: MySQL via `mysql2`. Migrations in `database/migrations/mysql_*.sql`. A legacy SQLite bootstrap remains in `server/database/setup.ts` and `data/researchlab.db`.
- Statistics: FastAPI in `stats_service/advanced_main.py`, proxied by Node at `/api/advanced-stats/*`.
- Package manager: pnpm (`package.json`, `pnpm-lock.yaml`).

---

## 1. Repository Structure

Generated and vendor trees are omitted: `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.codacy`, and the large zip archives at the repo root.

### Frontend

| Path | What it contains |
|---|---|
| `index.tsx`, `index.html`, `index.css` | SPA bootstrap. |
| `App.tsx` | Router, authenticated chrome (sidebar, header, profile menu, notification bell, Ask AI). |
| `pages/` | One file per screen (56 `*.tsx` files). Several are unrouted; see section 19. |
| `components/` | Shared UI. Large feature components live at the top level (`SideNav.tsx`, `LabWorkspace*.tsx`, task views, protocol views, networking, marketplace forms). |
| `components/writing-studio/` | Writing Studio shell, sidebar, manuscript preview. |
| `components/lab-floors/` | Hub, scenario player, debrief, roleplay studio. |
| `components/evidence/` and `components/evidence/editors/` | Evidence-pack editors. |
| `components/notebook/` | Notebook-specific pieces. |
| `components/ui/` | Small shared controls. |
| `components/tools/` | Calculator / tool widgets. |
| `contexts/AuthContext.tsx` | Session state. |
| `hooks/useEntityDeepLink.ts` | `?highlight=` deep links. |
| `hooks/useEntityOptions.ts` | Shared entity option lists. |
| `services/` | Browser API clients and a few client-side helpers. `services/apiService.ts` is the main HTTP client. `services/experimentService.ts` wraps the experiment tracker. `services/geminiService.ts` is a leftover client Gemini helper; live AI calls go through the backend. |
| `utils/` | Citation formatting, writing export, research stats, role access, imports, Lab Floors progress. |
| `utils/labFloors/` | Scenario types, registry, local progress, roleplay progress. |
| `content/lab-floors/` | Authored scenario and roleplay content (not fetched from the API). |
| `styles/labFloors.css` | Lab Floors styles. |
| `types.ts` | Shared frontend types, including account roles. |
| `public/` | Static host config: `vercel.json`, `netlify.toml`, `staticwebapp.config.json`, `_redirects`. |
| `tailwind.config.js`, `postcss.config.cjs`, `vite.config.ts` | Frontend build. |

### Backend

| Path | What it contains |
|---|---|
| `server/index.ts` | Express app. Auth, labs, protocols, notebook, inventory, instruments, databank, messaging, presentations, and advanced-stats proxy are inline here. Mounts feature routers near the bottom (about lines 6012–6049). |
| `server/routes/` | Feature routers. Seven files exist but are not mounted (section 6.4). |
| `server/middleware/auth.ts` | JWT `authenticateToken`, `optionalAuth`, `requireRole`. |
| `server/middleware/security.ts` | Helmet, rate limits. |
| `server/middleware/serveFrontend.ts` | Production SPA static hosting. |
| `server/services/` | AI providers, agents, orchestrator, scholarly APIs, grants ingestion, writing assist, notifications, compliance, recommendations. |
| `server/services/providers/` | OpenAI, Gemini, Anthropic, Perplexity clients. |
| `server/services/scholarly/` | Crossref, OpenAlex, PubMed, Europe PMC, Unpaywall, citation formatting. |
| `server/services/grants/` | Horizon Europe ingest and fit-gap. |
| `server/services/writing/` | Assist, analysis, collaboration. |
| `server/services/agents/` | Named research agents. |
| `server/validation/` | Zod schemas, including signup roles. |
| `server/utils/` | Auth environment checks and helpers. |
| `server/database/setup.ts` | Legacy SQLite schema. Not the production path. |
| `server/advancedStatsService.js`, `server/aiPresentationService.js`, `server/advancedAIPresentationService.js`, `server/enhancedAIGenerationService.js` | Older JS services still imported by inline routes. |
| `server/working-server.js` | Older standalone server. Not the `package.json` start path. |

### Data, stats, deploy, tests

| Path | What it contains |
|---|---|
| `database/config.ts` | MySQL pool. Accepts `MYSQL_URL` or discrete `MYSQL_*` fields. Rewrites `$1` placeholders for MySQL. |
| `database/migrate.ts` | Applies `database/migrations/mysql_*.sql` in alphabetical filename order. Records applied files in `schema_migrations`. Always re-runs `mysql_schema_heal_common.sql`. |
| `database/migrations/` | 45 MySQL SQL files. `directadmin-package/database/migrations/` mirrors them. |
| `database/seed.ts`, `seed-lab-workspace.ts`, `seed_dummy_protocols.ts` | Seed scripts (`pnpm db:seed*`). |
| `stats_service/advanced_main.py` | FastAPI statistics service. |
| `stats_service/requirements.txt`, `run_stats_service.py`, `README.md` | Python service packaging. README port text disagrees with `package.json` (see section 18). |
| `deploy/directadmin/` | `app.js` process entry and Apache SPA `.htaccess`. |
| `directadmin-package/` | Packaged deploy tree (app, migrations, `ecosystem.config.cjs`, `env.directadmin.example`). |
| `ecosystem.config.cjs` | PM2 config. |
| `docker-compose.yml`, `Dockerfile` | Older container setup. Compose still describes a SQLite-style `DB_PATH` and is not the MySQL production path. |
| `tests/` | Jest unit/integration and Playwright specs. |
| `e2e-testing/` | Separate Jest/Puppeteer suite. |
| `cypress/` | Cypress auth and dashboard specs. |
| `server/__tests__/auth.test.ts` | API auth tests. |
| `scripts/` | Migrate, pack, QA, grants ingest, port cleanup. |
| `presentation-ai-reference/` | Nested reference app (own `.git`, Prisma, `src/`). Not imported by `App.tsx`. |
| `uploads/research-pdfs`, `uploads/writing-pdfs` | Local directories present on disk. Current multer handlers use memory storage and store a path string, not a guaranteed write into these folders. |
| `data/*.ts` | Mock datasets. `data/researchlab.db` is the legacy SQLite file. |
| `docs/` | `LOCAL_DEV.md`, test plan, and `TRANSFORMATION_CI4_ANTD.md` (a prior rewrite note, not running code). |
| Root `*.md` files | Historical implementation notes. They are not the runtime spec. Prefer this audit and the source files it cites. |

There is no separate `controllers/` layer. Route handlers in `server/index.ts` and `server/routes/*.ts` are the controllers. There is no ORM model layer; SQL strings are the models.

---

## 2. Frontend Route Map

Router: `App.tsx` (`BrowserRouter`). Authenticated pages render inside `AppLayout` except immersive Writing Studio editor paths, which render full-screen without sidebar, header, or Ask AI (`isWritingStudioEditorPath` in `utils/writingStudioRoutes.ts`).

`ProtectedRoute` (`components/ProtectedRoute.tsx`) only checks that a user and token exist. `App.tsx` never passes `requiredRole` or `allowedRoles`. Frontend routes are not role-gated. Unauthenticated users are sent to `/login` with `state.from`, but `LoginPage` ignores that state and only honors `?next=`.

### Public routes

| URL | Page | Auth | In sidebar | Notes |
|---|---|---|---|---|
| `/` | `pages/LandingPage.tsx` | No | No | Marketing home. |
| `/login` | `pages/LoginPage.tsx` | No | No | Query `next` (must be a single-slash relative path). Default after login: `/dashboard`. |
| `/register` | `pages/RegisterPage.tsx` | No | No | |
| `/privacy` | `pages/PrivacyPolicyPage.tsx` | No | No | |
| `/cookies` | `pages/CookiePolicyPage.tsx` | No | No | |
| `/cookie-policy` | redirect | No | No | `Navigate` to `/cookies`. |
| `/cookie-preferences` | `pages/CookiePreferencesPage.tsx` | No | No | |
| `/privacy-rights` | `pages/PrivacyRightsPage.tsx` | No | No | Query `requestId`, `token` for GDPR verification. |
| `/terms` | `pages/TermsOfServicePage.tsx` | No | No | |
| `/support` | `pages/SupportUsPage.tsx` | No | Header link only | Query `status` after checkout return. |
| `/unauthorized` | `pages/UnauthorizedPage.tsx` | No | No | Rarely reached because routes do not enforce roles. |
| `*` | `pages/NotFoundPage.tsx` | No | No | |

### Redirects (no page of their own)

| From | To |
|---|---|
| `/home`, `/tasks/new`, `/team`, `/calculator-hub`, `/research-tools`, `/bioinformatics-tools`, `/molecular-biology` | `/dashboard` |
| `/professional-protocols` | `/protocols` |
| `/ai-agents-capabilities`, `/research-assistant` | `/writing-studio` |
| `/ai-research-agent` | Writing Studio via `RedirectToWritingStudio` |
| `/research-journey` | Writing Studio, `flow=generate` |
| `/ai-presentations` | Writing Studio, `flow=present` |
| `/presentations` | `/writing-studio?notice=slides` |
| `/evidence-references` | Writing Studio, `flow=library` |
| `/data-sharing` | `/research-databank` |
| `/supplier-marketplace` | `/marketplace?tab=suppliers` |
| `/service-marketplace` | `/marketplace?tab=services` |
| `/my-portfolio`, `/scientist-passport` | `/profile` |
| `/team-messaging` | `/lab-workspace?section=teams&tab=messages`, then the workspace remaps that to the messages section |

### Authenticated routes

All of these require a logged-in user. None require a specific account role in the router.

| URL | Page | Sidebar | Query / params |
|---|---|---|---|
| `/dashboard` | `DashboardPage` | Yes | |
| `/lab-notebook` | `LabNotebookPage` | Yes, “Personal notebook” | `highlight` via `useEntityDeepLink` |
| `/protocols` | `ProtocolsPageRefactored` | Yes, “Protocol library” | `highlight` |
| `/protocols/:protocolId` | `ProtocolsPageRefactored` | Same item (prefix match) | Protocol id in the path |
| `/data-results` | `DataResultsPage` | Yes, “Research evidence” | `highlight` |
| `/writing-studio` | `WritingStudioPage` | Yes | `invite`, `notice=slides`, `cite`, `grantId` |
| `/writing-studio/new` | `WritingStudioPage` | Studio item stays active | |
| `/writing-studio/new/:docType` | `WritingStudioPage` | Hidden as its own item | `docType` |
| `/writing-studio/compose/:templateId` | `WritingStudioPage` | Immersive (no chrome) | Unsaved compose draft |
| `/writing-studio/compose/:templateId/s/:sectionId` | same | Immersive | Section |
| `/writing-studio/compose/:templateId/s/:sectionId/:panel` | same | Immersive | Panel id |
| `/writing-studio/m/:docId` | same | Immersive | Saved manuscript |
| `/writing-studio/m/:docId/s/:sectionId` | same | Immersive | |
| `/writing-studio/m/:docId/s/:sectionId/:panel` | same | Immersive | |
| `/writing-studio/tools/:toolId` | same | Immersive | In-studio tool |
| `/lab-workspace` | `LabWorkspacePage` | Yes | `section`, `tab` (see section 9) |
| `/lab-floors` | `LabFloorsPage` | Yes | |
| `/grants-fundings` | `GrantsFundingsPage` | Yes | `grantId` |
| `/collaboration-networking` | `CollaborationNetworkingPage` | Yes, “Networking” | |
| `/research-databank` | `ResearchDataBankPage` | Yes, “Data bank” | |
| `/research-databank/:orgId` | `ResearchDataBankOrgPage` | Same item | Org id |
| `/marketplace` | `MarketplacePage` | Yes | `tab=suppliers\|services\|tenders`, `view` = entity id |
| `/marketplace/supplier` | `SupplierWorkspacePage` | No | Seller workspace |
| `/marketplace/provider` | `ServiceProviderWorkspacePage` | No | Provider workspace |
| `/settings` | `SettingsPage` | Sidebar footer, not a section item | |
| `/profile` | `ProfilePage` | Profile menu only | |
| `/profile/:userId` | `ProfilePage` | No | Other user’s profile |
| `/labs/:labId` | `LabPublicPage` | No | Public-style lab page, still behind auth |
| `/experiment-tracker` | `ExperimentTrackerPage` | **Hidden** | `protocolId`, `title` (consumed then cleared), `highlight` |
| `/project-management` | `ProjectManagementPage` | **Hidden** | |
| `/pi-review-dashboard` | `PIReviewDashboardPage` | **Hidden** | |
| `/data-analysis` | `DataAnalyticsPage` | **Hidden** | Same component as `/data-analytics` |
| `/data-analytics` | `DataAnalyticsPage` | **Hidden** | Duplicate URL |
| `/negative-results` | `NegativeResultsPage` | **Hidden** | Linked from dashboard |
| `/events-opportunities` | `EventsOpportunitiesPage` | **Hidden** | Linked from dashboard / grants |
| `/conference-news` | `ConferenceNewsPage` | **Hidden** | |
| `/notifications` | `NotificationsPage` | **Hidden** | Bell links here |
| `/help-forum` | `HelpForumPage` | **Hidden** | Linked from dashboard |
| `/current-trends` | `CurrentTrendsPage` | **Hidden** | Query `post` read from `window.location.search` |

`pages/TeamManagementPage.tsx` is imported in `App.tsx` and has no `<Route>`.

---

## 3. Navigation Architecture

### Sidebar (`components/SideNav.tsx`)

No role filtering. Every logged-in user sees the same items. Brand mark links to `/dashboard`. Active style is teal. Writing Studio’s click handler always navigates to `/writing-studio` with empty search and state `{ studioHome: true, studioHomeAt }`, so it returns to the studio desk even from a manuscript URL.

Unlabeled primary group:

- Dashboard → `/dashboard`
- Personal notebook → `/lab-notebook`
- Protocol library → `/protocols`
- Research evidence → `/data-results`
- Writing studio → `/writing-studio`

Section **Lab**:

- Lab workspace → `/lab-workspace`
- Lab Floors → `/lab-floors`

Section **Research network**:

- Grants & funding → `/grants-fundings`
- Networking → `/collaboration-networking`
- Data bank → `/research-databank`
- Marketplace → `/marketplace`

Footer: Settings → `/settings`.

Desktop sidebar is `lg` and up (`w-60`). Below that, a header button opens the same `SideNav` in an overlay.

### Top navigation (`AppLayout` in `App.tsx`)

Sticky header, height 14:

- Mobile menu button and mobile wordmark (“Digital Research / Manager”).
- Support us → `/support` (heart icon).
- `NotificationBell`.
- Profile button: initials, first name, dropdown.

There is no global search field in the header.

### Profile menu

- Header shows name, email, and raw `user.role` badge.
- Research profile → `/profile`
- Settings → `/settings`
- Sign Out → `logout()` from `AuthContext`

### Notification menu

`components/NotificationBell.tsx` polls `GET /api/notifications/unread-count` every 30 seconds. Opening the dropdown loads `GET /api/notifications?limit=8`. A link goes to `/notifications`. No SSE and no WebSocket.

### Floating Ask AI

`components/ContextualResearchCopilot.tsx` is mounted at the bottom of `AppLayout`. Button label is “Ask AI”. Chat posts to `POST /api/ai-research-agent/chat`. It is not rendered on immersive Writing Studio paths.

### Hidden or context-only paths

Reachable while logged in, absent from the sidebar:

- Experiment tracker, project management, PI review, both data-analysis URLs.
- Negative results, events, conference news, help forum, current trends, notifications.
- Profile and other-user profile, public lab page, supplier and provider workspaces.
- All Writing Studio nested URLs.
- Support us (header only).

Dashboard cards and in-feature links are the intended way into several of these.

### Overlapping product surfaces

| Surfaces | What overlaps |
|---|---|
| Lab workspace projects and `/project-management` | Both call `/api/project-management/projects`. The standalone page is hidden and thinner. |
| Lab workspace tasks and Experiment Tracker | Two task-like systems. Workspace tasks are ops work (`workspace_tasks`). Experiments are scientific runs (`experiments`). |
| Research evidence (`/data-results`, table `research_data`) and Writing Studio library (`/evidence-references` redirect, tables `papers` / `writing_citations`) | “Evidence” in the nav is result packs. Scholarly evidence is inside Writing Studio. |
| `/data-analysis` and `/data-analytics` | Same page. Both differ from `utils/researchStats.ts` (used by evidence packs) and from the Python stats service. |
| Presentations routes and Writing Studio slides export | Old presentation pages redirect into the studio. Slide generation remains `POST /api/presentations/ai/generate`. |
| Profile, `/scientist-passport`, `/my-portfolio` | Passport and portfolio URLs redirect to `/profile`, which still calls `/api/scientist-passport/*`. |
| Team messaging page and lab workspace messages | `/team-messaging` redirects into the workspace. `TeamMessagingPage` is embedded there. `TeamManagementPage` is unused. |
| Marketplace directory and `/api/services` | Directory (`/marketplace`) is the live UI. The older service-request marketplace API is still mounted. |
| Quick notes | Created from both Dashboard and Personal notebook against `/api/quick-notes`. |
| Notifications | Unified `notifications`, plus `progress_notifications` and `grant_notifications`. |
| Personal calendar vs research events | `calendar_events` is a user calendar. `research_events` is the public opportunities directory. |

---

## 4. Authentication and Authorization

### Registration

Page: `pages/RegisterPage.tsx`. Endpoint: `POST /api/auth/register` (`server/index.ts`).

Fields: `firstName`, `lastName`, `username`, `email`, `password`, `confirmPassword`, `role`, privacy acceptance checkbox.

Client rules: username at least 3 characters; password at least 8 with upper, lower, and a digit.

UI roles: `student` or `researcher` only.

Server (`server/validation` signup schema): `PUBLIC_SIGNUP_ROLES = ['student', 'researcher']`. Any other or privileged role sent by the client is coerced to `student`. Password is bcrypt-hashed. Insert sets `email_verified = false` and `status = 'active'`. Response includes a JWT. Success navigates to `/dashboard`.

### Login

`POST /api/auth/login`. Body accepts email or username, plus password. User must exist and `status` must be `active`. Password checked with bcrypt. Response JWT. Frontend then calls `POST /api/compliance/consent/link-session` with `consent_session_id` when that key exists.

`POST /api/auth/demo-login` returns a fixed demo identity only when `ENABLE_DEMO_AUTH=true`. Boot code in `server/utils/authEnvironment.ts` rejects demo auth in production and rejects a missing, short, or well-known `JWT_SECRET` (minimum 32 characters).

### JWT and session

- Library: `jsonwebtoken`.
- Payload: `{ userId, email, role }`.
- Expiry: `24h`.
- Transport: `Authorization: Bearer <token>`.
- Middleware `server/middleware/auth.ts` verifies the JWT, reloads the user from `users`, and rejects a non-`active` status.
- Demo bypass: if demo auth is enabled and the bearer token equals `DEMO_AUTH_TOKEN` (default `demo-token-123`), middleware accepts it without a real JWT.
- `POST /api/auth/logout` does not invalidate the token server-side. It returns `{ message: 'Logged out' }`. The client deletes storage.

There is no refresh token and no server session store.

### Token storage (`utils/apiBase.ts`, `contexts/AuthContext.tsx`)

| localStorage key | Use |
|---|---|
| `authToken` | Primary JWT |
| `token` | Legacy alias, written in parallel |
| `user` | Cached user JSON, cleared on logout |
| `cookie_consent` | Banner choice |
| `consent_session_id` | Anonymous consent session later linked to the user |
| `lab-workspace-active-lab` | Selected lab id |
| `drm_lab_floors_progress_v1` | Choice-floor progress |
| `drm_lab_floors_roleplay_v1` | PhD roleplay progress |
| `researchlab:dashboard-sync-at` | Dashboard refresh signal |

On boot, `AuthContext` reads `authToken` and calls the profile endpoint. Failure clears the session. `isAuthenticated` is `!!user && !!token`.

### `/auth/me`

`GET /api/auth/me` requires `authenticateToken`. It returns the user already attached by middleware (`req.user`). It does not re-query an extended profile. `GET /api/auth/profile` and `PUT /api/auth/profile` are separate and update email, first name, and last name. Settings has its own `PUT /api/settings/profile`.

### Password reset and email verification

No forgot-password, reset-token, or verify-email endpoints exist under `/api/auth`. `users.email_verified` is stored and set false at signup. Login does not check it. Password change is only `PUT /api/auth/change-password` and `PUT /api/settings/change-password` (current password + new password, auth plus `authRateLimit` on the auth route).

### Account types

`types.ts` `UserRole`: `admin | principal_researcher | co_supervisor | researcher | student`.

`UserStatus`: `active | inactive | suspended | pending_verification`.

Signup can only create `student` or `researcher`. `admin`, `principal_researcher`, and `co_supervisor` must be assigned in the database or by a lab-membership update.

`utils/roleAccess.ts` hierarchy: student 1, researcher 2, principal_researcher 3, admin 4. `co_supervisor` is missing from this map, so `hasMinimumRole` treats it as 0.

`getRolePermissions` is mostly permissive. Students are marked unable to manage protocols. Admin and principal researcher can manage users/inventory in this map. **The router does not call `canAccessRoute`.** `ROUTE_ACCESS` only lists a handful of paths and returns false for anything else, so it is stale relative to the real route table.

### Lab roles

Stored on `lab_members.role` (default `'student'` in SQL). Creating a lab inserts the creator as `principal_researcher`.

Invite and member update/delete in `server/index.ts` allow lab roles `principal_researcher`, `admin`, and `co_supervisor`.

Workspace lab listing orders memberships `principal_researcher`, then `admin`, then everyone else (`server/routes/labWorkspace.ts`).

`permissions` on `lab_members` is a TEXT field. It is not a structured permission engine.

### Admin permissions (enforced on the server)

- `GET /api/users`: account role `admin` or `principal_researcher`.
- `POST /api/grants/ingest`: `requireRole(['admin'])`.
- Compliance audit logs, GDPR processing, retention policies, legal policy writes, compliance dashboard: `requireRole(['admin'])`.
- Some instrument maintenance branches check `req.user.role !== 'admin'` and then fall back to lab membership.

### Principal researcher permissions

Account-level: may list all users (`GET /api/users`) together with admins.

Lab-level: the PI membership role can manage members and showcase. Showcase UI treats `principal_researcher` and `admin` as managers.

PI review is a separate product (`/pi-review-dashboard` and `/api/project-management/pi-reviews`). It is not automatically limited to principal researchers in the router. The review page’s list loaders are commented out (section 7).

---

## 5. Database Schema

### Engine and migrations

- Engine: MySQL (`mysql2/promise`) in `database/config.ts`.
- Runtime env: `MYSQL_URL` or `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DB`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SOCKET`, `MYSQL_SSL`, plus `DB_POOL_MAX`, `DB_IDLE_TIMEOUT`, `DB_CONNECTION_TIMEOUT`.
- `config.ts` default database name is `digital_research_manager`. `database/migrate.ts` default database name is `researchlab`. These defaults disagree.
- Apply: `pnpm db:migrate` sorts `mysql_*.sql` by filename, skips names already in `schema_migrations`, runs with `multipleStatements`. Duplicate-column and already-exists errors are ignored.
- `schema_migrations`: `id VARCHAR(255) PK` (filename), `applied_at DATETIME`.
- `pnpm db:reset` still runs `psql` against `digital_research_manager`. That is a leftover Postgres command and will not reset MySQL.
- IDs are `VARCHAR(64)`, not MySQL `AUTO_INCREMENT`. Application code generates them.
- Booleans are `TINYINT(1)`.
- Many status columns are `VARCHAR`, not MySQL `ENUM`. The clear enum is `grant_sources.source_type ENUM('api','scrape','rss','manual')`.

### Lab Floors

No progress table. Progress is localStorage only (section 10).

### Duplicate models

**Projects**

- `projects` (`mysql_migration.sql`): legacy `id`, `name`, `description`, `owner_id` → `users`. Early `experiments.project_id` pointed here.
- `research_projects` (`mysql_research_projects.sql`): the project-management model (title, budget, dates, status, PI). This is what `/api/project-management` uses.
- `workspace_tasks.project_id`: optional string, no foreign key.

**Notebooks**

- `notebook_entries` + `content_blocks`: legacy, experiment-linked.
- `lab_notebook_entries` + `lab_notebook_comments`: the live personal notebook.

**Bookings**

- `bookings`: core instrument booking (`instrument_id`, `user_id`, `title`, times).
- `instrument_bookings`: workspace booking with `lab_id`, `purpose`, `status` default `confirmed`, `notes`.

**Protocols**

- `protocols` + `protocol_steps` + `protocol_attachments` + `protocol_sharing`: live library.
- `professional_protocols`: parallel long-text protocol document. Its router is not mounted. UI route `/professional-protocols` redirects to `/protocols`.

**Scholarly libraries**

- Canonical: `papers`, `paper_identifiers`, `user_library_items`, `reference_collections`, `reference_collection_items`, `paper_chunks`, `scholarly_cache`, `scholarly_audit_events` (`mysql_evidence_references.sql`). Served by `/api/research/*`.
- Writing Studio: `writing_citations` + `writing_document_citations`. Separate per-user citation records, optionally linked to library items.
- Legacy: `user_papers` is created at runtime inside `server/routes/paperLibrary.ts` with Postgres syntax (`UUID`, `JSONB`). That router is not mounted. Do not treat `user_papers` as a MySQL table.

**Statistics-like stores**

There is no `statistics` table. Counts live on `protocols` (`usage_count`, `success_count`), `negative_results`, `reference_analytics` (PeerCred), `platform_activities`, and `ai_platform_usage`.

**Notifications**

`notifications` (in-app), `progress_notifications` (project management), `grant_notifications` (grant matches).

### Tables the API uses that migrations do not create

These names appear in handler SQL and have no `CREATE TABLE` under `database/migrations/`:

- `calendar_events`
- `instrument_maintenance`
- `resource_exchange_requests`, `resource_exchange_offers`
- `data_templates`
- `experiment_risks`, `experiment_comments`
- `saved_negative_results` (migration creates `negative_result_saves` instead)
- `successful_alternatives`, `failure_patterns`, `negative_results_contributor_stats`
- `user_ai_failure_patterns` (continuous-learning service)

A rebuild that only replays migrations will not satisfy those handlers until the missing tables are added or the handlers are dropped.

### Names that do not exist as tables

- Manuscripts and sections: `writing_documents.content` JSON, plus `writing_section_locks`.
- Datasets: `research_data` and databank offer/request tables.
- Equipment: `instruments`.
- Organizations: `databank_organizations` only.
- Lab Floors progress: localStorage.

### `users`

Purpose: accounts and public profile. Defined in `mysql_migration.sql`, altered by `mysql_users_patch.sql`, `mysql_users_settings_patch.sql`, `mysql_qa_p0_schema_alignment.sql`, `mysql_schema_heal_common.sql`.

| Column | Type |
|---|---|
| `id` | `VARCHAR(64)` PK |
| `username` | `VARCHAR(255)` UNIQUE NOT NULL |
| `email` | `VARCHAR(255)` UNIQUE NOT NULL |
| `first_name`, `last_name` | `VARCHAR(255)` |
| `password_hash` | `VARCHAR(255)` NOT NULL |
| `role` | `VARCHAR(100)` NOT NULL DEFAULT `'Research Assistant'` (signup writes `student` / `researcher`; default string does not match the TypeScript union) |
| `avatar_url` | `TEXT` |
| `status` | `VARCHAR(50)` DEFAULT `'Offline'` (signup writes `'active'`; middleware expects `active`) |
| `email_verified` | `TINYINT(1)` DEFAULT 0 |
| `last_login` | `DATETIME` |
| `expertise`, `bio` | `TEXT` |
| `phone` | `VARCHAR(50)` |
| `department`, `specialization`, `current_position`, `current_institution`, `location` | `VARCHAR(255)` |
| `timezone` | `VARCHAR(100)` |
| `profile_visibility` | `VARCHAR(100)` DEFAULT `'lab'` |
| `show_email`, `show_phone`, `show_location` | `TINYINT(1)` DEFAULT 0 |
| `research_interests`, `skills`, `looking_for` | `TEXT` |
| `research_field` | `VARCHAR(255)` |
| `orcid` | `VARCHAR(50)` |
| `google_scholar_url`, `linkedin_url`, `website_url` | `TEXT` |
| `created_at`, `updated_at` | `DATETIME` |

No foreign keys. Indexes: unique username, unique email.

### `labs`

Defined in `mysql_notebook_schema.sql`. Showcase columns from `mysql_lab_showcase.sql`. Cleanup scripts delete a seeded “default lab” and duplicate labs; they do not change shape.

Columns: `id` PK, `name`, `institution`, `department`, `description`, `principal_researcher_id`, `contact_email`, `contact_phone`, `address`, `website_url`, `is_showcased` TINYINT default 0, `showcased_at`, `showcase_tagline` VARCHAR(280), `research_areas` TEXT, `looking_for` TEXT, `lab_type`, `established_year`, `created_at`, `updated_at`.

`research_areas` and `looking_for` are text that the app treats as JSON arrays. No FK from `principal_researcher_id` to `users`.

### `lab_members`

`id` PK, `lab_id` FK → `labs` ON DELETE CASCADE, `user_id` FK → `users` ON DELETE CASCADE, `role` VARCHAR default `'student'`, `permissions` TEXT, `is_active` TINYINT default 1, `joined_at`, `updated_at`.

### Projects

`projects` (legacy): `id`, `name`, `description`, `owner_id` FK → `users`, timestamps.

`research_projects`: `id`, `lab_id`, `project_code`, `project_title`, `project_description`, `principal_investigator_id`, `project_type`, `research_field`, `total_budget`, `budget_spent`, `planned_start_date`, `planned_end_date`, `status` default `'planning'`, `overall_progress_percentage`, timestamps. Indexes on lab, status, PI. No FK constraints.

`project_work_packages`: FK `project_id` → `research_projects` CASCADE, status default `'not_started'`.

Related, same migration file: `lab_team_hierarchy` (`is_active`), `member_progress_reports` (`submission_status` default `'draft'`), `pi_reviews` (approval status and ratings), `progress_notifications`, `team_meetings` (`status` default `'scheduled'`).

### Tasks (workspace)

See section 9 for behaviour. Tables from `mysql_lab_workspace.sql`:

- `lab_workspaces`: PK `id`, UNIQUE `lab_id`, `name`, `description`, `color`, `icon`, `created_by`, timestamps.
- `workspace_spaces`: FK `workspace_id` CASCADE, `position`, `is_archived`.
- `workspace_folders`: FK `space_id` CASCADE.
- `workspace_lists`: FK `space_id` CASCADE, nullable `folder_id` (indexed, no FK in the CREATE).
- `workspace_tasks`: status default `to_do`, priority default `normal`, `due_date`, `start_date`, `assignee_id`, `tags` TEXT, `custom_fields` TEXT, soft links `project_id`, `protocol_id`, `inventory_item_id`, `instrument_id`, `progress_percentage`, `time_estimated`, `time_tracked`, archive and completion timestamps. FKs to workspace and list, both CASCADE.
- `workspace_subtasks`: FK `task_id` CASCADE, `is_completed`, `assignee_id`, `position`.
- `task_comments`: FK `task_id` CASCADE, `parent_comment_id`, `is_edited`.

Task status values used by the UI: `to_do | in_progress | in_review | done | cancelled`. Priority: `low | normal | high | urgent`.

### Protocols

`protocols` (core plus patches): `id`, `title`, `description`, `category`, `difficulty_level`, `estimated_duration`, `materials`, `content`, `safety_notes`, `lab_id`, `privacy_level` default `'lab'`, `is_approved` default 1, `tags`, `author_id` FK → `users`, `last_updated`, `version`, `access_level` default `'Lab Only'`, `discussion_count`, `video_url`, `forked_from` FK → `protocols`, `created_at`, `usage_count`, `last_used_at`, `success_count`.

`protocol_steps`: FK `protocol_id` CASCADE. Step text, order, `calculator_data` and `conditional_data` as TEXT.

`protocol_attachments`: FK `protocol_id` CASCADE.

`protocol_sharing`: protocol, lab, and user FKs, `permission_level` default `'read'`.

`protocol_executions`: completed steps, notes, photos, deviations, issues as LONGTEXT, `success` TINYINT.

`protocol_embeddings`: `protocol_id` PK, `content_hash`, `embedding` LONGTEXT, model, provider, timestamps.

`professional_protocols`: separate draft document, `status` default `'draft'`, many LONGTEXT columns. Indexes on `lab_id`, `created_by`, `status`.

### Experiments

Two CREATEs exist: a thin one in `mysql_migration.sql` (`id`, `project_id`, `name`, `goal`, `created_at`) and a tracker-shaped `CREATE TABLE IF NOT EXISTS` in `mysql_experiments_schema.sql`. If the thin table already exists, the second CREATE does nothing and later ALTER files add tracker columns.

Expected merged columns when the thin table was created first: legacy `id`, `project_id`, `name`, `goal`, `created_at`, plus `title`, `description`, `hypothesis`, `objectives`, `methodology`, `expected_outcomes`, `status` default `'planning'`, `priority` default `'medium'`, `category`, durations, dates, `lab_id`, `researcher_id`, `collaborators`, `equipment`, `materials`, `reagents`, `safety_requirements`, `budget`, `tags`, `notes`, `template_id`, `actual_cost`, `updated_at`, `protocol_id`, `notebook_entry_id`.

UI statuses: `planning | ready | running | paused | completed | failed | cancelled`.

`experiment_templates`, `experiment_milestones` (status default `'pending'`), `experiment_progress_logs` (`duration_logged`, `cost_logged`, `attachments` TEXT).

`experiment_risks` and `experiment_comments` are queried by `server/routes/experimentTracker.ts` and are not in the migration CREATEs.

### Notebook entries

`lab_notebook_entries`: `entry_type`, `status`, `priority`, `privacy_level` default `'lab'`, methodology/results text, costs, `lab_id` FK SET NULL, `user_id` FK CASCADE, `project_id` without FK. Heal/workflow migrations add `protocol_id` and `experiment_id`.

UI statuses: `planning | in_progress | completed | on_hold | failed`. Priorities: `low | medium | high | critical`. Entry types used in the form: `experiment | idea | results | problem`. The entry-types endpoint also offers observation, meeting, protocol, analysis.

`lab_notebook_comments`: entry and user FKs.

`quick_notes`: user-owned sticky notes, FK `user_id`.

`notebook_entries` / `content_blocks`: legacy. Status default `'In Progress'`. `content_blocks.data` is TEXT.

### Evidence / results

`research_data` (`mysql_forms_crud_alignment.sql`): `type` default `'experiment'`, `category` default `'other'`, `status` default `'draft'`, `privacy_level` default `'lab'`, `files` JSON, `metadata` JSON, plus link columns `protocol_id`, `experiment_id`, `notebook_entry_id`. This is the Research evidence page.

UI curation flow: `draft → under_review → published → archived`.

`results` (`mysql_migration.sql`): older shared-results table, `source` default `'Manual'`. Not the evidence-pack UI.

### Papers and citations

`papers`: canonical work. Unique DOI, PMID, OpenAlex id and similar. JSON: `authors`, `affiliations`, `keywords`, `mesh_terms`, `topics`.

`paper_identifiers`: extra id types. `user_library_items`: user↔paper, `tags` JSON, unique `(user_id, paper_id)`. Collections: `reference_collections`, `reference_collection_items` composite PK. `paper_chunks`: text plus optional `embedding` JSON. `scholarly_cache`: `cache_key` PK, `payload` MEDIUMTEXT, `expires_at`. `scholarly_audit_events`: `event_type`, `metadata` JSON.

`writing_citations`: per user. JSON `authors`, `csl_json`. `raw_bibtex` MEDIUMTEXT. Later `mysql_writing_studio_sources.sql` adds `source_text` MEDIUMTEXT and `pdf_path` VARCHAR(1000).

`writing_document_citations`: PK `(document_id, citation_id)`, `sort_order`.

### Manuscripts

`writing_documents`: `id`, `user_id`, `doc_type` default `'research_paper'`, `template_id` default `'paper_imrad_journal'`, `title`, `status` default `'draft'`, `citation_style` default `'APA'`, `content` JSON, `metadata` JSON, timestamps. `mysql_writing_collab.sql` adds `content_revision` INT default 1. Indexes on user, type, updated_at.

Sections are objects inside `content`, not rows. See section 8.

Collaboration (`mysql_writing_collab.sql`):

- `writing_collaborators`: `role` default `'editor'`, `access_scope` default `'entire'`, `section_ids` JSON, `status` default `'active'`.
- `writing_invitations`: unique token, `status` default `'pending'`, `section_ids` JSON.
- `writing_section_locks`: PK `(document_id, section_id)`.
- `writing_presence`: PK `(document_id, user_id)`.

### Grants

`grants` (Horizon alignment file is the rich definition; a later `CREATE IF NOT EXISTS` in `mysql_public_posts_attribution.sql` does not replace it): programme and call metadata, funding fields, `status` default `'open'`, JSON `disciplines`, `keywords`, `eligibility`, `requirements`, `raw_payload`. Unique `(source_id, external_id)`.

`user_grant_preferences`: JSON keywords, disciplines, regions, funding types. Unique `user_id`.

`grant_matches`: unique `(user_id, grant_id)`, `reasons` JSON, `notified_at`.

`grant_sources`: `source_type` enum `api|scrape|rss|manual`, `auth_config` JSON, `config` JSON.

`grant_writeups`: created first by `mysql_grant_writeups.sql` as JSON `content` and `metadata`, `status` default `'draft'`. A later CREATE IF NOT EXISTS would not change that. If a database was built out of order, `content` might be TEXT.

`grant_embeddings`: vector LONGTEXT. `grant_notifications`: `channel` default `'in_app'`, `status` default `'sent'`.

### Datasets and organizations

`databank_organizations`, `databank_data_offers`, `databank_data_requests` in `mysql_forms_crud_alignment.sql`, with later attribution columns (`posted_by_name`, `created_by` / `user_id`).

### Marketplace, suppliers, service providers

Directory (`mysql_marketplace_directory.sql`, `mysql_marketplace_tenders.sql`): `marketplace_suppliers`, `marketplace_supplier_catalog`, `marketplace_service_providers`, `marketplace_service_offerings`, `marketplace_tenders`.

Older service marketplace (`mysql_forms_crud_alignment.sql`, `mysql_api_missing_tables.sql`): `service_categories`, `service_listings`, `service_requests`, `service_portfolio_items`.

### Negative results

`negative_results`: `sharing_status` default `'public'`, vote and view counters. Children in the same migration: `negative_result_comments`, `negative_result_votes`, `negative_result_saves`.

Handlers also name `saved_negative_results`, `successful_alternatives`, `failure_patterns`, and `negative_results_contributor_stats`, which this migration does not create.

### Research events, forum, community

`research_events` status default `upcoming`. `research_event_bookmarks`. `research_event_applications` status default `applied`.

`help_requests` starts in `mysql_migration.sql` and is widened by `mysql_help_forum.sql`. `help_responses` is the reply table.

`community_posts` plus `community_post_likes`, `community_post_comments`, `community_post_saves`. Post types in the UI: `news | update | idea | blog | opinion | opportunity`.

`networking_posts`. Social: `user_follows`, `user_connections` (status `pending`), `lab_follows`, `lab_join_requests` (status `pending`).

### Notifications and messages

`conversations.type` default `'direct'`. `conversation_participants` unique `(conversation_id, user_id)` without declared FKs. `messages`: `conversation_id`, `sender_id`, `content`.

`notifications.type` default `'system'`.

### Inventory, equipment, bookings, maintenance

`inventory_items`: two quantity styles coexist after patches (`quantity_value`/`quantity_unit` and `quantity`/`unit`/`min_quantity`), plus `lab_id`, and both `expiry_date` and `expiration_date`.

`instruments`: `status` default `'Operational'`, `lab_id`, `model`, `manufacturer`, `description`.

`bookings` and `instrument_bookings` as above.

`instrument_maintenance` is inserted by the API (`status` written as `'scheduled'`) and is not created by migrations. There is no `inventory_transactions` table; stock changes update `inventory_items`.

### AI keys and quota

`ai_provider_configs`: `provider` primary key, registry row per provider.

`ai_provider_keys`: per user, unique `(user_id, provider)`, FKs to `users` and `ai_provider_configs`. Key material is encrypted by the application (AES-256-GCM, `ENCRYPTION_KEY`) before insert.

`ai_platform_usage`: PK `(user_id, usage_date)`, `message_count`. Also ensured at runtime by `server/services/platformAiAccess.ts`.

`ai_training_data`: corpus rows, FK user. `user_ai_content`: similar store from the QA alignment migration.

### Other tables worth preserving in a schema map

| Table | File | Role |
|---|---|---|
| `user_preferences` | `mysql_user_preferences.sql` | Theme and settings toggles |
| `workflows` | `mysql_workflows.sql` | Stored automation configs |
| `platform_activities` | QA alignment | Activity stream |
| `approval_requests`, `action_snapshots`, `rollback_requests` | `mysql_safety_systems.sql` | Safety / rollback |
| `audit_logs` | safety + GDPR alters | Compliance audit |
| `legal_policies`, `consents`, `cookie_consents`, `gdpr_requests`, `retention_policies`, `user_processing_restrictions` | GDPR and QA files | Privacy |
| `peercred_users`, `reference_analytics`, `work_relationships`, `reference_requests`, `reference_responses` | `mysql_api_missing_tables.sql` | Peer reference product; router unmounted |
| `scratchpad_items` | core migration | Calculator scratchpad |

GDPR migration drops and recreates `consents`, `gdpr_requests`, and `retention_policies`. If only the earlier QA file ran, those tables are thinner (`request_type` vs `type`). `cookie_consents` is only in the QA file and is not dropped by the GDPR migration.

### Migration file index

| File | Creates or alters |
|---|---|
| `mysql_migration.sql` | users, protocols, steps, attachments, projects, thin experiments, notebook_entries, content_blocks, inventory, instruments, bookings, results, help_requests, scratchpad |
| `mysql_notebook_schema.sql` | labs, lab_members, lab notebook |
| `mysql_lab_workspace.sql` | workspace hierarchy, instrument_bookings |
| `mysql_research_projects.sql` | PI project management |
| `mysql_writing_studio.sql` / `_collab` / `_sources` | manuscripts, citations, collab |
| `mysql_evidence_references.sql` | scholarly library |
| `mysql_grants_horizon_alignment.sql`, `mysql_grant_writeups.sql` | grants |
| `mysql_experiments_schema.sql`, `mysql_experiments_patch.sql` | experiment tracker |
| `mysql_forms_crud_alignment.sql` | research_data, events, databank, service listings |
| `mysql_marketplace_directory.sql`, `mysql_marketplace_tenders.sql` | directory |
| `mysql_negative_results.sql` | negative results |
| `mysql_networking_social.sql`, `mysql_networking_lab_actions.sql`, `mysql_public_posts_attribution.sql` | social graph and posts |
| `mysql_help_forum.sql`, `mysql_community_news.sql`, `mysql_community_engagement.sql` | forum and trends |
| `mysql_notifications.sql` | notifications, grant_notifications |
| `mysql_ai_providers.sql`, `mysql_ai_platform_usage.sql`, `mysql_ai_training_data.sql` | AI |
| `mysql_gdpr_compliance_alignment.sql`, `mysql_safety_systems.sql` | compliance |
| `mysql_protocol_sharing.sql`, `mysql_vector_embeddings.sql`, `mysql_workflows.sql`, `mysql_workflow_links.sql` | sharing, embeddings, cross-links |
| `mysql_schema_heal_common.sql` | idempotent ALTERs, re-run every migrate |

---

## 6. API Inventory

Counts from source: 126 inline `app.*` declarations in `server/index.ts` (a few paths are declared twice), plus every `router.*` handler in mounted route files. Experiment tracker is mounted twice (`/api/experiment-tracker` and `/api/experiments`) with the same handlers. Unmounted route files are listed at the end of this section and are not live.

Request bodies are described where the handler is a product boundary. For the long mounted routers, the table is the complete method and path list; the domain table at the end names the tables those handlers use.

### 6.1 How routes are mounted

Express app is `server/index.ts`. Global `app.use('/api', apiRateLimit)`. SPA fallback is `server/middleware/serveFrontend.ts` (`app.get('*')`) when `SERVE_FRONTEND` or production.

SQL in handlers uses `$1` placeholders. `database/config.ts` adapts them for MySQL via `mysql2`.

Mounted prefixes (from `server/index.ts` around lines 6012–6049):

- `/api/agents` ← `server/routes/agents.ts` — authenticateToken at mount
- `/api/ai-providers` ← `server/routes/aiProviderKeys.ts` — authenticateToken at mount
- `/api/ai-research-agent` ← `server/routes/aiResearchAgent.ts` — authenticateToken at mount
- `/api/ai-training` ← `server/routes/aiTraining.ts` — authenticateToken at mount
- `/api/api-task-assignments` ← `server/routes/apiTaskAssignments.ts` — authenticateToken at mount
- `/api/community-news` ← `server/routes/communityNews.ts` — authenticateToken at mount
- `/api/compliance` ← `server/routes/compliance.ts` — per-route; many requireRole admin
- `/api/dashboard` ← `server/routes/dashboard.ts` — authenticateToken at mount
- `/api/evidence-ai` ← `server/routes/evidenceAI.ts` — authenticateToken at mount
- `/api/experiment-tracker AND /api/experiments` ← `server/routes/experimentTracker.ts` — authenticateToken at mount (same router twice)
- `/api/grants` ← `server/routes/grants.ts` — authenticateToken at mount; POST /ingest also requireRole admin
- `/api/help-forum` ← `server/routes/helpForum.ts` — authenticateToken at mount
- `/api/lab-floors` ← `server/routes/labFloorsRoleplay.ts` — authenticateToken at mount
- `/api/lab-workspace` ← `server/routes/labWorkspace.ts` — authenticateToken at mount AND on each handler
- `/api/marketplace` ← `server/routes/marketplaceDirectory.ts` — authenticateToken at mount
- `/api/negative-results` ← `server/routes/negativeResults.ts` — public GETs; mutations authenticateToken
- `/api/networking/directory` ← `server/routes/networkingDirectory.ts` — authenticateToken at mount
- `/api/networking/posts` ← `server/routes/networkingPosts.ts` — authenticateToken at mount
- `/api/networking/social` ← `server/routes/networkingSocial.ts` — authenticateToken at mount
- `/api/notebook-summaries` ← `server/routes/notebookSummaries.ts` — router.use(authenticateToken)
- `/api/notifications` ← `server/routes/notifications.ts` — authenticateToken at mount
- `/api/orchestrator` ← `server/routes/orchestrator.ts` — authenticateToken at mount
- `/api/project-management` ← `server/routes/projectManagement.ts` — authenticateToken at mount
- `/api/protocol-ai` ← `server/routes/protocolAI.ts` — authenticateToken at mount
- `/api/protocol-collaboration` ← `server/routes/protocolCollaboration.ts` — authenticateToken at mount
- `/api/protocol-comparison` ← `server/routes/protocolComparison.ts` — authenticateToken at mount
- `/api/protocol-execution` ← `server/routes/protocolExecution.ts` — authenticateToken at mount
- `/api/protocol-search` ← `server/routes/protocolSemanticSearch.ts` — authenticateToken at mount
- `/api/recommendations` ← `server/routes/recommendations.ts` — router.use(authenticateToken)
- `/api/research` ← `server/routes/research.ts` — authenticateToken at mount
- `/api/research-events` ← `server/routes/researchEvents.ts` — authenticateToken at mount
- `/api/scientist-passport` ← `server/routes/scientistPassport.ts` — authenticateToken at mount
- `/api/services` ← `server/routes/serviceMarketplace.ts` — authenticateToken at mount
- `/api/settings` ← `server/routes/settings.ts` — authenticateToken at mount
- `/api/support` ← `server/routes/support.ts` — none
- `/api/writing` ← `server/routes/writing.ts` — authenticateToken at mount
- Writing collab is nested: `writing.ts` mounts `writingCollab.ts` at `/documents/:id`, so live paths are `/api/writing/documents/:id/...`.

### 6.2 Inline endpoints in `server/index.ts`

Auth column: `public` or `authenticateToken`. Register/login/demo-login/change-password also use `authRateLimit`. `GET /api/users` additionally requires account role `admin` or `principal_researcher`.

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |
| GET | `/api/health` | public |
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/demo-login` | public |
| POST | `/api/auth/logout` | public |
| GET | `/api/auth/me` | authenticateToken |
| GET | `/api/auth/profile` | authenticateToken |
| PUT | `/api/auth/profile` | authenticateToken |
| PUT | `/api/auth/change-password` | authenticateToken |
| GET | `/api/users` | authenticateToken; role admin or principal_researcher |
| GET | `/api/users/search` | authenticateToken |
| POST | `/api/labs` | authenticateToken |
| GET | `/api/labs/mine` | authenticateToken |
| GET | `/api/labs` | authenticateToken |
| GET | `/api/labs/members` | authenticateToken |
| GET | `/api/labs/:id` | authenticateToken |
| POST | `/api/labs/:id/members` | authenticateToken |
| PUT | `/api/labs/:id/members/:userId` | authenticateToken |
| DELETE | `/api/labs/:id/members/:userId` | authenticateToken |
| PUT | `/api/labs/:id` | authenticateToken |
| PUT | `/api/labs/:id/showcase` | authenticateToken |
| POST | `/api/protocols` | authenticateToken |
| GET | `/api/protocols` | authenticateToken |
| GET | `/api/protocols/:id` | authenticateToken |
| PUT | `/api/protocols/:id` | authenticateToken |
| DELETE | `/api/protocols/:id` | authenticateToken |
| POST | `/api/protocols/:id/share` | authenticateToken |
| GET | `/api/protocols/categories` | authenticateToken |
| POST | `/api/lab-notebooks` | authenticateToken |
| GET | `/api/lab-notebooks` | authenticateToken |
| GET | `/api/lab-notebooks/activity` | authenticateToken |
| GET | `/api/lab-notebooks/suggestions` | authenticateToken |
| GET | `/api/lab-notebooks/:id` | authenticateToken |
| PUT | `/api/lab-notebooks/:id` | authenticateToken |
| DELETE | `/api/lab-notebooks/:id` | authenticateToken |
| POST | `/api/lab-notebooks/:id/share` | authenticateToken |
| GET | `/api/lab-members` | authenticateToken |
| POST | `/api/lab-notebooks/:id/comments` | authenticateToken |
| GET | `/api/lab-notebooks/:id/comments` | authenticateToken |
| GET | `/api/lab-notebooks/entry-types` | authenticateToken |
| GET | `/api/lab-notebooks/statistics` | authenticateToken |
| POST | `/api/quick-notes` | authenticateToken |
| GET | `/api/quick-notes` | authenticateToken |
| PUT | `/api/quick-notes/:id` | authenticateToken |
| DELETE | `/api/quick-notes/:id` | authenticateToken |
| POST | `/api/calendar-events` | authenticateToken |
| GET | `/api/calendar-events` | authenticateToken |
| PUT | `/api/calendar-events/:id` | authenticateToken |
| DELETE | `/api/calendar-events/:id` | authenticateToken |
| POST | `/api/inventory` | authenticateToken |
| GET | `/api/inventory` | authenticateToken |
| PUT | `/api/inventory/:id` | authenticateToken |
| DELETE | `/api/inventory/:id` | authenticateToken |
| POST | `/api/inventory/:id/transactions` | authenticateToken |
| GET | `/api/inventory/categories` | authenticateToken |
| POST | `/api/instruments` | authenticateToken |
| GET | `/api/instruments` | authenticateToken |
| POST | `/api/instruments/:id/bookings` | authenticateToken |
| GET | `/api/instruments/:id/bookings` | authenticateToken |
| GET | `/api/instruments/categories` | authenticateToken |
| POST | `/api/instruments/:id/maintenance` | authenticateToken |
| GET | `/api/instruments/:id/maintenance` | authenticateToken |
| PUT | `/api/instruments/:id` | authenticateToken |
| DELETE | `/api/instruments/:id` | authenticateToken |
| POST | `/api/exchange/requests` | authenticateToken |
| GET | `/api/exchange/requests` | authenticateToken |
| PUT | `/api/exchange/requests/:id/status` | authenticateToken |
| POST | `/api/exchange/requests/:id/offers` | authenticateToken |
| GET | `/api/exchange/offers` | authenticateToken |
| PUT | `/api/exchange/offers/:id/status` | authenticateToken |
| POST | `/api/instruments/:id/share` | authenticateToken |
| GET | `/api/instruments/shared` | authenticateToken |
| POST | `/api/instruments/:id/book` | authenticateToken |
| GET | `/api/instruments/:id/bookings` (duplicate declaration) | authenticateToken |
| GET | `/api/instruments/:id/availability` | authenticateToken |
| PUT | `/api/bookings/:id/status` | authenticateToken |
| GET | `/api/bookings/my` | authenticateToken |
| GET | `/api/lab-notebooks` (duplicate declaration) | authenticateToken |
| GET | `/api/health` (duplicate declaration) | public |
| GET | `/api/presentations/ai/health` | authenticateToken |
| GET | `/api/presentations/ai/themes` | authenticateToken |
| POST | `/api/presentations/ai/outline` | authenticateToken |
| POST | `/api/presentations/ai/slide-content` | authenticateToken |
| POST | `/api/presentations/ai/generate` | authenticateToken |
| POST | `/api/presentations/ai/improve` | authenticateToken |
| GET | `/api/advanced-stats/health` | authenticateToken |
| POST | `/api/advanced-stats/workflow/execute` | authenticateToken |
| POST | `/api/advanced-stats/data/load-csv` | authenticateToken |
| POST | `/api/advanced-stats/data/load-excel` | authenticateToken |
| POST | `/api/advanced-stats/preprocessing/data-info` | authenticateToken |
| POST | `/api/advanced-stats/preprocessing/select-columns` | authenticateToken |
| POST | `/api/advanced-stats/preprocessing/remove-duplicates` | authenticateToken |
| POST | `/api/advanced-stats/preprocessing/handle-missing` | authenticateToken |
| POST | `/api/advanced-stats/analysis/descriptive` | authenticateToken |
| POST | `/api/advanced-stats/analysis/correlation` | authenticateToken |
| POST | `/api/advanced-stats/analysis/regression` | authenticateToken |
| POST | `/api/advanced-stats/analysis/clustering` | authenticateToken |
| POST | `/api/advanced-stats/analysis/hypothesis-testing` | authenticateToken |
| POST | `/api/advanced-stats/analysis/anova` | authenticateToken |
| POST | `/api/advanced-stats/visualization/scatter-plot` | authenticateToken |
| POST | `/api/advanced-stats/export/csv` | authenticateToken |
| GET | `/api/data/results` | authenticateToken |
| GET | `/api/data/results/:id` | authenticateToken |
| POST | `/api/data/results` | authenticateToken |
| PUT | `/api/data/results/:id` | authenticateToken |
| DELETE | `/api/data/results/:id` | authenticateToken |
| GET | `/api/data/templates` | authenticateToken |
| POST | `/api/data/templates` | authenticateToken |
| GET | `/api/data/results/stats/overview` | authenticateToken |
| GET | `/api/databank/organizations` | authenticateToken |
| GET | `/api/databank/organizations/:id` | authenticateToken |
| POST | `/api/databank/organizations` | authenticateToken |
| PUT | `/api/databank/organizations/:id` | authenticateToken |
| DELETE | `/api/databank/organizations/:id` | authenticateToken |
| POST | `/api/databank/organizations/:id/offers` | authenticateToken |
| PUT | `/api/databank/offers/:offerId` | authenticateToken |
| DELETE | `/api/databank/offers/:offerId` | authenticateToken |
| POST | `/api/databank/data-requests` | authenticateToken |
| GET | `/api/databank/stats` | authenticateToken |
| GET | `/api/conversations` | authenticateToken |
| GET | `/api/conversations/:id/messages` | authenticateToken |
| POST | `/api/conversations/:id/messages` | authenticateToken |
| POST | `/api/conversations` | authenticateToken |
| GET | `/api/conversations/:id/participants` | authenticateToken |
| GET | `/api/data-results` | authenticateToken |

Inline domain notes (tables touched by SQL in `server/index.ts`):


- **Auth:** `users`. Register body: email, first_name, last_name, password, username. Login body: email or username, password. JWT payload `{userId, email, role}`, `expiresIn: 24h`. `/auth/me` returns the token user loaded by middleware (no extra profile join). Profile PUT: email, first_name, last_name. Change password: currentPassword, newPassword.
- **Labs:** `labs`, `lab_members`, and on create also `lab_workspaces`, `workspace_spaces`, `workspace_lists`. Showcase PUT: tagline, description, research areas, looking_for, is_showcased, lab_type, established_year. Member mutations require lab role `principal_researcher`, `admin`, or `co_supervisor`.
- **Protocols:** `protocols`, `protocol_steps`, `protocol_sharing`, `lab_members`.
- **Notebook:** `lab_notebook_entries`, `lab_notebook_comments`, `quick_notes`, `labs`, `lab_members`, `users`. Second `GET /api/lab-notebooks` redeclares the first.
- **Calendar:** `calendar_events` (queried; no CREATE in `database/migrations`).
- **Inventory:** `inventory_items`. `POST /api/inventory/:id/transactions` updates quantity in place. Comment in handler: there is no `inventory_transactions` table.
- **Instruments:** `instruments`, `instrument_bookings` and/or `bookings`. `POST/GET /api/instruments/:id/maintenance` uses `instrument_maintenance` (queried; no CREATE in migrations). `GET /api/instruments/:id/bookings` is declared twice.
- **Resource exchange:** `resource_exchange_requests`, `resource_exchange_offers` (queried; no CREATE in migrations). Share/book also touch shared instrument rows.
- **Presentations AI:** no dedicated slides table; generates from request body via presentation services.
- **Advanced stats:** proxies to `PYTHON_STATS_SERVICE_URL` (default `http://localhost:5003`). No SQL.
- **Evidence packs:** `research_data`, `data_templates` (`data_templates` queried; no CREATE in migrations). Alias `GET /api/data-results`.
- **Databank:** `databank_organizations`, `databank_data_offers`, `databank_data_requests`.
- **Messaging:** `conversations`, `conversation_participants`, `messages`.

### 6.3 Mounted router endpoints

Paths below are relative to the mount prefix. Full URL = prefix + path. `writingCollab.ts` paths are already under `/api/writing/documents/:id`.

#### `/api/scientist-passport` — `scientistPassport.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/research-profile` | 44 |
| PUT | `/research-profile` | 82 |
| GET | `/skills` | 165 |
| POST | `/skills` | 197 |
| PUT | `/skills/:skillId` | 229 |
| DELETE | `/skills/:skillId` | 258 |
| GET | `/software` | 285 |
| POST | `/software` | 304 |
| GET | `/techniques` | 340 |
| POST | `/techniques` | 359 |
| GET | `/certifications` | 395 |
| POST | `/certifications` | 414 |
| GET | `/availability` | 446 |
| PUT | `/availability` | 473 |
| GET | `/speaking-profile` | 542 |
| PUT | `/speaking-profile` | 564 |
| GET | `/speaking-engagements` | 606 |
| POST | `/speaking-engagements` | 625 |
| GET | `/endorsements/received` | 666 |
| POST | `/endorsements` | 690 |
| GET | `/platform-scores` | 741 |
| GET | `/search` | 770 |

#### `/api/settings` — `settings.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 15 |
| PUT | `/profile` | 70 |
| PUT | `/preferences` | 109 |
| PUT | `/privacy` | 167 |
| PUT | `/change-password` | 202 |
| GET | `/export-data` | 252 |
| DELETE | `/account` | 300 |

#### `/api/lab-workspace` — `labWorkspace.ts`

Auth: authenticateToken at mount AND on each handler.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 196 |
| POST | `/spaces` | 346 |
| PUT | `/spaces/:id` | 391 |
| DELETE | `/spaces/:id` | 428 |
| POST | `/folders` | 446 |
| PUT | `/folders/:id` | 477 |
| DELETE | `/folders/:id` | 512 |
| POST | `/lists` | 530 |
| PUT | `/lists/:id` | 562 |
| DELETE | `/lists/:id` | 597 |
| GET | `/tasks` | 659 |
| POST | `/tasks` | 805 |
| GET | `/tasks/board` | 937 |
| GET | `/tasks/calendar` | 1010 |
| PUT | `/tasks/reorder` | 1079 |
| GET | `/tasks/:id` | 1121 |
| PUT | `/tasks/:id` | 1152 |
| DELETE | `/tasks/:id` | 1218 |
| POST | `/tasks/:id/subtasks` | 1236 |
| GET | `/tasks/:id/subtasks` | 1269 |
| POST | `/tasks/:id/comments` | 1292 |
| GET | `/tasks/:id/comments` | 1328 |
| PUT | `/subtasks/:id` | 1351 |

#### `/api/dashboard` — `dashboard.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/pulse` | 14 |

#### `/api/protocol-execution` — `protocolExecution.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/` | 16 |
| GET | `/:protocolId` | 122 |
| GET | `/user/history` | 155 |
| GET | `/analytics/:protocolId` | 186 |

#### `/api/protocol-collaboration` — `protocolCollaboration.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/:protocolId/collaborators` | 16 |
| GET | `/:protocolId/collaborators` | 64 |
| POST | `/:protocolId/comments` | 96 |
| GET | `/:protocolId/comments` | 140 |
| POST | `/:protocolId/fork` | 201 |
| POST | `/:protocolId/versions` | 270 |
| GET | `/:protocolId/versions` | 318 |
| GET | `/:protocolId/forks` | 348 |

#### `/api/protocol-search` — `protocolSemanticSearch.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/semantic` | 16 |
| POST | `/intent` | 54 |
| GET | `/recommendations` | 84 |
| GET | `/:id/similar` | 150 |
| POST | `/:id/index` | 168 |

#### `/api/protocol-ai` — `protocolAI.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/generate` | 17 |
| POST | `/get-or-generate` | 181 |
| POST | `/:id/enhance` | 282 |
| GET | `/my-generated` | 317 |

#### `/api/protocol-comparison` — `protocolComparison.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/:id/similar` | 16 |
| POST | `/compare` | 44 |
| GET | `/:id/summary` | 74 |

#### `/api/experiment-tracker AND /api/experiments` — `experimentTracker.ts`

Auth: authenticateToken at mount (same router twice).

| Method | Path | Line |
|---|---|---|
| GET | `/` | 647 |
| GET | `/analytics` | 648 |
| GET | `/templates` | 649 |
| GET | `/:id` | 650 |
| POST | `/` | 651 |
| POST | `/templates` | 652 |
| POST | `/:experimentId/milestones` | 653 |
| POST | `/:experimentId/progress` | 654 |
| PUT | `/:id` | 655 |
| PUT | `/milestones/:milestoneId` | 656 |
| DELETE | `/:id` | 657 |

#### `/api/project-management` — `projectManagement.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/projects` | 35 |
| POST | `/projects` | 90 |
| GET | `/projects/:projectId` | 153 |
| PUT | `/projects/:projectId` | 197 |
| DELETE | `/projects/:projectId` | 256 |
| POST | `/work-packages` | 292 |
| PUT | `/work-packages/:packageId` | 337 |
| GET | `/team-hierarchy/:labId` | 367 |
| POST | `/team-hierarchy` | 394 |
| GET | `/progress-reports` | 440 |
| POST | `/progress-reports` | 486 |
| GET | `/progress-reports/:reportId/reviews` | 573 |
| POST | `/pi-reviews` | 597 |
| GET | `/notifications` | 693 |
| PUT | `/notifications/:notificationId/read` | 721 |
| GET | `/meetings` | 749 |
| POST | `/meetings` | 791 |

#### `/api/notebook-summaries` — `notebookSummaries.ts`

Auth: router.use(authenticateToken).

| Method | Path | Line |
|---|---|---|
| POST | `/generate` | 25 |
| GET | `/daily` | 71 |
| GET | `/weekly` | 93 |
| GET | `/project/:projectId` | 115 |

#### `/api/grants` — `grants.ts`

Auth: authenticateToken at mount; POST /ingest also requireRole admin.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 72 |
| GET | `/matches/me` | 163 |
| GET | `/preferences/me` | 197 |
| POST | `/preferences` | 224 |
| POST | `/` | 300 |
| GET | `/writeups` | 381 |
| GET | `/writeups/:writeupId` | 405 |
| POST | `/writeups` | 424 |
| PUT | `/writeups/:writeupId` | 465 |
| DELETE | `/writeups/:writeupId` | 510 |
| PUT | `/:id` | 532 |
| DELETE | `/:id` | 598 |
| POST | `/:id/fit-gap` | 624 |
| GET | `/:id` | 638 |
| POST | `/ingest` | 660 |

#### `/api/research-events` — `researchEvents.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 62 |
| POST | `/` | 133 |
| POST | `/:id/bookmark` | 220 |
| POST | `/:id/apply` | 247 |
| PUT | `/:id` | 274 |
| DELETE | `/:id` | 350 |

#### `/api/marketplace` — `marketplaceDirectory.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 86 |
| GET | `/suppliers` | 99 |
| GET | `/suppliers/me` | 138 |
| GET | `/suppliers/:id` | 163 |
| POST | `/suppliers/register` | 190 |
| PUT | `/suppliers/me` | 252 |
| DELETE | `/suppliers/me` | 305 |
| POST | `/suppliers/me/catalog` | 326 |
| PUT | `/suppliers/me/catalog/:itemId` | 369 |
| DELETE | `/suppliers/me/catalog/:itemId` | 415 |
| GET | `/service-providers` | 442 |
| GET | `/service-providers/me` | 525 |
| GET | `/service-providers/:id` | 550 |
| POST | `/service-providers/register` | 577 |
| PUT | `/service-providers/me` | 664 |
| DELETE | `/service-providers/me` | 721 |
| POST | `/service-providers/me/offerings` | 744 |
| PUT | `/service-providers/me/offerings/:offeringId` | 790 |
| DELETE | `/service-providers/me/offerings/:offeringId` | 839 |
| GET | `/tenders` | 866 |
| GET | `/tenders/mine` | 907 |
| GET | `/tenders/:id` | 929 |
| POST | `/tenders` | 950 |
| PUT | `/tenders/:id` | 1008 |
| DELETE | `/tenders/:id` | 1067 |

#### `/api/services` — `serviceMarketplace.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/test` | 13 |
| GET | `/categories` | 22 |
| GET | `/listings` | 55 |
| GET | `/listings/:id` | 128 |
| GET | `/my-listings` | 163 |
| POST | `/listings` | 184 |
| PUT | `/listings/:id` | 228 |
| GET | `/listings/:serviceId/portfolio` | 268 |
| POST | `/listings/:serviceId/portfolio` | 287 |
| GET | `/my-requests` | 330 |
| GET | `/incoming-requests` | 354 |
| POST | `/requests` | 381 |
| PUT | `/requests/:id` | 428 |
| POST | `/proposals` | 461 |
| GET | `/requests/:requestId/proposals` | 506 |
| POST | `/proposals/:id/accept` | 540 |
| GET | `/my-projects/provider` | 604 |
| GET | `/my-projects/client` | 635 |
| GET | `/projects/:id` | 666 |
| PUT | `/projects/:id` | 696 |
| GET | `/listings/:serviceId/reviews` | 729 |
| POST | `/reviews` | 753 |
| GET | `/providers/:providerId/stats` | 830 |

#### `/api/networking/posts` — `networkingPosts.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 40 |
| POST | `/` | 59 |
| PUT | `/:id` | 105 |
| DELETE | `/:id` | 155 |

#### `/api/networking/directory` — `networkingDirectory.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 122 |

#### `/api/networking/social` — `networkingSocial.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/relationships` | 151 |
| GET | `/requests` | 178 |
| GET | `/profile/:userId` | 213 |
| POST | `/follow/:userId` | 300 |
| DELETE | `/follow/:userId` | 343 |
| POST | `/connect/:userId` | 360 |
| POST | `/connect/:connectionId/respond` | 489 |
| DELETE | `/connect/:userId` | 540 |
| POST | `/labs/:labId/follow` | 562 |
| DELETE | `/labs/:labId/follow` | 593 |
| POST | `/labs/:labId/join-requests` | 607 |
| DELETE | `/labs/:labId/join-requests` | 687 |
| GET | `/labs/join-requests` | 706 |
| POST | `/labs/join-requests/:requestId/respond` | 748 |
| POST | `/labs/:labId/leave` | 836 |

#### `/api/help-forum` — `helpForum.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/requests` | 73 |
| GET | `/requests/:id` | 116 |
| POST | `/requests` | 156 |
| PUT | `/requests/:id` | 202 |
| DELETE | `/requests/:id` | 251 |
| POST | `/requests/:id/responses` | 271 |
| PUT | `/responses/:id` | 312 |
| DELETE | `/responses/:id` | 342 |
| POST | `/responses/:id/accept` | 361 |

#### `/api/notifications` — `notifications.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 12 |
| GET | `/unread-count` | 39 |
| PATCH | `/:id/read` | 52 |
| POST | `/mark-all-read` | 69 |

#### `/api/community-news` — `communityNews.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 117 |
| POST | `/` | 173 |
| DELETE | `/comments/:commentId` | 238 |
| POST | `/:id/like` | 262 |
| POST | `/:id/save` | 305 |
| GET | `/:id/comments` | 344 |
| POST | `/:id/comments` | 370 |
| PUT | `/:id` | 420 |
| DELETE | `/:id` | 495 |

#### `/api/negative-results` — `negativeResults.ts`

Auth: public GETs; mutations authenticateToken.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 71 |
| GET | `/:id` | 156 |
| GET | `/my/submissions` | 193 |
| POST | `/` | 227 |
| PUT | `/:id` | 295 |
| GET | `/:id/variations` | 333 |
| POST | `/:id/variations` | 352 |
| GET | `/:id/comments` | 405 |
| POST | `/:id/comments` | 428 |
| POST | `/:id/vote-helpful` | 458 |
| POST | `/:id/vote-saved-me` | 481 |
| GET | `/my/saved` | 520 |
| POST | `/:id/save` | 546 |
| DELETE | `/:id/save` | 570 |
| POST | `/:id/cite` | 592 |
| GET | `/:id/citations` | 622 |
| GET | `/:id/alternatives` | 649 |
| POST | `/:id/alternatives` | 672 |
| GET | `/contributors/:userId/stats` | 704 |
| GET | `/leaderboard` | 733 |
| GET | `/patterns` | 762 |

#### `/api/recommendations` — `recommendations.ts`

Auth: router.use(authenticateToken).

| Method | Path | Line |
|---|---|---|
| GET | `/protocols` | 27 |
| GET | `/papers` | 78 |
| GET | `/protocols/:protocolId/similar` | 126 |
| POST | `/feedback` | 157 |
| POST | `/track` | 202 |
| GET | `/explain/:itemType/:itemId` | 241 |
| GET | `/services` | 291 |
| GET | `/collaborators` | 378 |
| POST | `/collaborators/match` | 401 |
| GET | `/negative-results` | 476 |
| GET | `/databank` | 498 |

#### `/api/evidence-ai` — `evidenceAI.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/analyze` | 21 |
| GET | `/actions` | 72 |

#### `/api/writing` — `writing.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/invitations/:token` | 332 |
| POST | `/invitations/:token/accept` | 344 |
| GET | `/templates` | 359 |
| GET | `/templates/:id` | 392 |
| GET | `/documents` | 398 |
| GET | `/documents/:id` | 430 |
| POST | `/documents` | 472 |
| PUT | `/documents/:id` | 515 |
| DELETE | `/documents/:id` | 588 |
| POST | `/documents/:id/assist` | 616 |
| POST | `/documents/:id/analyze` | 674 |
| POST | `/analyze` | 713 |
| POST | `/assist` | 736 |
| GET | `/citations` | 772 |
| POST | `/citations` | 793 |
| POST | `/citations/import-bibtex` | 891 |
| POST | `/citations/:id/attach` | 945 |
| GET | `/lookup` | 989 |
| GET | `/search` | 1008 |
| POST | `/citations/from-doi` | 1028 |
| PATCH | `/citations/:id/source` | 1116 |
| POST | `/citations/:id/pdf` | 1142 |
| DELETE | `/citations/:id` | 1201 |
| POST | `/citations/format` | 1307 |
| POST | `/citations/suggest` | 1356 |
| POST | `/citations/verify` | 1384 |

#### `/api/writing/documents/:id` — `writingCollab.ts`

Auth: nested under writing; authenticateToken.

| Method | Path | Line |
|---|---|---|
| GET | `/collaborators` | 45 |
| PATCH | `/collaborators/:collabId` | 61 |
| DELETE | `/collaborators/:collabId` | 80 |
| POST | `/invitations` | 95 |
| GET | `/invitations` | 143 |
| DELETE | `/invitations/:inviteId` | 181 |
| POST | `/presence` | 204 |
| GET | `/collab-state` | 233 |
| POST | `/locks/:sectionId` | 258 |
| DELETE | `/locks/:sectionId` | 284 |
| GET | `/events` | 300 |

#### `/api/research` — `research.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/styles` | 57 |
| GET | `/search` | 62 |
| GET | `/papers/:id` | 85 |
| GET | `/papers/:id/related` | 97 |
| POST | `/papers/resolve` | 108 |
| GET | `/library` | 124 |
| POST | `/library` | 155 |
| PATCH | `/library/:paperId` | 190 |
| DELETE | `/library/:paperId` | 225 |
| GET | `/collections` | 239 |
| POST | `/collections` | 257 |
| PUT | `/collections/:id` | 274 |
| DELETE | `/collections/:id` | 288 |
| POST | `/collections/:id/items` | 304 |
| POST | `/import` | 328 |
| POST | `/export` | 375 |
| POST | `/bibliography` | 442 |
| POST | `/sidekick/verify` | 491 |
| POST | `/sidekick/retraction` | 512 |
| POST | `/sidekick/oa` | 525 |
| POST | `/sidekick/enrich` | 538 |
| POST | `/sidekick/audit` | 559 |
| POST | `/sidekick/export` | 608 |
| POST | `/cite/format` | 663 |
| POST | `/library/:paperId/pdf` | 682 |
| POST | `/papers/:id/index-oa` | 737 |
| POST | `/papers/ask` | 761 |
| POST | `/papers/compare` | 790 |
| POST | `/evidence/find` | 814 |
| POST | `/evidence/check` | 865 |

#### `/api/lab-floors` — `labFloorsRoleplay.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/access` | 175 |
| POST | `/roleplay` | 184 |
| POST | `/roleplay/debrief` | 254 |

#### `/api/ai-providers` — `aiProviderKeys.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/keys` | 48 |
| GET | `/providers` | 77 |
| POST | `/keys` | 101 |
| PUT | `/keys/:id` | 155 |
| DELETE | `/keys/:id` | 199 |
| GET | `/preferences` | 224 |
| PUT | `/preferences` | 256 |

#### `/api/ai-training` — `aiTraining.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/extract-training-data` | 119 |
| POST | `/train` | 147 |
| POST | `/chat` | 298 |
| GET | `/training-status` | 400 |
| DELETE | `/clear-training` | 445 |

#### `/api/api-task-assignments` — `apiTaskAssignments.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/tasks` | 30 |
| GET | `/assignments` | 40 |
| GET | `/api-keys` | 70 |
| POST | `/assignments` | 90 |
| PUT | `/assignments/:id` | 136 |
| DELETE | `/assignments/:id` | 176 |

#### `/api/agents` — `agents.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| POST | `/:agentType/execute` | 21 |
| GET | `/` | 120 |
| GET | `/:agentType` | 138 |

#### `/api/orchestrator` — `orchestrator.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/journeys` | 28 |
| POST | `/journey` | 39 |
| POST | `/paper-generation` | 85 |
| POST | `/presentation-generation` | 109 |
| POST | `/autonomous-literature-synthesis` | 133 |
| POST | `/autonomous-experiment-design` | 162 |
| POST | `/autonomous-data-analysis` | 191 |
| POST | `/execute` | 220 |
| POST | `/execute/:workflowType` | 274 |
| GET | `/templates` | 360 |
| GET | `/templates/:templateId` | 398 |
| POST | `/templates/:templateId/execute` | 426 |

#### `/api/ai-research-agent` — `aiResearchAgent.ts`

Auth: authenticateToken at mount.

| Method | Path | Line |
|---|---|---|
| GET | `/` | 33 |
| GET | `/access` | 62 |
| POST | `/chat` | 79 |

#### `/api/compliance` — `compliance.ts`

Auth: per-route; many requireRole admin.

| Method | Path | Line |
|---|---|---|
| POST | `/gdpr/requests` | 152 |
| GET | `/gdpr/requests` | 196 |
| GET | `/gdpr/requests/:id` | 237 |
| POST | `/gdpr/requests/:id/verify` | 276 |
| POST | `/gdpr/requests/:id/process` | 371 |
| POST | `/gdpr/requests/:id/reject` | 446 |
| POST | `/consent` | 476 |
| POST | `/consent/batch` | 539 |
| POST | `/consent/withdraw` | 605 |
| POST | `/consent/link-session` | 676 |
| GET | `/consent/:userId` | 691 |
| GET | `/consent/:userId/history` | 731 |
| GET | `/audit-logs` | 762 |
| GET | `/audit-logs/export` | 834 |
| GET | `/retention-policies` | 875 |
| POST | `/retention-policies` | 887 |
| PUT | `/retention-policies/:id` | 911 |
| DELETE | `/retention-policies/:id` | 951 |
| POST | `/retention-policies/:id/execute` | 962 |
| GET | `/policies` | 987 |
| GET | `/policies/:type` | 1026 |
| POST | `/policies` | 1057 |
| GET | `/dashboard` | 1082 |

#### `/api/support` — `support.ts`

Auth: none.

| Method | Path | Line |
|---|---|---|
| GET | `/config` | 124 |
| POST | `/checkout` | 140 |

### 6.4 Unmounted route files (not called by `server/index.ts`)

These handlers exist on disk and are not wired. Treat them as legacy unless a rebuild explicitly revives them.

- `server/routes/crossEntityIntegration.ts` (12): `GET /workflow/:notebookId`; `POST /relationships`; `POST /sync/notebook/:notebookId`; `GET /protocols`; `POST /protocols`; `GET /results`; `POST /results`; `GET /bookings`; `POST /bookings`; `GET /relationships/:entityType/:entityId`; `GET /sync-log`; `GET /analytics/workflow`
- `server/routes/externalDatabases.ts` (11): `POST /materials/search-formula`; `POST /materials/search-elements`; `POST /materials/search-bandgap`; `GET /materials/:materialId`; `POST /lens/search-papers`; `POST /lens/search-patents`; `POST /lens/track-citations`; `POST /lens/identify-trends`; `POST /search-all`; `POST /research-insights`; `POST /discover-materials`
- `server/routes/paperLibrary.ts` (9): `POST /fetch`; `POST /fetch-by-orcid`; `POST /search`; `POST /generate-summary`; `POST /extract-findings`; `GET /my-papers`; `POST /save-paper`; `DELETE /my-papers/:paperId`; `PUT /my-papers/:paperId`
- `server/routes/peercred.ts` (10): `GET /profile`; `POST /verify-relationship`; `POST /request-reference`; `POST /submit-reference`; `GET /requests`; `GET /portfolio`; `POST /portfolio`; `GET /relationships`; `GET /skills`; `GET /analytics`
- `server/routes/professionalProtocols.ts` (9): `POST /`; `GET /`; `GET /:id`; `PUT /:id`; `DELETE /:id`; `POST /:id/usage`; `POST /:id/reviews`; `GET /templates/list`; `GET /:id/analytics`
- `server/routes/simpleReferences.ts` (8): `GET /profile`; `GET /references`; `POST /add-reference`; `POST /request-reference`; `GET /pending-requests`; `POST /generate-reference-letter`; `GET /applications`; `GET /templates`
- `server/routes/unifiedCollaboration.ts` (17): `GET /profile/:userId`; `PUT /profile`; `GET /references`; `POST /references`; `POST /references/request`; `PUT /references/request/:requestId`; `POST /connections/request`; `PUT /connections/:connectionId`; `POST /follow`; `DELETE /follow/:followingId`; `GET /opportunities`; `POST /opportunities`; `POST /opportunities/:opportunityId/apply`; `GET /search`; `GET /recommendations`; `GET /notifications`; `PUT /notifications/:notificationId/read`

### 6.5 Domain purpose (what the live APIs are for)

| Domain | Purpose | Main tables |
|---|---|---|
| Auth / users | Register, login, JWT session, profile, password change, user search | `users` |
| Scientist passport | Skills, software, techniques, certifications, availability, speaking, endorsements, scores | `users` plus passport tables in `scientistPassport.ts` |
| Settings | Profile, notification prefs, privacy, password, JSON export, account delete | `users`, `user_preferences`, `ai_provider_keys` |
| Labs | Create lab, membership, showcase | `labs`, `lab_members` |
| Workspace | Spaces, folders, lists, tasks, subtasks, comments, board, calendar | `lab_workspaces`, `workspace_*`, `task_comments` |
| Projects / PI | Research projects, work packages, hierarchy, progress reports, PI reviews, meetings | `research_projects`, `project_work_packages`, `lab_team_hierarchy`, `member_progress_reports`, `pi_reviews`, `progress_notifications`, `team_meetings` |
| Notebook | Lab notebook CRUD, comments, share, suggestions, quick notes, AI summaries | `lab_notebook_entries`, `lab_notebook_comments`, `quick_notes` |
| Protocols | CRUD, share, categories, execution, collaboration, semantic search, AI generate, comparison | `protocols`, `protocol_steps`, `protocol_sharing`, `protocol_executions`, `protocol_embeddings` |
| Experiments | Tracker CRUD, templates, milestones, progress, analytics. Dual prefix | `experiments`, `experiment_templates`, `experiment_milestones`, `experiment_progress_logs`, plus `experiment_risks` / `experiment_comments` if those tables exist |
| Evidence | Result packs CRUD and AI analyze | `research_data`; AI route has no SQL |
| Research library | Search, library, collections, DOI/PDF, bibliography, sidekick, evidence find/check | `papers`, `user_library_items`, `reference_collections`, `reference_collection_items`, `scholarly_cache` |
| Writing | Documents, citations, assist, analyze, collab, SSE | `writing_documents`, `writing_citations`, `writing_document_citations`, collab tables |
| Grants | Discover, preferences, matches, writeups, fit-gap, admin ingest | `grants`, `user_grant_preferences`, `grant_matches`, `grant_writeups`, `grant_sources` |
| Networking | Directory, posts, follow/connect, lab follow/join | `networking_posts`, `user_follows`, `user_connections`, `lab_follows`, `lab_join_requests`, `labs` |
| Messaging | Conversations and messages | `conversations`, `conversation_participants`, `messages` |
| Data bank | Orgs, offers, requests | `databank_organizations`, `databank_data_offers`, `databank_data_requests` |
| Marketplace directory | Suppliers, providers, tenders | `marketplace_*` |
| Service marketplace | Listings, requests, proposals, projects, reviews | `service_*` |
| Negative results | Browse public; submit, vote, comment, save when authenticated | `negative_results` and related |
| Events | Research events, bookmark, apply | `research_events`, bookmarks, applications |
| Forum | Help requests and responses | `help_requests`, `help_responses` |
| Trends | Community posts, likes, saves, comments | `community_posts` and engagement tables |
| Recommendations | Protocols, papers, services, collaborators, negative results, databank | mixed; some in-memory scoring |
| Notifications | List, unread count, mark read | `notifications` via notification service |
| Dashboard | Research pulse aggregate | calendar, experiments, notebooks, notes, tasks |
| AI | Providers, keys, task assignment, training, agents, orchestrator, research chat | `ai_provider_keys`, `ai_provider_configs`, `ai_platform_usage`, `ai_training_data`, `user_ai_content` |
| Lab Floors | Quota check, roleplay turn, debrief | no tables; platform AI quota only |
| Compliance | GDPR, consent, audit, retention, policies | `gdpr_requests`, `consents`, `audit_logs`, `retention_policies`, `legal_policies` |
| Support | Donation config and checkout | none |
| Stats proxy | CSV/Excel load and analyses | none (Python service) |

## 7. Feature-by-Feature Behaviour

### Dashboard — `/dashboard` — `pages/DashboardPage.tsx`

Actions: read a research pulse; create, edit, and delete quick notes; open reminders that link into the lab workspace and other features; scan a community strip (events, help forum, current trends); follow calls to action into the notebook and negative results.

API: `GET /api/dashboard/pulse`, `/api/quick-notes`, `GET /api/research-events`, `GET /api/help-forum/requests`, community news.

States: hub filter `all | reminders | notes`. Reminder counts include overdue items.

Polls every 25 seconds when the tab is visible, and listens for `researchlab:dashboard-sync` (`utils/dashboardSync.ts`).

Incomplete: this is a launcher and pulse, not a full activity feed.

Duplication: quick notes also exist on the notebook page.

### Personal notebook — `/lab-notebook` — `pages/LabNotebookPage.tsx`

Actions: create, edit, delete, filter, and sort entries; import a file or pasted text (`DocumentImportModal`, mammoth/xlsx on the client); request AI daily, weekly, or project summaries; manage quick notes; read activity and suggestion endpoints.

Forms: title, body, type-specific method/result/conclusion blocks, tags, status, priority, optional experiment link.

Statuses: `planning | in_progress | completed | on_hold | failed`. Priorities: `low | medium | high | critical`. Types: `experiment | idea | results | problem` (API also lists observation, meeting, protocol, analysis).

API: `/api/lab-notebooks`, comments, share, activity, suggestions, entry-types, statistics; `/api/notebook-summaries/generate|daily|weekly|project/:projectId`; `/api/quick-notes`.

Relations: experiment tracker handoff, dashboard notes, writing sources.

Incomplete: the page still contains debug `fetch` calls to `127.0.0.1:7243/ingest/...`. Those are local instrumentation, not product behaviour.

### Protocol library — `/protocols` and `/protocols/:protocolId` — `pages/ProtocolsPageRefactored.tsx`

Actions: list, create, edit, delete; semantic search; compare protocols; start an execution that opens the experiment tracker with `?protocolId` and `title`; share by SOP id.

Related UI: `ProtocolForm`, `ProtocolDetailView`, `ProtocolExecutionMode`, `ProtocolComparisonView`, `ProtocolAIAssistant`, `ProtocolCollaborationPanel`, `ProtocolImportModal`.

API: inline `/api/protocols` plus `/api/protocol-search`, `/api/protocol-ai`, `/api/protocol-execution`, `/api/protocol-collaboration`, `/api/protocol-comparison`.

Relations: workspace tasks store `protocol_id`. Negative results can point at a protocol. `/professional-protocols` redirects here.

### Research evidence — `/data-results` — `pages/DataResultsPage.tsx`

Actions: create and edit evidence packs; switch grid and list; move status along a curation pipeline; import Word or pasted text; see client-side readiness, mix, and recommendation panels (`utils/researchStats.ts`).

Statuses: `draft → under_review → published → archived`.

API: `/api/data/results` (alias `GET /api/data-results`), templates, stats overview, `POST /api/evidence-ai/analyze`.

Relations: numeric columns feed in-browser stats. Writing Studio cites literature, not these packs, unless the user copies text across.

The sidebar label is “Research evidence”. The old `/evidence-references` URL now opens the scholarly library inside Writing Studio.

### Writing Studio

See section 8. Sidebar entry. Legacy AI, journey, presentation, and evidence-library URLs redirect here.

### Lab workspace

See section 9.

### Experiment tracker — `/experiment-tracker` — `pages/ExperimentTrackerPage.tsx`

Hidden from the sidebar. Opened from protocols and deep links.

Views: `dashboard | experiments | templates | analytics`.

Statuses: `planning | ready | running | paused | completed | failed | cancelled`. Categories include molecular biology through “other”. Nested milestones and progress logs. Risks and comments are coded against tables that migrations do not create.

API: `/api/experiment-tracker/*` and the same handlers at `/api/experiments/*`. Client wrapper: `services/experimentService.ts`.

Query `protocolId` and `title` prefill a new experiment, then the page clears them.

This is a different object from a workspace task.

### Lab Floors

See section 10.

### Grants and funding — `/grants-fundings` — `pages/GrantsFundingsPage.tsx`

Tabs: `discover | matches | write | preferences`.

Actions: browse grants, save preference filters, read personalized matches, run fit-gap, write a proposal by navigating to `/writing-studio/new/grant`. Query `grantId` is retained by studio navigation helpers. The studio does not load that grant into the draft by itself. Fit-gap stays on this page.

API: `/api/grants`, `/matches/me`, `/preferences`, writeups, `/:id/fit-gap`. Ingest is admin-only and also runnable as `pnpm grants:ingest-horizon` (`server/services/grants/horizonEuropeService.ts`, SEDIA).

### Networking — `/collaboration-networking` — `pages/CollaborationNetworkingPage.tsx` rendering `components/LinkedInStyleNetworking.tsx`

Actions: browse labs and people, follow, connect, request to join a lab, leave, see a match score from research interests.

API: `/api/networking/directory`, `/api/networking/social/*`.

A showcased lab can be opened at `/labs/:labId` (`LabPublicPage`). Showcase fields are edited from the lab workspace.

Older collaboration routers (`unifiedCollaboration.ts`, `peercred.ts`, `simpleReferences.ts`) are not mounted.

### Research data bank — `/research-databank` and `/research-databank/:orgId`

Actions: register an organization, browse and filter organizations, open an organization to see dataset offers and requests.

API: `/api/databank/organizations`, offers, data-requests, stats.

Product copy: cross-organization ethical dataset exchange, not a personal file drive. `/data-sharing` redirects here.

### Marketplace — `/marketplace`, `/marketplace/supplier`, `/marketplace/provider`

Tabs: `suppliers | services | tenders`. Query `tab` and `view`.

Actions: register yourself as a supplier or provider, browse the directory, post or read tenders. Contact is by email. The UI does not complete a purchase.

API: `/api/marketplace/suppliers|service-providers|tenders`.

`/supplier-marketplace` and `/service-marketplace` redirect to tabs. `SupplierMarketplacePage.tsx` and `ServiceMarketplacePage.tsx` are unrouted.

`/api/services/*` is a second, older marketplace (listings, requests, proposals, projects, reviews) still mounted and not what the sidebar opens.

### Negative results — `/negative-results` — `pages/NegativeResultsPage.tsx`

Hidden from the sidebar. Linked from the dashboard and the profile transparency tab.

Views: `browse | my-submissions | saved | leaderboard`.

Actions: submit a failure, vote helpful or “saved me”, comment, attach citations, link a protocol.

API: `/api/negative-results`. Public browse does not require auth; mutations do.

### Events — `/events-opportunities` — `pages/EventsOpportunitiesPage.tsx` and `components/EventsAndOpportunities.tsx`

CRUD for conferences, workshops, and similar opportunities. Search and filter. API `/api/research-events` (bookmark and apply exist on the server). Distinct from personal `calendar_events`.

### Help forum — `/help-forum` — `pages/HelpForumPage.tsx`

Ask, edit, delete, reply. Categories: General, Protocol, Equipment, Data Analysis, Safety, Collaboration, Other. Filter statuses: Open, In Progress, Resolved, Closed. Form defaults urgency to Medium and visibility to public.

API: `/api/help-forum/requests` and responses. Owner checks use `canManageResource`.

### Current trends — `/current-trends` — `pages/CurrentTrendsPage.tsx`

Community posts. Types: `news | update | idea | blog | opinion | opportunity`. Like, save, comment. API `/api/community-news`. Deep link reads `?post`.

### Conference news — `/conference-news` — `pages/ConferenceNewsPage.tsx`

The page sets conferences and interests to empty arrays in an effect. No API. Save, notes, and the Google Calendar link builder have nothing to attach to. Treat as an unfinished screen.

### Data analysis — `/data-analysis` and `/data-analytics` — `pages/DataAnalyticsPage.tsx`

Hidden. Paste CSV-like numbers. In-page descriptive stats, correlation, t-test, and regression. No `/api` call. See section 13 for how this differs from evidence-pack stats and the Python service.

### PI review — `/pi-review-dashboard` — `pages/PIReviewDashboardPage.tsx`

Views: submit, my reports, review, notifications. Submit posts to `/api/project-management/progress-reports`. Review posts to `/api/project-management/pi-reviews`. The functions that would load “my reports” and “reports to review” are commented out, so those lists stay empty.

### Project management — `/project-management` — `pages/ProjectManagementPage.tsx`

Tabs: projects, team, progress. Projects API is shared with the lab workspace. Team hierarchy requests use a hardcoded lab id `650e8400-e29b-41d4-a716-446655440000`. Empty states print raw endpoint hints. Create flows are thinner than the workspace project form.

### Profile — `/profile` and `/profile/:userId` — `pages/ProfilePage.tsx`

Tabs: about, openness, transparency. Loads `/api/scientist-passport/research-profile` and availability, networking follow/connect state, and negative-result contributor stats. `/my-portfolio` and `/scientist-passport` redirect here. Passport sub-resources (skills, software, speaking, endorsements) exist on the API; the profile page does not surface every one of them.

### Settings — `/settings` — `pages/SettingsPage.tsx`

Tabs: profile, notifications, privacy, security, API management, data.

API management talks to `/api/ai-providers/keys`, `/providers`, preferences, and `/api/api-task-assignments`. Privacy tab posts consent. Data tab calls `GET /api/settings/export-data` and `DELETE /api/settings/account`. A comment in the page says real AI usage statistics are not implemented; quota lives in `ai_platform_usage` and is exposed via Lab Floors `GET /access` and the research-agent access route, not as a settings chart.

### Notifications — `/notifications` — `pages/NotificationsPage.tsx`

List all or unread, mark one read, mark all read. API `/api/notifications`. The header bell is the same API with a shorter list.

### Ask AI

Floating copilot. One chat box. `POST /api/ai-research-agent/chat`. Optional `stream: true` makes the response SSE. The copilot is hidden inside the immersive studio editor. Writing assistance inside a manuscript uses `/api/writing/.../assist`, not this button.

---

## 8. Writing Studio Deep Audit

Entry page: `pages/WritingStudioPage.tsx`.  
Shell: `components/writing-studio/StudioShell.tsx`, `StudioSidebar.tsx`, `ManuscriptPreview.tsx`.  
Editor: `components/CiteSectionEditor.tsx`, `components/PlateEditor.tsx`.  
Collaboration UI: `components/WriteTogetherPanel.tsx`.  
Overlay flows: `components/WritingStudioOverlay.tsx` (generate / present / library redirects land here).  
Route helper: `utils/writingStudioRoutes.ts`.  
Templates and structure: `utils/writingTemplates.ts`, `utils/writingStructure.ts`, `utils/grantWritingTemplates.ts`.  
Analysis and export: `utils/writingDraftAnalysis.ts`, `utils/writingExport.ts`, `utils/citationFormat.ts`, `utils/citationAudit.ts`.  
Server: `server/routes/writing.ts`, `server/routes/writingCollab.ts`, `server/services/writing/`.  
Scholarly: `server/services/scholarly/`, `server/services/doiIntegration.ts`.

### Manuscript model

Row in `writing_documents`. `content` JSON is the draft:

- `templateId`, `docType`, `title`, `subtitle`, `researchQuestion`, `targetVenue`, `keywords[]`
- `citationStyle`
- `sections[{ sectionId, content }]`
- grant metadata when the type is a grant
- journal preset hints, numbering, text alignment
- `customSections`

`metadata` JSON holds extra document flags. `content_revision` increments when collaborators save. `status` defaults to `draft`.

### Document types

`research_paper | review_paper | research_proposal | grant | other`.

### Templates (`utils/writingTemplates.ts` and `utils/grantWritingTemplates.ts`)

| Id | Kind |
|---|---|
| `paper_imrad_journal` | Full IMRaD paper (default) |
| `paper_short_comms` | Short communication |
| `review_narrative` | Narrative review |
| `review_systematic` | Systematic review |
| `proposal_institutional` | Institutional proposal |
| `proposal_fellowship` | Fellowship (includes a training-plan section) |
| `horizon_europe`, `erc`, `nih`, `nsf`, `generic` | Grant templates |
| `other_conference_abstract` | Abstract |
| `other_cover_letter` | Cover letter |
| `other_progress_report` | Progress report |
| `other_methods_note` | Methods note |

Citation styles offered: APA, MLA, Chicago, IEEE, Nature, Science, Vancouver.

`GET /api/writing/templates` and `GET /api/writing/templates/:id` serve the same catalogue from the server.

### Section model

Each template section has id, title, group, guidance, required flag, and optional parent, level, and numbering. `writingStructure.ts` builds a tree and can add or remove subsections. The references section is filled from citation tokens of the form `{{cite:...}}` in section text.

### Saved and unsaved drafts

`/writing-studio/compose/:templateId/...` keeps the draft in React state until the first save, which `POST`s `/api/writing/documents` and moves the URL to `/writing-studio/m/:docId`. A dirty flag drives the save control. Later edits `PUT /api/writing/documents/:id`. List and delete: `GET /api/writing/documents`, `DELETE /api/writing/documents/:id`.

There is no separate drafts table.

### Collaboration

Roles: `owner | editor | viewer`. Scope: `entire` or `sections`, with `section_ids` JSON.

Tables: `writing_collaborators`, `writing_invitations`, `writing_section_locks`, `writing_presence`.

Invite: `POST /api/writing/documents/:id/invitations` creates a token. The link is `/writing-studio?invite=<token>`. Accept: `POST /api/writing/invitations/:token/accept`. `queueInviteEmail` logs the invitation. SMTP is not wired, so no email is sent.

Live behaviour in `WriteTogetherPanel.tsx`: poll `GET .../collab-state` every 10 seconds; presence heartbeat `POST .../presence` every 15 seconds. Lock TTL is 90 seconds and presence TTL is 45 seconds in `WritingCollabService`.

`GET /api/writing/documents/:id/events` is a real SSE stream (ping every 25 seconds) in `writingCollab.ts`. The frontend has no `EventSource` client. The UI uses polling. API rate limiting skips collab-state, presence, and lock paths so the poll is not counted against the normal limit.

### Citations

Per-user `writing_citations`, joined to documents by `writing_document_citations`.

- Create and list: `POST/GET /api/writing/citations`
- DOI: `POST /api/writing/citations/from-doi` (Crossref / scholarly resolvers)
- BibTeX: `POST /api/writing/citations/import-bibtex`
- Lookup and search: `GET /api/writing/lookup`, `GET /api/writing/search`
- Attach an existing library paper: `POST /api/writing/citations/:id/attach` and `GET /api/research/library`
- Format: `POST /api/writing/citations/format` and `POST /api/research/cite/format` / `POST /api/research/bibliography`
- Suggest and verify: `POST /api/writing/citations/suggest`, `POST /api/writing/citations/verify`
- Source text: `PATCH /api/writing/citations/:id/source`
- PDF: `POST /api/writing/citations/:id/pdf` (multer, 20 MB, PDF or plain text)

Bibliography rendering uses CSL-style formatting in `utils/citationFormat.ts` and server scholarly helpers, including Scholar Sidekick when configured (`server/services/scholarly`, sidekick routes under `/api/research/sidekick/*`). Styles match the document’s `citation_style`.

### Shared scholarly library

`/api/research/*` is the shared library (search, save paper, collections, PDF, ask, compare, evidence find/check). Writing Studio’s library flow (`RedirectToWritingStudio` `flow=library`, formerly `/evidence-references`) reads this library and can attach items into `writing_citations`. The two stores stay separate: a paper row is not automatically a citation row.

### AI writing assistance

`POST /api/writing/documents/:id/assist` and `POST /api/writing/assist`. `WritingAssistService` calls `AgentFactory` agents: `paper_writing`, `literature_review`, `proposal_writing`, `abstract_writing`, `reference_management`, behind a safety gate (`server/services/safety`).

Modes: `section | full | citations | continue`. Assist is supposed to stay grounded in supplied sources.

### Readiness analysis

Client: `analyzeWritingDraft` in `utils/writingDraftAnalysis.ts`. Server: `POST /api/writing/analyze` and `POST /api/writing/documents/:id/analyze`. Bands: `not_ready | needs_work | nearly_ready | submission_ready`.

### Export

`utils/writingExport.ts` with jsPDF: PDF, Word (`.doc` HTML), Markdown. This is client-side. There is no server DOCX/PDF renderer for manuscripts.

### Grant handoff

Grants page “Write proposal” goes to `/writing-studio/new/grant`. Grant section outlines live in `utils/grantWritingTemplates.ts` (`horizon_europe`, `erc`, `nih`, `nsf`, `generic`). `grant_writeups` on the grants API is a separate stored writeup, not the same row as `writing_documents`. `?grantId` is preserved in navigation and is not applied as draft hydration.

### Presentations

`/presentations` redirects to `/writing-studio?notice=slides`. The notice explains that slides are an export, not a deck editor. Generation: `POST /api/presentations/ai/generate` (also outline, slide-content, improve, themes, health) in `server/index.ts`, using `server/aiPresentationService.js` and `server/services/presentations/`. Output is a preview modal, not a stored PPTX project. `pages/AIPresentationsPage.tsx` is unrouted. `presentation-ai-reference/` is a nested reference repository and is not part of the running app.

---

## 9. Lab Workspace Deep Audit

Page: `pages/LabWorkspacePage.tsx`.  
API for hierarchy: `server/routes/labWorkspace.ts` mounted at `/api/lab-workspace`.  
Inventory, instruments, labs, and messages are inline in `server/index.ts`.  
Projects inside the workspace call `/api/project-management/projects`.  
Schema: `database/migrations/mysql_lab_workspace.sql`, showcase columns in `mysql_lab_showcase.sql`.

### Active lab

localStorage key `lab-workspace-active-lab`. The header switcher lists labs from the user’s `lab_members` rows (`GET /api/labs` / workspace `GET /` with `lab_id`). If none is stored, the server’s `getUserLab` picks the first active membership, preferring `principal_researcher`, then `admin`, then earliest `joined_at`.

Creating a lab (`POST /api/labs`, `LabCreateModal` / `LabCreationWizard`) also creates `lab_workspaces`, a default space, and a default list, and inserts the creator as `principal_researcher`.

### Sections

Query `section`:

| Value | UI |
|---|---|
| `tasks` (default) | Task hierarchy |
| `projects` | `ProjectsView` / `LabWorkspaceProjectForm` |
| `resources` | Inventory and instruments |
| `teams` | Members |
| `messages` | Embedded `TeamMessagingPage` |

Legacy query values are remapped in `LabWorkspacePage.tsx`: `experiments` → tasks; `inventory` and `instruments` → resources; `messaging` → messages; `section=teams&tab=messages` → messages.

### Hierarchy

`lab` 1—1 `lab_workspaces` → `workspace_spaces` → optional `workspace_folders` → `workspace_lists` → `workspace_tasks` → `workspace_subtasks`.

Spaces, folders, and lists have name, description, color, icon (spaces), position, `is_archived`, `created_by`.

### Tasks

Fields: title, description, status (`to_do | in_progress | in_review | done | cancelled`), priority (`low | normal | high | urgent`), `due_date`, `start_date`, `assignee_id`, `tags` (text/JSON), `custom_fields`, progress percent, time estimated and tracked, archive flag. Optional links: `project_id`, `protocol_id`, `inventory_item_id`, `instrument_id`. These links are not foreign keys.

Views:

- List
- Board: `GET /api/lab-workspace/tasks/board`
- Calendar: `GET /api/lab-workspace/tasks/calendar`
- Reorder: `PUT /api/lab-workspace/tasks/reorder`

Components: `TaskListView`, `TaskBoardView`, `TaskCalendarView`, `TaskDetailPanel`, `TaskForm`, `TaskCard`, `AssigneeAvatars`, `DueDateIndicator`, `PriorityBadge`, `StatusBadge`.

### Subtasks, comments, tags, assignees

Subtasks: title, description, `is_completed`, assignee, position. `POST/GET /tasks/:id/subtasks`, `PUT /subtasks/:id`.

Comments: `task_comments.content`, optional `parent_comment_id`, edited flag. `POST/GET /tasks/:id/comments`.

Tags are a text column, not a `tags` table. Assignees are user ids. Due dates are datetimes on the task. The calendar view reads those dates. It is not `calendar_events`.

### Projects

Workspace project UI uses `/api/project-management/projects` (`research_projects`), shared with the hidden Project Management page. Text import uses `utils/projectImport.ts` (`smartParseProjectText`). Work packages, team hierarchy, and PI reviews are on that API and are not first-class workspace tabs.

### Inventory and stock

`/api/inventory` CRUD, `GET /api/inventory/categories`, forms `LabWorkspaceInventoryForm` / `InventoryForm` / `InventoryView`.

`POST /api/inventory/:id/transactions` adjusts quantity on `inventory_items`. The handler comment states there is no `inventory_transactions` table, so history is not stored.

### Equipment, bookings, maintenance

Instruments: `/api/instruments` CRUD, categories, share, shared list, availability. Forms: `LabWorkspaceInstrumentForm`, `InstrumentRosterForm`, booking calendar components.

Bookings: `POST /api/instruments/:id/bookings` and `POST /api/instruments/:id/book`, `PUT /api/bookings/:id/status`, `GET /api/bookings/my`. Two booking tables exist (`bookings` and `instrument_bookings`). Which insert path runs depends on the handler; both are live in `server/index.ts`.

Maintenance: `POST/GET /api/instruments/:id/maintenance` inserts into `instrument_maintenance` with type, title, description, scheduled date, priority, assignee, duration, cost, parts, notes, checklist JSON, status `scheduled`. High or critical priority sets the instrument status to `maintenance`. The table is not in migrations.

Alerts views exist: `InventoryAlertsView`, `InstrumentAlertsView`.

### Team, invitations, roles

Member list and role changes: `/api/labs/:id/members` and `/api/lab-members`. Form: `LabWorkspaceTeamMemberForm`.

There is no workspace-local invitation table. Joining a lab from outside is `lab_join_requests` via networking social routes.

Lab roles that may manage members: `principal_researcher`, `admin`, `co_supervisor`.

### Lab showcase

`PUT /api/labs/:id/showcase` and `LabShowcaseModal`. Fields on `labs`: `is_showcased`, `showcased_at`, `showcase_tagline`, `description`, `research_areas`, `looking_for`, `lab_type`, `established_year`. Showcased labs appear in networking and at `/labs/:labId`.

### Messaging

Messages section embeds `pages/TeamMessagingPage.tsx`, with `DirectMessagingView` and `TeamMessagingWidget`. REST only:

- `GET/POST /api/conversations`
- `GET/POST /api/conversations/:id/messages`
- `GET /api/conversations/:id/participants`

Tables: `conversations`, `conversation_participants`, `messages`. No WebSocket and no poll interval was found in those components, so the thread updates when the user acts or the view reloads.

`/team-messaging` redirects into this section.

### PI review

The workspace does not embed the PI review dashboard. A task may store `project_id`. Progress reports and PI reviews remain on `/pi-review-dashboard` and `/api/project-management/*`, and that page’s list fetches are commented out.

---

## 10. Lab Floors Deep Audit

Page: `pages/LabFloorsPage.tsx`.  
UI: `components/lab-floors/FloorsHub.tsx`, `ScenarioPlayer.tsx`, `DebriefCard.tsx`, `RoleplayStudio.tsx`.  
Styles: `styles/labFloors.css`.  
Choice content: `content/lab-floors/*.ts`, registered in `utils/labFloors/registry.ts`.  
Types: `utils/labFloors/types.ts`, `utils/labFloors/roleplayTypes.ts`.  
Progress: `utils/labFloors/progress.ts`, `utils/labFloors/roleplayProgress.ts`.  
API: `server/routes/labFloorsRoleplay.ts` at `/api/lab-floors`. Only the roleplay module calls it. Choice floors do not.

### Hub

The hub lists five choice floors and the PhD Starter Year module. A role lens picker is always visible. Completed floors and a completed roleplay show a stamp. Idea Studio’s debrief can send the user to Writing Studio.

### Role lenses

`RoleId`: `phd | ra | intern`, labels “PhD student”, “Research assistant”, “Visiting intern”. Stored on the progress object and sent into scenes as `roleFlavor` text. Changing lens does not change the scene graph, only optional flavor copy and the role recorded on completion.

### Choice floors

| Id | File | Intent |
|---|---|---|
| `day-one` | `content/lab-floors/dayOne.ts` | First day in the lab |
| `idea-studio` | `ideaStudio.ts` | Turn an interest into a question |
| `bench-plan` | `benchPlan.ts` | Plan bench work |
| `colleagues` | `colleagues.ts` | Working with other people |
| `skill-sprint` | `skillSprint.ts` | Short skill practice |

No AI. Content is compiled into the client.

### Scenario data format

`FloorScenario`: `id`, `title`, `subtitle`, `durationMinutes`, `skills[]`, `startSceneId`, `scenes[]`, `debrief`.

`Scene`: `id`, optional `title`, `narration`, optional `roleFlavor` per role, `choices[]`.

`Choice`: `id`, `text`, `nextSceneId` or `null` (null ends the floor and opens the debrief), optional `consequence`, optional `skillDeltas` mapping a skill id to `good | ok | miss`.

Branching is a scene id pointer. There is no expression language and no inventory of items. `getScene` in `registry.ts` looks up the next id.

### Skill scoring and debrief

Each floor lists the skill ids it teaches and a `debrief.skillLabels` map plus `summary` and `tips[]`. As the player chooses, deltas accumulate. `mergeSkillVerdicts` keeps the better verdict if the floor is completed again (`miss` < `ok` < `good`). `DebriefCard` shows the summary, tips, and per-skill verdicts.

### Stamps and completion

`saveFloorCompletion` writes `completedAt` (ISO time), `role`, `path` (`{sceneId, choiceId}[]`), and merged `skillResults`. The hub stamp is “this floor id exists in `completions`”.

### localStorage — choice floors

Key: `drm_lab_floors_progress_v1`.

```json
{
  "role": "phd",
  "completions": {
    "day-one": {
      "completedAt": "ISO-8601",
      "role": "phd",
      "path": [{ "sceneId": "...", "choiceId": "..." }],
      "skillResults": { "skill_id": "good" }
    }
  }
}
```

Default role is `phd`. Parse errors reset to that default.

### PhD Starter Year

Module id: `phd-starter-year`. Content: `content/lab-floors/phdStarterYear.ts`. UI: `RoleplayStudio.tsx`. Duration copy: about 45 minutes. The user plays the new PhD student. Other people are AI.

Characters:

| Id | Name | Role |
|---|---|---|
| `elena` | Dr. Elena Vargas | PI |
| `sam` | Sam Okonkwo | 4th-year PhD |
| `priya` | Dr. Priya Mehta | Postdoc |
| `jordan` | Jordan Lee | Lab manager |
| `alex` | Alex Chen | Fellow first-year |

Each character has `title`, `blurb`, and a `voice` prompt sent to the model as the system persona.

Beats (chapters), in order:

| Id | Chapter | Title | Primary character | minTurns | Skills |
|---|---|---|---|---|---|
| `week1-arrival` | Week 1 | Arrive and find your footing | jordan | 3 | ask_early, lab_os, professionalism |
| `week1-pi` | Week 1 | First real conversation with your PI | elena | 4 | ask_early, professionalism, ownership |
| `week2-lab-os` | Week 2 | Learn the lab’s operating system | sam | 3 | lab_os, ask_early, documentation |
| `month1-literature` | Month 1 | Read like a starter, not a tourist | priya | 3 | design_thinking, ownership, ask_early |
| `month2-scope` | Month 2 | Scope a year-one starter question | elena | 4 | design_thinking, ownership, professionalism |
| `month2-notebook` | Month 2 | Document so future-you survives | jordan | 3 | documentation, lab_os, professionalism |
| `month3-first-plan` | Month 3 | Plan the first real experiment | sam | 4 | design_thinking, ask_early, documentation |
| `month4-help` | Month 4 | Ask for help without disappearing | sam | 3 | ask_early, professionalism, ownership |
| `month5-credit` | Month 5 | Credit, conflict, and being a colleague | alex | 3 | share_credit, professionalism, ask_early |
| `month6-plan` | Month 6 checkpoint | Lock a living year-one plan | elena | 4 | ownership, design_thinking, professionalism |

Each beat also has `setting`, `objective`, `coachingHint`, `availableCharacterIds`, `openingNarration`, `openingLine` (`characterId` + `text`), and `advanceHint`. Full prompt text is in `content/lab-floors/phdStarterYear.ts`.

API:

- `GET /api/lab-floors/access` — whether platform AI quota remains.
- `POST /api/lab-floors/roleplay` — body `message`, `characterId`, `moduleContext`, `history`, `moduleId`, `beatId`. Returns JSON `{ reply, stageDirection, suggestAdvance, coachWhisper }`. Uses the platform AI path (Gemini first, then OpenAI) via the provider stack. Task type is content writing / summarization.
- `POST /api/lab-floors/roleplay/debrief` — body `moduleTitle`, `beatSummaries`, `skills`. Produces the closing coach note.

Transcript: in-memory `RoleplayChatMessage[]` with roles `user | character | narrator` and an optional `coachWhisper`. It is not written to MySQL. Refreshing the page keeps beat progress (localStorage) and loses the chat transcript unless it was only held in component state.

Completion: `completeBeatAndAdvance` stamps `beatProgress[beatId].completedAt` and moves `currentBeatId` to the next beat. The last beat sets `run.completedAt`. `isRoleplayComplete` is true when `completedAt` is set or every beat has `completedAt`. The hub stamp uses that helper. Advance is also nudged when the model returns `suggestAdvance` and `minTurns` is met.

Coach notes: per-beat `coachingHint` is client copy. `coachWhisper` comes back on each turn. The debrief endpoint produces the end-of-module note.

### localStorage — roleplay

Key: `drm_lab_floors_roleplay_v1`. Value is a map of module id to run:

```json
{
  "phd-starter-year": {
    "moduleId": "phd-starter-year",
    "currentBeatId": "week2-lab-os",
    "beatProgress": {
      "week1-arrival": { "beatId": "week1-arrival", "turnCount": 4, "completedAt": "ISO-8601" }
    },
    "updatedAt": "ISO-8601",
    "completedAt": null
  }
}
```

`startRoleplayRun` creates the first beat with `turnCount: 0`. `markBeatTurn` increments `turnCount`.

---

## 11. AI Architecture

### Providers

Interface: `server/services/AIProvider.ts` (`chat`, embeddings, image where implemented, `validateApiKey`).

Factory: `server/services/AIProviderFactory.ts`.

| Id | Class | Registry “best for” |
|---|---|---|
| `openai` | `providers/OpenAIProvider.ts` | content writing, abstracts, code |
| `google_gemini` / `gemini` | `providers/GoogleGeminiProvider.ts` | paper finding, data analysis, ideas |
| `anthropic_claude` / `claude` | `providers/AnthropicClaudeProvider.ts` | proposals, analysis, paper generation |
| `perplexity` | `providers/PerplexityProvider.ts` | paper finding, research, summarization |

`getBestProviderForTask` scores available providers by quality and cost using `ProviderCapabilityRegistry`. If nothing matches, it uses the first available provider or the registry default.

Model names come from provider defaults and `GEMINI_CHAT_MODEL` (example value `gemini-3.6-flash`).

### Platform quota and BYO keys

`server/services/platformAiAccess.ts`:

- Platform key order: `GEMINI_API_KEY`, then `OPENAI_API_KEY`.
- Daily cap: `PLATFORM_AI_DAILY_LIMIT` (default 25) per user per UTC day in `ai_platform_usage.message_count`.
- User keys in `ai_provider_keys` are preferred when present and valid. Fallback is the platform key via `getApiKeyWithFallback` / `tryPlatformAiAccess`.
- Encryption: AES-256-GCM with `ENCRYPTION_KEY` (64 hex characters in `env.example`). Applied in `server/routes/aiProviderKeys.ts` before storage.
- Task routing: `/api/api-task-assignments` maps a task type to a user key. Settings “API management” edits this.

Anthropic and Perplexity have no platform env key. They run only if the user stores a key and assigns it.

### Errors and usage

Provider failures surface as HTTP 4xx/5xx from the calling route (quota exceeded, missing key, upstream error). There is no second silent model hop beyond Gemini-then-OpenAI for the platform key. Settings does not chart usage. `GET /api/ai-research-agent/access` and `GET /api/lab-floors/access` report remaining platform allowance.

### Where AI is called from the product

| Feature | Endpoint | Still used by UI |
|---|---|---|
| Ask AI copilot | `POST /api/ai-research-agent/chat` | Yes |
| Writing assist and analyze | `/api/writing/.../assist`, `/analyze` | Yes |
| Slides from a draft | `POST /api/presentations/ai/generate` and siblings | Yes, as export |
| Notebook summaries | `/api/notebook-summaries/*` | Yes |
| Protocol generate / enhance | `/api/protocol-ai` | Yes |
| Evidence pack analyze | `POST /api/evidence-ai/analyze` | Yes |
| Lab Floors roleplay and debrief | `/api/lab-floors/roleplay` | Yes |
| Grant fit-gap | `POST /api/grants/:id/fit-gap` | Yes, server-side |
| Scholarly ask/compare | `POST /api/research/papers/ask`, `/papers/compare` | Yes, from the library flow |

### Agents and orchestrator

`server/routes/agents.ts`: `GET /api/agents`, `GET /api/agents/:agentType`, `POST /api/agents/:agentType/execute`. Implementations live under `server/services/agents/` and `server/services/AgentFactory.ts`. Writing assist uses this factory. The old capabilities page (`/ai-agents-capabilities`) redirects to Writing Studio.

`server/routes/orchestrator.ts` (`ResearchOrchestrator`): journeys, paper generation, presentation generation, autonomous literature synthesis, experiment design, data analysis, workflow execute, templates. These routes are mounted and authenticated. No sidebar page calls them. `pages/AIResearchAgentPage.tsx` and `ResearchJourneyPage.tsx` are not routed; the journey page is only pulled in by `WritingStudioOverlay` for the generate flow.

`server/routes/aiTraining.ts`: extract training data, train, chat, status, clear. Mounted. The personalized-training UI is not a current sidebar destination. Tables: `ai_training_data`, `user_ai_content`.

`server/services/ContinuousLearningEngine.ts`, `EnhancedRAGSystem.ts`, `SmartToolSelector.ts`, `TaskAnalysisEngine.ts`, `UserContextRetriever.ts` support the research-agent chat path (task classification, then a provider or an agent). Treat the chat route as the supported entry. Treat orchestrator “autonomous-*” routes and the training routes as mounted but without a first-class screen.

### Legacy AI surfaces

| Item | Status |
|---|---|
| `/ai-research-agent`, `/research-assistant`, `/ai-agents-capabilities` | Redirect to Writing Studio |
| `/ai-presentations`, `/presentations` | Redirect; generate API remains |
| `pages/AIApiKeysPage.tsx` | Unrouted; keys live in Settings |
| `pages/AIAgentsCapabilitiesPage.tsx`, `AIResearchAgentPage.tsx`, `AIPresentationsPage.tsx`, `ResearchAssistantPage.tsx` | Unrouted or redirect-only |
| `server/enhancedAIGenerationService.js` | Together API (`TOGETHER_API_KEY`), legacy generation |
| `presentation-ai-reference/` | Separate nested app, not imported |
| `services/geminiService.ts` | Client-side helper; Vite strips `GEMINI_API_KEY` from the bundle (`vite.config.ts`) |

---

## 12. External Integrations

Env names only. Values belong in the environment, not in this audit.

| Service | Where | Auth | Purpose | Status | Env |
|---|---|---|---|---|---|
| Crossref | `server/services/doiIntegration.ts`, `server/services/scholarly/crossref.ts` | Public polite pool | DOI metadata for citations | Active | none required |
| OpenAlex | `server/services/scholarly/openalex.ts` | mailto, optional key | Search, related works | Active | `OPENALEX_MAILTO`, `OPENALEX_API_KEY` |
| PubMed / NCBI E-utilities | `server/services/scholarly/pubmed.ts` | Optional key + email | Biomedical search | Active | `NCBI_API_KEY`, `NCBI_EMAIL` |
| Europe PMC | `server/services/scholarly/europepmc.ts` | Public | Biomedical fallback and full text | Active | none |
| Unpaywall | `server/services/scholarly/unpaywall.ts` | Email | Open-access PDF links | Active | `UNPAYWALL_EMAIL` |
| Scholar Sidekick | scholarly sidekick client, `/api/research/sidekick/*` | Optional `ssk_` key | Format, verify, retraction, export | Active, anonymous tier works | `SCHOLAR_SIDEKICK_API_KEY`, `SCHOLAR_SIDEKICK_BASE_URL` |
| Semantic Scholar | Paper fields and env only | Optional key | Intended related-work source | No live client module found | `SEMANTIC_SCHOLAR_API_KEY` |
| ORCID | Profile field `users.orcid`; Crossref ORCID filter; `paperLibrary.ts` fetch-by-orcid | Stored id / public | Author identity | Partial. Live profile field. Fetch route is on an unmounted router | none |
| ROR | — | — | — | Not referenced | — |
| CORDIS | — | — | — | Not referenced. Horizon ingest uses the SEDIA API, not CORDIS | — |
| Horizon Europe SEDIA | `server/services/grants/horizonEuropeService.ts` | Public API | Grant ingest | Active | none |
| Clarivate / Web of Science | — | — | — | Not referenced | — |
| Google Gemini | `GoogleGeminiProvider`, platform access | API key | Platform and BYO chat | Active | `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL` |
| OpenAI | `OpenAIProvider` | API key | Platform backup and BYO | Active | `OPENAI_API_KEY` |
| Anthropic | `AnthropicClaudeProvider` | User key | BYO chat | Available if a key is stored | none at platform level |
| Perplexity | `PerplexityProvider` | User key | BYO chat | Available if a key is stored | none at platform level |
| Together | `server/enhancedAIGenerationService.js` | API key | Older generation helper | Legacy | `TOGETHER_API_KEY` |
| Lens.org | `server/routes/externalDatabases.ts` | Token | Patents / literature | Router not mounted | `LENS_API_TOKEN` |
| Materials Project | env only | Key | Materials data | Env stub, no live call found in mounted routes | `MATERIALS_PROJECT_API_KEY` |
| Stripe | `server/routes/support.ts` | Secret key | Donation checkout | Optional | `STRIPE_SECRET_KEY` |
| PayPal | Support config | URL | Donation link | Optional | `DONATION_PAYPAL_URL`, `DONATION_CONTACT_EMAIL` |
| Redis | dependency `redis` | URL | Listed for cache | `REDIS_URL` empty in the example; not required to boot | `REDIS_URL` |
| Supabase | `vite.config.ts` `define` | Anon key | Injected into the client bundle if set | No upload or auth path uses it in the current SPA | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Google Cloud / GitHub | env example only | Token / project id | Not a product feature | Unused by mounted routes | `GOOGLE_CLOUD_PROJECT_ID`, `GITHUB_TOKEN` |

Scholarly responses are cached in `scholarly_cache` for `SCHOLARLY_CACHE_TTL_SEC` (default 3600).

---

## 13. Data Analysis Architecture

Three separate implementations exist. They do not share a result table.

### Browser stats used by Research evidence

`utils/researchStats.ts`, called from `pages/DataResultsPage.tsx`.

Analyses: descriptive statistics, Student and Welch t-tests, one-way ANOVA, Pearson correlation, ordinary linear regression. Input is numeric columns and group labels already on the evidence pack (`research_data.files` / metadata), not a file upload to Python. Charts in the wider app can use `recharts` (dependency). This module returns numbers for the evidence panels. `utils/xyRegression.ts` and `utils/sheetFormulas.ts` cover spreadsheet-style regression and sheet formulas inside evidence editors (`components/evidence/editors/`).

### Data analysis page

`pages/DataAnalyticsPage.tsx` at `/data-analysis` and `/data-analytics`. The user pastes delimited numbers. The page computes descriptive stats, correlation, a t-test, and regression in the browser. It does not call `/api/advanced-stats` or `researchStats.ts`. Hidden from the sidebar.

`pages/StatisticalAnalysisToolsPage.tsx` is an Orange-style widget screen and is not routed.

### Python / FastAPI service

File: `stats_service/advanced_main.py`. Libraries: pandas, numpy, scipy, statsmodels, scikit-learn, matplotlib, seaborn.

Direct HTTP (port 5003 when started by `pnpm dev:stats`):

| Method | Path | Analysis |
|---|---|---|
| GET | `/health` | Process health |
| POST | `/load-csv` | CSV → list of row dicts |
| POST | `/load-excel` | Excel → row dicts |
| POST | `/data-info` | Column summary |
| POST | `/select-columns` | Projection |
| POST | `/remove-duplicates` | Dedup |
| POST | `/handle-missing` | Drop or fill |
| POST | `/descriptive-stats` | Describe |
| POST | `/correlation-analysis` | Correlation |
| POST | `/linear-regression` | OLS, `target_column` + features |
| POST | `/clustering` | `kmeans` or `dbscan`, silhouette when applicable |
| POST | `/hypothesis-testing` | `test_type` + columns |
| POST | `/anova` | `group_column`, `value_column` |
| POST | `/scatter-plot`, `/histogram`, `/box-plot`, `/heatmap`, `/line-chart` | Matplotlib → base64 PNG |
| POST | `/export-csv`, `/export-excel` | File export |

Input model: JSON `{ data: [ {col: value}, ... ], columns?, options? }` or an uploaded file on the load routes. Plots return base64 PNG strings.

Node proxy in `server/index.ts` (all `authenticateToken`) under `/api/advanced-stats/`:

- `GET /health`
- `POST /workflow/execute`
- `POST /data/load-csv`, `/data/load-excel`
- `POST /preprocessing/data-info`, `/select-columns`, `/remove-duplicates`, `/handle-missing`
- `POST /analysis/descriptive`, `/correlation`, `/regression`, `/clustering`, `/hypothesis-testing`, `/anova`
- `POST /visualization/scatter-plot`
- `POST /export/csv`

The proxy does not expose histogram, box, heatmap, line, or Excel export even though FastAPI implements them. Target URL: `PYTHON_STATS_SERVICE_URL` (example `http://localhost:5003`). `server/advancedStatsService.js` is the bridge. No MySQL table stores analysis output.

`POST /api/orchestrator/autonomous-data-analysis` is a separate AI workflow, not this Python service.

Overlap: descriptive stats, correlation, t-test/hypothesis tests, ANOVA, and linear regression exist in both the browser and Python. Clustering, preprocessing, and plot images exist only in Python. The evidence page and the data-analysis page do not call Python.

---

## 14. Notifications and Real-Time Behaviour

| Channel | Mechanism | Interval / detail |
|---|---|---|
| In-app notifications | REST `/api/notifications` | Bell polls unread count every 30s. No push. |
| Dashboard pulse | REST + `CustomEvent` `researchlab:dashboard-sync` + localStorage `researchlab:dashboard-sync-at` | Poll every 25s while visible (`DashboardPage` `POLL_MS`) |
| Writing collaboration | REST poll of `collab-state` and `presence` | 10s and 15s. SSE endpoint exists and is unused by the client. Server ping 25s. |
| AI chat stream | `POST /api/ai-research-agent/chat` with `stream: true` | Response is `text/event-stream` for that request only |
| Lab messages | REST conversations | No socket, no interval found in the messaging components |
| WebSocket | `components/CollaborationService.tsx` opens `ws://localhost:5002/ws/collaboration/${sessionId}` | No matching `ws` server in `server/index.ts`. Client stub. |
| Event bus | Browser `CustomEvent` only (`dashboardSync`) | No server bus (no Redis pub/sub wired) |

There is no Socket.IO server and no general notification SSE.

---

## 15. File Uploads and Storage

| Upload | Route | Limit | Types | Storage |
|---|---|---|---|---|
| Citation PDF / text | `POST /api/writing/citations/:id/pdf` | 20 MB multer memory | PDF, `text/plain` | Bytes handled in the request; `writing_citations.pdf_path` stores a path string |
| Library PDF | `POST /api/research/library/:paperId/pdf` | 25 MB multer memory | PDF | Same pattern for a library paper |
| JSON body | `express.json` | 1 MB | JSON | Not a file upload |
| Upload rate limit | `uploadRateLimit` | 10 per 15 minutes | | `server/middleware/security.ts` |

Notebook and evidence imports do not hit those endpoints. `DocumentImportModal` plus `utils/documentImport.ts`, `utils/notebookImport.ts`, and `utils/dataResultImport.ts` parse Word (mammoth), spreadsheets (xlsx), and pasted text in the browser, then save normal JSON records.

Profile images: `users.avatar_url` is a string. No avatar upload route was found. Some UI fallbacks use placeholder image URLs.

Manuscript export files are generated in the browser (jsPDF) and downloaded. They are not stored server-side.

Evidence artifacts: `research_data.files` and `metadata` are JSON. They describe or embed client-side content. They are not an object store.

Cloud: no S3 client in the mounted API. Supabase URL and anon key can be compiled into the client and are unused by the current upload paths. Directories `uploads/research-pdfs` and `uploads/writing-pdfs` exist on disk from older runs; memory-storage multer does not by itself guarantee new files land there.

`sharp` is a dependency (image processing) and is not the profile-upload pipeline.

---

## 16. Privacy, Security, and Compliance

### HTTP hardening (`server/index.ts`, `server/middleware/security.ts`)

- Helmet via `securityHeaders`. Content-Security-Policy is disabled. Cross-origin embedder policy is disabled. HSTS max-age 31536000, includeSubDomains, preload.
- CORS: in production, origins are `FRONTEND_URL` split on commas (example default `http://localhost:5173`). Outside production, any origin is allowed. `credentials: true`.
- `express.json({ limit: '1mb' })`.
- `trust proxy` when `TRUST_PROXY=true` or `NODE_ENV=production`.
- `apiRateLimit` on `/api`: 15-minute window, production max `API_RATE_LIMIT_MAX` or 600, otherwise or 5000. Skips writing collab poll paths.
- `authRateLimit`: 15 minutes, production max 10, otherwise `AUTH_RATE_LIMIT_MAX` or 80. Applied to register, login, demo-login, and change-password.
- `uploadRateLimit`: 10 per 15 minutes.
- `validateInput` and `requestLogger` exist in `security.ts` and are not mounted in `index.ts`.
- A second `corsOptions` export in `security.ts` (includes port 3000) is not the live CORS config.

### JWT and passwords

JWT secret is required at boot, at least 32 characters, and must not be a known example. Expiry 24 hours. Logout does not revoke tokens. Demo token is forbidden in production.

Passwords: bcrypt, `BCRYPT_ROUNDS` default 12. Compared on login and on password change.

AI keys at rest: AES-256-GCM with `ENCRYPTION_KEY`.

### GDPR and consent

Routes: `server/routes/compliance.ts` at `/api/compliance`. Service: `server/services/complianceService.ts`.

- Public `POST /gdpr/requests` and `POST /gdpr/requests/:id/verify`. Types: access, rectification, erasure, portability, restriction, objection. UI: `pages/PrivacyRightsPage.tsx` with `requestId` and `token`.
- Admin list, get, process, reject.
- Consent: `POST /consent`, `/consent/batch`, `/consent/withdraw` (`optionalAuth`), `POST /consent/link-session` (authenticated, called after login).
- Cookie banner: `components/CookieBanner.tsx`. Categories essential (always), functional, analytics, marketing. Stored in `cookie_consent`. Batch-synced with header `X-Session-Id`.
- Admin: audit log list and export, retention policy CRUD and execute, legal policies, compliance dashboard.
- Export: `GET /api/settings/export-data` returns a JSON bundle of the user’s rows.
- Deletion: `DELETE /api/settings/account`. Erasure path anonymizes email and username and strips access rather than necessarily dropping every child row. Confirm against `complianceService.ts` before promising hard delete of all related tables.
- Audit: `audit_logs` (safety migration, widened by GDPR alters). Not every product write is logged.
- Dataset ethics: the data bank is described as ethical cross-org exchange. Offers and requests are rows with privacy fields. There is no separate ethics-approval workflow table beyond what authors type into those rows.
- Sensitive data: passwords hashed, AI keys encrypted, profile visibility flags (`profile_visibility`, `show_email`, `show_phone`, `show_location`). Notebook and evidence rows have `privacy_level` (default `lab`). Negative results have `sharing_status`.

Legal pages: `/privacy`, `/cookies`, `/terms`, `/cookie-preferences`, `/privacy-rights`. Footer component: `components/LegalFooterLinks.tsx`.

---

## 17. Testing

### Jest (`pnpm test`, `jest.config.js`)

| File | What it covers |
|---|---|
| `tests/unit/LoginPage.test.tsx` | Login page |
| `tests/unit/Button.test.tsx` | A button |
| `tests/unit/writingStructure.test.ts` | Section tree |
| `tests/unit/writingStudioRoutes.test.ts` | Studio path helper |
| `tests/unit/writingStudioCitations.test.ts` | Citation helpers |
| `tests/unit/xyRegression.test.ts` | Regression math |
| `tests/unit/scholarly/scholarlyHelpers.test.ts` | Scholarly helpers |
| `tests/unit/personalAssistant.test.ts` | Assistant heuristics |
| `contexts/__tests__/AuthContext.test.tsx` | Auth context |
| `pages/__tests__/DashboardPage.test.tsx` | Dashboard render |
| `server/__tests__/auth.test.ts` | Auth API |
| `tests/integration/api.test.ts` | Broad API smoke |
| `tests/integration/grants.test.ts` | Grants |
| `tests/integration/compliance.test.ts` | Compliance |
| `tests/setup.ts` | Jest setup |

### Playwright (`pnpm test:playwright`)

Specs under `tests/e2e/`: `digital-research-manager.pw.spec.ts`, `lab-notebook.pw.spec.ts`, `experiment-tracker.pw.spec.ts`, `professional-protocols.pw.spec.ts`, `recommendations-notebook-summaries.pw.spec.ts`, plus `tests/e2e/utils/auth.ts`. The npm script turns on demo auth and points at `http://localhost:5002`.

### Cypress

`cypress/e2e/auth.cy.ts`, `cypress/e2e/dashboard.cy.ts`. `pnpm test:e2e`.

### Other API / e2e suites

`e2e-testing/tests/api/authentication.test.ts`, `endpoints.test.ts`, `health-checks.test.ts`. UI: `navigation.test.ts`, `features.test.ts`. CRUD: protocols and lab notebook. Integration: `data-flow.test.ts`. This package has its own `package.json` and Puppeteer setup. It is not the same runner as Playwright.

Artillery: `tests/performance/*.yml` via `pnpm test:performance`. Shell scripts at the repo root (`test-api-endpoints.sh`, `comprehensive-e2e-test.sh`, `scripts/qa-*.sh`) are manual QA runners, not a maintained suite.

### Flows that have some automated coverage

Login, auth API, dashboard render, notebook, protocols (including the old professional-protocols name), experiment tracker, grants, compliance, recommendations, notebook summaries, writing structure/citations as unit tests, navigation clicks in the e2e-testing package.

### Major untested areas

Writing Studio collaboration and SSE, Lab Floors (choice floors and PhD roleplay), lab workspace hierarchy (spaces through maintenance), marketplace directory, data bank, networking social graph, grant ingest, AI key encryption, negative results, help forum, current trends, PI review, project management, file uploads, the Python stats service, Ask AI, messaging, and GDPR erasure behaviour end to end.

---

## 18. Deployment

### Commands (`package.json`)

| Script | Effect |
|---|---|
| `pnpm dev` | Vite + API (`tsx watch server/index.ts`, 8 GB heap) + stats on port 5003 |
| `pnpm dev:app` | Vite + API only |
| `pnpm dev:frontend` | Vite, port 5173, proxies `/api` and `/health` to `VITE_DEV_API_PROXY` or `http://127.0.0.1:5002` |
| `pnpm dev:backend` | API |
| `pnpm dev:stats` | `python3 -m uvicorn advanced_main:app --host 0.0.0.0 --port 5003 --reload` |
| `pnpm build` | `vite build` to `dist/client`, `tsc -p server/tsconfig.json` |
| `pnpm start` / `start:prod` | `node dist/server/server/index.js` (prod sets `NODE_ENV=production`) |
| `pnpm build:directadmin` | Production build with `VITE_API_URL=/api` |
| `pnpm pack:directadmin` | `scripts/pack-directadmin.sh` |
| `pnpm db:migrate` / `db:heal` | `database/migrate.ts` |
| `pnpm db:seed` | `database/seed.ts` |
| `pnpm grants:ingest-horizon` | Horizon ingest script |

API port: `PORT` default 5002 (`env.example`).

### Environment variables

From `env.example` (names only):

`PORT`, `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET`, `ENABLE_DEMO_AUTH`, `DEMO_AUTH_TOKEN`, `DEMO_AUTH_EMAIL`, `DEMO_AUTH_PASSWORD`, `BCRYPT_ROUNDS`, `ENCRYPTION_KEY`, `TRUST_PROXY`, `SERVE_FRONTEND`, `MYSQL_URL`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DB`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL`, `DB_POOL_MAX`, `DB_IDLE_TIMEOUT`, `DB_CONNECTION_TIMEOUT`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `PLATFORM_AI_DAILY_LIMIT`, `GEMINI_CHAT_MODEL`, `TOGETHER_API_KEY`, `MATERIALS_PROJECT_API_KEY`, `LENS_API_TOKEN`, `PYTHON_STATS_SERVICE_URL`, `REDIS_URL`, `OPENALEX_MAILTO`, `OPENALEX_API_KEY`, `NCBI_API_KEY`, `NCBI_EMAIL`, `UNPAYWALL_EMAIL`, `SEMANTIC_SCHOLAR_API_KEY`, `SCHOLAR_SIDEKICK_API_KEY`, `SCHOLAR_SIDEKICK_BASE_URL`, `SCHOLARLY_CACHE_TTL_SEC`, `VITE_API_URL`, `VITE_GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `DONATION_PAYPAL_URL`, `DONATION_CONTACT_EMAIL`, `GOOGLE_CLOUD_PROJECT_ID`, `GITHUB_TOKEN`.

Also referenced in code or Vite but not all listed above: `API_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `MYSQL_SOCKET`, `VITE_DEV_API_PROXY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

`VITE_GEMINI_API_KEY` is in the example and is blanked by Vite’s `define` so it is not shipped. Do not put provider secrets in `VITE_*` variables.

### Vite

`vite.config.ts`: React plugin, production bundle visualizer, aliases `@`, `@components`, `@pages`, `@services`, `@utils`, `@contexts`, `@types`. Output `dist/client`. Dev server port 5173, host true, proxy `/api` and `/health` to the Express port. Terser drops `console.log` in production.

### MySQL

Create a database matching `MYSQL_DB` (example `digital_research_manager`). Run `pnpm db:migrate` against that same name. Do not rely on `db:reset` (it calls `psql`). The pool speaks MySQL even though handlers write `$1` placeholders. Assume the merged experiment shape and the JSON `grant_writeups.content` described in section 5, and assume the missing tables in section 5 are absent unless someone created them by hand.

### Python stats

`cd stats_service && pip install -r requirements.txt`, then `pnpm dev:stats`. `stats_service/README.md` still mentions port 8001 and `main:app`. The script that actually runs is `advanced_main:app` on port 5003. `scripts/start-stats-service.sh` and `start-advanced-stats-service.sh` are alternate launchers (`pnpm dev:advanced-stats`, `dev:full-advanced`).

### DirectAdmin

`ecosystem.config.cjs` runs the built app with `SERVE_FRONTEND=true` so Express serves `dist/client`. `deploy/directadmin/app.js` is the process file. `deploy/directadmin/htaccess.apache-static-spa` is the Apache SPA fallback. `directadmin-package/` duplicates migrations, env example, and install notes (`DEPLOYMENT_DIRECTADMIN.md`, `INSTALL.txt`). `pnpm pack:directadmin` builds that package. Production assumption: same-origin `/api`, MySQL on the host, Node process managed by PM2, stats service only if those screens are required (the main SPA does not require it for notebook, writing, or workspace).

### Other host files

`public/vercel.json`, `public/netlify.toml`, `public/staticwebapp.config.json`, `Dockerfile`, `docker-compose.yml`. Compose is an older layout (SQLite-style path, sample Supabase URL) and is not the MySQL + DirectAdmin path.

---

## 19. Known Legacy or Dead Code

Nothing here was deleted. This is a map only.

### Routes that only redirect

`/home`, `/tasks/new`, `/team`, `/calculator-hub`, `/research-tools`, `/bioinformatics-tools`, `/molecular-biology`, `/professional-protocols`, `/ai-agents-capabilities`, `/research-assistant`, `/ai-research-agent`, `/research-journey`, `/ai-presentations`, `/presentations`, `/evidence-references`, `/data-sharing`, `/supplier-marketplace`, `/service-marketplace`, `/my-portfolio`, `/scientist-passport`, `/cookie-policy`, `/team-messaging`.

### Pages present and not mounted on a route

| File | Note |
|---|---|
| `pages/TeamManagementPage.tsx` | Imported in `App.tsx`, no route |
| `pages/PaperLibraryPage.tsx` | Old paper library |
| `pages/SimpleReferenceSystemPage.tsx` | Old references |
| `pages/AIResearchAgentPage.tsx` | Replaced by copilot + redirect |
| `pages/ResearchAssistantPage.tsx` | Redirect |
| `pages/AIPresentationsPage.tsx` | Redirect; API remains |
| `pages/AIAgentsCapabilitiesPage.tsx` | Redirect |
| `pages/AIApiKeysPage.tsx` | Superseded by Settings |
| `pages/EvidenceReferencesPage.tsx` | Redirect into studio library |
| `pages/StatisticalAnalysisToolsPage.tsx` | Unrouted Orange-style UI |
| `pages/ServiceMarketplacePage.tsx`, `pages/SupplierMarketplacePage.tsx` | Superseded by `MarketplacePage` |
| `pages/BioinformaticsToolsPage.tsx`, `pages/MolecularBiologyPage.tsx`, `pages/ResearchToolsPage.tsx` | Redirect to dashboard |
| `pages/TestPage.tsx` | Unrouted |
| `pages/ResearchJourneyPage.tsx` | Only via `WritingStudioOverlay` |

### Unmounted API modules

`server/routes/simpleReferences.ts`, `unifiedCollaboration.ts`, `peercred.ts`, `crossEntityIntegration.ts`, `externalDatabases.ts`, `professionalProtocols.ts`, `paperLibrary.ts` (Postgres DDL).

### Old models and servers

- `projects` vs `research_projects`
- `notebook_entries` vs `lab_notebook_entries`
- `bookings` vs `instrument_bookings`
- `results` vs `research_data`
- `user_papers` vs `papers` / `writing_citations`
- `professional_protocols` vs `protocols`
- `server/database/setup.ts` and `data/researchlab.db` (SQLite)
- `server/working-server.js`
- `docker-compose.yml` SQLite-oriented service
- `pnpm db:reset` Postgres command
- `presentation-ai-reference/` nested git repo
- Root historical `*.md` status reports (not runtime)

### Duplicate declarations inside `server/index.ts`

`GET /api/health` (twice), `GET /api/lab-notebooks` (twice), `GET /api/instruments/:id/bookings` (twice).

### Incomplete product behaviour (still shipped)

- Conference news has no data source.
- PI review lists do not load.
- Project management team call uses a fixed lab UUID.
- Writing invite email is logged, not sent.
- Writing SSE is unused; the client polls.
- Collaboration WebSocket client has no server.
- Settings AI usage chart is a TODO.
- Inventory transactions are not historicized.
- Several handlers query tables migrations never create (section 5).

---

## 20. Recommended Data to Preserve During Rebuild

This is the product model implied by the running app, not a new design. Preserve these entities and the links between them.

### Identity and lab

- User account: name, username, email, password hash, account role, status, profile and privacy flags, ORCID and links, research interests.
- Lab: institution, description, PI pointer, contact, showcase fields.
- Membership: user, lab, lab role, active flag. This is the authorization unit for lab data, separate from the account role.

### Daily research work

- Personal notebook entries with type, status, priority, privacy, and optional links to experiment, protocol, and project. Comments on entries. Quick notes are a second, lighter note type used by the dashboard and the notebook; keep them if that hub stays.
- Protocols with ordered steps, attachments, sharing (lab or user, permission), execution history, and optional embeddings for semantic search.
- Experiments with status lifecycle, milestones, and progress logs, optionally linked to a protocol and a notebook entry.
- Evidence packs (`research_data`): status pipeline, JSON files and metadata, links to protocol, experiment, and notebook entry.
- Workspace: one workspace per lab; spaces, folders, lists, tasks, subtasks, comments. Task status and priority vocabularies. Optional task links to project, protocol, inventory item, and instrument. Due dates drive the calendar view.
- Inventory items and instruments, plus bookings. Maintenance records if that screen stays (the table is missing today, but the screen expects it). Stock movement history does not exist today; only current quantity does.

### Writing and literature

- Manuscript: type, template, status, citation style, JSON content (sections), revision counter.
- Collaborators, invitations, presence, and section locks, including section-scoped roles.
- Two citation stores that must not be collapsed blindly: the shared scholarly paper/library (`papers`, library items, collections) and the user’s manuscript citations (`writing_citations` attached to documents). DOI, BibTeX, CSL JSON, source text, and PDF path are part of the citation record.
- Grant opportunities, user preferences, match rows, and grant writeups. A grant writeup and a Writing Studio grant document are different records. The rebuild should keep that handoff explicit (`grantId` → new grant manuscript) even though hydration is incomplete today.

### Lab program and community

- Research projects (`research_projects`) with work packages, reporting line, progress reports, and PI reviews. Do not preserve the legacy `projects` table except as a migration source for old experiment foreign keys.
- Negative results with comments, votes, and saves, public vs private sharing.
- Research events, bookmarks, and applications, separate from a personal calendar.
- Help-forum requests and responses.
- Community posts with likes, comments, and saves.
- Networking: follows, connection requests, lab follows, lab join requests, networking posts.
- Direct messages: conversations, participants, messages.
- Data bank: organizations, dataset offers, dataset requests.
- Marketplace directory: suppliers and catalog, service providers and offerings, tenders. The older `service_listings` / requests / proposals model is a second marketplace; preserve it only if that API is still a product requirement.
- Notifications as one user-visible inbox. Progress notifications and grant notifications can fold into that inbox if their types are kept.

### AI, privacy, and Lab Floors

- Encrypted per-user provider keys, provider registry, task-to-key assignments, and daily platform usage counts.
- Consent records, cookie choices, GDPR requests, audit log, retention policies.
- Lab Floors choice-floor progress and PhD roleplay progress are local-only today. If accounts should keep stamps and chapter position, those two JSON shapes (`drm_lab_floors_progress_v1` and `drm_lab_floors_roleplay_v1`) are the schema to preserve. Transcripts are not stored.

### Relationships that define the product

- A user belongs to many labs; a lab has one workspace.
- Notebook entries, experiments, protocols, evidence packs, and workspace tasks point at each other by id, even where the foreign key was never declared.
- A manuscript belongs to an owner and optionally to collaborators; citations attach to the user and to specific documents.
- Grants can start a manuscript; they do not currently overwrite one.
- Showcase flags on a lab feed the networking directory and the public lab page.
- PI review sits on research projects, not on workspace tasks.

### Safe to treat as non-canonical

Legacy `projects`, `notebook_entries`, `content_blocks`, `results`, `professional_protocols`, unmounted PeerCred and paper-library tables, SQLite `data/researchlab.db`, and the nested `presentation-ai-reference` app. Copy data out of them only if a live database still has rows the current UI reads.

---

End of audit.
