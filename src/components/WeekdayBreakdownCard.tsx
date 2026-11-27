import { useMemo, useState } from 'react';
import type { Language, TradeRecord, WeekdayBreakdownItem } from '../types/trading';
import {
  calculateWeekdayBreakdown,
  calculateWeekdayInsights,
  formatR,
} from '../utils/calculations';

interface WeekdayBreakdownCardProps {
  trades: TradeRecord[];
  lang: Language;
  subtitle: string;
  emptyMessage: string;
}

const MIN_EXEC_OPTIONS = [10, 12, 14, 15] as const;

const WEEKDAY_NAMES: Record<Language, Record<1 | 2 | 3 | 4 | 5, string>> = {
  it: {
    1: 'Lunedì',
    2: 'Martedì',
    3: 'Mercoledì',
    4: 'Giovedì',
    5: 'Venerdì',
  },
  en: {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
  },
  es: {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
  },
};

const WEEKDAY_SHORT: Record<Language, Record<1 | 2 | 3 | 4 | 5, string>> = {
  it: { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven' },
  en: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' },
  es: { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie' },
};

const COPY = {
  it: {
    title: 'Performance Settimanale (Lun – Ven)',
    netR: 'Net R',
    avgR: 'Avg R',
    winRate: 'Win Rate',
    topBadge: 'Top Profit',
    worstBadge: 'Peggiore',
    underBadge: 'Negativo',
    lowestBadge: 'Più debole',
    topSummary: 'Top',
    worstSummary: 'Peggiore',
    lowestSummary: 'Più debole',
    executedShort: 'eseg.',
    minExecLabel: 'Min eseg.',
    fallbackPrefix: 'fallback max',
    noDayTrades: 'Nessun trade',
    weakestDayInsight: 'Peggiore Asset+Setup su',
    noWeakestDay: 'Nessun giorno debole rilevato',
    topDayInsight: 'Migliore Asset+Setup su',
    noTopDay: 'Nessun giorno in profitto',
    overallInsight: '#1 Migliore & Peggiore Assoluto (Net R)',
    overallBestLabel: '#1 Best',
    overallWorstLabel: '#1 Worst',
    noDataShort: 'N/D',
  },
  en: {
    title: 'Weekday Breakdown (Mon – Fri)',
    netR: 'Net R',
    avgR: 'Avg R',
    winRate: 'Win Rate',
    topBadge: 'Top Profit',
    worstBadge: 'Worst',
    underBadge: 'Underperf.',
    lowestBadge: 'Lowest',
    topSummary: 'Top',
    worstSummary: 'Worst',
    lowestSummary: 'Lowest',
    executedShort: 'exec.',
    minExecLabel: 'Min exec.',
    fallbackPrefix: 'fallback max',
    noDayTrades: 'No trades',
    weakestDayInsight: 'Weakest Asset+Setup on',
    noWeakestDay: 'No weakest day detected',
    topDayInsight: 'Best Asset+Setup on',
    noTopDay: 'No profit day yet',
    overallInsight: '#1 Overall Best & Worst (Net R)',
    overallBestLabel: '#1 Best',
    overallWorstLabel: '#1 Worst',
    noDataShort: 'N/A',
  },
  es: {
    title: 'Desglose Diario (Lun – Vie)',
    netR: 'Net R',
    avgR: 'Avg R',
    winRate: 'Win Rate',
    topBadge: 'Top Profit',
    worstBadge: 'Peor',
    underBadge: 'Negativo',
    lowestBadge: 'Más débil',
    topSummary: 'Top',
    worstSummary: 'Peor',
    lowestSummary: 'Más débil',
    executedShort: 'ejec.',
    minExecLabel: 'Min ejec.',
    fallbackPrefix: 'fallback max',
    noDayTrades: 'Sin trades',
    weakestDayInsight: 'Peor Asset+Setup el',
    noWeakestDay: 'Sin día débil detectado',
    topDayInsight: 'Mejor Asset+Setup el',
    noTopDay: 'Sin día en positivo',
    overallInsight: '#1 Mejor y Peor Absoluto (Net R)',
    overallBestLabel: '#1 Mejor',
    overallWorstLabel: '#1 Peor',
    noDataShort: 'N/D',
  },
} as const;

export function WeekdayBreakdownCard({
  trades,
  lang,
  subtitle,
  emptyMessage,
}: WeekdayBreakdownCardProps) {
  const [minExecuted, setMinExecuted] = useState<number>(15);

  const days = useMemo(() => calculateWeekdayBreakdown(trades), [trades]);
  const insights = useMemo(
    () => calculateWeekdayInsights(trades, days, minExecuted),
    [trades, days, minExecuted],
  );
  const copy = COPY[lang] ?? COPY.it;
  const fullNames = WEEKDAY_NAMES[lang] ?? WEEKDAY_NAMES.it;
  const shortNames = WEEKDAY_SHORT[lang] ?? WEEKDAY_SHORT.it;

  const hasAnyMonFriTrades = days.some((d) => d.totalTrades > 0);
  const topDays = days.filter((d) => d.status === 'top');
  const worstDays = days.filter((d) => d.status === 'worst');
  const lowestDays = days.filter((d) => d.status === 'lowest');

  const getCellSurfaceClass = (item: WeekdayBreakdownItem) => {
    switch (item.status) {
      case 'top':
        return 'border-t-2 border-t-emerald-400 bg-emerald-500/[0.08]';
      case 'worst':
        return 'border-t-2 border-t-rose-400 bg-rose-500/[0.09]';
      case 'underperforming':
        return 'border-t-2 border-t-rose-500/45 bg-rose-500/[0.04]';
      case 'lowest':
        return 'border-t-2 border-t-amber-400/75 bg-amber-500/[0.05]';
      default:
        return 'border-t-2 border-t-transparent';
    }
  };

  const renderStatusBadge = (item: WeekdayBreakdownItem) => {
    if (item.status === 'top') {
      return (
        <span className="text-[10px] font-semibold tracking-wide text-emerald-400 uppercase whitespace-nowrap">
          {copy.topBadge}
        </span>
      );
    }
    if (item.status === 'worst') {
      return (
        <span className="text-[10px] font-semibold tracking-wide text-rose-400 uppercase whitespace-nowrap">
          {copy.worstBadge}
        </span>
      );
    }
    if (item.status === 'underperforming') {
      return (
        <span className="text-[10px] font-semibold tracking-wide text-rose-400/85 uppercase whitespace-nowrap">
          {copy.underBadge}
        </span>
      );
    }
    if (item.status === 'lowest') {
      return (
        <span className="text-[10px] font-semibold tracking-wide text-amber-400 uppercase whitespace-nowrap">
          {copy.lowestBadge}
        </span>
      );
    }
    return null;
  };

  return (
    <section
      aria-label={copy.title}
      className="overflow-hidden rounded-lg border border-[#1E2634] bg-[#121721]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2634] px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{copy.title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasAnyMonFriTrades ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
              {topDays.length > 0 ? (
                <span className="text-slate-300">
                  {copy.topSummary}:{' '}
                  <strong className="text-emerald-400">
                    {topDays.map((d) => shortNames[d.dayIndex]).join('/')} (
                    {formatR(topDays[0].netR)})
                  </strong>
                </span>
              ) : null}

              {topDays.length > 0 && (worstDays.length > 0 || lowestDays.length > 0) ? (
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
              ) : null}

              {worstDays.length > 0 ? (
                <span className="text-slate-300">
                  {copy.worstSummary}:{' '}
                  <strong className="text-rose-400">
                    {worstDays.map((d) => shortNames[d.dayIndex]).join('/')} (
                    {formatR(worstDays[0].netR)})
                  </strong>
                </span>
              ) : lowestDays.length > 0 ? (
                <span className="text-slate-300">
                  {copy.lowestSummary}:{' '}
                  <strong className="text-amber-400">
                    {lowestDays.map((d) => shortNames[d.dayIndex]).join('/')} (
                    {formatR(lowestDays[0].netR)})
                  </strong>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
              {copy.minExecLabel}
            </span>
            <div
              role="group"
              aria-label={copy.minExecLabel}
              className="flex items-center gap-0.5 rounded-md border border-[#1E2634] bg-[#0B0E14] p-0.5 font-mono text-[11px] font-semibold tabular-nums"
            >
              {MIN_EXEC_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMinExecuted(opt)}
                  className={`rounded px-2 py-0.5 transition-colors whitespace-nowrap shrink-0 ${
                    minExecuted === opt
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!hasAnyMonFriTrades ? (
        <div className="p-5">
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 px-4 text-center text-xs text-slate-400">
            {emptyMessage}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 divide-y divide-[#1E2634] sm:grid-cols-2 md:grid-cols-5 md:divide-x md:divide-y-0">
            {days.map((item) => {
              const isEmpty = item.totalTrades === 0;
              const netRColor = isEmpty
                ? 'text-slate-500'
                : item.netR > 0
                  ? 'text-emerald-400'
                  : item.netR < 0
                    ? 'text-rose-400'
                    : 'text-slate-200';
              const avgRColor =
                item.executedTrades === 0
                  ? 'text-slate-500'
                  : item.avgR > 0
                    ? 'text-emerald-400'
                    : item.avgR < 0
                      ? 'text-rose-400'
                      : 'text-slate-200';

              return (
                <div
                  key={item.dayIndex}
                  className={`px-4 py-3.5 transition-colors ${getCellSurfaceClass(item)}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          isEmpty ? 'text-slate-500' : 'text-slate-100'
                        }`}
                      >
                        {fullNames[item.dayIndex]}
                      </span>
                      {!isEmpty ? (
                        <span className="font-mono text-[11px] font-semibold text-slate-200 tabular-nums whitespace-nowrap">
                          {item.executedTrades} {copy.executedShort}
                        </span>
                      ) : null}
                    </div>
                    {!isEmpty ? (
                      <div className="min-h-[16px] flex items-center">
                        {renderStatusBadge(item)}
                      </div>
                    ) : null}
                  </div>

                  {isEmpty ? (
                    <div className="mt-3 font-mono text-xs text-slate-600 tabular-nums">
                      {copy.noDayTrades}
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-1.5 font-mono tabular-nums">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-sans text-[11px] text-slate-400">
                          {copy.netR}
                        </span>
                        <span className={`text-base font-bold ${netRColor}`}>
                          {formatR(item.netR)}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-sans text-[11px] text-slate-400">
                          {copy.avgR}
                        </span>
                        <span className={`font-semibold ${avgRColor}`}>
                          {item.executedTrades > 0 ? formatR(item.avgR) : '—'}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-sans text-[11px] text-slate-400">
                          {copy.winRate}
                        </span>
                        <span className="font-semibold text-slate-200">
                          {item.executedTrades > 0
                            ? `${item.winRatePct.toFixed(1)}%`
                            : '—'}
                        </span>
                      </div>

                      <div className="pt-1 text-[10px] text-slate-500">
                        {item.wins} TP · {item.losses} SL · {item.breakevens} BE
                        {item.unfilled > 0 ? ` · ${item.unfilled} UF` : ''}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Compact Auto-Insight Row */}
          <div className="grid grid-cols-1 divide-y divide-[#1E2634] border-t border-[#1E2634] bg-[#0B0E14]/55 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {/* 1. Weakest Asset+Setup on Weakest Day */}
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-medium text-slate-400">
                <span>
                  {insights.weakestDayIndex ? (
                    <>
                      {copy.weakestDayInsight}{' '}
                      <span className="font-semibold text-rose-400">
                        {fullNames[insights.weakestDayIndex]}
                      </span>
                    </>
                  ) : (
                    copy.noWeakestDay
                  )}
                </span>
                {insights.weakestDayFallbackMax !== null ? (
                  <span className="font-mono text-[10px] text-amber-400/90 tabular-nums">
                    {copy.fallbackPrefix} {insights.weakestDayFallbackMax} {copy.executedShort}
                  </span>
                ) : null}
              </div>
              {insights.weakestOnWeakestDay ? (
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
                  <span className="truncate font-semibold text-slate-100">
                    {insights.weakestOnWeakestDay.asset} ·{' '}
                    <span className="text-slate-300">
                      {insights.weakestOnWeakestDay.setup}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <strong
                      className={
                        insights.weakestOnWeakestDay.netR < 0
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }
                    >
                      {formatR(insights.weakestOnWeakestDay.netR)}
                    </strong>
                    <span className="text-[10px] text-slate-500">
                      {insights.weakestOnWeakestDay.executedTrades}{' '}
                      {copy.executedShort} ·{' '}
                      {insights.weakestOnWeakestDay.winRatePct.toFixed(0)}% WR
                    </span>
                  </span>
                </div>
              ) : (
                <div className="mt-1 font-mono text-xs text-slate-500">
                  {copy.noDataShort}
                </div>
              )}
            </div>

            {/* 2. Best Asset+Setup on Top Profit Day */}
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-medium text-slate-400">
                <span>
                  {insights.topDayIndex ? (
                    <>
                      {copy.topDayInsight}{' '}
                      <span className="font-semibold text-emerald-400">
                        {fullNames[insights.topDayIndex]}
                      </span>
                    </>
                  ) : (
                    copy.noTopDay
                  )}
                </span>
                {insights.topDayFallbackMax !== null ? (
                  <span className="font-mono text-[10px] text-amber-400/90 tabular-nums">
                    {copy.fallbackPrefix} {insights.topDayFallbackMax} {copy.executedShort}
                  </span>
                ) : null}
              </div>
              {insights.bestOnTopDay ? (
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
                  <span className="truncate font-semibold text-slate-100">
                    {insights.bestOnTopDay.asset} ·{' '}
                    <span className="text-slate-300">
                      {insights.bestOnTopDay.setup}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <strong
                      className={
                        insights.bestOnTopDay.netR > 0
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                      }
                    >
                      {formatR(insights.bestOnTopDay.netR)}
                    </strong>
                    <span className="text-[10px] text-slate-500">
                      {insights.bestOnTopDay.executedTrades}{' '}
                      {copy.executedShort} ·{' '}
                      {insights.bestOnTopDay.winRatePct.toFixed(0)}% WR
                    </span>
                  </span>
                </div>
              ) : (
                <div className="mt-1 font-mono text-xs text-slate-500">
                  {copy.noDataShort}
                </div>
              )}
            </div>

            {/* 3. #1 Overall Best and Worst Asset+Setup by Net R */}
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-medium text-slate-400">
                <span>{copy.overallInsight}</span>
                {insights.overallFallbackMax !== null ? (
                  <span className="font-mono text-[10px] text-amber-400/90 tabular-nums">
                    {copy.fallbackPrefix} {insights.overallFallbackMax} {copy.executedShort}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                    ≥ {insights.minExecutedApplied} {copy.executedShort}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5 font-mono text-xs tabular-nums">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-slate-300">
                    <span className="font-sans text-[10px] font-semibold text-emerald-400 uppercase">
                      {copy.overallBestLabel}
                    </span>{' '}
                    ·{' '}
                    {insights.overallBest ? (
                      <span className="font-semibold text-slate-100">
                        {insights.overallBest.asset}{' '}
                        <span className="text-slate-400">
                          ({insights.overallBest.setup})
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500">{copy.noDataShort}</span>
                    )}
                  </span>
                  {insights.overallBest ? (
                    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <strong
                        className={
                          insights.overallBest.netR >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {formatR(insights.overallBest.netR)}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        ({insights.overallBest.executedTrades})
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-slate-300">
                    <span className="font-sans text-[10px] font-semibold text-rose-400 uppercase">
                      {copy.overallWorstLabel}
                    </span>{' '}
                    ·{' '}
                    {insights.overallWorst ? (
                      <span className="font-semibold text-slate-100">
                        {insights.overallWorst.asset}{' '}
                        <span className="text-slate-400">
                          ({insights.overallWorst.setup})
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500">{copy.noDataShort}</span>
                    )}
                  </span>
                  {insights.overallWorst ? (
                    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <strong
                        className={
                          insights.overallWorst.netR < 0
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }
                      >
                        {formatR(insights.overallWorst.netR)}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        ({insights.overallWorst.executedTrades})
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
