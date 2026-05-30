# Phase 9 — Productisation / One-Command Setup

> Status: **complete (2026-05-28)**. Two-command demo
> (`npm run setup && npm run demo`) on a fresh `git clone`. Optional
> Docker. Optional advanced prediction engine wired through the Phase 7
> Python worker. Zero new TypeScript runtime dependencies.

## 1. Goal

Make EduRAG feel like a genuine open-source product:

- `git clone` → working dashboard in ≤ 2 commands.
- Idempotent setup that's safe to re-run.
- Honest diagnostics (`doctor`, `status`) when something is off.
- Safe-by-default reset for recordings + screenshots.
- Polished onboarding (`/about`) for first-time reviewers.
- Optional Docker for fully isolated demos.

## 2. Architecture

```
                ┌──────────────────────────────────────────────────────────┐
                │                src/server/bootstrap/                     │
                │                                                          │
                │  types.ts      CheckResult / StepResult / SetupSummary   │
                │  format.ts     pure renderers + isHealthy / countByStatus│
                │  checks.ts     env / db / data / feature checks (RO)     │
                │  steps.ts      runSteps orchestrator (timed + structured)│
                │  spawn.ts      shared child_process wrapper              │
                │  setup-steps   concrete step list with shouldRun checks  │
                └────┬─────────────────┬────────────────┬─────────────────┘
                     │                 │                │
       ┌─────────────┴───┐  ┌──────────┴──────┐  ┌──────┴────────┐
       │ setup-cli       │  │ demo-cli        │  │ doctor / status│
       │ runs all steps  │  │ setup + dev     │  │ read-only      │
       │ + JSON output   │  │ + URL banner    │  │ diagnostics    │
       └─────────────────┘  └─────────────────┘  └────────────────┘
                                                          │
                                         ┌────────────────┴────────┐
                                         │ reset-cli               │
                                         │ wipe (--yes guard) +     │
                                         │ re-run setup            │
                                         └─────────────────────────┘
```

Key invariants:

1. **Idempotent.** Every step has a `shouldRun()` check that reads the
   filesystem / DB before doing anything. A second `npm run setup`
   takes < 1 s on a populated checkout.
2. **No silent destruction.** `reset:demo` is a dry-run by default;
   `--yes` is required.
3. **Optional features degrade.** Python missing → `doctor` reports
   `warn` (not `error`); advanced engines fall back to baseline with a
   structured warning surfaced everywhere.
4. **Pure orchestrator + impure steps.** `runSteps` knows nothing about
   npm or prisma — it just times each step and records the structured
   result. The actual side effects live in `setup-steps.ts`, which
   makes the orchestrator unit-testable without spawning processes.

## 3. Setup flow

`npm run setup` runs these steps in order, skipping any whose
post-condition already holds:

| # | Step                                                     | `shouldRun()` short-circuit                    |
| - | -------------------------------------------------------- | ---------------------------------------------- |
| 1 | Install npm dependencies (`npm install`)                 | `node_modules/next` exists                     |
| 2 | Generate Prisma client (`npx prisma generate`)           | `node_modules/.prisma/client` exists           |
| 3 | Apply Prisma migrations (`npx prisma migrate deploy`)    | `prisma/dev.db` exists                         |
| 4 | Generate synthetic CSV (`npm run data:generate`)         | `data/raw/sample_lms_data.csv` exists (unless `--fresh`) |
| 5 | Ingest CSV + derive features (`npm run db:ingest`)       | `Student` count > 0                            |
| 6 | Run causal estimates (`npm run causal:estimate`)         | `CausalEstimate` count > 0                     |
| 7 | Run intervention simulations (`npm run causal:simulate`) | `InterventionSimulation` count > 0             |
| 8 | Train + predict baseline ML (`npm run ml:predict`)       | `BaselinePrediction` count > 0                 |

Output is a streamed list of `[ ok ] / [skip] / [fail]` lines with
per-step timing, followed by a summary banner pointing to either
`npm run demo` (on success) or `npm run doctor` (on failure).

Flags:

- `--fresh` — force step 4 even if the CSV exists.
- `--json` — emit the structured `SetupSummary` on stdout in addition
  to the human-readable log.

## 4. Demo flow

`npm run demo`:

1. Runs the full setup pipeline (idempotent — usually < 1 s on a
   populated checkout).
2. Prints the URL banner with every demo-worthy route.
3. Hands off to `npm run dev` (Next.js dev server). Ctrl+C stops it.

Flags:

