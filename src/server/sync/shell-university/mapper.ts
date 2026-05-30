/**
 * Shell University → EduRAG Prisma shape translation.
 *
 * Pure functions. The sync orchestrator calls these per-record before
 * upserting; tests cover every transformation explicitly so a future
 * Shell University schema change can't silently corrupt EduRAG data.
 */

import type {
  ShellAction,
  ShellAdvisorNote,
  ShellCourse,
  ShellEnrollment,
  ShellGrade,
  ShellLmsEvent,
  ShellResource,
  ShellResourceKind,
  ShellStudent,
} from "@/features/shell-university/types";

// ---- Vocabulary maps -------------------------------------------------------

const RESOURCE_TYPE_MAP: Record<ShellResourceKind, string> = {
  video: "VIDEO",
  reading: "READING",
  quiz: "QUIZ",
  forum: "FORUM",
  lab: "LAB",
};

const ACTIVITY_TYPE_MAP: Record<ShellAction, string> = {
  viewed: "VIEW",
  submitted: "SUBMIT",
  posted: "POST",
  commented: "COMMENT",
  downloaded: "DOWNLOAD",
};

// ---- Translation types -----------------------------------------------------

export interface MappedStudent {
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  cohort: string;
  priorGpa: number;
}

export interface MappedCourse {
  code: string;
  title: string;
  weeks: number;
}

export interface MappedEnrollment {
  studentExternalId: string;
  courseCode: string;
  enrolledAt: Date;
}

export interface MappedResource {
  externalId: string;
  courseCode: string;
  type: string;
  title: string;
}

export interface MappedActivityLog {
  externalEventId: string;
  studentExternalId: string;
  courseCode: string;
  resourceExternalId: string;
  activityType: string;
  timestamp: Date;
  durationSeconds: number;
  weekNumber: number;
  quizScore: number | null;
}

export interface MappedGrade {
  studentExternalId: string;
  courseCode: string;
  finalGrade: number;
  letter: string;
}

export interface MappedAdvisorNote {
  externalId: string;
  studentExternalId: string;
  courseCode: string | null;
  noteText: string;
  authoredBy: string;
  authoredAt: Date;
}

// ---- Mappers ---------------------------------------------------------------

export function mapStudent(s: ShellStudent): MappedStudent {
  return {
    externalId: s.student_id,
    firstName: s.given_name || null,
    lastName: s.family_name || null,
    cohort: s.term.toLowerCase(),
    priorGpa: s.prior_gpa,
  };
}

export function mapCourse(c: ShellCourse): MappedCourse {
  return {
    code: c.course_code,
    title: c.course_title,
    weeks: c.weeks,
  };
}

export function mapEnrollment(e: ShellEnrollment): MappedEnrollment {
  return {
    studentExternalId: e.student_id,
    courseCode: e.course_code,
    enrolledAt: new Date(e.enrolled_at),
  };
}

export function mapResource(r: ShellResource): MappedResource {
  return {
    externalId: r.resource_id,
    courseCode: r.course_code,
    type: RESOURCE_TYPE_MAP[r.resource_kind],
    title: r.title,
  };
}

export function mapLmsEvent(e: ShellLmsEvent): MappedActivityLog {
  const score = e.metadata?.quiz_score ?? null;
  return {
    externalEventId: e.event_id,
    studentExternalId: e.learner_id,
    courseCode: e.course_code,
    resourceExternalId: e.resource_id,
    activityType: ACTIVITY_TYPE_MAP[e.action],
    timestamp: new Date(e.occurred_at),
    durationSeconds: e.duration_seconds,
    weekNumber: e.metadata.week_number,
    quizScore: typeof score === "number" ? score : null,
  };
}

export function mapGrade(g: ShellGrade): MappedGrade {
  return {
    studentExternalId: g.student_id,
    courseCode: g.course_code,
    finalGrade: g.final_grade,
    letter: g.letter,
  };
}

export function mapAdvisorNote(n: ShellAdvisorNote): MappedAdvisorNote {
  return {
    externalId: n.note_id,
    studentExternalId: n.student_id,
    courseCode: n.course_code,
    noteText: n.note_text,
    authoredBy: n.authored_by,
    authoredAt: new Date(n.authored_at),
  };
}

// ---- Envelope validation ---------------------------------------------------

/** Defensive envelope check — throws on malformed payloads from the source. */
export function assertEnvelope(payload: unknown, entity: string): void {
  if (typeof payload !== "object" || payload === null) {
    throw new ShellSyncValidationError(entity, "payload is not an object");
  }
  const p = payload as { data?: unknown; meta?: unknown };
  if (!Array.isArray(p.data)) {
    throw new ShellSyncValidationError(entity, "`data` is not an array");
  }
  if (typeof p.meta !== "object" || p.meta === null) {
    throw new ShellSyncValidationError(entity, "`meta` is missing or not an object");
  }
}

export class ShellSyncValidationError extends Error {
  constructor(public readonly entity: string, reason: string) {
    super(`shell-university envelope invalid for ${entity}: ${reason}`);
    this.name = "ShellSyncValidationError";
  }
}
