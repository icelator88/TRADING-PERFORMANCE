import {
  type Language,
  MISSED_REASONS,
  type TradeCategory,
  type TradeRecord,
} from '../types/trading';
import {
  generateTradeId,
  normalizeOutcome,
  normalizeSetupName,
  roundTo,
  runRowCalculationEngine,
} from './calculations';

// Additive, non-destructive storage keys
export const KEYS = {
  BACKTEST: 'diariotrade_backtest_v1',
  LIVE: 'diariotrade_live_v1',
  MISSED: 'diariotrade_missed_v1',
  MECCANICO_LEGACY: 'diariotrade_meccanico_v1',
  LANGUAGE: 'diariotrade_language_v1',
} as const;

interface DiscoveredStorage {
  backtestKey: string | null;
  liveKey: string | null;
  langKey: string | null;
}

const discovered: DiscoveredStorage = {
  backtestKey: null,
  liveKey: null,
  langKey: null,
};

function looksLikeTradeItem(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;
  const hasAsset =
    typeof obj.asset === 'string' ||
    typeof obj.pair === 'string' ||
    typeof obj.coppia === 'string' ||
    typeof obj.simbolo === 'string';
  const hasDate =
    typeof obj.date === 'string' ||
    typeof obj.data === 'string' ||
    typeof obj.createdAt === 'number';
  return hasAsset && hasDate;
}

function coerceLegacyTrade(
  raw: Record<string, unknown>,
  fallbackCategory: TradeCategory,
): TradeRecord | null {
  const assetRaw = raw.asset ?? raw.pair ?? raw.coppia ?? raw.simbolo ?? '';
  const dateRaw = raw.date ?? raw.data ?? '';
  const asset = String(assetRaw).trim().toUpperCase();
  const date = String(dateRaw).trim().slice(0, 10);
  if (!asset || !date) return null;

  let category: TradeCategory = fallbackCategory;
  if (raw.category === 'backtest' || raw.category === 'live' || raw.category === 'missed') {
    category = raw.category;
  } else if (raw.stato === 'NON PRESO') {
    category = 'missed';
  } else if (raw.stato === 'ESEGUITO') {
    category = 'live';
  }

  const biasRaw = String(raw.bias ?? raw.direzione ?? raw.direction ?? 'LONG').toUpperCase();
  const bias = biasRaw === 'SHORT' ? 'SHORT' : 'LONG';

  const outcome = normalizeOutcome(String(raw.outcome ?? raw.esito ?? 'BE'));

  // Support both our current schema (netR) and mechanical journal schema (rr + esito)
  let netR = Number(raw.netR ?? raw.r ?? raw.rMultiple);
  if (!Number.isFinite(netR)) {
    const rrNum = Number(raw.rr ?? 0);
    if (outcome === 'TP') netR = Math.abs(rrNum);
    else if (outcome === 'STOP LOSS') netR = -1;
    else netR = 0;
  }

  const riskPctNum = Number(raw.riskPct ?? raw.risk ?? 1);
  const riskPct = Number.isFinite(riskPctNum) && riskPctNum >= 0 ? riskPctNum : 1;

  const entryPrice = raw.entryPrice != null ? Number(raw.entryPrice) : null;
  const slPrice = raw.slPrice != null ? Number(raw.slPrice) : null;
  const tpPrice = raw.tpPrice != null ? Number(raw.tpPrice) : null;
  const rrMax = raw.rrMax != null && Number.isFinite(Number(raw.rrMax)) ? Number(raw.rrMax) : null;

  const missedReasonRaw = String(raw.missedReason ?? raw.motivo ?? '').trim();
  const missedReason =
    category === 'missed'
      ? missedReasonRaw || MISSED_REASONS[0]
      : '';

  const normalizedSetup = normalizeSetupName(
    String(
      raw.setup ??
        raw.strategy ??
        raw.strategia ??
        raw.schematic ??
        raw.schematica ??
        'S1',
    ),
  );

  const base: TradeRecord = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateTradeId(category.slice(0, 2)),
    category,
    date,
    day: typeof raw.day === 'string' ? raw.day : undefined,
    session: typeof raw.session === 'string' ? raw.session : undefined,
    entryTime: typeof raw.entryTime === 'string' ? raw.entryTime : undefined,
    exitTime: typeof raw.exitTime === 'string' ? raw.exitTime : undefined,
    asset,
    setup: normalizedSetup,
    strategy: normalizedSetup,
    bias,
    riskPct,
    entryPrice: entryPrice !== null && Number.isFinite(entryPrice) ? entryPrice : null,
    slPrice: slPrice !== null && Number.isFinite(slPrice) ? slPrice : null,
    tpPrice: tpPrice !== null && Number.isFinite(tpPrice) ? tpPrice : null,
    slPips: typeof raw.slPips === 'number' ? raw.slPips : null,
    tpPips: typeof raw.tpPips === 'number' ? raw.tpPips : null,
    targetRR: typeof raw.targetRR === 'number' ? raw.targetRR : null,
    outcome,
    netR: roundTo(netR, 2),
    rrMax,
    netReturnPct: roundTo(netR * riskPct, 2),
    missedReason,
    notes: typeof raw.notes === 'string' ? raw.notes : typeof raw.note === 'string' ? raw.note : '',
    tradingViewUrl:
      typeof raw.tradingViewUrl === 'string'
        ? raw.tradingViewUrl
        : typeof raw.tvLink === 'string'
          ? raw.tvLink
          : '',
    extraColumns:
      raw.extraColumns && typeof raw.extraColumns === 'object' && !Array.isArray(raw.extraColumns)
        ? (raw.extraColumns as Record<string, string>)
        : undefined,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };

  return runRowCalculationEngine(base);
}

