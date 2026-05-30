"use server";

/**
 * Phase 6 — uploaded-CSV server actions.
 *
 * Two endpoints invoked from the `/upload` client form:
 *   - `previewUpload(formData)` parses + validates only. No DB writes.
 *   - `commitUpload(formData)` runs the full orchestrator with the chosen mode.
 *
 * Both accept the original `File` via `FormData`. The client re-posts the
 * file rather than caching the parsed result server-side — at our scale
 * (≤ 20 MB) the second parse is cheap and the stateless contract is simpler.
 */

import { Buffer } from "node:buffer";

import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { parseAndValidateCsv } from "@/server/ingest/csv-reader";
import { commitUploadedRows } from "@/server/upload/commit";
import { buildPreviewResult } from "@/server/upload/preview";
import type {
  CommitOptions,
  CommitResult,
  ImportMode,
  PreviewResult,
} from "@/server/upload/types";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — keep in sync with next.config.mjs

function asBool(v: FormDataEntryValue | null): boolean {
  if (typeof v !== "string") return false;
  return v === "1" || v.toLowerCase() === "true" || v === "on";
}

function asMode(v: FormDataEntryValue | null): ImportMode {
  return v === "replace" ? "replace" : "append";
}

async function readUploadedFile(form: FormData): Promise<
  | { ok: true; filename: string; bytes: Buffer; byteSize: number }
  | { ok: false; error: string }
> {
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return { ok: false, error: "No file was submitted." };
  }
  const f = file as File;
  if (f.size === 0) return { ok: false, error: "The uploaded file is empty." };
  if (f.size > MAX_BYTES) {
    return { ok: false, error: `File exceeds the ${MAX_BYTES / 1024 / 1024} MB limit.` };
  }
  const lower = (f.name ?? "").toLowerCase();
  if (lower && !(lower.endsWith(".csv") || f.type === "text/csv")) {
    return { ok: false, error: "Only .csv files are accepted." };
  }
  const buf = Buffer.from(await f.arrayBuffer());
  return { ok: true, filename: f.name || "upload.csv", bytes: buf, byteSize: f.size };
}

export async function previewUpload(form: FormData): Promise<PreviewResult> {
  const readOutcome = await readUploadedFile(form);
  if (!readOutcome.ok) {
    return errorPreview(readOutcome.error);
  }

  try {
    const { rows, errors } = parseAndValidateCsv(readOutcome.bytes);
    return buildPreviewResult({
      filename: readOutcome.filename,
      byteSize: readOutcome.byteSize,
      rows,
      errors,
    });
  } catch (e) {
    log.error("Upload preview failed:", e);
    return errorPreview(
      e instanceof Error ? `Could not parse CSV: ${e.message}` : "Could not parse CSV.",
    );
  }
}

export async function commitUpload(form: FormData): Promise<CommitResult> {
  const readOutcome = await readUploadedFile(form);
  if (!readOutcome.ok) {
    return errorCommit(readOutcome.error);
  }

  const options: CommitOptions = {
    mode: asMode(form.get("mode")),
    dryRun: asBool(form.get("dryRun")),
    rerunCausalEstimates: asBool(form.get("rerunCausalEstimates")),
    rerunInterventionSimulations: asBool(form.get("rerunInterventionSimulations")),
  };

  try {
    const { rows, errors } = parseAndValidateCsv(readOutcome.bytes);
    return await commitUploadedRows(prisma, {
      filename: readOutcome.filename,
      byteSize: readOutcome.byteSize,
      rows,
      errors,
      options,
    });
  } catch (e) {
    log.error("Upload commit failed:", e);
    return errorCommit(
      e instanceof Error ? `Commit failed: ${e.message}` : "Commit failed.",
    );
  }
}

// ---- helpers ---------------------------------------------------------------

function errorPreview(message: string): PreviewResult {
  return {
    ok: false,
    filename: "",
    byteSize: 0,
    stats: {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      distinctStudents: 0,
      distinctCourses: 0,
    },
    sampleRows: [],
    errors: [],
    error: message,
  };
}

function errorCommit(message: string): CommitResult {
  return {
    ok: false,
    filename: "",
    byteSize: 0,
    mode: "append",
    dryRun: false,
    stats: {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      distinctStudents: 0,
      distinctCourses: 0,
    },
    errors: [],
    ingest: null,
    derived: null,
    features: null,
    causalEstimates: null,
    simulations: null,
    syncLogId: null,
    warnings: [],
    error: message,
  };
}
