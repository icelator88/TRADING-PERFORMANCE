import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
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
import type {
  ActiveTab,
  GoogleSheetSource,
  Language,
  TradeCategory,
  TradeRecord,
} from '../types/trading';
import {
  normalizeOutcome,
  normalizeSetupName,
  roundTo,
  runRowCalculationEngine,
  todayIsoDate,
} from './calculations';
import { normalizeImportDate, normalizeImportTime } from './importer';

export interface CloudUserSettings {
  language: Language;
  activeTab: ActiveTab;
  selectedSetup: string;
  assetFilter: string;
  activePortfolioAssets?: string[] | null;
  customAssets?: string[];
}

const SETTINGS_DOC_ID = 'preferences';

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
    const email = (user.email || '').trim().slice(0, 200);
    const fallbackName = email ? email.split('@')[0] : 'Trader';
    const displayName = (user.displayName || fallbackName || 'Trader')
      .trim()
      .slice(0, 120);

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

function sanitizePortfolioAssets(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toUpperCase().slice(0, 32))
        .filter(Boolean),
    ),
  )
    .sort()
    .slice(0, 100);
  return cleaned;
}

function sanitizeSettingsPayload(
  settings: CloudUserSettings,
): CloudUserSettings {
  const language: Language =
    settings.language === 'en' || settings.language === 'es' ? settings.language : 'it';
  const activeTab: ActiveTab =
    settings.activeTab === 'backtest' ||
    settings.activeTab === 'live' ||
    settings.activeTab === 'missed'
      ? settings.activeTab
      : 'dashboard';
  const selectedSetup = (settings.selectedSetup || 'ALL').trim().slice(0, 40) || 'ALL';
  const assetFilter = (settings.assetFilter || 'ALL').trim().slice(0, 32) || 'ALL';
  const activePortfolioAssets =
    settings.activePortfolioAssets === null || settings.activePortfolioAssets === undefined
      ? null
      : sanitizePortfolioAssets(settings.activePortfolioAssets);
  const customAssets = sanitizePortfolioAssets(settings.customAssets) ?? [];

  return {
    language,
    activeTab,
    selectedSetup,
    assetFilter,
    activePortfolioAssets,
    customAssets,
  };
}

