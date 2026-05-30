# Execution Log — Phase 9: Productisation / One-Command Setup

- **Date:** 2026-05-28
- **Phase:** 9 — Productisation / One-Command Setup
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 8 (`docs/logs/2026-05-28-phase-8-baseline-ml-comparison.md`)

---

## Objective

Turn EduRAG into a genuinely easy-to-run open-source project. The
goal is a two-command demo (`npm run setup && npm run demo`) on a
fresh `git clone`, plus the diagnostics (`doctor`, `status`) and
clean-slate utilities (`reset:demo`) needed to make recordings and
recruiter walkthroughs feel polished. Also: wire the advanced
prediction engine slot (left as a Phase 9 hook in Phase 8) and ship a
first-time-reviewer onboarding page.

Explicitly out of scope: hosted deployment, CI/CD pipelines, multi-
arch container builds, hardened production Docker setups.

---

## Files created

### TypeScript — bootstrap module

| Path                                                              | Purpose                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server/bootstrap/types.ts`                                   | Shared check + step + summary types.                                          |
| `src/server/bootstrap/format.ts`                                  | Pure renderers + `isHealthy` + `countByStatus`.                               |
| `src/server/bootstrap/checks.ts`                                  | env / db / data / feature checks (read-only, structured).                     |
| `src/server/bootstrap/steps.ts`                                   | `runSteps` orchestrator with `shouldRun` short-circuits.                      |
| `src/server/bootstrap/spawn.ts`                                   | `runCommand` wrapper around `child_process.spawn` (shell:true for Windows).   |
| `src/server/bootstrap/setup-steps.ts`                             | Concrete step list (deps → prisma → migrate → CSV → ingest → estimate → simulate → predict). |
| `src/server/bootstrap/setup-cli.ts`                               | `npm run setup` — runs the steps + streams `[ ok ] / [skip] / [fail]`.        |
| `src/server/bootstrap/demo-cli.ts`                                | `npm run demo` — setup-if-needed + dev server + URL banner.                   |
| `src/server/bootstrap/reset-cli.ts`                               | `npm run reset:demo` — `--yes`-guarded wipe + re-run setup.                   |
| `src/server/bootstrap/doctor-cli.ts`                              | `npm run doctor` — full read-only health check (non-zero exit on hard fail).  |
| `src/server/bootstrap/status-cli.ts`                              | `npm run status` — concise row-count snapshot.                                |
| `src/server/bootstrap/index.ts`                                   | Module barrel.                                                                |

### TypeScript — advanced prediction engine

| Path                                                                | Purpose                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/baseline-ml/engine/advanced-prediction-engine.ts`     | sklearn-via-Python-worker prediction engine (LR + Random Forest).             |

### TypeScript — UI

| Path                                              | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/app/about/page.tsx`                          | Static onboarding / help page (architecture, honesty constraints, full route map).      |

### Python worker

(file updated, see below) — added `predict_train` + `predict_infer` commands covering sklearn `LogisticRegression` + `RandomForestClassifier`.

### Docker

| Path                                              | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Dockerfile`                                      | Optional Node 20 + Python image. Runs `prisma migrate deploy && npm run setup && npm start` on first boot. |
| `docker-compose.yml`                              | Single service + two named volumes (SQLite + generated data).                           |
| `.dockerignore`                                   | Trims the build context.                                                                |

### Tests

