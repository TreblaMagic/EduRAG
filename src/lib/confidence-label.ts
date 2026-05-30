/**
 * Confidence chip metadata and risk classification.
 *
 * Both helpers are pure and unit-tested. The chip variant CSS classes are
 * Tailwind utility classes; the actual chip is rendered by
 * `@/components/ConfidenceChip`.
 */

import type { ConfidenceLevel } from "@/features/causal-engine";

export interface ConfidenceMeta {
  label: string;
  /** Tailwind classes applied to the chip body. */
  badgeClasses: string;
  /** Short tooltip / aria-description. */
  hint: string;
}

export function confidenceMetaFor(level: ConfidenceLevel): ConfidenceMeta {
  switch (level) {
    case "high":
      return {
        label: "High confidence",
        badgeClasses: "bg-emerald-100 text-emerald-800 border-emerald-200",
        hint: "Both refutation checks passed.",
      };
    case "medium":
      return {
        label: "Medium confidence",
        badgeClasses: "bg-amber-100 text-amber-900 border-amber-200",
        hint: "One refutation check passed.",
      };
    case "low":
      return {
        label: "Low confidence",
        badgeClasses: "bg-rose-100 text-rose-800 border-rose-200",
        hint: "No refutation checks passed.",
      };
  }
}

export type RiskLevel = "at-risk" | "borderline" | "on-track";

export interface RiskMeta {
  level: RiskLevel;
  label: string;
  badgeClasses: string;
}

const AT_RISK_THRESHOLD = 55;
const BORDERLINE_THRESHOLD = 70;

export function riskLevelFor(finalGrade: number): RiskLevel {
  if (!Number.isFinite(finalGrade) || finalGrade < AT_RISK_THRESHOLD) return "at-risk";
  if (finalGrade < BORDERLINE_THRESHOLD) return "borderline";
  return "on-track";
}

export function riskMetaFor(finalGrade: number): RiskMeta {
  const level = riskLevelFor(finalGrade);
  switch (level) {
    case "at-risk":
      return {
        level,
        label: "At risk",
        badgeClasses: "bg-rose-100 text-rose-800 border-rose-200",
      };
    case "borderline":
      return {
        level,
        label: "Borderline",
        badgeClasses: "bg-amber-100 text-amber-900 border-amber-200",
      };
    case "on-track":
      return {
        level,
        label: "On track",
        badgeClasses: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
  }
}
