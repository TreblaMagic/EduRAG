# Execution Log — Phase 10: Demo Dataset Modes

- **Date:** 2026-05-28
- **Phase:** 10 — Demo Dataset Modes
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 9 (`docs/logs/2026-05-28-phase-9-productisation-one-command-setup.md`)

---

## Objective

Implement a unified Dataset Mode system covering the three data
sources the prototype already supports (synthetic CSV, Shell University
API sync, uploaded CSV). The system needs:

- A canonical, code-level catalogue of modes (one source of truth for
  names, accents, descriptions, refresh hints).
- Lightweight persistence of the active mode (survives app restarts).
- A non-destructive switcher UI plus a global indicator chip.
- Source-aware messaging across the dashboard.
- A dataset-mode stamp on every downloadable report so reviewers
  reading a Markdown export know which source produced the numbers.

Explicitly out of scope: per-user state, multi-tenant separation,
prisma schema additions, automatic re-bootstrap on switch.

---

## Files created

### TypeScript — feature module

| Path                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/dataset-modes/types.ts`                         | `DatasetMode`, snapshot + state shapes, `DEFAULT_DATASET_STATE`.              |
| `src/features/dataset-modes/metadata.ts`                      | Per-mode catalogue + `isDatasetMode` guard.                                   |
| `src/features/dataset-modes/status.ts`                        | `snapshotsFor` + `formatRelative` + `statusLabel`.                            |
| `src/features/dataset-modes/index.ts`                         | Barrel.                                                                       |

### TypeScript — server module

| Path                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server/dataset-mode/store.ts`                            | JSON file read/write + `normaliseState` (recovers corrupted input).           |
| `src/server/dataset-mode/orchestrator.ts`                     | Joins persisted state with Prisma counts + latest `SyncLog` rows.             |
| `src/server/dataset-mode/index.ts`                            | Barrel.                                                                       |
| `src/server/actions/dataset-mode.ts`                          | `switchDatasetMode` server action + `revalidatePath` fan-out.                 |

### TypeScript — UI

| Path                                              | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/DatasetModeBanner.tsx`            | Server-rendered chip used in the global header strip.                                   |
| `src/components/DatasetModeSwitcher.tsx`          | Client switcher with confirmation + reason input + "empty mode" warnings.               |
| `src/app/datasets/page.tsx`                       | Overview + switcher + "Why three modes?" explainer.                                     |

### Tests

| Path                                                              | Coverage                                                  | Tests |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src/features/dataset-modes/__tests__/metadata.test.ts`           | Catalogue coverage, distinct accents, isDatasetMode guard. | 7    |
| `src/features/dataset-modes/__tests__/status.test.ts`             | Snapshot shaping, last-update timestamps, relative time, status label. | 11 |
| `src/server/dataset-mode/__tests__/store.test.ts`                 | Round-trip, missing-file fallback, corrupted-file + unknown-mode recovery. | 11 |
| `src/server/dataset-mode/__tests__/orchestrator.test.ts`          | Persistent set + read, default fallback, idempotent rewrite. | 3 |

### Docs

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `docs/features/phase-10-demo-dataset-modes.md`                | Full per-feature spec.                                                                  |
| `docs/logs/2026-05-28-phase-10-demo-dataset-modes.md`         | This log.                                                                               |

---

## Files updated

| Path                                                  | Change                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/AppShell.tsx`                         | Added the global header strip carrying `<DatasetModeBanner compact />`.             |
| `src/components/Sidebar.tsx`                          | Added "Dataset Modes" nav item.                                                     |
| `src/app/page.tsx`                                    | Source-aware subtitle ("`Verb` via `Name`").                                        |
| `src/app/comparison/page.tsx`                         | Same — source-aware subtitle.                                                       |
| `src/features/causal-engine/report/types.ts`          | Added `ReportDatasetModeSection`; `schemaVersion` union extended to `"phase-10.v1"`.|
| `src/features/causal-engine/report/markdown.ts`       | Renders the dataset-mode bullet in §1 Cohort summary.                               |
| `src/features/causal-engine/report/index.ts`          | Re-exports the new type.                                                            |
| `src/features/causal-engine/index.ts`                 | Re-exports the new type from the public barrel.                                     |
| `src/server/causal/build-report.ts`                   | Auto-stamps every report with the active mode; `try/catch` keeps reports working when the store is missing. |
| `src/features/causal-engine/__tests__/report.test.ts` | Fixture extended with `datasetMode: null` so existing assertions still type-check.  |
| `docs/Plan.md`                                        | Phase 10 marked complete with checklist + manual commands.                          |
| `README.md`                                           | New feature-list bullet + roadmap row.                                              |
| `docs/architecture.md`                                | Added §11 — dataset mode manager + invariants.                                      |
| `docs/demo-script.md`                                 | Inserted Phase 10 step (1:00 – 1:15) walking through `/datasets`; intro updated.    |

## Files removed

None.

---

## Commands run by the agent

| # | Command                              | Result                                                                                          |
| - | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 | `npx tsc --noEmit`                   | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 2 | `npm test`                           | ✅ **31 files, 273 tests, all passed** (~6 s test exec).                                        |
| 3 | `npm run build`                      | ✅ Compiled, 15 routes generated (added `/datasets` with 2.93 KB of interactive client JS).     |

Per `CLAUDE.md`, the agent did **not** run any database migration, any
DB-writing CLI, any `pip install`, or `npm install`. No new npm
packages were added.

---

## Commands the operator must run manually

```bash
# No prisma migration in Phase 10 (mode state lives in a JSON file at
# data/processed/dataset-mode.json).

