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

if (typeof pdfWorkerUrl === 'string') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

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
  'sbil. dominance intras. 1candela',
  'sbil dominance intras 1candela',
  'sbil. dominance intras. 1 candela',
  'sbil dominance intras. 1 candela',
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

export function matchKnownSheetStrategy(sheetName: string): string | null {
  const normalizedSpace = sheetName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedSpace) return null;
  if (
    KNOWN_SHEET_ALIASES.has(normalizedSpace) ||
    normalizedSpace.includes('mutazion') ||
    normalizedSpace.includes('dominance reale') ||
    normalizedSpace.includes('intradominance') ||
    normalizedSpace.includes('intras') ||
    normalizedSpace.includes('1candela') ||
    normalizedSpace.includes('1 candela')
  ) {
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

  const s = String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s*([/\-.])\s*/g, '$1')
    .replace(/\s+/g, ' ');
  if (!s) return '';

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY (supports 1- or 2-digit day/month, 2- or 4-digit year)
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

function extractEmbeddedTime(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const hh = String(raw.getHours()).padStart(2, '0');
    const mm = String(raw.getMinutes()).padStart(2, '0');
    return hh === '00' && mm === '00' ? '' : `${hh}:${mm}`;
  }

  const numericVal =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d{5}\.\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : NaN;

  if (Number.isFinite(numericVal) && numericVal > 20000 && numericVal < 90000) {
    const frac = numericVal - Math.floor(numericVal);
    if (frac > 0.0001) {
      const totalMinutes = Math.round(frac * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }

  const s = String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .trim();
  const timeInStr = /(?:T|\s)(\d{1,2})\s*[:.h]\s*(\d{2})(?:[:.]\d{2})?\s*(AM|PM)?/i.exec(s);
  if (timeInStr) {
    let hh = Number(timeInStr[1]);
    const mm = Number(timeInStr[2]);
    const ampm = timeInStr[3]?.toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return '';
}

export function normalizeImportTime(raw: unknown): string {
  const numericFraction =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^0(?:[.,]\d+)$/.test(raw.trim())
        ? Number(raw.trim().replace(',', '.'))
        : NaN;

  if (Number.isFinite(numericFraction) && numericFraction >= 0 && numericFraction < 1) {
    const totalMinutes = Math.round(numericFraction * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const hh = String(raw.getHours()).padStart(2, '0');
    const mm = String(raw.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const s = String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!s) return '';

  const m = /^(\d{1,2})\s*[:.h]\s*(\d{2})(?:\s*[:.]\s*\d{2})?\s*(AM|PM)?$/i.exec(s);
  if (m) {
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ampm = m[3]?.toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return extractEmbeddedTime(s) || s;
}

function formatExcelTimeCell(raw: unknown): string {
  return normalizeImportTime(raw);
}

export function normalizeOpenTimestamp(date: unknown, entryTime?: unknown): string {
  const normDate = normalizeImportDate(date);
  const embedded = extractEmbeddedTime(date);
  const normTime = normalizeImportTime(entryTime) || embedded || '00:00';
  const hhmm = /^\d{2}:\d{2}$/.test(normTime) ? normTime : '00:00';
  return `${normDate}T${hhmm}`;
}

export function normalizeAssetKey(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeCanonicalNumberKey(raw: unknown, decimals = 2): string {
  let num: number | null = null;
  if (typeof raw === 'number') {
    num = Number.isFinite(raw) ? raw : 0;
  } else {
    num = parseNumericRCell(raw);
  }
  const rounded = roundTo(num ?? 0, decimals);
  const safe = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  return Number(safe.toFixed(decimals)).toString();
}

/**
 * Core composite duplicate signature matching:
 * Normalized Asset + Strategy + Date + Time + Direction + Outcome + #R
 * Ensures formatting variations ('08/01/2025' vs '8/1/2025', '4,00' vs '4.00' vs '4',
 * case differences, and extra whitespace) never create duplicates.
 */
export function buildTradeCoreDuplicateKey(
  trade: Pick<
    TradeRecord,
    'date' | 'entryTime' | 'asset' | 'setup' | 'strategy' | 'bias' | 'outcome' | 'netR'
  >,
): string {
  const openTimestamp = normalizeOpenTimestamp(trade.date, trade.entryTime);
  const symbol = normalizeAssetKey(trade.asset);
  const setupStrategy = normalizeSetupName(
    String(trade.setup || trade.strategy || 'S1')
      .replace(/\u00A0/g, ' ')
      .trim()
      .replace(/\s+/g, ' '),
  )
    .trim()
    .toUpperCase();
  const direction =
    String(trade.bias ?? '').replace(/\u00A0/g, ' ').trim().toUpperCase() === 'SHORT'
      ? 'SHORT'
      : 'LONG';
  const outcomeKey = normalizeOutcome(
    String(trade.outcome ?? '').replace(/\u00A0/g, ' ').trim(),
  );
  const netRKey = normalizeCanonicalNumberKey(trade.netR, 2);

  return `${symbol}|${setupStrategy}|${openTimestamp}|${direction}|${outcomeKey}|${netRKey}`;
}

export function buildTradeDuplicateKey(
  trade: Pick<
    TradeRecord,
    | 'date'
    | 'entryTime'
    | 'exitTime'
    | 'asset'
    | 'setup'
    | 'strategy'
    | 'bias'
    | 'outcome'
    | 'riskPct'
    | 'entryPrice'
    | 'slPrice'
    | 'tpPrice'
    | 'netR'
    | 'netReturnPct'
  >,
): string {
  const openTimestamp = normalizeOpenTimestamp(trade.date, trade.entryTime);
  const exitTimeKey = trade.exitTime ? normalizeImportTime(trade.exitTime) : 'NONE';
  const symbol = normalizeAssetKey(trade.asset);
  const setupStrategy = normalizeSetupName(
    String(trade.setup || trade.strategy || 'S1')
      .replace(/\u00A0/g, ' ')
      .trim()
      .replace(/\s+/g, ' '),
  )
    .trim()
    .toUpperCase();
  const direction =
    String(trade.bias ?? '').replace(/\u00A0/g, ' ').trim().toUpperCase() === 'SHORT'
      ? 'SHORT'
      : 'LONG';
  const outcomeKey = normalizeOutcome(
    String(trade.outcome ?? '').replace(/\u00A0/g, ' ').trim(),
  );

  const normalizePrice = (val: unknown): string => {
    const parsed = typeof val === 'number' ? val : parseNumericRCell(val);
    return parsed !== null && Number.isFinite(parsed) && parsed > 0
      ? String(Number(parsed.toFixed(6)))
      : 'NONE';
  };
  const entryKey = normalizePrice(trade.entryPrice);
  const slKey = normalizePrice(trade.slPrice);
  const tpKey = normalizePrice(trade.tpPrice);

  const netRParsed =
    typeof trade.netR === 'number' ? trade.netR : parseNumericRCell(trade.netR);
  const netRVal = netRParsed !== null && Number.isFinite(netRParsed) ? netRParsed : 0;

  const returnPctParsed =
    typeof trade.netReturnPct === 'number'
      ? trade.netReturnPct
      : parseNumericRCell(trade.netReturnPct);
  const returnPctVal =
    returnPctParsed !== null && Number.isFinite(returnPctParsed)
      ? returnPctParsed
      : netRVal * (Number.isFinite(trade.riskPct) ? trade.riskPct : 1);

  const netRKey = normalizeCanonicalNumberKey(netRVal, 2);
  const returnPctKey = normalizeCanonicalNumberKey(returnPctVal, 2);

  return `${openTimestamp}|${exitTimeKey}|${symbol}|${setupStrategy}|${direction}|${outcomeKey}|${netRKey}|${returnPctKey}|${entryKey}|${slKey}|${tpKey}`;
}

export function deduplicateImportedTrades(
  existingTrades: TradeRecord[],
  incomingTrades: TradeRecord[],
  options?: { keyFn?: (trade: TradeRecord) => string },
): { addedTrades: TradeRecord[]; skippedDuplicates: number } {
  const getKey = options?.keyFn ?? buildTradeDuplicateKey;
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  existingTrades.forEach((tr) => {
    seenKeys.add(getKey(tr));
    if (tr.id) seenIds.add(tr.id);
  });

  const addedTrades: TradeRecord[] = [];
  let skippedDuplicates = 0;

  incomingTrades.forEach((tr) => {
    const key = getKey(tr);
    if (seenKeys.has(key) || (tr.id && seenIds.has(tr.id))) {
      skippedDuplicates += 1;
      return;
    }
    seenKeys.add(key);
    if (tr.id) seenIds.add(tr.id);
    addedTrades.push(tr);
  });

  return { addedTrades, skippedDuplicates };
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

interface ResolvedColIndices {
  date: number;
  day: number;
  session: number;
  time: number;
  bias: number;
  overnight: number;
  notes: number;
  outcome: number;
  netR: number;
  rrMax: number;
  rProg: number;
  link: number;
  maxMappedCol: number;
}

const DEFAULT_COL_INDICES: ResolvedColIndices = {
  date: 0,
  day: 1,
  session: 2,
  time: 3,
  bias: 4,
  overnight: 5,
  notes: 6,
  outcome: 7,
  netR: 8,
  rrMax: 9,
  rProg: 10,
  link: 11,
  maxMappedCol: 11,
};

function resolveHeaderColumns(row: unknown[]): {
  isHeader: boolean;
  cols: ResolvedColIndices | null;
} {
  const c0Upper = String(row[0] ?? '').trim().toUpperCase();
  const normalizedCells = row.map((cell) =>
    String(cell ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' '),
  );

  let matchedNamedCount = 0;
  const detected: Partial<ResolvedColIndices> = {};
  let maxIdx = 0;

  normalizedCells.forEach((label, idx) => {
    if (!label) return;
    if ((label === 'DATA' || label === 'DATE') && detected.date === undefined) {
      detected.date = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'GIORNO' || label === 'DAY') && detected.day === undefined) {
      detected.day = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'SESSIONE' || label === 'SESSION') && detected.session === undefined) {
      detected.session = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'ORARIO' || label === 'ORA' || label === 'TIME') && detected.time === undefined) {
      detected.time = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'BIAS' || label === 'DIREZIONE' || label === 'DIRECTION') && detected.bias === undefined) {
      detected.bias = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'OVER NIGHT' || label === 'OVERNIGHT') && detected.overnight === undefined) {
      detected.overnight = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'NOTE' || label === 'NOTES' || label === 'COMMENTO') && detected.notes === undefined) {
      detected.notes = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'ESITO' || label === 'OUTCOME' || label === 'RISULTATO') && detected.outcome === undefined) {
      detected.outcome = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if (
      (label === '# R' || label === '#R' || label === 'R' || label === 'NET R' || label === 'R NETTO') &&
      detected.netR === undefined
    ) {
      detected.netR = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if ((label === 'RR MAX' || label === 'RRMAX' || label === 'MAX RR') && detected.rrMax === undefined) {
      detected.rrMax = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if (
      (label === 'R PROGRESS' || label === 'R PROGRESSIVI' || label === 'PROGRESSIVE R' || label === 'R PROGR') &&
      detected.rProg === undefined
    ) {
      detected.rProg = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    } else if (
      (label === 'LINK' || label === 'URL' || label === 'TRADINGVIEW' || label === 'TV' || label === 'GRAFICO' || label === 'CHART') &&
      detected.link === undefined
    ) {
      detected.link = idx;
      matchedNamedCount++;
      maxIdx = Math.max(maxIdx, idx);
    }
  });

  if (matchedNamedCount >= 3 && (detected.date !== undefined || detected.outcome !== undefined)) {
    const baseCol = detected.date ?? 0;
    return {
      isHeader: true,
      cols: {
        date: detected.date ?? baseCol,
        day: detected.day ?? baseCol + 1,
        session: detected.session ?? baseCol + 2,
        time: detected.time ?? baseCol + 3,
        bias: detected.bias ?? baseCol + 4,
        overnight: detected.overnight ?? baseCol + 5,
        notes: detected.notes ?? baseCol + 6,
        outcome: detected.outcome ?? baseCol + 7,
        netR: detected.netR ?? baseCol + 8,
        rrMax: detected.rrMax ?? baseCol + 9,
        rProg: detected.rProg ?? baseCol + 10,
        link: detected.link ?? Math.max(maxIdx + 1, baseCol + 11),
        maxMappedCol: Math.max(maxIdx, baseCol + 11),
      },
    };
  }

  if (c0Upper.includes('DATA') || c0Upper.includes('COLONNA')) {
    return { isHeader: true, cols: null };
  }

  return { isHeader: false, cols: null };
}

function isHttpUrl(val: string): boolean {
  return /^https?:\/\/\S+/i.test(val.trim());
}

/**
 * Header-aware + stacked-block parser supporting both:
 * 1) Exact named columns (DATA, GIORNO, SESSIONE, ORARIO, BIAS, OVER NIGHT, NOTE, ESITO, # R, RR MAX, R PROGRESS, plus URL/Link on the right)
 * 2) Classic stacked "Colonna 1" 12-column Excel blocks
 */
function rowsMatrixToParsedSheet(
  sheetName: string,
  matrix: unknown[][],
  isExcelSheet = false,
  hyperlinksByRowCol?: Map<string, string>,
): ParsedSheetData {
  const knownSheetStrategy = isExcelSheet
    ? matchKnownSheetStrategy(sheetName)
    : null;

  let blockIndex = -1;
  const blockCounts: number[] = [];
  const parsedRows: Record<string, string>[] = [];
  let activeCols: ResolvedColIndices = DEFAULT_COL_INDICES;

  for (let r = 0; r < matrix.length; r++) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    const headerCheck = resolveHeaderColumns(row);

    if (headerCheck.isHeader) {
      blockIndex++;
      while (blockCounts.length <= blockIndex) blockCounts.push(0);
      if (headerCheck.cols) {
        activeCols = headerCheck.cols;
      }
      continue;
    }

    const c0Raw = row[activeCols.date];
    const c0Str = String(c0Raw ?? '').trim();
    const c0Upper = c0Str.toUpperCase();
    if (c0Upper.includes('DATA') || c0Upper.includes('COLONNA')) {
      continue;
    }

    // Strict row validation: skip empty rows where DATA or ESITO is empty
    const esitoTrimmed = String(row[activeCols.outcome] ?? '').trim();
    if (!c0Str || !esitoTrimmed) {
      continue;
    }

    const effectiveBlockIndex = blockIndex >= 0 ? blockIndex : 0;
    while (blockCounts.length <= effectiveBlockIndex) blockCounts.push(0);

    const dateIso = normalizeImportDate(c0Raw);
    if (!dateIso) continue;

    const rVal = parseNumericRCell(row[activeCols.netR]);
    const rrMaxVal = parseNumericRCell(row[activeCols.rrMax]);
    const rProgVal = parseNumericRCell(row[activeCols.rProg]);

    const stackedStrategy =
      STACKED_BLOCK_SETUPS[effectiveBlockIndex] ??
      STACKED_BLOCK_SETUPS[STACKED_BLOCK_SETUPS.length - 1];

    // If the sheet tab is named after a known strategy AND has only 1 block (blockIndex <= 0),
    // use the normalized sheet strategy; otherwise map by blockIndex (0..4).
    const assignedStrategy =
      knownSheetStrategy && effectiveBlockIndex === 0
        ? knownSheetStrategy
        : stackedStrategy;

    const embeddedTime = extractEmbeddedTime(c0Raw);
    const parsedTime = formatExcelTimeCell(row[activeCols.time]) || embeddedTime;

    // Extract URL from mapped LINK column, cell hyperlink target, or any rightmost URL column
    let resolvedLink = '';
    const linkColText = String(row[activeCols.link] ?? '').trim();
    const linkColHref = hyperlinksByRowCol?.get(`${r}:${activeCols.link}`) ?? '';
    if (isHttpUrl(linkColHref)) {
      resolvedLink = linkColHref.trim();
    } else if (isHttpUrl(linkColText)) {
      resolvedLink = linkColText;
    } else {
      const scanStart = Math.max(activeCols.rProg + 1, activeCols.rrMax + 1, activeCols.link);
      for (let c = scanStart; c < row.length; c++) {
        const href = hyperlinksByRowCol?.get(`${r}:${c}`) ?? '';
        const cellText = String(row[c] ?? '').trim();
        if (isHttpUrl(href)) {
          resolvedLink = href.trim();
          break;
        }
        if (isHttpUrl(cellText)) {
          resolvedLink = cellText;
          break;
        }
      }
      if (!resolvedLink && linkColText) {
        resolvedLink = linkColText;
      }
    }

    const rowObj: Record<string, string> = {
      DATA: dateIso,
      GIORNO: String(row[activeCols.day] ?? '').trim(),
      SESSIONE: String(row[activeCols.session] ?? '').trim(),
      ORARIO: parsedTime,
      BIAS: String(row[activeCols.bias] ?? '').trim().toUpperCase(),
      OVERNIGHT: String(row[activeCols.overnight] ?? '').trim(),
      NOTE: String(row[activeCols.notes] ?? '').trim(),
      ESITO: esitoTrimmed.toUpperCase(),
      R: String(rVal !== null ? rVal : 0),
      'RR MAX': rrMaxVal !== null ? String(rrMaxVal) : '',
      'R PROGRESSIVI':
        rProgVal !== null ? String(rProgVal) : String(row[activeCols.rProg] ?? '').trim(),
      LINK: resolvedLink,
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

function extractSheetHyperlinks(
  XLSX: typeof XLSXModule,
  sheet: XLSXModule.WorkSheet,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const addr of Object.keys(sheet)) {
    if (addr.startsWith('!')) continue;
    const cell = sheet[addr] as XLSXModule.CellObject | undefined;
    const target = cell?.l?.Target;
    if (typeof target === 'string' && target.trim()) {
      const decoded = XLSX.utils.decode_cell(addr);
      map.set(`${decoded.r}:${decoded.c}`, target.trim());
    }
  }
  return map;
}

export function parseExcelWorkbookBuffer(
  arrayBuffer: ArrayBuffer,
  options?: { sheetNameFilter?: (sheetName: string) => boolean },
): {
  sheets: ParsedSheetData[];
  sheetNames: string[];
} {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('La cartella di lavoro Excel è vuota.');
  }

  const XLSX = getXlsxLib();
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

  const targetSheetNames = options?.sheetNameFilter
    ? workbook.SheetNames.filter(options.sheetNameFilter)
    : workbook.SheetNames;

  const sheets = targetSheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: true,
    });
    const hyperlinks = extractSheetHyperlinks(XLSX, sheet);
    return rowsMatrixToParsedSheet(sheetName, matrix, true, hyperlinks);
  }).filter((s): s is ParsedSheetData => s !== null && s.rows.length > 0);

  return {
    sheets,
    sheetNames: workbook.SheetNames,
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
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const { sheets, sheetNames } = parseExcelWorkbookBuffer(arrayBuffer);

    if (sheets.length === 0) {
      throw new Error(
        `Nessun trade valido trovato nei fogli (${sheetNames.join(', ')}).`,
      );
    }

    return sheets;
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
    const isMissedByRule = notesText.toUpperCase().includes('NON PRESO');

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
    } else if (fieldValues.setup) {
      setup = normalizeSetupName(fieldValues.setup);
    } else if (sheet.isExcelSheet) {
      setup = normalizeSetupName(sheet.sheetName);
    }

    const netR = netRParsed !== null ? roundTo(netRParsed, 2) : 0;
    const riskParsed = parseNumericRCell(fieldValues.riskPct);
    const riskPct = riskParsed !== null && riskParsed >= 0 ? riskParsed : 1;
    const entryParsed = parseNumericRCell(fieldValues.entryPrice);
    const slParsed = parseNumericRCell(fieldValues.slPrice);
    const tpParsed = parseNumericRCell(fieldValues.tpPrice);
    const normEntryTime = normalizeImportTime(fieldValues.entryTime ?? rawRow.ORARIO ?? '');

    const mappedReason = String(fieldValues.missedReason ?? '').trim();
    const missedReason = mappedReason
      ? mappedReason
      : isMissedByRule
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
      entryTime: normEntryTime || undefined,
      asset,
      setup,
      strategy: setup,
      isMissed: isMissedByRule || finalCategory === 'missed',
      bias,
      riskPct,
      entryPrice: entryParsed,
      slPrice: slParsed,
      tpPrice: tpParsed,
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

