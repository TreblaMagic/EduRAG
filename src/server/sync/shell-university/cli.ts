/**
 * `npm run sync:university` entry point.
 *
 *   npm run sync:university                              # default direct mode, full scope
 *   npm run sync:university -- --via-http                # fetch through the live dev server
 *   npm run sync:university -- --base http://other:3000  # custom HTTP base (implies --via-http)
 *   npm run sync:university -- --students --courses      # partial scope
 *   npm run sync:university -- --skip-derive             # skip post-sync recomputation
 *   npm run sync:university -- --json                    # also emit JSON summary to stdout
 */

import { argv, exit } from "node:process";

import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { deriveCourseFeatures } from "@/server/causal/derive-features";
import { deriveAllSummaries } from "@/server/ingest/derive-summaries";
import { createDirectClient, createHttpClient } from "./client";
import {
  ALL_ENTITIES,
  syncFromShellUniversity,
  type SyncSummary,
} from "./sync";
import {
  SHELL_ENTITIES,
  type ShellEntity,
} from "@/features/shell-university/types";

type ScopeFlag = "students" | "courses" | "enrollments" | "resources" | "events" | "grades" | "advisor-notes" | "full";

const SCOPE_FLAG_TO_ENTITY: Record<Exclude<ScopeFlag, "full">, ShellEntity> = {
  students: "students",
  courses: "courses",
  enrollments: "enrollments",
  resources: "resources",
  events: "lms-events",
  grades: "grades",
  "advisor-notes": "advisor-notes",
};

interface CliOptions {
  viaHttp: boolean;
  base: string;
  scope: ShellEntity[];
  skipDerive: boolean;
  json: boolean;
}

const HELP = `Usage: npm run sync:university -- [options]

  --via-http            Sync via HTTP through the live dev server
  --base URL            HTTP base URL (default: http://localhost:3000, implies --via-http)
  --students            Limit scope to students (repeatable with other entity flags)
  --courses             Limit scope to courses
  --enrollments         Limit scope to enrollments
  --resources           Limit scope to resources
  --events              Limit scope to lms-events
  --grades              Limit scope to grades
  --advisor-notes       Limit scope to advisor-notes
  --full                Sync all entities (default)
  --skip-derive         Skip post-sync derivation (WeeklyEngagementSummary, RDI, CourseFeatureSummary)
  --json                Emit a JSON summary to stdout
  -h, --help            Show this help and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    viaHttp: false,
    base: "http://localhost:3000",
    scope: [],
    skipDerive: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--via-http") {
      opts.viaHttp = true;
    } else if (flag === "--base") {
      const next = args[++i];
      if (!next) { console.error("error: --base requires a URL"); exit(2); }
      opts.base = next;
      opts.viaHttp = true;
    } else if (flag === "--skip-derive") {
      opts.skipDerive = true;
    } else if (flag === "--json") {
      opts.json = true;
    } else if (flag === "--full") {
      opts.scope = [...ALL_ENTITIES];
    } else if (flag === "--help" || flag === "-h") {
      console.log(HELP);
      exit(0);
    } else if (typeof flag === "string" && flag.startsWith("--")) {
      const key = flag.slice(2) as ScopeFlag;
      if (key in SCOPE_FLAG_TO_ENTITY) {
        const entity = SCOPE_FLAG_TO_ENTITY[key as Exclude<ScopeFlag, "full">];
        if (!opts.scope.includes(entity)) opts.scope.push(entity);
      } else {
        console.error(`error: unknown flag ${flag}`);
        console.error(HELP);
        exit(2);
      }
    } else {
      console.error(`error: unknown argument ${flag}`);
      console.error(HELP);
      exit(2);
    }
  }
  if (opts.scope.length === 0) opts.scope = [...ALL_ENTITIES];
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(argv.slice(2));
  const client = opts.viaHttp ? createHttpClient(opts.base) : createDirectClient();

  log.info(`Sync source: shell-university (transport=${client.transport}, base=${client.base})`);
  log.info(`Sync scope: ${opts.scope.join(", ")}`);

  let summary: SyncSummary;
  try {
    summary = await syncFromShellUniversity(prisma, client, { scope: opts.scope });
  } catch (err) {
    log.error("Sync orchestrator failed:", err);
    exit(1);
  }

  if (summary.status === "failed") {
    log.error("Sync failed; skipping derivation.");
    if (opts.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    exit(1);
  }

  // Re-derive engagement / RDI / course-features unless skipped.
  if (!opts.skipDerive && summary.scope.includes("lms-events")) {
    log.info("Re-deriving WeeklyEngagementSummary + RdiScore + CourseFeatureSummary…");
    const weekly = await deriveAllSummaries(prisma);
    log.info("  WeeklyEngagementSummary + RdiScore:", weekly);
    const features = await deriveCourseFeatures(prisma);
    log.info("  CourseFeatureSummary:", features);
  } else if (opts.skipDerive) {
    log.info("--skip-derive: skipping summaries/RDI/course-features recompute");
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  log.info("Done.");
}

// Hint for an unknown entity-name in scope vocabulary
if (!SHELL_ENTITIES.includes("students")) {
  // dead-code guard to keep `SHELL_ENTITIES` from being pruned by static analysis
}

main()
  .catch((err) => {
    log.error("Sync failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
