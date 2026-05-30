/**
 * Causal-engine queries.
 */

import type { PrismaClient } from "@prisma/client";

import type { CausalNode, ConfidenceLevel } from "@/features/causal-engine";

import { prisma as defaultPrisma } from "../../lib/db";
import { confidenceForRefutationJson } from "./shared";

export interface CausalEstimateRow {
  treatment: CausalNode;
  outcome: CausalNode;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  sampleSize: number;
  method: string;
  bootstrapIters: number;
  confidence: ConfidenceLevel;
  adjustmentSet: string[];
}

export async function getCausalEstimatesForCourse(
  courseCode: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<CausalEstimateRow[]> {
  const course = await prisma.course.findUnique({ where: { code: courseCode } });
  if (!course) return [];
  const rows = await prisma.causalEstimate.findMany({
    where: { courseId: course.id, outcome: "FinalGrade" },
    orderBy: { treatment: "asc" },
  });
  return rows.map((r) => ({
    treatment: r.treatment as CausalNode,
    outcome: r.outcome as CausalNode,
    estimate: r.estimate,
    ciLow: r.ciLow,
    ciHigh: r.ciHigh,
    ciLevel: r.ciLevel,
    sampleSize: r.sampleSize,
    method: r.method,
    bootstrapIters: r.bootstrapIters,
    confidence: confidenceForRefutationJson(r.refutationJson),
    adjustmentSet: parseAdjustmentSet(r.adjustmentSet),
  }));
}

function parseAdjustmentSet(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}
