/**
 * Phase 7 — Python worker availability probe.
 *
 * All Node-only modules (`node:child_process`, `node:fs`, `node:path`) are
 * loaded **dynamically inside the functions** so this file remains safe to
 * sit in a module graph reachable from a client component. Webpack only
 * traces static `import` statements; the dynamic-string `require` here is
 * opaque to bundlers and is never executed during a client render.
 *
 * Failure modes that count as "unavailable":
 *   - No `python` / `python3` on PATH.
 *   - Spawn errors of any kind.
 *   - Process exit code ≠ 0.
 *   - Timeout (default 1500 ms — generous; cold-start on Windows is slow).
 *
 * The probe also verifies the worker entry-point file exists. If `python`
 * is installed but the worker source is missing (e.g. the consumer deleted
 * `/python/`), we still report unavailable rather than crashing later.
 */

const PROBE_TIMEOUT_MS = 1500;

export interface PythonAvailability {
  available: boolean;
  interpreter: string | null;
  workerEntry: string;
  reason?: string;
}

let cached: PythonAvailability | null = null;

export async function probePythonWorker(
  force = false,
): Promise<PythonAvailability> {
  if (cached && !force) return cached;
  const entry = workerEntryPath();
  const fs = loadNode("fs") as typeof import("node:fs");
  if (!fs.existsSync(entry)) {
    cached = {
      available: false,
      interpreter: null,
      workerEntry: entry,
      reason: `Worker entry not found at ${entry}.`,
    };
    return cached;
  }
  const interpreter = await detectInterpreter();
  if (!interpreter) {
    cached = {
      available: false,
      interpreter: null,
      workerEntry: entry,
      reason: "No Python interpreter found on PATH (tried python, python3).",
    };
    return cached;
  }
  cached = {
    available: true,
    interpreter,
    workerEntry: entry,
  };
  return cached;
}

/** Force the next call to re-probe (used by tests). */
export function resetPythonAvailabilityCache(): void {
  cached = null;
}

export function workerEntryPath(): string {
  const path = loadNode("path") as typeof import("node:path");
  return path.resolve(process.cwd(), "python", "causal-worker", "worker.py");
}

async function detectInterpreter(): Promise<string | null> {
  for (const candidate of ["python", "python3"]) {
    if (await tryInterpreter(candidate)) return candidate;
  }
  return null;
}

function tryInterpreter(cmd: string): Promise<boolean> {
  const cp = loadNode("child_process") as typeof import("node:child_process");
  return new Promise((resolve_) => {
    let child;
    try {
      child = cp.spawn(cmd, ["--version"], { stdio: "ignore" });
    } catch {
      resolve_(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve_(false);
    }, PROBE_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve_(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve_(code === 0);
    });
  });
}

// ---- Node-module loader (bundler-opaque) ----------------------------------

/**
 * Load a Node built-in by composing the specifier at call time. Webpack /
 * Turbopack cannot statically follow this, so this file does not pull the
 * Node-only modules into a client bundle. A throw is the right outcome if
 * this ever runs in a browser context.
 */
function loadNode(name: string): unknown {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error(`Node-only module "${name}" requested in a non-Node runtime.`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req: NodeRequire = eval("require");
  return req(name);
}
