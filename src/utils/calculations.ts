import {
  type AkinatorScanResult,
  type AkinatorStreak,
  type BiasType,
  MISSED_REASONS,
  type MissedStats,
  type OutcomeType,
  type PerformanceStats,
  type PeriodRPoint,
  type TradeRecord,
  type WeeklyAssetSummary,
} from '../types/trading';

export function getPipMultiplier(asset: string): number {
  const norm = asset.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (!norm) return 10000;

  // Metals: XAU/USD, GOLD, XAG/USD
  if (norm.includes('XAU') || norm.includes('GOLD') || norm.includes('XAG') || norm.includes('SILVER')) {
    return 10;
  }

  // Indices & Crypto: US30, NAS100, NASDAQ, SPX500, US500, DAX, DE40, UK100, BTC, ETH
  if (
    norm.includes('US30') ||
    norm.includes('DOW') ||
    norm.includes('NAS') ||
    norm.includes('NDX') ||
    norm.includes('SPX') ||
    norm.includes('US500') ||
    norm.includes('DAX') ||
    norm.includes('DE40') ||
    norm.includes('GER') ||
    norm.includes('UK100') ||
    norm.includes('BTC') ||
    norm.includes('ETH') ||
    norm.includes('SOL')
  ) {
    return 1;
  }

  // JPY pairs: AUD/JPY, CHF/JPY, USD/JPY, EUR/JPY, GBP/JPY, etc.
  if (norm.includes('JPY')) {
    return 100;
  }

  // Standard Forex pairs (EUR/USD, CAD/CHF, GBP/USD, etc.)
  return 10000;
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Runs the automatic calculation engine on a single trade row:
 * - Bias from Entry vs SL (LONG if Entry > SL; SHORT if Entry < SL)
 * - SL Pips & TP Pips using asset pip multiplier
 * - Target RR = TP Pips / SL Pips
 * - Net Return (%) = # R * Risk %
 * Preserves existing # R, RR Max, and Outcome if Entry/SL/TP are absent.
 */
export function runRowCalculationEngine(trade: TradeRecord): TradeRecord {
  const entry =
    typeof trade.entryPrice === 'number' && Number.isFinite(trade.entryPrice) && trade.entryPrice > 0
      ? trade.entryPrice
      : null;
  const sl =
    typeof trade.slPrice === 'number' && Number.isFinite(trade.slPrice) && trade.slPrice > 0
      ? trade.slPrice
      : null;
  const tp =
    typeof trade.tpPrice === 'number' && Number.isFinite(trade.tpPrice) && trade.tpPrice > 0
      ? trade.tpPrice
      : null;

  let bias: BiasType = trade.bias === 'SHORT' ? 'SHORT' : 'LONG';
  let slPips: number | null = trade.slPips ?? null;
  let tpPips: number | null = trade.tpPips ?? null;
  let targetRR: number | null = trade.targetRR ?? null;

  const mult = getPipMultiplier(trade.asset);

  if (entry !== null && sl !== null && entry !== sl) {
    bias = entry > sl ? 'LONG' : 'SHORT';
    slPips = roundTo(Math.abs(entry - sl) * mult, 1);

    if (tp !== null) {
      tpPips = roundTo(Math.abs(tp - entry) * mult, 1);
      if (slPips > 0) {
        targetRR = roundTo(tpPips / slPips, 2);
      }
    }
  } else if (entry !== null && tp !== null) {
    tpPips = roundTo(Math.abs(tp - entry) * mult, 1);
  }

  let netR = Number.isFinite(trade.netR) ? roundTo(trade.netR, 2) : 0;
  // If row came with TP outcome and calculated targetRR but netR was 0 / missing, derive safely
  if ((trade.netR === undefined || trade.netR === null) && trade.outcome === 'TP' && targetRR) {
    netR = targetRR;
  } else if ((trade.netR === undefined || trade.netR === null) && trade.outcome === 'STOP LOSS') {
    netR = -1;
  }

  const riskPct = Number.isFinite(trade.riskPct) && trade.riskPct >= 0 ? trade.riskPct : 1;
  const netReturnPct = roundTo(netR * riskPct, 2);

  return {
    ...trade,
    bias,
    entryPrice: entry,
    slPrice: sl,
    tpPrice: tp,
    slPips,
    tpPips,
    targetRR,
    netR,
    riskPct,
    netReturnPct,
  };
}

export function normalizeOutcome(raw: string | undefined | null): OutcomeType {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return 'BE';
  if (
    s === 'UF' ||
    s === 'U.F.' ||
    s.includes('UNFILLED') ||
    s.includes('UNFIL') ||
    s.includes('NON FILLAT') ||
    s.includes('NO FILL') ||
    s === 'MISSED' ||
    s === 'CANCELLED'
  ) {
    return 'UNFILLED';
  }
  if (s === 'TP' || s.startsWith('TP') || s === 'WIN' || s === 'W' || s === 'PROFIT' || s === 'TAKE PROFIT' || s === 'TARGET') {
    return 'TP';
  }
  if (s.includes('STOP') || s === 'SL' || s === 'LOSS' || s === 'L') {
    return 'STOP LOSS';
  }
  return 'BE';
}

export function normalizeSetupName(raw: string | undefined | null): string {
  const val = String(raw ?? '').trim();
  if (!val) return 'S1';
  const lower = val.toLowerCase().replace(/\s+/g, ' ');

  if (lower === 's1') return 'S1';

  if (lower === 'ssa' || lower === 's6' || lower === 's66') {
    return 'SSA';
  }

  if (
    lower === 'mut' ||
    lower === 'mutation' ||
    lower === 'mutazione' ||
    lower.includes('mutazion')
  ) {
    return 'MUT';
  }

  if (
    lower === 'sbil dominance reale' ||
    lower === 'sbil. dominance reale' ||
    lower === 'sbilanciamento dominance reale' ||
    lower === 'real dominance imbalance' ||
    lower === 'swell 2000' ||
    lower === 'swell2000' ||
    lower === 'sewell 2000' ||
    lower === 'sewell2000' ||
    lower === 'russell 2000' ||
    lower === 'russell2000' ||
    lower === 'svel domin' ||
    lower.includes('dominance reale')
  ) {
    return 'SBIL DOMINANCE REALE';
  }

  if (
    lower === 'sbil intradominance' ||
    lower === 'sbil. intradominance' ||
    lower === 'sbilanciamento intradominance' ||
    lower === 'sbil. dominance intras. 1candela' ||
    lower === 'sbil dominance intras 1candela' ||
    lower === 'sbil. dominance intras. 1 candela' ||
    lower === 'sbil dominance intras. 1 candela' ||
    lower === 'intra-asian imbalance' ||
    lower === 'seriale bill' ||
    lower === 'seriale è bill' ||
    lower === 'seriale e bill' ||
    lower === 'serialebill' ||
    lower === 'intra dominance' ||
    lower === 'intradominance' ||
    lower.includes('intradominance') ||
    lower.includes('intras') ||
    lower.includes('1candela') ||
    lower.includes('1 candela')
  ) {
    return 'SBIL INTRADOMINANCE';
  }

  return 'S1';
}

export function sortTradesChronologically(trades: TradeRecord[]): TradeRecord[] {
  return [...trades].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    const ta = a.entryTime || '';
    const tb = b.entryTime || '';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.createdAt - b.createdAt;
  });
}

