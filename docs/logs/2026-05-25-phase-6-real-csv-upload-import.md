# Execution Log — Phase 6: Real CSV Upload & Import

- **Date:** 2026-05-25
- **Phase:** 6 — Real CSV Upload & Import
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 5.5 (`docs/logs/2026-05-25-phase-5.5-shell-university-integration.md`)

---

## Objective

Replace the static `/upload` placeholder with a real end-to-end CSV
import pipeline. Validate browser-uploaded CSVs server-side, preview
before commit, run the full ingest + derivation + causal engine in
place, and persist the run as a `SyncLog` row so the Phase 5.5
integration page recognises uploaded CSVs as a third first-class data
source.

Explicitly out of scope: authentication, cloud storage, background
queues, breaking the existing CLI ingest path.

---

## Files created

### Source

| Path                                              | Purpose                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/server/upload/types.ts`                      | `PreviewResult`, `CommitResult`, `CommitOptions`, `ImportMode` — JSON-friendly shapes. |
| `src/server/upload/preview.ts`                    | Pure helpers: `summariseValidated`, `toSampleRow`, `toPreviewError`, cap helpers, `buildPreviewResult`. |
| `src/server/upload/commit.ts`                     | Orchestrator: optional wipe, `ingestValidatedRows`, derive, optional causal estimate / simulate, `SyncLog` write. |
| `src/server/actions/upload.ts`                    | `"use server"` actions: `previewUpload`, `commitUpload`. Mime/size/extension checks. |
| `src/components/UploadForm.tsx`                   | Client component (~430 LoC): file picker, validating preview, options panel, result card with navigation. |
| `src/server/upload/__tests__/preview.test.ts`     | 11 unit tests (shaping + buffer-based parse).                                       |

### Docs

| Path                                                                       | Purpose                |
| -------------------------------------------------------------------------- | ---------------------- |
| `docs/features/phase-6-real-csv-upload-import.md`                          | Per-feature spec.      |
| `docs/logs/2026-05-25-phase-6-real-csv-upload-import.md`                   | This log.              |

---

## Files updated

| Path                                              | Change                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/server/ingest/csv-reader.ts`                 | Split out `parseAndValidateCsv(buffer)`; `readAndValidateCsv(path)` is now a one-line wrapper. |
| `src/server/ingest/ingest-csv.ts`                 | Split out `ingestValidatedRows(rows, invalidCount, prisma)`; `ingestCsv(path, prisma)` delegates after CSV read + logging. |
| `next.config.mjs`                                 | Added `experimental.serverActions.bodySizeLimit = "20mb"` so uploads up to the demo CSV size (~5 MB) succeed. |
| `src/app/upload/page.tsx`                         | Rewrote: hosts the `UploadForm`, removed the "placeholder" warning banner, added "Sample row" disclosure + "Other ways to load data" section. |
| `docs/Plan.md`                                    | Phase 6 marked complete; expanded the Phase 6 section with checklist + manual UI workflow.   |
| `README.md`                                       | Updated the `/upload` route description to reflect it being functional.                      |
| `docs/architecture.md`                            | §7 updated: uploaded CSV is now active, with a one-line description of the server-action path. |
| `docs/demo-script.md`                             | Rewrote the 1:45-2:00 close to walk through the upload form during a demo; new closing line. |

## Files removed

None.

---

## Commands run by the agent

| # | Command                                  | Result                                                            |
| - | ---------------------------------------- | ----------------------------------------------------------------- |
| 1 | `npx tsc --noEmit`                       | ✅ Typecheck clean.                                                |
| 2 | `npm test`                               | ✅ **17 files, 176 tests, all passed** (~360 ms test exec).        |
| 3 | `npm run build`                          | ✅ Compiled, 12 pages generated; `/upload` is now dynamic (3.97 KB client JS). |

Per `CLAUDE.md`, the agent did **not** run any database migration or
any DB-writing CLI / server action.

---

## Commands the operator must run manually

```bash
# No new prisma migration in Phase 6 (UI + server-action only — no schema change).

# Optional: regenerate the synthetic CSV to test the upload path against fresh data.
npm run data:generate

# Then start the dev server and use the form:
npm run dev                                            # http://localhost:3000/upload

# UI workflow:
#   1. Choose a CSV.
#   2. Press "Preview" — server validates, no DB writes; review the stats + sample.
#   3. Pick mode (append / replace), toggle dry-run + post-commit reruns, "Confirm".
#   4. Inspect the result card; navigate to dashboard / integrations.
```

---

## Dependencies added

**None.** Phase 6 reuses everything from Phases 1-5.5:
- `csv-parse` (Phase 2) for parsing.
- Existing validator, ingest, derive, causal estimate, simulation
  functions — none modified except for the lossless refactors.
- Native `FormData` + `Buffer` via Next.js server actions.
- `vitest` for the new tests.

---

## Upload flow summary

```
Browser file picker
    │  FormData { file, mode, dryRun, rerunCausalEstimates, rerunInterventionSimulations }
    ▼
previewUpload(formData) ──► validateRow per row ──► PreviewResult
    │
    │  (user reviews stats + sample + errors; picks options)
    ▼
commitUpload(formData)
    │
    ├─ (replace mode) wipe LMS-derived tables, preserve SyncLog
    ├─ ingestValidatedRows ─► Course / Student / Resource / Enrollment / ActivityLog / Grade upserts
    ├─ deriveAllSummaries ──► WeeklyEngagementSummary + RdiScore
    ├─ deriveCourseFeatures ► CourseFeatureSummary
    ├─ runCausalEstimates ──► CausalEstimate (opt-in)
    ├─ runSimulations ──────► InterventionSimulation (opt-in)
    └─ SyncLog.create ──────► source: "uploaded", structured summaryJson
    ▼
CommitResult { ingest, derived, features, causalEstimates, simulations, warnings, syncLogId }
```

