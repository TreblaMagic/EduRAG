# Execution Log — Phase 7: Advanced Causal Engine Upgrade

- **Date:** 2026-05-27
- **Phase:** 7 — Advanced Causal Engine Upgrade
- **Status:** ✅ Complete
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 6 (`docs/logs/2026-05-25-phase-6-real-csv-upload-import.md`)

---

## Objective

Move the causal layer toward the original research framing:

1. Introduce a stable `CausalEngine` abstraction so estimator
   implementations are swappable.
2. Ship an optional Python worker (DoWhy + causal-learn) behind that
   abstraction — without breaking the TS baseline or requiring Python
   to be installed.
3. Implement stronger refutation checks.
4. Implement a causal discovery experiment (PC algorithm) with a
   manual-vs-discovered comparison UI.
5. Implement downloadable Markdown + JSON causal reports.
6. Surface engine choice and report download links on `/causal-graph`.
7. Degrade gracefully when Python is missing — baseline must still
   work, with a visible warning.

Explicitly out of scope: a long-running HTTP causal service, container
orchestration, auth, multi-tenant separation, schema migrations.

---

## Files created

### TypeScript — causal engine (engine abstraction)

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/causal-engine/engine/types.ts`                  | `CausalEngine` interface + estimate / discover request/response shapes.                  |
| `src/features/causal-engine/engine/baseline-engine.ts`        | TS baseline engine — wraps existing `estimateEffect` + `runDiscovery`.                  |
| `src/features/causal-engine/engine/advanced-engine.ts`        | Python subprocess engine. Bundler-safe Node loader via `eval("require")`.               |
| `src/features/causal-engine/engine/availability.ts`           | Probes `python` / `python3` + worker entry. Dynamic Node import.                        |
| `src/features/causal-engine/engine/index.ts`                  | `selectEngine(name)` factory with dynamic-import fallback.                              |

### TypeScript — extended refutations, discovery, reports

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/causal-engine/refutation-extended.ts`           | Subset robustness, bootstrap stability, sensitivity, outcome permutation.               |
| `src/features/causal-engine/independence-tests.ts`            | Partial correlation + Fisher Z p-value (Abramowitz–Stegun erf approximation).           |
| `src/features/causal-engine/discovery.ts`                     | PC-skeleton + v-structure + Meek's R1/R2 + `diffManualVsDiscovered`.                    |
| `src/features/causal-engine/report/types.ts`                  | `CausalReport` schema (`phase-7.v1`).                                                   |
| `src/features/causal-engine/report/markdown.ts`               | Markdown renderer.                                                                      |
| `src/features/causal-engine/report/json.ts`                   | JSON renderer.                                                                          |
| `src/features/causal-engine/report/index.ts`                  | Report barrel.                                                                          |

### TypeScript — server orchestration & UI

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/server/causal/run-discovery.ts`                          | Server orchestrator: builds feature table, runs discovery, diffs against manual DAG.    |
| `src/server/causal/build-report.ts`                           | Reads persisted `CausalEstimate` rows, optionally runs discovery, returns `CausalReport`.|
| `src/server/causal/discover-cli.ts`                           | `npm run causal:discover` CLI.                                                          |
| `src/server/causal/report-cli.ts`                             | `npm run causal:report` CLI (Markdown / JSON / `--out` / `--discovery`).                |
| `src/app/api/causal/report/route.ts`                          | `GET /api/causal/report?course&format&discovery&engine` download endpoint.              |
| `src/components/DiscoveredGraphView.tsx`                      | SVG renderer for discovered DAG comparison; shared / discovered-only / manual-only styling. |

### Python worker

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `python/causal-worker/worker.py`                              | One-shot JSON-in / JSON-out worker. Cmds: `ping`, `estimate` (DoWhy), `discover` (causal-learn). |
| `python/causal-worker/requirements.txt`                       | Pinned-floor optional dependencies (numpy, pandas, sklearn, networkx, dowhy, causal-learn). |
| `python/causal-worker/README.md`                              | Setup + protocol + graceful-degradation guide.                                          |

### Tests

| Path                                                              | Coverage                                                  | Tests |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src/features/causal-engine/__tests__/engine.test.ts`             | Baseline engine + `selectEngine` fallback contract.       | 5     |
| `src/features/causal-engine/__tests__/refutation-extended.test.ts`| Subset / bootstrap / sensitivity / outcome permutation.   | 4     |
| `src/features/causal-engine/__tests__/discovery.test.ts`          | Partial correlation, PC chain recovery, diff helper.      | 9     |
| `src/features/causal-engine/__tests__/report.test.ts`             | Markdown + JSON renderers, banned-language assertion.     | 4     |

