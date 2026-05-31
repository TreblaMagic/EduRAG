import type { MetadataRoute } from "next";

/**
 * Phase 12C — robots.txt for the hosted demo.
 *
 * Strategy: let crawlers index the read-only public surfaces (Overview,
 * About, Causal graph, Comparison) so the demo is discoverable, but
 * disallow:
 *
 *   - every API route and server action surface — no crawler-triggered
 *     mutations against the free-tier DB;
 *   - the upload page — the form posts to a server action that mutates
 *     the DB, and a crawler hitting the page contributes nothing useful;
 *   - the integrations page — the sync history is operator-facing.
 *
 * `NEXT_PUBLIC_APP_URL` (set on Vercel) is the canonical origin for the
 * sitemap reference. Falls back to the production hostname placeholder
 * locally so `next build` succeeds without the env var.
 */
export default function robots(): MetadataRoute.Robots {
  const host =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "https://edurag.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/causal-graph", "/comparison"],
        disallow: [
          "/api/",
          "/upload",
          "/datasets",
          "/interventions",
          "/integrations/",
          "/students/",
          "/what-if",
        ],
      },
    ],
    host,
  };
}
