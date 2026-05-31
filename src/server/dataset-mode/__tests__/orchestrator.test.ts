import { beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import { getActiveDatasetMode, setActiveDatasetMode } from "../orchestrator";
import { readState } from "../store";
import type { AppSettingClient } from "../store";

/**
 * Combined fake for the orchestrator tests: implements the AppSetting
 * slice the store touches plus minimal `student` + `syncLog` probes
 * so any future orchestrator test that exercises the overview path
 * can extend it without re-wiring. The current tests only exercise
 * `getActiveDatasetMode` + `setActiveDatasetMode`, which only need
 * `appSetting`.
 */
function createPrismaFake(): {
  client: AppSettingClient & PrismaClient;
  rows: Map<string, string>;
} {
  const rows = new Map<string, string>();
  const client = {
    appSetting: {
      async findUnique({ where }: { where: { key: string } }) {
        const value = rows.get(where.key);
        return value === undefined ? null : { key: where.key, value };
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { key: string; value: string };
        update: { value: string };
      }) {
        if (rows.has(where.key)) {
          rows.set(where.key, update.value);
        } else {
          rows.set(where.key, create.value);
        }
        return null;
      },
    },
  } as unknown as AppSettingClient & PrismaClient;
  return { client, rows };
}

describe("setActiveDatasetMode + getActiveDatasetMode", () => {
  let fake: ReturnType<typeof createPrismaFake>;

  beforeEach(() => {
    fake = createPrismaFake();
  });

  it("persists the chosen mode and surfaces it via getActiveDatasetMode", async () => {
    await setActiveDatasetMode("uploaded", "test reason", fake.client);
    expect(await getActiveDatasetMode(fake.client)).toBe("uploaded");
    const persisted = await readState({ prisma: fake.client });
    expect(persisted.activeMode).toBe("uploaded");
    expect(persisted.reason).toBe("test reason");
    expect(Date.parse(persisted.switchedAt)).not.toBeNaN();
  });

  it("falls back to the default mode when no row exists", async () => {
    expect(await getActiveDatasetMode(fake.client)).toBe("synthetic");
  });

  it("is idempotent — repeated writes return a fresh timestamp but keep the mode", async () => {
    const first = await setActiveDatasetMode("shell-university", null, fake.client);
    const second = await setActiveDatasetMode("shell-university", null, fake.client);
    expect(first.activeMode).toBe(second.activeMode);
    expect(Date.parse(first.switchedAt)).toBeLessThanOrEqual(Date.parse(second.switchedAt));
  });
});
