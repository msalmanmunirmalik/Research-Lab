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
| **Research education** | `/tools-trainings` | lab training routes |
| **Researcher wellbeing** | `/wellbeing` (MVP check-ins) | `/api/wellbeing` — private to user only |

### Ownership (decision owners)

| Area | Canonical choice | Owner focus |
|---|---|---|
| **Projects** | Lab Workspace `/lab-workspace?section=projects` (`research_projects`). `/project-management` redirects there. | Lab platform |
| **Analysis** | `/data-analysis` calls `/api/advanced-stats/*` (Python) with local fallback; `/data-analytics` redirects | Science record / analyze |
| **Citations** | Shared paper library (`/writing-studio/tools/library` + `/api/research`). `/evidence-references` redirects to library. Evidence packs are `/data-results` (Records → Evidence), not citations. | Writing |
| **Wellbeing** | New pillar; no PI surveillance; ship behind flag after trust work | Product + privacy |

---

## 3. Information architecture (signed-in nav)

Nav labels (implemented in `components/SideNav.tsx`):

1. **Dashboard**  
2. **Records** — Notebook; Protocols; Data & Results; Experiments  
3. **Lab workspace** — Workspace; Trainings; Wellbeing  
4. **Intelligence** — Data analysis; Literature; Writing studio; Research tools; Databank; Grants & funding  
5. **Network** — Networking; Marketplace  

Negative results, Events, and Help forum stay on the Dashboard (not in primary nav).  
Account: Settings (sidebar footer), Profile / Notifications (header).

### Redirect / retire rules

| Route | Decision |
|---|---|
| `/conference-news` | Redirect → `/events-opportunities` (empty feed; Events is source of truth) |
| `/scientist-passport`, `/my-portfolio` | Already → `/profile` |
| Standalone AI agent pages | Already → Writing Studio |
| `/project-management` | Redirect → `/lab-workspace?section=projects` |
| `/data-analytics` | Redirect → `/data-analysis` |
| `/evidence-references` | Redirect → Writing Studio library |
| `/pi-review-dashboard` | Keep routed; not primary nav until folded into Workspace |
| `/current-trends` | Routed; optional Network link later if retention justifies |

---

## 4. Phased roadmap

### Phase 0 — Naming and story (now)

- [x] Alignment plan document  
- [x] UI brand pass (RILOS wordmark / mark)  
- [x] SideNav restructure to seven pillars  
- [x] Conference News → Events  
- [x] Lab Floors removed (product decision; education via Trainings)  
- [x] Pitch logo asset (`public/rilos-logo.png`) + favicon + BrandMark wordmark mode  
- [x] Dashboard quick actions follow evidence chain  
- [ ] Package/repo rename (deferred)

### Phase 1 — Product map complete

- [x] Ensure every deck pillar is reachable without a direct URL (incl. Wellbeing)  
- [x] Dashboard shortcuts follow evidence chain  
- [x] Forward handoffs: experiment → notebook → evidence → Writing Studio (`utils/evidenceChain.ts`)  
- [ ] Network hub polish; hide unfinished surfaces  

### Phase 4 note — Wellbeing MVP shipped early

Private voluntary check-ins at `/wellbeing` (`researcher_wellbeing_checkins`). Not clinical; not lab-shared. Expand later with workload reflection from calendar/experiments.

### Phase 2 — Security, reliability, workflow audit (0–3 months)

Priority before net-new features (matches pitch):

1. [x] AuthZ / RBAC / IDOR on notebook, protocols, experiments, evidence  
   - Policy: `server/policies/labAccess.ts` (`canReadLifecycleRecord`, `canWriteLifecycleRecord` / `assertCanWriteLifecycleRecord`)  
   - Integration matrix: `tests/integration/idorLifecycle.test.ts`  
   - JWT invalidate on logout / password change: `tokens_invalid_before` + `server/utils/tokenRevocation.ts`  
2. [x] Smoke QA on beachhead path (idea → publication)  
   - Manual: `docs/RILOS_WORKFLOW_QA_CHECKLIST.md`  
   - API: `pnpm run smoke:beachhead` (`scripts/rilos-beachhead-smoke.mjs`)  
3. [x] Kill duplicates — redirects + Evidence label; deleted orphan pages (`ProjectManagementPage`, `StatisticalAnalysisToolsPage`, `EvidenceReferencesPage`, `SimpleReferenceSystemPage`, `UnifiedReferenceSystem`). Analysis UI wired to `/api/advanced-stats` with local fallback. DB `projects` vs `research_projects` deferred.  
4. [x] Ops hygiene baseline (README, `docs/LOCAL_DEV.md`, MySQL env notes, DirectAdmin pack scripts)  
5. [x] AI trust baseline: platform quota vs user key (`server/services/platformAiAccess.ts`); scholarly source licensing remains ongoing  

**Pilot metrics:** activation, workflow completion, time-to-first experiment record, 2–4 week retention — not signups alone.

### Phase 3 — Connected lifecycle (4–6 months)

- [x] Default create flows along the evidence chain  
  - Dashboard Evidence quick action + “Load sample chain”  
  - Evidence pack create shows provenance links by default  
- [x] Provenance badges on packs (+ Writing Studio evidence attachment)  
  - `components/ProvenanceBadge.tsx` on Evidence cards  
  - Writing Studio keeps `ws_evidence_source` after `?notice=evidence`  
  - Per-claim manuscript badges remain a follow-up  
- [x] Pilot onboarding pack — `POST /api/onboarding/demo-chain` (sample lab if needed + linked protocol → experiment → notebook → evidence)  
- [x] Lab Floors removed from product (nav, routes, API, content)  

### Phase 4 — Researcher wellbeing

Voluntary, private, not clinical, not surveillance.

**MVP personal:** optional check-ins, support links, educational tie-ins to Trainings.  
**MVP workflow:** deadline/experiment load visibility; optional personal wellbeing plan.  
**Non-goals:** manager mental-health dashboards; mandatory check-ins; diagnostic claims.

### Phase 5 — Commercial packaging (7–12 months)

Pricing hypotheses for interviews (not willingness-to-pay facts):

| Tier | Hypothesis |
|---|---|
| Free individual | Notebook, limited protocols/evidence, Trainings, limited AI |
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
| Research education | Tools & Trainings |
| Research intelligence | Grants + literature library + Ask AI |
| Evidence pack | Research evidence / data-results entry |

---

## 8. Related docs

- `docs/LOCAL_DEV.md` — ports and MySQL  
- `DRM_MODERNIZATION_MASTER_PLAN.md` — engineering modernization (treat as RILOS backlog)  
- `DRM_SECURITY_MODERNIZATION_PLAN.md`  
- `DRM_INCREMENTAL_IMPLEMENTATION_ROADMAP.md`  
