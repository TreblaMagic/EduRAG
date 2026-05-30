# Feature Spec — Phase 4: Counterfactual / What-If Engine

> The **demo-anchor piece.** Applies cohort-level causal estimates (from
> Phase 3) to per-student feature deltas and produces ranked,
> honesty-constrained intervention recommendations. Persisted to
> `InterventionSimulation` for the Phase 5 dashboard.

---

## 1. What was implemented

### 1.1 Pure simulator *(no Prisma dependency)*

| File                                                      | Exports                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/features/causal-engine/simulator.ts`                 | `STANDARD_INTERVENTIONS`, `simulateIntervention`, `simulateMultipleInterventions`, `rankRecommendedInterventions`, `computeCohortStats`, types. |

### 1.2 Server orchestration

| File                                              | Role                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/server/causal/run-simulations.ts`            | `runSimulations` — orchestrates feature table + cohort stats + estimates + persistence.|
| `src/server/causal/simulate-cli.ts`               | `npm run causal:simulate` entry point.                                                 |

### 1.3 Schema changes

```diff
  model InterventionSimulation {
-   studentId      String
-   changeJson     String
-   projectedDelta Float
-   explanation    String
+   studentId        String
+   courseId         String
+   interventionName String
+   treatment        String
+   baselineValue    Float
+   proposedValue    Float
+   appliedDelta     Float
+   estimatedEffect  Float
+   baselineGrade    Float
+   projectedGrade   Float
+   projectedLow     Float
+   projectedHigh    Float
+   rankScore        Float
+   confidence       String
+   explanation      String
+   notesJson        String
+   @@unique([studentId, courseId, interventionName])
+   @@index([courseId, treatment])
+   @@index([courseId, rankScore])
  }
  model Course   {  +interventions InterventionSimulation[]  }
```

> Non-destructive: the previous `InterventionSimulation` table was empty
> when this phase began. **Migration command:**
> `npx prisma migrate dev --name phase4_intervention_simulations`.

---

## 2. Simulator design

```
                ┌─────────────────────────────┐
FeatureRow ────►│  simulateIntervention()      │
InterventionProposal ────►                     │──► SimulatedIntervention
CausalEstimateSummary ────►                    │     (with explanation)
CohortStats ────►                              │
                └─────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │ simulateMultipleInterventions
                │ (loop over a catalogue,      │
                │  skip if no estimate)        │──► SimulatedIntervention[]
                └─────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │ rankRecommendedInterventions │──► top-N by rankScore desc
                └─────────────────────────────┘
```

For each `(student, intervention)` pair:

```
baselineValue   = row.features[treatment]
baselineGrade   = row.features.FinalGrade

headroom        = max(0, min(cohort_mean+2·cohort_stdev, feature_bound.max) - baselineValue)
appliedDelta    = clamp(requestedDelta, 0, headroom) + clamp_to_feature_bounds
proposedValue   = baselineValue + appliedDelta

projectedGrade  = clamp[0,100]( baselineGrade + β·appliedDelta )
projectedLow    = clamp[0,100]( baselineGrade + min(β_lo, β_hi)·appliedDelta )
projectedHigh   = clamp[0,100]( baselineGrade + max(β_lo, β_hi)·appliedDelta )

weaknessScore   = clamp01( 0.5 + 0.25 · (cohort_mean - baselineValue) / cohort_stdev )
confidence      = "high"   if both refutations passed
                  "medium" if exactly one passed
                  "low"    otherwise

rankScore = max(0, projectedGrade - baselineGrade)
          × (0.5 + 0.5 · weaknessScore)
          × confidence_weight[confidence]   // 1.0 / 0.7 / 0.3
```

---

## 3. Intervention types implemented

`STANDARD_INTERVENTIONS` (in `simulator.ts`) — each entry is small,
plausibly-actionable, and unit-aware.

| Name                            | Treatment                | Δ        | Action hint                                                       |
| ------------------------------- | ------------------------ | -------- | ----------------------------------------------------------------- |
| `increase_resource_diversity`   | `ResourceDiversityIndex` | +0.15    | Explore quizzes, forums, and labs in addition to videos.          |
| `increase_forum_participation`  | `ForumParticipation`     | +3.0     | Post or comment in the forum a few more times each week.          |
| `improve_quiz_consistency`      | `QuizConsistency`        | +0.10    | Space quiz practice across the week so weekly scores stay steady. |
| `improve_assessment_trend`      | `AssessmentTrend`        | +0.10    | Re-review weak earlier topics so quiz scores trend upward.        |

Adding a new intervention is one PR: a single object in
`STANDARD_INTERVENTIONS`. The estimator + persistence handle the rest.

---

## 4. Ranking logic

> *"Don't just rank by β. Rank by usefulness."*

`rankScore` is a product of four factors, each grounded in a different
honesty/usefulness concern:

| Factor               | What it captures                                                            | Why it matters                                                          |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `projectedGain ≥ 0`  | Effect direction.                                                           | We never recommend a change the model expects to *hurt* the grade.      |
| `appliedDelta`       | The actually-applicable change after headroom clamping.                     | A student near the cohort ceiling can't gain much from this lever.      |
| `weaknessScore`      | Below-cohort-mean = higher bonus.                                           | Don't tell a strong student to "improve" what they're already strong in. |
| `confidence_weight`  | Refutation pass count → 1.0 / 0.7 / 0.3.                                    | A wobbly estimate should not anchor a high-confidence recommendation.   |

