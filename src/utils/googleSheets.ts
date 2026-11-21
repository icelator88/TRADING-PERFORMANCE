import type { GoogleSheetSource, TradeRecord } from '../types/trading';
import {
  autoDetectColumnMapping,
  buildTradesFromSheet,
  parseExcelWorkbookBuffer,
} from './importer';

export const GOOGLE_SHEET_STRATEGY_TABS: Record<string, string> = {
  S1: 'S1',
  SSA: 'SSA',
  MUTAZIONE: 'MUT',
  'SBIL. DOMINANCE REALE': 'SBIL DOMINANCE REALE',
  'SBIL. DOMINANCE INTRAS. 1CANDELA': 'SBIL INTRADOMINANCE',
  // Excel/XLSX export caps worksheet names at 31 chars (truncates trailing "a")
  'SBIL. DOMINANCE INTRAS. 1CANDEL': 'SBIL INTRADOMINANCE',
};

export function matchExactGoogleSheetStrategyTab(
  sheetName: string,
): string | null {
  const key = String(sheetName ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!key) return null;
  return GOOGLE_SHEET_STRATEGY_TABS[key] ?? null;
}

export interface ParsedGoogleSheetLink {
  spreadsheetId: string;
  canonicalUrl: string;
  exportUrl: string;
}

export interface GoogleSheetFetchResult {
  trades: TradeRecord[];
  sheetNames: string[];
  matchedTabs: { sheetName: string; strategy: string; rowCount: number }[];
}

/**
 * Validates a Google Sheets URL and extracts the Spreadsheet ID, returning both
 * a canonical URL to persist and the direct multi-tab XLSX export endpoint.
 */
export function parseGoogleSheetUrl(rawUrl: string): ParsedGoogleSheetLink {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Inserisci un URL Google Sheets valido.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(
      'URL non valido. Incolla il link completo (es. https://docs.google.com/spreadsheets/d/.../edit).',
    );
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'docs.google.com') {
    throw new Error(
      'Il link deve appartenere a https://docs.google.com/spreadsheets/d/...',
    );
  }

  if (parsedUrl.pathname.includes('/spreadsheets/d/e/')) {
    throw new Error(
      'Hai incollato un link "Pubblica sul web" (/d/e/...). Usa il link standard di condivisione (/spreadsheets/d/ID/edit) con accesso "Chiunque abbia il link → Visualizzatore".',
    );
  }

  const match = /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_\-]+)/.exec(
    parsedUrl.pathname,
  );
  const spreadsheetId = match?.[1] ?? '';

  if (!spreadsheetId || spreadsheetId.length < 10 || !/^[a-zA-Z0-9_\-]+$/.test(spreadsheetId)) {
    throw new Error(
      'Impossibile estrarre l’ID del foglio Google dall’URL inserito.',
    );
  }

  return {
    spreadsheetId,
    canonicalUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    exportUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`,
  };
}

export function buildGoogleSheetExportUrl(spreadsheetId: string): string {
  const cleanId = spreadsheetId.trim();
  if (!/^[a-zA-Z0-9_\-]{10,128}$/.test(cleanId)) {
    throw new Error('ID foglio Google non valido.');
  }
  return `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=xlsx`;
}

export function generateGoogleSheetSourceId(): string {
  return `gs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function hasXlsxMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  // ZIP/XLSX files always begin with PK (0x50 0x4B)
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Parses an already-downloaded Google Sheets XLSX ArrayBuffer, strictly reading ONLY the 5 exact strategy tabs
 * ('S1', 'SSA', 'MUTAZIONE', 'SBIL. DOMINANCE REALE', 'SBIL. DOMINANCE INTRAS. 1candela') and ignoring any others.
 */
export function parseGoogleSheetWorkbookBuffer(
  arrayBuffer: ArrayBuffer,
  assetName: string,
  category: 'backtest' | 'live',
): GoogleSheetFetchResult {
  const cleanAsset = assetName.trim().toUpperCase();
  const { sheets, sheetNames } = parseExcelWorkbookBuffer(arrayBuffer, {
    sheetNameFilter: (name) => matchExactGoogleSheetStrategyTab(name) !== null,
  });

  const matchedWorkbookTabs = sheetNames.filter(
    (name) => matchExactGoogleSheetStrategyTab(name) !== null,
  );

  if (matchedWorkbookTabs.length === 0) {
    throw new Error(
      `Nessuna delle 5 schede strategia ('S1', 'SSA', 'MUTAZIONE', 'SBIL. DOMINANCE REALE', 'SBIL. DOMINANCE INTRAS. 1candela') trovata nel foglio di ${cleanAsset}. Schede presenti: ${sheetNames.join(', ')}`,
    );
  }

  const allTrades: TradeRecord[] = [];
  const matchedTabs: { sheetName: string; strategy: string; rowCount: number }[] = [];

  for (const sheet of sheets) {
    const exactStrategy = matchExactGoogleSheetStrategyTab(sheet.sheetName);
    if (!exactStrategy) continue;

    const mapping = autoDetectColumnMapping(sheet.headers);
    const sheetTrades = buildTradesFromSheet(
      sheet,
      mapping,
      category,
      exactStrategy,
      cleanAsset,
    ).map((tr) => ({
      ...tr,
      asset: cleanAsset,
      setup: exactStrategy,
      strategy: exactStrategy,
    }));

    if (sheetTrades.length > 0) {
      matchedTabs.push({
        sheetName: sheet.sheetName,
        strategy: exactStrategy,
        rowCount: sheetTrades.length,
      });
      allTrades.push(...sheetTrades);
    }
  }

  return {
    trades: allTrades,
    sheetNames: matchedWorkbookTabs,
    matchedTabs,
  };
}

/**
 * Directly downloads the multi-tab XLSX workbook from Google Sheets export endpoint,
 * strictly reads ONLY the 5 exact strategy tabs (ignoring summary/dashboard/extra tabs),
 * maps exact columns + hyperlink URLs, and builds normalized TradeRecord entries tagged with source.asset.
 */
export async function fetchAndParseGoogleSheetTrades(
  source: GoogleSheetSource,
): Promise<GoogleSheetFetchResult> {
  const exportUrl = buildGoogleSheetExportUrl(source.spreadsheetId);
  const assetName = source.asset.trim().toUpperCase();

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'rete non raggiungibile';
    throw new Error(
      `Errore di connessione per ${assetName} (${detail}). Verifica che il Google Sheet sia condiviso come "Chiunque abbia il link → Visualizzatore".`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Accesso negato per ${assetName}. Imposta la condivisione Google Sheets su "Chiunque abbia il link → Visualizzatore".`,
    );
  }

  if (response.status === 404) {
    throw new Error(
      `Google Sheet non trovato per ${assetName} (404). Controlla che l'URL sia corretto.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Download Google Sheet fallito per ${assetName} (HTTP ${response.status}).`,
    );
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const arrayBuffer = await response.arrayBuffer();

  if (contentType.includes('text/html') || !hasXlsxMagicBytes(arrayBuffer)) {
    throw new Error(
      `Il foglio Google di ${assetName} richiede login Google o non è pubblico. Condividilo con "Chiunque abbia il link → Visualizzatore".`,
    );
  }

  return parseGoogleSheetWorkbookBuffer(arrayBuffer, assetName, source.category);
}
