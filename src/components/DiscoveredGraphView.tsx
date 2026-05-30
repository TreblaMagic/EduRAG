/**
 * Phase 7 — discovered-DAG renderer.
 *
 * Mirrors the layout of {@link CausalGraphView} so a side-by-side comparison
 * stays visually consistent. Highlights:
 *
 *   - Shared edges (manual ∧ discovered) → solid emerald.
 *   - Discovered-only edges → dashed amber.
 *   - Manual-only edges → light slate dotted (for ghosted comparison).
 *
 * Undirected discovered edges are drawn without an arrowhead. The component
 * accepts the diff payload directly so the page server-renders without any
 * client-side computation.
 */

import type { CausalNode, DagJson } from "@/features/causal-engine";
import { featureLabel } from "@/lib/intervention-language";

interface DiscoveredGraphProps {
  dag: DagJson;
  discovered: {
    algorithm: string;
    alpha: number;
    edges: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
    shared: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
    discoveredOnly: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
    manualOnly: Array<{ from: CausalNode; to: CausalNode }>;
    warnings: string[];
    engine: string;
  };
}

const NODE_LAYOUT: Record<CausalNode, { x: number; y: number }> = {
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

const SHARED_COLOR = "#10b981"; // emerald-500
const DISCOVERED_COLOR = "#d97706"; // amber-600
const MANUAL_ONLY_COLOR = "#cbd5e1"; // slate-300
const NODE_STROKE = "#cbd5e1";

export default function DiscoveredGraphView({ dag, discovered }: DiscoveredGraphProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Discovered DAG (experimental)</h3>
          <p className="text-xs text-slate-500">
            algorithm <code className="font-mono">{discovered.algorithm}</code> · α ={" "}
            {discovered.alpha} · engine <code className="font-mono">{discovered.engine}</code>
          </p>
        </header>

        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Discovered causal DAG"
        >
          <defs>
            <marker id="arrow-shared" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={SHARED_COLOR} />
            </marker>
            <marker id="arrow-disc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={DISCOVERED_COLOR} />
            </marker>
            <marker id="arrow-manual" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={MANUAL_ONLY_COLOR} />
            </marker>
          </defs>

          {/* Manual-only edges first (faded backdrop) */}
          {discovered.manualOnly.map((edge) => renderEdge(edge.from, edge.to, MANUAL_ONLY_COLOR, "arrow-manual", "manual", true, true))}

          {/* Discovered-only edges */}
          {discovered.discoveredOnly.map((edge) => renderEdge(edge.from, edge.to, DISCOVERED_COLOR, edge.oriented ? "arrow-disc" : "", "disc", true, !edge.oriented))}

          {/* Shared edges (solid) */}
          {discovered.shared.map((edge) => renderEdge(edge.from, edge.to, SHARED_COLOR, edge.oriented ? "arrow-shared" : "", "shared", false, !edge.oriented))}

          {/* Nodes */}
          {dag.nodes.map((node) => {
            const pos = NODE_LAYOUT[node.id];
            return (
              <g key={node.id}>
                <rect
                  x={pos.x - NODE_W / 2}
                  y={pos.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  ry={10}
                  fill="#ffffff"
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
          <g transform={`translate(${SVG_W - 280}, 18)`}>
            <text x={0} y={0} fontSize="10" fill="#475569" fontWeight={600}>LEGEND</text>
            <line x1={0} y1={16} x2={28} y2={16} stroke={SHARED_COLOR} strokeWidth={2} />
            <text x={34} y={20} fontSize="10" fill="#475569">Shared</text>
            <line x1={80} y1={16} x2={108} y2={16} stroke={DISCOVERED_COLOR} strokeWidth={2} strokeDasharray="4 2" />
            <text x={114} y={20} fontSize="10" fill="#475569">Discovered only</text>
            <line x1={200} y1={16} x2={228} y2={16} stroke={MANUAL_ONLY_COLOR} strokeWidth={2} strokeDasharray="1 2" />
            <text x={234} y={20} fontSize="10" fill="#475569">Manual only</text>
          </g>
        </svg>
      </div>

      {discovered.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">Discovery warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {discovered.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <EdgeList title="Shared edges" subtitle="manual ∧ discovered" edges={discovered.shared.map((e) => ({ ...e, oriented: e.oriented }))} accent={SHARED_COLOR} />
        <EdgeList title="Discovered-only" subtitle="present only in the data" edges={discovered.discoveredOnly} accent={DISCOVERED_COLOR} />
        <EdgeList title="Manual-only" subtitle="domain assumption, no support in data" edges={discovered.manualOnly.map((e) => ({ ...e, oriented: true }))} accent={MANUAL_ONLY_COLOR} />
      </div>
    </div>
  );
}

function renderEdge(
  from: CausalNode,
  to: CausalNode,
  color: string,
  marker: string,
  keyPrefix: string,
  dashed: boolean,
  undirected: boolean,
) {
  const fromPos = NODE_LAYOUT[from];
  const toPos = NODE_LAYOUT[to];
  const startX = fromPos.x + NODE_W / 2;
  const startY = fromPos.y;
  const endX = toPos.x - NODE_W / 2;
  const endY = toPos.y;
  const cx1 = startX + (endX - startX) * 0.5;
  const cx2 = startX + (endX - startX) * 0.5;
  const path = `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`;
  return (
    <path
      key={`${keyPrefix}-${from}->${to}`}
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray={dashed ? "5 3" : undefined}
      markerEnd={undirected ? undefined : `url(#${marker})`}
    />
  );
}

function EdgeList({
  title,
  subtitle,
  edges,
  accent,
}: {
  title: string;
  subtitle: string;
  edges: Array<{ from: CausalNode; to: CausalNode; oriented: boolean }>;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2">
        <h4 className="text-sm font-semibold text-slate-900" style={{ color: accent }}>
          {title} ({edges.length})
        </h4>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </header>
      {edges.length === 0 ? (
        <p className="text-xs italic text-slate-400">None.</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-700">
          {edges.map((e, i) => (
            <li key={`${e.from}->${e.to}-${i}`} className="flex items-center gap-1">
              <span className="font-medium">{featureLabel(e.from)}</span>
              <span className="text-slate-400">{e.oriented ? "→" : "—"}</span>
              <span className="font-medium">{featureLabel(e.to)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
