# Feature Spec — Phase 2: Preprocessing & Feature Engineering

> Turns `data/raw/sample_lms_data.csv` into normalised SQLite records and
> calculated weekly engagement features. Implements the **pure analytics
> layer** (RDI, engagement, consistency, trend) plus the **ingestion
> pipeline** that orchestrates Prisma writes.

---

## 1. What was implemented

### 1.1 Pure analytics modules *(zero database dependency)*

| File                                          | Exports                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `src/features/analytics/rdi.ts`               | `computeRdi`, `buildUsageFromDurations`, `RESOURCE_TYPES`, `TOTAL_RESOURCE_TYPES`, types. |
| `src/features/analytics/engagement.ts`        | `summariseWeek`, `consistencyScore`, `trendSlope`, `ACTIVITY_TYPES`, types. |

These are framework-free TypeScript and exercise no I/O — that is what makes
them unit-testable and reusable by the Phase 3 causal simulator.

### 1.2 Ingestion pipeline

| File                                          | Role                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `src/server/ingest/row-schema.ts`             | Per-row validation (typed errors, no runtime validation library).       |
| `src/server/ingest/csv-reader.ts`             | `readAndValidateCsv` — single function, returns `{ rows, errors }`.     |
| `src/server/ingest/ingest-csv.ts`             | `ingestCsv` — upserts Courses/Students/Resources/Enrollments/Grades and bulk-inserts ActivityLog. |
| `src/server/ingest/derive-summaries.ts`       | `deriveAllSummaries` — buckets by `(student, course, week)`, writes WeeklyEngagementSummary + RdiScore. |
| `src/server/ingest/cli.ts`                    | Thin CLI invoked by `npm run db:ingest`.                                |

### 1.3 Supporting infrastructure

| File                | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `src/lib/db.ts`     | Prisma client singleton (HMR-safe).                                     |
| `src/lib/logger.ts` | Level-aware logger driven by `LOG_LEVEL`.                               |
| `vitest.config.ts`  | Minimal Vitest config — `src/**/*.test.ts`, Node environment.           |

---

## 2. Ingestion flow

```
sample_lms_data.csv
        │
        ▼
┌───────────────────────┐
│ readAndValidateCsv()  │  csv-parse (sync) + per-row validator
└───────────────────────┘
        │
        ▼   { rows: ValidatedRow[], errors: ValidationError[] }
┌───────────────────────┐
│ ingestCsv()           │  Upserts:
│                       │    1. Course (by code)
│                       │    2. Student (by externalId)
│                       │    3. Resource (by externalId)
│                       │    4. Enrollment (by (student, course))
│                       │  Replace-by-student:
│                       │    5. ActivityLog (createMany, 1k batches)
│                       │  Upsert:
│                       │    6. Grade (by (student, course))
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│ deriveAllSummaries()  │  deleteMany then:
│                       │    7. WeeklyEngagementSummary (createMany, 1k batches)
│                       │    8. RdiScore (createMany, 1k batches)
└───────────────────────┘
```

**Idempotency.** Running `npm run db:ingest` twice on the same CSV yields the
same database state. Catalogue tables are `upsert`ed; `ActivityLog` is
`deleteMany` + `createMany` scoped to the importer's student set; derived
tables are wiped before regeneration.

**Why not per-row upserts on `ActivityLog`?** There is no natural composite
unique key (a student can VIEW the same resource at the same second in
synthetic data), so any contrived key would be misleading. Replace-by-student
is the cleanest semantics for re-imports without unintended side-effects on
other students' rows.

---

## 3. Validation approach

`row-schema.ts` provides a hand-rolled, strongly-typed validator. Each call
returns either:

```ts
{ ok: true, row: ValidatedRow }
{ ok: false, errors: ValidationError[] }
```

Errors include `rowNumber` (1-based, header-aware), `field`, `message`, and
`rawValue` so the operator can `sed -n "${rowNumber}p" sample_lms_data.csv`
to find the offending line directly.

Per-field rules:

