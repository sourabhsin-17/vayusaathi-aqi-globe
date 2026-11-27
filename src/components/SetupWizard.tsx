import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Globe2,
  LocateFixed,
  Search,
  Users,
  X,
} from 'lucide-react';
import { searchGlobalCities } from '../lib/airQualityService';
import { ALL_MONITORED_CITIES } from '../lib/aqiCities';
import { getLocationVisualAsset } from '../lib/cityMedia';
import {
  buildFallbackCoordinateLocation,
  resolveExactLocationFromCoords,
} from '../lib/geolocationService';
import { t } from '../lib/i18n';
import {
  GLOBAL_QUICK_PICK_CITIES,
  QUICK_PICK_CITIES,
  SAMPLE_PERSONAS,
  type SamplePersona,
} from '../lib/personas';
import { LocationExplorer } from './LocationExplorer';
import type {
  BudgetTier,
  CommuteMode,
  HomeType,
  HouseholdProfile,
  IndianLocation,
  Language,
} from '../types/vayu';

interface SetupWizardProps {
  profile: HouseholdProfile;
  easyRead: boolean;
  onToggleEasyRead: () => void;
  onChangeProfile: (next: HouseholdProfile) => void;
  onComplete: () => void;
  onSelectPersona: (persona: SamplePersona) => void;
}