- `--fresh` — same as `setup --fresh`.
- `--skip-setup` — go straight to `next dev` (useful if you already
  ran setup recently).

## 5. Doctor / status

`npm run doctor` runs four read-only check groups:

| Group               | What it checks                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| Environment         | Node version, npm install, `.env`, Python interpreter (optional).                |
| Database            | Prisma client, SQLite file, per-table row counts (Students → SyncLog).           |
| Data files          | Synthetic CSV, Shell University seed.                                            |
| Optional features   | Advanced causal engine, advanced prediction engine, generated reports directory. |

Each check returns `{ status: ok | warn | missing | error, detail, hint? }`.
`doctor` exits non-zero if any check is `missing` or `error` so it can
double as a CI smoke test. `--json` emits the structured payload.

`npm run status` is a focused subset — just the data + database groups.

## 6. Reset

`npm run reset:demo`:

- **Dry-run by default.** Prints the deletion plan and exits.
- `--yes` performs the wipe in dependency order (BaselinePrediction →
  … → Course → SyncLog) and then re-runs setup.
- `--fresh` also regenerates the synthetic CSV.
- `--keep-data` skips the setup re-run (DB stays empty after wipe).

The schema and migration history are preserved; the wipe operates only
on rows.

## 7. /about onboarding page

Static-rendered Next.js page covering:

- What EduRAG is (one paragraph + two-question framing).
- Side-by-side "Prediction vs Intervention" panel mirroring the
  student-page card.
- How to read confidence intervals + chips.
- Where the demo data comes from (synthetic / mock LMS / upload).
- Honesty constraints (binding).
- A 6-card grid linking to every demo route.
- The one-command setup snippet.
- Limitations.

Linked from the sidebar as "About / Help".

## 8. Optional Docker

- `Dockerfile` — Node 20 slim + Python + Prisma generate + Next build.
  Entrypoint runs `prisma migrate deploy && npm run setup && npm start`.
- `docker-compose.yml` — single service, two named volumes
  (`edurag_db`, `edurag_data`) so SQLite + generated CSV survive
  rebuilds.
- `.dockerignore` — trims the build context to what's needed.

Docker is **optional**. README + Plan are explicit that local-first is
the recommended path.

## 9. Advanced prediction engine (sklearn via Python worker)

Phase 8 left the advanced prediction engine as a forward-looking hook;
Phase 9 wires it. The Python worker grew two commands:

- `predict_train` — fits sklearn `LogisticRegression` or
  `RandomForestClassifier` and returns a JSON-serialisable model
  payload (coefficients + scaler for LR; standardised feature space +
  training-set probabilities for RF).
- `predict_infer` — re-scores new rows against a stored logistic
  payload without touching sklearn (cheap, no second round-trip). For
  random forests, inference is restricted to the training set — the
  worker doesn't persist the fitted forest, so the orchestrator either
  uses `trainProbabilities` directly or re-trains.

TypeScript side: `src/features/baseline-ml/engine/advanced-prediction-engine.ts`
mirrors the Phase 7 advanced causal-engine pattern exactly (bundler-safe
Node loader, dynamic import in the factory). `selectPredictionEngine`
auto-falls-back to baseline + warning when the worker / sklearn is
missing.

## 10. Developer-UX decisions

- **No CLI framework.** Hand-rolled `parseArgs` per CLI; each is < 100
  LoC. Adding `commander` / `yargs` for five flags would be
  overengineering.
- **Inherited stdio.** `runCommand` lets `npm install` / `prisma
  migrate` print their native progress + prompts. The setup wrapper
  prints its own status lines around them.
- **Two glyph sets.** Checks use `[ ok ] / [warn] / [miss] / [ err]`;
  steps use `[ ok ] / [skip] / [fail]`. Visually consistent left
  margin so the columns align in any terminal.
- **No emoji.** Some terminals + recordings garble Unicode glyphs;
  ASCII-safe bracketed labels are robust.
- **Lazy Prisma load.** The setup / demo / doctor / status CLIs lazy-
  import `@/lib/db` so they still load when the client hasn't been
  generated yet (the step list handles the "generate first" case).

## 11. Limitations

- **`npm install` is not parallel.** The setup script runs steps
  sequentially. For the small EduRAG project this is fine; for a
  monorepo it would matter.
- **Setup assumes posix-ish shell semantics.** `spawn.shell = true`
  smooths over the Windows `npm.cmd` quirk; PowerShell idiosyncrasies
  beyond that are not handled.
