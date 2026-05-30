"use server";

/**
 * Phase 10 — server action for the dataset-mode switcher.
 *
 * Two surfaces:
 *
 *   - `switchDatasetMode(formData)` — used by the `<DatasetModeSwitcher>`
 *     client component. Validates the mode, persists it, and revalidates
 *     the routes that show the mode banner so the change is reflected
 *     immediately.
 *
 * Switching is **non-destructive**. The DB rows do not change. We update
 * the persisted intent + the UI banners. The caller is responsible for
 * running the relevant refresh CLI (we surface the command as a hint).
 */

import { revalidatePath } from "next/cache";

import { isDatasetMode, type DatasetMode } from "@/features/dataset-modes";
import { setActiveDatasetMode } from "@/server/dataset-mode";

export interface SwitchDatasetModeResult {
  ok: boolean;
  /** The mode now persisted (or the previous one if validation failed). */
  activeMode: DatasetMode | null;
  /** ISO timestamp of the switch (or `null` when the call failed). */
  switchedAt: string | null;
  error: string | null;
}

export async function switchDatasetMode(
  formData: FormData,
): Promise<SwitchDatasetModeResult> {
  const rawMode = formData.get("mode");
  const reason = formData.get("reason");

  if (!isDatasetMode(rawMode)) {
    return {
      ok: false,
      activeMode: null,
      switchedAt: null,
      error: `Unsupported dataset mode: ${String(rawMode)}`,
    };
  }

  const reasonStr =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim().slice(0, 200)
      : null;

  const next = setActiveDatasetMode(rawMode, reasonStr);

  // Revalidate the routes that visibly depend on the active mode so the
  // banner + headline copy flip without a hard reload.
  for (const path of [
    "/",
    "/datasets",
    "/causal-graph",
    "/comparison",
    "/upload",
    "/integrations/shell-university",
    "/about",
  ]) {
    try {
      revalidatePath(path);
    } catch {
      // revalidatePath throws when called outside of a request; ignore.
    }
  }

  return {
    ok: true,
    activeMode: next.activeMode,
    switchedAt: next.switchedAt,
    error: null,
  };
}
