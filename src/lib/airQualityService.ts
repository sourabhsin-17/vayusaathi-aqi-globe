import { computeUsAqiFromPm25, estimateCpcbFromPm, getDominantPollutantName } from './cpcb';
import {
  openMeteoAirQualitySchema,
  openMeteoGeocodingSchema,
  openMeteoWeatherSchema,
  sensorCommunityListSchema,
} from './validators';
import type {
  AirQualitySnapshot,
  AqiVerificationReport,
  CpcbEvaluation,
  GroundSensorCrossCheck,
  HourlyForecastPoint,
  IndianLocation,
  Language,
  PollutantReadings,
  TimeWindowSummary,
} from '../types/vayu';

export const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_MS = AUTO_REFRESH_INTERVAL_MS;
const MAX_OLDER_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max age for labeled fallback
const CACHE_PREFIX = 'vayusaathi_aq_cache_v3_';
const DEFAULT_FETCH_TIMEOUT_MS = 10000;

interface CacheEntry {
  cachedAtMs: number;
  snapshot: AirQualitySnapshot;
}

const memoryCache = new Map<string, CacheEntry>();

export const DATA_SOURCE_NAME = 'Open-Meteo Air Quality & Weather API (CAMS/ECMWF nearest grid)';

export const LIVE_UNAVAILABLE_MESSAGE = 'Live air quality data is temporarily unavailable.';

function getCacheKey(lat: number, lon: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function readCacheEntry(lat: number, lon: number): CacheEntry | null {
  const key = getCacheKey(lat, lon);
  const mem = memoryCache.get(key);
  if (mem) return mem;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry;
        if (parsed && typeof parsed.cachedAtMs === 'number' && parsed.snapshot?.current) {
          memoryCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }
  return null;
}

function readCachedSnapshot(lat: number, lon: number): AirQualitySnapshot | null {
  const entry = readCacheEntry(lat, lon);
  if (!entry) return null;
  if (Date.now() - entry.cachedAtMs < CACHE_TTL_MS) {
    return { ...entry.snapshot, fromCache: true, isStale: false };
  }
  return null;
}

/**
 * Returns a previously successful cached reading ONLY for matching coordinates.
 * Used strictly as an explicitly labeled older-reading fallback when live API calls fail.
 */
export function getLastKnownSnapshot(location: IndianLocation): AirQualitySnapshot | null {
  const entry = readCacheEntry(location.latitude, location.longitude);
  if (!entry) return null;
  if (Date.now() - entry.cachedAtMs > MAX_OLDER_SNAPSHOT_AGE_MS) {
    return null;
  }
  return {
    ...entry.snapshot,
    location,
    fromCache: true,
    isStale: true,
  };
}

function writeCachedSnapshot(lat: number, lon: number, snapshot: AirQualitySnapshot): void {
  const key = getCacheKey(lat, lon);
  const entry: CacheEntry = {
    cachedAtMs: Date.now(),
    snapshot: { ...snapshot, fromCache: false, isStale: false },
  };
  memoryCache.set(key, entry);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function clearAirQualityCache(): void {
  memoryCache.clear();
  batchCityCache.clear();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Ignore storage errors
    }
  }
}

function linkAbortSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Request timed out'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

async function fetchJsonWithTimeout(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal; label: string }
): Promise<unknown> {
  const { signal, cleanup, didTimeout } = linkAbortSignals(
    options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    options.signal
  );

  try {
    const res = await fetch(url, { signal });
    if (res.status === 429) {
      throw new Error(`${options.label} rate limit reached. Please retry in a moment.`);
    }
    if (!res.ok) {
      throw new Error(`${options.label} failed (HTTP ${res.status}).`);
    }

    try {
      return (await res.json()) as unknown;
    } catch {
      throw new Error(`${options.label} returned malformed JSON.`);
    }
  } catch (err) {
    if (didTimeout()) {
      throw new Error(`${options.label} timed out. Please retry.`);
    }
    throw err;
  } finally {
    cleanup();
  }
}

