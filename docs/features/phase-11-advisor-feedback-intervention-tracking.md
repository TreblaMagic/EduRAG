# Phase 11 — Advisor Feedback / Intervention Tracking

> Status: **complete (2026-05-28)**. New `InterventionDecision` Prisma
> model + accept / reject / defer / complete action bar + observational
> follow-up form + per-student timeline + `/interventions` cohort page
> + downloadable report section. Honesty-language enforcement at the
> persistence boundary.

## 1. Goal

Turn the recommendation surface from a one-time analysis into a
stateful feedback loop:

- Every recommendation gets a lifecycle (`proposed → accepted | rejected
  | deferred | completed`).
- Advisors can attach short notes + observational follow-up text.
- The platform never claims these decisions or follow-ups validate the
  causal model — that constraint is enforced at the persistence layer
  by a banned-language check, asserted by tests, and surfaced as a
  honesty banner above every follow-up form.
- A cohort `/interventions` page describes what advisors actually did,
  in observational language only.

## 2. Lifecycle

```
                ┌───────────────────────────────────┐
                │      InterventionSimulation       │
                │      (Phase 4, persisted)         │
                └───────────────┬───────────────────┘
                                │
                                │  initial state: proposed
                                │  (no decision row yet)
                                ▼
        ┌────────┬──────────────┬──────────────┬────────────┐
        │        │              │              │            │
   accepted  rejected        deferred       completed     revert
        │        │              │              │            │
        └────────┴──────────────┴──────────────┴────────────┘
                                │
                                ▼
                ┌───────────────────────────────────┐
                │     InterventionDecision           │
                │     status, advisorNote,          │
                │     followUpOutcome,              │
                │     followUpObserved,             │
                │     followUpRecordedAt,           │
                │     createdAt, updatedAt          │
                └───────────────┬───────────────────┘
                                │
                                ▼  (only for accepted | completed)
                ┌───────────────────────────────────┐
                │  Observational follow-up form     │
                │  + "not proof of causality" banner│
                └───────────────────────────────────┘
```

Status transitions are intentionally lenient — advisors change their
mind. The action bar surfaces a `Revert` button that calls
`clearDecision` to return the recommendation to the implicit
`proposed` state.

## 3. Persistence

New Prisma model (additive, non-destructive):

```prisma
model InterventionDecision {
  id                       String   @id @default(cuid())
  studentId                String
  courseId                 String
  interventionSimulationId String   @unique
  status                   String          // accepted | rejected | deferred | completed
  advisorNote              String?
  followUpOutcome          String?
  followUpObserved         Boolean  @default(false)
  followUpRecordedAt       DateTime?
  notesJson                String?         // reserved
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  student                Student                @relation(...)
  course                 Course                 @relation(...)
  interventionSimulation InterventionSimulation @relation(...)

  @@index([studentId])
  @@index([courseId, status])
  @@index([updatedAt])
}
```

Unique constraint on `interventionSimulationId` enforces one decision
per recommendation. Re-deciding (accept → reject) updates the row in
place; the row's `updatedAt` is the canonical "last decision change"
timestamp.

## 4. Server orchestration

`src/server/intervention-tracking/decisions.ts`:

- **`recordDecision({ interventionSimulationId, status, advisorNote })`**
  — validates the status against `PERSISTED_STATUSES`, validates the
  note (length, banned phrases), upserts the row.
- **`recordFollowUp({ interventionSimulationId, followUpOutcome })`** —
  pre-condition that the existing decision is `accepted` or
  `completed`. Banned-phrase check. Sets `followUpObserved = true`,
  stamps `followUpRecordedAt`.
- **`clearDecision(interventionSimulationId)`** — deletes the row;
  idempotent (catches already-absent).

Server actions wrap the helpers (`src/server/actions/intervention-tracking.ts`):
`submitDecision`, `submitFollowUp`, `revertDecision`. Each one
validates the form data, calls the orchestrator, and revalidates the
mode-aware routes (`/`, `/students`, `/interventions`, `/comparison`).

## 5. UI surfaces

### Per-card action bar

`<InterventionActionBar>` (client component) sits at the bottom of
every `<InterventionCard>` on `/students/[id]`. Renders:

- **DecisionStatusChip** showing the current status.
- Accept / Reject / Defer / Mark-complete (only when `accepted`) /
  Revert buttons.
- Advisor-note input (≤ 500 chars).
- Conditional observational follow-up form gated behind `accepted` or
  `completed` — wrapped in an amber banner reading *"Observational
  follow-up — not proof of causality"*.
- Inline feedback area surfacing the server-action result.

