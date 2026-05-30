"use client";

/**
 * Phase 10 — interactive dataset-mode switcher.
 *
 * Client component used on the `/datasets` page. Each available mode
 * renders a card; clicking "Make active" submits the server action.
 * Non-destructive — switching only updates the persisted intent.
 *
 * The component never auto-runs CLIs. Instead, when the user switches
 * to a mode whose status is `empty`, we surface the refresh hint
 * (`metadata.refreshHint`) so they can copy-paste the command.
 */

import { useState, useTransition } from "react";

import type {
  DatasetMode,
  DatasetModeSnapshot,
  DatasetModeMetadata,
} from "@/features/dataset-modes";
import { statusLabel } from "@/features/dataset-modes";
import { switchDatasetMode } from "@/server/actions/dataset-mode";

interface Props {
  snapshots: DatasetModeSnapshot[];
}

const ACCENT_BORDER: Record<DatasetModeMetadata["accent"], string> = {
  indigo: "border-indigo-300",
  emerald: "border-emerald-300",
  amber: "border-amber-300",
};

const ACCENT_DOT: Record<DatasetModeMetadata["accent"], string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

const STATUS_BADGE: Record<DatasetModeSnapshot["status"], string> = {
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  empty: "bg-slate-100 text-slate-700 border-slate-200",
  stale: "bg-amber-100 text-amber-900 border-amber-200",
  unavailable: "bg-rose-100 text-rose-800 border-rose-200",
};

export default function DatasetModeSwitcher({ snapshots }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<DatasetMode | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function submit(target: DatasetMode): void {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("mode", target);
      if (reason.trim().length > 0) fd.set("reason", reason.trim());
      const result = await switchDatasetMode(fd);
      if (result.ok) {
        setFeedback({
          ok: true,
          message: `Active dataset mode is now "${target}".`,
        });
        setConfirming(null);
        setReason("");
      } else {
        setFeedback({
          ok: false,
          message: result.error ?? "Switch failed.",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {snapshots.map((snap) => {
          const m = snap.metadata;
          const active = snap.isActive;
          const confirmingThis = confirming === m.id;
          return (
            <div
              key={m.id}
              className={`rounded-xl border-2 bg-white p-5 shadow-sm transition-all ${
                active ? ACCENT_BORDER[m.accent] : "border-slate-200"
              }`}
            >
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  <span
                    className={`mr-2 inline-block h-2 w-2 rounded-full ${ACCENT_DOT[m.accent]}`}
                  />
                  {m.name}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[snap.status]}`}
                >
                  {statusLabel(snap.status)}
                </span>
              </header>

              <p className="mt-2 text-xs italic text-slate-500">{m.tagline}</p>
              <p className="mt-2 text-sm text-slate-700">{m.description}</p>

              <dl className="mt-3 text-xs text-slate-600 space-y-1">
                <Row label="Verb" value={m.verb} />
                <Row label="Rows" value={snap.primaryCount.toLocaleString()} />
                <Row
                  label="Last update"
                  value={snap.lastUpdatedDetail ?? "—"}
                />
                <Row label="Refresh" value={<Code>{m.refreshHint}</Code>} />
                <Row label="Recommended for" value={m.recommendedFor} />
              </dl>

              <div className="mt-4">
                {active ? (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    ✓ Currently active
                  </p>
                ) : confirmingThis ? (
                  <div className="space-y-2">
                    <label className="block text-[11px] text-slate-600">
                      Optional reason
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. recording the upload demo"
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        maxLength={200}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => submit(m.id)}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {pending ? "Switching…" : "Confirm switch"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          setReason("");
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                    {snap.status === "empty" && (
                      <p className="text-[11px] text-amber-700">
                        ⚠ This mode currently has no data. The dashboard will still
                        work, but the recommended next step is:{" "}
                        <Code>{m.refreshHint}</Code>.
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(m.id)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Make active
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-500">
        {label}
      </dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
      {children}
    </code>
  );
}
