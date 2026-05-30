# Phase 7 — Advanced Causal Engine Upgrade

> Status: **complete (2026-05-27)**. Optional, modular, locally runnable.
> Baseline TypeScript engine remains the default; advanced Python engine
> is opt-in.

## 1. Goal

Move the causal layer closer to the original research framing without
breaking the existing demo flow. Specifically:

1. Introduce a **stable estimator interface** so the rest of the app
   never has to care which engine produced an estimate.
2. Ship an **optional Python worker** wrapping DoWhy + causal-learn
   behind that interface.
3. Strengthen refutation analysis (subset robustness, bootstrap
   stability, adjustment-set sensitivity, outcome permutation).
4. Add a **causal discovery experiment** (PC algorithm) so the demo
   can compare the manually-designed DAG against a data-driven one.
5. Ship **downloadable causal reports** in Markdown and JSON.
6. Surface engine choice, refutation quality, and discovered-vs-manual
   comparison on `/causal-graph`.
7. Degrade gracefully when Python is not installed — the app must
   still run, the baseline engine must still work.

## 2. Architecture

```
                       ┌────────────────────────────────┐
                       │     CausalEngine interface     │
                       │  (src/features/causal-engine/  │
                       │           engine/types.ts)     │
                       └────────────────┬───────────────┘
                                        │
                ┌───────────────────────┼─────────────────────────┐
                │                                                 │
       ┌────────▼──────────┐                              ┌───────▼────────┐
       │  BaselineEngine   │                              │ AdvancedEngine │
       │  (in-process TS)  │                              │  (subprocess)  │
       │  estimator.ts +   │                              │ python/causal- │
       │  discovery.ts     │                              │   worker/      │
       └────────┬──────────┘                              │  ↳ DoWhy       │
                │                                         │  ↳ causal-learn│
                │                                         └───────┬────────┘
                │                                                 │
       ┌────────▼─────────────────────────────────────────────────▼────────┐
       │                       selectEngine(name)                          │
       │  baseline → return BaselineEngine                                 │
       │  advanced → probe Python worker, fall back with warning if absent │
       └──────────────────────────────┬────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼────────────────────────────────┐
        │                             │                                │
┌───────▼────────┐          ┌─────────▼────────┐            ┌──────────▼──────────┐
│ runCausalEsti- │          │ runCausalDis-    │            │ buildCausalReport   │
│   mates        │          │   covery         │            │  (Markdown / JSON)  │
└────────────────┘          └──────────────────┘            └─────────────────────┘
```

Key invariant: **only the engine factory (`selectEngine`) and the
advanced-engine module touch Python.** All other server modules talk
through the `CausalEngine` interface and never know which engine they
got. Client components never import the advanced engine module —
`engine/index.ts` uses a dynamic import + Node-only-loader pattern so
webpack doesn't pull `node:fs`, `node:path`, or `node:child_process`
into the client bundle.

## 3. TS vs Python — division of labour

| Concern                          | Baseline (TS)                       | Advanced (Python)                                  |
| -------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Always available?                | yes                                 | only if `python` + worker deps installed           |
| Estimator                        | normal-equations OLS                | DoWhy `backdoor.linear_regression` (numpy fallback)|
| Bootstrap CI                     | mulberry32 + percentile             | numpy + percentile                                 |
| Refutation (baseline)            | placebo + random common cause       | (carried out TS-side after estimate)               |
| Refutation (extended)            | subset / bootstrap / sensitivity / outcome perm | (TS-side; engine-agnostic)            |
| Discovery                        | hand-rolled PC + partial correlation | `causal-learn` PC                                 |
| Setup cost                       | none                                | `pip install -r python/causal-worker/requirements.txt` |

The advanced engine's discovery and estimate results conform to the
**same JSON shape** as the baseline. Persistence
(`CausalEstimate.method`, `CausalEstimate.notesJson.engine`) records
which engine produced each row.

## 4. Estimator abstraction

```ts
interface CausalEngine {
  readonly name: "baseline" | "advanced";
  available(): Promise<boolean>;
  estimate(req: EngineEstimateRequest): Promise<EngineEstimateResult>;
  discover?(req: EngineDiscoverRequest): Promise<EngineDiscoverResult>;
}
```

`EngineEstimateResult` carries `engine`, `method`, `estimate`, `ciLow`,
`ciHigh`, `bootstrapIters`, `notes[]`, and `warnings[]` — enough to
persist provenance and surface fallback warnings in the UI without
losing context.

`selectEngine("advanced")` returns the baseline engine + a warning
when the Python worker can't be reached:

```ts
const sel = await selectEngine("advanced");
// → { engine, requestedName: "advanced", resolvedName: "baseline", warnings: [...] }
```

The CLI (`causal:estimate --engine advanced`) and the
`/causal-graph?engine=advanced` page link both reach this code path,
so the fallback story is consistent.

## 5. Refutation methodology

| Check                       | What it does                                                                 | Threshold (default)            |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| Placebo (shuffle treatment) | Shuffles the treatment column; effect should collapse to ~0.                 | ratio < 0.30                   |
| Random common cause         | Adds a uniform-random covariate; effect should be stable.                    | relative change < 0.25         |
| **Subset robustness**       | Re-fit β on K random sub-samples (70%); CV of estimates.                     | CV < 0.50                      |
| **Bootstrap stability**     | Fraction of bootstrap β with the same sign as the point estimate.            | ≥ 0.80                         |
| **Adjustment sensitivity** | Leave-one-out over adjustment set; max relative change in β.                  | max rel change < 0.40          |
| **Outcome permutation**     | Shuffle outcome; β should collapse to ~0 (complements placebo).              | ratio < 0.30                   |

Every check returns a structured result with `passes: boolean`,
`description`, and the raw numbers. Failed refutations surface in the
report and on `/causal-graph` as warnings — never silently suppressed.

## 6. Causal discovery experiment

`runDiscovery(rows, options)` implements a PC-style algorithm in
TypeScript:

1. Start with a fully-connected undirected graph.
2. For each pair (X, Y), test conditional independence against every
   subset of size ≤ 3 of the current neighbours of X. Edge removed if
   any test produces `p > α`. The separating set is recorded.
3. Orient v-structures: for unshielded triple `X — Z — Y`, if `Z` is
   not in the separating set, orient `X → Z ← Y`.
4. Apply Meek's R1 + R2 until quiescence.
5. Emit oriented + undirected edges.

The independence test is Fisher's Z-transform of the partial
correlation, with the standard `1 / sqrt(n − |Z| − 3)` variance.
Assumes (multivariate) approximate normality and linear relationships.
Discovery is surfaced everywhere as an **experimental** result; it
does not replace the manually-encoded DAG.

`diffManualVsDiscovered(manual, discovered)` returns `{ shared,
manualOnly, discoveredOnly }`, which the dashboard renders directly.

## 7. Report generation

`buildCausalReport(prisma, courseCode, opts)` returns a canonical
`CausalReport` object (schema version `phase-7.v1`) covering:

- Cohort summary (sample size, outcome mean/std).
- Per-treatment estimates with adjustment set, CI, method, engine.
- Baseline and extended refutation outcomes.
- DAG snapshot (manual, optionally discovered).
- Limitations and warnings.

Two renderers:

- `renderMarkdownReport(report)` — human-readable, drop-into-a-PR-ready.
- `renderJsonReport(report)` — pretty-printed JSON, stable schema.

Three delivery surfaces:

- `npm run causal:report -- --course CS-201` (stdout or `--out`).
- `GET /api/causal/report?course=CS-201&format=markdown&discovery=1`.
- "Download Markdown report" / "Download JSON report" buttons on
  `/causal-graph`.

## 8. UI surfaces

`/causal-graph` now accepts:

- `?view=manual | discovered | compare` — which DAG to render.
- `?engine=baseline | advanced` — which engine to use for discovery.
- `?course=CODE` — currently CS-201 by default.

UI elements:

- View switcher chips at the top of the page.
- Engine switcher chips (indigo when active).
- `DiscoveredGraphView` — SVG renderer mirroring the manual graph,
  with shared (emerald solid) / discovered-only (amber dashed) /
  manual-only (slate dotted) edge styling and a legend.
- Three side-by-side edge lists (shared / discovered-only /
  manual-only).
- Per-discovery warnings shown in an amber panel.
- "Download Markdown report" / "Download JSON report" links in the
  estimates section header.

## 9. Limitations

- The TS PC implementation assumes linear / Gaussian noise. It is
  intentionally lightweight; for a heavier discovery experiment use
  `--engine advanced`.
- Discovery is sample-size sensitive — a warning fires when n < 50.
- The baseline engine's `EngineEstimateResult.method` is always
  `backdoor_ols`; future engines may expose richer method strings.
- The Python worker spawn cost is ~150 ms cold start on Windows. Fine
  for interactive use, prohibitive for high-frequency batch jobs.
- No multi-course report generation in this phase; one report per
  `?course=`.
