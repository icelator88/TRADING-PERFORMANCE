import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatR, roundTo, sortTradesChronologically } from './calculations';

export interface DisciplinePatternTag {
  label: string;
  count: number;
}

export interface LastMistakeInfo {
  date: string;
  category: 'live' | 'missed' | 'backtest';
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
  unplannedExtraCount: number;
  discrepancyCount: number;
  consciousSkipsExcludedCount: number;
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

const CONSCIOUS_SKIP_REGEX =
  /(?:non[\s_-]+preso[\s_-]+consapevole|consapevole|pausa[\s_-]*lavoro|festiv[oi]?)/i;

const EXPLICIT_MISTAKE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'Errore / X Sbaglio',
    regex: /\bx\s*sbaglio\b|\bper\s*sbaglio\b|\bsbagli[oa]\w*|\berror[ei]\b/i,
  },
  {
    label: 'Fuori Piano',
    regex:
      /\bfuori\s*(?:piano|orario|regol\w*|strategia|setup)\b|\bovertrad\w*|\banticipat\w*/i,
  },
  {
    label: 'FOMO / Revenge',
    regex: /\bfomo\b|\brevenge\b|\bimpuls\w*|\bfretta\b/i,
  },
  {
    label: 'Paura / Esitazione',
    regex: /\bpaura\b|\besitaz\w*|\bansia\b|\binsicur\w*/i,
  },
  {
    label: 'Distrazione / Ritardo',
    regex: /\bdistraz\w*|\britard\w*|\btardi\b|\bperso\b|\blate\b/i,
  },
  {
    label: 'Gestione Emotiva (SL/TP)',
    regex:
      /\bchius[ao]\s*prima\b|\bspostat[ao]\s*sl\b|\bemotiv\w*|\bnoia\b|\bstanch\w*/i,
  },
];

const MARKET_ONLY_MISSED_REASONS = new Set([
  'ordine non fillato',
  'spread alto',
]);

function getCombinedTradeText(trade: TradeRecord): string {
  const extraValues = trade.extraColumns ? Object.values(trade.extraColumns) : [];
  return [trade.notes ?? '', trade.missedReason ?? '', ...extraValues]
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .join(' | ');
}

export function isConsciousSkipTrade(trade: TradeRecord): boolean {
  const text = getCombinedTradeText(trade);
  if (!text) return false;
  return CONSCIOUS_SKIP_REGEX.test(text);
}

function detectExplicitMistakeFlags(trade: TradeRecord): string[] {
  if (isConsciousSkipTrade(trade)) return [];
  const text = [trade.notes ?? '', trade.missedReason ?? ''].join(' ').trim();
  if (!text) return [];
  const matched: string[] = [];
  for (const pat of EXPLICIT_MISTAKE_PATTERNS) {
    if (pat.regex.test(text)) {
      matched.push(pat.label);
    }
  }
  return matched;
}

function normAsset(asset: string | undefined): string {
  return (asset ?? '').trim().toUpperCase();
}

function normSetup(setup: string | undefined): string {
  return (setup ?? '').trim().toUpperCase();
}

