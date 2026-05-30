# EduRAG — Data Model

> Status: **Phase 1 — implemented in `prisma/schema.prisma`**. Refined alongside
> the synthetic dataset.

This document defines the entities, fields, and derived metrics that flow through
the EduRAG pipeline. The schema is intentionally close to a generic LMS export so
it can later be mapped onto Moodle / Canvas / Blackboard activity logs.

> **Source of truth:** [`prisma/schema.prisma`](../prisma/schema.prisma). This
> document explains *intent*; the schema file defines *shape*. When the two
> disagree, the schema wins and this document must be updated.

---

## 1. Core entities (initial sketch)

### `Student`
| Field        | Type      | Notes                                       |
| ------------ | --------- | ------------------------------------------- |
| `id`         | string PK | Synthetic / anonymised ID.                  |
| `cohort`     | string    | e.g. `2025-fall`.                           |
| `prior_gpa`  | float     | Pre-course academic baseline.               |
| `created_at` | datetime  |                                             |

### `Course`
| Field        | Type      | Notes                                       |
| ------------ | --------- | ------------------------------------------- |
| `id`         | string PK |                                             |
| `code`       | string    | e.g. `CS-201`.                              |
| `title`      | string    |                                             |
| `weeks`      | int       | Length in weeks (12-15 for MVP).            |

### `Enrollment` *(many-to-many bridge)*
| Field         | Type      | Notes                                       |
| ------------- | --------- | ------------------------------------------- |
| `id`          | string PK |                                             |
| `student_id`  | string FK |                                             |
| `course_id`   | string FK |                                             |
| `enrolled_at` | datetime  |                                             |

Unique on `(student_id, course_id)`. MVP scope assumes one course per student
per cohort, but the bridge table is in place so multi-course modelling can be
added without a schema change.

### `Resource`
| Field         | Type      | Notes                                                                  |
| ------------- | --------- | ---------------------------------------------------------------------- |
| `id`          | string PK | cuid                                                                   |
| `external_id` | string    | Unique — stable identifier from the source export (e.g. `CS-201-VID-001`). |
| `course_id`   | string FK |                                                                        |
| `type`        | enum      | `VIDEO`, `READING`, `QUIZ`, `FORUM`, `LAB`.                            |
| `title`       | string    |                                                                        |

### `ActivityLog`
| Field              | Type      | Notes                                                                 |
| ------------------ | --------- | --------------------------------------------------------------------- |
| `id`               | string PK |                                                                       |
| `student_id`       | string FK |                                                                       |
| `course_id`        | string FK |                                                                       |
| `resource_id`      | string FK |                                                                       |
| `activity_type`    | enum      | `view`, `submit`, `post`, `comment`, `download`.                      |
| `timestamp`        | datetime  |                                                                       |
| `duration_seconds` | int       | Idle sessions are clipped in preprocessing.                           |
| `week`             | int       | Derived from `timestamp` relative to course start. Indexed for speed. |

### `Grade`
| Field        | Type      | Notes                                            |
| ------------ | --------- | ------------------------------------------------ |
| `id`         | string PK |                                                  |
| `student_id` | string FK |                                                  |
| `course_id`  | string FK |                                                  |
| `final_grade`| float     | 0-100 scale.                                     |
| `letter`     | string    | Derived.                                         |

---

### `WeeklyEngagementSummary` *(pre-aggregated, written by Phase 2 pipeline)*
| Field                   | Type      | Notes                                                            |
| ----------------------- | --------- | ---------------------------------------------------------------- |
| `id`                    | string PK |                                                                  |
| `student_id`            | string FK |                                                                  |
| `course_id`             | string FK |                                                                  |
| `week_number`           | int       |                                                                  |
| `activity_count`        | int       | Total events of any type for the (student, course, week).        |
| `login_count`           | int       | Distinct active days inferred from event timestamps.             |
| `total_duration_seconds`| int       | Sum of `ActivityLog.duration_seconds` for the week.              |
| `submission_count`      | int       | Count of `activity_type=SUBMIT` events (QUIZ + LAB combined).    |
| `quiz_submission_count` | int       | Count of `activity_type=SUBMIT` events on QUIZ resources only.   |
| `forum_posts`           | int       | Count of `activity_type=POST` events on FORUM resources.         |
| `resource_type_count`   | int       | Distinct resource types touched in the week (0-5).               |
| `average_quiz_score`    | float?    | Mean over QUIZ submissions in the week (null if none).           |
| `engagement_score`      | float     | Composite 0-1 score; see §2.                                     |

