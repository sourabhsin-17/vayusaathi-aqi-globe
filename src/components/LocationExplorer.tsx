import { Suspense, lazy, useState } from 'react';
import { Columns2, Compass, Globe2, LocateFixed, MapPin } from 'lucide-react';
import { ALL_MONITORED_CITIES } from '../lib/aqiCities';
import { ErrorBoundary } from './ErrorBoundary';
import { InteractiveMapPanel } from './InteractiveMapPanel';
import type { AirQualitySnapshot, IndianLocation, Language } from '../types/vayu';

const LazyInteractiveGlobe = lazy(() =>
  import('./InteractiveGlobe').then((mod) => ({ default: mod.InteractiveGlobe }))
);

interface LocationExplorerProps {
  selectedLocation: IndianLocation;
  snapshot: AirQualitySnapshot | null;
  onSelectLocation: (loc: IndianLocation) => void;
  lang: Language;
  defaultMode?: 'split' | 'map' | 'globe';
}

type ExplorerMode = 'split' | 'map' | 'globe';

const AIRSHED_SHOWCASE: Array<{
  cityId: string;
  tagEn: string;
  tagHi: string;
}> = [
  { cityId: 'in-delhi', tagEn: 'Gangetic Basin · Delhi', tagHi: 'गंगा बेसिन · दिल्ली' },
  { cityId: 'in-chennai', tagEn: 'Coastal Breeze · Chennai', tagHi: 'तटीय हवा · चेन्नई' },
  { cityId: 'gl-zurich', tagEn: 'Alpine Clean · Zurich', tagHi: 'आल्प्स · ज्यूरिख' },
  { cityId: 'gl-london', tagEn: 'Atlantic Hub · London', tagHi: 'लंदन' },
  { cityId: 'gl-tokyo', tagEn: 'Pacific Bay · Tokyo', tagHi: 'टोक्यो' },
  { cityId: 'gl-san-francisco', tagEn: 'Bay Breeze · San Francisco', tagHi: 'सैन फ्रांसिस्को' },
];

