import { describe, expect, it } from "vitest";

import {
  countByStatus,
  isHealthy,
  renderCheckGroups,
  renderCheckLine,
  renderSetupSummary,
  renderStepLine,
} from "../format";
import type { CheckGroup, CheckResult, SetupSummary, StepResult } from "../types";

const okGroup: CheckGroup = {
  group: "Environment",
  results: [
    { id: "env.node", label: "Node.js", status: "ok", detail: "v20.10.0" },
    { id: "env.npm", label: "npm dependencies", status: "ok", detail: "installed" },
  ],
};

const mixedGroup: CheckGroup = {
  group: "Database",
  results: [
    { id: "db.client", label: "Prisma client", status: "ok", detail: "generated" },
    {
      id: "db.file",
      label: "SQLite database",
      status: "missing",
      detail: "not found",
      hint: "Run `npm run setup`",
    },
    {
      id: "db.counts",
      label: "Prisma row counts",
      status: "error",
      detail: "Connection refused",
    },
  ],
};

describe("countByStatus", () => {
  it("counts statuses across multiple groups", () => {
    const out = countByStatus([okGroup, mixedGroup]);
    expect(out).toEqual({ ok: 3, warn: 0, missing: 1, error: 1 });
  });

  it("returns all-zero for an empty input", () => {
    expect(countByStatus([])).toEqual({ ok: 0, warn: 0, missing: 0, error: 0 });
  });
});

describe("isHealthy", () => {
  it("returns true when every result is ok or warn", () => {
    const warnGroup: CheckGroup = {
      group: "Features",
      results: [
        { id: "f.x", label: "X", status: "warn", detail: "—" },
      ],
    };
    expect(isHealthy([okGroup, warnGroup])).toBe(true);
  });

  it("returns false when any result is missing or error", () => {
    expect(isHealthy([okGroup, mixedGroup])).toBe(false);
  });
});

describe("renderCheckLine", () => {
  it("includes the hint when status is not ok", () => {
    const r: CheckResult = {
      id: "x",
      label: "Foo",
      status: "missing",
      detail: "—",
      hint: "Run `npm run setup`",
    };
    const out = renderCheckLine(r);
    expect(out).toContain("[miss]");
    expect(out).toContain("Foo — —");
    expect(out).toContain("↳ Run `npm run setup`");
  });

  it("omits the hint when status is ok", () => {
    const r: CheckResult = {
      id: "x",
      label: "Foo",
      status: "ok",
      detail: "—",
      hint: "should not appear",
    };
    const out = renderCheckLine(r);
    expect(out).not.toContain("↳");
  });
});

describe("renderCheckGroups", () => {
  it("renders a header + lines for each group", () => {
    const out = renderCheckGroups([okGroup, mixedGroup]);
    expect(out).toContain("▌ Environment");
    expect(out).toContain("▌ Database");
    expect(out).toContain("[ ok ] Node.js");
    expect(out).toContain("[miss] SQLite database");
    expect(out).toContain("[ err] Prisma row counts");
  });
});

describe("renderStepLine", () => {
  const step = (overrides: Partial<StepResult>): StepResult => ({
    id: "x",
    label: "Step",
    status: "ran",
    durationMs: 12,
    ...overrides,
  });

  it("renders a successful step with the run glyph + duration", () => {
    const line = renderStepLine(step({ detail: "done" }));
    expect(line).toContain("[ ok ]");
    expect(line).toContain("12ms");
    expect(line).toContain("Step — done");
  });

  it("renders a failed step with the error", () => {
    const line = renderStepLine(step({ status: "failed", error: "boom" }));
    expect(line).toContain("[fail]");
    expect(line).toContain("↳ boom");
  });

  it("renders a skipped step", () => {
    const line = renderStepLine(step({ status: "skipped", detail: "cached" }));
    expect(line).toContain("[skip]");
  });
});

describe("renderSetupSummary", () => {
  const summary = (ok: boolean, steps: StepResult[]): SetupSummary => ({
    startedAt: "2026-05-28T10:00:00.000Z",
    finishedAt: "2026-05-28T10:00:05.000Z",
    totalDurationMs: 5000,
    steps,
    ok,
  });

  it("shows the success banner + next-step hint", () => {
    const out = renderSetupSummary(
      summary(true, [
        { id: "a", label: "A", status: "ran", durationMs: 10 },
      ]),
    );
    expect(out).toContain("completed");
    expect(out).toContain("→ Next: `npm run demo`");
  });

  it("shows the failure banner + doctor hint", () => {
    const out = renderSetupSummary(
      summary(false, [
        { id: "a", label: "A", status: "failed", durationMs: 10, error: "x" },
      ]),
    );
    expect(out).toContain("FAILED");
    expect(out).toContain("`npm run doctor`");
  });
});
