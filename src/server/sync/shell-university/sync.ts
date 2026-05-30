/**
 * Shell University sync orchestrator.
 *
 * Pulls each entity from the configured client (direct or HTTP), validates
 * the envelope, maps to EduRAG's Prisma shape, and upserts. Tracks per-
 * entity counts + errors and writes one `SyncLog` row at the end.
 *
 *   - Idempotent: upserts use natural external keys (`externalId`, `code`,
 *     `(studentId, courseId)`), so re-running with the same data is a no-op.
 *   - Order matters: courses → students → enrollments → resources → events
 *     → grades → advisor notes. Children depend on parents being upserted.
 *   - Activity-log replacement: same strategy as the CSV ingest — delete
 *     by (studentId, courseCode) before bulk inserting, because LMS events
 *     have no natural composite unique key.
 */

import type { PrismaClient } from "@prisma/client";

import { log } from "@/lib/logger";
import {
  assertEnvelope,
  mapAdvisorNote,
  mapCourse,
  mapEnrollment,
  mapGrade,
  mapLmsEvent,
  mapResource,
  mapStudent,
} from "./mapper";
import type { ShellClient } from "./client";
import type {
  ShellAdvisorNote,
  ShellCourse,
  ShellEnrollment,
  ShellEntity,
  ShellGrade,
  ShellLmsEvent,
  ShellResource,
  ShellStudent,
} from "@/features/shell-university/types";

export const ALL_ENTITIES: readonly ShellEntity[] = [
  "courses",
  "students",
  "enrollments",
  "resources",
  "lms-events",
  "grades",
  "advisor-notes",
];

export interface EntitySyncResult {
  fetched: number;
  upserted: number;
  errors: number;
}

export interface SyncSummary {
  status: "success" | "partial" | "failed";
  source: "shell-university";
  transport: string;
  base: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scope: ShellEntity[];
  byEntity: Partial<Record<ShellEntity, EntitySyncResult>>;
  message?: string;
}

export interface SyncOptions {
  scope?: ShellEntity[];
  /** Persist the run as a `SyncLog` row (default: true). */
  persistLog?: boolean;
}

const ACTIVITY_BATCH_SIZE = 500;

