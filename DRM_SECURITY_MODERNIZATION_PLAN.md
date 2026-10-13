# DRM Security Modernization Plan

Date: 4 October 2026.  
Status: planning only. This document prioritizes controls. It is not an exploit guide and it does not change the running system.

Related: `DRM_MODERNIZATION_MASTER_PLAN.md`, `DRM_DATABASE_CONSOLIDATION_PLAN.md`, `DRM_INCREMENTAL_IMPLEMENTATION_ROADMAP.md`.

Evidence comes from `DRM_CURRENT_SYSTEM_AUDIT.md` and from `server/middleware/auth.ts`, `server/middleware/security.ts`, `server/index.ts`, `utils/roleAccess.ts`, and `database/migrations/mysql_migration.sql`. Items below are defects and missing controls. A line is an exploitable vulnerability only after the sprint that tests it says so.

---

## 1. Goals

1. A stolen or logged-out token stops working.
2. Lab data is readable and writable only by members allowed to see that row.
3. A fresh database from `pnpm db:migrate` does not force handlers to invent schema.
4. Account recovery exists without locking out current users.
5. Files, secrets, and model context follow the same ownership rules as the REST API.
6. Production configuration fails closed: JWT secret, demo auth, CORS, and error bodies.

Frontend route hiding is not a control. `components/ProtectedRoute.tsx` only checks that a user and a token exist. `App.tsx` does not pass `requiredRole` or `allowedRoles`.

---

## 2. What already holds

Keep these. Do not replace them with a new auth stack.

- `server/utils/authEnvironment.ts` rejects a missing, short, or well-known `JWT_SECRET` (minimum 32 characters) and rejects demo auth when `NODE_ENV` is production.
- Passwords are bcrypt hashes. `BCRYPT_ROUNDS` defaults to 12. Login and `PUT /api/auth/change-password` compare with bcrypt.
- Public signup roles are coerced to `student` or `researcher` in `server/validation`. A client cannot self-assign `admin`.
- `authenticateToken` verifies the JWT, reloads the user, and rejects a non-`active` status.
- AI provider keys are encrypted with AES-256-GCM before insert (`ENCRYPTION_KEY`, 64 hex characters in the example env).
- Helmet is applied, HSTS is on (max-age 31536000, includeSubDomains, preload), and rate limits exist for `/api`, auth, and uploads.
- Production CORS uses `FRONTEND_URL`. Auth routes use `authRateLimit`.
- Profile update uses a Zod schema (`profileUpdateSchema`) rather than writing the raw body onto `users`.
- Vite’s `define` blanks `GEMINI_API_KEY` so the client bundle does not receive that server secret. `VITE_GEMINI_API_KEY` must stay empty.

---

## 3. P0 controls

### 3.1 Missing tables and runtime DDL

Mounted handlers query tables that migrations do not create, and `server/services/platformAiAccess.ts` runs `CREATE TABLE` for `ai_platform_usage`. A process that can create tables is one bug away from creating the wrong ones, and a fresh install breaks calendar, maintenance, experiment risks, negative-result saves, and AI failure tracking.

Fix in the schema-truth sprint (`DRM_DATABASE_CONSOLIDATION_PLAN.md` sections 6, 8, 13–16). After that sprint, CI or a migrate test fails if handler SQL names a table that does not exist. Runtime DDL is deleted, not feature-flagged.

Unmounted `server/routes/paperLibrary.ts` builds `user_papers` with Postgres syntax. Do not mount it. Delete it when the retirement check passes.

### 3.2 Account status and role defaults

`users.status` defaults to `Offline`. `users.role` defaults to `Research Assistant`. Middleware treats any status other than `active` as a failed login session. Signup writes the right values, so the happy path works. Any insert that omits `status` creates an account that cannot authenticate, or a role the TypeScript union does not know.

Forward migration: change defaults to `student` and `active` until verification ships, then new rows use `pending_verification` only when the verification sprint is live. Do not flip existing `active` users. Report unexpected status values before rewriting them (`DRM_DATABASE_CONSOLIDATION_PLAN.md` section 17).

### 3.3 Token theft and logout

Current session:

- Library `jsonwebtoken`. Payload `{ userId, email, role }`. Expiry `24h`.
- Client stores `authToken` and legacy `token` in `localStorage` (`utils/apiBase.ts`, `contexts/AuthContext.tsx`).
- `POST /api/auth/logout` returns `{ message: 'Logged out' }` and does not record the token.
- Password change updates `password_hash` and leaves existing JWTs valid.
- There is no refresh token and no server session store.

