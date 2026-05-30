# Execution Log — Phase 4: Counterfactual / What-If Engine

- **Date:** 2026-05-25
- **Phase:** 4 — Counterfactual / What-If Engine
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 3 (`docs/logs/2026-05-25-phase-3-causal-graph-driver-identification.md`)

---

## Objective

Apply cohort-level causal estimates from Phase 3 to per-student feature
deltas, propagate the bootstrap CI to a projected grade range, rank the
resulting interventions by a usefulness-aware score, and persist them to
`InterventionSimulation` as the substrate for the Phase 5 dashboard.

Explicitly out of scope: UI screens, per-student CATE (heterogeneous
treatment effects), Python/DoWhy worker, auth, deploy.

---

## Files created

### Source

| Path                                                | Purpose                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/features/causal-engine/simulator.ts`           | Pure what-if engine: `simulateIntervention`, `simulateMultipleInterventions`, `rankRecommendedInterventions`, `computeCohortStats`, `STANDARD_INTERVENTIONS`. |
| `src/server/causal/run-simulations.ts`              | Orchestrator: features + cohort stats + estimates + persistence.       |
| `src/server/causal/simulate-cli.ts`                 | `npm run causal:simulate` entry point.                                 |

### Tests (22 new, 104 total — all green)

| Path                                                                       | Tests |
| -------------------------------------------------------------------------- | ----: |
| `src/features/causal-engine/__tests__/simulator.test.ts`                   | 22    |

### Docs

| Path                                                                          | Purpose                  |
| ----------------------------------------------------------------------------- | ------------------------ |
| `docs/features/phase-4-counterfactual-what-if-engine.md`                      | Per-feature spec.        |
| `docs/logs/2026-05-25-phase-4-counterfactual-what-if-engine.md`               | This log.                |

---

## Files updated

| Path                                              | Change                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                            | **Reshaped `InterventionSimulation`** (drop `changeJson`, `projectedDelta`; add 14 discrete fields incl. `courseId`, `treatment`, `appliedDelta`, `projectedGrade`, `projectedLow/High`, `rankScore`, `confidence`, `notesJson`, `@@unique`, two indexes). Added `interventions` relation on `Course`. Re-formatted by `prisma format`. |
| `package.json`                                    | Added script `causal:simulate`.                                                         |
| `src/features/causal-engine/index.ts`             | Re-export simulator symbols (`STANDARD_INTERVENTIONS`, `simulate*`, `rankRecommendedInterventions`, `computeCohortStats`, types). |
| `docs/Plan.md`                                    | Marked Phase 4 complete; expanded Phase 4 section with checklist + manual commands.     |
| `docs/causal-methodology.md`                      | Rewrote §6 (Counterfactual simulation) to match the implemented formulas, ranking, confidence labels, and the binding "cohort-average applied to this student" wording. |
| `docs/data-model.md`                              | Replaced the Phase-1 `InterventionSimulation` description with the new 17-field shape + honesty contract. |
| `README.md`                                       | Added step 9 (`causal:simulate`), reordered "What's in the box" to include the what-if simulator, bumped test count to 104. |

## Files removed

None.

---

## Commands run by the agent

| # | Command                                  | Result                                                          |
| - | ---------------------------------------- | --------------------------------------------------------------- |
| 1 | `npx prisma format`                      | Schema reformatted.                                             |
| 2 | `npx prisma validate`                    | ✅ Schema is valid.                                              |
| 3 | `npx prisma generate`                    | ✅ Prisma client regenerated.                                    |
| 4 | `npx tsc --noEmit`                       | ✅ Typecheck clean.                                              |
| 5 | `npm test` (initial)                     | 1 fail — ranking fixture's β·δ math was backwards.              |
| 6 | Fixed fixture (Forum β=0.1 not β=1)      | Test now asserts what it claims; added invariant check on sort. |
| 7 | `npm test` (final)                       | ✅ **9 files, 104 tests, all passed**.                           |

Per `CLAUDE.md`, the agent did **not** run any database migration or any
DB-writing CLI (`db:ingest`, `causal:estimate`, `causal:simulate`). Only
`prisma generate` and `npm test` (in-memory).

---

## Commands the operator must run manually

```bash
# 1. Apply the Phase 4 schema reshape of InterventionSimulation.
#    Drops + recreates the table (was empty so no data is lost).
npx prisma migrate dev --name phase4_intervention_simulations

# 2. Run intervention simulations.
#    Prerequisites: db:ingest (Phase 2) + causal:estimate (Phase 3) must have run.
npm run causal:simulate                          # course-wide CS-201
npm run causal:simulate -- --student STU-0042    # single student
npm run causal:simulate -- --top 3               # top-3 per student
npm run causal:simulate -- --json                # machine-readable summary

