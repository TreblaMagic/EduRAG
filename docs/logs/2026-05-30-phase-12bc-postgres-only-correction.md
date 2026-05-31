# Execution Log — Phase 12B/12C Postgres-Only Correction

- **Date:** 2026-05-30
- **Phase:** Correction on top of 12B + 12C
- **Status:** ✅ Applied; typecheck + tests + build all green; GitGuardian violation resolved; Prisma validation passes.
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessors:**
  - `docs/logs/2026-05-30-phase-12b-postgres-vercel-prep.md`
  - `docs/logs/2026-05-30-phase-12c-vercel-deployment.md`

---

## Problem (two issues, one patch)

### 1. GitGuardian alert: hardcoded Postgres password

The Phase 12B docker-compose change shipped a literal
`POSTGRES_PASSWORD: edurag` inline. GitGuardian flagged it as a
generic password. Treating it as a real secret is the right
posture even though it's a local-only default — once the literal
is in git history, every downstream fork inherits a known
credential.

### 2. Prisma 5.x rejects `provider = env(...)`

Phase 12B used `datasource db { provider = env("DATABASE_PROVIDER") }`
to let the same schema target SQLite locally + Postgres on Vercel.
**This is not actually supported.** Prisma 5.x only accepts `env()`
on `url` and `directUrl`; the `provider` field requires a literal
string. `prisma validate` rejected the schema, and the first CI
run against the new schema failed with:

```
Error validating datasource `db`: the URL must start with the protocol `file:`.
  -->  schema.prisma:21
```

(The CI used `DATABASE_PROVIDER=sqlite`, but the schema's `env()`
was effectively still "sqlite" everywhere — the multi-provider
trick was a fiction.)

---

## Resolution: commit to Postgres only

EduRAG's deployment target is Vercel + Neon. SQLite was always a
local-only convenience. The simpler posture — schema, migrations,
client, all single-provider — eliminates a whole class of bugs and
matches what we actually deploy.

### Code changes (10 files modified, 0 new)

**Schema + migrations**

- `prisma/schema.prisma` — `provider = "postgresql"` (literal) +
  `directUrl = env("DIRECT_URL")`. Docstring updated to explain
  why we're locked-in and what the future Postgres-native
  refactors (`Json` columns, real enums) would look like.
- `prisma/migrations/*` — moved to `prisma/migrations-sqlite/`.
  Those migrations use SQLite syntax and won't apply to Postgres.
  Preserved for reference / history; not in Prisma's active path.
  The active path is `prisma db push` against the schema until
  the operator generates a Postgres migration history with
  `npx prisma migrate dev --name initial`.

**Secrets posture**

- `docker-compose.yml` — `POSTGRES_PASSWORD` now sourced from env
  interpolation with a non-secret literal fallback. The literal
  was intentional + obvious — never to be used outside this
  compose stack. `POSTGRES_USER` + `POSTGRES_DB` got the same
  treatment for consistency. The app service now
  `depends_on: { db: { condition: service_healthy } }` and
  builds its `DATABASE_URL` from the same env vars.
  **Superseded later the same day** by the GitGuardian + Vercel
  remediation, which removed even the fallback literal and
  switched to `${POSTGRES_PASSWORD:?...}` (required, no default).
  See `2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`.
- `.env.example` — Postgres-first defaults. The retired
  `DATABASE_PROVIDER` knob is gone. `POSTGRES_USER` /
  `POSTGRES_PASSWORD` / `POSTGRES_DB` documented so the values
  in `.env` line up with the compose env. `DATABASE_URL` and
  `DIRECT_URL` both point at `localhost:5432`. The Neon
  production example is commented in the same block.

**CI**

- `.github/workflows/ci.yml` — added a `postgres:16-alpine`
  service container with the canonical
  `pg_isready` healthcheck. `DATABASE_URL` + `DIRECT_URL` both
  point at it. The pipeline now runs
  `npx prisma db push --skip-generate --accept-data-loss`
  between `prisma generate` and the typecheck/test/build steps —
  `migrate deploy` isn't useful while there's no committed
  migration history. CI password was a non-secret workflow literal
  at this point — later replaced by `${{ secrets.CI_POSTGRES_PASSWORD }}`
  with a non-entropy fallback in the secrets-hardening pass.

**Bootstrap CLIs**

- `src/server/bootstrap/setup-steps.ts` — the "migrate" step is
  now "Apply Postgres schema (prisma db push)". `shouldRun`
  probes via a real Prisma table query (try `countStudents()` →
  if it throws, schema is missing). New optional
  `schemaApplied` injection point so tests can override.
  Existing test fixtures still pass without modification.
- `src/server/bootstrap/checks.ts` (doctor) — replaced the
  "SQLite database" file-existence check with a "DATABASE_URL"
  shape check. Added a `redactDsn()` helper so the password
  never lands in doctor output. Updated the error-path hint to
  point at `prisma db push` rather than `migrate deploy`.
