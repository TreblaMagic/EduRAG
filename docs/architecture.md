# EduRAG — Architecture

> Status: **draft (Phase 0)**. This document is updated each phase as the system grows.

---

## 1. Goals & non-goals

**Goals**
- Explainable, causally-grounded analytics over LMS-style student activity data.
- Clean separation between data, causal engine, API, and UI.
- Migratable from SQLite (MVP) to PostgreSQL (production).
- Reviewable by senior engineers as a portfolio-quality codebase.

**Non-goals (for MVP)**
- Real-time event ingestion.
- Multi-tenant authentication and access control.
- Direct production LMS (Moodle / Canvas) integration — the prototype works on uploaded CSVs **and** on a mock "Shell University" LMS that mirrors the real-LMS contract (Phase 5.5).
- Research-grade statistical guarantees — the engine surfaces *estimates*.

---

## 2. High-level diagram

```
+-----------------------------+        +-------------------------------+
|        Next.js (UI)         |  HTTP  |    Next.js API routes         |
|  /src/app  /src/components  | <----> |    /src/server                |
+-----------------------------+        +---------------+---------------+
                                                       |
                                                       v
                                            +----------+-----------+
                                            |  Prisma + SQLite      |
                                            |  /prisma/schema.prisma|
                                            +----------+-----------+
                                                       |
                                                       v
                                            +----------+-----------+
                                            |  Causal Engine        |
                                            |  (Python / FastAPI)   |
                                            |  pandas, NetworkX,    |
                                            |  DoWhy, scikit-learn  |
                                            +----------------------+
```

The causal engine has two interchangeable backends:

- **Baseline (TypeScript, in-process)** — always available, no external
  dependencies. Runs backdoor-adjusted OLS, bootstrap CIs, refutation
  checks, and a PC-style discovery algorithm directly in Node.
- **Advanced (Python, optional one-shot subprocess)** — DoWhy +
  causal-learn behind the same `CausalEngine` interface. Installed via
  `pip install -r python/causal-worker/requirements.txt`; the rest of
  the stack falls back to baseline with a structured warning if Python
  is missing. See `docs/features/phase-7-advanced-causal-engine.md`
  and `python/causal-worker/README.md`.

The engine abstraction lives in
`src/features/causal-engine/engine/` and is consumed by every
orchestrator (`run-estimates`, `run-discovery`, `build-report`); no
other module knows which engine produced a given result.

---

## 3. Module boundaries

| Path                                | Responsibility                                                     |
| ----------------------------------- | ------------------------------------------------------------------ |
| `src/app/`                          | Next.js routes, pages, layouts — **rendering only**.               |
| `src/components/`                   | Reusable presentational components — **no data fetching**.         |
| `src/features/students/`            | Student profile domain logic, types, hooks.                        |
| `src/features/courses/`             | Course-level aggregates & analytics.                               |
| `src/features/analytics/`           | Cross-cutting metrics (engagement, consistency).                   |
| `src/features/causal-engine/`       | DAG specification, estimands, calls to Python service.             |
| `src/features/interventions/`       | What-if simulations & recommendation generation.                   |
| `src/lib/`                          | Cross-cutting libraries (Prisma client, config, logger).           |
| `src/server/`                       | Server-only services: data access, validation, orchestration.      |
| `src/types/`                        | Shared TS types & zod schemas.                                     |
| `src/utils/`                        | Pure helper functions, no I/O.                                     |

**Rule:** UI components **never** call the database directly. They consume data
through `src/server/*` services exposed via Next.js API routes or server actions.

---

## 4. Data flow (read path)

1. User opens *Student Profile*.
2. `src/app/students/[id]/page.tsx` calls a server action in `src/server/students.ts`.
3. Service reads from Prisma (`src/lib/db.ts`).
4. Service requests latest causal scores from the causal engine if cached, else triggers re-compute.
5. UI renders engagement, RDI, top drivers, suggested interventions.

## 5. Data flow (what-if path)

