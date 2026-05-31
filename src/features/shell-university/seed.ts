/**
 * Shell University — JSON seed generator.
 *
 * Reads the synthetic CSV produced by `scripts/generate_synthetic_dataset.py`
 * and emits Shell-University-shaped JSON files under
 * `data/shell-university/`. The mock route handlers serve those files; the
 * sync layer fetches them (directly or over HTTP) and translates back to
 * EduRAG's Prisma shape.
 *
 * Determinism + drift:
 *   - `seed` controls per-row jitter for the simulated "alive" data
 *     (advisor notes + last-data-update timestamp + grade rounding).
 *   - Re-running with the same seed reproduces the same output.
 *   - Re-running with a different seed produces a small, realistic drift —
 *     used by the demo to show that re-syncing picks up changes.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "csv-parse/sync";

import type {
  ShellAdvisorNote,
  ShellCourse,
  ShellEnrollment,
  ShellEntity,
  ShellEntityShape,
  ShellGrade,
  ShellLmsEvent,
  ShellResource,
  ShellResourceKind,
  ShellStudent,
  ShellSyncStatus,
} from "./types";

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const DEFAULT_CSV_PATH = resolve(PROJECT_ROOT, "data", "raw", "sample_lms_data.csv");
export const SHELL_DATA_DIR = resolve(PROJECT_ROOT, "data", "shell-university");

const RESOURCE_KIND_MAP: Record<string, ShellResourceKind> = {
  VIDEO: "video",
  READING: "reading",
  QUIZ: "quiz",
  FORUM: "forum",
  LAB: "lab",
};

const ACTION_MAP: Record<string, "viewed" | "submitted" | "posted" | "commented" | "downloaded"> = {
  VIEW: "viewed",
  SUBMIT: "submitted",
  POST: "posted",
  COMMENT: "commented",
  DOWNLOAD: "downloaded",
};

// Small pools so different students get different (deterministic) names.
const GIVEN_NAMES = [
  "Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Drew",
  "Cameron", "Quinn", "Avery", "Jamie", "Robin", "Sage", "Reese",
] as const;
const FAMILY_NAMES = [
  "Doe", "Patel", "Nguyen", "Garcia", "Müller", "Rossi", "Tanaka", "Kim",
  "Okafor", "Silva", "Andersen", "Chen", "Khan", "Singh", "Hassan",
] as const;
const PROGRAMS = [
  "BSc Computer Science", "BSc Data Science", "BSc Information Systems",
] as const;
const ADVISORS = ["Dr. Lee", "Dr. Hayes", "Prof. Okonkwo", "Dr. Reyes"] as const;

interface SeedOptions {
  csvPath?: string;
  outDir?: string;
  seed?: number;
  termLabel?: string;
  /** Skip ~`eventDropFraction` of events to simulate light realistic drift. */
  eventDropFraction?: number;
}

export interface SeedResult {
  outDir: string;
  seed: number;
  termLabel: string;
  dataVersion: string;
  generatedAt: string;
  counts: Record<ShellEntity, number>;
  files: Record<ShellEntity | "_health" | "_sync-status", string>;
}