The result: a high-β feature where the student is already maxed out gets
`rankScore = 0`. A medium-β feature where the student is weak and the
estimate passed both refutation checks rises to the top.

---

## 5. Persistence format

Every simulation row records the full provenance — never just the final
number. This is what makes the dashboard explainable.

| Group          | Fields                                                            |
| -------------- | ----------------------------------------------------------------- |
| **Identity**   | `studentId`, `courseId`, `interventionName`, `treatment`.         |
| **Inputs**     | `baselineValue`, `proposedValue`, `appliedDelta`.                 |
| **Model**     | `estimatedEffect` (β used), `baselineGrade`.                      |
| **Outputs**   | `projectedGrade`, `projectedLow`, `projectedHigh`.                |
| **Ranking**   | `rankScore`, `confidence` (`high`/`medium`/`low`).                |
| **Narrative** | `explanation` (controlled vocab), `notesJson` (assumptions[], headroom, weaknessScore). |
| **Metadata**  | `generatedAt`.                                                    |

Unique on `(studentId, courseId, interventionName)`. Indexed by
`(courseId, treatment)` and `(courseId, rankScore)` so the dashboard can
read the top-N per course in one query.

---

## 6. Honesty / limitation language *(binding contract)*

### Required phrasing — present in every explanation

- `"model-based"`
- `"cohort-average"`
- `"estimated improvement range"`

### Forbidden phrasing — must never appear

- `"guaranteed"` (or `"guarantee"`)
- `"proven"`
- `"definitely"`
- `"will improve"`
- `"will increase"`

These are **enforced by unit test**
(`simulator.test.ts` → "never contains forbidden overclaim phrases" loops
over every entry in `STANDARD_INTERVENTIONS`). Adding a new intervention
that introduces banned phrasing fails CI.

### Adaptive caveats appended when conditions warrant

| Condition                                           | Caveat appended to `explanation`                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| CI spans zero (`projectedLow < 0 < projectedHigh`)  | *"The model cannot rule out no effect."*                                        |
| Applied delta < requested delta (headroom clamped)  | *"Headroom limited the requested change of +X to +Y."*                          |
| `confidence === "low"`                              | *"Confidence is low: refutation checks did not pass."*                          |
| `confidence === "medium"`                           | *"Confidence is medium: only one refutation check passed."*                     |

The base sentence is always:

> *"Changing X from a to b projects a final-grade change of +d points
> (estimated improvement range: +lo to +hi). Cohort-average effect of β
> grade points per unit X is applied to this student. Model-based
> simulation; recommendation based on current model assumptions."*

---

## 7. Tests

Vitest, **104 tests total, all passing.** Phase 4 added 22 simulator
tests:

| Section                          | Tests | Focus                                                              |
| -------------------------------- | ----: | ------------------------------------------------------------------ |
| Delta application                | 3     | β·δ added to baseline, identity carried through, mismatch throws.  |
| Clamping                         | 2     | Projected grade & CI bounds in [0, 100] for huge / negative β.     |
| Headroom                         | 2     | Theoretical max (RDI ≤ 1) + cohort ceiling both honoured.          |
| CI propagation                   | 2     | Range uses `min(βlo, βhi)..max(βlo, βhi)·δ`, ordered correctly.    |
| Explanation language (honesty)   | 5     | Forbidden phrases never appear; required phrases always appear; CI-spans-zero / low confidence / headroom caveats fire. |
| Ranking                          | 5     | Sorted desc; truncated when topN; weakness bonus reorders; confidence downweighting. |
| Multiple interventions           | 1     | Skips treatments without estimates.                                |
| Cohort stats                     | 2     | Mean/stdev correct; empty cohort handled.                          |

Run: `npm test` (or `npm run test:watch`).

---

## 8. Known limitations

- **Cohort β applied per student** — heterogeneous treatment effects
  (CATE) not modelled. The wording always says *"cohort-average effect
  applied to this student"*.
- **Linear extrapolation.** The same β is applied at every point on the
  treatment scale. Real effects may diminish at extremes.
- **No interaction terms.** Stacking two interventions is approximated as
  the sum of their independent effects — the simulator doesn't currently
  re-fit β for the joint move.
- **Headroom uses Gaussian-style `mean + 2·stdev`.** Cohorts that are
  highly skewed will be poorly served; a percentile-based version is a
  cheap follow-up.
- **Feasibility is only via headroom + delta size.** No model of
  cost/effort per intervention (e.g. "3 forum posts is easier than
  improving quiz consistency by 0.10"). That's a domain-knowledge
  layer for a future phase.
- **In-memory cohort table.** Fine at our scale (≤ a few thousand
  students); a true LMS deployment would chunk by cohort or course
  block.
- **`InterventionSimulation` writes via `createMany`.** No transaction
  wrapping the entire run; if it crashes mid-write, re-running the CLI
  recovers cleanly because we always delete-by-scope first.

---

## 9. Next steps (Phase 5 — Dashboard UI)

1. **Overview** — cohort grid with risk indicators and top driver per student.
2. **Student profile** — engagement timeline, RDI breakdown, top 3
   intervention cards (read from `InterventionSimulation` ordered by
   `rankScore` desc, filtered to `confidence ≠ "low"` by default).
3. **Causal graph view** — render `toDagJson()` with React Flow / Cytoscape.
4. **What-if simulator UI** — slider per treatment that re-issues
   `simulateIntervention` via a server action.
5. **Honesty UX** — every projected number paired with its CI range and
   confidence chip; failed-refutation flags inline, not buried.
6. Write `docs/features/phase-5-dashboard-ui.md` + execution log.