| Field             | Rule                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `student_id`      | non-empty string                                                    |
| `course_id`       | non-empty string                                                    |
| `week_number`     | integer in [1, 60]                                                  |
| `resource_id`     | non-empty string                                                    |
| `resource_type`   | one of `VIDEO`, `READING`, `QUIZ`, `FORUM`, `LAB`                   |
| `activity_type`   | one of `VIEW`, `SUBMIT`, `POST`, `COMMENT`, `DOWNLOAD`              |
| `timestamp`       | parseable as ISO-8601                                               |
| `duration_seconds`| non-negative integer                                                |
| `quiz_score`      | optional float in [0, 100] (empty string ⇒ `null`)                  |
| `forum_posts`     | non-negative integer                                                |
| `prior_gpa`       | float in [0, 4]                                                     |
| `final_grade`     | float in [0, 100]                                                   |

A row with any errors is dropped from the ingest. Errors are summarised in
the CLI output (first 5 shown, count of remainder). The ingest proceeds for
the valid subset, so a single malformed row does not block the rest.

We deliberately did not add `zod` for this pass — the validation surface is
small and stable, and avoiding the dep keeps the lockfile lean. If
validation grows (e.g. cross-row constraints), `zod` is a low-risk upgrade.

---

## 4. RDI formula

Implemented in `src/features/analytics/rdi.ts`. Normalised Shannon entropy:

```
Let p_i = fraction of total weighted activity on resource type i.
H      = -Σ p_i · log2(p_i)              (Shannon entropy, base 2)
RDI    = H / log2(N_catalogue)           ∈ [0, 1]
```

`N_catalogue` is the **total possible** number of types in the course (5 in
EduRAG), not just the count of types observed. Consequences:

- A student concentrating on one type → RDI = 0.
- A student using 2 of 5 types evenly → RDI ≈ 0.43.
- A student using all 5 types evenly  → RDI = 1.0.

Choosing `N_catalogue` over `N_observed` for the denominator is important:
it means *breadth* matters, not just *evenness*. A student who has tried
every type, even unevenly, scores higher than one who has only ever touched
two — which is the behaviour the causal engine needs to distinguish
high-login-low-diversity from high-engagement-high-performance.

Weights are typically `duration_seconds` totals (use
`buildUsageFromDurations`), but the function accepts any non-negative scalar
since only ratios matter.

---

## 5. Weekly summary metrics

Implemented in `src/features/analytics/engagement.ts#summariseWeek`. For each
(student, course, week) the pipeline stores:

| Field                  | Type    | Semantics                                                  |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `activityCount`        | int     | Total events of any type.                                  |
| `totalDurationSeconds` | int     | Sum of per-event durations.                                |
| `loginCount`           | int     | Distinct calendar days (UTC) with at least one event.      |
| `submissionCount`      | int     | Count of `SUBMIT` events (QUIZ + LAB).                     |
| `quizSubmissionCount`  | int     | Count of `SUBMIT` events on `QUIZ` resources.              |
| `forumPosts`           | int     | Count of `POST` events on `FORUM` resources.               |
| `resourceTypeCount`    | int     | Distinct resource types touched (0-5).                     |
| `averageQuizScore`     | float?  | Mean over QUIZ + SUBMIT scores; null if none.              |
| `engagementScore`      | float   | 0-1 composite (see below).                                 |

### Composite `engagementScore`

Heuristic linear combination, weights deliberately simple for the MVP:

```
activityScore  = min(activityCount / 20,      1)
durationScore  = min(totalDurationSeconds / 14400, 1)      // 14400 = 4h
loginScore     = min(loginCount / 5,          1)
diversityBonus = max(0, (resourceTypeCount - 1) / 4)

engagementScore = 0.35*activity + 0.25*duration + 0.20*login + 0.20*diversity
```

Phase 3 may re-fit these weights against actual outcomes.

### Term-level helpers *(pure, not persisted in Phase 2)*

- **`consistencyScore(weeklyEngagement[])`** — `1 / (1 + CV)` where CV is the
  coefficient of variation. Flat ⇒ 1; swinging ⇒ near 0.