function normalizeRestoredTrade(
  raw: Record<string, unknown>,
  fallbackCategory: TradeCategory,
  idx: number,
): TradeRecord | null {
  const asset = String(raw.asset ?? raw.pair ?? raw.ticker ?? '').trim().toUpperCase();
  const date = normalizeImportDate(raw.date ?? raw.data);
  if (!asset || !date) return null;

  const category: TradeCategory =
    raw.category === 'backtest' || raw.category === 'live' || raw.category === 'missed'
      ? raw.category
      : fallbackCategory;
  const setup = normalizeSetupName(String(raw.setup ?? raw.strategy ?? 'S1'));
  const biasRaw = String(raw.bias ?? raw.direction ?? 'LONG').toUpperCase();
  const bias = biasRaw === 'SHORT' ? 'SHORT' : 'LONG';
  const outcome = normalizeOutcome(String(raw.outcome ?? 'BE'));
  const toFiniteOrNull = (val: unknown): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const n = typeof val === 'number' ? val : Number(String(val).replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  };
  const netRNum = toFiniteOrNull(raw.netR ?? raw.rMultiple ?? raw.pnl ?? raw.result) ?? 0;
  const riskNum = toFiniteOrNull(raw.riskPct) ?? 1;
  const netR = roundTo(netRNum, 2);
  const riskPct = riskNum >= 0 ? riskNum : 1;

  return runRowCalculationEngine({
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateTradeId(category.slice(0, 2)),
    category,
    date,
    day: typeof raw.day === 'string' ? raw.day : undefined,
    session: typeof raw.session === 'string' ? raw.session : undefined,
    entryTime: raw.entryTime ? normalizeImportTime(raw.entryTime) : undefined,
    exitTime: raw.exitTime ? normalizeImportTime(raw.exitTime) : undefined,
    asset,
    setup,
    strategy: setup,
    isMissed: category === 'missed' || Boolean(raw.isMissed),
    bias,
    riskPct,
    entryPrice: toFiniteOrNull(raw.entryPrice),
    slPrice: toFiniteOrNull(raw.slPrice),
    tpPrice: toFiniteOrNull(raw.tpPrice),
    slPips: toFiniteOrNull(raw.slPips),
    tpPips: toFiniteOrNull(raw.tpPips),
    targetRR: toFiniteOrNull(raw.targetRR),
    outcome,
    netR,
    rrMax: toFiniteOrNull(raw.rrMax),
    netReturnPct: roundTo(netR * riskPct, 2),
    missedReason:
      category === 'missed'
        ? String(raw.missedReason ?? '').trim() || MISSED_REASONS[0]
        : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    tradingViewUrl: typeof raw.tradingViewUrl === 'string' ? raw.tradingViewUrl : '',
    extraColumns:
      raw.extraColumns && typeof raw.extraColumns === 'object' && !Array.isArray(raw.extraColumns)
        ? (raw.extraColumns as Record<string, string>)
        : undefined,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now() + idx,
  });
}

