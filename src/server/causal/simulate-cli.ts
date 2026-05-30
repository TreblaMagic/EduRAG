/**
 * `npm run causal:simulate` entry point.
 *
 *   npm run causal:simulate                                # course-wide
 *   npm run causal:simulate -- --course CS-201
 *   npm run causal:simulate -- --student STU-0042         # single student
 *   npm run causal:simulate -- --top 3                    # top-N per student
 *   npm run causal:simulate -- --json                     # machine-readable
 *
 * Only touches `InterventionSimulation` rows for the in-scope course (and
 * student, if specified). Raw activity, weekly summaries, course features,
 * and causal estimates are never altered.
 */

import { argv, exit } from "node:process";

import { prisma } from "../../lib/db";
import { log } from "../../lib/logger";
import { runSimulations } from "./run-simulations";

interface CliOptions {
  course: string;
  student?: string;
  topN?: number;
  json: boolean;
}

const HELP = `Usage: npm run causal:simulate -- [--course CODE] [--student EXT_ID] [--top N] [--json]

  --course CODE       Course code to simulate (default: CS-201)
  --student EXT_ID    Limit to one student by externalId (e.g. STU-0042)
  --top N             Persist only the top-N ranked interventions per student
  --json              Emit machine-readable JSON summary to stdout
  -h, --help          Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { course: "CS-201", json: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--course" || flag === "-c") {
      const next = args[++i];
      if (!next) {
        console.error("error: --course requires a code");
        exit(2);
      }
      opts.course = next;
    } else if (flag === "--student" || flag === "-s") {
      const next = args[++i];
      if (!next) {
        console.error("error: --student requires an externalId");
        exit(2);
      }
      opts.student = next;
    } else if (flag === "--top") {
      const next = args[++i];
      if (!next) {
        console.error("error: --top requires an integer");
        exit(2);
      }
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1) {
        console.error(`error: --top must be a positive integer, got ${next}`);
        exit(2);
      }
      opts.topN = n;
    } else if (flag === "--json") {
      opts.json = true;
    } else if (flag === "--help" || flag === "-h") {
      console.log(HELP);
      exit(0);
    } else {
      console.error(`error: unknown flag ${flag}`);
      console.error(HELP);
      exit(2);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(argv.slice(2));
  const scope = opts.student
    ? `student ${opts.student} in course ${opts.course}`
    : `course ${opts.course}`;
  log.info(`Running intervention simulations for ${scope}`);

  const summary = await runSimulations(prisma, {
    courseCode: opts.course,
    studentExternalId: opts.student,
    topN: opts.topN,
  });
  log.info("Simulation summary:", summary);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
}

main()
  .catch((err: unknown) => {
    log.error("Simulation failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
