/**
 * Phase 12B pipeline — pure function form.
 *
 * Split out from `prisma/seed.ts` so importers (the Phase 12C
 * `/api/admin/reseed` route) can pull in `runFreshSeed` without
 * accidentally triggering the top-level `main()` execution that
 * the `prisma db seed` entry point relies on.
 *
 * Calls the underlying TS pipeline functions directly (no
 * `child_process` spawn) so it works inside a Vercel build and
 * inside a serverless route handler.
 *
 *   ingestCsv → deriveAllSummaries → deriveCourseFeatures
 *     → runCausalEstimates → runSimulations → trainAndPredict
 *     → (optional) syncFromShellUniversity → re-derive
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { PrismaClient } from "@prisma/client";

import { deriveCourseFeatures } from "../src/server/causal/derive-features";
import { runCausalEstimates } from "../src/server/causal/run-estimates";
import { runSimulations } from "../src/server/causal/run-simulations";
import { deriveAllSummaries } from "../src/server/ingest/derive-summaries";
import { ingestCsv } from "../src/server/ingest/ingest-csv";
import { trainAndPredict } from "../src/server/prediction/train-and-predict";
import { createDirectClient } from "../src/server/sync/shell-university/client";
import {
  ALL_ENTITIES,
  syncFromShellUniversity,
} from "../src/server/sync/shell-university/sync";

const ROOT = process.cwd();
const CSV_PATH = resolve(ROOT, "data", "raw", "sample_lms_data.csv");
const SHELL_DIR = resolve(ROOT, "data", "shell-university");
const COURSE_CODE = "CS-201";

export async function runFreshSeed(prisma: PrismaClient): Promise<void> {
  if (!existsSync(CSV_PATH)) {
    throw new Error(
      `[seed] missing CSV at ${CSV_PATH}. ` +
        `Commit data/raw/sample_lms_data.csv (Phase 12B ships it via the .gitignore exemption) ` +
        `or run \`npm run data:generate\` locally before invoking the seed.`,
    );
  }

  console.log(`[seed] ingesting ${CSV_PATH}`);
  const ingest = await ingestCsv(CSV_PATH, prisma);
  console.log(`[seed] ingest:`, ingest);

  console.log(`[seed] deriving weekly summaries + RDI scores`);
  const weekly = await deriveAllSummaries(prisma);
  console.log(`[seed] weekly:`, weekly);

  console.log(`[seed] deriving per-(student, course) features`);
  const features = await deriveCourseFeatures(prisma);
  console.log(`[seed] features:`, features);

  console.log(`[seed] running causal estimates for ${COURSE_CODE}`);
  const estimates = await runCausalEstimates(prisma, COURSE_CODE, {
    engine: "baseline",
    extendedRefutations: false,
  });
  console.log(
    `[seed] estimates: ${estimates.results.length} treatments, ` +
      `engine=${estimates.engineResolved}`,
  );

  console.log(`[seed] running intervention simulations for ${COURSE_CODE}`);
  const sims = await runSimulations(prisma, { courseCode: COURSE_CODE });
  console.log(
    `[seed] simulations: ${sims.simulationsWritten} rows, ` +
      `${sims.studentsProcessed} students processed`,
  );

  console.log(`[seed] training + predicting baseline ML for ${COURSE_CODE}`);
  const predict = await trainAndPredict(prisma, COURSE_CODE, {
    engine: "baseline",
    modelType: "logistic",
    threshold: 0.5,
  });
  console.log(
    `[seed] prediction: ${predict.rowsWritten} rows, ` +
      `accuracy=${(predict.trainAccuracy * 100).toFixed(1)}%`,
  );

  if (existsSync(SHELL_DIR)) {
    console.log(`[seed] syncing Shell University (direct, full scope)`);
    const client = createDirectClient();
    const sync = await syncFromShellUniversity(prisma, client, {
      scope: [...ALL_ENTITIES],
    });
    const entityCount = Object.keys(sync.byEntity).length;
    console.log(
      `[seed] shell-university: status=${sync.status}, entities=${entityCount}`,
    );
    if (sync.status !== "failed" && sync.scope.includes("lms-events")) {
      console.log(`[seed] re-deriving after Shell University sync`);
      await deriveAllSummaries(prisma);
      await deriveCourseFeatures(prisma);
    }
  } else {
    console.log(
      `[seed] skipping Shell University sync (no ${SHELL_DIR}; ` +
        `commit data/shell-university/*.json to enable it)`,
    );
  }

  console.log(`[seed] done.`);
}