The what-if simulator produces transient previews — its card receives
`interventionSimulationId: null` and the action bar is suppressed.

### Per-student timeline

`<InterventionTimeline>` (server component) renders a vertical feed
of `TimelineEvent[]` produced by the pure `buildTimelineEvents`
helper. Four event kinds (recommendation, decision, note, follow-up)
with distinct accent colours. Chronologically sorted, oldest first.

### `/interventions` cohort page

- Five metric tiles: Recommendations · Proposed · Accepted · Rejected
  / Deferred · Follow-ups recorded.
- "Decision breakdown" card listing every persisted status with its
  hint and count.
- "Most active levers" card highlighting `mostAccepted` and
  `mostDeferred` intervention names.
- "Observational insights" card rendering the analytics output as a
  bullet list.
- "Recent activity" feed (latest 12 decisions, newest first).
- Empty-state with copy that explains the workflow when no decisions
  exist.

## 6. Honesty-language enforcement

`src/features/intervention-tracking/status.ts` exports:

```ts
export const BANNED_PHRASES = [
  "guaranteed",
  "proven cause",
  "confirms causation",
  "scientific proof",
] as const;

export function containsBannedLanguage(text): string | null { ... }
```

The check is applied in `recordDecision` (advisor notes) and
`recordFollowUp` (follow-up outcomes). A banned phrase produces a
structured error like:

```
advisorNote contains banned phrase "guaranteed" — please rephrase.
Notes are observational and must not assert causal proof.
```

Tests in `status.test.ts`, `analytics.test.ts`, and `decisions.test.ts`
assert that no banned phrase ever leaks into emitted text and that the
write path rejects banned input.

## 7. Report extension

`buildCausalReport({ includeTracking: true })` populates a new
`ReportTrackingSection`:

- `totalRecommendations`, `proposedCount`, `decisionCounts`,
  `followUpsRecorded`.
- `observationalInsights` (the same array rendered on `/interventions`).
- `recentDecisions[]` — student / intervention / treatment / status /
  advisor note (truncated to 80 chars in the markdown table) / follow-up
  flag / `updatedAt`.
- `notes[]` — fixed strings making the honesty constraint explicit.

When the section is populated, `schemaVersion` flips to
`phase-11.v1`. The markdown renderer adds a dedicated section, with a
trailing honesty bullet: *"Decisions describe what advisors did.
Follow-ups describe what advisors observed. Neither validates the
causal model nor proves the projected lift materialised."*

Exposure:
- `npm run causal:report -- --tracking`
- `GET /api/causal/report?tracking=1`

## 8. Limitations

- **No advisor identity.** The schema models *what was decided*, not
  *who decided*. Single-user local-first demo — multi-user attribution
  is a Phase 12+ concern.
- **No follow-up severity / score.** Outcome is free text only.
  Capturing structured signals (improved / unchanged / declined +
  magnitude) is a natural Phase 12 polish, but the MVP intentionally
  avoids structured claims that could be mistaken for causal
  validation.
- **No backfill of historical decisions.** The action bar is a
  forward-looking workflow tool. A reviewer running the demo against a
  fresh DB will see empty states until they make decisions of their
  own.
- **`completed` is treated as "carried out", not "outcome recorded".**
  The follow-up section remains available after completion so an
  advisor can attach an observation later.
- **No undo for the history.** `revertDecision` deletes the row but
  does not preserve audit history beyond what `updatedAt` shows for
  the most recent change. A future revision could add a
  `DecisionHistory` append-only log.

## 9. Future improvements

- Append-only decision history table for full audit.
- Structured follow-up signals (improved / unchanged / declined +
  observed grade delta) so analytics can correlate accepted lift with
  observed delta — *only* as a calibration check, never as causal
  proof.
- Per-cohort calibration curve overlaid on `/causal-graph`: projected
  lift vs observed follow-up delta (with the explicit caveat banner).
- Multi-advisor support + identity attribution.
- Optional CSV / JSON export of the cohort decision log.

## 10. File map

### Created

