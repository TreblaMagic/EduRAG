# Phase 10 — Demo Dataset Modes

> Status: **complete (2026-05-28)**. Three canonical modes
> (`synthetic`, `shell-university`, `uploaded`). JSON-file persistence
> (no migration). Global indicator chip + `/datasets` switcher +
> source-aware page subtitles + dataset-mode provenance on every
> report.

## 1. Goal

Make EduRAG feel like a flexible educational-analytics platform that
adapts to multiple ingestion scenarios — not a static demo. The
reviewer should instantly understand:

- Where the data on screen came from.
- Which mode is active.
- How to switch between modes safely.

Switching must be **non-destructive** — never silently wiping data —
and every downstream surface (banners, reports, comparison page) must
reflect the active mode without copy drift.

## 2. Architecture

```
              ┌───────────────────────────────────────────────────┐
              │    src/features/dataset-modes/  (pure)            │
              │                                                   │
              │  types.ts      DatasetMode, snapshot, state shapes│
              │  metadata.ts   per-mode descriptions + accent     │
              │  status.ts     snapshot derivation + relative time│
              │  index.ts      barrel                             │
              └────────────────────────────┬──────────────────────┘
                                           │
                                           ▼
              ┌───────────────────────────────────────────────────┐
              │    src/server/dataset-mode/  (Node-only)          │
              │                                                   │
              │  store.ts          JSON file read/write/normalise │
              │  orchestrator.ts   joins state + Prisma probes    │
              │  index.ts          barrel                         │
              └────────────────────────────┬──────────────────────┘
                                           │
        ┌──────────────────────────────────┼──────────────────────────┐
        │                                  │                          │
        ▼                                  ▼                          ▼
  <AppShell> header             /datasets page              buildCausalReport
  banner chip                   three-card switcher         (Phase 7 + 8 + 10)
  (always visible)              + status badges             stamps every report
                                + refresh hints             with the active mode
                                                            ▼
                                                      switchDatasetMode
                                                      server action +
                                                      revalidatePath(...)
```

### Key invariants

1. **Switching is non-destructive.** Updating the active mode only
   rewrites `data/processed/dataset-mode.json`. DB rows are untouched.
   `npm run reset:demo --yes` (Phase 9) remains the destructive
   escape hatch.
2. **JSON persistence, no migration.** Keeps Phase 10 fully additive.
3. **Safe-by-default fallback.** Any I/O or parse error in `readState`
   yields `DEFAULT_DATASET_STATE` (`activeMode: "synthetic"`). The
   function never throws.
4. **Single source of truth.** Per-mode metadata lives in
   `DATASET_MODE_METADATA`. The banner, switcher, /about page, and
   report builder all read from it — copy never drifts.
5. **Source-aware subtitles.** Overview + Comparison pages append
   "`Verb` via `Mode Name`" to their `PageHeader` subtitle so the
   active mode reads naturally inline.

## 3. Mode catalogue

| id                  | Name                          | Verb        | Accent   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ----------------------------- | ----------- | -------- | ----------------------------------- |
| `synthetic`         | Synthetic Demo Dataset        | Generated   | indigo   | Default mode. Deterministic Python generator, 250 students × 14 weeks. No external dependencies, perfect for screenshots and tests. |
| `shell-university`  | Shell University API Sync     | Synced      | emerald  | A fake Moodle/Canvas exposed at `/api/shell-university/*`. The typed connector + mapper at `src/server/sync/shell-university/` is the shape a real LMS adapter would target. |
| `uploaded`          | Uploaded CSV Dataset          | Uploaded    | amber    | A real CSV uploaded through `/upload`. Server validates row-by-row, previews stats + errors before commit, then runs the full ingest → derive → estimate → simulate → predict pipeline in place. |

Each entry also carries a `refreshHint` (the exact shell command that
repopulates that source) and a `recommendedFor` paragraph the
`/datasets` page renders.

## 4. Persistence

Storage: `data/processed/dataset-mode.json`. Shape:

```json
{
  "activeMode": "synthetic" | "shell-university" | "uploaded",
  "switchedAt": "<ISO timestamp>",
  "reason": "optional free text, ≤ 200 chars"
}
```

