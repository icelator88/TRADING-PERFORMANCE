import { type DragEvent, useState } from 'react';
import { Upload } from 'lucide-react';
import type { TranslationSet } from '../i18n/translations';
import {
  COMPACT_SETUPS,
  type MappingField,
  type ParsedSheetData,
  type TradeCategory,
  type TradeRecord,
} from '../types/trading';
import {
  autoDetectColumnMapping,
  buildTradesFromSheet,
  deriveAssetFromFilename,
  parseUploadedFile,
  STACKED_BLOCK_SETUPS,
} from '../utils/importer';

interface ImportModalProps {
  isOpen: boolean;
  targetCategory: TradeCategory;
  t: TranslationSet;
  onClose: () => void;
  onImport: (trades: TradeRecord[]) => void;
}

const MAPPING_OPTIONS: { value: MappingField; label: string }[] = [
  { value: 'ignore', label: 'Colonna Extra' },
  { value: 'date', label: 'DATA / Colonna 1' },
  { value: 'day', label: 'GIORNO' },
  { value: 'session', label: 'SESSIONE' },
  { value: 'entryTime', label: 'ORARIO' },
  { value: 'exitTime', label: 'Ora Uscita' },
  { value: 'asset', label: 'Asset (opzionale)' },
  { value: 'setup', label: 'Setup / Strategia' },
  { value: 'bias', label: 'BIAS' },
  { value: 'riskPct', label: 'Rischio %' },
  { value: 'entryPrice', label: 'Prezzo Entry' },
  { value: 'slPrice', label: 'Prezzo SL' },
  { value: 'tpPrice', label: 'Prezzo TP' },
  { value: 'outcome', label: 'ESITO' },
  { value: 'netR', label: 'R' },
  { value: 'rrMax', label: 'RR MAX' },
  { value: 'missedReason', label: 'Motivo Mancato' },
  { value: 'notes', label: 'NOTE' },
  { value: 'tradingViewUrl', label: 'LINK' },
];

