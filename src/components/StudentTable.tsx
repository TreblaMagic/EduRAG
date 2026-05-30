import Link from "next/link";

import type { ConfidenceLevel } from "@/features/causal-engine";
import {
  formatDecimal,
  formatDelta,
  formatGrade,
  formatRange,
} from "@/lib/formatters";
import { interventionLabel } from "@/lib/intervention-language";
import { riskMetaFor } from "@/lib/confidence-label";

import ConfidenceChip from "./ConfidenceChip";

export interface StudentTableRow {
  studentExternalId: string;
  priorGpa: number;
  finalGrade: number;
  meanRdi: number;
  meanEngagement: number;
  topIntervention: {
    name: string;
    treatment: string;
    projectedGrade: number;
    projectedLow: number;
    projectedHigh: number;
    confidence: ConfidenceLevel;
  } | null;
}

interface StudentTableProps {
  rows: ReadonlyArray<StudentTableRow>;
}

export default function StudentTable({ rows }: StudentTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Student</th>
            <th scope="col" className="px-4 py-3">Prior GPA</th>
            <th scope="col" className="px-4 py-3">Final Grade</th>
            <th scope="col" className="px-4 py-3">RDI</th>
            <th scope="col" className="px-4 py-3">Engagement</th>
            <th scope="col" className="px-4 py-3">Top Recommendation</th>
            <th scope="col" className="px-4 py-3">Projected Range</th>
            <th scope="col" className="px-4 py-3">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const risk = riskMetaFor(row.finalGrade);
            const top = row.topIntervention;
            const projectedDelta = top ? top.projectedGrade - row.finalGrade : null;
            const lowDelta = top ? top.projectedLow - row.finalGrade : null;
            const highDelta = top ? top.projectedHigh - row.finalGrade : null;
            return (
              <tr key={row.studentExternalId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/students/${row.studentExternalId}`}
                    className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                  >
                    {row.studentExternalId}
                  </Link>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${risk.badgeClasses}`}
                    >
                      {risk.label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{formatDecimal(row.priorGpa, 2)}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">
                  {formatGrade(row.finalGrade)}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatDecimal(row.meanRdi, 2)}</td>
                <td className="px-4 py-3 text-slate-700">{formatDecimal(row.meanEngagement, 2)}</td>
                <td className="px-4 py-3">
                  {top ? (
                    <span className="text-slate-900">{interventionLabel(top.name)}</span>
                  ) : (
                    <span className="text-slate-400 italic">No recommendation yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {top && projectedDelta !== null && lowDelta !== null && highDelta !== null ? (
                    <>
                      <span className="font-medium text-slate-900">
                        {formatDelta(projectedDelta)}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        ({formatRange(lowDelta, highDelta)})
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {top ? <ConfidenceChip level={top.confidence} size="sm" /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
