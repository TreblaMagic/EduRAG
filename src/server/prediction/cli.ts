/**
 * `npm run ml:predict` entry point — trains the baseline prediction model
 * on the cohort's feature table and persists one row per student.
 *
 * Single CLI covers both "train" and "predict" because there is no value
 * in persisting the model artefact for the demo cohort (train + predict
 * costs < 1 s on 250 students × 7 features). When the dataset grows or a
 * heavier model is added, split this into separate `ml:train` and
 * `ml:predict` CLIs.
 *
 *   npm run ml:predict
 *   npm run ml:predict -- --course CS-201
 *   npm run ml:predict -- --threshold 0.4 --json
 *   npm run ml:predict -- --engine advanced     # falls back to baseline with a warning today
 */

import { argv, exit } from "node:process";

import type { ModelType, PredictionEngineName } from "@/features/baseline-ml";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { trainAndPredict } from "./train-and-predict";

interface CliOptions {
  course: string;
  engine: PredictionEngineName;
  modelType: ModelType;
  threshold: number;
  json: boolean;
}

const HELP = `Usage: npm run ml:predict -- [options]

  --course CODE     Course code to analyse (default: CS-201)
  --engine NAME     Prediction engine: baseline | advanced (default: baseline)
                    Advanced is a Phase 9 hook; it currently falls back with a warning.
  --model TYPE      Model type: logistic (only supported value today)
  --threshold P     Probability threshold for the at-risk class (default: 0.5)
  --json            Emit machine-readable JSON to stdout
  -h, --help        Show this help message and exit`;

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    course: "CS-201",
    engine: "baseline",
    modelType: "logistic",
    threshold: 0.5,
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
    } else if (flag === "--model") {
      const next = args[++i];
      if (next !== "logistic" && next !== "random_forest" && next !== "gradient_boosting") {
        console.error(
          "error: --model must be logistic | random_forest | gradient_boosting",
        );
        exit(2);
      }
      opts.modelType = next;
    } else if (flag === "--threshold") {
      const next = args[++i];
      const f = Number.parseFloat(next ?? "");
      if (!Number.isFinite(f) || f <= 0 || f >= 1) {
        console.error("error: --threshold must be a number in (0, 1)");
        exit(2);
      }
      opts.threshold = f;
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
    `Running baseline prediction for ${opts.course} (engine=${opts.engine}, model=${opts.modelType}, threshold=${opts.threshold})`,
  );

  const summary = await trainAndPredict(prisma, opts.course, {
    engine: opts.engine,
    modelType: opts.modelType,
    threshold: opts.threshold,
  });
  log.info(
    `Baseline prediction complete: n=${summary.sampleSize}, ` +
      `at-risk=${summary.riskDistribution.atRisk}, borderline=${summary.riskDistribution.borderline}, ` +
      `on-track=${summary.riskDistribution.onTrack}, ` +
      `log-loss=${summary.trainLogLoss}, acc=${(summary.trainAccuracy * 100).toFixed(1)}%, ` +
      `durationMs=${summary.durationMs}`,
  );
  for (const w of summary.warnings) log.warn(w);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
}

main()
  .catch((err: unknown) => {
    log.error("Baseline prediction failed:", err);
    exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