Why a JSON file?

- **No new Prisma table** → no migration → matches the `CLAUDE.md`
  workflow rule.
- **Survives `reset:demo`.** The reset CLI wipes Prisma rows but
  leaves `data/processed/`. The user's mode choice persists across
  resets.
- **Tiny enough to validate on every read.** `normaliseState` runs
  on every read; missing fields are replaced with safe defaults; an
  unknown `activeMode` falls back to `"synthetic"`.

## 5. Switching flow

`switchDatasetMode(FormData)` server action (`src/server/actions/dataset-mode.ts`):

1. Read `mode` + optional `reason` from the form.
2. Validate `mode` via `isDatasetMode` — reject unknown values with a
   structured error (`{ ok: false, error }`).
3. `setActiveDatasetMode(mode, reason)` — writes the JSON file with a
   fresh `switchedAt`.
4. `revalidatePath` every mode-aware route so the next render reflects
   the new active mode without a hard reload.
5. Return `{ ok: true, activeMode, switchedAt, error: null }`.

The `<DatasetModeSwitcher>` client component handles the UI: each
card has a `Make active` button → an inline confirmation block with
an optional reason input → `Confirm switch` → server action call →
success/failure banner. The component never auto-runs CLIs. Empty
modes get an inline `⚠ This mode currently has no data` warning with
the refresh hint copy-pasteable.

## 6. UI placement

- **Global header strip.** `<AppShell>` renders a `<DatasetModeBanner
  compact />` chip in the top-right of every page. Click → /datasets.
- **`/datasets` page.** Hero card (currently active mode) → three-up
  switcher grid → "Why three modes?" explainer.
- **Page subtitles.** `/` and `/comparison` append `Verb via Name`
  to their `PageHeader` subtitle.
- **Sidebar.** New "Dataset Modes" nav item.

## 7. Source-aware reports

`buildCausalReport` (Phase 7) now stamps every report with the active
mode:

- `schemaVersion: "phase-10.v1"` whenever the report is produced.
- New `datasetMode` field carrying `{ id, name, verb, description,
  lastUpdatedAt, lastUpdatedDetail }`.
- Markdown renderer adds a bullet to §1 Cohort Summary:
  `Dataset mode: <Name> (id) — <verb> data; <last-update detail>`.
- JSON renderer ships the structured payload (round-trip-safe via
  `JSON.parse(JSON.stringify(...))`).

The dataset-mode lookup is wrapped in `try/catch` — if the JSON state
file is unreadable for any reason, the report still generates, just
with `datasetMode: null`.

## 8. Graceful degradation

| Scenario                                | Behaviour                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------- |
| JSON state file missing                 | `readState` returns the default; banner shows "Synthetic Demo Dataset".    |
| JSON state file corrupted               | Same — `normaliseState` falls back to default; reviewer sees no error.     |
| Persisted `activeMode` is unknown        | Same — coerced to `synthetic` on read.                                     |
| Switching to an empty mode              | Switch succeeds; switcher shows `⚠ no data` warning + refresh hint.        |
| Prisma probes throw inside orchestrator | Report builder catches → `datasetMode: null`; dashboard pages still render. |
| Server action call from outside request | `revalidatePath` `try/catch`ed; no page crash.                              |

## 9. Limitations

- **Single global mode.** No per-user / per-tab mode. Reasonable for
  the local-first demo; not a multi-tenant solution.
- **No CLI switcher.** Mode switching is UI-only today. Headless
  recording scripts that need a specific mode can edit the JSON file
  directly, but a `npm run mode:switch` CLI would be a clean
  Phase 11+ addition.
- **No "stale" detection.** The status enum has a `stale` variant
  but no module currently emits it — every dataset with rows is
  marked `ready`. A future revision could mark Shell University /
  upload modes `stale` after N hours.
- **Mode switching doesn't auto-refresh data.** By design (Phase 10
  is about *intent*, not automation). Phase 11+ could optionally
  chain through to a sync / re-ingest after a switch.

## 10. Future polish