export function parseBackupJsonContent(rawText: string): {
  backtest: TradeRecord[];
  live: TradeRecord[];
  missed: TradeRecord[];
} {
  const parsed = JSON.parse(rawText) as unknown;
  const backtest: TradeRecord[] = [];
  const live: TradeRecord[] = [];
  const missed: TradeRecord[] = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      const tr = normalizeRestoredTrade(item as Record<string, unknown>, 'backtest', idx);
      if (!tr) return;
      if (tr.category === 'backtest') backtest.push(tr);
      else if (tr.category === 'missed') missed.push(tr);
      else live.push(tr);
    });
    return { backtest, live, missed };
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const btArr = Array.isArray(obj.backtest) ? obj.backtest : [];
    const liveArr = Array.isArray(obj.live)
      ? obj.live
      : Array.isArray(obj.trades)
        ? obj.trades
        : [];
    const missedArr = Array.isArray(obj.missed) ? obj.missed : [];

    btArr.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const tr = normalizeRestoredTrade(item as Record<string, unknown>, 'backtest', idx);
        if (tr) backtest.push(tr);
      }
    });
    liveArr.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const tr = normalizeRestoredTrade(item as Record<string, unknown>, 'live', idx);
        if (tr) live.push(tr);
      }
    });
    missedArr.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const tr = normalizeRestoredTrade(item as Record<string, unknown>, 'missed', idx);
        if (tr) missed.push(tr);
      }
    });
  }

  return { backtest, live, missed };
}
