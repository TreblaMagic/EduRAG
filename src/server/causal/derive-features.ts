/**
 * Build and persist `CourseFeatureSummary` rows.
 *
 * Reduces `WeeklyEngagementSummary` + `RdiScore` over the term, applies
 * the pure term-level helpers from `features/analytics/engagement.ts`
 * (`consistencyScore`, `trendSlope`), and writes one row per
 * (student, course) pair.
 *
 * Wipes existing rows before re-writing to keep semantics simple for
 * re-imports. Bounded by cohort size — for a few hundred students this
 * runs in well under a second.
 */

import type { PrismaClient } from "@prisma/client";

import {
  consistencyScore,
  trendSlope,
} from "../../features/analytics/engagement";
import { log } from "../../lib/logger";

export interface DeriveFeaturesSummary {
  rowsWritten: number;
  studentsWithoutData: number;
  durationMs: number;
}

const WRITE_BATCH_SIZE = 500;

interface FeatureRowOut {
  studentId: string;
  courseId: string;
  meanEngagement: number;
  meanRdi: number;
  meanLoginsPerWeek: number;
  totalActivity: number;
  weeksObserved: number;
  engagementConsistency: number;
  engagementTrend: number;
  forumParticipation: number;
  quizConsistency: number;
  assessmentTrend: number;
}

export async function deriveCourseFeatures(
  prisma: PrismaClient,
): Promise<DeriveFeaturesSummary> {
  const startedAt = Date.now();

  await prisma.courseFeatureSummary.deleteMany({});

  const weeklies = await prisma.weeklyEngagementSummary.findMany({
    orderBy: [
      { studentId: "asc" },
      { courseId: "asc" },
      { weekNumber: "asc" },
    ],
  });
  const rdiScores = await prisma.rdiScore.findMany({
    orderBy: [
      { studentId: "asc" },
      { courseId: "asc" },
      { weekNumber: "asc" },
    ],
  });

  type WeeklyRow = (typeof weeklies)[number];
  const weeklyByKey = new Map<string, WeeklyRow[]>();
  for (const w of weeklies) {
    const key = `${w.studentId}::${w.courseId}`;
    let bucket = weeklyByKey.get(key);
    if (!bucket) {
      bucket = [];
      weeklyByKey.set(key, bucket);
    }
    bucket.push(w);
  }

  const rdiByKey = new Map<string, number[]>();
  for (const r of rdiScores) {
    const key = `${r.studentId}::${r.courseId}`;
    let bucket = rdiByKey.get(key);
    if (!bucket) {
      bucket = [];
      rdiByKey.set(key, bucket);
    }
    bucket.push(r.value);
  }

  const rows: FeatureRowOut[] = [];
  let studentsWithoutData = 0;

  for (const [key, bucket] of weeklyByKey) {
    if (bucket.length === 0) {
      studentsWithoutData += 1;
      continue;
    }
    const parts = key.split("::") as [string, string];
    const studentId = parts[0];
    const courseId = parts[1];

    const engagements = bucket.map((b) => b.engagementScore);
    const logins = bucket.map((b) => b.loginCount);
    const rdiValues = rdiByKey.get(key) ?? [];
    const quizAverages = bucket
      .map((b) => b.averageQuizScore)
      .filter((q): q is number => q !== null);

    rows.push({
      studentId,
      courseId,
      meanEngagement: round4(mean(engagements)),
      meanRdi: round4(mean(rdiValues)),
      meanLoginsPerWeek: round4(mean(logins)),
      totalActivity: bucket.reduce((s, b) => s + b.activityCount, 0),
      weeksObserved: bucket.length,
      engagementConsistency: round4(consistencyScore(engagements)),
      engagementTrend: round4(trendSlope(engagements)),
      forumParticipation: round4(
        bucket.reduce((s, b) => s + b.forumPosts, 0) / bucket.length,
      ),
      quizConsistency:
        quizAverages.length >= 2 ? round4(consistencyScore(quizAverages)) : 1,
      assessmentTrend:
        quizAverages.length >= 2 ? round4(trendSlope(quizAverages)) : 0,
    });
  }

  log.info(`Computed ${rows.length} CourseFeatureSummary rows`);

  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    await prisma.courseFeatureSummary.createMany({
      data: rows.slice(i, i + WRITE_BATCH_SIZE),
    });
  }

  return {
    rowsWritten: rows.length,
    studentsWithoutData,
    durationMs: Date.now() - startedAt,
  };
}

function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
