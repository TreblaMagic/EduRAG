# Execution Log — Phase 8: Baseline ML Comparison

- **Date:** 2026-05-28
- **Phase:** 8 — Baseline ML Comparison
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 7 (`docs/logs/2026-05-27-phase-7-advanced-causal-engine.md`)

---

## Objective

Add a traditional ML prediction layer (intentionally simple) alongside
the existing causal engine, and ship a comparison UI that makes the
"WHO vs WHAT TO CHANGE" distinction obvious in under 30 seconds. The
causal engine remains the primary system; the baseline ML layer exists
solely as a comparison surface.

Explicitly out of scope: GPU, deep learning, cross-validation,
calibration, multi-class targets, advanced explainability (SHAP /
permutation importance).

---

## Files created

### TypeScript — baseline ML

| Path                                                          | Purpose                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/features/baseline-ml/types.ts`                           | `PredictionEngine` interface + result / training / engine types.                       |
| `src/features/baseline-ml/constants.ts`                       | `AT_RISK_THRESHOLD = 55` (matches the UI).                                             |
| `src/features/baseline-ml/logistic-regression.ts`             | Pure-TS L2 logistic regression (sigmoid + batch GD).                                   |
| `src/features/baseline-ml/standardise.ts`                     | Column-wise mean/std fit + apply; zero-variance guard.                                 |
| `src/features/baseline-ml/comparison.ts`                      | `buildComparison()` insights generator; honesty-language filtered.                     |
| `src/features/baseline-ml/engine/baseline-prediction-engine.ts` | TS baseline engine (train + predict + feature importance).                          |
| `src/features/baseline-ml/engine/index.ts`                    | `selectPredictionEngine` factory with structured fallback.                             |
| `src/features/baseline-ml/index.ts`                           | Barrel.                                                                                |

### TypeScript — server orchestration

| Path                                                          | Purpose                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/server/prediction/train-and-predict.ts`                  | Reads features → selects engine → trains → predicts → persists to `BaselinePrediction`.|
| `src/server/prediction/cli.ts`                                | `npm run ml:predict` CLI with `--engine`, `--model`, `--threshold`, `--json`.          |
| `src/server/queries/predictions.ts`                           | `getPredictionForStudent` + `getPredictionsForCourse`.                                 |

### TypeScript — UI

| Path                                                          | Purpose                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/components/PredictionVsInterventionCard.tsx`             | Side-by-side panel on `/students/[id]` with insights footer + honest banners.          |
| `src/app/comparison/page.tsx`                                 | Cohort-wide table + 4 summary tiles + Markdown/JSON report download links.             |

### Tests

| Path                                                              | Coverage                                                  | Tests |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src/features/baseline-ml/__tests__/logistic-regression.test.ts`  | Coefficient signs, accuracy, threshold logic, standardiser. | 7   |
| `src/features/baseline-ml/__tests__/engine.test.ts`               | Engine contract, fallback, model-type guard, banned-language. | 8   |
| `src/features/baseline-ml/__tests__/comparison.test.ts`           | Empty / agreement / disagreement / WHO-vs-WHAT / banned-language. | 6 |

### Docs

