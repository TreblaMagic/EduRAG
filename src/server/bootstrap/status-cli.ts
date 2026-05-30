/**
 * `npm run status` — concise data-state snapshot.
 *
 * Lightweight cousin of `doctor`. Skips environment checks; focuses on
 * the row counts so you can answer "did the seed finish? are there
 * predictions yet?" without scrolling through the full doctor output.
 *
 *   npm run status
 *   npm run status -- --json
 */

import { argv, exit } from "node:process";

import { dataChecks, dbChecks, renderCheckGroups } from "./index";

const HELP = `Usage: npm run status -- [options]

  --json       Emit machine-readable JSON to stdout (in addition to logs)
  -h, --help   Show this help message and exit`;

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    exit(0);
  }
  const wantJson = args.includes("--json");

  const prismaModule = await import("../../lib/db").catch(() => null);
  const prisma = prismaModule?.prisma ?? null;

  const groups = [await dbChecks(prisma), dataChecks()];
  console.log("▌ EduRAG status");
  console.log("");
  console.log(renderCheckGroups(groups));

  if (wantJson) process.stdout.write(`\n${JSON.stringify(groups, null, 2)}\n`);

  await prisma?.$disconnect().catch(() => {});
}

main().catch((err: unknown) => {
  console.error("status: unexpected failure:", err);
  exit(1);
});
