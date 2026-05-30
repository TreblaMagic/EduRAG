# Pull Request

## Summary

<!-- One or two sentences describing what this PR changes and why. -->

## Phase reference

<!-- Which phase / subphase does this work belong to? Link the relevant
     docs/features spec and docs/logs entry if applicable. -->

- Phase: <!-- e.g. 12B — Postgres / Vercel compatibility -->
- Spec: <!-- docs/features/phase-XX-...md -->
- Log:  <!-- docs/logs/YYYY-MM-DD-phase-XX-...md -->

## Test plan

<!-- Bulleted markdown checklist of what was verified. Be specific. -->

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` — all tests passing
- [ ] `npm run build` — clean build
- [ ] Manual UI smoke test for affected routes (if applicable)

## Honesty constraint check (when touching causal / prediction / intervention surfaces)

- [ ] No new copy / notes / outcome text contains `guaranteed`, `proven cause`, `confirms causation`, `scientific proof`, `will definitely improve`.
- [ ] Any new projection is paired with a confidence indicator + CI range or an explicit "observational" caveat.
- [ ] Feature importance is never framed as causal effect.

## Manual commands the operator must run after merging

<!-- Per CLAUDE.md, the agent does not run migrations or destructive
     commands. List anything the operator needs to run (prisma migrate,
     pip install, env-var change, etc.). -->

- <!-- e.g. `npx prisma migrate dev --name <name>` -->

## Screenshots / artefacts (optional)

<!-- Drop screenshots, GIFs, or links to generated report files if
     they help reviewers understand the change. -->
