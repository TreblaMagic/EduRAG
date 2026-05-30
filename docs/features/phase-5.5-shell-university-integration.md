# Feature Spec — Phase 5.5: Shell University Integration

> Turns EduRAG from a "CSV-only demo" into "a platform that syncs from an
> external university LMS". Adds a typed mock LMS (Shell University), the
> sync layer that pulls from it, a sync-history UI, and the schema
> additions needed to carry data the integration introduces.

---

## 1. Architecture

```
┌─────────────────────────────┐
│ Shell University mock       │   data/shell-university/*.json
│ (Next.js route handlers)    │ ◄────── seeded by `npm run shell:seed` from
│ /api/shell-university/*     │         the synthetic CSV
└──────────────┬──────────────┘
               │ HTTP (or direct file read)
               ▼
┌─────────────────────────────┐
│ EduRAG sync layer           │
│ src/server/sync/            │
│   shell-university/         │
│ • client (direct + HTTP)    │
│ • mapper (snake → Prisma)   │
│ • orchestrator + SyncLog    │
└──────────────┬──────────────┘
               │ Prisma upserts
               ▼
┌─────────────────────────────┐
│ Prisma / SQLite             │
└──────────────┬──────────────┘
               │
               ▼
   Phase 2 derivation → Phase 3 estimates → Phase 4 sims → Phase 5 dashboard
```

**Co-located, not microservice.** Shell University lives in the same
Next.js process as EduRAG for prototype simplicity. The contract is
deliberately structured so the route handlers can move to a standalone
service later by changing one base URL.

**JSON-backed, not second DB.** Avoids the cost of a parallel Prisma
schema; the JSON files are the mock store. Re-seeding with a different
RNG seed or `--drop` rate produces realistic drift for "alive" sync demos.

---

## 2. Mock university design

### Endpoints (9 total)

All route handlers live at `src/app/api/shell-university/*/route.ts`.

| Method | Path                                       | Returns                                                  |
| ------ | ------------------------------------------ | -------------------------------------------------------- |
| GET    | `/api/shell-university/health`             | `{ status, service, version, uptime_seconds, current_term }` |
| GET    | `/api/shell-university/sync-status`        | `{ data_version, last_data_update, entity_counts }`      |
| GET    | `/api/shell-university/students`           | `{ data: ShellStudent[], meta }`                         |
| GET    | `/api/shell-university/courses`            | `{ data: ShellCourse[], meta }`                          |
| GET    | `/api/shell-university/enrollments`        | `{ data: ShellEnrollment[], meta }`                      |
| GET    | `/api/shell-university/resources`          | `{ data: ShellResource[], meta }`                        |
| GET    | `/api/shell-university/lms-events`         | `{ data: ShellLmsEvent[], meta }`                        |
| GET    | `/api/shell-university/grades`             | `{ data: ShellGrade[], meta }`                           |
| GET    | `/api/shell-university/advisor-notes`      | `{ data: ShellAdvisorNote[], meta }`                     |

Each entity route is a one-liner over `serveEntity()` in
`src/features/shell-university/route-helpers.ts`. When the JSON store
isn't seeded, every entity endpoint returns **HTTP 503** with a hint to
`npm run shell:seed`.

### Envelope shape

```ts
interface ShellApiEnvelope<T> {
  data: T[];
  meta: {
    count: number;
    generated_at: string;       // ISO timestamp
    source: "shell-university-mock";
    entity: ShellEntity;
  };
}
```

### External data shape (excerpts)

The shapes deliberately differ from EduRAG's internal Prisma models — see
`src/features/shell-university/types.ts` for the full definitions.

```ts
interface ShellStudent {
  student_id: string;             // not internal cuid
  given_name: string;             // EduRAG didn't model names before
  family_name: string;
  program: string;
  term: string;                   // "2026-SPRING"
  prior_gpa: number;
  enrollment_status: "active" | "suspended" | "graduated";
}

interface ShellLmsEvent {
  event_id: string;
  learner_id: string;             // ≠ EduRAG's studentId
  course_code: string;
  resource_id: string;
  resource_kind: "video" | "reading" | "quiz" | "forum" | "lab";
  action: "viewed" | "submitted" | "posted" | "commented" | "downloaded";
  occurred_at: string;            // ISO-8601
  duration_seconds: number;
  metadata: { week_number: number; quiz_score: number | null; is_forum_post: boolean };
}
```