`localStorage` is readable by any script that runs on the origin. A 24-hour bearer token cannot be revoked.

Phase-2 design, without a storage cutover:

1. Add `revoked_tokens` (`jti` primary key, `user_id`, `expires_at`) or a `user_sessions` table. New JWTs include `jti`.
2. `authenticateToken` rejects a `jti` that is revoked or a token whose `iat` is older than `users.tokens_invalid_before`.
3. Logout, password change, and account suspension set `tokens_invalid_before` to now or insert the `jti`. Logout should require the bearer token so anonymous logout cannot be confused with revocation. The current unauthenticated logout can stay as a client hint, but revocation happens only when the token is presented.
4. The SPA keeps sending `Authorization: Bearer`. No httpOnly cookie in this sprint.
5. A daily job deletes expired `revoked_tokens` rows. Prefer `tokens_invalid_before` on `users` if the revocation list would otherwise grow without bound. One timestamp invalidates every token issued before a password change. Per-device logout needs the `jti` list. Implement the timestamp first. Add `jti` when more than one active device must survive a single device’s logout.

Shorter access tokens wait until a refresh call exists. Cutting 24 hours to 15 minutes in the same release that has no refresh will log every user out repeatedly.

Later sprint, only with product-owner decision 6: httpOnly `Secure` `SameSite=Lax` refresh cookie, short-lived access token, and CSRF defense on cookie-authenticated mutations (section 6). Do not do both storage models halfway.

### 3.4 Authorization model

Three checks, in order, on every protected mutation and on every read that is not deliberately public.

| Layer | Stored in | Question |
|---|---|---|
| Account role | `users.role` | Is this a platform admin action? |
| Lab role | `lab_members.role` where `is_active = 1` | Is this user a member of this lab, and is the lab role high enough? |
| Resource | owner column, collaborator row, or share row | May this user read or write this id? |

`lab_members.permissions` is unstructured TEXT. Ignore it until a later design replaces it. Do not invent an ACL parser for that column.

Lab role actions already used in `server/index.ts` for invites and member updates: `principal_researcher`, `admin`, `co_supervisor`. Encode that in one policy module, for example `server/policies/labAccess.ts`:

- `requireActiveUser`
- `requireAccountRole(roles)`
- `requireLabMember(labId)`
- `requireLabRole(labId, roles)`
- `requireOwnerOrLabRole(ownerId, labId, roles)`

Handlers stop copying `SELECT role FROM lab_members` inline once they are touched. The first wave is the lifecycle: notebook, protocols, experiments, `research_data`. The second wave is inventory, instruments, bookings, workspace tasks, and messages. Grants, marketplace, and public-ish directory reads are a third wave with their own rules (published vs lab-private).

`privacy_level` (`lab` default on notebook and evidence) is data, not a hint. A non-member does not receive `lab` or private rows. A member receives `lab` rows. `private` rows stay with the owner and explicit collaborators. Confirm the actual stored values in the handlers before coding the matrix. Do not widen access while “fixing” it.

`GET /api/users` (about line 429 of `server/index.ts`) returns every user’s email, username, role, status, and last login to any account whose role is `admin` or `principal_researcher`. Recommended replacement: platform-wide list stays `admin`. A principal researcher lists members of labs they manage. This is product-owner decision 10. Until that decision, treat the current route as a P1 data exposure, not as something to expand.

Account role `principal_researcher` and lab role `principal_researcher` are different. Policies must say which one they check. Today the user-list route checks the account role.

### 3.5 IDOR and BOLA test plan

For each resource in the first wave, automated tests use three fixtures: owner in lab A, other member of lab A, member of lab B, and a user with no lab.

| Case | Expected |
|---|---|
| Owner reads and updates own row | 200 |
| Lab member reads a `lab`-visible row | 200 |
| Lab member updates a row they do not own, without a manager role | 403 |
| Lab B member uses lab A’s id | 404 or 403, and the body does not include the row |
| Non-member | 404 or 403 |
| Authenticated user substitutes another `user_id` in the body | Ignored. The server uses `req.user.id` |
| Id that does not exist | 404, same shape as the cross-lab case where practical, so existence is not a signal |

Apply the same matrix to: `lab_notebook_entries`, `protocols`, experiments, `research_data`, then inventory items, instruments, `instrument_bookings`, and workspace tasks.

Also test:

- Manuscript id and invitation token: a collaborator may open only documents in `writing_collaborators` or a valid invite.
- `GET /api/users/:id` style profile routes: respect `profile_visibility`, `show_email`, `show_phone`, `show_location`.
- Export and account deletion: only the authenticated user, or an admin processing a verified GDPR request.
- Nested ids (comment on another user’s entry, booking on another lab’s instrument).

Prefer 404 when the caller should not learn that the id exists. Use 403 when the user can already see the resource but cannot perform the action.

These tests are sprint 7 in the roadmap. They are P0 work even though they ship after the policy helper, because the helper without tests does not prove the control.

---

## 4. P1 controls

### 4.1 Email verification and password reset

No `/api/auth` forgot-password, reset, or verify-email routes exist. Login does not read `email_verified`. Writing Studio invite email is logged, not sent.

Build one email port, `server/integrations/email.ts`:

- `send({ to, template, vars })` returns `{ delivered: boolean, providerMessageId?: string }`.
- Development adapter writes the message to the log and returns `delivered: false` unless `EMAIL_DELIVER_IN_DEV=true`.
- The HTTP response must not say the email was sent when `delivered` is false. Say that the message was recorded and delivery is not configured.
- Production adapter is a single module (SMTP or the provider the product owner picks). The rest of the app depends on the port, not on the vendor SDK.

Tokens:

- `email_verification_tokens` and `password_reset_tokens`: `id`, `user_id`, `token_hash`, `expires_at`, `used_at`. Store a hash of the token, not the token. Single use. Verification lifetime on the order of days. Reset lifetime on the order of one hour.
- Reset response is the same whether or not the email exists.
- Reset sets `password_hash` and `tokens_invalid_before`.
- Signup still returns a session for the recommended policy (decision 5): existing users are backfilled `email_verified = 1`. New users get `email_verified = 0` and a verification mail. Login stays allowed for backfilled users. If the product owner instead requires verification for everyone, that is a breaking change and needs a support path for accounts that never receive mail.

Password change stays on `PUT /api/auth/change-password` and should call the same invalidation as reset. `PUT /api/settings/change-password` must call the same service so the two routes cannot drift. Rate-limit both.

Changing email on `PUT /api/auth/profile` sets `email_verified = 0` for that user and sends verification. Do not leave a changed address marked verified.

### 4.2 Client role map

`utils/roleAccess.ts` `ROLE_HIERARCHY` has student, researcher, principal_researcher, and admin. `co_supervisor` is absent, so `hasMinimumRole` treats it as 0. `getRolePermissions` is permissive (`canManageLabs` true for everyone) and the router never calls `canAccessRoute`. `ROUTE_ACCESS` lists paths that do not match the live sidebar (`/presentations`, `/data-sharing`, `/conferences`).

Fix the hierarchy so `co_supervisor` sits with lab managers for UI hints (level beside `principal_researcher`, still below `admin`). Delete or stop exporting `ROUTE_ACCESS` rather than pretending it gates routes. Server policies are authoritative. Do not add client-side route blocking as a security feature.

### 4.3 Files and uploads

Current uploads (`DRM_CURRENT_SYSTEM_AUDIT.md` section 15):

- Citation PDF, 20 MB, multer memory, PDF or `text/plain`, path string on `writing_citations.pdf_path`.
- Library PDF, 25 MB, memory, PDF.
- `uploadRateLimit`: 10 per 15 minutes.
- Notebook and evidence imports parse in the browser and save JSON. They are not these endpoints.
- No avatar upload route. No S3 client. Directories `uploads/research-pdfs` and `uploads/writing-pdfs` are leftovers. Memory storage does not by itself write them.

Target abstraction `server/integrations/storage.ts`:

- Dev: local disk under a configured root, outside the static SPA tree.
- Later: S3-compatible bucket behind the same interface. Do not add the SDK until a deploy needs it.
- Server generates the storage key. Never use the user filename as the path.
- Check size, extension, and a sniffed MIME type. Reject mismatches.
- Metadata row in MySQL: owner, lab if any, original display name, size, mime, storage key, created time.
- Download handler checks the same resource policy as the parent citation or paper. A guessed key is not enough.
- Response `Content-Disposition` uses a sanitized display name. The file is not executed and not served from the SPA origin as HTML.

Evidence JSON that embeds file content is a separate problem. Large binary blobs do not belong in `research_data.files`. Moving those to the storage port is a follow-on, not the first upload sprint.

### 4.4 GDPR erasure

`DELETE /api/settings/account` and `complianceService.ts` anonymize email and username and strip access. The service’s table list includes `calendar_events`, which migrations do not create, so export or delete can throw on a fresh database.