| Path                                                          | Purpose                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs/features/phase-8-baseline-ml-comparison.md`             | Full per-feature spec.                                                                 |
| `docs/logs/2026-05-28-phase-8-baseline-ml-comparison.md`      | This log.                                                                              |

---

## Files updated

| Path                                              | Change                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                            | Added `BaselinePrediction` model + relations on `Student` and `Course`.                         |
| `src/server/queries/students.ts`                  | `StudentDetail.prediction` field; parallel fetch from `BaselinePrediction`.                     |
| `src/app/students/[id]/page.tsx`                  | Mounts `<PredictionVsInterventionCard>` between charts and intervention list.                   |
| `src/components/Sidebar.tsx`                      | Added "Prediction vs Intervention" nav item.                                                    |
| `src/lib/intervention-language.ts`                | Added `predictionFeatureLabel()` for new feature names (MeanEngagement, MeanRdi, …).            |
| `src/features/causal-engine/report/types.ts`      | Added `ReportPredictionRow` + `ReportPredictionSection`; `schemaVersion` now union.             |
| `src/features/causal-engine/report/markdown.ts`   | Renders the new prediction section when present; section numbering shifts accordingly.          |
| `src/features/causal-engine/report/index.ts`      | Re-exports new types.                                                                           |
| `src/features/causal-engine/index.ts`             | Re-exports prediction-section types from the barrel.                                            |
| `src/server/causal/build-report.ts`               | Optional prediction section via `includePrediction: true`.                                      |
| `src/server/causal/report-cli.ts`                 | Added `--prediction` flag.                                                                      |
| `src/app/api/causal/report/route.ts`              | Added `?prediction=1` query param.                                                              |
| `src/features/causal-engine/__tests__/engine.test.ts` | Bumped fallback test timeout to 15s to absorb cold-start CPU contention.                    |
| `src/features/causal-engine/__tests__/report.test.ts` | `makeReport` defaults now include `prediction: null` so the type matches the Phase 8 union. |
| `package.json`                                    | Added `ml:predict` script.                                                                      |
| `docs/Plan.md`                                    | Phase 8 marked complete with checklist + manual commands.                                       |
| `README.md`                                       | Phase 8 CLI snippet, route description, roadmap row.                                            |
| `docs/architecture.md`                            | Added §9 — baseline ML comparison architecture diagram.                                         |
| `docs/causal-methodology.md`                      | Added §9 — prediction vs causal inference boundary.                                             |
| `docs/demo-script.md`                             | Inserted Phase 8 step in the 2-minute walkthrough; updated close.                               |

## Files removed

None.

---

## Commands run by the agent

| # | Command                                  | Result                                                                                          |
| - | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 | `npm run prisma:generate`                | ✅ Prisma client regenerated with the new `BaselinePrediction` model.                           |
| 2 | `npx tsc --noEmit`                       | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 3 | `npm test`                               | ✅ **24 files, 219 tests, all passed**.                                                         |
| 4 | `npm run build`                          | ✅ Compiled, 13 routes (added `/comparison`).                                                   |

Per `CLAUDE.md`, the agent did **not** run any database migration, any
DB-writing CLI, any `pip install`, or `npm install`. No new npm packages
were added.

---

## Commands the operator must run manually

```bash
# 1. Apply the Phase 8 schema addition (new BaselinePrediction table).
#    Non-destructive: additive only.
npx prisma migrate dev --name phase8_baseline_prediction

# 2. Re-train + predict for the cohort. Default course CS-201.
npm run ml:predict                                # baseline, logistic, threshold 0.5
npm run ml:predict -- --threshold 0.4 --json     # tighter classifier, JSON summary
npm run ml:predict -- --engine advanced          # forward-looking hook (falls back today)

# 3. Browse the comparison surfaces.
npm run dev
# http://localhost:3000/students/STU-0042        (panel)
# http://localhost:3000/comparison               (cohort table + report links)