Unique on `(student_id, course_id, week_number)`. Indexed by `(course_id,
week_number)` for cohort-week roll-ups.

Term-level metrics (`consistency_score`, `trend_slope`) are computed as pure
functions in `src/features/analytics/engagement.ts` but **not persisted** in
Phase 2. They are re-derived on demand by Phase 3 once the causal engine
needs them.

---

## 2. Derived metrics

### Resource Diversity Index (RDI)

A normalised entropy-style score measuring how *evenly* a student distributes
their time across distinct resource types.

```
Let p_i = fraction of total weekly activity time spent on resource type i.
H    = -Σ p_i · log2(p_i)              (Shannon entropy)
RDI  = H / log2(N_types_available)     (normalised to [0, 1])
```

- **RDI = 0** → student engages with only one resource type.
- **RDI = 1** → student spreads time perfectly evenly across all resource types.

Stored per `(student_id, course_id, week)` in a `RdiScore` table (added Phase 2).

### Engagement score
Weekly composite of normalised `login_count`, `total_duration`, and `submission_count`.

### Consistency score
Inverse of the coefficient of variation of weekly engagement across the course.

### Assessment trend
Slope of quiz scores over weeks (positive trend ⇒ improving).

---

## 3. Causal model outputs (Phase 3+)

### `CourseFeatureSummary` *(per-(student, course) feature row — written by Phase 3 derive step)*
| Field                    | Type      | Notes                                                              |
| ------------------------ | --------- | ------------------------------------------------------------------ |
| `id`                     | string PK |                                                                    |
| `student_id`             | string FK |                                                                    |
| `course_id`              | string FK |                                                                    |
| `mean_engagement`        | float     | Mean of weekly `engagement_score` over the term.                   |
| `mean_rdi`               | float     | Mean of weekly RDI scores over the term.                           |
| `mean_logins_per_week`   | float     | Mean of weekly `login_count`.                                      |
| `total_activity`         | int       | Sum of weekly `activity_count`.                                    |
| `weeks_observed`         | int       | Number of weeks with at least one activity.                        |
| `engagement_consistency` | float     | `1 / (1 + CV)` on weekly engagement series.                        |
| `engagement_trend`       | float     | OLS slope of weekly engagement against week index.                 |
| `forum_participation`    | float     | Mean weekly forum posts.                                           |
| `quiz_consistency`       | float     | `1 / (1 + CV)` on weekly average quiz scores.                      |
| `assessment_trend`       | float     | OLS slope of weekly average quiz scores against week index.        |
| `computed_at`            | datetime  |                                                                    |

Unique on `(student_id, course_id)`. Source of truth for the causal feature
table — see `src/features/causal-engine/feature-table.ts`.

### `CausalEstimate` *(cohort-level — see Phase 3 spec)*
| Field             | Type      | Notes                                                                   |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `id`              | string PK |                                                                         |
| `course_id`       | string FK | Estimates are cohort-level, scoped to a course.                          |
| `treatment`       | string    | DAG node name, e.g. `ResourceDiversityIndex`.                           |
| `outcome`         | string    | DAG node name, typically `FinalGrade`.                                  |
| `adjustment_set`  | string    | JSON-encoded `CausalNode[]`.                                            |
| `estimate`        | float     | β coefficient on the treatment.                                         |
| `ci_low`          | float     | Bootstrap percentile CI lower bound.                                    |
| `ci_high`         | float     | Bootstrap percentile CI upper bound.                                    |
| `ci_level`        | float     | e.g. `0.95`.                                                            |
| `sample_size`     | int       | Number of students in the regression.                                   |
| `method`          | string    | e.g. `backdoor_ols`.                                                    |
| `bootstrap_iters` | int       | Number of bootstrap resamples used to build the CI.                     |
| `refutation_json` | string?   | JSON-encoded `RefutationResult` (placebo + random-common-cause).        |
| `notes_json`      | string?   | JSON-encoded `{ limitations: string[] }`.                               |
| `generated_at`    | datetime  |                                                                         |

Unique on `(course_id, treatment, outcome)`. **Cohort-level only** —
per-student counterfactual deltas live in `InterventionSimulation`
(Phase 4) by applying β to each student's hypothetical change.

