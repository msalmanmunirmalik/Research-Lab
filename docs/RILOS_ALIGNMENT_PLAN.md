# RILOS Alignment Plan

**Product name:** RILOS (Research Intelligence & Operating System)  
**Codebase:** `digital-research-manager` (package id retained until a deliberate rename sprint)  
**Pitch reference:** RILOS Investor Pitch Deck (October 2026)  
**Last updated:** 2026-10-13

This document is the working bridge between the investor narrative and the running application. Engineering detail for security/database work may still live in `DRM_*.md` audits; treat those as RILOS implementation backlogs under the pillars below.

---

## 1. Positioning

| | Pitch / brand | Codebase today |
|---|---|---|
| Name | **RILOS** | Historically “Digital Research Manager” / DRM |
| Tagline | Research Intelligence & Operating System | Lab OS language (updating in UI) |
| Thesis | Continuity: knowledge → execution → output → people | Broad surface; chain partly built |
| Traction honesty | Foundation built; pilots and paid conversion ahead | Matches reality — do not invent metrics |

**Beachhead:** biomedical and multidisciplinary academic labs with ~3–20 researchers.

**Evidence chain (product milestone, not a verified claim yet):**

`IDEA → PROTOCOL → EXPERIMENT → NOTEBOOK → EVIDENCE → ANALYSIS → PUBLICATION`

Supported across both layers by Ask AI, provenance, team collaboration, and (planned) researcher wellbeing.

---

## 2. Seven product pillars → routes → APIs

