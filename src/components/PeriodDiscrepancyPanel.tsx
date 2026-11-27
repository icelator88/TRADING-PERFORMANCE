import { useMemo, useState } from 'react';
import { ExternalLink, Filter } from 'lucide-react';
import type { Language, TradeRecord } from '../types/trading';
import { isConsciousSkipTrade } from '../utils/aiDisciplineCoach';
import { formatDisplayDate, formatR } from '../utils/calculations';

interface PeriodDiscrepancyPanelProps {
  lang: Language;
  pnlMode: 'monthly' | 'daily';
  selectedPeriod: string | null;
  periodLabel: string | null;
  backtestTrades: TradeRecord[];
  liveTrades: TradeRecord[];
  missedTrades: TradeRecord[];
}

type DiscrepancyKind =
  | 'mancato'
  | 'fuori_piano'
  | 'esito_diverso'
  | 'allineato'
  | 'skip_consapevole'
  | 'unfilled';

interface PeriodComparisonRow {
  rowKey: string;
  date: string;
  entryTime: string;
  asset: string;
  setup: string;
  btBias: string | null;
  liveBias: string | null;
  btTrade: TradeRecord | null;
  liveTrade: TradeRecord | null;
  discrepancyKind: DiscrepancyKind;
  isDiscrepancy: boolean;
  notes: string;
  btUrl: string | null;
  liveUrl: string | null;
}