export function calculatePerformanceStats(trades: TradeRecord[]): PerformanceStats {
  const ordered = sortTradesChronologically(trades);

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let unfilled = 0;
  let netR = 0;
  let netReturnPct = 0;
  let grossWinR = 0;
  let grossLossR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;

  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let bestTradeR = 0;
  let worstTradeR = 0;

  // Compounded account index (starting at 100) for institutional % drawdown, CAGR, Sharpe, Sortino
  let accountEquity = 100;
  let peakAccountEquity = 100;
  let maxDrawdownPct = 0;
  const tradeReturns: number[] = [];

  const monthlyMap = new Map<string, { netR: number; count: number }>();
  const dailyMap = new Map<string, { netR: number; count: number }>();

  const equityPoints: PerformanceStats['equityPoints'] = [
    {
      index: 0,
      date: '',
      label: 'Inizio',
      deltaR: 0,
      cumulativeR: 0,
      drawdownR: 0,
      trade: null,
    },
  ];

  ordered.forEach((trade, idx) => {
    if (trade.outcome === 'TP') wins += 1;
    else if (trade.outcome === 'STOP LOSS') losses += 1;
    else if (trade.outcome === 'UNFILLED') unfilled += 1;
    else breakevens += 1;

    const deltaR = Number.isFinite(trade.netR) ? trade.netR : 0;
    const retPct = Number.isFinite(trade.netReturnPct)
      ? trade.netReturnPct
      : deltaR * (trade.riskPct || 1);

    if (idx === 0 || deltaR > bestTradeR) bestTradeR = deltaR;
    if (idx === 0 || deltaR < worstTradeR) worstTradeR = deltaR;

    if (deltaR > 0) {
      grossWinR += deltaR;
      curWinStreak += 1;
      curLossStreak = 0;
      if (curWinStreak > maxConsecutiveWins) maxConsecutiveWins = curWinStreak;
    } else if (deltaR < 0) {
      grossLossR += Math.abs(deltaR);
      curLossStreak += 1;
      curWinStreak = 0;
      if (curLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = curLossStreak;
    } else {
      curWinStreak = 0;
      curLossStreak = 0;
    }

    // Track per-trade decimal return for Sharpe/Sortino and compounded equity for Max DD % / CAGR
    const decRet = retPct / 100;
    if (Number.isFinite(decRet)) {
      tradeReturns.push(decRet);
      accountEquity = Math.max(0, accountEquity * (1 + decRet));
      if (accountEquity > peakAccountEquity) peakAccountEquity = accountEquity;
      if (peakAccountEquity > 0) {
        const ddPct = ((peakAccountEquity - accountEquity) / peakAccountEquity) * 100;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
      }
    }

    netR = roundTo(netR + deltaR, 2);
    netReturnPct = roundTo(netReturnPct + retPct, 2);

    peakR = Math.max(peakR, netR);
    const drawdownR = roundTo(netR - peakR, 2);
    const ddAbs = roundTo(peakR - netR, 2);
    if (ddAbs > maxDrawdownR) maxDrawdownR = ddAbs;

    // Aggregate monthly and daily buckets
    if (/^\d{4}-\d{2}-\d{2}$/.test(trade.date)) {
      const mKey = trade.date.slice(0, 7);
      const prevM = monthlyMap.get(mKey) ?? { netR: 0, count: 0 };
      monthlyMap.set(mKey, {
        netR: roundTo(prevM.netR + deltaR, 2),
        count: prevM.count + 1,
      });

      const dKey = trade.date;
      const prevD = dailyMap.get(dKey) ?? { netR: 0, count: 0 };
      dailyMap.set(dKey, {
        netR: roundTo(prevD.netR + deltaR, 2),
        count: prevD.count + 1,
      });
    }

    equityPoints.push({
      index: idx + 1,
      date: trade.date,
      label: formatShortDate(trade.date),
      deltaR,
      cumulativeR: netR,
      drawdownR,
      trade,
    });
  });

  const executedRelevant = wins + losses + breakevens;
  const totalTrades = ordered.length;
  const winRatePct = executedRelevant > 0 ? roundTo((wins / executedRelevant) * 100, 1) : 0;
  const expectancyR = totalTrades > 0 ? roundTo(netR / totalTrades, 2) : 0;

  const grossWinRounded = roundTo(grossWinR, 2);
  const grossLossRounded = roundTo(grossLossR, 2);
  const profitFactorInfinite = grossLossR === 0 && grossWinR > 0;
  const profitFactor =
    grossLossR > 0 ? roundTo(grossWinR / grossLossR, 2) : grossWinR > 0 ? 99.9 : 0;

  const avgWinR = wins > 0 ? roundTo(grossWinR / wins, 2) : 0;
  const avgLossR = losses > 0 ? roundTo(grossLossR / losses, 2) : 0;
  const payoffRatio =
    avgLossR > 0 ? roundTo(avgWinR / avgLossR, 2) : avgWinR > 0 ? null : 0;

  // Calendar span in days
  let daysSpan = 0;
  if (ordered.length >= 2) {
    const firstDt = parseIsoDateUtc(ordered[0].date);
    const lastDt = parseIsoDateUtc(ordered[ordered.length - 1].date);
    if (firstDt && lastDt) {
      daysSpan = Math.max(1, Math.round((lastDt.getTime() - firstDt.getTime()) / 86400000));
    }
  } else if (ordered.length === 1) {
    daysSpan = 1;
  }

  // Compounded Annual Growth Rate (CAGR %) — requires >= 14 days span
  let cagrPct: number | null = null;
  if (totalTrades > 0 && daysSpan >= 14) {
    const years = daysSpan / 365.25;
    if (accountEquity <= 0) {
      cagrPct = -100;
    } else {
      const rawCagr = (Math.pow(accountEquity / 100, 1 / years) - 1) * 100;
      if (Number.isFinite(rawCagr)) {
        cagrPct = roundTo(Math.max(-100, Math.min(999.99, rawCagr)), 2);
      }
    }
  }

  // Sharpe Ratio & Sortino Ratio (Risk-Free = 0)
  const n = tradeReturns.length;
  const yearsForAnn = Math.max(daysSpan / 365.25, 1 / 12);
  const periodsPerYear = n > 0 ? Math.min(252, Math.max(12, n / yearsForAnn)) : 52;
  const meanRet = n > 0 ? tradeReturns.reduce((s, r) => s + r, 0) / n : 0;

  let sharpeRatio: number | null = totalTrades > 0 ? 0 : null;
  if (n > 1) {
    const variance =
      tradeReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0 && Number.isFinite(stdDev)) {
      sharpeRatio = roundTo((meanRet / stdDev) * Math.sqrt(periodsPerYear), 2);
    }
  }

  let sortinoRatio: number | null = totalTrades > 0 ? 0 : null;
  let sortinoInfinite = false;
  if (n > 1) {
    const downsideSq =
      tradeReturns.reduce((s, r) => s + Math.pow(Math.min(0, r), 2), 0) / n;
    const downsideDev = Math.sqrt(downsideSq);
    if (downsideDev > 0 && Number.isFinite(downsideDev)) {
      sortinoRatio = roundTo((meanRet / downsideDev) * Math.sqrt(periodsPerYear), 2);
    } else if (meanRet > 0) {
      sortinoRatio = null;
      sortinoInfinite = true;
    }
  }

  // Calmar Ratio (CAGR % / Max Drawdown %)
  let calmarRatio: number | null = null;
  if (cagrPct !== null && maxDrawdownPct > 0) {
    calmarRatio = roundTo(cagrPct / maxDrawdownPct, 2);
  }

  // Recovery Factor (Net R / Max Drawdown R)
  let recoveryFactor: number | null = totalTrades > 0 ? 0 : null;
  if (maxDrawdownR > 0) {
    recoveryFactor = roundTo(netR / maxDrawdownR, 2);
  } else if (netR > 0) {
    recoveryFactor = null;
  }

  // Estimated Risk of Ruin % (20R critical threshold)
  let riskOfRuinPct = 0;
  if (totalTrades > 0 && losses > 0 && avgLossR > 0) {
    const activeCount = wins + losses;
    const p = activeCount > 0 ? wins / activeCount : 0;
    const q = 1 - p;
    const rRatio = avgWinR / avgLossR;
    const edgePerUnit = rRatio > 0 ? p - q / rRatio : -1;
    if (edgePerUnit <= 0) {
      riskOfRuinPct = 100;
    } else {
      const u = Math.min(0.99, Math.max(0.0001, edgePerUnit));
      const rawRor = Math.pow((1 - u) / (1 + u), 20) * 100;
      riskOfRuinPct = Number.isFinite(rawRor)
        ? roundTo(Math.min(100, Math.max(0, rawRor)), 2)
        : 0;
    }
  }

  const monthlyBuckets: PeriodRPoint[] = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, data]) => ({
      period,
      label: period,
      netR: data.netR,
      tradesCount: data.count,
    }));

  const dailyBuckets: PeriodRPoint[] = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, data]) => ({
      period,
      label: formatShortDate(period),
      netR: data.netR,
      tradesCount: data.count,
    }));

  return {
    totalTrades,
    wins,
    losses,
    breakevens,
    unfilled,
    winRatePct,
    netR,
    grossWinR: grossWinRounded,
    grossLossR: grossLossRounded,
    avgWinR,
    avgLossR,
    payoffRatio,
    bestTradeR: roundTo(bestTradeR, 2),
    worstTradeR: roundTo(worstTradeR, 2),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    expectancyR,
    netReturnPct,
    profitFactor,
    profitFactorInfinite,
    maxDrawdownR,
    maxDrawdownPct: roundTo(maxDrawdownPct, 2),
    daysSpan,
    cagrPct,
    sharpeRatio,
    sortinoRatio,
    sortinoInfinite,
    calmarRatio,
    recoveryFactor,
    riskOfRuinPct,
    monthlyBuckets,
    dailyBuckets,
    equityPoints,
  };
}

