# Execution Log — Phase 12 Planning (GitHub + Vercel)

- **Date:** 2026-05-29
- **Phase:** 12 — Planning only (no code changes)
- **Status:** ✅ Plan approved
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 11 (`docs/logs/2026-05-28-phase-11-advisor-feedback-intervention-tracking.md`)

---

## Objective

Produce a complete deployment plan covering:

- GitHub repo (public, with CI).
- Vercel hosted demo (Neon Postgres, nightly reseed).
- Subphase ordering so each commit/PR is review-sized.
- Clear separation of what stays local-only vs what ships to the hosted demo.

**No source code changes were made.** The Phase 12 work itself is split into
subphases 12A–12D and will execute in subsequent runs.

---

## Decisions captured during planning

| Question asked | Answer | Why it matters |
| -------------- | ------ | -------------- |
| Postgres provider for the hosted demo | **Neon** | Free tier; standard pg driver; portable to Vercel Postgres later (same engine under the hood). |
| Hosted demo write policy | **Write-allowed + nightly Vercel Cron reseed** | All features stay enabled in the live demo; cron protects the public URL from drifting into a weird state. |
| Subphase ordering | **12A → 12B → 12C → 12D**, with screenshots last | Screenshots / video / CV / LinkedIn happen *after* the live demo is up so we capture deployed UI (not pre-deploy local). |

---

## Files created

| Path | Purpose |
| ---- | ------- |
| `docs/deployment-github-vercel-plan.md` | Full deployment plan (13 sections + subphases + verification + scope notes). Reviewer-facing canonical reference. |
| `docs/logs/2026-05-29-phase-12-deployment-planning.md` | This log. |

## Files updated

| Path | Change |
| ---- | ------ |
| `docs/Plan.md` | Phase 12 status table expanded with 12A–12D rows; the Phase 12 narrative section replaced with the full subphase breakdown + manual commands. |

## Files explicitly NOT touched

- Any source under `src/`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `package.json`
- `next.config.mjs`
- `.gitignore`
- `.env.example`
- `README.md`
- `docs/architecture.md`
- `docs/causal-methodology.md`
- `docs/demo-script.md`

All code-touching work is deferred to the execution subphases (starting
with 12A).

---

## Commands run by the agent

| # | Command | Purpose |
| - | ------- | ------- |
| 1 | (read-only) `cat`, `grep`, `head` on `next.config.mjs`, `prisma/schema.prisma`, `src/features/shell-university/data-store.ts`, `src/server/upload/commit.ts`, `src/server/dataset-mode/store.ts`, `.gitignore` | Verified the exact runtime FS-write surface (one path) + Shell University file dependency + upload pipeline + .gitignore semantics before writing the plan. |

**No DB migration, no DB-writing CLI, no `npm install`, no `pip install`,
no `git` mutation, no `prisma generate`, no test runs were executed.**

---

## Recommended architecture (summary)

```
Vercel (Next.js prod) ──▶ Neon Postgres (free tier)
       │                       ▲
       │ Prisma (single schema, multi-provider)
       │ Shell University JSON bundled in repo
       │ AppSetting row backs dataset-mode (formerly a JSON file)
       │
GitHub (public)
       │ main → Vercel prod
       │ PRs → Vercel preview
       │ Actions: typecheck + tests + build

Local (unchanged):
       SQLite via DATABASE_PROVIDER=sqlite + Phase 9 setup CLI
       Python worker, all CLI commands, full intervention authoring
```

## Database recommendation (summary)

- **Single Prisma schema** with `provider = env("DATABASE_PROVIDER")`.
- **Local:** SQLite (`file:./prisma/dev.db`) — Phase 9 `npm run setup`
  continues to work end-to-end.
- **Hosted:** Postgres on Neon. New `AppSetting` singleton table replaces
  the JSON-file backing for dataset-mode state. Migrations regenerated
  fresh against Postgres (synthetic data, no migration loss).

## Shell University recommendation (summary)

- Stays inside `/api/shell-university/*` as Next.js route handlers.
- Seed JSON files (7 files, < 2 MB total) **committed to the repo** so
  Vercel can read them at runtime.
- Sync flow remains CLI-only (`npm run sync:university`); the hosted demo
  has Shell University DB state pre-populated by `prisma db seed` (and
  refreshed nightly by the cron).

## Hosted demo limitations (summary)

- Python worker: **not available**. All advanced engine paths fall back to
  the existing TS baselines (already wired in Phases 7 + 9).
- Synthetic CSV: shrink to ≤ 4 MB to fit Vercel Hobby's 4.5 MB body limit
  on server actions.
- Uploads: capped at 50,000 rows in hosted mode to protect the free-tier
  Neon DB.
- Reset of demo data: nightly via Vercel Cron at 03:00 UTC; never exposed
  in the UI.
