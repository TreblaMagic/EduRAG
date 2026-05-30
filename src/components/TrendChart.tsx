/**
 * Tiny SVG line chart. Zero dependencies. Renders one or more series.
 *
 * Intentionally minimal: no tooltips, no animations, no themes. Just a
 * crisp static plot for screenshots and dashboards. For richer interaction
 * a future phase can swap in a real charting library — the chart-consuming
 * components don't need to change.
 */

export interface TrendSeries {
  label: string;
  color: string;
  /** `null` y-values are gaps (rendered without a marker / line segment). */
  points: ReadonlyArray<{ x: number; y: number | null }>;
}

interface TrendChartProps {
  series: ReadonlyArray<TrendSeries>;
  yMin?: number;
  yMax?: number;
  height?: number;
  yLabel?: string;
  xLabel?: string;
  /** Aria-label / fallback text. */
  caption: string;
}

const WIDTH = 520;
const PADDING = { top: 16, right: 16, bottom: 32, left: 40 };

export default function TrendChart({
  series,
  yMin = 0,
  yMax = 1,
  height = 200,
  yLabel,
  xLabel,
  caption,
}: TrendChartProps) {
  const innerW = WIDTH - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  if (allX.length === 0) {
    return (
      <div className="text-sm text-slate-400 italic" role="img" aria-label={caption}>
        No data to plot yet.
      </div>
    );
  }
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1e-9, yMax - yMin);

  const xScale = (x: number) => PADDING.left + ((x - xMin) / xSpan) * innerW;
  const yScale = (y: number) =>
    PADDING.top + (1 - (y - yMin) / ySpan) * innerH;

  const yTicks = [yMin, yMin + ySpan * 0.5, yMax];
  const xTicks = Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i);
  const xTickStep = xTicks.length > 14 ? 2 : 1;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={caption}
      >
        {/* Axes */}
        <line
          x1={PADDING.left}
          x2={PADDING.left}
          y1={PADDING.top}
          y2={height - PADDING.bottom}
          stroke="#e2e8f0"
        />
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={height - PADDING.bottom}
          y2={height - PADDING.bottom}
          stroke="#e2e8f0"
        />

        {/* Y ticks */}
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={PADDING.left - 4}
              x2={WIDTH - PADDING.right}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="#f1f5f9"
              strokeDasharray="2 3"
            />
            <text
              x={PADDING.left - 8}
              y={yScale(t) + 3}
              textAnchor="end"
              fontSize="10"
              fill="#64748b"
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X ticks */}
        {xTicks.map((t, i) =>
          i % xTickStep === 0 ? (
            <g key={`xt-${t}`}>
              <line
                x1={xScale(t)}
                x2={xScale(t)}
                y1={height - PADDING.bottom}
                y2={height - PADDING.bottom + 4}
                stroke="#cbd5e1"
              />
              <text
                x={xScale(t)}
                y={height - PADDING.bottom + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {t}
              </text>
            </g>
          ) : null,
        )}

        {/* Series */}
        {series.map((s, sIdx) => {
          const segments = splitSegments(s.points);
          return (
            <g key={`series-${sIdx}`}>
              {segments.map((seg, segIdx) => (
                <path
                  key={`seg-${sIdx}-${segIdx}`}
                  d={pathFromSegment(seg, xScale, yScale)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {s.points.map((p, pIdx) =>
                p.y === null ? null : (
                  <circle
                    key={`pt-${sIdx}-${pIdx}`}
                    cx={xScale(p.x)}
                    cy={yScale(p.y)}
                    r={2.5}
                    fill={s.color}
                  />
                ),
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="uppercase tracking-wide">{xLabel ?? "Week"}</span>
        {yLabel ? <span className="uppercase tracking-wide">{yLabel}</span> : null}
        <span className="flex flex-wrap items-center gap-3">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-slate-600">{s.label}</span>
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

function splitSegments(
  points: ReadonlyArray<{ x: number; y: number | null }>,
): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function pathFromSegment(
  seg: Array<{ x: number; y: number }>,
  xScale: (x: number) => number,
  yScale: (y: number) => number,
): string {
  return seg.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x)} ${yScale(p.y)}`).join(" ");
}