| Path                                                                  | Purpose                                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/intervention-tracking/types.ts`                         | Status enum, decision view, timeline event, analytics shape.                            |
| `src/features/intervention-tracking/status.ts`                        | Labels, hints, badge classes, banned-phrase list, `canTransition`, `containsBannedLanguage`. |
| `src/features/intervention-tracking/timeline.ts`                      | Pure `buildTimelineEvents` + `mergeTimelines`.                                          |
| `src/features/intervention-tracking/analytics.ts`                     | `computeAnalytics` + observational insight generator.                                   |
| `src/features/intervention-tracking/index.ts`                         | Barrel.                                                                                 |
| `src/server/intervention-tracking/decisions.ts`                       | `recordDecision` / `recordFollowUp` / `clearDecision` with banned-phrase enforcement.   |
| `src/server/intervention-tracking/queries.ts`                         | `getDecisionsForStudent` + `getInterventionTimelineForStudent` + `getCohortAnalytics` + `getRecentDecisions`. |
| `src/server/intervention-tracking/index.ts`                           | Barrel.                                                                                 |
| `src/server/actions/intervention-tracking.ts`                         | Server actions: `submitDecision` / `submitFollowUp` / `revertDecision` + revalidatePath fan-out. |
| `src/components/DecisionStatusChip.tsx`                               | Small badge for status rendering.                                                       |
| `src/components/InterventionActionBar.tsx`                            | Client action bar (accept / reject / defer / complete / revert + note + follow-up).     |
| `src/components/InterventionTimeline.tsx`                             | Server-rendered vertical timeline.                                                      |
| `src/app/interventions/page.tsx`                                      | Cohort analytics + recent-activity feed.                                                |
| `src/features/intervention-tracking/__tests__/status.test.ts`         | 7 tests — labels, transitions, banned-language guard.                                   |
| `src/features/intervention-tracking/__tests__/timeline.test.ts`       | 6 tests — event emission + chronological ordering.                                      |
| `src/features/intervention-tracking/__tests__/analytics.test.ts`      | 8 tests — counts, top-entry, banned-language assertion.                                 |
| `src/server/intervention-tracking/__tests__/decisions.test.ts`        | 11 tests — server orchestration via mocked Prisma.                                      |
| `docs/features/phase-11-advisor-feedback-intervention-tracking.md`    | This spec.                                                                              |
| `docs/logs/2026-05-28-phase-11-advisor-feedback-intervention-tracking.md` | Execution log.                                                                      |

### Updated

| Path                                                          | Change                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                        | Added `InterventionDecision` model + relations on Student / Course / `InterventionSimulation`. |
| `src/server/queries/students.ts`                              | New `decisions` Map + `interventionEvents` timeline on `StudentDetail`. `StudentInterventionRow` carries `interventionSimulationId`. |
| `src/app/students/[id]/page.tsx`                              | Passes decisions to each card; renders the per-student timeline.                      |
| `src/app/comparison/page.tsx`                                 | Threads `interventionSimulationId` through when constructing comparison rows.         |
| `src/components/InterventionCard.tsx`                         | Accepts `decision` prop; mounts `<InterventionActionBar>` (suppressed for what-if previews). |
| `src/components/WhatIfSimulator.tsx`                          | Passes `interventionSimulationId: null` for transient previews.                       |
| `src/components/Sidebar.tsx`                                  | Added "Interventions" nav item.                                                       |
| `src/features/causal-engine/report/types.ts`                  | New `ReportTrackingRow` + `ReportTrackingSection`; `schemaVersion` union extended to `phase-11.v1`. |
| `src/features/causal-engine/report/markdown.ts`               | Renders new tracking section + dynamic section numbering (fixes pre-existing bug when prediction was present without discovery). |
| `src/features/causal-engine/report/index.ts`                  | Re-exports the new types.                                                             |
| `src/features/causal-engine/index.ts`                         | Re-exports the new types from the public barrel.                                      |
| `src/server/causal/build-report.ts`                           | `--includeTracking` option → populates `tracking`; new private `buildTrackingSection`. |
| `src/server/causal/report-cli.ts`                             | New `--tracking` flag.                                                                |
| `src/app/api/causal/report/route.ts`                          | New `?tracking=1` query param.                                                        |
| `src/features/causal-engine/__tests__/report.test.ts`         | Fixture extended with `tracking: null` so existing assertions still type-check.       |
| `src/features/baseline-ml/__tests__/comparison.test.ts`       | Fixture extended with `interventionSimulationId`.                                     |
| `docs/Plan.md`                                                | Phase 11 marked complete with checklist + manual commands.                            |
| `README.md`                                                   | New feature-list bullet + roadmap row.                                                |
| `docs/architecture.md`                                        | Added §12 — intervention feedback loop architecture.                                  |
| `docs/causal-methodology.md`                                  | Added §10 — observational follow-up vs causal validation.                             |
| `docs/demo-script.md`                                         | New 1:45 – 2:00 feedback-loop step; closing line updated.                             |

**Totals: 32 new tests (+305 cumulative passing) · typecheck clean · build clean (16 routes including `/interventions`).**
