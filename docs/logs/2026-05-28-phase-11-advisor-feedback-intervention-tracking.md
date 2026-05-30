# Execution Log — Phase 11: Advisor Feedback / Intervention Tracking

- **Date:** 2026-05-28
- **Phase:** 11 — Advisor Feedback / Intervention Tracking
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 10 (`docs/logs/2026-05-28-phase-10-demo-dataset-modes.md`)

---

## Objective

Turn the recommendation surface from a one-shot output into a stateful
feedback loop. The previous phases produced ranked counterfactual
recommendations (Phase 4) without any persistence of what advisors
actually *did* with them. Phase 11 adds:

- A new `InterventionDecision` Prisma model (1-to-1 with
  `InterventionSimulation`).
- Accept / Reject / Defer / Mark-complete action bar on every
  recommendation card.
- Optional advisor notes + observational follow-ups (with a
  honesty-banner above the form and a banned-phrase check at the
  persistence layer).
- A per-student chronological timeline of recommendation → decision →
  note → follow-up events.
- A cohort `/interventions` page describing advisor behaviour
  observationally.
- A new `--tracking` report section that stamps the decision summary
  into the downloadable Markdown / JSON.

Explicitly out of scope: multi-advisor identity, structured outcome
scoring, automated follow-up reminders, calibration curves.

---

## Files created

### TypeScript — feature module

| Path                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/intervention-tracking/types.ts`                 | Status enum, decision view, timeline event, analytics shape.                  |
| `src/features/intervention-tracking/status.ts`                | Labels, hints, badge classes, banned-phrase list, `containsBannedLanguage`, transitions. |
| `src/features/intervention-tracking/timeline.ts`              | Pure `buildTimelineEvents` + `mergeTimelines`.                                |
| `src/features/intervention-tracking/analytics.ts`             | `computeAnalytics` + observational insight generator.                         |
| `src/features/intervention-tracking/index.ts`                 | Barrel.                                                                       |

### TypeScript — server module

| Path                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server/intervention-tracking/decisions.ts`               | `recordDecision` / `recordFollowUp` / `clearDecision` with banned-phrase enforcement. |
| `src/server/intervention-tracking/queries.ts`                 | `getDecisionsForStudent` + `getInterventionTimelineForStudent` + `getCohortAnalytics` + `getRecentDecisions`. |
| `src/server/intervention-tracking/index.ts`                   | Barrel.                                                                       |
| `src/server/actions/intervention-tracking.ts`                 | Server actions + revalidatePath fan-out.                                      |

### TypeScript — UI

| Path                                              | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/DecisionStatusChip.tsx`           | Small badge for status rendering.                                                       |
| `src/components/InterventionActionBar.tsx`        | Client action bar with feedback area + observational follow-up form.                    |
| `src/components/InterventionTimeline.tsx`         | Server-rendered vertical timeline.                                                      |
| `src/app/interventions/page.tsx`                  | Cohort analytics + recent-activity feed.                                                |

### Tests

| Path                                                              | Coverage                                                  | Tests |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src/features/intervention-tracking/__tests__/status.test.ts`     | Labels, transitions, banned-language guard.               | 7     |
| `src/features/intervention-tracking/__tests__/timeline.test.ts`   | Event emission + chronological ordering + merge.          | 6     |
| `src/features/intervention-tracking/__tests__/analytics.test.ts`  | Counts, top-entry, banned-language assertion, edge cases. | 8     |
| `src/server/intervention-tracking/__tests__/decisions.test.ts`    | Server orchestration via mocked Prisma (validation, banned phrases, follow-up gating, idempotent clear). | 11 |

### Docs

| Path                                                              | Purpose                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `docs/features/phase-11-advisor-feedback-intervention-tracking.md` | Full per-feature spec.                                                                 |
| `docs/logs/2026-05-28-phase-11-advisor-feedback-intervention-tracking.md` | This log.                                                                       |

---

## Files updated

