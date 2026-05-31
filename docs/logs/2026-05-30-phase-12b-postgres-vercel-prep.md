# Execution Log — Phase 12B Postgres / Vercel Compatibility

- **Date:** 2026-05-30
- **Phase:** 12B — Postgres / Vercel compatibility (code changes only; no deploy)
- **Status:** ✅ Complete; local typecheck + tests + build green.
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 12A CI fix (`docs/logs/2026-05-30-phase-12a-ci-build-fix.md`)

---

## Goal

Prepare the codebase to run on Vercel (read-only FS, serverless) against
Neon Postgres while keeping the local-first SQLite path the default.
**No deploy work in this subphase** — that's Phase 12C. The build
artefact at the end of 12B is "the same checkout runs against both
providers."

---

## Constraints respected

- `CLAUDE.md`: no `prisma migrate` / `prisma db seed` / `npm install` /
  `pip install` — those are operator commands surfaced in the plan.
- No destructive change to existing data.
- Honesty constraints unchanged (no copy edits in this phase).
- No new runtime npm dependencies.

---

## Code changes (10 files modified, 2 new)

### 1. Schema — env-driven provider + `AppSetting`

`prisma/schema.prisma`:

- `datasource db { provider = "sqlite" … }` → `provider = env("DATABASE_PROVIDER")`.
- New singleton model:

  ```prisma
  model AppSetting {
    key       String   @id
    value     String
    updatedAt DateTime @updatedAt
  }
  ```

The `value` column carries a JSON-encoded blob (same shape as the old
file) so the migration is a verbatim payload move — no flattening
into typed columns. Keeps the model deliberately tiny.

### 2. Dataset-mode store — Prisma instead of FS

`src/server/dataset-mode/store.ts`:

- Replaced `existsSync` / `readFileSync` / `writeFileSync` /
  `mkdirSync` with `prisma.appSetting.findUnique` and
  `prisma.appSetting.upsert`.
- `readState` and `writeState` are now `async` and never throw —
  any DB failure or JSON parse error falls through to
  `DEFAULT_DATASET_STATE`.
- `normaliseState()` stayed **pure** (no I/O) so corruption-recovery
  is still unit-testable without a DB.
- Exposes a typed `AppSettingClient` interface (a slice of
  `PrismaClient`) so tests + the seed script can inject doubles
  without dragging in the generated Prisma types.

`src/server/dataset-mode/orchestrator.ts`:

- `getDatasetModeOverview`, `getActiveDatasetMode`,
  `setActiveDatasetMode` rewired to the async store.
- Public signatures simplified — instead of `StoreOptions { path }`,
  callers pass the Prisma client (defaulting to the shared singleton).

`src/server/dataset-mode/index.ts`: barrel export updated
(`statePathFor` removed; `AppSettingClient` added).

`src/server/actions/dataset-mode.ts`: awaits `setActiveDatasetMode`.

`src/features/dataset-modes/types.ts`: updated the
`DatasetModeStateFile` comment to mention the AppSetting carrier.

`docs/architecture.md`: dataset-mode diagram block updated; the
"JSON file, no Prisma migration" invariant flipped to "AppSetting row,
no FS writes at runtime."

### 3. Test refactor — mocked Prisma fixtures

`src/server/dataset-mode/__tests__/store.test.ts` +
`__tests__/orchestrator.test.ts`:

- Replaced `mkdtempSync` / `writeFileSync` / temp-file fixtures with
  a small in-memory `createPrismaFake()` factory implementing the
  `AppSettingClient` slice. Tests run with no FS access at all.
- Added a "broken-client throws on every call" test so the silent
  fallback to `DEFAULT_DATASET_STATE` is locked in (defends the
  `<DatasetModeBanner>` Phase 12A CI fix at the unit level too).
- Removed the `statePathFor` tests — the function is gone.
- Net: 305 → 304 tests (one removed, three rewritten, one added).

### 4. New `prisma/seed.ts`

Calls the underlying TS pipeline functions directly (no `child_process`
spawn), so it works inside a Vercel build:

1. `ingestCsv` → 2. `deriveAllSummaries` → 3. `deriveCourseFeatures` →
4. `runCausalEstimates` → 5. `runSimulations` → 6. `trainAndPredict` →
7. (optional) `syncFromShellUniversity` (direct client, no HTTP).

Idempotent — short-circuits when `Student.count() > 0`. Exports
`runFreshSeed(prisma)` so Phase 12C's nightly-reseed route can call
it after a wipe.

`package.json`:

- Added `"prisma": { "seed": "tsx prisma/seed.ts" }`.
- Added `"prisma:seed": "prisma db seed"` convenience script.

### 5. Bounded seed data — committed for the hosted demo

`scripts/generate_synthetic_dataset.py`:

- `DEFAULT_STUDENTS`: 250 → **200**
- `DEFAULT_WEEKS`: 14 → **12**

At the new defaults the CSV is ~3 MB (was ~5 MB), comfortably under
Vercel Hobby's 4.5 MB server-action body limit (the `/upload`
endpoint round-trips the same shape).

`src/features/shell-university/seed.ts`:

- `writeEntity` / `writeJson` take an optional `{ compact }` flag.
- `lms-events.json` is now written compactly — it scales linearly
  with cohort × weeks and was the only file pushing the
  `data/shell-university/` directory past comfortably-committable
  size. Small files stay pretty-printed for diff reviewability.

`.gitignore`:

- New exemptions: `!data/raw/sample_lms_data.csv` and
  `!data/shell-university/*.json`. The operator regenerates both
  via `npm run data:generate && npm run shell:seed` and commits
  the resulting files — the seed step downstream is then 100%
  deterministic on every Vercel build.

### 6. `.env.example`

Added:

- `DATABASE_PROVIDER=sqlite` (the new env-driven dispatch knob).
- Commented Postgres example with `DIRECT_URL` for connection-pooler
  scenarios (Neon, PgBouncer).
- `DEMO_MODE=local` (placeholder for Phase 12C's hosted-only safety
  rails).
- `ENABLE_PYTHON_ENGINE=true` (already used by tests + CI; lifted to
  the example for discoverability).

### 7. `docker-compose.yml`

Added a `db` service (Postgres 16-alpine, port 5432, edurag/edurag/edurag,
named volume `edurag_pg`, healthcheck) so local devs can exercise the
Postgres path with one command before pushing to Vercel:

```bash
docker compose up -d db
DATABASE_PROVIDER=postgresql DATABASE_URL=... npm run prisma:generate
DATABASE_PROVIDER=postgresql DATABASE_URL=... npx prisma migrate dev
DATABASE_PROVIDER=postgresql DATABASE_URL=... npx prisma db seed
```

The existing `edurag` app service still defaults to SQLite — the
unattended `docker compose up` demo path is unchanged.

### 8. README

- Phase chip badge → `12B postgres compat`.
- Test count → 304.
- New "Choosing a database provider" section with the env-var matrix
  + the Docker Postgres switch-over recipe.

---

## Files NOT changed

- No source file under `src/app/`, `src/components/`, `src/features/causal-engine/`, `src/features/baseline-ml/`, `src/features/intervention-tracking/`, or `src/server/causal/` — Phase 12B is plumbing-only, no UX change.
- No new runtime npm dependencies (added zero entries to
  `dependencies` / `devDependencies`).
- No Phase 9 bootstrap CLI change — `npm run setup` still works
  identically against the SQLite default.
- No banned-language constants, no honesty-banner copy, no causal /
  prediction engine.
- `.github/workflows/ci.yml` untouched — Phase 12A's
  `DATABASE_PROVIDER=sqlite` env block + `migrate deploy` step
  are exactly what 12B needs in CI.

---

## Verification

| # | Command | Result |
| - | ------- | ------ |
| 1 | `npx tsc --noEmit` | ✅ Clean. |
| 2 | `npm test` | ✅ **35 files, 304 tests, all passed** (~7.2 s). |
| 3 | `npm run build` | ✅ Compiled successfully, 12 static pages generated, 21 routes registered. `/_not-found` remains the only static route; every Prisma-touching page stays `ƒ Dynamic`. |

The agent did not run `git`, `prisma migrate`, `prisma db seed`, or
any other DB-mutating CLI. The Prisma client in `node_modules/.prisma`
is still the one Phase 11 generated (no `AppSetting` model yet) — TS
compiles because the store uses a locally-defined `AppSettingClient`
interface, not the generated Prisma type. The operator runs
`npm run prisma:generate` after pulling these changes to refresh the
client, then `npx prisma migrate dev --name phase12b_app_setting` to
create the table.

---

## Risks / things to watch

- **`prisma generate` now requires `DATABASE_PROVIDER`.** Any
  environment that runs prisma commands without the env var will
  fail with a confusing "missing env" message. `.env.example` ships
  the default; CI already exports it (Phase 12A); Vercel will set
  it (Phase 12C). The bootstrap CLI doesn't auto-copy
  `.env.example` — that's still a manual `cp` per Phase 9 docs.
- **`AppSetting` table is empty until first switch.** `readState()`
  returns the default state when the row is missing — no special
  bootstrap needed. The first `setActiveDatasetMode()` call creates
  the row via `upsert`.
- **Committed seed CSV ≠ live cohort.** If `npm run data:generate`
  is run locally with non-default `--students` / `--weeks`, the
  committed CSV will drift from the hosted seed. The hosted demo
  always uses the committed shape; the operator should re-commit
  after any regeneration.
- **Postgres dev-path is opt-in.** The default `npm run setup` path
  still uses SQLite. Devs only need the Postgres docker compose
  path when they explicitly want to validate the Vercel posture
  locally.

---

## Next recommended action

**Phase 12C — Vercel deployment + nightly reseed.** The build artefact
ships with everything 12C needs:

- DB layer is provider-agnostic.
- No runtime FS writes (the one offender moved to `AppSetting`).
- `prisma db seed` exists and is idempotent.
- Shell University JSON + the synthetic CSV are committed so the
  Vercel build's seed step has a deterministic source.

12C adds: `DEMO_MODE` plumbing, `<DemoModeBanner>`, upload row-cap
guard, `/api/admin/reseed` route gated by `CRON_SECRET`, `vercel.json`
cron entry, `app/robots.ts`, and the actual Neon + Vercel project
hookup. No further changes to the dataset-mode store or the seed
pipeline are anticipated.