- The advanced engine's CI uses an independent numpy bootstrap rather
  than DoWhy's `bootstrap_refuter` — same percentile method, different
  implementation. Future phase can wire DoWhy's native CI.

## 10. Future research directions

- **Sensitivity analysis (Cinelli–Hazlett 2020)** for unobserved
  confounding — DoWhy supports this; surface the partial R² bound on
  `/causal-graph`.
- **Heterogeneous treatment effects (CATE)** so the simulator can
  state per-student β instead of cohort-average β. Currently
  blocked by the data: we would need richer student covariates than
  PriorGPA + Engagement alone.
- **DoWhy refutation catalogue** beyond the four checks shipped here
  (e.g. dummy-outcome, data-subset, bootstrap-of-refutations).
- **NOTEARS / GES / FCI discovery** to compare against PC.
- **Multi-course pooled reports** with cohort-difference diagnostics.

## 11. File map

### Created (TypeScript)

| Path                                                          | Purpose                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/features/causal-engine/engine/types.ts`                  | Stable `CausalEngine` + request/response shapes.              |
| `src/features/causal-engine/engine/baseline-engine.ts`        | TS engine wrapping `estimateEffect` + `runDiscovery`.         |
| `src/features/causal-engine/engine/advanced-engine.ts`        | Python subprocess engine (bundler-safe Node loader).          |
| `src/features/causal-engine/engine/availability.ts`           | Python interpreter + worker probe (cached).                   |
| `src/features/causal-engine/engine/index.ts`                  | `selectEngine` factory with dynamic-import fallback.          |
| `src/features/causal-engine/refutation-extended.ts`           | Subset / bootstrap / sensitivity / outcome-permutation checks.|
| `src/features/causal-engine/independence-tests.ts`            | Partial correlation + Fisher-Z p-value.                       |
| `src/features/causal-engine/discovery.ts`                     | PC-skeleton + v-structure + Meek's rules + diff helper.       |
| `src/features/causal-engine/report/types.ts`                  | `CausalReport` schema (version `phase-7.v1`).                 |
| `src/features/causal-engine/report/markdown.ts`               | Markdown renderer.                                            |
| `src/features/causal-engine/report/json.ts`                   | JSON renderer.                                                |
| `src/features/causal-engine/report/index.ts`                  | Report barrel.                                                |
| `src/server/causal/run-discovery.ts`                          | Server orchestrator for discovery.                            |
| `src/server/causal/build-report.ts`                           | Server orchestrator for report assembly.                      |
| `src/server/causal/discover-cli.ts`                           | `npm run causal:discover` CLI.                                |
| `src/server/causal/report-cli.ts`                             | `npm run causal:report` CLI.                                  |
| `src/app/api/causal/report/route.ts`                          | `GET /api/causal/report` downloadable endpoint.               |
| `src/components/DiscoveredGraphView.tsx`                      | SVG renderer for the discovered DAG comparison.               |

### Created (Python)

| Path                                                          | Purpose                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `python/causal-worker/worker.py`                              | One-shot JSON-in/JSON-out worker (ping/estimate/discover).    |
| `python/causal-worker/requirements.txt`                       | Pinned-floor optional dependencies.                           |
| `python/causal-worker/README.md`                              | Setup + protocol + degradation guide.                         |

### Updated

| Path                                                          | Change                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/features/causal-engine/index.ts`                         | Re-export engine factory + discovery + refutation-extended + report. |
| `src/server/causal/run-estimates.ts`                          | Accepts `{ engine, extendedRefutations }`; persists engine in `notesJson`. |
| `src/server/causal/cli.ts`                                    | Adds `--engine`, `--extended` flags.                          |
| `src/app/causal-graph/page.tsx`                               | View/engine switchers, discovery integration, report download links. |
| `package.json`                                                | `causal:discover`, `causal:report` scripts.                   |

### Tests added

| Path                                                              | Coverage                              | Count |
| ----------------------------------------------------------------- | ------------------------------------- | ----- |
| `src/features/causal-engine/__tests__/engine.test.ts`             | Baseline engine + selectEngine fallback | 5   |
| `src/features/causal-engine/__tests__/refutation-extended.test.ts`| Four extended refutation checks       | 4     |
| `src/features/causal-engine/__tests__/discovery.test.ts`          | Partial correlation, PC, diff helper  | 9     |
| `src/features/causal-engine/__tests__/report.test.ts`             | Markdown + JSON renderers             | 4     |

**Totals: 22 new tests · 198 / 198 passing · typecheck clean · build clean.**
