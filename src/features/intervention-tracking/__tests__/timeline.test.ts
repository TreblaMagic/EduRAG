import { describe, expect, it } from "vitest";

import { buildTimelineEvents, mergeTimelines } from "../timeline";
import type { TimelineInput } from "../timeline";

function input(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    interventionName: "increase_resource_diversity",
    simulationGeneratedAt: "2026-05-28T08:00:00.000Z",
    decision: null,
    ...overrides,
  };
}

describe("buildTimelineEvents", () => {
  it("emits a single 'recommendation' event when no decision exists", () => {
    const events = buildTimelineEvents(input());
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("recommendation");
    expect(events[0]!.status).toBe("proposed");
  });

  it("appends a 'decision' event when the decision row exists", () => {
    const events = buildTimelineEvents(
      input({
        decision: {
          status: "accepted",
          advisorNote: null,
          followUpOutcome: null,
          followUpObserved: false,
          followUpRecordedAt: null,
          createdAt: "2026-05-28T09:00:00.000Z",
          updatedAt: "2026-05-28T09:00:00.000Z",
        },
      }),
    );
    expect(events.map((e) => e.kind)).toEqual(["recommendation", "decision"]);
    expect(events[1]!.label).toContain("accepted");
    expect(events[1]!.status).toBe("accepted");
  });

  it("emits a separate 'note' event when an advisor note is present", () => {
    const events = buildTimelineEvents(
      input({
        decision: {
          status: "deferred",
          advisorNote: "Try next semester after exams",
          followUpOutcome: null,
          followUpObserved: false,
          followUpRecordedAt: null,
          createdAt: "2026-05-28T09:00:00.000Z",
          updatedAt: "2026-05-28T09:30:00.000Z",
        },
      }),
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("note");
    const note = events.find((e) => e.kind === "note")!;
    expect(note.detail).toBe("Try next semester after exams");
  });

  it("emits a 'follow-up' event when followUpObserved is true", () => {
    const events = buildTimelineEvents(
      input({
        decision: {
          status: "completed",
          advisorNote: null,
          followUpOutcome: "Quiz average improved slightly over three weeks",
          followUpObserved: true,
          followUpRecordedAt: "2026-06-15T10:00:00.000Z",
          createdAt: "2026-05-28T09:00:00.000Z",
          updatedAt: "2026-06-15T10:00:00.000Z",
        },
      }),
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(["recommendation", "decision", "follow-up"]);
    expect(events.at(-1)!.detail).toContain("Quiz average");
  });

  it("orders events chronologically by `at` timestamp", () => {
    const events = buildTimelineEvents(
      input({
        decision: {
          status: "accepted",
          advisorNote: "Note",
          followUpOutcome: "Engagement steady",
          followUpObserved: true,
          followUpRecordedAt: "2026-06-15T10:00:00.000Z",
          createdAt: "2026-05-28T09:00:00.000Z",
          updatedAt: "2026-06-01T09:00:00.000Z",
        },
      }),
    );
    const timestamps = events.map((e) => Date.parse(e.at));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});

describe("mergeTimelines", () => {
  it("interleaves per-intervention timelines into one chronological feed", () => {
    const a = buildTimelineEvents(input({ interventionName: "A", simulationGeneratedAt: "2026-05-28T08:00:00.000Z" }));
    const b = buildTimelineEvents(
      input({
        interventionName: "B",
        simulationGeneratedAt: "2026-05-28T07:00:00.000Z",
        decision: {
          status: "rejected",
          advisorNote: null,
          followUpOutcome: null,
          followUpObserved: false,
          followUpRecordedAt: null,
          createdAt: "2026-05-29T08:00:00.000Z",
          updatedAt: "2026-05-29T08:00:00.000Z",
        },
      }),
    );
    const merged = mergeTimelines([a, b]);
    expect(merged.map((e) => e.interventionName)).toEqual(["B", "A", "B"]);
  });
});
