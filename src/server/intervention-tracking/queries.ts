/**
 * Phase 11 — read helpers for the intervention-tracking layer.
 *
 * `getDecisionsForStudent` returns a `Map<interventionSimulationId,
 * InterventionDecisionView>` so the student page can pair each ranked
 * card with its persisted decision without an N+1 query.
 *
 * `getCohortAnalytics` returns an `InterventionAnalytics` payload for
 * the new `/interventions` page.
 *
 * `getRecentDecisions` returns the latest decisions across the cohort
 * for the activity feed.
 */

import type { PrismaClient } from "@prisma/client";

import {
  buildTimelineEvents,
  computeAnalytics,
  mergeTimelines,
  type AnalyticsInput,
  type DecisionRow,
  type DecisionStatus,
  type InterventionAnalytics,
  type InterventionDecisionView,
  type TimelineEvent,
  type TimelineInput,
} from "@/features/intervention-tracking";
import { prisma as defaultPrisma } from "@/lib/db";

export async function getDecisionsForStudent(
  studentId: string,
  courseId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<Map<string, InterventionDecisionView>> {
  const rows = await prisma.interventionDecision.findMany({
    where: { studentId, courseId },
  });
  return new Map(
    rows.map((row) => [
      row.interventionSimulationId,
      decisionRowToView(row),
    ]),
  );
}

export async function getInterventionTimelineForStudent(
  studentId: string,
  courseId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<TimelineEvent[]> {
  const sims = await prisma.interventionSimulation.findMany({
    where: { studentId, courseId },
    include: { decision: true },
    orderBy: { generatedAt: "asc" },
  });

  const perInterventionTimelines = sims.map((sim) => {
    const input: TimelineInput = {
      interventionName: sim.interventionName,
      simulationGeneratedAt: sim.generatedAt.toISOString(),
      decision: sim.decision
        ? {
            status: sim.decision.status as DecisionStatus,
            advisorNote: sim.decision.advisorNote,
            followUpOutcome: sim.decision.followUpOutcome,
            followUpObserved: sim.decision.followUpObserved,
            followUpRecordedAt: sim.decision.followUpRecordedAt
              ? sim.decision.followUpRecordedAt.toISOString()
              : null,
            createdAt: sim.decision.createdAt.toISOString(),
            updatedAt: sim.decision.updatedAt.toISOString(),
          }
        : null,
    };
    return buildTimelineEvents(input);
  });

  return mergeTimelines(perInterventionTimelines);
}

export interface RecentDecisionView {
  decisionId: string;
  studentExternalId: string;
  courseCode: string;
  interventionName: string;
  treatment: string;
  status: DecisionStatus;
  advisorNote: string | null;
  followUpObserved: boolean;
  updatedAt: string;
}

export async function getRecentDecisions(
  prisma: PrismaClient = defaultPrisma,
  limit = 10,
): Promise<RecentDecisionView[]> {
  const rows = await prisma.interventionDecision.findMany({
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      student: { select: { externalId: true } },
      course: { select: { code: true } },
      interventionSimulation: {
        select: { interventionName: true, treatment: true },
      },
    },
  });
  return rows.map((row) => ({
    decisionId: row.id,
    studentExternalId: row.student.externalId,
    courseCode: row.course.code,
    interventionName: row.interventionSimulation.interventionName,
    treatment: row.interventionSimulation.treatment,
    status: row.status as DecisionStatus,
    advisorNote: row.advisorNote,
    followUpObserved: row.followUpObserved,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getCohortAnalytics(
  prisma: PrismaClient = defaultPrisma,
): Promise<InterventionAnalytics> {
  const [totalRecommendations, decisionRows] = await Promise.all([
    prisma.interventionSimulation.count(),
    prisma.interventionDecision.findMany({
      include: {
        interventionSimulation: {
          select: { interventionName: true, treatment: true },
        },
      },
    }),
  ]);

  const decisions: DecisionRow[] = decisionRows.map((row) => ({
    interventionName: row.interventionSimulation.interventionName,
    status: row.status as DecisionRow["status"],
    followUpObserved: row.followUpObserved,
    followUpOutcome: row.followUpOutcome,
    treatment: row.interventionSimulation.treatment,
  }));

  const input: AnalyticsInput = { totalRecommendations, decisions };
  return computeAnalytics(input);
}

// ---- helpers --------------------------------------------------------------

function decisionRowToView(row: {
  id: string;
  interventionSimulationId: string;
  status: string;
  advisorNote: string | null;
  followUpOutcome: string | null;
  followUpObserved: boolean;
  followUpRecordedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): InterventionDecisionView {
  return {
    id: row.id,
    interventionSimulationId: row.interventionSimulationId,
    status: row.status as DecisionStatus,
    advisorNote: row.advisorNote,
    followUpOutcome: row.followUpOutcome,
    followUpObserved: row.followUpObserved,
    followUpRecordedAt: row.followUpRecordedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
