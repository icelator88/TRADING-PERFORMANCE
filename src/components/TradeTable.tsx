import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { TranslationSet } from '../i18n/translations';
import type { TradeCategory, TradeRecord } from '../types/trading';
import {
  formatDisplayDate,
  formatPct,
  formatR,
  sortTradesChronologically,
} from '../utils/calculations';

interface TradeTableProps {
  trades: TradeRecord[];
  category: TradeCategory;
  t: TranslationSet;
  emptyMessage: string;
  highlightedTradeIds?: string[];
  highlightDate?: string | null;
  onAddFirst: () => void;
  onLoadDemo?: () => void;
  onEdit: (trade: TradeRecord) => void;
  onDelete: (trade: TradeRecord) => void;
}

export function TradeTable({
  trades,
  category,
  t,
  emptyMessage,
  highlightedTradeIds,
  highlightDate,
  onAddFirst,
  onLoadDemo,
  onEdit,
  onDelete,
}: TradeTableProps) {
  const ordered = useMemo(
    () => sortTradesChronologically(trades).reverse(),
    [trades],
  );
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableElRef = useRef<HTMLTableElement | null>(null);
  const syncSourceRef = useRef<'top' | 'table' | null>(null);

  const [topSpacerWidth, setTopSpacerWidth] = useState<number>(0);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);

  const highlightedSet = useMemo(
    () => new Set(highlightedTradeIds ?? []),
    [highlightedTradeIds],
  );

  const highlightSignature = `${highlightDate ?? ''}|${(highlightedTradeIds ?? []).join(',')}`;

  // Discover dynamic extra column keys present across visible rows
  const extraKeys = useMemo(
    () =>
      Array.from(
        new Set(
          ordered.flatMap((tr) => (tr.extraColumns ? Object.keys(tr.extraColumns) : [])),
        ),
      ),
    [ordered],
  );

  const updateScrollButtons = useCallback(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;
    const maxScroll = Math.max(0, tableEl.scrollWidth - tableEl.clientWidth);
    setCanScrollLeft(tableEl.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && tableEl.scrollLeft < maxScroll - 2);
  }, []);

  const syncDimensions = useCallback(() => {
    const tableEl = tableScrollRef.current;
    const topEl = topScrollRef.current;
    if (!tableEl) return;

    const maxScroll = Math.max(0, tableEl.scrollWidth - tableEl.clientWidth);
    const topClientW = topEl ? topEl.clientWidth : tableEl.clientWidth;
    setTopSpacerWidth(topClientW + maxScroll);

    setCanScrollLeft(tableEl.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && tableEl.scrollLeft < maxScroll - 2);

    if (topEl && Math.abs(topEl.scrollLeft - tableEl.scrollLeft) > 1) {
      syncSourceRef.current = 'table';
      topEl.scrollLeft = tableEl.scrollLeft;
      requestAnimationFrame(() => {
        if (syncSourceRef.current === 'table') {
          syncSourceRef.current = null;
        }
      });
    }
  }, []);

  useEffect(() => {
    if (ordered.length === 0) return;
    syncDimensions();
    const rafId = requestAnimationFrame(syncDimensions);

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncDimensions();
          })
        : null;

    if (observer) {
      if (tableScrollRef.current) observer.observe(tableScrollRef.current);
      if (tableElRef.current) observer.observe(tableElRef.current);
      if (topScrollRef.current) observer.observe(topScrollRef.current);
    }

    window.addEventListener('resize', syncDimensions);
    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', syncDimensions);
    };
  }, [ordered.length, extraKeys.length, category, syncDimensions]);

  const handleTopScroll = () => {
    if (syncSourceRef.current === 'table') return;
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    syncSourceRef.current = 'top';
    tableEl.scrollLeft = topEl.scrollLeft;
    updateScrollButtons();
    requestAnimationFrame(() => {
      if (syncSourceRef.current === 'top') {
        syncSourceRef.current = null;
      }
    });
  };

  const handleTableScroll = () => {
    if (syncSourceRef.current === 'top') return;
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    syncSourceRef.current = 'table';
    topEl.scrollLeft = tableEl.scrollLeft;
    updateScrollButtons();
    requestAnimationFrame(() => {
      if (syncSourceRef.current === 'table') {
        syncSourceRef.current = null;
      }
    });
  };

  const scrollByStep = (direction: 'left' | 'right') => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;
    const step = Math.max(240, Math.round(tableEl.clientWidth * 0.45));
    tableEl.scrollBy({
      left: direction === 'right' ? step : -step,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    if (!highlightDate && highlightedSet.size === 0) return;
    const timer = window.setTimeout(() => {
      const container = tableContainerRef.current;
      if (!container) return;
      const targetRow = container.querySelector<HTMLTableRowElement>(
        'tr[data-highlighted-mistake="true"]',
      );
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [highlightSignature, highlightDate, highlightedSet.size, ordered.length]);

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-[#1E2634] bg-[#121721] px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-200">{emptyMessage}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAddFirst}
            className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
          >
            {t.journal.addFirstTrade}
          </button>
          {onLoadDemo ? (
            <button
              type="button"
              onClick={onLoadDemo}
              className="rounded-md border border-[#263042] bg-[#0B0E14] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50"
            >
              {t.journal.loadDemoData}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={tableContainerRef}
      className="overflow-hidden rounded-lg border border-[#1E2634] bg-[#121721]"
    >
      {/* Synchronized Top Horizontal Scrollbar + Compact Left/Right Buttons */}
      <div className="flex items-center gap-2 border-b border-[#1E2634] bg-[#0B0E14]/90 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => scrollByStep('left')}
          disabled={!canScrollLeft}
          aria-label="Scorri tabella a sinistra"
          title="Scorri a sinistra"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#263042] bg-[#121721] text-slate-300 transition-colors hover:border-sky-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          aria-label="Barra di scorrimento orizzontale tabella"
          className="top-sync-scrollbar flex-1 overflow-x-auto overflow-y-hidden"
        >
          <div
            style={{ width: topSpacerWidth > 0 ? `${topSpacerWidth}px` : '100%', height: '1px' }}
          />
        </div>

        <button
          type="button"
          onClick={() => scrollByStep('right')}
          disabled={!canScrollRight}
          aria-label="Scorri tabella a destra"
          title="Scorri a destra"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#263042] bg-[#121721] text-slate-300 transition-colors hover:border-sky-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={tableScrollRef}
        onScroll={handleTableScroll}
        className="overflow-x-auto"
      >
        <table ref={tableElRef} className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-xs font-semibold text-slate-400">
              <th className="px-3.5 py-3 whitespace-nowrap">{t.table.date}</th>
              <th className="px-3.5 py-3 whitespace-nowrap">{t.table.asset}</th>
              <th className="px-3.5 py-3 whitespace-nowrap">{t.table.setup}</th>
              <th className="px-3.5 py-3 whitespace-nowrap">{t.table.bias}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.pips}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.risk}</th>
              <th className="px-3.5 py-3 whitespace-nowrap">{t.table.outcome}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.netR}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.rrMax}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.netPct}</th>
              {category === 'missed' ? (
                <th className="px-3.5 py-3 whitespace-nowrap">{t.table.missedReason}</th>
              ) : null}
              {extraKeys.map((k) => (
                <th key={k} className="px-3.5 py-3 whitespace-nowrap">
                  {k}
                </th>
              ))}
              <th className="min-w-[160px] px-3.5 py-3">{t.table.notes}</th>
              <th className="px-3.5 py-3 text-center whitespace-nowrap">{t.table.link}</th>
              <th className="px-3.5 py-3 text-right whitespace-nowrap">{t.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((trade) => {
              const dirColor =
                trade.bias === 'LONG' ? 'text-emerald-400' : 'text-rose-400';
              const outcomeColor =
                trade.outcome === 'TP'
                  ? 'text-emerald-400'
                  : trade.outcome === 'STOP LOSS'
                    ? 'text-rose-400'
                    : trade.outcome === 'UNFILLED'
                      ? 'text-slate-400'
                      : 'text-amber-400';
              const rColor =
                trade.netR > 0
                  ? 'text-emerald-400'
                  : trade.netR < 0
                    ? 'text-rose-400'
                    : 'text-slate-300';

              const pipsSummary =
                trade.slPips != null && trade.tpPips != null
                  ? `${trade.slPips} / ${trade.tpPips}${trade.targetRR != null ? ` (${trade.targetRR.toFixed(2)}R)` : ''}`
                  : trade.targetRR != null
                    ? `${trade.targetRR.toFixed(2)}R`
                    : '—';

              const isHighlighted =
                highlightedSet.has(trade.id) ||
                (highlightedSet.size === 0 &&
                  Boolean(highlightDate && trade.date === highlightDate));

              return (
                <tr
                  key={trade.id}
                  data-highlighted-mistake={isHighlighted ? 'true' : undefined}
                  className={
                    isHighlighted
                      ? 'h-11 border-b border-rose-500/40 bg-rose-500/15 ring-1 ring-inset ring-rose-400/60 transition-colors hover:bg-rose-500/20'
                      : 'h-11 border-b border-[#1E2634] transition-colors hover:bg-[#171E2B]'
                  }
                >
                  <td className="px-3.5 py-2 font-mono text-slate-200 tabular-nums whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{formatDisplayDate(trade.date)}</span>
                      {isHighlighted ? (
                        <span className="rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-400/40">
                          Errore
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 font-mono font-semibold text-slate-100 whitespace-nowrap">
                    {trade.asset}
                  </td>
                  <td className="px-3.5 py-2 font-medium text-sky-300 whitespace-nowrap">
                    {trade.setup}
                  </td>
                  <td className={`px-3.5 py-2 font-mono font-semibold ${dirColor} whitespace-nowrap`}>
                    {trade.bias}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                    {pipsSummary}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                    {trade.riskPct.toFixed(2)}%
                  </td>
                  <td className={`px-3.5 py-2 font-semibold ${outcomeColor} whitespace-nowrap`}>
                    {trade.outcome}
                  </td>
                  <td
                    className={`px-3.5 py-2 text-right font-mono font-semibold ${rColor} tabular-nums whitespace-nowrap`}
                  >
                    {formatR(trade.netR)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                    {trade.rrMax != null ? trade.rrMax.toFixed(2) : '—'}
                  </td>
                  <td
                    className={`px-3.5 py-2 text-right font-mono font-medium ${rColor} tabular-nums whitespace-nowrap`}
                  >
                    {formatPct(trade.netReturnPct)}
                  </td>
                  {category === 'missed' ? (
                    <td className="px-3.5 py-2 font-medium text-amber-300 whitespace-nowrap">
                      {trade.missedReason || '—'}
                    </td>
                  ) : null}
                  {extraKeys.map((k) => (
                    <td
                      key={k}
                      className="max-w-[140px] truncate px-3.5 py-2 text-slate-300"
                      title={trade.extraColumns?.[k] ?? ''}
                    >
                      {trade.extraColumns?.[k] || '—'}
                    </td>
                  ))}
                  <td
                    className="max-w-[220px] truncate px-3.5 py-2 text-slate-300"
                    title={trade.notes || ''}
                  >
                    {trade.notes || '—'}
                  </td>
                  <td className="px-3.5 py-2 text-center whitespace-nowrap">
                    {trade.tradingViewUrl ? (
                      <a
                        href={trade.tradingViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-sky-400 hover:text-sky-300"
                        title={trade.tradingViewUrl}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onEdit(trade)}
                        className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        {t.table.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(trade)}
                        className="font-medium text-rose-400 hover:text-rose-300 hover:underline"
                      >
                        {t.table.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
