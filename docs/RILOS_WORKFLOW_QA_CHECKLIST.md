# RILOS evidence-chain QA checklist

Manual smoke path for pilots and pre-demo checks. Do not claim end-to-end interoperability until these pass on a clean account.

**Chain:** Idea → Protocol → Experiment → Notebook → Evidence → Analysis → Publication

| Step | Action | Expected | Pass |
|---|---|---|---|
| 1 | Register / sign in | Lands on `/dashboard` as RILOS | ☐ |
| 1b | Dashboard → Load sample chain | Creates linked demo protocol→…→evidence; opens Data & Results | ☐ |
| 2 | Nav: Records → Notebook / Protocols / Data & Results / Experiments | Each loads | ☐ |
| 3 | Nav: Lab workspace → Workspace | Tasks / projects / resources | ☐ |
| 4 | Nav: Lab workspace → Trainings | Catalog loads | ☐ |
| 5 | Nav: Lab workspace → Wellbeing | Private check-in saves; only visible to self | ☐ |
| 6 | Nav: Intelligence → Data analysis / Literature / Writing studio / Research tools / Databank / Grants | Each loads | ☐ |
| 7 | Nav: Network → Networking / Marketplace | Each loads | ☐ |
| 8 | Dashboard still surfaces Events / Help / Negative results | Cards or links work | ☐ |
| 8b | `/project-management` | Lands on Lab Workspace → Projects | ☐ |
| 8c | `/data-analytics` | Redirects to `/data-analysis` | ☐ |
| 8d | `/evidence-references` | Redirects to Writing Studio library | ☐ |
| 9 | Evidence pack → Continue in Writing Studio | Studio shows evidence notice | ☐ |
| 10 | Experiment detail → Log in notebook | Prefills create form with experiment/protocol ids | ☐ |
| 11 | Notebook entry → Create evidence pack | Prefills pack links | ☐ |
| 12 | Ask AI (floating) | Context label matches current page | ☐ |
| 13 | Brand | Landing / login / sidebar show **RILOS** (not DRM) | ☐ |

**API smoke (optional, server on `:5002`):**

```bash
pnpm run smoke:beachhead
SMOKE_EMAIL=… SMOKE_PASSWORD=… SMOKE_LAB_ID=… pnpm run smoke:beachhead
```

**Known gaps (do not fail pilots on these alone):**

- Wellbeing MVP is personal check-ins only (not clinical; expand later)  
- `/project-management` and `/pi-review-dashboard` not in primary nav  
- Analysis uses `/api/advanced-stats` when the Python service is up; otherwise local fallback  
- Legacy DB `projects` table vs `research_projects` deferred  

See `docs/RILOS_ALIGNMENT_PLAN.md` for roadmap.
