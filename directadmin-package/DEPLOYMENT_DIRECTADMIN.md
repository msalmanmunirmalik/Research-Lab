# Digital Research Manager — DirectAdmin / cPanel deployment

Step-by-step guide to deploy the production build (API + React SPA) on **DirectAdmin Node.js Selector** (same flow works on many cPanel Node hosts).

## Architecture (recommended)

One Node.js app serves everything:

| Path | Served by |
|------|-----------|
| `/api/*` | Express API |
| `/*` | Built SPA from `dist/client/` |

- Startup file: **`app.js`**
- Env: **`SERVE_FRONTEND=true`** (default in production)

```
Browser → DirectAdmin proxy → Node (app.js)
                              ├─ /api/*  → Express
                              └─ /*      → dist/client (SPA)
```

---

## Before you start (checklist)

- [ ] DirectAdmin account with **Node.js** (18 or 20 LTS) and **MySQL**
- [ ] Domain or subdomain ready (SSL recommended)
- [ ] Local machine with **Node 18+** and **pnpm**
- [ ] Your production domain name (example: `https://research.yourlab.com`)

---

## Step 1 — Create MySQL database (DirectAdmin)

1. Open **MySQL Management** (or **Databases**).
2. Create a **database** and a **user**; grant the user **ALL** privileges on that database.
3. Write down:
   - Host (usually `localhost`)
   - Database name
   - Username
   - Password

You will paste these into `.env` later (`MYSQL_*`).

---

## Step 2 — Build & pack on your computer

From the project root:

```bash
cd "/path/to/researchlab"
pnpm install

# Same-origin API (best for DirectAdmin single-app deploy)
export VITE_API_URL=/api
# Or absolute URL if your API is on another host:
# export VITE_API_URL=https://YOUR-DOMAIN.com/api

pnpm run pack:directadmin
```

This will:

1. Compile the backend → `dist/server/`
2. Build the frontend → `dist/client/`
3. Assemble `directadmin-package/`
4. Create a zip in the project root:

`digital-research-manager-directadmin-YYYYMMDD-HHMMSS.zip`

Upload **that zip** to the server.

---

## Step 3 — Upload & extract on the server

1. Prefer **SSH** or DirectAdmin **File Manager**.
2. Extract the zip into the **Node.js Application root**, for example:

`/home/USERNAME/domains/YOUR-DOMAIN.com/nodejs/`

(Use the path DirectAdmin shows as **Application root**.)

You should see at least:

| Item | Purpose |
|------|---------|
| `app.js` | Startup file |
| `package.json` + `pnpm-lock.yaml` | Dependencies |
| `dist/client/` | Frontend |
| `dist/server/` | API |
| `database/migrations/` | MySQL SQL files |
| `env.directadmin.example` | Env template |
| `INSTALL.txt` | Short reminder |

**Do not** upload your local laptop `.env`. Create a new `.env` on the server.

---

## Step 4 — Create `.env` on the server

```bash
cd /path/to/application/root
cp env.directadmin.example .env
nano .env   # or edit in File Manager
```

