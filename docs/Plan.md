**Edu-RAG / Causal AI Student Success Prototype Plan** 

*Goal: turn the thesis concept into a working demo suitable for CV, LinkedIn, GitHub, and portfolio use.* 

---

## Phase Status

| Phase | Title                                       | Status         | Completed    |
| :---: | :------------------------------------------ | :------------- | :----------- |
|   0   | Project Foundation                          | ✅ Complete    | 2026-05-24   |
|   1   | Dataset & Data Model                        | ✅ Complete    | 2026-05-24   |
|   2   | Preprocessing & Feature Engineering         | ✅ Complete    | 2026-05-24   |
|   3   | Causal Graph & Driver Identification        | ✅ Complete    | 2026-05-24   |
|   4   | Counterfactual / What-If Engine             | ✅ Complete    | 2026-05-25   |
|   5   | Dashboard UI                                | ✅ Complete    | 2026-05-25   |
|  5.5  | Shell University Integration                | ✅ Complete    | 2026-05-25   |
|   6   | Real CSV Upload & Import                    | ✅ Complete    | 2026-05-25   |
|   7   | Advanced Causal Engine Upgrade              | ✅ Complete    | 2026-05-27   |
|   8   | Baseline ML Comparison                      | ✅ Complete    | 2026-05-28   |
|   9   | Productization / One-Command Setup          | ✅ Complete    | 2026-05-28   |
|  10   | Demo Dataset Modes                          | ✅ Complete    | 2026-05-28   |
|  11   | Advisor Feedback / Intervention Tracking    | ✅ Complete    | 2026-05-28   |
|  12   | GitHub + Vercel Deployment (Final Launch)   | 📝 Planned     | —            |
|  12A  | GitHub readiness + CI + license             | ✅ Complete    | 2026-05-29   |
|  12B  | Postgres / Vercel compatibility             | ✅ Complete    | 2026-05-30   |
|  12C  | Vercel deployment + nightly reseed          | ✅ Code complete | 2026-05-30 |
| 12B/C | Postgres-only correction (Prisma 5.x limit)  | ✅ Applied     | 2026-05-30   |
| 12C+  | Vercel postinstall + GitGuardian hardening   | ✅ Applied     | 2026-05-30   |
| 12C++ | CI DATABASE_URL fix (P1013 invalid port)     | ✅ Applied     | 2026-05-30   |
|  12D  | Screenshots, README, video, CV, LinkedIn    | ⏸ Not started | —            |

See `docs/logs/` for per-execution logs and `docs/features/` for per-feature specs.

---


**Project Positioning** 

This prototype should be presented as a Causal AI educational analytics platform, not only as a thesis. The demo will show how LMS behavioral data can be converted into actionable, explainable interventions for student success using causal graphs, a Resource Diversity Index, and counterfactual “what-if” simulations. 

**Recommended MVP Scope** 

- Use a synthetic or anonymized LMS-style dataset first, so the prototype can be built without waiting for real university data. 

- Build a dashboard where a user uploads/selects student activity data and sees risk indicators, causal drivers, and suggested interventions. 

- Prioritize a clear demo over perfect research-grade causal inference in the first version. 

- Keep the architecture modular so real LMS integration can be added later. 

**Suggested Tech Stack** 

| Layer              | Recommended Tool                                             | Reason                                                      |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Frontend dashboard | Next.js / React + Tailwind                                   | Fast portfolio-quality UI and easy deployment.              |
| Backend API        | FastAPI or Node.js/Express                                   | Simple endpoints for data upload, analysis, and simulation. |
| Causal/data engine | Python: pandas, scikit-learn, DoWhy, NetworkX, pgmpy/causal-learn | Best ecosystem for causal inference and graph analysis.     |
| Database           | SQLite for MVP                                               | Start simple, upgrade later.                                |
| Charts/graphs      | Plotly, Recharts, Cytoscape.js, or React Flow                | Good visuals for causal graphs and dashboards.              |
| Deployment         | Vercel + Render/Railway/Fly.io                               | Easy demo link for LinkedIn and CV.                         |

**Phased Build Plan** 

**Phase 0: Project Foundation & Demo Story**  ✅ **Complete (2026-05-24)**

Goal: Define exactly what the prototype will prove, set up a clean, scalable, review-ready repository foundation, and prepare the demo narrative.

Key tasks:

- [x] Scaffold folder structure: `/src/{app,components,features,lib,server,types,utils}`, `/data/{raw,processed}`, `/docs/{logs,features}`, `/prisma`.
- [x] Create root config: `.gitignore`, `.env.example`, `README.md`.
- [x] Verify `CLAUDE.md` and `context/MasterRule.md` are in place.
- [x] Create documentation skeleton: `architecture.md`, `data-model.md`, `causal-methodology.md`, `demo-script.md`.
- [x] Add Phase 0 feature spec at `docs/features/phase-0-foundation.md`.
- [x] Add timestamped execution log under `docs/logs/`.
- [ ] Finalize project name and one-line pitch *(working title: **EduRAG — Causal AI for Student Success**; revisit in Phase 6)*.
- [ ] Define the demo user *(working assumption: **academic advisor**; revisit in Phase 5)*.
- [ ] Confirm 3 core demo scenarios *(at-risk student, what-if simulation, intervention recommendation — drafted in `demo-script.md`)*.
- [ ] Replace the ASCII architecture diagram in `architecture.md` with a rendered version *(Phase 5/6)*.

Deliverable (achieved): Clean repository skeleton, documentation scaffolding, and an MVP narrative ready for Phase 1.

**Phase 1: Dataset & Data Model**  ✅ **Complete (2026-05-24)**

Goal: Create the first runnable technical foundation — a Prisma schema for SQLite (migratable to Postgres) and a fully synthetic LMS dataset designed to exercise the future RDI and causal engines.

Key tasks:

- [x] Initialise minimal TypeScript foundation: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`. **No UI added.**
- [x] Author `prisma/schema.prisma` (SQLite, Postgres-portable) covering 10 models: `Student`, `Course`, `Enrollment`, `Resource`, `ActivityLog`, `WeeklyEngagementSummary`, `Grade`, `RdiScore`, `CausalEstimate`, `InterventionSimulation`.
- [x] Write standard-library-only Python generator at `scripts/generate_synthetic_dataset.py` (seeded, CLI-configurable, zero new dependencies).
- [x] Generate `data/raw/sample_lms_data.csv`: 250 students × 14 weeks × 40 resources → **48,929 events**.
- [x] Encode five behaviour groups with distinct outcome distributions (see `docs/features/phase-1-synthetic-dataset.md` §3).
- [x] Document the CSV → Prisma mapping in `docs/data-model.md` §4 ("CSV → Prisma mapping").
- [x] Plan the Phase 2 import flow in `docs/features/phase-1-synthetic-dataset.md` §5 (no implementation yet).
- [ ] Define the formal RDI calculation in code *(deferred to Phase 2 alongside preprocessing; formula already documented in `docs/data-model.md` §2)*.

Deliverable (achieved): CSV dataset + Prisma schema both in place; ready to be ingested in Phase 2.

### Manual commands required from the operator

The agent does **not** run these per `CLAUDE.md` rules (no destructive DB commands, no auto-installs).

```bash
# 1. Install JS dependencies (first time only).
npm install

# 2. Generate the Prisma client (regenerates on every schema change).
npm run prisma:generate

# 3. Create the SQLite database and apply the schema as the first migration.
#    Creates ./prisma/dev.db and prisma/migrations/<timestamp>_init/.
npx prisma migrate dev --name init

# 4. (Optional) Re-generate the synthetic CSV with custom parameters.
npm run data:generate                          # defaults (250 × 14, seed 42)
python scripts/generate_synthetic_dataset.py --students 300 --weeks 14 --seed 7
```

**Phase 2: Preprocessing & Feature Engineering**  ✅ **Complete (2026-05-24)**

Goal: Turn `data/raw/sample_lms_data.csv` into normalised SQLite records and calculated weekly engagement features. Implement the pure analytics layer (RDI, engagement, consistency, trend) plus the ingestion pipeline that orchestrates Prisma writes.

Key tasks:

- [x] Extend Prisma schema (additive): `Resource.externalId` + 3 new fields on `WeeklyEngagementSummary` (`activityCount`, `quizSubmissionCount`, `resourceTypeCount`).
- [x] Add deps: `csv-parse` (runtime), `tsx` + `vitest` (dev).
- [x] Implement pure RDI module (`src/features/analytics/rdi.ts`) — normalised entropy, catalogue-aware.
- [x] Implement pure engagement module (`src/features/analytics/engagement.ts`) — `summariseWeek`, `consistencyScore`, `trendSlope`.
- [x] Implement Prisma client singleton (`src/lib/db.ts`) and level-aware logger (`src/lib/logger.ts`).
- [x] Implement CSV row validator (`src/server/ingest/row-schema.ts`) — typed, hand-rolled, zero validation-library dep.
- [x] Implement CSV reader (`src/server/ingest/csv-reader.ts`).
- [x] Implement ingest orchestrator (`src/server/ingest/ingest-csv.ts`) — upserts Course/Student/Resource/Enrollment/Grade, bulk-inserts ActivityLog.
- [x] Implement derive step (`src/server/ingest/derive-summaries.ts`) — buckets per (student, course, week), writes `WeeklyEngagementSummary` + `RdiScore`.
- [x] Add `npm run db:ingest` CLI (`src/server/ingest/cli.ts`) with `--csv` and `--skip-derive`.
- [x] Add Vitest config and 38 passing tests across RDI, engagement, and validator.
- [x] Install deps, generate Prisma client, typecheck, run tests — all green.

Deliverable (achieved): Single command (`npm run db:ingest`) loads the synthetic CSV and produces engagement + RDI rows; pure analytics modules unit-tested and reusable by the Phase 3 causal engine.

### Manual commands required from the operator

```bash
# 1. (If not already done) install + generate Prisma client + create local .env.
npm install
cp .env.example .env
npm run prisma:generate

