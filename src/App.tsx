import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  Eraser,
  FileJson,
  FileSpreadsheet,
  LogOut,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AiDisciplineCoachCard } from './components/AiDisciplineCoachCard';
import { AkinatorCard } from './components/AkinatorCard';
import { ConfirmModal } from './components/ConfirmModal';
import { DrawdownChart } from './components/DrawdownChart';
import { EquityChart } from './components/EquityChart';
import { FixedTargetSimulationCard } from './components/FixedTargetSimulationCard';
import { GeminiModal } from './components/GeminiModal';
import {
  type AssetSyncOutcome,
  GoogleSheetsSyncModal,
} from './components/GoogleSheetsSyncModal';
import { ImportModal } from './components/ImportModal';
import {
  formatPeriodLabels,
  InstitutionalMetricsPanel,
} from './components/InstitutionalMetricsPanel';
import { LoginScreen } from './components/LoginScreen';
import { NewAssetModal } from './components/NewAssetModal';
import { PeriodDiscrepancyPanel } from './components/PeriodDiscrepancyPanel';
import { SetupFilterBar } from './components/SetupFilterBar';
import { TradeModal } from './components/TradeModal';
import { TradeTable } from './components/TradeTable';
import { WeekdayBreakdownCard } from './components/WeekdayBreakdownCard';
import { auth, signOutFirebase } from './firebase';
import { TRANSLATIONS } from './i18n/translations';
import {
  type ActiveTab,
  type GoogleSheetSource,
  type Language,
  MISSED_REASONS,
  type TradeCategory,
  type TradeRecord,
} from './types/trading';
import {
  calculateAkinatorBacktestScan,
  calculateMissedStats,
  calculatePerformanceStats,
  formatDisplayDate,
  formatPct,
  formatR,
  roundTo,
} from './utils/calculations';
import {
  batchCreateMissedTradesInFirestore,
  batchCreateTradesInFirestore,
  batchDeleteMissedTradesInFirestore,
  batchDeleteTradesInFirestore,
  type CloudUserSettings,
  deleteGoogleSheetSourceInFirestore,
  deleteMissedTradeInFirestore,
  deleteTradeInFirestore,
  ensureUserProfile,
  fetchExistingFirestoreTradesAndIds,
  fetchUserMissedTradesFromFirestore,
  fetchUserTradesFromFirestore,
  migrateLegacyMissedTradesFromTradesCollection,
  saveGoogleSheetSourceInFirestore,
  saveUserSettingsInFirestore,
  subscribeUserGoogleSheets,
  subscribeUserMissedTrades,
  subscribeUserSettings,
  subscribeUserTrades,
  updateGoogleSheetSyncStatusInFirestore,
  upsertMissedTradeInFirestore,
  upsertTradeInFirestore,
} from './utils/firestoreSync';
import {
  extractWorkPauseComparison,
  isPausaLavoroTrade,
  type LastMistakeInfo,
} from './utils/aiDisciplineCoach';
import { analizzaTradeConGemini, buildGeminiReviewPrompt } from './utils/geminiReview';
import {
  fetchAndParseGoogleSheetTrades,
  generateGoogleSheetSourceId,
  parseGoogleSheetUrl,
} from './utils/googleSheets';
import {
  buildTradeCoreDuplicateKey,
  deduplicateImportedTrades,
  exportBackupJson,
  exportTradesCsv,
  getTradeKey,
  parseBackupJsonContent,
} from './utils/importer';
import {
  loadActivePortfolioAssetsPreference,
  loadLanguagePreference,
  saveActivePortfolioAssetsPreference,
  saveLanguagePreference,
} from './utils/storage';

