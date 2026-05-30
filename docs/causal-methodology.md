# EduRAG — Causal Methodology

> Status: **Phase 3 — implemented**. DAG, adjustment strategy, and
> refutation checks now live in code under `src/features/causal-engine/`.
> This document remains the human-readable spec; the code is the source
> of truth.

This document defines how EduRAG models cause-and-effect between student
behaviour and academic outcome. The intent is **explainability**, not
publication-grade inference.

---

## 1. Framing

We treat student success as the outcome `Y = final_grade`, and ask:

> *Which behavioural levers — if intervened upon — would plausibly shift `Y`,
> and by how much?*

This is a **causal inference** question, not a prediction question. Predictive
models can be highly accurate while suggesting useless interventions
(correlation ≠ causation). EduRAG uses a **Structural Causal Model (SCM)**
expressed as a Directed Acyclic Graph (DAG), so each driver has an explicit
hypothesised pathway to the outcome.

---

## 2. Variables (initial DAG candidates)

| Symbol     | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| `PriorGPA` | Pre-course academic baseline (exogenous, confounder).  |
| `Engage`   | Composite engagement score (logins, time, submissions).|
| `RDI`      | Resource Diversity Index.                              |
| `Forum`    | Forum participation rate.                              |
| `QuizCons` | Consistency of quiz performance.                       |
| `Grade`    | Final grade (outcome `Y`).                             |

---

## 3. Initial DAG (manually specified, refined in Phase 3)

```
PriorGPA ──────────────┐
                       │
PriorGPA ── Engage ────┼──► Grade
              │        │
              ├─► RDI ─┤
              │        │
              ├─► Forum ┤
              │        │
              └─► QuizCons
```

Edges encode hypothesised causal directions:

- `PriorGPA` confounds engagement *and* grade.
- `Engage` is an upstream driver that influences `RDI`, `Forum`, `QuizCons`.
- Each of `RDI`, `Forum`, `QuizCons` has a direct effect on `Grade`.

This DAG is a **starting hypothesis**, encoded in
`src/features/causal-engine/dag.ts` (and mirrored in the Python service). It
will be revised when:

- Domain literature suggests an additional edge.
- Refutation tests fail in characteristic ways.

---

## 4. Identification strategy

For each treatment `T ∈ {ResourceDiversityIndex, ForumParticipation,
QuizConsistency, AssessmentTrend}` we estimate the **average effect on
`FinalGrade`** by fitting

```
FinalGrade = β_0 + β_T · T + Σ β_z · z + ε      for z ∈ Z
```

where `Z` is a backdoor-style adjustment set. The MVP estimator
(`src/features/causal-engine/estimator.ts`) uses:

| Component       | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Estimator       | Ordinary Least Squares via normal equations.                      |
| Adjustment rule | `Z = {PriorGPA, Engagement} \ {T}` (conservative, baseline-only). |
| CI method       | **Percentile bootstrap** with 500 resamples by default.           |
| Linear algebra  | In-process — no Python worker for Phase 3.                        |

We deliberately did *not* implement a full backdoor-criterion algorithm in
this phase. The baseline rule adjusts for the two strongest known
confounders (`PriorGPA` and `Engagement`) without blocking mediation paths.
A future phase can swap in a DAG-aware backdoor solver (or DoWhy via a
Python worker) without changing any downstream code — the API surface
(`estimateEffect`) is stable.

---

## 5. Refutation checks

Implemented in `src/features/causal-engine/refutation.ts`. Each estimate
is paired with two structured checks:

- **Placebo (shuffled-treatment) test** — shuffle the treatment column
  across rows and re-fit. The estimated effect should drop toward zero.
  Reported as `placeboEstimate`, `ratio = |β_placebo| / |β_original|`,
  and `passes: ratio < 0.30`.
- **Random common cause test** — add a uniform random covariate to the
  adjustment set and re-fit. The estimate should be stable. Reported as
  `adjustedEstimate`, `absChange`, `relativeChange`, and
  `passes: relativeChange < 0.25`.

**Phase 7 extended refutations** (opt-in via `--extended` on
`causal:estimate`) layer four additional checks on top:

- **Subset robustness** — refit β on K=50 random sub-samples at
  `sampleFraction=0.7`; report mean / std / coefficient of variation.
  Fails when CV ≥ 0.50.
- **Bootstrap stability** — fraction of 200 bootstrap β with the same
  sign as the point estimate. Fails when the same-sign fraction < 0.80.
- **Adjustment-set sensitivity** — leave-one-out over the adjustment
  set; max relative change in β. Fails when max rel change ≥ 0.40.
- **Outcome permutation** — shuffle the outcome column (complement of
  the placebo-on-treatment). Fails when ratio ≥ 0.30.

Each check returns a structured `passes / threshold / numbers`
payload; failed refutations surface in the dashboard and in the
downloadable report — never silently suppressed. A future phase may
lean on DoWhy's catalogue once the Python worker becomes the default.

---

## 6. Counterfactual simulation

The what-if engine answers questions of the form:

> *"If this student's `ForumParticipation` rate rose from `f₀` to `f₁`, what
> is the projected `FinalGrade`?"*

**Implemented in Phase 4** in `src/features/causal-engine/simulator.ts`:

```
projected_grade = clamp_[0,100]( baseline_grade + β_T · applied_delta )
projected_low   = clamp_[0,100]( baseline_grade + β_T_ciLow  · applied_delta )
projected_high  = clamp_[0,100]( baseline_grade + β_T_ciHigh · applied_delta )
```

`applied_delta` is the requested change clamped against two ceilings:

1. **Cohort headroom** — `cohort_mean(T) + 2·cohort_stdev(T)`. We do not
   suggest moves to values almost no student has reached.