export function subscribeUserSettings(
  uid: string,
  onSettings: (settings: CloudUserSettings | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeId(uid, 'user');
  const docPath = `users/${safeUid}/settings/${SETTINGS_DOC_ID}`;
  const ref = doc(db, 'users', safeUid, 'settings', SETTINGS_DOC_ID);

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onSettings(null);
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      onSettings(
        sanitizeSettingsPayload({
          language: (data.language as Language) || 'it',
          activeTab: (data.activeTab as ActiveTab) || 'dashboard',
          selectedSetup: String(data.selectedSetup ?? 'ALL'),
          assetFilter: String(data.assetFilter ?? 'ALL'),
          activePortfolioAssets: sanitizePortfolioAssets(data.activePortfolioAssets),
          customAssets: sanitizePortfolioAssets(data.customAssets) ?? [],
        }),
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, docPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function saveUserSettingsInFirestore(
  uid: string,
  settings: CloudUserSettings,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const docPath = `users/${safeUid}/settings/${SETTINGS_DOC_ID}`;
  const ref = doc(db, 'users', safeUid, 'settings', SETTINGS_DOC_ID);
  const clean = sanitizeSettingsPayload(settings);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const createPayload: Record<string, unknown> = {
        id: SETTINGS_DOC_ID,
        ownerId: safeUid,
        language: clean.language,
        activeTab: clean.activeTab,
        selectedSetup: clean.selectedSetup,
        assetFilter: clean.assetFilter,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (Array.isArray(clean.activePortfolioAssets)) {
        createPayload.activePortfolioAssets = clean.activePortfolioAssets;
      }
      if (Array.isArray(clean.customAssets)) {
        createPayload.customAssets = clean.customAssets;
      }
      await setDoc(ref, createPayload);
    } else {
      const updatePayload: Record<string, unknown> = {
        language: clean.language,
        activeTab: clean.activeTab,
        selectedSetup: clean.selectedSetup,
        assetFilter: clean.assetFilter,
        customAssets: clean.customAssets ?? [],
        updatedAt: serverTimestamp(),
      };
      if (Array.isArray(clean.activePortfolioAssets)) {
        updatePayload.activePortfolioAssets = clean.activePortfolioAssets;
      } else {
        updatePayload.activePortfolioAssets = deleteField();
      }
      await updateDoc(ref, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
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
  const safeIsMissed = safeCategory === 'missed';
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

function docToTradeRecord(
  data: Record<string, unknown>,
  docId: string,
  forcedCategory?: TradeCategory,
): TradeRecord | null {
  const asset = String(data.asset ?? '').trim().toUpperCase();
  const date = String(data.date ?? '').trim();
  if (!asset || !date) return null;

  const parsedCategory: TradeCategory =
    data.category === 'backtest' || data.category === 'live' || data.category === 'missed'
      ? data.category
      : 'live';
  const category: TradeCategory = forcedCategory ?? parsedCategory;
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
    isMissed: category === 'missed',
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
    missedReason:
      category === 'missed' && typeof data.missedReason === 'string'
        ? data.missedReason
        : undefined,
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

export async function migrateLegacyMissedTradesFromTradesCollection(
  uid: string,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const tradesColPath = `users/${safeUid}/trades`;
  const legacyQuery = query(
    collection(db, 'users', safeUid, 'trades'),
    where('ownerId', '==', safeUid),
  );

  try {
    const legacySnapshot = await getDocs(legacyQuery);
    const legacyDocs: Array<{ docId: string; trade: TradeRecord }> = [];

    legacySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      if (data.category === 'missed') {
        const parsed = docToTradeRecord(data, docSnap.id, 'missed');
        if (parsed) {
          legacyDocs.push({ docId: docSnap.id, trade: parsed });
        }
      }
    });

    if (legacyDocs.length === 0) return;

    const existingMissedSnap = await getDocs(
      query(
        collection(db, 'users', safeUid, 'missedTrades'),
        where('ownerId', '==', safeUid),
      ),
    );
    const existingMissedIds = new Set<string>();
    existingMissedSnap.forEach((docSnap) => {
      existingMissedIds.add(docSnap.id);
    });

    const CHUNK_SIZE = 200;
    for (let i = 0; i < legacyDocs.length; i += CHUNK_SIZE) {
      const chunk = legacyDocs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(({ docId, trade }) => {
        const { safeId, payload } = buildTradePayload(
          { ...trade, category: 'missed', isMissed: true },
          safeUid,
          'create',
        );
        if (!existingMissedIds.has(safeId)) {
          const targetRef = doc(db, 'users', safeUid, 'missedTrades', safeId);
          batch.set(targetRef, payload);
          existingMissedIds.add(safeId);
        }
        const legacyRef = doc(db, 'users', safeUid, 'trades', docId);
        batch.delete(legacyRef);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, tradesColPath);
  }
}

export async function fetchUserTradesFromFirestore(
  uid: string,
): Promise<TradeRecord[]> {
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/trades`;
  const q = query(
    collection(db, 'users', safeUid, 'trades'),
    where('ownerId', '==', safeUid),
  );

  try {
    const snapshot = await getDocs(q);
    const list: TradeRecord[] = [];
    snapshot.forEach((docSnap) => {
      const parsed = docToTradeRecord(
        docSnap.data() as Record<string, unknown>,
        docSnap.id,
      );
      if (parsed && (parsed.category === 'backtest' || parsed.category === 'live')) {
        list.push(parsed);
      }
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
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
        if (parsed && (parsed.category === 'backtest' || parsed.category === 'live')) {
          list.push(parsed);
        }
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
  if (trade.category === 'missed') {
    throw new Error('Missed trades must be saved in the missedTrades collection.');
  }
  const safeUid = sanitizeId(uid, 'user');
  const mode = isExistingInCloud ? 'update' : 'create';
  const { safeId, payload } = buildTradePayload(
    { ...trade, isMissed: false, missedReason: undefined },
    safeUid,
    mode,
  );
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
  const validTrades = trades.filter(
    (tr) => tr.category === 'backtest' || tr.category === 'live',
  );
  if (validTrades.length === 0) return;
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/trades`;

  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < validTrades.length; i += CHUNK_SIZE) {
      const chunk = validTrades.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((tr) => {
        const { safeId, payload } = buildTradePayload(
          { ...tr, isMissed: false, missedReason: undefined },
          safeUid,
          'create',
        );
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

export async function batchDeleteTradesInFirestore(
  uid: string,
  tradeIds: string[],
): Promise<void> {
  if (tradeIds.length === 0) return;
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/trades`;

  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < tradeIds.length; i += CHUNK_SIZE) {
      const chunk = tradeIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((rawId) => {
        const safeId = sanitizeId(rawId, 'tr');
        const ref = doc(db, 'users', safeUid, 'trades', safeId);
        batch.delete(ref);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, colPath);
  }
}

export async function fetchUserMissedTradesFromFirestore(
  uid: string,
): Promise<TradeRecord[]> {
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/missedTrades`;
  const q = query(
    collection(db, 'users', safeUid, 'missedTrades'),
    where('ownerId', '==', safeUid),
  );

  try {
    const snapshot = await getDocs(q);
    const list: TradeRecord[] = [];
    snapshot.forEach((docSnap) => {
      const parsed = docToTradeRecord(
        docSnap.data() as Record<string, unknown>,
        docSnap.id,
        'missed',
      );
      if (parsed) list.push(parsed);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export function subscribeUserMissedTrades(
  uid: string,
  onMissedTrades: (trades: TradeRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/missedTrades`;
  const q = query(
    collection(db, 'users', safeUid, 'missedTrades'),
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
          'missed',
        );
        if (parsed) list.push(parsed);
      });
      onMissedTrades(list);
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

export async function upsertMissedTradeInFirestore(
  uid: string,
  trade: TradeRecord,
  isExistingInCloud: boolean,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const mode = isExistingInCloud ? 'update' : 'create';
  const { safeId, payload } = buildTradePayload(
    { ...trade, category: 'missed', isMissed: true },
    safeUid,
    mode,
  );
  const docPath = `users/${safeUid}/missedTrades/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'missedTrades', safeId);

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

export async function batchCreateMissedTradesInFirestore(
  uid: string,
  trades: TradeRecord[],
): Promise<void> {
  if (trades.length === 0) return;
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/missedTrades`;

  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < trades.length; i += CHUNK_SIZE) {
      const chunk = trades.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((tr) => {
        const { safeId, payload } = buildTradePayload(
          { ...tr, category: 'missed', isMissed: true },
          safeUid,
          'create',
        );
        const ref = doc(db, 'users', safeUid, 'missedTrades', safeId);
        batch.set(ref, payload);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, colPath);
  }
}

export async function deleteMissedTradeInFirestore(
  uid: string,
  tradeId: string,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(tradeId, 'mi');
  const docPath = `users/${safeUid}/missedTrades/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'missedTrades', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function batchDeleteMissedTradesInFirestore(
  uid: string,
  tradeIds: string[],
): Promise<void> {
  if (tradeIds.length === 0) return;
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/missedTrades`;

  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < tradeIds.length; i += CHUNK_SIZE) {
      const chunk = tradeIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((rawId) => {
        const safeId = sanitizeId(rawId, 'mi');
        const ref = doc(db, 'users', safeUid, 'missedTrades', safeId);
        batch.delete(ref);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, colPath);
  }
}

function docToGoogleSheetSource(
  data: Record<string, unknown>,
  docId: string,
): GoogleSheetSource | null {
  const asset = String(data.asset ?? '').trim().toUpperCase();
  const sheetUrl = String(data.sheetUrl ?? '').trim();
  const spreadsheetId = String(data.spreadsheetId ?? '').trim();
  if (!asset || !sheetUrl || !spreadsheetId) return null;

  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    asset,
    sheetUrl,
    spreadsheetId,
    category:
      data.category === 'live'
        ? 'live'
        : data.category === 'missed'
          ? 'missed'
          : 'backtest',
    lastSyncedAt:
      typeof data.lastSyncedAt === 'number' && Number.isFinite(data.lastSyncedAt)
        ? data.lastSyncedAt
        : undefined,
    lastSyncSummary:
      typeof data.lastSyncSummary === 'string' && data.lastSyncSummary
        ? data.lastSyncSummary
        : undefined,
    createdAt:
      typeof data.clientCreatedAt === 'number' && Number.isFinite(data.clientCreatedAt)
        ? data.clientCreatedAt
        : Date.now(),
  };
}

export function subscribeUserGoogleSheets(
  uid: string,
  onSources: (sources: GoogleSheetSource[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeId(uid, 'user');
  const colPath = `users/${safeUid}/googleSheets`;
  const q = query(
    collection(db, 'users', safeUid, 'googleSheets'),
    where('ownerId', '==', safeUid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: GoogleSheetSource[] = [];
      snapshot.forEach((docSnap) => {
        const parsed = docToGoogleSheetSource(
          docSnap.data() as Record<string, unknown>,
          docSnap.id,
        );
        if (parsed) list.push(parsed);
      });
      list.sort((a, b) => a.createdAt - b.createdAt);
      onSources(list);
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

export async function saveGoogleSheetSourceInFirestore(
  uid: string,
  source: GoogleSheetSource,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(source.id, 'gs');
  const docPath = `users/${safeUid}/googleSheets/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'googleSheets', safeId);

  const safeAsset = (source.asset.trim().toUpperCase() || 'ASSET').slice(0, 32);
  const safeSpreadsheetId = source.spreadsheetId
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 128);
  const safeUrl = source.sheetUrl.trim().slice(0, 500);
  const safeCategory: 'backtest' | 'live' | 'missed' =
    source.category === 'live'
      ? 'live'
      : source.category === 'missed'
        ? 'missed'
        : 'backtest';

  try {
    await setDoc(ref, {
      id: safeId,
      ownerId: safeUid,
      asset: safeAsset,
      sheetUrl: safeUrl,
      spreadsheetId: safeSpreadsheetId,
      category: safeCategory,
      clientCreatedAt:
        typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
          ? source.createdAt
          : Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateGoogleSheetSyncStatusInFirestore(
  uid: string,
  sourceId: string,
  lastSyncedAt: number,
  lastSyncSummary: string,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(sourceId, 'gs');
  const docPath = `users/${safeUid}/googleSheets/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'googleSheets', safeId);

  try {
    await updateDoc(ref, {
      lastSyncedAt: Math.max(0, Math.floor(lastSyncedAt)),
      lastSyncSummary: lastSyncSummary.trim().slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteGoogleSheetSourceInFirestore(
  uid: string,
  sourceId: string,
): Promise<void> {
  const safeUid = sanitizeId(uid, 'user');
  const safeId = sanitizeId(sourceId, 'gs');
  const docPath = `users/${safeUid}/googleSheets/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'googleSheets', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
