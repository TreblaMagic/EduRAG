# Feature Spec — Phase 3: Causal Graph & Driver Identification

> The first **causal analysis layer**: a transparent DAG, a persisted
> per-student feature table, cohort-level effect estimation with bootstrap
> CIs, and lightweight refutation checks. Outputs are surfaced as
> *model-based estimates*, never as proven causality.

---

## 1. What was implemented

### 1.1 Pure causal-engine modules *(no Prisma dependency)*

| File                                                | Exports                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `src/features/causal-engine/dag.ts`                 | `CAUSAL_NODES`, `CAUSAL_EDGES`, `BASELINE_ADJUSTERS`, `adjustmentSetFor`, `parentsOf`, `childrenOf`, `buildAdjacency`, `topologicalSort`, `isDag`, `toDagJson`, types. |
| `src/features/causal-engine/rng.ts`                 | `mulberry32` seeded PRNG.                                            |
| `src/features/causal-engine/linear-algebra.ts`      | `zeros`, `identity`, `transpose`, `matmul`, `matvec`, `invert`, `ols`. |
| `src/features/causal-engine/feature-table.ts`       | `toFeatureRow` (pure), `buildFeatureTable` (Prisma-backed), types.   |
| `src/features/causal-engine/estimator.ts`           | `estimateEffectPoint`, `estimateEffect`, types.                      |
| `src/features/causal-engine/refutation.ts`          | `runRefutations` (placebo + random common cause), types.             |
| `src/features/causal-engine/index.ts`               | Public re-exports.                                                   |

### 1.2 Server orchestration

| File                                            | Role                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `src/server/causal/derive-features.ts`          | Builds + persists `CourseFeatureSummary` from WES + RdiScore.  |
| `src/server/causal/run-estimates.ts`            | Estimates all 4 treatments + refutes + persists `CausalEstimate`. |
| `src/server/causal/cli.ts`                      | `npm run causal:estimate` entry point.                         |
| `src/server/ingest/cli.ts` *(extended)*         | Also calls `deriveCourseFeatures` after weekly derivation.     |

### 1.3 Schema changes

```diff
+ model CourseFeatureSummary { … 11 fields … unique(studentId, courseId) }

  model CausalEstimate {
-   studentId      String          // per-student — wrong shape for cohort ATE
-   driver         String
+   courseId       String          // cohort-level
+   treatment      String
+   outcome        String
+   adjustmentSet  String          // JSON
+   ciLevel        Float
+   sampleSize     Int
+   bootstrapIters Int
+   refutationJson String?         // JSON
+   notesJson      String?         // JSON
    // estimate, ciLow, ciHigh, method, generatedAt remain
+   @@unique([courseId, treatment, outcome])
  }

  model Student  {  +courseFeatures CourseFeatureSummary[]  -causalEstimates }
  model Course   {  +courseFeatures CourseFeatureSummary[]  +causalEstimates }
```

> **No data is lost.** `CausalEstimate` was empty when this phase began
> (nothing in Phase 1/2 wrote to it). The reshape corrects an inherited
> Phase-1 design bug where the model was per-student but the data is
> per-cohort. Per-student counterfactual deltas live in
> `InterventionSimulation` (Phase 4).

---

## 2. The DAG (assumed structure)

> **Honesty constraint** (binding for all code and copy): outputs labelled
> *estimated effect*, *model-based driver*, *simulated relationship*.
> Never *proven cause* or *guaranteed*. See `docs/causal-methodology.md` §7.

**Nodes (7):** `PriorGPA`, `Engagement`, `ResourceDiversityIndex`,
`ForumParticipation`, `QuizConsistency`, `AssessmentTrend`, `FinalGrade`.

**Edges (10):**

| From                     | To                       | Rationale                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| `PriorGPA`               | `Engagement`             | Stronger baseline learners engage earlier and more consistently.          |
| `PriorGPA`               | `FinalGrade`             | Direct predictive path beyond current engagement.                         |
| `Engagement`             | `ResourceDiversityIndex` | More engaged students explore broader resource types.                     |
| `Engagement`             | `ForumParticipation`     | Forum activity is downstream of overall engagement.                       |
| `ResourceDiversityIndex` | `AssessmentTrend`        | Broader practice modes lift assessment trajectory over time.              |
| `ResourceDiversityIndex` | `FinalGrade`             | Diverse resource use raises outcomes beyond what trend alone captures.    |
| `ForumParticipation`     | `FinalGrade`             | Forum participation correlates with deeper learning + grade lift.         |
| `QuizConsistency`        | `AssessmentTrend`        | Stable quiz performance shapes the visible trend.                         |
| `QuizConsistency`        | `FinalGrade`             | Consistent quiz performance lifts the final grade.                        |
| `AssessmentTrend`        | `FinalGrade`             | Improving trajectory leads to higher outcomes.                            |

