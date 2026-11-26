import type { CpcbCategoryKey, CpcbEvaluation, PollutantReadings } from '../types/vayu';

interface BreakpointRow {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
  key: CpcbCategoryKey;
  labelEn: string;
  labelHi: string;
}

const PM25_BREAKPOINTS: BreakpointRow[] = [
  { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50, key: 'good', labelEn: 'Good', labelHi: 'अच्छा (Good)' },
  { cLow: 30, cHigh: 60, iLow: 51, iHigh: 100, key: 'satisfactory', labelEn: 'Satisfactory', labelHi: 'संतोषजनक (Satisfactory)' },
  { cLow: 60, cHigh: 90, iLow: 101, iHigh: 200, key: 'moderate', labelEn: 'Moderate', labelHi: 'मध्यम (Moderate)' },
  { cLow: 90, cHigh: 120, iLow: 201, iHigh: 300, key: 'poor', labelEn: 'Poor', labelHi: 'खराब (Poor)' },
  { cLow: 120, cHigh: 250, iLow: 301, iHigh: 400, key: 'very_poor', labelEn: 'Very Poor', labelHi: 'बहुत खराब (Very Poor)' },
  { cLow: 250, cHigh: 500, iLow: 401, iHigh: 500, key: 'severe', labelEn: 'Severe', labelHi: 'गंभीर (Severe)' },
];

const PM10_BREAKPOINTS: BreakpointRow[] = [
  { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50, key: 'good', labelEn: 'Good', labelHi: 'अच्छा (Good)' },
  { cLow: 50, cHigh: 100, iLow: 51, iHigh: 100, key: 'satisfactory', labelEn: 'Satisfactory', labelHi: 'संतोषजनक (Satisfactory)' },
  { cLow: 100, cHigh: 250, iLow: 101, iHigh: 200, key: 'moderate', labelEn: 'Moderate', labelHi: 'मध्यम (Moderate)' },
  { cLow: 250, cHigh: 350, iLow: 201, iHigh: 300, key: 'poor', labelEn: 'Poor', labelHi: 'खराब (Poor)' },
  { cLow: 350, cHigh: 430, iLow: 301, iHigh: 400, key: 'very_poor', labelEn: 'Very Poor', labelHi: 'बहुत खराब (Very Poor)' },
  { cLow: 430, cHigh: 700, iLow: 401, iHigh: 500, key: 'severe', labelEn: 'Severe', labelHi: 'गंभीर (Severe)' },
];

export function computeSubIndex(value: number, table: BreakpointRow[]): {
  subIndex: number;
  row: BreakpointRow;
} {
  const safeVal = Number.isFinite(value) && value > 0 ? value : 0;

  for (let i = 0; i < table.length; i += 1) {
    const row = table[i];
    const isLast = i === table.length - 1;
    if (safeVal <= row.cHigh || isLast) {
      if (isLast && safeVal > row.cHigh) {
        // Linearly extend past 500 for extreme episodes
        const slope = (row.iHigh - row.iLow) / (row.cHigh - row.cLow);
        const extended = Math.round(row.iLow + (safeVal - row.cLow) * slope);
        return { subIndex: extended, row };
      }
      const span = row.cHigh - row.cLow;
      const ratio = span > 0 ? (safeVal - row.cLow) / span : 0;
      const subIndex = Math.round(row.iLow + ratio * (row.iHigh - row.iLow));
      return { subIndex, row };
    }
  }

  const last = table[table.length - 1];
  return { subIndex: 500, row: last };
}

export function getPm25CpcbCategory(pm25: number): BreakpointRow {
  return computeSubIndex(pm25, PM25_BREAKPOINTS).row;
}

export function getPm10CpcbCategory(pm10: number): BreakpointRow {
  return computeSubIndex(pm10, PM10_BREAKPOINTS).row;
}

export function estimateCpcbFromPm(pm25: number, pm10: number | null): CpcbEvaluation {
  const pm25Res = computeSubIndex(pm25, PM25_BREAKPOINTS);
  const pm10Res =
    pm10 !== null && Number.isFinite(pm10) && pm10 >= 0
      ? computeSubIndex(pm10, PM10_BREAKPOINTS)
      : null;

  const pm25Wins = !pm10Res || pm25Res.subIndex >= pm10Res.subIndex;
  const winner = pm25Wins ? pm25Res : pm10Res;

  return {
    categoryKey: winner.row.key,
    labelEn: winner.row.labelEn,
    labelHi: winner.row.labelHi,
    estimatedSubIndex: winner.subIndex,
    pm25SubIndex: pm25Res.subIndex,
    pm10SubIndex: pm10Res ? pm10Res.subIndex : null,
    dominantPmPollutant: pm25Wins ? 'PM2.5' : 'PM10',
    attributionLabelEn: 'Estimated from model PM data (CPCB breakpoints)',
    attributionLabelHi: 'मॉडल PM डेटा से अनुमानित (CPCB मानक)',
  };
}