### Docs

| Path                                                          | Purpose                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `docs/features/phase-7-advanced-causal-engine.md`             | Full per-feature spec.                                                                  |
| `docs/logs/2026-05-27-phase-7-advanced-causal-engine.md`      | This log.                                                                               |

---

## Files updated

| Path                                              | Change                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/features/causal-engine/index.ts`             | Re-export engine factory, refutation-extended, discovery, independence-tests, report.            |
| `src/server/causal/run-estimates.ts`              | Accepts `{ engine, extendedRefutations }`; uses `selectEngine`; persists engine + warnings.     |
| `src/server/causal/cli.ts`                        | New `--engine`, `--extended` flags.                                                              |
| `src/app/causal-graph/page.tsx`                   | View switcher (manual / discovered / compare), engine switcher, report download links, server-side discovery integration. |
| `package.json`                                    | `causal:discover` + `causal:report` scripts.                                                    |
| `docs/Plan.md`                                    | Phase 7 marked complete; expanded checklist + manual commands.                                   |
| `docs/architecture.md`                            | Engine abstraction + Phase 7 sections.                                                          |
| `docs/causal-methodology.md`                      | Extended refutations + engine abstraction sections.                                              |
| `docs/demo-script.md`                             | Causal-graph step rewritten to walk through compare-view + discovery + download.                |
| `README.md`                                       | Phase 7 CLI flags, dashboard description, optional-Python section, roadmap row.                  |

## Files removed

None.

---

## Commands run by the agent

| # | Command                                  | Result                                                                                          |
| - | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 | `npx tsc --noEmit`                       | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 2 | `npm test`                               | ✅ **21 files, 198 tests, all passed** (≈ 5 s test exec).                                       |
| 3 | `npm run build`                          | ✅ Compiled, 16 routes generated (added `/api/causal/report`).                                   |

Per `CLAUDE.md`, the agent did **not** run any database migration, any
DB-writing CLI, any `pip install`, or `npm install`. No new npm packages
were added.

---

## Commands the operator must run manually

```bash
# No new prisma migration in Phase 7 (engine + refutation + discovery + report
# are all additive logic over existing CausalEstimate columns).

# OPTIONAL — install the Python worker for the advanced engine.
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
pip install -r python/causal-worker/requirements.txt

# Smoke test
echo '{"cmd":"ping","payload":{}}' | python python/causal-worker/worker.py

# Re-run estimation with the new flags.
npm run causal:estimate                              # baseline (unchanged)
npm run causal:estimate -- --extended                # baseline + 4 extra refutations
npm run causal:estimate -- --engine advanced         # try Python, fall back with a warning if absent
npm run causal:estimate -- --engine advanced --extended

# Run the discovery experiment.
npm run causal:discover
npm run causal:discover -- --engine advanced --alpha 0.01

# Generate a downloadable report.
npm run causal:report -- --discovery --out docs/reports/cs-201.md
npm run causal:report -- --format json --discovery

