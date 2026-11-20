import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { TradeCategory, TradeRecord } from '../types/trading';
import {
  normalizeOutcome,
  normalizeSetupName,
  roundTo,
  runRowCalculationEngine,
  todayIsoDate,
} from './calculations';
import { normalizeImportDate, normalizeImportTime } from './importer';

function sanitizeId(rawId: string, fallbackPrefix = 'tr'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now().toString(36)}`;
}

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(min, Math.min(max, val));
}

export async function ensureUserProfile(user: User): Promise<void> {
  const safeUid = sanitizeId(user.uid, 'user');
  const path = `users/${safeUid}`;
  const ref = doc(db, 'users', safeUid);

  try {
    const snap = await getDoc(ref);
    const displayName = (user.displayName || 'Trader').trim().slice(0, 120);
    const email = (user.email || '').trim().slice(0, 200);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: safeUid,
        displayName,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      if (data.displayName !== displayName || data.email !== email) {
        await updateDoc(ref, {
          displayName,
          email,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function buildSanitizedExtraColumns(
  extra?: Record<string, string>,
): Record<string, string> | undefined {
  if (!extra || typeof extra !== 'object') return undefined;
  const entries = Object.entries(extra)
    .filter(([k, v]) => k.trim().length > 0 && typeof v === 'string' && v.trim().length > 0)
    .slice(0, 20);
  if (entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  entries.forEach(([k, v]) => {
    out[k.trim().slice(0, 40)] = v.trim().slice(0, 200);
  });
  return out;
}

function buildTradePayload(
  trade: TradeRecord,
  uid: string,
  mode: 'create' | 'update',
): { safeId: string; payload: Record<string, unknown> } {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(trade.id, trade.category.slice(0, 2));
  const normalizedDate = normalizeImportDate(trade.date);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
    ? normalizedDate
    : todayIsoDate();
  const safeSetup = normalizeSetupName(trade.setup || trade.strategy);
  const safeCategory: TradeCategory =
    trade.category === 'backtest' || trade.category === 'live' || trade.category === 'missed'
      ? trade.category
      : 'live';
  const safeBias = trade.bias === 'SHORT' ? 'SHORT' : 'LONG';
  const safeOutcome = normalizeOutcome(trade.outcome);
  const safeRiskPct = clampNumber(roundTo(trade.riskPct, 2), 0, 100);
  const safeNetR = clampNumber(roundTo(trade.netR, 2), -1000, 10000);
  const safeNetReturnPct = clampNumber(
    roundTo(
      Number.isFinite(trade.netReturnPct)
        ? trade.netReturnPct
        : safeNetR * safeRiskPct,
      2,
    ),
    -10000,
    100000,
  );
  const safeIsMissed = Boolean(trade.isMissed || safeCategory === 'missed');
  const safeNotes = String(trade.notes ?? '').slice(0, 2000);
  const safeLink = String(trade.tradingViewUrl ?? '').trim().slice(0, 500);
  const safeAsset = (String(trade.asset ?? '').trim().toUpperCase() || 'ASSET').slice(0, 32);

  const payload: Record<string, unknown> = {
    category: safeCategory,
    date: safeDate,
    asset: safeAsset,
    setup: safeSetup,
    strategy: safeSetup,
    isMissed: safeIsMissed,
    bias: safeBias,
    riskPct: safeRiskPct,
    outcome: safeOutcome,
    netR: safeNetR,
    netReturnPct: safeNetReturnPct,
    notes: safeNotes,
    tradingViewUrl: safeLink,
    updatedAt: serverTimestamp(),
  };

  if (mode === 'create') {
    payload.id = safeId;
    payload.ownerId = safeUid;
    payload.clientCreatedAt =
      typeof trade.createdAt === 'number' && Number.isFinite(trade.createdAt) && trade.createdAt >= 0
        ? trade.createdAt
        : Date.now();
    payload.createdAt = serverTimestamp();
  }

  const assignOptionalStr = (key: string, val: string | undefined, maxLen: number) => {
    const trimmed = String(val ?? '').trim().slice(0, maxLen);
    if (trimmed) {
      payload[key] = trimmed;
    } else if (mode === 'update') {
      payload[key] = deleteField();
    }
  };

  const assignOptionalNum = (
    key: string,
    val: number | null | undefined,
    minVal: number,
    maxVal: number,
  ) => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      payload[key] = clampNumber(val, minVal, maxVal);
    } else if (mode === 'update') {
      payload[key] = deleteField();
    }
  };

  assignOptionalStr('day', trade.day, 32);
  assignOptionalStr('session', trade.session, 40);
  assignOptionalStr(
    'entryTime',
    trade.entryTime ? normalizeImportTime(trade.entryTime) : undefined,
    20,
  );
  assignOptionalStr(
    'exitTime',
    trade.exitTime ? normalizeImportTime(trade.exitTime) : undefined,
    20,
  );
  assignOptionalStr(
    'missedReason',
    safeCategory === 'missed' ? trade.missedReason : undefined,
    80,
  );

  assignOptionalNum('entryPrice', trade.entryPrice, 0, 100000000);
  assignOptionalNum('slPrice', trade.slPrice, 0, 100000000);
  assignOptionalNum('tpPrice', trade.tpPrice, 0, 100000000);
  assignOptionalNum('slPips', trade.slPips, 0, 1000000);
  assignOptionalNum('tpPips', trade.tpPips, 0, 1000000);
  assignOptionalNum('targetRR', trade.targetRR, -1000, 10000);
  assignOptionalNum('rrMax', trade.rrMax, -1000, 10000);

  const extra = buildSanitizedExtraColumns(trade.extraColumns);
  if (extra) {
    payload.extraColumns = extra;
  } else if (mode === 'update') {
    payload.extraColumns = deleteField();
  }

  return { safeId, payload };
}

function docToTradeRecord(data: Record<string, unknown>, docId: string): TradeRecord | null {
  const asset = String(data.asset ?? '').trim().toUpperCase();
  const date = String(data.date ?? '').trim();
  if (!asset || !date) return null;

  const category: TradeCategory =
    data.category === 'backtest' || data.category === 'live' || data.category === 'missed'
      ? data.category
      : 'live';
  const setup = normalizeSetupName(String(data.setup ?? data.strategy ?? 'S1'));

  const base: TradeRecord = {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    category,
    date,
    day: typeof data.day === 'string' ? data.day : undefined,
    session: typeof data.session === 'string' ? data.session : undefined,
    entryTime: typeof data.entryTime === 'string' ? data.entryTime : undefined,
    exitTime: typeof data.exitTime === 'string' ? data.exitTime : undefined,
    asset,
    setup,
    strategy: setup,
    isMissed: Boolean(data.isMissed || category === 'missed'),
    bias: data.bias === 'SHORT' ? 'SHORT' : 'LONG',
    riskPct: typeof data.riskPct === 'number' ? data.riskPct : 1,
    entryPrice: typeof data.entryPrice === 'number' ? data.entryPrice : null,
    slPrice: typeof data.slPrice === 'number' ? data.slPrice : null,
    tpPrice: typeof data.tpPrice === 'number' ? data.tpPrice : null,
    slPips: typeof data.slPips === 'number' ? data.slPips : null,
    tpPips: typeof data.tpPips === 'number' ? data.tpPips : null,
    targetRR: typeof data.targetRR === 'number' ? data.targetRR : null,
    outcome: normalizeOutcome(String(data.outcome ?? 'BE')),
    netR: typeof data.netR === 'number' ? roundTo(data.netR, 2) : 0,
    rrMax: typeof data.rrMax === 'number' ? data.rrMax : null,
    netReturnPct: typeof data.netReturnPct === 'number' ? roundTo(data.netReturnPct, 2) : 0,
    missedReason: typeof data.missedReason === 'string' ? data.missedReason : undefined,
    notes: typeof data.notes === 'string' ? data.notes : '',
    tradingViewUrl: typeof data.tradingViewUrl === 'string' ? data.tradingViewUrl : '',
    extraColumns:
      data.extraColumns && typeof data.extraColumns === 'object' && !Array.isArray(data.extraColumns)
        ? (data.extraColumns as Record<string, string>)
        : undefined,
    createdAt:
      typeof data.clientCreatedAt === 'number'
        ? data.clientCreatedAt
        : Date.now(),
  };

  return runRowCalculationEngine(base);
}

export function subscribeUserTrades(
  uid: string,
  onTrades: (trades: TradeRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/trades`;
  const q = query(
    collection(db, 'users', safeUid, 'trades'),
    where('ownerId', '==', safeUid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: TradeRecord[] = [];
      snapshot.forEach((docSnap) => {
        const parsed = docToTradeRecord(
          docSnap.data() as Record<string, unknown>,
          docSnap.id,
        );
        if (parsed) list.push(parsed);
      });
      onTrades(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function upsertTradeInFirestore(
  uid: string,
  trade: TradeRecord,
  isExistingInCloud: boolean,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const mode = isExistingInCloud ? 'update' : 'create';
  const { safeId, payload } = buildTradePayload(trade, safeUid, mode);
  const docPath = `users/${safeUid}/trades/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'trades', safeId);

  try {
    if (isExistingInCloud) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      isExistingInCloud ? OperationType.UPDATE : OperationType.CREATE,
      docPath,
    );
  }
}

export async function batchCreateTradesInFirestore(
  uid: string,
  trades: TradeRecord[],
): Promise<void> {
  if (trades.length === 0) return;
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/trades`;

  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < trades.length; i += CHUNK_SIZE) {
      const chunk = trades.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((tr) => {
        const { safeId, payload } = buildTradePayload(tr, safeUid, 'create');
        const ref = doc(db, 'users', safeUid, 'trades', safeId);
        batch.set(ref, payload);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, colPath);
  }
}

export async function deleteTradeInFirestore(
  uid: string,
  tradeId: string,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(tradeId, 'tr');
  const docPath = `users/${safeUid}/trades/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'trades', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
