import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getFriendlyGeminiErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'Chiave GEMINI_API_KEY non valida o priva di permessi. Verifica Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message: 'Quota Gemini API esaurita temporaneamente (429). Riprova tra poco o verifica il piano API.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 502,
      message: 'Modello Gemini non disponibile al momento.',
    };
  }
  return {
    status: 500,
    message: raw || 'Errore durante la chiamata a Gemini API.',
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/gemini/coach', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY non configurata. Imposta la chiave nel pannello Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as { contextPrompt?: string };
    const contextPrompt =
      typeof body.contextPrompt === 'string' ? body.contextPrompt.trim() : '';
    if (!contextPrompt) {
      res.status(400).json({ error: 'Dati di analisi mancanti.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextPrompt,
        config: {
          systemInstruction: [
            'Sei un trading coach istituzionale diretto, pragmatico e specializzato in esecuzione meccanica.',
            'Rispondi ESCLUSIVAMENTE in italiano con un array JSON di esattamente 3 punti ("bullets").',
            'Ogni punto deve essere breve, incisivo (1-2 frasi al massimo), privo di convenevoli o introduzioni.',
            'Regole per i 3 punti:',
            '1) Confronta chiaramente Journal Reale vs Backtest indicando dove avviene lo scostamento (R, Win Rate o setup).',
            '2) Evidenzia SOLO i veri errori esecutivi/comportamentali (trade backtest non presi senza giustificazione, trade extra fuori backtest, discrepanze esito/direzione o note come x sbaglio/fuori piano). NON considerare mai errori gli skip consapevoli (CONSAPEVOLE, NON PRESO CONSAPEVOLE, PAUSA LAVORO, FESTIVO).',
            '3) Dai un consiglio pratico e immediato da applicare dalla prossima sessione per azzerare questi errori.',
          ].join(' '),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Esattamente 3 bullet diretti in italiano.',
              },
            },
            required: ['bullets'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Risposta vuota ricevuta da Gemini API.' });
        return;
      }

      const parsed = JSON.parse(rawText) as { bullets?: unknown };
      const bullets = Array.isArray(parsed.bullets)
        ? parsed.bullets
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
            .slice(0, 3)
        : [];

      if (bullets.length === 0) {
        res.status(502).json({ error: 'Formato analisi Gemini non valido.' });
        return;
      }

      res.json({ bullets });
    } catch (err) {
      const friendly = getFriendlyGeminiErrorMessage(err);
      res.status(friendly.status).json({ error: friendly.message });
    }
  });

  app.post('/api/gemini/review', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY non configurata.',
      });
      return;
    }

    const body = (req.body ?? {}) as { prompt?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      res.status(400).json({ error: 'Prompt mancante.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Sei un trading coach quantitativo esperto in strategie meccaniche. Rispondi in italiano in modo chiaro, sintetico e orientato ai dati.',
        },
      });

      const review = (response.text ?? '').trim();
      if (!review) {
        res.status(502).json({ error: 'Risposta vuota ricevuta da Gemini API.' });
        return;
      }
      res.json({ review });
    } catch (err) {
      const friendly = getFriendlyGeminiErrorMessage(err);
      res.status(friendly.status).json({ error: friendly.message });
    }
  });

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build dist/ non trovato.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
