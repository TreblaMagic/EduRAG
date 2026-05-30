import { describe, expect, it } from "vitest";

import {
  ShellSyncValidationError,
  assertEnvelope,
  mapAdvisorNote,
  mapCourse,
  mapEnrollment,
  mapGrade,
  mapLmsEvent,
  mapResource,
  mapStudent,
} from "../mapper";
import type {
  ShellAdvisorNote,
  ShellCourse,
  ShellEnrollment,
  ShellGrade,
  ShellLmsEvent,
  ShellResource,
  ShellStudent,
} from "@/features/shell-university/types";

describe("mapStudent", () => {
  it("lowercases the term to form cohort and preserves names + prior GPA", () => {
    const input: ShellStudent = {
      student_id: "STU-0001",
      given_name: "Alex",
      family_name: "Doe",
      program: "BSc CS",
      term: "2026-SPRING",
      prior_gpa: 3.2,
      enrollment_status: "active",
    };
    expect(mapStudent(input)).toEqual({
      externalId: "STU-0001",
      firstName: "Alex",
      lastName: "Doe",
      cohort: "2026-spring",
      priorGpa: 3.2,
    });
  });

  it("normalises empty name strings to null", () => {
    const input: ShellStudent = {
      student_id: "STU-0002",
      given_name: "",
      family_name: "",
      program: "BSc CS",
      term: "2026-SPRING",
      prior_gpa: 2.8,
      enrollment_status: "active",
    };
    const mapped = mapStudent(input);
    expect(mapped.firstName).toBeNull();
    expect(mapped.lastName).toBeNull();
  });
});

describe("mapCourse", () => {
  it("maps course_code/course_title/weeks", () => {
    const input: ShellCourse = {
      course_code: "CS-201",
      course_title: "Intro to DS",
      weeks: 14,
      term: "2026-SPRING",
    };
    expect(mapCourse(input)).toEqual({ code: "CS-201", title: "Intro to DS", weeks: 14 });
  });
});

describe("mapEnrollment", () => {
  it("parses the ISO timestamp into a Date", () => {
    const input: ShellEnrollment = {
      student_id: "STU-0001",
      course_code: "CS-201",
      enrolled_at: "2026-01-12T09:00:00.000Z",
    };
    const m = mapEnrollment(input);
    expect(m.studentExternalId).toBe("STU-0001");
    expect(m.courseCode).toBe("CS-201");
    expect(m.enrolledAt).toBeInstanceOf(Date);
    expect(m.enrolledAt.getUTCFullYear()).toBe(2026);
  });
});

describe("mapResource", () => {
  it("translates resource_kind to upper-case EduRAG vocabulary", () => {
    const input: ShellResource = {
      resource_id: "CS-201-VID-001",
      course_code: "CS-201",
      resource_kind: "video",
      title: "Video 1",
    };
    expect(mapResource(input).type).toBe("VIDEO");
  });
});

describe("mapLmsEvent", () => {
  it("translates action + resource_kind, preserves quiz score and week number", () => {
    const input: ShellLmsEvent = {
      event_id: "evt_1",
      learner_id: "STU-0001",
      course_code: "CS-201",
      resource_id: "CS-201-QUI-001",
      resource_kind: "quiz",
      action: "submitted",
      occurred_at: "2026-01-12T10:00:00.000Z",
      duration_seconds: 540,
      metadata: { week_number: 1, quiz_score: 87, is_forum_post: false },
    };
    const m = mapLmsEvent(input);
    expect(m.activityType).toBe("SUBMIT");
    expect(m.quizScore).toBe(87);
    expect(m.weekNumber).toBe(1);
    expect(m.timestamp).toBeInstanceOf(Date);
  });

  it("returns null quizScore when missing or non-numeric", () => {
    const base: ShellLmsEvent = {
      event_id: "evt_2",
      learner_id: "STU-0001",
      course_code: "CS-201",
      resource_id: "CS-201-VID-001",
      resource_kind: "video",
      action: "viewed",
      occurred_at: "2026-01-12T10:00:00.000Z",
      duration_seconds: 300,
      metadata: { week_number: 1, quiz_score: null, is_forum_post: false },
    };
    expect(mapLmsEvent(base).quizScore).toBeNull();
  });
});

describe("mapGrade", () => {
  it("passes through final_grade and letter", () => {
    const input: ShellGrade = {
      student_id: "STU-0001",
      course_code: "CS-201",
      final_grade: 78.5,
      letter: "B",
      recorded_at: "2026-04-22T09:00:00.000Z",
    };
    expect(mapGrade(input)).toEqual({
      studentExternalId: "STU-0001",
      courseCode: "CS-201",
      finalGrade: 78.5,
      letter: "B",
    });
  });
});

describe("mapAdvisorNote", () => {
  it("preserves the external note id and parses timestamps", () => {
    const input: ShellAdvisorNote = {
      note_id: "note_x",
      student_id: "STU-0001",
      course_code: "CS-201",
      note_text: "Check in next week",
      authored_by: "Dr. Lee",
      authored_at: "2026-02-20T09:00:00.000Z",
    };
    const m = mapAdvisorNote(input);
    expect(m.externalId).toBe("note_x");
    expect(m.courseCode).toBe("CS-201");
    expect(m.authoredAt).toBeInstanceOf(Date);
  });

  it("allows a null course_code", () => {
    const input: ShellAdvisorNote = {
      note_id: "note_y",
      student_id: "STU-0001",
      course_code: null,
      note_text: "General note",
      authored_by: "Dr. Lee",
      authored_at: "2026-02-20T09:00:00.000Z",
    };
    expect(mapAdvisorNote(input).courseCode).toBeNull();
  });
});

describe("assertEnvelope", () => {
  it("accepts a well-formed envelope", () => {
    expect(() =>
      assertEnvelope({ data: [], meta: { count: 0 } }, "students"),
    ).not.toThrow();
  });

  it("rejects a non-object payload", () => {
    expect(() => assertEnvelope("oops", "students")).toThrow(ShellSyncValidationError);
  });

  it("rejects a missing data array", () => {
    expect(() => assertEnvelope({ meta: {} }, "students")).toThrow(/data/);
  });

  it("rejects a missing meta object", () => {
    expect(() => assertEnvelope({ data: [] }, "students")).toThrow(/meta/);
  });
});