export function App() {
  const [lang, setLang] = useState<Language>(() => loadLanguagePreference());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedSetup, setSelectedSetup] = useState<string>('ALL');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [activePortfolioAssets, setActivePortfolioAssets] = useState<string[] | null>(
    () => loadActivePortfolioAssetsPreference(),
  );
  const [panchinaExpanded, setPanchinaExpanded] = useState(false);
  const [portfolioFilterMode, setPortfolioFilterMode] = useState<
    'active_only' | 'all'
  >('active_only');
  const [customAssets, setCustomAssets] = useState<string[]>([]);

  const [backtestTrades, setBacktestTrades] = useState<TradeRecord[]>([]);
  const [liveTrades, setLiveTrades] = useState<TradeRecord[]>([]);
  const [missedTrades, setMissedTrades] = useState<TradeRecord[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [dashboardRangeMode, setDashboardRangeMode] = useState<
    'live_period' | 'all_backtest'
  >('live_period');
  const [dashboardPnlMode, setDashboardPnlMode] = useState<'monthly' | 'daily'>('monthly');
  const [selectedPnlPeriod, setSelectedPnlPeriod] = useState<string | null>(null);
  const [focusedMistakeFilter, setFocusedMistakeFilter] =
    useState<LastMistakeInfo | null>(null);

  // Modals
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeModalCategory, setTradeModalCategory] =
    useState<TradeCategory>('live');
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importCategory, setImportCategory] =
    useState<TradeCategory>('backtest');

  const [googleSheets, setGoogleSheets] = useState<GoogleSheetSource[]>([]);
  const [googleSheetsModalOpen, setGoogleSheetsModalOpen] = useState(false);
  const [newAssetModalOpen, setNewAssetModalOpen] = useState(false);
  const [newAssetInitialSymbol, setNewAssetInitialSymbol] = useState('');
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [lastSyncedTrades, setLastSyncedTrades] = useState<TradeRecord[]>([]);
  const [showLastSyncedOnly, setShowLastSyncedOnly] = useState(false);
  const [lastSyncStats, setLastSyncStats] = useState<{
    added: number;
    skipped: number;
    label: string;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TradeRecord | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);
  const [resetSectionTarget, setResetSectionTarget] = useState<TradeCategory | null>(null);
  const [resetConfirmStep, setResetConfirmStep] = useState<1 | 2>(1);
  const [resettingSection, setResettingSection] = useState(false);

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
  const missedCloudIdsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<CloudUserSettings>({
    language: lang,
    activeTab,
    selectedSetup,
    assetFilter,
    activePortfolioAssets,
    customAssets,
  });

  useEffect(() => {
    settingsRef.current = {
      language: lang,
      activeTab,
      selectedSetup,
      assetFilter,
      activePortfolioAssets,
      customAssets,
    };
  }, [lang, activeTab, selectedSetup, assetFilter, activePortfolioAssets, customAssets]);

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
    setFocusedMistakeFilter(null);
    setActiveTab(nextTab);
    syncSettingsPatch({ activeTab: nextTab });
  };

  const handleLastMistakeClick = (mistake: LastMistakeInfo) => {
    setSearchQuery('');
    setOutcomeFilter('ALL');
    setReasonFilter('ALL');
    setFocusedMistakeFilter(mistake);
    setActiveTab(mistake.category);
    syncSettingsPatch({ activeTab: mistake.category });
  };

  const handleSetupChange = (nextSetup: string) => {
    setSelectedSetup(nextSetup);
    syncSettingsPatch({ selectedSetup: nextSetup });
  };

  const handleAssetFilterChange = (nextAsset: string) => {
    setAssetFilter(nextAsset);
    syncSettingsPatch({ assetFilter: nextAsset });
  };

  const handleTogglePortfolioAsset = (asset: string, allBacktestAssets: string[]) => {
    setPortfolioFilterMode('active_only');
    const normAsset = asset.trim().toUpperCase();
    const currentList =
      activePortfolioAssets === null ? allBacktestAssets : activePortfolioAssets;
    const currentSet = new Set(currentList.map((a) => a.trim().toUpperCase()));
    if (currentSet.has(normAsset)) {
      currentSet.delete(normAsset);
    } else {
      currentSet.add(normAsset);
    }
    const nextList = Array.from(currentSet).sort();
    setActivePortfolioAssets(nextList);
    saveActivePortfolioAssetsPreference(nextList);
    syncSettingsPatch({ activePortfolioAssets: nextList });
  };

  const handleSelectAllPortfolioAssets = () => {
    setPortfolioFilterMode('active_only');
    setActivePortfolioAssets(null);
    saveActivePortfolioAssetsPreference(null);
    syncSettingsPatch({ activePortfolioAssets: null });
  };

  const handleClearPortfolioAssets = () => {
    setPortfolioFilterMode('active_only');
    setActivePortfolioAssets([]);
    saveActivePortfolioAssetsPreference([]);
    syncSettingsPatch({ activePortfolioAssets: [] });
  };

  const registerCustomAssets = (
    rawAssets: string[],
    activateInPortfolio = false,
  ): string[] => {
    const normalizedIncoming = Array.from(
      new Set(
        rawAssets
          .map((a) => a.trim().toUpperCase().slice(0, 32))
          .filter(Boolean),
      ),
    );
    if (normalizedIncoming.length === 0) {
      return settingsRef.current.customAssets ?? [];
    }

    const currentCustom = settingsRef.current.customAssets ?? [];
    const customSet = new Set(currentCustom.map((a) => a.trim().toUpperCase()));
    let customChanged = false;
    normalizedIncoming.forEach((asset) => {
      if (!customSet.has(asset)) {
        customSet.add(asset);
        customChanged = true;
      }
    });

    const nextCustom = Array.from(customSet).sort().slice(0, 100);
    const patch: Partial<CloudUserSettings> = {};
    if (customChanged) {
      patch.customAssets = nextCustom;
      setCustomAssets(nextCustom);
    }

    if (
      activateInPortfolio &&
      Array.isArray(settingsRef.current.activePortfolioAssets)
    ) {
      const portfolioSet = new Set(
        settingsRef.current.activePortfolioAssets.map((a) =>
          a.trim().toUpperCase(),
        ),
      );
      let portfolioChanged = false;
      normalizedIncoming.forEach((asset) => {
        if (!portfolioSet.has(asset)) {
          portfolioSet.add(asset);
          portfolioChanged = true;
        }
      });
      if (portfolioChanged) {
        const nextPortfolio = Array.from(portfolioSet).sort().slice(0, 100);
        patch.activePortfolioAssets = nextPortfolio;
        setActivePortfolioAssets(nextPortfolio);
        saveActivePortfolioAssetsPreference(nextPortfolio);
      }
    }

    if (Object.keys(patch).length > 0) {
      syncSettingsPatch(patch);
    }
    return nextCustom;
  };

  const handleSaveNewAsset = async (payload: {
    asset: string;
    sheetUrl?: string;
    category: TradeCategory;
  }) => {
    if (!firebaseUser) {
      throw new Error('Devi essere autenticato per salvare un asset su Firebase.');
    }
    const cleanAsset = payload.asset.trim().toUpperCase().slice(0, 32);
    if (!cleanAsset) {
      throw new Error('Simbolo Asset non valido.');
    }

    if (payload.sheetUrl) {
      const parsedLink = parseGoogleSheetUrl(payload.sheetUrl);
      const duplicateSource = googleSheets.find(
        (s) =>
          s.spreadsheetId === parsedLink.spreadsheetId &&
          s.asset.trim().toUpperCase() === cleanAsset &&
          s.category === payload.category,
      );
      if (duplicateSource) {
        throw new Error(
          `Questo foglio Google è già collegato a ${cleanAsset}.`,
        );
      }
      const newSource: GoogleSheetSource = {
        id: generateGoogleSheetSourceId(),
        asset: cleanAsset,
        sheetUrl: parsedLink.canonicalUrl,
        spreadsheetId: parsedLink.spreadsheetId,
        category: payload.category,
        createdAt: Date.now(),
      };
      await saveGoogleSheetSourceInFirestore(firebaseUser.uid, newSource);
    }

    registerCustomAssets([cleanAsset], true);
    showToast(
      payload.sheetUrl
        ? `Asset ${cleanAsset} e collegamento Google Sheets salvati su Firebase.`
        : `Asset ${cleanAsset} registrato e salvato su Firebase.`,
    );
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
    all.forEach((tr) => {
      if (tr.category === 'backtest') bt.push(tr);
      else if (tr.category === 'live') lv.push(tr);
    });
    return { bt, lv };
  };

  useEffect(() => {
    let active = true;
    let unsubTrades: (() => void) | null = null;
    let unsubMissedTrades: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;
    let unsubSheets: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubTrades?.();
      unsubTrades = null;
      unsubMissedTrades?.();
      unsubMissedTrades = null;
      unsubSettings?.();
      unsubSettings = null;
      unsubSheets?.();
      unsubSheets = null;

      if (!active) return;

      if (!user) {
        cloudIdsRef.current.clear();
        missedCloudIdsRef.current.clear();
        setBacktestTrades([]);
        setLiveTrades([]);
        setMissedTrades([]);
        setGoogleSheets([]);
        setActivePortfolioAssets(null);
        setCustomAssets([]);
        setFirebaseUser(null);
        setCloudSyncStatus('idle');
        setAuthReady(true);
        return;
      }

      setFirebaseUser(user);
      setAuthReady(true);
      setCloudSyncStatus('syncing');

      try {
        await ensureUserProfile(user);
        await migrateLegacyMissedTradesFromTradesCollection(user.uid);
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
          const syncedPortfolio = cloudSettings.activePortfolioAssets ?? null;
          setActivePortfolioAssets(syncedPortfolio);
          saveActivePortfolioAssetsPreference(syncedPortfolio);
          setCustomAssets(cloudSettings.customAssets ?? []);
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );

      unsubTrades = subscribeUserTrades(
        user.uid,
        (cloudTrades) => {
          if (!active) return;

          cloudIdsRef.current = new Set(cloudTrades.map((tr) => tr.id));
          const { bt, lv } = splitTradesByCategory(cloudTrades);
          setBacktestTrades(bt);
          setLiveTrades(lv);
          setCloudSyncStatus('synced');
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );
      unsubMissedTrades = subscribeUserMissedTrades(
        user.uid,
        (cloudMissed) => {
          if (!active) return;
          missedCloudIdsRef.current = new Set(cloudMissed.map((tr) => tr.id));
          setMissedTrades(cloudMissed);
          setCloudSyncStatus('synced');
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );
      unsubSheets = subscribeUserGoogleSheets(
        user.uid,
        (sources) => {
          if (active) setGoogleSheets(sources);
        },
        (err) => {
          if (active) setFatalError(err);
        },
      );
    });

    return () => {
      active = false;
      unsubTrades?.();
      unsubMissedTrades?.();
      unsubSettings?.();
      unsubSheets?.();
      unsubAuth();
    };
  }, []);

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebase();
      setTradeModalOpen(false);
      setImportModalOpen(false);
      setGoogleSheetsModalOpen(false);
      setDeleteTarget(null);
      setResetSectionTarget(null);
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
    const sourcePool =
      activeTab === 'missed'
        ? missedTrades
        : [...backtestTrades, ...liveTrades];
    return Array.from(
      new Set([
        ...sourcePool.map((tr) => tr.asset.trim().toUpperCase()).filter(Boolean),
        ...customAssets.map((a) => a.trim().toUpperCase()).filter(Boolean),
        ...googleSheets
          .map((s) => s.asset.trim().toUpperCase())
          .filter(Boolean),
      ]),
    ).sort();
  }, [activeTab, backtestTrades, liveTrades, missedTrades, customAssets, googleSheets]);

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
    () =>
      filterBySetupAndAsset(backtestTrades).filter(
        (tr) => tr.category === 'backtest',
      ),
    [backtestTrades, selectedSetup, assetFilter],
  );
  const filteredLive = useMemo(
    () =>
      filterBySetupAndAsset(liveTrades).filter((tr) => tr.category === 'live'),
    [liveTrades, selectedSetup, assetFilter],
  );
  const filteredMissed = useMemo(
    () =>
      filterBySetupAndAsset(missedTrades).filter(
        (tr) => tr.category === 'missed',
      ),
    [missedTrades, selectedSetup, assetFilter],
  );

  // Trade Non Presi is 100% standalone and never reads from Journal Reale or Backtest
  const missedStats = useMemo(
    () => calculateMissedStats(filteredMissed),
    [filteredMissed],
  );

  // Shared Active Portfolio Assets across Dashboard, Backtest, and Journal Reale (persisted in Firebase)
  const backtestPortfolioAssets = useMemo(
    () =>
      Array.from(
        new Set([
          ...backtestTrades
            .filter((tr) => tr.category === 'backtest')
            .map((tr) => tr.asset.trim().toUpperCase())
            .filter(Boolean),
          ...liveTrades
            .filter((tr) => tr.category === 'live')
            .map((tr) => tr.asset.trim().toUpperCase())
            .filter(Boolean),
          ...customAssets.map((a) => a.trim().toUpperCase()).filter(Boolean),
        ]),
      ).sort(),
    [backtestTrades, liveTrades, customAssets],
  );

  const backtestOnlyAssets = useMemo(
    () =>
      Array.from(
        new Set(
          backtestTrades
            .filter((tr) => tr.category === 'backtest')
            .map((tr) => tr.asset.trim().toUpperCase())
            .filter(Boolean),
        ),
      ).sort(),
    [backtestTrades],
  );

  const activePortfolioAssetSet = useMemo(
    () =>
      new Set(
        activePortfolioAssets === null
          ? backtestPortfolioAssets
          : activePortfolioAssets.map((a) => a.trim().toUpperCase()),
      ),
    [activePortfolioAssets, backtestPortfolioAssets],
  );

  const titolariAssets = useMemo(
    () => backtestPortfolioAssets.filter((a) => activePortfolioAssetSet.has(a)),
    [backtestPortfolioAssets, activePortfolioAssetSet],
  );

  const panchinaAssets = useMemo(
    () => backtestPortfolioAssets.filter((a) => !activePortfolioAssetSet.has(a)),
    [backtestPortfolioAssets, activePortfolioAssetSet],
  );

  const dashboardPortfolioBacktest = useMemo(() => {
    if (portfolioFilterMode === 'all') {
      return filteredBacktest;
    }
    return filteredBacktest.filter((tr) =>
      activePortfolioAssetSet.has(tr.asset.trim().toUpperCase()),
    );
  }, [filteredBacktest, activePortfolioAssetSet, portfolioFilterMode]);

  const dashboardPortfolioLive = useMemo(() => {
    if (
      portfolioFilterMode === 'all' ||
      (backtestPortfolioAssets.length === 0 && activePortfolioAssets === null)
    ) {
      return filteredLive;
    }
    return filteredLive.filter((tr) =>
      activePortfolioAssetSet.has(tr.asset.trim().toUpperCase()),
    );
  }, [
    filteredLive,
    activePortfolioAssetSet,
    backtestPortfolioAssets.length,
    activePortfolioAssets,
    portfolioFilterMode,
  ]);

  const dashboardPortfolioMissed = useMemo(() => {
    if (
      portfolioFilterMode === 'all' ||
      (backtestPortfolioAssets.length === 0 && activePortfolioAssets === null)
    ) {
      return filteredMissed;
    }
    return filteredMissed.filter((tr) =>
      activePortfolioAssetSet.has(tr.asset.trim().toUpperCase()),
    );
  }, [
    filteredMissed,
    activePortfolioAssetSet,
    backtestPortfolioAssets.length,
    activePortfolioAssets,
    portfolioFilterMode,
  ]);

  // Synchronized stats for Backtest & Journal Reale tabs honoring the shared Active Portfolio Assets bar
  const backtestStats = useMemo(
    () => calculatePerformanceStats(dashboardPortfolioBacktest),
    [dashboardPortfolioBacktest],
  );

  const liveTradesForStats = useMemo(
    () => dashboardPortfolioLive.filter((tr) => !isPausaLavoroTrade(tr)),
    [dashboardPortfolioLive],
  );

  const excludedTabLiveWorkPauseCount =
    dashboardPortfolioLive.length - liveTradesForStats.length;

  const liveStats = useMemo(
    () => calculatePerformanceStats(liveTradesForStats),
    [liveTradesForStats],
  );

  const lastSyncedIdSet = useMemo(
    () => new Set(lastSyncedTrades.map((tr) => tr.id)),
    [lastSyncedTrades],
  );

  const isLastSyncedFilterActive =
    showLastSyncedOnly && lastSyncedTrades.length > 0;

  // Earliest live trade date per asset in Journal Reale (YYYY-MM-DD) for aligned Dashboard comparison
  const liveStartDateByAsset = useMemo(() => {
    const earliestByAsset = new Map<string, string>();
    liveTrades.forEach((tr) => {
      if (tr.category !== 'live') return;
      const assetKey = tr.asset.trim().toUpperCase();
      if (!assetKey || !/^\d{4}-\d{2}-\d{2}$/.test(tr.date)) return;
      const currentEarliest = earliestByAsset.get(assetKey);
      if (!currentEarliest || tr.date < currentEarliest) {
        earliestByAsset.set(assetKey, tr.date);
      }
    });
    return earliestByAsset;
  }, [liveTrades]);

  // Earliest visible live trade date (YYYY-MM-DD) among active portfolio assets for shared EquityChart timeline & header badge
  const liveStartDate = useMemo(() => {
    const validFilteredDates = dashboardPortfolioLive
      .map((tr) => tr.date)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (validFilteredDates.length > 0) {
      return validFilteredDates.reduce(
        (min, d) => (d < min ? d : min),
        validFilteredDates[0],
      );
    }
    return null;
  }, [dashboardPortfolioLive]);

  const isLiveAligned = dashboardRangeMode === 'live_period';

  const dashboardBacktestTrades = useMemo(() => {
    if (!isLiveAligned) return dashboardPortfolioBacktest;
    return dashboardPortfolioBacktest.filter((tr) => {
      const assetKey = tr.asset.trim().toUpperCase();
      const assetLiveStart = liveStartDateByAsset.get(assetKey);
      return assetLiveStart !== undefined && tr.date >= assetLiveStart;
    });
  }, [dashboardPortfolioBacktest, isLiveAligned, liveStartDateByAsset]);

  const visibleDashboardBacktestTrades = useMemo(() => {
    if (isLastSyncedFilterActive) {
      return backtestTrades.filter(
        (tr) => tr.category === 'backtest' && lastSyncedIdSet.has(tr.id),
      );
    }
    return dashboardBacktestTrades;
  }, [
    isLastSyncedFilterActive,
    backtestTrades,
    lastSyncedIdSet,
    dashboardBacktestTrades,
  ]);

  const allAssetsDashboardBacktestTrades = useMemo(() => {
    if (isLastSyncedFilterActive) {
      return backtestTrades.filter(
        (tr) => tr.category === 'backtest' && lastSyncedIdSet.has(tr.id),
      );
    }
    return backtestTrades.filter((tr) => {
      if (tr.category !== 'backtest') return false;
      if (selectedSetup !== 'ALL') {
        const targetLower = selectedSetup.trim().toLowerCase();
        const s = (tr.setup || tr.strategy || '').trim().toLowerCase();
        if (s !== targetLower) return false;
      }
      const assetKey = tr.asset.trim().toUpperCase();
      if (portfolioFilterMode !== 'all' && !activePortfolioAssetSet.has(assetKey)) {
        return false;
      }
      if (isLiveAligned) {
        const assetLiveStart = liveStartDateByAsset.get(assetKey);
        if (assetLiveStart === undefined || tr.date < assetLiveStart) {
          return false;
        }
      }
      return true;
    });
  }, [
    isLastSyncedFilterActive,
    backtestTrades,
    lastSyncedIdSet,
    selectedSetup,
    portfolioFilterMode,
    activePortfolioAssetSet,
    isLiveAligned,
    liveStartDateByAsset,
  ]);

  const visibleDashboardLiveTrades = useMemo(() => {
    if (isLastSyncedFilterActive) {
      return liveTrades.filter(
        (tr) => tr.category === 'live' && lastSyncedIdSet.has(tr.id),
      );
    }
    return dashboardPortfolioLive;
  }, [
    isLastSyncedFilterActive,
    liveTrades,
    lastSyncedIdSet,
    dashboardPortfolioLive,
  ]);

  const akinatorBacktestTrades = useMemo(() => {
    return backtestTrades.filter((tr) => {
      if (tr.category !== 'backtest') return false;
      if (selectedSetup !== 'ALL') {
        const targetLower = selectedSetup.trim().toLowerCase();
        const s = (tr.setup || tr.strategy || '').trim().toLowerCase();
        if (s !== targetLower) return false;
      }
      const assetKey = tr.asset.trim().toUpperCase();
      if (portfolioFilterMode !== 'all' && !activePortfolioAssetSet.has(assetKey)) {
        return false;
      }
      return true;
    });
  }, [backtestTrades, selectedSetup, portfolioFilterMode, activePortfolioAssetSet]);

  const dashboardAkinatorScan = useMemo(
    () => calculateAkinatorBacktestScan(akinatorBacktestTrades),
    [akinatorBacktestTrades],
  );

  const dashboardBacktestStats = useMemo(
    () => calculatePerformanceStats(visibleDashboardBacktestTrades),
    [visibleDashboardBacktestTrades],
  );

  const visibleDashboardLiveTradesForStats = useMemo(
    () => visibleDashboardLiveTrades.filter((tr) => !isPausaLavoroTrade(tr)),
    [visibleDashboardLiveTrades],
  );

  const dashboardLiveStats = useMemo(
    () => calculatePerformanceStats(visibleDashboardLiveTradesForStats),
    [visibleDashboardLiveTradesForStats],
  );

  const liveAlignedBacktestTrades = useMemo(() => {
    if (isLastSyncedFilterActive) {
      return backtestTrades.filter(
        (tr) => tr.category === 'backtest' && lastSyncedIdSet.has(tr.id),
      );
    }
    if (liveStartDateByAsset.size === 0) return [];
    return dashboardPortfolioBacktest.filter((tr) => {
      const assetKey = tr.asset.trim().toUpperCase();
      const assetLiveStart = liveStartDateByAsset.get(assetKey);
      return assetLiveStart !== undefined && tr.date >= assetLiveStart;
    });
  }, [
    isLastSyncedFilterActive,
    backtestTrades,
    lastSyncedIdSet,
    dashboardPortfolioBacktest,
    liveStartDateByAsset,
  ]);

  const liveAlignedBacktestStats = useMemo(
    () => calculatePerformanceStats(liveAlignedBacktestTrades),
    [liveAlignedBacktestTrades],
  );

  const effectiveLiveComparisonStartDate = useMemo(() => {
    if (assetFilter !== 'ALL') {
      return liveStartDateByAsset.get(assetFilter.trim().toUpperCase()) ?? liveStartDate;
    }
    return liveStartDate;
  }, [assetFilter, liveStartDateByAsset, liveStartDate]);

  const visibleDashboardCombinedTrades = useMemo(
    () => [...visibleDashboardBacktestTrades, ...visibleDashboardLiveTradesForStats],
    [visibleDashboardBacktestTrades, visibleDashboardLiveTradesForStats],
  );

  const liveAlignedMissedTrades = useMemo(() => {
    if (isLastSyncedFilterActive) {
      return missedTrades.filter(
        (tr) => tr.category === 'missed' && lastSyncedIdSet.has(tr.id),
      );
    }
    if (!effectiveLiveComparisonStartDate) return [];
    return dashboardPortfolioMissed.filter((tr) => {
      const assetStart =
        liveStartDateByAsset.get(tr.asset.trim().toUpperCase()) ??
        effectiveLiveComparisonStartDate;
      return tr.date >= assetStart;
    });
  }, [
    isLastSyncedFilterActive,
    missedTrades,
    lastSyncedIdSet,
    effectiveLiveComparisonStartDate,
    dashboardPortfolioMissed,
    liveStartDateByAsset,
  ]);

  const dashboardWorkPauseComparison = useMemo(() => {
    const missedScope = isLiveAligned
      ? liveAlignedMissedTrades
      : dashboardPortfolioMissed;
    return extractWorkPauseComparison({
      backtestTrades: visibleDashboardBacktestTrades,
      liveTrades: visibleDashboardLiveTrades,
      missedTrades: missedScope,
    });
  }, [
    isLiveAligned,
    liveAlignedMissedTrades,
    dashboardPortfolioMissed,
    visibleDashboardBacktestTrades,
    visibleDashboardLiveTrades,
  ]);

  const dashboardWorkPauseStats = useMemo(
    () => calculatePerformanceStats(dashboardWorkPauseComparison.workPauseTrades),
    [dashboardWorkPauseComparison.workPauseTrades],
  );

  const effectiveSelectedPnlPeriod = useMemo(() => {
    const btSource =
      liveStartDateByAsset.size > 0
        ? liveAlignedBacktestStats
        : dashboardBacktestStats;
    const btBuckets =
      dashboardPnlMode === 'monthly'
        ? btSource.monthlyBuckets
        : btSource.dailyBuckets;
    const liveBuckets =
      dashboardPnlMode === 'monthly'
        ? dashboardLiveStats.monthlyBuckets
        : dashboardLiveStats.dailyBuckets;
    const allPeriods = Array.from(
      new Set([...btBuckets.map((b) => b.period), ...liveBuckets.map((b) => b.period)]),
    ).sort((a, b) => a.localeCompare(b));
    const visiblePeriods =
      dashboardPnlMode === 'monthly' ? allPeriods : allPeriods.slice(-45);
    if (selectedPnlPeriod && visiblePeriods.includes(selectedPnlPeriod)) {
      return selectedPnlPeriod;
    }
    return visiblePeriods[visiblePeriods.length - 1] ?? null;
  }, [
    dashboardPnlMode,
    liveStartDateByAsset.size,
    liveAlignedBacktestStats,
    dashboardBacktestStats,
    dashboardLiveStats.monthlyBuckets,
    dashboardLiveStats.dailyBuckets,
    selectedPnlPeriod,
  ]);

  const effectiveSelectedPnlPeriodLabel = useMemo(() => {
    if (!effectiveSelectedPnlPeriod) return null;
    return formatPeriodLabels(effectiveSelectedPnlPeriod, dashboardPnlMode, lang).full;
  }, [effectiveSelectedPnlPeriod, dashboardPnlMode, lang]);

  // Portfolio Rotation Alert: monitor unselected Backtest assets over the last 30 days
  const portfolioRotationAlert = useMemo(() => {
    if (backtestOnlyAssets.length === 0) return null;

    let latestDate = '';
    for (const tr of backtestTrades) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(tr.date) && tr.date > latestDate) {
        latestDate = tr.date;
      }
    }
    for (const tr of liveTrades) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(tr.date) && tr.date > latestDate) {
        latestDate = tr.date;
      }
    }
    if (!latestDate) return null;

    const refMs = Date.parse(`${latestDate}T00:00:00Z`);
    if (!Number.isFinite(refMs)) return null;
    const windowStart = new Date(refMs - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const netRByAsset = new Map<string, number>();
    for (const asset of backtestOnlyAssets) {
      netRByAsset.set(asset, 0);
    }

    for (const tr of backtestTrades) {
      if (tr.category !== 'backtest') continue;
      if (selectedSetup !== 'ALL' && tr.setup !== selectedSetup) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tr.date)) continue;
      if (tr.date < windowStart || tr.date > latestDate) continue;

      const assetKey = tr.asset.trim().toUpperCase();
      if (!assetKey) continue;
      const delta = Number.isFinite(tr.netR) ? tr.netR : 0;
      netRByAsset.set(assetKey, roundTo((netRByAsset.get(assetKey) ?? 0) + delta, 2));
    }

    const selectedAssets = backtestOnlyAssets
      .filter((asset) => activePortfolioAssetSet.has(asset))
      .map((asset) => ({ asset, netR: roundTo(netRByAsset.get(asset) ?? 0, 2) }));

    const unselectedAssets = backtestOnlyAssets
      .filter((asset) => !activePortfolioAssetSet.has(asset))
      .map((asset) => ({ asset, netR: roundTo(netRByAsset.get(asset) ?? 0, 2) }));

    if (selectedAssets.length === 0 || unselectedAssets.length === 0) return null;

    const weakestSelected = selectedAssets.reduce((min, cur) =>
      cur.netR < min.netR ? cur : min,
    );

    const qualifying = unselectedAssets
      .filter((item) => item.netR > 5 && item.netR > weakestSelected.netR)
      .sort((a, b) => b.netR - a.netR)
      .map((item) => ({
        asset: item.asset,
        netR: item.netR,
        comparedAsset: weakestSelected.asset,
        comparedNetR: weakestSelected.netR,
      }));

    if (qualifying.length === 0) return null;

    return {
      windowStart,
      latestDate,
      opportunities: qualifying,
    };
  }, [
    backtestOnlyAssets,
    backtestTrades,
    liveTrades,
    selectedSetup,
    activePortfolioAssetSet,
  ]);

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

  // Permanent Firebase Cloud persistence handlers
  const handleSaveTrade = async (
    saved: TradeRecord,
    previousCategory?: TradeCategory,
  ) => {
    if (!firebaseUser) {
      throw new Error('Devi essere autenticato per salvare su Firebase.');
    }

    if (saved.category === 'missed') {
      const isExistingMissed = missedCloudIdsRef.current.has(saved.id);
      await upsertMissedTradeInFirestore(firebaseUser.uid, saved, isExistingMissed);
      missedCloudIdsRef.current.add(saved.id);
      if (
        previousCategory &&
        previousCategory !== 'missed' &&
        cloudIdsRef.current.has(saved.id)
      ) {
        await deleteTradeInFirestore(firebaseUser.uid, saved.id);
        cloudIdsRef.current.delete(saved.id);
      }
    } else {
      const isExistingInCloud = cloudIdsRef.current.has(saved.id);
      await upsertTradeInFirestore(firebaseUser.uid, saved, isExistingInCloud);
      cloudIdsRef.current.add(saved.id);
      if (previousCategory === 'missed' && missedCloudIdsRef.current.has(saved.id)) {
        await deleteMissedTradeInFirestore(firebaseUser.uid, saved.id);
        missedCloudIdsRef.current.delete(saved.id);
      }
    }

    let nextBt = backtestTrades;
    let nextLive = liveTrades;
    let nextMissed = missedTrades;

    if (previousCategory && previousCategory !== saved.category) {
      if (previousCategory === 'backtest') {
        nextBt = backtestTrades.filter((x) => x.id !== saved.id);
      } else if (previousCategory === 'live') {
        nextLive = liveTrades.filter((x) => x.id !== saved.id);
      } else {
        nextMissed = missedTrades.filter((x) => x.id !== saved.id);
      }
    }

    const upsert = (arr: TradeRecord[]) => {
      const exists = arr.some((x) => x.id === saved.id);
      return exists ? arr.map((x) => (x.id === saved.id ? saved : x)) : [...arr, saved];
    };

    if (saved.category === 'backtest') {
      nextBt = upsert(nextBt);
    } else if (saved.category === 'live') {
      nextLive = upsert(nextLive);
    } else {
      nextMissed = upsert(nextMissed);
    }

    setBacktestTrades(nextBt);
    setLiveTrades(nextLive);
    setMissedTrades(nextMissed);

    showToast(`${saved.asset} (${saved.setup}) — ${formatR(saved.netR)}`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deletingSingle || !firebaseUser) return;
    const targetToDelete = deleteTarget;
    setDeletingSingle(true);
    try {
      if (targetToDelete.category === 'missed') {
        await deleteMissedTradeInFirestore(firebaseUser.uid, targetToDelete.id);
        missedCloudIdsRef.current.delete(targetToDelete.id);
        setMissedTrades((prev) => prev.filter((x) => x.id !== targetToDelete.id));
      } else {
        await deleteTradeInFirestore(firebaseUser.uid, targetToDelete.id);
        cloudIdsRef.current.delete(targetToDelete.id);

        if (targetToDelete.category === 'backtest') {
          setBacktestTrades((prev) => prev.filter((x) => x.id !== targetToDelete.id));
        } else {
          setLiveTrades((prev) => prev.filter((x) => x.id !== targetToDelete.id));
        }
      }
      setDeleteTarget(null);
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setDeletingSingle(false);
    }
  };

  const handleImportTrades = async (imported: TradeRecord[]) => {
    if (!firebaseUser) {
      showToast('Errore: effettua il login per importare su Firebase.');
      return;
    }

    let existingPool: TradeRecord[] = [];
    try {
      if (importCategory === 'missed') {
        existingPool = await fetchUserMissedTradesFromFirestore(firebaseUser.uid);
      } else {
        const dbTrades = await fetchUserTradesFromFirestore(firebaseUser.uid);
        existingPool = dbTrades.filter((tr) => tr.category === importCategory);
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const { addedTrades, skippedDuplicates } = deduplicateImportedTrades(
      existingPool,
      imported,
    );

    const tradesToSyncCloud: TradeRecord[] = [];

    if (addedTrades.length > 0) {
      if (importCategory === 'missed') {
        const normalizedMissed = addedTrades.map((t) => ({
          ...t,
          category: 'missed' as const,
          isMissed: true,
        }));
        tradesToSyncCloud.push(...normalizedMissed);
      } else if (importCategory === 'backtest') {
        const normalizedBt = addedTrades.map((t) => ({
          ...t,
          category: 'backtest' as const,
          isMissed: false,
          missedReason: undefined,
        }));
        tradesToSyncCloud.push(...normalizedBt);
      } else {
        const normalizedLive = addedTrades.map((t) => ({
          ...t,
          category: 'live' as const,
          isMissed: false,
          missedReason: undefined,
        }));
        tradesToSyncCloud.push(...normalizedLive);
      }

      try {
        if (importCategory === 'missed') {
          await batchCreateMissedTradesInFirestore(firebaseUser.uid, tradesToSyncCloud);
          tradesToSyncCloud.forEach((tr) => missedCloudIdsRef.current.add(tr.id));
        } else {
          await batchCreateTradesInFirestore(firebaseUser.uid, tradesToSyncCloud);
          tradesToSyncCloud.forEach((tr) => cloudIdsRef.current.add(tr.id));
        }
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      if (importCategory === 'missed') {
        setMissedTrades((prev) => [...prev, ...tradesToSyncCloud]);
      } else if (importCategory === 'backtest') {
        setBacktestTrades((prev) => [...prev, ...tradesToSyncCloud]);
      } else {
        setLiveTrades((prev) => [...prev, ...tradesToSyncCloud]);
      }
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

    const roundedR = roundTo(totalNetR, 2);
    const formattedTotalR = `${roundedR > 0 ? '+' : ''}${Number.isInteger(roundedR) ? roundedR : roundedR.toFixed(2)} R`;

    const baseSummary =
      lang === 'en'
        ? `Import complete: ${addedTrades.length} new trades added, ${skippedDuplicates} existing trades ignored`
        : lang === 'es'
          ? `Importación completada: ${addedTrades.length} nuevas operaciones añadidas, ${skippedDuplicates} operaciones existentes omitidas`
          : `Importazione completata: ${addedTrades.length} nuove operazioni aggiunte, ${skippedDuplicates} operazioni già esistenti ignorate`;

    const details =
      addedTrades.length > 0
        ? ` | Totale: ${formattedTotalR} (${breakdown})`
        : '';

    // Auto-detect and register any new asset names from imported CSV/Excel trades
    const detectedImportAssets = Array.from(
      new Set(imported.map((tr) => tr.asset.trim().toUpperCase()).filter(Boolean)),
    );
    if (detectedImportAssets.length > 0) {
      registerCustomAssets(detectedImportAssets, false);
    }

    showToast(`${baseSummary}${details}`, 9000);
  };

  const handleAddGoogleSheetSource = async (source: GoogleSheetSource) => {
    if (!firebaseUser) return;
    await saveGoogleSheetSourceInFirestore(firebaseUser.uid, source);
    registerCustomAssets([source.asset], false);
    showToast(`Collegamento ${source.asset} salvato su Firebase.`);
  };

  const handleDeleteGoogleSheetSource = async (source: GoogleSheetSource) => {
    if (!firebaseUser) return;
    await deleteGoogleSheetSourceInFirestore(firebaseUser.uid, source.id);
    showToast(`Collegamento ${source.asset} rimosso.`);
  };

  const buildCategoryKeysMap = (
    tradesList: TradeRecord[],
  ): Record<TradeCategory, Set<string>> => {
    const map: Record<TradeCategory, Set<string>> = {
      backtest: new Set<string>(),
      live: new Set<string>(),
      missed: new Set<string>(),
    };
    tradesList.forEach((tr) => {
      map[tr.category].add(getTradeKey(tr));
    });
    return map;
  };

  const runGoogleSheetSyncForSource = async (
    source: GoogleSheetSource,
    existingMainIds: Set<string>,
    existingMissedIds: Set<string>,
    existingKeysByCategory: Record<TradeCategory, Set<string>>,
    skipFirestoreQuery = false,
  ): Promise<{
    outcome: AssetSyncOutcome;
    addedBt: TradeRecord[];
    addedLive: TradeRecord[];
    addedMissed: TradeRecord[];
  }> => {
    const fetched = await fetchAndParseGoogleSheetTrades(source);
    const targetCollection =
      source.category === 'missed' ? 'missedTrades' : 'trades';
    const targetExistingIds =
      source.category === 'missed' ? existingMissedIds : existingMainIds;
    const existingKeys = existingKeysByCategory[source.category];

    // Before importing, generate getTradeKey for all existing Firestore trades of the user and store them in a Set
    if (firebaseUser && !skipFirestoreQuery) {
      const snapshot = await fetchExistingFirestoreTradesAndIds(
        firebaseUser.uid,
        targetCollection,
      );
      snapshot.ids.forEach((id) => targetExistingIds.add(id));
      snapshot.trades.forEach((tr) => {
        existingKeysByCategory[tr.category].add(getTradeKey(tr));
      });
    }

    const addedTrades: TradeRecord[] = [];
    let skippedCount = 0;

    fetched.trades.forEach((tr) => {
      const tradeKey = getTradeKey(tr);
      if (!tr.id || existingKeys.has(tradeKey) || targetExistingIds.has(tr.id)) {
        skippedCount += 1;
        return;
      }
      existingKeys.add(tradeKey);
      targetExistingIds.add(tr.id);
      addedTrades.push(tr);
    });

    const addedBt: TradeRecord[] = [];
    const addedLive: TradeRecord[] = [];
    const addedMissed: TradeRecord[] = [];

    addedTrades.forEach((tr) => {
      if (source.category === 'backtest') {
        const normalizedBt: TradeRecord = {
          ...tr,
          category: 'backtest',
          isMissed: false,
          missedReason: undefined,
        };
        addedBt.push(normalizedBt);
      } else if (source.category === 'missed') {
        const normalizedMissed: TradeRecord = {
          ...tr,
          category: 'missed',
          isMissed: true,
        };
        addedMissed.push(normalizedMissed);
      } else {
        const normalizedLive: TradeRecord = {
          ...tr,
          category: 'live',
          isMissed: false,
          missedReason: undefined,
        };
        addedLive.push(normalizedLive);
      }
    });

    const newMainTradesForCloud = [...addedBt, ...addedLive];
    if (firebaseUser && newMainTradesForCloud.length > 0) {
      newMainTradesForCloud.forEach((tr) => cloudIdsRef.current.add(tr.id));
      await batchCreateTradesInFirestore(firebaseUser.uid, newMainTradesForCloud);
    }
    if (firebaseUser && addedMissed.length > 0) {
      addedMissed.forEach((tr) => missedCloudIdsRef.current.add(tr.id));
      await batchCreateMissedTradesInFirestore(firebaseUser.uid, addedMissed);
    }

    const newCount = addedTrades.length;
    const shortStatus = `${skippedCount} vecchi + ${newCount} nuovi`;
    const summaryMsg = `Sync (${source.asset}): ${shortStatus}`;
    if (firebaseUser) {
      await updateGoogleSheetSyncStatusInFirestore(
        firebaseUser.uid,
        source.id,
        Date.now(),
        shortStatus,
      );
    }

    const tabsScanned =
      fetched.matchedTabs.length > 0
        ? fetched.matchedTabs.map((m) => `${m.strategy} (${m.rowCount})`)
        : fetched.sheetNames;

    return {
      outcome: {
        sourceId: source.id,
        asset: source.asset,
        status: 'success',
        added: newCount,
        skipped: skippedCount,
        tabsScanned,
        message: summaryMsg,
      },
      addedBt,
      addedLive,
      addedMissed,
    };
  };

  const handleSyncSingleGoogleSheet = async (
    source: GoogleSheetSource,
  ): Promise<AssetSyncOutcome> => {
    const existingMainIds = new Set<string>(
      firebaseUser ? [] : [...backtestTrades, ...liveTrades].map((tr) => tr.id),
    );
    const existingMissedIds = new Set<string>(
      firebaseUser ? [] : missedTrades.map((tr) => tr.id),
    );
    const existingKeysByCategory = buildCategoryKeysMap(
      firebaseUser ? [] : [...backtestTrades, ...liveTrades, ...missedTrades],
    );

    try {
      const { outcome, addedBt, addedLive, addedMissed } =
        await runGoogleSheetSyncForSource(
          source,
          existingMainIds,
          existingMissedIds,
          existingKeysByCategory,
          false,
        );

      const appendUniqueById = (prev: TradeRecord[], incoming: TradeRecord[]) => {
        const map = new Map<string, TradeRecord>();
        prev.forEach((tr) => map.set(tr.id, tr));
        incoming.forEach((tr) => map.set(tr.id, tr));
        return Array.from(map.values());
      };

      if (addedBt.length > 0) {
        setBacktestTrades((prev) => appendUniqueById(prev, addedBt));
      }
      if (addedLive.length > 0) {
        setLiveTrades((prev) => appendUniqueById(prev, addedLive));
      }
      if (addedMissed.length > 0) {
        setMissedTrades((prev) => appendUniqueById(prev, addedMissed));
      }

      const newlyAdded = [...addedBt, ...addedLive, ...addedMissed];
      setLastSyncedTrades(newlyAdded);
      setLastSyncStats({
        added: outcome.added,
        skipped: outcome.skipped,
        label: source.asset,
      });
      setShowLastSyncedOnly(newlyAdded.length > 0);

      showToast(outcome.message, 8000);
      return outcome;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Errore durante il sync di ${source.asset}.`;
      showToast(message, 8000);
      return {
        sourceId: source.id,
        asset: source.asset,
        status: 'error',
        added: 0,
        skipped: 0,
        tabsScanned: [],
        message,
      };
    }
  };

  const handleSyncAllGoogleSheets = async (
    onProgress?: (currentIndex: number, total: number, asset: string) => void,
  ): Promise<AssetSyncOutcome[]> => {
    const existingMainIds = new Set<string>(
      firebaseUser ? [] : [...backtestTrades, ...liveTrades].map((tr) => tr.id),
    );
    const existingMissedIds = new Set<string>(
      firebaseUser ? [] : missedTrades.map((tr) => tr.id),
    );
    const existingKeysByCategory = buildCategoryKeysMap(
      firebaseUser ? [] : [...backtestTrades, ...liveTrades, ...missedTrades],
    );

    if (firebaseUser) {
      try {
        const [mainSnap, missedSnap] = await Promise.all([
          fetchExistingFirestoreTradesAndIds(firebaseUser.uid, 'trades'),
          fetchExistingFirestoreTradesAndIds(firebaseUser.uid, 'missedTrades'),
        ]);
        mainSnap.ids.forEach((id) => existingMainIds.add(id));
        missedSnap.ids.forEach((id) => existingMissedIds.add(id));
        mainSnap.trades.forEach((tr) => {
          existingKeysByCategory[tr.category].add(getTradeKey(tr));
        });
        missedSnap.trades.forEach((tr) => {
          existingKeysByCategory.missed.add(getTradeKey(tr));
        });
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
        return [];
      }
    }

    const outcomes: AssetSyncOutcome[] = [];
    const allAddedBt: TradeRecord[] = [];
    const allAddedLive: TradeRecord[] = [];
    const allAddedMissed: TradeRecord[] = [];

    for (let i = 0; i < googleSheets.length; i++) {
      const src = googleSheets[i];
      onProgress?.(i + 1, googleSheets.length, src.asset);
      try {
        const res = await runGoogleSheetSyncForSource(
          src,
          existingMainIds,
          existingMissedIds,
          existingKeysByCategory,
          Boolean(firebaseUser),
        );
        outcomes.push(res.outcome);
        allAddedBt.push(...res.addedBt);
        allAddedLive.push(...res.addedLive);
        allAddedMissed.push(...res.addedMissed);
      } catch (err) {
        outcomes.push({
          sourceId: src.id,
          asset: src.asset,
          status: 'error',
          added: 0,
          skipped: 0,
          tabsScanned: [],
          message:
            err instanceof Error
              ? err.message
              : `Errore durante la sincronizzazione di ${src.asset}.`,
        });
      }
    }

    const appendUniqueById = (prev: TradeRecord[], incoming: TradeRecord[]) => {
      const map = new Map<string, TradeRecord>();
      prev.forEach((tr) => map.set(tr.id, tr));
      incoming.forEach((tr) => map.set(tr.id, tr));
      return Array.from(map.values());
    };

    if (allAddedBt.length > 0) {
      setBacktestTrades((prev) => appendUniqueById(prev, allAddedBt));
    }
    if (allAddedLive.length > 0) {
      setLiveTrades((prev) => appendUniqueById(prev, allAddedLive));
    }
    if (allAddedMissed.length > 0) {
      setMissedTrades((prev) => appendUniqueById(prev, allAddedMissed));
    }

    const totalAdded = outcomes.reduce((s, o) => s + o.added, 0);
    const totalSkipped = outcomes.reduce((s, o) => s + o.skipped, 0);
    const errorCount = outcomes.filter((o) => o.status === 'error').length;

    const newlyAdded = [...allAddedBt, ...allAddedLive, ...allAddedMissed];
    setLastSyncedTrades(newlyAdded);
    setLastSyncStats({
      added: totalAdded,
      skipped: totalSkipped,
      label: lang === 'en' ? 'All Assets' : 'Tutti gli Asset',
    });
    setShowLastSyncedOnly(newlyAdded.length > 0);

    const baseAllMsg = `Sincronizzazione completata: ${totalSkipped} vecchi + ${totalAdded} nuovi`;

    showToast(
      errorCount > 0 ? `${baseAllMsg} (${errorCount} asset con errore)` : baseAllMsg,
      9000,
    );

    return outcomes;
  };

  const handleRemoveDuplicates = async () => {
    if (cleaningDuplicates) return;
    setCleaningDuplicates(true);

    const targetCategories: TradeCategory[] =
      activeTab === 'backtest'
        ? ['backtest']
        : activeTab === 'live'
          ? ['live']
          : activeTab === 'missed'
            ? ['missed']
            : ['backtest', 'live'];

    const sectionLabel =
      activeTab === 'backtest'
        ? 'Backtest'
        : activeTab === 'live'
          ? 'Journal Reale'
          : activeTab === 'missed'
            ? 'Trade Non Presi'
            : 'Dashboard (Backtest & Journal Reale)';

    try {
      let sourceMainTrades: TradeRecord[] = [...backtestTrades, ...liveTrades];
      let sourceMissedTrades: TradeRecord[] = [...missedTrades];

      if (firebaseUser) {
        if (targetCategories.includes('missed')) {
          sourceMissedTrades = await fetchUserMissedTradesFromFirestore(firebaseUser.uid);
        }
        if (targetCategories.includes('backtest') || targetCategories.includes('live')) {
          sourceMainTrades = await fetchUserTradesFromFirestore(firebaseUser.uid);
        }
      }

      const mainDuplicateIds: string[] = [];
      const missedDuplicateIds: string[] = [];
      const keptByCategory: Record<TradeCategory, TradeRecord[]> = {
        backtest: [...backtestTrades],
        live: [...liveTrades],
        missed: [...missedTrades],
      };

      targetCategories.forEach((cat) => {
        const pool = cat === 'missed' ? sourceMissedTrades : sourceMainTrades;
        const catTrades = pool
          .filter((tr) => tr.category === cat)
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

        const seen = new Set<string>();
        const unique: TradeRecord[] = [];
        catTrades.forEach((tr) => {
          const sig = buildTradeCoreDuplicateKey(tr);
          if (seen.has(sig)) {
            if (cat === 'missed') {
              missedDuplicateIds.push(tr.id);
            } else {
              mainDuplicateIds.push(tr.id);
            }
          } else {
            seen.add(sig);
            unique.push(tr);
          }
        });
        keptByCategory[cat] = unique;
      });

      const totalDuplicates = mainDuplicateIds.length + missedDuplicateIds.length;
      if (totalDuplicates === 0) {
        showToast(
          lang === 'en'
            ? `No duplicates found in ${sectionLabel}.`
            : lang === 'es'
              ? `No se encontraron duplicados en ${sectionLabel}.`
              : `Nessun duplicato trovato in Firebase (${sectionLabel}).`,
          6000,
        );
        return;
      }

      if (firebaseUser) {
        if (mainDuplicateIds.length > 0) {
          await batchDeleteTradesInFirestore(firebaseUser.uid, mainDuplicateIds);
          mainDuplicateIds.forEach((id) => cloudIdsRef.current.delete(id));
        }
        if (missedDuplicateIds.length > 0) {
          await batchDeleteMissedTradesInFirestore(firebaseUser.uid, missedDuplicateIds);
          missedDuplicateIds.forEach((id) => missedCloudIdsRef.current.delete(id));
        }
      }

      if (targetCategories.includes('backtest')) {
        setBacktestTrades(keptByCategory.backtest);
      }
      if (targetCategories.includes('live')) {
        setLiveTrades(keptByCategory.live);
      }
      if (targetCategories.includes('missed')) {
        setMissedTrades(keptByCategory.missed);
      }

      const remainingCount = targetCategories.reduce(
        (sum, cat) => sum + keptByCategory[cat].length,
        0,
      );

      showToast(
        lang === 'en'
          ? `Cleanup complete (${sectionLabel}): ${totalDuplicates} duplicates removed from Firebase (${remainingCount} unique trades kept)`
          : lang === 'es'
            ? `Limpieza completada (${sectionLabel}): ${totalDuplicates} duplicados eliminados de Firebase (${remainingCount} trades únicos conservados)`
            : `Pulizia completata (${sectionLabel}): ${totalDuplicates} duplicati rimossi da Firebase (${remainingCount} trade unici mantenuti)`,
        9000,
      );
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const getSectionDisplayName = (cat: TradeCategory) =>
    cat === 'backtest' ? t.nav.backtest : cat === 'live' ? t.nav.live : t.nav.missed;

  const handleConfirmResetSection = async () => {
    if (!resetSectionTarget || resettingSection || !firebaseUser) return;
    const targetCategory = resetSectionTarget;
    const targetAsset = assetFilter.trim().toUpperCase();
    const isAllAssets = targetAsset === 'ALL';
    const sectionLabel = getSectionDisplayName(targetCategory);
    setResettingSection(true);

    try {
      const localSectionTrades =
        targetCategory === 'backtest'
          ? backtestTrades
          : targetCategory === 'live'
            ? liveTrades
            : missedTrades;

      const matchesAssetFilter = (tr: TradeRecord) =>
        isAllAssets || tr.asset.trim().toUpperCase() === targetAsset;

      const idsSet = new Set<string>(
        localSectionTrades.filter(matchesAssetFilter).map((tr) => tr.id),
      );

      if (targetCategory === 'missed') {
        const dbMissed = await fetchUserMissedTradesFromFirestore(firebaseUser.uid);
        dbMissed.forEach((tr) => {
          if (matchesAssetFilter(tr)) {
            idsSet.add(tr.id);
          }
        });
      } else {
        const dbTrades = await fetchUserTradesFromFirestore(firebaseUser.uid);
        dbTrades.forEach((tr) => {
          if (tr.category === targetCategory && matchesAssetFilter(tr)) {
            idsSet.add(tr.id);
          }
        });
      }

      const idsToDelete = Array.from(idsSet);

      if (idsToDelete.length > 0) {
        if (targetCategory === 'missed') {
          await batchDeleteMissedTradesInFirestore(firebaseUser.uid, idsToDelete);
          idsToDelete.forEach((id) => missedCloudIdsRef.current.delete(id));
        } else {
          await batchDeleteTradesInFirestore(firebaseUser.uid, idsToDelete);
          idsToDelete.forEach((id) => cloudIdsRef.current.delete(id));
        }
      }

      if (targetCategory === 'backtest') {
        setBacktestTrades((prev) => prev.filter((tr) => !idsSet.has(tr.id)));
      } else if (targetCategory === 'live') {
        setLiveTrades((prev) => prev.filter((tr) => !idsSet.has(tr.id)));
      } else {
        setMissedTrades((prev) => prev.filter((tr) => !idsSet.has(tr.id)));
      }

      setResetSectionTarget(null);
      setResetConfirmStep(1);

      const scopeLabel = isAllAssets
        ? sectionLabel
        : `${sectionLabel} · ${targetAsset}`;

      if (idsToDelete.length === 0) {
        showToast(
          lang === 'en'
            ? `No trades to reset in ${scopeLabel}.`
            : lang === 'es'
              ? `No hay operaciones para restablecer en ${scopeLabel}.`
              : `Nessun trade presente da eliminare in ${scopeLabel}.`,
          5000,
        );
      } else {
        showToast(
          lang === 'en'
            ? `Reset complete (${scopeLabel}): ${idsToDelete.length} trades permanently deleted from Firebase.`
            : lang === 'es'
              ? `Restablecimiento completado (${scopeLabel}): ${idsToDelete.length} operaciones eliminadas permanentemente de Firebase.`
              : `Reset completato (${scopeLabel}): ${idsToDelete.length} trade eliminati definitivamente da Firebase.`,
          7000,
        );
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setResettingSection(false);
    }
  };

  const handleOpenGeminiReview = async () => {
    const payload = buildGeminiReviewPrompt(liveStats, liveTradesForStats);
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

  const dashboardExecutionDeltaR = roundTo(
    dashboardLiveStats.netR - dashboardBacktestStats.netR,
    2,
  );

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

            <button
              type="button"
              onClick={() => {
                setNewAssetInitialSymbol('');
                setNewAssetModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuovo Asset</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'dashboard' ||
            activeTab === 'backtest' ||
            activeTab === 'live' ||
            activeTab === 'missed' ? (
              <button
                type="button"
                onClick={() => setGoogleSheetsModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Sync Google Sheets</span>
                {googleSheets.length > 0 ? (
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200">
                    {googleSheets.length}
                  </span>
                ) : null}
              </button>
            ) : null}

            {activeTab === 'backtest' ||
            activeTab === 'live' ||
            activeTab === 'missed' ? (
              <button
                type="button"
                onClick={() => {
                  setImportCategory(
                    activeTab === 'backtest'
                      ? 'backtest'
                      : activeTab === 'missed'
                        ? 'missed'
                        : 'live',
                  );
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
              onClick={() => void handleRemoveDuplicates()}
              disabled={cleaningDuplicates}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Eraser className={`h-3.5 w-3.5 ${cleaningDuplicates ? 'animate-pulse' : ''}`} />
              <span>
                {cleaningDuplicates ? 'Pulizia in corso...' : 'Rimuovi Duplicati'}
              </span>
            </button>

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
                        : [...filteredBacktest, ...filteredLive];
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
                    const mergeUniqueById = (
                      a: TradeRecord[],
                      b: TradeRecord[],
                    ) => {
                      const map = new Map<string, TradeRecord>();
                      a.forEach((tr) => map.set(tr.id, tr));
                      b.forEach((tr) => map.set(tr.id, tr));
                      return Array.from(map.values());
                    };

                    let existingBtPool = [...backtestTrades];
                    let existingLivePool = [...liveTrades];
                    let existingMissedPool = [...missedTrades];

                    if (firebaseUser) {
                      try {
                        const [dbTrades, dbMissed] = await Promise.all([
                          fetchUserTradesFromFirestore(firebaseUser.uid),
                          fetchUserMissedTradesFromFirestore(firebaseUser.uid),
                        ]);
                        existingBtPool = mergeUniqueById(
                          dbTrades.filter((tr) => tr.category === 'backtest'),
                          existingBtPool,
                        );
                        existingLivePool = mergeUniqueById(
                          dbTrades.filter((tr) => tr.category === 'live'),
                          existingLivePool,
                        );
                        existingMissedPool = mergeUniqueById(
                          dbMissed,
                          existingMissedPool,
                        );
                      } catch (err) {
                        setFatalError(
                          err instanceof Error ? err : new Error(String(err)),
                        );
                        return;
                      }
                    }

                    const btDedup = deduplicateImportedTrades(
                      existingBtPool,
                      restored.backtest,
                    );
                    const liveDedup = deduplicateImportedTrades(
                      existingLivePool,
                      restored.live,
                    );
                    const missedDedup = deduplicateImportedTrades(
                      existingMissedPool,
                      restored.missed,
                    );

                    const addedBt = btDedup.addedTrades;
                    const addedLive = liveDedup.addedTrades;
                    const addedMissed = missedDedup.addedTrades.map((tr) => ({
                      ...tr,
                      category: 'missed' as const,
                      isMissed: true,
                    }));
                    const totalAdded =
                      addedBt.length + addedLive.length + addedMissed.length;
                    const totalSkipped =
                      btDedup.skippedDuplicates +
                      liveDedup.skippedDuplicates +
                      missedDedup.skippedDuplicates;

                    if (!firebaseUser) {
                      showToast('Devi essere autenticato per importare su Firebase.');
                      return;
                    }

                    const mainNewToCloud = [...addedBt, ...addedLive];
                    if (mainNewToCloud.length > 0 || addedMissed.length > 0) {
                      try {
                        if (mainNewToCloud.length > 0) {
                          await batchCreateTradesInFirestore(
                            firebaseUser.uid,
                            mainNewToCloud,
                          );
                          mainNewToCloud.forEach((tr) => cloudIdsRef.current.add(tr.id));
                        }
                        if (addedMissed.length > 0) {
                          await batchCreateMissedTradesInFirestore(
                            firebaseUser.uid,
                            addedMissed,
                          );
                          addedMissed.forEach((tr) => missedCloudIdsRef.current.add(tr.id));
                        }
                      } catch (err) {
                        setFatalError(
                          err instanceof Error ? err : new Error(String(err)),
                        );
                        return;
                      }
                    }

                    if (addedBt.length > 0) {
                      setBacktestTrades((prev) => [...prev, ...addedBt]);
                    }
                    if (addedLive.length > 0) {
                      setLiveTrades((prev) => [...prev, ...addedLive]);
                    }
                    if (addedMissed.length > 0) {
                      setMissedTrades((prev) => [...prev, ...addedMissed]);
                    }

                    showToast(
                      lang === 'en'
                        ? `Import complete: ${totalAdded} new trades added, ${totalSkipped} existing trades ignored`
                        : lang === 'es'
                          ? `Importación completada: ${totalAdded} nuevas operaciones añadidas, ${totalSkipped} operaciones existentes omitidas`
                          : `Importazione completata: ${totalAdded} nuove operazioni aggiunte, ${totalSkipped} operazioni già esistenti ignorate`,
                      9000,
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

            {activeTab === 'backtest' || activeTab === 'live' || activeTab === 'missed' ? (
              <button
                type="button"
                disabled={resettingSection}
                onClick={() => {
                  setResetConfirmStep(1);
                  setResetSectionTarget(activeTab);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.journal.resetData}
              </button>
            ) : null}
          </div>
        </div>

        {/* Shared Multi-Select Active Portfolio Assets Bar across Dashboard, Backtest, and Journal Reale (Persisted in Firestore & localStorage; Trade Non Presi excluded) */}
        {(activeTab === 'dashboard' ||
          activeTab === 'backtest' ||
          activeTab === 'live') &&
        backtestPortfolioAssets.length > 0 ? (
          <section
            aria-label="Active Portfolio Assets"
            className="rounded-lg border border-[#1E2634] bg-[#121721] px-4 py-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-slate-200">
                  Active Portfolio Assets
                </span>
                <span className="rounded border border-[#263042] bg-[#0B0E14] px-2 py-0.5 font-mono text-[11px] text-sky-300 tabular-nums">
                  {portfolioFilterMode === 'all'
                    ? `${backtestPortfolioAssets.length}/${backtestPortfolioAssets.length}`
                    : `${titolariAssets.length}/${backtestPortfolioAssets.length}`}
                </span>

                <div
                  role="group"
                  aria-label="Modalità filtro portafoglio"
                  className="inline-flex items-center rounded-md border border-[#263042] bg-[#0B0E14] p-0.5 text-[11px]"
                >
                  <button
                    type="button"
                    onClick={() => setPortfolioFilterMode('active_only')}
                    className={`rounded px-2.5 py-0.5 font-semibold transition-colors whitespace-nowrap ${
                      portfolioFilterMode === 'active_only'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Solo Attivi
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortfolioFilterMode('all')}
                    className={`rounded px-2.5 py-0.5 font-semibold transition-colors whitespace-nowrap ${
                      portfolioFilterMode === 'all'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tutti
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllPortfolioAssets}
                  className="rounded border border-[#263042] bg-[#0B0E14] px-2.5 py-1 font-medium text-slate-300 transition-colors hover:border-sky-500/50 hover:text-white"
                >
                  {lang === 'en' ? 'All to Titolari' : 'Tutti in Titolari'}
                </button>
                <button
                  type="button"
                  onClick={handleClearPortfolioAssets}
                  className="rounded border border-[#263042] bg-[#0B0E14] px-2.5 py-1 font-medium text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                >
                  {lang === 'en' ? 'Bench all' : 'Tutti in Panchina'}
                </button>
              </div>
            </div>

            {/* Group 1: Titolari (always visible, checked/included by default) */}
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
                  Titolari
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 tabular-nums">
                  {titolariAssets.length}
                </span>
                {portfolioFilterMode === 'all' ? (
                  <span className="text-[11px] text-emerald-400/80">
                    (inclusi nei calcoli · modalità Tutti attiva)
                  </span>
                ) : null}
              </div>

              {titolariAssets.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/60 px-3 py-2 text-xs text-slate-400">
                  Nessun asset nei Titolari. Apri "Panchina" qui sotto per promuovere almeno un asset.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {titolariAssets.map((asset) => (
                    <div
                      key={asset}
                      className={`inline-flex items-center overflow-hidden rounded-md border font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                        portfolioFilterMode === 'all'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                          : 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                      }`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={true}
                        onClick={() =>
                          handleTogglePortfolioAsset(asset, backtestPortfolioAssets)
                        }
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-white/5"
                      >
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs border border-sky-400 bg-sky-500 text-[#0B0E14]">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                        <span>{asset}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTogglePortfolioAsset(asset, backtestPortfolioAssets)
                        }
                        title={`Sposta ${asset} in Panchina`}
                        aria-label={`Sposta ${asset} in Panchina`}
                        className="inline-flex items-center gap-1 border-l border-sky-500/30 bg-[#0B0E14]/50 px-2 py-1.5 text-[10px] font-sans font-semibold text-slate-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
                      >
                        <ArrowDownRight className="h-3 w-3" />
                        <span>Panchina</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Group 2: Panchina (collapsible accordion hidden by default, containing benched/excluded assets) */}
            <div className="mt-3 border-t border-[#1E2634] pt-2.5">
              <button
                type="button"
                aria-expanded={panchinaExpanded}
                onClick={() => setPanchinaExpanded((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[#0B0E14]"
              >
                {panchinaExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  Panchina
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                    panchinaAssets.length > 0
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                      : 'border-[#263042] bg-[#0B0E14] text-slate-500'
                  }`}
                >
                  {panchinaAssets.length}
                </span>
                {portfolioFilterMode === 'all' && panchinaAssets.length > 0 ? (
                  <span className="text-[11px] text-emerald-400/80">
                    (inclusi temporaneamente in modalità Tutti)
                  </span>
                ) : null}
              </button>

              {panchinaExpanded ? (
                <div className="mt-2">
                  {panchinaAssets.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#263042] bg-[#0B0E14]/50 px-3 py-2 text-xs text-slate-500">
                      Nessun asset in panchina. Usa il pulsante &quot;Panchina&quot; su qualsiasi Titolare per metterlo in panchina.
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {panchinaAssets.map((asset) => {
                        const visualChecked = portfolioFilterMode === 'all';
                        return (
                          <div
                            key={asset}
                            className={`inline-flex items-center overflow-hidden rounded-md border font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                              visualChecked
                                ? 'border-emerald-500/40 bg-emerald-500/5 text-slate-300'
                                : 'border-[#1E2634] bg-[#0B0E14] text-slate-400'
                            }`}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={false}
                              onClick={() =>
                                handleTogglePortfolioAsset(asset, backtestPortfolioAssets)
                              }
                              className="inline-flex items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-white/5 hover:text-slate-200"
                            >
                              <span
                                className={`flex h-3.5 w-3.5 items-center justify-center rounded-xs border ${
                                  visualChecked
                                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                                    : 'border-slate-600 bg-transparent'
                                }`}
                              >
                                {visualChecked ? (
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                ) : null}
                              </span>
                              <span>{asset}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleTogglePortfolioAsset(asset, backtestPortfolioAssets)
                              }
                              title={`Promuovi ${asset} nei Titolari`}
                              aria-label={`Promuovi ${asset} nei Titolari`}
                              className="inline-flex items-center gap-1 border-l border-[#263042] bg-[#121721] px-2 py-1.5 text-[10px] font-sans font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 hover:text-emerald-200"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                              <span>Titolare</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* TAB 1: DASHBOARD & COMPARISON */}
        {activeTab === 'dashboard' ? (
          <div className="space-y-8">
            {/* Google Sheets Last Sync Summary & "Show Last Synced (X)" Filter Toggle */}
            {lastSyncStats || lastSyncedTrades.length > 0 ? (
              <section
                aria-label="Last Synced Filter"
                className={`rounded-lg border px-4 py-3.5 ${
                  isLastSyncedFilterActive
                    ? 'border-sky-500/50 bg-sky-500/10'
                    : 'border-[#1E2634] bg-[#121721]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400" />
                    {lastSyncStats ? (
                      <span className="font-medium text-slate-200">
                        Sync {lastSyncStats.label}:{' '}
                        <span className="font-mono text-slate-300">
                          {lastSyncStats.skipped} vecchi
                        </span>{' '}
                        <span className="text-slate-500">+</span>{' '}
                        <span className="font-mono font-semibold text-emerald-400">
                          {lastSyncStats.added} nuovi
                        </span>
                      </span>
                    ) : null}

                    {isLastSyncedFilterActive ? (
                      <span className="rounded border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-200">
                        {lang === 'en'
                          ? 'Dashboard filtered to newly synced trades'
                          : 'Dashboard filtrata sui nuovi trade sincronizzati'}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {lastSyncedTrades.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowLastSyncedOnly((prev) => !prev)}
                        aria-pressed={showLastSyncedOnly}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap ${
                          showLastSyncedOnly
                            ? 'border-sky-400 bg-sky-600 text-white shadow-xs'
                            : 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                        }`}
                      >
                        <span>Show Last Synced ({lastSyncedTrades.length})</span>
                      </button>
                    ) : null}

                    {showLastSyncedOnly ? (
                      <button
                        type="button"
                        onClick={() => setShowLastSyncedOnly(false)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>
                          {lang === 'en' ? 'Show All Trades' : 'Mostra Tutti'}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {isLastSyncedFilterActive ? (
                  <div className="mt-3 overflow-x-auto rounded-md border border-[#1E2634] bg-[#0B0E14]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#1E2634] text-[11px] text-slate-400">
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Sezione</th>
                          <th className="px-3 py-2">Asset</th>
                          <th className="px-3 py-2">Setup</th>
                          <th className="px-3 py-2">Esito</th>
                          <th className="px-3 py-2 text-right"># R</th>
                          <th className="px-3 py-2">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E2634] font-mono text-[11px] tabular-nums">
                        {lastSyncedTrades.map((tr) => (
                          <tr key={tr.id} className="hover:bg-[#121721]">
                            <td className="px-3 py-2 text-slate-300">
                              {formatDisplayDate(tr.date)}
                              {tr.entryTime ? ` · ${tr.entryTime}` : ''}
                            </td>
                            <td className="px-3 py-2 font-sans">
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                  tr.category === 'live'
                                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                                    : tr.category === 'missed'
                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                }`}
                              >
                                {tr.category === 'live'
                                  ? 'Journal Reale'
                                  : tr.category === 'missed'
                                    ? 'Trade Non Presi'
                                    : 'Backtest'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-100">
                              {tr.asset}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{tr.setup}</td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  tr.outcome === 'TP'
                                    ? 'text-emerald-400'
                                    : tr.outcome === 'STOP LOSS'
                                      ? 'text-rose-400'
                                      : 'text-slate-300'
                                }
                              >
                                {tr.outcome}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold ${
                                tr.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatR(tr.netR)}
                            </td>
                            <td className="max-w-xs truncate px-3 py-2 font-sans text-slate-400">
                              {tr.notes || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Portfolio Rotation Alert Banner (Last 30 Days vs Latest DB Trade Date) */}
            {portfolioRotationAlert ? (
              <section
                role="status"
                aria-label="Portfolio Rotation Alert"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-amber-200">
                        🚀 Opportunità Rotazione: {portfolioRotationAlert.opportunities[0].asset} (
                        {formatR(portfolioRotationAlert.opportunities[0].netR)} negli ultimi 30gg) sta
                        sovraperformando {portfolioRotationAlert.opportunities[0].comparedAsset} (
                        {formatR(portfolioRotationAlert.opportunities[0].comparedNetR)})
                      </span>
                      <span className="rounded border border-amber-500/30 bg-[#0B0E14]/70 px-2 py-0.5 font-mono text-[10px] text-amber-300/90 tabular-nums">
                        {formatDisplayDate(portfolioRotationAlert.windowStart)} →{' '}
                        {formatDisplayDate(portfolioRotationAlert.latestDate)}
                      </span>
                    </div>

                    {portfolioRotationAlert.opportunities.length > 1 ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-100/85">
                        {portfolioRotationAlert.opportunities.slice(1).map((opp) => (
                          <span key={opp.asset} className="font-mono">
                            • {opp.asset} ({formatR(opp.netR)}) &gt; {opp.comparedAsset} (
                            {formatR(opp.comparedNetR)})
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {portfolioRotationAlert.opportunities.map((opp) => (
                      <button
                        key={opp.asset}
                        type="button"
                        onClick={() =>
                          handleTogglePortfolioAsset(opp.asset, backtestPortfolioAssets)
                        }
                        className="rounded border border-amber-400/40 bg-[#0B0E14]/80 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-200 transition-colors hover:border-amber-300 hover:bg-amber-500/20 whitespace-nowrap"
                      >
                        + Attiva {opp.asset}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* Prominent Dedicated Akinator Backtest-Only KPI Card at Very Top */}
            <AkinatorCard scan={dashboardAkinatorScan} t={t} />

            {/* Comparison KPI Strip */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-slate-100">
                    {t.dashboard.heading}
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {t.dashboard.subheading}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Periodo confronto Dashboard"
                    className="inline-flex flex-wrap items-center rounded-lg border border-[#1E2634] bg-[#0B0E14] p-1 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setDashboardRangeMode('live_period')}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                        dashboardRangeMode === 'live_period'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {lang === 'en'
                        ? 'Live Period (from first live trade)'
                        : lang === 'es'
                          ? 'Período Live (desde primer trade real)'
                          : 'Periodo Live (dal primo trade reale)'}
                      {liveStartDate ? (
                        <span
                          className={`ml-1.5 font-mono text-[11px] ${
                            dashboardRangeMode === 'live_period'
                              ? 'text-sky-100'
                              : 'text-slate-500'
                          }`}
                        >
                          · {formatDisplayDate(liveStartDate)}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardRangeMode('all_backtest')}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                        dashboardRangeMode === 'all_backtest'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {lang === 'en'
                        ? 'Full Backtest History'
                        : lang === 'es'
                          ? 'Todo el Histórico Backtest'
                          : 'Tutto lo Storico Backtest'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-400">
                      {t.dashboard.backtestNetR}
                    </span>
                    {isLiveAligned && liveStartDate ? (
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                        ≥ {formatDisplayDate(liveStartDate)}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      dashboardBacktestStats.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatR(dashboardBacktestStats.netR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {dashboardBacktestStats.totalTrades} trades ·{' '}
                    {dashboardBacktestStats.winRatePct.toFixed(1)}% WR ·{' '}
                    <span>
                      {lang === 'en' ? 'Avg R:R' : 'RR Medio'}:{' '}
                      <span className="font-semibold text-slate-200">
                        {dashboardBacktestStats.payoffRatio === null
                          ? 'Max'
                          : `${dashboardBacktestStats.payoffRatio.toFixed(2)} : 1`}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                    {dashboardBacktestStats.wins} TP · {dashboardBacktestStats.losses} SL ·{' '}
                    {dashboardBacktestStats.breakevens} BE · {dashboardBacktestStats.unfilled} UF
                  </div>
                </div>

                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-400">
                      {t.dashboard.liveNetR}
                    </span>
                    {dashboardWorkPauseComparison.excludedLiveCount > 0 ? (
                      <span className="font-mono text-[10px] text-amber-300/90">
                        {lang === 'en'
                          ? `Excl. ${dashboardWorkPauseComparison.excludedLiveCount} PAUSA LAVORO`
                          : lang === 'es'
                            ? `Sin ${dashboardWorkPauseComparison.excludedLiveCount} PAUSA LAVORO`
                            : `Escl. ${dashboardWorkPauseComparison.excludedLiveCount} PAUSA LAVORO`}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      dashboardLiveStats.netR >= 0 ? 'text-sky-400' : 'text-rose-400'
                    }`}
                  >
                    {formatR(dashboardLiveStats.netR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {dashboardLiveStats.totalTrades} trades ·{' '}
                    {dashboardLiveStats.winRatePct.toFixed(1)}% WR ·{' '}
                    <span>
                      {lang === 'en' ? 'Avg R:R' : 'RR Medio'}:{' '}
                      <span className="font-semibold text-slate-200">
                        {dashboardLiveStats.payoffRatio === null
                          ? 'Max'
                          : `${dashboardLiveStats.payoffRatio.toFixed(2)} : 1`}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                    {dashboardLiveStats.wins} TP · {dashboardLiveStats.losses} SL ·{' '}
                    {dashboardLiveStats.breakevens} BE · {dashboardLiveStats.unfilled} UF
                  </div>
                </div>

                <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                  <div className="text-xs font-medium text-slate-400">
                    {t.dashboard.executionGap}
                  </div>
                  <div
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      dashboardExecutionDeltaR >= 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {formatR(dashboardExecutionDeltaR)}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
                    {t.dashboard.liveSeries}: {formatR(dashboardLiveStats.netR)} · {t.dashboard.backtestSeries}:{' '}
                    {formatR(dashboardBacktestStats.netR)}
                  </div>
                  {(() => {
                    const liveRR = dashboardLiveStats.payoffRatio;
                    const btRR = dashboardBacktestStats.payoffRatio;
                    const hasBothTrades =
                      dashboardLiveStats.totalTrades > 0 &&
                      dashboardBacktestStats.totalTrades > 0;
                    if (!hasBothTrades || liveRR === null || btRR === null) {
                      return (
                        <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                          {lang === 'en'
                            ? 'R:R Variance:'
                            : lang === 'es'
                              ? 'Diferencia R:R:'
                              : 'Scostamento RR Medio:'}{' '}
                          {hasBothTrades
                            ? `${liveRR === null ? 'Max' : `${liveRR.toFixed(2)}:1`} vs ${btRR === null ? 'Max' : `${btRR.toFixed(2)}:1`}`
                            : 'N/D'}
                        </div>
                      );
                    }
                    const rrDelta = roundTo(liveRR - btRR, 2);
                    const rrSign = rrDelta > 0 ? '+' : '';
                    return (
                      <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                        {lang === 'en'
                          ? 'R:R Variance:'
                          : lang === 'es'
                            ? 'Diferencia R:R:'
                            : 'Scostamento RR Medio:'}{' '}
                        <span
                          className={`font-semibold ${
                            rrDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {rrSign}
                          {rrDelta.toFixed(2)}
                        </span>{' '}
                        <span className="text-slate-500">
                          ({liveRR.toFixed(2)} vs {btRR.toFixed(2)})
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {(() => {
                  const btExecuted = dashboardBacktestStats.executedTradesCount;
                  const btNetExpectancy = dashboardBacktestStats.avgRExcludingUf;
                  const btWinPct = dashboardBacktestStats.winRatePct;
                  const btLossPct =
                    btExecuted > 0
                      ? roundTo((dashboardBacktestStats.losses / btExecuted) * 100, 1)
                      : 0;
                  const btAvgWinR = dashboardBacktestStats.avgWinR;
                  const btAvgLossR = dashboardBacktestStats.avgLossR;
                  const btPfText = dashboardBacktestStats.profitFactorInfinite
                    ? '∞'
                    : dashboardBacktestStats.profitFactor.toFixed(2);

                  return (
                    <div className="rounded-lg border border-sky-500/45 bg-gradient-to-b from-sky-500/[0.08] to-[#121721] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold text-sky-300">
                          {lang === 'en'
                            ? 'Math Expectancy · Backtest Only'
                            : lang === 'es'
                              ? 'Esperanza Matemática · Solo Backtest'
                              : 'Expectancy Matematica · Solo Backtest'}
                        </span>
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-300 whitespace-nowrap">
                          {lang === 'en'
                            ? 'Backtest Only (Benchmark)'
                            : lang === 'es'
                              ? 'Solo Backtest (Benchmark)'
                              : 'Solo Backtest (Benchmark)'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span
                          className={`font-mono text-2xl font-bold tabular-nums ${
                            btNetExpectancy > 0
                              ? 'text-emerald-400'
                              : btNetExpectancy < 0
                                ? 'text-rose-400'
                                : 'text-slate-100'
                          }`}
                        >
                          {formatR(btNetExpectancy)}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {lang === 'en'
                            ? '/ exec. trade'
                            : lang === 'es'
                              ? '/ trade ejec.'
                              : '/ trade eseg.'}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[11px] text-slate-300 tabular-nums">
                        <span className="text-emerald-300">
                          ({btWinPct.toFixed(1)}% × +{btAvgWinR.toFixed(2)}R)
                        </span>{' '}
                        <span className="text-slate-500">−</span>{' '}
                        <span className="text-rose-300">
                          ({btLossPct.toFixed(1)}% × {btAvgLossR.toFixed(2)}R)
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                        {btExecuted}{' '}
                        {lang === 'en'
                          ? 'exec.'
                          : lang === 'es'
                            ? 'ejec.'
                            : 'eseg.'}{' '}
                        {lang === 'en'
                          ? '(excl. UF)'
                          : lang === 'es'
                            ? '(sin UF)'
                            : '(escl. UF)'}{' '}
                        · WR {btWinPct.toFixed(1)}% · PF{' '}
                        <span className="font-semibold text-slate-200">{btPfText}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Separate Work Hours Tracking: Missed R during PAUSA LAVORO alongside Full Backtest Benchmark */}
              <div className="rounded-lg border border-amber-500/35 bg-[#121721] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-amber-300">
                      {lang === 'en'
                        ? 'Missed R During Work Hours (PAUSA LAVORO)'
                        : lang === 'es'
                          ? 'R Perdidos en Horario Laboral (PAUSA LAVORO)'
                          : 'R Mancati in Orario Lavorativo (PAUSA LAVORO)'}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {lang === 'en'
                        ? 'Excluded from Real Win Rate, Real Net R, and operational errors · tracked alongside full Backtest benchmark.'
                        : lang === 'es'
                          ? 'Excluidos de Win Rate Real, R Neto Real y errores operativos · comparados con el benchmark completo de Backtest.'
                          : 'Esclusi da Win Rate Reale, R Netto Reale ed errori operativi · tracciati separatamente accanto al benchmark Backtest completo.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] text-slate-400">
                        {lang === 'en'
                          ? 'Missed R (Work Hours)'
                          : lang === 'es'
                            ? 'R Perdidos (Trabajo)'
                            : 'R Mancati (Pausa Lavoro)'}
                      </div>
                      <div
                        className={`text-base font-bold ${
                          dashboardWorkPauseStats.totalTrades === 0
                            ? 'text-slate-400'
                            : dashboardWorkPauseStats.netR > 0
                              ? 'text-amber-300'
                              : dashboardWorkPauseStats.netR < 0
                                ? 'text-emerald-400'
                                : 'text-slate-200'
                        }`}
                      >
                        {formatR(dashboardWorkPauseStats.netR)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {dashboardWorkPauseStats.totalTrades} trade ({dashboardWorkPauseStats.wins} TP ·{' '}
                        {dashboardWorkPauseStats.losses} SL · {dashboardWorkPauseStats.breakevens} BE)
                      </div>
                    </div>

                    <div className="hidden h-8 w-px bg-[#1E2634] sm:block" />

                    <div>
                      <div className="text-[10px] text-slate-400">
                        {lang === 'en' ? 'Full Backtest' : 'Backtest Completo'}
                      </div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {formatR(dashboardBacktestStats.netR)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        WR {dashboardBacktestStats.winRatePct.toFixed(1)}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400">
                        {lang === 'en' ? 'Real Live (Clean)' : 'Reale (Escl. Lavoro)'}
                      </div>
                      <div className="text-sm font-semibold text-sky-400">
                        {formatR(dashboardLiveStats.netR)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        WR {dashboardLiveStats.winRatePct.toFixed(1)}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400">
                        {lang === 'en'
                          ? 'Execution Delta (Excl. Work)'
                          : lang === 'es'
                            ? 'Delta Neto (Sin Trabajo)'
                            : 'Scostamento Netto (Escl. Lavoro)'}
                      </div>
                      {(() => {
                        const netExclWork = roundTo(
                          dashboardLiveStats.netR -
                            (dashboardBacktestStats.netR - dashboardWorkPauseStats.netR),
                          2,
                        );
                        return (
                          <div
                            className={`text-sm font-semibold ${
                              netExclWork >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatR(netExclWork)}
                          </div>
                        );
                      })()}
                      <div className="text-[10px] text-slate-500">
                        {lang === 'en' ? 'vs reachable BT' : 'vs BT raggiungibile'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Discipline & Execution Coach (Dashboard-only Gemini diagnostic) */}
            <AiDisciplineCoachCard
              lang={lang}
              assetFilter={assetFilter}
              selectedSetup={selectedSetup}
              rangeMode={dashboardRangeMode}
              liveStartDate={effectiveLiveComparisonStartDate}
              liveStartDateByAsset={liveStartDateByAsset}
              liveStats={dashboardLiveStats}
              backtestStats={
                liveStartDateByAsset.size > 0
                  ? liveAlignedBacktestStats
                  : dashboardBacktestStats
              }
              liveTrades={visibleDashboardLiveTrades}
              backtestTrades={liveAlignedBacktestTrades}
              missedTrades={liveAlignedMissedTrades}
              onLastMistakeClick={handleLastMistakeClick}
            />

            {/* Dual Date-Aligned Equity Curve */}
            <EquityChart
              title={t.dashboard.equityTitle}
              subtitle={
                isLiveAligned && liveStartDate
                  ? `${t.dashboard.equitySubtitle} · Timeline allineata dal ${formatDisplayDate(liveStartDate)}`
                  : `${t.dashboard.equitySubtitle} · Timeline cronologica condivisa`
              }
              emptyMessage={t.dashboard.noEquityData}
              xAxisMode="date"
              dateRangeStart={isLiveAligned && liveStartDate ? liveStartDate : undefined}
              primarySeries={{
                label: t.dashboard.backtestSeries,
                color: '#10B981',
                stats: dashboardBacktestStats,
              }}
              secondarySeries={{
                label: t.dashboard.liveSeries,
                color: '#38BDF8',
                stats: dashboardLiveStats,
              }}
            />

            {/* Compact Mon-Fri Breakdown (Combined Backtest + Live Data) */}
            <WeekdayBreakdownCard
              trades={visibleDashboardCombinedTrades}
              lang={lang}
              subtitle={
                lang === 'en'
                  ? 'Combined Backtest + Live Journaling performance by trading day (Avg R & Win Rate exclude UF).'
                  : lang === 'es'
                    ? 'Rendimiento combinado Backtest + Live por día operativo (Avg R y Win Rate excluyen UF).'
                    : 'Performance combinata Backtest + Journal Reale per giorno operativo (Avg R e Win Rate escludono UF).'
              }
              emptyMessage={t.dashboard.noEquityData}
            />

            {/* Comparison Matrix Table */}
            <section className="overflow-hidden rounded-lg border border-[#1E2634] bg-[#121721]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2634] px-5 py-3.5">
                <h3 className="text-sm font-semibold text-slate-100">
                  {t.dashboard.comparisonTableTitle}
                </h3>
                {isLiveAligned && liveStartDate ? (
                  <span className="font-mono text-[11px] text-emerald-300/90">
                    {lang === 'en'
                      ? `Aligned from ${formatDisplayDate(liveStartDate)}`
                      : lang === 'es'
                        ? `Alineado desde ${formatDisplayDate(liveStartDate)}`
                        : `Allineato dal ${formatDisplayDate(liveStartDate)}`}
                  </span>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-slate-400">
                      <th className="px-5 py-3">{t.dashboard.metricCol}</th>
                      <th className="px-5 py-3 text-right">{t.nav.backtest}</th>
                      <th className="px-5 py-3 text-right">
                        <div>{t.nav.live}</div>
                        {dashboardWorkPauseComparison.excludedLiveCount > 0 ? (
                          <div className="font-mono text-[10px] font-normal text-slate-500">
                            {lang === 'en' ? 'excl. PAUSA LAVORO' : 'escl. PAUSA LAVORO'}
                          </div>
                        ) : null}
                      </th>
                      <th className="px-5 py-3 text-right text-amber-300">
                        <div>
                          {lang === 'en' ? 'Work Hours (Missed)' : 'Pausa Lavoro (R Mancati)'}
                        </div>
                        <div className="font-mono text-[10px] font-normal text-slate-500">
                          PAUSA LAVORO
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2634] font-mono tabular-nums">
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.tradesCount}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        <div>{dashboardBacktestStats.totalTrades}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {dashboardBacktestStats.wins} TP · {dashboardBacktestStats.losses} SL ·{' '}
                          {dashboardBacktestStats.breakevens} BE · {dashboardBacktestStats.unfilled} UF
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        <div>{dashboardLiveStats.totalTrades}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {dashboardLiveStats.wins} TP · {dashboardLiveStats.losses} SL ·{' '}
                          {dashboardLiveStats.breakevens} BE · {dashboardLiveStats.unfilled} UF
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-amber-200">
                        <div>{dashboardWorkPauseStats.totalTrades}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {dashboardWorkPauseStats.wins} TP · {dashboardWorkPauseStats.losses} SL ·{' '}
                          {dashboardWorkPauseStats.breakevens} BE · {dashboardWorkPauseStats.unfilled} UF
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.winRate}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardBacktestStats.winRatePct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardLiveStats.winRatePct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 text-right text-amber-200">
                        {dashboardWorkPauseStats.totalTrades > 0
                          ? `${dashboardWorkPauseStats.winRatePct.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.journal.netRR}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-400">
                        {formatR(dashboardBacktestStats.netR)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-sky-400">
                        {formatR(dashboardLiveStats.netR)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-300">
                        {dashboardWorkPauseStats.totalTrades > 0
                          ? formatR(dashboardWorkPauseStats.netR)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.expectancy}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {formatR(dashboardBacktestStats.expectancyR)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {formatR(dashboardLiveStats.expectancyR)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">
                        {dashboardWorkPauseStats.totalTrades > 0
                          ? formatR(dashboardWorkPauseStats.expectancyR)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.maxDrawdown}
                      </td>
                      <td className="px-5 py-3 text-right text-rose-400">
                        -{dashboardBacktestStats.maxDrawdownR.toFixed(2)} R
                      </td>
                      <td className="px-5 py-3 text-right text-rose-400">
                        -{dashboardLiveStats.maxDrawdownR.toFixed(2)} R
                      </td>
                      <td className="px-5 py-3 text-right text-rose-300">
                        {dashboardWorkPauseStats.totalTrades > 0
                          ? `-${dashboardWorkPauseStats.maxDrawdownR.toFixed(2)} R`
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        {t.dashboard.profitFactor}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardBacktestStats.profitFactorInfinite
                          ? 'Max'
                          : dashboardBacktestStats.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardLiveStats.profitFactorInfinite ? 'Max' : dashboardLiveStats.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">
                        {dashboardWorkPauseStats.totalTrades === 0
                          ? '—'
                          : dashboardWorkPauseStats.profitFactorInfinite
                            ? 'Max'
                            : dashboardWorkPauseStats.profitFactor.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Payoff Ratio (R:R)
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardBacktestStats.payoffRatio === null
                          ? 'Max'
                          : `${dashboardBacktestStats.payoffRatio.toFixed(2)} : 1`}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardLiveStats.payoffRatio === null ? 'Max' : `${dashboardLiveStats.payoffRatio.toFixed(2)} : 1`}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">
                        {dashboardWorkPauseStats.totalTrades === 0
                          ? '—'
                          : dashboardWorkPauseStats.payoffRatio === null
                            ? 'Max'
                            : `${dashboardWorkPauseStats.payoffRatio.toFixed(2)} : 1`}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Sharpe Ratio / Sortino Ratio
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardBacktestStats.sharpeRatio !== null
                          ? dashboardBacktestStats.sharpeRatio.toFixed(2)
                          : '0.00'}{' '}
                        /{' '}
                        {dashboardBacktestStats.sortinoInfinite
                          ? 'Max'
                          : dashboardBacktestStats.sortinoRatio !== null
                            ? dashboardBacktestStats.sortinoRatio.toFixed(2)
                            : '0.00'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardLiveStats.sharpeRatio !== null ? dashboardLiveStats.sharpeRatio.toFixed(2) : '0.00'} /{' '}
                        {dashboardLiveStats.sortinoInfinite
                          ? 'Max'
                          : dashboardLiveStats.sortinoRatio !== null
                            ? dashboardLiveStats.sortinoRatio.toFixed(2)
                            : '0.00'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">
                        {dashboardWorkPauseStats.totalTrades === 0
                          ? '—'
                          : `${
                              dashboardWorkPauseStats.sharpeRatio !== null
                                ? dashboardWorkPauseStats.sharpeRatio.toFixed(2)
                                : '0.00'
                            } / ${
                              dashboardWorkPauseStats.sortinoInfinite
                                ? 'Max'
                                : dashboardWorkPauseStats.sortinoRatio !== null
                                  ? dashboardWorkPauseStats.sortinoRatio.toFixed(2)
                                  : '0.00'
                            }`}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Calmar / Recovery Factor
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardBacktestStats.calmarRatio !== null
                          ? dashboardBacktestStats.calmarRatio.toFixed(2)
                          : 'N/A'}{' '}
                        /{' '}
                        {dashboardBacktestStats.recoveryFactor !== null
                          ? dashboardBacktestStats.recoveryFactor.toFixed(2)
                          : 'Max'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-100">
                        {dashboardLiveStats.calmarRatio !== null ? dashboardLiveStats.calmarRatio.toFixed(2) : 'N/A'} /{' '}
                        {dashboardLiveStats.recoveryFactor !== null ? dashboardLiveStats.recoveryFactor.toFixed(2) : 'Max'}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">
                        {dashboardWorkPauseStats.totalTrades === 0
                          ? '—'
                          : `${
                              dashboardWorkPauseStats.calmarRatio !== null
                                ? dashboardWorkPauseStats.calmarRatio.toFixed(2)
                                : 'N/A'
                            } / ${
                              dashboardWorkPauseStats.recoveryFactor !== null
                                ? dashboardWorkPauseStats.recoveryFactor.toFixed(2)
                                : 'Max'
                            }`}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Risk of Ruin (20R)
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-400">
                        {dashboardBacktestStats.riskOfRuinPct.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3 text-right text-sky-400">
                        {dashboardLiveStats.riskOfRuinPct.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3 text-right text-amber-300">
                        {dashboardWorkPauseStats.totalTrades > 0
                          ? `${dashboardWorkPauseStats.riskOfRuinPct.toFixed(2)}%`
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Institutional Analytics Summary: Backtest vs. Journal Reale */}
            <InstitutionalMetricsPanel
              stats={dashboardBacktestStats}
              pnlPrimaryStats={
                liveStartDateByAsset.size > 0
                  ? liveAlignedBacktestStats
                  : undefined
              }
              comparisonStats={dashboardLiveStats}
              liveStartDate={effectiveLiveComparisonStartDate}
              primaryLabel={t.nav.backtest}
              comparisonLabel={t.nav.live}
              lang={lang}
              pnlMode={dashboardPnlMode}
              onPnlModeChange={(nextMode) => {
                setDashboardPnlMode(nextMode);
                setSelectedPnlPeriod(null);
              }}
              selectedPeriod={effectiveSelectedPnlPeriod}
              onSelectPeriod={(period) => setSelectedPnlPeriod(period)}
            />

            {/* Interactive Period Detail & Execution Discrepancy Inspector */}
            <PeriodDiscrepancyPanel
              lang={lang}
              pnlMode={dashboardPnlMode}
              selectedPeriod={effectiveSelectedPnlPeriod}
              periodLabel={effectiveSelectedPnlPeriodLabel}
              liveStartDateByAsset={liveStartDateByAsset}
              backtestTrades={liveAlignedBacktestTrades}
              liveTrades={visibleDashboardLiveTrades}
              missedTrades={liveAlignedMissedTrades}
              onSaveTrade={handleSaveTrade}
            />

            {/* Collapsible Fixed R Target Simulation (Based on RR Max, Backtest-only) */}
            <FixedTargetSimulationCard
              lang={lang}
              assetFilter={assetFilter}
              allAssetsBacktestTrades={allAssetsDashboardBacktestTrades}
              selectedAssetBacktestTrades={visibleDashboardBacktestTrades}
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
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-slate-400 tabular-nums">
                  <span>{backtestStats.wins} TP</span>
                  <span>·</span>
                  <span>{backtestStats.losses} SL</span>
                  <span>·</span>
                  <span>{backtestStats.breakevens} BE</span>
                  <span>·</span>
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
                    {backtestStats.unfilled} UF
                  </span>
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
              <div className="rounded-lg border border-emerald-500/45 bg-gradient-to-b from-emerald-500/[0.08] to-[#121721] p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-300">
                    {lang === 'en'
                      ? 'Avg R (excl. UF)'
                      : lang === 'es'
                        ? 'Avg R (sin UF)'
                        : 'Avg R (escl. UF)'}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {backtestStats.executedTradesCount}{' '}
                    {lang === 'en'
                      ? 'exec.'
                      : lang === 'es'
                        ? 'ejec.'
                        : 'eseg.'}
                  </span>
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    backtestStats.avgRExcludingUf > 0
                      ? 'text-emerald-400'
                      : backtestStats.avgRExcludingUf < 0
                        ? 'text-rose-400'
                        : 'text-slate-100'
                  }`}
                >
                  {formatR(backtestStats.avgRExcludingUf)}
                </div>
                <div className="mt-1.5 font-mono text-xs text-slate-300 tabular-nums">
                  {lang === 'en'
                    ? `Incl. UF: ${formatR(backtestStats.expectancyR)} · ${backtestStats.unfilled} UF excl.`
                    : lang === 'es'
                      ? `Incl. UF: ${formatR(backtestStats.expectancyR)} · ${backtestStats.unfilled} UF excl.`
                      : `Incl. UF: ${formatR(backtestStats.expectancyR)} · ${backtestStats.unfilled} UF escl.`}
                </div>
                <div className="mt-1 font-mono text-[11px] text-rose-400 tabular-nums">
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

            <WeekdayBreakdownCard
              trades={dashboardPortfolioBacktest}
              lang={lang}
              subtitle={
                lang === 'en'
                  ? `Backtest performance by trading day (${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''} · Avg R & Win Rate exclude UF).`
                  : lang === 'es'
                    ? `Rendimiento Backtest por día operativo (${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''} · Avg R y Win Rate excluyen UF).`
                    : `Performance Backtest per giorno operativo (${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''} · Avg R e Win Rate escludono UF).`
              }
              emptyMessage={t.journal.emptyBacktest}
            />

            <DrawdownChart
              subtitle={`Andamento sincronizzato dei ribassi dal picco di equity (Backtest — ${selectedSetup}${assetFilter !== 'ALL' ? ` · ${assetFilter}` : ''}).`}
              emptyMessage={t.journal.emptyBacktest}
              stats={backtestStats}
            />

            <InstitutionalMetricsPanel stats={backtestStats} lang={lang} />

            <div className="space-y-3 rounded-lg border border-[#1E2634] bg-[#121721]/60 p-3.5">
              <SetupFilterBar
                selectedSetup={selectedSetup}
                onSelectSetup={handleSetupChange}
                availableCustomSetups={customSetups}
                label={t.common.filterBySetup}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.journal.searchPlaceholder}
                  className="w-full max-w-xs rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                  className="rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">{t.journal.outcomeFilterAll}</option>
                  <option value="TP">TP</option>
                  <option value="STOP LOSS">STOP LOSS</option>
                  <option value="BE">BE</option>
                  <option value="UNFILLED">UNFILLED</option>
                </select>
              </div>
            </div>

            {focusedMistakeFilter && focusedMistakeFilter.category === 'backtest' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-rose-200">
                  <span className="font-semibold">
                    {lang === 'en'
                      ? `Filtered by last mistake date: ${formatDisplayDate(focusedMistakeFilter.date)}`
                      : lang === 'es'
                        ? `Filtrado por fecha del último error: ${formatDisplayDate(focusedMistakeFilter.date)}`
                        : `Filtro attivo su ultimo errore: ${formatDisplayDate(focusedMistakeFilter.date)}`}
                  </span>
                  <span className="text-rose-300/80">
                    ({focusedMistakeFilter.tradeIds.length}{' '}
                    {focusedMistakeFilter.tradeIds.length === 1
                      ? lang === 'en'
                        ? 'entry highlighted'
                        : 'voce evidenziata'
                      : lang === 'en'
                        ? 'entries highlighted'
                        : 'voci evidenziate'}
                    )
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFocusedMistakeFilter(null)}
                  className="rounded border border-rose-400/40 bg-[#0B0E14] px-2.5 py-1 font-medium text-rose-200 transition-colors hover:border-rose-300 hover:text-white"
                >
                  {lang === 'en'
                    ? 'Show all trades'
                    : lang === 'es'
                      ? 'Mostrar todas las operaciones'
                      : 'Mostra tutti i trade'}
                </button>
              </div>
            ) : null}

            <TradeTable
              trades={(() => {
                const base = applySearchAndSubFilters(dashboardPortfolioBacktest, 'backtest');
                if (focusedMistakeFilter?.category !== 'backtest') return base;
                const byDateInPortfolio = base.filter(
                  (tr) => tr.date === focusedMistakeFilter.date,
                );
                if (byDateInPortfolio.length > 0) return byDateInPortfolio;
                return backtestTrades.filter(
                  (tr) =>
                    tr.category === 'backtest' && tr.date === focusedMistakeFilter.date,
                );
              })()}
              category="backtest"
              t={t}
              emptyMessage={t.journal.emptyBacktest}
              highlightedTradeIds={
                focusedMistakeFilter?.category === 'backtest'
                  ? focusedMistakeFilter.tradeIds
                  : undefined
              }
              highlightDate={
                focusedMistakeFilter?.category === 'backtest'
                  ? focusedMistakeFilter.date
                  : null
              }
              onAddFirst={() => {
                setEditingTrade(null);
                setTradeModalCategory('backtest');
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400">
                    {t.journal.totalTrades}
                  </span>
                  {excludedTabLiveWorkPauseCount > 0 ? (
                    <span className="font-mono text-[10px] text-amber-300/90">
                      {lang === 'en'
                        ? `Excl. ${excludedTabLiveWorkPauseCount} PAUSA LAVORO`
                        : `Escl. ${excludedTabLiveWorkPauseCount} PAUSA LAVORO`}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {liveStats.totalTrades}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-slate-400 tabular-nums">
                  <span>{liveStats.wins} TP</span>
                  <span>·</span>
                  <span>{liveStats.losses} SL</span>
                  <span>·</span>
                  <span>{liveStats.breakevens} BE</span>
                  <span>·</span>
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
                    {liveStats.unfilled} UF
                  </span>
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

            <div className="space-y-3 rounded-lg border border-[#1E2634] bg-[#121721]/60 p-3.5">
              <SetupFilterBar
                selectedSetup={selectedSetup}
                onSelectSetup={handleSetupChange}
                availableCustomSetups={customSetups}
                label={t.common.filterBySetup}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.journal.searchPlaceholder}
                  className="w-full max-w-xs rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                  className="rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">{t.journal.outcomeFilterAll}</option>
                  <option value="TP">TP</option>
                  <option value="STOP LOSS">STOP LOSS</option>
                  <option value="BE">BE</option>
                  <option value="UNFILLED">UNFILLED</option>
                </select>
              </div>
            </div>

            {focusedMistakeFilter && focusedMistakeFilter.category === 'live' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-rose-200">
                  <span className="font-semibold">
                    {lang === 'en'
                      ? `Filtered by last mistake date: ${formatDisplayDate(focusedMistakeFilter.date)}`
                      : lang === 'es'
                        ? `Filtrado por fecha del último error: ${formatDisplayDate(focusedMistakeFilter.date)}`
                        : `Filtro attivo su ultimo errore: ${formatDisplayDate(focusedMistakeFilter.date)}`}
                  </span>
                  <span className="text-rose-300/80">
                    ({focusedMistakeFilter.tradeIds.length}{' '}
                    {focusedMistakeFilter.tradeIds.length === 1
                      ? lang === 'en'
                        ? 'entry highlighted'
                        : 'voce evidenziata'
                      : lang === 'en'
                        ? 'entries highlighted'
                        : 'voci evidenziate'}
                    )
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFocusedMistakeFilter(null)}
                  className="rounded border border-rose-400/40 bg-[#0B0E14] px-2.5 py-1 font-medium text-rose-200 transition-colors hover:border-rose-300 hover:text-white"
                >
                  {lang === 'en'
                    ? 'Show all trades'
                    : lang === 'es'
                      ? 'Mostrar todas las operaciones'
                      : 'Mostra tutti i trade'}
                </button>
              </div>
            ) : null}

            <TradeTable
              trades={(() => {
                const base = applySearchAndSubFilters(dashboardPortfolioLive, 'live');
                if (focusedMistakeFilter?.category !== 'live') return base;
                const byDateInPortfolio = base.filter(
                  (tr) => tr.date === focusedMistakeFilter.date,
                );
                if (byDateInPortfolio.length > 0) return byDateInPortfolio;
                return liveTrades.filter(
                  (tr) =>
                    tr.category === 'live' && tr.date === focusedMistakeFilter.date,
                );
              })()}
              category="live"
              t={t}
              emptyMessage={t.journal.emptyLive}
              highlightedTradeIds={
                focusedMistakeFilter?.category === 'live'
                  ? focusedMistakeFilter.tradeIds
                  : undefined
              }
              highlightDate={
                focusedMistakeFilter?.category === 'live'
                  ? focusedMistakeFilter.date
                  : null
              }
              onAddFirst={() => {
                setEditingTrade(null);
                setTradeModalCategory('live');
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

        {/* TAB 4: TRADE NON PRESI / MISSED TRADES (100% Standalone Log) */}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#1E2634] bg-[#121721] p-5">
                <div className="text-xs font-medium text-slate-400">
                  {t.journal.missedTotal}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                  {missedStats.totalMissed}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-slate-400 tabular-nums">
                  <span>{missedStats.theoreticalWins} TP</span>
                  <span>·</span>
                  <span>{missedStats.avoidedLosses} SL</span>
                  <span>·</span>
                  <span>{missedStats.theoreticalBE} BE</span>
                  <span>·</span>
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
                    {missedStats.theoreticalUnfilled} UF
                  </span>
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

            <div className="space-y-3 rounded-lg border border-[#1E2634] bg-[#121721]/60 p-3.5">
              <SetupFilterBar
                selectedSetup={selectedSetup}
                onSelectSetup={handleSetupChange}
                availableCustomSetups={customSetups}
                label={t.common.filterBySetup}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.journal.searchPlaceholder}
                  className="w-full max-w-xs rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />
                <select
                  value={reasonFilter}
                  onChange={(e) => setReasonFilter(e.target.value)}
                  className="rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">{t.journal.reasonFilterAll}</option>
                  {MISSED_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {focusedMistakeFilter && focusedMistakeFilter.category === 'missed' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-rose-200">
                  <span className="font-semibold">
                    {lang === 'en'
                      ? `Filtered by last mistake date: ${formatDisplayDate(focusedMistakeFilter.date)}`
                      : lang === 'es'
                        ? `Filtrado por fecha del último error: ${formatDisplayDate(focusedMistakeFilter.date)}`
                        : `Filtro attivo su ultimo errore: ${formatDisplayDate(focusedMistakeFilter.date)}`}
                  </span>
                  <span className="text-rose-300/80">
                    ({focusedMistakeFilter.tradeIds.length}{' '}
                    {focusedMistakeFilter.tradeIds.length === 1
                      ? lang === 'en'
                        ? 'entry highlighted'
                        : 'voce evidenziata'
                      : lang === 'en'
                        ? 'entries highlighted'
                        : 'voci evidenziate'}
                    )
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFocusedMistakeFilter(null)}
                  className="rounded border border-rose-400/40 bg-[#0B0E14] px-2.5 py-1 font-medium text-rose-200 transition-colors hover:border-rose-300 hover:text-white"
                >
                  {lang === 'en'
                    ? 'Show all entries'
                    : lang === 'es'
                      ? 'Mostrar todos los registros'
                      : 'Mostra tutti i trade'}
                </button>
              </div>
            ) : null}

            <TradeTable
              trades={(() => {
                const base = applySearchAndSubFilters(filteredMissed, 'missed');
                if (focusedMistakeFilter?.category !== 'missed') return base;
                const byDateInFiltered = base.filter(
                  (tr) => tr.date === focusedMistakeFilter.date,
                );
                if (byDateInFiltered.length > 0) return byDateInFiltered;
                return missedTrades.filter(
                  (tr) =>
                    tr.category === 'missed' &&
                    tr.date === focusedMistakeFilter.date,
                );
              })()}
              category="missed"
              t={t}
              emptyMessage={t.journal.emptyMissed}
              highlightedTradeIds={
                focusedMistakeFilter?.category === 'missed'
                  ? focusedMistakeFilter.tradeIds
                  : undefined
              }
              highlightDate={
                focusedMistakeFilter?.category === 'missed'
                  ? focusedMistakeFilter.date
                  : null
              }
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
      </main>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 rounded-md border border-emerald-500/40 bg-[#161D2B] px-4 py-3 text-xs font-medium text-emerald-200 shadow-xl sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-lg"
        >
          {toast}
        </div>
      ) : null}

      <TradeModal
        isOpen={tradeModalOpen}
        initialCategory={tradeModalCategory}
        editingTrade={editingTrade}
        customSetups={customSetups}
        knownAssets={availableAssets}
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
            : importCategory === 'missed'
              ? missedTrades
              : liveTrades
        }
        t={t}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportTrades}
      />

      <GoogleSheetsSyncModal
        isOpen={googleSheetsModalOpen}
        lang={lang}
        defaultCategory={
          activeTab === 'live'
            ? 'live'
            : activeTab === 'missed'
              ? 'missed'
              : 'backtest'
        }
        sources={googleSheets}
        knownAssets={availableAssets}
        customAssets={customAssets}
        onClose={() => setGoogleSheetsModalOpen(false)}
        onAddSource={handleAddGoogleSheetSource}
        onDeleteSource={handleDeleteGoogleSheetSource}
        onSyncSingle={handleSyncSingleGoogleSheet}
        onSyncAll={handleSyncAllGoogleSheets}
        onOpenNewAssetModal={(prefillAsset) => {
          setNewAssetInitialSymbol(prefillAsset ?? '');
          setNewAssetModalOpen(true);
        }}
      />

      <NewAssetModal
        isOpen={newAssetModalOpen}
        lang={lang}
        defaultCategory={
          activeTab === 'live'
            ? 'live'
            : activeTab === 'missed'
              ? 'missed'
              : 'backtest'
        }
        initialAsset={newAssetInitialSymbol}
        onClose={() => {
          setNewAssetModalOpen(false);
          setNewAssetInitialSymbol('');
        }}
        onSave={handleSaveNewAsset}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        message={t.confirm.deleteMessage}
        isBusy={deletingSingle}
        t={t}
        onCancel={() => {
          if (!deletingSingle) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />

      <ConfirmModal
        isOpen={resetSectionTarget !== null}
        title={(() => {
          if (!resetSectionTarget) return t.confirm.deleteTitle;
          const sectionName = getSectionDisplayName(resetSectionTarget);
          const targetAsset = assetFilter.trim().toUpperCase();
          if (targetAsset === 'ALL') {
            if (lang === 'en') {
              return `Reset ${sectionName} (Step ${resetConfirmStep}/2)`;
            }
            if (lang === 'es') {
              return `Restablecer ${sectionName} (Paso ${resetConfirmStep}/2)`;
            }
            return `Resetta ${sectionName} (Conferma ${resetConfirmStep}/2)`;
          }
          if (lang === 'en') return `Reset ${sectionName} · ${targetAsset}`;
          if (lang === 'es') return `Restablecer ${sectionName} · ${targetAsset}`;
          return `Resetta ${sectionName} · ${targetAsset}`;
        })()}
        message={(() => {
          if (!resetSectionTarget) return '';
          const sectionName = getSectionDisplayName(resetSectionTarget);
          const targetAsset = assetFilter.trim().toUpperCase();
          const isAllAssets = targetAsset === 'ALL';
          const sectionList =
            resetSectionTarget === 'backtest'
              ? backtestTrades
              : resetSectionTarget === 'live'
                ? liveTrades
                : missedTrades;
          const count = isAllAssets
            ? sectionList.length
            : sectionList.filter(
                (tr) => tr.asset.trim().toUpperCase() === targetAsset,
              ).length;

          if (!isAllAssets) {
            if (lang === 'en') {
              return `Are you sure you want to permanently delete all ${count} trades for "${targetAsset}" in "${sectionName}" from Firebase? Trades for other assets and other sections will NOT be modified.`;
            }
            if (lang === 'es') {
              return `¿Seguro que quieres eliminar permanentemente las ${count} operaciones de "${targetAsset}" en "${sectionName}" de Firebase? Los demás activos y secciones NO se modificarán.`;
            }
            return `Vuoi eliminare definitivamente tutti i ${count} trade di "${targetAsset}" nella sezione "${sectionName}" da Firebase? Gli altri asset e le altre sezioni non verranno modificati.`;
          }

          if (resetConfirmStep === 1) {
            if (lang === 'en') {
              return `Warning (1 of 2): ALL assets is selected. You are about to permanently delete ${count} trades in "${sectionName}" from Firebase. Other sections will NOT be modified. Continue to final confirmation?`;
            }
            if (lang === 'es') {
              return `Atención (1 de 2): TODOS los activos está seleccionado. Estás a punto de eliminar permanentemente ${count} operaciones de "${sectionName}" de Firebase. Las demás secciones NO se modificarán. ¿Continuar a la confirmación final?`;
            }
            return `Attenzione (Conferma 1 di 2): è selezionato "Tutti gli Asset". Stai per eliminare definitivamente ${count} trade dalla sezione "${sectionName}" da Firebase. Le altre sezioni non verranno modificate. Vuoi procedere alla conferma finale?`;
          }

          if (lang === 'en') {
            return `Final Confirmation (2 of 2): Confirm permanent deletion of all ${count} trades in "${sectionName}" across ALL assets? This action cannot be undone.`;
          }
          if (lang === 'es') {
            return `Confirmación Final (2 de 2): ¿confirmas la eliminación permanente de las ${count} operaciones en "${sectionName}" de TODOS los activos? Esta acción no se puede deshacer.`;
          }
          return `Conferma Finale (2 di 2): confermi l'eliminazione definitiva di tutti i ${count} trade nella sezione "${sectionName}" (Tutti gli Asset)? Questa operazione è irreversibile.`;
        })()}
        confirmLabel={(() => {
          if (resettingSection) {
            return lang === 'en'
              ? 'Deleting...'
              : lang === 'es'
                ? 'Eliminando...'
                : 'Eliminazione...';
          }
          const targetAsset = assetFilter.trim().toUpperCase();
          if (targetAsset === 'ALL' && resetConfirmStep === 1) {
            return lang === 'en'
              ? 'Continue (1/2)'
              : lang === 'es'
                ? 'Continuar (1/2)'
                : 'Continua (1/2)';
          }
          return lang === 'en'
            ? 'Delete Permanently'
            : lang === 'es'
              ? 'Eliminar Definitivamente'
              : 'Elimina Definitivamente';
        })()}
        isBusy={resettingSection}
        t={t}
        onCancel={() => {
          if (!resettingSection) {
            setResetSectionTarget(null);
            setResetConfirmStep(1);
          }
        }}
        onConfirm={() => {
          if (assetFilter.trim().toUpperCase() === 'ALL' && resetConfirmStep === 1) {
            setResetConfirmStep(2);
            return;
          }
          void handleConfirmResetSection();
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
