import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Download,
  FileJson,
  LogOut,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AkinatorCard } from './components/AkinatorCard';
import { ConfirmModal } from './components/ConfirmModal';
import { DrawdownChart } from './components/DrawdownChart';
import { EquityChart } from './components/EquityChart';
import { GeminiModal } from './components/GeminiModal';
import { ImportModal } from './components/ImportModal';
import { InstitutionalMetricsPanel } from './components/InstitutionalMetricsPanel';
import { LoginScreen } from './components/LoginScreen';
import { SetupFilterBar } from './components/SetupFilterBar';
import { TradeModal } from './components/TradeModal';
import { TradeTable } from './components/TradeTable';
import { auth, signOutFirebase } from './firebase';
import { TRANSLATIONS } from './i18n/translations';
import {
  type ActiveTab,
  type Language,
  MISSED_REASONS,
  type TradeCategory,
  type TradeRecord,
} from './types/trading';
import {
  calculateAkinatorBacktestScan,
  calculateMissedStats,
  calculatePerformanceStats,
  formatPct,
  formatR,
  generateTradeId,
  roundTo,
  runRowCalculationEngine,
} from './utils/calculations';
import {
  batchCreateTradesInFirestore,
  type CloudUserSettings,
  deleteTradeInFirestore,
  ensureUserProfile,
  saveUserSettingsInFirestore,
  subscribeUserSettings,
  subscribeUserTrades,
  upsertTradeInFirestore,
} from './utils/firestoreSync';
import { analizzaTradeConGemini, buildGeminiReviewPrompt } from './utils/geminiReview';
import {
  buildTradeDuplicateKey,
  deduplicateImportedTrades,
  exportBackupJson,
  exportTradesCsv,
  parseBackupJsonContent,
} from './utils/importer';
import {
  loadAllTradesSafely,
  loadLanguagePreference,
  saveLanguagePreference,
  saveTradesSafely,
} from './utils/storage';

const LAST_UID_STORAGE_KEY = 'diariotrade_last_uid_v1';

