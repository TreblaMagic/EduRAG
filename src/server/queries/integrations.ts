/**
 * Read helpers powering the `/integrations/shell-university` page.
 */

import { prisma } from "@/lib/db";
import {
  isShellStoreSeeded,
  readShellHealth,
  readShellSyncStatus,
} from "@/features/shell-university/data-store";
import {
  SHELL_ENTITIES,
  type ShellEntity,
  type ShellHealth,
  type ShellSyncStatus,
} from "@/features/shell-university/types";

export type DataSourceLabel = "Shell University API" | "Synthetic CSV" | "Uploaded CSV" | "Unknown";

export interface SyncLogView {
  id: string;
  source: string;
  status: "success" | "partial" | "failed";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  scope: string[];
  summary: Record<string, { fetched: number; upserted: number; errors: number }>;
  message: string | null;
}

export interface ShellMockState {
  seeded: boolean;
  health: ShellHealth | null;
  syncStatus: ShellSyncStatus | null;
}

export interface IntegrationsPageData {
  currentSource: DataSourceLabel;
  mock: ShellMockState;
  recentSyncs: SyncLogView[];
  totalSyncs: number;
  prismaCounts: {
    students: number;
    courses: number;
    activityLogs: number;
    grades: number;
    advisorNotes: number;
  };
  endpoints: Array<{ path: string; entity: ShellEntity | "health" | "sync-status"; description: string }>;
}

const SOURCE_LABELS: Record<string, DataSourceLabel> = {
  "shell-university": "Shell University API",
  csv: "Synthetic CSV",
  uploaded: "Uploaded CSV",
};

export function classifyDataSource(latestSyncSource: string | null, hasPrismaData: boolean): DataSourceLabel {
  if (latestSyncSource && SOURCE_LABELS[latestSyncSource]) return SOURCE_LABELS[latestSyncSource]!;
  if (hasPrismaData) return "Synthetic CSV";
  return "Unknown";
}

function parseScope(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseSummary(s: string): Record<string, { fetched: number; upserted: number; errors: number }> {
  try {
    const parsed = JSON.parse(s) as Record<string, { fetched?: number; upserted?: number; errors?: number }>;
    const out: Record<string, { fetched: number; upserted: number; errors: number }> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      out[k] = {
        fetched: Number(v.fetched ?? 0),
        upserted: Number(v.upserted ?? 0),
        errors: Number(v.errors ?? 0),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function toView(row: Awaited<ReturnType<typeof prisma.syncLog.findMany>>[number]): SyncLogView {
  return {
    id: row.id,
    source: row.source,
    status: (row.status as SyncLogView["status"]) ?? "failed",
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    scope: parseScope(row.scopeJson),
    summary: parseSummary(row.summaryJson),
    message: row.message,
  };
}

export async function getIntegrationsPageData(): Promise<IntegrationsPageData> {
  const [recentRows, totalSyncs, latest, studentsCount, coursesCount, activityCount, gradeCount, advisorNoteCount] =
    await Promise.all([
      prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
      prisma.syncLog.count(),
      prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.student.count(),
      prisma.course.count(),
      prisma.activityLog.count(),
      prisma.grade.count(),
      prisma.advisorNote.count(),
    ]);

  const hasPrismaData = studentsCount > 0 && activityCount > 0;
  const currentSource = classifyDataSource(latest?.source ?? null, hasPrismaData);

  const seeded = isShellStoreSeeded();
  const mock: ShellMockState = {
    seeded,
    health: seeded ? safeRead(() => readShellHealth()) : null,
    syncStatus: seeded ? safeRead(() => readShellSyncStatus()) : null,
  };

  return {
    currentSource,
    mock,
    recentSyncs: recentRows.map(toView),
    totalSyncs,
    prismaCounts: {
      students: studentsCount,
      courses: coursesCount,
      activityLogs: activityCount,
      grades: gradeCount,
      advisorNotes: advisorNoteCount,
    },
    endpoints: [
      { path: "/api/shell-university/health", entity: "health", description: "Service liveness + current term + data version." },
      { path: "/api/shell-university/sync-status", entity: "sync-status", description: "Last data update timestamp + per-entity counts." },
      ...SHELL_ENTITIES.map((e) => ({
        path: `/api/shell-university/${e}`,
        entity: e,
        description: descriptionFor(e),
      })),
    ],
  };
}

function descriptionFor(entity: ShellEntity): string {
  switch (entity) {
    case "students": return "Students with names, program, term, prior GPA, and enrollment status.";
    case "courses": return "Course offerings (code, title, weeks, term).";
    case "enrollments": return "Student × course bridge with enrollment timestamps.";
    case "resources": return "Learning resources (videos, readings, quizzes, forums, labs).";
    case "lms-events": return "Raw LMS activity events (atomic learner actions).";
    case "grades": return "Final grades per student × course.";
    case "advisor-notes": return "Free-text observations advisors wrote about students.";
  }
}

function safeRead<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
