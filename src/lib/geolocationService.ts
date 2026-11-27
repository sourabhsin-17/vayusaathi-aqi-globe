import { ALL_MONITORED_CITIES } from './aqiCities';
import { getUsAqiLabel } from './cpcb';
import type {
  AirQualitySnapshot,
  HouseholdProfile,
  IndianLocation,
  Language,
} from '../types/vayu';

export type HealthWarningSeverity = 'sensitive' | 'elevated' | 'high' | 'critical';

export interface HealthWarningEvaluation {
  severity: HealthWarningSeverity;
  usAqi: number;
  pm25: number;
  whoMultiple: number;
  title: string;
  summary: string;
  immediateActions: string[];
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestMonitoredCity(
  lat: number,
  lon: number
): { city: IndianLocation; distanceKm: number } {
  let best = ALL_MONITORED_CITIES[0];
  let bestDist = Infinity;
  for (const city of ALL_MONITORED_CITIES) {
    const dist = haversineDistanceKm(lat, lon, city.latitude, city.longitude);
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return { city: best, distanceKm: Number(bestDist.toFixed(1)) };
}

export function formatCoordPair(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

export function buildFallbackCoordinateLocation(
  lat: number,
  lon: number,
  lang: Language,
  accuracyMeters?: number
): IndianLocation {
  const roundedLat = Number(lat.toFixed(4));
  const roundedLon = Number(lon.toFixed(4));
  const { city, distanceKm } = findNearestMonitoredCity(roundedLat, roundedLon);
  const coordText = formatCoordPair(roundedLat, roundedLon);

  const areaLabel =
    distanceKm <= 35
      ? lang === 'hi'
        ? `${city.name} के पास (${distanceKm} किमी)`
        : `Near ${city.name} (~${distanceKm} km)`
      : lang === 'hi'
      ? `मेरा GPS स्थान (${coordText})`
      : `GPS Location (${coordText})`;

  return {
    id: `geo-${roundedLat}-${roundedLon}`,
    name: areaLabel,
    state: distanceKm <= 35 ? `${city.state} · ${coordText}` : coordText,
    latitude: roundedLat,
    longitude: roundedLon,
    isCurrentLocation: true,
    exactAreaLabel: `${areaLabel}, ${city.state} (${coordText})`,
    accuracyMeters,
  };
}

export async function resolveExactLocationFromCoords(
  lat: number,
  lon: number,
  lang: Language,
  accuracyMeters?: number,
  externalSignal?: AbortSignal
): Promise<IndianLocation> {
  const roundedLat = Number(lat.toFixed(4));
  const roundedLon = Number(lon.toFixed(4));
  const fallback = buildFallbackCoordinateLocation(roundedLat, roundedLon, lang, accuracyMeters);

  const controller = new AbortController();
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      return fallback;
    }
    externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = globalThis.setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `/api/reverse-geocode?lat=${encodeURIComponent(roundedLat)}&lon=${encodeURIComponent(roundedLon)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return fallback;

    const json = (await res.json()) as {
      ok?: boolean;
      name?: string;
      state?: string;
      exactAreaLabel?: string;
    };
    if (!json?.ok || !json.name) return fallback;

    return {
      id: `geo-${roundedLat}-${roundedLon}`,
      name: json.name,
      state: json.state || fallback.state,
      latitude: roundedLat,
      longitude: roundedLon,
      isCurrentLocation: true,
      exactAreaLabel: json.exactAreaLabel || `${json.name}, ${json.state || ''}`.trim(),
      accuracyMeters,
    };
  } catch {
    return fallback;
  } finally {
    globalThis.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort);
    }
  }
}

export function evaluateHealthWarning(
  snapshot: AirQualitySnapshot | null,
  profile: HouseholdProfile,
  lang: Language
): HealthWarningEvaluation | null {
  if (!snapshot) return null;

  const usAqi = snapshot.current.usAqi;
  const pm25 = snapshot.current.pm25;
  const whoMultiple = snapshot.whoPm25Ratio ?? Number((pm25 / 15).toFixed(1));
  const area = snapshot.location.exactAreaLabel || `${snapshot.location.name}, ${snapshot.location.state}`;
  const isHi = lang === 'hi';

  const hasSensitiveMembers =
    profile.members.childrenUnder12 ||
    profile.members.elderly60Plus ||
    profile.members.respiratoryOrCardiacSensitive ||
    profile.members.outdoorWorkers;

  if (usAqi >= 201 || pm25 >= 125.5) {
    return {
      severity: 'critical',
      usAqi,
      pm25,
      whoMultiple,
      title: isHi
        ? `गंभीर स्वास्थ्य चेतावनी: ${snapshot.location.name} में हवा बहुत अस्वस्थ (US AQI ${usAqi})`
        : `Severe Health Warning: Very Unhealthy Air in ${snapshot.location.name} (US AQI ${usAqi})`,
      summary: isHi
        ? `${area} में PM2.5 ${pm25} µg/m³ है (WHO 24h सुरक्षित सीमा से ${whoMultiple}×)। सभी लोगों के लिए सांस, हृदय और गले में जलन का गंभीर जोखिम है।`
        : `Live air in ${area} is at ${pm25} µg/m³ PM2.5 (${whoMultiple}× the WHO 24h limit). Serious respiratory and cardiovascular risk for everyone.`,
      immediateActions: isHi
        ? [
            'सभी बाहरी व्यायाम, दौड़ और बच्चों का बाहर खेलना तुरंत रोकें।',
            'बाहरी खिड़कियां व दरवाजे बंद रखें और HEPA एयर प्यूरीफायर चलाएं।',
            'बाहर निकलना अनिवार्य हो तो अच्छी तरह फिट किया हुआ N95/FFP2 मास्क पहनें।',
          ]
        : [
            'Stop outdoor workouts, jogging, and outdoor play immediately.',
            'Keep windows and exterior doors closed; run a HEPA air purifier if available.',
            'Wear a tightly fitted N95/FFP2 respirator if stepping outdoors.',
          ],
    };
  }

  if (usAqi >= 151 || pm25 >= 55.5) {
    return {
      severity: 'high',
      usAqi,
      pm25,
      whoMultiple,
      title: isHi
        ? `स्वास्थ्य चेतावनी: ${snapshot.location.name} में अस्वस्थ हवा (US AQI ${usAqi})`
        : `Health Warning: Unhealthy Air Quality in ${snapshot.location.name} (US AQI ${usAqi})`,
      summary: isHi
        ? `${area} में PM2.5 ${pm25} µg/m³ (WHO सीमा से ${whoMultiple}×) है। लंबे समय तक बाहर रहने से स्वस्थ लोगों को भी सांस की तकलीफ हो सकती है।`
        : `PM2.5 in ${area} reached ${pm25} µg/m³ (${whoMultiple}× WHO limit). Prolonged outdoor exposure poses health risks to everyone, especially children and seniors.`,
      immediateActions: isHi
        ? [
            'बच्चों, बुजुर्गों और अस्थमा/हृदय रोगियों को घर के अंदर रखें।',
            `जरूरी काम केवल सबसे साफ समय (${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}) में करें।`,
            'ट्रैफिक के पास या बाहर निकलते समय N95/FFP2 मास्क का उपयोग करें।',
          ]
        : [
            'Keep children, older adults, and sensitive groups indoors.',
            `Reschedule essential errands to the cleanest window (${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}).`,
            'Use a snug N95/FFP2 mask when commuting or near traffic.',
          ],
    };
  }

  if (usAqi >= 101 || pm25 >= 35.5) {
    const label = getUsAqiLabel(usAqi);
    return {
      severity: 'elevated',
      usAqi,
      pm25,
      whoMultiple,
      title: isHi
        ? `वायु स्वास्थ्य चेतावनी: ${snapshot.location.name} — ${label.hi} (US AQI ${usAqi})`
        : `Air Health Alert: ${label.en} in ${snapshot.location.name} (US AQI ${usAqi})`,
      summary: isHi
        ? `${area} में हवा स्वास्थ्य मानक से ऊपर (PM2.5 ${pm25} µg/m³, WHO से ${whoMultiple}×) है। संवेदनशील लोगों व बाहरी व्यायाम करने वालों को सावधानी रखनी चाहिए।`
        : `${area} is above the healthy threshold at ${pm25} µg/m³ PM2.5 (${whoMultiple}× WHO limit). Sensitive groups and outdoor exercisers face elevated irritation risk.`,
      immediateActions: isHi
        ? [
            'कठिन बाहरी व्यायाम या व्यस्त सड़कों के पास दौड़ना कम करें।',
            'बच्चों, वरिष्ठ नागरिकों व अस्थमा रोगियों पर खांसी/सांस फूलने के लक्षण देखें।',
          ]
        : [
            'Reduce strenuous outdoor exertion and avoid exercising beside busy roads.',
            'Watch for coughing or wheezing in children, seniors, and asthma/heart patients.',
          ],
    };
  }

  if (usAqi >= 51 && hasSensitiveMembers) {
    return {
      severity: 'sensitive',
      usAqi,
      pm25,
      whoMultiple,
      title: isHi
        ? `संवेदनशील समूह सूचना: ${snapshot.location.name} (US AQI ${usAqi})`
        : `Sensitive-Group Caution in ${snapshot.location.name} (US AQI ${usAqi})`,
      summary: isHi
        ? `${area} में हवा मध्यम स्तर (PM2.5 ${pm25} µg/m³) पर है। आपके परिवार में संवेदनशील सदस्य होने के कारण भारी ट्रैफिक समय टालें।`
        : `Air in ${area} is Moderate (${pm25} µg/m³ PM2.5). Because your household includes sensitive members, avoid peak traffic hours (${snapshot.worstWindow.startLabel}–${snapshot.worstWindow.endLabel}).`,
      immediateActions: isHi
        ? [
            `बाहरी सैर या खेल सबसे साफ समय (${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}) में रखें।`,
            'दवाइयां/इनहेलर पास रखें और मुख्य सड़क से दूर पार्क चुनें।',
          ]
        : [
            `Prefer outdoor walks during ${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}.`,
            'Keep rescue inhalers handy and choose routes away from heavy traffic.',
          ],
    };
  }

  return null;
}

const sentNotificationKeys = new Set<string>();

export function clearSentHealthNotifications(): void {
  sentNotificationKeys.clear();
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestHealthNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserHealthNotification(
  warning: HealthWarningEvaluation,
  location: IndianLocation,
  lang: Language
): boolean {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const dedupeKey = `${location.id}_${warning.severity}`;
  if (sentNotificationKeys.has(dedupeKey)) {
    return false;
  }

  try {
    const areaText = location.exactAreaLabel || `${location.name}, ${location.state}`;
    const body =
      lang === 'hi'
        ? `${areaText} · US AQI ${warning.usAqi} · PM2.5 ${warning.pm25} µg/m³ (${warning.whoMultiple}× WHO)। ${warning.immediateActions[0] ?? ''}`
        : `${areaText} · US AQI ${warning.usAqi} · PM2.5 ${warning.pm25} µg/m³ (${warning.whoMultiple}× WHO). ${warning.immediateActions[0] ?? ''}`;

    new Notification(warning.title, {
      body,
      tag: `vayusaathi-health-${location.id}`,
    });
    sentNotificationKeys.add(dedupeKey);
    return true;
  } catch {
    return false;
  }
}
