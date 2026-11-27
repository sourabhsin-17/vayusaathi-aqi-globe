import { useEffect, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { estimateCpcbFromPm, CPCB_CATEGORY_STYLES } from '../lib/cpcb';
import { t } from '../lib/i18n';
import type { HourlyForecastPoint, Language, TimeWindowSummary } from '../types/vayu';

interface HourlyForecastChartProps {
  hourly24: HourlyForecastPoint[];
  cleanestWindow: TimeWindowSummary;
  worstWindow: TimeWindowSummary;
  lang: Language;
}

export default function HourlyForecastChart({
  hourly24,
  cleanestWindow,
  worstWindow,
  lang,
}: HourlyForecastChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const firstTimeIso = hourly24[0]?.timeIso;
  useEffect(() => {
    setActiveIndex(0);
  }, [firstTimeIso]);

  if (hourly24.length === 0) {
    return null;
  }

  const maxPm25 = Math.max(60, ...hourly24.map((h) => h.pm25));
  const selected = hourly24[activeIndex] ?? hourly24[0];
  const selectedCpcb = estimateCpcbFromPm(selected.pm25, selected.pm10);

  const isCleanHour = (iso: string) =>
    iso === cleanestWindow.startIso || iso === cleanestWindow.endIso;
  const isWorstHour = (iso: string) =>
    iso === worstWindow.startIso || iso === worstWindow.endIso;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#E6EDF7]">
            {t(lang, 'hourlyChartTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-[#9FB0C7]">
            {lang === 'hi'
              ? 'दिन का सबसे साफ (हरा फ्रेम) और सबसे खराब (लाल फ्रेम) समय हाइलाइट किया गया है।'
              : 'Highlights the cleanest 2-hour window (emerald frame) and worst 2-hour window (coral frame).'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTable((prev) => !prev)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/12 bg-[#0C1322] px-3.5 py-2 text-xs font-semibold text-[#E6EDF7] hover:bg-[#182947] whitespace-nowrap shrink-0"
        >
          {showTable ? (
            <>
              <BarChart3 className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
              <span>{t(lang, 'showChartView')}</span>
            </>
          ) : (
            <>
              <Table2 className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
              <span>{t(lang, 'showTableView')}</span>
            </>
          )}
        </button>
      </div>

      {!showTable ? (
        <div className="space-y-3">
          {/* Interactive focused hour readout */}
          <div
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/12 bg-[#0C1322]/85 px-3.5 py-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2 text-[#E6EDF7]">
              <span className="font-semibold font-mono-tabular text-[#38BDF8]">{selected.hourLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                PM2.5: <strong>{selected.pm25} µg/m³</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                US AQI: <strong>{selected.usAqi}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-[#9FB0C7]">{lang === 'hi' ? selectedCpcb.labelHi : selectedCpcb.labelEn}</span>
            </div>
            <div className="text-[#9FB0C7] font-mono-tabular">
              {selected.temperatureC !== null ? `${selected.temperatureC}°C` : ''}
              {selected.windSpeedKmh !== null ? ` · ${selected.windSpeedKmh} km/h wind` : ''}
            </div>
          </div>

          {/* Accessible interactive bar chart */}
          <div
            role="region"
            aria-label={t(lang, 'hourlyChartTitle')}
            className="overflow-x-auto pb-2"
          >
            <div className="flex min-w-[640px] items-end gap-1.5 h-48 pt-6 px-1">
              {hourly24.map((point, idx) => {
                const heightPct = Math.max(8, Math.round((point.pm25 / maxPm25) * 100));
                const cpcb = estimateCpcbFromPm(point.pm25, point.pm10);
                const style = CPCB_CATEGORY_STYLES[cpcb.categoryKey];
                const clean = isCleanHour(point.timeIso);
                const worst = isWorstHour(point.timeIso);
                const isSelected = idx === activeIndex;

                return (
                  <button
                    key={point.timeIso}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                    aria-label={`${point.hourLabel}: PM2.5 ${point.pm25} µg/m³, US AQI ${point.usAqi}, ${cpcb.labelEn}${clean ? ', Cleanest window' : ''}${worst ? ', Worst window' : ''}`}
                    className={`group flex flex-1 flex-col items-center justify-end h-full rounded-lg px-0.5 py-1 transition-colors ${
                      clean
                        ? 'ring-2 ring-[#5DCAA5] bg-[#1D9E75]/15'
                        : worst
                        ? 'ring-2 ring-rose-400 bg-rose-500/15'
                        : isSelected
                        ? 'bg-[#182947]'
                        : 'hover:bg-[#142138]'
                    }`}
                  >
                    <span className="mb-1 text-[10px] font-mono-tabular text-[#9FB0C7]">
                      {Math.round(point.pm25)}
                    </span>
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className={`w-full max-w-[18px] rounded-t-sm transition-transform ${style.barBg} ${
                          isSelected ? 'scale-x-110' : ''
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="mt-1.5 text-[10px] font-mono-tabular text-[#9FB0C7] whitespace-nowrap">
                      {idx % 3 === 0 || clean || worst ? point.hourLabel.replace(' ', '') : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-[#9FB0C7]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-[#5DCAA5] bg-[#1D9E75]/20" aria-hidden="true" />
              <span>
                {t(lang, 'cleanestWindow')}:{' '}
                <strong className="text-[#E6EDF7] font-mono-tabular">
                  {cleanestWindow.startLabel}–{cleanestWindow.endLabel} ({cleanestWindow.avgPm25} µg/m³)
                </strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-rose-400 bg-rose-500/20" aria-hidden="true" />
              <span>
                {t(lang, 'worstWindow')}:{' '}
                <strong className="text-[#E6EDF7] font-mono-tabular">
                  {worstWindow.startLabel}–{worstWindow.endLabel} ({worstWindow.avgPm25} µg/m³)
                </strong>
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/12">
          <table className="min-w-full divide-y divide-white/10 text-left text-xs">
            <thead className="bg-[#0C1322] text-[#9FB0C7]">
              <tr>
                <th scope="col" className="px-3.5 py-2.5 font-semibold">Hour</th>
                <th scope="col" className="px-3.5 py-2.5 font-semibold text-right">PM2.5 (µg/m³)</th>
                <th scope="col" className="px-3.5 py-2.5 font-semibold text-right">PM10 (µg/m³)</th>
                <th scope="col" className="px-3.5 py-2.5 font-semibold text-right">US AQI</th>
                <th scope="col" className="px-3.5 py-2.5 font-semibold">CPCB (Est.)</th>
                <th scope="col" className="px-3.5 py-2.5 font-semibold">Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-[#101A2C]">
              {hourly24.map((point) => {
                const cpcb = estimateCpcbFromPm(point.pm25, point.pm10);
                const clean = isCleanHour(point.timeIso);
                const worst = isWorstHour(point.timeIso);
                return (
                  <tr key={point.timeIso} className="hover:bg-[#182947]/70">
                    <td className="px-3.5 py-2 font-medium font-mono-tabular text-[#E6EDF7]">
                      {point.hourLabel}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono-tabular text-[#E6EDF7]">
                      {point.pm25}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono-tabular text-[#9FB0C7]">
                      {point.pm10 !== null ? point.pm10 : '—'}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono-tabular font-semibold text-[#38BDF8]">
                      {point.usAqi}
                    </td>
                    <td className="px-3.5 py-2 text-[#9FB0C7]">
                      {lang === 'hi' ? cpcb.labelHi : cpcb.labelEn}
                    </td>
                    <td className="px-3.5 py-2 text-[#9FB0C7]">
                      {clean ? 'Cleanest' : worst ? 'Worst' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