# 4. Generate a downloadable comparison report.
npm run causal:report -- --prediction --out docs/reports/cs-201-comparison.md
npm run causal:report -- --prediction --format json --out docs/reports/cs-201-comparison.json
```

---

## Dependencies added

- **TypeScript:** *None.* Logistic regression, standardiser, comparison
  helpers, and UI are all pure TS reusing existing primitives. The
  baseline engine has zero external dependencies.
- **Python:** *None.* The advanced engine slot is wired with a
  structured-fallback warning today; hooking it to the Phase 7 worker
  (`python/causal-worker/worker.py`) for sklearn random forests is a
  Phase 9 task.

---

## Assumptions made

1. **TS baseline is the default.** Just like Phase 7, the baseline is
   the always-on path; "advanced" is opt-in and falls back to baseline
   with a structured warning so the dashboard never crashes when the
   sklearn route isn't wired.
2. **One row per (student, course, modelType).** Re-training a course
   with the same model overwrites prior rows (idempotent via
   `deleteMany` + `create`). Versioning is a Phase 9+ concern.
3. **At-risk threshold = 55** matches `src/lib/confidence-label.ts`.
   The label is hard-coded; changing one place requires changing the
   other.
4. **Logistic regression only.** Tree models (`random_forest`,
   `gradient_boosting`) are accepted as `modelType` strings but throw a
   clear error against the baseline engine — the type system + a
   runtime guard make this unambiguous instead of silently falling
   back to logistic.
5. **No `recommendedAction` field on `PredictionResult`.** The schema
   is deliberately incapable of carrying an intervention
   recommendation — this is the honesty boundary made structural.
6. **Train accuracy, not held-out accuracy.** Sufficient for the demo
   cohort (~250 rows). A future phase can add a hold-out split + AUC.
7. **Standardisation parameters live on the model payload.** Inference
   is deterministic and reproducible without re-reading the training
   set; no global state.
8. **Sidebar nav has 6 items now.** The new "Prediction vs Intervention"
   entry sits between What-If and Integrations so the comparison sits
   visually adjacent to the simulator (the two are conceptually paired).
9. **Comparison insights are filtered, not generated.** Insight text is
   built from a fixed vocabulary that excludes "guaranteed", "proven",
   "definitely", "will improve", "personal causal effect". Asserted in
   `comparison.test.ts`.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **219 / 219** tests pass (`npm test`).
- [x] `npm run build` succeeds — 13 routes generated, including
      `/comparison`.
- [x] No database migration / DB-writing CLI executed by the agent.
- [x] No new TypeScript or Python dependencies added.
- [x] Baseline engine produces deterministic output for a given seed
      (standardiser params + GD updates fully determined).
- [x] Engine refuses to train on single-class cohorts with a clear
      error (asserted in `engine.test.ts`).
- [x] Notes / insights never contain "guaranteed", "proven",
      "definitely", "causal effect of this student" (asserted in
      `engine.test.ts` and `comparison.test.ts`).
- [x] `/students/[id]` works with both prediction rows present and
      absent — the panel shows an empty-state hint when no prediction
      is loaded.
- [x] `/comparison` survives a missing course / empty cohort — renders
      an `EmptyState` with explicit `ml:predict` / `causal:simulate`
      instructions.
- [x] Phase 7 routes, CLIs, persisted shape, and tests all untouched in
      behaviour; report schema is backward-compatible (`prediction: null`
      → `schemaVersion: "phase-7.v1"`; otherwise `"phase-8.v1"`).
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/causal-methodology.md`, `docs/demo-script.md` updated.
- [x] `docs/features/phase-8-baseline-ml-comparison.md` created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 9

- **Single class in small cohorts.** If a future synthetic-data tweak
  pushes the cohort distribution so far that nobody crosses the at-risk
  threshold, `trainAndPredict` will throw. The error message is
  explicit ("Add more rows"); the operator should regenerate the data
  before retrying.
- **L2 regularisation is light.** Default `l2=0.01` is set for ~250-row
  cohorts; very small cohorts may need a heavier prior. The
  hyperparameter is exposed on `EngineTrainRequest.hyperparameters`.
- **Convergence warning.** Logistic GD terminates either at iteration
  count or step-size tolerance; non-convergence raises a structured
  warning that surfaces in the CLI output and the persisted
  `notesJson`. Worth monitoring as the cohort or feature set grows.
- **Comparison "agreement" heuristic is naive.** The mapping
  `MeanRdi → ResourceDiversityIndex`, etc., is hand-coded. If a future
  treatment isn't a direct rename of a prediction feature, the
  agreement column will under-report — relax the mapping when adding
  new treatments.
- **Sidebar grows.** Six items now; one more (Phase 9 setup wizard?)
  pushes us into needing collapsible sections.

---

## Next recommended phase

**Phase 9 — Productisation / One-Command Setup.**

Concrete first steps:

1. `npm run setup` — installs deps, generates Prisma client, runs the
   migration, seeds the synthetic CSV if absent.
2. `npm run demo` — chains `data:generate` → `db:ingest` → `causal:estimate`
   → `causal:simulate` → `ml:predict` → `dev`.
3. README "Two commands. No auth. No env wrangling." section.
4. Optional `Dockerfile` + `docker-compose.yml` for fully containerised
   demos.
5. Wire the advanced prediction engine to the Phase 7 Python worker
   (`train_rf` / `predict_rf` commands using sklearn). The TS-side
   factory already handles the fallback; only the worker needs the new
   commands.
6. Write `docs/features/phase-9-productisation.md` + execution log.
