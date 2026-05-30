import { describe, expect, it } from "vitest";

import {
  DEMO_MODE_HOSTED,
  DEMO_MODE_LOCAL,
  HOSTED_UPLOAD_ROW_CAP,
  isHostedDemo,
  resolveDemoMode,
} from "../demo-mode";

describe("resolveDemoMode", () => {
  it("returns 'local' when DEMO_MODE is unset", () => {
    expect(resolveDemoMode({})).toBe(DEMO_MODE_LOCAL);
  });

  it("returns 'local' for any value other than the literal 'hosted'", () => {
    expect(resolveDemoMode({ DEMO_MODE: "" })).toBe(DEMO_MODE_LOCAL);
    expect(resolveDemoMode({ DEMO_MODE: "production" })).toBe(DEMO_MODE_LOCAL);
    expect(resolveDemoMode({ DEMO_MODE: "true" })).toBe(DEMO_MODE_LOCAL);
  });

  it("returns 'hosted' for the exact literal", () => {
    expect(resolveDemoMode({ DEMO_MODE: DEMO_MODE_HOSTED })).toBe(DEMO_MODE_HOSTED);
  });

  it("tolerates surrounding whitespace and casing in pasted values", () => {
    expect(resolveDemoMode({ DEMO_MODE: " HOSTED " })).toBe(DEMO_MODE_HOSTED);
    expect(resolveDemoMode({ DEMO_MODE: "Hosted\n" })).toBe(DEMO_MODE_HOSTED);
  });
});

describe("isHostedDemo", () => {
  it("agrees with resolveDemoMode", () => {
    expect(isHostedDemo({})).toBe(false);
    expect(isHostedDemo({ DEMO_MODE: "local" })).toBe(false);
    expect(isHostedDemo({ DEMO_MODE: "hosted" })).toBe(true);
  });
});

describe("HOSTED_UPLOAD_ROW_CAP", () => {
  it("is a sane positive integer", () => {
    expect(HOSTED_UPLOAD_ROW_CAP).toBe(50_000);
    expect(Number.isInteger(HOSTED_UPLOAD_ROW_CAP)).toBe(true);
    expect(HOSTED_UPLOAD_ROW_CAP).toBeGreaterThan(0);
  });
});