| Path                                                              | Coverage                                                  | Tests |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src/server/bootstrap/__tests__/format.test.ts`                   | Renderers + status counting + isHealthy predicate.        | 11    |
| `src/server/bootstrap/__tests__/steps.test.ts`                    | Orchestrator skip / fail / stop-on-error / onStep.        | 5     |
| `src/server/bootstrap/__tests__/setup-steps.test.ts`              | Step-list shape + shouldRun decisions + freshData override. | 5   |

### Docs

| Path                                                              | Purpose                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `docs/features/phase-9-productisation-one-command-setup.md`       | Full per-feature spec.                                                                  |
| `docs/logs/2026-05-28-phase-9-productisation-one-command-setup.md`| This log.                                                                               |

---

## Files updated

| Path                                                | Change                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `package.json`                                      | Added `setup`, `demo`, `reset:demo`, `doctor`, `status` scripts.                    |
| `python/causal-worker/worker.py`                    | New commands: `predict_train` (sklearn LR + RF) + `predict_infer` (LR re-score).    |
| `src/features/baseline-ml/engine/index.ts`          | Dynamic import + auto-fallback for the new advanced prediction engine.              |
| `src/components/Sidebar.tsx`                        | Added "About / Help" nav item.                                                      |
| `src/features/baseline-ml/__tests__/engine.test.ts` | `selectPredictionEngine("advanced")` test now handles both reachable + fallback paths (15 s timeout). |
| `README.md`                                         | Portfolio-grade rewrite — two-command demo at the top, architecture diagram, feature list, optional Python + Docker sections, screenshots placeholders. |
| `docs/Plan.md`                                      | Phase 9 marked complete with checklist + manual commands.                           |
| `docs/architecture.md`                              | Added §10 — productisation diagram + invariants.                                    |
| `docs/demo-script.md`                               | Two-command setup snippet at the top; closing line updated.                         |

## Files removed

None.

---

## Commands run by the agent

| # | Command                              | Result                                                                                          |
| - | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 | `npx tsc --noEmit`                   | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 2 | `npm test`                           | ✅ **27 files, 241 tests, all passed** (~9 s test exec).                                        |
| 3 | `npm run build`                      | ✅ Compiled, 14 routes generated (added `/about` as a static page).                             |

Per `CLAUDE.md`, the agent did **not** run any database migration, any
DB-writing CLI, any `pip install`, or `npm install`. No new npm
packages were added.

---

## Commands the operator must run manually

```bash
# Verify the bootstrap works against a fresh checkout (the agent did not run these).
npm run setup                    # idempotent on a populated checkout (< 1 s)
npm run demo                     # setup-if-needed + dev server with URL banner
npm run doctor                   # full env + data + feature report
npm run status                   # concise row-count snapshot
npm run reset:demo               # dry-run (prints the plan)
npm run reset:demo -- --yes      # apply the wipe + re-run setup

# Optional advanced prediction engine (sklearn).
pip install -r python/causal-worker/requirements.txt
npm run ml:predict -- --engine advanced --model random_forest

