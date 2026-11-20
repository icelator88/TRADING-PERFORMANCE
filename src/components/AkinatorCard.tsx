import type { TranslationSet } from '../i18n/translations';
import type { AkinatorScanResult } from '../types/trading';
import { formatDisplayDate, formatR } from '../utils/calculations';

interface AkinatorCardProps {
  scan: AkinatorScanResult;
  t: TranslationSet;
}

export function AkinatorCard({ scan, t }: AkinatorCardProps) {
  const hasBacktest = scan.totalWeeksScanned > 0;
  const isCritical = scan.maxConsecutiveStreak >= 3;

  return (
    <section
      aria-label={t.akinator.title}
      className="rounded-lg border border-amber-500/45 bg-[#121721] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2634] pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-100">
            {t.akinator.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {t.akinator.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
          <span>
            {scan.totalWeeksScanned}{' '}
            {scan.totalWeeksScanned === 1
              ? t.akinator.weekSingular
              : t.akinator.consecutiveWeeks}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {scan.trackedAssets.length} Asset
          </span>
        </div>
      </div>

      {!hasBacktest ? (
        <div className="py-6 text-xs text-slate-400">
          {t.akinator.noBacktestData}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-xs font-medium text-slate-400">
                {t.akinator.maxStreak}
              </div>
              <div
                className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                  isCritical
                    ? 'text-rose-400'
                    : scan.maxConsecutiveStreak >= 2
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {scan.maxConsecutiveStreak > 0
                  ? `${scan.maxConsecutiveStreak} ${t.akinator.consecutiveWeeks}`
                  : `0 ${t.akinator.consecutiveWeeks}`}
              </div>
            </div>

            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-xs font-medium text-slate-400">
                {t.akinator.latestStatus}
              </div>
              <div
                className={`mt-1.5 font-mono text-sm font-semibold tabular-nums ${
                  scan.latestStreakLength >= 2
                    ? 'text-rose-400'
                    : scan.latestStreakLength === 1
                      ? 'text-amber-400'
                      : 'text-slate-200'
                }`}
              >
                {scan.latestStreakStatus}
              </div>
            </div>

            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-xs font-medium text-slate-400">
                {t.akinator.qualifyingWeeks}
              </div>
              <div className="mt-1.5 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                {scan.qualifyingWeeksCount}
              </div>
            </div>

            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-xs font-medium text-slate-400">
                {t.akinator.trackedAssets}
              </div>
              <div className="mt-1.5 truncate font-mono text-xs font-medium text-slate-200" title={scan.trackedAssets.join(', ')}>
                {scan.trackedAssets.join(' · ')}
              </div>
            </div>
          </div>

          {scan.streaks.length === 0 ? (
            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] px-4 py-3 text-xs text-slate-300">
              {t.akinator.noStreaksFound}{' '}
              <span className="text-slate-500">{t.akinator.ruleHint}</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200">
                  {t.akinator.detectedStreaksTitle} ({scan.streaks.length})
                </h3>
                <span className="text-xs text-slate-500">{t.akinator.ruleHint}</span>
              </div>

              <div className="divide-y divide-[#1E2634] rounded-md border border-[#1E2634] bg-[#0B0E14]">
                {scan.streaks.map((streak) => (
                  <div key={streak.id} className="p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            streak.length >= 3 ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {streak.length} {t.akinator.consecutiveWeeks}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="text-slate-200">
                          {formatDisplayDate(streak.startDate)} → {formatDisplayDate(streak.endDate)}
                        </span>
                      </div>

                      <span className="font-mono text-xs font-semibold text-rose-400 tabular-nums">
                        {formatR(
                          streak.weeks.reduce((sum, w) => sum + w.totalWeekR, 0),
                        )}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {streak.weeks.map((wk) => {
                        const assetSummary = Object.entries(wk.assetNetR)
                          .map(([asset, val]) => `${asset}: ${formatR(val)}`)
                          .join(' · ');
                        return (
                          <div
                            key={wk.weekKey}
                            className="flex flex-col justify-between rounded border border-[#1E2634] bg-[#121721] px-2.5 py-1.5 text-[11px] font-mono tabular-nums"
                          >
                            <div className="flex items-center justify-between text-slate-300">
                              <span>
                                {formatDisplayDate(wk.weekStart)} – {formatDisplayDate(wk.weekEnd)}
                              </span>
                              <span className="font-semibold text-rose-400">
                                {formatR(wk.totalWeekR)}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-slate-400" title={assetSummary}>
                              {assetSummary}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
