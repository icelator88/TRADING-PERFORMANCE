import type {
  MissedStats,
  PerformanceStats,
  TradeRecord,
} from '../types/trading';
import { formatR, sortTradesChronologically } from './calculations';

export interface GeminiReviewPayload {
  prompt: string;
  liveStats: {
    totalTrades: number;
    winRatePct: number;
    netR: number;
    expectancyR: number;
  };
  missedStats: {
    totalMissed: number;
    theoreticalNetR: number;
    adherenceScorePct: number;
  };
}

export function buildGeminiReviewPrompt(
  liveStats: PerformanceStats,
  missedStats: MissedStats,
  liveTrades: TradeRecord[],
  missedTrades: TradeRecord[],
): GeminiReviewPayload {
  const recent = sortTradesChronologically([...liveTrades, ...missedTrades]).slice(-15);

  const recentLines = recent
    .map((t) => {
      const status = t.category === 'missed' ? 'NON PRESO' : 'ESEGUITO';
      const extraReason =
        t.category === 'missed' && t.missedReason ? ` | Motivo: ${t.missedReason}` : '';
      const extraNotes = t.notes ? ` | Note: ${t.notes}` : '';
      return `- ${t.date} | ${t.asset} | ${t.setup} | ${t.bias} | ${status} | ${t.outcome} (${formatR(t.netR)})${extraReason}${extraNotes}`;
    })
    .join('\n');

  const reasonLines = missedStats.reasonBreakdown
    .filter((r) => r.count > 0)
    .map((r) => `- ${r.reason}: ${r.count} (${formatR(r.impactR)})`)
    .join('\n');

  const prompt = [
    'Sei un trading coach quantitativo esperto in strategie meccaniche.',
    'Analizza i dati del Journal Meccanico (separando rigorosamente ESEGUITO vs NON PRESO) e fornisci osservazioni operative su disciplina, esecuzione e gestione del rischio.',
    '',
    'STATISTICHE CONTO REALE:',
    `- Trade Totali Tracciati: ${liveStats.totalTrades}`,
    `- Win Rate (su eseguiti): ${liveStats.winRatePct.toFixed(1)}% (${liveStats.wins} Win / ${liveStats.losses} Loss / ${liveStats.breakevens} BE / ${liveStats.unfilled} UF)`,
    `- R:R Netto: ${formatR(liveStats.netR)}`,
    `- Aspettativa Media: ${formatR(liveStats.expectancyR)}`,
    '',
    'TRADE NON PRESI & ADERENZA AL PIANO:',
    `- Setup Non Presi Totali: ${missedStats.totalMissed}`,
    `- R:R Teorico Perso: ${formatR(missedStats.theoreticalNetR)}`,
    `- Punteggio Aderenza al Piano: ${missedStats.adherenceScorePct.toFixed(1)}% (${missedStats.executedCount}/${missedStats.totalSignals})`,
    reasonLines ? `Dettaglio motivi:\n${reasonLines}` : '- Nessun motivo registrato.',
    '',
    'ULTIME OPERAZIONI:',
    recentLines || '- Nessuna operazione registrata.',
  ].join('\n');

  return {
    prompt,
    liveStats: {
      totalTrades: liveStats.totalTrades,
      winRatePct: liveStats.winRatePct,
      netR: liveStats.netR,
      expectancyR: liveStats.expectancyR,
    },
    missedStats: {
      totalMissed: missedStats.totalMissed,
      theoreticalNetR: missedStats.theoreticalNetR,
      adherenceScorePct: missedStats.adherenceScorePct,
    },
  };
}

/**
 * Placeholder predisposto per l'integrazione server-side con GEMINI_API_KEY
 * tramite endpoint /api/gemini/review.
 */
export async function analizzaTradeConGemini(
  payload: GeminiReviewPayload,
): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch('/api/gemini/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, text: '' };
    }
    const data = (await res.json()) as { review?: string };
    if (typeof data?.review === 'string' && data.review.trim()) {
      return { ok: true, text: data.review.trim() };
    }
    return { ok: false, text: '' };
  } catch {
    return { ok: false, text: '' };
  }
}
