# Execution Log — Phase 2: Preprocessing & Feature Engineering

- **Date:** 2026-05-24
- **Phase:** 2 — Preprocessing & Feature Engineering
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 1 (`docs/logs/2026-05-24-phase-1-dataset-and-model.md`)

---

## Objective

Implement the preprocessing + feature-engineering layer that turns
`data/raw/sample_lms_data.csv` into normalised SQLite records plus
calculated weekly engagement features. **Pure analytics modules** (RDI,
engagement, consistency, trend) sit behind an **ingestion pipeline** that
orchestrates Prisma writes via a single `npm run db:ingest` CLI.

Explicitly out of scope for Phase 2: UI screens, causal engine, auth, prod
deploy, destructive DB commands.

---

## Files created

### Source

| Path                                                          | Purpose                                              |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/db.ts`                                               | Prisma client singleton (HMR-safe).                  |
| `src/lib/logger.ts`                                           | Level-aware logger driven by `LOG_LEVEL`.            |
| `src/features/analytics/rdi.ts`                               | Pure RDI (normalised entropy, catalogue-aware).      |
| `src/features/analytics/engagement.ts`                        | Pure weekly + term-level engagement metrics.         |
| `src/server/ingest/row-schema.ts`                             | Typed CSV row validator.                             |
| `src/server/ingest/csv-reader.ts`                             | CSV file → `{ rows, errors }`.                       |
| `src/server/ingest/ingest-csv.ts`                             | CSV → Prisma orchestrator.                           |
| `src/server/ingest/derive-summaries.ts`                       | Buckets activity, writes `WES` + `RdiScore`.         |
| `src/server/ingest/cli.ts`                                    | `npm run db:ingest` entry point.                     |
| `vitest.config.ts`                                            | Vitest config (Node env, `src/**/*.test.ts`).        |

### Tests (38 total, all passing)

| Path                                                              | Tests | Focus                                    |
| ----------------------------------------------------------------- | ----: | ---------------------------------------- |
| `src/features/analytics/__tests__/rdi.test.ts`                    | 12    | RDI edge cases + catalogue parameter.    |
| `src/features/analytics/__tests__/engagement.test.ts`             | 16    | summariseWeek + consistency + trend.     |
| `src/server/ingest/__tests__/row-schema.test.ts`                  | 10    | Happy path + every failure mode.         |

### Docs

| Path                                                                              | Purpose                          |
| --------------------------------------------------------------------------------- | -------------------------------- |
| `docs/features/phase-2-preprocessing-feature-engineering.md`                      | Per-feature spec.                |
| `docs/logs/2026-05-24-phase-2-preprocessing-feature-engineering.md`               | This log.                        |

---

## Files updated

| Path                              | Change                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `package.json`                    | Added `csv-parse`, `tsx`, `vitest`; added scripts `db:ingest`, `test`, `test:watch`.|
| `prisma/schema.prisma`            | Added `Resource.externalId @unique`; added `activityCount`, `quizSubmissionCount`, `resourceTypeCount` on `WeeklyEngagementSummary`. Re-formatted by `prisma format`. |
| `docs/Plan.md`                    | Marked Phase 2 complete; expanded the Phase 2 section with the full checklist and manual commands. |
| `docs/data-model.md`              | Updated `Resource` table (added `external_id`); updated `WeeklyEngagementSummary` table (added 3 new fields, noted term-level helpers are pure-only). |
| `README.md`                       | Added steps 7-8 (`db:ingest`, `npm test`) and a "What's in the box" entry for the analytics + ingest layer. |

## Files removed

| Path                            | Reason                              |
| ------------------------------- | ----------------------------------- |
| `src/lib/.gitkeep`              | Folder now populated (`db.ts`, `logger.ts`). |
| `src/server/.gitkeep`           | Folder now populated (`ingest/`).            |
| `src/features/.gitkeep`         | Folder now populated (`analytics/`).         |

---

## Commands run by the agent

| # | Command                                  | Result                                                    |
| - | ---------------------------------------- | --------------------------------------------------------- |
| 1 | `node --version` (earlier session)       | v20.20.0 confirmed (Vitest 2 / tsx 4 / Prisma 5 compatible). |
| 2 | `npm install --no-audit --no-fund`       | **155 packages, 54 s.**                                   |
| 3 | `cp .env.example .env`                   | Local `.env` (git-ignored) so `DATABASE_URL` resolves.    |
| 4 | `npx prisma format`                      | Schema formatted (auto-aligned).                          |
| 5 | `npx prisma validate`                    | ✅ Schema is valid.                                       |
| 6 | `npx prisma generate`                    | ✅ Prisma Client v5.22.0 generated.                       |
| 7 | `npx tsc --noEmit`                       | ✅ Typecheck clean (0 errors).                            |
| 8 | `npm test`                               | ✅ **3 files, 38 tests, all passed** (~15 ms test exec).  |

---

## Commands the operator must run manually

```bash
# Only required if you have NOT yet applied a Prisma migration.
# This produces ./prisma/migrations/<timestamp>_phase2_ingest_and_engagement/
# and creates ./prisma/dev.db with the full Phase 2 schema.
npx prisma migrate dev --name phase2_ingest_and_engagement

