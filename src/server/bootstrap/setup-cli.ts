/**
 * `npm run setup` — one-command bootstrap.
 *
 *   - Installs npm dependencies (if needed)
 *   - Generates the Prisma client (if needed)
 *   - Applies migrations (if needed)
 *   - Generates the synthetic CSV (if missing)
 *   - Ingests + derives features
 *   - Runs causal estimates + simulations
 *   - Runs the baseline ML predictions
 *
 * Idempotent. Skips any step whose post-condition already holds. Safe to
 * re-run on an already-bootstrapped checkout.
 *
 *   npm run setup
 *   npm run setup -- --fresh          # regenerate the synthetic CSV first
 *   npm run setup -- --json           # machine-readable summary
 */

import { argv, exit } from "node:process";

import {
  buildSetupSteps,
  renderSetupSummary,
  renderStepLine,
  runSteps,
} from "./index";

interface CliOptions {
  fresh: boolean;
  json: boolean;
}

const HELP = `Usage: npm run setup -- [options]

  --fresh      Regenerate the synthetic CSV even if it already exists
  --json       Emit machine-readable JSON to stdout (in addition to logs)
  -h, --help   Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { fresh: false, json: false };
  for (const a of args) {
    if (a === "--fresh") opts.fresh = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") {
      console.log(HELP);
      exit(0);
    } else {
      console.error(`error: unknown flag ${a}`);
      console.error(HELP);
      exit(2);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(argv.slice(2));
  console.log("▌ EduRAG setup — starting");
  console.log("  (steps are idempotent — already-done work is skipped)");
  console.log("");

  // Lazily import Prisma so the setup CLI still loads even when the
  // Prisma client hasn't been generated yet. The step list itself
  // handles the "generate first" case.
  const prismaModule = await import("../../lib/db").catch(() => null);
  const prisma = prismaModule?.prisma ?? null;

  const steps = buildSetupSteps({
    freshData: opts.fresh,
    countStudents: async () => (prisma ? prisma.student.count().catch(() => 0) : 0),
    countEstimates: async () => (prisma ? prisma.causalEstimate.count().catch(() => 0) : 0),
    countSimulations: async () =>
      prisma ? prisma.interventionSimulation.count().catch(() => 0) : 0,
    countPredictions: async () =>
      prisma ? prisma.baselinePrediction.count().catch(() => 0) : 0,
  });

  const summary = await runSteps(steps, {
    onStep: (result) => {
      console.log(`  ${renderStepLine(result)}`);
    },
  });

  console.log("");
  console.log(renderSetupSummary(summary));

  if (opts.json) {
    process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);
  }

  await prisma?.$disconnect().catch(() => {});
  exit(summary.ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("setup: unexpected failure:", err);
  exit(1);
});
