import * as XLSXModule from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  type MappingField,
  MISSED_REASONS,
  type ParsedSheetData,
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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

declare global {
  interface Window {
    XLSX?: typeof XLSXModule;
  }
}

function getXlsxLib(): typeof XLSXModule {
  if (typeof window !== 'undefined' && window.XLSX) {
    return window.XLSX;
  }
  return XLSXModule;
}

export const STACKED_BLOCK_SETUPS = [
  'S1',
  'SSA',
  'MUT',
  'SBIL DOMINANCE REALE',
  'SBIL INTRADOMINANCE',
] as const;

const KNOWN_SHEET_ALIASES = new Set<string>([
  's1',
  'ssa',
  's6',
  's66',
  'mut',
  'mutation',
  'mutazione',
  'sbil dominance reale',
  'sbil. dominance reale',
  'sbilanciamento dominance reale',
  'real dominance imbalance',
  'swell 2000',
  'swell2000',
  'sewell 2000',
  'sewell2000',
  'russell 2000',
  'russell2000',
  'svel domin',
  'sbil intradominance',
  'sbil. intradominance',
  'sbilanciamento intradominance',
  'intra-asian imbalance',
  'seriale bill',
  'seriale è bill',
  'seriale e bill',
  'serialebill',
  'intra dominance',
  'intradominance',
]);

const STRICT_HEADERS = [
  'DATA',
  'GIORNO',
  'SESSIONE',
  'ORARIO',
  'BIAS',
  'OVERNIGHT',
  'NOTE',
  'ESITO',
  'R',
  'RR MAX',
  'R PROGRESSIVI',
  'LINK',
] as const;

function matchKnownSheetStrategy(sheetName: string): string | null {
  const normalizedSpace = sheetName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedSpace) return null;
  if (KNOWN_SHEET_ALIASES.has(normalizedSpace)) {
    return normalizeSetupName(normalizedSpace);
  }
  return null;
}

export function deriveAssetFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^/.]+$/, '').trim();
  const base = stem.toUpperCase();

  if (base.includes('CHF') && (base.includes('JPY') || base.includes('GP'))) {
    return 'CHF/JPY';
  }
  if (base.includes('US30') || base.includes('DOW') || base.includes('DJ30')) return 'US30';
  if (base.includes('NAS100') || base.includes('NASDAQ') || base.includes('NDX')) return 'NASDAQ';
  if (base.includes('SPX') || base.includes('US500')) return 'SPX500';
  if (base.includes('DAX') || base.includes('DE40') || base.includes('GER40')) return 'DAX';
  if (base.includes('UK100') || base.includes('FTSE')) return 'UK100';
  if (base.includes('XAU') || base.includes('GOLD')) return 'XAU/USD';
  if (base.includes('XAG') || base.includes('SILVER')) return 'XAG/USD';
  if (base.includes('BTC') || base.includes('BITCOIN')) return 'BTC/USD';
  if (base.includes('ETH') || base.includes('ETHEREUM')) return 'ETH/USD';
  if (base.includes('SOL')) return 'SOL/USD';

  const compact = base.replace(/[^A-Z]/g, '');
  const pairMatch = /(EUR|GBP|USD|CHF|JPY|AUD|NZD|CAD)(EUR|GBP|USD|CHF|JPY|AUD|NZD|CAD)/.exec(
    compact,
  );
  if (pairMatch && pairMatch[1] !== pairMatch[2]) {
    return `${pairMatch[1]}/${pairMatch[2]}`;
  }

  const cleanedStem = base
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(BACKTEST|JOURNAL|REALE|TRADES|EXPORT|BACKUP|DATA|FOGLIO)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanedStem && cleanedStem.length <= 16) {
    return cleanedStem;
  }

  return 'CHF/JPY';
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Impossibile leggere il contenuto binario del file.'));
      }
    };
    reader.onerror = () => {
      reject(
        new Error(
          reader.error?.message || 'Errore di lettura del file dal dispositivo.',
        ),
      );
    };
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(
        new Error(
          reader.error?.message || 'Errore di lettura del file CSV dal dispositivo.',
        ),
      );
    };
    reader.readAsText(file);
  });
}

/**
 * Parses row[8] (R), row[9] (RR MAX), row[10] (R PROGRESSIVI) safely:
 * handles Excel numbers, strings with commas ("+4,00"), spaces, or NaN/empty -> null.
 */
