import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe2,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { ALL_MONITORED_CITIES } from '../lib/aqiCities';
import { formatFreshnessLabel, searchGlobalCities } from '../lib/airQualityService';
import { FEATURED_CITY_SLIDES, getLocationVisualAsset } from '../lib/cityMedia';
import { CPCB_CATEGORY_STYLES, getUsAqiLabel } from '../lib/cpcb';
import { t } from '../lib/i18n';
import {
  GLOBAL_QUICK_PICK_CITIES,
  QUICK_PICK_CITIES,
  SAMPLE_PERSONAS,
  type SamplePersona,
} from '../lib/personas';
import type {
  AirQualitySnapshot,
  HouseholdProfile,
  IndianLocation,
  Language,
} from '../types/vayu';
import { AirProgressRing } from './AirProgressRing';

interface CityHeroCarouselProps {
  profile: HouseholdProfile;
  snapshot: AirQualitySnapshot | null;
  loading: boolean;
  easyRead: boolean;
  onToggleEasyRead: () => void;
  onSelectLocation: (loc: IndianLocation) => void;
  onSelectPersona: (persona: SamplePersona) => void;
  onChangeLanguage: (lang: Language) => void;
  onRefresh: () => void;
}

function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export function CityHeroCarousel({
  profile,
  snapshot,
  loading,
  easyRead,
  onToggleEasyRead,
  onSelectLocation,
  onSelectPersona,
  onChangeLanguage,
  onRefresh,
}: CityHeroCarouselProps) {
  const lang = profile.language;
  const selected = profile.location;

  const [slideIndex, setSlideIndex] = useState<number>(() => {
    const idx = FEATURED_CITY_SLIDES.findIndex((s) => s.cityId === selected.id);
    return idx >= 0 ? idx : 0;
  });
  const [autoPlay, setAutoPlay] = useState(true);
  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [reduceMotion] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );

  const [cityQuery, setCityQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndianLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const idx = FEATURED_CITY_SLIDES.findIndex((s) => s.cityId === selected.id);
    if (idx >= 0) {
      setSlideIndex(idx);
    }
  }, [selected.id]);

  useEffect(() => {
    if (!autoPlay || reduceMotion) return;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % FEATURED_CITY_SLIDES.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [autoPlay, reduceMotion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const trimmed = cityQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const hits = await searchGlobalCities(trimmed, {
          scope: 'all',
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSearchResults(hits);
          setHasSearched(true);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setHasSearched(true);
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cityQuery]);

  const currentSlide = FEATURED_CITY_SLIDES[slideIndex] ?? FEATURED_CITY_SLIDES[0];
  const isSlideSameAsSelected = currentSlide.cityId === selected.id;

  const selectedVisual = getLocationVisualAsset(selected);
  const displayImageUrl = isSlideSameAsSelected ? selectedVisual.imageUrl : currentSlide.imageUrl;
  const displayFallbackGradient = isSlideSameAsSelected
    ? selectedVisual.fallbackGradient
    : currentSlide.fallbackGradient;
  const displayTitle = isSlideSameAsSelected ? selected.name : currentSlide.title;
  const displayState = isSlideSameAsSelected ? selected.state : currentSlide.state;
  const displayLandmark = isSlideSameAsSelected
    ? lang === 'hi'
      ? selectedVisual.landmarkHi
      : selectedVisual.landmarkEn
    : lang === 'hi'
    ? currentSlide.landmarkHi
    : currentSlide.landmarkEn;
  const displayNetwork = isSlideSameAsSelected
    ? selectedVisual.stationNetwork
    : currentSlide.stationNetwork;
  const displayAlt = isSlideSameAsSelected
    ? lang === 'hi'
      ? selectedVisual.altHi
      : selectedVisual.altEn
    : lang === 'hi'
    ? currentSlide.altHi
    : currentSlide.altEn;

  const freshness = snapshot
    ? formatFreshnessLabel(snapshot.fetchedAtIso, lang, nowMs)
    : null;
  const cpcbStyle = snapshot
    ? CPCB_CATEGORY_STYLES[snapshot.cpcb.categoryKey]
    : null;
  const usLabel = snapshot ? getUsAqiLabel(snapshot.current.usAqi) : null;
  const accentGlowHex = cpcbStyle?.accentHex ?? '#38BDF8';

  return (
    <section aria-label="Featured world and Indian cities showcase" className="space-y-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        {/* Left: Cinematic Ken-Burns City Photo Showcase (8 cols) */}
        <div className="relative flex min-h-[410px] flex-col justify-between overflow-hidden rounded-3xl border border-white/12 bg-[#0C1322] text-[#E6EDF7] sm:min-h-[470px] lg:col-span-8 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.82)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={displayImageUrl}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.07 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.45, ease: 'easeOut' },
                scale: { duration: 6.4, ease: [0.22, 1, 0.36, 1] },
              }}
              className="absolute inset-0"
            >
              {failedImageUrls[displayImageUrl] ? (
                <div
                  className={`h-full w-full bg-gradient-to-br ${displayFallbackGradient}`}
                  aria-hidden="true"
                />
              ) : (
                <img
                  src={displayImageUrl}
                  alt={displayAlt}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImageUrls((prev) =>
                      prev[displayImageUrl] ? prev : { ...prev, [displayImageUrl]: true }
                    )
                  }
                  className="h-full w-full object-cover"
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Cosmic Obsidian Scrim + Dynamic Ambient Aura Glow */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#070B12] via-[#0C1322]/45 to-[#070B12]/60"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{
              background: `radial-gradient(620px circle at 85% 88%, ${accentGlowHex}22, transparent 62%)`,
            }}
          />

          {/* Top Bar */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg border border-white/15 bg-[#070B12]/80 px-2.5 py-1 font-mono-tabular font-semibold tracking-wide text-[#38BDF8] backdrop-blur-sm">
                {displayNetwork}
              </span>
              <span className="text-[#E6EDF7]/90 font-medium drop-shadow">{displayLandmark}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAutoPlay((p) => !p)}
                aria-label={autoPlay ? 'Pause city slideshow' : 'Play city slideshow'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0C1322]/85 text-[#E6EDF7] hover:bg-[#182947] transition-colors"
              >
                {autoPlay ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setSlideIndex(
                    (prev) =>
                      (prev - 1 + FEATURED_CITY_SLIDES.length) %
                      FEATURED_CITY_SLIDES.length
                  );
                }}
                aria-label="Previous city slide"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0C1322]/85 text-[#E6EDF7] hover:bg-[#182947] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-2 font-mono-tabular text-xs font-semibold text-[#38BDF8]">
                {String(slideIndex + 1).padStart(2, '0')} /{' '}
                {String(FEATURED_CITY_SLIDES.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setSlideIndex((prev) => (prev + 1) % FEATURED_CITY_SLIDES.length);
                }}
                aria-label="Next city slide"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0C1322]/85 text-[#E6EDF7] hover:bg-[#182947] transition-colors"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Bottom Content: City Headline + Floating Live AQI Gauge + Thumbnail Rail */}
          <div className="relative z-10 space-y-5 p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <motion.div
                key={`title-${displayTitle}-${displayState}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-1"
              >
                <p className="text-xs font-medium text-[#E6EDF7]/85">
                  {displayState}
                  {isSlideSameAsSelected && freshness ? (
                    <span className="text-[#5DCAA5]"> · {freshness}</span>
                  ) : null}
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.06] font-display text-balance drop-shadow-sm">
                  {displayTitle}
                </h1>
              </motion.div>

              {isSlideSameAsSelected ? (
                snapshot && usLabel ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.32 }}
                    className="flex items-center gap-4 rounded-2xl border border-white/15 bg-[#0C1322]/90 px-4 py-3 backdrop-blur-md shadow-xl"
                  >
                    <AirProgressRing
                      usAqi={snapshot.current.usAqi}
                      label={lang === 'hi' ? usLabel.hi : usLabel.en}
                      sublabel={lang === 'hi' ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn}
                      size={88}
                      strokeWidth={7}
                      theme="dark"
                      lang={lang}
                    />
                    <div className="space-y-1 text-xs">
                      <p className="font-mono-tabular text-[11px] font-medium text-[#9FB0C7]">
                        PM2.5{snapshot.weather.temperatureC !== null ? ` · ${snapshot.weather.temperatureC}°C` : ''}
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-[#38BDF8]">
                        {snapshot.current.pm25} µg/m³ ({snapshot.whoPm25Ratio ?? Number((snapshot.current.pm25 / 15).toFixed(1))}× WHO)
                      </p>
                      <p className="text-xs font-semibold text-[#E6EDF7]">
                        {lang === 'hi' ? usLabel.hi : usLabel.en}
                      </p>
                    </div>
                  </motion.div>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectLocation(currentSlide.city)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#38BDF8] px-4 py-2.5 text-xs font-bold text-[#0C1322] hover:bg-[#7DD3FC] whitespace-nowrap shrink-0 shadow-lg transition-transform hover:-translate-y-0.5"
                >
                  <span>
                    {lang === 'hi'
                      ? `${currentSlide.title} देखें`
                      : `Inspect ${currentSlide.title}`}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Thumbnail Rail */}
            <div
              role="tablist"
              aria-label="Featured world and India city slides"
              className="flex items-center gap-2 overflow-x-auto pb-0.5"
            >
              {FEATURED_CITY_SLIDES.map((slide, idx) => {
                const isSlideActive = idx === slideIndex;
                const isSelectedCity = slide.cityId === selected.id;
                return (
                  <motion.button
                    key={slide.cityId}
                    type="button"
                    role="tab"
                    aria-selected={isSlideActive}
                    whileHover={reduceMotion ? undefined : { y: -2 }}
                    onClick={() => {
                      setAutoPlay(false);
                      setSlideIndex(idx);
                      onSelectLocation(slide.city);
                    }}
                    className={`group flex min-h-[40px] items-center gap-2 rounded-xl border pr-3 pl-1.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isSlideActive
                        ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322] shadow-[0_0_20px_-4px_rgba(103,232,249,0.65)]'
                        : isSelectedCity
                        ? 'border-[#5DCAA5]/70 bg-[#182947]/90 text-[#5DCAA5] hover:bg-[#182947]'
                        : 'border-white/12 bg-[#070B12]/80 text-[#E6EDF7] hover:bg-[#182947]'
                    }`}
                  >
                    <img
                      src={slide.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded-lg object-cover shrink-0"
                    />
                    <span>{slide.title}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Animated Slideshow Progress Bar along bottom border */}
          <div aria-hidden="true" className="relative z-20 h-[3px] w-full bg-white/10">
            {autoPlay && !reduceMotion ? (
              <motion.div
                key={`progress-${slideIndex}-${autoPlay}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 6.5, ease: 'linear' }}
                style={{ transformOrigin: 'left center' }}
                className="h-full w-full bg-gradient-to-r from-[#38BDF8] to-[#5DCAA5]"
              />
            ) : (
              <div
                className="h-full bg-[#38BDF8]"
                style={{ width: `${((slideIndex + 1) / FEATURED_CITY_SLIDES.length) * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* Right: Sleek Obsidian Command Panel (4 cols) */}
        <div className="obsidian-surface flex flex-col justify-between rounded-3xl p-5 sm:p-6 lg:col-span-4">
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
                  {lang === 'hi' ? 'सक्रिय केंद्र' : 'Active Station'}
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleEasyRead}
                    aria-pressed={easyRead}
                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      easyRead
                        ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                        : 'border-white/12 bg-[#0C1322] text-[#E6EDF7] hover:bg-[#182947]'
                    }`}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    <span>
                      {easyRead
                        ? lang === 'hi'
                          ? 'बड़े अक्षर'
                          : 'Large ON'
                        : lang === 'hi'
                        ? 'बड़े अक्षर'
                        : 'Easy Read'}
                    </span>
                  </button>

                  <div
                    role="group"
                    aria-label={t(lang, 'languageLabel')}
                    className="inline-flex items-center rounded-lg border border-white/12 bg-[#0C1322] p-0.5 shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeLanguage('en')}
                      className={`min-h-[28px] rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                        lang === 'en' ? 'bg-[#182947] text-[#38BDF8]' : 'text-[#9FB0C7]'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeLanguage('hi')}
                      className={`min-h-[28px] rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                        lang === 'hi' ? 'bg-[#182947] text-[#38BDF8]' : 'text-[#9FB0C7]'
                      }`}
                    >
                      हिन्दी
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-[#E6EDF7] font-display leading-snug">
                  {selected.name}, {selected.state}
                </h2>
                <p className="font-mono-tabular text-xs text-[#9FB0C7]">
                  {formatCoords(selected.latitude, selected.longitude)}
                </p>
              </div>
            </div>

            {/* Global Search */}
            <div className="relative space-y-1">
              <label htmlFor="hero-global-search" className="sr-only">
                {lang === 'hi'
                  ? 'दुनिया का कोई भी शहर खोजें'
                  : 'Search any city or town worldwide'}
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9FB0C7]"
                  aria-hidden="true"
                />
                <input
                  id="hero-global-search"
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder={
                    lang === 'hi' ? 'कोई भी शहर खोजें...' : 'Search any city worldwide...'
                  }
                  className="min-h-[42px] w-full rounded-xl border border-white/12 bg-[#0C1322] pl-8 pr-9 text-xs text-[#E6EDF7] placeholder:text-[#9FB0C7]/70 focus:border-[#38BDF8] focus:bg-[#142138] focus:outline-none"
                />
                {cityQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCityQuery('');
                      setSearchResults([]);
                      setHasSearched(false);
                      setSearchError(null);
                    }}
                    aria-label={lang === 'hi' ? 'खोज साफ़ करें' : 'Clear city search'}
                    className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#9FB0C7] hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {searching ? (
                <p role="status" className="text-[11px] text-[#9FB0C7]">
                  {lang === 'hi' ? 'खोज रहे हैं...' : 'Searching...'}
                </p>
              ) : null}
              {searchError ? (
                <p role="alert" className="text-[11px] text-rose-300">
                  {searchError}
                </p>
              ) : null}
              {!searching && !searchError && hasSearched && cityQuery.trim().length >= 2 && searchResults.length === 0 ? (
                <p role="status" className="rounded-xl border border-white/10 bg-[#0C1322] px-3 py-2 text-[11px] text-[#9FB0C7]">
                  {lang === 'hi'
                    ? `"${cityQuery.trim()}" के लिए कोई शहर नहीं मिला।`
                    : `No matching cities found for "${cityQuery.trim()}".`}
                </p>
              ) : null}
              {searchResults.length > 0 ? (
                <ul
                  aria-label="Global city search results"
                  className="absolute left-0 right-0 top-[46px] z-30 max-h-56 overflow-y-auto divide-y divide-white/10 rounded-xl border border-white/15 bg-[#101A2C] shadow-2xl"
                >
                  {searchResults.map((city) => (
                    <li key={city.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectLocation(city);
                          setCityQuery('');
                          setSearchResults([]);
                          setHasSearched(false);
                        }}
                        className="flex w-full min-h-[42px] items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#182947]"
                      >
                        <span className="truncate font-semibold text-[#E6EDF7]">
                          {city.name}{' '}
                          <span className="font-normal text-[#9FB0C7]">{city.state}</span>
                        </span>
                        <span className="font-mono-tabular text-[10px] text-[#9FB0C7] shrink-0">
                          {formatCoords(city.latitude, city.longitude)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Compact Live Metrics Card */}
            {snapshot && cpcbStyle && usLabel ? (
              <div className={`rounded-2xl border p-4 ${cpcbStyle.badgeBorder} ${cpcbStyle.surfaceTint}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[#E6EDF7]">
                    {lang === 'hi' ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[#9FB0C7]">
                    {freshness}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono-tabular">
                  <div>
                    <span className="block text-[11px] text-[#9FB0C7]">US AQI</span>
                    <strong className="text-xl font-extrabold text-[#E6EDF7]">
                      {snapshot.current.usAqi}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#9FB0C7]">PM2.5</span>
                    <strong className="text-xl font-extrabold text-[#E6EDF7]">
                      {snapshot.current.pm25}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#9FB0C7]">Temp</span>
                    <strong className="text-xl font-extrabold text-[#E6EDF7]">
                      {snapshot.weather.temperatureC !== null ? `${snapshot.weather.temperatureC}°` : '--'}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/12 bg-[#0C1322] p-4 text-xs text-[#9FB0C7]">
                {loading
                  ? lang === 'hi'
                    ? 'लाइव डेटा लोड हो रहा है...'
                    : 'Loading live telemetry...'
                  : lang === 'hi'
                  ? 'शहर चुनें।'
                  : 'Select any city.'}
              </div>
            )}

            {/* Quick Persona Selector */}
            <div className="space-y-1">
              <label
                htmlFor="hero-persona-select"
                className="block text-xs font-semibold text-[#9FB0C7]"
              >
                {t(lang, 'samplePersonasLabel')}
              </label>
              <select
                id="hero-persona-select"
                value=""
                onChange={(e) => {
                  const found = SAMPLE_PERSONAS.find((p) => p.id === e.target.value);
                  if (found) onSelectPersona(found);
                }}
                className="w-full min-h-[40px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-xs font-medium text-[#E6EDF7]"
              >
                <option value="" disabled>
                  {lang === 'hi' ? 'परिवार प्रोफ़ाइल बदलें...' : 'Switch household profile...'}
                </option>
                {SAMPLE_PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'hi' ? p.labelHi : p.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <a
              href="#all-cities"
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#38BDF8] px-3 py-2 text-xs font-semibold text-[#0C1322] hover:bg-[#7DD3FC] whitespace-nowrap shrink-0"
            >
              <MapPin className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" />
              <span>{ALL_MONITORED_CITIES.length} Cities</span>
            </a>
            <a
              href="#map-globe"
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#0C1322] px-3 py-2 text-xs font-semibold text-[#E6EDF7] hover:bg-[#182947] whitespace-nowrap shrink-0"
            >
              <Globe2 className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              <span>{t(lang, 'navMapGlobe')}</span>
            </a>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label={t(lang, 'refreshData')}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/12 bg-[#0C1322] px-3 py-2 text-[#E6EDF7] hover:bg-[#182947] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#38BDF8] ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Pick Bar: India & Global */}
      <div className="obsidian-surface space-y-2 rounded-2xl px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1.5 text-xs font-semibold text-[#9FB0C7]">
              {lang === 'hi' ? 'भारत:' : 'India:'}
            </span>
            {QUICK_PICK_CITIES.map((city) => {
              const active = selected.id === city.id;
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => onSelectLocation(city)}
                  aria-pressed={active}
                  className={`min-h-[30px] rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322] font-semibold'
                      : 'border-white/10 bg-[#0C1322]/80 text-[#E6EDF7] hover:bg-[#182947]'
                  }`}
                >
                  {city.name}
                </button>
              );
            })}
          </div>

          <a
            href="#all-cities"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#38BDF8] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            <span>
              {lang === 'hi'
                ? `+ सभी ${ALL_MONITORED_CITIES.length}`
                : `All ${ALL_MONITORED_CITIES.length}`}
            </span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
          <span className="mr-1.5 text-xs font-semibold text-[#9FB0C7]">
            {lang === 'hi' ? 'दुनिया:' : 'World:'}
          </span>
          {GLOBAL_QUICK_PICK_CITIES.map((city) => {
            const active = selected.id === city.id;
            return (
              <button
                key={city.id}
                type="button"
                onClick={() => onSelectLocation(city)}
                aria-pressed={active}
                className={`min-h-[30px] rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322] font-semibold'
                    : 'border-white/10 bg-[#0C1322]/80 text-[#E6EDF7] hover:bg-[#182947]'
                }`}
              >
                {city.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
