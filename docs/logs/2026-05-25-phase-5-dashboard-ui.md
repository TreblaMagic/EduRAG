# Execution Log — Phase 5: Dashboard UI

- **Date:** 2026-05-25
- **Phase:** 5 — Dashboard UI
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 4 (`docs/logs/2026-05-25-phase-4-counterfactual-what-if-engine.md`)

---

## Objective

Build the first portfolio-quality dashboard for the prototype. Five
Next.js App Router routes, server components reading via dedicated query
helpers, one client component for the interactive what-if simulator,
zero new dependencies, honesty UX baked into every projection.

Explicitly out of scope: authentication, admin settings, deploy.

---

## Files created

### Source — app routes & layout

| Path                                    | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `src/app/layout.tsx`                    | Root layout + metadata + body wrap.                       |
| `src/app/globals.css`                   | Tailwind directives + base body styles + focus ring.      |
| `src/app/page.tsx`                      | `/` overview dashboard (server).                          |
| `src/app/students/[id]/page.tsx`        | `/students/[id]` student detail (server).                 |
| `src/app/students/[id]/not-found.tsx`   | `notFound()` fallback (server).                           |
| `src/app/causal-graph/page.tsx`         | `/causal-graph` DAG + estimate table (server).            |
| `src/app/what-if/page.tsx`              | `/what-if` wrapper around the client simulator (server).  |
| `src/app/upload/page.tsx`               | `/upload` static placeholder (server).                    |

### Source — components

| Path                                  | Type   | Purpose                                                |
| ------------------------------------- | ------ | ------------------------------------------------------ |
| `src/components/AppShell.tsx`         | Server | Sidebar + main-area flex container.                    |
| `src/components/Sidebar.tsx`          | Client | `usePathname` for active-link highlighting.            |
| `src/components/PageHeader.tsx`       | Server | Title + subtitle + action slot.                        |
| `src/components/MetricCard.tsx`       | Server | Big-number card with emphasis.                         |
| `src/components/ConfidenceChip.tsx`   | Server | Colour-coded refutation chip.                          |
| `src/components/EmptyState.tsx`       | Server | Dashed placeholder with CTA slot.                      |
| `src/components/HonestyNote.tsx`      | Server | Info/warning banner.                                   |
| `src/components/StudentTable.tsx`     | Server | Cohort grid with risk badges + confidence chips.       |
| `src/components/InterventionCard.tsx` | Server | Projection + CI + caveats + explanation + disclaimer.  |
| `src/components/TrendChart.tsx`       | Server | **Custom SVG line chart** — zero deps.                 |
| `src/components/CausalGraphView.tsx`  | Server | **Custom SVG DAG** — hand-laid layout, edge rationales.|
| `src/components/WhatIfSimulator.tsx`  | Client | Form + slider + server-action submit + result card.    |

### Source — lib & data access

| Path                                              | Purpose                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/cn.ts`                                   | Falsy-aware class concatenator.                                        |
| `src/lib/formatters.ts`                           | Display formatters (grade, delta, range, percent, number, decimal).    |
| `src/lib/confidence-label.ts`                     | `confidenceMetaFor` + `riskLevelFor` + `riskMetaFor`.                  |
| `src/lib/intervention-language.ts`                | `interventionLabel`, `featureLabel`, `projectionHeadline`, `ciSpansZero`, `HONESTY_DISCLAIMER`. |
| `src/server/queries/dashboard.ts`                 | `getDashboardData` + pure `computeRiskCount` / `pickStrongestDriver`.   |
| `src/server/queries/students.ts`                  | `getStudentDetail` + `listStudentsForDropdown`.                        |
| `src/server/queries/causal.ts`                    | `getCausalEstimatesForCourse`.                                         |
| `src/server/queries/shared.ts`                    | `confidenceForRefutationJson` shared parser.                           |
| `src/server/actions/what-if.ts`                   | `runWhatIf` server action — reuses Phase 4 `simulateIntervention`.     |
| `next-env.d.ts`                                   | Standard Next.js TS reference file (committed).                        |

### Tests (36 new, 140 total — all green)

| Path                                                              | Tests |
| ----------------------------------------------------------------- | ----: |
| `src/lib/__tests__/formatters.test.ts`                            | 10    |
| `src/lib/__tests__/confidence-label.test.ts`                      |  9    |
| `src/lib/__tests__/intervention-language.test.ts`                 | 10    |
| `src/server/queries/__tests__/dashboard.test.ts`                  |  7    |

### Docs

| Path                                                                | Purpose                |
| ------------------------------------------------------------------- | ---------------------- |
| `docs/features/phase-5-dashboard-ui.md`                             | Per-feature spec.      |
| `docs/logs/2026-05-25-phase-5-dashboard-ui.md`                      | This log.              |

---

## Files updated

| Path                              | Change                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/Plan.md`                    | Phase 5 marked complete; expanded the Phase 5 section with checklist + manual commands.|
| `README.md`                       | Added `npm run dev` step; added "Dashboard routes" table; bumped Phase 5 to ✅.        |
| `docs/demo-script.md`             | Rewrote to reference live routes and the actual UI elements built in this phase.      |
| `src/components/CausalGraphView.tsx` | Removed invalid `textTransform` SVG attribute (caught by `tsc --noEmit`).            |
| `next-env.d.ts`                   | Auto-touched by Next 15 build (added `./.next/types/routes.d.ts` reference).          |

