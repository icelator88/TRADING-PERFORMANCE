import { type FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Coins, FileSpreadsheet, Plus, X } from 'lucide-react';
import type { Language, TradeCategory } from '../types/trading';
import { parseGoogleSheetUrl } from '../utils/googleSheets';

interface NewAssetModalProps {
  isOpen: boolean;
  lang: Language;
  defaultCategory: TradeCategory;
  initialAsset?: string;
  onClose: () => void;
  onSave: (payload: {
    asset: string;
    sheetUrl?: string;
    category: TradeCategory;
  }) => Promise<void>;
}

export function NewAssetModal({
  isOpen,
  lang,
  defaultCategory,
  initialAsset = '',
  onClose,
  onSave,
}: NewAssetModalProps) {
  const [assetInput, setAssetInput] = useState('');
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<TradeCategory>(defaultCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAssetInput(initialAsset.trim().toUpperCase());
      setSheetUrlInput('');
      setCategoryInput(defaultCategory);
      setError('');
      setSaving(false);
    }
  }, [isOpen, defaultCategory, initialAsset]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');

    const cleanAsset = assetInput.trim().toUpperCase().slice(0, 32);
    if (!cleanAsset) {
      setError(
        lang === 'en'
          ? 'Enter an Asset symbol (e.g., USD/CHF).'
          : lang === 'es'
            ? 'Introduce un símbolo de Asset (ej. USD/CHF).'
            : 'Inserisci il simbolo dell’Asset (es. USD/CHF).',
      );
      return;
    }

    const trimmedUrl = sheetUrlInput.trim();
    if (trimmedUrl) {
      try {
        parseGoogleSheetUrl(trimmedUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'URL Google Sheets non valido.',
        );
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        asset: cleanAsset,
        sheetUrl: trimmedUrl || undefined,
        category: categoryInput,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Errore nel salvataggio dell’asset su Firebase.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-asset-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#263042] bg-[#121721] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2634] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-sky-500/35 bg-sky-500/10 text-sky-400">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="new-asset-modal-title"
                className="text-sm font-semibold text-slate-100"
              >
                {lang === 'en'
                  ? 'Register New Asset'
                  : lang === 'es'
                    ? 'Registrar Nuevo Asset'
                    : 'Registra Nuovo Asset'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === 'en'
                  ? 'Saved permanently to your Firebase profile.'
                  : 'Salvato su Firebase e disponibile in tutta l’app.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Chiudi"
            className="rounded-md border border-[#263042] p-1.5 text-slate-400 transition-colors hover:bg-[#1B2230] hover:text-slate-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 text-xs">
          <div>
            <label
              htmlFor="new-asset-symbol-input"
              className="mb-1.5 block font-medium text-slate-300"
            >
              {lang === 'en' ? 'Asset Symbol *' : 'Simbolo Asset *'}
            </label>
            <input
              id="new-asset-symbol-input"
              type="text"
              autoFocus
              required
              maxLength={32}
              value={assetInput}
              onChange={(e) => setAssetInput(e.target.value.toUpperCase())}
              placeholder="es. USD/CHF, EUR/JPY, XAU/USD"
              className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-xs font-semibold uppercase text-slate-100 placeholder:normal-case placeholder:font-normal placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="new-asset-sheet-url-input"
              className="mb-1.5 flex items-center gap-1.5 font-medium text-slate-300"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                {lang === 'en'
                  ? 'Google Sheets URL (optional)'
                  : 'URL Google Sheets (opzionale)'}
              </span>
            </label>
            <input
              id="new-asset-sheet-url-input"
              type="url"
              maxLength={500}
              value={sheetUrlInput}
              onChange={(e) => setSheetUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {sheetUrlInput.trim() ? (
            <div>
              <label
                htmlFor="new-asset-sheet-category"
                className="mb-1.5 block font-medium text-slate-300"
              >
                {lang === 'en'
                  ? 'Sync Destination'
                  : 'Destinazione Sync Google Sheets'}
              </label>
              <select
                id="new-asset-sheet-category"
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
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                <option value="backtest">Backtest</option>
                <option value="live">Journal Reale</option>
                <option value="missed">Trade Non Presi</option>
              </select>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2.5 border-t border-[#1E2634] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-[#263042] px-4 py-2 font-medium text-slate-300 transition-colors hover:bg-[#1B2230] disabled:opacity-50"
            >
              {lang === 'en' ? 'Cancel' : lang === 'es' ? 'Cancelar' : 'Annulla'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {saving
                ? 'Salvo su Firebase...'
                : lang === 'en'
                  ? 'Save Asset'
                  : 'Salva Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
