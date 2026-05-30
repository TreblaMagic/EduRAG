# Execution Log — Phase 1: Dataset & Data Model

- **Date:** 2026-05-24
- **Phase:** 1 — Dataset & Data Model
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 0 (foundation) — `docs/logs/2026-05-24-phase-0-foundation.md`

---

## Objective

Build the first runnable technical foundation: a Prisma schema for SQLite
(migratable to PostgreSQL) and a fully synthetic LMS dataset that exhibits
the behavioural patterns the Phase 3 causal engine expects to find.

**Explicitly out of scope for Phase 1:** UI screens, causal engine, CSV
importer implementation, npm install, database migrations.

---

## Files created

| Path                                                            | Purpose                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `package.json`                                                  | Next.js 15 + React 19 + TypeScript 5.6 + Prisma 5 + Tailwind 3.4 + scripts.  |
| `tsconfig.json`                                                 | Strict TS with `noUncheckedIndexedAccess`; `@/*` path alias to `./src/*`.    |
| `next.config.mjs`                                               | Minimal Next config — `reactStrictMode`.                                     |
| `tailwind.config.ts`                                            | Scans `src/{app,components,features}/**/*.{ts,tsx}`.                         |
| `postcss.config.mjs`                                            | Tailwind + autoprefixer.                                                     |
| `prisma/schema.prisma`                                          | 10-model schema (Student, Course, Enrollment, Resource, ActivityLog, WeeklyEngagementSummary, Grade, RdiScore, CausalEstimate, InterventionSimulation). |
| `scripts/generate_synthetic_dataset.py`                         | Std-lib-only synthetic LMS generator; seeded; CLI-configurable.              |
| `data/raw/sample_lms_data.csv`                                  | 48,929-row event log (git-ignored).                                          |
| `docs/features/phase-1-synthetic-dataset.md`                    | Per-feature specification for this phase.                                    |
| `docs/logs/2026-05-24-phase-1-dataset-and-model.md`             | This log.                                                                    |

## Files updated

| Path                          | Change                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/Plan.md`                | Phase 1 marked complete; status table updated; manual command list added.                           |
| `docs/data-model.md`          | Added `Enrollment` and `WeeklyEngagementSummary` entities; added "CSV → Prisma mapping" subsection; flagged `prisma/schema.prisma` as source of truth. |
| `README.md`                   | "Getting started" rewritten with concrete `npm` / `prisma` / `data:generate` commands; roadmap line for Phase 1 marked ✅. |

## Files removed

| Path                  | Reason                                       |
| --------------------- | -------------------------------------------- |
| `prisma/.gitkeep`     | Folder is now populated by `schema.prisma`.  |

---

## Commands run by the agent

| # | Command                                              | Outcome                                                                       |
| - | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1 | `python --version` / `node --version`                | Python 3.14.2, Node 20.20.0 confirmed.                                        |
| 2 | `python scripts/generate_synthetic_dataset.py`       | Wrote 48,929 events; clean group-level grade separation (24 → 74 mean range). |
| 3 | CSV self-verification (Python one-liner)             | Confirmed 250 distinct students, 14 weeks, 40 resources, 5 types, 5 actions.  |

---

## Commands the operator must run manually

Per `CLAUDE.md` (no destructive DB commands, no auto-installs):

```bash
# Install JS dependencies (first time only)
npm install

# Generate the Prisma client
npm run prisma:generate

# Create the SQLite database and apply schema as the initial migration
# (creates ./prisma/dev.db and prisma/migrations/<timestamp>_init/)
npx prisma migrate dev --name init

