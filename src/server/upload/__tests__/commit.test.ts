import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import type { ValidatedRow } from "@/server/ingest/row-schema";
import { commitUploadedRows } from "../commit";

/**
 * Build a syntactically-valid `ValidatedRow` cheaply — we don't care
 * about content, only count, because the only path under test is the
 * Phase 12C row-cap early-return. The Prisma client is intentionally
 * a bare object cast: the early-return must never touch it.
 */
function makeRow(i: number): ValidatedRow {
  return {
    studentId: `STU-${String(i).padStart(4, "0")}`,
    courseId: "CS-201",
    weekNumber: 1,
    resourceId: "CS-201-VID-001",
    resourceType: "VIDEO",
    activityType: "VIEW",
    timestamp: new Date("2026-01-12T09:00:00.000Z"),
    durationSeconds: 600,
    quizScore: null,
    forumPosts: 0,
    priorGpa: 3.0,
    finalGrade: 75,
  };
}

const NEVER_TOUCHED_PRISMA = {} as PrismaClient;

describe("commitUploadedRows hosted row-cap (Phase 12C)", () => {
  it("rejects uploads above the cap when DEMO_MODE=hosted", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => makeRow(i));
    const result = await commitUploadedRows(NEVER_TOUCHED_PRISMA, {
      filename: "huge.csv",
      byteSize: 1_234_567,
      rows,
      errors: [],
      options: {
        mode: "append",
        dryRun: false,
        rerunCausalEstimates: false,
        rerunInterventionSimulations: false,
      },
      hostedDemoOverride: true,
      rowCapOverride: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/row cap/i);
    expect(result.error).toMatch(/15/);
    expect(result.error).toMatch(/10/);
    expect(result.ingest).toBeNull();
    expect(result.syncLogId).toBeNull();
  });

  it("returns dry-run success when below the cap (cap branch not taken)", async () => {
    // Dry run skips every Prisma write. If the cap check were
    // (wrongly) triggered, we'd see a "row cap exceeded" error
    // instead of dryRun=true.
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i));
    const result = await commitUploadedRows(NEVER_TOUCHED_PRISMA, {
      filename: "ok.csv",
      byteSize: 1024,
      rows,
      errors: [],
      options: {
        mode: "append",
        dryRun: true,
        rerunCausalEstimates: false,
        rerunInterventionSimulations: false,
      },
      hostedDemoOverride: true,
      rowCapOverride: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.error).toBeNull();
  });

  it("ignores the cap entirely in local mode (dry-run success above cap)", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => makeRow(i));
    const result = await commitUploadedRows(NEVER_TOUCHED_PRISMA, {
      filename: "local.csv",
      byteSize: 1024,
      rows,
      errors: [],
      options: {
        mode: "append",
        dryRun: true,
        rerunCausalEstimates: false,
        rerunInterventionSimulations: false,
      },
      hostedDemoOverride: false,
      rowCapOverride: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.error).toBeNull();
  });
});
