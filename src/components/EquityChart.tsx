import { useState } from 'react';
import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatDisplayDate, formatR } from '../utils/calculations';

interface EquityChartProps {
  title: string;
  subtitle: string;
  emptyMessage: string;
  primarySeries: {
    label: string;
    color: string;
    stats: PerformanceStats;
  };
  secondarySeries?: {
    label: string;
    color: string;
    stats: PerformanceStats;
  };
}

interface TooltipInfo {
  seriesLabel: string;
  trade: TradeRecord | null;
  cumulativeR: number;
  deltaR: number;
  index: number;
}

export function EquityChart({
  title,
  subtitle,
  emptyMessage,
  primarySeries,
  secondarySeries,
}: EquityChartProps) {
  const [hovered, setHovered] = useState<TooltipInfo | null>(null);

  const pPoints = primarySeries.stats.equityPoints;
  const sPoints = secondarySeries?.stats.equityPoints ?? [];
  const hasData = pPoints.length > 1 || sPoints.length > 1;

  const width = 960;
  const height = 270;
  const padLeft = 60;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = [
    0,
    ...pPoints.map((p) => p.cumulativeR),
    ...sPoints.map((p) => p.cumulativeR),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const spanRaw = maxVal - minVal;
  const padY = spanRaw === 0 ? 1 : spanRaw * 0.14;
  const yMin = minVal - padY;
  const yMax = maxVal + padY;
  const ySpan = yMax - yMin || 1;

  const maxLen = Math.max(pPoints.length, sPoints.length, 2);
  const xFor = (idx: number, totalLen: number) =>
    padLeft + (totalLen <= 1 ? plotW / 2 : (idx / (totalLen - 1)) * plotW);
  const yFor = (v: number) => padTop + ((yMax - v) / ySpan) * plotH;
  const zeroY = yFor(0);

  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + (i / 4) * ySpan);

  const buildCoords = (pts: PerformanceStats['equityPoints']) =>
    pts.map((p, idx) => ({
      ...p,
      x: xFor(idx, Math.max(pts.length, maxLen)),
      y: yFor(p.cumulativeR),
    }));

  const pCoords = buildCoords(pPoints);
  const sCoords = buildCoords(sPoints);

  const buildPolyline = (coords: ReturnType<typeof buildCoords>) =>
    coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const buildAreaPath = (coords: ReturnType<typeof buildCoords>) => {
    if (coords.length < 2) return '';
    return (
      `M ${coords[0].x.toFixed(1)},${zeroY.toFixed(1)} ` +
      coords.map((c) => `L ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
      ` L ${coords[coords.length - 1].x.toFixed(1)},${zeroY.toFixed(1)} Z`
    );
  };

  return (
    <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
          <span className="flex items-center gap-2 text-slate-200">
            <span
              className="inline-block h-2.5 w-2.5 rounded-xs"
              style={{ backgroundColor: primarySeries.color }}
            />
            {primarySeries.label}:{' '}
            <strong
              className={
                primarySeries.stats.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }
            >
              {formatR(primarySeries.stats.netR)}
            </strong>
          </span>

          {secondarySeries ? (
            <span className="flex items-center gap-2 text-slate-200">
              <span
                className="inline-block h-2.5 w-2.5 rounded-xs"
                style={{ backgroundColor: secondarySeries.color }}
              />
              {secondarySeries.label}:{' '}
              <strong
                className={
                  secondarySeries.stats.netR >= 0 ? 'text-sky-400' : 'text-rose-400'
                }
              >
                {formatR(secondarySeries.stats.netR)}
              </strong>
            </span>
          ) : null}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 px-4 text-center text-xs text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none overflow-visible"
            role="img"
            aria-label={title}
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
                    {val >= 0 ? '+' : ''}
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

            {pCoords.length > 1 ? (
              <>
                {!secondarySeries ? (
                  <path
                    d={buildAreaPath(pCoords)}
                    fill={
                      primarySeries.stats.netR >= 0
                        ? 'rgba(16, 185, 129, 0.14)'
                        : 'rgba(244, 63, 94, 0.14)'
                    }
                  />
                ) : null}
                <polyline
                  fill="none"
                  stroke={primarySeries.color}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={buildPolyline(pCoords)}
                />
                {pCoords.map((c) => (
                  <circle
                    key={`p_${c.index}`}
                    cx={c.x}
                    cy={c.y}
                    r={pCoords.length > 60 ? 2.8 : 4}
                    fill={primarySeries.color}
                    stroke="#0B0E14"
                    strokeWidth={1.2}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHovered({
                        seriesLabel: primarySeries.label,
                        trade: c.trade,
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

            {secondarySeries && sCoords.length > 1 ? (
              <>
                <polyline
                  fill="none"
                  stroke={secondarySeries.color}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={buildPolyline(sCoords)}
                />
                {sCoords.map((c) => (
                  <circle
                    key={`s_${c.index}`}
                    cx={c.x}
                    cy={c.y}
                    r={sCoords.length > 60 ? 2.8 : 4}
                    fill={secondarySeries.color}
                    stroke="#0B0E14"
                    strokeWidth={1.2}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHovered({
                        seriesLabel: secondarySeries.label,
                        trade: c.trade,
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
              #{Math.max(pPoints.length - 1, sPoints.length - 1)}
            </text>
          </svg>

          {hovered ? (
            <div className="pointer-events-none absolute top-2 right-2 rounded-md border border-[#263042] bg-[#0B0E14]/95 px-3 py-2 font-mono text-xs text-slate-100 shadow-lg tabular-nums">
              <div className="font-semibold text-sky-300">
                {hovered.seriesLabel} · #{hovered.index}
              </div>
              {hovered.trade ? (
                <>
                  <div className="mt-0.5 text-slate-200">
                    {formatDisplayDate(hovered.trade.date)} · {hovered.trade.asset} ·{' '}
                    {hovered.trade.setup} · {hovered.trade.bias}
                  </div>
                  <div className="mt-0.5 text-slate-300">
                    {hovered.trade.outcome} ({formatR(hovered.deltaR)}) →{' '}
                    <span className="font-bold text-slate-100">
                      {formatR(hovered.cumulativeR)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-0.5 text-slate-300">
                  {formatR(hovered.cumulativeR)}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
