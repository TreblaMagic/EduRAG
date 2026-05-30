import type { ConfidenceLevel } from "@/features/causal-engine";
import { confidenceMetaFor } from "@/lib/confidence-label";
import { cn } from "@/lib/cn";

interface ConfidenceChipProps {
  level: ConfidenceLevel;
  size?: "sm" | "md";
}

const SIZE_CLASSES: Record<NonNullable<ConfidenceChipProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

export default function ConfidenceChip({ level, size = "md" }: ConfidenceChipProps) {
  const meta = confidenceMetaFor(level);
  return (
    <span
      title={meta.hint}
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        meta.badgeClasses,
        SIZE_CLASSES[size],
      )}
    >
      {meta.label}
    </span>
  );
}
