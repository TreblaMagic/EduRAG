# Phase 8 — Baseline ML Comparison

> Status: **complete (2026-05-28)**. Baseline TypeScript logistic-regression
> always available; comparison UI ships on `/students/[id]` and
> `/comparison`. No new runtime dependencies; advanced (Python) path is a
> forward-looking hook with graceful fallback.

## 1. Goal

Make the project's value proposition immediately understandable: a
recruiter glancing at the dashboard should see, side-by-side, the
difference between a traditional risk-prediction tool and EduRAG's
causal intervention layer.

> Traditional ML: *"This student is likely at risk."*
> EduRAG: *"These are the likely drivers and what to change."*

The baseline ML layer exists *only* as a comparison surface. The causal
engine remains the primary system. The new layer never recommends an
intervention.

## 2. Architecture

```
                       ┌──────────────────────────────────┐
                       │    PredictionEngine interface    │
                       │  (src/features/baseline-ml/      │
                       │            types.ts)             │
                       └────────────────┬─────────────────┘
                                        │
                ┌───────────────────────┼───────────────────────────┐
                │                                                   │
        ┌───────▼────────┐                                 ┌────────▼─────────┐
        │ Baseline (TS)  │                                 │ Advanced (hook)  │
        │ Logistic regr. │                                 │ Phase 9 sklearn  │
        │ + L2 + GD      │                                 │  (not shipped)   │
        └───────┬────────┘                                 └────────┬─────────┘
                │                                                   │
       ┌────────▼───────────────────────────────────────────────────▼────────┐
       │           selectPredictionEngine(name)                              │
       │  baseline → baselinePredictionEngine                                │
       │  advanced → falls back to baseline + warning                        │
       └──────────────────────────────┬──────────────────────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │                                        │
        ┌─────────▼──────────┐                  ┌──────────▼──────────┐
        │ trainAndPredict    │                  │  buildCausalReport  │
        │  (orchestrator)    │                  │   (Phase 7 + 8)     │
        └─────────┬──────────┘                  └──────────┬──────────┘
                  │                                        │
                  ▼                                        ▼
       BaselinePrediction (Prisma)             /api/causal/report?prediction=1
                  │
                  ▼
         /students/[id] (panel) + /comparison (cohort table)
```

The baseline engine mirrors the Phase 7 `CausalEngine` pattern exactly so
the orchestrator and UI stay engine-agnostic. The advanced engine slot is
wired but resolves to baseline with a warning today — see §10 for the
rationale.

## 3. Baseline model

| Choice                       | Value                                                   |
| ---------------------------- | ------------------------------------------------------- |
| Model family                 | Binary logistic regression                              |
| Optimiser                    | Batch gradient descent + L2                             |
| Default iterations           | 400                                                     |
| Default learning rate        | 0.1                                                     |
| Default L2                   | 0.01                                                    |
| Default threshold            | 0.5                                                     |
| Target                       | `at_risk = final_grade < 55` (same threshold as the UI) |
| Features (in order)          | PriorGPA, MeanEngagement, MeanRdi, ForumParticipation, QuizConsistency, AssessmentTrend, MeanLoginsPerWeek |
| Standardisation              | Column-wise mean/std at train time, re-applied at inference (params stored on the model payload) |
| Confidence label             | `high` (\|p − threshold\| ≥ 0.30), `medium` (≥ 0.15), `low` otherwise |
| Feature importance           | Signed standardised coefficient β                       |
| Dependencies                 | **None** (pure TypeScript, reuses no other module)      |

Honesty rules enforced in code + tests:

- Notes say *"probabilistic prediction"* and *"feature importance ≠ causal effect"*.
- The result type has **no `recommendedAction` field**. There is no path
  from prediction to recommendation inside the prediction layer.
- The UI always pairs the prediction panel with a banner clarifying that
  prediction tells you *who*, not *what to change*.

## 4. Prediction pipeline

```
prisma.courseFeatureSummary + prisma.grade
        │
        ▼
buildFeatureTable (Phase 3 helper — never re-implemented)
        │
        ▼
trainAndPredict(course, { engine, modelType, threshold })
        │
        ├─ selectPredictionEngine(engine)
        ├─ engine.train({ rows, threshold })
        ├─ engine.predict({ model, rows })
        ├─ deleteMany({ courseId, modelType })       ← idempotent
        └─ create rows on BaselinePrediction
        ▼
TrainAndPredictSummary { riskDistribution, trainLogLoss, trainAccuracy, warnings, ... }
```

The orchestrator runs *training and inference together* because the
dataset is small (~250 students, < 1 s end-to-end). When the cohort
grows or a heavier model is introduced, split into separate
`ml:train` and `ml:predict` CLIs without changing the engine
interface.

## 5. Persistence

New Prisma model (additive, non-destructive):