## Files removed

| Path                            | Reason                              |
| ------------------------------- | ----------------------------------- |
| `src/app/.gitkeep`              | Folder now populated.               |
| `src/components/.gitkeep`       | Folder now populated.               |

---

## Commands run by the agent

| # | Command                                  | Result                                                                          |
| - | ---------------------------------------- | ------------------------------------------------------------------------------- |
| 1 | `npx tsc --noEmit` (initial)             | 1 error — invalid SVG attr.                                                     |
| 2 | Fixed `CausalGraphView.tsx`              | Removed `textTransform`; uppercased the label literal.                          |
| 3 | `npx tsc --noEmit` (final)               | ✅ Typecheck clean.                                                              |
| 4 | `npm test`                               | ✅ **13 files, 140 tests, all passed** (~290 ms test exec).                      |
| 5 | `npm run build`                          | ✅ Compiled in 20.2 s, 4 static pages generated, 3.38 KB client bundle.          |

Per `CLAUDE.md`, the agent did **not** run any database migration or the
`db:ingest` / `causal:estimate` / `causal:simulate` CLIs.

---

## Commands the operator must run manually

```bash
# No new prisma migration in Phase 5 (UI-only).

# Prereqs (from Phases 2–4 — only re-run if data is stale):
npm run db:ingest
npm run causal:estimate
npm run causal:simulate

# Launch the dashboard:
npm run dev                       # http://localhost:3000
# Or production preview:
npm run build && npm start
```

---

## Dependencies added

**None.** The "minimal deps" constraint was met by writing:

- A custom SVG line chart (`TrendChart.tsx`) in place of Recharts
- A custom SVG DAG renderer (`CausalGraphView.tsx`) in place of React Flow
- A 3-line `cn()` helper in place of `clsx`

Net new install: 0 packages. Total client bundle for the only interactive
route (`/what-if`): 3.38 KB.

---

## Routes implemented

| Route                | Purpose                                                              | Source                                                  |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `/`                  | Overview dashboard.                                                  | `src/app/page.tsx`                                      |
| `/students/[id]`     | Student profile with timeline + ranked interventions.                | `src/app/students/[id]/page.tsx` + `not-found.tsx`      |
| `/causal-graph`      | Custom SVG DAG + β/CI/refutation table.                              | `src/app/causal-graph/page.tsx`                         |
| `/what-if`           | Interactive simulator (slider + server action).                      | `src/app/what-if/page.tsx` + `WhatIfSimulator` (client) |
| `/upload`            | Static placeholder (CSV contract + privacy rules).                   | `src/app/upload/page.tsx`                               |

---

## Components created

12 reusable components — split by responsibility:

- **Shell:** `AppShell`, `Sidebar`, `PageHeader`
- **Primitives:** `MetricCard`, `ConfidenceChip`, `EmptyState`, `HonestyNote`
- **Data:** `StudentTable`, `InterventionCard`
- **Custom-SVG:** `TrendChart`, `CausalGraphView`
- **Interactive:** `WhatIfSimulator` (the only client component)

---

## Dashboard summary

**Overview** lights up six metric cards, then a sorted-by-risk cohort
table. Every row links to a student profile and carries a confidence
chip. A honesty banner sits between the metrics and the table.

**Student detail** has 4-card baseline metrics, 4-card derived metrics,
two timeline charts, an honesty banner, and a 2-column grid of
ranked intervention cards. The interventions are read from
`InterventionSimulation` order-by `rankScore` desc.

---

## What-if simulator summary

Two-column layout. Left = form (student select, intervention select,
delta slider). Right = result (the same `InterventionCard` used on the
student page) or empty-state prompt.

Server action `runWhatIf` lives in `src/server/actions/what-if.ts`. It:

1. Validates inputs.
2. Loads the student's feature row + cohort feature table + matching
   `CausalEstimate`.
3. Builds a `CausalEstimateSummary` (translates persisted refutation
   JSON to the `refutationPassesAll`/`Any` flags).
4. Computes cohort stats.
5. Calls `simulateIntervention()` — the same pure function from Phase 4
   that backs the persisted ranked recommendations.
6. Returns the typed `SimulatedIntervention` to the client.

**No projection math lives in UI code.** The simulator is the single
source of truth.

---

## Honesty / uncertainty UX implemented

- `HonestyNote` banner at the top of every projection-bearing page
  (`/`, `/students/[id]`, `/what-if`). On `/causal-graph` it uses the
  `warning` tone with the binding caveat: "this graph encodes our model
  assumptions, not universal truth".
- Every `InterventionCard` shows: projected change · improvement range ·
  current vs proposed value · β used · confidence chip · adaptive
  caveats · explanation prose · standardised `HONESTY_DISCLAIMER` footer.