export function parseNumericRCell(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const cleaned = s
    .replace(/\u2212/g, '-')
    .replace(/,/g, '.')
    .replace(/[^\d.+\-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '+' || cleaned === '.') {
    return null;
  }

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts Excel numeric serials (e.g. 45672), Date objects, YYYY-MM-DD, DD/MM/YYYY
 * cleanly to YYYY-MM-DD. Returns trimmed original string if non-empty fallback needed.
 */
export function normalizeImportDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const numericVal =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d{5}(\.\d+)?$/.test(raw.trim())
        ? Number(raw.trim())
        : NaN;

  if (Number.isFinite(numericVal) && numericVal > 20000 && numericVal < 90000) {
    const utcDays = Math.floor(numericVal - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(raw ?? '').trim();
  if (!s) return '';

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY (supports 2-digit or 4-digit year)
  const slashMatch = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (slashMatch) {
    let p1 = Number(slashMatch[1]);
    let p2 = Number(slashMatch[2]);
    const y = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];

    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      const tmp = p1;
      p1 = p2;
      p2 = tmp;
    }

    if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
  }

  return s;
}

function formatExcelTimeCell(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1) {
    const totalMinutes = Math.round(raw * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return String(raw ?? '').trim();
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectCsvDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join('\n');
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

/**
 * Bulletproof parser for the user's exact 12-column structure (index 0..11):
 * - Starts at blockIndex = -1.
 * - Increments blockIndex++ every time row[0] uppercase contains "DATA" or "COLONNA 1" (or "COLONNA").
 * - Valid trade iff row[0] is non-empty, does not contain DATA/COLONNA, AND row[7] (ESITO) trimmed is non-empty.
 */
function rowsMatrixToParsedSheet(
  sheetName: string,
  matrix: unknown[][],
  isExcelSheet = false,
): ParsedSheetData {
  const knownSheetStrategy = isExcelSheet
    ? matchKnownSheetStrategy(sheetName)
    : null;

  let blockIndex = -1;
  const blockCounts: number[] = [];
  const parsedRows: Record<string, string>[] = [];

  for (let r = 0; r < matrix.length; r++) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    const c0Raw = row[0];
    const c0Str = String(c0Raw ?? '').trim();
    const c0Upper = c0Str.toUpperCase();

    // Header variation check ("DATA", "Colonna 1", "Colonna 1 ", etc.)
    if (c0Upper.includes('DATA') || c0Upper.includes('COLONNA')) {
      blockIndex++;
      while (blockCounts.length <= blockIndex) blockCounts.push(0);
      continue;
    }

    // Strict row validation:
    // row[0] (Date) NOT empty, NOT containing DATA/COLONNA, AND row[7] (ESITO) NOT empty
    const esitoTrimmed = String(row[7] ?? '').trim();
    if (!c0Str || !esitoTrimmed) {
      continue;
    }

    const effectiveBlockIndex = blockIndex >= 0 ? blockIndex : 0;
    while (blockCounts.length <= effectiveBlockIndex) blockCounts.push(0);

    const dateIso = normalizeImportDate(c0Raw);
    if (!dateIso) continue;

    const rVal = parseNumericRCell(row[8]);
    const rrMaxVal = parseNumericRCell(row[9]);
    const rProgVal = parseNumericRCell(row[10]);

    const stackedStrategy =
      STACKED_BLOCK_SETUPS[effectiveBlockIndex] ??
      STACKED_BLOCK_SETUPS[STACKED_BLOCK_SETUPS.length - 1];

    // If the sheet is named after a known strategy AND has only 1 block (blockIndex <= 0),
    // use the normalized sheet strategy; otherwise map strictly by blockIndex (0..4).
    const assignedStrategy =
      knownSheetStrategy && effectiveBlockIndex === 0
        ? knownSheetStrategy
        : stackedStrategy;

    const rowObj: Record<string, string> = {
      DATA: dateIso,
      GIORNO: String(row[1] ?? '').trim(),
      SESSIONE: String(row[2] ?? '').trim(),
      ORARIO: formatExcelTimeCell(row[3]),
      BIAS: String(row[4] ?? '').trim().toUpperCase(),
      OVERNIGHT: String(row[5] ?? '').trim(),
      NOTE: String(row[6] ?? '').trim(),
      ESITO: esitoTrimmed.toUpperCase(),
      R: String(rVal !== null ? rVal : 0),
      'RR MAX': rrMaxVal !== null ? String(rrMaxVal) : '',
      'R PROGRESSIVI': rProgVal !== null ? String(rProgVal) : String(row[10] ?? '').trim(),
      LINK: String(row[11] ?? '').trim(),
      __blockSetup: assignedStrategy,
    };

    blockCounts[effectiveBlockIndex] = (blockCounts[effectiveBlockIndex] ?? 0) + 1;
    parsedRows.push(rowObj);
  }

  const detectedFiveBlocks = blockCounts.length >= 2;

  return {
    sheetName: sheetName.trim(),
    headers: [...STRICT_HEADERS],
    rows: parsedRows,
    detectedFiveBlocks,
    blockCounts,
    isExcelSheet,
  };
}

export async function parseUploadedFile(file: File): Promise<ParsedSheetData[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await readFileAsText(file);
    if (!text.trim()) {
      throw new Error('Il file CSV selezionato è vuoto.');
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const delimiter = detectCsvDelimiter(lines);
    const matrix = lines.map((l) => parseCsvLine(l, delimiter));
    const parsed = rowsMatrixToParsedSheet(file.name, matrix, false);
    if (parsed.rows.length === 0) {
      throw new Error('Nessuna riga valida trovata nel file CSV.');
    }
    return [parsed];
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = getXlsxLib();
    const arrayBuffer = await readFileAsArrayBuffer(file);
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Il file Excel selezionato è vuoto.');
    }

    let workbook: XLSXModule.WorkBook;
    try {
      workbook = XLSX.read(new Uint8Array(arrayBuffer), {
        type: 'array',
        cellDates: false,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'struttura non valida';
      throw new Error(`Impossibile leggere il file Excel (${detail}).`);
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('La cartella di lavoro Excel non contiene alcun foglio.');
    }

    const parsedSheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return null;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
        raw: true,
      });
      return rowsMatrixToParsedSheet(sheetName, matrix, true);
    }).filter((s): s is ParsedSheetData => s !== null && s.rows.length > 0);

    if (parsedSheets.length === 0) {
      throw new Error(
        `Nessun trade valido trovato nei fogli (${workbook.SheetNames.join(', ')}).`,
      );
    }

    return parsedSheets;
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buf = await readFileAsArrayBuffer(file);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const allMatrixRows: string[][] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const lineBuckets = new Map<number, { x: number; text: string }[]>();

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 4) * 4;
        const x = item.transform[4];
        const arr = lineBuckets.get(y) ?? [];
        arr.push({ x, text: item.str.trim() });
        lineBuckets.set(y, arr);
      }

      const sortedY = Array.from(lineBuckets.keys()).sort((a, b) => b - a);
      for (const y of sortedY) {
        const items = (lineBuckets.get(y) ?? []).sort((a, b) => a.x - b.x);
        const cells: string[] = [];
        let currentCell = '';
        let lastEnd = -Infinity;
        for (const it of items) {
          if (currentCell && it.x - lastEnd > 14) {
            cells.push(currentCell.trim());
            currentCell = it.text;
          } else {
            currentCell = currentCell ? `${currentCell} ${it.text}` : it.text;
          }
          lastEnd = it.x + it.text.length * 4;
        }
        if (currentCell.trim()) cells.push(currentCell.trim());
        if (cells.length >= 2) {
          allMatrixRows.push(cells);
        }
      }
    }

    const parsed = rowsMatrixToParsedSheet(file.name, allMatrixRows, false);
    if (parsed.rows.length === 0) {
      throw new Error(
        'Nessuna tabella di trade estratta dal PDF.',
      );
    }
    return [parsed];
  }

  throw new Error(
    `Formato file non supportato (${file.name}). Carica un file .xlsx, .xls, .csv oppure .pdf.`,
  );
}