| Path                                                  | Change                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                | Added `InterventionDecision` model + back-relations on Student, Course, `InterventionSimulation`. |
| `src/server/queries/students.ts`                      | `StudentDetail` gains `decisions: Map<string, InterventionDecisionView>` + `interventionEvents: TimelineEvent[]`. `StudentInterventionRow` now carries `interventionSimulationId`. |
| `src/app/students/[id]/page.tsx`                      | Passes decisions to each card; renders the per-student timeline section.            |
| `src/app/comparison/page.tsx`                         | Threads `interventionSimulationId` through when constructing comparison rows.       |
| `src/components/InterventionCard.tsx`                 | New optional `decision` prop; mounts `<InterventionActionBar>` (suppressed for what-if previews where `interventionSimulationId` is null). |
| `src/components/WhatIfSimulator.tsx`                  | Passes `interventionSimulationId: null` for transient previews.                     |
| `src/components/Sidebar.tsx`                          | Added "Interventions" nav item.                                                     |
| `src/features/causal-engine/report/types.ts`          | New `ReportTrackingRow` + `ReportTrackingSection`; `schemaVersion` union extended to `phase-11.v1`. |
| `src/features/causal-engine/report/markdown.ts`       | Renders new tracking section + dynamic section numbering helper (`sectionHeader`) replacing the brittle `${prediction ? 7 : 6}` heuristic. |
| `src/features/causal-engine/report/index.ts`          | Re-exports the new types.                                                           |
| `src/features/causal-engine/index.ts`                 | Re-exports the new types from the public barrel.                                    |
| `src/server/causal/build-report.ts`                   | `--includeTracking` option + private `buildTrackingSection` helper.                 |
| `src/server/causal/report-cli.ts`                     | New `--tracking` flag.                                                              |
| `src/app/api/causal/report/route.ts`                  | New `?tracking=1` query param.                                                      |
| `src/features/causal-engine/__tests__/report.test.ts` | Fixture extended with `tracking: null`.                                             |
| `src/features/baseline-ml/__tests__/comparison.test.ts` | Fixture extended with `interventionSimulationId`.                                  |
| `docs/Plan.md`                                        | Phase 11 marked complete with checklist + manual commands.                          |
| `README.md`                                           | New feature-list bullet + roadmap row.                                              |
| `docs/architecture.md`                                | Added §12 — intervention feedback loop architecture.                                |
| `docs/causal-methodology.md`                          | Added §10 — observational follow-up vs causal validation.                           |
| `docs/demo-script.md`                                 | New 1:45 – 2:00 feedback-loop step; closing line updated.                           |

## Files removed

None.

---

## Commands run by the agent

| # | Command                              | Result                                                                                          |
| - | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 | `npm run prisma:generate`            | ✅ Prisma client regenerated with `InterventionDecision` model.                                 |
| 2 | `npx tsc --noEmit`                   | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 3 | `npm test`                           | ✅ **35 files, 305 tests, all passed** (~6 s test exec).                                        |
| 4 | `npm run build`                      | ✅ Compiled, 16 routes generated (added `/interventions`).                                      |

Per `CLAUDE.md`, the agent did **not** run any database migration, any
DB-writing CLI, any `pip install`, or `npm install`. No new npm
packages were added.

---

## Commands the operator must run manually

```bash
# 1. Apply the Phase 11 schema addition (new InterventionDecision table).
#    Non-destructive: additive only.
npx prisma migrate dev --name phase11_intervention_decisions

# 2. (If not already done by the agent) regenerate the Prisma client.
npm run prisma:generate

# 3. Demo flow:
npm run setup                                        # ensure base data exists
npm run dev                                          # http://localhost:3000

# Workflow inside the UI:
#   - /students/STU-0042 → react to a recommendation (Accept / Reject / Defer / Mark complete)
#   - After accepting → record an observational follow-up
#   - /interventions → cohort analytics + recent-activity feed
#   - Back on /students/STU-0042 → the timeline now shows the full chronology

# 4. Include the tracking section in a downloadable report:
npm run causal:report -- --tracking --discovery --prediction --out docs/reports/cs-201-feedback.md
npm run causal:report -- --tracking --format json --out docs/reports/cs-201-feedback.json
```

---

## Dependencies added

- **TypeScript:** *None.* Feature module, server module, UI components,
  server actions all reuse existing primitives (Prisma client,
  `revalidatePath`, Tailwind, React Server Components + `useTransition`).
- **Prisma:** New `InterventionDecision` model (additive — no breaking
  changes to existing tables; existing migrations untouched).

---

## Assumptions made

1. **No persisted "proposed" rows.** `proposed` is the implicit state
   when no decision row exists. The persisted enum is the four explicit
   decisions only. This means `mostAccepted` etc. analytics correctly
   count only explicit actions; "no decision yet" doesn't pollute the
   numbers.
2. **One-to-one decision per simulation.** Re-deciding updates the
   row in place. Full audit history is a Phase 12+ concern — for the
   demo, `updatedAt` is the canonical timestamp.