1. Advisor changes a slider (e.g. *forum participation +30%*) in the simulator UI.
2. UI posts the counterfactual request to `/api/interventions/simulate`.
3. Server validates and forwards to the Python engine (`/simulate` endpoint).
4. Engine returns projected delta + confidence interval + plain-English explanation.
5. UI renders the simulation card.

---

## 6. Deployment (future)

- Web app on Vercel.
- Causal engine on Render / Railway / Fly.io.
- SQLite for local; PostgreSQL (Neon / Supabase) for hosted demo.

---

## 7. External integrations (Phase 5.5)

EduRAG accepts data from three sources:

1. **Synthetic CSV** — `npm run db:ingest` (the original Phase 2 path).
2. **Shell University mock LMS** — `npm run shell:seed` then `npm run sync:university`.
3. **Uploaded CSV** — `/upload` page (Phase 6); browser file → server action → reuses the same `parseAndValidateCsv` + `ingestValidatedRows` pipeline as the CLI.

The Shell University mock lives in this same Next.js app under
`src/app/api/shell-university/*` (route handlers) and `src/features/shell-university/`
(seed + data store). The sync layer at `src/server/sync/shell-university/`
fetches the contract — either directly from the local JSON files (default)
or over HTTP through the route handlers (`--via-http`).

The translation between Shell University's external shape (snake_case, REST
conventions, distinct vocabulary like `viewed`/`submitted`) and EduRAG's
internal Prisma shape lives entirely in
`src/server/sync/shell-university/mapper.ts`. **Swapping in a real LMS is
a matter of changing the client base URL + adjusting the mapper to its
field names** — the rest of the pipeline is unaffected.

```
┌────────────────────────┐   HTTP    ┌──────────────────────────┐
│ Shell University       │  ◄──────  │ EduRAG sync layer        │
│ (Next.js route handlers│           │ (src/server/sync/...)    │
│  serving JSON files)   │   ──────► │ • client (direct/HTTP)   │
└────────────────────────┘   data    │ • mapper                 │
                                     │ • orchestrator           │
                                     │ • SyncLog                │
                                     └──────────────────────────┘
                                                  │
                                                  ▼
                                     Prisma / SQLite (shared)
```

---

## 8. Phase 7 — engine abstraction & optional Python worker

Phase 7 introduced a stable `CausalEngine` interface and an optional
Python worker. The Next.js process talks to both engines through the
same TypeScript surface:

```
┌─────────────────────────────────────────────┐
│  Orchestrators (run-estimates,              │
│  run-discovery, build-report)               │
└─────────────┬───────────────────────────────┘
              │  selectEngine("baseline" | "advanced")
              ▼
   ┌──────────────────────┐
   │  CausalEngine iface  │ ───────► Persistence, /causal-graph,
   └────────┬─────────────┘          /api/causal/report (engine-agnostic)
            │
   ┌────────┴──────────┐
   │ Baseline (TS)     │   Advanced (Python, optional)
   │  in-process       │   one-shot subprocess
   │  estimator +      │   python/causal-worker/worker.py
   │  PC discovery     │   ↳ DoWhy, causal-learn
   └───────────────────┘
```

The advanced engine is spawned per request (`python` + worker entry,
JSON-in / JSON-out). No HTTP, no RPC, no container required. Spawn
cost is ~150 ms cold-start on Windows; negligible for interactive use.

## 9. Phase 8 — baseline ML comparison layer

Phase 8 added a second engine abstraction — `PredictionEngine` — that
sits alongside `CausalEngine` and is consumed by an orchestrator
(`trainAndPredict`), persisted to `BaselinePrediction`, and rendered
on `/students/[id]` (panel) and `/comparison` (cohort table).

