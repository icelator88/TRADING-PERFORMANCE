export type Language = 'en' | 'it' | 'es';

export type ActiveTab = 'dashboard' | 'backtest' | 'live' | 'missed';

export type TradeCategory = 'backtest' | 'live' | 'missed';

export type BiasType = 'LONG' | 'SHORT';

export type OutcomeType = 'TP' | 'STOP LOSS' | 'BE' | 'UNFILLED';

export const COMPACT_SETUPS = [
  'S1',
  'SSA',
  'MUT',
  'SBIL DOMINANCE REALE',
  'SBIL INTRADOMINANCE',
] as const;

export const MISSED_REASONS = [
  'Esitazione / Paura',
  'Distrazione',
  'Spread Alto',
  'Ordine Non Fillato',
  'Fuori Orario',
] as const;

export type MissedReason = (typeof MISSED_REASONS)[number];

export interface TradeRecord {
  id: string;
  category: TradeCategory;
  date: string; // YYYY-MM-DD
  day?: string;
  session?: string;
  entryTime?: string;
  exitTime?: string;
  asset: string;
  setup: string;
  strategy?: string; // Synced alias for compatibility with trade.strategy filters
  isMissed?: boolean;
  bias: BiasType;
  riskPct: number;
  entryPrice?: number | null;
  slPrice?: number | null;
  tpPrice?: number | null;
  slPips?: number | null;
  tpPips?: number | null;
  targetRR?: number | null;
  outcome: OutcomeType;
  netR: number; // # R realized (e.g. +2.5, -1.0, 0)
  rrMax?: number | null;
  netReturnPct: number; // # R * riskPct
  missedReason?: string;
  notes?: string;
  tradingViewUrl?: string;
  extraColumns?: Record<string, string>;
  createdAt: number;
}

export interface WeeklyAssetSummary {
  weekKey: string; // e.g. 2025-W08
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  assetNetR: Record<string, number>;
  allAssetsBelowThreshold: boolean;
  worstAssetR: number;
  totalWeekR: number;
  tradeCount: number;
}

export interface AkinatorStreak {
  id: string;
  length: number;
  startDate: string;
  endDate: string;
  weeks: WeeklyAssetSummary[];
}

export interface AkinatorScanResult {
  totalWeeksScanned: number;
  trackedAssets: string[];
  qualifyingWeeksCount: number;
  maxConsecutiveStreak: number;
  latestStreakStatus: string;
  latestStreakLength: number;
  streaks: AkinatorStreak[];
  qualifyingWeeks: WeeklyAssetSummary[];
}

export interface PeriodRPoint {
  period: string;
  label: string;
  netR: number;
  tradesCount: number;
}

export interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  unfilled: number;
  winRatePct: number;
  netR: number;
  grossWinR: number;
  grossLossR: number;
  avgWinR: number;
  avgLossR: number;
  payoffRatio: number | null;
  bestTradeR: number;
  worstTradeR: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  expectancyR: number;
  netReturnPct: number;
  profitFactor: number;
  profitFactorInfinite: boolean;
  maxDrawdownR: number;
  maxDrawdownPct: number;
  daysSpan: number;
  cagrPct: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  sortinoInfinite: boolean;
  calmarRatio: number | null;
  recoveryFactor: number | null;
  riskOfRuinPct: number;
  monthlyBuckets: PeriodRPoint[];
  dailyBuckets: PeriodRPoint[];
  equityPoints: {
    index: number;
    date: string;
    label: string;
    deltaR: number;
    cumulativeR: number;
    drawdownR: number;
    trade: TradeRecord | null;
  }[];
}

export interface MissedStats {
  totalMissed: number;
  executedCount: number;
  totalSignals: number;
  theoreticalWins: number;
  avoidedLosses: number;
  theoreticalBE: number;
  theoreticalNetR: number;
  missedWinR: number;
  avoidedLossR: number;
  adherenceScorePct: number;
  reasonBreakdown: {
    reason: string;
    count: number;
    impactR: number;
  }[];
}

export type MappingField =
  | 'ignore'
  | 'date'
  | 'day'
  | 'session'
  | 'entryTime'
  | 'exitTime'
  | 'asset'
  | 'setup'
  | 'bias'
  | 'riskPct'
  | 'entryPrice'
  | 'slPrice'
  | 'tpPrice'
  | 'outcome'
  | 'netR'
  | 'rrMax'
  | 'missedReason'
  | 'notes'
  | 'tradingViewUrl';

export interface ParsedSheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedFiveBlocks: boolean;
  blockCounts: number[];
  isExcelSheet?: boolean;
}
