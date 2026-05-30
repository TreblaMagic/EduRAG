import type { Metadata } from "next";
import type { ReactNode } from "react";

import AppShell from "@/components/AppShell";

import "./globals.css";

export const metadata: Metadata = {
  title: "EduRAG — Causal AI for Student Success",
  description:
    "An explainable educational analytics prototype: causal-AI driven insights from LMS-style student activity.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
