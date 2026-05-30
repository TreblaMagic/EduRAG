"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; matchPrefix?: string }> = [
  { href: "/", label: "Overview" },
  { href: "/causal-graph", label: "Causal Graph" },
  { href: "/what-if", label: "What-If Simulator" },
  { href: "/comparison", label: "Prediction vs Intervention" },
  { href: "/interventions", label: "Interventions" },
  { href: "/datasets", label: "Dataset Modes" },
  { href: "/integrations/shell-university", label: "Integrations", matchPrefix: "/integrations" },
  { href: "/upload", label: "Upload Data" },
  { href: "/about", label: "About / Help" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col px-5 py-7">
      <div className="mb-10">
        <div className="text-xl font-semibold tracking-tight">EduRAG</div>
        <div className="text-xs text-slate-400 mt-1 leading-snug">
          Causal AI for Student Success
        </div>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.matchPrefix !== undefined && pathname.startsWith(item.matchPrefix));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-10 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Synthetic data
        </p>
        <p className="text-[11px] text-slate-500 leading-snug">
          All metrics are model-based estimates from generated LMS activity. Not for clinical or
          high-stakes decisions.
        </p>
      </div>
    </aside>
  );
}