- `src/server/bootstrap/doctor-cli.ts` — docstring updated
  ("SQLite file, row counts" → "DATABASE_URL shape, Postgres
  row counts").
- `src/server/bootstrap/reset-cli.ts` — added
  `InterventionDecision` (Phase 11) to the deletion order;
  comment updated to reflect that Postgres enforces FKs
  strictly so order is no longer optional defence-in-depth.

**Tests**

- `src/server/bootstrap/__tests__/format.test.ts` — the one
  fixture that referenced "SQLite database" now reads
  "DATABASE_URL". Assertion updated to match.
- All other tests unchanged. **313 / 313** still green.

**Documentation**

- `README.md` — three-command demo
  (`docker compose up -d db && npm run setup && npm run demo`).
  "Database (Postgres only)" section replaces the previous
  multi-provider matrix. Tech-stack row + architecture diagram
  bubble both flipped from "SQLite for the MVP" to "Postgres
  16 (local Docker, CI service, Neon in prod)". Docker block
  updated for the `db` service + the renamed `edurag_pg`
  volume.
- `docs/Plan.md` — new "Phase 12B/12C correction" subsection
  documents the root cause, the changes shipped, and the
  operator commands needed to land the fix on a checked-out
  copy. Phase status table gained a "12B/C correction" row.

---

## Files NOT changed

- No application logic (causal engine, prediction layer,
  intervention tracking, dataset-mode store/orchestrator,
  banner components, server actions).
- No `prisma/seed.ts` / `seed-pipeline.ts` change — both already
  work against any Prisma provider.
- No `vercel.json` / `robots.ts` / `<DemoModeBanner>` / upload
  row-cap change — Phase 12C's work stays valid.
- No new npm dependencies.
- No honesty-constraint code or copy edits.
- The Phase 12B `AppSetting` model is unchanged — it was
  provider-agnostic from day one.

---

## Verification

| # | Command | Result |
| - | ------- | ------ |
| 1 | `npx prisma generate` | ✅ Generated successfully. The schema validates against Prisma 5.22 — no `env() in provider` error. |
| 2 | `npx tsc --noEmit` | ✅ Clean. |
| 3 | `npm test` | ✅ **37 files, 313 tests, all passed** (~8 s). |
| 4 | `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder npm run build` | ✅ Compiled successfully, **23 routes** registered. The "Please make sure to provide valid database credentials" warning is expected — there is no live Postgres at the placeholder URL — and the build proceeds because the `<DatasetModeBanner>` Phase 12A defensive fallback swallows the runtime error during the static prerender pass. |

**Prisma validation:** PASSES. The previous `env() in provider`
error is gone.

**GitGuardian:** at this point the only literal credential-shaped
strings left in the repo were the deliberately-obvious local-only
fallback in `docker-compose.yml` + the matching string in
`.env.example`. GitGuardian re-flagged those — they were removed
in the follow-up secrets-hardening pass later the same day. See
`2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`.

---

## Updated CI strategy

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: edurag
      # Later replaced with `${{ secrets.CI_POSTGRES_PASSWORD || 'ci-throwaway-not-a-secret' }}`
      # in the secrets-hardening pass.
      POSTGRES_PASSWORD: <non-secret CI literal>
      POSTGRES_DB: edurag
    ports: ["5432:5432"]
    options: --health-cmd="pg_isready -U edurag -d edurag" ...

steps:
  - checkout
  - setup-node 20 (cache npm)
  - npm ci
  - cache .next/cache
  - npx prisma generate
  - npx prisma db push --skip-generate --accept-data-loss     # ← NEW (was: migrate deploy || db push)
  - npx tsc --noEmit
  - npm test
  - npm run build
```

`migrate deploy` will return as soon as the operator commits a
Postgres migration history. Until then, `db push` is the right
tool — it diffs the schema against an empty DB and creates
whatever's missing, idempotent on re-run.

---

## Risks / things to watch

- **No committed Postgres migration history.** `db push` is
  sufficient for CI + local dev, but production deploys should
  use `migrate deploy` against a versioned migration set. The
  operator should run `npx prisma migrate dev --name initial`
  against a fresh local Postgres soon and commit the resulting
  `prisma/migrations/` folder. Once that's done, swap the CI
  workflow's `db push` step back to `migrate deploy` (with a
  `db push` fallback) for stricter production parity.
- **Existing local `prisma/dev.db` is now stale.** It's
  gitignored and unused under the new schema; the operator
  should delete it (`rm prisma/dev.db` or Remove-Item) to
  avoid confusion when running `doctor`.
- **Local-default credential literal — removed in follow-up pass.**
  The compose fallback was a known, deliberately-non-production
  string. GitGuardian re-flagged it; the secrets-hardening pass
  later the same day switched to `${POSTGRES_PASSWORD:?...}` so
  no literal lives in the repo at all. See
  `2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`.
- **Phase 12B's `AppSetting` migration must still be generated.**
  The previous Phase 12B operator commands suggested
  `prisma migrate dev --name phase12b_app_setting`. Under the
  correction, that step is rolled into the eventual single
  `prisma migrate dev --name initial` because all the previous
  SQLite migrations are archived. The schema already includes
  `AppSetting`.

---

## Next recommended action

The correction unblocks **Phase 12C operator setup** (already
documented):

1. `openssl rand -hex 32` → `CRON_SECRET`.
2. Create the Neon project → copy pooler + direct URLs.
3. Create the Vercel project → paste env vars (the
   `DATABASE_PROVIDER` slot is gone; only `DATABASE_URL` +
   `DIRECT_URL` + `CRON_SECRET` + `DEMO_MODE=hosted` +
   `NEXT_PUBLIC_APP_URL` matter).
4. Push to `main` → watch the first Vercel deploy. Build
   command stays:
   `prisma generate && prisma migrate deploy && prisma db seed && next build`,
   but the operator should generate a Postgres migration set
   locally first (`npx prisma migrate dev --name initial`)
   and commit it before that first deploy — otherwise
   `migrate deploy` will be a no-op and Prisma will refuse
   to seed against an empty schema. (Vercel could alternatively
   replace `migrate deploy` with `db push` until the migration
   history is committed.)
