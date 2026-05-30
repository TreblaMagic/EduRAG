import type { ReactNode } from "react";

interface HonestyNoteProps {
  title?: string;
  children: ReactNode;
  tone?: "info" | "warning";
}

const TONE_CLASSES: Record<NonNullable<HonestyNoteProps["tone"]>, string> = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export default function HonestyNote({
  title = "Model-based simulation",
  children,
  tone = "info",
}: HonestyNoteProps) {
  return (
    <aside
      role="note"
      className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${TONE_CLASSES[tone]}`}
    >
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-[13px] opacity-90">{children}</div>
    </aside>
  );
}
