import { useMemo, useState } from 'react';
import { Calculator, Check, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { t } from '../lib/i18n';
import { calculateWhatIfImpact } from '../lib/impactFormulas';
import type { AirQualitySnapshot, HouseholdProfile, WhatIfChoices } from '../types/vayu';

interface WhatIfCalculatorProps {
  snapshot: AirQualitySnapshot;
  profile: HouseholdProfile;
}

export function WhatIfCalculator({ snapshot, profile }: WhatIfCalculatorProps) {
  const lang = profile.language;
  const isHi = lang === 'hi';
  const [showFormulas, setShowFormulas] = useState(false);
  const [adherenceDays, setAdherenceDays] = useState<number>(5);
  const [choices, setChoices] = useState<WhatIfChoices>({
    switchToTransit: profile.commuteMode === 'car' || profile.commuteMode === 'two_wheeler',
    combineErrands: true,
    runPurifier: profile.hasAirPurifier,
    shiftOutdoorActivity: true,
    wearN95Mask: false,
    sealAndDampMop: true,
  });

  const result = useMemo(
    () => calculateWhatIfImpact(choices, snapshot, profile),
    [choices, snapshot, profile]
  );

  // Scale weekly & monthly emission avoidance smoothly by chosen adherence days/week (baseline model uses 5 days/week)
  const scaleFactor = adherenceDays / 5;
  const adjustedWeeklyCo2 = Number((result.weeklyCo2SavedKg * scaleFactor).toFixed(1));
  const adjustedMonthlyCo2 = Number((result.monthlyCo2SavedKg * scaleFactor).toFixed(1));

  const baselineDose = Math.max(1, result.estimatedBaselineDoseIndex);
  const adjustedDosePct = Math.max(
    12,
    Math.min(100, Math.round((result.estimatedAdjustedDoseIndex / baselineDose) * 100))
  );

  const toggleItems: Array<{
    key: keyof WhatIfChoices;
    labelEn: string;
    labelHi: string;
    hintEn: string;
    hintHi: string;
  }> = [
    {
      key: 'switchToTransit',
      labelEn:
        profile.commuteMode === 'metro'
          ? 'Replace 1–2 commute days with WFH'
          : 'Switch commute to Metro / AC Bus',
      labelHi:
        profile.commuteMode === 'metro'
          ? 'सप्ताह में 1–2 दिन घर से काम (WFH)'
          : 'आवागमन के लिए मेट्रो / बस चुनें',
      hintEn: `${profile.oneWayDistanceKm} km one-way route`,
      hintHi: `${profile.oneWayDistanceKm} किमी एक तरफ की दूरी`,
    },
    {
      key: 'combineErrands',
      labelEn: 'Combine errands into one trip',
      labelHi: 'बाहरी काम एक ही ट्रिप में जोड़ें',
      hintEn: 'Avoids 3 extra local trips/week',
      hintHi: 'सप्ताह में 3 अतिरिक्त ट्रिप बचते हैं',
    },
    {
      key: 'shiftOutdoorActivity',
      labelEn: `Shift outdoor activity to ${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}`,
      labelHi: `बाहरी गतिविधि ${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel} पर शिफ्ट करें`,
      hintEn: `~${snapshot.cleanestWindow.avgPm25} vs ${snapshot.worstWindow.avgPm25} µg/m³ peak`,
      hintHi: `~${snapshot.cleanestWindow.avgPm25} बनाम ${snapshot.worstWindow.avgPm25} µg/m³ पीक`,
    },
    {
      key: 'runPurifier',
      labelEn: `Run HEPA purifier in closed ${profile.roomSizeSqFt} sq ft room`,
      labelHi: `बंद ${profile.roomSizeSqFt} sq ft कमरे में HEPA प्यूरीफायर चलाएं`,
      hintEn: 'Requires windows/doors closed',
      hintHi: 'दरवाजे-खिड़कियां बंद रखना आवश्यक',
    },
    {
      key: 'wearN95Mask',
      labelEn: 'Wear well-fitted N95 / FFP2 outdoors',
      labelHi: 'बाहर सही फिटिंग वाला N95/FFP2 मास्क पहनें',
      hintEn: 'Cloth/surgical masks excluded',
      hintHi: 'कपड़े/सर्जिकल मास्क शामिल नहीं',
    },
    {
      key: 'sealAndDampMop',
      labelEn: 'Seal window gaps, damp mop & stop incense',
      labelHi: 'दरारें सील करें, गीला पोंछा लगाएं और धुआं रोकें',
      hintEn: 'Low/zero cost indoor source control',
      hintHi: 'कम/निःशुल्क इनडोर उपाय',
    },
  ];

  const applyPreset = (preset: 'zero_cost' | 'commuter' | 'full_shield') => {
    if (preset === 'zero_cost') {
      setChoices({
        switchToTransit: false,
        combineErrands: true,
        runPurifier: false,
        shiftOutdoorActivity: true,
        wearN95Mask: false,
        sealAndDampMop: true,
      });
    } else if (preset === 'commuter') {
      setChoices({
        switchToTransit: true,
        combineErrands: true,
        runPurifier: profile.hasAirPurifier,
        shiftOutdoorActivity: false,
        wearN95Mask: true,
        sealAndDampMop: false,
      });
    } else {
      setChoices({
        switchToTransit: true,
        combineErrands: true,
        runPurifier: true,
        shiftOutdoorActivity: true,
        wearN95Mask: true,
        sealAndDampMop: true,
      });
    }
  };

  const toggle = (key: keyof WhatIfChoices) => {
    setChoices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section id="what-if" aria-label={t(lang, 'whatIfTitle')} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#67E8F9]">
            09. {isHi ? 'पारदर्शी प्रभाव सिम्युलेटर' : 'Interactive Scenario Workbench'}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
            {t(lang, 'whatIfTitle')}
          </h2>
        </div>
        <span className="text-xs text-[#A7A3C7]">
          {isHi
            ? 'सभी संख्याएं पारदर्शी सूत्रों पर आधारित अनुमान हैं'
            : 'All numbers are estimates derived from transparent formulas'}
        </span>
      </div>

      <div className="obsidian-surface rounded-3xl p-6 space-y-6">
        {/* Preset Scenarios Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A7A3C7] mr-1">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#67E8F9]" aria-hidden="true" />
              <span>{isHi ? 'त्वरित प्रीसेट:' : 'Quick scenario presets:'}</span>
            </span>
            <button
              type="button"
              onClick={() => applyPreset('zero_cost')}
              className="min-h-[32px] rounded-lg border border-white/12 bg-[#0B0A16] px-3 py-1 text-xs font-semibold text-[#E6EDF7] hover:border-[#67E8F9]/60 hover:bg-[#14163F] whitespace-nowrap"
            >
              {isHi ? 'निःशुल्क पारिवारिक सुरक्षा' : 'Zero-Cost Family Habits'}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('commuter')}
              className="min-h-[32px] rounded-lg border border-white/12 bg-[#0B0A16] px-3 py-1 text-xs font-semibold text-[#E6EDF7] hover:border-[#67E8F9]/60 hover:bg-[#14163F] whitespace-nowrap"
            >
              {isHi ? 'कम-उत्सर्जन सफर' : 'Low-Emission Commuter'}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('full_shield')}
              className="min-h-[32px] rounded-lg border border-white/12 bg-[#0B0A16] px-3 py-1 text-xs font-semibold text-[#E6EDF7] hover:border-[#67E8F9]/60 hover:bg-[#14163F] whitespace-nowrap"
            >
              {isHi ? 'अधिकतम सुरक्षा स्टैक' : 'Maximum Clean-Air Stack'}
            </button>
          </div>

          {/* Weekly Adherence Slider */}
          <div className="flex items-center gap-3 text-xs">
            <label htmlFor="adherence-days" className="font-semibold text-[#A7A3C7] whitespace-nowrap">
              {isHi ? 'सप्ताह के दिन:' : 'Days / week:'}{' '}
              <span className="font-mono-tabular text-[#67E8F9]">{adherenceDays}d</span>
            </label>
            <input
              id="adherence-days"
              type="range"
              min={1}
              max={7}
              value={adherenceDays}
              onChange={(e) => setAdherenceDays(Number(e.target.value))}
              className="w-28 accent-[#67E8F9] cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Interactive Switch Tiles */}
          <div className="space-y-3 lg:col-span-7">
            <p className="text-sm font-semibold text-[#E6EDF7]">
              {isHi
                ? 'नीचे दिए गए विकल्प चुनें और दैनिक प्रभाव देखें:'
                : 'Toggle daily choices to test combined exposure & CO₂ impact:'}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {toggleItems.map((item) => {
                const checked = choices[item.key];
                const stepMetric = result.breakdown.find((b) => b.key === item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    onClick={() => toggle(item.key)}
                    className={`flex min-h-[72px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                      checked
                        ? 'border-[#67E8F9] bg-[#14163F]'
                        : 'border-white/10 bg-[#0B0A16]/80 hover:border-white/25 hover:bg-[#14122E]'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2.5">
                      <span className="text-xs font-semibold text-[#E6EDF7] leading-snug">
                        {isHi ? item.labelHi : item.labelEn}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          checked
                            ? 'border-[#67E8F9] bg-[#67E8F9] text-[#0B0A16]'
                            : 'border-white/20 bg-[#0B0A16]'
                        }`}
                      >
                        {checked ? <Check className="h-3 w-3 text-[#0B0A16]" /> : null}
                      </span>
                    </div>

                    <div className="mt-2 flex w-full items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#A7A3C7]">
                        {isHi ? item.hintHi : item.hintEn}
                      </span>
                      {checked && stepMetric ? (
                        <span className="font-mono-tabular font-semibold text-[#5DCAA5] shrink-0">
                          -{stepMetric.exposureReductionPct}%
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Calculated Results + Visual Dose Meter */}
          <div
            aria-live="polite"
            className="flex flex-col justify-between rounded-2xl border border-[#67E8F9]/25 bg-[#14163F] p-6 text-[#E6EDF7] lg:col-span-5"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#67E8F9]">
                <Calculator className="h-4 w-4" aria-hidden="true" />
                <span>{isHi ? 'अनुमानित दैनिक प्रभाव' : 'Estimated Combined Impact'}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-white/15 pb-4">
                <div>
                  <span className="text-xs text-[#A7A3C7]">
                    {isHi ? 'PM2.5 संपर्क में कमी (अनुमान)' : 'Exposure drop (est.)'}
                  </span>
                  <p className="mt-1 text-3xl font-extrabold font-mono-tabular text-[#5DCAA5]">
                    -{result.totalExposureReductionPct}%
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono-tabular text-[#A7A3C7]">
                    ~{result.estimatedBaselineDoseIndex} → ~{result.estimatedAdjustedDoseIndex} µg/m³ eq.
                  </p>
                </div>

                <div>
                  <span className="text-xs text-[#A7A3C7]">
                    {isHi ? `CO2 बचत (${adherenceDays} दिन/सप्ताह)` : `CO2 saved (${adherenceDays}d/wk)`}
                  </span>
                  <p className="mt-1 text-3xl font-extrabold font-mono-tabular text-white">
                    {adjustedWeeklyCo2} <span className="text-sm font-semibold text-[#67E8F9]">kg/wk</span>
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono-tabular text-[#A7A3C7]">
                    ~{adjustedMonthlyCo2} kg / month
                  </p>
                </div>
              </div>

              {/* Visual Before vs After Exposure Bar */}
              <div className="space-y-2 rounded-xl border border-white/12 bg-[#0B0A16]/75 p-3.5 text-xs">
                <div className="flex items-center justify-between font-mono-tabular text-[11px] text-[#A7A3C7]">
                  <span>{isHi ? 'सामान्य संपर्क' : 'Baseline routine dose'}</span>
                  <span>~{result.estimatedBaselineDoseIndex} µg/m³ eq.</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full w-full rounded-full bg-white/40" />
                </div>

                <div className="flex items-center justify-between font-mono-tabular text-[11px] text-[#5DCAA5] pt-1">
                  <span>{isHi ? 'बदलाव के साथ' : 'With active adjustments'}</span>
                  <span>~{result.estimatedAdjustedDoseIndex} µg/m³ eq.</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5DCAA5] transition-all duration-300"
                    style={{ width: `${adjustedDosePct}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-[#A7A3C7] leading-relaxed">
                {result.assumptionsAndLimits}
              </p>
            </div>

            <button
              type="button"
              aria-expanded={showFormulas}
              onClick={() => setShowFormulas((prev) => !prev)}
              className="mt-4 inline-flex min-h-[42px] items-center justify-between rounded-xl bg-[#67E8F9] px-4 py-2 text-xs font-bold text-[#0B0A16] hover:bg-[#A5F3FC]"
            >
              <span>{t(lang, 'howCalculated')}</span>
              {showFormulas ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {showFormulas ? (
          <div className="space-y-2.5 border-t border-white/10 pt-4">
            <h3 className="text-xs font-semibold text-[#E6EDF7]">
              {isHi ? 'चयनित विकल्पों का गणना विवरण' : 'Step-by-Step Formula Breakdown'}
            </h3>
            {result.breakdown.length === 0 ? (
              <p className="text-xs text-[#A7A3C7]">
                {isHi
                  ? 'गणना देखने के लिए ऊपर कम से कम एक विकल्प चुनें।'
                  : 'Select at least one toggle above to inspect the calculation steps.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {result.breakdown.map((step) => (
                  <li
                    key={step.key}
                    className="rounded-xl border border-white/10 bg-[#0B0A16]/85 p-3.5 text-xs text-[#A7A3C7]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[#E6EDF7]">
                      <span>{step.label}</span>
                      <span className="font-mono-tabular text-[#5DCAA5]">
                        -{step.exposureReductionPct}% dose · {(step.co2SavedKgPerWeek * scaleFactor).toFixed(1)} kg CO2/wk
                      </span>
                    </div>
                    <p className="mt-1 font-mono-tabular text-[11px] text-[#A7A3C7] leading-relaxed">
                      {step.formula}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