export function autoDetectColumnMapping(headers: string[]): Record<string, MappingField> {
  const mapping: Record<string, MappingField> = {};
  const strictPositional: MappingField[] = [
    'date', // 0: DATA
    'day', // 1: GIORNO
    'session', // 2: SESSIONE
    'entryTime', // 3: ORARIO
    'bias', // 4: BIAS
    'ignore', // 5: OVERNIGHT
    'notes', // 6: NOTE
    'outcome', // 7: ESITO
    'netR', // 8: R
    'rrMax', // 9: RR MAX
    'ignore', // 10: R PROGRESSIVI
    'tradingViewUrl', // 11: LINK
  ];

  headers.forEach((h, idx) => {
    mapping[h] = strictPositional[idx] ?? 'ignore';
  });

  return mapping;
}

export function buildTradesFromSheet(
  sheet: ParsedSheetData,
  mapping: Record<string, MappingField>,
  targetCategory: TradeCategory,
  setupOverride: string,
  defaultAsset = 'CHF/JPY',
): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const now = Date.now();
  const fallbackAsset = defaultAsset.trim().toUpperCase() || 'CHF/JPY';

  sheet.rows.forEach((rawRow, idx) => {
    const fieldValues: Partial<Record<MappingField, string>> = {};
    const extraColumns: Record<string, string> = {};

    sheet.headers.forEach((h) => {
      const target = mapping[h] ?? 'ignore';
      const val = (rawRow[h] ?? '').trim();
      if (target === 'ignore') {
        if (val) extraColumns[h] = val;
      } else {
        fieldValues[target] = val;
      }
    });

    const parsedDate = normalizeImportDate(fieldValues.date ?? rawRow.DATA);
    const esitoStr = String(fieldValues.outcome ?? rawRow.ESITO ?? '').trim();
    if (!parsedDate || !esitoStr) return;

    const asset = (fieldValues.asset ?? '').trim().toUpperCase() || fallbackAsset;

    const netRParsed = parseNumericRCell(fieldValues.netR ?? rawRow.R);
    const rrMaxParsed = parseNumericRCell(fieldValues.rrMax ?? rawRow['RR MAX']);

    const outcome = normalizeOutcome(esitoStr);
    const biasRaw = String(fieldValues.bias ?? rawRow.BIAS ?? '')
      .trim()
      .toUpperCase();
    const bias = biasRaw === 'SHORT' || biasRaw === 'SELL' ? 'SHORT' : 'LONG';

    const notesText = String(fieldValues.notes ?? rawRow.NOTE ?? '').trim();
    const isMissedByRule =
      outcome === 'UNFILLED' || notesText.toUpperCase().includes('NON PRESO');

    const finalCategory: TradeCategory =
      targetCategory === 'backtest'
        ? 'backtest'
        : isMissedByRule
          ? 'missed'
          : targetCategory;

    let setup = 'S1';
    if (setupOverride && setupOverride !== 'AUTO') {
      setup = normalizeSetupName(setupOverride);
    } else if (rawRow.__blockSetup) {
      setup = normalizeSetupName(rawRow.__blockSetup);
    } else if (sheet.isExcelSheet) {
      setup = normalizeSetupName(sheet.sheetName);
    }

    const netR = netRParsed !== null ? roundTo(netRParsed, 2) : 0;
    const riskPct = 1;

    const missedReason = isMissedByRule
      ? outcome === 'UNFILLED'
        ? 'Ordine Non Fillato'
        : MISSED_REASONS[0]
      : targetCategory === 'missed'
        ? MISSED_REASONS[0]
        : undefined;

    const base: TradeRecord = {
      id: generateTradeId(finalCategory.slice(0, 2)),
      category: finalCategory,
      date: parsedDate,
      day: String(fieldValues.day ?? rawRow.GIORNO ?? '').trim() || undefined,
      session: String(fieldValues.session ?? rawRow.SESSIONE ?? '').trim() || undefined,
      entryTime: String(fieldValues.entryTime ?? rawRow.ORARIO ?? '').trim() || undefined,
      asset,
      setup,
      strategy: setup,
      isMissed: isMissedByRule || finalCategory === 'missed',
      bias,
      riskPct,
      entryPrice: null,
      slPrice: null,
      tpPrice: null,
      outcome,
      netR,
      rrMax: rrMaxParsed,
      netReturnPct: roundTo(netR * riskPct, 2),
      missedReason,
      notes: notesText,
      tradingViewUrl: String(fieldValues.tradingViewUrl ?? rawRow.LINK ?? '').trim(),
      extraColumns: Object.keys(extraColumns).length > 0 ? extraColumns : undefined,
      createdAt: now + idx,
    };

    trades.push(runRowCalculationEngine(base));
  });

  return trades;
}

