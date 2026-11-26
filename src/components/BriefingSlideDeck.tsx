import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Info,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
  Wind,
} from 'lucide-react';
import { formatFreshnessLabel } from '../lib/airQualityService';
import { CPCB_CATEGORY_STYLES, getUsAqiLabel } from '../lib/cpcb';
import { calculateWhatIfImpact } from '../lib/impactFormulas';
import type {
  AdvisoryResult,
  AirQualitySnapshot,
  HouseholdProfile,
} from '../types/vayu';
import { AirProgressRing } from './AirProgressRing';

interface BriefingSlideDeckProps {
  snapshot: AirQualitySnapshot;
  advisoryResult: AdvisoryResult | null;
  profile: HouseholdProfile;
}

type SlideId = 'moment' | 'windows' | 'actions' | 'room_dial' | 'ripple';

export function BriefingSlideDeck({
  snapshot,
  advisoryResult,
  profile,
}: BriefingSlideDeckProps) {
  const lang = profile.language;
  const isHi = lang === 'hi';
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const [selectedActionIdx, setSelectedActionIdx] = useState(0);
  const [expandedDeck, setExpandedDeck] = useState(false);
  const [showHotspotFact, setShowHotspotFact] = useState(false);

  const [compareCleanWindow, setCompareCleanWindow] = useState(false);
  const [selectedHourIdx, setSelectedHourIdx] = useState(0);
  const [committedActionIds, setCommittedActionIds] = useState<Record<string, boolean>>({});
  const [roomSqFt, setRoomSqFt] = useState<number>(profile.roomSizeSqFt || 180);
  const [roomSealed, setRoomSealed] = useState<boolean>(true);
  const [rippleScale, setRippleScale] = useState<number>(25);

  useEffect(() => {
    setRoomSqFt(profile.roomSizeSqFt || 180);
  }, [profile.roomSizeSqFt]);

  useEffect(() => {
    setSelectedHourIdx(0);
  }, [snapshot.location.id]);

  const slides: Array<{ id: SlideId; num: string; titleEn: string; titleHi: string }> = [
    { id: 'moment', num: '01', titleEn: 'Live Lens', titleHi: 'लाइव स्थिति' },
    { id: 'windows', num: '02', titleEn: '24h Scrubber', titleHi: '24-घंटे ग्राफ' },
    { id: 'actions', num: '03', titleEn: 'Checklist', titleHi: 'दैनिक कदम' },
    { id: 'room_dial', num: '04', titleEn: 'CADR Dial', titleHi: 'कमरा CADR' },
    { id: 'ripple', num: '05', titleEn: 'Scale Impact', titleHi: 'सामूहिक प्रभाव' },
  ];

  const currentSlide = slides[activeSlideIdx] ?? slides[0];
  const usLabel = getUsAqiLabel(snapshot.current.usAqi);
  const cpcbAccent = CPCB_CATEGORY_STYLES[snapshot.cpcb.categoryKey]?.accentHex ?? '#67E8F9';
  const whoMultiple =
    snapshot.whoPm25Ratio ?? Number((snapshot.current.pm25 / 15).toFixed(1));
  const freshness = formatFreshnessLabel(snapshot.fetchedAtIso, lang);

  // Slide 02 data + smooth SVG sparkline points
  const hourlyList = snapshot.hourly24.slice(0, 24);
  const maxHourlyPm = useMemo(
    () => Math.max(40, ...hourlyList.map((h) => h.pm25)),
    [hourlyList]
  );
  const scrubbedHour = hourlyList[selectedHourIdx] ?? hourlyList[0];

  const sparklinePath = useMemo(() => {
    if (hourlyList.length < 2) return '';
    return hourlyList
      .map((pt, idx) => {
        const x = (idx / (hourlyList.length - 1)) * 100;
        const y = 100 - Math.min(92, Math.max(8, (pt.pm25 / maxHourlyPm) * 84));
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [hourlyList, maxHourlyPm]);

  // Room CADR physics
  const roomVolumeM3 = Math.round(roomSqFt * 0.255);
  const targetAch = roomSealed ? 4.8 : 2.6;
  const recommendedCadrM3h = Math.round(roomVolumeM3 * (roomSealed ? 4.8 : 6.2));
  const halfLifeMinutes = Math.max(7, Math.round((0.693 / targetAch) * 60));
  const cadrGaugeFraction = Math.min(1, Math.max(0.18, recommendedCadrM3h / 820));

  // Collective multiplier formulas
  const previewImpact = useMemo(
    () =>
      calculateWhatIfImpact(
        {
          switchToTransit:
            profile.commuteMode === 'car' || profile.commuteMode === 'two_wheeler',
          combineErrands: true,
          runPurifier: profile.hasAirPurifier,
          shiftOutdoorActivity: true,
          wearN95Mask: snapshot.current.usAqi > 150,
          sealAndDampMop: true,
        },
        snapshot,
        profile
      ),
    [snapshot, profile]
  );

  const scaledWeeklyCo2Kg = Number((previewImpact.weeklyCo2SavedKg * rippleScale).toFixed(1));
  const scaledMonthlyCo2Kg = Number((previewImpact.monthlyCo2SavedKg * rippleScale).toFixed(1));
  const monthlyTreeMonths = Math.max(1, Math.round(scaledMonthlyCo2Kg / 1.75));

  const topActions = advisoryResult?.advisory.top3Actions ?? [];
  const activeAction = topActions[selectedActionIdx] ?? topActions[0];
  const committedCount = topActions.filter((a) => committedActionIds[a.id]).length;

  const selectSlide = (idx: number) => {
    setSlideDir(idx >= activeSlideIdx ? 1 : -1);
    setActiveSlideIdx(idx);
    setShowHotspotFact(false);
  };

  const goPrev = () => {
    setSlideDir(-1);
    setActiveSlideIdx((activeSlideIdx - 1 + slides.length) % slides.length);
    setShowHotspotFact(false);
  };

  const goNext = () => {
    setSlideDir(1);
    setActiveSlideIdx((activeSlideIdx + 1) % slides.length);
    setShowHotspotFact(false);
  };

  const pmMaxBar = Math.max(60, snapshot.current.pm25, snapshot.cleanestWindow.avgPm25);

  return (
    <section
      id="briefing"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goPrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goNext();
        }
      }}
      aria-label={isHi ? 'इंटरैक्टिव दैनिक ब्रीफिंग स्टूडियो' : 'Interactive Air Briefing Studio'}
      className="obsidian-surface rounded-3xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#67E8F9]"
    >
      {/* Top Progress Hairline */}
      <div className="h-[3px] w-full bg-white/10" aria-hidden="true">
        <motion.div
          animate={{ width: `${((activeSlideIdx + 1) / slides.length) * 100}%` }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-gradient-to-r from-[#67E8F9] via-[#5DCAA5] to-[#A78BFA]"
        />
      </div>

      {/* Top Deck Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0B0A16]/90 px-5 py-3.5 sm:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono-tabular text-xs font-semibold text-[#67E8F9]">
            {currentSlide.num} / 0{slides.length}
          </span>
          <h2 className="text-base font-semibold tracking-tight text-[#E6EDF7] sm:text-lg">
            {snapshot.location.name} · {isHi ? 'ब्रीफिंग डेक' : 'Air Briefing'}
          </h2>
        </div>

        {/* Non-Linear Chapter Jump Tabs */}
        <div
          role="tablist"
          aria-label={isHi ? 'ब्रीफिंग स्लाइड्स' : 'Briefing deck chapters'}
          className="flex flex-wrap items-center gap-1.5"
        >
          {slides.map((s, idx) => {
            const active = idx === activeSlideIdx;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectSlide(idx)}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#67E8F9] bg-[#67E8F9] text-[#0B0A16] shadow-[0_0_18px_-4px_rgba(103,232,249,0.6)]'
                    : 'border-white/12 bg-[#0F0D22] text-[#E6EDF7] hover:bg-[#14163F]'
                }`}
              >
                <span className={`font-mono-tabular ${active ? 'text-[#0B0A16]/80' : 'text-[#67E8F9]'}`}>
                  {s.num}
                </span>
                <span>{isHi ? s.titleHi : s.titleEn}</span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={goPrev}
            aria-label={isHi ? 'पिछली स्लाइड' : 'Previous briefing slide'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#0F0D22] text-[#E6EDF7] hover:bg-[#14163F]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={isHi ? 'अगली स्लाइड' : 'Next briefing slide'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#0F0D22] text-[#E6EDF7] hover:bg-[#14163F]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setExpandedDeck((p) => !p)}
            aria-label={expandedDeck ? 'Compact briefing height' : 'Expand briefing height'}
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#0F0D22] text-[#E6EDF7] hover:bg-[#14163F]"
          >
            {expandedDeck ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Animated Slide Stage */}
      <div className={`relative overflow-hidden ${expandedDeck ? 'min-h-[400px]' : 'min-h-[315px]'}`}>
        <AnimatePresence mode="wait" custom={slideDir}>
          {/* SLIDE 01: VISUAL BENCHMARK & LIVE LENS */}
          {currentSlide.id === 'moment' ? (
            <motion.div
              key="slide-moment"
              initial={{ opacity: 0, x: slideDir * 28, scale: 0.988 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -slideDir * 24, scale: 0.988 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              {/* Left Glowing Indigo Stage */}
              <div
                className="relative flex flex-col justify-between gap-5 overflow-hidden bg-[#14163F] p-6 text-[#E6EDF7] sm:p-8 lg:col-span-5 lg:border-r lg:border-white/10"
                style={{
                  backgroundImage: `radial-gradient(380px circle at 88% 18%, ${cpcbAccent}22, transparent 62%)`,
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-mono-tabular text-[11px] font-semibold text-[#5DCAA5]">
                      {freshness}
                    </p>
                    <h3 className="font-display text-2xl font-semibold tracking-tight text-white">
                      {snapshot.location.name}
                    </h3>
                    <p className="text-xs text-[#A7A3C7]">{snapshot.location.state}</p>
                  </div>

                  <AirProgressRing
                    usAqi={snapshot.current.usAqi}
                    label={isHi ? usLabel.hi : usLabel.en}
                    sublabel={isHi ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn}
                    size={120}
                    strokeWidth={9}
                    theme="dark"
                    lang={lang}
                  />
                </div>

                {/* Live vs Best Window Switch */}
                <div className="space-y-2.5 border-t border-white/12 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#A7A3C7]">
                      {isHi ? 'व्यू:' : 'Focus:'}
                    </span>
                    <div className="inline-flex rounded-lg border border-white/15 bg-[#0B0A16] p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setCompareCleanWindow(false)}
                        className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                          !compareCleanWindow ? 'bg-[#67E8F9] text-[#0B0A16]' : 'text-[#A7A3C7] hover:text-white'
                        }`}
                      >
                        {isHi ? 'अभी' : 'Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareCleanWindow(true)}
                        className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                          compareCleanWindow ? 'bg-[#67E8F9] text-[#0B0A16]' : 'text-[#A7A3C7] hover:text-white'
                        }`}
                      >
                        {isHi ? 'सर्वोत्तम समय' : 'Best Window'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 font-mono-tabular text-xs">
                    <div>
                      <span className="block text-[#A7A3C7]">PM2.5</span>
                      <strong className="text-base font-bold text-white">
                        {compareCleanWindow ? snapshot.cleanestWindow.avgPm25 : snapshot.current.pm25} µg/m³
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[#A7A3C7]">
                        {compareCleanWindow ? (isHi ? 'समय' : 'Hours') : 'WHO 24h'}
                      </span>
                      <strong className="text-base font-bold text-[#67E8F9]">
                        {compareCleanWindow ? snapshot.cleanestWindow.startLabel : `${whoMultiple}×`}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[#A7A3C7]">
                        {isHi ? 'प्रमुख' : 'Driver'}
                      </span>
                      <strong className="text-base font-bold text-white">
                        {snapshot.dominantPollutant}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Visual Benchmark Meter & Crisp Summary */}
              <div className="flex flex-col justify-between gap-5 bg-[#0F0D22] p-6 sm:p-8 lg:col-span-7">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono-tabular text-xs font-semibold uppercase tracking-wider text-[#67E8F9]">
                      01 · {isHi ? 'सारांश और मानक ग्राफ' : 'Summary & Benchmark'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowHotspotFact((v) => !v)}
                      aria-expanded={showHotspotFact}
                      className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-white/12 bg-[#0B0A16] px-2.5 py-0.5 text-[11px] font-semibold text-[#67E8F9] hover:bg-[#14163F] whitespace-nowrap"
                    >
                      <Info className="h-3 w-3 text-[#67E8F9]" aria-hidden="true" />
                      <span>{showHotspotFact ? (isHi ? 'बंद' : 'Hide') : 'WHO vs CPCB'}</span>
                    </button>
                  </div>

                  <p className="font-display text-xl font-semibold leading-snug text-[#E6EDF7] sm:text-2xl">
                    {advisoryResult
                      ? advisoryResult.advisory.summaryBanner
                      : `US AQI ${snapshot.current.usAqi} · ${snapshot.current.pm25} µg/m³ PM2.5`}
                  </p>

                  {/* Visual Animated Benchmark Bars */}
                  <div className="space-y-2.5 rounded-2xl border border-white/10 bg-[#0B0A16]/75 p-4 font-mono-tabular text-xs">
                    {[
                      { label: 'WHO 2021 Safe', val: 15, color: '#5DCAA5' },
                      { label: isHi ? 'आज का सबसे साफ घंटा' : 'Best 2h Window', val: snapshot.cleanestWindow.avgPm25, color: '#67E8F9' },
                      { label: isHi ? 'अभी (Live)' : 'Live Now', val: snapshot.current.pm25, color: cpcbAccent },
                    ].map((row) => {
                      const pct = Math.min(100, Math.max(8, Math.round((row.val / pmMaxBar) * 100)));
                      return (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#A7A3C7]">{row.label}</span>
                            <strong className="text-[#E6EDF7]">{row.val} µg/m³</strong>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: row.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <AnimatePresence>
                    {showHotspotFact ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-xl border border-[#5DCAA5]/35 bg-[#1D9E75]/15 px-3.5 py-2.5 text-xs text-[#E6EDF7]"
                      >
                        <p className="font-mono-tabular text-[#E6EDF7]/90">
                          {isHi
                            ? `US AQI: ${snapshot.current.usAqi} · CPCB: ${snapshot.cpcb.estimatedSubIndex} (${snapshot.cpcb.labelHi}) · WHO सीमा: 15 µg/m³`
                            : `US AQI: ${snapshot.current.usAqi} · CPCB: ${snapshot.cpcb.estimatedSubIndex} (${snapshot.cpcb.labelEn}) · WHO 24h limit: 15 µg/m³`}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Wind className="h-4 w-4 shrink-0 text-[#67E8F9]" aria-hidden="true" />
                    <span className="text-[#A7A3C7] font-mono-tabular">
                      {snapshot.weather.temperatureC}°C · {snapshot.weather.windSpeedKmh} km/h · {snapshot.weather.humidityPct}% RH
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#5DCAA5]" aria-hidden="true" />
                    <span className="text-[#E6EDF7] truncate">
                      {advisoryResult?.advisory.maskGuidance.recommendedType ??
                        (snapshot.current.usAqi > 150 ? 'Fitted N95 / FFP2' : 'Mask optional')}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* SLIDE 02: VISUAL 24-HOUR FORECAST & SPARKLINE SCRUBBER */}
          {currentSlide.id === 'windows' ? (
            <motion.div
              key="slide-windows"
              initial={{ opacity: 0, x: slideDir * 28, scale: 0.988 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -slideDir * 24, scale: 0.988 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="flex flex-col justify-between gap-4 bg-[#0F0D22] p-6 sm:p-8 lg:col-span-7">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono-tabular text-xs font-semibold uppercase tracking-wider text-[#67E8F9]">
                    02 · {isHi ? '24-घंटे PM2.5 ग्राफ' : '24-Hour Air Curve'}
                  </p>
                  {scrubbedHour ? (
                    <span className="rounded-md bg-[#14163F] px-2.5 py-0.5 font-mono-tabular text-xs font-bold text-[#67E8F9]">
                      {scrubbedHour.hourLabel}
                    </span>
                  ) : null}
                </div>

                {/* Integrated SVG Trend Sparkline + Interactive Bars */}
                <div className="relative rounded-2xl border border-white/12 bg-[#0B0A16] p-3">
                  {sparklinePath ? (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-3 top-2 h-16 w-[calc(100%-1.5rem)] opacity-35"
                    >
                      <path
                        d={sparklinePath}
                        fill="none"
                        stroke="#67E8F9"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : null}

                  <div
                    role="group"
                    aria-label="Hourly forecast bar selector"
                    className="relative z-10 grid grid-cols-12 sm:grid-cols-24 gap-1 items-end h-28 pt-5"
                  >
                    {hourlyList.map((pt, idx) => {
                      const heightPct = Math.max(16, Math.round((pt.pm25 / maxHourlyPm) * 100));
                      const active = idx === selectedHourIdx;
                      const barTone =
                        pt.pm25 <= 30
                          ? 'bg-[#5DCAA5]'
                          : pt.pm25 <= 60
                          ? 'bg-amber-400'
                          : 'bg-rose-400';
                      return (
                        <button
                          key={pt.timeIso}
                          type="button"
                          onClick={() => setSelectedHourIdx(idx)}
                          title={`${pt.hourLabel}: PM2.5 ${pt.pm25} µg/m³ · US AQI ${pt.usAqi}`}
                          aria-label={`${pt.hourLabel}, PM2.5 ${pt.pm25}`}
                          aria-pressed={active}
                          className={`group relative flex h-full w-full items-end rounded-sm transition-opacity ${
                            active
                              ? 'ring-2 ring-[#67E8F9] ring-offset-1 ring-offset-[#0B0A16] opacity-100'
                              : 'opacity-65 hover:opacity-100'
                          }`}
                        >
                          <motion.span
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPct}%` }}
                            transition={{ duration: 0.3, delay: idx * 0.01 }}
                            className={`block w-full rounded-t-sm ${barTone}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scrubber */}
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular text-[11px] text-[#A7A3C7]">Now</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, hourlyList.length - 1)}
                    value={selectedHourIdx}
                    onChange={(e) => setSelectedHourIdx(Number(e.target.value))}
                    aria-label="Scrub 24-hour forecast"
                    className="flex-1 accent-[#67E8F9] cursor-pointer"
                  />
                  <span className="font-mono-tabular text-[11px] text-[#A7A3C7]">+23h</span>
                </div>

                {/* Cleanest vs Peak compact pills */}
                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 font-mono-tabular text-xs">
                  <div>
                    <span className="font-semibold text-[#5DCAA5]">
                      {isHi ? 'साफ खिड़की:' : 'Cleanest:'}
                    </span>{' '}
                    <strong className="text-[#E6EDF7]">
                      {snapshot.cleanestWindow.startLabel}–{snapshot.cleanestWindow.endLabel}
                    </strong>{' '}
                    <span className="text-[#A7A3C7]">({snapshot.cleanestWindow.avgPm25} µg/m³)</span>
                  </div>
                  <div>
                    <span className="font-semibold text-rose-300">
                      {isHi ? 'उच्चतम स्तर:' : 'Peak:'}
                    </span>{' '}
                    <strong className="text-[#E6EDF7]">
                      {snapshot.worstWindow.startLabel}–{snapshot.worstWindow.endLabel}
                    </strong>{' '}
                    <span className="text-[#A7A3C7]">({snapshot.worstWindow.avgPm25} µg/m³)</span>
                  </div>
                </div>
              </div>

              <div
                className="flex flex-col justify-between gap-4 bg-[#14163F] p-6 text-[#E6EDF7] sm:p-8 lg:col-span-5 lg:border-l lg:border-white/10"
                style={{
                  backgroundImage: 'radial-gradient(360px circle at 85% 15%, #67E8F920, transparent 60%)',
                }}
              >
                {scrubbedHour ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs font-semibold text-[#67E8F9]">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{scrubbedHour.hourLabel}</span>
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            scrubbedHour.pm25 <= 30
                              ? 'text-[#5DCAA5]'
                              : scrubbedHour.pm25 <= 60
                              ? 'text-amber-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {scrubbedHour.pm25 <= 30
                            ? isHi
                              ? 'सुरक्षित समय'
                              : 'Open Windows / Walk'
                            : scrubbedHour.pm25 <= 60
                            ? isHi
                              ? 'मध्यम सतर्कता'
                              : 'Light Errands Only'
                            : isHi
                            ? 'भीतर रहें / N95'
                            : 'Stay Indoors / N95'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-y border-white/12 py-4 font-mono-tabular">
                        <div>
                          <span className="block text-[11px] text-[#A7A3C7]">US AQI</span>
                          <strong className="text-2xl font-bold text-white">
                            {scrubbedHour.usAqi}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[11px] text-[#A7A3C7]">PM2.5</span>
                          <strong className="text-2xl font-bold text-[#67E8F9]">
                            {scrubbedHour.pm25}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[11px] text-[#A7A3C7]">NO₂</span>
                          <strong className="text-2xl font-bold text-white">
                            {scrubbedHour.no2}
                          </strong>
                        </div>
                      </div>

                      {/* Hourly Weather Context */}
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular text-[#A7A3C7]">
                        <span>
                          Temp: <strong className="text-[#E6EDF7]">{scrubbedHour.temperatureC ?? '--'}°C</strong>
                        </span>
                        <span>
                          Wind: <strong className="text-[#E6EDF7]">{scrubbedHour.windSpeedKmh ?? '--'} km/h</strong>
                        </span>
                        <span>
                          RH: <strong className="text-[#E6EDF7]">{scrubbedHour.humidityPct ?? '--'}%</strong>
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#A7A3C7] font-mono-tabular">
                      Open-Meteo CAMS Hourly · General guidance, not medical advice
                    </p>
                  </>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          {/* SLIDE 03: INTERACTIVE ACTION CHECKLIST */}
          {currentSlide.id === 'actions' ? (
            <motion.div
              key="slide-actions"
              initial={{ opacity: 0, x: slideDir * 28, scale: 0.988 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -slideDir * 24, scale: 0.988 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="divide-y divide-white/10 border-b border-white/10 bg-[#0B0A16]/90 lg:col-span-5 lg:border-b-0 lg:border-r">
                <div className="space-y-2 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-[#A7A3C7]">
                      {isHi ? 'दैनिक लक्ष्य' : 'Daily Action Tracker'}
                    </span>
                    <span className="font-mono-tabular text-[#5DCAA5]">
                      {committedCount}/{topActions.length}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      animate={{
                        width: `${topActions.length > 0 ? (committedCount / topActions.length) * 100 : 0}%`,
                      }}
                      className="h-full rounded-full bg-[#5DCAA5]"
                    />
                  </div>
                </div>

                {topActions.length > 0 ? (
                  topActions.map((act, idx) => {
                    const selected = idx === selectedActionIdx;
                    const committed = Boolean(committedActionIds[act.id]);
                    return (
                      <div
                        key={act.id}
                        className={`flex items-stretch transition-colors ${
                          selected
                            ? 'bg-[#14163F] text-[#E6EDF7]'
                            : 'bg-[#0B0A16]/75 text-[#E6EDF7] hover:bg-[#14122E]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCommittedActionIds((prev) => ({
                              ...prev,
                              [act.id]: !prev[act.id],
                            }))
                          }
                          aria-label={committed ? `Unmark ${act.title}` : `Plan ${act.title} today`}
                          className="flex items-center justify-center pl-4 pr-2"
                        >
                          {committed ? (
                            <CheckCircle2 className="h-4 w-4 text-[#5DCAA5]" aria-hidden="true" />
                          ) : (
                            <Circle className="h-4 w-4 text-[#A7A3C7]/50" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedActionIdx(idx)}
                          className="flex flex-1 items-start gap-2.5 py-4 pr-4 text-left"
                        >
                          <span className="font-mono-tabular text-xs font-bold text-[#67E8F9] shrink-0">
                            0{idx + 1}
                          </span>
                          <span
                            className={`text-sm font-semibold leading-snug ${
                              committed ? 'line-through decoration-[#5DCAA5]/60 text-[#A7A3C7]' : ''
                            }`}
                          >
                            {act.title}
                          </span>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-sm text-[#A7A3C7]">
                    {isHi ? 'सुझाव लोड हो रहे हैं...' : 'Preparing priority actions...'}
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between bg-[#0F0D22] p-6 sm:p-8 lg:col-span-7">
                {activeAction ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono-tabular text-xs">
                      <span className="font-semibold text-[#67E8F9]">
                        {activeAction.effort} · {activeAction.cost}
                      </span>
                      <span className="text-[#A7A3C7]">{activeAction.whoFor}</span>
                    </div>
                    <h3 className="font-display text-xl font-semibold text-[#E6EDF7]">
                      {activeAction.title}
                    </h3>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                      <div className="rounded-xl border border-white/10 bg-[#0B0A16]/75 p-3">
                        <span className="font-semibold text-[#67E8F9]">
                          {isHi ? 'क्यों' : 'Why'}
                        </span>
                        <p className="mt-1 text-[#E6EDF7]/90 leading-relaxed">{activeAction.why}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0B0A16]/75 p-3">
                        <span className="font-semibold text-[#5DCAA5]">
                          {isHi ? 'कब' : 'When'}
                        </span>
                        <p className="mt-1 text-[#E6EDF7]/90 leading-relaxed">{activeAction.when}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0B0A16]/75 p-3">
                        <span className="font-semibold text-[#5DCAA5]">
                          {isHi ? 'लाभ' : 'Expected Benefit'}
                        </span>
                        <p className="mt-1 text-[#A7A3C7]">{activeAction.expectedBenefit}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0B0A16]/75 p-3">
                        <span className="font-semibold text-[#E6EDF7]">
                          {isHi ? 'सीमाएं' : 'Scope Limit'}
                        </span>
                        <p className="mt-1 text-[#A7A3C7]">{activeAction.limitations}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          {/* SLIDE 04: VISUAL CADR AIRFLOW GAUGE */}
          {currentSlide.id === 'room_dial' ? (
            <motion.div
              key="slide-room"
              initial={{ opacity: 0, x: slideDir * 28, scale: 0.988 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -slideDir * 24, scale: 0.988 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              <div
                className="flex flex-col justify-between gap-4 bg-[#14163F] p-6 text-[#E6EDF7] sm:p-8 lg:col-span-5 lg:border-r lg:border-white/10"
                style={{
                  backgroundImage: 'radial-gradient(360px circle at 20% 25%, #67E8F922, transparent 60%)',
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-mono-tabular text-xs font-semibold text-[#67E8F9]">
                      04 · CADR Gauge
                    </p>
                    <h3 className="font-display text-2xl font-semibold text-white">
                      {roomSqFt} sq ft
                    </h3>
                    <p className="font-mono-tabular text-xs text-[#A7A3C7]">
                      Vol: {roomVolumeM3} m³
                    </p>
                  </div>

                  {/* Animated SVG Airflow Arc Gauge */}
                  <div className="relative flex h-24 w-24 items-center justify-center shrink-0">
                    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden="true">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="8"
                      />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#67E8F9"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        animate={{
                          strokeDashoffset: 2 * Math.PI * 40 * (1 - cadrGaugeFraction),
                        }}
                        transition={{ duration: 0.35 }}
                      />
                    </svg>
                    <div className="absolute text-center font-mono-tabular">
                      <strong className="block text-sm font-bold text-white">
                        {recommendedCadrM3h}
                      </strong>
                      <span className="text-[10px] text-[#A7A3C7]">m³/h</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/12 pt-4 font-mono-tabular">
                  <div>
                    <span className="block text-[11px] text-[#A7A3C7]">
                      {isHi ? 'HEPA CADR' : 'Target CADR'}
                    </span>
                    <strong className="text-2xl font-bold text-[#67E8F9]">
                      {recommendedCadrM3h} m³/h
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#A7A3C7]">
                      {isHi ? '50% साफ समय' : '50% PM Drop'}
                    </span>
                    <strong className="text-2xl font-bold text-[#5DCAA5]">
                      ~{halfLifeMinutes} min
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-5 bg-[#0F0D22] p-6 sm:p-8 lg:col-span-7">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#E6EDF7]">
                      <span className="inline-flex items-center gap-1.5">
                        <Sliders className="h-3.5 w-3.5 text-[#67E8F9]" aria-hidden="true" />
                        <span>{isHi ? 'कमरे का आकार (sq ft)' : 'Room Size (sq ft)'}</span>
                      </span>
                      <span className="font-mono-tabular text-[#67E8F9]">{roomSqFt} sq ft</span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={600}
                      step={10}
                      value={roomSqFt}
                      onChange={(e) => setRoomSqFt(Number(e.target.value))}
                      aria-label="Room area in square feet"
                      className="w-full accent-[#67E8F9] cursor-pointer"
                    />
                    <div className="flex justify-between font-mono-tabular text-[11px] text-[#A7A3C7]">
                      <span>80 sq ft</span>
                      <span>200 sq ft</span>
                      <span>600 sq ft</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0B0A16]/85 p-4">
                    <div className="text-xs">
                      <p className="font-semibold text-[#E6EDF7]">
                        {isHi ? 'खिड़की/दरवाजा सील' : 'Room Air Seal'}
                      </p>
                      <p className="text-[#A7A3C7] font-mono-tabular mt-0.5">
                        {roomSealed ? '4.8 ACH target' : '2.6 ACH (leaky gap penalty)'}
                      </p>
                    </div>
                    <div className="inline-flex rounded-lg border border-white/12 bg-[#0F0D22] p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setRoomSealed(true)}
                        className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                          roomSealed ? 'bg-[#67E8F9] text-[#0B0A16]' : 'text-[#A7A3C7]'
                        }`}
                      >
                        {isHi ? 'बंद सील' : 'Sealed'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoomSealed(false)}
                        className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                          !roomSealed ? 'bg-[#67E8F9] text-[#0B0A16]' : 'text-[#A7A3C7]'
                        }`}
                      >
                        {isHi ? 'खुली दरार' : 'Leaky'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-[#A7A3C7]">
                  <span className="font-mono-tabular">
                    {roomSqFt} × 0.255 × {roomSealed ? '4.8' : '6.2'} = {recommendedCadrM3h} m³/h
                  </span>
                  <a
                    href="#what-if"
                    className="font-semibold text-[#67E8F9] underline underline-offset-4 whitespace-nowrap shrink-0"
                  >
                    {isHi ? 'पूर्ण कैलकुलेटर →' : 'Full Simulator →'}
                  </a>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* SLIDE 05: VISUAL 10×10 COLLECTIVE SCALE MATRIX */}
          {currentSlide.id === 'ripple' ? (
            <motion.div
              key="slide-ripple"
              initial={{ opacity: 0, x: slideDir * 28, scale: 0.988 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -slideDir * 24, scale: 0.988 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              <div
                className="flex flex-col justify-between gap-4 bg-[#14163F] p-6 text-[#E6EDF7] sm:p-8 lg:col-span-5 lg:border-r lg:border-white/10"
                style={{
                  backgroundImage: 'radial-gradient(360px circle at 80% 80%, #5DCAA522, transparent 62%)',
                }}
              >
                <div className="space-y-1">
                  <p className="font-mono-tabular text-xs font-semibold text-[#5DCAA5]">
                    05 · {isHi ? 'सामूहिक प्रभाव' : 'Neighborhood Scale'}
                  </p>
                  <h3 className="font-display text-2xl font-semibold text-white">
                    {rippleScale} {rippleScale === 1 ? (isHi ? 'घर' : 'Home') : isHi ? 'घर' : 'Homes'}
                  </h3>
                </div>

                {/* 10x10 Visual Home Matrix */}
                <div
                  aria-hidden="true"
                  className="grid grid-cols-10 gap-1 rounded-xl border border-white/10 bg-[#0B0A16]/75 p-2.5"
                >
                  {Array.from({ length: 100 }, (_, i) => {
                    const active = i < rippleScale;
                    return (
                      <div
                        key={i}
                        className={`h-2 rounded-[2px] transition-colors ${
                          active ? 'bg-[#5DCAA5]' : 'bg-white/10'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-white/12 pt-4 font-mono-tabular">
                  <div>
                    <span className="block text-[11px] text-[#A7A3C7]">
                      {isHi ? 'CO₂ बचत / माह' : 'CO₂ Saved / mo'}
                    </span>
                    <strong className="text-2xl font-bold text-[#5DCAA5]">
                      {scaledMonthlyCo2Kg} kg
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] text-[#A7A3C7]">
                      {isHi ? 'पेड़-माह समतुल्य' : 'Tree-Months'}
                    </span>
                    <strong className="text-2xl font-bold text-[#67E8F9]">
                      ~{monthlyTreeMonths}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-5 bg-[#0F0D22] p-6 sm:p-8 lg:col-span-7">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#67E8F9]">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isHi ? 'परिवार गिनती' : 'Households (1–100)'}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 10, 25, 50, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRippleScale(n)}
                          className={`min-h-[28px] rounded-md border px-2.5 py-0.5 font-mono-tabular text-xs font-semibold transition-colors ${
                            rippleScale === n
                              ? 'border-[#67E8F9] bg-[#67E8F9] text-[#0B0A16]'
                              : 'border-white/12 bg-[#0B0A16] text-[#E6EDF7] hover:bg-[#14163F]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={rippleScale}
                    onChange={(e) => setRippleScale(Number(e.target.value))}
                    aria-label="Number of participating households"
                    className="w-full accent-[#67E8F9] cursor-pointer"
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 font-mono-tabular text-xs">
                    <div className="rounded-xl border border-white/10 bg-[#0B0A16]/85 p-3.5">
                      <span className="text-[#A7A3C7] block">
                        {isHi ? 'व्यक्तिगत संपर्क में कमी' : 'Exposure Drop / Home'}
                      </span>
                      <strong className="mt-1 block text-xl text-[#67E8F9]">
                        ~{previewImpact.totalExposureReductionPct}%
                      </strong>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#0B0A16]/85 p-3.5">
                      <span className="text-[#A7A3C7] block">
                        {isHi ? 'साप्ताहिक CO₂ बचत' : 'Weekly Pace'}
                      </span>
                      <strong className="mt-1 block text-xl text-[#5DCAA5]">
                        {scaledWeeklyCo2Kg} kg/wk
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] font-mono-tabular text-[#A7A3C7]">
                  <span className="inline-flex items-center gap-1.5 text-[#5DCAA5]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {previewImpact.weeklyCo2SavedKg} kg/wk × {rippleScale} homes
                    </span>
                  </span>
                  <span>
                    {isHi ? 'केवल सूत्र गुणक अनुमान' : 'Pure formula multiplier · General guidance'}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Bottom Interactive Progress Track */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0B0A16]/90 px-5 py-2.5 sm:px-7">
        <div className="flex items-center gap-2" aria-label="Slide progress indicators">
          {slides.map((s, idx) => {
            const active = idx === activeSlideIdx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSlide(idx)}
                aria-label={`${isHi ? s.titleHi : s.titleEn} (${s.num})`}
                className={`h-2 rounded-full transition-all ${
                  active ? 'w-8 bg-[#67E8F9]' : 'w-2.5 bg-white/25 hover:bg-[#5DCAA5]'
                }`}
              />
            );
          })}
        </div>
        <span className="font-mono-tabular text-[11px] text-[#A7A3C7]">
          {snapshot.sourceName} · {isHi ? 'केवल सामान्य मार्गदर्शन' : 'General guidance, not medical advice'}
        </span>
      </div>
    </section>
  );
}
