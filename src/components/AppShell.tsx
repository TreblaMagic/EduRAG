import type { ReactNode } from "react";

import DatasetModeBanner from "./DatasetModeBanner";
import DemoModeBanner from "./DemoModeBanner";
import Sidebar from "./Sidebar";

/**
 * Layout shell. Renders the sidebar + a thin global header strip carrying
 * the active "Dataset mode" indicator chip. The chip is a server-rendered
 * `<DatasetModeBanner>` and is always visible across every route — the
 * reviewer always knows which data source is feeding the dashboard.
 *
 * Phase 12C addition: when `DEMO_MODE=hosted` the `<DemoModeBanner>`
 * renders a full-width amber strip above the dataset chip so a cold
 * visitor knows the demo is public + nightly-reset. Local dev sees a
 * `null` (zero render cost).
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <DemoModeBanner />
        <header className="flex items-center justify-end gap-2 border-b border-slate-200 bg-white/80 backdrop-blur px-6 py-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            Dataset
          </span>
          <DatasetModeBanner compact />
        </header>
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
