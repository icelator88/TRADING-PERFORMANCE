import { useState } from 'react';
import { BarChart3, HelpCircle, ShieldCheck, Sliders, TrendingUp } from 'lucide-react';
import type { Language, PerformanceStats } from '../types/trading';
import { formatPct, formatR } from '../utils/calculations';

interface InstitutionalMetricsPanelProps {
  stats: PerformanceStats;
  lang: Language;
  titlePrefix?: string;
}

interface MetricTooltipProps {
  text: string;
}

function MetricTooltip({ text }: MetricTooltipProps) {
  return (
    <span className="group relative inline-flex items-center cursor-help" tabIndex={0}>
      <HelpCircle className="h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-slate-300" />
      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-2 w-60 -translate-x-1/2 rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-[11px] leading-relaxed font-normal text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
        {text}
      </span>
    </span>
  );
}

const LABELS = {
  it: {
    cardA: 'Redditività & Expectancy',
    grossWin: 'Profitto Lordo (Win)',
    tipGrossWin: 'Somma dei multipli R realizzati su tutte le operazioni chiuse in profitto (> 0 R).',
    grossLoss: 'Perdita Lorda (Loss)',
    tipGrossLoss: 'Valore assoluto dei multipli R persi sulle operazioni chiuse in perdita (< 0 R).',
    profitFactor: 'Profit Factor',
    tipPf: 'Rapporto tra Profitto Lordo R e Perdita Lorda assoluta R. Valori > 1.50 indicano un edge solido.',
    expectancy: 'Expectancy per Trade',
    tipExp: 'Aspettativa matematica media per singola operazione: R Netto / Totale Operazioni.',
    cagr: 'CAGR Stimato (Composto)',
    tipCagr: 'Tasso di crescita annuo composto stimato dai rendimenti % reali su almeno 14 giorni di storico.',
    netReturn: 'Rendimento Composto / Netto',
    tipNetRet: 'Rendimento % complessivo accumulato sul rischio configurato per ciascun trade.',

    cardB: 'Esecuzione & Consistenza',
    avgWin: 'Vincita Media (Avg Win)',
    tipAvgWin: 'Media in R delle sole operazioni chiuse in profitto.',
    avgLoss: 'Perdita Media (Avg Loss)',
    tipAvgLoss: 'Perdita media assoluta in R delle sole operazioni chiuse in perdita.',
    payoff: 'Payoff Ratio (R:R Medio)',
    tipPayoff: 'Rapporto tra Vincita Media R e Perdita Media R (Avg Win / Avg Loss).',
    maxWinStreak: 'Max Serie Positiva',
    tipWinStreak: 'Massimo numero di operazioni consecutive chiuse in profitto.',
    maxLossStreak: 'Max Serie Negativa',
    tipLossStreak: 'Massimo numero di operazioni consecutive chiuse in perdita.',
    bestWorst: 'Miglior / Peggior Trade',
    tipBestWorst: 'Singolo trade migliore e peggiore registrati nello storico filtrato.',

    cardC: 'Ratio Istituzionali Risk-Adjusted',
    sharpe: 'Sharpe Ratio',
    tipSharpe: 'Rendimento medio annualizzato diviso per la deviazione standard campionaria dei rendimenti (Risk-Free = 0).',
    sortino: 'Sortino Ratio',
    tipSortino: 'Come lo Sharpe Ratio, ma penalizza esclusivamente la volatilità negativa (Downside Deviation < 0%).',
    calmar: 'Calmar Ratio',
    tipCalmar: 'Rapporto tra CAGR % annualizzato e Max Drawdown % composto dal picco.',
    recovery: 'Recovery Factor',
    tipRecovery: 'R Netto totale diviso per il Max Drawdown (R). Misura la capacità di recupero dai ribassi.',
    ror: 'Risk of Ruin Stimato (20R)',
    tipRor: 'Probabilità teorica di subire un drawdown critico di 20R basata su Win Rate, Payoff Ratio ed Edge.',
    maxDdPct: 'Max Drawdown (% / R)',
    tipMaxDd: 'Massima flessione dal picco di equity espressa sia in unità R che in % composta.',

    pnlTitle: 'Distribuzione PnL (R)',
    pnlSub: 'Raggruppamento netto in R per periodo temporale.',
    monthly: 'Mensile',
    daily: 'Giornaliero',
    emptyPnl: 'Nessun dato disponibile per generare la distribuzione PnL.',
    tradesLabel: 'trade',
  },
  en: {
    cardA: 'Profitability & Expectancy',
    grossWin: 'Gross Profit (Wins)',
    tipGrossWin: 'Sum of realized R-multiples across all winning trades (> 0 R).',
    grossLoss: 'Gross Loss (Losses)',
    tipGrossLoss: 'Absolute sum of R-multiples lost across all losing trades (< 0 R).',
    profitFactor: 'Profit Factor',
    tipPf: 'Ratio of Gross Profit R to absolute Gross Loss R. Values > 1.50 indicate a strong edge.',
    expectancy: 'Expectancy per Trade',
    tipExp: 'Average mathematical return per trade: Net R / Total Trades.',
    cagr: 'Estimated CAGR',
    tipCagr: 'Compounded Annual Growth Rate estimated from trade % returns (requires >= 14 days span).',
    netReturn: 'Net Return %',
    tipNetRet: 'Total net percentage return accumulated across the filtered trades.',

    cardB: 'Execution & Consistency',
    avgWin: 'Average Win',
    tipAvgWin: 'Mean R-multiple across all winning trades.',
    avgLoss: 'Average Loss',
    tipAvgLoss: 'Absolute mean R-multiple across all losing trades.',
    payoff: 'Payoff Ratio (Avg R:R)',
    tipPayoff: 'Ratio of Average Win R to Average Loss R (Avg Win / Avg Loss).',
    maxWinStreak: 'Max Consecutive Wins',
    tipWinStreak: 'Longest winning streak of consecutive profitable trades.',
    maxLossStreak: 'Max Consecutive Losses',
    tipLossStreak: 'Longest losing streak of consecutive losing trades.',
    bestWorst: 'Best / Worst Trade',
    tipBestWorst: 'Single highest and lowest trade outcomes in the filtered history.',

    cardC: 'Institutional Risk-Adjusted Ratios',
    sharpe: 'Sharpe Ratio',
    tipSharpe: 'Annualized mean return divided by sample standard deviation of returns (Risk-Free = 0).',
    sortino: 'Sortino Ratio',
    tipSortino: 'Risk-adjusted return dividing annualized return strictly by downside deviation (< 0%).',
    calmar: 'Calmar Ratio',
    tipCalmar: 'Annualized CAGR (%) divided by Maximum Compounded Drawdown (%).',
    recovery: 'Recovery Factor',
    tipRecovery: 'Total Net R divided by Maximum Drawdown (R). Measures recovery strength.',
    ror: 'Estimated Risk of Ruin (20R)',
    tipRor: 'Theoretical probability of hitting a 20R drawdown derived from Win Rate, Payoff Ratio, and edge.',
    maxDdPct: 'Max Drawdown (% / R)',
    tipMaxDd: 'Maximum peak-to-trough decline shown in both R units and compounded %.',

    pnlTitle: 'PnL Distribution (R)',
    pnlSub: 'Net R aggregated by calendar period.',
    monthly: 'Monthly',
    daily: 'Daily',
    emptyPnl: 'No trades available to render the period PnL distribution.',
    tradesLabel: 'trades',
  },
} as const;

