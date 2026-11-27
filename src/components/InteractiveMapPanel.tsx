import { useCallback, useEffect, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Crosshair, Layers, LocateFixed, MapPin } from 'lucide-react';
import { ALL_MONITORED_CITIES } from '../lib/aqiCities';
import type { AirQualitySnapshot, IndianLocation, Language } from '../types/vayu';

interface InteractiveMapPanelProps {
  selectedLocation: IndianLocation;
  snapshot: AirQualitySnapshot | null;
  onSelectLocation: (loc: IndianLocation) => void;
  onDetectGps: () => void;
  isLocating: boolean;
  lang: Language;
}

type MapTypeOption = 'roadmap' | 'hybrid' | 'satellite' | 'terrain';

const CONTINENT_VIEWS = [
  { id: 'india', labelEn: 'India', labelHi: 'भारत', lat: 21.5, lng: 78.9, zoom: 5 },
  { id: 'asia', labelEn: 'Asia-Pacific', labelHi: 'एशिया', lat: 25.0, lng: 112.0, zoom: 3 },
  { id: 'europe', labelEn: 'Europe', labelHi: 'यूरोप', lat: 49.5, lng: 10.5, zoom: 4 },
  { id: 'americas', labelEn: 'Americas', labelHi: 'अमेरिका', lat: 20.0, lng: -82.0, zoom: 3 },
  { id: 'mena', labelEn: 'Africa / ME', labelHi: 'अफ्रीका/मध्य पूर्व', lat: 12.0, lng: 32.0, zoom: 3 },
  { id: 'oceania', labelEn: 'Oceania', labelHi: 'ओशिनिया', lat: -29.0, lng: 148.0, zoom: 4 },
];

function MapCameraSync({
  location,
  recenterTrigger,
  continentTarget,
}: {
  location: IndianLocation;
  recenterTrigger: number;
  continentTarget: { lat: number; lng: number; zoom: number; seq: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo({ lat: location.latitude, lng: location.longitude });
    const currentZoom = map.getZoom();
    if (currentZoom !== undefined && currentZoom < 7) {
      map.setZoom(10);
    }
  }, [map, location.latitude, location.longitude, recenterTrigger]);

  useEffect(() => {
    if (!map || !continentTarget) return;
    map.panTo({ lat: continentTarget.lat, lng: continentTarget.lng });
    map.setZoom(continentTarget.zoom);
  }, [map, continentTarget]);

  return null;
}

function ActiveLocationMarker({
  location,
  snapshot,
  lang,
}: {
  location: IndianLocation;
  snapshot: AirQualitySnapshot | null;
  lang: Language;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(true);
  const ns = location.latitude >= 0 ? 'N' : 'S';
  const ew = location.longitude >= 0 ? 'E' : 'W';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: location.latitude, lng: location.longitude }}
        onClick={() => setOpen((prev) => !prev)}
        title={`${location.name} (${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)})`}
      >
        <Pin
          background="#182947"
          borderColor="#38BDF8"
          glyphColor="#38BDF8"
          scale={1.25}
        />
      </AdvancedMarker>
      {open && marker ? (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={250}>
          <div className="space-y-1 p-0.5 text-stone-900">
            <p className="text-xs font-bold">{location.name}</p>
            <p className="text-[11px] text-stone-600">{location.state}</p>
            {snapshot && snapshot.location.id === location.id ? (
              <p className="text-[11px] font-semibold text-[#182947] font-mono-tabular">
                US AQI {snapshot.current.usAqi} · PM2.5 {snapshot.current.pm25} µg/m³
              </p>
            ) : (
              <p className="text-[11px] text-stone-500 font-mono-tabular">
                {Math.abs(location.latitude).toFixed(2)}°{ns}, {Math.abs(location.longitude).toFixed(2)}°{ew}
              </p>
            )}
            <p className="text-[10px] text-stone-500">
              {lang === 'hi' ? 'दुनिया में कहीं भी क्लिक करें' : 'Click anywhere worldwide to inspect'}
            </p>
          </div>
        </InfoWindow>
      ) : null}
    </>
  );
}

function CityQuickPin({
  city,
  isSelected,
  onSelect,
}: {
  city: IndianLocation;
  isSelected: boolean;
  onSelect: (loc: IndianLocation) => void;
}) {
  if (isSelected) return null;
  return (
    <AdvancedMarker
      position={{ lat: city.latitude, lng: city.longitude }}
      onClick={() => onSelect(city)}
      title={`${city.name}, ${city.state}`}
    >
      <Pin
        background="#334155"
        borderColor="#0f172a"
        glyphColor="#f8fafc"
        scale={0.72}
      />
    </AdvancedMarker>
  );
}

function MapStatusOverlay({ lang }: { lang: Language }) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div
        role="alert"
        className="absolute inset-0 z-10 flex items-center justify-center bg-[#070B12]/95 p-6 text-center"
      >
        <div className="max-w-md space-y-2">
          <MapPin className="mx-auto h-6 w-6 text-amber-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#E6EDF7]">
            {lang === 'hi'
              ? 'Google Maps लोड नहीं हो सका'
              : 'Unable to load Google Maps'}
          </p>
          <p className="text-xs text-[#9FB0C7]">
            {lang === 'hi'
              ? 'कृपया API कुंजी या कोटा स्थिति जांचें। आप अभी भी 3D ग्लोब का उपयोग कर सकते हैं।'
              : 'Please verify your Google Maps key or quota status. You can continue using the 3D Interactive Globe.'}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

