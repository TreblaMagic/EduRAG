import { describe, expect, it } from "vitest";

import {
  formatRelative,
  snapshotsFor,
  statusLabel,
} from "../status";
import type { RawModeCounts, RawModeLatestSync } from "../status";

const emptyLatest: RawModeLatestSync = {
  shellUniversity: null,
  uploaded: null,
};

describe("snapshotsFor", () => {
  it("emits one snapshot per supported mode in canonical order", () => {
    const out = snapshotsFor(
      "synthetic",
      { studentCount: 250, shellUniversitySyncs: 0, uploadSyncs: 0 },
      emptyLatest,
    );
    expect(out.map((s) => s.metadata.id)).toEqual([
      "synthetic",
      "shell-university",
      "uploaded",
    ]);
  });

  it("flags the requested mode as active", () => {
    const out = snapshotsFor(
      "uploaded",
      { studentCount: 100, shellUniversitySyncs: 0, uploadSyncs: 3 },
      emptyLatest,
    );
    expect(out.find((s) => s.metadata.id === "uploaded")?.isActive).toBe(true);
    expect(out.find((s) => s.metadata.id === "synthetic")?.isActive).toBe(false);
  });

  it("derives ready/empty status from primary counts", () => {
    const out = snapshotsFor(
      "synthetic",
      { studentCount: 50, shellUniversitySyncs: 0, uploadSyncs: 0 },
      emptyLatest,
    );
    const byId = Object.fromEntries(out.map((s) => [s.metadata.id, s]));
    expect(byId["synthetic"]!.status).toBe("ready");
    expect(byId["shell-university"]!.status).toBe("empty");
    expect(byId["uploaded"]!.status).toBe("empty");
  });

  it("threads the latest sync finishedAt timestamp through to the snapshot", () => {
    const finishedAt = new Date("2026-05-28T10:00:00.000Z");
    const counts: RawModeCounts = {
      studentCount: 0,
      shellUniversitySyncs: 4,
      uploadSyncs: 2,
    };
    const latest: RawModeLatestSync = {
      shellUniversity: { finishedAt, status: "success" },
      uploaded: { finishedAt: new Date("2026-05-28T11:00:00.000Z"), status: "partial" },
    };
    const out = snapshotsFor("shell-university", counts, latest);
    const shell = out.find((s) => s.metadata.id === "shell-university")!;
    expect(shell.lastUpdatedAt).toBe(finishedAt.toISOString());
    expect(shell.lastUpdatedDetail).toContain("4 syncs on record");
    expect(shell.lastUpdatedDetail).toContain("success");
    expect(shell.primaryCount).toBe(4);
  });

  it("emits a hint when a mode is empty", () => {
    const out = snapshotsFor(
      "synthetic",
      { studentCount: 0, shellUniversitySyncs: 0, uploadSyncs: 0 },
      emptyLatest,
    );
    const byId = Object.fromEntries(out.map((s) => [s.metadata.id, s]));
    expect(byId["synthetic"]!.lastUpdatedDetail).toMatch(/npm run/);
    expect(byId["shell-university"]!.lastUpdatedDetail).toMatch(/npm run shell:seed/);
    expect(byId["uploaded"]!.lastUpdatedDetail).toMatch(/upload/i);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-05-28T12:00:00.000Z");

  it("renders seconds when < 60s", () => {
    expect(formatRelative(new Date("2026-05-28T11:59:30.000Z"), now)).toBe("30s ago");
  });

  it("renders minutes when < 60m", () => {
    expect(formatRelative(new Date("2026-05-28T11:55:00.000Z"), now)).toBe("5m ago");
  });

  it("renders hours when < 24h", () => {
    expect(formatRelative(new Date("2026-05-28T09:00:00.000Z"), now)).toBe("3h ago");
  });

  it("renders days when < 30d", () => {
    expect(formatRelative(new Date("2026-05-21T12:00:00.000Z"), now)).toBe("7d ago");
  });

  it("returns the raw ISO when the date is in the future", () => {
    const future = new Date("2026-05-28T13:00:00.000Z");
    expect(formatRelative(future, now)).toBe(future.toISOString());
  });
});

describe("statusLabel", () => {
  it("maps every status to a short label", () => {
    expect(statusLabel("ready")).toBe("Ready");
    expect(statusLabel("empty")).toBe("Empty");
    expect(statusLabel("stale")).toBe("Stale");
    expect(statusLabel("unavailable")).toBe("Unavailable");
  });
});
