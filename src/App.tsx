import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AlertTriangle, SlidersHorizontal, X } from 'lucide-react';
import { AskAssistant } from './components/AskAssistant';
import { AtmosphericDriftLayer } from './components/AtmosphericDriftLayer';
import { BriefingSlideDeck } from './components/BriefingSlideDeck';
import { CityAqiDirectory } from './components/CityAqiDirectory';
import { CityHeroCarousel } from './components/CityHeroCarousel';
import { DashboardSections } from './components/DashboardSections';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveGpsHealthBanner, type GpsSyncStatus } from './components/LiveGpsHealthBanner';
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
import {
  buildFallbackCoordinateLocation,
  evaluateHealthWarning,
  getNotificationPermissionState,
  requestHealthNotificationPermission,
  resolveExactLocationFromCoords,
  sendBrowserHealthNotification,
} from './lib/geolocationService';
import { t } from './lib/i18n';
import { DEFAULT_PROFILE, type SamplePersona } from './lib/personas';
import { fetchPersonalizedAdvisory } from './lib/recommendationService';
import { householdProfileSchema } from './lib/validators';
import type {
  AdvisoryResult,
  AirQualitySnapshot,
  HouseholdProfile,
  IndianLocation,
} from './types/vayu';

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
  const [view, setView] = useState<'setup' | 'dashboard'>('dashboard');
  const [easyRead, setEasyRead] = useState<boolean>(loadEasyReadPreference);

  const [snapshot, setSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [aqLoading, setAqLoading] = useState(false);
  const [aqError, setAqError] = useState<string | null>(null);

  const [advisoryResult, setAdvisoryResult] = useState<AdvisoryResult | null>(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [gpsStatus, setGpsStatus] = useState<GpsSyncStatus>(
    initial.profile.location.isCurrentLocation ? 'locked' : 'idle'
  );
  const [gpsStatusNote, setGpsStatusNote] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermissionState());
  const [warningDismissedKey, setWarningDismissedKey] = useState<string | null>(null);
  const [browserAlertSentKey, setBrowserAlertSentKey] = useState<string | null>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const geoAbortRef = useRef<AbortController | null>(null);
  const didAutoAttemptGpsRef = useRef(false);

  const lang = profile.language;

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      geoAbortRef.current?.abort();
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

  const detectAndLockGps = useCallback((isAutomatic: boolean) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable');
      setGpsStatusNote(
        profileRef.current.language === 'hi'
          ? 'इस डिवाइस में GPS उपलब्ध नहीं है — ऊपर से अपना शहर खोजें।'
          : 'Browser GPS is unavailable here — search or pick your city below.'
      );
      return;
    }

    setGpsStatus('locating');
    setGpsStatusNote(
      profileRef.current.language === 'hi'
        ? 'सटीक GPS क्षेत्र और लाइव AQI खोज रहे हैं...'
        : 'Pinpointing your exact GPS neighborhood and live AQI...'
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const currentLang = profileRef.current.language;
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const accuracy = Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : undefined;

        const immediateLocation = buildFallbackCoordinateLocation(
          lat,
          lon,
          currentLang,
          accuracy
        );

        setProfile((prev) => ({ ...prev, location: immediateLocation }));
        setGpsStatus('locked');
        setGpsStatusNote(
          currentLang === 'hi'
            ? 'GPS निर्देशांक मिल गए — सटीक मोहल्ला/क्षेत्र की पुष्टि की जा रही है...'
            : 'GPS coordinates locked — resolving your exact street & neighborhood...'
        );

        geoAbortRef.current?.abort();
        const controller = new AbortController();
        geoAbortRef.current = controller;

        void resolveExactLocationFromCoords(
          lat,
          lon,
          currentLang,
          accuracy,
          controller.signal
        ).then((resolvedLocation) => {
          if (controller.signal.aborted) return;
          if (profileRef.current.location.id !== immediateLocation.id) return;

          setProfile((prev) =>
            prev.location.id === immediateLocation.id
              ? { ...prev, location: resolvedLocation }
              : prev
          );
          setSnapshot((prev) =>
            prev && prev.location.id === immediateLocation.id
              ? { ...prev, location: resolvedLocation }
              : prev
          );
          setGpsStatusNote(null);
        });
      },
      (err) => {
        const currentLang = profileRef.current.language;
        const denied = err?.code === 1;
        setGpsStatus(denied ? 'denied' : 'unavailable');
        setGpsStatusNote(
          denied
            ? currentLang === 'hi'
              ? isAutomatic
                ? 'GPS अनुमति अस्वीकृत है। लाइव स्थान AQI के लिए "मेरा GPS स्थान लें" दबाएं या अपना शहर खोजें।'
                : 'GPS अनुमति अस्वीकृत है। कृपया ब्राउज़र साइट सेटिंग्स में लोकेशन चालू करें या शहर खोजें।'
              : isAutomatic
              ? 'Location permission is blocked. Click "Use My GPS" after enabling location, or search your city below.'
              : 'Location permission denied. Allow location access in browser settings or search your city below.'
            : currentLang === 'hi'
            ? 'GPS सिग्नल नहीं मिल सका। नीचे से अपना शहर चुनें या पुनः प्रयास करें।'
            : 'Could not acquire GPS fix right now. Retry GPS or pick your city below.'
        );
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }, []);

  // Automatically connect to GPS once when the app opens (never re-prompts if denied)
  useEffect(() => {
    if (didAutoAttemptGpsRef.current) return;
    didAutoAttemptGpsRef.current = true;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    const permQuery = navigator.permissions?.query;
    if (typeof permQuery === 'function') {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (status.state === 'denied') {
            setGpsStatus('denied');
            setGpsStatusNote(
              profileRef.current.language === 'hi'
                ? 'ब्राउज़र में GPS लोकेशन ब्लॉक है। क्षेत्र का लाइव AQI देखने के लिए शहर खोजें या अनुमति दें।'
                : 'Location access is blocked in your browser. Enable it or search your city to check local AQI.'
            );
            return;
          }
          detectAndLockGps(true);
        })
        .catch(() => {
          detectAndLockGps(true);
        });
    } else {
      detectAndLockGps(true);
    }
  }, [detectAndLockGps]);

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

        // Preserve any resolved exactAreaLabel / accuracyMeters on the active location
        const latestLoc =
          profileRef.current.location.id === liveSnapshot.location.id
            ? profileRef.current.location
            : liveSnapshot.location;

        const normalizedSnapshot: AirQualitySnapshot = {
          ...liveSnapshot,
          location: latestLoc,
        };

        setSnapshot(normalizedSnapshot);
        setAqLoading(false);

        setAdvisoryLoading(true);
        const advice = await fetchPersonalizedAdvisory(
          normalizedSnapshot,
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

  const healthWarning = useMemo(
    () => evaluateHealthWarning(snapshot, profile, lang),
    [snapshot, profile, lang]
  );

  const activeWarningKey =
    snapshot && healthWarning ? `${snapshot.location.id}_${healthWarning.severity}` : null;

  useEffect(() => {
    if (!snapshot || !healthWarning || !activeWarningKey) return;
    if (notificationPermission === 'granted') {
      const sent = sendBrowserHealthNotification(healthWarning, snapshot.location, lang);
      if (sent) {
        setBrowserAlertSentKey(activeWarningKey);
      }
    }
  }, [snapshot, healthWarning, activeWarningKey, notificationPermission, lang]);

  const handleEnableNotifications = useCallback(async () => {
    const result = await requestHealthNotificationPermission();
    setNotificationPermission(result);
    if (result === 'granted' && snapshotRef.current && healthWarning) {
      const sent = sendBrowserHealthNotification(
        healthWarning,
        snapshotRef.current.location,
        profileRef.current.language
      );
      if (sent && activeWarningKey) {
        setBrowserAlertSentKey(activeWarningKey);
      }
    }
  }, [healthWarning, activeWarningKey]);

  const handleSelectLocation = useCallback((loc: IndianLocation) => {
    geoAbortRef.current?.abort();
    setProfile((prev) => ({ ...prev, location: loc }));
    setGpsStatus(loc.isCurrentLocation ? 'locked' : 'manual');
    setGpsStatusNote(null);
  }, []);

  const handleSelectPersona = (persona: SamplePersona) => {
    geoAbortRef.current?.abort();
    const nextProfile: HouseholdProfile = {
      ...persona.profile,
      language: profile.language,
    };
    setProfile(nextProfile);
    setGpsStatus('manual');
    setGpsStatusNote(null);
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
