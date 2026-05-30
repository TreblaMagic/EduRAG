import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getActiveDatasetMode, setActiveDatasetMode } from "../orchestrator";
import { readState } from "../store";

describe("setActiveDatasetMode + getActiveDatasetMode", () => {
  let tmpDir: string;
  let tmpPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "edurag-orch-"));
    tmpPath = join(tmpDir, "dataset-mode.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists the chosen mode and surfaces it via getActiveDatasetMode", async () => {
    setActiveDatasetMode("uploaded", "test reason", { path: tmpPath });
    expect(await getActiveDatasetMode({ path: tmpPath })).toBe("uploaded");
    const persisted = readState({ path: tmpPath });
    expect(persisted.activeMode).toBe("uploaded");
    expect(persisted.reason).toBe("test reason");
    expect(Date.parse(persisted.switchedAt)).not.toBeNaN();
  });

  it("falls back to the default mode when no state file exists", async () => {
    expect(await getActiveDatasetMode({ path: tmpPath })).toBe("synthetic");
  });

  it("is idempotent — repeated writes return a fresh timestamp but keep the mode", () => {
    const first = setActiveDatasetMode("shell-university", null, { path: tmpPath });
    const second = setActiveDatasetMode("shell-university", null, { path: tmpPath });
    expect(first.activeMode).toBe(second.activeMode);
    expect(Date.parse(first.switchedAt)).toBeLessThanOrEqual(Date.parse(second.switchedAt));
  });
});
