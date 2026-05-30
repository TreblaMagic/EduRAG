# Feature Spec — Phase 5: Dashboard UI

> The first **visually demonstrable** phase. Wraps every Phase 1-4
> capability in a clean Next.js App Router dashboard suitable for
> recruiter screenshots, LinkedIn posts, and code review.

---

## 1. What was implemented

### 1.1 Routes (Next.js App Router)

| Path             | Purpose                                                                       | Render mode      |
| ---------------- | ----------------------------------------------------------------------------- | ---------------- |
| `/`              | Overview dashboard: metrics, strongest driver, cohort table.                  | Dynamic (server) |
| `/students/[id]` | Student profile: metrics, weekly charts, ranked intervention cards.           | Dynamic (server) |
| `/causal-graph`  | Custom SVG DAG + per-treatment β/CI/refutation table.                          | Dynamic (server) |
| `/what-if`       | Interactive simulator (server action backing).                                | Dynamic (server) |
| `/upload`        | Placeholder explaining CSV contract + privacy rules.                          | Static           |

A `not-found.tsx` fallback handles unknown student IDs gracefully.

### 1.2 Components

| File                                  | Type     | Purpose                                                       |
| ------------------------------------- | -------- | ------------------------------------------------------------- |
| `AppShell.tsx`                        | Server   | Flex container: sidebar + main area.                          |
| `Sidebar.tsx`                         | Client   | Nav links with `usePathname` active highlight.                |
| `PageHeader.tsx`                      | Server   | Title + subtitle + optional action slot.                      |
| `MetricCard.tsx`                      | Server   | Big-number card with label, hint, emphasis (default/warning/positive). |
| `ConfidenceChip.tsx`                  | Server   | Colour-coded high / medium / low badge.                       |
| `EmptyState.tsx`                      | Server   | Dashed-border placeholder with optional CTA.                  |
| `HonestyNote.tsx`                     | Server   | Reusable info/warning banner.                                 |
| `StudentTable.tsx`                    | Server   | Cohort grid w/ risk badge, top recommendation, confidence chip. |
| `InterventionCard.tsx`                | Server   | Projection + CI range + caveats + explanation + disclaimer.   |
| `TrendChart.tsx`                      | Server   | **Custom SVG line chart** (zero deps).                        |
| `CausalGraphView.tsx`                 | Server   | **Custom SVG DAG** with hand-laid node positions.             |
| `WhatIfSimulator.tsx`                 | **Client** | Form + slider + server-action submit + result card.          |

### 1.3 Library helpers (pure, tested)

| File                                 | Exports                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `src/lib/cn.ts`                      | `cn` — falsy-aware class concatenator.               |
| `src/lib/formatters.ts`              | `formatGrade`, `formatDelta`, `formatRange`, `formatPercent`, `formatNumber`, `formatDecimal`. |
| `src/lib/confidence-label.ts`        | `confidenceMetaFor`, `riskLevelFor`, `riskMetaFor`, types. |
| `src/lib/intervention-language.ts`   | `interventionLabel`, `featureLabel`, `projectionHeadline`, `ciSpansZero`, `HONESTY_DISCLAIMER`. |

### 1.4 Data access layer

| File                                              | Role                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `src/server/queries/dashboard.ts`                 | `getDashboardData` + pure `computeRiskCount` / `pickStrongestDriver`. |
| `src/server/queries/students.ts`                  | `getStudentDetail` + `listStudentsForDropdown`.                   |
| `src/server/queries/causal.ts`                    | `getCausalEstimatesForCourse` with parsed adjustment set.         |
| `src/server/queries/shared.ts`                    | `confidenceForRefutationJson` (shared parsing helper).            |
| `src/server/actions/what-if.ts`                   | `runWhatIf` server action — wraps `simulateIntervention()`.       |

---

## 2. Dashboard summary

### Overview (`/`)

Six metric cards across the top:

| Card                 | Source                                                              |
| -------------------- | ------------------------------------------------------------------- |
| Students             | `cohort.length` (students with both feature row and grade)          |
| Courses              | `prisma.course.count()`                                             |
| Avg. final grade     | Mean of `Grade.finalGrade`                                          |
| Avg. RDI             | Mean of `CourseFeatureSummary.meanRdi`                              |
| At-risk students     | Count where `finalGrade < 55`; coloured warning                     |
| Strongest driver     | Largest `|β|` among medium/high confidence estimates; falls back to any |

Below: a single `HonestyNote` banner, then a sortable cohort table (sorted
at-risk first by default) with:

- Student ID (linked) + at-risk badge
- Prior GPA, Final Grade, RDI, Engagement
- Top recommended intervention + projected range + confidence chip

### Student detail (`/students/[id]`)

- 4-card metric strip (Final Grade, Prior GPA, Mean Engagement, Mean RDI)
- 4-card feature strip (consistency / trend × 2 each)
- 2-up trend charts (engagement & RDI on one; quiz average on the other)
- Honesty banner
- Ranked intervention cards (read from `InterventionSimulation` ORDER BY `rankScore` DESC)

### Causal graph (`/causal-graph`)

- Yellow honesty banner up top ("this graph encodes our model
  assumptions, not universal truth")
- Custom SVG DAG, 7 nodes / 10 edges, hand-laid for clarity
- Edge-rationale table (every edge labelled with the substantive reason)
- Estimated-effects table with β, 95% CI, sample size, method,
  confidence chip, adjustment set

### Upload (`/upload`)

Static placeholder with three sections:

- Expected CSV schema (12-row table with column / type / notes)
- Privacy & anonymisation rules
- Today's workflow (CLI commands)

---

## 3. What-if simulator summary

`/what-if` uses a two-column layout:

| Left (form)                                | Right (result)                              |
| ------------------------------------------ | ------------------------------------------- |
| Student `<select>` (all enrolled students) | `InterventionCard` reused from student page |
| Intervention `<select>` (catalogue)        | Or an empty-state prompt before submit      |
| Delta `<input type="range">` (per-treatment scale) | Or a red error box on action failure |
| "Run simulation" button                    |                                             |

The submit path:

1. Client component calls server action `runWhatIf({studentExternalId, interventionName, customDelta})`.
2. Server action loads the student's feature row, the course's `CausalEstimate` for that treatment, and the cohort feature table.
3. Calls `simulateIntervention()` (the same pure function persisted runs use).
4. Returns the typed `SimulatedIntervention` to the client.
5. Client renders it through the same `InterventionCard` used by the student page.

**No projection math lives in the UI** — the server action is a thin
wrapper around the Phase 4 simulator, satisfying the task constraint
"Do not duplicate simulation logic in the UI."

The result card shows projected change, improvement range, current vs
proposed treatment value, β used, confidence chip, adaptive caveats
("model cannot rule out no effect" / "Headroom limited…"), and the
honesty footer.

---

## 4. Honesty / uncertainty UX

Enforced site-wide:

| Pattern                                                  | Where                                           |
| -------------------------------------------------------- | ----------------------------------------------- |
| `HonestyNote` banner on every projection-bearing page    | `/`, `/students/[id]`, `/what-if`, `/causal-graph` (warning tone) |
| Confidence chip (`ConfidenceChip`)                       | Every intervention row, every causal estimate row |
| CI range paired with every projected number              | `InterventionCard`, `StudentTable`              |
| At-risk colour emphasis (rose/amber/emerald)             | `MetricCard` warning emphasis, `StudentTable` badge |
| `HONESTY_DISCLAIMER` footer                              | Bottom of every `InterventionCard`              |
| Adaptive caveats                                         | `InterventionCard`: "cannot rule out no effect" when CI spans zero; "at the cohort ceiling" when headroom = 0 |
| Causal graph "this encodes assumptions, not truth" banner | `/causal-graph` page header                     |
| Low-confidence recommendations shown, not hidden         | Filter never drops by confidence; chip just gets coloured rose |

The honesty contract is also enforced **in code**: the `HONESTY_DISCLAIMER`
constant is asserted by `intervention-language.test.ts` to contain the
required phrases (`model-based`, `cohort-average`) and to NEVER contain
forbidden phrases (`guaranteed`, `proven`, `definitely`, `will improve`).

---

## 5. Tests

Vitest, **140 tests total, all passing.** Phase 5 added 36 new tests:

| File                                                            | Tests | Focus                                                       |
| --------------------------------------------------------------- | ----: | ----------------------------------------------------------- |
| `src/lib/__tests__/formatters.test.ts`                          | 10    | All six formatters; non-finite handling; sign behaviour.    |
| `src/lib/__tests__/confidence-label.test.ts`                    |  9    | Confidence variants; risk thresholds; defensive NaN.        |
| `src/lib/__tests__/intervention-language.test.ts`               | 10    | Catalogue lookups; projection headline signs; CI-spans-zero; honesty disclaimer contract. |
| `src/server/queries/__tests__/dashboard.test.ts`                |  7    | `computeRiskCount` thresholds + defensive NaN; `pickStrongestDriver` confidence ordering + fallback. |

UI components are **not** unit tested — too brittle for a portfolio
prototype. The end-to-end safety net is `npm run build` (verified each
phase) and the pure-helper tests that back every user-facing string.

---

## 6. Build / verification

```
> next build
   ▲ Next.js 15.5.18
 ✓ Compiled successfully in 20.2s
 ✓ Generating static pages (4/4)

Route (app)                                 Size  First Load JS
┌ ƒ /                                      168 B         106 kB
├ ○ /_not-found                            995 B         103 kB
├ ƒ /causal-graph                          127 B         103 kB
├ ƒ /students/[id]                         168 B         106 kB
├ ○ /upload                                127 B         103 kB
└ ƒ /what-if                             3.38 kB         106 kB
```

The only client-side JS shipped beyond the framework baseline is the 3.38
KB `WhatIfSimulator`. All other routes are pure server components.

---

## 7. Known limitations

- **No top-level `/students` listing.** Navigation to a student profile
  is from the cohort table on the overview page.
- **No tooltips** on the SVG charts — clean for screenshots but not
  interactive. Acceptable trade-off given the zero-dep constraint.
- **No search / filter** on the cohort table. Fine at 250 rows; a future
  phase can add column sort and a search input.
- **Upload page is static.** Real CSV upload arrives in a later phase.
- **No persisted what-if results from the UI.** The interactive
  simulator computes-and-displays; it does NOT write to
  `InterventionSimulation`. Persistent rows still come from
  `npm run causal:simulate`.
- **No charts library.** If the dashboard grows to need stacked area
  charts, scatter plots with interactive tooltips, etc., we can swap in
  Recharts — only `TrendChart` would need to be replaced.
- **Static node positions in the DAG.** Hard-coded in
  `CausalGraphView.tsx` because the DAG is fixed at 7 nodes. Add a
  layout algorithm if the DAG grows.
- **No authentication.** Per the task constraint; this is a single-user
  prototype.

---

## 8. Next steps (Phase 6 — Polish, GitHub, CV & LinkedIn Launch)

1. Add a top-level `README.md` screenshot strip (Overview, Student
   profile, Causal graph, What-If).
2. Record a 60-90 second walkthrough video using the `docs/demo-script.md`.
3. Add CV bullet points and a LinkedIn post draft.
4. Tighten any remaining copy on the dashboard for screenshot quality.
5. Optional: add page-level Open Graph metadata so the deployed demo
   link previews cleanly on LinkedIn.
6. Write `docs/features/phase-6-polish-and-launch.md` + execution log.