export function exportTradesCsv(trades: TradeRecord[], filenamePrefix: string): void {
  if (trades.length === 0) return;

  const headers = [
    'Data',
    'Asset',
    'Setup',
    'Direzione',
    'Stato',
    'Rischio %',
    'Entry',
    'SL',
    'TP',
    'SL Pips',
    'TP Pips',
    'Target RR',
    'Esito',
    'R:R Netto',
    'RR Max',
    'Rendimento %',
    'Motivo Mancato Ingresso',
    'Note',
    'TradingView Link',
  ];

  const escapeCell = (val: unknown) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = trades.map((t) => [
    t.date,
    t.asset,
    t.setup,
    t.bias,
    t.category === 'backtest'
      ? 'BACKTEST'
      : t.category === 'missed'
        ? 'NON PRESO'
        : 'ESEGUITO',
    t.riskPct.toFixed(2),
    t.entryPrice ?? '',
    t.slPrice ?? '',
    t.tpPrice ?? '',
    t.slPips ?? '',
    t.tpPips ?? '',
    t.targetRR ?? '',
    t.outcome,
    t.netR.toFixed(2),
    t.rrMax ?? '',
    t.netReturnPct.toFixed(2),
    t.category === 'missed' ? (t.missedReason ?? '') : '',
    t.notes ?? '',
    t.tradingViewUrl ?? '',
  ]);

  const csvContent =
    '\uFEFF' +
    [
      headers.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
    ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBackupJson(
  backtest: TradeRecord[],
  live: TradeRecord[],
  missed: TradeRecord[],
): void {
  const payload = {
    app: 'DiarioTrade',
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      backtest: backtest.length,
      live: live.length,
      missed: missed.length,
    },
    backtest,
    live,
    missed,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diariotrade_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
