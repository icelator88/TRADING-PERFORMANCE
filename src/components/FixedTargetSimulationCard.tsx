import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import type { Language, TradeRecord } from '../types/trading';
import {
  formatR,
  roundTo,
  sortTradesChronologically,
} from '../utils/calculations';

interface FixedTargetSimulationCardProps {
  lang: Language;
  assetFilter: string;
  allAssetsBacktestTrades: TradeRecord[];
  selectedAssetBacktestTrades: TradeRecord[];
}

const FIXED_TARGETS = [3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10] as const;

interface TargetSimRow {
  target: number;
  label: string;
  netR: number;
  winRatePct: number;
  maxConsecutiveLosses: number;
  sustainabilityScore: number;
  wins: number;
  losses: number;
  breakevens: number;
  executedCount: number;
}

interface SeriesSimResult {
  rows: TargetSimRow[];
  bestTarget: number | null;
  bestNetR: number;
  bestWinRatePct: number;
  bestMaxConsecutiveLosses: number;
  bestSustainabilityScore: number;
  executedCount: number;
}

function formatTargetLabel(target: number): string {
  return `1:${Number.isInteger(target) ? target : target.toFixed(1)}`;
}

function simulateFixedTargets(trades: TradeRecord[]): SeriesSimResult {
  const orderedExecuted = sortTradesChronologically(trades).filter(
    (tr) => tr.outcome !== 'UNFILLED',
  );
  const executedCount = orderedExecuted.length;

  const rows: TargetSimRow[] = FIXED_TARGETS.map((target) => {
    let wins = 0;
    let losses = 0;
    let breakevens = 0;
    let netR = 0;
    let curLossStreak = 0;
    let maxConsecutiveLosses = 0;

    for (const tr of orderedExecuted) {
      const rawRrMax =
        tr.rrMax != null && Number.isFinite(tr.rrMax)
          ? tr.rrMax
          : tr.outcome === 'TP' && Number.isFinite(tr.netR) && tr.netR > 0
            ? tr.netR
            : null;

      if (rawRrMax !== null && rawRrMax >= target) {
        wins += 1;
        netR += target;
        curLossStreak = 0;
      } else if (tr.outcome === 'STOP LOSS' || tr.netR < 0) {
        losses += 1;
        netR -= 1;
        curLossStreak += 1;
        if (curLossStreak > maxConsecutiveLosses) {
          maxConsecutiveLosses = curLossStreak;
        }
      } else {
        // 0 R breakeven / missed target: adds no -1 R loss, but does not break a losing stretch until a target win occurs
        breakevens += 1;
      }
    }

    const roundedNetR = roundTo(netR, 2);
    const winRatePct =
      executedCount > 0 ? roundTo((wins / executedCount) * 100, 1) : 0;

    // Balanced sustainability score: Net R weighted by Win Rate and penalized by Max Consecutive Losses
    const sustainabilityScore =
      roundedNetR > 0 && winRatePct > 0
        ? roundTo(
            (roundedNetR * Math.sqrt(winRatePct / 100)) /
              Math.sqrt(Math.max(1, maxConsecutiveLosses)),
            2,
          )
        : roundedNetR;

    return {
      target,
      label: formatTargetLabel(target),
      netR: roundedNetR,
      winRatePct,
      maxConsecutiveLosses,
      sustainabilityScore,
      wins,
      losses,
      breakevens,
      executedCount,
    };
  });

  let bestRow: TargetSimRow | null = null;

  if (executedCount > 0) {
    const positiveRows = rows.filter((r) => r.netR > 0);
    const pool = positiveRows.length > 0 ? positiveRows : rows;

    for (const row of pool) {
      if (!bestRow) {
        bestRow = row;
        continue;
      }
      if (positiveRows.length > 0) {
        const betterScore = row.sustainabilityScore > bestRow.sustainabilityScore;
        const tiedScoreBetterWr =
          row.sustainabilityScore === bestRow.sustainabilityScore &&
          row.winRatePct > bestRow.winRatePct;
        const tiedAllBetterLoss =
          row.sustainabilityScore === bestRow.sustainabilityScore &&
          row.winRatePct === bestRow.winRatePct &&
          row.maxConsecutiveLosses < bestRow.maxConsecutiveLosses;
        const tiedAllBetterNetR =
          row.sustainabilityScore === bestRow.sustainabilityScore &&
          row.winRatePct === bestRow.winRatePct &&
          row.maxConsecutiveLosses === bestRow.maxConsecutiveLosses &&
          row.netR > bestRow.netR;

        if (
          betterScore ||
          tiedScoreBetterWr ||
          tiedAllBetterLoss ||
          tiedAllBetterNetR
        ) {
          bestRow = row;
        }
      } else {
        if (
          row.netR > bestRow.netR ||
          (row.netR === bestRow.netR && row.winRatePct > bestRow.winRatePct) ||
          (row.netR === bestRow.netR &&
            row.winRatePct === bestRow.winRatePct &&
            row.maxConsecutiveLosses < bestRow.maxConsecutiveLosses)
        ) {
          bestRow = row;
        }
      }
    }
  }

  return {
    rows,
    bestTarget: bestRow ? bestRow.target : null,
    bestNetR: bestRow ? bestRow.netR : 0,
    bestWinRatePct: bestRow ? bestRow.winRatePct : 0,
    bestMaxConsecutiveLosses: bestRow ? bestRow.maxConsecutiveLosses : 0,
    bestSustainabilityScore: bestRow ? bestRow.sustainabilityScore : 0,
    executedCount,
  };
}

