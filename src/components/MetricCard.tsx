import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: "default" | "warning" | "positive";
}

const EMPHASIS_CLASSES: Record<NonNullable<MetricCardProps["emphasis"]>, string> = {
  default: "text-slate-900",
  warning: "text-rose-600",
  positive: "text-emerald-600",
};

export default function MetricCard({
  label,
  value,
  hint,
  emphasis = "default",
}: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${EMPHASIS_CLASSES[emphasis]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
