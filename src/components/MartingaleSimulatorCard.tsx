import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Calculator,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { Language, TradeRecord } from '../types/trading';
import {
  formatPct,
  roundTo,
  sortTradesChronologically,
} from '../utils/calculations';

interface MartingaleSimulatorCardProps {
  lang: Language;
  backtestTrades: TradeRecord[];
  liveTrades: TradeRecord[];
}

interface SimulationPoint {
  index: number;
  date: string;
  origEquity: number;
  simEquity: number;
  simRiskPct: number;
  stepUsed: number;
  blocked?: boolean;
}

interface SimulationResult {
  executedCount: number;
  origExecutedCount: number;
  totalCount: number;
  blockedTradesCount: number;
  blockedLossesCount: number;
  blockedAvoidedLossR: number;
  origFinalProfitPct: number;
  simFinalProfitPct: number;
  profitDeltaPct: number;
  origMaxDrawdownPct: number;
  simMaxDrawdownPct: number;
  simMaxDailyDrawdownPct: number;
  worstDayDate: string | null;
  maxStepReached: number;
  effectiveStepCap: number;
  dailyLimitBreached: boolean;
  totalLimitBreached: boolean;
  points: SimulationPoint[];
}

function runProgressionSimulation(
  trades: TradeRecord[],
  baseRiskPct: number,
  multiplier: number,
  maxSteps: number,
  antiMartingale: boolean,
  maxSlPerAsset: number,
): SimulationResult {
  const ordered = sortTradesChronologically(trades);

  let origEquity = 100;
  let origPeak = 100;
  let origMaxDdPct = 0;

  let simEquity = 100;
  let simPeak = 100;
  let simMaxDdPct = 0;

  let currentDay = '';
  let dayStartSimEquity = 100;
  let simMaxDailyDdPct = 0;
  let worstDayDate: string | null = null;

  let currentWinStep = 0;
  const dailySlByAsset = new Map<string, number>();
  const assetLossStepMap = new Map<string, number>();

  let maxStepReached = 0;
  let executedCount = 0;
  let origExecutedCount = 0;
  let blockedTradesCount = 0;
  let blockedLossesCount = 0;
  let blockedAvoidedLossR = 0;

  const effectiveStepCap = antiMartingale
    ? maxSteps
    : Math.min(maxSteps, maxSlPerAsset);

  const points: SimulationPoint[] = [
    {
      index: 0,
      date: '',
      origEquity: 100,
      simEquity: 100,
      simRiskPct: baseRiskPct,
      stepUsed: 0,
    },
  ];

  ordered.forEach((tr, idx) => {
    const netR = Number.isFinite(tr.netR) ? tr.netR : 0;
    const origTradePct = Number.isFinite(tr.netReturnPct)
      ? tr.netReturnPct
      : netR * (Number.isFinite(tr.riskPct) ? tr.riskPct : 1);

    // Track start-of-day simulated equity for Prop Firm 5% daily loss check
    if (tr.date && tr.date !== currentDay) {
      currentDay = tr.date;
      dayStartSimEquity = simEquity;
    }

    // UNFILLED trades do not execute and do not advance or reset progression steps
    if (tr.outcome === 'UNFILLED') {
      points.push({
        index: idx + 1,
        date: tr.date,
        origEquity: roundTo(origEquity, 2),
        simEquity: roundTo(simEquity, 2),
        simRiskPct: roundTo(
          baseRiskPct * Math.pow(multiplier, Math.min(effectiveStepCap, currentWinStep)),
          2,
        ),
        stepUsed: 0,
      });
      return;
    }

    origExecutedCount += 1;
    origEquity = Math.max(0, origEquity * (1 + origTradePct / 100));
    if (origEquity > origPeak) origPeak = origEquity;
    if (origPeak > 0) {
      const dd = ((origPeak - origEquity) / origPeak) * 100;
      if (dd > origMaxDdPct) origMaxDdPct = dd;
    }

    const isWin = netR > 0 || (tr.outcome === 'TP' && netR >= 0);
    const isLoss = netR < 0 || (tr.outcome === 'STOP LOSS' && netR <= 0);
    const assetKey = (tr.asset || 'ASSET').trim().toUpperCase();
    const dayAssetKey = `${tr.date || 'NODATE'}|${assetKey}`;
    const dailyLossesForAsset = dailySlByAsset.get(dayAssetKey) ?? 0;

    // Enforce strict 'Max N SL per Asset' daily stop rule
    if (dailyLossesForAsset >= maxSlPerAsset) {
      blockedTradesCount += 1;
      if (isLoss) {
        blockedLossesCount += 1;
        blockedAvoidedLossR += Math.abs(netR);
      }
      points.push({
        index: idx + 1,
        date: tr.date,
        origEquity: roundTo(origEquity, 2),
        simEquity: roundTo(simEquity, 2),
        simRiskPct: 0,
        stepUsed: 0,
        blocked: true,
      });
      return;
    }

    executedCount += 1;
    const rawStep = antiMartingale
      ? currentWinStep
      : (assetLossStepMap.get(assetKey) ?? 0);
    const stepUsed = Math.min(effectiveStepCap, rawStep);
    if (stepUsed > maxStepReached) maxStepReached = stepUsed;

    const effectiveRiskPct = Math.max(
      0,
      baseRiskPct * Math.pow(multiplier, stepUsed),
    );
    const simTradePct = netR * effectiveRiskPct;

    simEquity = Math.max(0, simEquity * (1 + simTradePct / 100));
    if (simEquity > simPeak) simPeak = simEquity;
    if (simPeak > 0) {
      const dd = ((simPeak - simEquity) / simPeak) * 100;
      if (dd > simMaxDdPct) simMaxDdPct = dd;
    }

    if (dayStartSimEquity > 0) {
      const dailyDd = ((dayStartSimEquity - simEquity) / dayStartSimEquity) * 100;
      if (dailyDd > simMaxDailyDdPct) {
        simMaxDailyDdPct = dailyDd;
        worstDayDate = tr.date || null;
      }
    }

    if (isLoss) {
      dailySlByAsset.set(dayAssetKey, dailyLossesForAsset + 1);
    }

    // Advance or reset streak based on outcome and mode (Martingale capped per asset at min(maxSteps, maxSlPerAsset))
    if (antiMartingale) {
      if (isWin) {
        currentWinStep = Math.min(maxSteps, currentWinStep + 1);
      } else if (isLoss) {
        currentWinStep = 0;
      }
    } else {
      const prevAssetStep = assetLossStepMap.get(assetKey) ?? 0;
      if (isLoss) {
        assetLossStepMap.set(
          assetKey,
          Math.min(maxSteps, maxSlPerAsset, prevAssetStep + 1),
        );
      } else if (isWin) {
        assetLossStepMap.set(assetKey, 0);
      }
    }

    points.push({
      index: idx + 1,
      date: tr.date,
      origEquity: roundTo(origEquity, 2),
      simEquity: roundTo(simEquity, 2),
      simRiskPct: roundTo(effectiveRiskPct, 2),
      stepUsed,
    });
  });

  const origFinalProfitPct = roundTo(origEquity - 100, 2);
  const simFinalProfitPct = roundTo(simEquity - 100, 2);
  const simMaxDrawdownPct = roundTo(simMaxDdPct, 2);
  const simMaxDailyDrawdownPct = roundTo(simMaxDailyDdPct, 2);

  return {
    executedCount,
    origExecutedCount,
    totalCount: ordered.length,
    blockedTradesCount,
    blockedLossesCount,
    blockedAvoidedLossR: roundTo(blockedAvoidedLossR, 2),
    origFinalProfitPct,
    simFinalProfitPct,
    profitDeltaPct: roundTo(simFinalProfitPct - origFinalProfitPct, 2),
    origMaxDrawdownPct: roundTo(origMaxDdPct, 2),
    simMaxDrawdownPct,
    simMaxDailyDrawdownPct,
    worstDayDate,
    maxStepReached,
    effectiveStepCap,
    dailyLimitBreached: simMaxDailyDrawdownPct > 5,
    totalLimitBreached: simMaxDrawdownPct > 10,
    points,
  };
}