- `npm run mode <name>` CLI for headless workflows.
- "Stale" detection with configurable thresholds per mode.
- Per-mode pinned report folders (`docs/reports/by-mode/<mode>/`).
- Show the last 5 mode switches as a history strip on `/datasets`.
- Hook the switcher to optionally trigger the refresh command
  (with explicit confirmation).

## 11. File map

### Created

| Path                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/dataset-modes/types.ts`                         | `DatasetMode`, snapshot + state shapes, `DEFAULT_DATASET_STATE`.              |
| `src/features/dataset-modes/metadata.ts`                      | Per-mode catalogue + `isDatasetMode` guard.                                   |
| `src/features/dataset-modes/status.ts`                        | `snapshotsFor` + `formatRelative` + `statusLabel`.                            |
| `src/features/dataset-modes/index.ts`                         | Barrel.                                                                       |
| `src/server/dataset-mode/store.ts`                            | JSON file read/write + `normaliseState` (recovers corrupted input).           |
| `src/server/dataset-mode/orchestrator.ts`                     | `getDatasetModeOverview` + `setActiveDatasetMode` + Prisma probes.            |
| `src/server/dataset-mode/index.ts`                            | Barrel.                                                                       |
| `src/server/actions/dataset-mode.ts`                          | `switchDatasetMode` server action + `revalidatePath` fan-out.                 |
| `src/components/DatasetModeBanner.tsx`                        | Server-rendered chip used in the global header.                               |
| `src/components/DatasetModeSwitcher.tsx`                      | Client switcher with confirmation + reason input + status warnings.           |
| `src/app/datasets/page.tsx`                                   | Overview + switcher.                                                          |
| `src/features/dataset-modes/__tests__/metadata.test.ts`       | 7 tests — catalogue coverage + isDatasetMode guard.                           |
| `src/features/dataset-modes/__tests__/status.test.ts`         | 11 tests — snapshot shaping + relative time + status label.                   |
| `src/server/dataset-mode/__tests__/store.test.ts`             | 11 tests — round-trip, missing-file fallback, corrupted-file recovery.        |
| `src/server/dataset-mode/__tests__/orchestrator.test.ts`      | 3 tests — set + read + idempotent rewrite.                                    |
| `docs/features/phase-10-demo-dataset-modes.md`                | This spec.                                                                    |
| `docs/logs/2026-05-28-phase-10-demo-dataset-modes.md`         | Execution log.                                                                |

### Updated

| Path                                                  | Change                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/AppShell.tsx`                         | Added the global header strip carrying `<DatasetModeBanner compact />`.             |
| `src/components/Sidebar.tsx`                          | Added "Dataset Modes" nav item.                                                     |
| `src/app/page.tsx`                                    | Mode-aware subtitle ("`Verb` via `Name`").                                          |
| `src/app/comparison/page.tsx`                         | Same — mode-aware subtitle.                                                         |
| `src/features/causal-engine/report/types.ts`          | Added `ReportDatasetModeSection`; `schemaVersion` union extended to `"phase-10.v1"`.|
| `src/features/causal-engine/report/markdown.ts`       | Renders the dataset-mode bullet in §1 Cohort summary.                               |
| `src/features/causal-engine/report/index.ts`          | Re-exports the new type.                                                            |
| `src/features/causal-engine/index.ts`                 | Re-exports the new type from the public barrel.                                     |
| `src/server/causal/build-report.ts`                   | Auto-stamps every report with the active mode; `try/catch` keeps reports working when the store is missing. |
| `src/features/causal-engine/__tests__/report.test.ts` | Fixture extended with `datasetMode: null` so existing assertions still type-check.  |
| `docs/Plan.md`                                        | Phase 10 marked complete with checklist + manual commands.                          |
| `README.md`                                           | New feature-list bullet + roadmap row.                                              |
| `docs/architecture.md`                                | Added §11 — dataset mode manager.                                                   |
| `docs/demo-script.md`                                 | Inserted Phase 10 step (1:00 – 1:15) walking through `/datasets`; intro updated.    |

**Totals: 32 new tests (+273 cumulative passing) · typecheck clean · build clean (15 routes including `/datasets`).**
