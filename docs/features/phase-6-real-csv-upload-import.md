# Feature Spec — Phase 6: Real CSV Upload & Import

> Turns `/upload` from a static placeholder into a real CSV ingest
> pipeline so EduRAG can be used with any LMS-shaped dataset, not just
> the synthetic one. **Zero new dependencies** — reuses every component
> of the Phase 2-4 pipeline.

---

## 1. Architecture

```
                    Browser
                       │  multipart FormData (file + options)
                       ▼
┌──────────────────────────────────────────┐
│ Next.js server action                    │
│   src/server/actions/upload.ts           │
│     • previewUpload(formData)            │
│     • commitUpload(formData)             │
└────────────────┬─────────────────────────┘
                 │  Buffer
                 ▼
┌──────────────────────────────────────────┐
│ parseAndValidateCsv(buffer)              │  ← Phase 2 validator
│   src/server/ingest/csv-reader.ts        │
└────────────────┬─────────────────────────┘
                 │  { rows, errors }
       ┌─────────┴──────────┐
       ▼                    ▼
   Preview only         Commit (orchestrator)
   (no writes)              │
   buildPreviewResult       │  src/server/upload/commit.ts
                            ▼
                  ┌──────────────────────┐
                  │ ingestValidatedRows  │  ← Phase 2 ingest
                  │ deriveAllSummaries   │  ← Phase 2 derive
                  │ deriveCourseFeatures │  ← Phase 3 derive
                  │ runCausalEstimates   │  ← Phase 3 (opt-in)
                  │ runSimulations       │  ← Phase 4 (opt-in)
                  └──────────┬───────────┘
                             ▼
                  SyncLog row written
                  (source: "uploaded")
                             │
                             ▼
            Phase 5.5 integrations page shows it
```

**Key design choice — stateless commit.** The client re-posts the file
to `commitUpload` rather than the server caching a parsed preview by
token. At our 20 MB ceiling the second parse takes < 200 ms; the
contract stays simpler.

**Body size limit.** Next.js server actions default to 1 MB. Raised to
**20 MB** in `next.config.mjs` (matched by `MAX_BYTES` in `upload.ts`).
The synthetic CSV is ~5 MB; real LMS exports may run larger.

---

## 2. Validation pipeline

| Stage              | Module                                                 | What it does                                                            |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| File intake        | `src/server/actions/upload.ts` (`readUploadedFile`)    | Mime + extension + size check, returns `Buffer`.                        |
| Parse              | `src/server/ingest/csv-reader.ts` (`parseAndValidateCsv`) | csv-parse → per-row `validateRow`, returns `{ rows, errors }`.        |
| Shape for UI       | `src/server/upload/preview.ts`                         | Cap to 20 sample rows + 50 errors; serialise dates to ISO strings.      |

Validation rules (carried over from Phase 2, no changes):

| Field             | Rule                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `student_id`      | non-empty string                                                    |
| `course_id`       | non-empty string                                                    |
| `week_number`     | integer in [1, 60]                                                  |
| `resource_id`     | non-empty string                                                    |
| `resource_type`   | `VIDEO` \| `READING` \| `QUIZ` \| `FORUM` \| `LAB`                  |
| `activity_type`   | `VIEW` \| `SUBMIT` \| `POST` \| `COMMENT` \| `DOWNLOAD`             |
| `timestamp`       | parseable as ISO-8601                                               |
| `duration_seconds`| non-negative integer                                                |
| `quiz_score`      | optional float in [0, 100] (empty ⇒ `null`)                         |
| `forum_posts`     | non-negative integer                                                |
| `prior_gpa`       | float in [0, 4]                                                     |
| `final_grade`     | float in [0, 100]                                                   |

Rows with any error are dropped; the import proceeds for the valid
subset. The first 50 errors flow back to the UI for inspection.

---

## 3. Preview flow

1. User picks a CSV in `UploadForm` (client component).
2. Client builds `FormData { file }` and calls `previewUpload(fd)`.
3. Server parses + validates, builds `PreviewResult`:
   - **Stats:** total, valid, invalid, distinct students, distinct courses.
   - **Sample:** first 20 valid rows, full preview shape.
   - **Errors:** first 50, with row number + field + message + raw value.
4. UI renders a preview card with the stats, a collapsible error table,
   the sample table, and the **Import options** panel.

**No DB writes happen at this stage.** The user can choose to commit or
to upload another file.

---

## 4. Commit / orchestration flow

After the user confirms the import, the client calls `commitUpload(fd)`
with the file + mode + options. The orchestrator
(`src/server/upload/commit.ts → commitUploadedRows`) runs:

1. **Re-parse + validate** the buffer.
2. **Optional wipe** (replace mode): clears `InterventionSimulation`,
   `CausalEstimate`, `CourseFeatureSummary`, `RdiScore`,
   `WeeklyEngagementSummary`, `AdvisorNote`, `Grade`, `Enrollment`,
   `ActivityLog`, `Resource`, `Student`, `Course` — in that order.
   **`SyncLog` is preserved** so the audit history survives.
3. **Ingest** via `ingestValidatedRows()` — the same function the CLI
   uses; per-student `ActivityLog` replacement, then bulk insert.
4. **Re-derive** `WeeklyEngagementSummary` + `RdiScore` (via
   `deriveAllSummaries`) and `CourseFeatureSummary` (via
   `deriveCourseFeatures`). Warnings recorded but don't abort.
