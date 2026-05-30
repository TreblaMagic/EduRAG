/**
 * `npm run db:ingest` entry point.
 *
 *   npm run db:ingest                          # ingest + derive (default CSV)
 *   npm run db:ingest -- --csv path/to.csv     # alternate source
 *   npm run db:ingest -- --skip-derive         # ingest only, skip weekly/RDI
 */

import { argv, exit } from "node:process";
import { resolve } from "node:path";

import { prisma } from "../../lib/db";
import { log } from "../../lib/logger";
import { deriveCourseFeatures } from "../causal/derive-features";
import { ingestCsv } from "./ingest-csv";
import { deriveAllSummaries } from "./derive-summaries";

interface CliOptions {
  csv: string;
  skipDerive: boolean;
}

const HELP = `Usage: npm run db:ingest -- [--csv PATH] [--skip-derive]

  --csv PATH      Source CSV file (default: data/raw/sample_lms_data.csv)
  --skip-derive   Ingest raw rows only; skip weekly summaries and RDI scores
  -h, --help      Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    csv: "data/raw/sample_lms_data.csv",
    skipDerive: false,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--csv" || flag === "-c") {
      const next = args[++i];
      if (!next) {
        console.error("error: --csv requires a path argument");
        exit(2);
      }
      opts.csv = next;
    } else if (flag === "--skip-derive") {
      opts.skipDerive = true;
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
  const csvPath = resolve(opts.csv);

  log.info(`Ingesting ${csvPath}`);
  const ingest = await ingestCsv(csvPath, prisma);
  log.info("Ingest summary:", ingest);

  if (opts.skipDerive) {
    log.info("Skipping derivation step (--skip-derive)");
    return;
  }

  log.info("Computing weekly summaries and RDI scores...");
  const derive = await deriveAllSummaries(prisma);
  log.info("Derivation summary:", derive);

  log.info("Computing per-(student, course) feature rows...");
  const features = await deriveCourseFeatures(prisma);
  log.info("Course feature summary:", features);
}

main()
  .catch((err: unknown) => {
    log.error("Ingestion failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