# Visit the upgraded /causal-graph page.
npm run dev
# http://localhost:3000/causal-graph?view=compare&engine=baseline
```

---

## Dependencies added

- **TypeScript:** *None.* The engine abstraction, extended refutations,
  PC discovery, partial-correlation tests, and report renderers all use
  pre-existing primitives (`ols`, `mulberry32`, Node `child_process` /
  `fs` / `path`).
- **Python (optional):** `numpy`, `pandas`, `scikit-learn`, `networkx`,
  `dowhy`, `causal-learn`. Listed in
  `python/causal-worker/requirements.txt`. Not auto-installed; the
  operator runs `pip install -r ...` if they want the advanced engine.

---

## Assumptions made

1. **TS engine remains the default.** The advanced engine is opt-in via
   `--engine advanced` or `?engine=advanced`. Anything else (UI page
   loads, default CLI invocations, existing tests) keeps using the
   baseline. This preserves backwards compatibility with Phases 3–6.
2. **Subprocess, not HTTP.** A one-shot subprocess is the simplest
   transport that meets the brief — JSON in stdin, JSON out stdout, no
   long-running daemon, no port to manage, no Docker. Spawn cost
   (~150 ms cold) is acceptable for interactive use; this is the right
   place to switch to HTTP if Phase 9 productisation needs it.
3. **No new schema.** The `CausalEstimate.method` field already stores
   an engine label; `notesJson` now carries `engine` and extended
   refutations are nested inside `refutationJson.extended`. Existing
   queries (`getCausalEstimatesForCourse`,
   `confidenceForRefutationJson`) still work unchanged.
4. **Discovered DAG is not persisted.** It's regenerated on demand from
   the feature table — the result is cheap (≪1 s for 7 nodes / 248 rows)
   and storing it would create a schema-versioning headache for an
   "experimental" output. Phase 8+ can revisit.
5. **Bundle-safe Python imports.** `availability.ts` and
   `advanced-engine.ts` load Node-only modules via `eval("require")(...)`
   so webpack does not pull `node:fs` / `node:path` /
   `node:child_process` into the client bundle. The `selectEngine`
   factory uses dynamic `import()` for the advanced module path so the
   client never sees it at all.
6. **Discovery on UI page load is bounded.** `/causal-graph` runs
   discovery server-side only when the user explicitly picks
   `view=discovered` or `view=compare`. The default `view=manual` does
   no discovery work.
7. **Extended refutations are opt-in.** Default `causal:estimate` runs
   the original two checks. `--extended` adds the four new ones. Reason:
   the extended set adds ~150 ms per treatment; opt-in keeps the
   default fast and unsurprising for existing demo flows.
8. **Honesty disclaimer carries through.** Report Markdown asserts via
   test that "guaranteed", "proven cause", "will definitely improve" do
   not appear. Discovery is labelled "experimental" everywhere it
   surfaces.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **198 / 198** tests pass (`npm test`).
- [x] `npm run build` succeeds — 16 pages generated, including the new
      `/api/causal/report` route.
- [x] No database migration / DB-writing CLI executed by the agent.
- [x] No new TypeScript dependencies added.
- [x] Baseline engine still produces identical results to Phase 3
      (no change to `estimator.ts`, `refutation.ts`, or
      `run-estimates.ts`'s persistence shape).
- [x] Advanced engine falls back to baseline with a structured warning
      when Python is absent (confirmed by `engine.test.ts > selectEngine`
      with the warning text asserted).
- [x] Client bundle does not pull the advanced engine — `npm run build`
      did not surface any `node:fs` / `node:path` / `node:child_process`
      tracing errors.
- [x] `/causal-graph` survives `view=discovered` even when the discovery
      engine errors — `DiscoverySection` renders an amber error panel
      with the message instead of crashing.
- [x] Phase 5.5 sync path, Phase 6 upload path, and the CSV CLI all
      untouched.
- [x] `docs/Plan.md`, `README.md`, `docs/architecture.md`,
      `docs/causal-methodology.md`, `docs/demo-script.md` all updated.
- [x] `docs/features/phase-7-advanced-causal-engine.md` created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch in Phase 8

- **DoWhy spawn cost** — ~150 ms cold start on Windows. Fine for
  interactive use, prohibitive for high-frequency batch jobs. Phase 9
  productisation can move the worker to a long-running HTTP service if
  the demo needs it.
- **PC discovery sensitivity** — small samples (< 50) or non-linear
  relationships produce noisy graphs. The warning surface covers
  small-n; non-linearity is acknowledged in the methodology doc.
- **Bundler-opaque Node loader** — the `eval("require")` trick works
  with Next.js 15 + webpack but is fragile to bundler changes. If
  Phase 9 swaps to Turbopack, re-test that `node:fs` / `node:path` /
  `node:child_process` still stay out of the client bundle.
- **Report freshness** — reports read from persisted `CausalEstimate`
  rows. If the operator regenerates data without re-running
  `causal:estimate`, the report will be stale. The CLI warns when no
  estimates exist; consider an automatic re-run flag in Phase 9.
- **Multi-course reports** — currently one report per course. Phase 8+
  comparison work may want pooled or cohort-difference reports.

---

## Next recommended phase

**Phase 8 — Baseline ML Comparison.**

Concrete first steps:

1. Implement a baseline ML model (logistic regression or random forest)
   predicting `FinalGrade` / at-risk class. Reuse the existing feature
   table — same engineering, different model.
2. Add a new Prisma model (e.g. `BaselinePrediction`) and persist one
   prediction per student. Non-destructive schema add.
3. Add `/predictions` route surfacing the prediction-only view per
   student.
4. New `/comparison` (or section on `/students/[id]`) — side-by-side
   "Prediction vs Intervention" panel. The point: prediction tells you
   *who*; the causal layer tells you *what to change*.
5. Lift the Phase 7 engine abstraction shape to model the prediction
   layer too (a `PredictionEngine` interface, baseline implementation
   first, advanced opt-in later).
6. Write `docs/features/phase-8-baseline-ml-comparison.md` + execution
   log.
