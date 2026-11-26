import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AlertTriangle, SlidersHorizontal, X } from 'lucide-react';
import { AskAssistant } from './components/AskAssistant';
import { AtmosphericDriftLayer } from './components/AtmosphericDriftLayer';
import { BriefingSlideDeck } from './components/BriefingSlideDeck';
import { CityAqiDirectory } from './components/CityAqiDirectory';
import { CityHeroCarousel } from './components/CityHeroCarousel';
import { DashboardSections } from './components/DashboardSections';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveOverviewCard } from './components/LiveOverviewCard';
import { LocationExplorer } from './components/LocationExplorer';
import { SetupWizard } from './components/SetupWizard';
import { WhatIfCalculator } from './components/WhatIfCalculator';
import {
  AUTO_REFRESH_INTERVAL_MS,
  fetchLiveAirAndWeather,
  getLastKnownSnapshot,
  LIVE_UNAVAILABLE_MESSAGE,
} from './lib/airQualityService';
import { t } from './lib/i18n';
import { DEFAULT_PROFILE, type SamplePersona } from './lib/personas';
import { fetchPersonalizedAdvisory } from './lib/recommendationService';
import { householdProfileSchema } from './lib/validators';
import type { AdvisoryResult, AirQualitySnapshot, HouseholdProfile } from './types/vayu';

const PROFILE_STORAGE_KEY = 'vayusaathi_profile_v1';
const EASY_READ_STORAGE_KEY = 'vayusaathi_easy_read_v1';

function isSameLocationTarget(
  a: AirQualitySnapshot['location'] | undefined | null,
  b: HouseholdProfile['location']
): boolean {
  if (!a) return false;
  if (a.id === b.id) return true;
  return (
    Math.abs(a.latitude - b.latitude) < 0.005 &&
    Math.abs(a.longitude - b.longitude) < 0.005
  );
}

function loadSavedProfile(): { profile: HouseholdProfile; hasSaved: boolean } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { profile: DEFAULT_PROFILE, hasSaved: false };
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { profile: DEFAULT_PROFILE, hasSaved: false };
    const parsed = householdProfileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return { profile: parsed.data, hasSaved: true };
    }
  } catch {
    // Fall back to default profile if storage is corrupted
  }
  return { profile: DEFAULT_PROFILE, hasSaved: false };
}

