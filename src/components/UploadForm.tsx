"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";

import { commitUpload, previewUpload } from "@/server/actions/upload";
import type {
  CommitResult,
  ImportMode,
  PreviewResult,
} from "@/server/upload/types";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/formatters";

type Stage = "idle" | "previewing" | "preview-ready" | "committing" | "done" | "error";

const ACCEPT_EXTENSIONS = ".csv,text/csv";
const MAX_MB = 20;

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [dryRun, setDryRun] = useState(false);
  const [runEstimates, setRunEstimates] = useState(true);
  const [runSimulations, setRunSimulations] = useState(true);
  const [pending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setFile(null);
    setStage("idle");
    setPreview(null);
    setCommitted(null);
    setErrorMessage(null);
    setMode("append");
    setDryRun(false);
    setRunEstimates(true);
    setRunSimulations(true);
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setCommitted(null);
    setErrorMessage(null);
    setStage(f ? "idle" : "idle");
  }, []);

  const onPreview = useCallback(() => {
    if (!file) return;
    setErrorMessage(null);
    setStage("previewing");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const result = await previewUpload(fd);
        setPreview(result);
        if (result.ok) {
          setStage("preview-ready");
        } else {
          setErrorMessage(result.error ?? "Preview failed.");
          setStage("error");
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "Preview failed.");
        setStage("error");
      }
    });
  }, [file]);

  const onCommit = useCallback(() => {
    if (!file) return;
    setErrorMessage(null);
    setStage("committing");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("mode", mode);
        fd.set("dryRun", dryRun ? "1" : "0");
        fd.set("rerunCausalEstimates", runEstimates ? "1" : "0");
        fd.set("rerunInterventionSimulations", runSimulations ? "1" : "0");
        const result = await commitUpload(fd);
        setCommitted(result);
        if (result.ok) {
          setStage("done");
        } else {
          setErrorMessage(result.error ?? "Commit failed.");
          setStage("error");
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "Commit failed.");
        setStage("error");
      }
    });
  }, [file, mode, dryRun, runEstimates, runSimulations]);

  const fileLabel = useMemo(() => {
    if (!file) return "No file selected";
    return `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  }, [file]);

  return (
    <div className="space-y-6">
      {/* ---- Step 1: pick file + preview --------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Step 1 · Choose a CSV file</h2>
          <p className="mt-1 text-sm text-slate-500">
            Up to {MAX_MB} MB. The previewer validates every row against the schema below before any database
            writes happen.
          </p>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
              <input
                type="file"
                accept={ACCEPT_EXTENSIONS}
                className="hidden"
                onChange={onFileChange}
                disabled={stage === "committing" || pending}
              />
              Browse…
            </label>
            <span className="text-sm text-slate-600 truncate">{fileLabel}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onPreview}
                disabled={!file || pending || stage === "committing"}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage === "previewing" ? "Validating…" : "Preview"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Error banner ------------------------------------------------- */}
      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {/* ---- Step 2: preview + options ----------------------------------- */}
      {preview && preview.ok ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Step 2 · Review preview</h2>
            <p className="mt-1 text-sm text-slate-500">
              No database writes have happened yet. Confirm import below to commit.
            </p>
          </div>
          <div className="px-6 py-5 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <PreviewStat label="Total rows" value={preview.stats.totalRows} />
              <PreviewStat label="Valid rows" value={preview.stats.validRows} emphasis="positive" />
              <PreviewStat
                label="Invalid rows"
                value={preview.stats.invalidRows}
                emphasis={preview.stats.invalidRows > 0 ? "warning" : "default"}
              />
              <PreviewStat label="Distinct students" value={preview.stats.distinctStudents} />
              <PreviewStat label="Distinct courses" value={preview.stats.distinctCourses} />
            </div>

            {preview.errors.length > 0 ? (
              <details className="rounded-md border border-amber-200 bg-amber-50">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-900">
                  {preview.errors.length} validation issue(s) — first {preview.errors.length} shown
                </summary>
                <div className="border-t border-amber-200 px-4 py-2 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-amber-900">
                      <tr>
                        <th className="text-left font-medium pb-1">Row</th>
                        <th className="text-left font-medium pb-1">Field</th>
                        <th className="text-left font-medium pb-1">Message</th>
                        <th className="text-left font-medium pb-1">Raw value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.map((e, i) => (
                        <tr key={i} className="text-amber-800">
                          <td className="pr-3 py-1 font-mono">{e.rowNumber}</td>
                          <td className="pr-3 py-1 font-mono">{e.field}</td>
                          <td className="pr-3 py-1">{e.message}</td>
                          <td className="pr-3 py-1 font-mono truncate max-w-[160px]">
                            {e.rawValue ?? <span className="text-amber-500">(empty)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}

            {preview.sampleRows.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">
                  Sample (first {preview.sampleRows.length} valid rows)
                </h3>
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">student</th>
                        <th className="text-left px-3 py-2 font-medium">course</th>
                        <th className="text-left px-3 py-2 font-medium">week</th>
                        <th className="text-left px-3 py-2 font-medium">resource</th>
                        <th className="text-left px-3 py-2 font-medium">type</th>
                        <th className="text-left px-3 py-2 font-medium">action</th>
                        <th className="text-left px-3 py-2 font-medium">dur (s)</th>
                        <th className="text-left px-3 py-2 font-medium">quiz</th>
                        <th className="text-left px-3 py-2 font-medium">gpa</th>
                        <th className="text-left px-3 py-2 font-medium">grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 text-slate-700">
                          <td className="px-3 py-1 font-mono">{r.studentId}</td>
                          <td className="px-3 py-1 font-mono">{r.courseId}</td>
                          <td className="px-3 py-1">{r.weekNumber}</td>
                          <td className="px-3 py-1 font-mono">{r.resourceId}</td>
                          <td className="px-3 py-1">{r.resourceType}</td>
                          <td className="px-3 py-1">{r.activityType}</td>
                          <td className="px-3 py-1">{r.durationSeconds}</td>
                          <td className="px-3 py-1">{r.quizScore ?? "—"}</td>
                          <td className="px-3 py-1">{r.priorGpa}</td>
                          <td className="px-3 py-1">{r.finalGrade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Import options */}
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Import options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">Mode</p>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "append"}
                      onChange={() => setMode("append")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Append</strong> — existing data preserved; per-student activity is replaced for any
                      student appearing in this file.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 mt-2">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "replace"}
                      onChange={() => setMode("replace")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Replace demo data</strong> — wipes <em>all</em> LMS-derived tables (students,
                      courses, events, grades, summaries, estimates, simulations) before importing. SyncLog audit
                      history is preserved.
                    </span>
                  </label>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">After import</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={runEstimates}
                      onChange={(e) => setRunEstimates(e.target.checked)}
                    />
                    <span>Re-run causal estimates</span>
                  </label>
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={runSimulations}
                      onChange={(e) => setRunSimulations(e.target.checked)}
                    />
                    <span>Re-run intervention simulations</span>
                  </label>
                  <label className="flex items-center gap-2 mt-2 text-slate-700">
                    <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                    <span>Dry run only (validate but do not write)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCommit}
                disabled={pending || stage === "committing"}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50",
                  mode === "replace"
                    ? "bg-rose-600 hover:bg-rose-500"
                    : "bg-indigo-600 hover:bg-indigo-500",
                )}
              >
                {stage === "committing"
                  ? "Importing…"
                  : dryRun
                    ? "Run dry import"
                    : mode === "replace"
                      ? "Replace demo data and import"
                      : "Confirm import"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---- Step 3: result ---------------------------------------------- */}
      {committed ? <ResultCard result={committed} onReset={reset} /> : null}
    </div>
  );
}

function PreviewStat({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: number;
  emphasis?: "default" | "positive" | "warning";
}) {
  const colour =
    emphasis === "positive"
      ? "text-emerald-700"
      : emphasis === "warning"
        ? "text-rose-600"
        : "text-slate-900";
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", colour)}>{formatNumber(value)}</p>
    </div>
  );
}

function ResultCard({ result, onReset }: { result: CommitResult; onReset: () => void }) {
  return (
    <section
      className={cn(
        "rounded-lg border shadow-sm",
        result.ok && !result.dryRun
          ? "border-emerald-200 bg-white"
          : result.dryRun
            ? "border-amber-200 bg-amber-50"
            : "border-rose-200 bg-rose-50",
      )}
    >
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          {result.dryRun
            ? "Step 3 · Dry run complete"
            : result.ok
              ? "Step 3 · Import complete"
              : "Step 3 · Import failed"}
        </h2>
        {result.filename ? (
          <p className="mt-1 text-sm text-slate-500">
            File: <code className="font-mono text-slate-700">{result.filename}</code> · mode:{" "}
            <code className="font-mono text-slate-700">{result.mode}</code>
            {result.syncLogId ? (
              <> · SyncLog <code className="font-mono text-slate-700">{result.syncLogId}</code></>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="px-6 py-5 space-y-4">
        {result.ingest ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <ResultRow label="Students" value={result.ingest.students} />
            <ResultRow label="Courses" value={result.ingest.courses} />
            <ResultRow label="Resources" value={result.ingest.resources} />
            <ResultRow label="Activity rows" value={result.ingest.activityLogs} />
            <ResultRow label="Grades" value={result.ingest.grades} />
            <ResultRow label="Enrollments" value={result.ingest.enrollments} />
            {result.derived ? (
              <>
                <ResultRow label="Weekly summaries" value={result.derived.weeklySummaries} />
                <ResultRow label="RDI scores" value={result.derived.rdiScores} />
              </>
            ) : null}
            {result.features ? (
              <ResultRow label="Course features" value={result.features.rowsWritten} />
            ) : null}
            {result.causalEstimates ? (
              <ResultRow label="Causal estimates" value={result.causalEstimates.estimatesWritten} />
            ) : null}
            {result.simulations ? (
              <ResultRow label="Simulations" value={result.simulations.simulationsWritten} />
            ) : null}
          </div>
        ) : null}

        {result.warnings.length > 0 ? (
          <ul className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 list-disc list-inside space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}

        {result.error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {result.error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          <Link
            href="/"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            View dashboard
          </Link>
          <Link
            href="/integrations/shell-university"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View integrations
          </Link>
          <Link
            href="/causal-graph"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View causal graph
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Upload another file
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatNumber(value)}</p>
    </div>
  );
}
