/**
 * Compute and persist derived metrics for every (student, course, week)
 * triple present in `ActivityLog`:
 *
 *   - `WeeklyEngagementSummary` rows (activity, duration, logins, …, score)
 *   - `RdiScore` rows (Resource Diversity Index per week)
 *
 * Strategy:
 *   1. Wipe existing derived rows for a clean slate.
 *   2. Stream activity logs out of Prisma, ordered by (student, course, week).
 *   3. Reduce per-bucket via the pure helpers in `features/analytics/*`.
 *   4. Bulk-insert via `createMany`.
 *
 * Bucketing in JS (rather than via SQL `GROUP BY`) keeps the pipeline
 * portable across SQLite and Postgres and lets us reuse the same Phase 2
 * code in unit tests.
 */

import type { PrismaClient } from "@prisma/client";

import { log } from "../../lib/logger";
import {
  summariseWeek,
  type ActivityEvent,
  type ActivityType,
} from "../../features/analytics/engagement";
import {
  buildUsageFromDurations,
  computeRdi,
  type ResourceType,
} from "../../features/analytics/rdi";

export interface DeriveSummary {
  weeklySummaries: number;
  rdiScores: number;
  studentsTouched: number;
  coursesTouched: number;
  durationMs: number;
}

const WRITE_BATCH_SIZE = 1000;

export async function deriveAllSummaries(prisma: PrismaClient): Promise<DeriveSummary> {
  const startedAt = Date.now();

  await prisma.weeklyEngagementSummary.deleteMany({});
  await prisma.rdiScore.deleteMany({});

  const events = await prisma.activityLog.findMany({
    select: {
      studentId: true,
      courseId: true,
      weekNumber: true,
      activityType: true,
      timestamp: true,
      durationSeconds: true,
      quizScore: true,
      resource: { select: { type: true } },
    },
    orderBy: [
      { studentId: "asc" },
      { courseId: "asc" },
      { weekNumber: "asc" },
      { timestamp: "asc" },
    ],
  });
  log.info(`Loaded ${events.length} activity log rows from database`);

  type Key = string; // `${studentId}::${courseId}::${weekNumber}`
  const buckets = new Map<Key, ActivityEvent[]>();
  const studentsTouched = new Set<string>();
  const coursesTouched = new Set<string>();

  for (const e of events) {
    studentsTouched.add(e.studentId);
    coursesTouched.add(e.courseId);
    const key: Key = `${e.studentId}::${e.courseId}::${e.weekNumber}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push({
      weekNumber: e.weekNumber,
      resourceType: e.resource.type as ResourceType,
      activityType: e.activityType as ActivityType,
      timestamp: e.timestamp,
      durationSeconds: e.durationSeconds,
      quizScore: e.quizScore,
    });
  }

  const summaryRows: Array<{
    studentId: string;
    courseId: string;
    weekNumber: number;
    activityCount: number;
    loginCount: number;
    totalDurationSeconds: number;
    submissionCount: number;
    quizSubmissionCount: number;
    forumPosts: number;
    resourceTypeCount: number;
    averageQuizScore: number | null;
    engagementScore: number;
  }> = [];

  const rdiRows: Array<{
    studentId: string;
    courseId: string;
    weekNumber: number;
    value: number;
  }> = [];

  for (const [key, bucket] of buckets) {
    const parts = key.split("::") as [string, string, string];
    const studentId = parts[0];
    const courseId = parts[1];
    const weekNumber = Number(parts[2]);

    const metrics = summariseWeek(weekNumber, bucket);
    summaryRows.push({
      studentId,
      courseId,
      weekNumber,
      activityCount: metrics.activityCount,
      loginCount: metrics.loginCount,
      totalDurationSeconds: metrics.totalDurationSeconds,
      submissionCount: metrics.submissionCount,
      quizSubmissionCount: metrics.quizSubmissionCount,
      forumPosts: metrics.forumPosts,
      resourceTypeCount: metrics.resourceTypeCount,
      averageQuizScore: metrics.averageQuizScore,
      engagementScore: metrics.engagementScore,
    });

    const usage = buildUsageFromDurations(bucket);
    const rdi = computeRdi(usage);
    rdiRows.push({
      studentId,
      courseId,
      weekNumber,
      value: round4(rdi.value),
    });
  }

  await writeInBatches(summaryRows, WRITE_BATCH_SIZE, (data) =>
    prisma.weeklyEngagementSummary.createMany({ data }),
  );
  await writeInBatches(rdiRows, WRITE_BATCH_SIZE, (data) =>
    prisma.rdiScore.createMany({ data }),
  );

  return {
    weeklySummaries: summaryRows.length,
    rdiScores: rdiRows.length,
    studentsTouched: studentsTouched.size,
    coursesTouched: coursesTouched.size,
    durationMs: Date.now() - startedAt,
  };
}

async function writeInBatches<T>(
  items: ReadonlyArray<T>,
  batchSize: number,
  writer: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await writer(items.slice(i, i + batchSize));
  }
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