export function calculateMissedStats(
  executedLiveTrades: TradeRecord[],
  missedTrades: TradeRecord[],
): MissedStats {
  let theoreticalWins = 0;
  let avoidedLosses = 0;
  let theoreticalBE = 0;
  let theoreticalUnfilled = 0;
  let theoreticalNetR = 0;
  let missedWinR = 0;
  let avoidedLossR = 0;

  const reasonMap: Record<string, { reason: string; count: number; impactR: number }> = {};
  MISSED_REASONS.forEach((reason) => {
    reasonMap[reason] = { reason, count: 0, impactR: 0 };
  });

  missedTrades.forEach((trade) => {
    const r = Number.isFinite(trade.netR) ? trade.netR : 0;
    theoreticalNetR = roundTo(theoreticalNetR + r, 2);

    if (trade.outcome === 'TP') {
      theoreticalWins += 1;
      missedWinR = roundTo(missedWinR + r, 2);
    } else if (trade.outcome === 'STOP LOSS') {
      avoidedLosses += 1;
      avoidedLossR = roundTo(avoidedLossR + r, 2);
    } else if (trade.outcome === 'UNFILLED') {
      theoreticalUnfilled += 1;
    } else {
      theoreticalBE += 1;
    }

    const reasonKey = trade.missedReason?.trim() || MISSED_REASONS[0];
    if (!reasonMap[reasonKey]) {
      reasonMap[reasonKey] = { reason: reasonKey, count: 0, impactR: 0 };
    }
    reasonMap[reasonKey].count += 1;
    reasonMap[reasonKey].impactR = roundTo(reasonMap[reasonKey].impactR + r, 2);
  });

  const executedCount = executedLiveTrades.length;
  const totalMissed = missedTrades.length;
  const totalSignals = executedCount + totalMissed;
  const adherenceScorePct =
    totalSignals > 0 ? roundTo((executedCount / totalSignals) * 100, 1) : 0;
  const executedMissedRelevant = theoreticalWins + avoidedLosses + theoreticalBE;
  const theoreticalWinRatePct =
    executedMissedRelevant > 0
      ? roundTo((theoreticalWins / executedMissedRelevant) * 100, 1)
      : 0;

  return {
    totalMissed,
    executedCount,
    totalSignals,
    theoreticalWins,
    avoidedLosses,
    theoreticalBE,
    theoreticalUnfilled,
    theoreticalWinRatePct,
    theoreticalNetR,
    missedWinR,
    avoidedLossR,
    adherenceScorePct,
    reasonBreakdown: Object.values(reasonMap),
  };
}

