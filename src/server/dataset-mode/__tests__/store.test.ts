import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { normaliseState, readState, statePathFor, writeState } from "../store";

const DEFAULT = {
  activeMode: "synthetic",
  switchedAt: "1970-01-01T00:00:00.000Z",
  reason: "Default — no explicit selection made yet.",
};

describe("normaliseState", () => {
  it("returns the default when input is null or empty", () => {
    expect(normaliseState(null)).toEqual(DEFAULT);
    expect(normaliseState(undefined)).toEqual(DEFAULT);
    expect(normaliseState({} as never)).toEqual(DEFAULT);
  });

  it("preserves valid inputs verbatim", () => {
    const valid = {
      activeMode: "uploaded" as const,
      switchedAt: "2026-05-28T10:00:00.000Z",
      reason: "demo run",
    };
    expect(normaliseState(valid)).toEqual(valid);
  });

  it("replaces an invalid mode with the default", () => {
    const out = normaliseState({
      activeMode: "not-a-mode" as never,
      switchedAt: "2026-05-28T10:00:00.000Z",
      reason: "x",
    });
    expect(out.activeMode).toBe(DEFAULT.activeMode);
    expect(out.switchedAt).toBe("2026-05-28T10:00:00.000Z");
    expect(out.reason).toBe("x");
  });

  it("replaces an invalid timestamp with the default", () => {
    const out = normaliseState({
      activeMode: "uploaded",
      switchedAt: "not-a-date" as never,
      reason: null,
    });
    expect(out.switchedAt).toBe(DEFAULT.switchedAt);
  });

  it("accepts null reason but coerces other invalid types", () => {
    expect(normaliseState({ activeMode: "synthetic", switchedAt: DEFAULT.switchedAt, reason: null }).reason).toBe(null);
    expect(normaliseState({ activeMode: "synthetic", switchedAt: DEFAULT.switchedAt, reason: 42 as never }).reason).toBe(DEFAULT.reason);
  });
});

describe("statePathFor", () => {
  it("defaults to data/processed/dataset-mode.json under the cwd", () => {
    const path = statePathFor();
    expect(path).toBe(resolve(process.cwd(), "data", "processed", "dataset-mode.json"));
  });

  it("honours an explicit path override", () => {
    const explicit = "/tmp/edurag-test/state.json";
    expect(statePathFor({ path: explicit })).toBe(explicit);
  });
});

describe("readState / writeState round-trip (filesystem)", () => {
  let tmpDir: string;
  let tmpPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "edurag-mode-"));
    tmpPath = join(tmpDir, "dataset-mode.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the default when the file is missing", () => {
    expect(readState({ path: tmpPath })).toEqual(DEFAULT);
  });

  it("round-trips a written state", () => {
    writeState(
      {
        activeMode: "shell-university",
        switchedAt: "2026-05-28T12:00:00.000Z",
        reason: "syncing the LMS demo",
      },
      { path: tmpPath },
    );
    expect(existsSync(tmpPath)).toBe(true);
    const out = readState({ path: tmpPath });
    expect(out.activeMode).toBe("shell-university");
    expect(out.switchedAt).toBe("2026-05-28T12:00:00.000Z");
    expect(out.reason).toBe("syncing the LMS demo");
  });

  it("recovers gracefully from a corrupted file", () => {
    writeFileSync(tmpPath, "{ not valid json", "utf8");
    expect(readState({ path: tmpPath })).toEqual(DEFAULT);
  });

  it("recovers gracefully from a file containing an unknown mode", () => {
    writeFileSync(
      tmpPath,
      JSON.stringify({ activeMode: "telepathy", switchedAt: "2026-01-01", reason: "x" }),
      "utf8",
    );
    const out = readState({ path: tmpPath });
    expect(out.activeMode).toBe(DEFAULT.activeMode);
  });
});
