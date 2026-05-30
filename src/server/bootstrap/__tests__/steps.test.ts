import { describe, expect, it, vi } from "vitest";

import { runSteps, type SetupStep } from "../steps";

function ok(id: string, shouldRun = true, onRun?: () => void): SetupStep {
  return {
    id,
    label: id,
    shouldRun: () => shouldRun,
    run: async () => {
      onRun?.();
    },
  };
}

describe("runSteps", () => {
  it("runs steps sequentially and skips those whose shouldRun returns false", async () => {
    const log: string[] = [];
    const summary = await runSteps([
      ok("a", true, () => log.push("a")),
      ok("b", false, () => log.push("b")),
      ok("c", true, () => log.push("c")),
    ]);
    expect(log).toEqual(["a", "c"]);
    expect(summary.steps.map((s) => s.status)).toEqual(["ran", "skipped", "ran"]);
    expect(summary.ok).toBe(true);
  });

  it("captures errors as failed steps with the error message", async () => {
    const failing: SetupStep = {
      id: "x",
      label: "X",
      shouldRun: () => true,
      run: async () => {
        throw new Error("boom");
      },
    };
    const summary = await runSteps([failing]);
    expect(summary.steps[0]!.status).toBe("failed");
    expect(summary.steps[0]!.error).toBe("boom");
    expect(summary.ok).toBe(false);
  });

  it("stops on first failure by default", async () => {
    const log: string[] = [];
    const summary = await runSteps([
      {
        id: "a",
        label: "A",
        shouldRun: () => true,
        run: async () => {
          throw new Error("nope");
        },
      },
      ok("b", true, () => log.push("b")),
    ]);
    expect(log).toEqual([]);
    expect(summary.steps).toHaveLength(1);
    expect(summary.steps[0]!.status).toBe("failed");
  });

  it("continues past failures when stopOnError = false", async () => {
    const log: string[] = [];
    const summary = await runSteps(
      [
        {
          id: "a",
          label: "A",
          shouldRun: () => true,
          run: async () => {
            throw new Error("nope");
          },
        },
        ok("b", true, () => log.push("b")),
      ],
      { stopOnError: false },
    );
    expect(log).toEqual(["b"]);
    expect(summary.steps).toHaveLength(2);
    expect(summary.ok).toBe(false);
  });

  it("calls onStep for each step in order", async () => {
    const onStep = vi.fn();
    await runSteps([ok("a"), ok("b", false), ok("c")], { onStep });
    expect(onStep).toHaveBeenCalledTimes(3);
    expect(onStep.mock.calls.map((c) => c[0].id)).toEqual(["a", "b", "c"]);
  });
});