Sprint work:

- Fix the table list so it matches tables that exist after schema-truth.
- For each exported table, state whether erasure deletes the row, anonymizes the author, or retains it for another user’s record (messages, shared protocols, published negative results).
- Shared content stays, with the author replaced by a deleted-user marker.
- Password hash, provider keys, and reset tokens are deleted.
- `tokens_invalid_before` is set so old JWTs die.
- An automated test builds a user with a notebook row, a consent row, and an AI key, runs erasure, and asserts the key is gone and the notebook is either gone or anonymized as specified.

Do not promise hard delete of every child row until that test exists.

### 4.5 Secrets and production configuration

| Control | Action |
|---|---|
| `JWT_SECRET` | Already required at boot. Keep the 32-character and denylist checks |
| `ENABLE_DEMO_AUTH` | Already forbidden in production. Add a test that boot throws if both `NODE_ENV=production` and `ENABLE_DEMO_AUTH=true` |
| `DEMO_AUTH_TOKEN` default `demo-token-123` | Never document a real deployment using the default. Non-production with the flag on upserts a demo user inside `authenticateToken` |
| `ENCRYPTION_KEY` | Required when AI key routes are enabled. Fail those routes if the key is missing or not 64 hex characters, rather than storing plaintext |
| `VITE_*` | No provider secrets, database URLs, or service-role keys. `VITE_SUPABASE_ANON_KEY` is unused by current uploads. Do not start using it for auth |
| Logs | No passwords, bearer tokens, reset tokens, or decrypted provider keys. Review `console.error` of full error objects on auth routes |
| Errors | Production responses stay generic. The profile handler already switches on `NODE_ENV`. Apply that pattern wherever `error.message` is returned |
| `pnpm db:reset` | Remove or replace the script so a Postgres drop cannot be run by habit. Document MySQL restore instead |
| DirectAdmin package | Generated, not hand-copied, so a security migration cannot ship in only one tree |
| Dependencies | Run the existing audit tool on a scheduled pass. This plan does not add packages |

CSP is disabled (`contentSecurityPolicy: false` in `server/middleware/security.ts`). Turning on a strict policy in one step will break Vite dev and any inline script. P1 approach: report-only CSP in production that allows the SPA origin and denies unknown script hosts, then enforce after the report is clean. Cross-origin embedder policy stays off until a feature needs it.

`validateInput` and `requestLogger` exist and are not mounted. Read `validateInput` before mounting it. If it is a naive global string block, it will false-positive scientific text. Prefer Zod on each body, which signup and profile already do, over a single middleware that rejects SQL-looking sentences. Mount `requestLogger` only if it redacts `Authorization` and request bodies on auth and AI-key routes.

### 4.6 AI security

Ask AI (`POST /api/ai-research-agent/chat`), writing assist, protocol AI, evidence AI, notebook summaries, grant fit-gap, scholarly ask, and Lab Floors roleplay all call the provider layer.

Rules for every caller:

1. `authenticateToken` runs before any retrieval.
2. Retrieval uses the lab and owner policies. A prompt that names another user’s id does not expand the query.
3. Tool arguments are validated. The personal assistant’s calendar tools must filter `user_id = req.user.id`.
4. Retrieved text is wrapped as untrusted data. System instructions say document text cannot change tools, reveal keys, or override authorization.
5. The model does not receive connection strings, `ENCRYPTION_KEY`, or other users’ key rows.
6. Responses that cite literature must cite items that were actually retrieved (library row, provider payload, or manuscript source). The UI can show those sources. Do not add a “verified citation” flag the server did not check.
7. Numerical claims that come from a stats tool must be the tool’s output. The model may explain the method.
8. Usage still increments `ai_platform_usage` for platform keys. BYO keys stay per user.
9. Lab Floors roleplay does not load another lab’s notebook into the scenario prompt.

Cross-lab leakage is a P1 defect until the retrieval helper is in place and tested with two labs. Do not describe it as a proven exploit in this plan. The test is the proof.

Orchestrator routes that run multi-step “autonomous” workflows are authenticated and have no sidebar. Treat them as high-privilege tools: same retrieval policy, or unmount them if no UI calls them. Unmounting is a product decision recorded in the master plan’s retire list, not a silent security change.

---

## 5. P2 controls