// ------------------------- Calendar Week Utilities & Akinator Full Scan -------------------------

function parseIsoDateUtc(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatUtcDateIso(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns Monday (weekStart) and Sunday (weekEnd) for any YYYY-MM-DD date.
 */
function getCalendarWeekBounds(isoDate: string): {
  weekStart: string;
  weekEnd: string;
  mondayMs: number;
} | null {
  const dt = parseIsoDateUtc(isoDate);
  if (!dt) return null;
  // getUTCDay(): 0=Sun, 1=Mon ... 6=Sat -> shift so Mon=0 ... Sun=6
  const dayOffset = (dt.getUTCDay() + 6) % 7;
  const monday = new Date(dt.getTime() - dayOffset * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return {
    weekStart: formatUtcDateIso(monday),
    weekEnd: formatUtcDateIso(sunday),
    mondayMs: monday.getTime(),
  };
}

/**
 * AKINATOR — FULL SCAN BACKTEST:
 * - Reads ONLY Backtest trades (ignores Live Journaling and Missed Trades).
 * - Groups trades by calendar week (Monday to Sunday).
 * - Qualifying Drawdown Week: EVERY traded asset in the Backtest closed that week with net R <= -3.0 R.
 * - Scans the entire history with no upper limit to detect ALL consecutive qualifying week streaks (2, 3, 4, 5+ weeks).
 */
export function calculateAkinatorBacktestScan(backtestTrades: TradeRecord[]): AkinatorScanResult {
  const pureBacktest = backtestTrades.filter((t) => t.category === 'backtest');
  const trackedAssets = Array.from(
    new Set(pureBacktest.map((t) => t.asset.trim().toUpperCase()).filter(Boolean)),
  ).sort();

  if (pureBacktest.length === 0 || trackedAssets.length === 0) {
    return {
      totalWeeksScanned: 0,
      trackedAssets: [],
      qualifyingWeeksCount: 0,
      maxConsecutiveStreak: 0,
      latestStreakStatus: 'No Backtest Data',
      latestStreakLength: 0,
      streaks: [],
      qualifyingWeeks: [],
    };
  }

  interface Bucket {
    weekStart: string;
    weekEnd: string;
    mondayMs: number;
    assetNetR: Record<string, number>;
    totalWeekR: number;
    tradeCount: number;
  }

  const weekBuckets = new Map<string, Bucket>();

  pureBacktest.forEach((trade) => {
    const bounds = getCalendarWeekBounds(trade.date);
    if (!bounds) return;

    let bucket = weekBuckets.get(bounds.weekStart);
    if (!bucket) {
      bucket = {
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        mondayMs: bounds.mondayMs,
        assetNetR: {},
        totalWeekR: 0,
        tradeCount: 0,
      };
      weekBuckets.set(bounds.weekStart, bucket);
    }

    const asset = trade.asset.trim().toUpperCase();
    const r = Number.isFinite(trade.netR) ? trade.netR : 0;
    bucket.assetNetR[asset] = roundTo((bucket.assetNetR[asset] ?? 0) + r, 2);
    bucket.totalWeekR = roundTo(bucket.totalWeekR + r, 2);
    bucket.tradeCount += 1;
  });

  const sortedWeeks = Array.from(weekBuckets.values()).sort(
    (a, b) => a.mondayMs - b.mondayMs,
  );

  const weeklySummaries: WeeklyAssetSummary[] = sortedWeeks.map((b) => {
    const fullAssetMap: Record<string, number> = {};
    let allAssetsBelow = true;
    let worstAssetR = 0;

    trackedAssets.forEach((asset, i) => {
      const val = roundTo(b.assetNetR[asset] ?? 0, 2);
      fullAssetMap[asset] = val;
      if (val > -3.0) {
        allAssetsBelow = false;
      }
      if (i === 0 || val < worstAssetR) {
        worstAssetR = val;
      }
    });

    return {
      weekKey: b.weekStart,
      weekStart: b.weekStart,
      weekEnd: b.weekEnd,
      assetNetR: fullAssetMap,
      allAssetsBelowThreshold: allAssetsBelow,
      worstAssetR,
      totalWeekR: b.totalWeekR,
      tradeCount: b.tradeCount,
    };
  });

  const qualifyingWeeks = weeklySummaries.filter((w) => w.allAssetsBelowThreshold);

  // Detect ALL consecutive qualifying week streaks (2+ weeks, unlimited upper length)
  const streaks: AkinatorStreak[] = [];
  let currentRun: WeeklyAssetSummary[] = [];

  const flushRun = () => {
    if (currentRun.length >= 2) {
      streaks.push({
        id: `streak_${currentRun[0].weekStart}_${currentRun.length}`,
        length: currentRun.length,
        startDate: currentRun[0].weekStart,
        endDate: currentRun[currentRun.length - 1].weekEnd,
        weeks: [...currentRun],
      });
    }
    currentRun = [];
  };

  weeklySummaries.forEach((week) => {
    if (!week.allAssetsBelowThreshold) {
      flushRun();
      return;
    }

    if (currentRun.length === 0) {
      currentRun.push(week);
      return;
    }

    const prev = currentRun[currentRun.length - 1];
    const prevMs = parseIsoDateUtc(prev.weekStart)?.getTime() ?? 0;
    const currMs = parseIsoDateUtc(week.weekStart)?.getTime() ?? 0;
    const diffDays = Math.round((currMs - prevMs) / 86400000);

    if (diffDays === 7) {
      currentRun.push(week);
    } else {
      flushRun();
      currentRun.push(week);
    }
  });
  flushRun();

  const maxConsecutiveStreak = streaks.reduce(
    (max, s) => Math.max(max, s.length),
    0,
  );

  // Determine Latest Streak Status from the chronological end of Backtest history
  let trailingQualifyingCount = 0;
  for (let i = weeklySummaries.length - 1; i >= 0; i--) {
    const w = weeklySummaries[i];
    if (!w.allAssetsBelowThreshold) break;
    if (i === weeklySummaries.length - 1) {
      trailingQualifyingCount = 1;
    } else {
      const next = weeklySummaries[i + 1];
      const currMs = parseIsoDateUtc(w.weekStart)?.getTime() ?? 0;
      const nextMs = parseIsoDateUtc(next.weekStart)?.getTime() ?? 0;
      if (Math.round((nextMs - currMs) / 86400000) === 7) {
        trailingQualifyingCount += 1;
      } else {
        break;
      }
    }
  }

  let latestStreakStatus = 'Nessuna Serie Attiva';
  if (trailingQualifyingCount >= 2) {
    latestStreakStatus = `Attiva (${trailingQualifyingCount} Settimane Consecutive)`;
  } else if (trailingQualifyingCount === 1) {
    latestStreakStatus = 'Attenzione (1 Settimana Qualificante)';
  } else if (streaks.length > 0) {
    const last = streaks[streaks.length - 1];
    latestStreakStatus = `Ultima: ${last.length} Settimane (${formatDisplayDate(last.startDate)} → ${formatDisplayDate(last.endDate)})`;
  }

  return {
    totalWeeksScanned: weeklySummaries.length,
    trackedAssets,
    qualifyingWeeksCount: qualifyingWeeks.length,
    maxConsecutiveStreak,
    latestStreakStatus,
    latestStreakLength: trailingQualifyingCount,
    streaks,
    qualifyingWeeks,
  };
}

export function formatR(val: number): string {
  const num = roundTo(val, 2);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)} R`;
}

export function formatPct(val: number): string {
  const num = roundTo(val, 2);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function formatDisplayDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatShortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate || '';
  return `${m[3]}/${m[2]}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateTradeId(prefix = 'tr'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
