import { describe, expect, it } from "vitest";

import { classifyDataSource } from "../integrations";

describe("classifyDataSource", () => {
  it("returns the friendly label for a known shell-university source", () => {
    expect(classifyDataSource("shell-university", true)).toBe("Shell University API");
  });

  it("returns the friendly label for a CSV source", () => {
    expect(classifyDataSource("csv", true)).toBe("Synthetic CSV");
  });

  it("returns the friendly label for an uploaded CSV", () => {
    expect(classifyDataSource("uploaded", true)).toBe("Uploaded CSV");
  });

  it("falls back to Synthetic CSV when no sync log exists but Prisma has data", () => {
    expect(classifyDataSource(null, true)).toBe("Synthetic CSV");
  });

  it("falls back to Unknown when no sync log AND no Prisma data", () => {
    expect(classifyDataSource(null, false)).toBe("Unknown");
  });

  it("returns Unknown for unrecognised source strings", () => {
    // Unknown source string => not in map => fall through to hasPrismaData branch.
    expect(classifyDataSource("rogue", false)).toBe("Unknown");
  });
});
