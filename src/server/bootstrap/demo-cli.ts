/**
 * `npm run demo` — setup-if-needed + launch the dashboard.
 *
 * Runs the full setup pipeline first (idempotent — usually finishes in
 * < 1 s on a populated checkout), then starts `next dev` and prints the
 * helpful URLs. Use this for screen recordings, screenshots, and "git
 * clone → working app" walkthroughs.
 *
 *   npm run demo                    # setup-if-needed, then dev server
 *   npm run demo -- --fresh         # regenerate the synthetic CSV first
 */

import { argv, exit } from "node:process";

import {
  buildSetupSteps,
  renderStepLine,
  renderSetupSummary,
  runCommand,
  runSteps,
} from "./index";

const HELP = `Usage: npm run demo -- [options]

  --fresh           Regenerate the synthetic CSV before launching the dashboard
  --skip-setup      Skip the setup phase and go straight to next dev
  -h, --help        Show this help message and exit`;

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

interface CliOptions {
  fresh: boolean;
  skipSetup: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { fresh: false, skipSetup: false };
  for (const a of args) {
    if (a === "--fresh") opts.fresh = true;
    else if (a === "--skip-setup") opts.skipSetup = true;
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

  if (!opts.skipSetup) {
    console.log("▌ EduRAG demo — preparing data");
    const prismaModule = await import("../../lib/db").catch(() => null);
    const prisma = prismaModule?.prisma ?? null;
    const steps = buildSetupSteps({
      freshData: opts.fresh,
      countStudents: async () =>
        prisma ? prisma.student.count().catch(() => 0) : 0,
      countEstimates: async () =>
        prisma ? prisma.causalEstimate.count().catch(() => 0) : 0,
      countSimulations: async () =>
        prisma ? prisma.interventionSimulation.count().catch(() => 0) : 0,
      countPredictions: async () =>
        prisma ? prisma.baselinePrediction.count().catch(() => 0) : 0,
    });
    const summary = await runSteps(steps, {
      onStep: (r) => console.log(`  ${renderStepLine(r)}`),
    });
    console.log("");
    console.log(renderSetupSummary(summary));
    await prisma?.$disconnect().catch(() => {});
    if (!summary.ok) {
      console.error("Aborting demo: setup failed. See `npm run doctor`.");
      exit(1);
    }
  }

  console.log("");
  printBanner();

  // Hand off to `next dev`. This blocks until the dev server is killed.
  await runCommand(NPM, ["run", "dev"]);
}

function printBanner(): void {
  const lines = [
    "▌ EduRAG dashboard — http://localhost:3000",
    "",
    "  Surfaces to demo (open in a new tab once `next dev` is ready):",
    "    /                              — Overview cohort dashboard",
    "    /students/STU-0042             — Student profile + Prediction vs Intervention panel",
    "    /causal-graph?view=compare     — Manual DAG vs discovered DAG",
    "    /what-if                       — Interactive counterfactual simulator",
    "    /comparison                    — Cohort prediction vs intervention table",
    "    /upload                        — Real CSV upload pipeline",
    "    /integrations/shell-university — Mock LMS sync history",
    "    /about                         — First-time-reviewer onboarding",
    "",
    "  Press Ctrl+C to stop the dev server.",
    "",
  ];
  console.log(lines.join("\n"));
}

main().catch((err: unknown) => {
  console.error("demo: unexpected failure:", err);
  exit(1);
});
