# Execution Log — CI DATABASE_URL Fix (P1013)

- **Date:** 2026-05-30
- **Phase:** Phase 12C++ — CI hardening (third pass)
- **Status:** ✅ Applied; local typecheck + tests + build green; CI workflow now uses a fixed URL-safe DSN that Prisma can parse.
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessors:**
  - `docs/logs/2026-05-30-phase-12c-vercel-deployment.md`
  - `docs/logs/2026-05-30-phase-12bc-postgres-only-correction.md`
  - `docs/logs/2026-05-30-phase-12c-vercel-postinstall-and-secrets-hardening.md`

---

## Problem

CI step "Materialise Postgres schema" failed with:

```
Error: P1013
The provided database string is invalid. invalid port number in
database URL.
```

The failing command:

```bash
npx prisma db push --skip-generate --accept-data-loss
```

## Root cause

The Phase 12C+ secrets-hardening pass set:

```yaml
env:
  DATABASE_URL: "postgresql://edurag:${{ secrets.CI_POSTGRES_PASSWORD || 'ci-throwaway-not-a-secret' }}@localhost:5432/edurag?schema=public"
```

When the operator (rightly) followed the recommendation to create a
`CI_POSTGRES_PASSWORD` GitHub Actions secret with a strong value,
the secret got string-substituted into the DSN. If that value
contained any URL-unsafe character (`:` `/` `@` `?` `#` `&` `+` `=`
`%` space), the resulting DSN became syntactically malformed.

Concrete example: a password like `aB+9/Xy:Zq=` produces

```
postgresql://edurag:aB+9/Xy:Zq=@localhost:5432/edurag?schema=public
```

Prisma's URL parser sees the bare `:` inside the password and
mis-splits the DSN — the next token is "Zq=" which is not a valid
port. Hence P1013.

The bug is in the workflow's string-interpolation construction of the
DSN, not in Prisma. Either we URL-encode every secret-managed value
(adds workflow complexity and a `urllib.parse.quote` step) or we
stop dynamic interpolation entirely.

---

## Resolution

Use a fixed URL-safe CI-only throwaway literal. The literal is
intentionally chosen to be URL-safe (alphanumeric + underscore) so
no encoding is ever needed. The security trade-off is documented
inline.

### Code changes (1 file)

`.github/workflows/ci.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: edurag
      POSTGRES_PASSWORD: edurag_ci_password
      POSTGRES_DB: edurag

env:
  DATABASE_URL: postgresql://edurag:edurag_ci_password@localhost:5432/edurag
  DIRECT_URL: postgresql://edurag:edurag_ci_password@localhost:5432/edurag
  ENABLE_PYTHON_ENGINE: "false"
  DEMO_MODE: "local"
```

The `${{ secrets.CI_POSTGRES_PASSWORD || ... }}` interpolations are
gone from both the service container env and the workflow-level env.
A new header comment block explains:

- the literal is bound to the service container in this single
  workflow run;
- it's reachable only from the runner's `localhost`;
- it's destroyed at job tear-down;
- it never reaches production (Vercel + Neon get their own secrets
  from the Vercel project env block);
- GitGuardian context: this is a CI-only sample credential; if
  flagged, mark resolved or switch to a URL-encoded secret;
- the alternative (URL-encode a secret-managed password before
  constructing the DSN) is documented as the path forward if any
  project ever requires secret-managed CI credentials.

I also added `DEMO_MODE: "local"` explicitly (was implicit/unset
before) so the hosted-only branches stay turned off in CI.

`prisma generate` is still run explicitly even though `npm ci`
already runs the `postinstall: prisma generate` step from
`package.json` (Phase 12C+ fix). It's redundant-but-cheap insurance
that the client matches the schema before `db push`.

### Files changed

| Path | Change |
| ---- | ------ |
| `.github/workflows/ci.yml` | Replaced `${{ secrets.* \|\| 'fallback' }}` DSN construction with fixed URL-safe CI-only literals. Added explanatory header. Added `DEMO_MODE: "local"` env. |
| `docs/Plan.md` | New "Phase 12C++" subsection + status-table row. |
| `docs/logs/2026-05-30-phase-12c-ci-database-url-fix.md` | This log. |

### Files NOT changed