The mapper layer translates these into EduRAG's `Student`, `ActivityLog`
(with upper-case enums), etc.

---

## 3. Sync pipeline

`src/server/sync/shell-university/`:

| File          | Role                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `client.ts`   | Two transports behind one `ShellClient` interface: `direct` (file read) and `http`.       |
| `mapper.ts`   | Pure shell-shape → Prisma-shape transformations. Plus `assertEnvelope` (defensive parse). |
| `sync.ts`     | `syncFromShellUniversity` — per-entity upsert loop, error counting, SyncLog persistence.  |
| `cli.ts`      | `npm run sync:university` entry point.                                                    |

### Entity order

```
courses → students → enrollments → resources → lms-events → grades → advisor-notes
```

Children depend on parents being upserted first (resolved via
`courseIdByCode`, `studentIdByExternal`, `resourceIdByExternal` lookups
cached within a single run).

### Idempotency

- All catalogue entities upsert by natural external key (`code`,
  `externalId`).
- `Enrollment` upserts by `(studentId, courseId)`.
- `Grade` upserts by `(studentId, courseId)`.
- `AdvisorNote` upserts by `externalId` (the source's `note_id`).
- `ActivityLog` has **no natural composite key** — we replace by
  `(studentId, courseId)` and bulk-insert, identical to the Phase 2 CSV
  ingest strategy.

Re-running `sync:university` on unchanged data is a no-op for catalogue
tables and produces the same row set for `ActivityLog`.

### Post-sync derivation

After `lms-events` syncs, the CLI re-runs:

- `deriveAllSummaries()` → `WeeklyEngagementSummary` + `RdiScore`
- `deriveCourseFeatures()` → `CourseFeatureSummary`

`--skip-derive` opts out. `causal:estimate` + `causal:simulate` stay
manual so a sync doesn't silently invalidate stored estimates without
the operator's intent.

### SyncLog

Every sync attempt writes one `SyncLog` row:

```
{ source, status, startedAt, finishedAt, durationMs, scopeJson, summaryJson, message }
```

- `status` ∈ `"success" | "partial" | "failed"`
- `scopeJson` = JSON array of synced entities
- `summaryJson` = JSON map of entity → `{ fetched, upserted, errors }`

The integration page reads from this table to render history.

---

## 4. CLI surface

### `npm run shell:seed`

```bash
npm run shell:seed                            # default term 2026-SPRING, seed 42
npm run shell:seed -- --seed 99               # different drift for re-sync demo
npm run shell:seed -- --term 2026-SUMMER
npm run shell:seed -- --csv data/raw/other.csv
npm run shell:seed -- --drop 0.05             # skip ~5% of events
npm run shell:seed -- --out path/to/dir
```

Writes 7 entity JSON files + `_health.json` + `_sync-status.json` to
`data/shell-university/`. Source is the synthetic CSV; names, programs,
and advisor notes are generated from name pools with a seeded RNG.

### `npm run sync:university`

```bash
npm run sync:university                                    # default: direct file read
npm run sync:university -- --via-http                      # exercise the live route handlers
npm run sync:university -- --base http://other-host:3000   # implies --via-http
npm run sync:university -- --students --courses            # partial scope
npm run sync:university -- --full                          # explicit all
npm run sync:university -- --skip-derive
npm run sync:university -- --json                          # stdout summary
```

Per `CLAUDE.md`, the agent never runs migrations or this CLI. The
operator runs both manually.

---

## 5. Data flow end-to-end

```
data/raw/sample_lms_data.csv  (Phase 1 synthetic generator)
              │
              │  npm run shell:seed
              ▼
data/shell-university/*.json   (the mock store)
              │
              │  served at /api/shell-university/*
              ▼
HTTP request (in --via-http mode) OR direct file read (default)
              │
              │  npm run sync:university
              ▼
Mapper translates → Prisma upserts:
   • Student (with names)        • Resource
   • Course                      • ActivityLog (replace by student × course)
   • Enrollment                  • Grade
   • AdvisorNote                 • SyncLog (one row per run)
              │
              │  deriveAllSummaries + deriveCourseFeatures
              ▼
   • WeeklyEngagementSummary     • RdiScore       • CourseFeatureSummary
              │
              │  npm run causal:estimate + causal:simulate (unchanged)
              ▼
   • CausalEstimate              • InterventionSimulation
              │
              ▼
   Phase 5 dashboard renders everything; the new
   /integrations/shell-university page shows live sync history.
```

---

## 6. Tests

Vitest, **165 tests total, all passing.** Phase 5.5 added **25** new tests:

| File                                                                | Tests | Focus                                                       |
| ------------------------------------------------------------------- | ----: | ----------------------------------------------------------- |
| `src/server/sync/shell-university/__tests__/mapper.test.ts`         | 14    | Each translator (student, course, enrollment, resource, lms-event, grade, advisor-note); empty-name normalisation; null quiz score; `assertEnvelope` accepts a valid envelope and rejects 3 failure modes. |
| `src/features/shell-university/__tests__/data-store.test.ts`        |  5    | Seeded store: existence check, parsed array, envelope wrapper. Unseeded store: existence false, throws `ShellStoreNotSeededError`. Uses a scratch tmpdir per test run. |
| `src/server/queries/__tests__/integrations.test.ts`                 |  6    | `classifyDataSource` covers every source label + fallback paths. |

UI components and the full HTTP sync are not unit tested — end-to-end
correctness for those is verified by `npm run build` (passes) and the
operator-run sync against the seeded store.

---

## 7. Build & verification

```
> next build
   ▲ Next.js 15.5.18
 ✓ Compiled successfully in ~20s
 ✓ Generating static pages (13/13)

Route (app)                                 Size  First Load JS
 ƒ /api/shell-university/advisor-notes    151 B         103 kB
 ƒ /api/shell-university/courses          151 B         103 kB
 ƒ /api/shell-university/enrollments      151 B         103 kB
 ƒ /api/shell-university/grades           151 B         103 kB
 ƒ /api/shell-university/health           151 B         103 kB
 ƒ /api/shell-university/lms-events       151 B         103 kB
 ƒ /api/shell-university/resources        151 B         103 kB
 ƒ /api/shell-university/students         151 B         103 kB
 ƒ /api/shell-university/sync-status      151 B         103 kB
 ƒ /integrations/shell-university         170 B         106 kB
 …existing routes…
```

All 9 mock endpoints + the integration page are now in the build.

---

## 8. Limitations

- **JSON-backed mock, not a database.** Good for the demo; a real LMS
  would expose pagination + filtering. Endpoints don't implement
  `?since=` or `?limit=` yet — fine at our 50k-row scale.
- **Co-located with EduRAG.** In production you'd split this into a
  standalone service. The contract is structured to allow that move with
  no EduRAG changes.
- **No auth.** Per the Phase 5.5 constraints. A real LMS adapter would
  add a header to the HTTP client.
- **Names + programs are randomised.** The CSV doesn't carry them; the
  seed picks deterministically from small pools. Re-seeding with the
  same seed reproduces identical names.
- **Advisor notes are coarse.** Generated from a small tone-based
  template. Phase 11 (Advisor Feedback) will let advisors write their own
  and track outcomes.
- **No `?since=` incremental sync.** Every run pulls the full payload
  and relies on upsert idempotency. Fine at our scale; a real LMS
  adapter should add a watermark.

---

## 9. Future real-LMS integration path

1. Replace `createHttpClient(base)` calls with a custom client wired to
   the real LMS endpoint (e.g. Moodle's REST API).
2. Add an auth layer (header / OAuth / mTLS) inside that client — sync
   orchestrator doesn't need to know.
3. Extend `mapper.ts` to handle the real LMS's field names (e.g.
   Moodle's `userid` instead of `learner_id`). The mapper is the single
   source of translation; tests in `mapper.test.ts` make it safe.
4. Pull `/api/shell-university/*` out of EduRAG entirely if you want a
   true microservice; the EduRAG side stays unchanged.

---

## 10. Next steps (Phase 6 — Real CSV Upload & Import)

- Make `/upload` functional (server-side multipart parsing).
- Reuse `src/server/ingest/row-schema.ts` (validation) and `ingestCsv`.
- Preview valid rows + validation errors before commit.
- Re-run derivation + causal:estimate + causal:simulate after import.
- Success / failure report card.
- Persist upload runs to `SyncLog` with `source: "uploaded"` so the
  integration page recognises and labels them.