# Verify the new UI:
npm run dev                                # http://localhost:3000/datasets

# Inspect / hand-edit the persisted state (Phase 11+ may ship a CLI):
cat data/processed/dataset-mode.json

# Optional: regenerate downstream artefacts so the report carries the new mode stamp:
npm run causal:estimate
npm run causal:report -- --discovery --prediction --out docs/reports/cs-201-comparison.md
```

---

## Dependencies added

- **TypeScript:** *None.* The feature module, server module, UI
  components, switcher server action, and report extension all reuse
  existing primitives (`node:fs`, Prisma client, `revalidatePath`,
  Tailwind, React Server Components).
- **Python:** *None.* No interaction with the Phase 7 worker.
- **Persistence:** New JSON file at `data/processed/dataset-mode.json`
  — generated on first switch; the read path falls back to the
  default when missing.

---

## Assumptions made

1. **Switching is intent, not automation.** The server action only
   updates the persisted active mode and revalidates the routes. It
   does not auto-run `npm run shell:seed && npm run sync:university`
   when the user picks Shell University. The switcher surfaces the
   exact command as a copy-paste hint instead. Auto-running CLIs
   from a browser request felt like a hidden footgun for this phase.
2. **JSON file, not new Prisma table.** Avoids the Phase-10 migration
   step, matches the `CLAUDE.md` rule, and keeps the state
   independent from `prisma/dev.db` so a `npm run reset:demo --yes`
   doesn't accidentally wipe the user's mode preference.
3. **Safe-by-default reads.** `readState` and `normaliseState` always
   return a usable state. Tests cover three corruption paths
   (missing file, malformed JSON, unknown mode string).
4. **Global header banner via AppShell.** Embedding the banner inside
   `AppShell` means every route shows it without each page having to
   opt in. The chip is a server component that reads the store on
   every render — fine at the scale of the demo (~250 students).
5. **Subtitles are mode-aware, not full bodies.** I added the mode
   sentence only to `PageHeader` subtitles on `/` and `/comparison`.
   Touching every page would have inflated the diff; the global
   banner + the source-aware report stamp cover the remaining
   surfaces.
6. **Stale detection is wired but unused.** The `DatasetModeStatus`
   enum includes `"stale"` so a future revision can introduce time-
   based detection without a type churn.
7. **Report schema version bump is opt-in implicit.** Whenever
   `datasetMode` is non-null on a report, `schemaVersion` flips to
   `"phase-10.v1"`. Existing readers that only know
   `"phase-7.v1"` / `"phase-8.v1"` continue to work — the union is
   widened, not changed.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **273 / 273** tests pass (`npm test`), across 31 files (+32 vs Phase 9).
- [x] `npm run build` succeeds — 15 routes generated, including the
      new `/datasets`.
- [x] No DB migration / DB-writing CLI / `pip install` / `npm install`
      executed by the agent.
- [x] No new npm packages added.
- [x] Switching is non-destructive — asserted by the `setActiveDatasetMode`
      tests (only the JSON file is mutated).
- [x] Corrupted JSON state file recovers to the default — asserted in
      `store.test.ts`.
- [x] Unknown `activeMode` strings recover to `"synthetic"` —
      asserted in `store.test.ts`.
- [x] Report builder gracefully degrades when the mode store is
      unreadable (`datasetMode: null`).
- [x] Phase 0 – 9 functionality unchanged in behaviour; only additive
      changes (the `schemaVersion` union widening is backward-
      compatible).
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/demo-script.md` updated.
- [x] `docs/features/phase-10-demo-dataset-modes.md` created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 11

- **No CLI switcher.** Headless recording workflows (Playwright,
  scripted screenshots) currently have to either drive the UI or
  hand-edit the JSON file. A `npm run mode:switch <name>` is one of
  the cheapest follow-ups.
- **Global header layout.** Adding a small strip above every page
  shrinks vertical real estate by ~36 px. On the smallest target
  (1024px-wide laptops) this is fine; on a 720p projector it might
  matter — worth checking during the Phase 12 polish pass.
- **JSON file location.** `data/processed/` is git-ignored. A fresh
  clone will start with the default mode; that's the intended
  behaviour for a demo, but it does mean the user's mode preference
  is per-machine.
- **`revalidatePath` fan-out.** Hand-maintained list of paths in the
  server action. If a future page also shows the mode banner
  prominently, remember to add it to the revalidation list.
- **Report schema readers.** Anything consuming the JSON report
  payload outside this repo will need to accept the wider
  `schemaVersion` union. The new field is optional, so this is a
  soft break.

---

## Next recommended phase

**Phase 11 — Advisor Feedback / Intervention Tracking.**

Concrete first steps:

1. New Prisma model (e.g. `InterventionDecision`) carrying status
   (`proposed | accepted | rejected | deferred`), advisor note,
   follow-up outcome, timestamps. Document the migration command
   in `docs/Plan.md` for the operator.
2. UI affordances on each `<InterventionCard>` on `/students/[id]`:
   accept / reject / defer buttons + a free-text note field.
3. Server action `recordInterventionDecision(formData)` writing to
   the new model.
4. Per-student "intervention history" view with a small timeline.
5. Follow-up outcome capture (did the projected lift materialise?)
   to feed future causal-engine recalibration.
6. Surface the decision counts on `/` as a new metric tile.
7. Write `docs/features/phase-11-advisor-feedback-intervention-tracking.md`
   + execution log.