export function InteractiveMapPanel({
  selectedLocation,
  snapshot,
  onSelectLocation,
  onDetectGps,
  isLocating,
  lang,
}: InteractiveMapPanelProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [mapTypeId, setMapTypeId] = useState<MapTypeOption>('roadmap');
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [continentTarget, setContinentTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    seq: number;
  } | null>(null);

  const handleMapClick = useCallback(
    (ev: { detail: { latLng?: { lat: number; lng: number } | null } }) => {
      const latLng = ev.detail.latLng;
      if (!latLng) return;
      const lat = Number(latLng.lat.toFixed(4));
      const lng = Number(latLng.lng.toFixed(4));
      const ns = lat >= 0 ? 'N' : 'S';
      const ew = lng >= 0 ? 'E' : 'W';
      onSelectLocation({
        id: `pin-${lat}-${lng}`,
        name: lang === 'hi' ? 'चयनित मानचित्र स्थान' : 'Selected Map Pin',
        state: `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`,
        latitude: lat,
        longitude: lng,
      });
    },
    [lang, onSelectLocation]
  );

  if (!apiKey) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-xl border border-white/12 bg-[#0C1322] p-6 text-center">
        <div className="max-w-md space-y-2">
          <MapPin className="mx-auto h-6 w-6 text-[#38BDF8]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#E6EDF7]">
            {lang === 'hi'
              ? 'Google Maps API कुंजी उपलब्ध नहीं है'
              : 'Google Maps API key not configured'}
          </p>
          <p className="text-xs text-[#9FB0C7]">
            {lang === 'hi'
              ? 'इंटरैक्टिव Google मानचित्र देखने के लिए Google Maps सेटअप पूरा करें।'
              : 'Complete Google Maps setup to view the scrollable street & satellite map.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Map Layer & Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#9FB0C7] mr-1">
            <Layers className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
            <span>{lang === 'hi' ? 'दृश्य:' : 'Layer:'}</span>
          </span>
          {(['roadmap', 'hybrid', 'satellite', 'terrain'] as MapTypeOption[]).map((mt) => (
            <button
              key={mt}
              type="button"
              onClick={() => setMapTypeId(mt)}
              aria-pressed={mapTypeId === mt}
              className={`min-h-[32px] rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                mapTypeId === mt
                  ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322] font-semibold'
                  : 'border-white/12 bg-[#0C1322] text-[#E6EDF7] hover:bg-[#182947]'
              }`}
            >
              {mt}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRecenterTrigger((n) => n + 1)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0C1322] px-3 py-1.5 text-xs font-semibold text-[#E6EDF7] hover:bg-[#182947] whitespace-nowrap shrink-0"
          >
            <Crosshair className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
            <span>{lang === 'hi' ? 'केंद्रित करें' : 'Center Pin'}</span>
          </button>
          <button
            type="button"
            onClick={onDetectGps}
            disabled={isLocating}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#38BDF8] px-3 py-1.5 text-xs font-semibold text-[#0C1322] hover:bg-[#7DD3FC] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <LocateFixed className="h-3.5 w-3.5 text-[#0C1322]" aria-hidden="true" />
            <span>
              {isLocating
                ? lang === 'hi'
                  ? 'खोज रहा है...'
                  : 'Locating...'
                : lang === 'hi'
                ? 'मेरा स्थान'
                : 'My Location'}
            </span>
          </button>
        </div>
      </div>

      {/* World Region Quick-Jump Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-[#9FB0C7] mr-1">
          {lang === 'hi' ? 'क्षेत्र देखें:' : 'Fly map to:'}
        </span>
        {CONTINENT_VIEWS.map((cv) => (
          <button
            key={cv.id}
            type="button"
            onClick={() =>
              setContinentTarget((prev) => ({
                lat: cv.lat,
                lng: cv.lng,
                zoom: cv.zoom,
                seq: (prev?.seq ?? 0) + 1,
              }))
            }
            className="min-h-[28px] rounded border border-white/12 bg-[#0C1322] px-2 py-0.5 text-[11px] font-medium text-[#E6EDF7] hover:border-[#38BDF8] hover:bg-[#182947] whitespace-nowrap shrink-0"
          >
            {lang === 'hi' ? cv.labelHi : cv.labelEn}
          </button>
        ))}
      </div>

      {/* Scrollable Worldwide Interactive Google Map */}
      <div className="relative h-[440px] w-full overflow-hidden rounded-xl border border-white/15 bg-[#070B12]">
        <APIProvider
          apiKey={apiKey}
          libraries={['marker']}
          language={lang}
        >
          <MapStatusOverlay lang={lang} />
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={{
              lat: selectedLocation.latitude,
              lng: selectedLocation.longitude,
            }}
            defaultZoom={10}
            mapTypeId={mapTypeId}
            gestureHandling="greedy"
            onClick={handleMapClick}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapCameraSync
              location={selectedLocation}
              recenterTrigger={recenterTrigger}
              continentTarget={continentTarget}
            />
            <ActiveLocationMarker
              location={selectedLocation}
              snapshot={snapshot}
              lang={lang}
            />
            {ALL_MONITORED_CITIES.map((city) => (
              <CityQuickPin
                key={city.id}
                city={city}
                isSelected={city.id === selectedLocation.id}
                onSelect={onSelectLocation}
              />
            ))}
          </GoogleMap>
        </APIProvider>
      </div>

      <p className="text-xs text-[#9FB0C7]">
        {lang === 'hi'
          ? 'माउस व्हील या दो उंगलियों से ज़ूम करें, खींचकर दुनिया भर में स्क्रॉल करें, या किसी भी बिंदु पर क्लिक करके वहां का लाइव डेटा देखें।'
          : `Scroll to zoom, drag across the globe, or click any of the ${ALL_MONITORED_CITIES.length} pins (or any spot on Earth) for live air quality.`}
      </p>
    </div>
  );
}