function sanitizeNullableNonNegative(val: number | null | undefined, maxVal: number, decimals = 1): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  if (val < 0 || val > maxVal) return null;
  return decimals === 0 ? Math.round(val) : Number(val.toFixed(decimals));
}

export async function searchIndianCities(
  query: string,
  options?: { scope?: 'all' | 'india'; signal?: AbortSignal }
): Promise<IndianLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '14');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const rawJson = await fetchJsonWithTimeout(url.toString(), {
    timeoutMs: 8000,
    signal: options?.signal,
    label: 'City search',
  });

  const parsed = openMeteoGeocodingSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error('Unexpected response format from Open-Meteo city search.');
  }

  const results = parsed.data.results ?? [];
  const filtered =
    options?.scope === 'india'
      ? results.filter((item) => item.country_code?.toUpperCase() === 'IN')
      : results;

  return filtered.slice(0, 10).map((item) => {
    const regionPart = item.admin1 ? `${item.admin1}` : '';
    const countryPart = item.country ?? item.country_code ?? '';
    const combinedState =
      regionPart && countryPart && regionPart.toLowerCase() !== countryPart.toLowerCase()
        ? `${regionPart}, ${countryPart}`
        : regionPart || countryPart || 'World';
    return {
      id: `loc-${item.id}`,
      name: item.name,
      state: combinedState,
      latitude: item.latitude,
      longitude: item.longitude,
    };
  });
}

export const searchGlobalCities = searchIndianCities;

function decodeWmoWeather(code: number | null | undefined): { en: string; hi: string } {
  if (code === null || code === undefined) return { en: 'Ambient conditions', hi: 'सामान्य मौसम' };
  if (code === 0) return { en: 'Clear sky', hi: 'साफ आसमान' };
  if (code <= 3) return { en: 'Partly cloudy', hi: 'आंशिक बादल' };
  if (code === 45 || code === 48) return { en: 'Fog / Mist', hi: 'कोहरा / धुंध' };
  if (code >= 51 && code <= 67) return { en: 'Rain / Drizzle (aids washout)', hi: 'बारिश / बूंदाबांदी' };
  if (code >= 71 && code <= 77) return { en: 'Snowfall', hi: 'बर्फबारी' };
  if (code >= 80 && code <= 82) return { en: 'Rain showers', hi: 'तेज बौछारें' };
  if (code >= 95) return { en: 'Thunderstorm', hi: 'आंधी-तूफान' };
  return { en: 'Cloudy / Overcast', hi: 'बादल छाए हैं' };
}

