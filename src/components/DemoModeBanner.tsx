import { isHostedDemo } from "@/lib/demo-mode";

/**
 * Phase 12C — public-demo disclosure strip.
 *
 * Rendered above the dataset-mode chip in `<AppShell>` only when
 * `DEMO_MODE=hosted`. The copy tells a cold visitor two things they
 * cannot infer from the UI alone:
 *
 *   1. The DB resets nightly at 03:00 UTC — anything they upload or
 *      decision they record disappears within a day.
 *   2. The data is fully synthetic. No real student records are
 *      involved anywhere on the site.
 *
 * Local dev never sees this banner; the helper short-circuits to
 * `null` so there is zero render cost when `DEMO_MODE` is unset.
 */
export default function DemoModeBanner() {
  if (!isHostedDemo()) return null;

  return (
    <div
      role="status"
      aria-label="Public demo notice"
      className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-[12px] text-amber-900"
    >
      <span className="font-semibold">Public demo · </span>
      <span>
        Data resets nightly at 03:00 UTC. Fully synthetic — no real student
        records.
      </span>
    </div>
  );
}
