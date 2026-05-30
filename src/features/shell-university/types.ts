/**
 * Shell University — typed API contracts.
 *
 * These shapes intentionally differ from EduRAG's internal Prisma models:
 *   - snake_case keys (REST/SIS convention).
 *   - Different action vocabulary (`viewed`/`submitted`/...) instead of EduRAG's
 *     enum-like upper case (`VIEW`/`SUBMIT`/...).
 *   - Names + program + status fields that EduRAG doesn't currently model.
 *   - An `AdvisorNote` entity EduRAG didn't have before this integration.
 *
 * Treating the boundary as a real cross-system contract gives the Phase 5.5
 * mapper meaningful translation work, and makes swapping in a real LMS
 * (Moodle / Canvas / Blackboard) later a matter of changing the client base
 * URL — not the downstream pipeline.
 */

export const SHELL_ENTITIES = [
  "students",
  "courses",
  "enrollments",
  "resources",
  "lms-events",
  "grades",
  "advisor-notes",
] as const;

export type ShellEntity = (typeof SHELL_ENTITIES)[number];

export interface ShellApiEnvelope<T> {
  data: T[];
  meta: {
    count: number;
    generated_at: string;
    source: "shell-university-mock";
    entity: ShellEntity;
  };
}

export type ShellResourceKind = "video" | "reading" | "quiz" | "forum" | "lab";
export type ShellAction =
  | "viewed"
  | "submitted"
  | "posted"
  | "commented"
  | "downloaded";
export type ShellEnrollmentStatus = "active" | "suspended" | "graduated";

export interface ShellStudent {
  student_id: string;
  given_name: string;
  family_name: string;
  program: string;
  term: string;
  prior_gpa: number;
  enrollment_status: ShellEnrollmentStatus;
}

export interface ShellCourse {
  course_code: string;
  course_title: string;
  weeks: number;
  term: string;
}

export interface ShellEnrollment {
  student_id: string;
  course_code: string;
  enrolled_at: string;
}

export interface ShellResource {
  resource_id: string;
  course_code: string;
  resource_kind: ShellResourceKind;
  title: string;
}

export interface ShellLmsEvent {
  event_id: string;
  learner_id: string;
  course_code: string;
  resource_id: string;
  resource_kind: ShellResourceKind;
  action: ShellAction;
  occurred_at: string;
  duration_seconds: number;
  metadata: {
    week_number: number;
    quiz_score: number | null;
    is_forum_post: boolean;
  };
}

export interface ShellGrade {
  student_id: string;
  course_code: string;
  final_grade: number;
  letter: string;
  recorded_at: string;
}

export interface ShellAdvisorNote {
  note_id: string;
  student_id: string;
  course_code: string | null;
  note_text: string;
  authored_by: string;
  authored_at: string;
}

export interface ShellHealth {
  status: "ok";
  service: "shell-university-mock";
  version: string;
  uptime_seconds: number;
  current_term: string;
}

export interface ShellSyncStatus {
  data_version: string;
  last_data_update: string;
  entity_counts: Record<ShellEntity, number>;
}

/** Map of entity name → its payload shape. Used to type the client + serve helpers. */
export interface ShellEntityShape {
  students: ShellStudent;
  courses: ShellCourse;
  enrollments: ShellEnrollment;
  resources: ShellResource;
  "lms-events": ShellLmsEvent;
  grades: ShellGrade;
  "advisor-notes": ShellAdvisorNote;
}
