/**
 * Prisma seed entry point — invoked by `npx prisma db seed`.
 *
 * Phase 12B introduced this so the Vercel build can stand up a fully
 * populated database without shelling out to the Phase 9 `npm run setup`
 * pipeline (which assumes a local writable filesystem + Python).
 *
 * Build-time invocation pipeline (in order):
 *
 *   prisma generate                  # generate the client
 *   prisma migrate deploy            # apply committed migrations
 *   prisma db seed                   # ← this file
 *   next build
 *
 * The seed is idempotent. If a non-empty `Student` table exists it
 * short-circuits and exits 0 — re-running a build never wipes data.
 * The destructive reseed path (Phase 12C nightly cron) lives in a
 * separate route and calls `runFreshSeed()` directly after a wipe.
 *
 * Local devs typically use `npm run setup` instead; the seed is
 * available as an alternative when the CSV is committed and you want
 * the TS-only path (e.g. on a machine without Python).
 *
 * The pipeline itself lives in `seed-pipeline.ts` so callers (the
 * `/api/admin/reseed` route) can import `runFreshSeed` without
 * triggering this file's top-level `main()` execution.
 */

import { PrismaClient } from "@prisma/client";

import { runFreshSeed } from "./seed-pipeline";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const existingStudents = await prisma.student.count().catch(() => 0);
    if (existingStudents > 0) {
      console.log(
        `[seed] ${existingStudents} students already present — skipping. ` +
          `Use the Phase 12C admin/reseed route for a destructive reseed.`,
      );
      return;
    }
    await runFreshSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