export function App() {
  const [lang, setLang] = useState<Language>(() => loadLanguagePreference());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedSetup, setSelectedSetup] = useState<string>('ALL');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');

  const [backtestTrades, setBacktestTrades] = useState<TradeRecord[]>([]);
  const [liveTrades, setLiveTrades] = useState<TradeRecord[]>([]);
  const [missedTrades, setMissedTrades] = useState<TradeRecord[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');

  // Modals
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeModalCategory, setTradeModalCategory] =
    useState<TradeCategory>('live');
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importCategory, setImportCategory] =
    useState<TradeCategory>('backtest');

  const [deleteTarget, setDeleteTarget] = useState<TradeRecord | null>(null);
  const [clearStorageConfirmOpen, setClearStorageConfirmOpen] = useState(false);

  const [geminiState, setGeminiState] = useState({
    isOpen: false,
    loading: false,
    serverSuccess: false,
    responseText: '',
    promptText: '',
  });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Firebase Auth & Firestore Cloud Sync
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const cloudIdsRef = useRef<Set<string>>(new Set());
  const initialSyncDoneRef = useRef<boolean>(false);
  const settingsRef = useRef<CloudUserSettings>({
    language: lang,
    activeTab,
    selectedSetup,
    assetFilter,
  });

  useEffect(() => {
    settingsRef.current = {
      language: lang,
      activeTab,
      selectedSetup,
      assetFilter,
    };
  }, [lang, activeTab, selectedSetup, assetFilter]);

  if (fatalError) {
    throw fatalError;
  }

  const t = TRANSLATIONS[lang];

  const syncSettingsPatch = (patch: Partial<CloudUserSettings>) => {
    const nextSettings: CloudUserSettings = {
      ...settingsRef.current,
      ...patch,
    };
    settingsRef.current = nextSettings;
    if (firebaseUser) {
      void saveUserSettingsInFirestore(firebaseUser.uid, nextSettings).catch((err) => {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleLanguageChange = (nextLang: Language) => {
    setLang(nextLang);
    saveLanguagePreference(nextLang);
    syncSettingsPatch({ language: nextLang });
  };

  const handleTabChange = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    syncSettingsPatch({ activeTab: nextTab });
  };

  const handleSetupChange = (nextSetup: string) => {
    setSelectedSetup(nextSetup);
    syncSettingsPatch({ selectedSetup: nextSetup });
  };

  const handleAssetFilterChange = (nextAsset: string) => {
    setAssetFilter(nextAsset);
    syncSettingsPatch({ assetFilter: nextAsset });
  };

  const showToast = (msg: string, duration = 4500) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, duration);
  };

  const splitTradesByCategory = (all: TradeRecord[]) => {
    const bt: TradeRecord[] = [];
    const lv: TradeRecord[] = [];
    const ms: TradeRecord[] = [];
    all.forEach((tr) => {
      if (tr.category === 'backtest') bt.push(tr);
      else if (tr.category === 'missed') ms.push(tr);
      else lv.push(tr);
    });
    return { bt, lv, ms };
  };

  useEffect(() => {
    let active = true;
    let unsubTrades: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubTrades?.();
      unsubTrades = null;
      unsubSettings?.();
      unsubSettings = null;

      if (!active) return;

      if (!user) {
        initialSyncDoneRef.current = false;
        cloudIdsRef.current.clear();
        setBacktestTrades([]);
        setLiveTrades([]);
        setMissedTrades([]);
        setFirebaseUser(null);
        setCloudSyncStatus('idle');
        setAuthReady(true);
        return;
      }

      setFirebaseUser(user);
      setAuthReady(true);
      setCloudSyncStatus('syncing');
      initialSyncDoneRef.current = false;

      try {
        await ensureUserProfile(user);
      } catch (err) {
        if (active) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }

      if (!active) return;

      let settingsInitialized = false;
      unsubSettings = subscribeUserSettings(
        user.uid,
        async (cloudSettings) => {
          if (!active) return;
          if (!cloudSettings) {
            if (!settingsInitialized) {
              settingsInitialized = true;
              try {
                await saveUserSettingsInFirestore(user.uid, settingsRef.current);
              } catch (err) {
                if (active) {
                  setFatalError(err instanceof Error ? err : new Error(String(err)));
                }
              }
            }
            return;
          }
          settingsInitialized = true;
          settingsRef.current = cloudSettings;
          setLang(cloudSettings.language);
          saveLanguagePreference(cloudSettings.language);
          setActiveTab(cloudSettings.activeTab);
          setSelectedSetup(cloudSettings.selectedSetup);
          setAssetFilter(cloudSettings.assetFilter);
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );

      unsubTrades = subscribeUserTrades(
        user.uid,
        async (cloudTrades) => {
          if (!active) return;

          const nextCloudIds = new Set(cloudTrades.map((tr) => tr.id));

          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true;

            let previousUid: string | null = null;
            try {
              previousUid = localStorage.getItem(LAST_UID_STORAGE_KEY);
              localStorage.setItem(LAST_UID_STORAGE_KEY, user.uid);
            } catch {
              previousUid = null;
            }

            const canMigrateLocal = !previousUid || previousUid === user.uid;
            const localLoaded = canMigrateLocal
              ? loadAllTradesSafely()
              : { backtest: [], live: [], missed: [] };
            const localAll = [
              ...localLoaded.backtest,
              ...localLoaded.live,
              ...localLoaded.missed,
            ];

            const cloudDupKeys = new Set(
              cloudTrades.map((tr) => `${tr.category}|${buildTradeDuplicateKey(tr)}`),
            );
            const seenLocalIds = new Set<string>();
            const localOnlyTrades: TradeRecord[] = [];

            localAll.forEach((tr) => {
              const catKey = `${tr.category}|${buildTradeDuplicateKey(tr)}`;
              if (
                !nextCloudIds.has(tr.id) &&
                !cloudDupKeys.has(catKey) &&
                !seenLocalIds.has(tr.id)
              ) {
                seenLocalIds.add(tr.id);
                cloudDupKeys.add(catKey);
                localOnlyTrades.push(tr);
              }
            });

            if (localOnlyTrades.length > 0) {
              localOnlyTrades.forEach((tr) => nextCloudIds.add(tr.id));
              cloudIdsRef.current = nextCloudIds;

              const merged = [...cloudTrades, ...localOnlyTrades];
              const { bt, lv, ms } = splitTradesByCategory(merged);
              setBacktestTrades(bt);
              setLiveTrades(lv);
              setMissedTrades(ms);
              saveTradesSafely('backtest', bt);
              saveTradesSafely('live', lv);
              saveTradesSafely('missed', ms);

              try {
                await batchCreateTradesInFirestore(user.uid, localOnlyTrades);
                if (active) setCloudSyncStatus('synced');
              } catch (err) {
                if (active) {
                  setFatalError(err instanceof Error ? err : new Error(String(err)));
                }
              }
              return;
            }
          }

          cloudIdsRef.current = nextCloudIds;
          const { bt, lv, ms } = splitTradesByCategory(cloudTrades);
          setBacktestTrades(bt);
          setLiveTrades(lv);
          setMissedTrades(ms);
          saveTradesSafely('backtest', bt);
          saveTradesSafely('live', lv);
          saveTradesSafely('missed', ms);
          setCloudSyncStatus('synced');
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );
    });

    return () => {
      active = false;
      unsubTrades?.();
      unsubSettings?.();
      unsubAuth();
    };
  }, []);

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebase();
      setTradeModalOpen(false);
      setImportModalOpen(false);
      setDeleteTarget(null);
      setClearStorageConfirmOpen(false);
      setGeminiState((prev) => ({ ...prev, isOpen: false }));
    } catch {
      showToast(
        lang === 'en' ? 'Logout failed.' : 'Errore durante il logout.',
      );
    } finally {
      setAuthBusy(false);
    }
  };

  // Strict 5-strategy whitelist across all tabs and filters
  const customSetups = useMemo(() => {
    return ['S1', 'SSA', 'MUT', 'SBIL DOMINANCE REALE', 'SBIL INTRADOMINANCE'];
  }, []);

  const availableAssets = useMemo(() => {
    const all = [...backtestTrades, ...liveTrades, ...missedTrades];
    return Array.from(
      new Set(all.map((tr) => tr.asset.trim().toUpperCase()).filter(Boolean)),
    ).sort();
  }, [backtestTrades, liveTrades, missedTrades]);

  const filterBySetupAndAsset = (list: TradeRecord[]) => {
    return list.filter((tr) => {
      if (selectedSetup !== 'ALL') {
        const targetLower = selectedSetup.trim().toLowerCase();
        const s = (tr.setup || tr.strategy || '').trim().toLowerCase();
        if (s !== targetLower) return false;
      }
      if (assetFilter !== 'ALL') {
        if (tr.asset.trim().toUpperCase() !== assetFilter) return false;
      }
      return true;
    });
  };

  const filteredBacktest = useMemo(
    () => filterBySetupAndAsset(backtestTrades),
    [backtestTrades, selectedSetup, assetFilter],
  );
  const filteredLive = useMemo(
    () =>
      filterBySetupAndAsset(liveTrades).filter(
        (tr) =>
          tr.category === 'live' &&
          tr.outcome !== 'UNFILLED' &&
          !tr.isMissed &&
          !(tr.notes ?? '').toUpperCase().includes('NON PRESO'),
      ),
    [liveTrades, selectedSetup, assetFilter],
  );
  const filteredMissed = useMemo(
    () => filterBySetupAndAsset(missedTrades),
    [missedTrades, selectedSetup, assetFilter],
  );

  // Statistics Engines
  // Akinator strictly scans ONLY Backtest trades (excludes Live Journaling & Missed Trades)
  const akinatorScan = useMemo(
    () => calculateAkinatorBacktestScan(filteredBacktest),
    [filteredBacktest],
  );

  const backtestStats = useMemo(
    () => calculatePerformanceStats(filteredBacktest),
    [filteredBacktest],
  );

  // Live Journaling stats strictly calculate ONLY executed live trades (zero NON PRESO / missed trades)
  const liveStats = useMemo(
    () => calculatePerformanceStats(filteredLive),
    [filteredLive],
  );

  const missedStats = useMemo(
    () => calculateMissedStats(filteredLive, filteredMissed),
    [filteredLive, filteredMissed],
  );

  const applySearchAndSubFilters = (
    list: TradeRecord[],
    mode: 'backtest' | 'live' | 'missed',
  ) => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((tr) => {
      if (mode !== 'missed' && outcomeFilter !== 'ALL' && tr.outcome !== outcomeFilter) {
        return false;
      }
      if (mode === 'missed' && reasonFilter !== 'ALL' && tr.missedReason !== reasonFilter) {
        return false;
      }
      if (q) {
        const hay = `${tr.asset} ${tr.setup} ${tr.notes ?? ''} ${tr.missedReason ?? ''} ${tr.bias}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  // Safe state + storage updaters
  const handleSaveTrade = (
    saved: TradeRecord,
    previousCategory?: TradeCategory,
  ) => {
    let nextBt = backtestTrades;
    let nextLive = liveTrades;
    let nextMissed = missedTrades;

    if (previousCategory && previousCategory !== saved.category) {
      if (previousCategory === 'backtest') {
        nextBt = backtestTrades.filter((x) => x.id !== saved.id);
        saveTradesSafely('backtest', nextBt);
      } else if (previousCategory === 'live') {
        nextLive = liveTrades.filter((x) => x.id !== saved.id);
        saveTradesSafely('live', nextLive);
      } else {
        nextMissed = missedTrades.filter((x) => x.id !== saved.id);
        saveTradesSafely('missed', nextMissed);
      }
    }

    const upsert = (arr: TradeRecord[]) => {
      const exists = arr.some((x) => x.id === saved.id);
      return exists ? arr.map((x) => (x.id === saved.id ? saved : x)) : [...arr, saved];
    };

    if (saved.category === 'backtest') {
      nextBt = upsert(nextBt);
      saveTradesSafely('backtest', nextBt);
    } else if (saved.category === 'live') {
      nextLive = upsert(nextLive);
      saveTradesSafely('live', nextLive);
    } else {
      nextMissed = upsert(nextMissed);
      saveTradesSafely('missed', nextMissed);
    }

    setBacktestTrades(nextBt);
    setLiveTrades(nextLive);
    setMissedTrades(nextMissed);

    if (firebaseUser) {
      const isExistingInCloud = cloudIdsRef.current.has(saved.id);
      cloudIdsRef.current.add(saved.id);
      void upsertTradeInFirestore(firebaseUser.uid, saved, isExistingInCloud).catch(
        (err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }

    showToast(`${saved.asset} (${saved.setup}) — ${formatR(saved.netR)}`);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const targetToDelete = deleteTarget;
    if (targetToDelete.category === 'backtest') {
      const next = backtestTrades.filter((x) => x.id !== targetToDelete.id);
      setBacktestTrades(next);
      saveTradesSafely('backtest', next);
    } else if (targetToDelete.category === 'live') {
      const next = liveTrades.filter((x) => x.id !== targetToDelete.id);
      setLiveTrades(next);
      saveTradesSafely('live', next);
    } else {
      const next = missedTrades.filter((x) => x.id !== targetToDelete.id);
      setMissedTrades(next);
      saveTradesSafely('missed', next);
    }
    setDeleteTarget(null);

    if (firebaseUser) {
      cloudIdsRef.current.delete(targetToDelete.id);
      void deleteTradeInFirestore(firebaseUser.uid, targetToDelete.id).catch(
        (err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }
  };

  const handleImportTrades = (imported: TradeRecord[]) => {
    const existingPool =
      importCategory === 'backtest'
        ? backtestTrades
        : [...liveTrades, ...missedTrades];

    const { addedTrades, skippedDuplicates } = deduplicateImportedTrades(
      existingPool,
      imported,
    );

    const missedIncoming = addedTrades.filter((tr) => tr.category === 'missed');
    const primaryIncoming = addedTrades.filter((tr) => tr.category !== 'missed');
    const tradesToSyncCloud: TradeRecord[] = [];

    if (primaryIncoming.length > 0) {
      if (importCategory === 'backtest') {
        const next = [...backtestTrades, ...primaryIncoming];
        setBacktestTrades(next);
        saveTradesSafely('backtest', next);
        tradesToSyncCloud.push(...primaryIncoming);
      } else if (importCategory === 'live') {
        const next = [...liveTrades, ...primaryIncoming];
        setLiveTrades(next);
        saveTradesSafely('live', next);
        tradesToSyncCloud.push(...primaryIncoming);
      } else {
        const normalizedMissed = primaryIncoming.map((t) => ({
          ...t,
          category: 'missed' as const,
          isMissed: true,
        }));
        const next = [...missedTrades, ...normalizedMissed];
        setMissedTrades(next);
        saveTradesSafely('missed', next);
        tradesToSyncCloud.push(...normalizedMissed);
      }
    }

    if (missedIncoming.length > 0 && importCategory !== 'missed') {
      const nextMissed = [...missedTrades, ...missedIncoming];
      setMissedTrades(nextMissed);
      saveTradesSafely('missed', nextMissed);
      tradesToSyncCloud.push(...missedIncoming);
    }

    if (firebaseUser && tradesToSyncCloud.length > 0) {
      tradesToSyncCloud.forEach((tr) => cloudIdsRef.current.add(tr.id));
      void batchCreateTradesInFirestore(firebaseUser.uid, tradesToSyncCloud).catch(
        (err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }

    const perStrategy: Record<string, number> = {};
    let totalNetR = 0;
    addedTrades.forEach((tr) => {
      const key = tr.setup || tr.strategy || 'S1';
      perStrategy[key] = (perStrategy[key] ?? 0) + 1;
      totalNetR += Number.isFinite(tr.netR) ? tr.netR : 0;
    });
    const breakdown = Object.entries(perStrategy)
      .map(([strategy, count]) => `${strategy} (${count})`)
      .join(', ');

    const taggedBacktestMissed = addedTrades.filter(
      (tr) => tr.category === 'backtest' && tr.isMissed,
    ).length;
    const totalTaggedMissed = missedIncoming.length + taggedBacktestMissed;
    const missedNote =
      totalTaggedMissed > 0
        ? ` · ${totalTaggedMissed} UNFILLED/NON PRESO`
        : '';

    const roundedR = roundTo(totalNetR, 2);
    const formattedTotalR = `${roundedR > 0 ? '+' : ''}${Number.isInteger(roundedR) ? roundedR : roundedR.toFixed(2)} R`;

    const baseSummary =
      lang === 'en'
        ? `Import completed: ${addedTrades.length} new trades added, ${skippedDuplicates} duplicates skipped`
        : lang === 'es'
          ? `Importación completada: ${addedTrades.length} nuevos trades añadidos, ${skippedDuplicates} duplicados omitidos`
          : `Importazione completata: ${addedTrades.length} nuovi trade aggiunti, ${skippedDuplicates} duplicati saltati`;

    const details =
      addedTrades.length > 0
        ? ` | Totale: ${formattedTotalR} (${breakdown})${missedNote}`
        : '';

    showToast(`${baseSummary}${details}`, 9000);
  };

  const loadDemoTrades = (target: TradeCategory) => {
    const today = new Date();
    const offsetIso = (daysAgo: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    if (target === 'backtest') {
      const samples: TradeRecord[] = [
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(28),
          asset: 'CAD/CHF',
          setup: 'S1',
          strategy: 'S1',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 0.642,
          slPrice: 0.6405,
          tpPrice: 0.6465,
          outcome: 'STOP LOSS',
          netR: -3.0,
          netReturnPct: -3.0,
          notes: 'Drawdown backtest settimana 1',
          createdAt: Date.now() + 1,
        }),
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(28),
          asset: 'CHF/JPY',
          setup: 'S1',
          strategy: 'S1',
          bias: 'SHORT',
          riskPct: 1,
          entryPrice: 171.4,
          slPrice: 171.65,
          tpPrice: 170.65,
          outcome: 'STOP LOSS',
          netR: -3.0,
          netReturnPct: -3.0,
          notes: 'Drawdown backtest settimana 1',
          createdAt: Date.now() + 2,
        }),
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(21),
          asset: 'CAD/CHF',
          setup: 'SSA',
          strategy: 'SSA',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 0.641,
          slPrice: 0.6395,
          tpPrice: 0.6455,
          outcome: 'STOP LOSS',
          netR: -3.0,
          netReturnPct: -3.0,
          notes: 'Drawdown backtest settimana 2',
          createdAt: Date.now() + 3,
        }),
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(21),
          asset: 'CHF/JPY',
          setup: 'SSA',
          strategy: 'SSA',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 170.8,
          slPrice: 170.55,
          tpPrice: 171.8,
          outcome: 'STOP LOSS',
          netR: -3.0,
          netReturnPct: -3.0,
          notes: 'Drawdown backtest settimana 2',
          createdAt: Date.now() + 4,
        }),
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(10),
          asset: 'CAD/CHF',
          setup: 'MUT',
          strategy: 'MUT',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 0.645,
          slPrice: 0.6435,
          tpPrice: 0.651,
          outcome: 'TP',
          netR: 4.0,
          netReturnPct: 4.0,
          notes: 'TP pieno su continuazione sessione Londra',
          createdAt: Date.now() + 5,
        }),
        runRowCalculationEngine({
          id: generateTradeId('bt'),
          category: 'backtest',
          date: offsetIso(5),
          asset: 'XAU/USD',
          setup: 'SBIL DOMINANCE REALE',
          strategy: 'SBIL DOMINANCE REALE',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 2680.0,
          slPrice: 2675.0,
          tpPrice: 2700.0,
          outcome: 'TP',
          netR: 4.0,
          netReturnPct: 4.0,
          notes: 'Presa liquidità e sbilanciamento pulito',
          createdAt: Date.now() + 6,
        }),
      ];
      const next = [...backtestTrades, ...samples];
      setBacktestTrades(next);
      saveTradesSafely('backtest', next);
      if (firebaseUser) {
        samples.forEach((tr) => cloudIdsRef.current.add(tr.id));
        void batchCreateTradesInFirestore(firebaseUser.uid, samples).catch((err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        });
      }
      showToast('+6 operazioni di esempio aggiunte al Backtest');
    } else if (target === 'live') {
      const samples: TradeRecord[] = [
        runRowCalculationEngine({
          id: generateTradeId('lv'),
          category: 'live',
          date: offsetIso(12),
          asset: 'EUR/USD',
          setup: 'S1',
          strategy: 'S1',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 1.084,
          slPrice: 1.0825,
          tpPrice: 1.0885,
          outcome: 'TP',
          netR: 3.0,
          netReturnPct: 3.0,
          notes: 'Eseguito in apertura sessione',
          createdAt: Date.now() + 10,
        }),
        runRowCalculationEngine({
          id: generateTradeId('lv'),
          category: 'live',
          date: offsetIso(7),
          asset: 'CHF/JPY',
          setup: 'SSA',
          strategy: 'SSA',
          bias: 'SHORT',
          riskPct: 1,
          entryPrice: 171.8,
          slPrice: 172.05,
          tpPrice: 171.05,
          outcome: 'STOP LOSS',
          netR: -1.0,
          netReturnPct: -1.0,
          notes: 'Stop loss meccanico rispettato',
          createdAt: Date.now() + 11,
        }),
        runRowCalculationEngine({
          id: generateTradeId('lv'),
          category: 'live',
          date: offsetIso(3),
          asset: 'US30',
          setup: 'MUT',
          strategy: 'MUT',
          bias: 'LONG',
          riskPct: 1,
          entryPrice: 43120,
          slPrice: 43070,
          tpPrice: 43295,
          outcome: 'TP',
          netR: 3.5,
          netReturnPct: 3.5,
          notes: 'Trigger meccanico apertura NY',
          createdAt: Date.now() + 12,
        }),
      ];
      const next = [...liveTrades, ...samples];
      setLiveTrades(next);
      saveTradesSafely('live', next);
      if (firebaseUser) {
        samples.forEach((tr) => cloudIdsRef.current.add(tr.id));
        void batchCreateTradesInFirestore(firebaseUser.uid, samples).catch((err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        });
      }
      showToast('+3 operazioni di esempio aggiunte al Journal Reale');
    } else {
      const samples: TradeRecord[] = [
        runRowCalculationEngine({
          id: generateTradeId('ms'),
          category: 'missed',
          date: offsetIso(9),
          asset: 'EUR/USD',
          setup: 'S1',
          strategy: 'S1',
          bias: 'SHORT',
          riskPct: 1,
          outcome: 'TP',
          netR: 3.0,
          netReturnPct: 3.0,
          missedReason: 'Esitazione / Paura',
          notes: 'Esitazione dopo stop precedente',
          createdAt: Date.now() + 20,
        }),
        runRowCalculationEngine({
          id: generateTradeId('ms'),
          category: 'missed',
          date: offsetIso(4),
          asset: 'NASDAQ',
          setup: 'SBIL INTRADOMINANCE',
          strategy: 'SBIL INTRADOMINANCE',
          bias: 'LONG',
          riskPct: 1,
          outcome: 'TP',
          netR: 2.5,
          netReturnPct: 2.5,
          missedReason: 'Ordine Non Fillato',
          notes: 'Prezzo ripartito a 1.5 punti dal limit',
          createdAt: Date.now() + 21,
        }),
      ];
      const next = [...missedTrades, ...samples];
      setMissedTrades(next);
      saveTradesSafely('missed', next);
      if (firebaseUser) {
        samples.forEach((tr) => cloudIdsRef.current.add(tr.id));
        void batchCreateTradesInFirestore(firebaseUser.uid, samples).catch((err) => {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        });
      }
      showToast('+2 operazioni di esempio aggiunte ai Trade Non Presi');
    }
  };

  const handleOpenGeminiReview = async () => {
    const payload = buildGeminiReviewPrompt(
      liveStats,
      missedStats,
      filteredLive,
      filteredMissed,
    );
    setGeminiState({
      isOpen: true,
      loading: true,
      serverSuccess: false,
      responseText: '',
      promptText: payload.prompt,
    });
    const res = await analizzaTradeConGemini(payload);
    setGeminiState((prev) => ({
      ...prev,
      loading: false,
      serverSuccess: res.ok,
      responseText: res.text,
    }));
  };

  const executionDeltaR = roundTo(liveStats.netR - backtestStats.netR, 2);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E14] text-slate-300">
        <div className="flex items-center gap-3 rounded-lg border border-[#1E2634] bg-[#121721] px-5 py-3 text-xs font-medium">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          <span>
            {lang === 'en'
              ? 'Verifying authentication...'
              : 'Verifica sessione in corso...'}
          </span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <LoginScreen lang={lang} onLanguageChange={handleLanguageChange} />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Sticky Top Bar (3-Zone Contract, 2-row responsive on mobile) */}
      <header className="sticky top-0 z-30 border-b border-[#1E2634] bg-[#0B0E14]/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-3 py-3 sm:px-6 lg:flex-nowrap lg:gap-8 lg:py-3.5">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange('dashboard');
            }}
            className="order-1 text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 sm:text-lg"
          >
            Performance
          </a>

          <nav
            aria-label="Primary navigation"
            className="order-3 flex w-full items-center gap-5 overflow-x-auto border-t border-[#1E2634]/80 pt-2 pb-0.5 lg:order-2 lg:w-auto lg:gap-6 lg:border-t-0 lg:pt-0 lg:pb-0"
          >
            {(
              [
                ['dashboard', t.nav.dashboard],
                ['backtest', t.nav.backtest],
                ['live', t.nav.live],
                ['missed', t.nav.missed],
              ] as [ActiveTab, string][]
            ).map(([tabId, label]) => {
              const active = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => handleTabChange(tabId)}
                  className={`border-b-2 py-1.5 text-xs transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
                    active
                      ? 'border-sky-400 font-semibold text-slate-100'
                      : 'border-transparent font-medium text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="order-2 flex items-center gap-1.5 shrink-0 sm:gap-2.5 lg:order-3">
            <div className="flex items-center gap-1.5 rounded-md border border-[#1E2634] bg-[#121721] px-2 py-1 text-xs sm:gap-2 sm:px-2.5 sm:py-1.5">
              <Cloud
                className={`h-3.5 w-3.5 shrink-0 ${
                  cloudSyncStatus === 'syncing'
                    ? 'animate-pulse text-amber-400'
                    : 'text-emerald-400'
                }`}
              />
              <span
                title={firebaseUser.email || firebaseUser.displayName || ''}
                className="hidden max-w-[160px] truncate font-medium text-slate-200 md:inline"
              >
                {firebaseUser.email || firebaseUser.displayName || 'Cloud'}
              </span>
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleLogout()}
                title="Logout"
                aria-label="Logout"
                className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50 sm:gap-1.5 sm:px-2 sm:py-1"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
            </div>

            <div
              role="group"
              aria-label="Language switcher"
              className="flex items-center rounded-md border border-[#1E2634] bg-[#121721] p-0.5 text-[11px] font-semibold"
            >
              {(['it', 'en'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleLanguageChange(code)}
                  className={`rounded px-1.5 py-1 uppercase transition-colors whitespace-nowrap shrink-0 sm:px-2 ${
                    lang === code
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingTrade(null);
                setTradeModalCategory(
                  activeTab === 'backtest'
                    ? 'backtest'
                    : activeTab === 'missed'
                      ? 'missed'
                      : 'live',
                );
                setTradeModalOpen(true);
              }}
              className="rounded-md bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0 sm:px-4 sm:py-2 sm:text-xs"
            >
              {t.nav.newTrade}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* Global Interactive Strategy + Asset Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2634] pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <SetupFilterBar
              selectedSetup={selectedSetup}
              onSelectSetup={handleSetupChange}
              availableCustomSetups={customSetups}
              label={t.common.filterBySetup}
            />

            <select
              aria-label="Filtro Asset"
              value={assetFilter}
              onChange={(e) => handleAssetFilterChange(e.target.value)}
              className="rounded-lg border border-[#1E2634] bg-[#0B0E14] px-3 py-2 font-mono text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50"
            >
              <option value="ALL">{t.journal.assetFilterAll}</option>
              {availableAssets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'backtest' || activeTab === 'live' ? (
              <button
                type="button"
                onClick={() => {
                  setImportCategory(activeTab === 'backtest' ? 'backtest' : 'live');
                  setImportModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                {t.journal.importFile}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                const exportSet =
                  activeTab === 'backtest'
                    ? filteredBacktest
                    : activeTab === 'live'
                      ? filteredLive
                      : activeTab === 'missed'
                        ? filteredMissed
                        : [...filteredBacktest, ...filteredLive, ...filteredMissed];
                if (exportSet.length === 0) {
                  showToast('Nessun trade da esportare in CSV.');
                  return;
                }
                exportTradesCsv(exportSet, `diariotrade_${activeTab}`);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-[#263042] bg-[#121721] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {t.journal.exportCsv}
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  backtestTrades.length === 0 &&
                  liveTrades.length === 0 &&
                  missedTrades.length === 0
                ) {
                  showToast('Nessun dato presente da esportare in JSON.');
                  return;
                }
                exportBackupJson(backtestTrades, liveTrades, missedTrades);
                showToast('Backup JSON scaricato.');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-[#263042] bg-[#121721] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 whitespace-nowrap shrink-0"
            >
              <FileJson className="h-3.5 w-3.5 text-emerald-400" />
              {t.journal.exportJson}
            </button>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#263042] bg-[#121721] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 whitespace-nowrap shrink-0">
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              <span>{t.journal.importJson}</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const restored = parseBackupJsonContent(text);
                    const total =
                      restored.backtest.length +
                      restored.live.length +
                      restored.missed.length;
                    if (total === 0) {
                      showToast('Nessuna operazione valida trovata nel file JSON.');
                      return;
                    }
                    const mergeById = (
                      existing: TradeRecord[],
                      incoming: TradeRecord[],
                    ) => {
                      const map = new Map<string, TradeRecord>();
                      existing.forEach((tr) => map.set(tr.id, tr));
                      incoming.forEach((tr) => map.set(tr.id, tr));
                      return Array.from(map.values());
                    };
                    const nextBt = mergeById(backtestTrades, restored.backtest);
                    const nextLive = mergeById(liveTrades, restored.live);
                    const nextMissed = mergeById(missedTrades, restored.missed);
                    setBacktestTrades(nextBt);
                    setLiveTrades(nextLive);
                    setMissedTrades(nextMissed);
                    saveTradesSafely('backtest', nextBt);
                    saveTradesSafely('live', nextLive);
                    saveTradesSafely('missed', nextMissed);

                    if (firebaseUser) {
                      const restoredAll = [
                        ...restored.backtest,
                        ...restored.live,
                        ...restored.missed,
                      ];
                      const newToCloud: TradeRecord[] = [];
                      const updateInCloud: TradeRecord[] = [];
                      restoredAll.forEach((tr) => {
                        if (cloudIdsRef.current.has(tr.id)) {
                          updateInCloud.push(tr);
                        } else {
                          cloudIdsRef.current.add(tr.id);
                          newToCloud.push(tr);
                        }
                      });
                      try {
                        if (newToCloud.length > 0) {
                          await batchCreateTradesInFirestore(firebaseUser.uid, newToCloud);
                        }
                        for (const tr of updateInCloud) {
                          await upsertTradeInFirestore(firebaseUser.uid, tr, true);
                        }
                      } catch (err) {
                        setFatalError(
                          err instanceof Error ? err : new Error(String(err)),
                        );
                      }
                    }

                    showToast(
                      `Backup JSON importato: ${restored.backtest.length} Backtest, ${restored.live.length} Journal Reale, ${restored.missed.length} Non Presi.`,
                      6000,
                    );
                  } catch {
                    showToast('File JSON non valido o corrotto.');
                  }
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => void handleOpenGeminiReview()}
              className="inline-flex items-center gap-2 rounded-md border border-[#263042] bg-[#121721] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              {t.journal.geminiReview}
            </button>

            <button
              type="button"
              onClick={() => setClearStorageConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.journal.resetData}
            </button>
          </div>
        </div>

        {/* TAB 1: DASHBOARD & COMPARISON */}
        {activeTab === 'dashboard' ? (
          <div className="space-y-8">
            {/* Prominent Dedicated Akinator Backtest-Only KPI Card at Very Top */}
            <AkinatorCard scan={akinatorScan} t={t} />

            {/* Comparison KPI Strip */}
            <section className="space-y-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-100">
                  {t.dashboard.heading}
                </h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t.dashboard.subheading}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="text-xs font-medium text-slate-400">
                    {t.dashboard.backtestNetR}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      backtestStats.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatR(backtestStats.netR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {backtestStats.totalTrades} trades · {backtestStats.winRatePct.toFixed(1)}% WR
                  </div>
                </div>

                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="text-xs font-medium text-slate-400">
                    {t.dashboard.liveNetR}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      liveStats.netR >= 0 ? 'text-sky-400' : 'text-rose-400'
                    }`}
                  >
                    {formatR(liveStats.netR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {liveStats.totalTrades} trades · {liveStats.winRatePct.toFixed(1)}% WR
                  </div>
                </div>

                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="text-xs font-medium text-slate-400">
                    {t.dashboard.executionGap}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      executionDeltaR >= 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {formatR(executionDeltaR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {t.dashboard.missedCol}: {formatR(missedStats.theoreticalNetR)}
                  </div>
                </div>

                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="text-xs font-medium text-slate-400">
                    {t.dashboard.adherenceScore}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      missedStats.totalSignals === 0
                        ? 'text-slate-300'
                        : missedStats.adherenceScorePct >= 80
                          ? 'text-emerald-400'
                          : missedStats.adherenceScorePct >= 60
                            ? 'text-amber-400'
                            : 'text-rose-400'
                    }`}
                  >
                    {missedStats.adherenceScorePct.toFixed(1)}%
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {missedStats.executedCount} {t.common.executedSuffix} ·{' '}
                    {missedStats.totalMissed} {t.common.missedSuffix}
                  </div>
                </div>
              </div>
            </section>

            {/* Dual Equity Curve */}
            <EquityChart
              title={t.dashboard.equityTitle}
              subtitle={t.dashboard.equitySubtitle}
              emptyMessage={t.dashboard.noEquityData}
              primarySeries={{
                label: t.dashboard.backtestSeries,
                color: '#10B981',
                stats: backtestStats,
              }}
              secondarySeries={{
                label: t.dashboard.liveSeries,
                color: '#38BDF8',
                stats: liveStats,
              }}
            />

            {/* Comparison Matrix Table */}
            <section className="overflow-hidden rounded-lg border border-[#1E2634] bg-[#121721]">
              <div className="border-b border-[#1E2634] px-5 py-3.5">
                <h3 className="text-sm font-semibold text-slate-100">
                  {t.dashboard.comparisonTableTitle}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-slate-400">
                      <th className="px-5 py-3">{t.dashboard.metricCol}</th>
                      <th className="px-5 py-3 text-right">{t.nav.backtest}</th>
                      <th className="px-5 py-3 text-right">{t.nav.live}</th>
                      <th className="px-5 py-3 text-right">{t.dashboard.missedCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2634] font-mono tabular-nums">
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.tradesCount}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.totalTrades}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.totalTrades}
                      </td>
                      <td className="px-5 py-3 text-right text-amber-300">
                        {missedStats.totalMissed}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.winRate}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.winRatePct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.winRatePct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">
                        {missedStats.totalMissed > 0
                          ? `${((missedStats.theoreticalWins / missedStats.totalMissed) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.journal.netRR}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-400">
                        {formatR(backtestStats.netR)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-sky-400">
                        {formatR(liveStats.netR)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-400">
                        {formatR(missedStats.theoreticalNetR)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.expectancy}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {formatR(backtestStats.expectancyR)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {formatR(liveStats.expectancyR)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.maxDrawdown}
                      </td>
                      <td className="px-5 py-3 text-right text-rose-400">
                        -{backtestStats.maxDrawdownR.toFixed(2)} R
                      </td>
                      <td className="px-5 py-3 text-right text-rose-400">
                        -{liveStats.maxDrawdownR.toFixed(2)} R
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.profitFactor}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.profitFactorInfinite ? 'Max' : backtestStats.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.profitFactorInfinite ? 'Max' : liveStats.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Payoff Ratio (R:R)
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.payoffRatio === null ? 'Max' : `${backtestStats.payoffRatio.toFixed(2)} : 1`}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.payoffRatio === null ? 'Max' : `${liveStats.payoffRatio.toFixed(2)} : 1`}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Sharpe Ratio / Sortino Ratio
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.sharpeRatio !== null ? backtestStats.sharpeRatio.toFixed(2) : '0.00'} /{' '}
                        {backtestStats.sortinoInfinite
                          ? 'Max'
                          : backtestStats.sortinoRatio !== null
                            ? backtestStats.sortinoRatio.toFixed(2)
                            : '0.00'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.sharpeRatio !== null ? liveStats.sharpeRatio.toFixed(2) : '0.00'} /{' '}
                        {liveStats.sortinoInfinite
                          ? 'Max'
                          : liveStats.sortinoRatio !== null
                            ? liveStats.sortinoRatio.toFixed(2)
                            : '0.00'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Calmar / Recovery Factor
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {backtestStats.calmarRatio !== null ? backtestStats.calmarRatio.toFixed(2) : 'N/A'} /{' '}
                        {backtestStats.recoveryFactor !== null ? backtestStats.recoveryFactor.toFixed(2) : 'Max'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {liveStats.calmarRatio !== null ? liveStats.calmarRatio.toFixed(2) : 'N/A'} /{' '}
                        {liveStats.recoveryFactor !== null ? liveStats.recoveryFactor.toFixed(2) : 'Max'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Risk of Ruin (20R)
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-400">
                        {backtestStats.riskOfRuinPct.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3 text-right text-sky-400">
                        {liveStats.riskOfRuinPct.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Institutional Analytics Summary for Backtest */}
            <InstitutionalMetricsPanel
              stats={backtestStats}
              lang={lang}
              titlePrefix={t.nav.backtest}
            />
          </div>
        ) : null}

        {/* TAB 2: BACKTEST */}
        {activeTab === 'backtest' ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                {t.journal.backtestHeading}
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.journal.backtestSubtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.totalTrades}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {backtestStats.totalTrades}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {backtestStats.wins} TP · {backtestStats.losses} SL ·{' '}
                  {backtestStats.breakevens} BE
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.winRate}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                  {backtestStats.winRatePct.toFixed(1)}%
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  PF: {backtestStats.profitFactor.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.netRR}
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    backtestStats.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatR(backtestStats.netR)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {formatPct(backtestStats.netReturnPct)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.avgExpectancy}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {formatR(backtestStats.expectancyR)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-rose-400 tabular-nums">
                  Max DD: -{backtestStats.maxDrawdownR.toFixed(2)} R
                </div>
              </div>
            </div>

            <EquityChart
              title={`Backtest — ${selectedSetup}`}
              subtitle={t.journal.backtestSubtitle}
              emptyMessage={t.journal.emptyBacktest}
              primarySeries={{
                label: t.nav.backtest,
                color: '#10B981',
                stats: backtestStats,
              }}
            />

            <DrawdownChart
              subtitle={`Andamento sincronizzato dei ribassi dal picco di equity (Backtest — ${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''}).`}
              emptyMessage={t.journal.emptyBacktest}
              stats={backtestStats}
            />

            <InstitutionalMetricsPanel stats={backtestStats} lang={lang} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.journal.searchPlaceholder}
                className="w-full max-w-xs rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">{t.journal.outcomeFilterAll}</option>
                <option value="TP">TP</option>
                <option value="STOP LOSS">STOP LOSS</option>
                <option value="BE">BE</option>
                <option value="UNFILLED">UNFILLED</option>
              </select>
            </div>

            <TradeTable
              trades={applySearchAndSubFilters(filteredBacktest, 'backtest')}
              category="backtest"
              t={t}
              emptyMessage={t.journal.emptyBacktest}
              onAddFirst={() => {
                setEditingTrade(null);
                setTradeModalCategory('backtest');
                setTradeModalOpen(true);
              }}
              onLoadDemo={() => loadDemoTrades('backtest')}
              onEdit={(tr) => {
                setEditingTrade(tr);
                setTradeModalOpen(true);
              }}
              onDelete={(tr) => setDeleteTarget(tr)}
            />
          </div>
        ) : null}

        {/* TAB 3: LIVE JOURNALING (Strictly Executed Trades — Excludes Missed Trades) */}
        {activeTab === 'live' ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                {t.journal.liveHeading}
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.journal.liveSubtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.totalTrades}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {liveStats.totalTrades}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {liveStats.wins} TP · {liveStats.losses} SL · {liveStats.breakevens} BE
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.winRate}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-sky-400 tabular-nums">
                  {liveStats.winRatePct.toFixed(1)}%
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  PF: {liveStats.profitFactor.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.netRR}
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    liveStats.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatR(liveStats.netR)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {formatPct(liveStats.netReturnPct)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.avgExpectancy}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {formatR(liveStats.expectancyR)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-rose-400 tabular-nums">
                  Max DD: -{liveStats.maxDrawdownR.toFixed(2)} R
                </div>
              </div>
            </div>

            <EquityChart
              title={`${t.nav.live} — ${selectedSetup}`}
              subtitle={t.journal.liveSubtitle}
              emptyMessage={t.journal.emptyLive}
              primarySeries={{
                label: t.nav.live,
                color: '#38BDF8',
                stats: liveStats,
              }}
            />

            <DrawdownChart
              subtitle={`Andamento sincronizzato dei ribassi dal picco reale eseguito (esclusi Trade Non Presi — ${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''}).`}
              emptyMessage={t.journal.emptyLive}
              stats={liveStats}
            />

            <InstitutionalMetricsPanel stats={liveStats} lang={lang} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.journal.searchPlaceholder}
                className="w-full max-w-xs rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">{t.journal.outcomeFilterAll}</option>
                <option value="TP">TP</option>
                <option value="STOP LOSS">STOP LOSS</option>
                <option value="BE">BE</option>
                <option value="UNFILLED">UNFILLED</option>
              </select>
            </div>

            <TradeTable
              trades={applySearchAndSubFilters(filteredLive, 'live')}
              category="live"
              t={t}
              emptyMessage={t.journal.emptyLive}
              onAddFirst={() => {
                setEditingTrade(null);
                setTradeModalCategory('live');
                setTradeModalOpen(true);
              }}
              onLoadDemo={() => loadDemoTrades('live')}
              onEdit={(tr) => {
                setEditingTrade(tr);
                setTradeModalOpen(true);
              }}
              onDelete={(tr) => setDeleteTarget(tr)}
            />
          </div>
        ) : null}

        {/* TAB 4: TRADE NON PRESI / MISSED TRADES */}
        {activeTab === 'missed' ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                {t.journal.missedHeading}
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.journal.missedSubtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.missedTotal}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                  {missedStats.totalMissed}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {missedStats.theoreticalWins} TP · {missedStats.avoidedLosses} SL ·{' '}
                  {missedStats.theoreticalBE} BE
                </div>
              </div>

              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.theoreticalLostRR}
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    missedStats.theoreticalNetR > 0
                      ? 'text-amber-400'
                      : missedStats.theoreticalNetR < 0
                        ? 'text-emerald-400'
                        : 'text-slate-100'
                  }`}
                >
                  {formatR(missedStats.theoreticalNetR)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  TP: {formatR(missedStats.missedWinR)} · SL: {formatR(missedStats.avoidedLossR)}
                </div>
              </div>

              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.adherencePct}
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    missedStats.totalSignals === 0
                      ? 'text-slate-300'
                      : missedStats.adherenceScorePct >= 80
                        ? 'text-emerald-400'
                        : missedStats.adherenceScorePct >= 60
                          ? 'text-amber-400'
                          : 'text-rose-400'
                  }`}
                >
                  {missedStats.adherenceScorePct.toFixed(1)}%
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                  {missedStats.executedCount} / {missedStats.totalSignals}
                </div>
              </div>
            </div>

            {/* Breakdown by Reason */}
            <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
              <h3 className="text-sm font-semibold text-slate-100">
                {t.journal.reasonBreakdownTitle}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.journal.reasonBreakdownSub}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                {missedStats.reasonBreakdown.map((item) => {
                  const maxCount = Math.max(
                    1,
                    ...missedStats.reasonBreakdown.map((r) => r.count),
                  );
                  const pct = Math.round((item.count / maxCount) * 100);
                  return (
                    <div
                      key={item.reason}
                      className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-3.5"
                    >
                      <div className="text-xs font-medium text-slate-200">
                        {item.reason}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                        <span className="text-lg font-bold text-slate-100">
                          {item.count}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            item.impactR > 0
                              ? 'text-amber-400'
                              : item.impactR < 0
                                ? 'text-emerald-400'
                                : 'text-slate-400'
                          }`}
                        >
                          {formatR(item.impactR)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1E2634]">
                        <div
                          className="h-full bg-amber-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.journal.searchPlaceholder}
                className="w-full max-w-xs rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="rounded-md border border-[#263042] bg-[#121721] px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">{t.journal.reasonFilterAll}</option>
                {MISSED_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <TradeTable
              trades={applySearchAndSubFilters(filteredMissed, 'missed')}
              category="missed"
              t={t}
              emptyMessage={t.journal.emptyMissed}
              onAddFirst={() => {
                setEditingTrade(null);
                setTradeModalCategory('missed');
                setTradeModalOpen(true);
              }}
              onLoadDemo={() => loadDemoTrades('missed')}
              onEdit={(tr) => {
                setEditingTrade(tr);
                setTradeModalOpen(true);
              }}
              onDelete={(tr) => setDeleteTarget(tr)}
            />

            {filteredBacktest.some(
              (tr) =>
                tr.isMissed ||
                tr.outcome === 'UNFILLED' ||
                (tr.notes ?? '').toUpperCase().includes('NON PRESO'),
            ) ? (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Segnali UNFILLED / NON PRESO rilevati nel Backtest
                  </h3>
                  <span className="text-xs text-slate-400">
                    Visibili qui per controllo senza alterare le statistiche del conto reale
                  </span>
                </div>
                <TradeTable
                  trades={applySearchAndSubFilters(
                    filteredBacktest.filter(
                      (tr) =>
                        tr.isMissed ||
                        tr.outcome === 'UNFILLED' ||
                        (tr.notes ?? '').toUpperCase().includes('NON PRESO'),
                    ),
                    'missed',
                  )}
                  category="missed"
                  t={t}
                  emptyMessage={t.journal.emptyMissed}
                  onAddFirst={() => {
                    setEditingTrade(null);
                    setTradeModalCategory('missed');
                    setTradeModalOpen(true);
                  }}
                  onEdit={(tr) => {
                    setEditingTrade(tr);
                    setTradeModalOpen(true);
                  }}
                  onDelete={(tr) => setDeleteTarget(tr)}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-5 bottom-5 z-50 rounded-md border border-emerald-500/40 bg-[#161D2B] px-4 py-3 text-xs font-medium text-emerald-200 shadow-xl"
        >
          {toast}
        </div>
      ) : null}

      <TradeModal
        isOpen={tradeModalOpen}
        initialCategory={tradeModalCategory}
        editingTrade={editingTrade}
        customSetups={customSetups}
        t={t}
        onClose={() => {
          setTradeModalOpen(false);
          setEditingTrade(null);
        }}
        onSave={handleSaveTrade}
      />

      <ImportModal
        isOpen={importModalOpen}
        targetCategory={importCategory}
        existingTrades={
          importCategory === 'backtest'
            ? backtestTrades
            : [...liveTrades, ...missedTrades]
        }
        t={t}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportTrades}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        message={t.confirm.deleteMessage}
        t={t}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmModal
        isOpen={clearStorageConfirmOpen}
        message={
          lang === 'en'
            ? 'Do you want to reset all saved data in localStorage and reload the application? Make sure you exported a CSV or JSON backup first.'
            : "Vuoi resettare tutti i dati salvati in localStorage e ricaricare l'applicazione? Assicurati di aver esportato un backup CSV o JSON prima di procedere."
        }
        t={t}
        onCancel={() => setClearStorageConfirmOpen(false)}
        onConfirm={() => {
          localStorage.clear();
          window.location.reload();
        }}
      />

      <GeminiModal
        isOpen={geminiState.isOpen}
        loading={geminiState.loading}
        serverSuccess={geminiState.serverSuccess}
        responseText={geminiState.responseText}
        promptText={geminiState.promptText}
        t={t}
        onClose={() => setGeminiState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default App;
