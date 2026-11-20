# DiarioTrade — Mechanical Trading Journal

Applicazione web standalone sviluppata con **Vite + React + TypeScript + Tailwind CSS** con persistenza automatica su `localStorage`.

## Caratteristiche Principali

- **Interfaccia 100% in Italiano** con 4 viste dedicate: `Dashboard`, `Backtest`, `Journal Reale` e `Trade Non Presi`.
- **5 Strategie Fisse (Whitelist Stretta)**: `S1`, `SSA`, `MUT`, `SBIL DOMINANCE REALE`, `SBIL INTRADOMINANCE`.
- **Importer Multi-Asset Excel (`.xlsx` / `.xls`) & `.csv` (SheetJS)**:
  - Riconoscimento automatico dell'asset dal nome del file (`CHF/JPY`, `EUR/USD`, `XAU/USD`, `US30`, `NASDAQ`, ecc.) con filtro Asset dedicato.
  - Mappatura posizionale rigorosa delle colonne `0–11` (`DATA`/`Colonna 1`, `GIORNO`, `SESSIONE`, `ORARIO`, `BIAS`, `OVERNIGHT`, `NOTE`, `ESITO`, `R`, `RR MAX`, `R PROGRESSIVI`, `LINK`), ignorando automaticamente eventuali tabelle di riepilogo a destra (`12+`).
  - Assegnazione sequenziale automatica dei 5 blocchi verticali o dei fogli Excel alle 5 strategie ufficiali.
- **Separazione Rigorosa Conto Reale vs Trade Non Presi**:
  - Qualsiasi operazione con `ESITO = UNFILLED` o con `NON PRESO` nelle note viene esclusa al 100% dalle statistiche reali (Win Rate %, R:R Netto, Profit Factor, Curva Equity) e instradata nella sezione **Trade Non Presi**.
- **Backup & Sicurezza Dati**:
  - Persistenza locale in `localStorage`.
  - Pulsanti dedicati per **Esporta Backup CSV**, **Esporta Backup JSON** e **Resetta Dati** con conferma di sicurezza.

## Avvio in Locale

```bash
npm install
npm run dev
```

L'applicazione sarà disponibile su `http://localhost:3000`.

## Build per Deploy Web Statico

```bash
npm run build
```

I file pronti per il deploy verranno generati nella cartella `dist/` (compatibile con Vercel, Netlify, Cloudflare Pages o qualsiasi hosting statico).
