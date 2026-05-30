/**
 * Phase 11 — small badge rendering an intervention decision status.
 *
 * Pure presentational. Used in the action bar header, on the
 * /interventions activity feed, and in the timeline.
 */

import {
  STATUS_BADGE_CLASSES,
  STATUS_HINT,
  STATUS_LABEL,
  type DecisionStatus,
} from "@/features/intervention-tracking";

interface Props {
  status: DecisionStatus;
  size?: "sm" | "md";
}

export default function DecisionStatusChip({ status, size = "sm" }: Props) {
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${padding} ${STATUS_BADGE_CLASSES[status]}`}
      title={STATUS_HINT[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
