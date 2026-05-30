# Feature Spec — Phase 0: Project Foundation

> Spec for the **foundation scaffolding** itself. Subsequent phases will add one
> spec file per implemented feature in this directory.

---

## Summary

Phase 0 establishes the repository structure, documentation skeleton, and root
configuration files so that all subsequent phases can be implemented against a
clean, scalable, review-ready baseline. **No application code or UI is included
in this phase.**

## Motivation

Avoid the common prototype failure mode of bolting structure on after the fact.
A senior engineer reviewing the repo at any point — including before any code
exists — should immediately see how the project is organised, what it is trying
to do, and where future code will live.

## Scope (in)

- Folder hierarchy under `/src`, `/data`, `/docs`, `/prisma`.
- Root config files: `.gitignore`, `.env.example`, `README.md`.
- Documentation skeleton: `Plan.md`, `architecture.md`, `data-model.md`,
  `causal-methodology.md`, `demo-script.md`.
- `/docs/logs` directory for timestamped execution logs.
- `/docs/features` directory for per-feature specs (this file is the first).

## Scope (out)

- Installing any npm or pip dependencies.
- Creating `package.json`, `tsconfig.json`, `prisma/schema.prisma`. These
  arrive in Phase 1 alongside the first runnable code.
- Any UI components, API routes, or database schema.
- Any test files (deferred per `CLAUDE.md` testing rule).

## Folders created

```
/src/{app,components,features,lib,server,types,utils}
/data/{raw,processed}
/docs/{logs,features}
/prisma
```

## Files created

| File                                 | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `.gitignore`                         | Standard exclusions + keep data folders. |
| `.env.example`                       | Template for local environment vars.     |
| `README.md`                          | Public-facing project description.       |
| `docs/architecture.md`               | System architecture & module boundaries. |
| `docs/data-model.md`                 | Entities, schema, RDI definition.        |
| `docs/causal-methodology.md`         | DAG, identification, refutation.         |
| `docs/demo-script.md`                | 2-minute walkthrough.                    |
| `docs/features/phase-0-foundation.md`| This spec.                               |
| `docs/logs/<timestamp>-phase-0.md`   | Execution log for this phase.            |
| `.gitkeep` placeholders              | Keep empty folders under version control.|

## Files already present (verified, not modified)

- `CLAUDE.md`
- `context/MasterRule.md`
- `docs/Plan.md` (status updated to reflect Phase 0 completion)

## Definition of Done

- [x] All folders listed above exist.
- [x] All files listed above exist and are non-empty.
- [x] `Plan.md` marks Phase 0 as complete.
- [x] A log file exists in `docs/logs/` describing this phase.
- [x] No application dependencies installed.
- [x] No UI / API / database code added.

## Next phase

**Phase 1 — Dataset & Data Model.** See `docs/Plan.md`.
