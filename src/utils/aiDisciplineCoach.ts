import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatR, roundTo, sortTradesChronologically } from './calculations';

export interface DisciplinePatternTag {
  label: string;
  count: number;
}

export interface LastMistakeInfo {
  date: string;
  category: 'live' | 'missed';
  tradeIds: string[];
  primaryTradeId: string;
}

export interface DisciplineMetrics {
  hasData: boolean;
  adherenceScore: number;
  emoji: string;
  consecutiveCleanDays: number;
  totalTrackedDays: number;
  mistakeProbabilityPct: number;
  unforcedErrorsCount: number;
  noteDeviationsCount: number;
  behavioralMissedCount: number;
  detectedTags: DisciplinePatternTag[];
  lastMistake: LastMistakeInfo | null;
}

export interface AiCoachAnalysisInput {
  assetFilter: string;
  selectedSetup: string;
  rangeMode: 'live_period' | 'all_backtest';
  liveStartDate: string | null;
  liveStats: PerformanceStats;
  backtestStats: PerformanceStats;
  liveTrades: TradeRecord[];
  backtestTrades: TradeRecord[];
  missedTrades: TradeRecord[];
  metrics: DisciplineMetrics;
}

const DEVIATION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'PAUSA LAVORO', regex: /\bpausa\s*lavoro\b|\blavoro\b|\bpausa\b/i },
  { label: 'FOMO / Revenge', regex: /\bfomo\b|\brevenge\b|\bimpuls|\bfretta\b/i },
  { label: 'Paura / Esitazione', regex: /\bpaura\b|\besitaz|\bansia\b|\binsicur/i },
  { label: 'Distrazione / Ritardo', regex: /\bdistraz|\britard|\btardi\b|\bperso\b|\bsaltat|\blate\b/i },
  { label: 'Fuori Piano / Regole', regex: /\bfuori\s*(piano|orario|regol)|\berrore\b|\bsbagli|\bovertrad|\banticipat/i },
  { label: 'Gestione Emotiva (SL/TP)', regex: /\bchius[ao]\s*prima\b|\bspostat[ao]\s*sl\b|\bemotiv|\bnoia\b|\bstanch/i },
];

const MARKET_ONLY_MISSED_REASONS = new Set([
  'ordine non fillato',
  'spread alto',
]);

function detectNoteFlags(rawNotes: string | undefined): string[] {
  const text = (rawNotes ?? '').trim();
  if (!text) return [];
  const matched: string[] = [];
  for (const pat of DEVIATION_PATTERNS) {
    if (pat.regex.test(text)) {
      matched.push(pat.label);
    }
  }
  return matched;
}

export function getAdherenceEmoji(score: number): string {
  if (score >= 85) return '🤩';
  if (score >= 70) return '🙂';
  if (score >= 50) return '😐';
  return '😤';
}

