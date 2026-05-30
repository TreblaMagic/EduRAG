import { describe, expect, it, vi } from "vitest";

import { clearDecision, recordDecision, recordFollowUp } from "../decisions";

/**
 * The decisions orchestrator talks to Prisma via the typed client. The
 * tests here mock the small slice of the client we actually use so we
 * can exercise validation + the upsert/update shape without needing a
 * real database.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const sim = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === "sim-known"
        ? { id: where.id, studentId: "stu-1", courseId: "cou-1" }
        : null,
    ),
  };
  const decision = {
    upsert: vi.fn(async ({ where, create, update }: { where: { interventionSimulationId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => ({
      id: "dec-1",
      interventionSimulationId: where.interventionSimulationId,
      ...create,
      ...update,
    })),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      status: "accepted",
      ...data,
    })),
    delete: vi.fn(async () => ({})),
  };
  return {
    interventionSimulation: sim,
    interventionDecision: decision,
    ...overrides,
  } as never;
}

describe("recordDecision", () => {
  it("rejects unsupported statuses", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-known",
      status: "proposed" as never,
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported decision status");
  });

  it("rejects unknown simulation ids", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-missing",
      status: "accepted",
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects banned language in advisor notes", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-known",
      status: "accepted",
      advisorNote: "This is guaranteed to work for the student",
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("banned phrase");
    expect(result.error).toContain("guaranteed");
  });

  it("rejects advisor notes longer than 500 chars", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-known",
      status: "accepted",
      advisorNote: "x".repeat(501),
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("exceeds 500 characters");
  });

  it("persists a valid decision and returns the new row id", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-known",
      status: "accepted",
      advisorNote: " Student agreed to try the new schedule ",
      prisma,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("accepted");
    const decisionCall = (prisma as never as { interventionDecision: { upsert: ReturnType<typeof vi.fn> } }).interventionDecision.upsert.mock.calls[0]![0]!;
    expect(decisionCall.create.advisorNote).toBe("Student agreed to try the new schedule");
    expect(decisionCall.create.studentId).toBe("stu-1");
    expect(decisionCall.create.courseId).toBe("cou-1");
  });

  it("accepts a null advisor note as the empty string equivalent", async () => {
    const prisma = makePrisma();
    const result = await recordDecision({
      interventionSimulationId: "sim-known",
      status: "rejected",
      advisorNote: null,
      prisma,
    });
    expect(result.ok).toBe(true);
    const decisionCall = (prisma as never as { interventionDecision: { upsert: ReturnType<typeof vi.fn> } }).interventionDecision.upsert.mock.calls[0]![0]!;
    expect(decisionCall.create.advisorNote).toBe(null);
  });
});

describe("recordFollowUp", () => {
  it("rejects when no decision exists yet", async () => {
    const prisma = makePrisma();
    const result = await recordFollowUp({
      interventionSimulationId: "sim-no-decision",
      followUpOutcome: "Engagement steady",
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No decision exists yet");
  });

  it("rejects banned language in the follow-up text", async () => {
    const prisma = makePrisma({
      interventionDecision: {
        findUnique: vi.fn(async () => ({
          id: "dec-1",
          status: "accepted",
        })),
        update: vi.fn(),
      },
    });
    const result = await recordFollowUp({
      interventionSimulationId: "sim-known",
      followUpOutcome: "Confirms causation in this case",
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("banned phrase");
  });

  it("rejects follow-ups for non-accepted / non-completed decisions", async () => {
    const prisma = makePrisma({
      interventionDecision: {
        findUnique: vi.fn(async () => ({
          id: "dec-1",
          status: "deferred",
        })),
        update: vi.fn(),
      },
    });
    const result = await recordFollowUp({
      interventionSimulationId: "sim-known",
      followUpOutcome: "Engagement steady",
      prisma,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("can only be recorded");
  });

  it("persists an observational follow-up for an accepted decision", async () => {
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "dec-1",
      status: "accepted",
      ...data,
    }));
    const prisma = makePrisma({
      interventionDecision: {
        findUnique: vi.fn(async () => ({ id: "dec-1", status: "accepted" })),
        update,
      },
    });
    const result = await recordFollowUp({
      interventionSimulationId: "sim-known",
      followUpOutcome: "Quiz scores improved slightly",
      prisma,
    });
    expect(result.ok).toBe(true);
    const data = update.mock.calls[0]![0]!.data;
    expect(data.followUpOutcome).toBe("Quiz scores improved slightly");
    expect(data.followUpObserved).toBe(true);
    expect(data.followUpRecordedAt).toBeInstanceOf(Date);
  });
});

describe("clearDecision", () => {
  it("succeeds even when the row is already absent (idempotent)", async () => {
    const prisma = makePrisma({
      interventionDecision: {
        delete: vi.fn(async () => {
          throw new Error("not found");
        }),
      },
    });
    const result = await clearDecision("sim-known", prisma);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("proposed");
  });
});