/**
 * Safely scans existing localStorage keys on startup without modifying, deleting,
 * or resetting ANY pre-existing key. Merges discovered trades cleanly by ID.
 */
export function loadAllTradesSafely(): {
  backtest: TradeRecord[];
  live: TradeRecord[];
  missed: TradeRecord[];
} {
  const backtestMap = new Map<string, TradeRecord>();
  const liveMap = new Map<string, TradeRecord>();
  const missedMap = new Map<string, TradeRecord>();

  const addUnique = (map: Map<string, TradeRecord>, t: TradeRecord | null) => {
    if (!t) return;
    if (!map.has(t.id)) {
      map.set(t.id, t);
    }
  };

  try {
    const allKeys = Object.keys(localStorage);

    let migratedBacktest = false;
    let migratedLive = false;
    let migratedMissed = false;

    // 1. Read our dedicated additive keys first & detect any legacy strategy names needing migration
    const readArrayKey = (
      key: string,
      cat: TradeCategory,
      target: Map<string, TradeRecord>,
      onMigrated: () => void,
    ) => {
      const rawStr = localStorage.getItem(key);
      if (!rawStr) return;
      try {
        const parsed = JSON.parse(rawStr);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (looksLikeTradeItem(item)) {
              const coerced = coerceLegacyTrade(item, cat);
              if (coerced) {
                const rawSetup = String(
                  item.setup ?? item.strategy ?? item.strategia ?? '',
                ).trim();
                if (rawSetup !== coerced.setup || item.strategy !== coerced.strategy) {
                  onMigrated();
                }
                addUnique(target, coerced);
              }
            }
          });
        }
      } catch {
        // Ignore non-JSON values safely
      }
    };

    readArrayKey(KEYS.BACKTEST, 'backtest', backtestMap, () => {
      migratedBacktest = true;
    });
    readArrayKey(KEYS.LIVE, 'live', liveMap, () => {
      migratedLive = true;
    });
    readArrayKey(KEYS.MISSED, 'missed', missedMap, () => {
      migratedMissed = true;
    });

    // 2. Read diariotrade_meccanico_v1 safely (do not delete or overwrite)
    const meccanicoRaw = localStorage.getItem(KEYS.MECCANICO_LEGACY);
    if (meccanicoRaw) {
      try {
        const parsed = JSON.parse(meccanicoRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (!looksLikeTradeItem(item)) return;
            const coerced = coerceLegacyTrade(
              item,
              item.stato === 'NON PRESO' ? 'missed' : 'live',
            );
            if (!coerced) return;
            if (coerced.category === 'missed') addUnique(missedMap, coerced);
            else addUnique(liveMap, coerced);
          });
        }
      } catch {
        // Ignore safely
      }
    }

    // 3. Auto-discover any other pre-existing Backtest / Live Journaling keys in localStorage
    const knownKeys = new Set<string>(Object.values(KEYS));
    allKeys.forEach((key) => {
      if (knownKeys.has(key)) return;
      const lower = key.toLowerCase();
      if (lower.includes('lang') || lower.includes('theme') || lower.includes('ui')) return;

      const rawStr = localStorage.getItem(key);
      if (!rawStr || (!rawStr.trim().startsWith('[') && !rawStr.trim().startsWith('{'))) return;

      try {
        const parsed = JSON.parse(rawStr);
        if (Array.isArray(parsed) && parsed.some(looksLikeTradeItem)) {
          const isBacktestKey = lower.includes('backtest') || lower.includes('bt');
          const isMissedKey = lower.includes('missed') || lower.includes('non_presi');
          const targetCat: TradeCategory = isBacktestKey
            ? 'backtest'
            : isMissedKey
              ? 'missed'
              : 'live';

          if (isBacktestKey && !discovered.backtestKey) discovered.backtestKey = key;
          if (!isBacktestKey && !isMissedKey && !discovered.liveKey) discovered.liveKey = key;

          parsed.forEach((item) => {
            if (!looksLikeTradeItem(item)) return;
            const coerced = coerceLegacyTrade(item, targetCat);
            if (!coerced) return;
            if (coerced.category === 'backtest') addUnique(backtestMap, coerced);
            else if (coerced.category === 'missed') addUnique(missedMap, coerced);
            else addUnique(liveMap, coerced);
          });
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          const btArr = obj.backtest ?? obj.backtestTrades;
          const liveArr = obj.live ?? obj.liveTrades ?? obj.journal ?? obj.trades;
          const missedArr = obj.missed ?? obj.missedTrades;

          if (Array.isArray(btArr)) {
            btArr.forEach((item) => {
              if (looksLikeTradeItem(item)) {
                addUnique(backtestMap, coerceLegacyTrade(item, 'backtest'));
              }
            });
          }
          if (Array.isArray(liveArr)) {
            liveArr.forEach((item) => {
              if (looksLikeTradeItem(item)) {
                addUnique(liveMap, coerceLegacyTrade(item, 'live'));
              }
            });
          }
          if (Array.isArray(missedArr)) {
            missedArr.forEach((item) => {
              if (looksLikeTradeItem(item)) {
                addUnique(missedMap, coerceLegacyTrade(item, 'missed'));
              }
            });
          }
        }
      } catch {
        // Never crash or overwrite unknown keys
      }
    });
    const backtestArr = Array.from(backtestMap.values());
    const liveArr = Array.from(liveMap.values());
    const missedArr = Array.from(missedMap.values());

    // Persist migrated strategy names back cleanly without deleting any trades
    if (migratedBacktest && backtestArr.length > 0) {
      saveTradesSafely('backtest', backtestArr);
    }
    if (migratedLive && liveArr.length > 0) {
      saveTradesSafely('live', liveArr);
    }
    if (migratedMissed && missedArr.length > 0) {
      saveTradesSafely('missed', missedArr);
    }

    return {
      backtest: backtestArr,
      live: liveArr,
      missed: missedArr,
    };
  } catch {
    // localStorage unavailable
  }

  return {
    backtest: Array.from(backtestMap.values()),
    live: Array.from(liveMap.values()),
    missed: Array.from(missedMap.values()),
  };
}

/**
 * Persists only to our dedicated additive keys so existing user localStorage keys
 * are never accidentally deleted, reset, or structurally altered.
 */
export function saveTradesSafely(
  category: TradeCategory,
  trades: TradeRecord[],
): boolean {
  try {
    if (category === 'backtest') {
      localStorage.setItem(KEYS.BACKTEST, JSON.stringify(trades));
    } else if (category === 'live') {
      localStorage.setItem(KEYS.LIVE, JSON.stringify(trades));
    } else {
      localStorage.setItem(KEYS.MISSED, JSON.stringify(trades));
    }
    return true;
  } catch {
    return false;
  }
}

export function loadLanguagePreference(): Language {
  try {
    const val = localStorage.getItem(KEYS.LANGUAGE);
    if (val === 'it' || val === 'en') {
      discovered.langKey = KEYS.LANGUAGE;
      return val;
    }
  } catch {
    // ignore
  }
  return 'it';
}

export function saveLanguagePreference(lang: Language): void {
  try {
    localStorage.setItem(KEYS.LANGUAGE, lang);
    if (discovered.langKey && discovered.langKey !== KEYS.LANGUAGE) {
      localStorage.setItem(discovered.langKey, lang);
    }
  } catch {
    // ignore
  }
}