- **`trendSlope(weeklyEngagement[])`** — slope from simple linear regression
  of weekly engagement against week index. Positive ⇒ improving cohort
  signature.

Both are unit-tested but only computed on-demand; no schema column yet.

---

## 6. RDI storage strategy

`RdiScore` is populated per `(student, course, week)`. The Phase 1 spec
mentioned "optionally overall for the course" — that is **deferred** and
will be computed on-read in Phase 3 by aggregating weekly rows, rather than
duplicating storage with a sentinel `weekNumber`. This keeps the unique
constraint `(studentId, courseId, weekNumber)` honest.

---

## 7. Tests

Vitest, 38 tests across 3 files, all passing:

| File                                                    | Tests | Focus                                                  |
| ------------------------------------------------------- | ----: | ------------------------------------------------------ |
| `src/features/analytics/__tests__/rdi.test.ts`          | 12    | Empty, single-type, even distribution across catalogue, lopsided distribution, zero-weight handling, numerical safety, parameterised catalogue size. |
| `src/features/analytics/__tests__/engagement.test.ts`   | 16    | Empty week, login-day counting, submission/quiz/forum tallies, quiz averaging, type counting, score bounds, monotonicity, consistency edge cases, trend slope sign. |
| `src/server/ingest/__tests__/row-schema.test.ts`        | 10    | Happy path, optional quiz_score, enum violations, numeric coercion failures, range bounds, invalid timestamp, error row-number propagation. |

Run: `npm test` (or `npm run test:watch`).

---

## 8. Schema changes (require a migration)

Two minor schema additions in this phase, both additive, both safe on an
empty database:

```diff
 model Resource {
   id         String @id @default(cuid())
+  externalId String @unique
   courseId   String
   …
 }

 model WeeklyEngagementSummary {
   …
+  activityCount        Int
   loginCount           Int
   totalDurationSeconds Int
   submissionCount      Int
+  quizSubmissionCount  Int
   forumPosts           Int
+  resourceTypeCount    Int
   …
 }
```

**Migration command** (operator runs manually, per `CLAUDE.md`):

```bash
npx prisma migrate dev --name phase2_ingest_and_engagement
```

---

## 9. Known limitations

- **In-memory CSV read.** `csv-reader.ts` loads the whole file. Fine at 5 MB
  / 50 k rows. For multi-million-row imports, switch to a streaming parse.
- **Wide-then-narrow upserts.** We issue one `upsert` per distinct
  course/student/resource/enrollment. For ~250 students this is sub-second;
  for cohorts of 10 k+ the per-row round-trips would dominate — consider
  raw SQL `INSERT ... ON CONFLICT` or a Prisma `createMany` with `skipDuplicates`.
- **No CLI batch size flag.** `ACTIVITY_BATCH_SIZE` is a module constant.
- **Linear engagement composite.** A heuristic, not derived from outcomes.
  Phase 3 may revisit.
- **Consistency and trend are not persisted**, only computed on-the-fly when
  needed downstream.
- **Single-course assumption is implicit** in the `COHORT = "2026-spring"`
  constant. A real multi-cohort importer would derive cohort from `course_id`
  + a course-cohort mapping.
- **No transaction wrapping** around the full pipeline. Each step is its
  own transaction (Prisma default per call). A crash mid-run leaves a
  partial state; re-running `db:ingest` recovers cleanly because every step
  is idempotent.

---

## 10. Next steps (Phase 3 — Causal Engine)

1. Define the DAG in code under `src/features/causal-engine/dag.ts` (mirror
   the version in `docs/causal-methodology.md`).
2. Add a Python service or in-process estimator for backdoor-adjusted
   regression on the persisted weekly summaries and RDI scores.
3. Populate `CausalEstimate` rows per (student × driver).
4. Add refutation checks (DoWhy random-common-cause + placebo treatment).
5. Surface the term-level consistency / trend metrics as causal features.
6. Write `docs/features/phase-3-causal-engine.md` and an execution log.
