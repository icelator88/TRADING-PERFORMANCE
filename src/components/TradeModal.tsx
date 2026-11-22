import { type FormEvent, useEffect, useState } from 'react';
import type { TranslationSet } from '../i18n/translations';
import {
  type BiasType,
  COMPACT_SETUPS,
  MISSED_REASONS,
  type OutcomeType,
  type TradeCategory,
  type TradeRecord,
} from '../types/trading';
import {
  formatPct,
  formatR,
  generateTradeId,
  normalizeSetupName,
  runRowCalculationEngine,
  todayIsoDate,
} from '../utils/calculations';

interface TradeModalProps {
  isOpen: boolean;
  initialCategory: TradeCategory;
  editingTrade: TradeRecord | null;
  customSetups: string[];
  t: TranslationSet;
  onClose: () => void;
  onSave: (trade: TradeRecord, previousCategory?: TradeCategory) => void | Promise<void>;
}

export function TradeModal({
  isOpen,
  initialCategory,
  editingTrade,
  customSetups,
  t,
  onClose,
  onSave,
}: TradeModalProps) {
  const [category, setCategory] = useState<TradeCategory>(initialCategory);
  const [date, setDate] = useState(todayIsoDate());
  const [asset, setAsset] = useState('EUR/USD');
  const [setup, setSetup] = useState<string>(COMPACT_SETUPS[0]);
  const [bias, setBias] = useState<BiasType>('LONG');
  const [riskPct, setRiskPct] = useState('1.0');
  const [entryPrice, setEntryPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [outcome, setOutcome] = useState<OutcomeType>('TP');
  const [netR, setNetR] = useState('2.5');
  const [rrMax, setRrMax] = useState('');
  const [missedReason, setMissedReason] = useState<string>(MISSED_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [tradingViewUrl, setTradingViewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingTrade) {
      setCategory(editingTrade.category);
      setDate(editingTrade.date);
      setAsset(editingTrade.asset);
      setSetup(normalizeSetupName(editingTrade.setup || editingTrade.strategy));
      setBias(editingTrade.bias);
      setRiskPct(String(editingTrade.riskPct ?? 1));
      setEntryPrice(editingTrade.entryPrice != null ? String(editingTrade.entryPrice) : '');
      setSlPrice(editingTrade.slPrice != null ? String(editingTrade.slPrice) : '');
      setTpPrice(editingTrade.tpPrice != null ? String(editingTrade.tpPrice) : '');
      setOutcome(editingTrade.outcome);
      setNetR(String(editingTrade.netR));
      setRrMax(editingTrade.rrMax != null ? String(editingTrade.rrMax) : '');
      setMissedReason(editingTrade.missedReason || MISSED_REASONS[0]);
      setNotes(editingTrade.notes || '');
      setTradingViewUrl(editingTrade.tradingViewUrl || '');
    } else {
      setCategory(initialCategory);
      setDate(todayIsoDate());
      setAsset('EUR/USD');
      setSetup(COMPACT_SETUPS[0]);
      setBias('LONG');
      setRiskPct('1.0');
      setEntryPrice('');
      setSlPrice('');
      setTpPrice('');
      setOutcome('TP');
      setNetR('2.5');
      setRrMax('');
      setMissedReason(MISSED_REASONS[0]);
      setNotes('');
      setTradingViewUrl('');
    }
    setSaving(false);
    setSaveError('');
  }, [isOpen, editingTrade, initialCategory]);

  if (!isOpen) return null;

  const setupOptions = Array.from(new Set(COMPACT_SETUPS));

  const canonicalSetup = normalizeSetupName(setup);

  const previewRecord = runRowCalculationEngine({
    id: editingTrade?.id || 'preview',
    category,
    date,
    asset: asset.trim().toUpperCase() || 'EUR/USD',
    setup: canonicalSetup,
    strategy: canonicalSetup,
    bias,
    riskPct: Number(riskPct) || 0,
    entryPrice: entryPrice ? Number(entryPrice) : null,
    slPrice: slPrice ? Number(slPrice) : null,
    tpPrice: tpPrice ? Number(tpPrice) : null,
    outcome,
    netR: Number(netR) || 0,
    rrMax: rrMax ? Number(rrMax) : null,
    netReturnPct: 0,
    missedReason: category === 'missed' ? missedReason : undefined,
    notes,
    tradingViewUrl,
    extraColumns: editingTrade?.extraColumns,
    createdAt: editingTrade?.createdAt || Date.now(),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !date || !asset.trim()) return;

    const trimmedNotes = notes.trim();
    const effectiveCategory: TradeCategory = category;

    const finalRecord = runRowCalculationEngine({
      ...previewRecord,
      category: effectiveCategory,
      isMissed: effectiveCategory === 'missed',
      id: editingTrade?.id || generateTradeId(effectiveCategory.slice(0, 2)),
      asset: asset.trim().toUpperCase(),
      setup: canonicalSetup,
      strategy: canonicalSetup,
      notes: trimmedNotes,
      tradingViewUrl: tradingViewUrl.trim(),
      missedReason:
        effectiveCategory === 'missed'
          ? missedReason ||
            (outcome === 'UNFILLED' ? 'Ordine Non Fillato' : MISSED_REASONS[0])
          : undefined,
      createdAt: editingTrade?.createdAt || Date.now(),
    });

    setSaving(true);
    setSaveError('');
    try {
      await onSave(finalRecord, editingTrade?.category);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Errore nel salvataggio su Firebase.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-lg border border-[#263042] bg-[#121721] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2634] px-6 py-4">
          <h2 id="trade-modal-title" className="text-base font-semibold text-slate-100">
            {editingTrade ? t.modal.editTradeTitle : t.modal.newTradeTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#263042] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#1B2230]"
          >
            {t.modal.cancel}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.categoryLabel}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TradeCategory)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-medium text-slate-100"
              >
                <option value="backtest">{t.modal.catBacktest}</option>
                <option value="live">{t.modal.catLive}</option>
                <option value="missed">{t.modal.catMissed}</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.dateLabel}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.assetLabel}
              </label>
              <input
                type="text"
                required
                list="modal-asset-list"
                value={asset}
                onChange={(e) => setAsset(e.target.value.toUpperCase())}
                placeholder="EUR/USD, CAD/CHF, CHF/JPY, XAU/USD, US30..."
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono uppercase text-slate-100"
              />
              <datalist id="modal-asset-list">
                <option value="CAD/CHF" />
                <option value="AUD/JPY" />
                <option value="CHF/JPY" />
                <option value="EUR/USD" />
                <option value="GBP/USD" />
                <option value="XAU/USD" />
                <option value="US30" />
                <option value="NASDAQ" />
                <option value="BTC" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.setupLabel}
              </label>
              <select
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-medium text-slate-100"
              >
                {setupOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.biasLabel}
              </label>
              <select
                value={bias}
                onChange={(e) => setBias(e.target.value as BiasType)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.outcomeLabel}
              </label>
              <select
                value={outcome}
                onChange={(e) => {
                  const next = e.target.value as OutcomeType;
                  setOutcome(next);
                  if (next === 'STOP LOSS') setNetR('-1');
                  else if (next === 'BE' || next === 'UNFILLED') setNetR('0');
                }}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100"
              >
                <option value="TP">TP</option>
                <option value="STOP LOSS">STOP LOSS</option>
                <option value="BE">BE</option>
                <option value="UNFILLED">UNFILLED</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.riskPctLabel}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.entryPriceLabel}
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="es. 1.08450"
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.slPriceLabel}
              </label>
              <input
                type="number"
                step="any"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="es. 1.08300"
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.tpPriceLabel}
              </label>
              <input
                type="number"
                step="any"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="es. 1.08900"
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.netRLabel}
              </label>
              <input
                type="number"
                step="0.01"
                value={netR}
                onChange={(e) => setNetR(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.rrMaxLabel}
              </label>
              <input
                type="number"
                step="0.01"
                value={rrMax}
                onChange={(e) => setRrMax(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono text-slate-100 tabular-nums"
              />
            </div>
          </div>

          {category === 'missed' ? (
            <div>
              <label className="mb-1.5 block font-medium text-amber-300">
                {t.modal.missedReasonLabel}
              </label>
              <select
                value={missedReason}
                onChange={(e) => setMissedReason(e.target.value)}
                className="w-full rounded-md border border-amber-500/40 bg-[#0B0E14] px-3 py-2 font-medium text-slate-100"
              >
                {MISSED_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.notesLabel}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-medium text-slate-300">
                {t.modal.tvLinkLabel}
              </label>
              <input
                type="url"
                value={tradingViewUrl}
                onChange={(e) => setTradingViewUrl(e.target.value)}
                placeholder="https://www.tradingview.com/x/..."
                className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#1E2634] bg-[#0B0E14] px-4 py-3 font-mono text-xs tabular-nums">
            <span className="text-slate-400">{t.modal.autoCalcPreview}:</span>
            <div className="flex flex-wrap items-center gap-4 text-slate-200">
              <span>{previewRecord.bias}</span>
              <span>
                SL/TP:{' '}
                {previewRecord.slPips != null
                  ? `${previewRecord.slPips} / ${previewRecord.tpPips ?? '—'} pips`
                  : '—'}
              </span>
              <span>
                Target RR:{' '}
                {previewRecord.targetRR != null
                  ? previewRecord.targetRR.toFixed(2)
                  : '—'}
              </span>
              <span
                className={
                  previewRecord.netR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {formatR(previewRecord.netR)} ({formatPct(previewRecord.netReturnPct)})
              </span>
            </div>
          </div>

          {saveError ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {saveError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-[#1E2634] pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-md border border-[#263042] px-4 py-2 font-medium text-slate-300 hover:bg-[#1B2230] disabled:opacity-50"
            >
              {t.modal.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? 'Salvataggio Firebase...'
                : editingTrade
                  ? t.modal.saveChanges
                  : t.modal.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