# Ingest the synthetic CSV (loads ~49 k rows, computes WES + RDI).
npm run db:ingest

# Variants:
npm run db:ingest -- --csv path/to/other.csv
npm run db:ingest -- --skip-derive

# Re-run the unit tests anytime (no DB required).
npm test
```

Per `CLAUDE.md`, the agent did **not** run any database migration or
`db:ingest` execution — only `prisma generate` (a pure code-generation step
that does not touch the database).

---

## Dependencies added

| Package      | Version    | Scope    | Justification                                                                                 |
| ------------ | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| `csv-parse`  | ^5.5.6     | runtime  | Industry-standard streaming/sync CSV parser; correct quoting handling out of the box.         |
| `vitest`     | ^2.1.0     | dev      | Test runner explicitly listed in the project stack (`architecture.md`).                       |
| `tsx`        | ^4.19.0    | dev      | Zero-config TypeScript execution for the `db:ingest` CLI without an extra build step.         |

Total new install: **3 direct packages** (155 transitive — typical for a Node 20 + Next 15 + Prisma 5 + Vitest 2 setup, dominated by `next`, `react`, `@prisma/engines`, `esbuild`, and `vite`).

---

## Ingestion summary (what `db:ingest` will produce on the seed dataset)

When run by the operator, the pipeline will write:

| Target                          | Approx. rows | Source                                              |
| ------------------------------- | -----------: | --------------------------------------------------- |
| `Course`                        | 1            | distinct `course_id` in CSV (`CS-201`).             |
| `Student`                       | 250          | distinct `student_id`.                              |
| `Resource`                      | 40           | distinct `resource_id`.                             |
| `Enrollment`                    | 250          | distinct `(student_id, course_id)`.                 |
| `ActivityLog`                   | 48,929       | every CSV row.                                      |
| `Grade`                         | 250          | denormalised `final_grade` reduced per student.     |
| `WeeklyEngagementSummary`       | 3,491        | one per non-empty (student, course, week) bucket.   |
| `RdiScore`                      | 3,491        | one per non-empty (student, course, week) bucket.   |

*(WES / RdiScore counts: 250 students × 14 weeks = 3,500 theoretical max; the
`low_engagement_at_risk` group has some weeks with zero events, yielding
~3,491 non-empty buckets.)*

---

## RDI formula summary

```
p_i  = fraction of total weighted activity on resource type i
H    = -Σ p_i · log2(p_i)         (Shannon entropy, base 2)
RDI  = H / log2(N_catalogue)      ∈ [0, 1]    where N_catalogue = 5
```

- Single type used → 0
- All 5 used evenly → 1
- 2 of 5 used evenly → log2(2)/log2(5) ≈ 0.43

Catalogue-normalised (not observed-normalised), so breadth — not just
evenness — drives the score upward. This is the property the causal engine
needs to distinguish *high-login-low-diversity* from
*high-engagement-high-performance*.

---

## Weekly summary metrics implemented

`activityCount` · `totalDurationSeconds` · `loginCount` (distinct UTC dates)
· `submissionCount` · `quizSubmissionCount` · `forumPosts` ·
`resourceTypeCount` · `averageQuizScore` · `engagementScore` (0-1 composite).

Term-level (pure, not persisted yet): `consistencyScore`, `trendSlope`.

---

## Tests added

```
✓ src/features/analytics/__tests__/rdi.test.ts          (12 tests)
✓ src/server/ingest/__tests__/row-schema.test.ts        (10 tests)
✓ src/features/analytics/__tests__/engagement.test.ts   (16 tests)

Test Files  3 passed (3)
     Tests  38 passed (38)
