# RILOS evidence-chain QA checklist

Manual smoke path for pilots and pre-demo checks. Do not claim end-to-end interoperability until these pass on a clean account.

**Chain:** Idea → Protocol → Experiment → Notebook → Evidence → Analysis → Publication

| Step | Action | Expected | Pass |
|---|---|---|---|
| 1 | Register / sign in | Lands on `/dashboard` as RILOS | ☐ |
| 2 | Nav: Intelligence → Grants | `/grants-fundings` loads | ☐ |
| 3 | Nav: Intelligence → Literature | Writing Studio library tool | ☐ |
| 4 | Nav: Lab → Lab workspace | Tasks / projects / resources | ☐ |
| 5 | Nav: Lab → Experiments | Create experiment (optional protocol link) | ☐ |
| 6 | Nav: Records → Protocols | Create or open protocol | ☐ |
| 7 | Nav: Records → Notebook | Create entry; optional link to experiment | ☐ |
| 8 | Nav: Records → Evidence | Create pack; note provenance fields | ☐ |
| 9 | Nav: Analyze & write → Analysis | `/data-analysis` loads | ☐ |
| 10 | Nav: Analyze & write → Writing studio | Desk → new doc → section edit | ☐ |
| 10b | Evidence pack → Continue in Writing Studio | Studio shows evidence notice | ☐ |
| 11 | Nav: Network → Events | Conferences / exchanges list | ☐ |
| 12 | `/conference-news` | Redirects to Events | ☐ |
| 13 | Nav: Learn → Lab Floors | Floors hub + roleplay; progress syncs after migrate | ☐ |
| 13b | Complete a floor, refresh / other browser | Completion still present (account sync) | ☐ |
| 14 | Nav: Learn → Trainings | Catalog loads | ☐ |
| 14b | Experiment detail → Log in notebook | Prefills create form with experiment/protocol ids | ☐ |
| 14c | Notebook entry → Create evidence pack | Prefills pack links | ☐ |
| 15 | Ask AI (floating) | Context label matches current page | ☐ |
| 16 | Brand | Landing / login / sidebar show **RILOS** (not DRM) | ☐ |
| 17 | Nav: Wellbeing | Private check-in saves; only visible to self | ☐ |

**Known gaps (do not fail pilots on these alone):**

- Researcher wellbeing pillar not shipped  
- Lab Floors progress still in `localStorage`  
- `/project-management` and `/pi-review-dashboard` not in primary nav  
- Dual stats stacks (browser page vs Python service)  

See `docs/RILOS_ALIGNMENT_PLAN.md` for roadmap.
