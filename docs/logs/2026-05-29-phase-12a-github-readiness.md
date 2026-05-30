# Execution Log — Phase 12A: GitHub Readiness + CI + License

- **Date:** 2026-05-29
- **Phase:** 12A — GitHub readiness + CI + license
- **Status:** ✅ Complete (agent work). Manual push step still pending for the operator.
- **Operator:** Claude (Opus 4.7) under `CLAUDE.md` + `context/MasterRule.md`
- **Predecessor:** Phase 12 Planning (`docs/logs/2026-05-29-phase-12-deployment-planning.md`)

---

## Objective

First execution subphase of Phase 12. Add the GitHub-facing packaging
required to push the repo public without compromising on quality:
LICENSE, CI workflow, PR + issue templates, Dependabot, CODEOWNERS, a
CONTRIBUTING.md, and a light README polish. Per the approved plan, this
subphase does **no source-code logic changes** — pure packaging.

Phase 12B (Postgres / Vercel compatibility) and Phase 12C (live deploy)
follow this. The first commit will be Phase 12A only so the GitHub
history starts clean and reviewer-readable.

---

## Files created

| Path                                                     | Purpose                                                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `LICENSE`                                                | MIT, Copyright 2026 Albert Adams.                                                                                                      |
| `.github/workflows/ci.yml`                               | Typecheck + tests + build on every PR to `main` and every push to `main`. Node 20, npm cache, `.next/cache` cache, concurrency-gated. |
| `.github/PULL_REQUEST_TEMPLATE.md`                       | Summary / Phase reference / Test plan / Honesty constraint check / Manual commands.                                                    |
| `.github/ISSUE_TEMPLATE/bug.md`                          | Bug template; asks for `npm run doctor` output by default.                                                                              |
| `.github/ISSUE_TEMPLATE/feature.md`                      | Feature template; asks about honesty constraints + scope + alternatives.                                                               |
| `.github/dependabot.yml`                                 | Weekly cadence for npm + GitHub Actions; minor/patch grouped into single PRs.                                                          |
| `.github/CODEOWNERS`                                     | Single-owner routing with `@REPLACE-WITH-GITHUB-USERNAME` placeholder.                                                                 |
| `CONTRIBUTING.md`                                        | Local setup, repo conventions, test conventions, honesty constraints, manual-only operations.                                          |
| `docs/features/phase-12a-github-readiness.md`            | Full per-feature spec.                                                                                                                 |
| `docs/logs/2026-05-29-phase-12a-github-readiness.md`     | This log.                                                                                                                              |

## Files updated

