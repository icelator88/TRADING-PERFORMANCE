import { useState } from 'react';
import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatDisplayDate, formatR } from '../utils/calculations';

interface EquityChartProps {
  title: string;
  subtitle: string;
  emptyMessage: string;
  xAxisMode?: 'index' | 'date';
  dateRangeStart?: string;
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

interface CoordPoint {
  index: number;
  date: string;
  label: string;
  deltaR: number;
  cumulativeR: number;
  drawdownR: number;
  trade: TradeRecord | null;
  x: number;
  y: number;
}

const DAY_MS = 86_400_000;

function parseIsoDayMs(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function parseTimeOffsetMs(entryTime: string | undefined): number | null {
  if (!entryTime) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(entryTime.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return (h * 60 + min) * 60_000;
}

function formatAxisDateLabel(ms: number): string {
  const dt = new Date(ms);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(dt.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function computeSeriesTimestamps(
  pts: PerformanceStats['equityPoints'],
  seriesFloorMs: number | null,
): number[] {
  const tradePoints = pts.filter((p) => p.index > 0);
  const perDayCounts = new Map<string, number>();
  tradePoints.forEach((p) => {
    const key = p.trade?.date || p.date || '';
    if (key) perDayCounts.set(key, (perDayCounts.get(key) ?? 0) + 1);
  });

  const perDaySeen = new Map<string, number>();
  let firstTradeDayMs: number | null = null;
  const tradeTimestamps: (number | null)[] = new Array(pts.length).fill(null);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.index === 0) continue;
    const rawDate = p.trade?.date || p.date;
    const dayMs = parseIsoDayMs(rawDate);
    if (dayMs === null) continue;

    if (firstTradeDayMs === null || dayMs < firstTradeDayMs) {
      firstTradeDayMs = dayMs;
    }

    const totalSameDay = perDayCounts.get(rawDate) ?? 1;
    const seqOnDay = perDaySeen.get(rawDate) ?? 0;
    perDaySeen.set(rawDate, seqOnDay + 1);

    const parsedTimeMs = parseTimeOffsetMs(p.trade?.entryTime);
    const intraDayOffset =
      parsedTimeMs !== null
        ? Math.max(60_000, parsedTimeMs + seqOnDay * 1_000)
        : Math.round(((seqOnDay + 1) / (totalSameDay + 1)) * (DAY_MS - 60_000));

    tradeTimestamps[i] = dayMs + intraDayOffset;
  }

  const anchorMs = seriesFloorMs ?? firstTradeDayMs ?? Date.now();
  return pts.map((p, idx) => {
    if (p.index === 0) return anchorMs;
    return tradeTimestamps[idx] ?? anchorMs;
  });
}

export function EquityChart({
  title,
  subtitle,
  emptyMessage,
  xAxisMode = 'index',
  dateRangeStart,
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

  const yFor = (v: number) => padTop + ((yMax - v) / ySpan) * plotH;
  const zeroY = yFor(0);
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + (i / 4) * ySpan);

  let pCoords: CoordPoint[] = [];
  let sCoords: CoordPoint[] = [];
  let pLinePoints = '';
  let sLinePoints = '';
  let dateTicks: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];

  if (xAxisMode === 'date') {
    const forcedStartMs = parseIsoDayMs(dateRangeStart);
    const pHasTrades = pPoints.length > 1;
    const sHasTrades = sPoints.length > 1;

    const pTimestamps = pHasTrades ? computeSeriesTimestamps(pPoints, forcedStartMs) : [];
    const sTimestamps = sHasTrades ? computeSeriesTimestamps(sPoints, forcedStartMs) : [];
    const combinedTimestamps = [...pTimestamps, ...sTimestamps];

    const minTsRaw =
      combinedTimestamps.length > 0 ? Math.min(...combinedTimestamps) : Date.now();
    const startMs =
      forcedStartMs !== null ? Math.min(forcedStartMs, minTsRaw) : minTsRaw;
    const maxTsRaw =
      combinedTimestamps.length > 0 ? Math.max(...combinedTimestamps) : startMs + DAY_MS;
    const endMs = maxTsRaw <= startMs ? startMs + DAY_MS : maxTsRaw;
    const spanMs = endMs - startMs || DAY_MS;

    const xForMs = (ms: number) => padLeft + ((ms - startMs) / spanMs) * plotW;

    pCoords = pHasTrades
      ? pPoints.map((p, idx) => ({
          ...p,
          x: xForMs(pTimestamps[idx]),
          y: yFor(p.cumulativeR),
        }))
      : [];

    sCoords = sHasTrades
      ? sPoints.map((p, idx) => ({
          ...p,
          x: xForMs(sTimestamps[idx]),
          y: yFor(p.cumulativeR),
        }))
      : [];

    const buildExtendedLine = (coords: CoordPoint[]) => {
      if (coords.length < 2) return '';
      const last = coords[coords.length - 1];
      const base = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`);
      const endX = xForMs(endMs);
      if (endX - last.x > 0.5) {
        base.push(`${endX.toFixed(1)},${last.y.toFixed(1)}`);
      }
      return base.join(' ');
    };

    pLinePoints = buildExtendedLine(pCoords);
    sLinePoints = buildExtendedLine(sCoords);

    const tickFractions = [0, 0.25, 0.5, 0.75, 1];
    dateTicks = tickFractions.map((frac, idx) => {
      const ms = startMs + frac * spanMs;
      return {
        x: xForMs(ms),
        label: formatAxisDateLabel(ms),
        anchor: idx === 0 ? 'start' : idx === tickFractions.length - 1 ? 'end' : 'middle',
      };
    });
  } else {
    const maxLen = Math.max(pPoints.length, sPoints.length, 2);
    const xFor = (idx: number, totalLen: number) =>
      padLeft + (totalLen <= 1 ? plotW / 2 : (idx / (totalLen - 1)) * plotW);

    const buildCoords = (pts: PerformanceStats['equityPoints']) =>
      pts.map((p, idx) => ({
        ...p,
        x: xFor(idx, Math.max(pts.length, maxLen)),
        y: yFor(p.cumulativeR),
      }));

    pCoords = buildCoords(pPoints);
    sCoords = buildCoords(sPoints);
    pLinePoints = pCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    sLinePoints = sCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  }

  const buildAreaPath = (coords: CoordPoint[]) => {
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

            {xAxisMode === 'date'
              ? dateTicks.map((tick, idx) => (
                  <line
                    key={`xgrid_${idx}`}
                    x1={tick.x}
                    y1={padTop}
                    x2={tick.x}
                    y2={height - padBottom}
                    stroke="#1E2634"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                ))
              : null}

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
                  points={pLinePoints}
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
                  points={sLinePoints}
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

            {xAxisMode === 'date' ? (
              dateTicks.map((tick, idx) => (
                <text
                  key={`xlbl_${idx}`}
                  x={tick.x}
                  y={height - 10}
                  textAnchor={tick.anchor}
                  fill="#94A3B8"
                  fontSize={11}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.label}
                </text>
              ))
            ) : (
              <>
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
              </>
            )}
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
                  {xAxisMode === 'date' && dateRangeStart
                    ? `${formatDisplayDate(dateRangeStart)} · `
                    : ''}
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
