/**
 * Display formatters. All helpers return a string, gracefully handling
 * non-finite numbers with the em-dash placeholder.
 */

const EM_DASH = "—";

export function formatGrade(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return n.toFixed(digits);
}

export function formatDelta(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return EM_DASH;
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(digits);
}

export function formatRange(low: number, high: number, digits = 2): string {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return EM_DASH;
  return `${formatDelta(low, digits)} to ${formatDelta(high, digits)}`;
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return n.toLocaleString("en-US");
}

export function formatDecimal(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return n.toFixed(digits);
}