- Structured logs with a request id. Health check already exists at `/health` and `/api/health` (declared twice).
- Audit log writes for login success and failure, logout, password change, reset, role change, and authorization denial. `audit_logs` already exists. Do not log the password or the token.
- Brute-force: `authRateLimit` is 10 per 15 minutes in production and 80 otherwise. Keep it on register, login, demo-login, change-password, and the new reset routes. Add the same limiter to resend-verification.
- Account status `suspended` and `inactive` stay rejected by middleware. Admin UI to set them can wait. The column check cannot wait.
- Mass assignment: keep Zod allow-lists on every body that writes users, lab members, or roles. Reject `role` on profile update.
- SSRF: scholarly and grant clients must call fixed provider hosts. A user-supplied URL is not a fetch target unless it is a DOI resolution through the existing Crossref path. Webhook or “import from URL” features, if added later, need an allow-list and no access to link-local addresses.
- Open redirects: login `next` is already constrained to a single-slash relative path. Keep that check on any new redirect.
- XSS: React’s default escaping covers most UI. Dangerous paths are `dangerouslySetInnerHTML`, manuscript HTML preview, and PDF or HTML uploads served back as active content. The storage sprint serves uploads as attachments. A separate writing-preview review lists any `dangerouslySetInnerHTML` and sanitizes or removes it.
- SQL injection: handlers use bound parameters (`$1` style, rewritten for MySQL in `database/config.ts`). Keep that. Do not concatenate request values into SQL. Dynamic `ORDER BY` and column lists must be allow-listed. The schema-truth sprint must not build identifiers from user input.
- CORS: production stays on `FRONTEND_URL`. Development allows any origin with `credentials: true`. That is acceptable only on developer machines. A shared staging host must set `NODE_ENV=production` or an explicit origin list. The unused second `corsOptions` export in `security.ts` should be removed when that file is next edited so the live policy is obvious.
- Realtime: the WebSocket client to `ws://localhost:5002/ws/collaboration/` has no server. Delete the client when collaboration is touched so a future server cannot be bolted on without an auth design. Writing Studio SSE is unused. Polling is the live mechanism. Any future socket authenticates the same JWT or cookie and checks document membership on subscribe.
- Dependency and container review stays on the existing cadence. This plan does not pin a new scanner.

---

## 6. CSRF

The live API authenticates with `Authorization: Bearer`, not with a cookie. A cross-site form post does not attach that header. Classic CSRF is not the current session bug.

XSS that can read `localStorage` is the current session bug. CSP (section 4.5) and the upload content-type rules reduce that. Revocation (section 3.3) limits the damage.

If a later sprint sets a session cookie:

- `SameSite=Lax` or `Strict`, `Secure`, `HttpOnly`.
- State-changing requests require a CSRF token or a custom header the HTML form on another site cannot set.
- Ship the cookie and the CSRF check in the same sprint. Do not set the cookie first.

---

## 7. Authorization rollout order

1. Policy helpers and unit tests for allow and deny, no handler changes.
2. Notebook, protocols, experiments, research evidence.
3. IDOR integration tests for those four.
4. Inventory, instruments, bookings, workspace.
5. Writing documents and invites.
6. Messages, notifications, settings export and deletion.
7. Admin and grant-ingest routes, which already use `requireRole`, reviewed so lab role is not confused with account role.

Public routes stay public: landing, login, register, legal pages, GDPR verify, cookie consent, support checkout return. Everything else under `/api` that reads user data uses `authenticateToken` plus the resource policy.

---

## 8. Production checklist

Use this before calling a deploy hardened. It is the phase-12 gate, built up by earlier sprints.

- `NODE_ENV=production`
- `JWT_SECRET` unique, 32 characters or more, not an example value
- `ENABLE_DEMO_AUTH` unset or false
- `ENCRYPTION_KEY` set if AI keys are enabled
- `MYSQL_DB` set and identical for the API and migrate
- `FRONTEND_URL` set to the real origin
- `TRUST_PROXY=true` only behind the real proxy
- CSP report-only or enforcing, not silently disabled without a ticket
- Email port configured, or product copy that does not claim mail was sent
- Backups restorable (drill recorded)
- Demo token rejected
- IDOR suite green for the lifecycle resources
- No runtime `CREATE TABLE` in the server process
- Logs free of tokens and keys on a sample login and a sample AI call

---

## 9. Out of scope for the first security sprints

- Replacing JWT with a third-party identity provider.
- A full permission matrix editor in the UI.
- Web Application Firewall rules.
- Penetration-test procurement. The IDOR suite is the in-repo substitute until the product owner orders an external test.
- Rewriting `server/index.ts` in order to “make auth clean.” Auth helpers land beside the current file. Handlers move later, one domain at a time.