function normBias(bias: string | undefined): string {
  return (bias ?? '').trim().toUpperCase();
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
  const { liveTrades, backtestTrades, missedTrades } = params;

  if (liveTrades.length === 0 && missedTrades.length === 0) {
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
      unplannedExtraCount: 0,
      discrepancyCount: 0,
      consciousSkipsExcludedCount: 0,
      detectedTags: [],
      lastMistake: null,
    };
  }

  // Scope Backtest trades to the active live window when live trades exist
  const earliestLiveDate = liveTrades
    .map((tr) => tr.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .reduce<string | null>((min, d) => (!min || d < min ? d : min), null);

  const scopedBacktest = sortTradesChronologically(
    earliestLiveDate
      ? backtestTrades.filter(
          (tr) => !/^\d{4}-\d{2}-\d{2}$/.test(tr.date) || tr.date >= earliestLiveDate,
        )
      : backtestTrades,
  );
  const sortedLive = sortTradesChronologically(liveTrades);
  const sortedMissed = sortTradesChronologically(missedTrades);

  const hasBacktestBaseline = scopedBacktest.length > 0;

  // Match Backtest trades with Journal Reale trades by Date, Asset, and Setup/Direction
  const matchedLiveIds = new Set<string>();
  const matchedBtIds = new Set<string>();
  const matchedPairs: Array<{ bt: TradeRecord; live: TradeRecord }> = [];

  // Pass 1: Exact Date + Asset + Setup + Direction (Bias)
  scopedBacktest.forEach((bt) => {
    let bestLive: TradeRecord | null = null;
    let bestDist = Infinity;

    for (const live of sortedLive) {
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
      matchedPairs.push({ bt, live: bestLive });
    }
  });

  // Pass 2: Same Date + Asset + Setup (or missing setup), catching wrong direction
  scopedBacktest.forEach((bt) => {
    if (matchedBtIds.has(bt.id)) return;
    let bestLive: TradeRecord | null = null;
    let bestDist = Infinity;

    const btSetup = normSetup(bt.setup);
    for (const live of sortedLive) {
      if (matchedLiveIds.has(live.id)) continue;
      const liveSetup = normSetup(live.setup);
      const setupMatches =
        btSetup === liveSetup || !btSetup || !liveSetup;
      if (
        live.date === bt.date &&
        normAsset(live.asset) === normAsset(bt.asset) &&
        setupMatches
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
      matchedPairs.push({ bt, live: bestLive });
    }
  });

  const tagCounts = new Map<string, number>();
  const bumpTag = (label: string) => {
    tagCounts.set(label, (tagCounts.get(label) ?? 0) + 1);
  };

  interface EventEntry {
    id: string;
    date: string;
    entryTime: string;
    category: 'live' | 'missed' | 'backtest';
    isError: boolean;
    isConsciousSkip: boolean;
    createdAt: number;
  }

  const events: EventEntry[] = [];
  let noteDeviationsCount = 0;
  let behavioralMissedCount = 0;
  let unplannedExtraCount = 0;
  let discrepancyCount = 0;
  let consciousSkipsExcludedCount = 0;
  const countedSkippedIds = new Set<string>();

  const registerConsciousSkip = (trade: TradeRecord) => {
    if (!countedSkippedIds.has(trade.id)) {
      countedSkippedIds.add(trade.id);
      consciousSkipsExcludedCount += 1;
    }
  };

  // 1) Evaluate matched Backtest <-> Journal Reale pairs
  matchedPairs.forEach(({ bt, live }) => {
    if (isConsciousSkipTrade(bt) || isConsciousSkipTrade(live)) {
      registerConsciousSkip(isConsciousSkipTrade(live) ? live : bt);
      events.push({
        id: live.id,
        date: live.date,
        entryTime: live.entryTime ?? '',
        category: 'live',
        isError: false,
        isConsciousSkip: true,
        createdAt: live.createdAt,
      });
      return;
    }

    const pairTags = new Set<string>();
    const mistakeFlags = detectExplicitMistakeFlags(live);
    mistakeFlags.forEach((f) => pairTags.add(f));

    let hasDiscrepancy = false;
    if (normBias(bt.bias) !== normBias(live.bias)) {
      hasDiscrepancy = true;
      pairTags.add('Direzione Errata');
    }

    if (bt.outcome === 'TP' && (live.outcome === 'STOP LOSS' || live.outcome === 'BE')) {
      hasDiscrepancy = true;
      pairTags.add('Esito Peggiore vs BT (TP→SL/BE)');
    } else if (bt.outcome === 'BE' && live.outcome === 'STOP LOSS') {
      hasDiscrepancy = true;
      pairTags.add('Esito Peggiore vs BT (BE→SL)');
    } else if (bt.outcome === 'UNFILLED' && live.outcome !== 'UNFILLED') {
      hasDiscrepancy = true;
      pairTags.add('Trade Extra (BT Unfilled)');
    }

    if (mistakeFlags.length > 0) noteDeviationsCount += 1;
    if (hasDiscrepancy) discrepancyCount += 1;
    pairTags.forEach(bumpTag);

    const isError = mistakeFlags.length > 0 || hasDiscrepancy;
    events.push({
      id: live.id,
      date: live.date,
      entryTime: live.entryTime ?? '',
      category: 'live',
      isError,
      isConsciousSkip: false,
      createdAt: live.createdAt,
    });
  });

  // 2) Evaluate unmatched Journal Reale trades (Unplanned / Extra trades or explicit mistake notes)
  sortedLive.forEach((live) => {
    if (matchedLiveIds.has(live.id)) return;

    if (isConsciousSkipTrade(live)) {
      registerConsciousSkip(live);
      events.push({
        id: live.id,
        date: live.date,
        entryTime: live.entryTime ?? '',
        category: 'live',
        isError: false,
        isConsciousSkip: true,
        createdAt: live.createdAt,
      });
      return;
    }

    const tradeTags = new Set<string>();
    const mistakeFlags = detectExplicitMistakeFlags(live);
    mistakeFlags.forEach((f) => tradeTags.add(f));

    const isExtraTrade = hasBacktestBaseline && live.outcome !== 'UNFILLED';
    if (isExtraTrade) {
      unplannedExtraCount += 1;
      tradeTags.add('Trade Extra (Fuori Backtest)');
    }
    if (mistakeFlags.length > 0) {
      noteDeviationsCount += 1;
    }

    tradeTags.forEach(bumpTag);
    const isError = isExtraTrade || mistakeFlags.length > 0;
    events.push({
      id: live.id,
      date: live.date,
      entryTime: live.entryTime ?? '',
      category: 'live',
      isError,
      isConsciousSkip: false,
      createdAt: live.createdAt,
    });
  });

  // Link missedTrades records to unmatched Backtest trades where applicable
  const linkedMissedIds = new Set<string>();

  // 3) Evaluate unmatched Backtest trades (Unexplained missed Backtest trades)
  scopedBacktest.forEach((bt) => {
    if (matchedBtIds.has(bt.id)) return;
    if (bt.outcome === 'UNFILLED') return;

    // Strict exclusion if Backtest note itself contains a conscious skip keyword
    if (isConsciousSkipTrade(bt)) {
      registerConsciousSkip(bt);
      events.push({
        id: bt.id,
        date: bt.date,
        entryTime: bt.entryTime ?? '',
        category: 'backtest',
        isError: false,
        isConsciousSkip: true,
        createdAt: bt.createdAt,
      });
      return;
    }

    // Check if there is a corresponding Trade Non Preso record explaining this Backtest trade
    const btSetup = normSetup(bt.setup);
    const matchingMissed = sortedMissed.find((m) => {
      if (linkedMissedIds.has(m.id)) return false;
      if (m.date !== bt.date || normAsset(m.asset) !== normAsset(bt.asset)) return false;
      const mSetup = normSetup(m.setup);
      return !btSetup || !mSetup || btSetup === mSetup;
    });

    if (matchingMissed) {
      linkedMissedIds.add(matchingMissed.id);

      if (isConsciousSkipTrade(matchingMissed)) {
        registerConsciousSkip(matchingMissed);
        events.push({
          id: matchingMissed.id,
          date: matchingMissed.date,
          entryTime: matchingMissed.entryTime ?? '',
          category: 'missed',
          isError: false,
          isConsciousSkip: true,
          createdAt: matchingMissed.createdAt,
        });
        return;
      }

      const reasonNorm = (matchingMissed.missedReason ?? '').trim().toLowerCase();
      const noteFlags = detectExplicitMistakeFlags(matchingMissed);
      const isMarketOnly =
        MARKET_ONLY_MISSED_REASONS.has(reasonNorm) && noteFlags.length === 0;

      if (isMarketOnly) {
        events.push({
          id: matchingMissed.id,
          date: matchingMissed.date,
          entryTime: matchingMissed.entryTime ?? '',
          category: 'missed',
          isError: false,
          isConsciousSkip: true,
          createdAt: matchingMissed.createdAt,
        });
        return;
      }

      behavioralMissedCount += 1;
      if (noteFlags.length > 0) {
        noteDeviationsCount += 1;
        noteFlags.forEach(bumpTag);
      } else if (matchingMissed.missedReason?.trim()) {
        bumpTag(matchingMissed.missedReason.trim());
      } else {
        bumpTag('Setup BT Non Preso');
      }

      events.push({
        id: matchingMissed.id,
        date: matchingMissed.date,
        entryTime: matchingMissed.entryTime ?? '',
        category: 'missed',
        isError: true,
        isConsciousSkip: false,
        createdAt: matchingMissed.createdAt,
      });
      return;
    }

    // No matching Trade Non Preso record: if Live trading is active, it's an unexplained missed Backtest trade
    if (sortedLive.length > 0) {
      behavioralMissedCount += 1;
      bumpTag('Setup BT Non Preso');
      events.push({
        id: bt.id,
        date: bt.date,
        entryTime: bt.entryTime ?? '',
        category: 'backtest',
        isError: true,
        isConsciousSkip: false,
        createdAt: bt.createdAt,
      });
    }
  });

  // 4) Evaluate remaining standalone Trade Non Presi entries not linked to a Backtest row
  sortedMissed.forEach((m) => {
    if (linkedMissedIds.has(m.id)) return;

    if (isConsciousSkipTrade(m)) {
      registerConsciousSkip(m);
      events.push({
        id: m.id,
        date: m.date,
        entryTime: m.entryTime ?? '',
        category: 'missed',
        isError: false,
        isConsciousSkip: true,
        createdAt: m.createdAt,
      });
      return;
    }

    const reasonNorm = (m.missedReason ?? '').trim().toLowerCase();
    const noteFlags = detectExplicitMistakeFlags(m);
    const isMarketOnly =
      MARKET_ONLY_MISSED_REASONS.has(reasonNorm) && noteFlags.length === 0;

    if (isMarketOnly) {
      events.push({
        id: m.id,
        date: m.date,
        entryTime: m.entryTime ?? '',
        category: 'missed',
        isError: false,
        isConsciousSkip: true,
        createdAt: m.createdAt,
      });
      return;
    }

    behavioralMissedCount += 1;
    if (noteFlags.length > 0) {
      noteDeviationsCount += 1;
      noteFlags.forEach(bumpTag);
    } else if (m.missedReason?.trim()) {
      bumpTag(m.missedReason.trim());
    } else {
      bumpTag('Setup Saltato');
    }

    events.push({
      id: m.id,
      date: m.date,
      entryTime: m.entryTime ?? '',
      category: 'missed',
      isError: true,
      isConsciousSkip: false,
      createdAt: m.createdAt,
    });
  });

  // Sort all events chronologically
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.entryTime !== b.entryTime) return a.entryTime.localeCompare(b.entryTime);
    return a.createdAt - b.createdAt;
  });

  // Build day status map: conscious skips NEVER break the streak and NEVER mark a day as error
  const dayStatsMap = new Map<string, { hasError: boolean; hasActiveDecision: boolean }>();
  events.forEach((ev) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return;
    const prev = dayStatsMap.get(ev.date) ?? { hasError: false, hasActiveDecision: false };
    dayStatsMap.set(ev.date, {
      hasError: prev.hasError || ev.isError,
      hasActiveDecision: prev.hasActiveDecision || !ev.isConsciousSkip,
    });
  });

  const sortedActiveDays = Array.from(dayStatsMap.entries())
    .filter(([, info]) => info.hasError || info.hasActiveDecision)
    .map(([day]) => day)
    .sort();

  let consecutiveCleanDays = 0;
  for (const day of sortedActiveDays) {
    const info = dayStatsMap.get(day);
    if (info?.hasError) {
      consecutiveCleanDays = 0;
    } else if (info?.hasActiveDecision) {
      consecutiveCleanDays += 1;
    }
  }

  const errorEvents = events.filter((ev) => ev.isError);
  const datedMistakes = errorEvents.filter((ev) => /^\d{4}-\d{2}-\d{2}$/.test(ev.date));
  const allMistakes = datedMistakes.length > 0 ? datedMistakes : errorEvents;
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

  const evaluatedEvents = events.filter((ev) => !ev.isConsciousSkip || ev.isError);
  const unforcedErrorsCount = errorEvents.length;
  const totalEvaluated = evaluatedEvents.length;

  const errorRate =
    totalEvaluated > 0 ? unforcedErrorsCount / totalEvaluated : 0;
  const recentWindow = evaluatedEvents.slice(-10);
  const recentErrorRate =
    recentWindow.length > 0
      ? recentWindow.filter((ev) => ev.isError).length / recentWindow.length
      : 0;

  let adherenceScore = 100;
  if (unforcedErrorsCount > 0 && totalEvaluated > 0) {
    const penalty = Math.min(95, errorRate * 115 + Math.min(15, unforcedErrorsCount * 2.5));
    adherenceScore = Math.max(1, Math.min(100, Math.round(100 - penalty)));
  }
  const emoji = getAdherenceEmoji(adherenceScore);

  const recurringFactor = Array.from(tagCounts.values()).some((c) => c >= 2) ? 8 : 0;
  const mistakeProbabilityPct =
    unforcedErrorsCount === 0
      ? 0
      : Math.max(
          5,
          Math.min(
            95,
            Math.round((recentErrorRate * 0.65 + errorRate * 0.35) * 100 + recurringFactor),
          ),
        );

  const detectedTags = Array.from(tagCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    hasData: true,
    adherenceScore,
    emoji,
    consecutiveCleanDays,
    totalTrackedDays: sortedActiveDays.length,
    mistakeProbabilityPct,
    unforcedErrorsCount,
    noteDeviationsCount,
    behavioralMissedCount,
    unplannedExtraCount,
    discrepancyCount,
    consciousSkipsExcludedCount,
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

  // Exclude intentional conscious skips from error logs passed to the AI Coach
  const nonSkippedLive = sortTradesChronologically(liveTrades).filter(
    (tr) => !isConsciousSkipTrade(tr),
  );
  const nonSkippedMissed = sortTradesChronologically(missedTrades).filter(
    (tr) => !isConsciousSkipTrade(tr),
  );

  const recentLive = nonSkippedLive.slice(-15);
  const recentMissed = nonSkippedMissed.slice(-12);

  const liveNoteRows = recentLive
    .filter((tr) => Boolean(tr.notes?.trim()) || tr.outcome === 'STOP LOSS' || tr.outcome === 'TP')
    .slice(-12)
    .map(
      (tr) =>
        `- [LIVE] ${tr.date} | ${tr.asset} | ${tr.setup} (${tr.bias}) | ${tr.outcome} (${formatR(
          tr.netR,
        )})${tr.notes?.trim() ? ` | NOTE: "${tr.notes.trim()}"` : ''}`,
    );

  const missedNoteRows = recentMissed.map(
    (tr) =>
      `- [NON PRESO] ${tr.date} | ${tr.asset} | ${tr.setup} (${tr.bias}) | Esito teorico: ${
        tr.outcome
      } (${formatR(tr.netR)}) | Motivo: ${tr.missedReason || 'N/D'}${
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
    'REGOLA DI ESCLUSIONE RIGIDA: Gli skip consapevoli (CONSAPEVOLE, NON PRESO CONSAPEVOLE, PAUSA LAVORO, FESTIVO) sono già stati esclusi e NON vanno mai trattati come errori.',
    '',
    'METRICHE DISCIPLINA CALCOLATE (SOLO ERRORI REALI NON FORZATI):',
    `- Mechanical Adherence Score: ${metrics.adherenceScore}/100 (${metrics.emoji})`,
    `- Streak Giorni Senza Errori Non Forzati: ${metrics.consecutiveCleanDays} giorni su ${metrics.totalTrackedDays} attivi`,
    `- Probabilità Stimata Errore Esecutivo: ${metrics.mistakeProbabilityPct}%`,
    `- Errori Reali Totali: ${metrics.unforcedErrorsCount} (Non presi non giustificati: ${metrics.behavioralMissedCount} | Trade extra fuori backtest: ${metrics.unplannedExtraCount} | Discrepanze esito/direzione: ${metrics.discrepancyCount} | Note errore esplicito: ${metrics.noteDeviationsCount})`,
    `- Skip consapevoli esclusi dal calcolo: ${metrics.consciousSkipsExcludedCount}`,
    '',
    'CONFRONTO BACKTEST vs JOURNAL REALE:',
    `- Backtest: ${backtestStats.totalTrades} trade (${backtestStats.wins} TP, ${backtestStats.losses} SL, ${backtestStats.breakevens} BE, ${backtestStats.unfilled} UF) | WR: ${backtestStats.winRatePct.toFixed(1)}% | Net R: ${formatR(backtestStats.netR)} | Expectancy: ${formatR(backtestStats.avgRExcludingUf)} | Max DD: -${backtestStats.maxDrawdownR.toFixed(2)}R`,
    `- Journal Reale: ${liveStats.totalTrades} trade (${liveStats.wins} TP, ${liveStats.losses} SL, ${liveStats.breakevens} BE, ${liveStats.unfilled} UF) | WR: ${liveStats.winRatePct.toFixed(1)}% | Net R: ${formatR(liveStats.netR)} | Expectancy: ${formatR(liveStats.avgRExcludingUf)} | Max DD: -${liveStats.maxDrawdownR.toFixed(2)}R`,
    `- Scostamento Live vs Backtest: Net R ${formatR(netRGap)} | Win Rate ${wrGap >= 0 ? '+' : ''}${wrGap.toFixed(1)}%`,
    '',
    `TRADE NON PRESI NON GIUSTIFICATI (${nonSkippedMissed.length} nel filtro attivo, esclusi skip consapevoli):`,
    ...(missedNoteRows.length > 0 ? missedNoteRows : ['- Nessun errore comportamentale in Trade Non Presi.']),
    '',
    'CAMPIONE RECENTE JOURNAL REALE E COLONNA NOTE (esclusi skip consapevoli):',
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
