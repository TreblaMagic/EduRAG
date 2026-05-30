# Phase 12A — GitHub Readiness + CI + License

> Status: **complete (2026-05-29)**. Repo packaging only — no source code
> logic changes. `npm test` still 305/305; `npm run build` still produces
> 16 routes.

## 1. Goal

Make the repo presentable as a public GitHub project before it goes live
on Vercel. That means: a real licence, automated CI on every PR + push,
review automation (PR + issue templates, Dependabot, CODEOWNERS), and a
contributor-facing doc that captures the conventions the codebase
already follows. Screenshots, the live-demo URL, and the launch
collateral are explicitly deferred to Phase 12D so they can be captured
from the deployed app.

## 2. What shipped

### LICENSE

MIT, copyright Albert Adams 2026. Standard text — chosen because the
project is portfolio-personal but the codebase is reusable enough that
permissive is the right default.

### `.github/workflows/ci.yml`

Triggered on every PR to `main` and every push to `main`. Steps:

1. Checkout
2. `setup-node@v4` with Node 20 + npm cache
3. `npm ci`
4. Cache `.next/cache` keyed on the lockfile + source-tree hash
5. `npx prisma generate`
6. `npx tsc --noEmit`
7. `npm test`
8. `npm run build`

Env vars set defensively for forward-compat with Phase 12B:

- `DATABASE_PROVIDER=sqlite`
- `DATABASE_URL=file:./prisma/ci.db`
- `ENABLE_PYTHON_ENGINE=false`

Concurrency-gated by `ref` so a new push cancels the previous run. ~3
minutes end-to-end with a warm cache.

### `.github/PULL_REQUEST_TEMPLATE.md`

Sections:

- **Summary** — one or two sentences.
- **Phase reference** — link the relevant docs/features spec + docs/logs
  entry.
- **Test plan** — checkbox list (typecheck / tests / build / manual
  smoke).
- **Honesty constraint check** — explicit checklist for causal /
  prediction / intervention surfaces.
- **Manual commands the operator must run after merging** — preserves
  the `CLAUDE.md` rule that the agent never runs migrations.
- **Screenshots / artefacts** — optional.

### `.github/ISSUE_TEMPLATE/{bug,feature}.md`

Bug template prompts for `npm run doctor` output by default — the Phase 9
doctor produces a structured env + db + data + feature snapshot that's
exactly what a reproducer needs.

Feature template asks the reporter to think about honesty constraints,
out-of-scope items, and alternatives considered — keeps proposals
scoped + reviewable.

### `.github/dependabot.yml`

Weekly cadence, Monday 08:00, two ecosystems:

- npm — limit 5 open PRs, minor + patch grouped into one PR
- github-actions — limit 3 open PRs

Group strategy keeps the PR feed manageable while still letting major
bumps surface as individual reviewable PRs.

### `.github/CODEOWNERS`

Single owner with a `@REPLACE-WITH-GITHUB-USERNAME` placeholder. The
plan notes the operator needs to swap this before the first push.

### `CONTRIBUTING.md`

Lightweight but covers:

- Local setup (two-command demo, plus the Phase 9 doctor / status
  commands)
- Repo conventions (phase-based history, module layout, engine
  abstractions)
- Test conventions (vitest, mocked Prisma, banned-language assertions)
- The binding honesty constraints + the standardised replacement
  vocabulary
- Commit + PR style
- Manual-only operations (the `CLAUDE.md` boundary)
- Where to report bugs / propose features

### README polish (light)

Five small changes — the rewrite stays Phase 12D's job:

- Test-count badge bumped from `241 passing` to `305 passing`.
- Phase chip bumped from `9 productisation` to `12A github readiness`.
- License badge flipped from `TBD` (grey) to `MIT` (yellow), linking to
  `LICENSE`.
- Comment notes that live-demo + CI/Vercel status badges land in 12D.
- New "Phase 12" entry in the roadmap pointing at
  `docs/deployment-github-vercel-plan.md`.