```
                    ┌────────────────────────┐
                    │ PredictionEngine iface │
                    └────────────┬───────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
         ┌────────▼─────────┐         ┌─────────▼──────────┐
         │ Baseline (TS)    │         │ Advanced (Phase 9) │
         │ Logistic + L2 GD │         │ sklearn via worker │
         └────────┬─────────┘         └─────────┬──────────┘
                  │                             │
         ┌────────▼─────────────────────────────▼──────────┐
         │     trainAndPredict (orchestrator)              │
         │     reuses Phase 3 buildFeatureTable            │
         └────────────────────────┬────────────────────────┘
                                  │
                                  ▼
                       BaselinePrediction (Prisma)
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
       /students/[id]      /comparison       /api/causal/report
       panel               cohort table      ?prediction=1
```

The baseline engine is pure TypeScript — no new runtime dependencies,
same posture as Phases 5-7. The advanced engine slot is wired but
resolves to baseline with a structured warning today; wiring it to a
sklearn random forest via the Phase 7 Python worker is a Phase 9 task.

**Honesty boundary:** the prediction layer's result type intentionally
has no `recommendedAction` field. The UI keeps the two layers in
separate columns so the recruiter sees the difference directly —
prediction tells you *who*, intervention tells you *what to change*.

## 10. Phase 9 — productisation / developer experience

Phase 9 collapses the "first-run" experience into two commands and
backs them with a shared bootstrap module that is itself a reviewable
artefact (pure helpers + step orchestrator + spawn wrapper):

```
                ┌────────────────────────────────────────────────────────┐
                │              src/server/bootstrap/                     │
                │  types · format · checks · steps · spawn · setup-steps │
                └──────────┬─────────────────────────────────────────────┘
                           │
        ┌──────────────────┼─────────────────┬──────────────────┬────────────────┐
        │                  │                 │                  │                │
┌───────▼──────┐  ┌────────▼─────┐  ┌────────▼─────┐   ┌────────▼──────┐ ┌───────▼──────┐
│ npm run setup│  │ npm run demo │  │npm run doctor│   │npm run status │ │npm run reset │
│  idempotent  │  │ setup + dev  │  │ env + db +   │   │ row counts    │ │ wipe + setup │
│  bootstrap   │  │ + URL banner │  │ data + opt   │   │ snapshot      │ │ (--yes guard)│
└──────────────┘  └──────────────┘  └──────────────┘   └───────────────┘ └──────────────┘
```

Key invariants:

- **Idempotent.** Every setup step exposes a `shouldRun()` check that
  reads the filesystem / DB before doing anything; safe to re-run on a
  populated checkout.
- **No silent destruction.** `reset:demo` is dry-run by default — the
  `--yes` flag is required to actually delete rows.
- **Optional features degrade.** Python missing → `doctor` reports
  `warn`, not `error`; advanced engines fall back to baseline with a
  structured warning surfaced through the engine factory.
- **Single bootstrap module.** Both Phase 7's `CausalEngine` and Phase
  8's `PredictionEngine` resolve their advanced (Python) backends via
  dynamic imports so client bundles never pull `node:fs` /
  `node:child_process`.

