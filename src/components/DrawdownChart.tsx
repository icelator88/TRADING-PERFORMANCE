import { useState } from 'react';
import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatDisplayDate, formatR } from '../utils/calculations';

interface DrawdownChartProps {
  subtitle: string;
  emptyMessage: string;
  stats: PerformanceStats;
}

interface DrawdownTooltip {
  trade: TradeRecord | null;
  drawdownR: number;
  cumulativeR: number;
  deltaR: number;
  index: number;
}

export function DrawdownChart({
  subtitle,
  emptyMessage,
  stats,
}: DrawdownChartProps) {
  const [hovered, setHovered] = useState<DrawdownTooltip | null>(null);

  const points = stats.equityPoints;
  const hasData = points.length > 1;

  const width = 960;
  const height = 220;
  const padLeft = 60;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minDD = Math.min(0, ...points.map((p) => p.drawdownR));
  const yMax = 0;
  const yMin = minDD < 0 ? minDD * 1.15 : -1;
  const ySpan = yMax - yMin || 1;

  const totalLen = Math.max(points.length, 2);
  const xFor = (idx: number) =>
    padLeft + (totalLen <= 1 ? plotW / 2 : (idx / (totalLen - 1)) * plotW);
  const yFor = (v: number) => padTop + ((yMax - v) / ySpan) * plotH;
  const zeroY = yFor(0);

  const yTicks = [0, 1, 2, 3].map((i) => yMax - (i / 3) * ySpan);

  const coords = points.map((p, idx) => ({
    ...p,
    x: xFor(idx),
    y: yFor(p.drawdownR),
  }));

  const polylinePoints = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    coords.length >= 2
      ? `M ${coords[0].x.toFixed(1)},${zeroY.toFixed(1)} ` +
        coords.map((c) => `L ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
        ` L ${coords[coords.length - 1].x.toFixed(1)},${zeroY.toFixed(1)} Z`
      : '';

  return (
    <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Curva del Drawdown (R)
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-bold text-rose-400 tabular-nums">
          Max Drawdown: -{stats.maxDrawdownR.toFixed(2)} R
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 px-4 text-center text-xs text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none overflow-visible"
            role="img"
            aria-label="Curva del Drawdown (R)"
          >
            {yTicks.map((val, idx) => {
              const y = yFor(val);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#1E2634"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94A3B8"
                    fontSize={11}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {val.toFixed(1)} R
                  </text>
                </g>
              );
            })}

            <line
              x1={padLeft}
              y1={zeroY}
              x2={width - padRight}
              y2={zeroY}
              stroke="#475569"
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />

            {coords.length > 1 ? (
              <>
                <path d={areaPath} fill="rgba(244, 63, 94, 0.18)" />
                <polyline
                  fill="none"
                  stroke="#F43F5E"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
                {coords.map((c) => (
                  <circle
                    key={`dd_${c.index}`}
                    cx={c.x}
                    cy={c.y}
                    r={coords.length > 60 ? 2.6 : 3.8}
                    fill="#F43F5E"
                    stroke="#0B0E14"
                    strokeWidth={1.2}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHovered({
                        trade: c.trade,
                        drawdownR: c.drawdownR,
                        cumulativeR: c.cumulativeR,
                        deltaR: c.deltaR,
                        index: c.index,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </>
            ) : null}

            <text
              x={padLeft}
              y={height - 10}
              textAnchor="start"
              fill="#94A3B8"
              fontSize={11}
              fontFamily="JetBrains Mono, monospace"
            >
              #0
            </text>
            <text
              x={width - padRight}
              y={height - 10}
              textAnchor="end"
              fill="#94A3B8"
              fontSize={11}
              fontFamily="JetBrains Mono, monospace"
            >
              #{points.length - 1}
            </text>
          </svg>

          {hovered ? (
            <div className="pointer-events-none absolute top-2 right-2 rounded-md border border-[#263042] bg-[#0B0E14]/95 px-3 py-2 font-mono text-xs text-slate-100 shadow-lg tabular-nums">
              <div className="font-semibold text-rose-400">
                Drawdown · #{hovered.index}
              </div>
              {hovered.trade ? (
                <>
                  <div className="mt-0.5 text-slate-200">
                    {formatDisplayDate(hovered.trade.date)} · {hovered.trade.asset} ·{' '}
                    {hovered.trade.setup} · {hovered.trade.bias}
                  </div>
                  <div className="mt-0.5 text-slate-300">
                    Esito: {hovered.trade.outcome} ({formatR(hovered.deltaR)}) →{' '}
                    <span className="font-bold text-rose-400">
                      {hovered.drawdownR.toFixed(2)} R
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-0.5 text-slate-300">
                  {hovered.drawdownR.toFixed(2)} R
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
