import type { Language } from '../types/trading';

export interface TranslationSet {
  nav: {
    dashboard: string;
    backtest: string; // Protected: always "Backtest"
    live: string; // Protected: always "Live Journaling"
    missed: string;
    newTrade: string;
  };
  akinator: {
    title: string; // Protected: always "AKINATOR — FULL SCAN BACKTEST"
    subtitle: string;
    maxStreak: string;
    latestStatus: string;
    qualifyingWeeks: string;
    trackedAssets: string;
    consecutiveWeeks: string;
    weekSingular: string;
    noStreaksFound: string;
    detectedStreaksTitle: string;
    activeStreakNow: string;
    completedStreak: string;
    noActiveStreak: string;
    noBacktestData: string;
    ruleHint: string;
  };
  dashboard: {
    heading: string;
    subheading: string;
    backtestNetR: string;
    liveNetR: string;
    executionGap: string;
    adherenceScore: string;
    equityTitle: string;
    equitySubtitle: string;
    backtestSeries: string;
    liveSeries: string;
    winRate: string;
    expectancy: string;
    maxDrawdown: string;
    profitFactor: string;
    tradesCount: string;
    comparisonTableTitle: string;
    metricCol: string;
    missedCol: string;
    noEquityData: string;
  };
  journal: {
    backtestHeading: string;
    backtestSubtitle: string;
    liveHeading: string;
    liveSubtitle: string;
    missedHeading: string;
    missedSubtitle: string;
    totalTrades: string;
    winRate: string;
    netRR: string;
    avgExpectancy: string;
    missedTotal: string;
    theoreticalLostRR: string;
    adherencePct: string;
    reasonBreakdownTitle: string;
    reasonBreakdownSub: string;
    importFile: string;
    exportCsv: string;
    exportJson: string;
    importJson: string;
    resetData: string;
    geminiReview: string;
    searchPlaceholder: string;
    assetFilterAll: string;
    outcomeFilterAll: string;
    reasonFilterAll: string;
    emptyBacktest: string;
    emptyLive: string;
    emptyMissed: string;
    addFirstTrade: string;
    loadDemoData: string;
  };
  table: {
    date: string;
    asset: string;
    setup: string; // "SETUP"
    bias: string;
    entry: string;
    sl: string;
    tp: string;
    pips: string;
    risk: string;
    outcome: string;
    netR: string;
    rrMax: string;
    netPct: string;
    missedReason: string;
    notes: string;
    link: string;
    actions: string;
    edit: string;
    delete: string;
    extraCols: string;
  };
  modal: {
    newTradeTitle: string;
    editTradeTitle: string;
    categoryLabel: string;
    catBacktest: string;
    catLive: string;
    catMissed: string;
    dateLabel: string;
    assetLabel: string;
    setupLabel: string;
    biasLabel: string;
    riskPctLabel: string;
    entryPriceLabel: string;
    slPriceLabel: string;
    tpPriceLabel: string;
    outcomeLabel: string;
    netRLabel: string;
    rrMaxLabel: string;
    missedReasonLabel: string;
    notesLabel: string;
    tvLinkLabel: string;
    autoCalcPreview: string;
    cancel: string;
    save: string;
    saveChanges: string;
  };
  importer: {
    title: string;
    subtitle: string;
    dropPrompt: string;
    supportedFormats: string;
    selectSheet: string;
    allSheets: string;
    detectedRows: string;
    fiveBlockDetected: string;
    singleSetupOverride: string;
    keepAutoSetup: string;
    columnMappingTitle: string;
    previewTitle: string;
    importNow: string;
    cancel: string;
    parsingError: string;
  };
  confirm: {
    deleteTitle: string;
    deleteMessage: string;
    cancel: string;
    confirm: string;
  };
  gemini: {
    title: string;
    subtitle: string;
    close: string;
    copyPrompt: string;
    copied: string;
    summaryLabel: string;
    loading: string;
    noServerMessage: string;
  };
  common: {
    allSetups: string; // Protected: "ALL"
    filterBySetup: string;
    customSetupsLabel: string;
    executedSuffix: string;
    missedSuffix: string;
  };
}