export async function syncFromShellUniversity(
  prisma: PrismaClient,
  client: ShellClient,
  opts: SyncOptions = {},
): Promise<SyncSummary> {
  const scope = (opts.scope && opts.scope.length > 0 ? opts.scope : ALL_ENTITIES).slice();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const byEntity: Partial<Record<ShellEntity, EntitySyncResult>> = {};
  let entityErrors = 0;

  log.info(
    `Sync starting [transport=${client.transport} base=${client.base}] scope=${scope.join(",")}`,
  );

  // Cache lookups built lazily as we upsert parents.
  const courseIdByCode = new Map<string, string>();
  const studentIdByExternal = new Map<string, string>();
  const resourceIdByExternal = new Map<string, string>();

  for (const entity of scope) {
    try {
      const env = await client.fetchEntity(entity);
      assertEnvelope(env, entity);
      const fetched = env.data.length;

      let upserted = 0;
      let errors = 0;

      switch (entity) {
        case "courses": {
          const rows = env.data as ShellCourse[];
          for (const raw of rows) {
            try {
              const m = mapCourse(raw);
              const course = await prisma.course.upsert({
                where: { code: m.code },
                create: { code: m.code, title: m.title, weeks: m.weeks },
                update: { title: m.title, weeks: m.weeks },
              });
              courseIdByCode.set(course.code, course.id);
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`courses upsert failed:`, e);
            }
          }
          break;
        }

        case "students": {
          const rows = env.data as ShellStudent[];
          for (const raw of rows) {
            try {
              const m = mapStudent(raw);
              const student = await prisma.student.upsert({
                where: { externalId: m.externalId },
                create: {
                  externalId: m.externalId,
                  firstName: m.firstName,
                  lastName: m.lastName,
                  cohort: m.cohort,
                  priorGpa: m.priorGpa,
                },
                update: {
                  firstName: m.firstName,
                  lastName: m.lastName,
                  cohort: m.cohort,
                  priorGpa: m.priorGpa,
                },
              });
              studentIdByExternal.set(student.externalId, student.id);
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`students upsert failed:`, e);
            }
          }
          break;
        }

        case "enrollments": {
          const rows = env.data as ShellEnrollment[];
          for (const raw of rows) {
            try {
              const m = mapEnrollment(raw);
              const studentId = await resolveStudentId(prisma, m.studentExternalId, studentIdByExternal);
              const courseId = await resolveCourseId(prisma, m.courseCode, courseIdByCode);
              await prisma.enrollment.upsert({
                where: { studentId_courseId: { studentId, courseId } },
                create: { studentId, courseId, enrolledAt: m.enrolledAt },
                update: { enrolledAt: m.enrolledAt },
              });
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`enrollments upsert failed:`, e);
            }
          }
          break;
        }

        case "resources": {
          const rows = env.data as ShellResource[];
          for (const raw of rows) {
            try {
              const m = mapResource(raw);
              const courseId = await resolveCourseId(prisma, m.courseCode, courseIdByCode);
              const resource = await prisma.resource.upsert({
                where: { externalId: m.externalId },
                create: {
                  externalId: m.externalId,
                  courseId,
                  type: m.type,
                  title: m.title,
                },
                update: {
                  courseId,
                  type: m.type,
                  title: m.title,
                },
              });
              resourceIdByExternal.set(resource.externalId, resource.id);
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`resources upsert failed:`, e);
            }
          }
          break;
        }

        case "lms-events": {
          // Replace activity rows scoped to the (studentId, courseId) pairs
          // touched by this batch — same strategy as CSV ingest.
          const rows = env.data as ShellLmsEvent[];
          const touched = new Set<string>(); // `${studentId}::${courseId}`
          const mapped = rows.map(mapLmsEvent);
          const distinctStudentExternals = [...new Set(mapped.map((m) => m.studentExternalId))];
          const distinctCourseCodes = [...new Set(mapped.map((m) => m.courseCode))];

          // Resolve everything needed for the inserts up front.
          for (const ext of distinctStudentExternals) await resolveStudentId(prisma, ext, studentIdByExternal);
          for (const code of distinctCourseCodes) await resolveCourseId(prisma, code, courseIdByCode);

          for (const m of mapped) {
            const studentId = studentIdByExternal.get(m.studentExternalId);
            const courseId = courseIdByCode.get(m.courseCode);
            if (studentId && courseId) touched.add(`${studentId}::${courseId}`);
          }
          // Issue delete-by-(student, course) for each touched pair.
          for (const key of touched) {
            const [studentId, courseId] = key.split("::") as [string, string];
            await prisma.activityLog.deleteMany({ where: { studentId, courseId } });
          }

          // Bulk insert.
          interface ActivityRow {
            studentId: string;
            courseId: string;
            resourceId: string;
            activityType: string;
            timestamp: Date;
            durationSeconds: number;
            weekNumber: number;
            quizScore: number | null;
          }
          let batch: ActivityRow[] = [];
          for (const m of mapped) {
            try {
              const studentId = studentIdByExternal.get(m.studentExternalId);
              const courseId = courseIdByCode.get(m.courseCode);
              let resourceId = resourceIdByExternal.get(m.resourceExternalId);
              if (!resourceId) {
                // Resources may have arrived in a separate sync; refresh once.
                const r = await prisma.resource.findUnique({ where: { externalId: m.resourceExternalId } });
                if (r) {
                  resourceIdByExternal.set(r.externalId, r.id);
                  resourceId = r.id;
                }
              }
              if (!studentId || !courseId || !resourceId) {
                errors += 1;
                continue;
              }
              batch.push({
                studentId,
                courseId,
                resourceId,
                activityType: m.activityType,
                timestamp: m.timestamp,
                durationSeconds: m.durationSeconds,
                weekNumber: m.weekNumber,
                quizScore: m.quizScore,
              });
              if (batch.length >= ACTIVITY_BATCH_SIZE) {
                const written = batch;
                batch = [];
                const res = await prisma.activityLog.createMany({ data: written });
                upserted += res.count;
              }
            } catch (e) {
              errors += 1;
              log.warn(`lms-events insert failed:`, e);
            }
          }
          if (batch.length > 0) {
            const res = await prisma.activityLog.createMany({ data: batch });
            upserted += res.count;
          }
          break;
        }

        case "grades": {
          const rows = env.data as ShellGrade[];
          for (const raw of rows) {
            try {
              const m = mapGrade(raw);
              const studentId = await resolveStudentId(prisma, m.studentExternalId, studentIdByExternal);
              const courseId = await resolveCourseId(prisma, m.courseCode, courseIdByCode);
              await prisma.grade.upsert({
                where: { studentId_courseId: { studentId, courseId } },
                create: { studentId, courseId, finalGrade: m.finalGrade, letter: m.letter },
                update: { finalGrade: m.finalGrade, letter: m.letter },
              });
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`grades upsert failed:`, e);
            }
          }
          break;
        }

        case "advisor-notes": {
          const rows = env.data as ShellAdvisorNote[];
          for (const raw of rows) {
            try {
              const m = mapAdvisorNote(raw);
              const studentId = await resolveStudentId(prisma, m.studentExternalId, studentIdByExternal);
              const courseId = m.courseCode
                ? await resolveCourseId(prisma, m.courseCode, courseIdByCode)
                : null;
              await prisma.advisorNote.upsert({
                where: { externalId: m.externalId },
                create: {
                  externalId: m.externalId,
                  studentId,
                  courseId,
                  noteText: m.noteText,
                  authoredBy: m.authoredBy,
                  authoredAt: m.authoredAt,
                },
                update: {
                  studentId,
                  courseId,
                  noteText: m.noteText,
                  authoredBy: m.authoredBy,
                  authoredAt: m.authoredAt,
                },
              });
              upserted += 1;
            } catch (e) {
              errors += 1;
              log.warn(`advisor-notes upsert failed:`, e);
            }
          }
          break;
        }
      }

      byEntity[entity] = { fetched, upserted, errors };
      if (errors > 0) entityErrors += 1;
      log.info(`  ${entity.padEnd(16)} fetched=${fetched} upserted=${upserted} errors=${errors}`);
    } catch (e) {
      entityErrors += 1;
      byEntity[entity] = { fetched: 0, upserted: 0, errors: 1 };
      log.error(`Entity ${entity} sync failed:`, e);
    }
  }

  const finishedAtMs = Date.now();
  const status: SyncSummary["status"] =
    entityErrors === 0 ? "success" : entityErrors < scope.length ? "partial" : "failed";

  const summary: SyncSummary = {
    status,
    source: "shell-university",
    transport: client.transport,
    base: client.base,
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    scope,
    byEntity,
  };

  if (opts.persistLog !== false) {
    await prisma.syncLog.create({
      data: {
        source: summary.source,
        status: summary.status,
        startedAt: new Date(startedAtMs),
        finishedAt: new Date(finishedAtMs),
        durationMs: summary.durationMs,
        scopeJson: JSON.stringify(summary.scope),
        summaryJson: JSON.stringify(summary.byEntity),
        message:
          summary.status === "success"
            ? `Synced ${scope.length} entities (transport=${client.transport})`
            : `Sync ${summary.status} (${entityErrors}/${scope.length} entity errors)`,
      },
    });
  }

  log.info(`Sync ${status} in ${summary.durationMs}ms`);
  return summary;
}

// ---- helpers ---------------------------------------------------------------

async function resolveCourseId(
  prisma: PrismaClient,
  code: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(code);
  if (cached) return cached;
  const course = await prisma.course.findUnique({ where: { code } });
  if (!course) throw new Error(`Unknown course code ${code} — courses must sync before this entity`);
  cache.set(code, course.id);
  return course.id;
}

async function resolveStudentId(
  prisma: PrismaClient,
  externalId: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(externalId);
  if (cached) return cached;
  const student = await prisma.student.findUnique({ where: { externalId } });
  if (!student) throw new Error(`Unknown student externalId ${externalId} — students must sync before this entity`);
  cache.set(externalId, student.id);
  return student.id;
}
