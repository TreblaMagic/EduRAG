# Contributing to EduRAG

Thanks for taking a look. EduRAG is a portfolio-grade prototype but the
codebase is intentionally written as if a senior engineer will review
every PR — that bar is what makes it useful as a learning artefact, not
just a demo.

This page covers the local dev loop, the repository conventions, and the
honesty constraints that are non-negotiable.

---

## Local setup

Two commands on a fresh clone:

```bash
npm run setup       # idempotent — installs deps, generates the Prisma client,
                    #             runs migrations, seeds the synthetic CSV +
                    #             pipeline (~60 s on a cold install).
npm run demo        # setup-if-needed + dev server with URL banner.
```

If anything is off:

```bash
npm run doctor      # full env + db + data + feature check (non-zero exit on hard fail).
npm run status      # concise row-count snapshot.
```

Full docs are in [README.md](README.md). The Phase 9 bootstrap module
(`src/server/bootstrap/`) is the single source of truth for what
"installed" / "seeded" means.

---

## Repository conventions

### Phase-based history

Every meaningful change is rooted in a numbered **phase** documented at
`docs/Plan.md` and expanded in `docs/features/phase-NN-...md`. Each phase
also ships a timestamped execution log under `docs/logs/`.

When you contribute:

1. Identify which phase your work belongs to. If it's a new phase, append
   it to `docs/Plan.md`.
2. Update the per-feature spec when you change behaviour.
3. Add an execution log entry describing what changed, why, and what the
   operator needs to run manually (migrations, etc.).

The convention is heavy by industry standards but it's what makes the
project legible to a reviewer skimming the repo for the first time.

### Module layout

- `src/features/*` — pure-function feature modules (no I/O, no Prisma).
- `src/server/*` — server-only orchestrators, queries, server actions.
- `src/components/*` — presentational UI components (zero data fetching).
- `src/app/*` — Next.js routes, layouts, API handlers.
- `prisma/*` — schema + migrations.
- `python/causal-worker/*` — optional Python worker (DoWhy + causal-learn + sklearn).
- `scripts/*` — Python data generator + any future maintenance tools.

UI components **never** call Prisma directly. Data flows through
`src/server/queries/*` (reads) or `src/server/actions/*` (writes).

### Engine abstractions

Two interfaces matter and both follow the same shape:

- `CausalEngine` — TS baseline default, Python advanced optional.
- `PredictionEngine` — TS logistic baseline default, sklearn (LR / RF)
  advanced optional.

When you add a new engine, plug it into the existing `select*Engine`
factory and let the structured-fallback warning surface when it's
unavailable. The factory pattern is documented in
`docs/features/phase-7-advanced-causal-engine.md` (causal) and
`docs/features/phase-9-productisation-one-command-setup.md` (prediction).

---

## Test conventions

- Framework: **Vitest** (`npm test`, `npm run test:watch`).
- Pure-function tests live next to the module under
  `__tests__/<name>.test.ts`.
- Server-side tests mock the Prisma client (no real DB needed in CI).
- Every honesty-sensitive surface has a **banned-language assertion** —
  if you touch causal / prediction / intervention copy, your test must
  assert the output doesn't contain `guaranteed`, `proven cause`,
  `confirms causation`, `scientific proof`, or `will definitely improve`.

Before opening a PR:

```bash
npx tsc --noEmit
npm test
npm run build
```

CI runs the same three commands on every PR + push to `main`.

---

## Honesty constraints (binding)

This project is about **explainable, observationally honest** Causal AI.
Forbidden anywhere in code, copy, generated text, and docs:

- `guaranteed`
- `proven cause`
- `confirms causation`
- `scientific proof`
- `will definitely improve`

These exact strings are checked by the test suite. If you find yourself
wanting one of them, rephrase using:

- *Estimated effect*
- *Simulated outcome*
- *Likely causal driver*
- *Model-based recommendation*
- *Observational follow-up*
- *Cohort-average effect applied to this student*

The persistence layer in `src/server/intervention-tracking/decisions.ts`
also rejects advisor notes / follow-ups containing the banned phrases.

---

## Commit + PR style

- Branch off `main`; open a PR; let CI go green; squash-merge.
- Commit subject in imperative mood, ≤ 70 chars
  (`feat(phase-12a): add MIT licence + CI workflow`).
- PR body uses the [template](.github/PULL_REQUEST_TEMPLATE.md) — fill in
  the Test plan + Honesty constraint check sections.
- Tag a release (`v1.0`, `v1.1`, …) only when a documented milestone
  ships.

---

## Manual-only operations (per `CLAUDE.md`)

The agent never runs these — they're operator-only:

- `npx prisma migrate dev --name ...` — schema migrations.
- `pip install -r python/causal-worker/requirements.txt` — Python deps.
- `npm run reset:demo -- --yes` — destructive wipe.
- `git push` and any `git push --force` — repo writes.

CI is free to run `npx prisma generate` (non-destructive client generation).

---

## Reporting bugs / proposing features

Use the templates under [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/).
Include the output of `npm run doctor` in every bug report — it captures
the env / data / feature surface in one block.
