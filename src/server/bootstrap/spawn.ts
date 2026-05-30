/**
 * Phase 9 — thin spawn wrapper for setup-step orchestration.
 *
 * Each step needs to shell out to `npm`, `npx`, or `python`. Centralising
 * the spawn here means we capture stdout/stderr uniformly, surface a
 * structured error on non-zero exit, and never leave the user staring at
 * a half-printed stack trace.
 *
 * stdio is inherited so `npm install` / `prisma migrate` retain their
 * native terminal output (progress bars, prompts on error). For commands
 * where output is noise (e.g. detection probes), pass `quiet: true`.
 */

import { spawn, type SpawnOptions } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** When true, suppress stdout/stderr from the parent terminal. */
  quiet?: boolean;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Spawn a command, inherit its stdio (or suppress when `quiet`), and
 * reject on non-zero exit.
 *
 * On Windows the npm / npx executables are batch files, so we set
 * `shell: true` so PATH lookups behave the same way they would in a
 * developer terminal.
 */
export async function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const start = Date.now();
  return new Promise<CommandResult>((resolveP, rejectP) => {
    const spawnOpts: SpawnOptions = {
      stdio: options.quiet ? "ignore" : "inherit",
      shell: true,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    };
    const display = `${command} ${args.join(" ")}`.trim();
    const child = spawn(command, args as string[], spawnOpts);
    child.on("error", (err) => {
      rejectP(new Error(`Failed to spawn \`${display}\`: ${err.message}`));
    });
    child.on("exit", (code) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0) {
        rejectP(
          new Error(
            `\`${display}\` exited with code ${exitCode}. Re-run the command directly to see its output.`,
          ),
        );
        return;
      }
      resolveP({ command: display, exitCode, durationMs: Date.now() - start });
    });
  });
}
