# RILOS — Research Intelligence & Operating System

Product name for the application in this repository. The npm package id remains `digital-research-manager` until a dedicated rename sprint.

**Product / investor alignment:** see [`docs/RILOS_ALIGNMENT_PLAN.md`](docs/RILOS_ALIGNMENT_PLAN.md).  
**Local development:** see [`docs/LOCAL_DEV.md`](docs/LOCAL_DEV.md).

## What it is

RILOS connects research intelligence, laboratory operations, scientific records, analysis & writing, the research network, and research education — with researcher wellbeing planned as a privacy-first pillar.

Core evidence chain (product milestone):

`Idea → Protocol → Experiment → Notebook → Evidence → Analysis → Publication`

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, Tailwind |
| API | Node.js, Express, TypeScript, JWT |
| Database | MySQL |
| Stats (optional) | Python FastAPI (`stats_service`, port 5003) |
| Package manager | **pnpm** |

## Quick start

```bash
pnpm install
cp env.example .env   # set MYSQL_* and JWT_SECRET
pnpm run db:migrate
pnpm run fix-ports
pnpm run dev:app      # Vite :5173 + API :5002
```

Full stack including stats: `pnpm run dev`.

Health: `curl http://127.0.0.1:5002/api/health`

## Scripts (common)

| Script | Purpose |
|---|---|
| `pnpm run dev:app` | Frontend + API |
| `pnpm run build` | Production build |
| `pnpm run test` | Jest |
| `pnpm run test:playwright` | Playwright e2e |
| `pnpm run pack:directadmin` | DirectAdmin deploy package |

## Project structure

```
researchlab/
├── components/     # UI (incl. BrandMark, SideNav)
├── pages/          # Route pages
├── server/         # Express API
├── database/       # MySQL config + migrations
├── docs/           # LOCAL_DEV, RILOS_ALIGNMENT_PLAN, …
├── content/        # Lab Floors scenarios, etc.
└── App.tsx         # Routes + shell
```

## License

MIT (see repository license file if present).