The DAG is **cycle-checked** at construction (Kahn's algorithm in
`topologicalSort`) and exported as JSON via `toDagJson()` for the Phase 5
UI and offline tooling.

---

## 3. Causal feature table

One row per `(student, course)`. Sourced from `CourseFeatureSummary` joined
with `Student.priorGpa` and `Grade.finalGrade`.

| Field                    | Source                                          |
| ------------------------ | ----------------------------------------------- |
| `studentId`              | `CourseFeatureSummary.studentId`                |
| `courseId`               | `CourseFeatureSummary.courseId`                 |
| `PriorGPA`               | `Student.priorGpa`                              |
| `Engagement`             | `CourseFeatureSummary.meanEngagement`           |
| `ResourceDiversityIndex` | `CourseFeatureSummary.meanRdi`                  |
| `ForumParticipation`     | `CourseFeatureSummary.forumParticipation`       |
| `QuizConsistency`        | `CourseFeatureSummary.quizConsistency`          |
| `AssessmentTrend`        | `CourseFeatureSummary.assessmentTrend`          |
| `FinalGrade`             | `Grade.finalGrade`                              |

Reusable by:

- **Causal estimation** (`estimateEffect`) — Phase 3.
- **What-if simulator** (`InterventionSimulation`) — Phase 4 will apply β
  coefficients to per-student feature deltas.
- **Dashboard summaries** — Phase 5 surfaces per-student feature snapshots
  and cohort distributions.

The pure mapper `toFeatureRow` is decoupled from Prisma so tests can build
fixtures without a database connection.

---

## 4. Estimation method

For each treatment `T → FinalGrade`:

```
FinalGrade_i = β_0 + β_T · T_i + Σ β_z · z_i + ε_i      for z ∈ adjustment(T)
```

| Component       | Choice                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Estimator       | **Ordinary Least Squares** via normal equations: `β = (X'X)⁻¹ X'y`.     |
| Inversion       | Gauss-Jordan with partial pivoting (small design matrices).             |
| Confidence int. | **Percentile bootstrap**, default 500 resamples, seeded for repro.      |
| Treatments      | `{ ResourceDiversityIndex, ForumParticipation, QuizConsistency, AssessmentTrend }`. |
| Outcome         | `FinalGrade`.                                                           |

### Adjustment variables

The MVP uses a **conservative baseline rule**:

```
adjustment(T) = { PriorGPA, Engagement } \ { T }
```

This blocks the two strongest known confounders (`PriorGPA` and
`Engagement`) without blocking mediation paths. Practical effect per
treatment:

| Treatment                | Adjustment set         |
| ------------------------ | ---------------------- |
| `ResourceDiversityIndex` | `{ PriorGPA, Engagement }` |
| `ForumParticipation`     | `{ PriorGPA, Engagement }` |
| `QuizConsistency`        | `{ PriorGPA, Engagement }` |
| `AssessmentTrend`        | `{ PriorGPA, Engagement }` |

We deliberately did **not** implement a full backdoor-criterion algorithm.
The rule is documented, conservative, and easy to defend in a demo. A
future phase can swap in a DAG-aware backdoor solver (or DoWhy via a
Python worker) behind the same `estimateEffect` signature.

### What `CausalEstimate` records

| Column            | Carries                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `treatment`       | DAG node name being intervened on.                                        |
| `outcome`         | DAG node name being predicted (usually `FinalGrade`).                     |
| `adjustmentSet`   | JSON-encoded `CausalNode[]` actually fitted.                              |
| `estimate`        | β_T point estimate.                                                       |
| `ciLow` / `ciHigh`/ `ciLevel` | Percentile bootstrap CI bounds and confidence level.          |
| `sampleSize`      | n used in the regression.                                                 |
| `method`          | `"backdoor_ols"`.                                                         |
| `bootstrapIters`  | Resample count used to build the CI.                                      |
| `refutationJson`  | JSON `RefutationResult` (see §5).                                         |
| `notesJson`       | JSON `{ limitations: string[] }`.                                         |