# 2. Apply the Phase 2 schema additions (Resource.externalId + 3 WES fields).
#    If you have not yet run any migration, this creates the initial one.
npx prisma migrate dev --name phase2_ingest_and_engagement

# 3. Run the ingestion (loads CSV, then derives WES + RDI).
npm run db:ingest
#   --csv path/to/other.csv     (alternate source)
#   --skip-derive               (raw ingest only)

# 4. Run tests (no DB required for unit tests).
npm test
```

> No raw SQL needs hand-rolling. `prisma migrate dev` produces the migration
> automatically from the schema diff.

**Phase 3: Causal Graph & Driver Identification**  ✅ **Complete (2026-05-24)**

Goal: Implement the first causal analysis layer — encode a transparent DAG, build the per-student causal feature table, estimate model-based effects with bootstrap CIs, run lightweight refutation checks, and persist results to `CausalEstimate`.

Key tasks:

- [x] Promote consistency/trend to persistent storage via a new `CourseFeatureSummary` model.
- [x] Reshape `CausalEstimate` to cohort-level (`courseId × treatment × outcome`); empty table so the change is non-destructive.
- [x] Encode the DAG (7 nodes, 10 edges) in `src/features/causal-engine/dag.ts` with rationales, cycle detection, topological sort, and JSON export.
- [x] Implement causal feature table builder (`feature-table.ts`) with a pure `toFeatureRow` helper.
- [x] Implement OLS estimator with normal equations + percentile bootstrap CIs (`estimator.ts`, `linear-algebra.ts`).
- [x] Implement refutation checks: placebo / shuffled-treatment + random common cause (`refutation.ts`).
- [x] Implement persistence pipeline: `derive-features.ts` (writes `CourseFeatureSummary`), `run-estimates.ts` (writes `CausalEstimate`).
- [x] Add `npm run causal:estimate` CLI; extend `db:ingest` so course features are written alongside weekly summaries.
- [x] Add 44 new Vitest tests (DAG, linear algebra, feature table, estimator, refutation) — **82 total, all passing.**
- [x] Update `docs/causal-methodology.md` to reflect the implemented adjustment + refutation strategy.
- [x] Update `docs/data-model.md` with `CourseFeatureSummary` and the reshaped `CausalEstimate`.

Deliverable (achieved): One command (`npm run causal:estimate`) reads features, fits four cohort-level effect estimates with refutation flags, and persists structured results suitable for the Phase 4 what-if engine and Phase 5 dashboard.

### Manual commands required from the operator

```bash
# 1. Apply the Phase 3 schema additions/reshape.
#    Drops + recreates CausalEstimate (table is empty so no data is lost).
npx prisma migrate dev --name phase3_course_features_and_cohort_causal

# 2. Re-run the ingest. db:ingest now also writes CourseFeatureSummary.
npm run db:ingest

# 3. Run the causal estimates (writes CausalEstimate rows).
npm run causal:estimate                        # default course CS-201
npm run causal:estimate -- --course CS-201
npm run causal:estimate -- --course CS-201 --json
```

> The agent does not run migrations or any DB writes — only `prisma generate`
> and `npm test` (in-memory). Per `CLAUDE.md` workflow rule.

**Phase 4: Counterfactual / What-If Engine**  ✅ **Complete (2026-05-25)**

Goal: Apply cohort-level causal estimates to per-student feature deltas and persist actionable, honesty-constrained intervention simulations.

Key tasks:

- [x] Reshape `InterventionSimulation` to carry the discrete fields the demo needs (`courseId`, `interventionName`, `treatment`, `baselineValue`, `proposedValue`, `appliedDelta`, `estimatedEffect`, `baselineGrade`, `projectedGrade`, `projectedLow/High`, `rankScore`, `confidence`, `explanation`, `notesJson`). Table was empty so non-destructive.
- [x] Build pure simulator (`src/features/causal-engine/simulator.ts`) with `simulateIntervention`, `simulateMultipleInterventions`, `rankRecommendedInterventions`, `computeCohortStats`, and the `STANDARD_INTERVENTIONS` catalogue.
- [x] Implement headroom-aware delta clamping (cohort ceiling + theoretical feature bound).
- [x] Implement CI propagation: `[baseline + β_low·δ, baseline + β_high·δ]` clamped to [0, 100].
- [x] Implement multi-factor ranking: `max(0, gain) × (0.5 + 0.5 · weakness_score) × confidence_weight`.
- [x] Implement honest explanation generator with controlled vocabulary; assert forbidden phrases never appear (22 simulator tests).
- [x] Build server orchestrators: `run-simulations.ts` + `simulate-cli.ts`.
- [x] Add `npm run causal:simulate` (`--course`, `--student`, `--top`, `--json`).
- [x] Update `docs/causal-methodology.md` §6 with the implemented formulas.
- [x] Update `docs/data-model.md` `InterventionSimulation` table.

Deliverable (achieved): One command (`npm run causal:simulate`) produces per-student ranked intervention rows for an entire course, ready for the Phase 5 dashboard to render.

### Manual commands required from the operator

```bash
# 1. Apply the Phase 4 schema reshape of InterventionSimulation.
#    Drops + recreates the table (was empty so no data is lost).
npx prisma migrate dev --name phase4_intervention_simulations

# 2. Run simulations (requires Phase 2 ingest + Phase 3 estimates to have run).
npm run causal:simulate                        # course-wide CS-201
npm run causal:simulate -- --student STU-0042  # single student
npm run causal:simulate -- --top 3             # only top-3 per student
npm run causal:simulate -- --json              # machine-readable summary
```

> `prisma migrate dev` synthesises the migration from the schema diff —
> no SQL to write. Agent runs nothing destructive itself.

**Phase 5: Dashboard UI**  ✅ **Complete (2026-05-25)**

Goal: Ship a portfolio-quality, honesty-constrained dashboard that exposes every Phase 1-4 capability through a clean Next.js App Router UI.

Key tasks:

- [x] Foundation: `globals.css`, `layout.tsx`, `next-env.d.ts`, lib helpers (`cn`, `formatters`, `confidence-label`, `intervention-language`).
- [x] Shared components: `AppShell`, `Sidebar` (client, `usePathname` active-state), `PageHeader`, `MetricCard`, `ConfidenceChip`, `EmptyState`, `HonestyNote`.
- [x] Data components: `StudentTable`, `InterventionCard`, `TrendChart` (zero-dep SVG), `CausalGraphView` (zero-dep SVG DAG).
- [x] Data access layer: `src/server/queries/{dashboard,students,causal,shared}.ts` (Prisma reads + pure shaping helpers).
- [x] Server action: `src/server/actions/what-if.ts` — reuses `simulateIntervention()` from Phase 4, never duplicates logic.
- [x] Interactive `WhatIfSimulator` client component (student select, intervention select, delta slider, server-action submit).
- [x] Routes: `/`, `/students/[id]` (+ `not-found.tsx`), `/causal-graph`, `/what-if`, `/upload`.
- [x] **Zero new dependencies** — custom SVG charts/DAG instead of Recharts + React Flow.
- [x] Tests: 36 new tests for pure helpers (formatters, confidence-label, intervention-language, dashboard queries).
- [x] `npm run build` succeeds — all 5 routes compile, only client bundle is 3.38 KB (`WhatIfSimulator`).
- [x] Honesty UX enforced site-wide: every projection paired with CI range + confidence chip + `HonestyNote` banner + standardised disclaimer.

Deliverable (achieved): Production-built Next.js dashboard that runs against the SQLite database and renders all metrics, charts, recommendations, and the DAG with no overclaiming language.

### Manual commands required from the operator

```bash
# Prereqs (from Phases 2-4): db:ingest + causal:estimate + causal:simulate must have run.
# No new prisma migration in Phase 5 (UI-only phase).