2. **Theoretical bound** — for features with a natural maximum (RDI and
   QuizConsistency are both in [0, 1]).

### Ranking recommendations

Pure effect size is not enough. The simulator scores each candidate by:

```
rank_score = max(0, projected_gain)             // sign-aware
           × (0.5 + 0.5 · weakness_score)       // bonus for below-cohort students
           × confidence_weight                  // 1.0 / 0.7 / 0.3 by refutation
```

where `weakness_score ∈ [0, 1]` rises as the student falls below cohort
mean in this feature. The effect: a student already strong in a feature
isn't told to *strengthen it more*; a weak student with high headroom in
a high-β feature rises to the top.

### Confidence labelling

The estimate's refutation payload (placebo + random common cause from
Phase 3) is mapped to a categorical label persisted on every
`InterventionSimulation`:

| Refutations passed | confidence | rank weight |
| :----------------- | :--------- | ----------: |
| both               | `"high"`   | 1.0         |
| exactly one        | `"medium"` | 0.7         |
| neither            | `"low"`    | 0.3         |

### Per-student vs cohort wording (binding)

The UI and explanation prose must say *"cohort-average effect applied to
this student"* — never *"this student's personal causal effect"*. The
β coefficient is averaged over the cohort by construction; per-student
causal effect heterogeneity (CATE) is not modelled in the MVP.

---

## 7. Honest language

The system is explicit about uncertainty. Phrases used in the UI:

- *Estimated effect*
- *Simulated outcome*
- *Likely causal driver*
- *Model-based recommendation*

Phrases that are **forbidden** in code, copy, and docs:

- *Guaranteed result*
- *Proven cause*
- *This will definitely improve the grade*

---

## 8. Phase 7 — engine abstraction & causal discovery

The estimator interface is now stable enough to swap implementations.
Both backends conform to `CausalEngine` in
`src/features/causal-engine/engine/`:

- **Baseline (TS, default)** — `backdoor_ols` method. Always
  available, zero external deps.
- **Advanced (Python, opt-in)** — DoWhy `backdoor.linear_regression`
  via a one-shot subprocess. Installed via
  `pip install -r python/causal-worker/requirements.txt`. Falls back
  to baseline with a warning if Python is missing.

Discovery (`runDiscovery`) implements a PC-style algorithm in
TypeScript: skeleton phase with subset-conditioned partial-correlation
tests (Fisher Z-transform), then v-structure orientation, then Meek's
R1/R2 propagation. The advanced engine wraps `causal-learn`'s PC for
a heavier check. Both produce the same JSON shape.

The dashboard renders **manual vs discovered** edges side-by-side at
`/causal-graph?view=compare`, with shared / discovered-only /
manual-only labels. The manually-encoded DAG remains the authoritative
analytical structure — discovery is surfaced as an experiment, not as
ground truth.

## 9. Phase 8 — prediction vs causal inference (boundary)

EduRAG ships a *baseline ML prediction layer* alongside the causal
engine — see `docs/features/phase-8-baseline-ml-comparison.md`. The two
layers answer different questions and must never be conflated:

| Layer                  | Answers                                  | Does NOT answer                          |
| ---------------------- | ---------------------------------------- | ---------------------------------------- |
| Logistic baseline      | "What is the probability this student is at risk?" | "What should we change to help them?" |
| Causal engine          | "How would the outcome shift if we changed treatment T?" | "What is the prediction error on this individual student?" |

Feature importance produced by the baseline is the *standardised
coefficient β* from logistic regression. It summarises predictive
contribution — **not causal effect**. The strongest predictor and the
top-ranked causal lever can legitimately differ, and the
`/comparison` page surfaces this directly (Agree vs Disagree count).

The honesty constraint extends to language: the prediction layer
emits notes containing *"probabilistic prediction"* and *"feature
importance ≠ causal effect"*, and forbidden phrases ("guaranteed",
"proven", "definitely", "causal effect of this student") are
asserted-against in the test suite.

## 10. Phase 11 — observational follow-up vs causal validation

Phase 11 introduced the intervention feedback loop. **Advisor
decisions and follow-up observations are observational**, never
treated as causal validation:

- **An accepted intervention does not prove the causal model is
  correct.** The advisor may have accepted for many reasons
  unrelated to the projected lift (cohort policy, student request,
  pedagogical preference).
- **A positive follow-up observation does not prove the projected
  lift materialised causally.** The student's outcome may have
  shifted for reasons orthogonal to the intervention. We record the
  observation, not the attribution.
- **Persistence enforces the language constraint.** Notes and
  follow-up text containing `guaranteed`, `proven cause`, `confirms
  causation`, or `scientific proof` are rejected at write time. The
  test suite asserts this on every status-helper, analytics, and
  server-action module.
- **The /interventions page renders observational summaries, not
  validation claims.** Sentence templates explicitly call out the
  distinction between "what advisors did" and "what the model
  predicted would happen".

Future research could use the persisted feedback loop as a
calibration signal for the causal engine — e.g. compare projected
lifts to observed outcomes across a hold-out cohort and report a
calibration curve. That work is out of scope for the MVP and would
need real (non-synthetic) follow-up data to be meaningful.

## 11. Limitations

- The DAG is hypothesised by the project author. Discovery experiments
  in Phase 7 give a data-driven second opinion but are not treated as
  ground truth — they assume linearity + Gaussian noise.
- Synthetic data is generated to *match* the assumed DAG, so estimates are
  faithful by construction in the demo — real-world performance will differ.
- No instrumental variables in MVP; selection bias mitigations are minimal.
- Effect sizes are illustrative, not externally validated.
- Heterogeneous treatment effects (CATE) are not modelled — every β is a
  cohort-average effect. Phase 8+ work.