export function SetupWizard({
  profile,
  easyRead,
  onToggleEasyRead,
  onChangeProfile,
  onComplete,
  onSelectPersona,
}: SetupWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndianLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const geoAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      geoAbortRef.current?.abort();
    };
  }, []);

  const lang = profile.language;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const cities = await searchGlobalCities(trimmed, {
          scope: 'all',
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSearchResults(cities);
          setHasSearched(true);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchError(err instanceof Error ? err.message : 'City search failed.');
        setHasSearched(true);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setGeoStatus(
        lang === 'hi'
          ? 'आपके ब्राउज़र में लोकेशन सुविधा उपलब्ध नहीं है। कृपया ऊपर से शहर चुनें।'
          : 'Browser geolocation is not supported here. Please search or pick a city below.'
      );
      return;
    }

    setIsLocating(true);
    setGeoStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const curLang = profileRef.current.language;
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined;
        const immediate = buildFallbackCoordinateLocation(lat, lon, curLang, acc);
        onChangeProfile({ ...profileRef.current, location: immediate });

        geoAbortRef.current?.abort();
        const controller = new AbortController();
        geoAbortRef.current = controller;

        const resolved = await resolveExactLocationFromCoords(lat, lon, curLang, acc, controller.signal);
        if (controller.signal.aborted) return;
        if (profileRef.current.location.id === immediate.id) {
          onChangeProfile({ ...profileRef.current, location: resolved });
        }
        setIsLocating(false);
        setGeoStatus(
          profileRef.current.language === 'hi'
            ? `लाइव GPS क्षेत्र मिल गया: ${resolved.exactAreaLabel ?? resolved.name}`
            : `Exact GPS area detected: ${resolved.exactAreaLabel ?? resolved.name}`
        );
      },
      () => {
        setIsLocating(false);
        const curLang = profileRef.current.language;
        setGeoStatus(
          curLang === 'hi'
            ? 'लोकेशन अनुमति अस्वीकृत या अनुपलब्ध है। कृपया नीचे से अपना शहर चुनें।'
            : 'Location permission denied or unavailable. No problem—search or pick your city manually below.'
        );
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const setLanguage = (nextLang: Language) => {
    onChangeProfile({ ...profile, language: nextLang });
  };

  const memberOptions: Array<{
    key: keyof HouseholdProfile['members'];
    labelKey: string;
  }> = [
    { key: 'childrenUnder12', labelKey: 'memberChildren' },
    { key: 'schoolAgeKids', labelKey: 'memberSchoolKids' },
    { key: 'elderly60Plus', labelKey: 'memberElderly' },
    { key: 'workingProfessionals', labelKey: 'memberWorking' },
    { key: 'outdoorWorkers', labelKey: 'memberOutdoor' },
    { key: 'respiratoryOrCardiacSensitive', labelKey: 'memberSensitive' },
  ];

  const commuteModes: Array<{ value: CommuteMode; labelKey: string }> = [
    { value: 'metro', labelKey: 'modeMetro' },
    { value: 'bus', labelKey: 'modeBus' },
    { value: 'car', labelKey: 'modeCar' },
    { value: 'two_wheeler', labelKey: 'modeTwoWheeler' },
    { value: 'walk', labelKey: 'modeWalk' },
    { value: 'wfh', labelKey: 'modeWfh' },
  ];

  const homeTypes: Array<{ value: HomeType; labelKey: string }> = [
    { value: 'apartment', labelKey: 'homeApartment' },
    { value: 'independent_house', labelKey: 'homeIndependent' },
    { value: 'ground_roadside', labelKey: 'homeGroundRoadside' },
  ];

  const budgets: Array<{ value: BudgetTier; labelKey: string }> = [
    { value: 'free', labelKey: 'budgetFree' },
    { value: 'low', labelKey: 'budgetLow' },
    { value: 'medium', labelKey: 'budgetMedium' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Sample Personas, Easy Read & Language Intro Card */}
      <section
        aria-label="Quick start personas"
        className="obsidian-surface rounded-3xl p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display sm:text-3xl text-balance">
              {lang === 'hi'
                ? 'अपने परिवार और शहर के अनुसार वायु सुरक्षा योजना बनाएं'
                : 'Build your household air-safety & low-emission plan'}
            </h1>
            <p className="text-sm text-[#9FB0C7]">
              {lang === 'hi'
                ? 'लाइव Open-Meteo डेटा पर आधारित। सभी प्रोफ़ाइल विकल्प वैकल्पिक हैं।'
                : 'Powered by live Open-Meteo telemetry. Every profile field is optional with sensible defaults.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleEasyRead}
              aria-pressed={easyRead}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                easyRead
                  ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                  : 'border-white/12 bg-[#0C1322] text-[#E6EDF7] hover:bg-[#182947]'
              }`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{easyRead ? 'Large Type ON' : 'Easy Read'}</span>
            </button>

            <div
              role="group"
              aria-label={t(lang, 'languageLabel')}
              className="inline-flex items-center rounded-xl border border-white/12 bg-[#0C1322] p-1"
            >
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'en'
                    ? 'bg-[#38BDF8] text-[#0C1322]'
                    : 'text-[#9FB0C7] hover:text-[#E6EDF7]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'hi'
                    ? 'bg-[#38BDF8] text-[#0C1322]'
                    : 'text-[#9FB0C7] hover:text-[#E6EDF7]'
                }`}
              >
                हिन्दी
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#38BDF8]">
            <Users className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
            <span>{t(lang, 'samplePersonasLabel')}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SAMPLE_PERSONAS.map((persona) => (
              <button
                key={persona.id}
                type="button"
                onClick={() => onSelectPersona(persona)}
                className="flex min-h-[44px] flex-col items-start rounded-2xl border border-white/12 bg-[#0C1322]/80 p-4 text-left transition-colors hover:border-[#38BDF8] hover:bg-[#182947]"
              >
                <span className="text-sm font-bold text-[#E6EDF7]">
                  {lang === 'hi' ? persona.labelHi : persona.labelEn}
                </span>
                <span className="mt-1 text-xs text-[#9FB0C7] leading-snug">
                  {lang === 'hi' ? persona.descriptionHi : persona.descriptionEn}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3-Step Indicator Tabs */}
      <nav aria-label="Setup steps" className="grid grid-cols-3 gap-2.5">
        {([
          { id: 1 as const, label: t(lang, 'step1Title') },
          { id: 2 as const, label: t(lang, 'step2Title') },
          { id: 3 as const, label: t(lang, 'step3Title') },
        ]).map((s) => {
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={active ? 'step' : undefined}
              className={`min-h-[46px] rounded-2xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors sm:text-sm ${
                active
                  ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                  : 'border-white/12 bg-[#101A2C] text-[#E6EDF7] hover:bg-[#182947]'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Step Content Card */}
      <div className="obsidian-surface rounded-3xl p-6">
        {step === 1 && (() => {
          const cityVisual = getLocationVisualAsset(profile.location);
          return (
            <div className="space-y-6">
              {/* Visual Architectural Preview Banner */}
              <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#0C1322]">
                <img
                  src={cityVisual.imageUrl}
                  alt={lang === 'hi' ? cityVisual.altHi : cityVisual.altEn}
                  referrerPolicy="no-referrer"
                  className="h-44 w-full object-cover sm:h-52"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#070B12]/95 via-[#0C1322]/45 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 text-[#E6EDF7] sm:p-5">
                  <div>
                    <p className="font-mono-tabular text-[11px] font-medium text-[#38BDF8]">
                      {cityVisual.stationNetwork}
                    </p>
                    <p className="text-xl font-semibold tracking-tight font-display text-white">
                      {profile.location.name}, {profile.location.state}
                    </p>
                    <p className="text-xs text-[#E6EDF7]/85">
                      {lang === 'hi' ? cityVisual.landmarkHi : cityVisual.landmarkEn}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGeolocate}
                    disabled={isLocating}
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#38BDF8] px-3.5 py-2 text-xs font-bold text-[#0C1322] hover:bg-[#7DD3FC] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <LocateFixed className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" />
                    <span>{isLocating ? t(lang, 'locating') : t(lang, 'useMyLocation')}</span>
                  </button>
                </div>
              </div>

              {geoStatus ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-[#38BDF8]/25 bg-[#182947] px-3.5 py-2.5 text-xs text-[#E6EDF7]"
                >
                  {geoStatus}
                </p>
              ) : null}

              {/* City Search Autocomplete */}
              <div className="space-y-2">
                <label htmlFor="city-search-input" className="block text-sm font-semibold text-[#E6EDF7]">
                  {lang === 'hi'
                    ? 'शहर या क्षेत्र खोजें (दुनिया भर में या भारत में)'
                    : 'Search any city or neighborhood worldwide'}
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9FB0C7]"
                    aria-hidden="true"
                  />
                  <input
                    id="city-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t(lang, 'searchCityPlaceholder')}
                    className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] pl-10 pr-10 text-sm text-[#E6EDF7] placeholder:text-[#9FB0C7]/70 focus:border-[#38BDF8] focus:bg-[#142138] focus:outline-none"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setSearchResults([]);
                        setHasSearched(false);
                        setSearchError(null);
                      }}
                      aria-label={lang === 'hi' ? 'खोज साफ़ करें' : 'Clear search input'}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#9FB0C7] hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                {isSearching ? (
                  <p role="status" className="text-xs text-[#38BDF8]">
                    {lang === 'hi' ? 'दुनिया भर के स्थान खोजे जा रहे हैं...' : 'Searching worldwide locations...'}
                  </p>
                ) : null}
                {searchError ? (
                  <p role="alert" className="text-xs text-rose-300">
                    {searchError}
                  </p>
                ) : null}
                {!isSearching && !searchError && hasSearched && query.trim().length >= 2 && searchResults.length === 0 ? (
                  <p role="status" className="rounded-xl border border-white/10 bg-[#0C1322] px-3.5 py-2.5 text-xs text-[#9FB0C7]">
                    {lang === 'hi'
                      ? `"${query.trim()}" के लिए कोई शहर नहीं मिला। कोई अन्य वर्तनी आज़माएं।`
                      : `No cities found for "${query.trim()}". Try another city or spelling.`}
                  </p>
                ) : null}
                {searchResults.length > 0 ? (
                  <ul
                    aria-label="Matching worldwide cities"
                    className="divide-y divide-white/10 rounded-xl border border-white/12 bg-[#0C1322]"
                  >
                    {searchResults.map((city) => (
                      <li key={city.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChangeProfile({ ...profile, location: city });
                            setQuery('');
                            setSearchResults([]);
                            setHasSearched(false);
                          }}
                          className="flex w-full min-h-[44px] items-center justify-between px-4 py-2 text-left text-sm hover:bg-[#182947]"
                        >
                          <span className="font-medium text-[#E6EDF7]">
                            {city.name}, <span className="text-[#9FB0C7]">{city.state}</span>
                          </span>
                          <span className="text-xs font-mono-tabular text-[#38BDF8]">
                            {city.latitude.toFixed(2)}°, {city.longitude.toFixed(2)}°
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {/* Quick-Pick India & Global Cities */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#9FB0C7]">{t(lang, 'quickPickTitle')}</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PICK_CITIES.map((city) => {
                    const selected = profile.location.id === city.id;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => onChangeProfile({ ...profile, location: city })}
                        aria-pressed={selected}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                          selected
                            ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                            : 'border-white/12 bg-[#0C1322]/85 text-[#E6EDF7] hover:border-[#38BDF8]/60 hover:bg-[#182947]'
                        }`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" /> : null}
                        <span>{city.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  {GLOBAL_QUICK_PICK_CITIES.map((city) => {
                    const selected = profile.location.id === city.id;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => onChangeProfile({ ...profile, location: city })}
                        aria-pressed={selected}
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          selected
                            ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                            : 'border-white/12 bg-[#101A2C] text-[#E6EDF7] hover:border-[#38BDF8]/60 hover:bg-[#182947]'
                        }`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" /> : null}
                        <span>{city.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Map & 3D Globe Explorer */}
              <div className="border-t border-white/10 pt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowMapPicker((prev) => !prev)}
                  aria-expanded={showMapPicker}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/12 bg-[#0C1322] px-3.5 py-2 text-xs font-semibold text-[#E6EDF7] hover:border-[#38BDF8]/60 hover:bg-[#182947]"
                >
                  <Globe2 className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
                  <span>
                    {showMapPicker
                      ? lang === 'hi'
                        ? 'मानचित्र और 3D ग्लोब बंद करें'
                        : 'Hide Interactive World Map & 3D Globe'
                      : lang === 'hi'
                      ? 'विश्व मानचित्र और 3D ग्लोब पर स्थान देखें/चुनें'
                      : 'Explore on Interactive World Map & 3D Globe'}
                  </span>
                </button>

                {showMapPicker ? (
                  <LocationExplorer
                    selectedLocation={profile.location}
                    snapshot={null}
                    onSelectLocation={(loc) => onChangeProfile({ ...profile, location: loc })}
                    lang={lang}
                  />
                ) : null}
              </div>

              {/* Direct Grouped Dropdown */}
              <div className="space-y-2 border-t border-white/10 pt-4">
                <label htmlFor="all-monitored-select" className="block text-xs font-semibold text-[#9FB0C7]">
                  {lang === 'hi'
                    ? `या सभी ${ALL_MONITORED_CITIES.length} भारत व वैश्विक AQI-निगरानी शहरों में से चुनें`
                    : `Or choose directly from all ${ALL_MONITORED_CITIES.length} AQI-monitored India & global cities`}
                </label>
                <select
                  id="all-monitored-select"
                  value={ALL_MONITORED_CITIES.some((c) => c.id === profile.location.id) ? profile.location.id : ''}
                  onChange={(e) => {
                    const found = ALL_MONITORED_CITIES.find((c) => c.id === e.target.value);
                    if (found) onChangeProfile({ ...profile, location: found });
                  }}
                  className="w-full min-h-[42px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                >
                  <option value="" disabled>
                    {lang === 'hi' ? 'शहर चुनें...' : 'Select any monitored city...'}
                  </option>
                  <optgroup label={lang === 'hi' ? 'भारत (India)' : 'India'}>
                    {ALL_MONITORED_CITIES.filter((c) => c.countryGroup === 'India').map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}, {city.state} ({city.region})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={lang === 'hi' ? 'विश्व (Worldwide)' : 'Worldwide'}>
                    {ALL_MONITORED_CITIES.filter((c) => c.countryGroup === 'World').map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}, {city.state} ({city.region})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          );
        })()}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[#E6EDF7] font-display">
                {t(lang, 'householdQuestion')}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {memberOptions.map((item) => {
                  const checked = profile.members[item.key];
                  return (
                    <label
                      key={item.key}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                        checked
                          ? 'border-[#38BDF8] bg-[#182947] text-[#E6EDF7]'
                          : 'border-white/12 bg-[#0C1322]/85 text-[#9FB0C7] hover:bg-[#142138]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          onChangeProfile({
                            ...profile,
                            members: { ...profile.members, [item.key]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 rounded border-white/25 accent-[#38BDF8]"
                      />
                      <span className="font-medium text-[#E6EDF7]">{t(lang, item.labelKey)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 border-t border-white/10 pt-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="home-type-select" className="block text-sm font-semibold text-[#E6EDF7]">
                  {t(lang, 'homeTypeLabel')}
                </label>
                <select
                  id="home-type-select"
                  value={profile.homeType}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, homeType: e.target.value as HomeType })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                >
                  {homeTypes.map((ht) => (
                    <option key={ht.value} value={ht.value}>
                      {t(lang, ht.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="budget-select" className="block text-sm font-semibold text-[#E6EDF7]">
                  {t(lang, 'budgetLabel')}
                </label>
                <select
                  id="budget-select"
                  value={profile.budget}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, budget: e.target.value as BudgetTier })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                >
                  {budgets.map((b) => (
                    <option key={b.value} value={b.value}>
                      {t(lang, b.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-white/12 bg-[#0C1322]/85 px-3.5 py-2.5 text-sm hover:bg-[#182947]">
                <input
                  type="checkbox"
                  checked={profile.hasAirPurifier}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, hasAirPurifier: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-white/25 accent-[#38BDF8]"
                />
                <span className="font-medium text-[#E6EDF7]">{t(lang, 'hasPurifierLabel')}</span>
              </label>

              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-white/12 bg-[#0C1322]/85 px-3.5 py-2.5 text-sm hover:bg-[#182947]">
                <input
                  type="checkbox"
                  checked={profile.hasIndoorPlants}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, hasIndoorPlants: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-white/25 accent-[#38BDF8]"
                />
                <span className="font-medium text-[#E6EDF7]">{t(lang, 'hasPlantsLabel')}</span>
              </label>

              <div className="space-y-1">
                <label htmlFor="room-size-input" className="block text-xs font-semibold text-[#9FB0C7]">
                  {t(lang, 'roomSizeLabel')}
                </label>
                <input
                  id="room-size-input"
                  type="number"
                  min={60}
                  max={2000}
                  step={10}
                  value={profile.roomSizeSqFt}
                  onChange={(e) =>
                    onChangeProfile({
                      ...profile,
                      roomSizeSqFt: Math.max(60, Number(e.target.value) || 180),
                    })
                  }
                  className="w-full min-h-[40px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm font-mono-tabular text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[#E6EDF7] font-display">
                {t(lang, 'commuteModeLabel')}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {commuteModes.map((mode) => {
                  const selected = profile.commuteMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => onChangeProfile({ ...profile, commuteMode: mode.value })}
                      aria-pressed={selected}
                      className={`min-h-[44px] rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                        selected
                          ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                          : 'border-white/12 bg-[#0C1322] text-[#E6EDF7] hover:border-[#38BDF8]/60 hover:bg-[#182947]'
                      }`}
                    >
                      {t(lang, mode.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 border-t border-white/10 pt-5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="morning-hour" className="block text-sm font-semibold text-[#E6EDF7]">
                  {t(lang, 'morningLeaveLabel')}
                </label>
                <select
                  id="morning-hour"
                  value={profile.morningLeaveHour}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, morningLeaveHour: Number(e.target.value) })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm font-mono-tabular text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                >
                  {[5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                    <option key={h} value={h}>
                      {h === 12 ? '12:00 PM' : `${h}:00 AM`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="evening-hour" className="block text-sm font-semibold text-[#E6EDF7]">
                  {t(lang, 'eveningReturnLabel')}
                </label>
                <select
                  id="evening-hour"
                  value={profile.eveningReturnHour}
                  onChange={(e) =>
                    onChangeProfile({ ...profile, eveningReturnHour: Number(e.target.value) })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm font-mono-tabular text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                >
                  {[14, 15, 16, 17, 18, 19, 20, 21, 22].map((h) => (
                    <option key={h} value={h}>
                      {`${h - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="commute-distance" className="block text-sm font-semibold text-[#E6EDF7]">
                  {t(lang, 'distanceLabel')}
                </label>
                <input
                  id="commute-distance"
                  type="number"
                  min={0}
                  max={100}
                  value={profile.oneWayDistanceKm}
                  onChange={(e) =>
                    onChangeProfile({
                      ...profile,
                      oneWayDistanceKm: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-white/12 bg-[#0C1322] px-3 text-sm font-mono-tabular text-[#E6EDF7] focus:border-[#38BDF8] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step Footer Controls */}
        <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/12 bg-[#0C1322] px-4 py-2 text-sm font-semibold text-[#E6EDF7] hover:bg-[#182947]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t(lang, 'stepBack')}</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev === 1 ? 2 : 3))}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#38BDF8] px-5 py-2 text-sm font-bold text-[#0C1322] hover:bg-[#7DD3FC]"
            >
              <span>{t(lang, 'stepNext')}</span>
              <ArrowRight className="h-4 w-4 text-[#0C1322]" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#38BDF8] px-5 py-2.5 text-sm font-bold text-[#0C1322] hover:bg-[#7DD3FC]"
            >
              <span>{t(lang, 'stepFinish')}</span>
              <ArrowRight className="h-4 w-4 text-[#0C1322]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
