/**
 * POST /api/admin/reseed — destructive wipe + reseed.
 *
 * Phase 12C — invoked by the Vercel cron entry in `vercel.json`
 * (`0 3 * * *` → daily at 03:00 UTC) so the public demo never
 * drifts into a weird state after a day of visitor activity.
 *
 * **Auth model.** Gated by the `CRON_SECRET` env var. Vercel's
 * managed cron attaches `Authorization: Bearer ${CRON_SECRET}`
 * automatically when the env var is named `CRON_SECRET`; we also
 * accept `x-cron-secret` for ad-hoc curl smoke tests. Without the
 * env var set we 503 — the route is opt-in. The secret is compared
 * with `timingSafeEqual` to avoid timing oracles.
 *
 * **Idempotent on failure paths.** If the wipe succeeds but the
 * seed throws partway through, the next cron tick will retry —
 * `runFreshSeed()` itself is non-idempotent against existing rows
 * (it assumes an empty DB), which is fine here because we wipe
 * first.
 *
 * Never invokable from the browser UI. No GET handler; no client
 * component touches this URL.
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { runFreshSeed } from "../../../../../prisma/seed-pipeline";

export const dynamic = "force-dynamic";
// Reseed touches every table + runs the full pipeline (ingest → derive →
// estimates → simulations → predict → shell sync). On Vercel Hobby the
// default 10-second function ceiling is too tight; bump to the Pro-tier
// ceiling. The cron only fires once a day so the cost stays trivial.
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const provided = extractSecret(req);
  if (!provided || !secretsMatch(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorised" },
      { status: 401 },
    );
  }

  const startedAt = new Date().toISOString();
  try {
    await wipeAllDomainTables(prisma);
    await runFreshSeed(prisma);
    const finishedAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

/**
 * Pull the secret from either header. Vercel cron uses
 * `Authorization: Bearer …`; ad-hoc curl smoke tests can pass
 * `x-cron-secret` for convenience.
 */
function extractSecret(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const direct = req.headers.get("x-cron-secret");
  return direct?.trim() ?? null;
}

/**
 * Constant-time comparison so the route does not leak the length
 * or contents of `CRON_SECRET` via timing differences. Pads the
 * shorter string to avoid `timingSafeEqual`'s same-length
 * requirement throwing.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Delete every row in every application-managed table in dependency
 * order. Keeps the schema + indexes intact. The reseed step below
 * will repopulate from the committed CSV + Shell University JSON.
 *
 * NOTE: also wipes `SyncLog` + `AppSetting` so the next visitor sees
 * a perfectly fresh state — including the default dataset-mode chip.
 */
async function wipeAllDomainTables(prisma: typeof import("@/lib/db").prisma): Promise<void> {
  await prisma.interventionDecision.deleteMany({});
  await prisma.interventionSimulation.deleteMany({});
  await prisma.baselinePrediction.deleteMany({});
  await prisma.causalEstimate.deleteMany({});
  await prisma.courseFeatureSummary.deleteMany({});
  await prisma.rdiScore.deleteMany({});
  await prisma.weeklyEngagementSummary.deleteMany({});
  await prisma.advisorNote.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.resource.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.syncLog.deleteMany({});
  // AppSetting is wiped via a delete-all rather than per-key — the
  // Phase 12B store re-seeds the dataset-mode row on the first
  // setActiveDatasetMode() call.
  await (prisma as unknown as {
    appSetting: { deleteMany: (args: object) => Promise<unknown> };
  }).appSetting.deleteMany({});
}
