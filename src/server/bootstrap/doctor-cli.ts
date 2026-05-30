/**
 * `npm run doctor` — environment + data + feature health check.
 *
 * Read-only. Prints a structured report of:
 *
 *   - Environment   (Node version, npm install, .env, Python)
 *   - Database      (Prisma client, SQLite file, row counts per table)
 *   - Data files    (synthetic CSV, Shell University seed)
 *   - Optional features (advanced causal engine, advanced prediction engine, reports)
 *
 * Exit code: 0 when everything that *must* work is fine (warnings don't
 * fail). Non-zero when something is missing or errored — so the doctor
 * can be wired into CI as a basic smoke check.
 *
 *   npm run doctor
 *   npm run doctor -- --json
 */

import { argv, exit } from "node:process";

import {
  countByStatus,
  dataChecks,
  dbChecks,
  envChecks,
  featureChecks,
  isHealthy,
  renderCheckGroups,
} from "./index";

const HELP = `Usage: npm run doctor -- [options]

  --json       Emit machine-readable JSON to stdout (in addition to logs)
  -h, --help   Show this help message and exit`;

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    exit(0);
  }
  const wantJson = args.includes("--json");
  const unknown = args.find((a) => a !== "--json");
  if (unknown) {
    console.error(`error: unknown flag ${unknown}`);
    console.error(HELP);
    exit(2);
  }

  console.log("▌ EduRAG doctor — read-only health check");
  console.log("");

  // Lazy-load Prisma so the doctor still works when the client isn't generated.
  const prismaModule = await import("../../lib/db").catch(() => null);
  const prisma = prismaModule?.prisma ?? null;

  const groups = [
    await envChecks(),
    await dbChecks(prisma),
    dataChecks(),
    await featureChecks(),
  ];

  console.log(renderCheckGroups(groups));
  console.log("");

  const counts = countByStatus(groups);
  console.log(
    `  Summary: ${counts.ok} ok · ${counts.warn} warn · ${counts.missing} missing · ${counts.error} error`,
  );
  const healthy = isHealthy(groups);
  if (!healthy) {
    console.log("");
    console.log("  → One or more required checks failed. Run `npm run setup` to fix.");
  }

  if (wantJson) {
    process.stdout.write(`\n${JSON.stringify(groups, null, 2)}\n`);
  }

  await prisma?.$disconnect().catch(() => {});
  exit(healthy ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("doctor: unexpected failure:", err);
  exit(1);
});
