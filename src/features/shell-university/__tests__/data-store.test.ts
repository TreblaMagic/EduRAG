import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ShellStoreNotSeededError,
  buildEnvelope,
  isShellStoreSeeded,
  readShellEntity,
} from "../data-store";

const SCRATCH = resolve(tmpdir(), `shell-store-${process.pid}-${Date.now()}`);

beforeAll(() => {
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(
    resolve(SCRATCH, "students.json"),
    JSON.stringify([
      { student_id: "STU-A", given_name: "A", family_name: "B", program: "P", term: "T", prior_gpa: 3, enrollment_status: "active" },
    ]),
  );
  writeFileSync(resolve(SCRATCH, "courses.json"), JSON.stringify([]));
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe("data-store — seeded store", () => {
  it("isShellStoreSeeded returns true when students.json exists", () => {
    expect(isShellStoreSeeded(SCRATCH)).toBe(true);
  });

  it("readShellEntity returns the parsed array", () => {
    const rows = readShellEntity("students", SCRATCH);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.student_id).toBe("STU-A");
  });

  it("buildEnvelope wraps with a count + source + entity meta", () => {
    const env = buildEnvelope("students", SCRATCH);
    expect(env.data).toHaveLength(1);
    expect(env.meta.count).toBe(1);
    expect(env.meta.source).toBe("shell-university-mock");
    expect(env.meta.entity).toBe("students");
    expect(typeof env.meta.generated_at).toBe("string");
  });
});

describe("data-store — unseeded store", () => {
  const empty = resolve(tmpdir(), `shell-store-empty-${process.pid}-${Date.now()}`);
  beforeAll(() => mkdirSync(empty, { recursive: true }));
  afterAll(() => rmSync(empty, { recursive: true, force: true }));

  it("isShellStoreSeeded returns false when students.json is absent", () => {
    expect(isShellStoreSeeded(empty)).toBe(false);
  });

  it("readShellEntity throws ShellStoreNotSeededError", () => {
    expect(() => readShellEntity("students", empty)).toThrow(ShellStoreNotSeededError);
  });
});