export function FixedTargetSimulationCard({
  lang,
  assetFilter,
  allAssetsBacktestTrades,
  selectedAssetBacktestTrades,
}: FixedTargetSimulationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSelectedAsset, setLocalSelectedAsset] = useState<string>('');

  const availableAssets = useMemo(
    () =>
      Array.from(
        new Set(
          allAssetsBacktestTrades
            .map((tr) => tr.asset.trim().toUpperCase())
            .filter(Boolean),
        ),
      ).sort(),
    [allAssetsBacktestTrades],
  );

  const effectiveAsset = useMemo(() => {
    if (assetFilter !== 'ALL') return assetFilter.trim().toUpperCase();
    if (localSelectedAsset && availableAssets.includes(localSelectedAsset)) {
      return localSelectedAsset;
    }
    return availableAssets[0] ?? 'ALL';
  }, [assetFilter, localSelectedAsset, availableAssets]);

  const effectiveSelectedAssetTrades = useMemo(() => {
    if (assetFilter !== 'ALL') {
      return selectedAssetBacktestTrades;
    }
    if (effectiveAsset === 'ALL') {
      return allAssetsBacktestTrades;
    }
    return allAssetsBacktestTrades.filter(
      (tr) => tr.asset.trim().toUpperCase() === effectiveAsset,
    );
  }, [
    assetFilter,
    selectedAssetBacktestTrades,
    allAssetsBacktestTrades,
    effectiveAsset,
  ]);

  const selectedSim = useMemo(
    () => simulateFixedTargets(effectiveSelectedAssetTrades),
    [effectiveSelectedAssetTrades],
  );
  const totalSim = useMemo(
    () => simulateFixedTargets(allAssetsBacktestTrades),
    [allAssetsBacktestTrades],
  );

  const hasData = totalSim.executedCount > 0 || selectedSim.executedCount > 0;

  const maxLossHeader =
    lang === 'en'
      ? 'Max Consec. Losses'
      : lang === 'es'
        ? 'Pérdidas Consec. Máx.'
        : 'Max Loss Consec.';

  return (
    <section
      aria-label="Simulazione Target R Fissi (Basata su RR Max)"
      className="rounded-lg border border-[#1E2634] bg-[#121721]"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg px-5 py-4 text-left transition-colors hover:bg-[#171E2B]/70"
      >
        <div className="flex items-start gap-2.5">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                {lang === 'en'
                  ? 'Fixed R Target Simulation (Based on RR Max)'
                  : lang === 'es'
                    ? 'Simulación Target R Fijos (Basada en RR Max)'
                    : 'Simulazione Target R Fissi (Basata su RR Max)'}
              </h2>
              <span className="rounded border border-[#263042] bg-[#0B0E14] px-2 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                Solo Backtest
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {lang === 'en'
                ? 'Compares fixed R:R targets (1:3 to 1:10) on Backtest data by sustainability (Net R, Win Rate & Max Consecutive Losses).'
                : lang === 'es'
                  ? 'Comparativa en Backtest por target fijos de 1:3 a 1:10 según sostenibilidad (Net R, Win Rate y Pérdidas Consecutivas).'
                  : 'Confronto su dati Backtest per target fissi da 1:3 a 1:10 con punteggio bilanciato (Net R, Win Rate e Max Loss Consec.).'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasData ? (
            <>
              {selectedSim.bestTarget !== null ? (
                <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-300 tabular-nums whitespace-nowrap">
                  {effectiveAsset !== 'ALL' ? `${effectiveAsset}: ` : 'Asset: '}
                  {formatTargetLabel(selectedSim.bestTarget)} ({formatR(selectedSim.bestNetR)} ·{' '}
                  {selectedSim.bestWinRatePct.toFixed(1)}%)
                </span>
              ) : null}
              {totalSim.bestTarget !== null ? (
                <span className="rounded border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-sky-300 tabular-nums whitespace-nowrap">
                  Totale: {formatTargetLabel(totalSim.bestTarget)} ({formatR(totalSim.bestNetR)} ·{' '}
                  {totalSim.bestWinRatePct.toFixed(1)}%)
                </span>
              ) : null}
            </>
          ) : (
            <span className="rounded border border-[#263042] bg-[#0B0E14] px-2.5 py-1 font-mono text-[11px] text-slate-400">
              Nessun dato Backtest
            </span>
          )}
          <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#263042] bg-[#0B0E14] text-slate-300">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-[#1E2634] px-5 pt-4 pb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#1E2634] bg-[#0B0E14]/80 px-3.5 py-2.5 text-[11px] text-slate-400">
            <div className="space-y-1 font-mono">
              <div>
                <span className="text-emerald-300">RR Max ≥ Target X → +X R</span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-rose-300">Stop Loss → -1 R</span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-slate-300">BE / Unfilled / RR Max &lt; X → 0 R</span>
              </div>
              <div className="text-[10px] text-slate-400">
                <span className="font-semibold text-emerald-300">TOP</span>{' '}
                {lang === 'en'
                  ? '= Best Sustainability Score (Net R × √Win Rate ÷ √Max Consec. Losses)'
                  : lang === 'es'
                    ? '= Mejor Puntuación de Sostenibilidad (Net R × √Win Rate ÷ √Pérdidas Consec.)'
                    : '= Miglior Sostenibilità (Net R × √Win Rate ÷ √Max Loss Consec.)'}
              </div>
            </div>

            {assetFilter === 'ALL' && availableAssets.length > 0 ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className="text-[11px] text-slate-400">Asset Selezionato:</span>
                <select
                  value={effectiveAsset}
                  onChange={(e) => setLocalSelectedAsset(e.target.value)}
                  className="rounded border border-[#263042] bg-[#121721] px-2.5 py-1 font-mono text-xs font-semibold text-sky-300 focus:border-sky-500 focus:outline-none"
                >
                  {availableAssets.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {!hasData ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/60 text-xs text-slate-400">
              Nessun trade di Backtest disponibile per eseguire la simulazione.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#1E2634] bg-[#0B0E14]/60">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-slate-400">
                    <th className="px-4 py-3 whitespace-nowrap">Target R Fisso</th>
                    <th className="border-l border-[#1E2634] px-4 py-3 text-right whitespace-nowrap">
                      <div>
                        Asset Selezionato{' '}
                        <span className="font-mono text-sky-300">({effectiveAsset})</span>
                      </div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        Net R · {selectedSim.executedCount} eseg.
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      <div>Win Rate %</div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        ({effectiveAsset})
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      <div>{maxLossHeader}</div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        ({effectiveAsset})
                      </div>
                    </th>
                    <th className="border-l border-[#1E2634] px-4 py-3 text-right whitespace-nowrap">
                      <div>Tutti gli Asset (Totale)</div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        Net R · {totalSim.executedCount} eseg.
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      <div>Win Rate %</div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        (Totale)
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">
                      <div>{maxLossHeader}</div>
                      <div className="font-mono text-[10px] font-normal text-slate-500">
                        (Totale)
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2634] font-mono tabular-nums">
                  {FIXED_TARGETS.map((target, idx) => {
                    const selRow = selectedSim.rows[idx];
                    const totRow = totalSim.rows[idx];
                    const isBestSel = selectedSim.bestTarget === target;
                    const isBestTot = totalSim.bestTarget === target;

                    return (
                      <tr
                        key={target}
                        className="transition-colors hover:bg-[#171E2B]"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-100 whitespace-nowrap">
                          {formatTargetLabel(target)}
                        </td>

                        {/* Asset Selezionato Net R */}
                        <td
                          className={`border-l border-[#1E2634] px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestSel ? 'bg-emerald-500/15' : ''
                          }`}
                        >
                          <div className="inline-flex items-center justify-end gap-2">
                            {isBestSel ? (
                              <span
                                title={`Score Sostenibilità: ${selRow.sustainabilityScore.toFixed(2)}`}
                                className="rounded border border-emerald-500/50 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                              >
                                TOP
                              </span>
                            ) : null}
                            <span
                              className={`font-semibold ${
                                isBestSel
                                  ? 'text-emerald-300'
                                  : selRow.netR > 0
                                    ? 'text-emerald-400'
                                    : selRow.netR < 0
                                      ? 'text-rose-400'
                                      : 'text-slate-300'
                              }`}
                            >
                              {selectedSim.executedCount > 0 ? formatR(selRow.netR) : '—'}
                            </span>
                          </div>
                        </td>

                        {/* Asset Selezionato Win Rate % */}
                        <td
                          className={`px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestSel
                              ? 'bg-emerald-500/15 font-semibold text-emerald-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {selectedSim.executedCount > 0
                            ? `${selRow.winRatePct.toFixed(1)}%`
                            : '—'}
                        </td>

                        {/* Asset Selezionato Max Consecutive Losses */}
                        <td
                          className={`px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestSel
                              ? 'bg-emerald-500/15 font-semibold text-emerald-300'
                              : selRow.maxConsecutiveLosses >= 10
                                ? 'text-rose-300'
                                : 'text-slate-300'
                          }`}
                        >
                          {selectedSim.executedCount > 0
                            ? selRow.maxConsecutiveLosses
                            : '—'}
                        </td>

                        {/* Tutti gli Asset (Totale) Net R */}
                        <td
                          className={`border-l border-[#1E2634] px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestTot ? 'bg-emerald-500/15' : ''
                          }`}
                        >
                          <div className="inline-flex items-center justify-end gap-2">
                            {isBestTot ? (
                              <span
                                title={`Score Sostenibilità: ${totRow.sustainabilityScore.toFixed(2)}`}
                                className="rounded border border-emerald-500/50 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                              >
                                TOP
                              </span>
                            ) : null}
                            <span
                              className={`font-semibold ${
                                isBestTot
                                  ? 'text-emerald-300'
                                  : totRow.netR > 0
                                    ? 'text-emerald-400'
                                    : totRow.netR < 0
                                      ? 'text-rose-400'
                                      : 'text-slate-300'
                              }`}
                            >
                              {totalSim.executedCount > 0 ? formatR(totRow.netR) : '—'}
                            </span>
                          </div>
                        </td>

                        {/* Tutti gli Asset (Totale) Win Rate % */}
                        <td
                          className={`px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestTot
                              ? 'bg-emerald-500/15 font-semibold text-emerald-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {totalSim.executedCount > 0
                            ? `${totRow.winRatePct.toFixed(1)}%`
                            : '—'}
                        </td>

                        {/* Tutti gli Asset (Totale) Max Consecutive Losses */}
                        <td
                          className={`px-4 py-2.5 text-right whitespace-nowrap ${
                            isBestTot
                              ? 'bg-emerald-500/15 font-semibold text-emerald-300'
                              : totRow.maxConsecutiveLosses >= 10
                                ? 'text-rose-300'
                                : 'text-slate-300'
                          }`}
                        >
                          {totalSim.executedCount > 0
                            ? totRow.maxConsecutiveLosses
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