export function computeDisciplineMetrics(params: {
  liveTrades: TradeRecord[];
  backtestTrades: TradeRecord[];
  missedTrades: TradeRecord[];
  liveStats: PerformanceStats;
  backtestStats: PerformanceStats;
}): DisciplineMetrics {
  const { liveTrades, backtestTrades, missedTrades, liveStats, backtestStats } = params;
  const totalEvents = liveTrades.length + missedTrades.length;

  if (totalEvents === 0) {
    return {
      hasData: false,
      adherenceScore: 100,
      emoji: '🤩',
      consecutiveCleanDays: 0,
      totalTrackedDays: 0,
      mistakeProbabilityPct: 0,
      unforcedErrorsCount: 0,
      noteDeviationsCount: 0,
      behavioralMissedCount: 0,
      detectedTags: [],
      lastMistake: null,
    };
  }

  const tagCounts = new Map<string, number>();
  const bumpTag = (label: string) => {
    tagCounts.set(label, (tagCounts.get(label) ?? 0) + 1);
  };

  interface EventEntry {
    id: string;
    date: string;
    entryTime: string;
    category: 'live' | 'missed';
    isError: boolean;
    createdAt: number;
  }

  const events: EventEntry[] = [];
  let noteDeviationsCount = 0;
  let behavioralMissedCount = 0;

  liveTrades.forEach((tr) => {
    const flags = detectNoteFlags(tr.notes);
    flags.forEach(bumpTag);
    const hasDeviation = flags.length > 0;
    if (hasDeviation) noteDeviationsCount += 1;
    events.push({
      id: tr.id,
      date: tr.date,
      entryTime: tr.entryTime ?? '',
      category: 'live',
      isError: hasDeviation,
      createdAt: tr.createdAt,
    });
  });

  missedTrades.forEach((tr) => {
    const reasonNorm = (tr.missedReason ?? '').trim().toLowerCase();
    const noteFlags = detectNoteFlags(tr.notes);
    noteFlags.forEach(bumpTag);

    const isMarketOnly = MARKET_ONLY_MISSED_REASONS.has(reasonNorm) && noteFlags.length === 0;
    if (!isMarketOnly) {
      behavioralMissedCount += 1;
      if (tr.missedReason?.trim()) {
        bumpTag(tr.missedReason.trim());
      } else if (noteFlags.length === 0) {
        bumpTag('Setup Saltato');
      }
    }

    events.push({
      id: tr.id,
      date: tr.date,
      entryTime: tr.entryTime ?? '',
      category: 'missed',
      isError: !isMarketOnly,
      createdAt: tr.createdAt,
    });
  });

  // Sort chronologically to compute consecutive clean days, last mistake & recent mistake probability
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.entryTime !== b.entryTime) return a.entryTime.localeCompare(b.entryTime);
    return a.createdAt - b.createdAt;
  });

  const dayHasError = new Map<string, boolean>();
  events.forEach((ev) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return;
    const prev = dayHasError.get(ev.date) ?? false;
    dayHasError.set(ev.date, prev || ev.isError);
  });

  const sortedDays = Array.from(dayHasError.keys()).sort();
  let consecutiveCleanDays = 0;
  for (const day of sortedDays) {
    if (dayHasError.get(day)) {
      consecutiveCleanDays = 0;
    } else {
      consecutiveCleanDays += 1;
    }
  }

  const datedMistakes = events.filter(
    (ev) => ev.isError && /^\d{4}-\d{2}-\d{2}$/.test(ev.date),
  );
  const allMistakes =
    datedMistakes.length > 0 ? datedMistakes : events.filter((ev) => ev.isError);
  const latestMistakeEvent =
    allMistakes.length > 0 ? allMistakes[allMistakes.length - 1] : null;
  const lastMistake: LastMistakeInfo | null = latestMistakeEvent
    ? {
        date: latestMistakeEvent.date,
        category: latestMistakeEvent.category,
        primaryTradeId: latestMistakeEvent.id,
        tradeIds: allMistakes
          .filter(
            (ev) =>
              ev.date === latestMistakeEvent.date &&
              ev.category === latestMistakeEvent.category,
          )
          .map((ev) => ev.id),
      }
    : null;

  const unforcedErrorsCount = noteDeviationsCount + behavioralMissedCount;
  const overallErrorRate = unforcedErrorsCount / Math.max(1, totalEvents);

  // Recent 10-event window weighted more heavily for error risk
  const recentWindow = events.slice(-10);
  const recentErrorRate =
    recentWindow.filter((ev) => ev.isError).length / Math.max(1, recentWindow.length);

  // Expectancy drift penalty when Backtest exists for comparison
  let expectancyGapPenalty = 0;
  if (backtestTrades.length > 0 && liveTrades.length > 0) {
    const gapR = backtestStats.expectancyR - liveStats.expectancyR;
    if (gapR > 0) {
      expectancyGapPenalty = Math.min(20, gapR * 12);
    }
  }

  const missedPenalty = Math.min(45, (behavioralMissedCount / totalEvents) * 65);
  const notePenalty =
    liveTrades.length > 0
      ? Math.min(35, (noteDeviationsCount / liveTrades.length) * 55)
      : 0;

  const rawScore = 100 - missedPenalty - notePenalty - expectancyGapPenalty;
  const adherenceScore = Math.max(1, Math.min(100, Math.round(rawScore)));
  const emoji = getAdherenceEmoji(adherenceScore);

  const recurringFactor = Array.from(tagCounts.values()).some((c) => c >= 2) ? 6 : 0;
  const rawMistakeProb =
    (recentErrorRate * 0.65 + overallErrorRate * 0.35) * 100 +
    recurringFactor +
    (expectancyGapPenalty > 8 ? 5 : 0);

  const mistakeProbabilityPct =
    unforcedErrorsCount === 0 && expectancyGapPenalty <= 2
      ? 5
      : Math.max(5, Math.min(95, Math.round(rawMistakeProb)));

  const detectedTags = Array.from(tagCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    hasData: true,
    adherenceScore,
    emoji,
    consecutiveCleanDays,
    totalTrackedDays: sortedDays.length,
    mistakeProbabilityPct,
    unforcedErrorsCount,
    noteDeviationsCount,
    behavioralMissedCount,
    detectedTags,
    lastMistake,
  };
}

