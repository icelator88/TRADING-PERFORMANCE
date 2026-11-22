import type { PerformanceStats, TradeRecord } from '../types/trading';
import { formatR, sortTradesChronologically } from './calculations';

export interface GeminiReviewPayload {
  prompt: string;
  liveStats: {
    totalTrades: number;
    winRatePct: number;
    netR: number;
    expectancyR: number;
  };
}

export function buildGeminiReviewPrompt(
  liveStats: PerformanceStats,
  liveTrades: TradeRecord[],
): GeminiReviewPayload {
  const recent = sortTradesChronologically(liveTrades).slice(-15);

  const recentLines = recent
    .map((t) => {
      const extraNotes = t.notes ? ` | Note: ${t.notes}` : '';
      return `- ${t.date} | ${t.asset} | ${t.setup} | ${t.bias} | ${t.outcome} (${formatR(t.netR)})${extraNotes}`;
    })
    .join('\n');

  const prompt = [
    'Sei un trading coach quantitativo esperto in strategie meccaniche.',
    'Analizza i dati del Journal Reale e fornisci osservazioni operative su disciplina, esecuzione e gestione del rischio.',
    '',
    'STATISTICHE CONTO REALE:',
    `- Trade Totali Tracciati: ${liveStats.totalTrades}`,
    `- Win Rate (su eseguiti): ${liveStats.winRatePct.toFixed(1)}% (${liveStats.wins} Win / ${liveStats.losses} Loss / ${liveStats.breakevens} BE / ${liveStats.unfilled} UF)`,
    `- R:R Netto: ${formatR(liveStats.netR)}`,
    `- Aspettativa Media: ${formatR(liveStats.expectancyR)}`,
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
