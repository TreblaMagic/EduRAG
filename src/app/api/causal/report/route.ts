/**
 * GET /api/causal/report?course=CS-201&format=markdown|json&discovery=1&engine=baseline|advanced
 *
 * Returns a downloadable causal report. Reads from persisted `CausalEstimate`
 * rows; will return a partial report (with a warning) if no estimates are
 * present yet so the UI never breaks.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  renderJsonReport,
  renderMarkdownReport,
  type EngineName,
} from "@/features/causal-engine";
import { prisma } from "@/lib/db";
import { buildCausalReport } from "@/server/causal/build-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const courseCode = searchParams.get("course") ?? "CS-201";
  const formatRaw = searchParams.get("format") ?? "markdown";
  const discovery = searchParams.get("discovery") === "1";
  const prediction = searchParams.get("prediction") === "1";
  const tracking = searchParams.get("tracking") === "1";
  const engineRaw = searchParams.get("engine") ?? "baseline";

  const format: "markdown" | "json" =
    formatRaw === "json" ? "json" : "markdown";
  const engine: EngineName = engineRaw === "advanced" ? "advanced" : "baseline";

  try {
    const report = await buildCausalReport(prisma, courseCode, {
      includeDiscovery: discovery,
      discoveryEngine: engine,
      includePrediction: prediction,
      includeTracking: tracking,
    });
    const body =
      format === "markdown" ? renderMarkdownReport(report) : renderJsonReport(report);
    const ext = format === "markdown" ? "md" : "json";
    const filename = `edurag-causal-report-${courseCode}.${ext}`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          format === "markdown" ? "text/markdown; charset=utf-8" : "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
