/**
 * Phase 9 — environment / data / feature checks.
 *
 * Used by `doctor`, `status`, and `setup` to decide whether each step
 * needs to run. Every check is read-only and returns a structured
 * {@link CheckResult} so the renderer can group + colour + format them
 * consistently.
 *
 * Optional dependencies (Python, the advanced engine, generated reports)
 * never fail a check — they downgrade to `warn` or `missing` with a
 * fix hint so the app remains usable without them.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import type { PrismaClient } from "@prisma/client";

import type { CheckGroup, CheckResult } from "./types";

const ROOT = process.cwd();

// ---- Environment ----------------------------------------------------------

export async function envChecks(): Promise<CheckGroup> {
  const node = process.version;
  const nodeMajor = Number.parseInt(node.replace(/^v/, "").split(".")[0] ?? "0", 10);
  const nodeOk: CheckResult = {
    id: "env.node",
    label: "Node.js",
    status: nodeMajor >= 20 ? "ok" : "warn",
    detail: `${node} (need ≥ v20 for Next.js 15)`,
    hint: nodeMajor >= 20 ? undefined : "Install Node.js 20+ — https://nodejs.org/",
  };

  const npmModulesOk = existsSync(resolve(ROOT, "node_modules", "next"));
  const npmCheck: CheckResult = {
    id: "env.npm",
    label: "npm dependencies",
    status: npmModulesOk ? "ok" : "missing",
    detail: npmModulesOk ? "installed" : "node_modules not found",
    hint: npmModulesOk ? undefined : "Run `npm install`",
  };

  const envFile = existsSync(resolve(ROOT, ".env"));
  const envExample = existsSync(resolve(ROOT, ".env.example"));
  const envCheck: CheckResult = {
    id: "env.dotenv",
    label: ".env file",
    status: envFile ? "ok" : envExample ? "warn" : "warn",
    detail: envFile ? "found" : "missing (defaults will be used)",
    hint: envFile ? undefined : "Copy `.env.example` to `.env` for local overrides",
  };

  const pythonProbe = await probePython();

  return {
    group: "Environment",
    results: [nodeOk, npmCheck, envCheck, pythonProbe],
  };
}

// ---- Database -------------------------------------------------------------

export interface DbCheckOptions {
  prismaClientPath?: string;
  databaseUrl?: string;
}

export async function dbChecks(
  prisma: PrismaClient | null,
  options: DbCheckOptions = {},
): Promise<CheckGroup> {
  const clientPath =
    options.prismaClientPath ?? resolve(ROOT, "node_modules", ".prisma", "client");
  const clientOk = existsSync(clientPath);
  const clientCheck: CheckResult = {
    id: "db.prisma-client",
    label: "Prisma client",
    status: clientOk ? "ok" : "missing",
    detail: clientOk ? "generated" : "not generated",
    hint: clientOk ? undefined : "Run `npm run prisma:generate`",
  };

  const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbFilePath = dbUrl.startsWith("file:")
    ? resolve(ROOT, dbUrl.slice("file:".length))
    : null;
  const dbExists = dbFilePath ? existsSync(dbFilePath) : false;
  const dbFileCheck: CheckResult = {
    id: "db.file",
    label: "SQLite database",
    status: dbExists ? "ok" : "missing",
    detail: dbFilePath
      ? `${dbExists ? "found" : "not found"} at ${relativeFromRoot(dbFilePath)}`
      : "non-file URL — assumed remote",
    hint: dbExists
      ? undefined
      : "Run `npx prisma migrate deploy` (or `npm run setup` to do everything)",
  };

  const results: CheckResult[] = [clientCheck, dbFileCheck];

  if (prisma && clientOk && dbExists) {
    try {
      const [students, courses, weekly, estimates, simulations, predictions, syncs] =
        await Promise.all([
          prisma.student.count(),
          prisma.course.count(),
          prisma.weeklyEngagementSummary.count(),
          prisma.causalEstimate.count(),
          prisma.interventionSimulation.count(),
          prisma.baselinePrediction.count(),
          prisma.syncLog.count(),
        ]);
      results.push(rowCount("data.students", "Students", students, "students"));
      results.push(rowCount("data.courses", "Courses", courses, "courses"));
      results.push(rowCount("data.weekly", "Weekly engagement summaries", weekly, "rows"));
      results.push(rowCount("data.estimates", "Causal estimates", estimates, "rows"));
      results.push(rowCount("data.sims", "Intervention simulations", simulations, "rows"));
      results.push(rowCount("data.predictions", "Baseline predictions", predictions, "rows"));
      results.push(rowCount("data.syncs", "Sync log rows", syncs, "rows"));
    } catch (e) {
      results.push({
        id: "data.counts",
        label: "Prisma row counts",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
        hint: "Migrations may be out of date. Run `npx prisma migrate deploy`.",
      });
    }
  } else if (clientOk && dbExists) {
    results.push({
      id: "data.counts",
      label: "Prisma row counts",
      status: "warn",
      detail: "skipped (Prisma client not provided)",
    });
  }

  return { group: "Database", results };
}

// ---- Data files -----------------------------------------------------------

export function dataChecks(): CheckGroup {
  const csvPath = resolve(ROOT, "data", "raw", "sample_lms_data.csv");
  const csv = existsSync(csvPath);
  const csvSize = csv ? humanBytes(statSync(csvPath).size) : "0 B";
  const csvCheck: CheckResult = {
    id: "data.csv",
    label: "Synthetic CSV",
    status: csv ? "ok" : "missing",
    detail: csv ? `${csvSize} at ${relativeFromRoot(csvPath)}` : "not generated",
    hint: csv ? undefined : "Run `npm run data:generate`",
  };

  const shellSeedPath = resolve(ROOT, "data", "raw", "shell-university");
  const shellSeeded = existsSync(shellSeedPath);
  const shellCheck: CheckResult = {
    id: "data.shell-seed",
    label: "Shell University seed",
    status: shellSeeded ? "ok" : "warn",
    detail: shellSeeded ? "seeded" : "not seeded (optional)",
    hint: shellSeeded ? undefined : "Run `npm run shell:seed` to enable the mock LMS demo",
  };

  return { group: "Data files", results: [csvCheck, shellCheck] };
}

// ---- Feature availability -------------------------------------------------

export async function featureChecks(): Promise<CheckGroup> {
  const pythonAvailable = (await probePython()).status === "ok";
  const workerPath = resolve(ROOT, "python", "causal-worker", "worker.py");
  const workerExists = existsSync(workerPath);

  const advancedCausal: CheckResult = {
    id: "feature.advanced-causal",
    label: "Advanced causal engine (DoWhy + causal-learn)",
    status: pythonAvailable && workerExists ? "ok" : "warn",
    detail: !workerExists
      ? "worker missing"
      : pythonAvailable
        ? "Python detected + worker present"
        : "Python not on PATH — falls back to TS baseline",
    hint:
      !workerExists
        ? "Re-add python/causal-worker/worker.py"
        : pythonAvailable
          ? undefined
          : "Install Python 3.10+ and run `pip install -r python/causal-worker/requirements.txt`",
  };

  const advancedPredict: CheckResult = {
    id: "feature.advanced-prediction",
    label: "Advanced prediction engine (sklearn random forest)",
    status: pythonAvailable && workerExists ? "ok" : "warn",
    detail:
      pythonAvailable && workerExists
        ? "available via the Python worker"
        : "TS logistic baseline only",
    hint:
      pythonAvailable && workerExists
        ? undefined
        : "Same install as the advanced causal engine — see python/causal-worker/README.md",
  };

  const reportsDir = resolve(ROOT, "docs", "reports");
  const reportsExist = existsSync(reportsDir);
  const reports: CheckResult = {
    id: "feature.reports",
    label: "Generated reports directory",
    status: reportsExist ? "ok" : "warn",
    detail: reportsExist ? `present at ${relativeFromRoot(reportsDir)}` : "not yet populated",
    hint: reportsExist
      ? undefined
      : "Run `npm run causal:report -- --discovery --prediction --out docs/reports/cs-201.md`",
  };

  return { group: "Optional features", results: [advancedCausal, advancedPredict, reports] };
}

// ---- helpers --------------------------------------------------------------

function rowCount(
  id: string,
  label: string,
  count: number,
  noun: string,
): CheckResult {
  return {
    id,
    label,
    status: count > 0 ? "ok" : "missing",
    detail: `${count.toLocaleString()} ${noun}`,
    hint: count > 0 ? undefined : "Run `npm run setup` (or the per-phase CLI listed in docs/Plan.md)",
  };
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function relativeFromRoot(p: string): string {
  return p.startsWith(ROOT) ? p.slice(ROOT.length).replace(/^[\\/]/, "") : p;
}

async function probePython(): Promise<CheckResult> {
  const cmd = await detectPythonInterpreter();
  return {
    id: "env.python",
    label: "Python interpreter (optional)",
    status: cmd ? "ok" : "warn",
    detail: cmd ? `${cmd} on PATH` : "not detected",
    hint: cmd
      ? undefined
      : "Advanced engines require Python 3.10+; the app runs without it.",
  };
}

function detectPythonInterpreter(): Promise<string | null> {
  const try1 = tryRun("python", ["--version"]);
  return try1.then((ok) => (ok ? "python" : tryRun("python3", ["--version"]).then((ok2) => (ok2 ? "python3" : null))));
}

function tryRun(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((res) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: "ignore" });
    } catch {
      res(false);
      return;
    }
    const t = setTimeout(() => {
      child.kill();
      res(false);
    }, 1500);
    child.on("error", () => {
      clearTimeout(t);
      res(false);
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      res(code === 0);
    });
  });
}