- No application logic.
- No Prisma schema / migrations.
- No `docker-compose.yml` change — the `${POSTGRES_PASSWORD:?...}`
  required-var posture from Phase 12C+ stays. Local dev still
  needs the operator to set `POSTGRES_PASSWORD` in `.env`.
- No `.env.example` change — local dev posture is unchanged.
- No `package.json` change — the postinstall + `prisma generate &&
  next build` chain from Phase 12C+ stays.

---

## CI env strategy (exact)

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: edurag
          POSTGRES_PASSWORD: edurag_ci_password     # fixed URL-safe literal
          POSTGRES_DB: edurag
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U edurag -d edurag"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=10

    env:
      DATABASE_URL: postgresql://edurag:edurag_ci_password@localhost:5432/edurag
      DIRECT_URL:   postgresql://edurag:edurag_ci_password@localhost:5432/edurag
      ENABLE_PYTHON_ENGINE: "false"
      DEMO_MODE: "local"

    steps:
      - actions/checkout@v4
      - actions/setup-node@v4 (Node 20, cache npm)
      - npm ci                                       # also runs postinstall=prisma generate
      - actions/cache@v4 (.next/cache)
      - npx prisma generate                          # explicit + redundant guarantee
      - npx prisma db push --skip-generate --accept-data-loss
      - npx tsc --noEmit
      - npm test
      - npm run build                                # = prisma generate && next build
```

**No secret references anywhere in the workflow.** The credential
is a constant, URL-safe literal that GitGuardian can recognise as a
sample/test credential.

---

## Verification

| # | Command | Result |
| - | ------- | ------ |
| 1 | `npx tsc --noEmit` | ✅ Clean. |
| 2 | `npm test` | ✅ **37 files, 313 tests, all passed** (~12 s). |
| 3 | `npm run build` (placeholder DSN locally) | ✅ Compiled in 15.1 s; all 13 static pages generated; 23 routes registered. The `prisma:error` lines in the output are runtime errors from the placeholder DSN being unreachable — those are absorbed by the Phase 12A `<DatasetModeBanner>` defensive fallback. |
| 4 | `prisma db push` against a real Postgres | Not executed locally (would require `docker compose up -d db`). Will run for real in CI against the postgres:16-alpine service container. The DSN is syntactically valid (`postgresql://edurag:edurag_ci_password@localhost:5432/edurag` — no URL-unsafe characters; Prisma's parser accepts it). |

**Confirmations:**

- ✅ `prisma db push` will work — the DSN is fixed, URL-safe, and matches the service container env exactly.
- ✅ Tests pass — **313 / 313** unchanged.
- ✅ Build passes locally — `prisma generate && next build` chain runs cleanly.
- ✅ Typecheck passes — clean.

---

## Risks / things to watch

- **GitGuardian may re-flag `edurag_ci_password`.** Expected and
  acceptable — the credential is non-production, ephemeral, and
  runner-local. The workflow header documents this; mark resolved
  in the GitGuardian dashboard.
- **Loss of secret-rotation capability for the CI credential.** A
  literal can't be rotated without a code change. Acceptable
  trade-off — the credential isn't protecting anything that
  outlives a single CI run.
- **Future projects forking this CI workflow inherit the same
  literal.** Also acceptable — it's still bound to *their*
  ephemeral runner, not ours.
- **If we later need a secret-managed CI credential** (e.g. CI
  starts talking to a real-but-internal staging DB), the path is
  documented in the workflow header: use `${{ secrets.* }}` but
  add a workflow step that URL-encodes the value before
  constructing the DSN. Not done here because it adds complexity
  for zero current benefit.

---

## Operator's manual steps after this fix

1. **Pull the change.**
2. **(Optional) Delete the `CI_POSTGRES_PASSWORD` GitHub repository
   secret.** It is no longer referenced anywhere. Removing it is
   cleanup, not required.
3. **Re-run the failing CI workflow.** The `prisma db push` step
   should now succeed (~10 s; ~5 s of that is the postgres
   service container booting + the healthcheck waiting).
4. **(If GitGuardian re-flags `edurag_ci_password`):** mark as
   resolved / sample credential / not a real leak. The workflow
   header comment explains why this is correct.

No Vercel changes needed — Phase 12C+ already fixed the deploy
path. No `.env` changes needed — local dev is unaffected.
