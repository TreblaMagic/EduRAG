/**
 * `npm run shell:seed` entry point.
 *
 *   npm run shell:seed
 *   npm run shell:seed -- --seed 99 --term 2026-SUMMER
 *   npm run shell:seed -- --csv data/raw/other.csv --drop 0.05
 */

import { argv, exit } from "node:process";
import { resolve } from "node:path";

import { log } from "../../lib/logger";
import { seedShellUniversity } from "./seed";

interface CliOptions {
  csvPath: string | undefined;
  outDir: string | undefined;
  seed: number;
  termLabel: string | undefined;
  eventDropFraction: number;
}

const HELP = `Usage: npm run shell:seed -- [options]

  --csv PATH            Source CSV (default: data/raw/sample_lms_data.csv)
  --out DIR             Output directory (default: data/shell-university)
  --seed N              RNG seed for names and notes (default: 42)
  --term LABEL          Term label (default: 2026-SPRING)
  --drop FRACTION       Skip ~FRACTION of events to simulate drift (default: 0)
  -h, --help            Show this help and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    csvPath: undefined,
    outDir: undefined,
    seed: 42,
    termLabel: undefined,
    eventDropFraction: 0,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--csv") {
      const next = args[++i];
      if (!next) { console.error("error: --csv requires a path"); exit(2); }
      opts.csvPath = resolve(next);
    } else if (flag === "--out") {
      const next = args[++i];
      if (!next) { console.error("error: --out requires a directory"); exit(2); }
      opts.outDir = resolve(next);
    } else if (flag === "--seed") {
      const next = args[++i];
      const n = Number(next);
      if (!Number.isInteger(n)) { console.error(`error: --seed must be integer, got ${next}`); exit(2); }
      opts.seed = n;
    } else if (flag === "--term") {
      const next = args[++i];
      if (!next) { console.error("error: --term requires a label"); exit(2); }
      opts.termLabel = next;
    } else if (flag === "--drop") {
      const next = args[++i];
      const f = Number(next);
      if (!Number.isFinite(f) || f < 0 || f >= 1) {
        console.error(`error: --drop must be in [0, 1), got ${next}`);
        exit(2);
      }
      opts.eventDropFraction = f;
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

function main(): void {
  const opts = parseArgs(argv.slice(2));
  log.info("Seeding Shell University mock store…");
  const result = seedShellUniversity({
    csvPath: opts.csvPath,
    outDir: opts.outDir,
    seed: opts.seed,
    termLabel: opts.termLabel,
    eventDropFraction: opts.eventDropFraction,
  });
  log.info(`Seeded version=${result.dataVersion} term=${result.termLabel} into ${result.outDir}`);
  log.info("Entity counts:");
  for (const [entity, n] of Object.entries(result.counts)) {
    log.info(`  ${entity.padEnd(16)} ${n}`);
  }
}

try {
  main();
} catch (err) {
  log.error("Shell seed failed:", err);
  exit(1);
}