export function seedShellUniversity(options: SeedOptions = {}): SeedResult {
  const csvPath = options.csvPath ?? DEFAULT_CSV_PATH;
  const outDir = options.outDir ?? SHELL_DATA_DIR;
  const seed = options.seed ?? 42;
  const termLabel = options.termLabel ?? "2026-SPRING";
  const eventDropFraction = options.eventDropFraction ?? 0;
  const generatedAt = new Date().toISOString();
  const dataVersion = `v${Math.floor(Date.now() / 1000)}-s${seed}`;

  const buffer = readFileSync(csvPath);
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
  if (rows.length === 0) throw new Error(`CSV ${csvPath} is empty`);

  // -------- Reduce per-student & per-course --------------------------------
  const studentMap = new Map<string, { priorGpa: number; finalGrade: number }>();
  const courseMap = new Map<string, { weeks: number }>();
  const resourceMap = new Map<string, { courseCode: string; type: string }>();
  for (const r of rows) {
    if (!studentMap.has(r.student_id!)) {
      studentMap.set(r.student_id!, {
        priorGpa: Number(r.prior_gpa),
        finalGrade: Number(r.final_grade),
      });
    }
    const week = Number(r.week_number);
    const prev = courseMap.get(r.course_id!)?.weeks ?? 0;
    if (week > prev) courseMap.set(r.course_id!, { weeks: week });
    if (!resourceMap.has(r.resource_id!)) {
      resourceMap.set(r.resource_id!, { courseCode: r.course_id!, type: r.resource_type! });
    }
  }

  // -------- Build shell entities -------------------------------------------
  const rng = mulberry32(seed);

  const students: ShellStudent[] = [...studentMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([studentId, { priorGpa }]) => ({
      student_id: studentId,
      given_name: pick(GIVEN_NAMES, rng),
      family_name: pick(FAMILY_NAMES, rng),
      program: pick(PROGRAMS, rng),
      term: termLabel,
      prior_gpa: round2(priorGpa),
      enrollment_status: "active",
    }));

  const courses: ShellCourse[] = [...courseMap.entries()].map(([code, { weeks }]) => ({
    course_code: code,
    course_title: titleForCourse(code),
    weeks,
    term: termLabel,
  }));

  const enrollments: ShellEnrollment[] = students.map((s) => ({
    student_id: s.student_id,
    course_code: courses[0]?.course_code ?? "CS-201",
    enrolled_at: shiftDate(termLabel, 0),
  }));

  const resources: ShellResource[] = [...resourceMap.entries()].map(([id, { courseCode, type }]) => ({
    resource_id: id,
    course_code: courseCode,
    resource_kind: RESOURCE_KIND_MAP[type] ?? "reading",
    title: `${type[0]}${type.slice(1).toLowerCase()} — ${id}`,
  }));

  // -------- LMS events (one per CSV row, with optional drift) ---------------
  const events: ShellLmsEvent[] = [];
  for (const r of rows) {
    if (eventDropFraction > 0 && rng() < eventDropFraction) continue;
    const week = Number(r.week_number);
    const score = r.quiz_score !== "" ? Number(r.quiz_score) : null;
    events.push({
      event_id: `evt_${r.student_id!.replace(/-/g, "")}_w${week}_${events.length}`,
      learner_id: r.student_id!,
      course_code: r.course_id!,
      resource_id: r.resource_id!,
      resource_kind: RESOURCE_KIND_MAP[r.resource_type!] ?? "reading",
      action: ACTION_MAP[r.activity_type!] ?? "viewed",
      occurred_at: r.timestamp!,
      duration_seconds: Number(r.duration_seconds),
      metadata: {
        week_number: week,
        quiz_score: score,
        is_forum_post: r.resource_type === "FORUM" && r.activity_type === "POST",
      },
    });
  }

  // -------- Grades ----------------------------------------------------------
  const grades: ShellGrade[] = [...studentMap.entries()].map(([studentId, { finalGrade }]) => ({
    student_id: studentId,
    course_code: courses[0]?.course_code ?? "CS-201",
    final_grade: round2(finalGrade),
    letter: letterFor(finalGrade),
    recorded_at: shiftDate(termLabel, 100),
  }));

  // -------- Advisor notes (one per ~12 students; the new entity) -----------
  const advisorNotes: ShellAdvisorNote[] = [];
  for (const s of students) {
    if (rng() > 0.08) continue; // ~8% of students get a note
    const advisor = pick(ADVISORS, rng);
    const grade = grades.find((g) => g.student_id === s.student_id)?.final_grade ?? 70;
    const tone =
      grade < 55
        ? "Recommended a study-skills check-in given recent assessment trajectory."
        : grade < 70
          ? "Discussed pacing and forum participation; student receptive."
          : "Student on track; encouraged stretch material in weeks 10-14.";
    advisorNotes.push({
      note_id: `note_${s.student_id.replace(/-/g, "")}_${advisorNotes.length}`,
      student_id: s.student_id,
      course_code: courses[0]?.course_code ?? null,
      note_text: tone,
      authored_by: advisor,
      authored_at: shiftDate(termLabel, 40 + Math.floor(rng() * 60)),
    });
  }

  // -------- Write files ----------------------------------------------------
  mkdirSync(outDir, { recursive: true });
  const counts: Record<ShellEntity, number> = {
    students: students.length,
    courses: courses.length,
    enrollments: enrollments.length,
    resources: resources.length,
    "lms-events": events.length,
    grades: grades.length,
    "advisor-notes": advisorNotes.length,
  };

  const files: SeedResult["files"] = {
    students: writeEntity(outDir, "students", students),
    courses: writeEntity(outDir, "courses", courses),
    enrollments: writeEntity(outDir, "enrollments", enrollments),
    resources: writeEntity(outDir, "resources", resources),
    // Phase 12B: lms-events scales with the cohort × weeks; pretty-printing
    // it pushes the file past Vercel's recommended bundle-asset size for
    // committed seeds. Write it compactly. The small files stay indented
    // so diffs on regeneration remain reviewable.
    "lms-events": writeEntity(outDir, "lms-events", events, { compact: true }),
    grades: writeEntity(outDir, "grades", grades),
    "advisor-notes": writeEntity(outDir, "advisor-notes", advisorNotes),
    _health: writeJson(outDir, "_health.json", {
      status: "ok",
      service: "shell-university-mock",
      version: dataVersion,
      uptime_seconds: 0,
      current_term: termLabel,
    }),
    "_sync-status": writeJson<ShellSyncStatus>(outDir, "_sync-status.json", {
      data_version: dataVersion,
      last_data_update: generatedAt,
      entity_counts: counts,
    }),
  };

  return { outDir, seed, termLabel, dataVersion, generatedAt, counts, files };
}

// ---- helpers ---------------------------------------------------------------

function writeEntity<K extends ShellEntity>(
  dir: string,
  entity: K,
  data: ShellEntityShape[K][],
  options: { compact?: boolean } = {},
): string {
  return writeJson(dir, `${entity}.json`, data, options);
}

function writeJson<T>(
  dir: string,
  filename: string,
  data: T,
  options: { compact?: boolean } = {},
): string {
  const path = resolve(dir, filename);
  mkdirSync(dirname(path), { recursive: true });
  const body = options.compact
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  writeFileSync(path, body);
  return path;
}

function titleForCourse(code: string): string {
  // Demo-friendly fallback; the CSV doesn't carry a title.
  const titles: Record<string, string> = {
    "CS-201": "Introduction to Data Structures",
  };
  return titles[code] ?? code;
}

function letterFor(grade: number): string {
  if (grade >= 85) return "A";
  if (grade >= 70) return "B";
  if (grade >= 55) return "C";
  if (grade >= 40) return "D";
  return "F";
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function shiftDate(termLabel: string, daysOffset: number): string {
  // term like "2026-SPRING" → anchor at 2026-01-12 (mirrors generator).
  const [yearStr] = termLabel.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 12, 9, 0, 0));
  start.setUTCDate(start.getUTCDate() + daysOffset);
  return start.toISOString();
}

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)]!;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