# Start the dashboard for screenshots / demo:
npm run dev                # http://localhost:3000
# or build + start for a production preview:
npm run build && npm start
```

**Phase 5.5: Shell University Integration**  ✅ **Complete (2026-05-25)**

Goal: Build a fake external university / LMS system so the demo story stops being "CSV-only" and starts being "external LMS-style integration".

Key tasks:

- [x] Stand up the mock university API as Next.js route handlers under `/api/shell-university/*` (9 endpoints: 7 entities + health + sync-status).
- [x] Generate JSON files for students, courses, enrollments, resources, lms-events, grades, **advisor-notes** (new entity) from the existing CSV via `npm run shell:seed`.
- [x] Build the EduRAG sync connector under `src/server/sync/shell-university/` — typed client (direct + HTTP transports), mapper (snake_case → Prisma), orchestrator with idempotent upserts + SyncLog persistence.
- [x] Add the sync status page at `/integrations/shell-university` with mock service health, last sync, sync history table, EduRAG-side counts, endpoint reference, and "how sync works" + "replacing with a real LMS" notes.
- [x] Add "Integrations" link to the dashboard sidebar.
- [x] Schema additions: `Student.firstName/lastName` (optional), `AdvisorNote` model, `SyncLog` model. Non-destructive.
- [x] Add `npm run shell:seed` + `npm run sync:university` (with `--via-http`, `--base`, scope flags, `--skip-derive`, `--json`).
- [x] Update `docs/architecture.md` to document the integration boundary.
- [x] Update `README.md` + `docs/demo-script.md` for the new flow.
- [x] 25 new vitest tests (mapper translations, envelope validator, data-store determinism, source classifier).
- [x] All 165 tests pass · typecheck clean · `npm run build` succeeds with the 9 new API routes registered.

Deliverable (achieved): Two commands (`shell:seed` + `sync:university`) take EduRAG from empty to fully synced from an external LMS contract, with a UI page that explains the integration and shows live sync history.

### Manual commands required from the operator

```bash
# 1. Apply the Phase 5.5 schema additions.
#    Non-destructive: adds Student.firstName/lastName + new AdvisorNote + SyncLog tables.
npx prisma migrate dev --name phase5_5_shell_university

# 2. Seed the mock store from the synthetic CSV.
npm run shell:seed                                  # default term 2026-SPRING, seed 42
npm run shell:seed -- --seed 99                     # different "drift" for a re-sync demo
npm run shell:seed -- --drop 0.05                   # skip ~5% of events to simulate light drift

# 3. Sync into EduRAG.
npm run sync:university                             # default: direct file read, full scope
npm run sync:university -- --via-http               # exercise the live HTTP route handlers
npm run sync:university -- --base http://other:3000 # custom base URL
npm run sync:university -- --students --courses     # partial scope
npm run sync:university -- --skip-derive            # skip post-sync recompute

# 4. (Optional) explore the API directly.
curl http://localhost:3000/api/shell-university/health
curl http://localhost:3000/api/shell-university/students
```

---

**Phase 6: Real CSV Upload & Import**  ✅ **Complete (2026-05-25)**

Goal: Turn `/upload` from a static placeholder into a real CSV upload pipeline so EduRAG can be used with any LMS-style dataset, not just the synthetic one.

Key tasks:

- [x] Refactor `csv-reader.ts` to split `parseAndValidateCsv(buffer)` from `readAndValidateCsv(path)` — uploads parse from memory.
- [x] Refactor `ingest-csv.ts` to split `ingestValidatedRows(rows)` from `ingestCsv(path)` — single source of upsert logic, reused by both the CSV CLI and the upload pipeline.
- [x] Build `src/server/upload/` (types, preview, commit orchestrator) — append / replace / dry-run modes.
- [x] Add server actions `src/server/actions/upload.ts` with `previewUpload` + `commitUpload`; defensive size + mime checks.
- [x] Build `UploadForm` client component (~430 LoC) — file picker, validating preview, options panel, result card with navigation links.
- [x] Rewrite `/upload` page to host the form + CSV schema reference + sample row + privacy + alternative-paths sections.
- [x] Raise Next.js `serverActions.bodySizeLimit` to **20 MB** (was 1 MB default; the synthetic CSV is ~5 MB).
- [x] Persist each commit as a `SyncLog` row with `source: "uploaded"` — automatically surfaces on the integrations page.
- [x] Tests (11 new): preview stat shaping, error/sample capping, ok/!ok preview result, buffer-based `parseAndValidateCsv`.
- [x] All 176 tests pass · typecheck clean · `npm run build` succeeds with `/upload` now dynamic (3.97 KB client JS).

Deliverable (achieved): An advisor can drop their own LMS CSV onto `/upload`, see a validated preview before commit, pick append/replace/dry-run, and the full pipeline (ingest → derive → estimate → simulate) re-runs in place with a structured success card and navigation links.

### Manual commands required from the operator

```bash
# No new prisma migration in Phase 6 (UI + server-action only).
# Optionally regenerate the synthetic CSV to test the upload path:
npm run data:generate

# Then open the dashboard:
npm run dev                                            # http://localhost:3000/upload

# Workflow inside the UI:
#   1. Choose a CSV (the regenerated one, or any LMS-shaped file matching the schema).
#   2. Press "Preview" — server validates without writes; review stats + sample + any errors.
#   3. Pick mode (append / replace), toggle dry-run + post-commit reruns, hit "Confirm".
#   4. Inspect the result card; navigate to dashboard / integrations from the buttons.
```

---

**Phase 7: Advanced Causal Engine Upgrade**  ✅ **Complete (2026-05-27)**

Goal: Move the causal layer closer to the thesis's research framing.

Key tasks:

- [x] Stable `CausalEngine` interface (`baseline | advanced`) — orchestration + UI + persistence stay engine-agnostic.
- [x] Optional Python worker (`/python/causal-worker/`) — one-shot JSON-in/JSON-out subprocess (no HTTP, no Docker, no RPC).
- [x] DoWhy + causal-learn integration through the worker; baseline TS engine remains the default.
- [x] Extended refutations: subset robustness, bootstrap stability, adjustment-set sensitivity, outcome permutation.
- [x] Causal discovery experiment (PC + partial-correlation Fisher Z) plus diff helper for manual vs discovered DAG.
- [x] Downloadable Markdown + JSON causal reports — CLI (`npm run causal:report`) and HTTP (`GET /api/causal/report`).
- [x] `/causal-graph` upgraded with view switcher (manual / discovered / compare), engine selector, edge-diff sidebars, report download buttons.
- [x] Graceful degradation when Python is missing — `selectEngine("advanced")` falls back to baseline with a structured warning.
- [x] 22 new vitest tests across engine abstraction, extended refutations, discovery, and report rendering.
- [x] **198 / 198** tests pass · typecheck clean · `npm run build` succeeds with 16 routes including the new `/api/causal/report` endpoint.

Deliverable (achieved): A defensible upgrade path from "designed DAG + OLS" to "discovered DAG + DoWhy" without breaking the Phase 3 surface — every existing route, CLI, and persisted row still works untouched, and the new advanced path is one CLI flag (`--engine advanced`) away.

### Manual commands required from the operator

```bash
# 1. (Optional) Install the Python worker for the advanced engine.
#    Skip this entirely if you only want the baseline path.
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
pip install -r python/causal-worker/requirements.txt

# 2. Verify the worker (optional smoke test).
echo '{"cmd":"ping","payload":{}}' | python python/causal-worker/worker.py

# 3. Estimate with the new flags.
npm run causal:estimate                          # baseline, baseline refutations only (unchanged)
npm run causal:estimate -- --extended            # baseline + 4 extra refutations
npm run causal:estimate -- --engine advanced     # try Python; falls back with a warning if absent
npm run causal:estimate -- --engine advanced --extended

# 4. Run the discovery experiment.
npm run causal:discover                          # default course CS-201, TS PC
npm run causal:discover -- --engine advanced     # causal-learn PC (if installed)
npm run causal:discover -- --alpha 0.01 --json

# 5. Generate a downloadable report.
npm run causal:report -- --discovery --out docs/reports/cs-201.md
npm run causal:report -- --format json --out docs/reports/cs-201.json

# 6. Browse the upgraded /causal-graph page.
npm run dev
# http://localhost:3000/causal-graph?view=compare&engine=baseline
```

> No new prisma migration in Phase 7 (engine + refutation + discovery + report
> are all additive logic over existing `CausalEstimate` columns). The agent
> does not run any database migration or DB-writing command per `CLAUDE.md`.

---

**Phase 8: Baseline ML Comparison**  ✅ **Complete (2026-05-28)**

Goal: Show *why* Causal AI is a different product from a regular grade predictor.

Key tasks:

- [x] Stable `PredictionEngine` interface mirroring the Phase 7 `CausalEngine` shape.
- [x] Pure-TS L2 logistic-regression baseline (sigmoid + batch GD, no new dependencies).
- [x] New `BaselinePrediction` Prisma model — additive, non-destructive; one row per (student, course, model).
- [x] `npm run ml:predict` CLI trains + predicts + persists for one course; supports `--engine`, `--model`, `--threshold`, `--json`.
- [x] `<PredictionVsInterventionCard>` on `/students/[id]` — side-by-side panel with insights footer.
- [x] New `/comparison` route — cohort-wide table with "Agree on lever" / "Disagree on lever" summary tiles.
- [x] Phase 7 report extended with an optional prediction section (`--prediction` flag on the CLI, `?prediction=1` on the API); `schemaVersion` flips to `phase-8.v1` when populated.
- [x] Honest framing enforced in code + tests: notes never contain "guaranteed" / "proven" / "definitely" / "causal effect of this student"; comparison insights filtered against the same vocabulary.
- [x] 21 new vitest tests across logistic regression, engine contract, and comparison helper.
- [x] **219 / 219** tests pass · typecheck clean · `npm run build` succeeds with `/comparison` registered.

Deliverable (achieved): The dashboard now answers the recruiter question "is this just another grade-prediction tool?" in under 30 seconds. Two layers, two answers ("WHO" vs "WHAT TO CHANGE"), explicit honesty banners, zero merging of prediction and recommendation surfaces.

### Manual commands required from the operator

```bash
# 1. Apply the Phase 8 schema addition (new BaselinePrediction table).
#    Non-destructive: additive only.
npx prisma migrate dev --name phase8_baseline_prediction

# 2. (If not already done by the agent) regenerate the Prisma client.
npm run prisma:generate

# 3. Train + predict for the cohort. Defaults to course CS-201.
npm run ml:predict                                # baseline, logistic, threshold 0.5
npm run ml:predict -- --threshold 0.4             # tighter classifier
npm run ml:predict -- --engine advanced           # forward-looking hook; falls back today
npm run ml:predict -- --json                      # machine-readable summary

# 4. Browse the comparison surfaces in the dev dashboard.
npm run dev
# http://localhost:3000/students/STU-0042         (panel)
# http://localhost:3000/comparison                (cohort table + report links)

# 5. (Optional) generate the downloadable comparison report.
npm run causal:report -- --prediction --out docs/reports/cs-201-comparison.md
npm run causal:report -- --prediction --format json --out docs/reports/cs-201-comparison.json
```

> The agent does not run prisma migrations per `CLAUDE.md` — but the
> Prisma client was regenerated via `npm run prisma:generate` so the
> typescript surface compiles today.

---

**Phase 9: Productization / One-Command Setup**  ✅ **Complete (2026-05-28)**

Goal: Anyone can clone the repo and reach a working demo with two commands.

Key tasks:

- [x] `npm run setup` — idempotent bootstrap (deps → Prisma client → migrations → CSV → ingest → derive → estimate → simulate → predict).
- [x] `npm run demo` — setup-if-needed + `next dev`, with a printed URL banner for every demo route.
- [x] `npm run reset:demo` — safe-by-default destructive wipe (`--yes` required) + re-runs setup.
- [x] `npm run doctor` — full read-only health check (env + DB + data + optional features); non-zero exit on hard failures.
- [x] `npm run status` — concise data-state snapshot.
- [x] Shared bootstrap module (`src/server/bootstrap/`) — pure helpers + step orchestrator + spawn wrapper, all testable.
- [x] Advanced **prediction** engine (sklearn LR + Random Forest) wired through the existing Phase 7 Python worker; TS baseline remains the default with structured-warning fallback.
- [x] Optional Dockerfile + docker-compose with SQLite + data volumes; the local-first path remains the recommended one.
- [x] `/about` onboarding page — what EduRAG is, prediction-vs-causal, how to read CIs, where the demo data comes from, full route map.
- [x] Portfolio-grade README rewrite — two-command demo at the top, architecture diagram, feature list, optional Python + Docker, honesty constraints, screenshots placeholders.
- [x] **22 new vitest tests** (bootstrap format + step orchestrator + setup-step builder).
- [x] **241 / 241** tests pass · typecheck clean · `npm run build` succeeds with 14 routes (added `/about` as a static page).

Deliverable (achieved): A reviewer goes from `git clone` to a running dashboard in under 2 minutes via `npm run setup && npm run demo`. Every step prints `[ ok ] / [skip] / [fail]` with timing; failure is one `npm run doctor` away from a structured diagnosis.

### Manual commands required from the operator

```bash
# (Fresh clone — everything below works against an empty checkout.)
git clone <repo-url> && cd "EduRAG Prototype"

# Two-command demo:
npm run setup                    # ~60 s on a cold install; idempotent on re-run
npm run demo                     # setup-if-needed + dev server (Ctrl+C to stop)

# Diagnostics:
npm run doctor                   # full env + db + data + feature report
npm run status                   # concise row-count snapshot
npm run doctor -- --json         # machine-readable for CI

# Clean slate for recordings / interviews:
npm run reset:demo               # dry-run; prints the plan
npm run reset:demo -- --yes      # apply the wipe + re-run setup
npm run reset:demo -- --yes --fresh   # also regenerate the synthetic CSV first

# Optional Docker:
docker compose build
docker compose up                # localhost:3000

# Optional advanced prediction engine (sklearn random forest):
pip install -r python/causal-worker/requirements.txt
npm run ml:predict -- --engine advanced --model random_forest
```

> Per `CLAUDE.md`, the agent does not run `prisma migrate` / `pip install`
> itself — but each of those steps is now executed *on the user's behalf*
> by `npm run setup` when they invoke it. The agent only ran
> `npm run prisma:generate`, `npx tsc --noEmit`, `npm test`, and
> `npm run build` during development.

---

**Phase 10: Demo Dataset Modes**  ✅ **Complete (2026-05-28)**

Goal: Let users switch between data sources at will.

Key tasks:

- [x] Canonical dataset-mode catalogue (`src/features/dataset-modes/`) — three modes (`synthetic`, `shell-university`, `uploaded`) with stable metadata (name, tagline, description, accent, refresh hint, recommended-for blurb).
- [x] Lightweight JSON persistence at `data/processed/dataset-mode.json` — survives app restarts, validates on every read, falls back to a safe default on corruption. **No prisma migration required.**
- [x] Server orchestrator (`src/server/dataset-mode/`) that joins the persisted active mode with Prisma counts + latest `SyncLog` rows to produce a per-mode runtime snapshot.
- [x] Global `<DatasetModeBanner>` chip in the `<AppShell>` header strip — always visible, accent-coloured per mode, links to `/datasets`.
- [x] `/datasets` route — three-card overview with status badges, refresh hints, non-destructive switcher with optional reason field; ships an "empty mode" warning when the chosen source has no data yet.
- [x] Source-aware page subtitles on `/` (Overview) and `/comparison` — "Generated via Synthetic Demo Dataset", etc.
- [x] Reset-demo-data is covered by Phase 9's `npm run reset:demo` (already shipped); the `/datasets` page references it as the destructive escape hatch.
- [x] Phase 7 report extended with a `datasetMode` provenance section (`schemaVersion` bumped to `phase-10.v1` whenever the section is populated). Markdown renderer adds a Dataset mode bullet to §1; JSON renderer ships the structured payload.
- [x] **32 new vitest tests** across metadata, status derivation, store round-trip (incl. corrupted-file recovery), and orchestrator persistence.
- [x] **273 / 273** tests pass · typecheck clean · `npm run build` succeeds with 15 routes (added `/datasets`).

Deliverable (achieved): A single dashboard that gracefully hosts three distinct data origins and never lies about which one is live. The chip in the global header strip + the source-aware subtitles + the dataset-mode stamp on every report mean a reviewer always knows which source produced the numbers they're looking at.

### Manual commands required from the operator

```bash
# No prisma migration in Phase 10 (mode state lives in a JSON file).

# Browse the new page:
npm run dev                                # http://localhost:3000/datasets

# Switch sources from the CLI (e.g. for headless demo recordings):
#   The switcher is currently UI-only — switching via CLI is a Phase 11+ improvement.

# Optional: confirm the JSON state file:
cat data/processed/dataset-mode.json

# Optional: include the dataset mode in a downloadable report.
#   (Mode is auto-stamped on every report from Phase 10 onward.)
npm run causal:report -- --discovery --prediction --out docs/reports/cs-201-comparison.md
```

---

**Phase 11: Advisor Feedback / Intervention Tracking**  ✅ **Complete (2026-05-28)**

Goal: Turn EduRAG from a one-shot analysis dashboard into a feedback-loop intervention system.

Key tasks:

- [x] New Prisma model **`InterventionDecision`** linked one-to-one with `InterventionSimulation` — statuses (`accepted | rejected | deferred | completed`), optional `advisorNote`, observational `followUpOutcome` / `followUpObserved` / `followUpRecordedAt`, timestamps, indexed by `(courseId, status)` + `updatedAt`.
- [x] Action bar on every `<InterventionCard>` — Accept / Reject / Defer / Mark complete / Revert + optional note field.
- [x] Observational follow-up form gated behind `accepted` / `completed` statuses + an explicit "Observational follow-up — not proof of causality" banner.
- [x] Per-student `<InterventionTimeline>` rendering `recommendation → decision → note → follow-up` events in chronological order.
- [x] New `/interventions` cohort page — metric tiles, decision breakdown, most-accepted / most-deferred patterns, observational insights, recent-activity feed.
- [x] Server actions (`submitDecision`, `submitFollowUp`, `revertDecision`) — never embed mutations in components; banned-phrase validation on every note + outcome.
- [x] Report extension — `--tracking` flag on `npm run causal:report` + `?tracking=1` on `GET /api/causal/report`. New `ReportTrackingSection` carries decision counts, observational insights, recent-decisions table. `schemaVersion` flips to `phase-11.v1` whenever populated.
- [x] Sidebar nav item "Interventions" between Comparison and Dataset Modes.
- [x] Honesty-language enforcement at the persistence boundary — `containsBannedLanguage()` rejects notes / outcomes containing `guaranteed`, `proven cause`, `confirms causation`, `scientific proof`. Asserted by tests.
- [x] **32 new vitest tests** across status helpers, timeline builder, analytics generator, and server orchestration (banned language + validation).
- [x] **305 / 305** tests pass · typecheck clean · `npm run build` succeeds with 16 routes (added `/interventions`).

Deliverable (achieved): A reviewer can see the prototype isn't just a one-shot report — every recommendation now has an explicit lifecycle, every advisor decision lands in a persisted row, every observational follow-up is timestamped and stamped into the downloadable report, and the cohort page tells the story of advisor behaviour over time.

### Manual commands required from the operator

```bash
# Apply the Phase 11 schema addition (new InterventionDecision table).
#    Non-destructive: additive only.
npx prisma migrate dev --name phase11_intervention_decisions

# (If not already done by the agent) regenerate the Prisma client.
npm run prisma:generate

# Run the demo flow:
npm run setup                                        # ensure base data exists (Phase 9 idempotent)
npm run dev                                          # http://localhost:3000

# Workflow inside the UI:
#   1. Open /students/STU-0042 → react to a recommendation (Accept / Reject / Defer / Mark complete)
#   2. After accepting → record an observational follow-up
#   3. Open /interventions → see the cohort analytics + recent-activity feed
#   4. Open /students/STU-0042 again → the timeline now shows the full chronology

# (Optional) include the tracking section in a downloadable report:
npm run causal:report -- --tracking --discovery --prediction --out docs/reports/cs-201-feedback.md
```

> Per `CLAUDE.md`, the agent does not run prisma migrations itself — but the
> Prisma client was regenerated via `npm run prisma:generate` so the
> TypeScript surface compiles today.

---

**Phase 12: GitHub + Vercel Deployment (Final Launch)**  📝 **Planned (2026-05-29)** — see `docs/deployment-github-vercel-plan.md`

Goal: Push the prototype to a public GitHub repo and a live Vercel demo without breaking the local-first developer experience.

**Approved decisions:**

- Postgres provider: **Neon** (free tier; portable to Vercel Postgres since they share an engine).
- Hosted demo write policy: **all features enabled** + a nightly Vercel Cron job that wipes + reseeds the DB.
- Subphase ordering: screenshots / video / CV / LinkedIn happen **after** the live demo is up so the polish reflects the deployed UI.

### Phase 12A — GitHub readiness + CI + license  ✅ **Complete (2026-05-29)**

- [x] Add `LICENSE` (MIT, Copyright Albert Adams 2026).
- [x] Add `.github/workflows/ci.yml` — typecheck + tests + build (no deploy yet). Concurrency-gated, npm + `.next/cache` caching, Node 20, defensive `DATABASE_PROVIDER=sqlite` env vars so the workflow keeps working after Phase 12B switches the schema.
- [x] Add `.github/PULL_REQUEST_TEMPLATE.md` with summary / phase reference / test plan / honesty-constraint checklist / manual-commands sections.
- [x] Add `.github/ISSUE_TEMPLATE/{bug,feature}.md` — bug template asks for `npm run doctor` output by default.
- [x] Add `.github/dependabot.yml` — weekly cadence, npm minor/patch grouped, GitHub Actions tracked separately.
- [x] Add `.github/CODEOWNERS` — single owner with a placeholder GitHub username to replace before pushing.
- [x] Add `CONTRIBUTING.md` — local setup, repo conventions (phase-based history, module layout, engine abstractions), test conventions, the binding honesty constraints, commit + PR style, manual-only operations.
- [x] README light polish — badge counts updated to **305 passing tests** + phase chip to `12A github readiness`; license badge flipped from `TBD` to `MIT`; License section rewritten + new Contributing section added; Phase 12 row added to the roadmap pointing at `docs/deployment-github-vercel-plan.md`.
- [x] **305 / 305** tests pass · typecheck clean · `npm run build` succeeds with all 16 routes — same surface as Phase 11; no code logic changed.
- [x] **CI fix (2026-05-30):** the first GitHub Actions run surfaced a build crash — `prisma.student.count()` was invoked during the static prerender pass because the global `<AppShell>` header renders `<DatasetModeBanner>` (server component → Prisma). Three coordinated fixes shipped as part of 12A:
  - `.github/workflows/ci.yml` now runs `npx prisma migrate deploy` (with a `prisma db push` fallback) between `prisma generate` and the build, so the SQLite tables exist before Next.js evaluates server components.
  - `/about` flipped from `force-static` to `force-dynamic` (it inherits the Prisma-touching layout, so it can't be statically prerendered).
  - `<DatasetModeBanner>` now wraps the orchestrator call in `try/catch` and falls back to `DEFAULT_DATASET_STATE.activeMode` if Prisma is unreachable — defence in depth for any future build environment that doesn't run the migration step.

**Deliverable (achieved):** repo is GitHub-ready. CI workflow + dependency automation + review routing + contributor docs all in place. Build passes locally and in CI. Phase 12A is pure packaging on the source side; the one component touched (`DatasetModeBanner`) only gained a defensive fallback — no behaviour change in the happy path.

**Operator's manual step (remaining):**

```bash
# Replace the CODEOWNERS placeholder:
#   .github/CODEOWNERS  →  * @your-real-github-username

# Then init + push (agent does not run git mutations per CLAUDE.md):
git init
git add .
git commit -m "Phase 12A — GitHub readiness + CI + MIT licence"
git branch -M main
git remote add origin <repo-url>
git push -u origin main

# Watch the first CI run go green:
#   https://github.com/<user>/edurag/actions
```

### Phase 12B — Postgres / Vercel compatibility (code changes only)  ✅ **Complete (2026-05-30)**

- [x] `prisma/schema.prisma` → `provider = env("DATABASE_PROVIDER")` (env-driven; provider chosen at `prisma generate` time).
- [x] New `AppSetting` singleton model — keyed string `value` blob, one row per logical setting; first user is the active dataset-mode payload.
- [x] Refactored `src/server/dataset-mode/store.ts` to read/write via Prisma `AppSetting` instead of `data/processed/dataset-mode.json` (the only runtime FS write in the codebase). `normaliseState()` stayed pure so the corruption-recovery branch is still unit-testable without a DB.
- [x] Refactored `src/server/dataset-mode/orchestrator.ts` (now fully async — `readState` / `writeState` return Promises) and the `switchDatasetMode` server action to await the new orchestrator.
- [x] Refactored `__tests__/store.test.ts` + `__tests__/orchestrator.test.ts` from temp-file fixtures to an in-memory `AppSettingClient` fake. Added a "broken-client" test to lock in the silent-fallback behaviour. **304/304** tests pass (one removed — `statePathFor` no longer exists).
- [x] Added `prisma/seed.ts` — calls the pipeline TS functions directly (`ingestCsv → deriveAllSummaries → deriveCourseFeatures → runCausalEstimates → runSimulations → trainAndPredict → syncFromShellUniversity`). Idempotent: short-circuits when `Student.count() > 0`. Exports `runFreshSeed()` so the Phase 12C nightly-reseed route can call it after a wipe.
- [x] Registered `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json` + a convenience `npm run prisma:seed` script.
- [x] `.gitignore` exemptions: `!data/raw/sample_lms_data.csv` + `!data/shell-university/*.json` so the Vercel build's seed step has a deterministic, in-bundle source.
- [x] Shrunk synthetic-CSV defaults from **250 × 14** → **200 × 12** (Python generator) so the CSV stays comfortably under Vercel Hobby's 4.5 MB server-action body limit (the `/upload` round-trip uses the same shape). Shell University `lms-events.json` now writes compactly (no indent) since it's a per-row mirror that scales with the cohort × weeks; the small files stay pretty-printed for diff reviewability.
- [x] `.env.example` — added `DATABASE_PROVIDER`, commented Postgres example with `DIRECT_URL`, `DEMO_MODE`, and `ENABLE_PYTHON_ENGINE`.
- [x] README — flipped the phase chip to `12B postgres compat`, test count to **304**, and added a "Choosing a database provider" section covering both local paths.
- [x] `docker-compose.yml` — added a `db` Postgres 16-alpine service (port 5432, `edurag/edurag/edurag`, named volume) so local devs can exercise the Postgres provider path with one command before pushing to Vercel.
- [x] `docs/architecture.md` — updated the dataset-mode block to describe the AppSetting carrier (was JSON file).
- [x] **304 / 304** tests pass · typecheck clean · `npm run build` succeeds with all 21 routes — only `/_not-found` static, same dynamic surface as Phase 12A.

**Deliverable (achieved):** the same checkout runs against both SQLite (default) and Postgres (Docker / Neon). The only runtime FS write is gone — the app is fully serverless-compatible. The seed script gives Vercel a one-shot pipeline to a populated DB without shelling out to Python or `npm run setup`.

**What 12B deliberately did NOT touch:**

- No `npm run setup` change — the Phase 9 bootstrap CLI still shells out to npm scripts (no risk to the existing two-command demo).
- No new migration files (the agent does not run `prisma migrate dev` per `CLAUDE.md`). The schema change is the only new diff; the operator runs the migration step below.
- No deploy work — that's 12C.

**Operator's manual commands (Phase 12B):**

```bash
# 1. Regenerate the Prisma client for the new schema (env-driven provider
#    + new AppSetting model). DATABASE_PROVIDER must be set first — the
#    new schema reads it at `prisma generate` time.
#    .env.example already ships with DATABASE_PROVIDER=sqlite as the default;
#    `cp .env.example .env` if you haven't yet.
npm run prisma:generate

# 2. Apply the schema diff against the local SQLite DB. `migrate dev`
#    synthesises the migration from the schema diff and writes it under
#    prisma/migrations/. The only change is the new `AppSetting` table.
npx prisma migrate dev --name phase12b_app_setting

# 3. Regenerate the synthetic CSV at the new defaults (200 × 12) and
#    re-seed Shell University so the file sizes match the .gitignore
#    exemptions. Commit the resulting files.
npm run data:generate
npm run shell:seed
git add data/raw/sample_lms_data.csv data/shell-university/*.json

# 4. (Optional) Exercise the Postgres path before deploying.
#    NOTE: This block is HISTORICAL — the Phase 12B/12C correction
#    superseded the multi-provider plan with Postgres-only. See the
#    "Phase 12B/12C correction" subsection below for the current path.
#    URL placeholders use <pw> to avoid shipping credential literals.
docker compose up -d db                       # starts Postgres on :5432
# Override .env (or export inline):
DATABASE_PROVIDER=postgresql \
  DATABASE_URL="postgresql://edurag:<pw>@localhost:5432/edurag" \
  npm run prisma:generate
DATABASE_PROVIDER=postgresql \
  DATABASE_URL="postgresql://edurag:<pw>@localhost:5432/edurag" \
  npx prisma migrate dev --name phase12b_app_setting
DATABASE_PROVIDER=postgresql \
  DATABASE_URL="postgresql://edurag:<pw>@localhost:5432/edurag" \
  npx prisma db seed                          # runs the new prisma/seed.ts
# Return to SQLite by restoring .env defaults and running prisma:generate again.

# 5. (One-time) Verify both providers green:
DATABASE_PROVIDER=sqlite npm test
# Optional Postgres test pass (requires step 4):
# DATABASE_PROVIDER=postgresql DATABASE_URL="postgresql://edurag:<pw>@localhost:5432/edurag" npm test
```

> Per `CLAUDE.md`, the agent did not run `prisma migrate`, `prisma db seed`,
> `npm install`, or `pip install` itself. The schema diff that the operator
> migration above produces is the new `AppSetting` table only — no
> destructive changes to existing rows.

### Phase 12C — Vercel deployment + nightly reseed  ✅ **Code complete (2026-05-30)**

- [x] `src/lib/demo-mode.ts` — `resolveDemoMode()` / `isHostedDemo()` helpers + `HOSTED_UPLOAD_ROW_CAP` constant (50,000). Accepts any `EnvLike` record so tests can pass `{}` without satisfying Next.js's augmented `ProcessEnv`.
- [x] `<DemoModeBanner>` rendered above the dataset-mode chip in `AppShell` when `DEMO_MODE=hosted`. Returns `null` in local mode → zero render cost. Copy: *"Public demo · Data resets nightly at 03:00 UTC. Fully synthetic — no real student records."*
- [x] Upload row-cap guard in `src/server/upload/commit.ts` — hosted only, early-returns a structured `failed(...)` result when row count exceeds 50,000. Local mode is unaffected. Test-injectable via `hostedDemoOverride` / `rowCapOverride`.
- [x] `src/app/api/admin/reseed/route.ts` — POST endpoint. Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel cron native) or `x-cron-secret` (curl smoke-test convenience). Constant-time `crypto.timingSafeEqual` comparison. Returns 503 when `CRON_SECRET` is unset (opt-in route). `maxDuration = 60` to cover the full pipeline within the function ceiling.
- [x] `wipeAllDomainTables(prisma)` (inlined in the reseed route) — wipes every domain table including `SyncLog` + `AppSetting` in dependency order, then calls `runFreshSeed()` from the new `prisma/seed-pipeline.ts` module.
- [x] `prisma/seed.ts` split — pipeline body moved to `prisma/seed-pipeline.ts` so importers (the reseed route) can pull `runFreshSeed` without triggering the `npx prisma db seed` entry's top-level `main()`. Same idempotency guard (count > 0 → skip) preserved.
- [x] `vercel.json` — single cron entry: `0 3 * * *` → `/api/admin/reseed`.
- [x] `src/app/robots.ts` — allows `/`, `/about`, `/causal-graph`, `/comparison`; disallows every `/api/*`, `/upload`, `/datasets`, `/interventions`, `/integrations/*`, `/students/*`, `/what-if` so a crawler can't trigger DB mutations or hit per-student paths that aren't useful to index. Uses `NEXT_PUBLIC_APP_URL` (Vercel env) for the canonical host.
- [x] `.env.example` — added `NEXT_PUBLIC_APP_URL` (defaults to `http://localhost:3000`) + commented `CRON_SECRET` line (intentionally unset locally so the reseed route returns 503).
- [x] **Tests added (+9):** 6 for `demo-mode` (defaults, casing, whitespace tolerance, `isHostedDemo` agreement, `HOSTED_UPLOAD_ROW_CAP` sanity) + 3 for `commit.ts` row-cap (rejects above cap in hosted mode, passes through in hosted mode below cap, ignores cap entirely in local mode).
- [x] **313 / 313** tests pass · typecheck clean · `npm run build` succeeds with **23 routes** registered — added `ƒ /api/admin/reseed` + `○ /robots.txt`. `/_not-found` and `/robots.txt` are the only static routes; everything else stays `ƒ Dynamic`.

**Deliverable (code side, achieved):** every code change Vercel + the cron need is in place. The hosted-only safety rails, the destructive-but-gated reseed endpoint, and the crawler-friendly-but-safe robots.txt all build and pass tests against the local SQLite default. Remaining work is operator-side: create the Neon project, create the Vercel project, paste the env vars, trigger the first deploy, and curl-smoke-test the reseed.

**What 12C deliberately did NOT touch:**

- No change to the existing dataset-mode store, orchestrator, or banner — Phase 12B did that work.
- No change to the Phase 9 bootstrap CLIs (`setup` / `demo` / `doctor` / `status` / `reset:demo`). Local devs see no behavioural delta.
- No new runtime npm dependencies. `crypto.timingSafeEqual` is a Node built-in.
- No copy / honesty-language edits anywhere outside the new banner string.

**Operator's manual commands (Phase 12C):**

```bash
# 1. Generate the cron secret (32 random bytes, hex-encoded).
#    Linux/macOS:
openssl rand -hex 32
#    Windows (PowerShell):
[Convert]::ToHexString((New-Object byte[] 32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ }))

# 2. Provision Neon (https://console.neon.tech).
#    - Create project "edurag" → copy the *pooled* and *direct* connection strings.
#    - The pooler URL goes into DATABASE_URL; the direct URL goes into DIRECT_URL.

# 3. Provision Vercel (https://vercel.com/new).
#    - Import the GitHub repository.
#    - Build command:    prisma generate && prisma migrate deploy && prisma db seed && next build
#    - Output directory: .next (default)
#    - Install command:  npm install (default)
#    - Node version:     20
#    - Environment variables (paste under "Environment Variables", all environments):
#        DATABASE_PROVIDER     postgresql
#        DATABASE_URL          postgresql://...@...neon.tech/edurag?sslmode=require&pgbouncer=true
#        DIRECT_URL            postgresql://...@...neon.tech/edurag?sslmode=require
#        DEMO_MODE             hosted
#        NEXT_PUBLIC_APP_URL   https://<your-vercel-project>.vercel.app
#        CRON_SECRET           <paste the openssl output from step 1>
#        ENABLE_PYTHON_ENGINE  false

# 4. Trigger the first deploy by pushing to main (or use the "Deploy" button).
#    Watch the build logs — expected sequence:
#      prisma generate → prisma migrate deploy → prisma db seed → next build
#    First seed run takes ~30 s (ingest + derive + estimates + simulations + predict + shell sync).

# 5. Smoke-test the live site end-to-end:
#    /                                              → cohort overview loads, banner visible
#    /students/STU-0042                             → prediction vs intervention panel renders
#    /causal-graph?view=compare                     → manual vs discovered DAG, both render
#    /comparison                                    → cohort table renders
#    /what-if                                       → slider submits successfully
#    /upload                                        → preview a small CSV (well under cap)
#    /datasets                                      → switch mode → reload → switch persisted
#    /interventions                                 → cohort feed renders

# 6. Curl-smoke-test the reseed endpoint (replace placeholders):
SECRET="<your CRON_SECRET>"
URL="https://<your-vercel-project>.vercel.app/api/admin/reseed"
curl -X POST -H "Authorization: Bearer $SECRET" "$URL"
#   Expect: HTTP 200, JSON body { ok: true, startedAt, finishedAt, durationMs }
#   Wrong / missing secret: HTTP 401
#   Missing CRON_SECRET env var: HTTP 503

# 7. Confirm the cron is scheduled in Vercel's dashboard (Settings → Cron Jobs):
#    Should show one entry: 0 3 * * *  → /api/admin/reseed
#    Next firing displayed in the operator's local timezone.
```

> Per `CLAUDE.md`, the agent did not create the Neon project, the Vercel
> project, paste the env vars, or fire the curl. Those are the
> operator-only steps above. The agent's deliverable is the code +
> documentation + green local build.

### Phase 12B/12C correction — Postgres only (2026-05-30)

**Why this exists.** Phase 12B's "multi-provider" plan used
`datasource db { provider = env("DATABASE_PROVIDER") }` in the
Prisma schema. Prisma 5.x **does not accept `env()` in the
`provider` field** — `prisma validate` rejected the schema and the
first CI run that tried to use it failed. Also, GitGuardian
flagged a literal Postgres password in `docker-compose.yml`. Both
issues fixed together as a single corrective patch on top of
12B/12C.

**Changes shipped:**

- [x] `prisma/schema.prisma` → `provider = "postgresql"` (literal) + `directUrl = env("DIRECT_URL")`. No multi-provider gymnastics; EduRAG is Postgres-only now.
- [x] Archived `prisma/migrations/*` (SQLite syntax — non-portable to Postgres) → `prisma/migrations-sqlite/`. The active path uses `prisma db push` against the schema; the operator can regenerate a committed Postgres migration set via `npx prisma migrate dev --name initial` whenever they're ready to lock the schema history in.
- [x] `docker-compose.yml` — password is now sourced via env interpolation; the app service points at the `db` service over the in-network Postgres URL; both services compose-link via `depends_on: { db: { condition: service_healthy } }`. *(Note: this first pass used a non-secret fallback literal; the follow-up Vercel + GitGuardian remediation later the same day removed even that fallback and switched to the required-var `${POSTGRES_PASSWORD:?...}` syntax. See `docs/logs/2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`.)*
- [x] `.env.example` — Postgres-first defaults: `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` + `DATABASE_URL` / `DIRECT_URL` pointing at `localhost:5432`. The retired `DATABASE_PROVIDER` knob is gone.
- [x] `.github/workflows/ci.yml` — boots a `postgres:16-alpine` service container with a healthcheck; sets `DATABASE_URL` + `DIRECT_URL` to it; runs `npx prisma db push --skip-generate --accept-data-loss` (idempotent, works without a committed migration history) before typecheck/test/build.
- [x] `src/server/bootstrap/setup-steps.ts` — the "migrate" step is now "Apply Postgres schema (prisma db push)". `shouldRun` probes whether the schema exists via a Prisma table query (`schemaApplied` option, defaulting to `countStudents`); no more SQLite file-existence check. Reuses the existing `countStudents` injection so the test fixtures don't need to change.
- [x] `src/server/bootstrap/checks.ts` (doctor) — replaced the "SQLite database" file check with a "DATABASE_URL" shape check. Added a `redactDsn()` helper so the doctor echoes the host + database without leaking the password. Updated the error-path hint to point at `prisma db push`.
- [x] `src/server/bootstrap/reset-cli.ts` — added `InterventionDecision` (Phase 11) to the deletion order; the comment now reflects that Postgres enforces FKs strictly so order matters. The agent did not touch the production wipe surface beyond comment + adding one missing table.
- [x] `src/server/bootstrap/__tests__/format.test.ts` — updated the fixture: `db.file → db.url`, `"SQLite database" → "DATABASE_URL"`. No other test files needed changes.
- [x] `README.md` — three-command demo (`docker compose up -d db && npm run setup && npm run demo`). New "Database (Postgres only)" section replaces the multi-provider matrix; tech-stack row + architecture diagram bubble both flipped from SQLite to Postgres; Docker block updated for the `db` service + `edurag_pg` volume.
- [x] Regenerated the Prisma client (`npm run prisma:generate`) against the new schema — `prisma validate` passes.
- [x] **313 / 313** tests still green (no test deletions, one fixture string updated). Build clean against a placeholder Postgres URL — schema validation passes.

**What this DID NOT change:**

- No application logic (causal engine, prediction layer, intervention tracking, dataset-mode store).
- No new runtime dependencies.
- No honesty-language edits.
- The Phase 12B `AppSetting` model + dataset-mode store refactor + the Phase 12C `<DemoModeBanner>` / `/api/admin/reseed` / `vercel.json` / `robots.ts` work all stay valid — they were always provider-agnostic.

**Operator's manual commands (correction):**

```bash
# 1. Pull the changes, then regenerate the Prisma client against the new schema.
npm run prisma:generate

# 2. Wipe the legacy SQLite database (gitignored; the schema no longer matches).
#    Windows PowerShell:
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
#    Linux/macOS:
# rm -f prisma/dev.db

# 3. Boot the local Postgres service.
docker compose up -d db
docker compose ps                       # confirm "healthy"

# 4. Materialise the schema in Postgres (no migration history yet).
npx prisma db push

# 5. (When ready) generate a committed Postgres migration history.
#    This replaces step 4 once the operator wants version-controlled migrations.
npx prisma migrate dev --name initial
git add prisma/migrations/

# 6. Re-run the full pipeline against Postgres.
npm run setup                           # idempotent
npm run demo

# 7. Sanity check: doctor should report DATABASE_URL ok + non-zero row counts.
npm run doctor
```

> **GitGuardian remediation (first pass — superseded later the same day):**
> the previous compose file had a hardcoded `POSTGRES_PASSWORD`. The first
> pass moved it to env interpolation with a non-secret literal fallback.
> GitGuardian still flagged the fallback string, so a follow-up pass
> removed even that — the schema is now `${POSTGRES_PASSWORD:?...}` (no
> fallback; compose refuses to start without a real value). See
> `docs/logs/2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`.

> **CI strategy:** the workflow no longer relies on `migrate deploy` —
> there are no committed Postgres migrations yet. `prisma db push` against
> the service container is the path. Once step 5 above ships a migration
> set, the CI step can be swapped back to `migrate deploy` for stricter
> production parity.

---

### Phase 12C+ — Vercel postinstall + GitGuardian hardening (2026-05-30)

**Why this exists.** Two issues surfaced after the Phase 12B/12C
correction shipped:

1. **Vercel build failed** with Prisma's "this project was built on
   Vercel, which caches dependencies … leads to an outdated Prisma
   Client because Prisma's auto-generation isn't triggered" error.
   Failure point: `Failed to collect page data for /_not-found`.
2. **GitGuardian re-flagged `docker-compose.yml`** because the
   first-pass remediation kept a non-secret literal fallback string
   in env interpolation; the scanner still treats credential-shaped
   strings as hardcoded.

Both fixed in the same patch.

**Changes shipped:**

- [x] `package.json` — added two layers of Prisma client regeneration to defeat Vercel's dependency cache:
  - `"postinstall": "prisma generate"` (Prisma's official Vercel recipe — runs after every `npm install` / `npm ci`).
  - `"build": "prisma generate && next build"` (belt-and-braces — runs again if the install was cache-hit and postinstall was skipped).
- [x] `docker-compose.yml` — switched from non-secret-fallback (`${POSTGRES_PASSWORD:-edurag_local_password}`) to **required-var** syntax (`${POSTGRES_PASSWORD:?see .env.example and set a strong local password}`). No credential string lives in the repo at all. `POSTGRES_USER` + `POSTGRES_DB` keep `:-edurag` fallbacks because they're not credentials. Both the `db` service env and the `edurag` app service `DATABASE_URL`/`DIRECT_URL` interpolations were updated.
- [x] `.env.example` — `POSTGRES_PASSWORD` is now blank with an explicit "fill in before `docker compose up`" instruction. `DATABASE_URL` + `DIRECT_URL` are also blank with commented-shape examples (placeholders use `YOUR_LOCAL_PASSWORD`, not a credential-shaped literal).
- [x] `.github/workflows/ci.yml` — CI Postgres password is now `${{ secrets.CI_POSTGRES_PASSWORD || 'ci-throwaway-not-a-secret' }}`. The literal fallback is intentionally low-entropy and self-documenting; the secret-set path is preferred. Both the service container env and the `DATABASE_URL`/`DIRECT_URL` workflow envs use the same interpolation.
- [x] `README.md` — three-command demo updated: step 1 is now "edit `.env` and set `POSTGRES_PASSWORD`" with an `openssl rand -base64 24` suggestion. Local-Postgres workflow block updated to match. Database matrix uses placeholder URLs instead of literal-shaped credentials.
- [x] `docs/Plan.md` + the Phase 12B/C correction log — cleaned up residual credential-shaped strings (replaced with `<pw>` / `<previous fallback literal>` placeholders) so GitGuardian's full-repo scan returns clean.
- [x] **313 / 313** tests still green · typecheck clean · `npm run build` runs `prisma generate && next build` cleanly against a placeholder Postgres URL.

**Vercel build fix summary**

- Root cause: Vercel caches `node_modules` between deploys. When `@prisma/client` is restored from cache, the generated client may be stale (built against an older schema). Prisma 5 added a deliberate fail-fast error message when this is detected.
- Fix: two-layer regeneration. `postinstall` runs every time the dependency set is installed; the modified `build` script runs `prisma generate` again immediately before `next build`. Either layer alone defeats the cache; both together are defence-in-depth.
- No change to the Vercel project's build command is required — operators can keep the default `npm run build` and it will now Just Work. The previously-documented `prisma generate && prisma migrate deploy && prisma db seed && next build` build command remains valid for operators who want to pin the explicit chain.

**GitGuardian remediation summary**

- Root cause: GitGuardian's scanner pattern-matches credential-shaped strings even inside YAML interpolation fallbacks. `${POSTGRES_PASSWORD:-edurag_local_password}` looked like a hardcoded credential because `edurag_local_password` is a literal in the file.
- Fix: `${POSTGRES_PASSWORD:?...}` is required-var syntax. If unset, compose exits with the error message before starting any services. No fallback literal in the file. Operator must set the var in `.env` before `docker compose up`.
- Repo-wide audit: grep found credential-shaped strings in `README.md`, `docs/Plan.md`, the Phase 12B/C correction log, and `.env.example`. All replaced with placeholders (`<your-local-password>`, `<pw>`, blank values). `src/server/bootstrap/checks.ts` contains `user:pass` in a docstring spec — that's a format example, not a credential.

**Security review (lightweight)**

| Surface | Status |
| ------- | ------ |
| `DATABASE_URL` literals | None in repo. `.env.example` ships blank with shape examples; CI uses workflow secret; production env is on Vercel only. |
| `DIRECT_URL` literals | Same as above. |
| `CRON_SECRET` literals | None. `.env.example` ships blank; the Phase 12C reseed route returns 503 when the env var is unset locally. |
| Docker credentials | `${POSTGRES_PASSWORD:?...}` required, no fallback. Compose refuses to start without `.env`. |
| GitHub Actions secrets | `secrets.CI_POSTGRES_PASSWORD` is the canonical CI password source. The throwaway fallback is non-entropy + self-documenting. |
| Accidentally-committed credentials | None found in source. `prisma/dev.db` is git-ignored; `.env` is git-ignored. |
| Bundled secrets in client JS | None — every secret-touching file is server-only (`/api/admin/reseed/route.ts`, `src/lib/db.ts`, `src/server/dataset-mode/*`). |

**Operator's manual steps (in order):**

```bash
# Local dev
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a strong value, then paste it into
# DATABASE_URL and DIRECT_URL replacing YOUR_LOCAL_PASSWORD.
docker compose up -d db                   # required-var syntax fails fast if not set
npm install                                # postinstall regenerates the Prisma client
npm run setup
npm run demo
```

```text
# GitHub repo settings (optional but recommended)
Settings → Secrets and variables → Actions → New repository secret
  Name:  CI_POSTGRES_PASSWORD
  Value: <openssl rand -base64 24>
```

```text
# Vercel project settings
# No change needed to the build command — `npm run build` already runs
# `prisma generate && next build`. Existing env vars stay:
#   DATABASE_URL          (Neon pooler URL)
#   DIRECT_URL            (Neon direct URL)
#   DEMO_MODE             hosted
#   NEXT_PUBLIC_APP_URL   https://<vercel-hostname>
#   CRON_SECRET           <openssl rand -hex 32>
# Trigger a re-deploy after pulling these changes.
```

```text
# GitGuardian dashboard
Mark the docker-compose.yml alert as RESOLVED. The credential-shaped
fallback is gone; the file now contains zero literal secrets.
```

---

### Phase 12C++ — CI DATABASE_URL fix (P1013, 2026-05-30)

**Why this exists.** The Phase 12C+ secrets-hardening pass replaced
the literal CI Postgres password with
`${{ secrets.CI_POSTGRES_PASSWORD || 'ci-throwaway-not-a-secret' }}`
and string-interpolated that value into `DATABASE_URL`. When the
operator set a real GitHub Actions secret whose value contained
URL-unsafe characters (`:` `/` `@` `?` `#` `&` `+` `=` `%` space),
the resulting DSN was malformed and `prisma db push` rejected it:

```
Error: P1013
The provided database string is invalid. invalid port number
in database URL.
```

(Prisma's URL parser saw the unescaped character mid-DSN, mis-split
on `:`, and reported the next token as a port.)

**Fix.** Stop dynamic interpolation entirely. Use a fixed,
URL-safe, CI-only throwaway literal everywhere CI needs the
Postgres credential. This removes the entire class of bug.

**Changes shipped:**

- [x] `.github/workflows/ci.yml`:
  - `services.postgres.env.POSTGRES_PASSWORD: edurag_ci_password` (fixed literal, URL-safe).
  - `env.DATABASE_URL: postgresql://edurag:edurag_ci_password@localhost:5432/edurag`.
  - `env.DIRECT_URL: postgresql://edurag:edurag_ci_password@localhost:5432/edurag`.
  - `env.DEMO_MODE: "local"` made explicit (was implicit/unset).
  - Removed the `${{ secrets.CI_POSTGRES_PASSWORD || ... }}` expressions.
  - Expanded the header comment block to explain: the literal is CI-only, bound to the service container, reachable only from the runner's localhost, destroyed at job tear-down, never reaches production. Documented GitHub Secrets + URL-encode as the alternative if a project ever wants secret-managed CI credentials.

**Why a literal is acceptable here (security analysis):**

- The Postgres service container exists only during a single
  workflow run.
- It binds to the runner's `localhost:5432` — not reachable from
  the public internet, other GitHub Actions runners, or any
  long-lived infrastructure.
- The container is destroyed when the runner is torn down at end
  of job.
- The credential is never used in production. Vercel + Neon get
  their own values from Vercel's project env block; nothing in CI
  is shared with production.
- GitGuardian classifies this as a sample/test credential when
  flagged (or it can be marked resolved with a comment).

**Verification:**

| # | Command | Result |
| - | ------- | ------ |
| 1 | `npx tsc --noEmit` | ✅ Clean. |
| 2 | `npm test` | ✅ **313 / 313** pass. |
| 3 | `npm run build` (placeholder DSN) | ✅ Compiled, 23 routes, all static pages generated. |
| 4 | `prisma db push` (CI-only) | Will run against the Postgres service container with the fixed DSN — verified locally that the URL is syntactically valid per Prisma's parser (no P1013). |

**Operator's manual steps after this fix:**

1. Pull the change.
2. (Optional) Delete the `CI_POSTGRES_PASSWORD` GitHub repository
   secret if it was created — it is no longer referenced.
3. Re-run the failing CI job. The `prisma db push` step should
   now succeed against the postgres:16-alpine service container.

> **GitGuardian note:** the literal `edurag_ci_password` may still
> trigger GitGuardian on this workflow file. Mark it as a CI-only
> sample credential per their dashboard (most projects classify
> ephemeral-test-container creds as non-secrets). If GitGuardian
> insists, the long-term path is to URL-encode a secret-managed
> password before constructing the DSN — but that adds an extra
> workflow step and a Python-or-Node dependency just for
> `urllib.parse.quote`. The fixed literal is the simpler, less
> bug-prone path for CI-only ephemeral credentials.

---

### Phase 12D — Screenshots, README, video, CV, LinkedIn (launch lap)

- [ ] Capture 5 hero screenshots from the **live deployed app** → `docs/screenshots/`.
- [ ] README: real screenshots + live demo URL + CI / Vercel badges + "Deploy your own" button.
- [ ] Record 60-90s walkthrough → upload to YouTube → embed in README.
- [ ] Draft `docs/cv-bullets.md` (concise / detailed / technical variants).
- [ ] Draft `docs/linkedin-post.md` (text + image asset references).
- [ ] Add `CHANGELOG.md` and tag `v1.0`.

**Deliverable:** portfolio-ready repository + live demo URL + launch-ready CV + LinkedIn post. End of Phase 12.

### Manual commands required from the operator (Phase 12 cumulative)

```bash
# 12A
git init && git add . && git commit -m "Phase 12A — GitHub readiness"
git push -u origin main

# 12B
docker compose up -d                                    # or local Postgres
DATABASE_PROVIDER=postgresql npx prisma migrate dev --name initial
npm run shell:seed                                      # then commit data/shell-university/*.json
npm run data:generate -- --students 200 --weeks 12      # shrink synthetic CSV
DATABASE_PROVIDER=sqlite npm test                       # both providers green
DATABASE_PROVIDER=postgresql npm test

# 12C
# Neon dashboard → create project → copy pooler URL + direct URL
# Vercel dashboard → import repo → paste DATABASE_URL / DIRECT_URL / CRON_SECRET / DEMO_MODE=hosted
openssl rand -hex 32                                    # → CRON_SECRET
curl -X POST -H "x-cron-secret: $SECRET" https://<vercel-url>/api/admin/reseed   # smoke test

# 12D
# Capture screenshots from the live URL, record walkthrough video, push,
# tag v1.0.
git tag v1.0 && git push --tags
```

---

**Phase 1: First Sprint Breakdown** 

Start here. The first sprint should focus only on creating the dataset and data model. Avoid building the UI too early. 

| Task                            | Output                                      | Definition of Done                                         | Priority |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------- | -------- |
| Define dataset schema           | schema.md                                   | All fields have name, type, meaning, and example values.   | High     |
| Generate sample LMS data        | sample_lms_data.csv                         | At least 100 students, 12+ weeks, multiple resource types. | High     |
| Create RDI formula              | rdi_calculation.py                          | Each student-week has a Resource Diversity Index value.    | High     |
| Create baseline notebook/script | analysis_phase1.ipynb or phase1_pipeline.py | Loads CSV, cleans data, outputs summary table.             | High     |
| Write assumptions               | assumptions.md                              | Synthetic-data limitations are clearly stated.             | Medium   |