/**
 * Weekly engagement metrics derived from raw activity events.
 *
 * Two layers:
 *   1. {@link summariseWeek} — per (student, course, week) reduction. Pure.
 *   2. {@link consistencyScore} / {@link trendSlope} — term-level reductions
 *      over a sequence of weekly engagement scores. Pure.
 *
 * Persistence is handled by `src/server/ingest/derive-summaries.ts`; this
 * module knows nothing about the database.
 */

import { RESOURCE_TYPES, type ResourceType } from "./rdi";

export const ACTIVITY_TYPES = [
  "VIEW",
  "SUBMIT",
  "POST",
  "COMMENT",
  "DOWNLOAD",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityEvent {
  weekNumber: number;
  resourceType: ResourceType;
  activityType: ActivityType;
  timestamp: Date;
  durationSeconds: number;
  quizScore: number | null;
}

export interface WeeklyMetrics {
  weekNumber: number;
  activityCount: number;
  totalDurationSeconds: number;
  /** Distinct calendar days (UTC) with at least one event. */
  loginCount: number;
  submissionCount: number;
  quizSubmissionCount: number;
  forumPosts: number;
  resourceTypeCount: number;
  averageQuizScore: number | null;
  /** Composite 0-1 score; see implementation note. */
  engagementScore: number;
}

// ---- engagementScore composition ------------------------------------------
//
// A simple heuristic for the MVP. Each component is clamped to [0, 1] and
// then linearly combined. Phase 3 may reweight these based on causal estimates.
//
//   activityScore  = min(activityCount / TARGET_EVENTS, 1)
//   durationScore  = min(totalDurationSeconds / TARGET_SECONDS, 1)
//   loginScore     = min(loginCount / TARGET_DAYS, 1)
//   diversityBonus = max(0, (resourceTypeCount - 1) / (CATALOGUE - 1))
//
//   engagementScore = 0.35*activity + 0.25*duration + 0.20*login + 0.20*diversity
//
const TARGET_EVENTS_PER_WEEK = 20;
const TARGET_SECONDS_PER_WEEK = 4 * 3600; // 4 hours
const TARGET_ACTIVE_DAYS_PER_WEEK = 5;

const WEIGHTS = {
  activity: 0.35,
  duration: 0.25,
  login: 0.2,
  diversity: 0.2,
} as const;

/** Reduce one (student, course, week) bucket of events to a weekly metric record. */
export function summariseWeek(
  weekNumber: number,
  events: ReadonlyArray<ActivityEvent>,
): WeeklyMetrics {
  const activityCount = events.length;
  const totalDurationSeconds = events.reduce((s, e) => s + e.durationSeconds, 0);
  const loginCount = countDistinctDates(events);

  let submissionCount = 0;
  let quizSubmissionCount = 0;
  let forumPosts = 0;
  const typesSeen = new Set<ResourceType>();
  const quizScores: number[] = [];

  for (const e of events) {
    typesSeen.add(e.resourceType);
    if (e.activityType === "SUBMIT") {
      submissionCount += 1;
      if (e.resourceType === "QUIZ") quizSubmissionCount += 1;
    }
    if (e.activityType === "POST" && e.resourceType === "FORUM") {
      forumPosts += 1;
    }
    if (e.quizScore !== null && e.activityType === "SUBMIT" && e.resourceType === "QUIZ") {
      quizScores.push(e.quizScore);
    }
  }

  const resourceTypeCount = typesSeen.size;
  const averageQuizScore = quizScores.length > 0 ? mean(quizScores) : null;

  const activityScore = clamp01(activityCount / TARGET_EVENTS_PER_WEEK);
  const durationScore = clamp01(totalDurationSeconds / TARGET_SECONDS_PER_WEEK);
  const loginScore = clamp01(loginCount / TARGET_ACTIVE_DAYS_PER_WEEK);
  const diversityBonus =
    resourceTypeCount > 0
      ? clamp01((resourceTypeCount - 1) / (RESOURCE_TYPES.length - 1))
      : 0;

  const engagementScore =
    round3(
      WEIGHTS.activity * activityScore +
        WEIGHTS.duration * durationScore +
        WEIGHTS.login * loginScore +
        WEIGHTS.diversity * diversityBonus,
    );

  return {
    weekNumber,
    activityCount,
    totalDurationSeconds,
    loginCount,
    submissionCount,
    quizSubmissionCount,
    forumPosts,
    resourceTypeCount,
    averageQuizScore,
    engagementScore,
  };
}

/**
 * Consistency of weekly engagement, normalised to [0, 1].
 *
 * Computed as `1 / (1 + CV)` where CV is the coefficient of variation
 * (stdev / mean). A perfectly constant series scores 1; high week-to-week
 * variance scores closer to 0.
 *
 *   - 0 or 1 weeks of data        → 1 (no variance to speak of)
 *   - constant non-zero series    → 1
 *   - mean = 0                    → 0 (the learner did nothing)
 */
export function consistencyScore(weeklyEngagement: ReadonlyArray<number>): number {
  if (weeklyEngagement.length < 2) return 1;
  const m = mean(weeklyEngagement);
  if (m === 0) return 0;
  const variance =
    weeklyEngagement.reduce((s, x) => s + (x - m) ** 2, 0) / weeklyEngagement.length;
  const sd = Math.sqrt(variance);
  const cv = sd / m;
  return clamp01(1 / (1 + cv));
}

/**
 * Linear regression slope of weekly engagement scores over week index.
 *
 * Returned in `engagement units per week`. The sign is the trend direction.
 *   - Empty / single point   → 0
 *   - Flat                   → 0
 *   - Increasing             → positive
 *   - Decreasing             → negative
 */
export function trendSlope(weeklyEngagement: ReadonlyArray<number>): number {
  const n = weeklyEngagement.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i + 1;
    sumY += weeklyEngagement[i] ?? 0;
  }
  const xm = sumX / n;
  const ym = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = weeklyEngagement[i] ?? 0;
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ---- helpers ---------------------------------------------------------------

function countDistinctDates(events: ReadonlyArray<ActivityEvent>): number {
  const set = new Set<string>();
  for (const e of events) {
    set.add(e.timestamp.toISOString().slice(0, 10));
  }
  return set.size;
}

function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