export function buildDisciplineCoachPrompt(input: AiCoachAnalysisInput): string {
  const {
    assetFilter,
    selectedSetup,
    rangeMode,
    liveStartDate,
    liveStats,
    backtestStats,
    liveTrades,
    missedTrades,
    metrics,
  } = input;

  const recentLive = sortTradesChronologically(liveTrades).slice(-15);
  const recentMissed = sortTradesChronologically(missedTrades).slice(-12);

  const liveNoteRows = recentLive
    .filter((tr) => Boolean(tr.notes?.trim()) || tr.outcome === 'STOP LOSS' || tr.outcome === 'TP')
    .slice(-12)
    .map(
      (tr) =>
        `- [LIVE] ${tr.date} | ${tr.asset} | ${tr.setup} | ${tr.outcome} (${formatR(tr.netR)})${
          tr.notes?.trim() ? ` | NOTE: "${tr.notes.trim()}"` : ''
        }`,
    );

  const missedNoteRows = recentMissed.map(
    (tr) =>
      `- [NON PRESO] ${tr.date} | ${tr.asset} | ${tr.setup} | Esito teorico: ${tr.outcome} (${formatR(
        tr.netR,
      )}) | Motivo: ${tr.missedReason || 'N/D'}${
        tr.notes?.trim() ? ` | NOTE: "${tr.notes.trim()}"` : ''
      }`,
  );

  const netRGap = roundTo(liveStats.netR - backtestStats.netR, 2);
  const wrGap = roundTo(liveStats.winRatePct - backtestStats.winRatePct, 1);

  return [
    `CONTESTO FILTRI ATTIVI: Asset=${assetFilter}, Strategia=${selectedSetup}, Modalità=${
      rangeMode === 'live_period'
        ? `Periodo Live${liveStartDate ? ` (dal ${liveStartDate})` : ''}`
        : 'Tutto lo Storico Backtest'
    }`,
    '',
    'METRICHE DISCIPLINA CALCOLATE:',
    `- Mechanical Adherence Score: ${metrics.adherenceScore}/100 (${metrics.emoji})`,
    `- Streak Giorni Senza Errori Non Forzati: ${metrics.consecutiveCleanDays} giorni su ${metrics.totalTrackedDays} tracciati`,
    `- Probabilità Stimata Errore Esecutivo: ${metrics.mistakeProbabilityPct}%`,
    `- Deviazioni nelle NOTE Live: ${metrics.noteDeviationsCount} | Setup persi comportamentali: ${metrics.behavioralMissedCount}`,
    '',
    'CONFRONTO BACKTEST vs JOURNAL REALE:',
    `- Backtest: ${backtestStats.totalTrades} trade (${backtestStats.wins} TP, ${backtestStats.losses} SL, ${backtestStats.breakevens} BE, ${backtestStats.unfilled} UF) | WR: ${backtestStats.winRatePct.toFixed(1)}% | Net R: ${formatR(backtestStats.netR)} | Expectancy: ${formatR(backtestStats.expectancyR)} | Max DD: -${backtestStats.maxDrawdownR.toFixed(2)}R`,
    `- Journal Reale: ${liveStats.totalTrades} trade (${liveStats.wins} TP, ${liveStats.losses} SL, ${liveStats.breakevens} BE, ${liveStats.unfilled} UF) | WR: ${liveStats.winRatePct.toFixed(1)}% | Net R: ${formatR(liveStats.netR)} | Expectancy: ${formatR(liveStats.expectancyR)} | Max DD: -${liveStats.maxDrawdownR.toFixed(2)}R`,
    `- Scostamento Live vs Backtest: Net R ${formatR(netRGap)} | Win Rate ${wrGap >= 0 ? '+' : ''}${wrGap.toFixed(1)}%`,
    '',
    `TRADE NON PRESI (${missedTrades.length} totali nel filtro attivo):`,
    ...(missedNoteRows.length > 0 ? missedNoteRows : ['- Nessun trade non preso registrato.']),
    '',
    'CAMPIONE RECENTE JOURNAL REALE E COLONNA NOTE:',
    ...(liveNoteRows.length > 0 ? liveNoteRows : ['- Nessun trade reale con note recenti.']),
  ].join('\n');
}

export async function requestAiDisciplineCoachFeedback(
  input: AiCoachAnalysisInput,
): Promise<string[]> {
  const contextPrompt = buildDisciplineCoachPrompt(input);

  const response = await fetch('/api/gemini/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextPrompt }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    bullets?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const errMsg =
      typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : `Errore server (${response.status}) durante l'analisi Gemini.`;
    throw new Error(errMsg);
  }

  const bullets = Array.isArray(data.bullets)
    ? data.bullets
        .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        .map((b) => b.trim())
        .slice(0, 3)
    : [];

  if (bullets.length === 0) {
    throw new Error('Risposta Gemini non valida: nessun suggerimento ricevuto.');
  }

  return bullets;
}