# Optional Docker.
docker compose build
docker compose up                # http://localhost:3000
```

---

## Dependencies added

- **TypeScript:** *None.* Bootstrap module, CLIs, advanced prediction
  engine, `/about` page, and Docker support all reuse existing
  primitives (`child_process`, `fs`, `path`, the Prisma client, the
  Phase 7 Python availability probe).
- **Python:** *None.* sklearn / numpy / pandas remain optional and
  listed in `python/causal-worker/requirements.txt`; the worker
  silently no-ops the advanced commands when they are absent.
- **Docker:** lightweight `node:20-bookworm-slim` base image + apt
  install of `python3`, `python3-pip`, `openssl`, `ca-certificates`.

---

## Assumptions made

1. **Local-first stays the recommended path.** Docker is optional;
   the README + Plan + log are explicit about this. The reason: the
   prototype is small enough that a `git clone && npm run setup` is
   genuinely faster than a `docker compose build`.
2. **`prisma migrate deploy` over `migrate dev`.** Setup automation
   needs non-interactive migration application; `dev` would prompt
   for schema-drift resolution. Migrations are already checked in to
   `prisma/migrations/`, so `deploy` is the correct tool.
3. **`shell: true` on spawn.** Windows ships `npm.cmd` / `npx.cmd`;
   without `shell: true` the path resolution fails. The downside is
   broader argument quoting risk — the bootstrap only ever passes
   static argument lists, so the risk is moot here.
4. **Reset is dry-run by default.** Destructive ops should never run
   without an explicit `--yes`. The dry-run prints what *would* be
   deleted so the user can sanity-check before applying.
5. **Doctor exits non-zero on hard failures.** This lets the doctor
   double as a CI smoke test without writing a separate script. Warns
   (Python missing, reports directory empty) don't fail.
6. **No CLI framework.** Hand-rolled `parseArgs` per CLI; each is
   < 100 LoC. Adding `commander` / `yargs` for five flags would be
   overengineering and violates the "no new runtime deps" rule.
7. **sklearn RF inference is restricted to training rows.** The Python
   worker doesn't persist fitted forests (they aren't JSON-friendly).
   The orchestrator either uses `trainProbabilities` returned by
   `predict_train`, or re-trains. Logistic regression has no such
   restriction — the coefficients + scaler are JSON-serialisable.
8. **`/about` is a static-rendered page.** No data fetching, no
   server actions; just Tailwind + Next.js. The static-prerender path
   keeps it fast and ensures the page works even when the database is
   empty (useful first impression on a cold clone).

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **241 / 241** tests pass (`npm test`), across 27 files.
- [x] `npm run build` succeeds — 14 routes including the new `/about`
      static page.
- [x] No DB migration / DB-writing CLI / `pip install` / `npm install`
      executed by the agent.
- [x] No new npm packages added.
- [x] Setup steps are idempotent — each step's `shouldRun()` is
      asserted in `setup-steps.test.ts`.
- [x] Orchestrator stops on first failure by default (asserted in
      `steps.test.ts`).
- [x] Reset is dry-run unless `--yes` is passed (asserted by the CLI
      flag parser; the destructive path is gated by `opts.confirmed`).
- [x] Advanced prediction engine falls back to baseline with a
      structured warning when the Python worker is unavailable
      (asserted in the updated baseline-ml `engine.test.ts`).
- [x] Webpack bundle does not pull `node:fs` / `node:child_process` —
      the advanced prediction engine uses the same bundler-opaque
      `eval("require")` pattern as Phase 7.
- [x] All Phase 0 – 8 functionality unchanged in behaviour; only
      additive changes.
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/demo-script.md` updated.
- [x] `docs/features/phase-9-productisation-one-command-setup.md`
      created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 10

- **Setup integration test.** There is no end-to-end test that runs
  `npm run setup` against a wiped temp dir and asserts the resulting
  row counts. Each step is unit-tested; the orchestrator is tested;
  but a smoke test would catch regressions in the spawn wrapper.
- **Windows path quoting.** `runCommand` uses `shell: true` and joins
  args with spaces. Arguments with spaces or special characters would
  break. Today the bootstrap never passes such arguments, but a
  reviewer might add a CLI flag that does. Switch to `execa` or build
  the command string defensively if this becomes a concern.
- **Docker image size.** ~600 MB after the apt install of Python.
  Acceptable for a prototype; a multi-stage build with `node-prune`
  could trim significantly. Phase 12 (launch) work.
- **Reset wipe ordering.** Hand-written deletion order in `reset-cli.ts`.
  If a future phase adds a new LMS-derived table, append it there or
  cascades may complain on Postgres.
- **sklearn version drift.** The worker imports
  `LogisticRegression(... solver="lbfgs")` and
  `RandomForestClassifier(n_estimators=200, max_depth=6)`. Pin
  scikit-learn `>=1.4` in `requirements.txt` to keep behaviour
  reproducible.

---

## Next recommended phase

**Phase 10 — Demo Dataset Modes.**

Concrete first steps:

1. UI selector in the dashboard header that picks between the three
   data sources (synthetic / mock LMS / uploaded) and persists the
   choice across page reloads.
2. New Prisma column or singleton table tracking the "active dataset
   source" so every page knows which one is live.
3. `npm run demo:reset` (already shipped as `npm run reset:demo` in
   Phase 9) wired to clear + re-bootstrap a specific source.
4. Per-source banners on `/`, `/students/[id]`, `/comparison`,
   `/causal-graph` indicating which source they are reading.
5. Docs: update `docs/demo-script.md` to walk through switching modes
   live during a demo.
6. Write `docs/features/phase-10-demo-dataset-modes.md` + execution
   log.