```prisma
model BaselinePrediction {
  id                    String   @id @default(cuid())
  studentId             String
  courseId              String
  modelType             String       // "logistic" today
  predictedRiskProb     Float
  predictedGrade        Float?       // null for classification-only models
  riskClass             String       // "at-risk" | "borderline" | "on-track"
  predictionConfidence  String       // "high" | "medium" | "low"
  threshold             Float
  featureImportanceJson String
  notesJson             String
  generatedAt           DateTime @default(now())

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  course  Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([studentId, courseId, modelType])
  @@index([courseId, modelType])
  @@index([courseId, predictedRiskProb])
}
```

`featureImportanceJson` and `notesJson` are JSON-encoded strings — promote
to native `Json` on Postgres.

## 6. Comparison UI

Two surfaces:

### `/students/[id]`

The new `<PredictionVsInterventionCard>` sits between the timeline charts
and the ranked-intervention list. Two columns:

- **Traditional Prediction** — P(at-risk), predicted class, top-3
  predictor bars, honesty box ("identifies WHO; does NOT recommend WHAT
  TO CHANGE").
- **EduRAG Causal Output** — top intervention with projected gain, CI
  range, applied Δ, confidence chip, honesty box ("counterfactual
  estimate; not a personal guarantee").

A footer renders 2–4 *insights* from `buildComparison()`:

- Whether prediction and intervention pivot on the same lever.
- Whether the strongest predictor differs from the top causal target
  (with the explicit "feature importance ≠ causal effect" framing).
- Whether the top projected lift is actionable (≥ 0.5 grade points).
- A "prediction tells you WHO; intervention tells you WHAT TO CHANGE"
  closer.

### `/comparison`

Cohort-wide table: one row per student, prediction columns on the left,
intervention columns on the right. Four summary tiles at the top —
"Students compared", "Predicted at-risk", "Agree on lever", "Disagree on
lever".

Downloadable Markdown + JSON report links in the page header — the
report sources from `buildCausalReport({ includePrediction: true })`.

## 7. Comparison report

The Phase 7 report builder gained an opt-in prediction section. Set
`includePrediction: true` to add:

- Model metadata: type, threshold, train log-loss, train accuracy.
- Risk distribution counts.
- Agreement / disagreement counts vs the causal top intervention.
- One row per student with: P(at-risk), risk class, top predictor (β),
  top intervention (treatment + confidence), projected gain, agreement
  flag.
- Honest "Notes" section explaining what the section is and is not.

When the prediction section is populated, the report's `schemaVersion`
flips to `phase-8.v1` (still backward-compatible — the `prediction`
field is just `null` for `phase-7.v1`).

## 8. CLIs and routes added

| Surface                                   | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run ml:predict`                      | Train + predict + persist for one course.            |
| `--engine baseline\|advanced`             | Engine selector (advanced falls back today).         |
| `--model logistic`                        | Model selector (only logistic supported).            |
| `--threshold P`                           | Probability threshold for the at-risk class.         |
| `--json`                                  | Machine-readable summary on stdout.                  |
| `npm run causal:report -- --prediction`   | Include the comparison section in the report.        |
| `GET /api/causal/report?prediction=1`     | Same flag exposed over HTTP.                         |
| `/comparison` (route)                     | Cohort-level prediction-vs-intervention table.       |

## 9. Honest framing (enforced by code + tests)

- `notes` strings emitted by `baselinePredictionEngine` never contain
  *"guaranteed"*, *"proven"*, *"definitely"*, or *"causal effect of this
  student"*. Asserted in `engine.test.ts`.
- `buildComparison` insights are filtered against the same vocabulary.
  Asserted in `comparison.test.ts`.
- The `PredictionResult` type has no field that could be misread as an
  intervention recommendation.
- UI banners on both `/students/[id]` and `/comparison` say
  *"feature importance ≠ causal effect"* and
  *"identifies WHO; does NOT recommend WHAT TO CHANGE"*.

## 10. Limitations

- **Logistic only.** No tree-based or boosted models. The "advanced"
  engine slot is wired in `selectPredictionEngine` but currently falls
  back to baseline with a structured warning. Phase 9+ can hook into
  the Phase 7 Python worker (`python/causal-worker/worker.py`) — the
  worker protocol is generic enough to support `train_rf` /
  `predict_rf` commands without further refactoring.
- **No cross-validation, no calibration.** The reported accuracy is the
  *training* accuracy. For demo-cohort sizes (≈250 rows) this is fine;
  for real evaluation, hold out a fold.
- **At-risk threshold is hard-coded** (55, matching the UI). Multi-class
  or grade-regression targets are not supported; `predictedGrade` is
  always `null` in this phase.
- **One model per course.** Re-training overwrites prior rows for the
  same `(course, modelType)` pair. Versioning would belong to a future
  phase.
- **No SHAP / permutation importance** in the TS baseline. The reported
  importance is just the standardised β; for tree models this would be
  feature-importance via the worker.

## 11. Future research / Phase 9 hooks

- Wire the advanced Python prediction engine via the Phase 7 worker —
  add `train_rf` / `predict_rf` commands, ship sklearn's
  `RandomForestClassifier` + permutation importance.
- Add held-out fold metrics (precision / recall / AUC) to the report.
- Persist a per-cohort calibration curve to surface "20%-predicted-risk
  students actually fail X% of the time".
- Add a *prediction-only* model variant on the causal-graph page — show
  the recruiter what a black-box predictor would have said for a chosen
  student.

## 12. File map

### Created

| Path                                                          | Purpose                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/features/baseline-ml/types.ts`                           | `PredictionEngine` interface, `PredictionResult`, training row, feature names.         |
| `src/features/baseline-ml/constants.ts`                       | `AT_RISK_THRESHOLD` shared with the UI.                                                |
| `src/features/baseline-ml/logistic-regression.ts`             | Pure-TS L2 logistic regression (sigmoid + batch GD).                                   |
| `src/features/baseline-ml/standardise.ts`                     | Mean/std fit + apply.                                                                  |
| `src/features/baseline-ml/comparison.ts`                      | `buildComparison()` insights generator.                                                |
| `src/features/baseline-ml/engine/baseline-prediction-engine.ts` | TS baseline engine.                                                                 |
| `src/features/baseline-ml/engine/index.ts`                    | `selectPredictionEngine` factory with structured fallback.                             |
| `src/features/baseline-ml/index.ts`                           | Barrel.                                                                                |
| `src/server/prediction/train-and-predict.ts`                  | Server orchestrator (reads features → trains → predicts → persists).                   |
| `src/server/prediction/cli.ts`                                | `npm run ml:predict` CLI.                                                              |
| `src/server/queries/predictions.ts`                           | `getPredictionForStudent`, `getPredictionsForCourse`.                                  |
| `src/components/PredictionVsInterventionCard.tsx`             | Side-by-side panel on `/students/[id]`.                                                |
| `src/app/comparison/page.tsx`                                 | Cohort-wide comparison table + summary tiles + download links.                         |
| `src/features/baseline-ml/__tests__/logistic-regression.test.ts` | 7 tests.                                                                            |
| `src/features/baseline-ml/__tests__/engine.test.ts`           | 8 tests.                                                                               |
| `src/features/baseline-ml/__tests__/comparison.test.ts`       | 6 tests.                                                                               |
| `docs/features/phase-8-baseline-ml-comparison.md`             | This spec.                                                                             |
| `docs/logs/2026-05-28-phase-8-baseline-ml-comparison.md`      | Execution log.                                                                         |

### Updated

| Path                                              | Change                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                            | Added `BaselinePrediction` model + relations on `Student` and `Course`.                    |
| `src/server/queries/students.ts`                  | `StudentDetail.prediction` field; parallel fetch from `BaselinePrediction`.                |
| `src/app/students/[id]/page.tsx`                  | Mounts `<PredictionVsInterventionCard>` between charts and intervention list.              |
| `src/components/Sidebar.tsx`                      | Added "Prediction vs Intervention" nav item.                                               |
| `src/lib/intervention-language.ts`                | Added `predictionFeatureLabel()` mapping for the new feature names.                        |
| `src/features/causal-engine/report/types.ts`      | Added `ReportPredictionRow` + `ReportPredictionSection`; `schemaVersion` now union.        |
| `src/features/causal-engine/report/markdown.ts`   | Renders the new prediction section when present; section numbering shifts accordingly.     |
| `src/features/causal-engine/report/index.ts`      | Re-exports the new types.                                                                  |
| `src/features/causal-engine/index.ts`             | Re-exports prediction-section types from the barrel.                                       |
| `src/server/causal/build-report.ts`               | Optional prediction section via `includePrediction: true`.                                 |
| `src/server/causal/report-cli.ts`                 | Added `--prediction` flag.                                                                 |
| `src/app/api/causal/report/route.ts`              | Added `?prediction=1` query param.                                                         |
| `package.json`                                    | Added `ml:predict` script.                                                                 |
| `docs/Plan.md`                                    | Phase 8 marked complete; manual commands documented.                                       |
| `README.md`                                       | Roadmap row + setup section + Comparison route description.                                |
| `docs/architecture.md`                            | Added §10 — baseline ML comparison.                                                        |
| `docs/causal-methodology.md`                      | Added section §10 contrasting prediction and causal inference.                             |
| `docs/demo-script.md`                             | Inserted Phase 8 step in the 2-minute walkthrough.                                         |

**Totals: 21 new tests (+219 cumulative passing) · typecheck clean · build clean (13 routes added /comparison).**
