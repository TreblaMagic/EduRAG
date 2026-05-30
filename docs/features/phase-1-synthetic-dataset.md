# Feature Spec — Phase 1: Dataset & Data Model

> Implements the first runnable technical foundation: a Prisma schema for
> SQLite (migratable to Postgres) and a fully synthetic LMS activity dataset
> designed to exercise the future RDI engine and causal simulator.

---

## 1. What was implemented

### 1.1 App / TypeScript foundation

Minimal Next.js scaffolding so subsequent phases have a runnable starting
point. **No pages or UI yet** — only configuration:

| File                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `package.json`        | Next.js 15 + React 19 + TypeScript 5.6 + Prisma 5 + Tailwind 3.4. |
| `tsconfig.json`       | Strict TS, `noUncheckedIndexedAccess`, `@/*` path alias. |
| `next.config.mjs`     | Minimal — `reactStrictMode: true`.                       |
| `tailwind.config.ts`  | Scans `src/{app,components,features}/**/*.{ts,tsx}`.     |
| `postcss.config.mjs`  | Tailwind + autoprefixer pipeline.                        |

`npm install` is **not** run automatically — it must be run manually by the
operator. See `README.md` and the "Commands to run manually" section below.

### 1.2 Prisma schema

`prisma/schema.prisma` defines **10 models** covering all data the project
will need from Phase 1 through Phase 4:

| Model                     | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `Student`                 | Learner record with `externalId` for ingest mapping.    |
| `Course`                  | Course offering (`code`, `title`, `weeks`).             |
| `Enrollment`              | Many-to-many bridge (student × course).                 |
| `Resource`                | A learning artefact within a course.                    |
| `ActivityLog`             | Raw LMS event (atomic unit of behaviour).               |
| `WeeklyEngagementSummary` | Pre-aggregated weekly metrics (written by Phase 2).     |
| `Grade`                   | Final grade per student × course.                       |
| `RdiScore`                | Resource Diversity Index per student × course × week.   |
| `CausalEstimate`          | Causal engine output (Phase 3).                         |
| `InterventionSimulation`  | What-if engine output (Phase 4).                        |

**Postgres-migration discipline** (documented at the top of `schema.prisma`):

- All IDs use `cuid()` — portable across SQLite and Postgres.
- Enum-like fields (`Resource.type`, `ActivityLog.activityType`, etc.) are
  modelled as `String` with a comment listing valid values, because SQLite
  has no native enum support. On Postgres these can be promoted to true
  Prisma `enum` definitions in a single migration.
- `InterventionSimulation.changeJson` is stored as `String` (serialised JSON);
  on Postgres it can be promoted to `Json` (JSONB) without other shape changes.
- Cascading deletes and indexes are declared in the same form for both DBs.

### 1.3 Synthetic dataset generator

`scripts/generate_synthetic_dataset.py` — **standard-library Python only,
zero new dependencies.** Produces `data/raw/sample_lms_data.csv`:

```
python scripts/generate_synthetic_dataset.py [--students 250] [--weeks 14] [--seed 42]
```

Defaults: 250 students × 14 weeks × 40 resources → **48,929 events**.

The generator is deterministic (seeded) and CLI-configurable, so the dataset
can be regenerated identically on any machine.

---

## 2. Dataset fields

Each CSV row represents a single LMS activity event.

| Column             | Type     | Notes                                                            |
| ------------------ | -------- | ---------------------------------------------------------------- |
| `student_id`       | string   | `STU-####`, stable identifier.                                   |
| `course_id`        | string   | `CS-201` (single course in MVP).                                 |
| `week_number`      | int      | 1 — 14.                                                          |
| `resource_id`      | string   | `CS-201-<TYP>-###`.                                              |
| `resource_type`    | enum     | `VIDEO` \| `READING` \| `QUIZ` \| `FORUM` \| `LAB`.              |
| `activity_type`    | enum     | `VIEW` \| `SUBMIT` \| `POST` \| `COMMENT` \| `DOWNLOAD`.         |
| `timestamp`        | ISO-8601 | UTC, within the event's week.                                    |
| `duration_seconds` | int      | Per-event duration, sampled from type-appropriate ranges.        |
| `quiz_score`       | float?   | 0-100, populated only when `resource_type=QUIZ` + `activity_type=SUBMIT`. |
| `forum_posts`      | int      | `1` when the row is a forum `POST` event, else `0` (sum for week totals). |
| `prior_gpa`        | float    | 0-4.0, denormalised on every row.                                |
| `final_grade`      | float    | 0-100, denormalised on every row.                                |

---

## 3. Behaviour groups

