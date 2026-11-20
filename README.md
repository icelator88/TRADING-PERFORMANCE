# trading-performance

**Performance (DiarioTrade)** — Mechanical Trading Journal & Institutional Analytics platform built with React, TypeScript, Vite, Tailwind CSS, and SheetJS (`xlsx`), configured for static deployment on **GitHub Pages** (`base: './'`).

**Live URL (GitHub Pages):** `https://<username>.github.io/trading-performance/`

---

## Core Modules
- **Dashboard & Confronto**: Side-by-side performance matrix comparing **Backtest** vs **Journal Reale** vs **Trade Non Presi**, Plan Adherence Score %, dual Equity Curve, and **AKINATOR — Scansione Completa Backtest**.
- **Backtest**: Isolated historical strategy database, Equity Curve, **Curva del Drawdown (R)**, institutional metrics, and multi-sheet Excel/CSV/PDF importer.
- **Journal Reale (Live Journaling)**: Executed live account statistics strictly excluding any `NON PRESO` / `MISSED` / `UNFILLED` trades.
- **Trade Non Presi**: Dedicated tracking of missed setups with psychological/operational reason breakdown and theoretical lost R.
- **Institutional Risk-Adjusted Metrics**: Profit Factor, Expectancy per Trade, CAGR %, Payoff Ratio (R:R), Max Consecutive Wins/Losses, Sharpe Ratio, Sortino Ratio, Calmar Ratio, Recovery Factor, Estimated Risk of Ruin (20R), and Monthly/Daily PnL distribution.

---

## Deploy on GitHub Pages
This project includes `base: './'` in `vite.config.ts` and a ready-to-use GitHub Actions workflow in `.github/workflows/deploy.yml`:

1. Push this repository to GitHub on the `main` branch.
2. Open **Settings → Pages** in your GitHub repository.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Every push to `main` automatically runs `npm ci && npm run build` and deploys `./dist` to `https://<username>.github.io/trading-performance/`.

---

## Local Development
```bash
npm install
npm run dev
```

## Backup & Data Transfer (`localStorage`)
All trades persist automatically in browser `localStorage` (`diariotrade_backtest_v1`, `diariotrade_live_v1`, `diariotrade_missed_v1`).
- Use **Esporta Backup JSON** (`Export Backup JSON`) to download your complete Backtest, Journal Reale, and Trade Non Presi backup.
- Use **Importa Backup JSON** (`Import Backup JSON`) to restore your data on GitHub Pages or across browsers/devices.