export function getDominantPollutantName(readings: PollutantReadings): string {
  // Compare available pollutants normalized to CPCB / WHO 24h-equivalent reference levels
  const candidates: Array<{ name: string; value: number | null; ref: number }> = [
    { name: 'PM2.5', value: readings.pm25, ref: 60 },
    { name: 'PM10', value: readings.pm10, ref: 100 },
    { name: 'NO₂', value: readings.no2, ref: 80 },
    { name: 'O₃', value: readings.o3, ref: 100 },
    { name: 'SO₂', value: readings.so2, ref: 80 },
    { name: 'CO', value: readings.co, ref: 2000 },
  ];

  const ratios = candidates
    .filter((item): item is { name: string; value: number; ref: number } =>
      item.value !== null && Number.isFinite(item.value) && item.value >= 0
    )
    .map((item) => ({ name: item.name, ratio: item.value / item.ref }));

  if (ratios.length === 0) return 'PM2.5';
  ratios.sort((a, b) => b.ratio - a.ratio);
  return ratios[0].name;
}

export interface CategoryVisualStyle {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentHex: string;
  barBg: string;
  surfaceTint: string;
}

export const CPCB_CATEGORY_STYLES: Record<CpcbCategoryKey, CategoryVisualStyle> = {
  good: {
    badgeBg: 'bg-[#1D9E75]/15',
    badgeText: 'text-[#5DCAA5]',
    badgeBorder: 'border-[#1D9E75]/45',
    accentHex: '#5DCAA5',
    barBg: 'bg-[#1D9E75]',
    surfaceTint: 'bg-[#1D9E75]/10',
  },
  satisfactory: {
    badgeBg: 'bg-[#67E8F9]/15',
    badgeText: 'text-[#67E8F9]',
    badgeBorder: 'border-[#67E8F9]/40',
    accentHex: '#67E8F9',
    barBg: 'bg-[#38BDF8]',
    surfaceTint: 'bg-[#67E8F9]/10',
  },
  moderate: {
    badgeBg: 'bg-amber-400/15',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-400/40',
    accentHex: '#FBBF24',
    barBg: 'bg-amber-400',
    surfaceTint: 'bg-amber-400/10',
  },
  poor: {
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-400/45',
    accentHex: '#FB923C',
    barBg: 'bg-orange-500',
    surfaceTint: 'bg-orange-500/10',
  },
  very_poor: {
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-400/45',
    accentHex: '#FB7185',
    barBg: 'bg-rose-500',
    surfaceTint: 'bg-rose-500/10',
  },
  severe: {
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-200',
    badgeBorder: 'border-red-400/50',
    accentHex: '#FCA5A5',
    barBg: 'bg-red-500',
    surfaceTint: 'bg-red-500/12',
  },
};

export function getUsAqiLabel(usAqi: number): { en: string; hi: string } {
  if (usAqi <= 50) return { en: 'Good', hi: 'अच्छा' };
  if (usAqi <= 100) return { en: 'Moderate', hi: 'मध्यम' };
  if (usAqi <= 150) return { en: 'Unhealthy for Sensitive Groups', hi: 'संवेदनशील समूहों के लिए अस्वस्थ' };
  if (usAqi <= 200) return { en: 'Unhealthy', hi: 'अस्वस्थ' };
  if (usAqi <= 300) return { en: 'Very Unhealthy', hi: 'बहुत अस्वस्थ' };
  return { en: 'Hazardous', hi: 'खतरनाक' };
}

export function getEuropeanAqiLabel(eaqi: number): { en: string; hi: string } {
  if (eaqi <= 20) return { en: 'Good', hi: 'अच्छा' };
  if (eaqi <= 40) return { en: 'Fair', hi: 'संतोषजनक' };
  if (eaqi <= 60) return { en: 'Moderate', hi: 'मध्यम' };
  if (eaqi <= 80) return { en: 'Poor', hi: 'खराब' };
  if (eaqi <= 100) return { en: 'Very Poor', hi: 'बहुत खराब' };
  return { en: 'Extremely Poor', hi: 'अत्यंत खराब' };
}

// Official US EPA (May 2024 revision) PM2.5 AQI breakpoints for cross-verifying model US AQI
const US_EPA_PM25_BREAKPOINTS: Array<{
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}> = [
  { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
  { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
  { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
  { cLow: 225.5, cHigh: 325.4, iLow: 301, iHigh: 500 },
];

export function computeUsAqiFromPm25(pm25: number): number {
  const truncated = Math.max(0, Math.floor(Math.max(0, pm25) * 10) / 10);
  for (let i = 0; i < US_EPA_PM25_BREAKPOINTS.length; i += 1) {
    const row = US_EPA_PM25_BREAKPOINTS[i];
    const isLast = i === US_EPA_PM25_BREAKPOINTS.length - 1;
    if (truncated <= row.cHigh || isLast) {
      const span = row.cHigh - row.cLow;
      if (span <= 0) return row.iLow;
      if (isLast && truncated > row.cHigh) {
        const slope = (row.iHigh - row.iLow) / span;
        return Math.round(row.iLow + (truncated - row.cLow) * slope);
      }
      return Math.round(
        ((row.iHigh - row.iLow) / span) * (truncated - row.cLow) + row.iLow
      );
    }
  }
  return 0;
}