---

## 5. Refutation checks

Both implemented in `refutation.ts` and persisted in `refutationJson`.

### 5.1 Placebo / shuffled-treatment test

Shuffle the treatment column across rows and re-fit. The estimated effect
should approach zero. Reported as:

```ts
{ originalEstimate, placeboEstimate, ratio, threshold: 0.30, passes }
```

`passes` iff `|β_placebo| / |β_original| < 0.30`.

### 5.2 Random common cause test

Add a uniform random covariate `U(-1, 1)` to the adjustment set and re-fit.
The estimate should be stable. Reported as:

```ts
{ originalEstimate, adjustedEstimate, absChange, relativeChange, threshold: 0.25, passes }
```

`passes` iff `|β_adjusted − β_original| / |β_original| < 0.25`.

### 5.3 What's *not* in MVP

- **Subset robustness** (refitting on random sub-samples) — deferred until
  a Python worker brings DoWhy's full refutation catalogue.
- **DoWhy** integration in general — deferred to Phase 4+ if precision
  needs grow beyond what OLS provides.

Failed refutations are **not** silently suppressed: they are logged
explicitly by `run-estimates.ts` and Phase 5 will surface them as
confidence flags in the dashboard. We never report an effect without its
refutation outcome.

---

## 6. Tests

Vitest, **82 tests total, all passing.** Phase 3 added 44 new tests across
five files:

| File                                                            | Tests | Focus                                                       |
| --------------------------------------------------------------- | ----: | ----------------------------------------------------------- |
| `src/features/causal-engine/__tests__/dag.test.ts`              | 15    | Edge validity, cycle detection, topological sort, parents/children, adjustment set, JSON roundtrip. |
| `src/features/causal-engine/__tests__/linear-algebra.test.ts`   | 13    | Identity / transpose / matmul / matvec / inversion / OLS on known coefficients. |
| `src/features/causal-engine/__tests__/feature-table.test.ts`    |  5    | Pure mapper preserves IDs, projects every DAG node, vectors are independent copies. |
| `src/features/causal-engine/__tests__/estimator.test.ts`        |  6    | Recovers known effects within tolerance, CI brackets the point estimate, sample-size guard. |
| `src/features/causal-engine/__tests__/refutation.test.ts`       |  5    | Placebo passes for real effects, random common cause is stable, reports finite numbers even on null effects. |

Run: `npm test` (or `npm run test:watch`).

---

## 7. Known limitations

- **Synthetic data is generated to match the DAG**, so on this dataset the
  estimator recovers its own assumptions by construction. Real-world
  generalisation is not claimed.
- **Linear functional form.** Non-linearities and interactions are not
  captured. Bias is unmeasured.
- **Conservative adjustment rule.** Doesn't implement the full backdoor
  criterion; some causal paths may be over- or under-adjusted depending on
  the treatment. Documented in §4.
- **No instrumental variables, no propensity-score matching.** Single
  estimator family.
- **Bootstrap is non-parametric percentile.** Doesn't reflect model
  misspecification — only sampling variance.
- **`CausalEstimate` is cohort-level only.** Per-student CATE (heterogeneous
  treatment effects) is a Phase 4+ concern; today's `InterventionSimulation`
  applies cohort β to per-student feature deltas.

---

## 8. Next steps (Phase 4 — Counterfactual / What-If Engine)

1. Add `src/features/causal-engine/simulator.ts` — `simulateIntervention(student, change)`
   reads cohort β from `CausalEstimate`, applies to per-student feature
   deltas, returns projected outcome + propagated CI.
2. Add `src/server/causal/run-simulations.ts` and a CLI (`npm run causal:simulate`).
3. Persist results to `InterventionSimulation` (per-student rows).
4. Generate plain-English recommendations per student (top-3 actionable
   levers ranked by `|β| × headroom`).
5. Write `docs/features/phase-4-counterfactual-engine.md` + execution log.
6. Surface refutation pass/fail prominently in the simulator output so a
   weak driver never silently anchors a recommendation.