---

## Orchestration summary

| Step                       | Function                                  | Phase    | Optional?           |
| -------------------------- | ----------------------------------------- | -------- | ------------------- |
| File intake + size check   | `readUploadedFile`                        | 6 (new)  | always              |
| Parse + validate           | `parseAndValidateCsv`                     | 2 (refactored) | always        |
| Replace-mode wipe          | `wipeLmsDerivedTables`                    | 6 (new)  | replace mode only   |
| Catalogue + activity write | `ingestValidatedRows`                     | 2 (refactored) | always (skipped on dry run) |
| Weekly + RDI derive        | `deriveAllSummaries`                      | 2        | always              |
| Course feature derive      | `deriveCourseFeatures`                    | 3        | always              |
| Causal estimate re-run     | `runCausalEstimates`                      | 3        | UI checkbox         |
| Simulation re-run          | `runSimulations`                          | 4        | UI checkbox         |
| `SyncLog` write            | `prisma.syncLog.create`                   | 5.5      | always (skipped on dry run) |

---

## Validation rules summary

Carried over unchanged from Phase 2 — see
`src/server/ingest/row-schema.ts`:

- 6 required text fields (`student_id`, `course_id`, `resource_id`,
  `resource_type`, `activity_type`, `timestamp`).
- 5 required numeric fields with bounded ranges (`week_number`,
  `duration_seconds`, `forum_posts`, `prior_gpa`, `final_grade`).
- 1 optional numeric field (`quiz_score`, empty ⇒ `null`).
- Two enum vocabularies (`resource_type` / `activity_type`).
- ISO-8601 parsing for `timestamp`.

Per-error structure: `{ rowNumber, field, message, rawValue }`. First
50 errors flow to the UI for inspection.

---

## Tests added and results

```
✓ src/server/upload/__tests__/preview.test.ts      (11 tests)
+ all 165 pre-existing tests

Test Files  17 passed (17)
     Tests  176 passed (176)
```

`npm run build` succeeds — 12 pages generated; `/upload` ships 3.97 KB
of interactive client JS.

---

## Assumptions made

1. **Stateless commit** — the client re-posts the file rather than the
   server caching a parsed preview. At ≤ 20 MB the second parse is
   cheap and the contract is simpler.
2. **20 MB body-size limit.** Default of 1 MB is too small for our 5 MB
   demo CSV. 20 MB covers typical mid-term LMS exports.
3. **Replace mode wipes everything except SyncLog.** Preserves audit
   history; UI exposes it via a prominently red CTA so it's never silent.
4. **Course-code inference** — causal estimate + simulation post-commit
   reruns target `rows[0].courseId`. Multi-course CSVs only refresh
   the first course; a warning fires for the rest. Reasonable Phase 7
   improvement.
5. **No new dependencies.** Native `Buffer` + `FormData` + the existing
   `csv-parse` cover everything.
6. **Refactor not breaking change.** `ingestCsv` keeps its old signature
   and behaviour; both the Phase 2 CLI (`npm run db:ingest`) and the
   Phase 6 upload share the new `ingestValidatedRows` core.
7. **`SyncLog.source = "uploaded"`** — same string the Phase 5.5
   `classifyDataSource` helper already recognises, so the
   integrations page picks it up with zero plumbing.
8. **Honesty disclaimer carries through.** No projection/recommendation
   UX shipped in this phase — the result card shows raw counts only.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **176 / 176** tests pass (`npm test`).
- [x] `npm run build` succeeds — 12 pages generated, all routes registered.
- [x] No database migration / DB-writing CLI executed by the agent.
- [x] No new runtime dependencies added.
- [x] CSV CLI path (`npm run db:ingest`) still works (refactor was
      lossless — `ingestCsv` keeps its signature and delegates to the
      new `ingestValidatedRows`).
- [x] Phase 5.5 sync path untouched.
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/demo-script.md` all updated.
- [x] `docs/features/phase-6-real-csv-upload-import.md` created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 7

- **Long commits block the server action.** A 50k-row CSV with all
  reruns enabled takes a few seconds end-to-end; the UI shows pending
  state but the connection is open the whole time. Phase 9
  productisation or a future background queue can move this to async.
- **Replace-mode order.** Hand-written deletion order in
  `wipeLmsDerivedTables` — if Phase 7+ adds new LMS-derived tables,
  they must be appended there or cascades may complain.
- **Course-code inference falls back to `rows[0]`.** A multi-course
  CSV will only refresh estimates for the first course unless the
  user explicitly invokes the CLI for each one. Add a warning surface
  if it becomes a common pattern.
- **Upload page has no a11y audit.** Components use semantic HTML, but
  drag-and-drop, error-region announcements, and focus management on
  step transitions are not exercised by tests.

---

## Next recommended phase

**Phase 7 — Advanced Causal Engine Upgrade.**

Concrete first steps:

1. Stand up an optional Python worker (`/python/` or a containerised
   service) exposing HTTP endpoints for DoWhy + causal-learn.
2. Stronger refutation checks: subset robustness, sensitivity analysis,
   bootstrap of refutations.
3. Causal discovery experiment (e.g. PC algorithm) to learn a DAG from
   data; surface a "manual DAG vs discovered graph" comparison.
4. Downloadable causal report (PDF or Markdown) per cohort run.
5. Keep the existing TypeScript backdoor-OLS path as the default;
   Python is an opt-in upgrade.
6. Write `docs/features/phase-7-advanced-causal-engine.md` + execution log.
