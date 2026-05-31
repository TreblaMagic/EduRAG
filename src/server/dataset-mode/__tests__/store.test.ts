import { beforeEach, describe, expect, it } from "vitest";

import { normaliseState, readState, writeState } from "../store";
import type { AppSettingClient } from "../store";

const DEFAULT = {
  activeMode: "synthetic",
  switchedAt: "1970-01-01T00:00:00.000Z",
  reason: "Default — no explicit selection made yet.",
};

/**
 * In-memory `AppSetting` fake — implements the slice of the Prisma
 * client the store actually calls. Lets us exercise the read/write
 * round-trip and the corruption-recovery branches without spinning
 * up a real database.
 */
function createPrismaFake(initial: Record<string, string> = {}): {
  client: AppSettingClient;
  rows: Map<string, string>;
} {
  const rows = new Map<string, string>(Object.entries(initial));
  const client: AppSettingClient = {
    appSetting: {
      async findUnique({ where }) {
        const value = rows.get(where.key);
        return value === undefined ? null : { key: where.key, value };
      },
      async upsert({ where, create, update }) {
        if (rows.has(where.key)) {
          rows.set(where.key, update.value);
        } else {
          rows.set(where.key, create.value);
        }
        return null;
      },
    },
  };
  return { client, rows };
}

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

describe("readState / writeState round-trip (Prisma AppSetting)", () => {
  let fake: ReturnType<typeof createPrismaFake>;

  beforeEach(() => {
    fake = createPrismaFake();
  });

  it("returns the default when the row is missing", async () => {
    expect(await readState({ prisma: fake.client })).toEqual(DEFAULT);
  });

  it("round-trips a written state through the AppSetting row", async () => {
    await writeState(
      {
        activeMode: "shell-university",
        switchedAt: "2026-05-28T12:00:00.000Z",
        reason: "syncing the LMS demo",
      },
      { prisma: fake.client },
    );
    const out = await readState({ prisma: fake.client });
    expect(out.activeMode).toBe("shell-university");
    expect(out.switchedAt).toBe("2026-05-28T12:00:00.000Z");
    expect(out.reason).toBe("syncing the LMS demo");
    // The persisted blob is JSON-encoded under the `dataset-mode` key.
    expect(JSON.parse(fake.rows.get("dataset-mode")!)).toEqual(out);
  });

  it("recovers gracefully from a corrupted value", async () => {
    fake = createPrismaFake({ "dataset-mode": "{ not valid json" });
    expect(await readState({ prisma: fake.client })).toEqual(DEFAULT);
  });

  it("recovers gracefully from a row containing an unknown mode", async () => {
    fake = createPrismaFake({
      "dataset-mode": JSON.stringify({
        activeMode: "telepathy",
        switchedAt: "2026-01-01T00:00:00.000Z",
        reason: "x",
      }),
    });
    const out = await readState({ prisma: fake.client });
    expect(out.activeMode).toBe(DEFAULT.activeMode);
  });

  it("falls back to the default when the underlying client throws", async () => {
    const broken: AppSettingClient = {
      appSetting: {
        async findUnique() {
          throw new Error("DB unreachable");
        },
        async upsert() {
          throw new Error("DB unreachable");
        },
      },
    };
    expect(await readState({ prisma: broken })).toEqual(DEFAULT);
  });
});