Each student is randomly assigned to one of five groups, weighted to produce
a realistic cohort distribution. Group profiles drive event counts, resource
mix, quiz performance, and the linear-model coefficients used to compute the
final grade.

| Group                                | Weight | Profile                                                                                                                |
| ------------------------------------ | :----: | ---------------------------------------------------------------------------------------------------------------------- |
| `high_engagement_high_performance`   | 20%    | 18-32 events/week, balanced resource mix, quiz mean 85, prior GPA 3.0-4.0 → final grade ~ **74**.                      |
| `high_login_low_diversity`           | 15%    | 16-28 events/week but **80% on VIDEO**, quiz mean 62 → final grade ~ **55** despite high activity (low effective RDI). |
| `low_engagement_at_risk`             | 20%    | 0-5 events/week, quiz mean 45, prior GPA 1.5-2.8 → final grade ~ **24**.                                               |
| `improving_over_time`                | 20%    | Events ramp linearly (×0.3 → ×1.5), quiz mean trends +20 across term → final grade ~ **50**.                           |
| `inconsistent_engagement`            | 25%    | Wide weekly variance (0-22 events), quiz scores noisy → final grade ~ **45**.                                          |

Actual cohort distribution (seed 42): 46 / 49 / 46 / 49 / 60 students respectively.

**Why these groups matter.** Each group encodes a different causal story:

- *High-engagement* validates the headline driver (engagement → grade).
- *High-login / low-diversity* is the canonical case for **RDI as a separate
  causal driver from raw engagement** — without it, the system would falsely
  conclude that "log more = pass more."
- *At-risk* anchors the intervention recommendation flow.
- *Improving* exercises trend-based features.
- *Inconsistent* exercises the consistency score and confidence intervals.

---

## 4. Schema decisions

- **`Student.externalId` (unique)**: lets imports of the same CSV be idempotent
  without exposing the cuid PK to the source system.
- **`Enrollment` is a real model, not implicit**: even though MVP enforces one
  course per student, an explicit bridge makes the multi-course extension a
  zero-migration change.
- **`WeeklyEngagementSummary` is a stored table, not a view**: SQLite views
  are read-only and don't index well; a materialised table is cheaper to read
  during dashboard rendering and is the natural output of the Phase 2 pipeline.
- **Enum-like fields stored as `String`**: SQLite has no native enums; using
  `String` keeps the schema portable while comments document valid values.
- **`changeJson` as `String`, not `Json`**: SQLite has no native JSON type;
  promotion to `Json` (JSONB) is a one-line change on Postgres.
- **Cascading deletes on every child relation**: keeps test resets and
  re-imports clean; production multi-tenancy will revisit this.

---

## 5. Seed / import plan *(placeholder — implemented in Phase 2)*

This phase intentionally does **not** include an import implementation. The
plan for Phase 2 is:

1. `src/server/ingest/import-csv.ts` — streaming CSV reader (no full-file
   load), validates each row with a zod schema (added when needed).
2. Upserts `Course` from distinct `course_id`s, then `Resource` from distinct
   `(resource_id, resource_type)` pairs, then `Student` from distinct
   `(student_id, prior_gpa)` pairs.
3. Batches `ActivityLog` inserts (e.g. 500/transaction) to keep memory bounded.
4. Creates `Grade` rows from the `final_grade` column (one per student).
5. Computes `WeeklyEngagementSummary` and `RdiScore` rows in the same pass.
6. Exposed as an npm script (`npm run db:import`) and as a CLI in
   `src/server/ingest/cli.ts`.

Database migration commands are documented in `docs/Plan.md` per the
project rule (`CLAUDE.md` workflow rule) and must be run manually by the
operator — never by the agent.

---

## 6. Limitations

- Single course only (`CS-201`). Multi-course modelling deferred.
- Synthetic data is generated *to match* the assumed causal structure — by
  construction the causal engine will recover its own assumptions on this
  data. Real-world generalisation is not claimed.
- The grade model is linear with Gaussian noise; the real world is not.
- `login_count` is not explicit in the CSV; Phase 2's preprocessing will
  derive it from distinct-active-day counts per student-week.
- Forum events are coarsely modelled (one of POST/COMMENT/VIEW); thread
  structure and reply depth are not represented.

---

## 7. Next steps (Phase 2)

1. Implement the CSV → SQLite importer (`src/server/ingest/`).
2. Compute and store `WeeklyEngagementSummary` and `RdiScore`.
3. Add a thin CLI: `npm run db:import -- --csv data/raw/sample_lms_data.csv`.
4. Smoke-test by querying aggregate counts via Prisma.