function formatHourLabel(isoTime: string): string {
  const parts = isoTime.split('T');
  if (parts.length !== 2) return isoTime;
  const [hourStr] = parts[1].split(':');
  const h = Number(hourStr);
  if (!Number.isFinite(h)) return parts[1];
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function findRollingWindow(
  hourly24: HourlyForecastPoint[],
  mode: 'cleanest' | 'worst'
): TimeWindowSummary {
  if (hourly24.length < 2) {
    const first = hourly24[0];
    return {
      startIso: first?.timeIso ?? '',
      endIso: first?.timeIso ?? '',
      startLabel: first?.hourLabel ?? '--',
      endLabel: first?.hourLabel ?? '--',
      avgPm25: first?.pm25 ?? 0,
      avgUsAqi: first?.usAqi ?? 0,
    };
  }

  let bestIdx = 0;
  let bestVal = mode === 'cleanest' ? Infinity : -Infinity;

  for (let i = 0; i < hourly24.length - 1; i += 1) {
    const avgPm = (hourly24[i].pm25 + hourly24[i + 1].pm25) / 2;
    if (mode === 'cleanest' ? avgPm < bestVal : avgPm > bestVal) {
      bestVal = avgPm;
      bestIdx = i;
    }
  }

  const a = hourly24[bestIdx];
  const b = hourly24[bestIdx + 1];
  return {
    startIso: a.timeIso,
    endIso: b.timeIso,
    startLabel: a.hourLabel,
    endLabel: b.hourLabel,
    avgPm25: Number(((a.pm25 + b.pm25) / 2).toFixed(1)),
    avgUsAqi: Math.round((a.usAqi + b.usAqi) / 2),
  };
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Number(raw.toFixed(1));
}

export async function fetchSensorCommunityCrossCheck(
  lat: number,
  lon: number,
  radiusKm = 35,
  externalSignal?: AbortSignal
): Promise<GroundSensorCrossCheck> {
  const baseUnavailable: GroundSensorCrossCheck = {
    providerName: 'Sensor.Community Network',
    radiusKm,
    stationCount: 0,
    outdoorSensorCount: 0,
    medianPm25: null,
    medianPm10: null,
    latestReadingIso: null,
    status: 'unavailable',
  };

  if (typeof fetch === 'undefined') {
    return baseUnavailable;
  }

  const { signal, cleanup } = linkAbortSignals(3500, externalSignal);

  try {
    const url = `https://data.sensor.community/airrohr/v1/filter/area=${lat.toFixed(3)},${lon.toFixed(3)},${radiusKm}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return baseUnavailable;

    const rawJson: unknown = await res.json();
    const parsed = sensorCommunityListSchema.safeParse(rawJson);
    if (!parsed.success) return baseUnavailable;

    const pm25Samples: number[] = [];
    const pm10Samples: number[] = [];
    const uniqueStationIds = new Set<number>();
    let latestIso: string | null = null;

    for (const row of parsed.data) {
      // Strictly exclude indoor sensors so indoor readings never skew outdoor verification
      const indoorVal = row.location?.indoor;
      if (indoorVal === 1 || indoorVal === '1') continue;

      const values = row.sensordatavalues ?? [];
      let rowHasPm = false;
      for (const sv of values) {
        const num = typeof sv.value === 'number' ? sv.value : Number(sv.value);
        if (!Number.isFinite(num) || num < 0) continue;
        if (sv.value_type === 'P2' && num <= 1000) {
          pm25Samples.push(num);
          rowHasPm = true;
        } else if (sv.value_type === 'P1' && num <= 1500) {
          pm10Samples.push(num);
          rowHasPm = true;
        }
      }

      if (rowHasPm) {
        if (typeof row.location?.id === 'number') {
          uniqueStationIds.add(row.location.id);
        }
        if (row.timestamp && (!latestIso || row.timestamp > latestIso)) {
          latestIso = row.timestamp;
        }
      }
    }

    if (pm25Samples.length === 0 && pm10Samples.length === 0) {
      return {
        ...baseUnavailable,
        status: 'no_nearby_stations',
      };
    }

    return {
      providerName: 'Sensor.Community Network',
      radiusKm,
      stationCount: uniqueStationIds.size || Math.max(pm25Samples.length, pm10Samples.length),
      outdoorSensorCount: Math.max(pm25Samples.length, pm10Samples.length),
      medianPm25: computeMedian(pm25Samples),
      medianPm10: computeMedian(pm10Samples),
      latestReadingIso: latestIso,
      status: 'matched',
    };
  } catch {
    return baseUnavailable;
  } finally {
    cleanup();
  }
}

export function buildVerificationReport(
  current: PollutantReadings,
  cpcb: CpcbEvaluation,
  groundCheck: GroundSensorCrossCheck
): AqiVerificationReport {
  const epaCalculatedUsAqi = computeUsAqiFromPm25(current.pm25);
  const reportedUsAqi = Math.round(current.usAqi);
  const usAqiDelta = Math.abs(reportedUsAqi - epaCalculatedUsAqi);

  const modelParityStatus: AqiVerificationReport['modelParityStatus'] =
    usAqiDelta <= 10
      ? 'exact_match'
      : usAqiDelta <= 30
      ? 'within_tolerance'
      : 'divergent';

  let overallAgreement: AqiVerificationReport['overallAgreement'] = 'model_only';
  let notesEn = `Open-Meteo CAMS nearest grid cross-checked against US EPA 2024 (${epaCalculatedUsAqi}) & CPCB (${cpcb.estimatedSubIndex}).`;
  let notesHi = `Open-Meteo CAMS डेटा की US EPA 2024 (${epaCalculatedUsAqi}) व CPCB (${cpcb.estimatedSubIndex}) से जांच की गई।`;

  if (groundCheck.status === 'matched' && groundCheck.medianPm25 !== null) {
    const diff = Math.abs(groundCheck.medianPm25 - current.pm25);
    const tolerance = Math.max(12, current.pm25 * 0.35);
    if (diff <= tolerance) {
      overallAgreement = 'high_agreement';
      notesEn = `CAMS model (${current.pm25} µg/m³) aligns closely with ${groundCheck.outdoorSensorCount} outdoor ground sensors within ${groundCheck.radiusKm}km (median ${groundCheck.medianPm25} µg/m³).`;
      notesHi = `CAMS मॉडल (${current.pm25} µg/m³) और ${groundCheck.radiusKm}km के ${groundCheck.outdoorSensorCount} आउटडोर ग्राउंड सेंसर (औसत ${groundCheck.medianPm25} µg/m³) में उच्च सहमति है।`;
    } else {
      overallAgreement = 'moderate_variance';
      notesEn = `Nearby outdoor sensors show median ${groundCheck.medianPm25} µg/m³ vs ${current.pm25} µg/m³ regional model (localized traffic/street plume likely).`;
      notesHi = `नजदीकी ग्राउंड सेंसर ${groundCheck.medianPm25} µg/m³ दिखा रहे हैं बनाम मॉडल ${current.pm25} µg/m³ (स्थानीय ट्रैफिक प्रभाव संभव)।`;
    }
  } else if (groundCheck.status === 'no_nearby_stations') {
    notesEn = `No public Sensor.Community monitors within ${groundCheck.radiusKm}km; verified via CAMS nearest grid + US EPA 2024 & CPCB formulas.`;
    notesHi = `${groundCheck.radiusKm}km में सार्वजनिक ग्राउंड सेंसर उपलब्ध नहीं; CAMS मॉडल + US EPA व CPCB सूत्रों से सत्यापित।`;
  }

  return {
    primaryModelSource: DATA_SOURCE_NAME,
    epaCalculatedUsAqi,
    reportedUsAqi,
    usAqiDelta,
    modelParityStatus,
    cpcbSubIndex: cpcb.estimatedSubIndex,
    groundCheck,
    overallAgreement,
    checkedAtIso: new Date().toISOString(),
    autoRefreshMinutes: Math.round(AUTO_REFRESH_INTERVAL_MS / 60000),
    notesEn,
    notesHi,
  };
}

export async function fetchLiveAirAndWeather(
  location: IndianLocation,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<AirQualitySnapshot> {
  if (!options?.forceRefresh) {
    const cached = readCachedSnapshot(location.latitude, location.longitude);
    if (cached) {
      return { ...cached, location };
    }
  }

  const aqUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  aqUrl.searchParams.set('latitude', location.latitude.toFixed(4));
  aqUrl.searchParams.set('longitude', location.longitude.toFixed(4));
  aqUrl.searchParams.set('cell_selection', 'nearest');
  aqUrl.searchParams.set(
    'current',
    'us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,dust,uv_index'
  );
  aqUrl.searchParams.set(
    'hourly',
    'pm2_5,pm10,us_aqi,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide'
  );
  aqUrl.searchParams.set('timezone', 'auto');
  aqUrl.searchParams.set('forecast_days', '2');

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', location.latitude.toFixed(4));
  weatherUrl.searchParams.set('longitude', location.longitude.toFixed(4));
  weatherUrl.searchParams.set('cell_selection', 'nearest');
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code'
  );
  weatherUrl.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,wind_speed_10m');
  weatherUrl.searchParams.set('timezone', 'auto');
  weatherUrl.searchParams.set('forecast_days', '2');

  const [aqJson, weatherJson, groundCheck] = await Promise.all([
    fetchJsonWithTimeout(aqUrl.toString(), {
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      signal: options?.signal,
      label: 'Live air-quality telemetry',
    }),
    fetchJsonWithTimeout(weatherUrl.toString(), {
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      signal: options?.signal,
      label: 'Live weather telemetry',
    }),
    fetchSensorCommunityCrossCheck(location.latitude, location.longitude, 35, options?.signal),
  ]);

  const aqParsed = openMeteoAirQualitySchema.safeParse(aqJson);
  if (!aqParsed.success) {
    throw new Error(LIVE_UNAVAILABLE_MESSAGE);
  }

  const weatherParsed = openMeteoWeatherSchema.safeParse(weatherJson);
  if (!weatherParsed.success) {
    throw new Error(LIVE_UNAVAILABLE_MESSAGE);
  }

  const aq = aqParsed.data;
  const wx = weatherParsed.data;

  // Never fabricate PM2.5 or AQI as 0 when live measurements are absent
  if (aq.current.pm2_5 === null) {
    throw new Error(LIVE_UNAVAILABLE_MESSAGE);
  }

  const currentPm25 = Number(aq.current.pm2_5.toFixed(1));
  const currentPm10 = sanitizeNullableNonNegative(aq.current.pm10, 3000, 1);
  const usAqiDerivedFromPm25 = aq.current.us_aqi === null;
  const currentUsAqi =
    aq.current.us_aqi !== null
      ? Math.round(aq.current.us_aqi)
      : computeUsAqiFromPm25(currentPm25);

  const currentHourPrefix = aq.current.time.slice(0, 13);
  const foundIdx = aq.hourly.time.findIndex((t) => t.slice(0, 13) >= currentHourPrefix);
  const startIdx = foundIdx >= 0 ? foundIdx : 0;

  const weatherByTime = new Map<string, { temp: number | null; hum: number | null; wind: number | null }>();
  wx.hourly.time.forEach((timeIso, idx) => {
    const tVal = wx.hourly.temperature_2m[idx];
    const hVal = wx.hourly.relative_humidity_2m[idx];
    const wVal = wx.hourly.wind_speed_10m[idx];
    weatherByTime.set(timeIso, {
      temp: tVal !== null && tVal !== undefined && tVal >= -90 && tVal <= 65 ? tVal : null,
      hum: hVal !== null && hVal !== undefined && hVal >= 0 && hVal <= 100 ? hVal : null,
      wind: wVal !== null && wVal !== undefined && wVal >= 0 && wVal <= 500 ? wVal : null,
    });
  });

  const hourly48: HourlyForecastPoint[] = [];
  const rawSlice = aq.hourly.time.slice(startIdx, startIdx + 48);
  for (let offset = 0; offset < rawSlice.length; offset += 1) {
    const idx = startIdx + offset;
    const timeIso = rawSlice[offset];
    const hrPm25 = sanitizeNullableNonNegative(aq.hourly.pm2_5[idx], 2000, 1);
    if (hrPm25 === null) continue; // Skip missing/corrupt forecast hours rather than inventing values

    const hrUsAqi = sanitizeNullableNonNegative(aq.hourly.us_aqi[idx], 1000, 0);
    const w = weatherByTime.get(timeIso);

    hourly48.push({
      timeIso,
      hourLabel: formatHourLabel(timeIso),
      pm25: hrPm25,
      pm10: sanitizeNullableNonNegative(aq.hourly.pm10[idx], 3000, 1),
      usAqi: hrUsAqi !== null ? hrUsAqi : computeUsAqiFromPm25(hrPm25),
      no2: sanitizeNullableNonNegative(aq.hourly.nitrogen_dioxide[idx], 5000, 1),
      o3: sanitizeNullableNonNegative(aq.hourly.ozone[idx], 2000, 1),
      so2: sanitizeNullableNonNegative(aq.hourly.sulphur_dioxide[idx], 5000, 1),
      co: sanitizeNullableNonNegative(aq.hourly.carbon_monoxide[idx], 100000, 0),
      temperatureC: w?.temp ?? null,
      humidityPct: w?.hum ?? null,
      windSpeedKmh: w?.wind ?? null,
    });
  }

  if (hourly48.length === 0) {
    throw new Error(LIVE_UNAVAILABLE_MESSAGE);
  }

  const hourly24 = hourly48.slice(0, 24);
  const currentReadings: PollutantReadings = {
    pm25: currentPm25,
    pm10: currentPm10,
    usAqi: currentUsAqi,
    europeanAqi: sanitizeNullableNonNegative(aq.current.european_aqi, 1000, 0),
    no2: sanitizeNullableNonNegative(aq.current.nitrogen_dioxide, 5000, 1),
    o3: sanitizeNullableNonNegative(aq.current.ozone, 2000, 1),
    so2: sanitizeNullableNonNegative(aq.current.sulphur_dioxide, 5000, 1),
    co: sanitizeNullableNonNegative(aq.current.carbon_monoxide, 100000, 0),
    dustUgM3: sanitizeNullableNonNegative(aq.current.dust, 5000, 1),
    uvIndex: sanitizeNullableNonNegative(aq.current.uv_index, 25, 1),
  };

  const wmo = decodeWmoWeather(wx.current.weather_code);
  const whoPm25Ratio = Number((currentReadings.pm25 / 15).toFixed(1));

  const cpcbEval = estimateCpcbFromPm(currentReadings.pm25, currentReadings.pm10);
  const verification = buildVerificationReport(currentReadings, cpcbEval, groundCheck);

  const snapshot: AirQualitySnapshot = {
    location,
    sourceName: DATA_SOURCE_NAME,
    observationTimestampIso: aq.current.time,
    fetchedAtIso: new Date().toISOString(),
    timezone: aq.timezone,
    whoPm25Ratio,
    current: currentReadings,
    weather: {
      temperatureC: Number((wx.current.temperature_2m ?? 0).toFixed(1)),
      apparentTemperatureC:
        wx.current.apparent_temperature !== undefined && wx.current.apparent_temperature !== null
          ? Number(wx.current.apparent_temperature.toFixed(1))
          : null,
      humidityPct: Math.round(wx.current.relative_humidity_2m ?? 0),
      windSpeedKmh: Number((wx.current.wind_speed_10m ?? 0).toFixed(1)),
      windGustsKmh:
        wx.current.wind_gusts_10m !== undefined && wx.current.wind_gusts_10m !== null
          ? Number(wx.current.wind_gusts_10m.toFixed(1))
          : null,
      precipitationMm:
        wx.current.precipitation !== undefined && wx.current.precipitation !== null
          ? Number(wx.current.precipitation.toFixed(1))
          : null,
      weatherCode: wx.current.weather_code ?? null,
      weatherLabelEn: wmo.en,
      weatherLabelHi: wmo.hi,
    },
    cpcb: cpcbEval,
    dominantPollutant: getDominantPollutantName(currentReadings),
    hourly24,
    hourly48,
    cleanestWindow: findRollingWindow(hourly24, 'cleanest'),
    worstWindow: findRollingWindow(hourly24, 'worst'),
    verification,
    fromCache: false,
    isStale: false,
    usAqiDerivedFromPm25,
  };

  writeCachedSnapshot(location.latitude, location.longitude, snapshot);
  return snapshot;
}

export function formatObservationTimestamp(iso: string): string {
  if (!iso) return '--';
  const [datePart, timePart] = iso.split('T');
  if (!timePart) return iso;
  return `${datePart} · ${timePart.slice(0, 5)} local`;
}

export function formatFreshnessLabel(fetchedAtIso: string, lang: Language, nowMs = Date.now()): string {
  const fetchedMs = Date.parse(fetchedAtIso);
  if (Number.isNaN(fetchedMs)) return lang === 'hi' ? 'अपडेट: अज्ञात' : 'updated recently';

  const diffMin = Math.max(0, Math.floor((nowMs - fetchedMs) / 60000));
  if (diffMin < 1) {
    return lang === 'hi' ? 'अभी अपडेट किया गया' : 'updated just now';
  }
  if (diffMin < 60) {
    return lang === 'hi' ? `${diffMin} मिनट पहले अपडेट` : `updated ${diffMin} min ago`;
  }
  const diffHr = Math.floor(diffMin / 60);
  return lang === 'hi' ? `${diffHr} घंटे पहले अपडेट` : `updated ${diffHr} hr ago`;
}

export interface LiveCityAqiEntry {
  cityId: string;
  usAqi: number;
  pm25: number;
  pm10: number | null;
  cpcb: CpcbEvaluation;
  observationTimestampIso: string;
  fetchedAtIso: string;
  sourceName: string;
}

const batchCityCache = new Map<string, { cachedAtMs: number; entry: LiveCityAqiEntry }>();

export async function fetchBatchCitiesLiveAqi(
  cities: IndianLocation[],
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<Record<string, LiveCityAqiEntry>> {
  const result: Record<string, LiveCityAqiEntry> = {};
  const now = Date.now();
  const missing: IndianLocation[] = [];

  for (const city of cities) {
    if (!options?.forceRefresh) {
      const cached = batchCityCache.get(city.id);
      if (cached && now - cached.cachedAtMs < CACHE_TTL_MS) {
        result[city.id] = cached.entry;
        continue;
      }
    }
    missing.push(city);
  }

  if (missing.length === 0) {
    return result;
  }

  const chunkSize = 20;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.searchParams.set(
      'latitude',
      chunk.map((c) => c.latitude.toFixed(4)).join(',')
    );
    url.searchParams.set(
      'longitude',
      chunk.map((c) => c.longitude.toFixed(4)).join(',')
    );
    url.searchParams.set('current', 'us_aqi,pm2_5,pm10');
    url.searchParams.set('timezone', 'auto');

    const raw = await fetchJsonWithTimeout(url.toString(), {
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      signal: options?.signal,
      label: 'Batch station AQI',
    });

    const items = Array.isArray(raw) ? raw : [raw];
    const fetchedAtIso = new Date().toISOString();

    chunk.forEach((city, idx) => {
      const item = items[idx] as
        | {
            current?: {
              time?: string;
              us_aqi?: number | null;
              pm2_5?: number | null;
              pm10?: number | null;
            };
          }
        | undefined;
      if (!item?.current) return;

      const pm25 = sanitizeNullableNonNegative(item.current.pm2_5, 2000, 1);
      if (pm25 === null) return;

      const pm10 = sanitizeNullableNonNegative(item.current.pm10, 3000, 1);
      const rawUsAqi = sanitizeNullableNonNegative(item.current.us_aqi, 1000, 0);
      const usAqi = rawUsAqi !== null ? rawUsAqi : computeUsAqiFromPm25(pm25);

      const entry: LiveCityAqiEntry = {
        cityId: city.id,
        usAqi,
        pm25,
        pm10,
        cpcb: estimateCpcbFromPm(pm25, pm10),
        observationTimestampIso: item.current.time ?? fetchedAtIso,
        fetchedAtIso,
        sourceName: 'Open-Meteo (CAMS/ECMWF)',
      };
      batchCityCache.set(city.id, { cachedAtMs: Date.now(), entry });
      result[city.id] = entry;
    });
  }

  return result;
}
