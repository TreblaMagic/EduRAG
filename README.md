# EduRAG — Causal AI for Student Success

> An explainable educational-analytics prototype that turns LMS behavioural
> data into **causally-grounded, intervention-oriented** recommendations —
> not just a black-box risk score.

[![tests](https://img.shields.io/badge/tests-313%20passing-brightgreen)]()
[![typecheck](https://img.shields.io/badge/typecheck-clean-brightgreen)]()
[![build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![phase](https://img.shields.io/badge/phase-12C%20vercel%20deploy-blue)]()
[![license](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
<!-- Live demo + CI / Vercel status badges land in Phase 12D after the first deploy goes up. -->


---

## Three-command demo

```bash
git clone <repo-url> && cd "EduRAG Prototype"
cp .env.example .env             # local Postgres + demo defaults

docker compose up -d db          # start Postgres (port 5432)
npm run setup                    # install, generate, push schema, ingest, predict
npm run demo                     # setup-if-needed + dev server with helpful URLs
```

Then open <http://localhost:3000>. No auth, no cloud, no env wrangling
beyond `.env`. First run takes ~90 s on a warm install (mostly the
Postgres pull); subsequent `setup` calls skip work that's already done.

> **Postgres-only since the Phase 12B/12C correction.** Prisma 5.x does
> not support an env-driven `provider`, so we cannot switch SQLite ⇄
> Postgres at runtime. Local dev uses the Postgres service in
> `docker-compose.yml`; production runs against Neon on Vercel. See
> the "Database" section below for the env-var matrix.

```bash
# Diagnostics
npm run doctor              # full environment + data + feature check
npm run status              # concise row-count snapshot

# Clean-slate for recordings / interviews
npm run reset:demo -- --yes
```

> **Phase 9 update:** every CLI above is part of a single bootstrap module
> (`src/server/bootstrap/`) so the developer-experience surface is itself a
> reviewable artefact. See [`docs/features/phase-9-productisation-one-command-setup.md`](docs/features/phase-9-productisation-one-command-setup.md).

---

## Why this exists

Most learning-analytics products **predict** *who* will fail. EduRAG
explains *why* and shows *what to change*. The output is an explainable,
intervention-oriented profile — not a black-box risk score.

| Layer            | Question it answers                        | Mental model                                |
| ---------------- | ------------------------------------------ | ------------------------------------------- |
| **Prediction**   | "Who is at risk?"                          | Logistic regression on LMS features         |
| **Causal**       | "What would change the outcome if I moved this lever?" | Backdoor-adjusted OLS on a hypothesised DAG, bootstrap CIs, refutation checks |

Both layers are visible side-by-side on every student page so the
distinction is impossible to miss.

---

## Tech stack

| Layer            | Choice                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| Frontend         | Next.js 15 (App Router) + React 19 + Tailwind CSS                            |
| Backend          | Next.js server actions / route handlers + Prisma                             |
| Database         | Postgres 16 (local Docker, CI service, Neon in prod) — Prisma 5.x            |
| Causal engine    | Pure-TS baseline (custom OLS + bootstrap + PC discovery) **or** optional Python worker (DoWhy + `causal-learn`) |
| Prediction       | Pure-TS L2 logistic regression **or** optional Python worker (sklearn LR / RF) |
| Visualisation    | Custom SVG charts and DAG renderer — zero charting library deps              |
| Testing          | Vitest                                                                       |
| Docker compose   | App + Postgres 16-alpine service. `docker compose up -d db` is now part of the local dev path. |

**Zero new runtime dependencies were added in Phases 5 – 9.** Charts, DAG
renderer, mock LMS, CSV upload pipeline, causal estimator, PC discovery,
logistic regression, and the bootstrap CLI are all hand-rolled.

---

## Architecture overview

```
                          ┌─────────────────────────────────────────┐
                          │              Next.js (UI)               │
                          │  /, /students/[id], /causal-graph,      │
                          │  /what-if, /comparison, /upload, /about │
                          └────────────────────┬────────────────────┘
                                               │
              ┌────────────────────────────────┼─────────────────────────────────┐
              │                                │                                 │
   ┌──────────▼──────────┐         ┌───────────▼──────────┐         ┌────────────▼──────────┐
   │ CausalEngine iface  │         │ PredictionEngine     │         │ Bootstrap CLIs        │
   │ baseline TS / Python│         │ baseline TS / Python │         │ setup, demo, doctor,  │
   │ (DoWhy, causal-learn│         │ (sklearn LR / RF)    │         │ status, reset:demo    │
   └──────────┬──────────┘         └───────────┬──────────┘         └────────────┬──────────┘
              │                                │                                 │
              └─────────────────┬──────────────┴─────────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │ Prisma + Postgres│
                        │ /prisma/        │
                        └────────────────┘
```

Three data sources flow through the same validator + ingest pipeline:

1. **Synthetic CSV** — `npm run data:generate` → `npm run db:ingest`
2. **Shell University mock LMS** — `npm run shell:seed` → `npm run sync:university`
3. **Real CSV upload** — `/upload` page (validate → preview → commit)

See [`docs/architecture.md`](docs/architecture.md) for the full picture.

---

## Feature list

- **`/`** Overview cohort dashboard — at-risk counts, strongest causal driver, sortable student table.
- **`/students/[id]`** Student profile — timeline charts + **Prediction vs Intervention** panel + ranked counterfactual cards.
- **`/causal-graph?view=compare`** Manual DAG ⇄ **discovered DAG** (PC algorithm) side-by-side, with downloadable Markdown / JSON reports.
- **`/what-if`** Interactive counterfactual simulator with bootstrap CI propagation.
- **`/comparison`** Cohort-wide *Prediction vs Intervention* table — Agree / Disagree on lever tiles, comparison report download.
- **`/upload`** Real CSV upload pipeline — preview, append / replace / dry-run, automatic re-derivation + re-prediction.
- **`/integrations/shell-university`** Live sync history for the mock LMS.
- **`/about`** First-time-reviewer onboarding (architecture, honesty constraints, route map).
- **`/datasets`** **Phase 10** — three-card dataset-mode switcher (Synthetic / Shell University / Uploaded) with non-destructive activation, status badges, and per-mode refresh hints. A small accent-coloured chip in the global header strip always shows which source is currently canonical.
- **`/interventions`** **Phase 11** — cohort-wide *feedback loop* page. Decision counts (Accepted / Rejected / Deferred / Completed), most-accepted lever, observational insights, recent-decision feed. Every `<InterventionCard>` on `/students/[id]` now carries Accept / Reject / Defer / Mark-complete buttons + advisor-note + observational follow-up form, plus a chronological timeline showing recommendation → decision → note → follow-up events.

Plus seven CLIs: `data:generate`, `db:ingest`, `causal:estimate`,
`causal:simulate`, `causal:discover`, `causal:report`, `ml:predict`, and
the Phase-9 quintet `setup` / `demo` / `reset:demo` / `doctor` /
`status`.

---

## Quick start (verbose)

```bash
# 1. Clone & enter
git clone <repo-url>
cd "EduRAG Prototype"

# 2. Configure environment (optional — defaults work for the demo)
cp .env.example .env

# 3. One-command bootstrap (installs deps, migrates, seeds, runs the pipeline).
npm run setup

# 4. Launch the dashboard.
npm run demo            # setup-if-needed + dev server
# or
npm run dev             # just the dev server
```

If you hit any issue:

```bash
npm run doctor          # full report; tells you exactly what's missing
```

### Manual / step-by-step path

The bootstrap CLI does these for you, but if you want to run them
one-at-a-time:

```bash
npm install
cp .env.example .env
docker compose up -d db            # local Postgres on :5432
npm run prisma:generate
npx prisma db push                 # materialise the schema (no migration history yet)

npm run data:generate              # write data/raw/sample_lms_data.csv
npm run db:ingest                  # CSV → Postgres + weekly + RDI + course features
npm run causal:estimate            # cohort-level β + refutations
npm run causal:simulate            # per-student counterfactual interventions
npm run ml:predict                 # baseline ML predictions (Phase 8)
```

---

## Database (Postgres only)

| Path                       | `DATABASE_URL`                                              | Notes |
| -------------------------- | ----------------------------------------------------------- | ----- |
| Local dev (Docker compose) | `postgresql://edurag:edurag_local_password@localhost:5432/edurag` | Booted by `docker compose up -d db`. Password is interpolated from `.env` (see `POSTGRES_PASSWORD`). |
| GitHub Actions CI          | `postgresql://edurag:edurag_ci_password@localhost:5432/edurag`    | A `postgres:16-alpine` service container is wired into the job. |
| Vercel / Neon (prod)       | `postgresql://…@…-pooler.aws.neon.tech/edurag?sslmode=require`    | Set `DIRECT_URL` to the unpooled DSN for migrations + seed. |

The schema lives at [`prisma/schema.prisma`](prisma/schema.prisma) with
`provider = "postgresql"` (literal — Prisma 5.x does not support
`env()` here). The legacy SQLite migrations are archived under
[`prisma/migrations-sqlite/`](prisma/migrations-sqlite/) for reference;
the active Postgres path is currently driven by `prisma db push`
against the schema, with a committed Postgres migration set to follow
when the operator generates it via `npx prisma migrate dev --name initial`.

### Local-Postgres workflow

```bash
docker compose up -d db                       # start Postgres
cp .env.example .env                          # defaults already point at the service
npm install
npm run prisma:generate
npx prisma db push                            # create tables from schema
npm run setup                                 # idempotent — ingest + estimate + simulate + predict
npm run demo
```

### Resetting to a clean state

```bash
docker compose down -v                        # wipe the Postgres volume entirely
docker compose up -d db
npx prisma db push                            # recreate the schema
npm run setup                                 # repopulate
```

---

## Optional: Python advanced engines

Skip if you only want the TS baseline (default). Install the optional
Python worker to enable:

- **Advanced causal engine** — DoWhy (backdoor regression) + causal-learn (PC discovery)
- **Advanced prediction engine** — sklearn (LR + Random Forest)

```bash
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r python/causal-worker/requirements.txt

# Smoke test
echo '{"cmd":"ping","payload":{}}' | python python/causal-worker/worker.py
```

Then use the `--engine advanced` flag on any CLI:

```bash
npm run causal:estimate -- --engine advanced --extended
npm run causal:discover -- --engine advanced
npm run ml:predict -- --engine advanced --model random_forest
```

The dashboard supports `?engine=advanced` on `/causal-graph`. If the
worker isn't installed, every path falls back to the baseline with a
visible warning — the app never crashes.

See [`python/causal-worker/README.md`](python/causal-worker/README.md).

---

## Optional: Docker

Docker is **optional**. The local-first workflow is the recommended
path. Use the compose stack when you want a fully isolated demo
(interview screenshots, hosted demos, CI smoke tests).

```bash
docker compose build
docker compose up

# Visit http://localhost:3000
```

The container runs `npx prisma migrate deploy && npm run setup &&
npm start` on first boot — the Postgres data directory + generated
CSV / Shell University seed are persisted to named volumes
(`edurag_pg`, `edurag_data`) so subsequent boots short-circuit the
seed.

---

## Demo walkthrough

See [`docs/demo-script.md`](docs/demo-script.md) for the full 2-minute
narrated walkthrough. Headline beats:

1. **Hook** — `/` cohort overview, at-risk badge + confidence chips.
2. **Student profile** — `/students/STU-0042` — Prediction vs Intervention panel ("WHO vs WHAT TO CHANGE").
3. **Causal graph** — `/causal-graph?view=compare` — manual DAG ⇄ discovered DAG.
4. **What-if** — `/what-if` — slider-driven counterfactual.
5. **Upload + integrations** — three independent data sources, one pipeline.
6. **Close** — download a Markdown / JSON report and exit.

---

## Causal AI vs Prediction — read this if you only read one section

Most "AI for student success" tools fit a predictive model
(`P(at-risk | features)`) and stop there. That answers **who**. It
does **not** answer **what to change**. The distinction matters
because:

> *The strongest predictor of an outcome and the strongest causal
> lever on that outcome can be completely different features.*

EduRAG ships both layers and shows the disagreement directly. The
causal layer:

1. Encodes a **DAG** of behavioural drivers → final grade (`src/features/causal-engine/dag.ts`).
2. Estimates the effect of each treatment via **backdoor-adjusted OLS** with bootstrap CIs.
3. Runs **refutation checks** (placebo, random common cause, optional extended set) — failed checks degrade the confidence chip but are never hidden.
4. Optionally runs **causal discovery** (PC algorithm) so you can compare the manual DAG against a data-driven one.
5. Produces **per-student counterfactual interventions** by applying the cohort β to the student's headroom.

See [`docs/causal-methodology.md`](docs/causal-methodology.md) for the
full method spec.

---

## Honesty constraints (binding)

- Causal estimates are **model-based**, not proof of real-world causation.
- Per-student interventions apply a **cohort-average effect** — never a personal guarantee.
- Feature importance from the prediction layer is **not the same thing as a causal effect**.
- Forbidden everywhere in code, copy, and docs: *guaranteed*, *proven cause*, *will definitely improve*. Asserted by the test suite.

---

## Repository layout

```
/src
  /app           Next.js routes (/, /students, /causal-graph, /what-if, /comparison, /upload, /about, /integrations, /api)
  /components    Presentational UI components (zero data fetching)
  /features
    /analytics            RDI + engagement + consistency
    /causal-engine        DAG, OLS estimator, PC discovery, refutations, report renderers, engine abstraction
    /baseline-ml          Logistic baseline + prediction engine abstraction + comparison helpers
    /shell-university     Mock LMS data store + seed
  /lib           Cross-cutting libs (Prisma client, formatters, intervention language)
  /server
    /actions     Server actions (upload, what-if)
    /bootstrap   Phase-9 setup / demo / doctor / status / reset CLIs
    /causal      Causal orchestrators + CLIs (estimate, simulate, discover, report)
    /ingest      CSV → Postgres ingest + derive
    /prediction  Phase-8 train + predict orchestration + CLI
    /queries     Read-only data access for the UI
    /sync        Shell University sync layer (transports, mapper, orchestrator)

/data            Raw + processed (git-ignored)
/python/causal-worker  Optional Python worker (DoWhy, causal-learn, sklearn)
/prisma          Schema + migrations
/docs
  Plan.md                 Phased build plan + status
  architecture.md         System architecture
  data-model.md           Entities, schemas, RDI definition
  causal-methodology.md   DAG design, estimands, refutations, prediction-vs-causal boundary
  demo-script.md          2-minute narrated walkthrough
  /features               Per-feature specifications
  /logs                   Timestamped execution logs
```

---

## Limitations

- Synthetic data only; effect sizes are illustrative, not externally validated.
- Single-institution schema in the MVP.
- Linear functional form throughout.
- No authentication / auth-z — local-first prototype, not production.
- Heterogeneous treatment effects (CATE) are not modelled — every β is a cohort-average.

---

## Roadmap

See [`docs/Plan.md`](docs/Plan.md) for the full plan.

- **Phase 0** — Foundation ✅
- **Phase 1** — Synthetic dataset + data model ✅
- **Phase 2** — Preprocessing + RDI ✅
- **Phase 3** — Causal DAG + backdoor OLS + refutations ✅
- **Phase 4** — Counterfactual / what-if engine ✅
- **Phase 5** — Dashboard UI ✅
- **Phase 5.5** — Shell University mock LMS integration ✅
- **Phase 6** — Real CSV upload + import ✅
- **Phase 7** — Advanced causal engine (DoWhy + causal-learn, extended refutations, discovery, reports) ✅
- **Phase 8** — Baseline ML comparison ("Prediction vs Intervention") ✅
- **Phase 9** — Productisation / one-command setup ✅
- **Phase 10** — Demo dataset modes (canonical mode manager + `/datasets` switcher + global indicator + report provenance) ✅
- **Phase 11** — Advisor feedback / intervention tracking (`InterventionDecision` model, accept/reject/defer/complete actions, observational follow-ups, per-student timeline, `/interventions` cohort page) ✅
- **Phase 12** — GitHub + Vercel deployment (12A GitHub readiness, 12B Postgres compatibility, 12C Vercel deploy, 12D launch lap) — in progress; see [`docs/deployment-github-vercel-plan.md`](docs/deployment-github-vercel-plan.md).
- **Phase 12** — Final polish / GitHub / CV / LinkedIn launch

---

## Screenshots

> Placeholders — recorded at v0.9 (Phase 9). Drop your own PNGs into `docs/screenshots/`.

| Route | Suggested capture |
| ----- | ----------------- |
| `/` | Cohort overview with at-risk badge + strongest-driver tile |
| `/students/STU-0042` | Prediction vs Intervention panel + ranked cards |
| `/causal-graph?view=compare` | Manual DAG vs discovered DAG, side-by-side |
| `/comparison` | Cohort-wide table with Agree / Disagree tiles |
| `/what-if` | Slider mid-interaction with projected lift |

---

## Demo data

All datasets are **synthetic or fully anonymised**. No real student
records are included in this repository at any point. The synthetic
generator lives at `scripts/generate_synthetic_dataset.py` (Python
stdlib only, deterministic).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop, repo conventions,
and honesty constraints. Bug reports + feature requests via the
[issue templates](.github/ISSUE_TEMPLATE/).

---

## License

[MIT](LICENSE) — see the LICENSE file for full text.
