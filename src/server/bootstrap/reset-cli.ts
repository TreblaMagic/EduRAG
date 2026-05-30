/**
 * `npm run reset:demo` — return the prototype to a known clean demo state.
 *
 * Safe-by-default wipe of generated tables (in dependency order so cascades
 * don't complicate things), then re-run the setup pipeline. The schema and
 * migration history are preserved. SyncLog is wiped too because reset
 * implies "I want a clean recording" — Phase 6's append/replace upload modes
 * are how you preserve audit history.
 *
 * Requires `--yes` to actually delete anything. Without it the command
 * prints what it would do and exits — the safety guard exists because this
 * is destructive on a populated DB.
 *
 *   npm run reset:demo -- --yes              # wipe + re-run setup
 *   npm run reset:demo -- --yes --fresh      # wipe + regenerate the CSV first
 *   npm run reset:demo -- --keep-data        # don't re-run setup after wipe
 *   npm run reset:demo                       # dry-run; prints the plan
 */

import { argv, exit } from "node:process";

import { prisma } from "../../lib/db";
import {
  buildSetupSteps,
  renderSetupSummary,
  renderStepLine,
  runSteps,
} from "./index";

const HELP = `Usage: npm run reset:demo -- [options]

  --yes          Required: actually perform the destructive wipe
  --fresh        Regenerate the synthetic CSV before re-running setup
  --keep-data    Skip the setup re-run after the wipe (DB stays empty)
  -h, --help     Show this help message and exit`;

interface CliOptions {
  confirmed: boolean;
  fresh: boolean;
  keepData: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { confirmed: false, fresh: false, keepData: false };
  for (const a of args) {
    if (a === "--yes" || a === "-y") opts.confirmed = true;
    else if (a === "--fresh") opts.fresh = true;
    else if (a === "--keep-data") opts.keepData = true;
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

/**
 * Deletion order chosen so child rows go before parents — SQLite does
 * not enforce FKs the way PG does, but order makes the operation
 * predictable and survives a Postgres swap.
 */
async function wipeDemoTables(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const steps: ReadonlyArray<[string, () => Promise<{ count: number }>]> = [
    ["BaselinePrediction", () => prisma.baselinePrediction.deleteMany({})],
    ["InterventionSimulation", () => prisma.interventionSimulation.deleteMany({})],
    ["CausalEstimate", () => prisma.causalEstimate.deleteMany({})],
    ["CourseFeatureSummary", () => prisma.courseFeatureSummary.deleteMany({})],
    ["RdiScore", () => prisma.rdiScore.deleteMany({})],
    ["WeeklyEngagementSummary", () => prisma.weeklyEngagementSummary.deleteMany({})],
    ["AdvisorNote", () => prisma.advisorNote.deleteMany({})],
    ["Grade", () => prisma.grade.deleteMany({})],
    ["Enrollment", () => prisma.enrollment.deleteMany({})],
    ["ActivityLog", () => prisma.activityLog.deleteMany({})],
    ["Resource", () => prisma.resource.deleteMany({})],
    ["Student", () => prisma.student.deleteMany({})],
    ["Course", () => prisma.course.deleteMany({})],
    ["SyncLog", () => prisma.syncLog.deleteMany({})],
  ];
  for (const [name, fn] of steps) {
    const r = await fn();
    counts[name] = r.count;
  }
  return counts;
}

async function main(): Promise<void> {
  const opts = parseArgs(argv.slice(2));

  console.log("▌ EduRAG reset:demo");
  console.log("");
  console.log("  Plan:");
  console.log("    1. Wipe every LMS-derived table (Student → SyncLog, in dependency order).");
  console.log("    2. Schema + migration history are preserved.");
  if (!opts.keepData) {
    console.log("    3. Re-run `npm run setup` to regenerate a clean demo state.");
    if (opts.fresh) console.log("       (with --fresh: also regenerate the synthetic CSV first)");
  } else {
    console.log("    3. --keep-data: DB will remain empty after the wipe.");
  }
  console.log("");

  if (!opts.confirmed) {
    console.log("  Dry-run: nothing was deleted. Re-run with --yes to apply.");
    await prisma.$disconnect().catch(() => {});
    exit(0);
  }

  console.log("  Wiping…");
  const counts = await wipeDemoTables();
  for (const [name, n] of Object.entries(counts)) {
    console.log(`    [ ok ] ${name.padEnd(28)} ${n.toLocaleString()} rows removed`);
  }
  console.log("");

  if (opts.keepData) {
    console.log("  --keep-data: skipping setup re-run.");
    await prisma.$disconnect().catch(() => {});
    return;
  }

  console.log("▌ Re-running setup");
  const steps = buildSetupSteps({
    freshData: opts.fresh,
    countStudents: () => prisma.student.count().catch(() => 0),
    countEstimates: () => prisma.causalEstimate.count().catch(() => 0),
    countSimulations: () => prisma.interventionSimulation.count().catch(() => 0),
    countPredictions: () => prisma.baselinePrediction.count().catch(() => 0),
  });
  const summary = await runSteps(steps, {
    onStep: (r) => console.log(`  ${renderStepLine(r)}`),
  });
  console.log("");
  console.log(renderSetupSummary(summary));
  await prisma.$disconnect().catch(() => {});
  exit(summary.ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("reset:demo: unexpected failure:", err);
  exit(1);
});