- Cron endpoint: gated by `CRON_SECRET` — only Vercel's cron service can
  invoke it.

## Implementation subphases (summary)

| Subphase | Scope | Code changes? |
| -------- | ----- | ------------- |
| 12A | GitHub readiness + CI + LICENSE + templates + CONTRIBUTING | No |
| 12B | Multi-provider Prisma + `AppSetting` model + seed script + committed Shell University JSON + shrunk CSV | Yes |
| 12C | `DEMO_MODE` gating + banner + upload row-cap + reseed endpoint + `vercel.json` + first deploy | Yes |
| 12D | Screenshots / README polish / video / CV / LinkedIn / `v1.0` tag — all sourced from live deployed app | Docs only |

---

## Assumptions made

1. **Neon free tier is sufficient.** ~250 students × handful of tables ≪
   Neon's 0.5 GB free storage and ~5 GB monthly transfer. Cold-start
   latency (1–2s first request after idle) is acceptable for a demo.
2. **GitHub repo is public from day one.** No private staging period.
   Phase 12A intentionally ships before Vercel so the first commit history
   doesn't contain broken/incomplete deploys.
3. **Vercel Hobby plan.** Free tier; covers all our needs (cron, preview
   deploys, custom domain). The 4.5 MB body-size cap is the only thing
   the plan accommodates explicitly.
4. **`DATABASE_PROVIDER` env-var trick works.** Prisma's docs confirm
   support since 5.x. If it fights us in 12B, the documented fallback is
   Postgres-only-local using the Phase 9 Docker stack — no risk to the
   timeline.
5. **`store.test.ts` is the only test file requiring a real rewrite in
   12B.** Every other test is either pure-function or already mocks the
   Prisma client. The other 305 tests should pass unchanged.
6. **Screenshots are best captured against the live deployed app.** Hence
   subphase 12D goes *after* deployment, not before. Screenshots from a
   local dev server would have a different URL bar, dev banner, and
   potentially-different colour rendering — not a fit for a launch.
7. **`CHANGELOG.md` and `v1.0` tag happen at the very end (12D).** The
   semantic version stays at 0.x while the deployment subphases are in
   progress.

---

## Verifications (post-execution targets)

After each subphase:

| Subphase | What "done" looks like |
| -------- | ---------------------- |
| 12A | `git clone <repo> && npm run setup && npm run demo` works on a fresh machine. GitHub Actions green on first push. README still works without screenshots. |
| 12B | Local `DATABASE_PROVIDER=sqlite npm run setup` works (no regression). Local `DATABASE_PROVIDER=postgresql npm run setup` (with `docker compose up`) works. Dataset-mode switching persists across restarts (now via DB row, not JSON file). `npm test` → 305+ tests passing (after `store.test.ts` refactor). `npm run build` clean. |
| 12C | Vercel preview deploy succeeds. Visit `/about` on the live URL → banner reads "Public demo — nightly reset". Switch dataset mode → persists across reload. Upload a CSV → respects 50,000-row cap. Manually trigger `/api/admin/reseed` with `CRON_SECRET` → DB wipes and repopulates. The morning after first deploy, cron log shows the 03:00 UTC reseed succeeded. |
| 12D | Live demo URL works for a cold visitor. README screenshots match the live UI. CV bullets + LinkedIn post drafted. Tag `v1.0` pushed to GitHub. |

---

## Risks tracked

- **Prisma multi-provider migration story.** Documented fallback: drop
  SQLite local support and ship Postgres-only-local via the Phase 9 Docker
  stack. Decision deferred to 12B execution.
- **Vercel Hobby body-size cap.** Mitigation: shrink synthetic CSV to
  ≤ 4 MB in 12B; verify with a live upload smoke test in 12C.
- **Cron secret leakage.** Mitigation: generate via `openssl rand -hex 32`,
  store only in Vercel env vars, never log.
- **Cold start latency.** Mitigation: README + on-page banner mention the
  ~2s first-request latency on Neon free tier so reviewers aren't
  surprised.

---

## Next recommended action

Begin **Phase 12A — GitHub readiness + CI + license**. The execution
prompt should reference:

- `docs/deployment-github-vercel-plan.md` for the canonical plan.
- `docs/Plan.md` for the in-progress checklist.
- The user's edited approval (subphase ordering with screenshots last) is
  already baked into both documents.

---

## Confirmation

- ✅ No source code (under `src/`, `prisma/`, root configs) was modified.
- ✅ No DB migration, npm install, pip install, or git mutation was
  performed by the agent.
- ✅ `docs/deployment-github-vercel-plan.md` created.
- ✅ `docs/Plan.md` updated (status table + Phase 12 narrative).
- ✅ This planning log created in `docs/logs/`.
- ✅ Approved-plan mirror persisted at
  `C:\Users\admin\.claude\plans\glimmering-percolating-treehouse.md`.