function loadEasyReadPreference(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(EASY_READ_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const initial = loadSavedProfile();
  const [profile, setProfile] = useState<HouseholdProfile>(initial.profile);
  const [view, setView] = useState<'setup' | 'dashboard'>(
    initial.hasSaved ? 'dashboard' : 'setup'
  );
  const [easyRead, setEasyRead] = useState<boolean>(loadEasyReadPreference);

  const [snapshot, setSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [aqLoading, setAqLoading] = useState(false);
  const [aqError, setAqError] = useState<string | null>(null);

  const [advisoryResult, setAdvisoryResult] = useState<AdvisoryResult | null>(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const lang = profile.language;

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore quota errors
    }
  }, [profile]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(EASY_READ_STORAGE_KEY, String(easyRead));
    } catch {
      // Ignore quota errors
    }
  }, [easyRead]);

  const loadTelemetryAndAdvisory = useCallback(
    async (targetProfile: HouseholdProfile, forceRefresh = false) => {
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Never allow a previous city's telemetry or advisory to bleed into a newly selected city
      if (!isSameLocationTarget(snapshotRef.current?.location, targetProfile.location)) {
        const cachedPrior = getLastKnownSnapshot(targetProfile.location);
        setSnapshot(cachedPrior);
        setAdvisoryResult(null);
      }

      setAqLoading(true);
      setAqError(null);
      try {
        const liveSnapshot = await fetchLiveAirAndWeather(targetProfile.location, {
          forceRefresh,
          signal: controller.signal,
        });
        if (seq !== requestSeqRef.current || controller.signal.aborted) return;

        setSnapshot(liveSnapshot);
        setAqLoading(false);

        setAdvisoryLoading(true);
        const advice = await fetchPersonalizedAdvisory(
          liveSnapshot,
          targetProfile,
          controller.signal
        );
        if (seq !== requestSeqRef.current || controller.signal.aborted) return;

        setAdvisoryResult(advice);
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeqRef.current) {
          return;
        }
        const detail = err instanceof Error ? err.message : '';
        const friendlyError =
          detail && detail !== LIVE_UNAVAILABLE_MESSAGE
            ? `${LIVE_UNAVAILABLE_MESSAGE} (${detail})`
            : LIVE_UNAVAILABLE_MESSAGE;
        setAqError(friendlyError);

        // Only keep an older reading if it strictly belongs to the currently selected city
        const currentSnap = snapshotRef.current;
        if (currentSnap && isSameLocationTarget(currentSnap.location, targetProfile.location)) {
          setSnapshot({ ...currentSnap, isStale: true });
        } else {
          setSnapshot(getLastKnownSnapshot(targetProfile.location));
        }
      } finally {
        if (seq === requestSeqRef.current) {
          setAqLoading(false);
          setAdvisoryLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (view === 'dashboard') {
      void loadTelemetryAndAdvisory(profile, false);
    }
  }, [
    view,
    profile.location.id,
    profile.location.latitude,
    profile.location.longitude,
    profile.language,
    loadTelemetryAndAdvisory,
  ]);

  // Automatic periodic multi-source verification every 5 minutes + on tab refocus
  useEffect(() => {
    if (view !== 'dashboard') return;

    const timer = window.setInterval(() => {
      void loadTelemetryAndAdvisory(profileRef.current, true);
    }, AUTO_REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const curSnapshot = snapshotRef.current;
      if (!curSnapshot) {
        void loadTelemetryAndAdvisory(profileRef.current, true);
        return;
      }
      const ageMs = Date.now() - Date.parse(curSnapshot.fetchedAtIso);
      if (!Number.isFinite(ageMs) || ageMs >= AUTO_REFRESH_INTERVAL_MS) {
        void loadTelemetryAndAdvisory(profileRef.current, true);
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [view, loadTelemetryAndAdvisory]);

  const handleSelectPersona = (persona: SamplePersona) => {
    const nextProfile: HouseholdProfile = {
      ...persona.profile,
      language: profile.language,
    };
    setProfile(nextProfile);
    setView('dashboard');
  };

  const handleCompleteSetup = () => {
    setView('dashboard');
    void loadTelemetryAndAdvisory(profile, false);
  };

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <div
          className={`relative min-h-screen overflow-x-hidden bg-[#06050E] bg-dot-grid section-electric-glow text-[#E6EDF7] flex flex-col ${
            easyRead ? 'easy-read' : ''
          }`}
        >
          <AtmosphericDriftLayer usAqi={snapshot?.current.usAqi} />
          {mapsQuotaExceeded ? (
            <div
              role="alert"
              className="sticky top-0 z-50 border-b border-amber-400/35 bg-[#1B1308]/95 px-4 py-2.5 text-xs text-amber-200 sm:px-6"
            >
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                  <span>
                    {lang === 'hi'
                      ? 'Google Maps उपयोग सीमा पूरी हो गई है। मुख्य वायु गुणवत्ता और 3D ग्लोब सुविधाएं सामान्य रूप से काम कर रही हैं।'
                      : 'Google Maps demo quota exceeded. Core air quality data and the 3D globe continue working.'}{' '}
                    <a
                      href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline text-[#67E8F9] hover:text-white"
                    >
                      {lang === 'hi' ? 'विवरण देखें' : 'Learn about Maps quota & billing'}
                    </a>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMapsQuotaExceeded(false)}
                  aria-label="Dismiss Maps quota notice"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-amber-300 hover:bg-white/10"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}

          {/* Strict 3-Zone Top Bar Contract + Accessible Mobile Nav Strip */}
          <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06050E]/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-6 sm:py-3.5">
              {/* Zone 1: Single clean wordmark */}
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xl font-bold tracking-tight text-[#E6EDF7] font-display whitespace-nowrap shrink-0"
              >
                VayuSaathi
              </a>

              {/* Zone 2: Concise single-line navigation links (Desktop) */}
              {view === 'dashboard' ? (
                <nav
                  aria-label="Dashboard sections"
                  className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A7A3C7]"
                >
                  <a href="#overview" className="hover:text-[#67E8F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                    {t(lang, 'navOverview')}
                  </a>
                  <a href="#briefing" className="hover:text-[#67E8F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                    {lang === 'hi' ? 'ब्रीफिंग डेक' : 'Briefing'}
                  </a>
                  <a href="#all-cities" className="hover:text-[#67E8F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                    {t(lang, 'navAllCities')}
                  </a>
                  <a href="#map-globe" className="hover:text-[#67E8F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                    {t(lang, 'navMapGlobe')}
                  </a>
                  <a href="#assistant" className="hover:text-[#67E8F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                    {t(lang, 'navAssistant')}
                  </a>
                </nav>
              ) : (
                <nav aria-label="Setup navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A7A3C7]">
                  <span className="whitespace-nowrap shrink-0">
                    {lang === 'hi'
                      ? 'वैश्विक और भारतीय वायु सुरक्षा सेटअप'
                      : 'Global & India Air-Safety Setup'}
                  </span>
                </nav>
              )}

              {/* Zone 3: Single primary CTA button */}
              {view === 'dashboard' ? (
                <button
                  type="button"
                  onClick={() => setView('setup')}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#67E8F9] px-4 py-2 text-xs font-bold text-[#0B0A16] hover:bg-[#9CE7E9] transition-colors whitespace-nowrap shrink-0"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t(lang, 'editSetup')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCompleteSetup}
                  className="inline-flex min-h-[40px] items-center rounded-xl bg-[#67E8F9] px-4 py-2 text-xs font-bold text-[#0B0A16] hover:bg-[#9CE7E9] transition-colors whitespace-nowrap shrink-0"
                >
                  {t(lang, 'viewDashboard')}
                </button>
              )}
            </div>

            {view === 'dashboard' ? (
              <nav
                aria-label="Mobile dashboard sections"
                className="flex md:hidden items-center gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-2 text-xs font-medium text-[#A7A3C7]"
              >
                {[
                  { href: '#overview', label: t(lang, 'navOverview') },
                  { href: '#briefing', label: lang === 'hi' ? 'ब्रीफिंग' : 'Briefing' },
                  { href: '#all-cities', label: t(lang, 'navAllCities') },
                  { href: '#map-globe', label: t(lang, 'navMapGlobe') },
                  { href: '#assistant', label: t(lang, 'navAssistant') },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-white/10 bg-[#0B0A16] px-3 py-1 text-[#E6EDF7] hover:border-[#67E8F9] hover:text-[#67E8F9] whitespace-nowrap shrink-0"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </header>

        <main id="top" className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {view === 'setup' ? (
            <SetupWizard
              profile={profile}
              easyRead={easyRead}
              onToggleEasyRead={() => setEasyRead((p) => !p)}
              onChangeProfile={setProfile}
              onComplete={handleCompleteSetup}
              onSelectPersona={handleSelectPersona}
            />
          ) : (
            <div className="space-y-8">
              {/* HERO CITY PHOTO SLIDESHOW & GLOBAL COMMAND PANEL */}
              <CityHeroCarousel
                profile={profile}
                snapshot={snapshot}
                loading={aqLoading}
                easyRead={easyRead}
                onToggleEasyRead={() => setEasyRead((p) => !p)}
                onSelectLocation={(loc) =>
                  setProfile((prev) => ({ ...prev, location: loc }))
                }
                onSelectPersona={handleSelectPersona}
                onChangeLanguage={(nextLang) =>
                  setProfile((prev) => ({ ...prev, language: nextLang }))
                }
                onRefresh={() => void loadTelemetryAndAdvisory(profile, true)}
              />

              {/* 01. LIVE AIR QUALITY OVERVIEW & PLAIN ALL-AGES VERDICT */}
              <LiveOverviewCard
                snapshot={snapshot}
                loading={aqLoading}
                error={aqError}
                onRetry={() => void loadTelemetryAndAdvisory(profile, true)}
                onRefresh={() => void loadTelemetryAndAdvisory(profile, true)}
                lang={lang}
              />

              {/* NON-LINEAR INTERACTIVE DAILY BRIEFING DECK */}
              {snapshot ? (
                <BriefingSlideDeck
                  snapshot={snapshot}
                  advisoryResult={advisoryResult}
                  profile={profile}
                />
              ) : null}

              {/* 02. WORLDWIDE & INDIA 125+ CITIES DIRECTORY */}
              <CityAqiDirectory
                selectedLocation={profile.location}
                onSelectLocation={(loc) =>
                  setProfile((prev) => ({ ...prev, location: loc }))
                }
                lang={lang}
              />

              {/* 03. INTERACTIVE WORLDWIDE GOOGLE MAP & PLAYABLE 3D EARTH GLOBE */}
              <LocationExplorer
                selectedLocation={profile.location}
                snapshot={snapshot}
                onSelectLocation={(loc) =>
                  setProfile((prev) => ({ ...prev, location: loc }))
                }
                lang={lang}
              />

              {/* 04–08. TOP 3 ACTIONS, DAILY PLANNER, SUSTAINABLE ALTERNATIVES, INDOOR & FAMILY */}
              {snapshot ? (
                <DashboardSections
                  advisoryResult={advisoryResult}
                  advisoryLoading={advisoryLoading}
                  profile={profile}
                />
              ) : null}

              {/* 09. WHAT-IF IMPACT CALCULATOR */}
              {snapshot ? <WhatIfCalculator snapshot={snapshot} profile={profile} /> : null}

              {/* 10. ASK THE ASSISTANT */}
              {snapshot ? <AskAssistant snapshot={snapshot} profile={profile} /> : null}
            </div>
          )}
        </main>

        <footer className="relative z-10 border-t border-white/10 bg-[#0B0A16]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-[#A7A3C7] sm:px-6">
            <span>
              <strong className="font-display text-[#E6EDF7]">VayuSaathi</strong> · {t(lang, 'generalGuidanceNote')}
            </span>
            <span>
              Live global & Indian air quality via Open-Meteo (CAMS/ECMWF) · No indoor sensor connected
            </span>
          </div>
        </footer>
        </div>
      </MotionConfig>
    </ErrorBoundary>
  );
}
