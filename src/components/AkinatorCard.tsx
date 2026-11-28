import { useMemo } from 'react';
import type { TranslationSet } from '../i18n/translations';
import type { AkinatorScanResult } from '../types/trading';
import { formatDisplayDate, formatR, roundTo } from '../utils/calculations';

interface AkinatorCardProps {
  scan: AkinatorScanResult;
  t: TranslationSet;
}

export function AkinatorCard({ scan, t }: AkinatorCardProps) {
  const hasBacktest = scan.totalWeeksScanned > 0;
  const isCritical = scan.maxConsecutiveStreak >= 3;

  const { streakLengthByWeekKey, sortedStreaks, sortedQualifyingWeeks, qualifyingTotalsByAsset, qualifyingGrandTotal } =
    useMemo(() => {
      const map = new Map<string, number>();
      scan.streaks.forEach((streak) => {
        streak.weeks.forEach((wk) => {
          map.set(wk.weekKey, streak.length);
        });
      });

      const streaksDesc = [...scan.streaks].sort((a, b) =>
        b.startDate.localeCompare(a.startDate),
      );
      const weeksDesc = [...scan.qualifyingWeeks].sort((a, b) =>
        b.weekStart.localeCompare(a.weekStart),
      );

      const totalsByAsset: Record<string, number> = {};
      scan.trackedAssets.forEach((asset) => {
        totalsByAsset[asset] = 0;
      });
      let grandTotal = 0;
      weeksDesc.forEach((wk) => {
        scan.trackedAssets.forEach((asset) => {
          totalsByAsset[asset] = roundTo(
            (totalsByAsset[asset] ?? 0) + (wk.assetNetR[asset] ?? 0),
            2,
          );
        });
        grandTotal = roundTo(grandTotal + wk.totalWeekR, 2);
      });

      return {
        streakLengthByWeekKey: map,
        sortedStreaks: streaksDesc,
        sortedQualifyingWeeks: weeksDesc,
        qualifyingTotalsByAsset: totalsByAsset,
        qualifyingGrandTotal: grandTotal,
      };
    }, [scan.streaks, scan.qualifyingWeeks, scan.trackedAssets]);

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

        <div className="flex items-center gap-3 font-mono text-xs text-slate-400 tabular-nums">
          <span>
            {scan.totalWeeksScanned}{' '}
            {scan.totalWeeksScanned === 1
              ? t.akinator.weekSingular
              : t.akinator.weeksPlural}
          </span>
          <span aria-hidden="true">·</span>
          <span>{scan.trackedAssets.length} Asset</span>
        </div>
      </div>

      {!hasBacktest ? (
        <div className="py-6 text-xs text-slate-400">
          {t.akinator.noBacktestData}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* 4 Summary KPI Boxes */}
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
                {scan.maxConsecutiveStreak}{' '}
                <span className="text-sm font-semibold text-slate-400">
                  {scan.maxConsecutiveStreak === 1
                    ? t.akinator.weekSingular
                    : t.akinator.consecutiveWeeks}
                </span>
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
              <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
                <span
                  className={`text-2xl font-bold ${
                    scan.qualifyingWeeksCount > 0
                      ? 'text-amber-300'
                      : 'text-slate-100'
                  }`}
                >
                  {scan.qualifyingWeeksCount}
                </span>
                <span className="text-sm font-semibold text-slate-400">
                  {scan.qualifyingWeeksCount === 1
                    ? t.akinator.weekSingular
                    : t.akinator.weeksPlural}
                </span>
              </div>
            </div>

            <div className="rounded-md border border-[#1E2634] bg-[#0B0E14] p-4">
              <div className="text-xs font-medium text-slate-400">
                {t.akinator.trackedAssets}
              </div>
              <div className="mt-1.5 font-mono text-xs font-medium leading-relaxed text-slate-200 break-words">
                {scan.trackedAssets.join(' · ')}
              </div>
            </div>
          </div>

          {/* Consecutive 2+ Week Streaks Summary (if any) */}
          {sortedStreaks.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200">
                  {t.akinator.detectedStreaksTitle} ({sortedStreaks.length})
                </h3>
                <span className="text-xs text-slate-500">{t.akinator.ruleHint}</span>
              </div>

              <div className="divide-y divide-[#1E2634] rounded-md border border-[#1E2634] bg-[#0B0E14]">
                {sortedStreaks.map((streak) => {
                  const streakCombinedR = roundTo(
                    streak.weeks.reduce((sum, w) => sum + w.totalWeekR, 0),
                    2,
                  );
                  const perAssetStreakSummary = scan.trackedAssets
                    .map((asset) => {
                      const assetSum = roundTo(
                        streak.weeks.reduce(
                          (sum, w) => sum + (w.assetNetR[asset] ?? 0),
                          0,
                        ),
                        2,
                      );
                      return `${asset}: ${formatR(assetSum)}`;
                    })
                    .join(' · ');

                  return (
                    <div
                      key={streak.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 text-xs font-mono tabular-nums"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
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
                          {formatDisplayDate(streak.startDate)} →{' '}
                          {formatDisplayDate(streak.endDate)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[11px] text-slate-400">
                          {perAssetStreakSummary}
                        </span>
                        <span className="font-semibold text-rose-400">
                          {formatR(streakCombinedR)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#1E2634] bg-[#0B0E14] px-4 py-2.5 text-xs text-slate-300">
              <span>
                {sortedQualifyingWeeks.length > 0
                  ? t.akinator.noStreaksFound
                  : t.akinator.noQualifyingWeeksFound}
              </span>
              <span className="text-slate-500">{t.akinator.ruleHint}</span>
            </div>
          )}

          {/* Concise Weekly Breakdown for EVERY Qualifying Week */}
          {sortedQualifyingWeeks.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200">
                  {t.akinator.qualifyingBreakdownTitle} ({sortedQualifyingWeeks.length}{' '}
                  {sortedQualifyingWeeks.length === 1
                    ? t.akinator.weekSingular
                    : t.akinator.weeksPlural}
                  )
                </h3>
                {sortedStreaks.length === 0 ? (
                  <span className="text-xs text-slate-500">{t.akinator.ruleHint}</span>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-md border border-[#1E2634] bg-[#0B0E14]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2634] bg-[#0B0E14] text-slate-400">
                      <th className="px-3.5 py-2.5 font-medium whitespace-nowrap">
                        {t.akinator.weekColumn}
                      </th>
                      <th className="px-3.5 py-2.5 font-medium whitespace-nowrap">
                        {t.akinator.statusColumn}
                      </th>
                      {scan.trackedAssets.map((asset) => (
                        <th
                          key={asset}
                          className="px-3.5 py-2.5 text-right font-mono font-medium whitespace-nowrap"
                        >
                          {asset}
                        </th>
                      ))}
                      <th className="px-3.5 py-2.5 text-right font-medium whitespace-nowrap">
                        {t.akinator.combinedTotalColumn}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2634] font-mono tabular-nums">
                    {sortedQualifyingWeeks.map((wk) => {
                      const streakLen = streakLengthByWeekKey.get(wk.weekKey);
                      return (
                        <tr
                          key={wk.weekKey}
                          className="transition-colors hover:bg-[#171E2B]"
                        >
                          <td className="px-3.5 py-2.5 text-slate-200 whitespace-nowrap">
                            {formatDisplayDate(wk.weekStart)} –{' '}
                            {formatDisplayDate(wk.weekEnd)}
                          </td>
                          <td className="px-3.5 py-2.5 font-sans whitespace-nowrap">
                            {streakLen ? (
                              <span
                                className={`font-medium ${
                                  streakLen >= 3 ? 'text-rose-400' : 'text-amber-400'
                                }`}
                              >
                                {t.akinator.streakBadgePrefix} {streakLen}{' '}
                                {t.akinator.weeksPlural.toLowerCase()}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {t.akinator.singleWeekLabel}
                              </span>
                            )}
                          </td>
                          {scan.trackedAssets.map((asset) => {
                            const val = wk.assetNetR[asset] ?? 0;
                            return (
                              <td
                                key={asset}
                                className="px-3.5 py-2.5 text-right text-rose-400 whitespace-nowrap"
                              >
                                {formatR(val)}
                              </td>
                            );
                          })}
                          <td className="px-3.5 py-2.5 text-right font-semibold text-rose-300 whitespace-nowrap">
                            {formatR(wk.totalWeekR)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {sortedQualifyingWeeks.length > 1 ? (
                    <tfoot>
                      <tr className="border-t border-[#263042] bg-[#121721]/80 font-mono tabular-nums">
                        <td
                          colSpan={2}
                          className="px-3.5 py-2.5 font-sans text-xs font-semibold text-slate-300 whitespace-nowrap"
                        >
                          {t.akinator.combinedTotalColumn} ({sortedQualifyingWeeks.length}{' '}
                          {t.akinator.weeksPlural})
                        </td>
                        {scan.trackedAssets.map((asset) => (
                          <td
                            key={asset}
                            className="px-3.5 py-2.5 text-right font-semibold text-rose-300 whitespace-nowrap"
                          >
                            {formatR(qualifyingTotalsByAsset[asset] ?? 0)}
                          </td>
                        ))}
                        <td className="px-3.5 py-2.5 text-right font-bold text-rose-300 whitespace-nowrap">
                          {formatR(qualifyingGrandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