# (Optional) Regenerate the CSV with different parameters
python scripts/generate_synthetic_dataset.py --students 300 --weeks 14 --seed 7
```

> If `prisma migrate dev` is the first migration ever, Prisma will create the
> `prisma/migrations/` directory automatically. No SQL needs to be hand-rolled.

---

## Schema summary (`prisma/schema.prisma`)

| Model                     | Cardinality                          | Notes                                                       |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `Student`                 | 1 per learner                        | `externalId` unique for idempotent imports.                 |
| `Course`                  | 1 per offering                       | `code` unique; MVP uses `CS-201`.                           |
| `Enrollment`              | M-N bridge                           | Unique `(studentId, courseId)`.                             |
| `Resource`                | N per course                         | Enum-like `type` as String for SQLite portability.          |
| `ActivityLog`             | N per student-week                   | Indexed `(studentId, courseId, weekNumber)`.                |
| `WeeklyEngagementSummary` | 1 per student-course-week            | Pre-aggregated; written by Phase 2 pipeline.                |
| `Grade`                   | 1 per student-course                 | Unique `(studentId, courseId)`.                             |
| `RdiScore`                | 1 per student-course-week            | Normalised to [0, 1].                                       |
| `CausalEstimate`          | N per student × driver               | Method + bootstrap CI fields.                               |
| `InterventionSimulation`  | N per student                        | `changeJson` String → promote to Json on Postgres.          |

All IDs are `cuid()`; all child relations cascade on delete; all enum-like
fields are documented `String`s (Prisma enums on SQLite are not supported and
would block Postgres migration if used inconsistently).

---

## Dataset summary (`data/raw/sample_lms_data.csv`)

| Metric                          | Value                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| File size                       | 4.48 MB                                                                         |
| Rows (events)                   | **48,929**                                                                      |
| Students                        | 250                                                                             |
| Weeks                           | 14                                                                              |
| Resources                       | 40 (8 per type × 5 types)                                                       |
| Resource types                  | VIDEO, READING, QUIZ, FORUM, LAB                                                |
| Activity types                  | VIEW, SUBMIT, POST, COMMENT, DOWNLOAD                                           |
| Course                          | `CS-201` — Introduction to Data Structures                                      |
| Term start                      | 2026-01-12 (Monday)                                                             |
| RNG seed                        | 42 (deterministic; identical output on any machine)                             |
| Generator dependencies          | **None** (Python stdlib only)                                                   |

### Behaviour group breakdown (seed 42)

| Group                                | n  | Mean final grade |
| ------------------------------------ | -: | ---------------: |
| `high_engagement_high_performance`   | 46 | 73.70            |
| `high_login_low_diversity`           | 49 | 55.31            |
| `low_engagement_at_risk`             | 46 | 23.84            |
| `improving_over_time`                | 49 | 49.92            |
| `inconsistent_engagement`            | 60 | 44.86            |

The ~50-point spread between the strongest and weakest cohorts confirms the
data has enough signal for the Phase 3 causal engine to surface meaningful,
group-specific drivers.

---

## Assumptions made

1. **Single course in MVP** (`CS-201`). `Enrollment` is a real bridge table so
   multi-course support is a zero-migration extension later.
2. **Python script over a TS generator.** Python is the project's documented
   data/causal stack (architecture.md). Stdlib-only keeps the dependency
   surface flat in Phase 1 and avoids pandas/numpy install cost just for CSV
   writing.
3. **`scripts/` as a new top-level folder** for cross-language one-shot tools.
   Cleaner than mixing Python under `src/` (which is TypeScript-only).
4. **CSV is denormalised by design** — `prior_gpa` and `final_grade` repeat on
   every event row. This matches the Phase 1 task spec and makes the file
   trivially explorable in Excel / pandas without a join. The Phase 2 importer
   will normalise into the Prisma model.
5. **Enum-like fields as `String` in Prisma** rather than `enum`. SQLite has
   no native enum and Prisma enums require provider support — keeping `String`
   preserves Postgres portability as a one-line change later.
6. **Linear grade model with Gaussian noise.** Sufficient for demonstrating
   group-level effects and what-if simulation; real-world non-linearity is a
   stated limitation in the feature spec.
7. **`login_count` deferred to Phase 2.** It is not an event-level field; it
   is naturally derived from distinct active days per student-week during the
   preprocessing step.
8. **No `npm install` run by the agent.** Per `CLAUDE.md` workflow rule —
   operator runs install + migrate manually.

---

## Verifications

- [x] All 5 config files created and syntactically valid.
- [x] `prisma/schema.prisma` covers every model listed in the Phase 1 task spec
      (students, courses, course enrollments, learning resources, LMS activity
      logs, weekly engagement summaries, grades, RDI scores, causal model
      outputs, intervention simulations).
- [x] Generator runs end-to-end (`python scripts/generate_synthetic_dataset.py`),
      exits 0, produces a non-empty CSV.
- [x] CSV has all 12 required columns, 48,929 rows, 250 distinct students,
      weeks 1-14, 5 resource types, 5 activity types.
- [x] Group mean grades show clear separation (24-74 range).
- [x] `docs/Plan.md` updated — Phase 1 marked complete in status table + section.
- [x] `docs/data-model.md` updated — new entities + CSV mapping documented.
- [x] `docs/features/phase-1-synthetic-dataset.md` created.
- [x] `README.md` updated with concrete setup commands.
- [x] Timestamped log file created in `docs/logs/`.
- [x] No npm install, no migrations, no UI code added.

---

## Risks / things to watch in Phase 2

- **Importer idempotency.** The CSV's denormalised `prior_gpa` and `final_grade`
  must reduce to a single value per student. If the generator ever yields drift
  across rows for the same `student_id`, the importer must detect it. (It does
  not today — the generator backfills from a single source.)
- **Timezone handling.** All timestamps are UTC; the importer should preserve
  UTC and not localise.
- **Login derivation.** `login_count` will be derived as `count(distinct
  date_trunc('day', timestamp))` per `(student, course, week)`. Document this
  in the Phase 2 spec so reviewers understand it isn't directly in the CSV.
- **Validation.** The Phase 2 importer should validate via a small zod schema
  rather than trusting the CSV — per MasterRule §12 ("Do not trust CSV input
  blindly").

---

## Next recommended phase

**Phase 2 — Preprocessing & Feature Engineering.**

Concrete first steps:

1. Implement `src/server/ingest/import-csv.ts` (streaming reader, zod
   validation, batched Prisma transactions).
2. Implement `src/features/analytics/rdi.ts` — the RDI formula from
   `docs/data-model.md` §2, plus a typed `computeRdiForStudentWeek()` helper.
3. Implement `src/features/analytics/engagement.ts` — engagement score,
   consistency score, assessment trend.
4. Wire `npm run db:import -- --csv data/raw/sample_lms_data.csv`.
5. Write `docs/features/phase-2-preprocessing.md` and an execution log.
6. Append any required SQL or migration commands to `docs/Plan.md` for manual
   execution (do not run them).
