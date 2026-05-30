/**
 * `npm run causal:discover` entry point.
 *
 *   npm run causal:discover                            # default course (CS-201), baseline TS engine
 *   npm run causal:discover -- --course CS-201
 *   npm run causal:discover -- --engine advanced       # use the Python worker (causal-learn) if present
 *   npm run causal:discover -- --alpha 0.01
 *   npm run causal:discover -- --json
 */

import { argv, exit } from "node:process";

import type { EngineName } from "../../features/causal-engine";
import { prisma } from "../../lib/db";
import { log } from "../../lib/logger";
import { runCausalDiscovery } from "./run-discovery";

interface CliOptions {
  course: string;
  engine: EngineName;
  alpha: number;
  json: boolean;
}

const HELP = `Usage: npm run causal:discover -- [options]

  --course CODE     Course code to analyse (default: CS-201)
  --engine NAME     Discovery engine: baseline | advanced (default: baseline)
                    Advanced uses causal-learn's PC if the Python worker is installed.
  --alpha FLOAT     Significance level for the independence tests (default: 0.05)
  --json            Emit machine-readable JSON to stdout
  -h, --help        Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    course: "CS-201",
    engine: "baseline",
    alpha: 0.05,
    json: false,
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
    } else if (flag === "--alpha") {
      const next = args[++i];
      const f = Number.parseFloat(next ?? "");
      if (!Number.isFinite(f) || f <= 0 || f >= 1) {
        console.error("error: --alpha must be a number in (0, 1)");
        exit(2);
      }
      opts.alpha = f;
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
    `Running causal discovery for ${opts.course} (engine=${opts.engine}, alpha=${opts.alpha})`,
  );
  const result = await runCausalDiscovery(prisma, opts.course, {
    engine: opts.engine,
    alpha: opts.alpha,
  });
  log.info(
    `Discovery (${result.engineResolved}/${result.algorithm}): ${result.edges.length} edges, ` +
      `shared=${result.diff.shared.length}, manualOnly=${result.diff.manualOnly.length}, discoveredOnly=${result.diff.discoveredOnly.length}, ` +
      `tests=${result.independenceTests}, durationMs=${result.durationMs}`,
  );
  for (const w of result.warnings) log.warn(w);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main()
  .catch((err: unknown) => {
    log.error("Causal discovery failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
