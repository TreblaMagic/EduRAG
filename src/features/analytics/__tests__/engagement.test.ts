import { describe, expect, it } from "vitest";

import {
  consistencyScore,
  summariseWeek,
  trendSlope,
  type ActivityEvent,
} from "../engagement";

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    weekNumber: 1,
    resourceType: "VIDEO",
    activityType: "VIEW",
    timestamp: new Date("2026-01-12T10:00:00Z"),
    durationSeconds: 300,
    quizScore: null,
    ...overrides,
  };
}

describe("summariseWeek", () => {
  it("returns zeroed metrics on an empty week", () => {
    const m = summariseWeek(3, []);
    expect(m).toEqual({
      weekNumber: 3,
      activityCount: 0,
      totalDurationSeconds: 0,
      loginCount: 0,
      submissionCount: 0,
      quizSubmissionCount: 0,
      forumPosts: 0,
      resourceTypeCount: 0,
      averageQuizScore: null,
      engagementScore: 0,
    });
  });

  it("counts events, durations, and distinct active days", () => {
    const m = summariseWeek(1, [
      event({ timestamp: new Date("2026-01-12T10:00:00Z"), durationSeconds: 300 }),
      event({ timestamp: new Date("2026-01-12T14:00:00Z"), durationSeconds: 600 }),
      event({ timestamp: new Date("2026-01-13T10:00:00Z"), durationSeconds: 200 }),
    ]);
    expect(m.activityCount).toBe(3);
    expect(m.totalDurationSeconds).toBe(1100);
    expect(m.loginCount).toBe(2);
  });

  it("counts submissions, quiz submissions, and forum posts independently", () => {
    const m = summariseWeek(1, [
      event({ activityType: "SUBMIT", resourceType: "QUIZ", quizScore: 85 }),
      event({ activityType: "SUBMIT", resourceType: "LAB" }),
      event({ activityType: "POST", resourceType: "FORUM" }),
      event({ activityType: "COMMENT", resourceType: "FORUM" }),
    ]);
    expect(m.submissionCount).toBe(2);
    expect(m.quizSubmissionCount).toBe(1);
    expect(m.forumPosts).toBe(1);
  });

  it("averages quiz scores across QUIZ+SUBMIT events only", () => {
    const m = summariseWeek(1, [
      event({ activityType: "SUBMIT", resourceType: "QUIZ", quizScore: 80 }),
      event({ activityType: "SUBMIT", resourceType: "QUIZ", quizScore: 90 }),
      event({ activityType: "VIEW", resourceType: "QUIZ", quizScore: null }),
    ]);
    expect(m.averageQuizScore).toBe(85);
  });

  it("ignores quizScore on non-QUIZ-SUBMIT events", () => {
    // Defensive: even if a stray quizScore appears on a VIEW row it must not
    // pollute the average.
    const m = summariseWeek(1, [
      event({ activityType: "VIEW", resourceType: "QUIZ", quizScore: 50 }),
    ]);
    expect(m.averageQuizScore).toBeNull();
  });

  it("counts distinct resource types touched", () => {
    const m = summariseWeek(1, [
      event({ resourceType: "VIDEO" }),
      event({ resourceType: "VIDEO" }),
      event({ resourceType: "FORUM", activityType: "POST" }),
      event({ resourceType: "QUIZ", activityType: "SUBMIT", quizScore: 75 }),
    ]);
    expect(m.resourceTypeCount).toBe(3);
  });

  it("produces engagementScore within [0, 1]", () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      event({
        timestamp: new Date(`2026-01-1${2 + (i % 5)}T${10 + (i % 5)}:00:00Z`),
        durationSeconds: 800,
        resourceType: (["VIDEO", "READING", "QUIZ", "FORUM", "LAB"] as const)[i % 5]!,
      }),
    );
    const m = summariseWeek(1, events);
    expect(m.engagementScore).toBeGreaterThanOrEqual(0);
    expect(m.engagementScore).toBeLessThanOrEqual(1);
  });

  it("yields a higher engagementScore for broader, longer activity", () => {
    const sparse = summariseWeek(1, [event({ durationSeconds: 100 })]);
    const rich = summariseWeek(
      1,
      Array.from({ length: 20 }, (_, i) =>
        event({
          timestamp: new Date(`2026-01-1${2 + (i % 5)}T10:00:00Z`),
          durationSeconds: 800,
          resourceType: (["VIDEO", "READING", "QUIZ", "FORUM", "LAB"] as const)[i % 5]!,
        }),
      ),
    );
    expect(rich.engagementScore).toBeGreaterThan(sparse.engagementScore);
  });
});

describe("consistencyScore", () => {
  it("returns 1 with too few data points to vary", () => {
    expect(consistencyScore([])).toBe(1);
    expect(consistencyScore([0.5])).toBe(1);
  });

  it("returns 1 for a flat series", () => {
    expect(consistencyScore([0.5, 0.5, 0.5, 0.5])).toBe(1);
  });

  it("returns a low value for a swinging series", () => {
    const score = consistencyScore([0, 1, 0, 1, 0, 1]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.6);
  });

  it("returns 0 when the mean is zero", () => {
    expect(consistencyScore([0, 0, 0])).toBe(0);
  });
});

describe("trendSlope", () => {
  it("returns 0 for too few data points", () => {
    expect(trendSlope([])).toBe(0);
    expect(trendSlope([0.5])).toBe(0);
  });

  it("returns 0 for a flat series", () => {
    expect(trendSlope([0.5, 0.5, 0.5])).toBe(0);
  });

  it("returns a positive slope for an increasing series", () => {
    expect(trendSlope([0.1, 0.3, 0.5, 0.7, 0.9])).toBeGreaterThan(0);
  });

  it("returns a negative slope for a decreasing series", () => {
    expect(trendSlope([0.9, 0.7, 0.5, 0.3, 0.1])).toBeLessThan(0);
  });
});