3. **Follow-ups are observational, not structured.** Free-text only;
   no improved/unchanged/declined dropdown. Structured signals were
   explicitly excluded because they invite causal-validation framing
   that the Phase-11 spec forbids.
4. **Honesty-language enforcement at the persistence boundary.** A
   banned phrase rejects the entire write — the orchestrator is the
   gatekeeper. The UI surfaces the error inline; no silent dropping
   of bad input.
5. **Server actions revalidate broad path scope.** `/`, `/students`,
   `/interventions`, `/comparison` get revalidated on every successful
   decision. A more targeted invalidation would be lighter but the
   broad call is correct and simple for the demo scale.
6. **Transient what-if previews show no action bar.** Passing
   `interventionSimulationId: null` from `<WhatIfSimulator>` keeps the
   action bar suppressed — there's no persisted row to attach a
   decision to, and accepting a slider preview without commitment
   would set up a misleading workflow.
7. **Per-student timeline is server-rendered.** The timeline events are
   produced from a pure helper (`buildTimelineEvents`) on the server,
   so the page stays light and no client hydration cost is paid for the
   feed.
8. **The markdown renderer now uses a dynamic section counter.** This
   incidentally fixes a pre-existing bug where the §6/§7 numbering
   assumed discovery was present when prediction was rendered. Tests
   still pass because the existing report-test fixture uses
   `schemaVersion: "phase-7.v1"` and only enables discovery; the
   counter starts at §5 and increments through whichever optional
   sections are populated.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **305 / 305** tests pass (`npm test`), across 35 files (+32 vs Phase 10).
- [x] `npm run build` succeeds — 16 routes generated, including the
      new `/interventions`.
- [x] No DB migration / DB-writing CLI / `pip install` / `npm install`
      executed by the agent.
- [x] No new npm packages added.
- [x] Banned-language enforcement asserted in `status.test.ts`,
      `analytics.test.ts`, and `decisions.test.ts`.
- [x] Server actions never throw — every failure path returns a
      structured `{ ok: false, error }` payload.
- [x] What-if previews don't crash when the action bar is absent —
      the new `interventionSimulationId !== null` guard handles it.
- [x] Existing report fixture extended with `tracking: null` — no
      behaviour changes for Phase 7 / 8 / 10 reports.
- [x] Phase 0 – 10 functionality unchanged in behaviour; only additive
      changes.
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/causal-methodology.md`, `docs/demo-script.md` updated.
- [x] `docs/features/phase-11-advisor-feedback-intervention-tracking.md`
      created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 12

- **`revalidatePath` scope.** Every successful action revalidates four
  broad paths. Fine at the demo scale; if any of those pages becomes
  expensive to render, switch to `revalidateTag` for the affected
  data domains.
- **No backfill of historical decisions.** A reviewer hitting
  `/interventions` on a fresh DB sees the empty state — the empty-state
  copy points them to the workflow, but a "click-to-prefill demo
  decisions" affordance might be cleaner for screen recordings.
- **`completed` does not lock the row.** An advisor can revert
  `completed → accepted → completed` ad infinitum. Fine for the demo;
  a real product might want a stronger lock or an explicit "reopen"
  action.
- **Banned-phrase list is small.** Four phrases catch the most
  obvious causal-validation claims but not every paraphrase.
  Expanding the list is mechanical; the structural honesty
  constraint (UI banner + result-type design) is what really matters.
- **Per-student timeline can grow long.** No pagination today.
  Probably fine for the demo cohort but worth watching once a real
  advisor has been clicking around for a term.

---

## Next recommended phase

**Phase 12 — Final Polish, GitHub, CV, LinkedIn.**

Concrete first steps:

1. README screenshot strip — capture 5 hero screenshots (Overview,
   Student profile with Prediction vs Intervention + decisions,
   Causal graph compare view, /interventions cohort feed, /datasets
   switcher) and drop them into `docs/screenshots/` referenced from
   the README placeholder table.
2. 60-90 second walkthrough video using `docs/demo-script.md`.
3. CV bullet drafts (concise / detailed / technical variants).
4. LinkedIn launch post (text + image).
5. Add an OSS-friendly `LICENSE` file.
6. Optional Vercel + Render/Railway deploy of the demo (with the
   honest "synthetic data only" banner).
7. Final pass on the test suite + a `npm run typecheck` GitHub Actions
   workflow.
8. Write `docs/features/phase-12-final-polish.md` + execution log.