export function ImportModal({
  isOpen,
  targetCategory,
  t,
  onClose,
  onImport,
}: ImportModalProps) {
  const [sheets, setSheets] = useState<ParsedSheetData[]>([]);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState<number>(0);
  const [mapping, setMapping] = useState<Record<string, MappingField>>({});
  const [setupOverride, setSetupOverride] = useState<string>('AUTO');
  const [importAsset, setImportAsset] = useState<string>('CHF/JPY');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const activeSheet =
    selectedSheetIdx === -1
      ? sheets[0]
      : sheets[selectedSheetIdx] ?? sheets[0] ?? null;

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    setImportAsset(deriveAssetFromFilename(file.name));
    try {
      const parsed = await parseUploadedFile(file);
      if (parsed.length === 0) {
        setError('Nessun foglio con date valide trovato nel file selezionato.');
        setSheets([]);
        return;
      }
      setSheets(parsed);
      setSelectedSheetIdx(parsed.length > 1 ? -1 : 0);
      setMapping(autoDetectColumnMapping(parsed[0].headers));
      setSetupOverride('AUTO');
    } catch (err) {
      const reason =
        err instanceof Error && err.message
          ? err.message
          : t.importer.parsingError;
      setError(`Errore durante l’importazione: ${reason}`);
      setSheets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const totalDetectedRows =
    selectedSheetIdx === -1
      ? sheets.reduce((sum, s) => sum + s.rows.length, 0)
      : activeSheet?.rows.length ?? 0;

  const previewTrades = activeSheet
    ? buildTradesFromSheet(
        activeSheet,
        mapping,
        targetCategory,
        setupOverride,
        importAsset,
      ).slice(0, 8)
    : [];

  const handleConfirmImport = () => {
    if (sheets.length === 0) return;
    const sheetsToProcess =
      selectedSheetIdx === -1 ? sheets : activeSheet ? [activeSheet] : [];

    const imported: TradeRecord[] = [];
    sheetsToProcess.forEach((sheet) => {
      const sheetMapping =
        sheet === activeSheet ? mapping : autoDetectColumnMapping(sheet.headers);
      imported.push(
        ...buildTradesFromSheet(
          sheet,
          sheetMapping,
          targetCategory,
          setupOverride,
          importAsset,
        ),
      );
    });

    if (imported.length === 0) {
      setError('Nessuna riga con data valida trovata per l’importazione.');
      return;
    }
    onImport(imported);
    setSheets([]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg border border-[#263042] bg-[#121721] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2634] px-6 py-4">
          <div>
            <h2 id="import-modal-title" className="text-base font-semibold text-slate-100">
              {t.importer.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{t.importer.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#263042] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#1B2230]"
          >
            {t.importer.cancel}
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#334155] bg-[#0B0E14] px-6 py-8 text-center transition-colors hover:border-sky-500"
          >
            <Upload className="mb-2 h-6 w-6 text-sky-400" />
            <span className="font-semibold text-slate-200">{t.importer.dropPrompt}</span>
            <span className="mt-1 text-slate-400">{t.importer.supportedFormats}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </label>

          {loading ? (
            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4 text-slate-300">
              Lettura ed elaborazione del file in corso...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
              {error}
            </div>
          ) : null}

          {activeSheet ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-3.5">
                  <div className="text-slate-400">{t.importer.detectedRows}</div>
                  <div className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums">
                    {totalDetectedRows}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-medium text-slate-300">
                    Asset (da nome file)
                  </label>
                  <input
                    type="text"
                    value={importAsset}
                    onChange={(e) => setImportAsset(e.target.value.toUpperCase())}
                    placeholder="CHF/JPY"
                    className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 font-mono font-semibold uppercase text-slate-100"
                  />
                </div>

                {sheets.length > 1 ? (
                  <div>
                    <label className="mb-1.5 block font-medium text-slate-300">
                      {t.importer.selectSheet}
                    </label>
                    <select
                      value={selectedSheetIdx}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setSelectedSheetIdx(idx);
                        const target = idx === -1 ? sheets[0] : sheets[idx];
                        if (target) setMapping(autoDetectColumnMapping(target.headers));
                      }}
                      className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-slate-100"
                    >
                      <option value={-1}>
                        {t.importer.allSheets} ({sheets.length})
                      </option>
                      {sheets.map((s, idx) => (
                        <option key={s.sheetName} value={idx}>
                          {s.sheetName} ({s.rows.length})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block font-medium text-slate-300">
                    {t.importer.singleSetupOverride}
                  </label>
                  <select
                    value={setupOverride}
                    onChange={(e) => setSetupOverride(e.target.value)}
                    className="w-full rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-2 text-slate-100"
                  >
                    <option value="AUTO">{t.importer.keepAutoSetup}</option>
                    {Array.from(new Set(COMPACT_SETUPS)).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeSheet.isExcelSheet ? (
                <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-emerald-100">
                  <div className="font-semibold">
                    Fogli Excel rilevati ({sheets.length}) — colonne 0–11 fino a LINK (tabelle riepilogo a destra ignorate):
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-emerald-200 tabular-nums">
                    {sheets.map((s) => `${s.sheetName}: ${s.rows.length} trade`).join(' · ')}
                  </div>
                </div>
              ) : null}

              {activeSheet.detectedFiveBlocks ? (
                <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sky-200">
                  <div className="font-semibold">
                    Rilevati {activeSheet.blockCounts.length} blocchi impilati verticalmente:
                  </div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums">
                    {activeSheet.blockCounts
                      .map((cnt, idx) => {
                        const label =
                          STACKED_BLOCK_SETUPS[idx] ??
                          STACKED_BLOCK_SETUPS[STACKED_BLOCK_SETUPS.length - 1];
                        return `${label} (${cnt})`;
                      })
                      .join(' · ')}
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 font-semibold text-slate-200">
                  {t.importer.columnMappingTitle}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {activeSheet.headers.map((header) => (
                    <div
                      key={header}
                      className="flex items-center justify-between gap-2 rounded border border-[#1E2634] bg-[#0B0E14] px-3 py-2"
                    >
                      <span className="truncate font-mono text-slate-200" title={header}>
                        {header}
                      </span>
                      <select
                        value={mapping[header] ?? 'ignore'}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [header]: e.target.value as MappingField,
                          }))
                        }
                        className="rounded border border-[#263042] bg-[#121721] px-2 py-1 text-[11px] text-slate-100"
                      >
                        {MAPPING_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {previewTrades.length > 0 ? (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-200">
                    {t.importer.previewTitle}
                  </h3>
                  <div className="overflow-x-auto rounded border border-[#1E2634] bg-[#0B0E14]">
                    <table className="w-full border-collapse text-left font-mono text-[11px]">
                      <thead>
                        <tr className="border-b border-[#1E2634] text-slate-400">
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Asset</th>
                          <th className="px-3 py-2">SETUP</th>
                          <th className="px-3 py-2">Bias</th>
                          <th className="px-3 py-2">Esito</th>
                          <th className="px-3 py-2 text-right">R</th>
                          <th className="px-3 py-2 text-right">RR Max</th>
                          <th className="px-3 py-2">Sezione</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTrades.map((tr) => (
                          <tr key={tr.id} className="border-b border-[#1E2634] text-slate-200">
                            <td className="px-3 py-1.5">{tr.date}</td>
                            <td className="px-3 py-1.5 font-semibold">{tr.asset}</td>
                            <td className="px-3 py-1.5 text-sky-300">{tr.setup}</td>
                            <td className="px-3 py-1.5">{tr.bias}</td>
                            <td className="px-3 py-1.5">{tr.outcome}</td>
                            <td className="px-3 py-1.5 text-right">{tr.netR.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right">
                              {tr.rrMax != null ? tr.rrMax.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-amber-300">
                              {tr.category === 'missed'
                                ? 'Trade Non Presi'
                                : tr.category === 'backtest'
                                  ? 'Backtest'
                                  : 'Journal'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#1E2634] px-6 py-4 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#263042] px-4 py-2 font-medium text-slate-300 hover:bg-[#1B2230]"
          >
            {t.importer.cancel}
          </button>
          <button
            type="button"
            disabled={!activeSheet || totalDetectedRows === 0}
            onClick={handleConfirmImport}
            className="rounded-md bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.importer.importNow}
          </button>
        </div>
      </div>
    </div>
  );
}
