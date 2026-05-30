/**
 * `npm run causal:report` entry point.
 *
 *   npm run causal:report                                    # default course (CS-201), Markdown to stdout
 *   npm run causal:report -- --course CS-201 --format json
 *   npm run causal:report -- --course CS-201 --out docs/reports/cs-201.md
 *   npm run causal:report -- --discovery --engine advanced
 *
 * Reads from persisted `CausalEstimate` rows, so run `npm run causal:estimate`
 * first. `--discovery` runs the PC discovery experiment live.
 */

import { writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

import {
  renderJsonReport,
  renderMarkdownReport,
  type EngineName,
} from "../../features/causal-engine";
import { prisma } from "../../lib/db";
import { log } from "../../lib/logger";
import { buildCausalReport } from "./build-report";

type Format = "markdown" | "json";

interface CliOptions {
  course: string;
  format: Format;
  out: string | null;
  discovery: boolean;
  prediction: boolean;
  tracking: boolean;
  engine: EngineName;
}

const HELP = `Usage: npm run causal:report -- [options]

  --course CODE         Course code (default: CS-201)
  --format FMT          Output format: markdown | json (default: markdown)
  --out PATH            Write the report to PATH instead of stdout
  --discovery           Run causal discovery and include the comparison section
  --prediction          Include the baseline prediction comparison section (Phase 8)
  --tracking            Include the intervention tracking summary section (Phase 11)
  --engine NAME         Discovery engine: baseline | advanced (default: baseline)
  -h, --help            Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    course: "CS-201",
    format: "markdown",
    out: null,
    discovery: false,
    prediction: false,
    tracking: false,
    engine: "baseline",
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
    } else if (flag === "--format") {
      const next = args[++i];
      if (next !== "markdown" && next !== "json") {
        console.error("error: --format must be markdown or json");
        exit(2);
      }
      opts.format = next;
    } else if (flag === "--out") {
      const next = args[++i];
      if (!next) {
        console.error("error: --out requires a path");
        exit(2);
      }
      opts.out = next;
    } else if (flag === "--discovery") {
      opts.discovery = true;
    } else if (flag === "--prediction") {
      opts.prediction = true;
    } else if (flag === "--tracking") {
      opts.tracking = true;
    } else if (flag === "--engine") {
      const next = args[++i];
      if (next !== "baseline" && next !== "advanced") {
        console.error("error: --engine must be baseline or advanced");
        exit(2);
      }
      opts.engine = next;
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
    `Building causal report for ${opts.course} (format=${opts.format}, discovery=${opts.discovery})`,
  );

  const report = await buildCausalReport(prisma, opts.course, {
    includeDiscovery: opts.discovery,
    discoveryEngine: opts.engine,
    includePrediction: opts.prediction,
    includeTracking: opts.tracking,
  });
  const body =
    opts.format === "markdown" ? renderMarkdownReport(report) : renderJsonReport(report);

  if (opts.out) {
    writeFileSync(opts.out, body, "utf8");
    log.info(`Wrote ${body.length} bytes to ${opts.out}`);
  } else {
    process.stdout.write(body);
  }
}

main()
  .catch((err: unknown) => {
    log.error("Report generation failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
