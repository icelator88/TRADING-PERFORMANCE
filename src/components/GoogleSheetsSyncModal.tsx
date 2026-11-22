import { type FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderSync,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { GoogleSheetSource, Language, TradeCategory } from '../types/trading';
import {
  generateGoogleSheetSourceId,
  parseGoogleSheetUrl,
} from '../utils/googleSheets';

export interface AssetSyncOutcome {
  sourceId: string;
  asset: string;
  status: 'success' | 'error';
  added: number;
  skipped: number;
  tabsScanned: string[];
  message: string;
}

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  lang: Language;
  defaultCategory: TradeCategory;
  sources: GoogleSheetSource[];
  knownAssets: string[];
  customAssets?: string[];
  onClose: () => void;
  onAddSource: (source: GoogleSheetSource) => Promise<void>;
  onDeleteSource: (source: GoogleSheetSource) => Promise<void>;
  onSyncSingle: (source: GoogleSheetSource) => Promise<AssetSyncOutcome>;
  onSyncAll: (
    onProgress?: (currentIndex: number, total: number, asset: string) => void,
  ) => Promise<AssetSyncOutcome[]>;
  onOpenNewAssetModal?: (prefillAsset?: string) => void;
}

const COMMON_ASSETS = [
  'CHF/JPY',
  'EUR/USD',
  'GBP/JPY',
  'USD/JPY',
  'EUR/JPY',
  'GBP/USD',
  'AUD/USD',
  'XAU/USD',
  'NAS100',
  'US30',
];

