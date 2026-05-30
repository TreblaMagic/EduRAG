/**
 * Phase 12C — hosted-demo gating.
 *
 * The hosted demo (Vercel production) needs a small number of
 * behaviour tweaks the local-first dev experience does not want:
 *
 *   - a global banner explaining the nightly reset + synthetic-data
 *     guarantee, so a cold visitor knows what they're looking at;
 *   - an upload row-cap so a malicious or accidentally-huge CSV
 *     can't fill the free-tier DB;
 *   - the cron-triggered `/api/admin/reseed` route (handled in
 *     `src/app/api/admin/reseed/route.ts`).
 *
 * All gates are driven by a single env var, `DEMO_MODE`. Anything
 * other than the literal string `"hosted"` is treated as local —
 * the dev path is the safe default, and Vercel's project env block
 * is the only place that should set `hosted`.
 *
 * This module is intentionally tiny and dependency-free so it can be
 * imported from both server components (no `"use server"` needed) and
 * pure helpers (tests, the reseed route).
 */

export const DEMO_MODE_HOSTED = "hosted" as const;
export const DEMO_MODE_LOCAL = "local" as const;

export type DemoMode = typeof DEMO_MODE_HOSTED | typeof DEMO_MODE_LOCAL;

/**
 * Upper bound on the number of CSV rows a single upload may contain
 * when `DEMO_MODE=hosted`. Picked so the demo DB stays well within
 * the free-tier ceiling even after a few visitors uploading
 * back-to-back. Local dev has no cap.
 *
 * 50,000 rows ≈ 200 students × 12 weeks × ~21 events/week — i.e.
 * slightly more than the committed synthetic CSV.
 */
export const HOSTED_UPLOAD_ROW_CAP = 50_000;

/**
 * Read the current demo mode from `process.env`. Defaults to "local"
 * — only the literal string "hosted" flips to the hosted branch.
 * Trim + lowercase so a trailing newline or stray casing in a
 * dashboard-pasted value still works as expected.
 *
 * Accepts any record-like env source so tests can pass `{}` without
 * having to satisfy Next.js's augmented `NodeJS.ProcessEnv` shape
 * (which requires `NODE_ENV`).
 */
type EnvLike = Record<string, string | undefined>;

export function resolveDemoMode(env: EnvLike = process.env): DemoMode {
  const raw = (env.DEMO_MODE ?? "").trim().toLowerCase();
  return raw === DEMO_MODE_HOSTED ? DEMO_MODE_HOSTED : DEMO_MODE_LOCAL;
}

/** True iff `DEMO_MODE=hosted`. The most common gate in calling code. */
export function isHostedDemo(env: EnvLike = process.env): boolean {
  return resolveDemoMode(env) === DEMO_MODE_HOSTED;
}
