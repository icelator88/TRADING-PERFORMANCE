import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { Language, PerformanceStats, TradeRecord } from '../types/trading';
import {
  computeDisciplineMetrics,
  type LastMistakeInfo,
  requestAiDisciplineCoachFeedback,
} from '../utils/aiDisciplineCoach';
import { formatDisplayDate } from '../utils/calculations';

interface AiDisciplineCoachCardProps {
  lang: Language;
  assetFilter: string;
  selectedSetup: string;
  rangeMode: 'live_period' | 'all_backtest';
  liveStartDate: string | null;
  liveStats: PerformanceStats;
  backtestStats: PerformanceStats;
  liveTrades: TradeRecord[];
  backtestTrades: TradeRecord[];
  missedTrades: TradeRecord[];
  onLastMistakeClick?: (mistake: LastMistakeInfo) => void;
}

export function AiDisciplineCoachCard({
  lang,
  assetFilter,
  selectedSetup,
  rangeMode,
  liveStartDate,
  liveStats,
  backtestStats,
  liveTrades,
  backtestTrades,
  missedTrades,
  onLastMistakeClick,
}: AiDisciplineCoachCardProps) {
  const [loading, setLoading] = useState(false);
  const [bullets, setBullets] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const metrics = useMemo(
    () =>
      computeDisciplineMetrics({
        liveTrades,
        backtestTrades,
        missedTrades,
        liveStats,
        backtestStats,
      }),
    [liveTrades, backtestTrades, missedTrades, liveStats, backtestStats],
  );

  const scopeKey = `${assetFilter}|${selectedSetup}|${rangeMode}|${liveTrades.length}|${missedTrades.length}`;
  useEffect(() => {
    setBullets([]);
    setErrorMessage(null);
  }, [scopeKey]);

  const handleAnalyzeWithAi = async () => {
    if (loading || !metrics.hasData) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await requestAiDisciplineCoachFeedback({
        assetFilter,
        selectedSetup,
        rangeMode,
        liveStartDate,
        liveStats,
        backtestStats,
        liveTrades,
        backtestTrades,
        missedTrades,
        metrics,
      });
      setBullets(result);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Impossibile completare l’analisi con Gemini AI.',
      );
    } finally {
      setLoading(false);
    }
  };

  const scoreColorClass = !metrics.hasData
    ? 'text-slate-400'
    : metrics.adherenceScore >= 85
      ? 'text-emerald-400'
      : metrics.adherenceScore >= 70
        ? 'text-sky-400'
        : metrics.adherenceScore >= 50
          ? 'text-amber-400'
          : 'text-rose-400';

  const probColorClass = !metrics.hasData
    ? 'text-slate-400'
    : metrics.mistakeProbabilityPct <= 20
      ? 'text-emerald-400'
      : metrics.mistakeProbabilityPct <= 45
        ? 'text-amber-400'
        : 'text-rose-400';

  return (
    <section
      aria-label="AI Discipline & Execution Coach"
      className="rounded-lg border border-sky-500/35 bg-[#121721] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2634] pb-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-100 sm:text-lg">
            AI Discipline &amp; Execution Coach
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {lang === 'en'
              ? 'Mechanical adherence diagnostics across Journal Reale vs Backtest, Trade Non Presi, and NOTE logs.'
              : 'Analisi di aderenza meccanica su Journal Reale vs Backtest, Trade Non Presi e note operative (es. PAUSA LAVORO).'}
          </p>
        </div>

        <button
          type="button"
          disabled={loading || !metrics.hasData}
          onClick={() => void handleAnalyzeWithAi()}
          className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Sparkles className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analisi Gemini in corso...' : 'Analizza con AI'}</span>
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* KPI 1: Mechanical Adherence Score */}
        <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
          <div className="text-xs font-medium text-slate-400">
            Mechanical Adherence Score
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span
              className={`font-mono text-2xl font-bold tabular-nums ${scoreColorClass}`}
            >
              {metrics.hasData ? `${metrics.adherenceScore}/100` : '--'}
            </span>
            {metrics.hasData ? (
              <span className="text-2xl leading-none" aria-label="Adherence mood">
                {metrics.emoji}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
            {metrics.hasData
              ? `${metrics.unforcedErrorsCount} deviazioni rilevate (${metrics.behavioralMissedCount} non presi · ${metrics.noteDeviationsCount} note)`
              : 'Registra trade reali o non presi per il punteggio'}
          </div>
        </div>

        {/* KPI 2: Consecutive Days Streak */}
        <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
          <div className="text-xs font-medium text-slate-400">
            Consecutive Days Streak
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {metrics.hasData
              ? `${metrics.consecutiveCleanDays} ${
                  metrics.consecutiveCleanDays === 1 ? 'giorno' : 'giorni'
                }`
              : '--'}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
            {metrics.hasData
              ? `Piano meccanico rispettato senza errori non forzati (${metrics.totalTrackedDays} gg totali)`
              : 'Nessuna sessione live tracciata'}
          </div>
          {metrics.hasData && metrics.lastMistake ? (
            <button
              type="button"
              onClick={() => onLastMistakeClick?.(metrics.lastMistake!)}
              className="mt-2.5 inline-flex flex-wrap items-center gap-1.5 rounded border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-left font-mono text-[11px] font-medium text-rose-300 transition-colors hover:border-rose-400/70 hover:bg-rose-500/20 hover:text-rose-200 focus:outline-none focus:ring-1 focus:ring-rose-400"
              title={
                metrics.lastMistake.category === 'live'
                  ? 'Apri e evidenzia in Journal Reale'
                  : 'Apri e evidenzia in Trade Non Presi'
              }
            >
              <span>
                {lang === 'en'
                  ? 'Last mistake:'
                  : lang === 'es'
                    ? 'Último error:'
                    : 'Ultimo errore:'}{' '}
                <span className="font-semibold underline decoration-rose-400/60 underline-offset-2">
                  {formatDisplayDate(metrics.lastMistake.date)}
                </span>
              </span>
              <span className="text-[10px] text-rose-400/90">
                (
                {metrics.lastMistake.category === 'live'
                  ? 'Journal Reale'
                  : 'Trade Non Presi'}
                )
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-rose-400" />
            </button>
          ) : metrics.hasData ? (
            <div className="mt-2 font-mono text-[11px] text-emerald-400/80">
              {lang === 'en'
                ? 'No mistakes recorded'
                : lang === 'es'
                  ? 'Sin errores registrados'
                  : 'Nessun errore rilevato'}
            </div>
          ) : null}
        </div>

        {/* KPI 3: Estimated Mistake Probability */}
        <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
          <div className="text-xs font-medium text-slate-400">
            Probabilità Errore Esecutivo
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${probColorClass}`}
          >
            {metrics.hasData ? `${metrics.mistakeProbabilityPct}%` : '--'}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
            {metrics.hasData
              ? 'Stima basata su pattern recenti, skip e note operative'
              : 'In attesa di dati operativi'}
          </div>
        </div>
      </div>

      {metrics.detectedTags.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#1E2634] pt-3.5 text-[11px]">
          <span className="font-medium text-slate-400">
            Pattern NOTE / Non Presi rilevati:
          </span>
          {metrics.detectedTags.map((tag) => (
            <span
              key={tag.label}
              className="rounded border border-[#263042] bg-[#0B0E14] px-2 py-0.5 font-mono text-slate-200 tabular-nums"
            >
              {tag.label} ({tag.count})
            </span>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
        >
          {errorMessage}
        </div>
      ) : null}

      {bullets.length > 0 ? (
        <div className="mt-4 rounded-md border border-sky-500/30 bg-[#0B0E14] p-4">
          <div className="text-xs font-semibold text-sky-300">
            Feedback Coach Gemini AI ({assetFilter} · {selectedSetup})
          </div>
          <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-200">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono font-bold text-sky-400">
                  {idx + 1}.
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