- Adaptive caveat rules in `InterventionCard`:
  - CI spans zero → yellow "The model cannot rule out no effect."
  - Headroom clamped applied delta to 0 → yellow "Student is already at
    the cohort ceiling for this feature — no room to apply this change."
- `ConfidenceChip` colour codes: emerald = high, amber = medium, rose =
  low. Low-confidence cards are **shown, never hidden**.
- `StudentTable` shows risk badge per row (rose/amber/emerald) +
  confidence chip on the top recommendation column.
- `HONESTY_DISCLAIMER` constant is asserted by unit test to contain
  `model-based` + `cohort-average` and to NEVER contain `guaranteed`,
  `proven`, `definitely`, `will improve`.

---

## Tests added and results

```
✓ src/lib/__tests__/formatters.test.ts                    (10 tests)
✓ src/lib/__tests__/confidence-label.test.ts              ( 9 tests)
✓ src/lib/__tests__/intervention-language.test.ts         (10 tests)
✓ src/server/queries/__tests__/dashboard.test.ts          ( 7 tests)
+ 104 pre-existing tests from Phases 1–4

Test Files  13 passed (13)
     Tests  140 passed (140)
```

UI components are intentionally **not** unit-tested — the test surface
focuses on pure helpers and shaping logic where regressions matter most.
End-to-end correctness is verified by `npm run build` per phase.

---

## Assumptions made

1. **Zero charting / graph dependencies.** Custom SVG (~250 LoC total
   across `TrendChart` + `CausalGraphView`) covers every demand of the
   demo with full design control. Swap in Recharts / React Flow only
   if the dashboard grows past their scope.
2. **`/students/[id]` uses `externalId`**, not the Prisma cuid. URLs
   like `/students/STU-0042` read better and are stable across DB
   rebuilds.
3. **No top-level `/students` listing.** Navigation to a profile is from
   the cohort table on `/`. Avoids a thin redundant page.
4. **Server components by default; client only where needed.** Only
   `WhatIfSimulator` and `Sidebar` are client components. The dashboard
   ships ~3.38 KB of route-specific JS.
5. **`dynamic = "force-dynamic"` on data routes.** The dashboard always
   reads live SQLite — caching on the route layer would hide updates
   from `db:ingest`/`causal:estimate`/`causal:simulate` runs.
6. **What-if simulator does NOT persist.** Persistent rows still come
   from `npm run causal:simulate`. The UI is a what-if **explorer**, not
   a writer — keeps the data model honest.
7. **Honesty in code, not just docs.** The required + forbidden phrase
   contract on `HONESTY_DISCLAIMER` is asserted by a vitest test. CI
   would fail if a future commit drifts the wording.
8. **Pre-existing `next-env.d.ts` committed.** Standard Next.js
   practice; the first `next build` may rewrite it to add additional
   reference paths (e.g. `./.next/types/routes.d.ts`).

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict mode + `noUncheckedIndexedAccess`).
- [x] All 140 unit tests pass (`npm test`).
- [x] `npm run build` succeeds — all 5 routes compile, 4 pages generated.
- [x] Client bundle minimal: only `/what-if` ships interactive JS (3.38 KB).
- [x] No new dependencies added.
- [x] No database migration / DB-writing CLI executed by the agent.
- [x] No authentication or admin scaffolding added.
- [x] `docs/Plan.md` updated — Phase 5 marked complete + commands listed.
- [x] `docs/features/phase-5-dashboard-ui.md` created.
- [x] `README.md` lists `npm run dev` + the 5 routes.
- [x] `docs/demo-script.md` rewritten to reference live UI elements.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 6

- **Screenshots vary with the seed.** The dashboard renders whatever
  `causal:estimate` + `causal:simulate` last produced. Pin the
  generator seed in the README demo flow so reviewers see consistent
  numbers.
- **`/students/[id]` Next 15 params.** App Router now returns `params`
  as a Promise. If we add more dynamic segments, follow the same
  `await params` pattern used here.
- **Empty-state copy needs translation** if the project ever
  internationalises. Centralised in components — easy to swap later.
- **CSV upload still pending.** The `/upload` page sets expectations,
  but the actual ingest flow is CLI-only. Phase 6 may or may not
  promote it depending on demo scope.
- **No screen-reader audit.** Components use semantic HTML and
  `aria-*` where natural (`aria-current="page"` on the active nav,
  `role="img"` on charts), but a full a11y pass is deferred to launch.

---

## Next recommended phase

**Phase 6 — Polish, GitHub, CV & LinkedIn Launch.**

Concrete first steps:

1. Add a top-of-README screenshot strip (Overview, Student profile,
   Causal graph, What-If) once data is seeded.
2. Record a 60-90 second walkthrough video using `docs/demo-script.md`.
3. Draft CV bullet points (3 versions: concise, detailed, technical).
4. Draft LinkedIn launch post (text + image).
5. Tighten any remaining copy for screenshot quality (currency of
   numbers, header alignment, font hierarchy).
6. Choose a public license (TBD in README) and add a `LICENSE` file.
7. Optional: deploy to Vercel + Render for a live demo URL.
8. Write `docs/features/phase-6-polish-and-launch.md` + execution log.