### Required values

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `SERVE_FRONTEND` | `true` |
| `FRONTEND_URL` | `https://YOUR-DOMAIN.com` (exact browser origin) |
| `JWT_SECRET` | long random (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | long random (`openssl rand -hex 32`) |
| `ENABLE_DEMO_AUTH` | **`false`** |
| `MYSQL_HOST` | `localhost` |
| `MYSQL_PORT` | `3306` |
| `MYSQL_DB` | your DA database name |
| `MYSQL_USER` | your DA database user |
| `MYSQL_PASSWORD` | your DA database password |
| `PORT` | leave for DirectAdmin, or match the assigned port |

Optional but useful: `GEMINI_API_KEY`, `OPENAI_API_KEY`, scholarly API keys (see `env.directadmin.example`).

Generate secrets (on any machine with OpenSSL):

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
```

---

## Step 5 — Apply MySQL migrations

From a machine that can reach the MySQL database (SSH on the server is best):

**Option A — run the app’s migrator (after `pnpm install`):**

```bash
cd /path/to/application/root
# Needs a local Node toolchain that can run tsx, OR run SQL manually (Option B)
```

**Option B — import SQL in phpMyAdmin / MySQL (most common on DA):**

1. Open **phpMyAdmin** (or `mysql` CLI) → select your database.
2. Import / run the files in `database/migrations/` named `mysql_*.sql`  
   (order is usually alphabetical; the migrator records applied files — if importing by hand, run them in filename order and skip any that error as “already exists”).
3. Critical recent training migrations (if not already applied):
   - `mysql_lab_training.sql`
   - `mysql_lab_training_v2.sql`
   - `mysql_lab_training_v3.sql`

If the database already exists from a previous DRM deploy, only apply **new** migration files.

---

## Step 6 — Create the Node.js application (DirectAdmin UI)

1. **Extra Features** → **Node.js** (or **Setup Node.js App**).
2. **Create Application**:
   - **Node.js version:** 18.x or 20.x LTS  
   - **Application mode:** Production  
   - **Application root:** folder containing `app.js`  
   - **Application URL:** `/` (or your subdomain root)  
   - **Application startup file:** `app.js`  
   - Leave **PORT** to DirectAdmin unless you know you must set it  
3. Paste / confirm environment variables (same as `.env`, or load from `.env` if your host supports it).
4. In SSH (or Terminal inside the app directory):

```bash
cd /path/to/application/root

# Prefer pnpm if available
npm install -g pnpm
pnpm install --prod

# Fallback:
# npm install --omit=dev
```

5. Click **Restart** on the Node.js application.

---

## Step 7 — Verify

```bash
curl -sS https://YOUR-DOMAIN.com/api/health
```

Expect something like: API healthy + MySQL connected.

Then open:

- `https://YOUR-DOMAIN.com/` — login / dashboard  
- `https://YOUR-DOMAIN.com/tools-trainings` — Tools & Trainings  
- Deep links (`/lab-notebook`, `/protocols`, …) must not 404 (SPA fallback).

---

## Updating an existing deploy

1. Build a new zip locally: `pnpm run pack:directadmin`
2. On the server, back up `.env` and the current `dist/` folder
3. Extract the new zip over the application root (keep `.env`)
4. Run any **new** `database/migrations/mysql_*.sql` files
5. `pnpm install --prod`
6. Restart the Node.js app in DirectAdmin

---

## Alternative: static files in `public_html` + Node API only

Use only if the host forces SPA files into `public_html`.

1. Set `SERVE_FRONTEND=false` on the Node app.
2. Copy `dist/client/*` into `public_html/`.
3. Copy `deploy/directadmin/htaccess.apache-static-spa` → `public_html/.htaccess` and set the proxy port to the Node app port.
4. Build with `VITE_API_URL=https://YOUR-DOMAIN.com/api`.

Needs Apache `mod_rewrite` + `mod_proxy` (or LiteSpeed equivalents).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank page / API calls to wrong host | Rebuild with correct `VITE_API_URL`, re-upload `dist/client` |
| CORS errors | `FRONTEND_URL` must match the exact browser origin (`https://…`) |
| JWT / boot failure | Set strong `JWT_SECRET` and `ENCRYPTION_KEY`; remove placeholders |
| DB connection failed | Check MySQL user, host (`localhost`), password; test in phpMyAdmin |
| 502 / app won’t start | Check Node error log; confirm `app.js` exists; re-run `pnpm install --prod` |
| Rate limit / 429 | Production rate limits apply; localhost skip is local-only |
| SPA route 404 | Ensure `SERVE_FRONTEND=true` and `dist/client/index.html` exists |

---

## Local commands reference

```bash
pnpm run build:directadmin   # production build (VITE_API_URL defaults to /api)
pnpm run pack:directadmin    # build + zip for upload
pnpm run start:prod          # smoke-test production entry locally
```