export function MartingaleSimulatorCard({
  lang,
  backtestTrades,
  liveTrades,
}: MartingaleSimulatorCardProps) {
  const [dataset, setDataset] = useState<'backtest' | 'live'>(() =>
    backtestTrades.length === 0 && liveTrades.length > 0 ? 'live' : 'backtest',
  );
  const [baseRiskPct, setBaseRiskPct] = useState<number>(1.0);
  const [multiplier, setMultiplier] = useState<number>(2.0);
  const [maxSteps, setMaxSteps] = useState<number>(3);
  const [maxSlPerAsset, setMaxSlPerAsset] = useState<number>(2);
  const [antiMartingale, setAntiMartingale] = useState<boolean>(false);

  const activeSourceTrades =
    dataset === 'live' ? liveTrades : backtestTrades;

  const safeBaseRisk = Number.isFinite(baseRiskPct)
    ? Math.max(0.05, Math.min(20, baseRiskPct))
    : 1.0;
  const safeMultiplier = Number.isFinite(multiplier)
    ? Math.max(0.1, Math.min(10, multiplier))
    : 2.0;
  const safeMaxSteps = Number.isFinite(maxSteps)
    ? Math.max(0, Math.min(12, Math.floor(maxSteps)))
    : 3;
  const safeMaxSlPerAsset = Number.isFinite(maxSlPerAsset)
    ? Math.max(1, Math.min(10, Math.floor(maxSlPerAsset)))
    : 2;

  const sim = useMemo(
    () =>
      runProgressionSimulation(
        activeSourceTrades,
        safeBaseRisk,
        safeMultiplier,
        safeMaxSteps,
        antiMartingale,
        safeMaxSlPerAsset,
      ),
    [
      activeSourceTrades,
      safeBaseRisk,
      safeMultiplier,
      safeMaxSteps,
      antiMartingale,
      safeMaxSlPerAsset,
    ],
  );

  const effectivePreviewCap = antiMartingale
    ? safeMaxSteps
    : Math.min(safeMaxSteps, safeMaxSlPerAsset);

  const stepPreview = useMemo(() => {
    const steps: string[] = [];
    const displayCount = Math.min(effectivePreviewCap + 1, 6);
    for (let i = 0; i < displayCount; i += 1) {
      const risk = roundTo(safeBaseRisk * Math.pow(safeMultiplier, i), 2);
      steps.push(`${risk}%`);
    }
    if (effectivePreviewCap + 1 > 6) {
      steps.push('...');
    }
    return steps.join(' → ');
  }, [safeBaseRisk, safeMultiplier, effectivePreviewCap]);

  const handleResetDefaults = () => {
    setBaseRiskPct(1.0);
    setMultiplier(2.0);
    setMaxSteps(3);
    setMaxSlPerAsset(2);
    setAntiMartingale(false);
  };

  // Build compact SVG comparison polyline coordinates
  const svgChart = useMemo(() => {
    if (sim.points.length <= 1) return null;
    const width = 640;
    const height = 136;
    const padX = 8;
    const padY = 12;
    const allVals = sim.points.flatMap((p) => [p.origEquity, p.simEquity]);
    const minVal = Math.min(100, ...allVals);
    const maxVal = Math.max(100, ...allVals);
    const span = Math.max(1, maxVal - minVal);
    const count = sim.points.length - 1;

    const toX = (i: number) =>
      padX + (count > 0 ? (i / count) * (width - padX * 2) : 0);
    const toY = (v: number) =>
      padY + ((maxVal - v) / span) * (height - padY * 2);

    const origLine = sim.points
      .map((p, i) => `${toX(i).toFixed(1)},${toY(p.origEquity).toFixed(1)}`)
      .join(' ');
    const simLine = sim.points
      .map((p, i) => `${toX(i).toFixed(1)},${toY(p.simEquity).toFixed(1)}`)
      .join(' ');
    const baseY = toY(100).toFixed(1);

    return { width, height, origLine, simLine, baseY };
  }, [sim.points]);

  const propFirmBreached = sim.dailyLimitBreached || sim.totalLimitBreached;

  return (
    <section
      aria-label="Simulatore Progressione & Martingala (What-If)"
      className="rounded-lg border border-[#1E2634] bg-[#121721] p-6"
    >
      {/* Header + Dataset Toggle + Prop Firm Badge */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2634] pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-indigo-500/35 bg-indigo-500/10 text-indigo-400">
            <Calculator className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-slate-100 sm:text-lg">
                Simulatore Progressione &amp; Martingala (What-If)
              </h2>
              <span className="rounded border border-[#263042] bg-[#0B0E14] px-2 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                SOLA LETTURA
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {lang === 'en'
                ? 'Simulate position-sizing progression on your currently filtered trades without altering saved data.'
                : 'Simula l’impatto di Martingala, soft scaling o Anti-Martingala sui trade attualmente filtrati senza modificare i dati salvati.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {sim.executedCount > 0 ? (
            propFirmBreached ? (
              <div
                role="alert"
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  Prop Firm Alert:
                  {sim.dailyLimitBreached
                    ? ` DD Giornaliero -${sim.simMaxDailyDrawdownPct.toFixed(2)}% (> 5%)`
                    : ''}
                  {sim.dailyLimitBreached && sim.totalLimitBreached ? ' · ' : ''}
                  {sim.totalLimitBreached
                    ? ` DD Totale -${sim.simMaxDrawdownPct.toFixed(2)}% (> 10%)`
                    : ''}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  Prop Firm Safe (≤ 5% Daily / ≤ 10% Total)
                </span>
              </div>
            )
          ) : null}

          <div
            role="group"
            aria-label="Sorgente simulazione"
            className="inline-flex items-center rounded-md border border-[#263042] bg-[#0B0E14] p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => setDataset('backtest')}
              className={`rounded px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                dataset === 'backtest'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Backtest ({backtestTrades.length})
            </button>
            <button
              type="button"
              onClick={() => setDataset('live')}
              className={`rounded px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                dataset === 'live'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Journal Reale ({liveTrades.length})
            </button>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="mt-5 grid grid-cols-1 gap-4 rounded-lg border border-[#1E2634] bg-[#0B0E14] p-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Base Risk % */}
        <div>
          <label
            htmlFor="sim-base-risk"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            Rischio Base (%)
          </label>
          <input
            id="sim-base-risk"
            type="number"
            step="0.1"
            min="0.05"
            max="20"
            value={baseRiskPct}
            onChange={(e) => setBaseRiskPct(parseFloat(e.target.value) || 0)}
            className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs font-semibold text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[0.5, 1.0, 1.5, 2.0].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setBaseRiskPct(val)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  Math.abs(safeBaseRisk - val) < 0.01
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                    : 'border-[#263042] bg-[#121721] text-slate-400 hover:text-slate-200'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        {/* 2. Multiplier */}
        <div>
          <label
            htmlFor="sim-multiplier"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            {antiMartingale
              ? 'Moltiplicatore dopo Vincita'
              : 'Moltiplicatore dopo Perdita'}
          </label>
          <input
            id="sim-multiplier"
            type="number"
            step="0.05"
            min="0.1"
            max="10"
            value={multiplier}
            onChange={(e) => setMultiplier(parseFloat(e.target.value) || 0)}
            className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs font-semibold text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[
              { val: 0.5, label: '0.5x' },
              { val: 1.0, label: '1.0x' },
              { val: 1.5, label: '1.5x' },
              { val: 2.0, label: '2.0x' },
            ].map((preset) => (
              <button
                key={preset.val}
                type="button"
                onClick={() => setMultiplier(preset.val)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  Math.abs(safeMultiplier - preset.val) < 0.01
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                    : 'border-[#263042] bg-[#121721] text-slate-400 hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Max Consecutive Steps */}
        <div>
          <label
            htmlFor="sim-max-steps"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            Max Step Consecutivi (Cap)
          </label>
          <input
            id="sim-max-steps"
            type="number"
            step="1"
            min="0"
            max="12"
            value={maxSteps}
            onChange={(e) => setMaxSteps(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs font-semibold text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none"
          />
          <div
            className="mt-1.5 truncate font-mono text-[10px] text-slate-400 tabular-nums"
            title={stepPreview}
          >
            Sequenza: {stepPreview}
          </div>
        </div>

        {/* 4. Max SL per Asset (Giornaliero / Sequenza) */}
        <div>
          <label
            htmlFor="sim-max-sl-asset"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            Max SL per Asset (Giornaliero / Sequenza)
          </label>
          <input
            id="sim-max-sl-asset"
            type="number"
            step="1"
            min="1"
            max="10"
            value={maxSlPerAsset}
            onChange={(e) => setMaxSlPerAsset(parseInt(e.target.value, 10) || 1)}
            className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs font-semibold text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[1, 2, 3, 4].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setMaxSlPerAsset(val)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  safeMaxSlPerAsset === val
                    ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                    : 'border-[#263042] bg-[#121721] text-slate-400 hover:text-slate-200'
                }`}
              >
                {val} SL
              </button>
            ))}
          </div>
        </div>

        {/* 5. Anti-Martingale Toggle + Reset */}
        <div className="flex flex-col justify-between gap-2">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Modalità Progressione
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={antiMartingale}
              onClick={() => setAntiMartingale((prev) => !prev)}
              className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                antiMartingale
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                {antiMartingale ? 'Anti-Martingala (TP)' : 'Martingala (SL)'}
              </span>
              <span
                className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                  antiMartingale ? 'bg-emerald-500 justify-end' : 'bg-slate-600 justify-start'
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white shadow-xs" />
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center justify-center gap-1.5 rounded border border-[#263042] bg-[#121721] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
          >
            <RotateCcw className="h-3 w-3" />
            Reset parametri
          </button>
        </div>
      </div>

      {/* Results Comparison */}
      {sim.origExecutedCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-[#263042] bg-[#0B0E14] px-4 py-8 text-center text-xs text-slate-400">
          Nessun trade eseguito disponibile per i filtri selezionati in{' '}
          {dataset === 'live' ? 'Journal Reale' : 'Backtest'}.
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* Daily Max SL Protection Rule Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-indigo-500/35 bg-indigo-500/10 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-indigo-200">
              <Ban className="h-4 w-4 shrink-0 text-indigo-400" />
              <span>
                <strong className="font-semibold text-indigo-100">
                  Regola Max {safeMaxSlPerAsset} SL per Asset:
                </strong>{' '}
                {sim.blockedTradesCount > 0 ? (
                  <>
                    bloccati{' '}
                    <span className="font-mono font-bold text-white tabular-nums">
                      {sim.blockedTradesCount}
                    </span>{' '}
                    trade extra nello stesso giorno ({' '}
                    <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                      {sim.blockedLossesCount} SL evitati
                    </span>
                    {sim.blockedAvoidedLossR > 0
                      ? ` · -${sim.blockedAvoidedLossR.toFixed(2)} R risparmiati`
                      : ''}
                    )
                  </>
                ) : (
                  'nessun trade extra oltre il limite giornaliero per asset nella sequenza filtrata'
                )}
              </span>
            </div>
            <span className="rounded border border-indigo-400/30 bg-[#0B0E14]/80 px-2.5 py-0.5 font-mono text-[11px] text-indigo-200 tabular-nums">
              Cap Martingala: max {sim.effectiveStepCap} step/asset
            </span>
          </div>

          {/* Original vs Simulated KPI Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-[11px] font-medium text-slate-400">
                Profitto Finale Originale
              </div>
              <div
                className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
                  sim.origFinalProfitPct >= 0 ? 'text-slate-100' : 'text-rose-400'
                }`}
              >
                {formatPct(sim.origFinalProfitPct)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                {sim.origExecutedCount} eseguiti · Base {sim.totalCount} totali
              </div>
            </div>

            <div
              className={`rounded-md border p-4 ${
                sim.profitDeltaPct >= 0
                  ? 'border-emerald-500/35 bg-emerald-500/5'
                  : 'border-amber-500/35 bg-amber-500/5'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-300">
                <span>Profitto Simulato (What-If)</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                    sim.profitDeltaPct >= 0
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {formatPct(sim.profitDeltaPct)}
                </span>
              </div>
              <div
                className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
                  sim.simFinalProfitPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPct(sim.simFinalProfitPct)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                {sim.executedCount} simulati · Max step {sim.maxStepReached}/
                {sim.effectiveStepCap}
              </div>
            </div>

            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-[11px] font-medium text-slate-400">
                Max Drawdown % Originale
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold text-rose-300 tabular-nums">
                -{sim.origMaxDrawdownPct.toFixed(2)}%
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                Picco-valle equity composto
              </div>
            </div>

            <div
              className={`rounded-md border p-4 ${
                propFirmBreached
                  ? 'border-rose-500/55 bg-rose-500/10'
                  : 'border-[#1E2634] bg-[#0B0E14]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-300">
                <span>Max Drawdown % Simulato</span>
                {propFirmBreached ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                ) : null}
              </div>
              <div
                className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
                  sim.totalLimitBreached ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                -{sim.simMaxDrawdownPct.toFixed(2)}%
              </div>
              <div
                className={`mt-1 font-mono text-[11px] tabular-nums ${
                  sim.dailyLimitBreached ? 'font-semibold text-rose-300' : 'text-slate-400'
                }`}
              >
                DD Giornaliero max: -{sim.simMaxDailyDrawdownPct.toFixed(2)}%
                {sim.worstDayDate ? ` (${sim.worstDayDate})` : ''}
              </div>
            </div>
          </div>

          {/* Mini Comparison Equity Curve */}
          {svgChart ? (
            <div className="rounded-lg border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-slate-300">
                  Confronto Equity Composto (Base 100%)
                </span>
                <div className="flex items-center gap-4 font-mono">
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="h-0.5 w-3.5 bg-slate-400" />
                    Originale ({formatPct(sim.origFinalProfitPct)})
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      propFirmBreached ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    <span
                      className={`h-0.5 w-3.5 ${
                        propFirmBreached ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    Simulata ({formatPct(sim.simFinalProfitPct)})
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${svgChart.width} ${svgChart.height}`}
                className="h-32 w-full overflow-visible"
                role="img"
                aria-label="Confronto curva equity originale vs simulata"
              >
                <line
                  x1="0"
                  x2={svgChart.width}
                  y1={svgChart.baseY}
                  y2={svgChart.baseY}
                  stroke="#1E2634"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <polyline
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.75"
                  strokeDasharray="4 3"
                  points={svgChart.origLine}
                />
                <polyline
                  fill="none"
                  stroke={propFirmBreached ? '#F59E0B' : '#10B981'}
                  strokeWidth="2.25"
                  points={svgChart.simLine}
                />
              </svg>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