- **Reset wipe is rewrite-once.** Re-running `reset:demo` immediately
  re-seeds — there's no "wipe-and-stop-here" path beyond
  `--keep-data`.
- **Docker image is single-stage.** A multi-stage build would shave
  ~50 MB off the final image but adds complexity for a prototype.
- **No Postgres docker-compose stack.** The compose file uses SQLite
  for parity with the local workflow. Phase 12 (or whenever production
  is on the table) can add a Postgres service + a `DATABASE_URL`
  swap.

## 12. Future polish

- `npm run setup` parallelisation: run independent steps concurrently
  (e.g. `causal:estimate` and `ml:predict`).
- Setup integration test in CI: wipe a temp dir, run `npm run setup`,
  assert exit 0 + key row counts.
- Pre-built Docker image published to GitHub Container Registry.
- `npm run demo:record` that drives a Playwright session through the
  scripted walkthrough for screenshot capture.

## 13. File map

### Created

| Path                                                              | Purpose                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server/bootstrap/types.ts`                                   | Shared check / step / summary types.                                          |
| `src/server/bootstrap/format.ts`                                  | Pure renderers + isHealthy + countByStatus.                                   |
| `src/server/bootstrap/checks.ts`                                  | env / db / data / feature checks (read-only).                                 |
| `src/server/bootstrap/steps.ts`                                   | `runSteps` orchestrator.                                                      |
| `src/server/bootstrap/spawn.ts`                                   | `runCommand` wrapper (shell:true on Windows).                                 |
| `src/server/bootstrap/setup-steps.ts`                             | Concrete step list with `shouldRun` checks.                                   |
| `src/server/bootstrap/setup-cli.ts`                               | `npm run setup` entry point.                                                  |
| `src/server/bootstrap/demo-cli.ts`                                | `npm run demo` entry point (setup + dev + URL banner).                        |
| `src/server/bootstrap/reset-cli.ts`                               | `npm run reset:demo` entry point with `--yes` guard.                          |
| `src/server/bootstrap/doctor-cli.ts`                              | `npm run doctor` entry point.                                                 |
| `src/server/bootstrap/status-cli.ts`                              | `npm run status` entry point.                                                 |
| `src/server/bootstrap/index.ts`                                   | Barrel.                                                                       |
| `src/features/baseline-ml/engine/advanced-prediction-engine.ts`   | sklearn-via-worker prediction engine.                                         |
| `src/app/about/page.tsx`                                          | Static onboarding / help page.                                                |
| `Dockerfile`                                                      | Optional Node 20 + Python container.                                          |
| `docker-compose.yml`                                              | Optional compose with SQLite + data volumes.                                  |
| `.dockerignore`                                                   | Lean build context.                                                           |
| `src/server/bootstrap/__tests__/format.test.ts`                   | 11 tests — renderers + status counting + healthy predicate.                   |
| `src/server/bootstrap/__tests__/steps.test.ts`                    | 5 tests — orchestrator skip / fail / stop-on-error / onStep callback.         |
| `src/server/bootstrap/__tests__/setup-steps.test.ts`              | 5 tests — step-list shape + shouldRun decisions + freshData override.         |
| `docs/features/phase-9-productisation-one-command-setup.md`       | This spec.                                                                    |
| `docs/logs/2026-05-28-phase-9-productisation-one-command-setup.md`| Execution log.                                                                |

### Updated

| Path                                                  | Change                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `package.json`                                        | Added `setup`, `demo`, `reset:demo`, `doctor`, `status` scripts.                    |
| `python/causal-worker/worker.py`                      | Added `predict_train` + `predict_infer` commands (sklearn LR + RF).                 |
| `src/features/baseline-ml/engine/index.ts`            | Dynamic import + auto-fallback for the new advanced prediction engine.              |
| `src/components/Sidebar.tsx`                          | Added "About / Help" nav item.                                                      |
| `src/features/baseline-ml/__tests__/engine.test.ts`   | `selectPredictionEngine("advanced")` test now handles both reachable + fallback paths. |
| `README.md`                                           | Portfolio-grade rewrite — two-command demo at the top, architecture diagram, screenshots placeholders. |
| `docs/Plan.md`                                        | Phase 9 marked complete with checklist + manual commands.                           |
| `docs/architecture.md`                                | Added §10 — productisation diagram + invariants.                                    |
| `docs/demo-script.md`                                 | Setup snippet refreshed; closing line updated.                                      |

**Totals: 21 new tests (+241 cumulative passing) · typecheck clean · build clean (14 routes including `/about`).**