export function LocationExplorer({
  selectedLocation,
  snapshot,
  onSelectLocation,
  lang,
  defaultMode = 'split',
}: LocationExplorerProps) {
  const [mode, setMode] = useState<ExplorerMode>(defaultMode);
  const [isLocating, setIsLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const handleDetectGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus(
        lang === 'hi'
          ? 'आपके ब्राउज़र में GPS स्थान उपलब्ध नहीं है। मानचित्र या ग्लोब पर क्लिक करके स्थान चुनें।'
          : 'Browser geolocation is not supported here. Click anywhere on the map or 3D globe to select a spot.'
      );
      return;
    }

    setIsLocating(true);
    setGeoStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const inIndia = lat >= 5 && lat <= 38 && lon >= 65 && lon <= 98;
        const ns = lat >= 0 ? 'N' : 'S';
        const ew = lon >= 0 ? 'E' : 'W';
        onSelectLocation({
          id: `geo-${lat}-${lon}`,
          name: lang === 'hi' ? 'मेरा वर्तमान स्थान' : 'My Current Location',
          state: inIndia
            ? `India (${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew})`
            : `GPS (${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew})`,
          latitude: lat,
          longitude: lon,
          isCurrentLocation: true,
        });
        setIsLocating(false);
        setGeoStatus(
          lang === 'hi'
            ? `लाइव GPS स्थान (${lat.toFixed(2)}°, ${lon.toFixed(2)}°) मानचित्र और ग्लोब पर पिन किया गया।`
            : `Live GPS coordinates (${lat.toFixed(2)}°, ${lon.toFixed(2)}°) pinned on the map and globe.`
        );
      },
      () => {
        setIsLocating(false);
        setGeoStatus(
          lang === 'hi'
            ? 'GPS अनुमति अस्वीकृत या अनुपलब्ध है। आप मानचित्र या ग्लोब पर कहीं भी क्लिक कर सकते हैं।'
            : 'Location permission denied or unavailable. Click anywhere on the map or spin the 3D globe to choose a location.'
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  return (
    <section
      id="map-globe"
      aria-labelledby="map-globe-heading"
      className="obsidian-surface rounded-3xl p-5 sm:p-7"
    >
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#67E8F9]">
            03. {lang === 'hi' ? 'मानचित्र और ग्लोब एक्सप्लोरर' : 'Interactive Spatial Explorer'}
          </p>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-[#67E8F9]" aria-hidden="true" />
            <h2
              id="map-globe-heading"
              className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display"
            >
              {lang === 'hi'
                ? 'विश्व और भारत मानचित्र व 3D पृथ्वी ग्लोब'
                : 'Global Street Map & Playable 3D Earth Globe'}
            </h2>
          </div>
          <p className="text-xs text-[#A7A3C7]">
            {lang === 'hi'
              ? 'अपने मोहल्ले या दुनिया के किसी भी देश को देखने के लिए मानचित्र स्क्रॉल करें, या 3D ग्लोब घुमाएं और क्लिक करें।'
              : 'Scroll Google Maps down to any neighborhood worldwide, or spin Earth and click contrasting airshed hubs.'}
          </p>
          <p className="text-xs font-medium text-[#E6EDF7] font-mono-tabular">
            {selectedLocation.name} · {selectedLocation.state} ({selectedLocation.latitude.toFixed(3)}°,{' '}
            {selectedLocation.longitude.toFixed(3)}°)
            {snapshot ? (
              <span className="ml-2 text-[#5DCAA5] font-semibold">
                · US AQI {snapshot.current.usAqi} · PM2.5 {snapshot.current.pm25} µg/m³
              </span>
            ) : null}
          </p>
        </div>

        {/* View Mode Switcher + GPS Trigger */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label={lang === 'hi' ? 'मानचित्र और ग्लोब दृश्य मोड' : 'Map and globe view mode'}
            className="inline-flex items-center rounded-xl border border-white/12 bg-[#0B0A16] p-1"
          >
            <button
              type="button"
              onClick={() => setMode('split')}
              aria-pressed={mode === 'split'}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                mode === 'split'
                  ? 'bg-[#67E8F9] text-[#0B0A16]'
                  : 'text-[#A7A3C7] hover:text-[#E6EDF7]'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{lang === 'hi' ? 'दोनों देखें' : 'Split View'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('map')}
              aria-pressed={mode === 'map'}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                mode === 'map'
                  ? 'bg-[#67E8F9] text-[#0B0A16]'
                  : 'text-[#A7A3C7] hover:text-[#E6EDF7]'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{lang === 'hi' ? 'मानचित्र' : 'Scrollable Map'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('globe')}
              aria-pressed={mode === 'globe'}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                mode === 'globe'
                  ? 'bg-[#67E8F9] text-[#0B0A16]'
                  : 'text-[#A7A3C7] hover:text-[#E6EDF7]'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{lang === 'hi' ? '3D ग्लोब' : '3D Globe'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleDetectGps}
            disabled={isLocating}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#0B0A16] px-3 py-1.5 text-xs font-semibold text-[#E6EDF7] hover:border-[#67E8F9] hover:bg-[#14163F] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <LocateFixed className="h-3.5 w-3.5 text-[#67E8F9]" aria-hidden="true" />
            <span>
              {isLocating
                ? lang === 'hi'
                  ? 'खोज रहा है...'
                  : 'Locating...'
                : lang === 'hi'
                ? 'मेरा स्थान उपयोग करें'
                : 'Use My Location'}
            </span>
          </button>
        </div>
      </div>

      {/* Synced Airshed Flight Comparison Bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-[#0B0A16]/80 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#67E8F9] mr-1">
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{lang === 'hi' ? 'वायु-क्षेत्र उड़ान तुलना:' : 'Fly & compare airsheds:'}</span>
        </span>
        {AIRSHED_SHOWCASE.map((item) => {
          const city = ALL_MONITORED_CITIES.find((c) => c.id === item.cityId);
          if (!city) return null;
          const active = selectedLocation.id === city.id;
          return (
            <button
              key={city.id}
              type="button"
              onClick={() => onSelectLocation(city)}
              aria-pressed={active}
              className={`min-h-[30px] rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-[#67E8F9] bg-[#67E8F9] text-[#0B0A16] font-semibold'
                  : 'border-white/10 bg-[#0F0D22] text-[#E6EDF7] hover:border-[#67E8F9]/60 hover:bg-[#14163F]'
              }`}
            >
              {lang === 'hi' ? item.tagHi : item.tagEn}
            </button>
          );
        })}
      </div>

      {geoStatus ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-white/12 bg-[#0B0A16] px-3.5 py-2 text-xs text-[#E6EDF7]"
        >
          {geoStatus}
        </p>
      ) : null}

      <div
        className={`mt-5 grid grid-cols-1 gap-5 ${
          mode === 'split' ? 'lg:grid-cols-2 lg:items-start' : ''
        }`}
      >
        {mode === 'split' || mode === 'map' ? (
          <div className="min-w-0">
            <InteractiveMapPanel
              selectedLocation={selectedLocation}
              snapshot={snapshot}
              onSelectLocation={onSelectLocation}
              onDetectGps={handleDetectGps}
              isLocating={isLocating}
              lang={lang}
            />
          </div>
        ) : null}

        {mode === 'split' || mode === 'globe' ? (
          <div className="min-w-0">
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex h-[360px] sm:h-[460px] items-center justify-center rounded-xl border border-white/15 bg-[#06050E] text-xs font-medium text-[#A7A3C7]">
                    {lang === 'hi' ? '3D ग्लोब लोड हो रहा है...' : 'Loading playable 3D Earth globe...'}
                  </div>
                }
              >
                <LazyInteractiveGlobe
                  selectedLocation={selectedLocation}
                  snapshot={snapshot}
                  onSelectLocation={onSelectLocation}
                  onDetectGps={handleDetectGps}
                  isLocating={isLocating}
                  lang={lang}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </div>
    </section>
  );
}