5. **Re-run causal estimates** if the option is checked — calls
   `runCausalEstimates(prisma, courseCode)`. Warnings on failure.
6. **Re-run intervention simulations** if the option is checked — calls
   `runSimulations(prisma, { courseCode })`. Warnings on failure.
7. **Write `SyncLog`** with `source: "uploaded"`, `status`
   (`success` / `partial`), `scopeJson` = `[mode]`, `summaryJson` =
   full structured summary, `message` = human-readable single line.

The result card displays:
- Per-step counts (students, courses, resources, activity rows, grades,
  enrollments, weekly summaries, RDI scores, course features, causal
  estimates, simulations).
- Any warnings (e.g. *"Causal estimates skipped: no course code derivable
  from the upload."*).
- Navigation buttons: **Dashboard**, **Integrations**, **Causal graph**,
  **Upload another**.

---

## 5. Import modes

| Mode                 | Behaviour                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| **`append`** (default) | Existing data preserved. `ingestValidatedRows` still replaces `ActivityLog` per `(studentId, courseId)` — students NOT in the upload are untouched. |
| **`replace`**          | All LMS-derived tables wiped first (preserves `SyncLog` audit history). Use with the prominent rose CTA. |
| **`dryRun`**           | Pure validation pass — no DB writes. Same stats + sample + error list as the preview, but framed as a "would-be import" report. |

The two booleans `rerunCausalEstimates` and
`rerunInterventionSimulations` are independent of mode — both
default to checked.

---

## 6. CLI vs upload

| Path                 | Trigger                              | Source string in SyncLog | Notes                                                              |
| -------------------- | ------------------------------------ | ------------------------ | ------------------------------------------------------------------ |
| Synthetic CSV        | `npm run db:ingest`                  | (no SyncLog row)         | Existing Phase 2 path; not refactored.                              |
| Shell University     | `npm run sync:university`            | `shell-university`       | Phase 5.5.                                                          |
| **Uploaded CSV**     | `/upload` page                       | `uploaded`               | Phase 6 — appears on the integrations page automatically.           |

All three share the same validator + ingest + derive + causal stack.
Adding a fourth data source in a future phase is a matter of writing a
new entry point.

---

## 7. Tests

Vitest, **176 tests total, all passing.** Phase 6 added **11 new tests**:

| File                                                          | Tests | Focus                                                                  |
| ------------------------------------------------------------- | ----: | ---------------------------------------------------------------------- |
| `src/server/upload/__tests__/preview.test.ts`                 | 11    | `summariseValidated` counts, `toSampleRow` ISO conversion, `toPreviewError` null normalisation, cap helpers, `buildPreviewResult` ok/!ok branches, `parseAndValidateCsv(Buffer)` happy path + structured-error path. |

UI components are not unit tested — the safety net is `npm run build`
(passes; `/upload` is 3.97 KB client JS).

---

## 8. Build & verification

```
> next build
   ▲ Next.js 15.5.18
 ✓ Compiled successfully in ~20s
 ✓ Generating static pages (12/12)

Route (app)                                 Size  First Load JS
 ƒ /upload                              3.97 kB         110 kB
 …all 16 routes…
```

`/upload` is now dynamic (server-action-backed). The previous placeholder
shipped 151 B because it was fully static; the form's 3.97 KB is the
state-machine + result card.

---

## 9. Limitations

- **20 MB ceiling.** Set in `next.config.mjs`. Larger files require
  streaming parse + chunked inserts (future work).
- **In-memory parse.** Whole file lives in memory during preview AND
  commit. Fine at our scale; a real production import would stream.
- **Single client / no resumable upload.** Page refresh during commit
  loses progress; re-upload safe because all writes are idempotent.
- **No background queue.** Per the Phase 6 constraints. Long commits
  block the server action; the UI shows a `pending` state via
  `useTransition`.
- **No auth.** Per the Phase 6 constraints. Anyone with network access
  to the dev server can trigger imports.
- **Course code inference.** Causal estimates + simulations re-run
  against `rows[0].courseId`. Multi-course uploads currently only
  refresh estimates for the first course; warnings would be a
  reasonable Phase 7 add.
- **Replace mode is destructive.** Wipes everything except `SyncLog`.
  Clearly labelled with rose CTA + warning copy; not silent.

---

## 10. Future improvements

- Streaming parser for 100 MB+ files.
- Background queue (BullMQ / inngest) for long-running orchestrations.
- Resumable uploads via tus.
- Multi-course post-commit causal-estimate fan-out.
- Drag-and-drop file picker (currently a styled `<input type="file">`).
- Diff preview ("12 students new, 4 grades changed, 188 events added").
- API endpoint mirror (`POST /api/upload`) so external scripts can use
  the same pipeline.

---

## 11. Next steps (Phase 7 — Advanced Causal Engine Upgrade)

1. Stand up an optional Python worker (`/python/` or a Docker service) for
   DoWhy + causal-learn.
2. Stronger refutation checks (subset robustness, sensitivity analysis).
3. Causal discovery experiment to learn a DAG from data — surface a
   "manual DAG vs discovered graph" comparison on the dashboard.
4. Downloadable causal report (PDF or Markdown) per cohort run.
5. Write `docs/features/phase-7-advanced-causal-engine.md` + execution log.