| Path           | Change                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`    | Badges: tests `241 passing` → `305 passing`; phase `9 productisation` → `12A github readiness`; license `TBD` → `MIT` (links to LICENSE). License section rewritten (was "TBD"); new Contributing section pointing at `CONTRIBUTING.md` + issue templates. New Phase 12 entry in the roadmap pointing at `docs/deployment-github-vercel-plan.md`. |
| `docs/Plan.md` | Phase 12A status flipped to ✅ complete with timestamp 2026-05-29; subphase checklist expanded with the actual deliverables; manual-commands block added (replace CODEOWNERS placeholder + git init + push + enable branch protection + watch CI). |

## Files removed

None.

## Files explicitly NOT touched

Per the approved Phase 12A scope:

- Any source file under `src/`.
- `prisma/schema.prisma`, `prisma/migrations/*`.
- `package.json`, `package-lock.json`, `next.config.mjs`.
- `.gitignore`, `.env.example`.
- `data/*` (Shell University seeds + CSV shrink → 12B).
- `vercel.json`, `app/api/admin/*` (→ 12C).
- `docs/screenshots/*`, `docs/cv-bullets.md`, `docs/linkedin-post.md`,
  `CHANGELOG.md` (→ 12D).

---

## Commands run by the agent

| # | Command                              | Result                                                                                          |
| - | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 | `npx tsc --noEmit`                   | ✅ Typecheck clean (strict + `noUncheckedIndexedAccess`).                                       |
| 2 | `npm test`                           | ✅ **35 files, 305 tests, all passed** (~8 s test exec) — unchanged from Phase 11.              |
| 3 | `npm run build`                      | ✅ Compiled, 16 routes generated — unchanged from Phase 11.                                     |

**No DB migration, no DB-writing CLI, no `npm install`, no `pip install`,
no `git` mutation was performed by the agent.**

---

## Commands the operator must run manually

```bash
# 1. Replace the CODEOWNERS placeholder with the real GitHub username.
#    .github/CODEOWNERS  →  * @your-real-github-username

# 2. Initialise + push (agent does not run git mutations per CLAUDE.md).
git init
git add .
git commit -m "Phase 12A — GitHub readiness + CI + MIT licence"
git branch -M main
git remote add origin https://github.com/<user>/edurag.git
git push -u origin main

# 3. (Recommended) configure branch protection for `main` via GitHub UI:
#      - require pull request reviews
#      - require the `ci` status check to pass before merging
#      - disable force-push to `main`

# 4. Watch the first CI run go green:
#      https://github.com/<user>/edurag/actions
```

---

## Dependencies added

- **TypeScript:** *None.* This subphase ships only repo packaging.
- **GitHub Actions:** `actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/cache@v4` (all standard GitHub-maintained actions).
- **Dependabot:** `npm` + `github-actions` ecosystems.

---

## Assumptions made

1. **Public repo from day one.** No private staging period. The Phase 12
   planning step explicitly chose to ship Phase 12A *before* Vercel so
   the first commit history doesn't contain broken or incomplete
   deploys.
2. **MIT licence.** Permissive default, copyright Albert Adams 2026
   matching the `userEmail` context the agent received. The user can
   swap to a different licence by replacing the LICENSE file content
   and the README badge before pushing.
3. **CI uses SQLite for now.** Phase 12B will introduce the multi-
   provider schema; the CI workflow already sets
   `DATABASE_PROVIDER=sqlite` + a dummy `DATABASE_URL=file:./prisma/ci.db`
   defensively so the workflow keeps working across that transition
   without modification.
4. **No deploy step in CI.** Vercel handles its own deploy on push to
   `main` (configured in Phase 12C). Keeping GitHub Actions focused on
   quality gates avoids duplicate-deploy confusion.
5. **CODEOWNERS uses a placeholder.** The agent doesn't know the user's
   actual GitHub handle. Operator swaps `@REPLACE-WITH-GITHUB-USERNAME`
   before the first push; if they forget, the CODEOWNERS rules just
   don't apply (no crash).
6. **Dependabot groups minor/patch.** Reduces PR noise without losing
   the safety of individual major-bump PRs. Standard pattern that
   reviewers immediately recognise.
7. **PR template includes the honesty-constraint check.** Forces
   reviewers to consciously verify that no banned phrase leaked into
   new copy / notes / output. Phase 11 set up the persistence-layer
   enforcement; the PR template is the human-layer reinforcement.
8. **CONTRIBUTING.md is lightweight.** Explains conventions but
   intentionally does not duplicate the README's setup section — it
   links back to README + docs/Plan.md as authoritative sources.

---

## Verifications

- [x] `npx tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`).
- [x] **305 / 305** tests pass (`npm test`), across 35 files — unchanged
      from Phase 11.
- [x] `npm run build` succeeds — 16 routes generated, unchanged from
      Phase 11.
- [x] No DB migration / DB-writing CLI / `pip install` / `npm install`
      executed by the agent.
- [x] No new npm packages added.
- [x] No source file under `src/` modified.
- [x] No Prisma schema / migration modified.
- [x] CI workflow file passes a mental YAML lint; first real run on the
      first push.
- [x] README still renders correctly; new badges + Contributing section
      verified by inspection.
- [x] `docs/Plan.md` status table + Phase 12A narrative updated.
- [x] `docs/features/phase-12a-github-readiness.md` created.
- [x] Log file created in `docs/logs/`.

---

## Risks / things to watch

- **Branch-protection configuration.** Easy to forget on a brand-new
  GitHub repo. The Plan.md manual-commands block now lists it
  explicitly.
- **CODEOWNERS placeholder.** If the operator forgets to replace
  `@REPLACE-WITH-GITHUB-USERNAME`, the CODEOWNERS file is technically
  invalid (no real user matches the pattern). GitHub will surface a
  warning at PR time but won't block the merge.
- **First CI run could be flaky.** The Phase 7 `selectEngine` test +
  Phase 9 `selectPredictionEngine` test both probe for Python with a
  generous timeout (15s). On a cold GitHub runner this should be fine,
  but if it fails the fix is in the existing test timeout, not in this
  subphase.
- **Dependabot opening 5 PRs on the first Monday after push.** Expected
  on a fresh repo. Triage by accepting the minor/patch grouped PR
  first; deal with major bumps individually.

---

## Next recommended action

Begin **Phase 12B — Postgres / Vercel compatibility (code changes only,
no deploy)**.

Phase 12B brings the actual schema and persistence changes the hosted
demo needs:

- `prisma/schema.prisma` → `provider = env("DATABASE_PROVIDER")`.
- New `AppSetting` singleton model.
- Refactor `src/server/dataset-mode/store.ts` to read/write via Prisma
  instead of the JSON file (the only runtime FS write in the codebase).
- Regenerate migrations against Postgres locally.
- Add `prisma/seed.ts` reusing the Phase 9 `buildSetupSteps`.
- Register `prisma.seed` in `package.json`.
- Commit the Shell University seed JSON files (un-gitignore).
- Shrink the synthetic CSV target size to ≤ 4 MB.
- Refactor `store.test.ts` from temp-file fixtures to mocked-Prisma
  fixtures.
- Document both local dev paths in the README.

Reference: `docs/deployment-github-vercel-plan.md` §4 + §5 + §12 (Phase
12B section).