function normAsset(s: string | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

function normSetup(s: string | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

function normBias(s: string | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

function parseMinutes(entryTime: string | undefined): number | null {
  const raw = (entryTime ?? '').trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function timeDistanceMinutes(a: TradeRecord, b: TradeRecord): number {
  const ma = parseMinutes(a.entryTime);
  const mb = parseMinutes(b.entryTime);
  if (ma === null || mb === null) return 0;
  return Math.abs(ma - mb);
}

function safeTradingViewUrl(url: string | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function formatOutcomeBadge(trade: TradeRecord | null) {
  if (!trade) {
    return <span className="font-mono text-xs text-slate-500">—</span>;
  }

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
      ? 'text-emerald-300'
      : trade.netR < 0
        ? 'text-rose-300'
        : 'text-slate-300';

  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums whitespace-nowrap">
      <span className={`font-semibold ${outcomeColor}`}>{trade.outcome}</span>
      <span className={`text-[11px] ${rColor}`}>({formatR(trade.netR)})</span>
    </div>
  );
}

export function PeriodDiscrepancyPanel({
  lang,
  pnlMode,
  selectedPeriod,
  periodLabel,
  backtestTrades,
  liveTrades,
  missedTrades,
}: PeriodDiscrepancyPanelProps) {
  const [filterMode, setFilterMode] = useState<'discrepancies' | 'all'>('discrepancies');

  const matchesPeriod = (dateStr: string) => {
    if (!selectedPeriod) return false;
    return pnlMode === 'monthly'
      ? dateStr.slice(0, 7) === selectedPeriod
      : dateStr === selectedPeriod;
  };

  const { allRows, discrepancyRows, counts, periodBtNetR, periodLiveNetR } = useMemo(() => {
    if (!selectedPeriod) {
      return {
        allRows: [] as PeriodComparisonRow[],
        discrepancyRows: [] as PeriodComparisonRow[],
        counts: { mancato: 0, fuoriPiano: 0, esitoDiverso: 0, allineato: 0 },
        periodBtNetR: 0,
        periodLiveNetR: 0,
      };
    }

    const periodBt = backtestTrades
      .filter((tr) => matchesPeriod(tr.date))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.entryTime ?? '').localeCompare(b.entryTime ?? ''));
    const periodLive = liveTrades
      .filter((tr) => matchesPeriod(tr.date))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.entryTime ?? '').localeCompare(b.entryTime ?? ''));
    const periodMissed = missedTrades.filter((tr) => matchesPeriod(tr.date));

    const matchedBtIds = new Set<string>();
    const matchedLiveIds = new Set<string>();
    const rows: PeriodComparisonRow[] = [];

    const pairList: Array<{ bt: TradeRecord; live: TradeRecord }> = [];

    // Pass 1: Exact Date + Asset + Setup + Direction
    periodBt.forEach((bt) => {
      let bestLive: TradeRecord | null = null;
      let bestDist = Infinity;
      for (const live of periodLive) {
        if (matchedLiveIds.has(live.id)) continue;
        if (
          live.date === bt.date &&
          normAsset(live.asset) === normAsset(bt.asset) &&
          normSetup(live.setup) === normSetup(bt.setup) &&
          normBias(live.bias) === normBias(bt.bias)
        ) {
          const dist = timeDistanceMinutes(bt, live);
          if (dist < bestDist) {
            bestDist = dist;
            bestLive = live;
          }
        }
      }
      if (bestLive) {
        matchedBtIds.add(bt.id);
        matchedLiveIds.add(bestLive.id);
        pairList.push({ bt, live: bestLive });
      }
    });

    // Pass 2: Same Date + Asset + Setup (or missing setup), catching wrong direction
    periodBt.forEach((bt) => {
      if (matchedBtIds.has(bt.id)) return;
      let bestLive: TradeRecord | null = null;
      let bestDist = Infinity;
      const btSetup = normSetup(bt.setup);
      for (const live of periodLive) {
        if (matchedLiveIds.has(live.id)) continue;
        const liveSetup = normSetup(live.setup);
        const setupMatch = btSetup === liveSetup || !btSetup || !liveSetup;
        if (
          live.date === bt.date &&
          normAsset(live.asset) === normAsset(bt.asset) &&
          setupMatch
        ) {
          const dist = timeDistanceMinutes(bt, live);
          if (dist < bestDist) {
            bestDist = dist;
            bestLive = live;
          }
        }
      }
      if (bestLive) {
        matchedBtIds.add(bt.id);
        matchedLiveIds.add(bestLive.id);
        pairList.push({ bt, live: bestLive });
      }
    });

    // Build rows for matched pairs
    pairList.forEach(({ bt, live }) => {
      const hasSkip = isConsciousSkipTrade(bt) || isConsciousSkipTrade(live);
      const outcomeDiffers = bt.outcome !== live.outcome;
      const biasDiffers = normBias(bt.bias) !== normBias(live.bias);
      const isDiscrepancy = !hasSkip && (outcomeDiffers || biasDiffers);

      const discrepancyKind: DiscrepancyKind = hasSkip
        ? 'skip_consapevole'
        : isDiscrepancy
          ? 'esito_diverso'
          : 'allineato';

      const noteParts = [live.notes?.trim(), bt.notes?.trim()].filter(
        (v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx,
      );

      rows.push({
        rowKey: `pair_${bt.id}_${live.id}`,
        date: bt.date,
        entryTime: live.entryTime || bt.entryTime || '',
        asset: bt.asset || live.asset,
        setup: bt.setup || live.setup,
        btBias: bt.bias,
        liveBias: live.bias,
        btTrade: bt,
        liveTrade: live,
        discrepancyKind,
        isDiscrepancy,
        notes: noteParts.join(' · '),
        btUrl: safeTradingViewUrl(bt.tradingViewUrl),
        liveUrl: safeTradingViewUrl(live.tradingViewUrl),
      });
    });

    // Build rows for unmatched Backtest trades (missed in Journal Reale)
    const linkedMissedIds = new Set<string>();
    periodBt.forEach((bt) => {
      if (matchedBtIds.has(bt.id)) return;

      const btSetup = normSetup(bt.setup);
      const matchingMissed = periodMissed.find((m) => {
        if (linkedMissedIds.has(m.id)) return false;
        if (m.date !== bt.date || normAsset(m.asset) !== normAsset(bt.asset)) return false;
        const mSetup = normSetup(m.setup);
        return !btSetup || !mSetup || btSetup === mSetup;
      });
      if (matchingMissed) linkedMissedIds.add(matchingMissed.id);

      const isConscious =
        isConsciousSkipTrade(bt) ||
        (matchingMissed ? isConsciousSkipTrade(matchingMissed) : false);
      const isBtUnfilled = bt.outcome === 'UNFILLED';

      const discrepancyKind: DiscrepancyKind = isConscious
        ? 'skip_consapevole'
        : isBtUnfilled
          ? 'unfilled'
          : 'mancato';

      const noteText =
        bt.notes?.trim() ||
        matchingMissed?.notes?.trim() ||
        matchingMissed?.missedReason?.trim() ||
        '';

      rows.push({
        rowKey: `bt_${bt.id}`,
        date: bt.date,
        entryTime: bt.entryTime || '',
        asset: bt.asset,
        setup: bt.setup,
        btBias: bt.bias,
        liveBias: null,
        btTrade: bt,
        liveTrade: null,
        discrepancyKind,
        isDiscrepancy: !isConscious && !isBtUnfilled,
        notes: noteText,
        btUrl: safeTradingViewUrl(bt.tradingViewUrl) ?? safeTradingViewUrl(matchingMissed?.tradingViewUrl),
        liveUrl: null,
      });
    });

    // Build rows for unmatched Journal Reale trades (extra unplanned trades)
    periodLive.forEach((live) => {
      if (matchedLiveIds.has(live.id)) return;

      const isConscious = isConsciousSkipTrade(live);
      const isUnfilled = live.outcome === 'UNFILLED';

      const discrepancyKind: DiscrepancyKind = isConscious
        ? 'skip_consapevole'
        : isUnfilled
          ? 'unfilled'
          : 'fuori_piano';

      rows.push({
        rowKey: `live_${live.id}`,
        date: live.date,
        entryTime: live.entryTime || '',
        asset: live.asset,
        setup: live.setup,
        btBias: null,
        liveBias: live.bias,
        btTrade: null,
        liveTrade: live,
        discrepancyKind,
        isDiscrepancy: !isConscious && !isUnfilled,
        notes: live.notes?.trim() || '',
        btUrl: null,
        liveUrl: safeTradingViewUrl(live.tradingViewUrl),
      });
    });

    rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.entryTime !== b.entryTime) return b.entryTime.localeCompare(a.entryTime);
      return a.asset.localeCompare(b.asset);
    });

    const discRows = rows.filter((r) => r.isDiscrepancy);
    const btSum = periodBt.reduce((acc, tr) => acc + (Number.isFinite(tr.netR) ? tr.netR : 0), 0);
    const liveSum = periodLive.reduce((acc, tr) => acc + (Number.isFinite(tr.netR) ? tr.netR : 0), 0);

    return {
      allRows: rows,
      discrepancyRows: discRows,
      counts: {
        mancato: discRows.filter((r) => r.discrepancyKind === 'mancato').length,
        fuoriPiano: discRows.filter((r) => r.discrepancyKind === 'fuori_piano').length,
        esitoDiverso: discRows.filter((r) => r.discrepancyKind === 'esito_diverso').length,
        allineato: rows.filter((r) => r.discrepancyKind === 'allineato').length,
      },
      periodBtNetR: Math.round(btSum * 100) / 100,
      periodLiveNetR: Math.round(liveSum * 100) / 100,
    };
  }, [selectedPeriod, pnlMode, backtestTrades, liveTrades, missedTrades]);

  const displayedRows = filterMode === 'discrepancies' ? discrepancyRows : allRows;
  const periodDeltaR = Math.round((periodLiveNetR - periodBtNetR) * 100) / 100;

  const renderBadge = (row: PeriodComparisonRow) => {
    switch (row.discrepancyKind) {
      case 'mancato':
        return (
          <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 whitespace-nowrap">
            {lang === 'en' ? 'Missed' : 'Mancato'}
          </span>
        );
      case 'fuori_piano':
        return (
          <span className="inline-flex items-center rounded border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-300 whitespace-nowrap">
            {lang === 'en' ? 'Extra Trade' : 'Fuori Piano'}
          </span>
        );
      case 'esito_diverso':
        return (
          <span className="inline-flex items-center rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300 whitespace-nowrap">
            {lang === 'en' ? 'Outcome Diff' : 'Esito Diverso'}
          </span>
        );
      case 'skip_consapevole':
        return (
          <span className="inline-flex items-center rounded border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300 whitespace-nowrap">
            {lang === 'en' ? 'Conscious Skip' : 'Skip Consapevole'}
          </span>
        );
      case 'unfilled':
        return (
          <span className="inline-flex items-center rounded border border-[#263042] bg-[#0B0E14] px-2 py-0.5 font-mono text-[10px] text-slate-400 whitespace-nowrap">
            Unfilled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300 whitespace-nowrap">
            {lang === 'en' ? 'Aligned' : 'Allineato'}
          </span>
        );
    }
  };

  return (
    <section
      aria-label="Dettaglio & Scostamento Periodo"
      className="rounded-lg border border-[#1E2634] bg-[#121721] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2634] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-100">
              {lang === 'en'
                ? 'Period Detail & Execution Discrepancies'
                : 'Dettaglio & Scostamento Periodo'}
            </h3>
            {periodLabel ? (
              <span className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                {periodLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {selectedPeriod
              ? lang === 'en'
                ? 'Click any bar on the PnL Distribution chart above to inspect discrepancies for that period.'
                : 'Clicca su qualsiasi barra del grafico Distribuzione PnL (R) sopra per ispezionare gli scostamenti del periodo.'
              : lang === 'en'
                ? 'No period selected.'
                : 'Nessun periodo disponibile nella selezione corrente.'}
          </p>
        </div>

        {/* Toggle Filter: Solo Scostamenti vs Tutti i Trade del Periodo */}
        <div
          role="group"
          aria-label="Filtro dettaglio periodo"
          className="inline-flex items-center gap-1 rounded-md border border-[#1E2634] bg-[#0B0E14] p-0.5 text-[11px] font-medium"
        >
          <button
            type="button"
            onClick={() => setFilterMode('discrepancies')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors whitespace-nowrap ${
              filterMode === 'discrepancies'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Filter className="h-3 w-3" />
            <span>
              {lang === 'en' ? 'Discrepancies Only' : 'Solo Scostamenti'} ({discrepancyRows.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded px-2.5 py-1 transition-colors whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {lang === 'en' ? 'All Period Trades' : 'Tutti i Trade del Periodo'} ({allRows.length})
          </button>
        </div>
      </div>

      {/* Compact Period Metrics Summary Strip */}
      {selectedPeriod ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#1E2634] bg-[#0B0E14]/80 px-4 py-2.5 font-mono text-xs tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-400">
              Backtest:{' '}
              <span className={periodBtNetR >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                {formatR(periodBtNetR)}
              </span>
            </span>
            <span className="text-slate-400">
              Journal Reale:{' '}
              <span className={periodLiveNetR >= 0 ? 'font-semibold text-[#60A5FA]' : 'font-semibold text-rose-400'}>
                {formatR(periodLiveNetR)}
              </span>
            </span>
            <span className="text-slate-400">
              Scostamento:{' '}
              <span className={periodDeltaR >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-amber-400'}>
                {formatR(periodDeltaR)}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span>
              Mancati: <span className="font-semibold text-amber-300">{counts.mancato}</span>
            </span>
            <span>
              Fuori Piano: <span className="font-semibold text-violet-300">{counts.fuoriPiano}</span>
            </span>
            <span>
              Esito Diverso: <span className="font-semibold text-rose-300">{counts.esitoDiverso}</span>
            </span>
            <span>
              Allineati: <span className="font-semibold text-emerald-300">{counts.allineato}</span>
            </span>
          </div>
        </div>
      ) : null}

      {/* Comparison Table */}
      {!selectedPeriod ? (
        <div className="mt-4 flex h-28 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 text-xs text-slate-400">
          {lang === 'en'
            ? 'No trades available for period comparison.'
            : 'Nessun trade disponibile per il confronto del periodo.'}
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="mt-4 flex h-28 items-center justify-center rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/[0.04] px-4 text-center text-xs text-emerald-300">
          {filterMode === 'discrepancies'
            ? lang === 'en'
              ? '100% aligned in this period — no unexplained missed trades, extra trades, or outcome discrepancies.'
              : 'Esecuzione 100% allineata nel periodo selezionato: nessuno scostamento rilevato tra Backtest e Journal Reale (esclusi skip CONSAPEVOLE).'
            : lang === 'en'
              ? 'No trades recorded in this period.'
              : 'Nessun trade registrato nel periodo selezionato.'}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-[#1E2634] bg-[#0B0E14]/60">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-slate-400">
                <th className="px-3.5 py-2.5 whitespace-nowrap">Data</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Asset</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Setup</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Direzione</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Esito Backtest (R)</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Esito Journal Reale (R)</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Scostamento</th>
                <th className="min-w-[180px] px-3.5 py-2.5">Note</th>
                <th className="px-3.5 py-2.5 text-center whitespace-nowrap">Grafico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2634]">
              {displayedRows.map((row) => {
                const sameDirection =
                  row.btBias && row.liveBias
                    ? normBias(row.btBias) === normBias(row.liveBias)
                    : true;
                const displayBias = row.btBias ?? row.liveBias ?? '—';
                const dirColor =
                  displayBias === 'LONG'
                    ? 'text-emerald-400'
                    : displayBias === 'SHORT'
                      ? 'text-rose-400'
                      : 'text-slate-300';

                const primaryUrl = row.liveUrl || row.btUrl;
                const hasDistinctSecondUrl = Boolean(row.liveUrl && row.btUrl && row.liveUrl !== row.btUrl);

                return (
                  <tr
                    key={row.rowKey}
                    className="transition-colors hover:bg-[#171E2B]"
                  >
                    <td className="px-3.5 py-2.5 font-mono text-slate-200 tabular-nums whitespace-nowrap">
                      <span>{formatDisplayDate(row.date)}</span>
                      {row.entryTime ? (
                        <span className="ml-1.5 text-[10px] text-slate-500">
                          {row.entryTime}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-100 whitespace-nowrap">
                      {row.asset}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-sky-300 whitespace-nowrap">
                      {row.setup}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-semibold whitespace-nowrap">
                      {sameDirection ? (
                        <span className={dirColor}>{displayBias}</span>
                      ) : (
                        <span className="text-rose-300">
                          BT {row.btBias} → Reale {row.liveBias}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      {formatOutcomeBadge(row.btTrade)}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      {formatOutcomeBadge(row.liveTrade)}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      {renderBadge(row)}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-3.5 py-2.5 text-slate-300"
                      title={row.notes || ''}
                    >
                      {row.notes || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                      {primaryUrl ? (
                        <div className="inline-flex items-center justify-center gap-2">
                          <a
                            href={primaryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center text-sky-400 transition-colors hover:text-sky-300"
                            title={
                              hasDistinctSecondUrl
                                ? `Grafico Journal Reale: ${primaryUrl}`
                                : primaryUrl
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          {hasDistinctSecondUrl && row.btUrl ? (
                            <a
                              href={row.btUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center text-emerald-400 transition-colors hover:text-emerald-300"
                              title={`Grafico Backtest: ${row.btUrl}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