# 3. Re-run tests anytime (no DB required).
npm test
```

`prisma migrate dev` generates the migration from the schema diff
automatically — no raw SQL needed.

---

## Dependencies added

**None.** Phase 4 reuses the Phase 3 stack (Prisma client, vitest, tsx,
the in-house linear-algebra module). The simulator is ~300 LoC of pure
TypeScript.

---

## Simulator summary

| Property              | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Public functions      | `simulateIntervention`, `simulateMultipleInterventions`, `rankRecommendedInterventions`, `computeCohortStats`. |
| Inputs                | `FeatureRow` (student) + `InterventionProposal` + `CausalEstimateSummary` + `CohortStats`.        |
| Projection            | `projectedGrade = clamp[0,100]( baselineGrade + β·appliedDelta )`.                                |
| CI propagation        | `[ baseline + min(βlo, βhi)·δ, baseline + max(βlo, βhi)·δ ]`, both clamped to [0, 100].           |
| Headroom              | `max(0, min(cohort_mean+2·stdev, feature_bound.max) - baseline)`.                                 |
| Feature bounds        | RDI, QuizConsistency, Engagement bounded to [0, 1]; ForumParticipation and AssessmentTrend open.  |
| Honesty               | Required phrases + forbidden phrases enforced in code AND asserted by tests.                      |

---

## Intervention types implemented

`STANDARD_INTERVENTIONS` — 4 entries:

| Name                            | Treatment                | Δ        |
| ------------------------------- | ------------------------ | -------- |
| `increase_resource_diversity`   | `ResourceDiversityIndex` | +0.15    |
| `increase_forum_participation`  | `ForumParticipation`     | +3.0     |
| `improve_quiz_consistency`      | `QuizConsistency`        | +0.10    |
| `improve_assessment_trend`      | `AssessmentTrend`        | +0.10    |

Adding a new one is a single object in the array — the orchestrator,
ranker, and persistence handle the rest unchanged.

---

## Ranking logic summary

```
rankScore = max(0, projectedGrade - baselineGrade)            // sign-aware effect
          × (0.5 + 0.5 · weaknessScore)                        // bonus for below-cohort
          × confidence_weight[confidence]                      // 1.0 / 0.7 / 0.3
```

Where:

- `weaknessScore = clamp01(0.5 + 0.25 · z)` with `z = (cohort_mean - baseline) / cohort_stdev`.
  Below-cohort students get ≥ 0.5; well below get up to 1.0.
- `confidence_weight`: `high → 1.0`, `medium → 0.7`, `low → 0.3` based on
  Phase 3's persisted refutation pass count (both / one / none).
- `max(0, gain)`: interventions the model expects to *hurt* the grade
  score 0 and are filtered out of recommendations by ranking.

A student already at the cohort ceiling for a high-β feature gets
`appliedDelta = 0` (headroom is zero) → `rankScore = 0`. This prevents
"recommend more X" for already-strong students.

---

## Persistence summary

One row per `(student, course, intervention)`, unique-constrained.
**17 columns:**

```
id  studentId  courseId  interventionName  treatment
baselineValue  proposedValue  appliedDelta  estimatedEffect
baselineGrade  projectedGrade  projectedLow  projectedHigh
rankScore  confidence  explanation  notesJson  generatedAt
```

Indexes:
- `@@index([courseId, treatment])` — "all RDI sims in CS-201"
- `@@index([courseId, rankScore])` — "top recommendations for this course"

`notesJson` carries `{ assumptions[], headroom, weaknessScore }` — kept
out of the column set to leave room to evolve without further migrations.

The CLI **only** deletes simulation rows in scope (full course, or one
student if `--student` is given). Raw activity, weekly summaries, course
features, and causal estimates are never touched.

---

## Tests added and results

```
✓ src/features/analytics/__tests__/rdi.test.ts                       (12)
✓ src/features/analytics/__tests__/engagement.test.ts                (16)
✓ src/server/ingest/__tests__/row-schema.test.ts                     (10)
✓ src/features/causal-engine/__tests__/dag.test.ts                   (15)
✓ src/features/causal-engine/__tests__/linear-algebra.test.ts        (13)
✓ src/features/causal-engine/__tests__/feature-table.test.ts         ( 5)
✓ src/features/causal-engine/__tests__/estimator.test.ts             ( 6)
✓ src/features/causal-engine/__tests__/refutation.test.ts            ( 5)
✓ src/features/causal-engine/__tests__/simulator.test.ts             (22) ← NEW

Test Files  9 passed (9)
     Tests  104 passed (104)
