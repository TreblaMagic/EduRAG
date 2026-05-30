/**
 * Custom SVG renderer for the EduRAG causal DAG.
 *
 * 7 nodes, 10 edges, hand-laid out for clarity. Avoids the React Flow
 * dependency (which is heavyweight and offers no real benefit for a
 * static, known graph). Re-arrange node positions in `NODE_LAYOUT` if
 * the DAG ever grows.
 */

import type { CausalNode, DagJson } from "@/features/causal-engine";
import { featureLabel } from "@/lib/intervention-language";

interface CausalGraphViewProps {
  dag: DagJson;
}

interface Position {
  x: number;
  y: number;
}

const NODE_LAYOUT: Record<CausalNode, Position> = {
  PriorGPA: { x: 70, y: 220 },
  Engagement: { x: 250, y: 220 },
  ResourceDiversityIndex: { x: 460, y: 80 },
  ForumParticipation: { x: 460, y: 220 },
  QuizConsistency: { x: 460, y: 360 },
  AssessmentTrend: { x: 680, y: 220 },
  FinalGrade: { x: 890, y: 220 },
};

const NODE_W = 150;
const NODE_H = 50;
const SVG_W = 1000;
const SVG_H = 440;

const ROOT_FILL = "#eef2ff"; // indigo-50
const NODE_FILL = "#ffffff";
const NODE_STROKE = "#cbd5e1"; // slate-300
const OUTCOME_FILL = "#fef3c7"; // amber-100
const EDGE_COLOR = "#94a3b8"; // slate-400
const EDGE_LABEL_COLOR = "#475569"; // slate-600

export default function CausalGraphView({ dag }: CausalGraphViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          role="img"
          aria-label="EduRAG causal DAG"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR} />
            </marker>
          </defs>

          {/* Edges first so nodes overlay them */}
          {dag.edges.map((edge) => {
            const from = NODE_LAYOUT[edge.from];
            const to = NODE_LAYOUT[edge.to];
            const startX = from.x + NODE_W / 2;
            const startY = from.y;
            const endX = to.x - NODE_W / 2;
            const endY = to.y;
            const cx1 = startX + (endX - startX) * 0.5;
            const cx2 = startX + (endX - startX) * 0.5;
            const path = `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`;
            return (
              <path
                key={`${edge.from}->${edge.to}`}
                d={path}
                fill="none"
                stroke={EDGE_COLOR}
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Nodes */}
          {dag.nodes.map((node) => {
            const pos = NODE_LAYOUT[node.id];
            const fill =
              node.id === "FinalGrade"
                ? OUTCOME_FILL
                : node.id === "PriorGPA"
                  ? ROOT_FILL
                  : NODE_FILL;
            return (
              <g key={node.id}>
                <rect
                  x={pos.x - NODE_W / 2}
                  y={pos.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  ry={10}
                  fill={fill}
                  stroke={NODE_STROKE}
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={600}
                  fill="#0f172a"
                >
                  {node.label}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          <g transform={`translate(${SVG_W - 240}, 18)`}>
            <text
              x={0}
              y={0}
              fontSize="10"
              fill={EDGE_LABEL_COLOR}
              fontWeight={600}
            >
              LEGEND
            </text>
            <rect x={0} y={8} width={14} height={14} rx={3} fill={ROOT_FILL} stroke={NODE_STROKE} />
            <text x={20} y={19} fontSize="10" fill={EDGE_LABEL_COLOR}>
              Exogenous (root)
            </text>
            <rect
              x={110}
              y={8}
              width={14}
              height={14}
              rx={3}
              fill={OUTCOME_FILL}
              stroke={NODE_STROKE}
            />
            <text x={130} y={19} fontSize="10" fill={EDGE_LABEL_COLOR}>
              Outcome
            </text>
          </g>
        </svg>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Edge rationales</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each edge encodes a hypothesised causal direction. Reviewers can disagree with any
            single edge without invalidating the framework.
          </p>
        </header>
        <ul className="divide-y divide-slate-100 text-sm">
          {dag.edges.map((edge) => (
            <li key={`r-${edge.from}->${edge.to}`} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3">
              <p className="text-slate-700">{edge.rationale}</p>
              <p className="text-xs text-slate-500 whitespace-nowrap">
                <span className="font-medium text-slate-700">{featureLabel(edge.from)}</span>
                <span className="mx-1.5">→</span>
                <span className="font-medium text-slate-700">{featureLabel(edge.to)}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
