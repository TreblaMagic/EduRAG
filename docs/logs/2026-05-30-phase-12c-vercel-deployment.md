# Execution Log — Phase 12C Vercel Deployment + Nightly Reseed

- **Date:** 2026-05-30
- **Phase:** 12C — Vercel deployment + nightly reseed (code side)
- **Status:** ✅ Code complete; local typecheck + tests + build green. Operator steps (Neon + Vercel project setup) tracked in `docs/Plan.md` Phase 12C manual-commands block.
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 12B Postgres compatibility (`docs/logs/2026-05-30-phase-12b-postgres-vercel-prep.md`)

---

## Goal

Add every code-level thing the Vercel deploy + the nightly cron need:

- a `DEMO_MODE=hosted` switch that flips on the public-demo
  affordances without affecting local dev;
- a global `<DemoModeBanner>` strip so a cold visitor knows the
  demo is public + nightly-reset;
- an upload row-cap so a single visitor can't fill the free-tier
  DB;
- a `/api/admin/reseed` endpoint gated by `CRON_SECRET` so the
  cron can wipe + repopulate without exposing the destructive
  surface;
- a `vercel.json` cron entry and a `robots.txt` route to round
  out the hosted posture.

No Vercel/Neon work in this subphase — that's the operator commands
documented in `docs/Plan.md`.

---

## Constraints respected

- `CLAUDE.md`: no `git`, no `prisma migrate`, no `npm install`, no
  `pip install`, no Vercel/Neon dashboard work. Manual commands
  surfaced in the plan.
- No new runtime npm dependencies (`crypto.timingSafeEqual` is a
  Node built-in).
- Honesty constraints unchanged — new banner copy contains only
  factual disclosure ("Data resets nightly", "Fully synthetic").
- No change to existing tests; only additions.

---

## Code changes (8 new files, 5 modified)

### 1. Demo-mode helper

`src/lib/demo-mode.ts` (NEW):

- `DEMO_MODE_HOSTED` / `DEMO_MODE_LOCAL` literal constants.
- `resolveDemoMode(env?)` — returns `hosted` only on the exact
  trimmed/lowercased literal; everything else → `local` (safe
  default). Tolerates pasted-value casing + trailing whitespace.
- `isHostedDemo(env?)` — sugar.
- `HOSTED_UPLOAD_ROW_CAP = 50_000` — picked so the demo DB stays
  inside the Neon free tier even after a few back-to-back
  visitor uploads. 50k rows ≈ slightly more than the committed
  synthetic CSV (200 × 12 × ~21 events/week).
- Signature takes an `EnvLike = Record<string, string | undefined>`
  rather than `NodeJS.ProcessEnv` so tests can pass `{}` without
  satisfying Next's augmented `NODE_ENV`-required shape.

### 2. Public-demo banner

`src/components/DemoModeBanner.tsx` (NEW):

- Server component. Short-circuits to `null` when
  `isHostedDemo()` returns false → zero render cost locally.
- When hosted, renders a full-width amber strip:
  *"Public demo · Data resets nightly at 03:00 UTC. Fully
  synthetic — no real student records."*

`src/components/AppShell.tsx` (modified):

- Mounted `<DemoModeBanner />` above the dataset-mode chip
  header. No layout shift in local mode (banner is `null`).

### 3. Upload row-cap

`src/server/upload/commit.ts` (modified):

- Added `hostedDemoOverride` + `rowCapOverride` to `CommitInputs`
  for test injection.
- Early check before `buildPreviewResult`: if hosted demo and
  `rows.length > HOSTED_UPLOAD_ROW_CAP`, returns a structured
  `failed(...)` with a clear "Run EduRAG locally for unbounded
  uploads" suggestion. Prisma is never touched.

### 4. Cron-gated reseed route

`src/app/api/admin/reseed/route.ts` (NEW):

- POST only. No GET handler — never invokable from the browser.
- `dynamic = "force-dynamic"` + `maxDuration = 60` so the full
  pipeline (~30 s seed) fits inside the Pro-tier function ceiling.
- Auth model:
  - 503 if `CRON_SECRET` env var is unset → route is opt-in.
  - 401 if the request lacks a matching secret.
  - 200 on success with `{ ok, startedAt, finishedAt, durationMs }`.
  - 500 on pipeline failure with the error message.
- Accepts the secret via either:
  - `Authorization: Bearer ${CRON_SECRET}` (Vercel cron's native
    convention — auto-attached when the env var is named
    `CRON_SECRET`).
  - `x-cron-secret: ${CRON_SECRET}` (curl smoke-test convenience).
