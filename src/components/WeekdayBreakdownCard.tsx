import { useMemo } from 'react';
import type { Language, TradeRecord, WeekdayBreakdownItem } from '../types/trading';
import { calculateWeekdayBreakdown, formatR } from '../utils/calculations';

interface WeekdayBreakdownCardProps {
  trades: TradeRecord[];
  lang: Language;
  subtitle: string;
  emptyMessage: string;
}

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
    noDayTrades: 'Nessun trade',
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
    noDayTrades: 'No trades',
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
    noDayTrades: 'Sin trades',
  },
} as const;

export function WeekdayBreakdownCard({
  trades,
  lang,
  subtitle,
  emptyMessage,
}: WeekdayBreakdownCardProps) {
  const days = useMemo(() => calculateWeekdayBreakdown(trades), [trades]);
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

  const renderStatusLabel = (item: WeekdayBreakdownItem) => {
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
    if (item.totalTrades > 0) {
      return (
        <span className="font-mono text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
          {item.executedTrades} {copy.executedShort}
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
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#1E2634] px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{copy.title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

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
      </div>

      {!hasAnyMonFriTrades ? (
        <div className="p-5">
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 px-4 text-center text-xs text-slate-400">
            {emptyMessage}
          </div>
        </div>
      ) : (
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
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      isEmpty ? 'text-slate-500' : 'text-slate-100'
                    }`}
                  >
                    {fullNames[item.dayIndex]}
                  </span>
                  {renderStatusLabel(item)}
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
      )}
    </section>
  );
}
