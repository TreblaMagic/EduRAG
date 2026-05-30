/**
 * `npm run causal:estimate` entry point.
 *
 *   npm run causal:estimate                                  # default course (CS-201), baseline engine
 *   npm run causal:estimate -- --course CS-201
 *   npm run causal:estimate -- --engine advanced             # try Python worker, fall back if absent
 *   npm run causal:estimate -- --extended                    # also run subset/bootstrap/sensitivity/outcome
 *   npm run causal:estimate -- --course CS-201 --json
 *
 * Reads from the persisted `CourseFeatureSummary` table — run
 * `npm run db:ingest` first to populate it.
 */

import { argv, exit } from "node:process";

import type { EngineName } from "../../features/causal-engine";
import { prisma } from "../../lib/db";
import { log } from "../../lib/logger";
import { runCausalEstimates } from "./run-estimates";

interface CliOptions {
  course: string;
  json: boolean;
  engine: EngineName;
  extended: boolean;
}

const HELP = `Usage: npm run causal:estimate -- [options]

  --course CODE     Course code to analyse (default: CS-201)
  --engine NAME     Estimation engine: baseline | advanced (default: baseline)
                    Advanced requires the optional Python worker; falls back
                    to baseline with a warning if unavailable.
  --extended        Run extended refutation checks (subset robustness, bootstrap
                    stability, adjustment-set sensitivity, outcome permutation).
  --json            Emit machine-readable JSON to stdout (in addition to logs)
  -h, --help        Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    course: "CS-201",
    json: false,
    engine: "baseline",
    extended: false,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--course" || flag === "-c") {
      const next = args[++i];
      if (!next) {
        console.error("error: --course requires a code");
        exit(2);
      }
      opts.course = next;
    } else if (flag === "--engine") {
      const next = args[++i];
      if (next !== "baseline" && next !== "advanced") {
        console.error("error: --engine must be baseline or advanced");
        exit(2);
      }
      opts.engine = next;
    } else if (flag === "--extended") {
      opts.extended = true;
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
  log.info(
    `Running causal estimates for ${opts.course} (engine=${opts.engine}, extended=${opts.extended})`,
  );

  const summary = await runCausalEstimates(prisma, opts.course, {
    engine: opts.engine,
    extendedRefutations: opts.extended,
  });
  log.info("Causal estimates complete:", summary);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
}

main()
  .catch((err: unknown) => {
    log.error("Causal estimation failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