```

Coverage focus per the Phase 4 task list:

- Delta application ✓ (β·δ added to baseline; treatment-mismatch throws)
- Grade clamping ✓ (huge positive β AND huge negative β both clamped to [0, 100])
- CI propagation ✓ (range uses min/max(βlo, βhi)·δ; order preserved even when β<0)
- Recommendation ordering ✓ (sorted desc; topN truncation; weakness reorders; confidence downweights)
- Explanation language avoids overclaiming ✓ (loop over every standard intervention, asserting `guaranteed`/`proven`/`definitely`/`will improve` never appear)
- Persistence payload shaping ✓ (verified by typecheck of `dataRows` mapping in `run-simulations.ts`; per-field assertions on `simulator.ts` outputs)

---

## Assumptions made

1. **Reshape `InterventionSimulation`** rather than overload `changeJson`.
   The Phase 1 shape was a placeholder; cohort-level β + per-student delta
   needs ~14 discrete fields, not one JSON blob.
2. **`STANDARD_INTERVENTIONS` is a static catalogue.** A future phase
   could let advisors author custom interventions through the UI; for
   the demo, four well-chosen levers cover every behaviour group.
3. **Cohort ceiling = mean + 2·stdev.** Conservative (≈ p97 under
   normality) without requiring percentile sorting. Skewed cohorts will
   be poorly served; documented as a known limitation.
4. **Confidence = refutation pass count.** Simpler than a per-estimate
   uncertainty model. Maps directly to a categorical chip the dashboard
   can render.
5. **`notesJson` for `assumptions[]` + `headroom` + `weaknessScore`** —
   keeps the column set focused on what the dashboard reads while
   leaving an extension slot for future provenance.
6. **Cohort β applied to this student.** Per-student CATE is out of
   scope; we enforce the wording everywhere.
7. **Wipe-by-scope** for re-runs. Cleanest semantics for idempotent
   recomputation without contrived unique keys.
8. **TypeScript-only.** No DoWhy / Python worker; the math is small and
   stays auditable.

---

## Verifications

- [x] Prisma schema validates (`npx prisma validate`).
- [x] Prisma client regenerates without warnings (`npx prisma generate`).
- [x] Full project typechecks under strict mode (`npx tsc --noEmit`).
- [x] All 104 unit tests pass (`npm test`).
- [x] No database migration, no DB-writing CLI executed by the agent.
- [x] No UI / API routes added.
- [x] Honesty contract enforced *in code*: forbidden phrases asserted-not-present by tests; required phrases asserted-present.
- [x] `docs/Plan.md` updated — Phase 4 complete + manual commands listed.
- [x] `docs/features/phase-4-counterfactual-what-if-engine.md` created.
- [x] `docs/causal-methodology.md` §6 reflects implemented formulas.
- [x] `docs/data-model.md` reflects reshaped `InterventionSimulation`.
- [x] `README.md` lists `causal:simulate` in the getting-started flow.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 5

- **Confidence chips matter.** The dashboard MUST surface
  `confidence === "low"` and CI-spans-zero conditions prominently. Don't
  bury them; they're the honesty backbone of the demo.
- **Top-N filtering.** Default the dashboard to top-3 per student; show
  the rest in a "More options" disclosure to avoid drowning advisors
  with five lukewarm recommendations.
- **Cold-start edge case.** A new student with no `CourseFeatureSummary`
  row will produce zero simulations — the dashboard needs a clear
  empty-state message ("Not enough activity yet — check back after
  week 2").
- **Cohort skew.** The `mean + 2·stdev` headroom assumes vaguely-normal
  feature distributions. If a real LMS dataset shows heavy skew (e.g.
  forum participation is zero for 60% of students), switch to a
  percentile-based ceiling in Phase 5+.
- **Counterfactual stacking.** The simulator currently treats each
  intervention independently; the UI should not display a "combined gain"
  number without re-running the estimator with a joint design matrix.

---

## Next recommended phase

**Phase 5 — Dashboard UI.**

Concrete first steps:

1. Scaffold the Next.js App Router routes (`/`, `/students/[id]`,
   `/causal-graph`, `/what-if`, `/upload`).
2. Read-only server components / actions that query Prisma directly
   (`Grade`, `CourseFeatureSummary`, `RdiScore`, `WeeklyEngagementSummary`,
   `CausalEstimate`, `InterventionSimulation`).
3. Cohort grid (overview) — top driver per student, risk indicator.
4. Student profile — engagement timeline (Recharts), top intervention
   cards (read from `InterventionSimulation` ORDER BY `rankScore` DESC).
5. Causal graph view — render `toDagJson()` with React Flow.
6. What-if simulator — slider per treatment that re-calls
   `simulateIntervention` via a server action.
7. Honesty UX patterns: confidence chips inline, CI ranges paired with
   every projected number, low-confidence flags never hidden.
8. Write `docs/features/phase-5-dashboard-ui.md` + execution log.
