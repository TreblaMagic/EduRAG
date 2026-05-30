import { describe, expect, it } from "vitest";

import { buildSetupSteps } from "../setup-steps";

/**
 * The setup-step builder is the only piece of `setup-cli` logic that can be
 * exercised without shelling out to npm / prisma / python. These tests
 * cover the `shouldRun` decisions — i.e. the idempotency promise of
 * `npm run setup`.
 */
describe("buildSetupSteps", () => {
  it("emits exactly the expected step list in order", () => {
    const steps = buildSetupSteps({
      countStudents: async () => 0,
      countEstimates: async () => 0,
      countSimulations: async () => 0,
      countPredictions: async () => 0,
    });
    expect(steps.map((s) => s.id)).toEqual([
      "deps",
      "prisma-generate",
      "migrate",
      "data-generate",
      "ingest",
      "causal-estimate",
      "causal-simulate",
      "ml-predict",
    ]);
  });

  it("skips ingest/estimate/simulate/predict when counts are non-zero", async () => {
    const steps = buildSetupSteps({
      countStudents: async () => 100,
      countEstimates: async () => 4,
      countSimulations: async () => 250,
      countPredictions: async () => 100,
    });
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(await byId["ingest"]!.shouldRun()).toBe(false);
    expect(await byId["causal-estimate"]!.shouldRun()).toBe(false);
    expect(await byId["causal-simulate"]!.shouldRun()).toBe(false);
    expect(await byId["ml-predict"]!.shouldRun()).toBe(false);
  });

  it("runs ingest/estimate/simulate/predict when counts are zero", async () => {
    const steps = buildSetupSteps({
      countStudents: async () => 0,
      countEstimates: async () => 0,
      countSimulations: async () => 0,
      countPredictions: async () => 0,
    });
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(await byId["ingest"]!.shouldRun()).toBe(true);
    expect(await byId["causal-estimate"]!.shouldRun()).toBe(true);
    expect(await byId["causal-simulate"]!.shouldRun()).toBe(true);
    expect(await byId["ml-predict"]!.shouldRun()).toBe(true);
  });

  it("forces the synthetic CSV step when freshData is true", async () => {
    const fresh = buildSetupSteps({
      freshData: true,
      countStudents: async () => 100,
      countEstimates: async () => 4,
      countSimulations: async () => 250,
      countPredictions: async () => 100,
    });
    const dataStep = fresh.find((s) => s.id === "data-generate")!;
    expect(await dataStep.shouldRun()).toBe(true);
  });

  it("every step exposes a label, shouldRun, and run", () => {
    const steps = buildSetupSteps({
      countStudents: async () => 0,
      countEstimates: async () => 0,
      countSimulations: async () => 0,
      countPredictions: async () => 0,
    });
    for (const s of steps) {
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(3);
      expect(typeof s.shouldRun).toBe("function");
      expect(typeof s.run).toBe("function");
    }
  });
});