function formatSyncTimestamp(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function GoogleSheetsSyncModal({
  isOpen,
  lang,
  defaultCategory,
  sources,
  knownAssets,
  customAssets = [],
  onClose,
  onAddSource,
  onDeleteSource,
  onSyncSingle,
  onSyncAll,
  onOpenNewAssetModal,
}: GoogleSheetsSyncModalProps) {
  const [assetInput, setAssetInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<TradeCategory>(
    defaultCategory,
  );
  const [formError, setFormError] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<string>('');
  const [outcomesById, setOutcomesById] = useState<
    Record<string, AssetSyncOutcome>
  >({});
  const [pendingConfirm, setPendingConfirm] = useState<
    { type: 'single'; source: GoogleSheetSource } | { type: 'all' } | null
  >(null);

  useEffect(() => {
    if (isOpen) {
      setCategoryInput(defaultCategory);
      setFormError('');
      setPendingConfirm(null);
    }
  }, [isOpen, defaultCategory]);

  if (!isOpen) return null;

  const isBusy = savingSource || syncingAll || syncingId !== null || deletingId !== null;
  const assetSuggestions = Array.from(
    new Set([...knownAssets, ...customAssets, ...COMMON_ASSETS]),
  ).sort();
  const linkedAssetSet = new Set(sources.map((s) => s.asset.trim().toUpperCase()));
  const unlinkedCustomAssets = customAssets
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a.length > 0 && !linkedAssetSet.has(a));

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setFormError('');

    const cleanAsset = assetInput.trim().toUpperCase();
    if (!cleanAsset) {
      setFormError(
        lang === 'en'
          ? 'Enter an Asset symbol (e.g. CHF/JPY).'
          : lang === 'es'
            ? 'Introduce un símbolo de Asset (ej. CHF/JPY).'
            : 'Inserisci il nome dell’Asset (es. CHF/JPY, EUR/USD).',
      );
      return;
    }

    let parsedLink;
    try {
      parsedLink = parseGoogleSheetUrl(urlInput);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Link Google Sheets non valido.',
      );
      return;
    }

    const duplicateSource = sources.find(
      (s) =>
        s.spreadsheetId === parsedLink.spreadsheetId &&
        s.asset.toUpperCase() === cleanAsset &&
        s.category === categoryInput,
    );
    if (duplicateSource) {
      const catLabel =
        categoryInput === 'backtest'
          ? 'Backtest'
          : categoryInput === 'missed'
            ? 'Trade Non Presi'
            : 'Journal Reale';
      setFormError(
        `Questo foglio Google è già collegato a ${cleanAsset} (${catLabel}).`,
      );
      return;
    }

    const newSource: GoogleSheetSource = {
      id: generateGoogleSheetSourceId(),
      asset: cleanAsset.slice(0, 32),
      sheetUrl: parsedLink.canonicalUrl,
      spreadsheetId: parsedLink.spreadsheetId,
      category: categoryInput,
      createdAt: Date.now(),
    };

    setSavingSource(true);
    try {
      await onAddSource(newSource);
      setAssetInput('');
      setUrlInput('');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Errore nel salvataggio del link su Firebase.',
      );
    } finally {
      setSavingSource(false);
    }
  };

  const handleSingleSync = async (source: GoogleSheetSource) => {
    if (isBusy) return;
    setSyncingId(source.id);
    setFormError('');
    try {
      const outcome = await onSyncSingle(source);
      setOutcomesById((prev) => ({ ...prev, [source.id]: outcome }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleMasterSyncAll = async () => {
    if (isBusy || sources.length === 0) return;
    setSyncingAll(true);
    setFormError('');
    setSyncAllProgress(`0/${sources.length}`);
    try {
      const results = await onSyncAll((idx, total, asset) => {
        setSyncAllProgress(`${idx}/${total} · ${asset}`);
      });
      const nextMap: Record<string, AssetSyncOutcome> = {};
      results.forEach((res) => {
        nextMap[res.sourceId] = res;
      });
      setOutcomesById((prev) => ({ ...prev, ...nextMap }));
    } finally {
      setSyncingAll(false);
      setSyncAllProgress('');
    }
  };

  const handleDelete = async (source: GoogleSheetSource) => {
    if (isBusy) return;
    setDeletingId(source.id);
    try {
      await onDeleteSource(source);
      setOutcomesById((prev) => {
        const next = { ...prev };
        delete next[source.id];
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  const recentOutcomes = Object.values(outcomesById);
  const aggregateAdded = recentOutcomes.reduce((sum, o) => sum + o.added, 0);
  const aggregateSkipped = recentOutcomes.reduce((sum, o) => sum + o.skipped, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gsheets-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg border border-[#263042] bg-[#121721] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#1E2634] px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="gsheets-modal-title"
                className="text-base font-semibold text-slate-100"
              >
                {lang === 'en'
                  ? 'Sync from Google Sheets / Google Drive'
                  : lang === 'es'
                    ? 'Sincronizar desde Google Sheets / Google Drive'
                    : 'Sincronizza da Google Sheets / Google Drive'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {lang === 'en'
                  ? 'Save multi-tab Asset links in Firebase and pull all 5 strategy tabs (S1, SSA, MUTAZIONE, SBIL. DOMINANCE REALE, SBIL. DOMINANCE INTRAS. 1candela) with zero duplicates.'
                  : lang === 'es'
                    ? 'Guarda enlaces multi-pestaña en Firebase e importa automáticamente las 5 estrategias sin duplicados.'
                    : 'Salva i link Google Sheets dei tuoi Asset su Firebase e importa automaticamente tutti i 5 fogli strategia (S1, SSA, MUTAZIONE, SBIL. DOMINANCE REALE, SBIL. DOMINANCE INTRAS. 1candela) senza duplicati.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={syncingAll || syncingId !== null}
            aria-label="Chiudi"
            className="rounded-md border border-[#263042] p-1.5 text-slate-400 transition-colors hover:bg-[#1B2230] hover:text-slate-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          {/* Sharing Note */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/25 bg-sky-500/5 px-3.5 py-2.5 text-[11px] text-sky-200/90">
            <span>
              <strong className="font-semibold text-sky-300">
                Requisito Google Drive:
              </strong>{' '}
              su ogni Google Sheet imposta{' '}
              <span className="font-mono text-slate-100">
                Condividi → Chiunque abbia il link → Visualizzatore
              </span>
              . Ogni foglio verrà letto in formato multi-tab{' '}
              <span className="font-mono text-slate-300">.xlsx</span>.
            </span>
          </div>

          {/* Add Asset + Google Sheet URL Form */}
          <form
            onSubmit={handleAddSubmit}
            className="rounded-lg border border-[#1E2634] bg-[#0B0E14] p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Aggiungi Collegamento Asset
              </h3>
              <div className="flex items-center gap-2.5">
                {onOpenNewAssetModal ? (
                  <button
                    type="button"
                    onClick={() => onOpenNewAssetModal()}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Nuovo Asset</span>
                  </button>
                ) : null}
                <span className="font-mono text-[10px] text-slate-500">
                  Salvataggio cloud Firebase
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Asset
                </label>
                <input
                  type="text"
                  list="gsheets-asset-suggestions"
                  value={assetInput}
                  onChange={(e) => setAssetInput(e.target.value)}
                  placeholder="es. CHF/JPY"
                  maxLength={32}
                  className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs uppercase text-slate-100 placeholder:normal-case placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <datalist id="gsheets-asset-suggestions">
                  {assetSuggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Destinazione
                </label>
                <select
                  value={categoryInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCategoryInput(
                      val === 'live'
                        ? 'live'
                        : val === 'missed'
                          ? 'missed'
                          : 'backtest',
                    );
                  }}
                  className="w-full rounded-md border border-[#263042] bg-[#121721] px-2.5 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  <option value="backtest">Backtest</option>
                  <option value="live">Journal Reale</option>
                  <option value="missed">Trade Non Presi</option>
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  URL Google Sheet
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  maxLength={500}
                  className="w-full rounded-md border border-[#263042] bg-[#121721] px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex items-end sm:col-span-2">
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {savingSource ? 'Salvo...' : 'Salva'}
                </button>
              </div>
            </div>

            {formError ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : null}
          </form>

          {/* Saved Links + Master Sync All Bar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Fogli Google Salvati ({sources.length})
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Colonne lette: DATA, GIORNO, SESSIONE, ORARIO, BIAS, OVER NIGHT, NOTE, ESITO, # R, RR MAX, R PROGRESS + Link
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPendingConfirm({ type: 'all' })}
                disabled={isBusy || sources.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FolderSync
                  className={`h-4 w-4 ${syncingAll ? 'animate-spin' : ''}`}
                />
                {syncingAll
                  ? `Sincronizzo (${syncAllProgress})...`
                  : 'Sincronizza Tutti gli Asset'}
              </button>
            </div>

            {sources.length === 0 && unlinkedCustomAssets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#263042] bg-[#0B0E14] px-4 py-8 text-center text-slate-400">
                Nessun Google Sheet salvato. Aggiungi il primo Asset qui sopra (es.{' '}
                <span className="font-mono text-slate-200">CHF/JPY</span>,{' '}
                <span className="font-mono text-slate-200">EUR/USD</span>,{' '}
                <span className="font-mono text-slate-200">GBP/JPY</span>).
              </div>
            ) : (
              <div className="space-y-2.5">
                {unlinkedCustomAssets.map((assetName) => (
                  <div
                    key={`unlinked-${assetName}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[#263042] bg-[#0B0E14] p-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-sky-300">
                        {assetName}
                      </span>
                      <span className="rounded border border-[#263042] bg-[#121721] px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        Asset registrato · Nessun URL Google Sheet collegato
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (onOpenNewAssetModal) {
                          onOpenNewAssetModal(assetName);
                        } else {
                          setAssetInput(assetName);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-45"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Collega URL Sheet
                    </button>
                  </div>
                ))}
                {sources.map((src) => {
                  const outcome = outcomesById[src.id];
                  const isThisSyncing = syncingId === src.id;
                  const isThisDeleting = deletingId === src.id;
                  return (
                    <div
                      key={src.id}
                      className="rounded-lg border border-[#1E2634] bg-[#0B0E14] p-3.5 transition-colors hover:border-[#2C374C]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-sky-300">
                              {src.asset}
                            </span>
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                src.category === 'live'
                                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                                  : src.category === 'missed'
                                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                                    : 'border-indigo-500/35 bg-indigo-500/10 text-indigo-300'
                              }`}
                            >
                              {src.category === 'live'
                                ? 'Journal Reale'
                                : src.category === 'missed'
                                  ? 'Trade Non Presi'
                                  : 'Backtest'}
                            </span>
                            {src.lastSyncedAt ? (
                              <span className="font-mono text-[10px] text-slate-500">
                                Ultimo sync: {formatSyncTimestamp(src.lastSyncedAt)}
                                {src.lastSyncSummary
                                  ? ` · ${src.lastSyncSummary}`
                                  : ''}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <a
                              href={src.sheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-full items-center gap-1 truncate font-mono text-slate-400 hover:text-sky-300"
                              title={src.sheetUrl}
                            >
                              <span className="truncate">{src.sheetUrl}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPendingConfirm({ type: 'single', source: src })}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${
                                isThisSyncing ? 'animate-spin' : ''
                              }`}
                            />
                            {isThisSyncing ? 'Sincronizzo...' : 'Sincronizza'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(src)}
                            disabled={isBusy}
                            title="Rimuovi collegamento"
                            aria-label={`Elimina ${src.asset}`}
                            className="inline-flex items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isThisDeleting ? (
                              <span className="sr-only">Eliminazione...</span>
                            ) : null}
                          </button>
                        </div>
                      </div>

                      {outcome ? (
                        <div
                          className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-[11px] ${
                            outcome.status === 'success'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {outcome.status === 'success' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                            )}
                            <span>{outcome.message}</span>
                          </div>
                          {outcome.tabsScanned.length > 0 ? (
                            <span className="font-mono text-[10px] text-slate-400">
                              Fogli: {outcome.tabsScanned.join(', ')}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary strip after runs */}
          {recentOutcomes.length > 0 ? (
            <div className="rounded-lg border border-[#1E2634] bg-[#0B0E14] px-4 py-3 text-[11px] text-slate-300">
              <span className="font-semibold text-slate-100">
                Riepilogo sessione corrente:
              </span>{' '}
              <span className="font-mono text-emerald-400">
                +{aggregateAdded} nuovi trade aggiunti
              </span>{' '}
              ·{' '}
              <span className="font-mono text-slate-400">
                {aggregateSkipped} duplicati ignorati
              </span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#1E2634] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={syncingAll || syncingId !== null}
            className="rounded-md border border-[#263042] px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-[#1B2230] disabled:opacity-50"
          >
            Chiudi
          </button>
        </div>
      </div>

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gsheets-confirm-title"
        >
          <div className="w-full max-w-md rounded-lg border border-[#263042] bg-[#121721] p-6 shadow-2xl">
            <h3 id="gsheets-confirm-title" className="text-base font-semibold text-slate-100">
              {lang === 'en'
                ? 'Confirm Google Sheets Sync'
                : lang === 'es'
                  ? 'Confirmar sincronización con Google Sheets'
                  : 'Conferma Sincronizzazione Google Sheets'}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {lang === 'en'
                ? 'Are you sure you want to overwrite current data with Google Sheets?'
                : lang === 'es'
                  ? '¿Estás seguro de que deseas sobrescribir los datos actuales con Google Sheets?'
                  : 'Sei sicuro di voler aggiornare e sovrascrivere i dati attuali con Google Sheets?'}
              {pendingConfirm.type === 'single' ? (
                <span className="mt-2 block font-mono text-[11px] text-sky-300">
                  {pendingConfirm.source.asset} (
                  {pendingConfirm.source.category === 'live'
                    ? 'Journal Reale'
                    : pendingConfirm.source.category === 'missed'
                      ? 'Trade Non Presi'
                      : 'Backtest'}
                  )
                </span>
              ) : (
                <span className="mt-2 block font-mono text-[11px] text-sky-300">
                  {sources.length} {lang === 'en' ? 'saved sheets' : 'fogli salvati'}
                </span>
              )}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#1E2634] pt-4">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="rounded-md border border-[#263042] px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-[#1B2230]"
              >
                {lang === 'en' ? 'Cancel' : lang === 'es' ? 'Cancelar' : 'Annulla'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingConfirm;
                  setPendingConfirm(null);
                  if (target.type === 'single') {
                    void handleSingleSync(target.source);
                  } else {
                    void handleMasterSyncAll();
                  }
                }}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                {lang === 'en' ? 'Confirm Sync' : lang === 'es' ? 'Confirmar' : 'Conferma Sync'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