- Comparison uses `crypto.timingSafeEqual` against same-length
  buffers (early-returns false on length mismatch to avoid the
  function's same-length precondition throwing).
- `wipeAllDomainTables(prisma)` (inlined) deletes every domain
  table including `SyncLog` + `AppSetting` in dependency order,
  then `runFreshSeed(prisma)` repopulates.

### 5. Seed-pipeline split

`prisma/seed-pipeline.ts` (NEW):

- Body of the previous `runFreshSeed()` extracted here.
- Pure module — no top-level execution. Safe for the reseed
  route to import without triggering the `prisma db seed`
  entry's `main()`.

`prisma/seed.ts` (modified):

- Now just imports `runFreshSeed` and runs the count-check +
  `main()` invocation. Identical idempotency guard preserved
  (Student.count > 0 → skip).

### 6. Vercel config

`vercel.json` (NEW):

- Single cron entry: `0 3 * * *` → `/api/admin/reseed`.
- `$schema` reference for editor validation.

### 7. Robots

`src/app/robots.ts` (NEW):

- `allow`: `/`, `/about`, `/causal-graph`, `/comparison` — the
  read-only, indexable surfaces a recruiter or reviewer would
  land on.
- `disallow`: `/api/`, `/upload`, `/datasets`, `/interventions`,
  `/integrations/`, `/students/`, `/what-if` — every path that
  either mutates the DB, mutates per-visitor state, or doesn't
  meaningfully exist as a crawler target.
- `host`: `NEXT_PUBLIC_APP_URL` (Vercel env), fallback
  `https://edurag.vercel.app` so `next build` works without
  the env locally.

### 8. .env additions

`.env.example` (modified):

- `NEXT_PUBLIC_APP_URL=http://localhost:3000` — public origin
  consumed by `robots.ts` + (future) report download links.
- Commented `# CRON_SECRET=` with operator instructions
  (generate via `openssl rand -hex 32`; leave unset locally so
  the route returns 503).

---

## Tests added (+9, total 313)

`src/lib/__tests__/demo-mode.test.ts` (NEW, 6 tests):

- `resolveDemoMode`: default → `local`; non-literal values →
  `local`; exact `hosted` literal → `hosted`; whitespace +
  uppercase tolerance.
- `isHostedDemo`: agrees with `resolveDemoMode`.
- `HOSTED_UPLOAD_ROW_CAP`: positive integer, value = 50,000.

`src/server/upload/__tests__/commit.test.ts` (NEW, 3 tests):

- Rejects above-cap uploads with a clear error message; Prisma
  never touched.
- Below-cap uploads pass the cap branch (proven by `dryRun=true`
  succeeding — would have returned a "row cap" error otherwise).
- Local-mode uploads (cap override 10, 5000 rows) bypass the cap
  branch entirely and reach the dry-run success path.

---

## Files NOT changed

- No causal / prediction / intervention-tracking engine code.
- No Phase 9 bootstrap CLI changes — `npm run setup` still works
  identically against SQLite.
- No dataset-mode store, orchestrator, or banner change (Phase
  12B did that work).
- No README or Architecture doc copy edits — Phase 12D's launch
  lap covers that.
- `.github/workflows/ci.yml` untouched — Phase 12A's
  `DATABASE_PROVIDER=sqlite` env + `migrate deploy` step are
  exactly what 12C needs in CI. `CRON_SECRET` is intentionally
  unset in CI so the route would return 503 there (CI never
  hits the cron path).

---

## Verification

| # | Command | Result |
| - | ------- | ------ |
| 1 | `npx tsc --noEmit` | ✅ Clean. |
| 2 | `npm test` | ✅ **37 files, 313 tests, all passed** (~7.7 s). |
| 3 | `npm run build` | ✅ Compiled in 11.4 s, 13 static-pass pages generated, **23 routes** registered. New routes: `ƒ /api/admin/reseed` + `○ /robots.txt`. `/_not-found` and `/robots.txt` are the only static routes; everything else stays `ƒ Dynamic`. |
| 4 | First `npm run build` revealed seed side-effect | Caught + fixed: split `prisma/seed.ts` into `seed-pipeline.ts` (pure exports) + thin entry, so importing `runFreshSeed` from the reseed route no longer triggers the `prisma db seed` `main()`. Build re-run came back clean (no `[seed]` lines in the build log). |

The agent did not run `prisma migrate`, `prisma db seed`, `npm install`,
or any Vercel/Neon dashboard work. The reseed route compiles against
the existing Prisma client; once the operator regenerates after the
Phase 12B `prisma migrate dev --name phase12b_app_setting` step, the
`appSetting.deleteMany` call lands on a real model.

---

## Risks / things to watch

- **`CRON_SECRET` must be a high-entropy string.** A weak secret is
  the only line of defence between the public internet and a
  destructive endpoint. The route opens itself only when the env
  var is set; absent secret → 503. Operator instructions point at
  `openssl rand -hex 32`.
- **Pipeline runtime vs `maxDuration`.** Seed takes ~30 s locally
  on the committed synthetic CSV; `maxDuration = 60` leaves ample
  headroom. If the cohort grows the operator should bump this
  before re-deploying.
- **Cron fires regardless of traffic.** Even if no one visits the
  demo for a week, 03:00 UTC fires every day. Cost is one Postgres
  wipe + ~30 s of compute per day — well inside Hobby tier.
- **Robots.txt disallows `/students/*`.** A reviewer following a
  direct link from the README will still see student pages; they
  just won't be in search results. Acceptable for the demo posture.
- **Upload cap is hosted-only.** Local devs see no behaviour change
  — `isHostedDemo()` returns false unless `DEMO_MODE=hosted` is
  explicitly set. The test suite exercises both branches.

---

## Next recommended action

Operator runs the Phase 12C manual commands block in `docs/Plan.md`:

1. `openssl rand -hex 32` → `CRON_SECRET`.
2. Create Neon project → copy pooler + direct URLs.
3. Create Vercel project → paste env vars → push to main → watch
   the first deploy.
4. Smoke-test the live URL (the 8 routes listed in the plan).
5. Curl the reseed endpoint with the bearer header → expect
   200 + JSON body.
6. Verify the cron entry in the Vercel dashboard.

Once the live demo is up, **Phase 12D — Screenshots, README, video,
CV, LinkedIn (launch lap)** captures the polished media from the
deployed URL and tags `v1.0`.