- Final sections: License section rewritten ("MIT — see the LICENSE
  file for full text"), new Contributing section added pointing at
  `CONTRIBUTING.md` + the issue templates.

## 3. What deliberately did NOT change

- Any source file under `src/`.
- `prisma/schema.prisma`, `prisma/migrations/*`.
- `package.json`, `package-lock.json`, `next.config.mjs`.
- `.gitignore`, `.env.example`.
- `data/*` (the Shell University JSON un-ignoring + CSV shrink happen in
  12B).
- `vercel.json`, any `app/api/admin/*` route (those land in 12C).
- Screenshots, video, CV bullets, LinkedIn post (12D).

This subphase is deliberately a small, single-PR-sized commit so the
review surface is just the packaging.

## 4. Verification

- `npx tsc --noEmit` clean.
- `npm test` → **35 files, 305 tests, all passed** — unchanged from
  Phase 11.
- `npm run build` → 16 routes generated — unchanged from Phase 11.
- The CI workflow file passes a YAML lint mentally; the first actual run
  will happen on the first push.
- README still renders correctly (verified by inspection).

## 5. Limitations

- **CODEOWNERS uses a placeholder.** The operator must replace
  `@REPLACE-WITH-GITHUB-USERNAME` with their actual handle before the
  CODEOWNERS rules take effect.
- **No protected-branch / required-status-check config yet.** Those are
  GitHub repo settings, configured manually after the first push.
  Recommendation: enable "Require status checks to pass" with `ci` as
  the required check.
- **No deploy step in CI.** Vercel handles its own deploy on push;
  GitHub Actions stays focused on quality gates. This is intentional.
- **No screenshot URLs yet.** README still uses the placeholder table
  from earlier phases; 12D replaces them with images from the live
  demo.

## 6. Manual commands required from the operator

```bash
# 1. Replace the CODEOWNERS placeholder.
#    Edit .github/CODEOWNERS  →  * @your-real-github-username

# 2. Initialise + commit + push.
git init
git add .
git commit -m "Phase 12A — GitHub readiness + CI + MIT licence"
git branch -M main
git remote add origin <https://github.com/<user>/edurag.git>
git push -u origin main

# 3. (Recommended, GitHub UI) configure branch protection for `main`:
#      - require pull request reviews
#      - require `ci` status check to pass before merging
#      - disable force-push to `main`

# 4. Watch the first CI run go green:
#      https://github.com/<user>/edurag/actions
```

## 7. File map

### Created

| Path                                    | Purpose                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `LICENSE`                               | MIT, 2026 Albert Adams.                                                     |
| `.github/workflows/ci.yml`              | Typecheck + tests + build pipeline; Node 20; npm + `.next/cache` caching.   |
| `.github/PULL_REQUEST_TEMPLATE.md`      | PR template incl. honesty-constraint check + manual-commands section.       |
| `.github/ISSUE_TEMPLATE/bug.md`         | Bug template; asks for `npm run doctor` output.                             |
| `.github/ISSUE_TEMPLATE/feature.md`     | Feature template; asks about honesty + scope + alternatives.                |
| `.github/dependabot.yml`                | Weekly npm + GitHub Actions updates, minor/patch grouped.                   |
| `.github/CODEOWNERS`                    | Single-owner routing with placeholder username.                             |
| `CONTRIBUTING.md`                       | Local setup, repo conventions, test conventions, honesty constraints.      |
| `docs/features/phase-12a-github-readiness.md` | This spec.                                                          |
| `docs/logs/2026-05-29-phase-12a-github-readiness.md` | Execution log.                                                 |

### Updated

| Path                | Change                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`         | Badges (tests 305, phase 12A, license MIT); License section rewritten; new Contributing section; Phase 12 roadmap row pointing at the deployment plan.                                            |
| `docs/Plan.md`      | Phase 12A status flipped to ✅ complete; expanded checklist; manual-commands block.                                                                                                               |