export function InstitutionalMetricsPanel({
  stats,
  lang,
  titlePrefix,
}: InstitutionalMetricsPanelProps) {
  const [pnlMode, setPnlMode] = useState<'monthly' | 'daily'>('monthly');
  const [hoveredPeriod, setHoveredPeriod] = useState<{
    period: string;
    netR: number;
    tradesCount: number;
  } | null>(null);

  const l = lang === 'en' ? LABELS.en : LABELS.it;

  const pfText = stats.profitFactorInfinite
    ? 'Max (0 Loss)'
    : stats.profitFactor.toFixed(2);

  const payoffText =
    stats.payoffRatio === null
      ? 'Max (0 Loss)'
      : `${stats.payoffRatio.toFixed(2)} : 1`;

  const cagrText =
    stats.cagrPct !== null
      ? formatPct(stats.cagrPct)
      : stats.totalTrades > 0
        ? 'N/A (<14d)'
        : '0.00%';

  const sharpeText =
    stats.sharpeRatio !== null ? stats.sharpeRatio.toFixed(2) : '0.00';

  const sortinoText = stats.sortinoInfinite
    ? 'Max (0 Loss)'
    : stats.sortinoRatio !== null
      ? stats.sortinoRatio.toFixed(2)
      : '0.00';

  const calmarText =
    stats.calmarRatio !== null
      ? stats.calmarRatio.toFixed(2)
      : stats.cagrPct !== null && stats.cagrPct > 0 && stats.maxDrawdownPct === 0
        ? 'Max (0 DD)'
        : stats.totalTrades > 0 && stats.cagrPct === null
          ? 'N/A (<14d)'
          : '0.00';

  const recoveryText =
    stats.recoveryFactor !== null
      ? stats.recoveryFactor.toFixed(2)
      : stats.netR > 0
        ? 'Max (0 DD)'
        : '0.00';

  const buckets = pnlMode === 'monthly' ? stats.monthlyBuckets : stats.dailyBuckets;
  const visibleBuckets = buckets.slice(-36);
  const maxAbsR = Math.max(1, ...visibleBuckets.map((b) => Math.abs(b.netR)));

  return (
    <div className="space-y-4">
      {/* 3 Bento Metric Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Card A: Profitability & Expectancy */}
        <section className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[#1E2634] pb-3">
            <h3 className="text-sm font-semibold text-slate-100">
              {titlePrefix ? `${titlePrefix} · ` : ''}
              {l.cardA}
            </h3>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <dl className="divide-y divide-[#1E2634] text-xs">
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.grossWin}</span>
                <MetricTooltip text={l.tipGrossWin} />
              </dt>
              <dd className="font-mono font-semibold text-emerald-400 tabular-nums">
                +{stats.grossWinR.toFixed(2)} R
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.grossLoss}</span>
                <MetricTooltip text={l.tipGrossLoss} />
              </dt>
              <dd className="font-mono font-semibold text-rose-400 tabular-nums">
                {stats.grossLossR > 0 ? `-${stats.grossLossR.toFixed(2)} R` : '0.00 R'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.profitFactor}</span>
                <MetricTooltip text={l.tipPf} />
              </dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  stats.profitFactorInfinite || stats.profitFactor >= 1.5
                    ? 'text-emerald-400'
                    : stats.profitFactor >= 1
                      ? 'text-sky-400'
                      : 'text-rose-400'
                }`}
              >
                {pfText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.expectancy}</span>
                <MetricTooltip text={l.tipExp} />
              </dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  stats.expectancyR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatR(stats.expectancyR)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.cagr}</span>
                <MetricTooltip text={l.tipCagr} />
              </dt>
              <dd className="font-mono font-semibold text-slate-100 tabular-nums">
                {cagrText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.netReturn}</span>
                <MetricTooltip text={l.tipNetRet} />
              </dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  stats.netReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPct(stats.netReturnPct)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Card B: Execution & Consistency */}
        <section className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[#1E2634] pb-3">
            <h3 className="text-sm font-semibold text-slate-100">{l.cardB}</h3>
            <Sliders className="h-4 w-4 text-sky-400" />
          </div>
          <dl className="divide-y divide-[#1E2634] text-xs">
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.avgWin}</span>
                <MetricTooltip text={l.tipAvgWin} />
              </dt>
              <dd className="font-mono font-semibold text-emerald-400 tabular-nums">
                +{stats.avgWinR.toFixed(2)} R
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.avgLoss}</span>
                <MetricTooltip text={l.tipAvgLoss} />
              </dt>
              <dd className="font-mono font-semibold text-rose-400 tabular-nums">
                {stats.avgLossR > 0 ? `-${stats.avgLossR.toFixed(2)} R` : '0.00 R'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.payoff}</span>
                <MetricTooltip text={l.tipPayoff} />
              </dt>
              <dd className="font-mono font-semibold text-slate-100 tabular-nums">
                {payoffText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.maxWinStreak}</span>
                <MetricTooltip text={l.tipWinStreak} />
              </dt>
              <dd className="font-mono font-semibold text-emerald-400 tabular-nums">
                {stats.maxConsecutiveWins}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.maxLossStreak}</span>
                <MetricTooltip text={l.tipLossStreak} />
              </dt>
              <dd className="font-mono font-semibold text-rose-400 tabular-nums">
                {stats.maxConsecutiveLosses}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.bestWorst}</span>
                <MetricTooltip text={l.tipBestWorst} />
              </dt>
              <dd className="font-mono font-semibold tabular-nums">
                <span className="text-emerald-400">{formatR(stats.bestTradeR)}</span>
                <span className="mx-1.5 text-slate-500">/</span>
                <span className="text-rose-400">{formatR(stats.worstTradeR)}</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Card C: Institutional Risk-Adjusted Ratios */}
        <section className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[#1E2634] pb-3">
            <h3 className="text-sm font-semibold text-slate-100">{l.cardC}</h3>
            <ShieldCheck className="h-4 w-4 text-sky-400" />
          </div>
          <dl className="divide-y divide-[#1E2634] text-xs">
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.sharpe}</span>
                <MetricTooltip text={l.tipSharpe} />
              </dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  (stats.sharpeRatio ?? 0) >= 1.5
                    ? 'text-emerald-400'
                    : (stats.sharpeRatio ?? 0) >= 0.8
                      ? 'text-sky-400'
                      : 'text-slate-100'
                }`}
              >
                {sharpeText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.sortino}</span>
                <MetricTooltip text={l.tipSortino} />
              </dt>
              <dd className="font-mono font-semibold text-slate-100 tabular-nums">
                {sortinoText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.calmar}</span>
                <MetricTooltip text={l.tipCalmar} />
              </dt>
              <dd className="font-mono font-semibold text-slate-100 tabular-nums">
                {calmarText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.recovery}</span>
                <MetricTooltip text={l.tipRecovery} />
              </dt>
              <dd className="font-mono font-semibold text-slate-100 tabular-nums">
                {recoveryText}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.ror}</span>
                <MetricTooltip text={l.tipRor} />
              </dt>
              <dd
                className={`font-mono font-semibold tabular-nums ${
                  stats.riskOfRuinPct < 5
                    ? 'text-emerald-400'
                    : stats.riskOfRuinPct < 20
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {stats.riskOfRuinPct.toFixed(2)}%
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span>{l.maxDdPct}</span>
                <MetricTooltip text={l.tipMaxDd} />
              </dt>
              <dd className="font-mono font-semibold text-rose-400 tabular-nums">
                -{stats.maxDrawdownR.toFixed(2)} R (-{stats.maxDrawdownPct.toFixed(2)}%)
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Period PnL Distribution Bar Chart (Monthly / Daily in R) */}
      <section className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4 text-sky-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{l.pnlTitle}</h3>
              <p className="text-xs text-slate-400">{l.pnlSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hoveredPeriod ? (
              <div className="rounded border border-[#263042] bg-[#0B0E14] px-2.5 py-1 font-mono text-xs tabular-nums">
                <span className="text-slate-400">{hoveredPeriod.period}: </span>
                <span
                  className={
                    hoveredPeriod.netR >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'
                  }
                >
                  {formatR(hoveredPeriod.netR)}
                </span>
                <span className="ml-2 text-slate-500">
                  ({hoveredPeriod.tradesCount} {l.tradesLabel})
                </span>
              </div>
            ) : null}

            <div
              role="group"
              aria-label="Raggruppamento PnL"
              className="flex items-center gap-1 rounded-md border border-[#1E2634] bg-[#0B0E14] p-0.5 text-[11px] font-medium"
            >
              <button
                type="button"
                onClick={() => setPnlMode('monthly')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  pnlMode === 'monthly'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {l.monthly}
              </button>
              <button
                type="button"
                onClick={() => setPnlMode('daily')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  pnlMode === 'daily'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {l.daily}
              </button>
            </div>
          </div>
        </div>

        {visibleBuckets.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/70 text-xs text-slate-400">
            {l.emptyPnl}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="relative min-w-[460px] pt-2 pb-1">
              <div className="relative flex h-44 items-stretch gap-1.5">
                {/* Zero baseline */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-600/70" />

                {visibleBuckets.map((b) => {
                  const pct = Math.max(10, Math.round((Math.abs(b.netR) / maxAbsR) * 86));
                  const positive = b.netR >= 0;
                  return (
                    <div
                      key={b.period}
                      onMouseEnter={() => setHoveredPeriod(b)}
                      onMouseLeave={() => setHoveredPeriod(null)}
                      className="group relative flex flex-1 min-w-[26px] flex-col cursor-pointer"
                    >
                      {/* Top half: Positive bars */}
                      <div className="flex flex-1 flex-col items-center justify-end pb-0.5">
                        {positive ? (
                          <>
                            <span className="mb-0.5 font-mono text-[10px] text-emerald-400 tabular-nums">
                              {b.netR > 0 ? `+${b.netR.toFixed(1)}` : '0.0'}
                            </span>
                            <div
                              style={{ height: `${pct}%` }}
                              className="w-full max-w-[32px] rounded-t bg-emerald-500/85 transition-opacity group-hover:opacity-80"
                            />
                          </>
                        ) : null}
                      </div>

                      {/* Bottom half: Negative bars */}
                      <div className="flex flex-1 flex-col items-center justify-start pt-0.5">
                        {!positive ? (
                          <>
                            <div
                              style={{ height: `${pct}%` }}
                              className="w-full max-w-[32px] rounded-b bg-rose-500/85 transition-opacity group-hover:opacity-80"
                            />
                            <span className="mt-0.5 font-mono text-[10px] text-rose-400 tabular-nums">
                              {b.netR.toFixed(1)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis period labels */}
              <div className="mt-2 flex gap-1.5 border-t border-[#1E2634] pt-2">
                {visibleBuckets.map((b) => (
                  <div
                    key={`lbl_${b.period}`}
                    className="flex-1 min-w-[26px] text-center font-mono text-[10px] text-slate-400 truncate"
                  >
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