export const TRANSLATIONS: Record<Language, TranslationSet> = {
  en: {
    nav: {
      dashboard: 'Dashboard',
      backtest: 'Backtest',
      live: 'Live Journaling',
      missed: 'Missed Trades',
      newTrade: 'New Trade',
    },
    akinator: {
      title: 'AKINATOR — FULL SCAN BACKTEST',
      subtitle: 'Pure Mechanical Strategy Scan (Excludes Live Journaling Errors)',
      maxStreak: 'Max Consecutive Streak',
      latestStatus: 'Latest Streak Status',
      qualifyingWeeks: 'Qualifying Weeks (<= -3.0 R all assets)',
      trackedAssets: 'Backtest Assets Scanned',
      consecutiveWeeks: 'Consecutive Weeks',
      weekSingular: 'Week',
      noStreaksFound: 'No 2+ consecutive qualifying drawdown weeks detected in Backtest.',
      detectedStreaksTitle: 'Detected Consecutive Drawdown Streaks (All Lengths)',
      activeStreakNow: 'Active Streak on Latest Week',
      completedStreak: 'Historical Streak',
      noActiveStreak: 'No Active Drawdown Streak',
      noBacktestData: 'Import or add Backtest trades to run the Akinator weekly scan.',
      ruleHint: 'Rule: A Mon–Sun calendar week qualifies only if EVERY Backtest asset closed <= -3.0 R.',
    },
    dashboard: {
      heading: 'Dashboard & Comparison',
      subheading: 'Isolated Backtest benchmark vs Live Journaling execution and plan adherence.',
      backtestNetR: 'Backtest Net R',
      liveNetR: 'Live Journaling Net R',
      executionGap: 'Execution Delta (Live - Backtest)',
      adherenceScore: 'Plan Adherence Score %',
      equityTitle: 'Equity Curve Comparison',
      equitySubtitle: 'Cumulative R progression across Backtest and executed Live Journaling trades.',
      backtestSeries: 'Backtest',
      liveSeries: 'Live Journaling',
      winRate: 'Win Rate',
      expectancy: 'Avg Expectancy',
      maxDrawdown: 'Max Drawdown',
      profitFactor: 'Profit Factor',
      tradesCount: 'Total Trades',
      comparisonTableTitle: 'Performance Comparison Matrix',
      metricCol: 'Metric',
      missedCol: 'Missed Trades',
      noEquityData: 'Add Backtest or Live Journaling trades to render the equity comparison.',
    },
    journal: {
      backtestHeading: 'Backtest Database',
      backtestSubtitle: 'Pure historical strategy log used for Akinator scans and schematic benchmarks.',
      liveHeading: 'Live Journaling (Executed Account)',
      liveSubtitle: 'Real account statistics calculated exclusively from executed trades (missed trades excluded).',
      missedHeading: 'Missed Trades & Plan Adherence',
      missedSubtitle: 'Skipped mechanical setups tracked separately to measure execution discipline.',
      totalTrades: 'Total Trades',
      winRate: 'Win Rate %',
      netRR: 'Net R:R',
      avgExpectancy: 'Avg Expectancy',
      missedTotal: 'Total Missed Setups',
      theoreticalLostRR: 'Theoretical Lost R:R',
      adherencePct: 'Plan Adherence Score %',
      reasonBreakdownTitle: 'Missed Entry Reasons Breakdown',
      reasonBreakdownSub: 'Frequency and theoretical R impact for each psychological or operational cause.',
      importFile: 'Import File (.xlsx / .csv)',
      exportCsv: 'Export Backup CSV',
      exportJson: 'Export Backup JSON',
      importJson: 'Import Backup JSON',
      resetData: 'Reset Data',
      geminiReview: 'AI Review (Gemini)',
      searchPlaceholder: 'Search asset, setup, notes...',
      assetFilterAll: 'Asset: All',
      outcomeFilterAll: 'Outcome: All',
      reasonFilterAll: 'Reason: All',
      emptyBacktest: 'No Backtest trades recorded yet.',
      emptyLive: 'No executed trades recorded in Live Journaling yet.',
      emptyMissed: 'No missed trades recorded yet.',
      addFirstTrade: 'Log First Trade',
      loadDemoData: 'Load Sample Data',
    },
    table: {
      date: 'Date',
      asset: 'Asset',
      setup: 'SETUP',
      bias: 'Bias',
      entry: 'Entry',
      sl: 'SL',
      tp: 'TP',
      pips: 'SL / TP Pips',
      risk: 'Risk %',
      outcome: 'Outcome',
      netR: '# R',
      rrMax: 'RR Max',
      netPct: 'Net %',
      missedReason: 'Missed Reason',
      notes: 'Notes',
      link: 'Chart',
      actions: 'Actions',
      edit: 'Edit',
      delete: 'Delete',
      extraCols: 'Extra',
    },
    modal: {
      newTradeTitle: 'Log New Trade',
      editTradeTitle: 'Edit Trade',
      categoryLabel: 'Target Log / Execution Status',
      catBacktest: 'Backtest',
      catLive: 'Live Journaling (ESEGUITO)',
      catMissed: 'Missed Trade (NON PRESO)',
      dateLabel: 'Date',
      assetLabel: 'Asset',
      setupLabel: 'Schematic / Setup',
      biasLabel: 'Direction',
      riskPctLabel: 'Risk %',
      entryPriceLabel: 'Entry Price (optional)',
      slPriceLabel: 'Stop Loss Price (optional)',
      tpPriceLabel: 'Take Profit Price (optional)',
      outcomeLabel: 'Outcome',
      netRLabel: 'Realized # R (or Target R)',
      rrMaxLabel: 'RR Max (optional)',
      missedReasonLabel: 'Missed Entry Reason',
      notesLabel: 'Notes',
      tvLinkLabel: 'TradingView Link (optional)',
      autoCalcPreview: 'Live Engine Preview',
      cancel: 'Cancel',
      save: 'Save Trade',
      saveChanges: 'Save Changes',
    },
    importer: {
      title: 'Import Trades (Excel / CSV / PDF)',
      subtitle: 'Client-side parser with automatic pip multipliers, Bias, Target RR, and custom columns.',
      dropPrompt: 'Drop an .xlsx, .xls, .csv, or .pdf file here, or click to browse',
      supportedFormats: 'Supports multi-sheet Excel, comma/semicolon CSV, European decimals (+4,00), and PDF tables.',
      selectSheet: 'Select Worksheet',
      allSheets: 'All Worksheets Combined',
      detectedRows: 'Valid trade rows detected',
      fiveBlockDetected: '5-Block Stacked CSV Detected — auto-assigning S1, SSA, MUT, SBIL DOMINANCE REALE, SBIL INTRADOMINANCE.',
      singleSetupOverride: 'Setup Assignment for Import',
      keepAutoSetup: 'Automatic (CSV column or 5-block sequence)',
      columnMappingTitle: 'Smart Column Mapping',
      previewTitle: 'Import Preview (First 8 Valid Rows)',
      importNow: 'Run Engine & Import Trades',
      cancel: 'Cancel',
      parsingError: 'Unable to parse file. Please verify the file format.',
    },
    confirm: {
      deleteTitle: 'Confirm Deletion',
      deleteMessage: 'Are you sure you want to permanently remove this trade?',
      cancel: 'Cancel',
      confirm: 'Delete',
    },
    gemini: {
      title: 'Automated Journal Review (Gemini)',
      subtitle: 'Structured prompt payload prepared for server-side /api/gemini/review endpoint.',
      close: 'Close',
      copyPrompt: 'Copy Prompt',
      copied: 'Prompt copied to clipboard.',
      summaryLabel: 'Generated Performance Payload',
      loading: 'Sending analysis request to /api/gemini/review...',
      noServerMessage: 'Server endpoint /api/gemini/review is not active in this browser-only session. Configure GEMINI_API_KEY on the backend or copy the prompt below.',
    },
    common: {
      allSetups: 'ALL',
      filterBySetup: 'Schematic / Setup Filter',
      customSetupsLabel: 'Custom',
      executedSuffix: 'executed',
      missedSuffix: 'missed',
    },
  },
  it: {
    nav: {
      dashboard: 'Dashboard',
      backtest: 'Backtest',
      live: 'Journal Reale',
      missed: 'Trade Non Presi',
      newTrade: 'Nuova Operazione',
    },
    akinator: {
      title: 'AKINATOR — SCANSIONE COMPLETA BACKTEST',
      subtitle: 'Scansione Meccanica Pura Backtest (Esclude Errori del Journal Reale)',
      maxStreak: 'Serie Consecutiva Massima',
      latestStatus: 'Stato Ultima Serie',
      qualifyingWeeks: 'Settimane Qualificanti (<= -3.0 R tutti gli asset)',
      trackedAssets: 'Asset Analizzati nel Backtest',
      consecutiveWeeks: 'Settimane Consecutive',
      weekSingular: 'Settimana',
      noStreaksFound: 'Nessuna serie di 2+ settimane consecutive di drawdown trovata nel Backtest.',
      detectedStreaksTitle: 'Serie Consecutive di Drawdown Rilevate (Tutte le Durate)',
      activeStreakNow: 'Serie Attiva sull’Ultima Settimana',
      completedStreak: 'Serie Storica Conclusa',
      noActiveStreak: 'Nessuna Serie Attiva',
      noBacktestData: 'Importa o aggiungi operazioni Backtest per eseguire la scansione settimanale Akinator.',
      ruleHint: 'Regola: una settimana Lun–Dom qualifica solo se TUTTI gli asset del Backtest chiudono <= -3.0 R.',
    },
    dashboard: {
      heading: 'Dashboard & Confronto',
      subheading: 'Confronto isolato tra Backtest meccanico, Journal Reale eseguito e aderenza al piano.',
      backtestNetR: 'R Netto Backtest',
      liveNetR: 'R Netto Journal Reale',
      executionGap: 'Scostamento Esecuzione (Reale - Backtest)',
      adherenceScore: 'Punteggio Aderenza al Piano %',
      equityTitle: 'Confronto Curva Equity',
      equitySubtitle: 'Progressione cumulativa in R tra Backtest e operazioni reali eseguite.',
      backtestSeries: 'Backtest',
      liveSeries: 'Journal Reale',
      winRate: 'Win Rate',
      expectancy: 'Aspettativa Media',
      maxDrawdown: 'Drawdown Massimo',
      profitFactor: 'Profit Factor',
      tradesCount: 'Trade Totali',
      comparisonTableTitle: 'Matrice di Confronto Performance',
      metricCol: 'Metrica',
      missedCol: 'Trade Non Presi',
      noEquityData: 'Aggiungi operazioni in Backtest o Journal Reale per visualizzare il confronto Equity.',
    },
    journal: {
      backtestHeading: 'Database Backtest',
      backtestSubtitle: 'Storico meccanico puro utilizzato per la scansione Akinator e il benchmark delle strategie.',
      liveHeading: 'Statistiche Conto Reale (Journal Reale)',
      liveSubtitle: 'Metriche calcolate esclusivamente sui trade ESEGUITI (i trade non presi sono esclusi al 100%).',
      missedHeading: 'Trade Non Presi e Aderenza al Piano',
      missedSubtitle: 'Setup meccanici saltati tracciati separatamente per monitorare la disciplina operativa.',
      totalTrades: 'Trade Totali',
      winRate: 'Win Rate %',
      netRR: 'R:R Netto',
      avgExpectancy: 'Aspettativa Media',
      missedTotal: 'Setup Non Presi Totali',
      theoreticalLostRR: 'R:R Teorico Perso',
      adherencePct: 'Punteggio Aderenza al Piano %',
      reasonBreakdownTitle: 'Analisi Motivi Mancato Ingresso',
      reasonBreakdownSub: 'Frequenza e impatto teorico in R per ciascuna causa psicologica o operativa.',
      importFile: 'Importa File (.xlsx / .csv)',
      exportCsv: 'Esporta Backup CSV',
      exportJson: 'Esporta Backup JSON',
      importJson: 'Importa Backup JSON',
      resetData: 'Resetta Dati',
      geminiReview: 'Revisione AI (Gemini)',
      searchPlaceholder: 'Cerca asset, strategia, note...',
      assetFilterAll: 'Asset: Tutti',
      outcomeFilterAll: 'Esito: Tutti',
      reasonFilterAll: 'Motivo: Tutti',
      emptyBacktest: 'Nessuna operazione Backtest registrata.',
      emptyLive: 'Nessun trade reale eseguito presente in Journal Reale.',
      emptyMissed: 'Nessun trade non preso registrato.',
      addFirstTrade: 'Registra Prima Operazione',
      loadDemoData: 'Carica Dati di Esempio',
    },
    table: {
      date: 'Data',
      asset: 'Asset',
      setup: 'SETUP',
      bias: 'Direzione',
      entry: 'Entry',
      sl: 'SL',
      tp: 'TP',
      pips: 'Pip SL / TP',
      risk: 'Rischio %',
      outcome: 'Esito',
      netR: '# R',
      rrMax: 'RR Max',
      netPct: 'Rendimento %',
      missedReason: 'Motivo Mancato Ingresso',
      notes: 'Note',
      link: 'Grafico',
      actions: 'Azioni',
      edit: 'Modifica',
      delete: 'Elimina',
      extraCols: 'Extra',
    },
    modal: {
      newTradeTitle: 'Nuova Operazione',
      editTradeTitle: 'Modifica Operazione',
      categoryLabel: 'Destinazione / Stato Operazione',
      catBacktest: 'Backtest',
      catLive: 'Journal Reale (ESEGUITO)',
      catMissed: 'Trade Non Preso (NON PRESO)',
      dateLabel: 'Data',
      assetLabel: 'Asset',
      setupLabel: 'Schematica / Setup',
      biasLabel: 'Direzione',
      riskPctLabel: 'Rischio %',
      entryPriceLabel: 'Prezzo Entry (opzionale)',
      slPriceLabel: 'Prezzo Stop Loss (opzionale)',
      tpPriceLabel: 'Prezzo Take Profit (opzionale)',
      outcomeLabel: 'Esito',
      netRLabel: 'R:R Netto (# R)',
      rrMaxLabel: 'RR Max (opzionale)',
      missedReasonLabel: 'Motivo Mancato Ingresso',
      notesLabel: 'Note',
      tvLinkLabel: 'Link TradingView (opzionale)',
      autoCalcPreview: 'Anteprima Motore di Calcolo',
      cancel: 'Annulla',
      save: 'Salva Operazione',
      saveChanges: 'Salva Modifiche',
    },
    importer: {
      title: 'Importa File (Excel / CSV / PDF)',
      subtitle: 'Parser locale con calcolo automatico pip, direzione, Target RR e colonne personalizzate.',
      dropPrompt: 'Trascina qui un file .xlsx, .xls, .csv o .pdf oppure clicca per selezionarlo',
      supportedFormats: 'Supporta Excel multi-foglio, CSV con virgola/punto e virgola, decimali europei (+4,00) e tabelle PDF.',
      selectSheet: 'Seleziona Foglio',
      allSheets: 'Tutti i Fogli Uniti',
      detectedRows: 'Righe valide rilevate',
      fiveBlockDetected: 'Rilevato CSV a 5 Blocchi — assegnazione automatica: S1, SSA, MUT, SBIL DOMINANCE REALE, SBIL INTRADOMINANCE.',
      singleSetupOverride: 'Assegnazione Setup per l’Import',
      keepAutoSetup: 'Automatico (colonna CSV o sequenza 5 blocchi)',
      columnMappingTitle: 'Mappatura Intelligente Colonne',
      previewTitle: 'Anteprima Import (Prime 8 Righe Valide)',
      importNow: 'Calcola e Importa Operazioni',
      cancel: 'Annulla',
      parsingError: 'Impossibile leggere il file. Verifica il formato del documento.',
    },
    confirm: {
      deleteTitle: 'Conferma Eliminazione',
      deleteMessage: 'Vuoi eliminare definitivamente questa operazione?',
      cancel: 'Annulla',
      confirm: 'Elimina',
    },
    gemini: {
      title: 'Revisione Automatica del Journal (Gemini)',
      subtitle: 'Payload strutturato pronto per la rotta server /api/gemini/review.',
      close: 'Chiudi',
      copyPrompt: 'Copia Prompt',
      copied: 'Prompt copiato negli appunti.',
      summaryLabel: 'Riepilogo Dati Generato per l’Analisi',
      loading: 'Invio richiesta di analisi a /api/gemini/review in corso...',
      noServerMessage: 'L’endpoint /api/gemini/review non è attivo in questa sessione solo-browser. Configura GEMINI_API_KEY sul backend oppure copia il prompt qui sotto.',
    },
    common: {
      allSetups: 'ALL',
      filterBySetup: 'Filtro Strategia',
      customSetupsLabel: 'Extra',
      executedSuffix: 'eseguiti',
      missedSuffix: 'non presi',
    },
  },
  es: {
    nav: {
      dashboard: 'Panel',
      backtest: 'Backtest',
      live: 'Live Journaling',
      missed: 'Trades No Tomados',
      newTrade: 'Nueva Operación',
    },
    akinator: {
      title: 'AKINATOR — FULL SCAN BACKTEST',
      subtitle: 'Pure Mechanical Strategy Scan (Excludes Live Journaling Errors)',
      maxStreak: 'Racha Consecutiva Máxima',
      latestStatus: 'Estado de Última Racha',
      qualifyingWeeks: 'Semanas Calificantes (<= -3.0 R todos los activos)',
      trackedAssets: 'Activos Analizados en Backtest',
      consecutiveWeeks: 'Semanas Consecutivas',
      weekSingular: 'Semana',
      noStreaksFound: 'No se detectaron rachas de 2+ semanas consecutivas en Backtest.',
      detectedStreaksTitle: 'Rachas Consecutivas de Drawdown Detectadas',
      activeStreakNow: 'Racha Activa en Última Semana',
      completedStreak: 'Racha Histórica',
      noActiveStreak: 'Sin Racha Activa',
      noBacktestData: 'Importa o registra operaciones Backtest para ejecutar el escaneo semanal Akinator.',
      ruleHint: 'Regla: una semana Lun–Dom califica solo si TODOS los activos de Backtest cierran <= -3.0 R.',
    },
    dashboard: {
      heading: 'Panel y Comparativa',
      subheading: 'Comparación aislada entre Backtest mecánico, Live Journaling real y adherencia al plan.',
      backtestNetR: 'R Neto Backtest',
      liveNetR: 'R Neto Live Journaling',
      executionGap: 'Diferencia de Ejecución (Live - Backtest)',
      adherenceScore: 'Puntuación de Adherencia %',
      equityTitle: 'Comparativa Curva de Equity',
      equitySubtitle: 'Progresión acumulada en R entre Backtest y operaciones reales ejecutadas.',
      backtestSeries: 'Backtest',
      liveSeries: 'Live Journaling',
      winRate: 'Tasa de Acierto',
      expectancy: 'Esperanza Media',
      maxDrawdown: 'Drawdown Máximo',
      profitFactor: 'Profit Factor',
      tradesCount: 'Operaciones Totales',
      comparisonTableTitle: 'Matriz Comparativa de Rendimiento',
      metricCol: 'Métrica',
      missedCol: 'Trades No Tomados',
      noEquityData: 'Añade operaciones en Backtest o Live Journaling para ver la curva de Equity.',
    },
    journal: {
      backtestHeading: 'Base de Datos Backtest',
      backtestSubtitle: 'Registro histórico mecánico usado para el escaneo Akinator y comparativa por setup.',
      liveHeading: 'Estadísticas Cuenta Real',
      liveSubtitle: 'Métricas calculadas exclusivamente sobre operaciones ejecutadas (excluye trades no tomados).',
      missedHeading: 'Trades No Tomados y Adherencia al Plan',
      missedSubtitle: 'Setups mecánicos omitidos registrados por separado para medir la disciplina operativa.',
      totalTrades: 'Operaciones Totales',
      winRate: 'Win Rate %',
      netRR: 'R:R Neto',
      avgExpectancy: 'Esperanza Media',
      missedTotal: 'Setups No Tomados',
      theoreticalLostRR: 'R:R Teórico Perdido',
      adherencePct: 'Adherencia al Plan %',
      reasonBreakdownTitle: 'Desglose de Motivos de Omisión',
      reasonBreakdownSub: 'Frecuencia e impacto teórico en R por cada causa psicológica u operativa.',
      importFile: 'Importar Archivo (.xlsx / .csv / .pdf)',
      exportCsv: 'Exportar Backup CSV',
      exportJson: 'Exportar Backup JSON',
      importJson: 'Importar Backup JSON',
      resetData: 'Restablecer Datos',
      geminiReview: 'Revisión AI (Gemini)',
      searchPlaceholder: 'Buscar activo, setup, notas...',
      assetFilterAll: 'Activo: Todos',
      outcomeFilterAll: 'Resultado: Todos',
      reasonFilterAll: 'Motivo: Todos',
      emptyBacktest: 'No hay operaciones Backtest registradas.',
      emptyLive: 'No hay operaciones ejecutadas en Live Journaling.',
      emptyMissed: 'No hay trades no tomados registrados.',
      addFirstTrade: 'Registrar Primera Operación',
      loadDemoData: 'Cargar Datos de Ejemplo',
    },
    table: {
      date: 'Fecha',
      asset: 'Activo',
      setup: 'SETUP',
      bias: 'Dirección',
      entry: 'Entrada',
      sl: 'SL',
      tp: 'TP',
      pips: 'Pips SL / TP',
      risk: 'Riesgo %',
      outcome: 'Resultado',
      netR: '# R',
      rrMax: 'RR Max',
      netPct: 'Retorno %',
      missedReason: 'Motivo de Omisión',
      notes: 'Notas',
      link: 'Gráfico',
      actions: 'Acciones',
      edit: 'Editar',
      delete: 'Eliminar',
      extraCols: 'Extra',
    },
    modal: {
      newTradeTitle: 'Registrar Operación',
      editTradeTitle: 'Editar Operación',
      categoryLabel: 'Registro / Estado de Ejecución',
      catBacktest: 'Backtest',
      catLive: 'Live Journaling (ESEGUITO)',
      catMissed: 'No Tomado (NON PRESO)',
      dateLabel: 'Fecha',
      assetLabel: 'Activo',
      setupLabel: 'Esquemática / Setup',
      biasLabel: 'Dirección',
      riskPctLabel: 'Riesgo %',
      entryPriceLabel: 'Precio Entrada (opcional)',
      slPriceLabel: 'Precio Stop Loss (opcional)',
      tpPriceLabel: 'Precio Take Profit (opcional)',
      outcomeLabel: 'Resultado',
      netRLabel: 'R:R Neto (# R)',
      rrMaxLabel: 'RR Max (opcional)',
      missedReasonLabel: 'Motivo de No Entrada',
      notesLabel: 'Notas',
      tvLinkLabel: 'Enlace TradingView (opcional)',
      autoCalcPreview: 'Vista Previa del Motor',
      cancel: 'Cancelar',
      save: 'Guardar Operación',
      saveChanges: 'Guardar Cambios',
    },
    importer: {
      title: 'Importar Archivo (Excel / CSV / PDF)',
      subtitle: 'Motor local con cálculo automático de pips, dirección, Target RR y columnas personalizadas.',
      dropPrompt: 'Arrastra aquí un archivo .xlsx, .xls, .csv o .pdf o haz clic para seleccionarlo',
      supportedFormats: 'Soporta Excel multi-hoja, CSV con coma/punto y coma, decimales europeos (+4,00) y tablas PDF.',
      selectSheet: 'Seleccionar Hoja',
      allSheets: 'Todas las Hojas Combinadas',
      detectedRows: 'Filas válidas detectadas',
      fiveBlockDetected: 'CSV de 5 Bloques Detectado — asignación automática: S1, SSA, MUT, SBIL DOMINANCE REALE, SBIL INTRADOMINANCE.',
      singleSetupOverride: 'Asignación de Setup al Importar',
      keepAutoSetup: 'Automático (columna CSV o secuencia 5 bloques)',
      columnMappingTitle: 'Mapeo Inteligente de Columnas',
      previewTitle: 'Vista Previa (Primeras 8 Filas Válidas)',
      importNow: 'Calcular e Importar Operaciones',
      cancel: 'Cancelar',
      parsingError: 'No se pudo leer el archivo. Verifica el formato.',
    },
    confirm: {
      deleteTitle: 'Confirmar Eliminación',
      deleteMessage: '¿Seguro que deseas eliminar esta operación definitivamente?',
      cancel: 'Cancelar',
      confirm: 'Eliminar',
    },
    gemini: {
      title: 'Revisión Automática del Journal (Gemini)',
      subtitle: 'Payload estructurado listo para el endpoint /api/gemini/review en servidor.',
      close: 'Cerrar',
      copyPrompt: 'Copiar Prompt',
      copied: 'Prompt copiado al portapapeles.',
      summaryLabel: 'Resumen de Datos Generado',
      loading: 'Enviando solicitud de análisis a /api/gemini/review...',
      noServerMessage: 'El endpoint /api/gemini/review no está activo en esta sesión de solo navegador. Configura GEMINI_API_KEY en el servidor o copia el prompt.',
    },
    common: {
      allSetups: 'ALL',
      filterBySetup: 'Filtro Esquemática / Setup',
      customSetupsLabel: 'Extra',
      executedSuffix: 'ejecutados',
      missedSuffix: 'no tomados',
    },
  },
};