### `InterventionSimulation` *(per-student, per-course — written by Phase 4 what-if engine)*
| Field               | Type      | Notes                                                                                  |
| ------------------- | --------- | -------------------------------------------------------------------------------------- |
| `id`                | string PK |                                                                                        |
| `student_id`        | string FK |                                                                                        |
| `course_id`         | string FK |                                                                                        |
| `intervention_name` | string    | Snake-case identifier from the standard catalogue (e.g. `increase_resource_diversity`).|
| `treatment`         | string    | DAG node name (the feature being intervened on).                                       |
| `baseline_value`    | float     | Student's current feature value.                                                       |
| `proposed_value`    | float     | Hypothetical new value after applying the (headroom-clamped) delta.                    |
| `applied_delta`     | float     | `proposed_value - baseline_value` (may be ≤ requested delta).                          |
| `estimated_effect`  | float     | β used (from `CausalEstimate.estimate` for this treatment).                            |
| `baseline_grade`    | float     | Student's current `Grade.finalGrade`.                                                  |
| `projected_grade`   | float     | `baseline_grade + β·applied_delta`, clamped to [0, 100].                               |
| `projected_low`     | float     | Lower bound using `ciLow·applied_delta`, clamped to [0, 100].                          |
| `projected_high`    | float     | Upper bound using `ciHigh·applied_delta`, clamped to [0, 100].                         |
| `rank_score`        | float     | `max(0, gain) × weakness_bonus × confidence_weight` — see §Phase-4 spec.               |
| `confidence`        | string    | `"high"` \| `"medium"` \| `"low"` — derived from refutation pass count.                |
| `explanation`       | text      | Plain-English, honesty-constrained prose (no "guaranteed"/"proven"/"definitely").      |
| `notes_json`        | string    | JSON: `{ assumptions[], headroom, weaknessScore }`.                                    |
| `generated_at`      | datetime  |                                                                                        |

Unique on `(student_id, course_id, intervention_name)`. Indexed by
`(course_id, treatment)` and `(course_id, rank_score)` for fast
"top-N for this course" reads.

**Honesty contract** — enforced in `src/features/causal-engine/simulator.ts`
and asserted by `src/features/causal-engine/__tests__/simulator.test.ts`:
explanation prose carries `"model-based"`, `"cohort-average"`, and
`"estimated improvement range"` phrasing and must never contain
`"guaranteed"`, `"proven"`, `"definitely"`, or `"will improve"`.

---

## 4. Storage strategy

- **Structured records** → SQLite (Prisma).
- **Uploaded raw CSVs** → `data/raw/` (git-ignored).
- **Processed parquet/CSV artefacts** → `data/processed/` (git-ignored).
- **Generated DAG diagrams** → `data/processed/dags/*.svg`.

### CSV → Prisma mapping (Phase 1)

`data/raw/sample_lms_data.csv` is denormalised by design (each row carries
`prior_gpa` and `final_grade`). The Phase 2 import step will normalise as
follows:

| CSV column        | Target table.column                                |
| ----------------- | -------------------------------------------------- |
| `student_id`      | `Student.externalId` (cuid generated on insert)    |
| `prior_gpa`       | `Student.priorGpa` (first occurrence per student)  |
| `final_grade`     | `Grade.finalGrade` (one row per student × course)  |
| `course_id`       | `Course.code` (course is upserted from distinct ids)|
| `resource_id`     | `Resource.id` (preserved as-is from the generator) |
| `resource_type`   | `Resource.type`                                    |
| `week_number`     | `ActivityLog.weekNumber`                           |
| `activity_type`   | `ActivityLog.activityType`                         |
| `timestamp`       | `ActivityLog.timestamp` (ISO-8601 with TZ)         |
| `duration_seconds`| `ActivityLog.durationSeconds`                      |
| `quiz_score`      | `ActivityLog.quizScore` (only on QUIZ + SUBMIT)    |
| `forum_posts`     | derived → `WeeklyEngagementSummary.forumPosts`     |

---

## 5. Assumptions & limitations

- Synthetic data is generated to *exhibit* causal structure for demo purposes.
  Real-world LMS data is messier; mapping logic will live in `src/features/analytics/`.
- One course per student per cohort in the MVP — multi-course modelling is
  deferred.
- Time zones normalised to UTC at ingestion.