The advanced prediction engine (Phase 8's Phase-9 hook) is now live:
the Python worker grew `predict_train` / `predict_infer` commands
covering both sklearn `LogisticRegression` and
`RandomForestClassifier`. The TS factory keeps the baseline as the
default and warns on fallback.

Docker is supported (single Dockerfile + compose, SQLite volume, no
orchestration complexity) but remains **optional** — local-first stays
the recommended path.

## 11. Phase 10 — dataset mode manager

Phase 10 introduces a canonical "dataset mode" concept so every page in
the dashboard, every downloadable report, and every causal estimate
carries a stamp of which data origin produced it.

```
                  ┌──────────────────────────────────────────┐
                  │      src/features/dataset-modes/         │
                  │  types · metadata · status (pure)        │
                  └──────────────────┬───────────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │      src/server/dataset-mode/            │
                  │  store.ts   — JSON persistence (atomic-ish)│
                  │  orchestrator — joins state + Prisma probes│
                  └──┬───────────────────┬───────────────────┘
                     │                   │
   ┌─────────────────┼─────────┐ ┌───────┴──────────────────────┐
   │                 │         │ │                              │
   ▼                 ▼         ▼ ▼                              ▼
<AppShell>     /datasets  setActiveDatasetMode      buildCausalReport
banner chip    overview + (server action)           (Phase 7 + 8) — stamps
on every       three-card  invoked by                every report with the
page header    switcher    <DatasetModeSwitcher>     active mode
```

Key invariants:

- **Switching is non-destructive.** Updating the active mode only
  rewrites `data/processed/dataset-mode.json`. The DB rows do not
  change. `npm run reset:demo` (Phase 9) is the destructive escape
  hatch.
- **JSON file, no Prisma migration.** Keeps Phase 10 fully additive —
  zero schema changes, no migration step.
- **Safe-by-default fallback.** Any I/O / parse / validation failure
  yields the default state (`activeMode: "synthetic"`). `readState`
  never throws.
- **Single source of truth.** Per-mode metadata lives in
  `DATASET_MODE_METADATA`; the banner, switcher, /about page, and
  report builder all read it. Copy never drifts.

## 12. Phase 11 — intervention feedback loop

Phase 11 turns the recommendation surface from a one-shot output into
a stateful loop. Every `InterventionSimulation` row (Phase 4) can now
collect an `InterventionDecision` carrying the advisor's action plus
optional notes and an observational follow-up.

```
                      ┌──────────────────────────────────────────────┐
                      │   src/features/intervention-tracking/        │
                      │   (pure: types · status · timeline · analytics) │
                      └────────────────────┬─────────────────────────┘
                                           │
                                           ▼
                      ┌──────────────────────────────────────────────┐
                      │   src/server/intervention-tracking/          │
                      │   decisions.ts   recordDecision /            │
                      │                   recordFollowUp / clear     │
                      │   queries.ts     read helpers + analytics    │
                      └────────────────────┬─────────────────────────┘
                                           │
        ┌──────────────────────────────────┼───────────────────────────────┐
        │                                  │                               │
        ▼                                  ▼                               ▼
 <InterventionActionBar>          /interventions page          buildCausalReport
 inside <InterventionCard>        cohort analytics +           (Phase 7 + 8 + 10 + 11)
 on /students/[id]                recent-activity feed         stamps every report
                                                               with the tracking section
        │                                  │                               │
        └──────────────────────────────────┴──────────────────► server actions:
                                                                submitDecision /
                                                                submitFollowUp /
                                                                revertDecision
                                                                + revalidatePath
```

Key invariants:

- **Decisions are advisor-supplied.** The dashboard never records a
  decision automatically. `proposed` is the implicit default state
  for any simulation without a decision row.
- **Notes / follow-ups are observational.** Persistence rejects any
  text containing `guaranteed`, `proven cause`, `confirms causation`,
  `scientific proof`. The UI surfaces a banner near every follow-up
  form explicitly stating the text "is not proof of causality".
- **Mutations live behind server actions.** Components never call
  Prisma directly; the action bar talks to the three Phase-11 server
  actions and lets `revalidatePath` flush the relevant routes.
- **The timeline is built from a pure function.** `buildTimelineEvents`
  takes the simulation timestamp + decision shape and emits a flat,
  chronologically-ordered `TimelineEvent[]` — easy to test, easy to
  reuse in the report.
- **Reports stamp tracking.** When `--tracking` is set,
  `buildCausalReport` populates a `ReportTrackingSection` and bumps
  `schemaVersion` to `phase-11.v1`.

## 13. Open questions

- Granularity of causal recomputation: per-request vs nightly batch.
- When to split `/api/shell-university/*` into a true standalone service —
  for the prototype, co-located is faster to demo; for production, splitting
  it makes the integration boundary unambiguous.
- Whether the advanced engine should also persist the discovered DAG
  in a dedicated Prisma table once it's run more than experimentally
  (Phase 8+ decision).