```

Coverage focus exactly matches the Phase 2 task list:

- RDI calculation ✓
- Empty resource usage handling ✓
- Single resource type handling ✓
- Multiple resource type handling ✓
- Weekly aggregation helper logic ✓ (the whole `summariseWeek` surface)
- Plus: consistency / trend, validator edge cases.

---

## Assumptions made

1. **TypeScript throughout** for ingest + analytics. Prisma is the
   integration boundary; Python is reserved for Phase 3's causal engine.
2. **csv-parse over a hand-rolled parser.** Correctness on edge cases (quotes,
   escapes, line endings) is worth one well-supported runtime dep.
3. **No `zod` for validation.** The validation surface is small and stable.
   `zod` is a low-risk upgrade if cross-row constraints appear later.
4. **`Resource.externalId`** chosen over reusing the generator ID as the
   Prisma `id`. Keeps every model on cuid IDs (consistent), and matches the
   existing `Student.externalId` pattern.
5. **WES schema extended** rather than overloaded. Adding 3 explicit counter
   columns is cheaper and clearer than packing them into a JSON blob.
6. **Replace-by-student** for `ActivityLog`. No natural composite unique
   key exists; this is the cleanest idempotent semantics for re-imports.
7. **Term-level metrics not persisted yet.** `consistencyScore` and
   `trendSlope` are pure functions, unit-tested. Persistence (likely a new
   `CourseSummary` model) is deferred to Phase 3 alongside the causal
   engine's actual feature requirements.
8. **Course-wide RDI computed on read**, not stored. Avoids a sentinel
   `weekNumber` value that would break the unique constraint.
9. **Local `.env` created from `.env.example`** for `prisma generate`. The
   file is git-ignored per Phase 0; the agent never committed it.
10. **No migration applied.** Per `CLAUDE.md`'s explicit rule, schema
    migrations are documented for manual execution.

---

## Verifications

- [x] All files created compile under `tsc --noEmit` with strict mode + `noUncheckedIndexedAccess`.
- [x] Prisma schema validates (`npx prisma validate`).
- [x] Prisma client regenerates without warnings (`npx prisma generate`).
- [x] All 38 unit tests pass (`npm test`).
- [x] No db / migrate commands run by the agent.
- [x] No UI / API routes / causal engine code added.
- [x] `docs/Plan.md` updated — Phase 2 marked complete in status table + section; manual command list appended.
- [x] `docs/features/phase-2-preprocessing-feature-engineering.md` created.
- [x] `docs/data-model.md` updated to reflect schema additions.
- [x] `README.md` updated with `db:ingest` + `npm test` commands.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 3

- **Re-running `db:ingest` deletes derived rows** (`WES`, `RdiScore`) and
  the activity rows for the importer's student set. Safe by design; flag
  this prominently when the causal engine starts caching estimates against
  those rows in Phase 3.
- **Coupling between the heuristic `engagementScore` and the causal engine.**
  If Phase 3 re-fits weights from outcomes, document the change explicitly
  in `causal-methodology.md` so downstream readers see why the composite
  shifted.
- **`Student.externalId` is unique, but the CSV could in principle drift**
  on `prior_gpa` across rows for the same student. The Phase 1 generator
  backfills uniformly, but a real LMS export might not. Consider a
  validation pass that flags intra-student drift.
- **`activityType` and `resourceType` are still `String` in Prisma.** When
  the project migrates to Postgres, promote them to true `enum`s in the
  same migration that flips the provider.

---

## Next recommended phase

**Phase 3 — Causal Graph & Driver Identification.**

Concrete first steps:

1. Encode the DAG (from `docs/causal-methodology.md` §3) in
   `src/features/causal-engine/dag.ts` as a typed graph definition.
2. Stand up a thin Python service (FastAPI or a CLI worker) using DoWhy /
   NetworkX / scikit-learn to estimate `ATE(D → Grade)` for
   `D ∈ {RDI, ForumParticipation, QuizConsistency}` with `{PriorGPA, Engage}`
   as the backdoor adjustment set.
3. Persist results in `CausalEstimate` via a thin Node bridge (already
   modelled in `prisma/schema.prisma`).
4. Add refutation checks: random common cause + placebo treatment.
5. Promote `consistencyScore` / `trendSlope` from pure helpers into the
   feature set the causal engine reads from.
6. Write `docs/features/phase-3-causal-engine.md` + execution log.
7. Append any new SQL or migration commands to `Plan.md` for manual run.