| Pillar | Primary UI routes | Key APIs / services |
|---|---|---|
| **Research intelligence** | `/grants-fundings`, Writing Studio tools (`/writing-studio/tools/library`, generate), Ask AI copilot | `/api/grants`, `/api/research`, `/api/writing`, `/api/recommendations`, AI providers |
| **Lab operations** | `/lab-workspace`, `/experiment-tracker` | `/api/lab-workspace`, `/api/experiment-tracker`, inventory/instruments in `server/index.ts` |
| **Scientific records** | `/protocols`, `/lab-notebook`, `/data-results` | `/api/protocols*`, `/api/lab-notebooks`, evidence/results routes |
| **Analysis & writing** | `/data-analysis`, `/writing-studio`, `/research-tools` | `/api/advanced-stats`, `/api/writing`, `/api/writing` collab |
| **Research network** | `/collaboration-networking`, `/research-databank`, `/marketplace`, `/negative-results`, `/events-opportunities`, `/help-forum`, `/current-trends` | networking/*, databank, marketplace, negative-results, research-events, help-forum, community-news |
| **Research education** | `/lab-floors`, `/tools-trainings` | `/api/lab-floors`, lab training routes |
| **Researcher wellbeing** | `/wellbeing` (MVP check-ins) | `/api/wellbeing` — private to user only |

### Ownership (decision owners)

| Area | Canonical choice | Owner focus |
|---|---|---|
| **Projects** | Lab Workspace projects are day-to-day; fold or clearly separate `/project-management` later | Lab platform |
| **Analysis** | One Analysis entry (`/data-analysis`); prefer Python `/api/advanced-stats` over a second client-only stack | Science record / analyze |
| **Citations** | Shared paper library (`/api/research`) is spine; writing citations dual-write until migrated | Writing |
| **Wellbeing** | New pillar; no PI surveillance; ship behind flag after trust work | Product + privacy |

---

## 3. Information architecture (signed-in nav)

Nav labels map to pillars (implemented in `components/SideNav.tsx`):

1. **Home** — Dashboard  
2. **Intelligence** — Grants & funding; Literature (Studio library tool)  
3. **Lab** — Lab workspace; Experiments  
4. **Records** — Protocols; Notebook; Evidence  
5. **Analyze & write** — Analysis; Writing studio; Research tools  
6. **Network** — Networking; Data bank; Marketplace; Negative results; Events; Help forum  
7. **Learn** — Lab Floors; Trainings  

Account: Settings (sidebar footer), Profile / Notifications (header).

### Redirect / retire rules

| Route | Decision |
|---|---|
| `/conference-news` | Redirect → `/events-opportunities` (empty feed; Events is source of truth) |
| `/scientist-passport`, `/my-portfolio` | Already → `/profile` |
| Standalone AI agent pages | Already → Writing Studio |
| `/project-management`, `/pi-review-dashboard` | Keep routed; not primary nav until folded into Workspace |
| `/current-trends` | Routed; optional Network link later if retention justifies |

---

## 4. Phased roadmap

### Phase 0 — Naming and story (now)

- [x] Alignment plan document  
- [x] UI brand pass (RILOS wordmark / mark)  
- [x] SideNav restructure to seven pillars  
- [x] Re-route Lab Floors; Conference News → Events  
- [x] Pitch logo asset (`public/rilos-logo.png`) + favicon + BrandMark wordmark mode  
- [x] Lab Floors progress persisted to MySQL (`lab_floors_progress`) with local cache  
- [x] Dashboard quick actions follow evidence chain  
- [ ] Package/repo rename (deferred)

### Phase 1 — Product map complete

- [x] Ensure every deck pillar is reachable without a direct URL (incl. Wellbeing)  
- [x] Dashboard shortcuts follow evidence chain  
- [x] Forward handoffs: experiment → notebook → evidence → Writing Studio (`utils/evidenceChain.ts`)  
- [x] Remount `/api/lab-floors` (progress + roleplay) after accidental retirement  
- [ ] Network hub polish; hide unfinished surfaces  

### Phase 4 note — Wellbeing MVP shipped early

Private voluntary check-ins at `/wellbeing` (`researcher_wellbeing_checkins`). Not clinical; not lab-shared. Expand later with workload reflection from calendar/experiments.

### Phase 2 — Security, reliability, workflow audit (0–3 months)

Priority before net-new features (matches pitch):

1. AuthZ / RBAC / IDOR audit on notebook, protocols, evidence, workspace  
2. Smoke QA on beachhead path (idea → publication)  
3. Kill duplicates (projects, stats, citation spine)  
4. Ops hygiene (README, MySQL env, DirectAdmin pilots)  
5. AI trust: platform quota vs user key; licensed scholarly sources only  

**Pilot metrics:** activation, workflow completion, time-to-first experiment record, 2–4 week retention — not signups alone.

### Phase 3 — Connected lifecycle (4–6 months)

- Default create flows along the evidence chain  
- Provenance badges on packs and manuscript claims  
- Persist Lab Floors / roleplay progress on account (not only `localStorage`)  
- Pilot onboarding pack (sample lab + demo chain)  

### Phase 4 — Researcher wellbeing

Voluntary, private, not clinical, not surveillance.

**MVP personal:** optional check-ins, support links, educational tie-ins to Lab Floors.  
**MVP workflow:** deadline/experiment load visibility; optional personal wellbeing plan.  
**Non-goals:** manager mental-health dashboards; mandatory check-ins; diagnostic claims.

### Phase 5 — Commercial packaging (7–12 months)

Pricing hypotheses for interviews (not willingness-to-pay facts):

| Tier | Hypothesis |
|---|---|
| Free individual | Notebook, limited protocols/evidence, Lab Floors, limited AI |
| Researcher €9.99/mo | Writing Studio, grants, library, Ask AI quota |
| Lab Starter €99/mo | Workspace, inventory/instruments, team messaging, shared protocols |
| Lab Pro €249/mo | Data Bank org, marketplace workspaces, PI review, higher AI |
| Institution | Custom (~€10k/yr modelling); SSO/admin later |

### Phase 6 — Institutional readiness (13–24 months)

SSO, audit exports, department rollouts — after paid lab proof.

---

## 5. Pilot brief (GTM)

1. Recruit **5–10** biomedical/academic lab pilots  
2. Validate activation, retention, workflow completion, time saved  
3. Convert to paid lab subscriptions + referrals  
4. Expand to departments / institutions / commercial R&D  

Initial priority: real users completing real experiments — not top-of-funnel signups alone.

---

## 6. What not to do

- Expand Marketplace into payments before the evidence chain works  
- Revive standalone full-page AI agents  
- Market “fully connected OS” before pilot verification  
- Implement wellbeing as PI-visible monitoring  
- Parallelize brand rewrite + architecture rewrite + wellbeing with no QA  

---

## 7. Glossary (RILOS ↔ legacy DRM)

| RILOS term | Legacy / code name |
|---|---|
| RILOS | Digital Research Manager, DRM |
| Lab operations | Lab workspace |
| Scientific records | Protocols + notebook + research evidence |
| Analysis & writing | Data analytics + Writing Studio |
| Research education | Lab Floors + Tools & Trainings |
| Research intelligence | Grants + literature library + Ask AI |
| Evidence pack | Research evidence / data-results entry |

---

## 8. Related docs

- `docs/LOCAL_DEV.md` — ports and MySQL  
- `DRM_MODERNIZATION_MASTER_PLAN.md` — engineering modernization (treat as RILOS backlog)  
- `DRM_SECURITY_MODERNIZATION_PLAN.md`  
- `DRM_INCREMENTAL_IMPLEMENTATION_ROADMAP.md`  
