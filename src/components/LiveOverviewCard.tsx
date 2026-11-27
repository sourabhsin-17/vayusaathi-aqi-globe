import React, { Suspense, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Droplets,
  LayoutGrid,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Thermometer,
  Wind,
} from 'lucide-react';
import { formatFreshnessLabel, formatObservationTimestamp } from '../lib/airQualityService';
import { getEuropeanAqiLabel, getUsAqiLabel } from '../lib/cpcb';
import { t } from '../lib/i18n';
import type { AirQualitySnapshot, Language } from '../types/vayu';
import { AirProgressRing } from './AirProgressRing';
import { CategoryBadge } from './CategoryBadge';

const HourlyForecastChart = React.lazy(() => import('./HourlyForecastChart'));

interface LiveOverviewCardProps {
  snapshot: AirQualitySnapshot | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  lang: Language;
}

type LifeStageAudience = 'everyone' | 'kids' | 'seniors' | 'commuters';

function buildPlainVerdict(
  snapshot: AirQualitySnapshot,
  audience: LifeStageAudience,
  lang: Language
): {
  statusLevel: 'safe' | 'caution' | 'avoid';
  headline: string;
  body: string;
} {
  const usAqi = snapshot.current.usAqi;
  const cleanWin = `${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}`;
  const worstWin = `${snapshot.worstWindow.startLabel}–${snapshot.worstWindow.endLabel}`;
  const isHi = lang === 'hi';

  const statusLevel: 'safe' | 'caution' | 'avoid' =
    usAqi <= 50 ? 'safe' : usAqi <= 150 ? 'caution' : 'avoid';

  if (audience === 'kids') {
    if (usAqi <= 50) {
      return {
        statusLevel: 'safe',
        headline: isHi ? 'बच्चों के लिए बाहर खेलना सुरक्षित है' : 'Safe for kids to play outdoors right now',
        body: isHi
          ? `US AQI ${usAqi} अच्छा है। मुख्य ट्रैफिक सड़कों से दूर पार्क या मैदान में खेलना ठीक है।`
          : `US AQI is ${usAqi} (Good). Parks and playgrounds away from busy intersections are comfortable for active play.`,
      };
    }
    if (usAqi <= 150) {
      return {
        statusLevel: 'caution',
        headline: isHi
          ? `बच्चों को हल्का खेल ${cleanWin} में रखें`
          : `Keep outdoor play gentle & shift to ${cleanWin}`,
        body: isHi
          ? `US AQI ${usAqi} पर संवेदनशील बच्चों को खांसी या थकान हो सकती है। सबसे साफ समय ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³ PM2.5) चुनें।`
          : `At US AQI ${usAqi}, aim for calmer games and schedule outdoor time around ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³ PM2.5).`,
      };
    }
    return {
      statusLevel: 'avoid',
      headline: isHi ? 'आज बच्चों का खेल घर के अंदर रखें' : 'Move children’s active play indoors today',
      body: isHi
        ? `हवा अस्वस्थ (US AQI ${usAqi}, PM2.5 ${snapshot.current.pm25} µg/m³) है। ${worstWin} में बाहर खेलना टालें; जरूरी काम केवल ${cleanWin} में करें।`
        : `Air is unhealthy (US AQI ${usAqi}, PM2.5 ${snapshot.current.pm25} µg/m³). Keep vigorous play indoors and avoid peak hours (${worstWin}).`,
    };
  }

  if (audience === 'seniors') {
    if (usAqi <= 50) {
      return {
        statusLevel: 'safe',
        headline: isHi ? 'वरिष्ठ नागरिकों की सैर के लिए बढ़िया हवा' : 'Comfortable air for walks & gentle exercise',
        body: isHi
          ? `US AQI ${usAqi} और PM2.5 ${snapshot.current.pm25} µg/m³ है। सुबह या शाम पार्क में टहलना सुरक्षित है।`
          : `With US AQI at ${usAqi} and PM2.5 at ${snapshot.current.pm25} µg/m³, outdoor walking in quiet streets or parks is safe.`,
      };
    }
    if (usAqi <= 150) {
      return {
        statusLevel: 'caution',
        headline: isHi
          ? `टहलने का समय दोपहर ${cleanWin} पर बदलें`
          : `Walk gently during ${cleanWin} instead of rush hour`,
        body: isHi
          ? `60+ उम्र व हृदय/अस्थमा संवेदनशील लोगों को ठंडी सुबह/शाम की बजाय ${cleanWin} में बाहर निकलना चाहिए।`
          : `Seniors and people with heart or lung conditions breathe easiest during ${cleanWin}; avoid heavy exertion near traffic.`,
      };
    }
    return {
      statusLevel: 'avoid',
      headline: isHi
        ? 'वरिष्ठ नागरिक घर के अंदर रहें और खिड़कियां बंद रखें'
        : 'Seniors stay indoors with windows closed right now',
      body: isHi
        ? `US AQI ${usAqi} (WHO सीमा से ${snapshot.whoPm25Ratio ?? '--'} गुना) है। घर के अंदर हल्की स्ट्रेचिंग करें और आवश्यक दवाएं पास रखें।`
        : `US AQI is ${usAqi} (${snapshot.whoPm25Ratio ?? '--'}× WHO 24h limit). Stay in a quiet indoor room and postpone non-essential trips.`,
    };
  }

  if (audience === 'commuters') {
    if (usAqi <= 100) {
      return {
        statusLevel: usAqi <= 50 ? 'safe' : 'caution',
        headline: isHi ? 'सफर सामान्य है; संभव हो तो मेट्रो/बस चुनें' : 'Normal commute window; transit cuts traffic emissions',
        body: isHi
          ? `बाहर US AQI ${usAqi} है, फिर भी मुख्य सड़कों पर धुआं अधिक हो सकता है।`
          : `Background US AQI is ${usAqi}. Taking rail, metro, or bus reduces roadside tailpipe emissions across the city.`,
      };
    }
    return {
      statusLevel: 'avoid',
      headline: isHi
        ? 'सफर में फिटेड N95/FFP2 मास्क पहनें और बंद वाहन चुनें'
        : 'Wear a sealed N95/FFP2 respirator & choose closed transit',
      body: isHi
        ? `US AQI ${usAqi} पर दोपहिया या पैदल यात्रियों को सड़क पर अधिक PM2.5 मिलता है। मेट्रो, बंद बस या रीसर्क्युलेशन ऑन कार का उपयोग करें।`
        : `At US AQI ${usAqi}, open-air riding multiplies exposure. Choose Metro/bus or car AC recirculation and wear a snug N95.`,
    };
  }

  if (usAqi <= 50) {
    return {
      statusLevel: 'safe',
      headline: isHi ? 'हाँ — अभी बाहर निकलना और वेंटिलेशन सुरक्षित है' : 'Yes — good air outside right now for everyone',
      body: isHi
        ? `US AQI ${usAqi} और मौसम "${snapshot.weather.weatherLabelHi ?? 'सामान्य'}" है। आप खिड़कियां खोलकर घर की हवा ताजा कर सकते हैं।`
        : `Live US AQI is ${usAqi} with ${snapshot.weather.weatherLabelEn?.toLowerCase() ?? 'calm conditions'}. Great time to open windows and enjoy outdoors.`,
    };
  }
  if (usAqi <= 150) {
    return {
      statusLevel: 'caution',
      headline: isHi
        ? `सामान्य काम ठीक हैं — संवेदनशील लोग ${cleanWin} चुनें`
        : `Okay for brief errands — best outdoor air is ${cleanWin}`,
      body: isHi
        ? `PM2.5 ${snapshot.current.pm25} µg/m³ है। भारी दौड़-भाग या बच्चों/बुजुर्गों का बाहर समय ${cleanWin} में रखें और ${worstWin} में खिड़कियां बंद रखें।`
        : `PM2.5 is ${snapshot.current.pm25} µg/m³. Keep strenuous outdoor workouts brief, prioritize ${cleanWin}, and avoid ${worstWin}.`,
    };
  }
  return {
    statusLevel: 'avoid',
    headline: isHi
      ? `अनावश्यक बाहरी समय टालें — ${cleanWin} तक प्रतीक्षा करें`
      : `Limit outdoor time now — wait for ${cleanWin} or stay indoors`,
    body: isHi
      ? `US AQI ${usAqi} अस्वस्थ स्तर पर है। बाहर निकलना जरूरी हो तो फिटेड N95 पहनें और घर की खिड़कियां बंद रखें।`
      : `US AQI is ${usAqi} (${snapshot.cpcb.labelEn}). Keep windows closed, pause outdoor exercise, and wear a fitted N95 if going out.`,
  };
}

export function LiveOverviewCard({
  snapshot,
  loading,
  error,
  onRetry,
  onRefresh,
  lang,
}: LiveOverviewCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [audience, setAudience] = useState<LifeStageAudience>('everyone');
  const [pollutantView, setPollutantView] = useState<'bento' | 'table'>('bento');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  if (loading && !snapshot) {
    return (
      <section
        aria-label={t(lang, 'liveAirTitle')}
        className="obsidian-surface rounded-3xl p-6 space-y-5 animate-pulse"
      >
        <div className="h-6 w-56 rounded bg-white/10" />
        <div className="h-24 rounded-2xl bg-[#0C1322]" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-44 rounded-2xl bg-[#182947] lg:col-span-5" />
          <div className="h-44 rounded-2xl bg-[#142138] lg:col-span-4" />
          <div className="h-44 rounded-2xl bg-[#0C1322] lg:col-span-3" />
        </div>
        <div className="h-48 rounded-2xl bg-[#0C1322]" />
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section
        id="overview"
        role="alert"
        className="obsidian-surface rounded-3xl border border-rose-400/35 p-6 text-[#E6EDF7]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-[#E6EDF7] font-display">
                Live air quality data is temporarily unavailable.
              </h2>
              {lang === 'hi' ? (
                <p className="text-sm font-medium text-[#E6EDF7]/90">
                  लाइव वायु गुणवत्ता डेटा अस्थायी रूप से अनुपलब्ध है।
                </p>
              ) : null}
              <p className="text-sm text-[#9FB0C7]">{error}</p>
              <p className="text-xs text-[#9FB0C7]/80">
                {lang === 'hi'
                  ? 'VayuSaathi कभी भी नकली या काल्पनिक आंकड़े नहीं दिखाता।'
                  : 'VayuSaathi never fabricates or substitutes simulated pollution readings.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#38BDF8] px-4 py-2 text-sm font-semibold text-[#0C1322] hover:bg-[#7DD3FC] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-4 w-4 text-[#0C1322]" aria-hidden="true" />
            <span>{t(lang, 'retryFetch')}</span>
          </button>
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  const freshness = formatFreshnessLabel(snapshot.fetchedAtIso, lang, nowMs);
  const observedText = formatObservationTimestamp(snapshot.observationTimestampIso);
  const usLabel = getUsAqiLabel(snapshot.current.usAqi);
  const euLabel =
    snapshot.current.europeanAqi !== null && snapshot.current.europeanAqi !== undefined
      ? getEuropeanAqiLabel(snapshot.current.europeanAqi)
      : null;
  const whoMultiple =
    snapshot.whoPm25Ratio ?? Number((snapshot.current.pm25 / 15).toFixed(1));
  const verdict = buildPlainVerdict(snapshot, audience, lang);

  const verdictStyle =
    verdict.statusLevel === 'safe'
      ? 'border-[#1D9E75]/40 bg-[#1D9E75]/15 text-[#E6EDF7]'
      : verdict.statusLevel === 'caution'
      ? 'border-amber-400/35 bg-amber-500/12 text-[#E6EDF7]'
      : 'border-rose-400/35 bg-rose-500/12 text-[#E6EDF7]';

  const getPollutantTone = (val: number | null, max: number) => {
    if (val === null) return { barFill: 'bg-white/20', accentText: 'text-[#9FB0C7]' };
    const ratio = val / max;
    if (ratio >= 0.9) return { barFill: 'bg-rose-400', accentText: 'text-rose-300' };
    if (ratio >= 0.45) return { barFill: 'bg-amber-400', accentText: 'text-amber-300' };
    return { barFill: 'bg-[#5DCAA5]', accentText: 'text-[#5DCAA5]' };
  };

  const pollutantCards: Array<{
    name: string;
    value: number | null;
    unit: string;
    refMax: number;
    note: string;
    barFill: string;
    accentText: string;
  }> = [
    {
      name: 'PM2.5',
      value: snapshot.current.pm25,
      unit: 'µg/m³',
      refMax: 75,
      note: 'Fine particles entering deep lungs',
      ...getPollutantTone(snapshot.current.pm25, 75),
    },
    {
      name: 'PM10',
      value: snapshot.current.pm10,
      unit: 'µg/m³',
      refMax: 150,
      note: 'Road dust, soil & smoke particles',
      ...getPollutantTone(snapshot.current.pm10, 150),
    },
    {
      name: 'NO₂',
      value: snapshot.current.no2,
      unit: 'µg/m³',
      refMax: 80,
      note: 'Vehicle tailpipe & fuel combustion',
      ...getPollutantTone(snapshot.current.no2, 80),
    },
    {
      name: 'O₃',
      value: snapshot.current.o3,
      unit: 'µg/m³',
      refMax: 120,
      note: 'Sunlight-driven afternoon ozone',
      ...getPollutantTone(snapshot.current.o3, 120),
    },
    {
      name: 'SO₂',
      value: snapshot.current.so2,
      unit: 'µg/m³',
      refMax: 80,
      note: 'Industrial & power-plant sulfur',
      ...getPollutantTone(snapshot.current.so2, 80),
    },
    snapshot.current.dustUgM3 !== null && snapshot.current.dustUgM3 !== undefined
      ? {
          name: 'Dust',
          value: snapshot.current.dustUgM3,
          unit: 'µg/m³',
          refMax: 100,
          note: 'Windborne regional desert dust',
          ...getPollutantTone(snapshot.current.dustUgM3, 100),
        }
      : {
          name: 'CO',
          value: snapshot.current.co,
          unit: 'µg/m³',
          refMax: 2000,
          note: 'Incomplete fuel & biomass burning',
          ...getPollutantTone(snapshot.current.co, 2000),
        },
  ];

  const audienceOptions: Array<{ key: LifeStageAudience; labelEn: string; labelHi: string }> = [
    { key: 'everyone', labelEn: 'Everyone', labelHi: 'सभी के लिए' },
    { key: 'kids', labelEn: 'Kids & Play', labelHi: 'बच्चे और खेल' },
    { key: 'seniors', labelEn: 'Seniors 60+', labelHi: 'बुजुर्ग 60+' },
    { key: 'commuters', labelEn: 'Commuters', labelHi: 'दैनिक यात्री' },
  ];

  return (
    <section
      id="overview"
      aria-label={t(lang, 'liveAirTitle')}
      className="obsidian-surface rounded-3xl p-5 sm:p-7 space-y-6"
    >
      {/* Header + Verified Source Attribution */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
              01. {lang === 'hi' ? 'सत्यापित वर्तमान रीडिंग' : 'Current Air Reading'}
            </p>
            {snapshot.isStale ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/45 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {lang === 'hi' ? 'पुरानी रीडिंग (कैश्ड)' : 'Older reading (cached)'}
              </span>
            ) : snapshot.fromCache ? (
              <span className="rounded-md border border-white/15 bg-[#0C1322] px-2 py-0.5 text-[11px] font-medium text-[#9FB0C7]">
                {lang === 'hi' ? '5-मिनट कैश' : '5-min cache'}
              </span>
            ) : (
              <span className="rounded-md border border-[#5DCAA5]/35 bg-[#1D9E75]/15 px-2 py-0.5 text-[11px] font-semibold text-[#5DCAA5]">
                {lang === 'hi' ? 'लाइव वर्तमान रीडिंग' : 'Live Current Reading'}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display sm:text-3xl">
            {t(lang, 'liveAirTitle')} — {snapshot.location.name}, {snapshot.location.state}
          </h2>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#9FB0C7]">
            <span>
              {t(lang, 'sourcePrefix')} <strong className="text-[#E6EDF7]">{snapshot.sourceName}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {t(lang, 'observedPrefix')} <strong className="text-[#E6EDF7]">{observedText}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className={`font-semibold ${snapshot.isStale ? 'text-amber-300' : 'text-[#5DCAA5]'}`}>
              {freshness}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-[#38BDF8]">
              {lang === 'hi' ? 'स्वतः जांच हर 5 मिनट' : 'Auto-checks every 5m'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#0C1322] hover:bg-[#7DD3FC] disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#0C1322] ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{loading ? t(lang, 'refreshing') : t(lang, 'refreshData')}</span>
        </button>
      </div>

      {error || snapshot.isStale ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-xs text-amber-100"
        >
          <div className="space-y-0.5">
            <p className="font-semibold">
              Live air quality data is temporarily unavailable.
            </p>
            <p className="text-amber-200/90">
              {lang === 'hi'
                ? `पिछली सफल रीडिंग दिखाई जा रही है (${observedText} · ${freshness})।`
                : `Showing last successful reading from ${observedText} (${freshness}) — clearly marked as an older cached reading.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-[#38BDF8]/50 bg-[#0C1322] px-3 py-1 font-semibold text-[#38BDF8] hover:bg-[#182947]"
          >
            {t(lang, 'retryFetch')}
          </button>
        </div>
      ) : null}

      {/* ALL-AGES VERDICT CALLOUT */}
      <div className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${verdictStyle}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {verdict.statusLevel === 'safe' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#5DCAA5]" aria-hidden="true" />
            ) : verdict.statusLevel === 'caution' ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
            )}
            <span className="text-xs font-bold uppercase tracking-wide text-[#E6EDF7]">
              {lang === 'hi' ? 'सरल निर्णय — अभी बाहर जाएं या नहीं?' : 'Quick Everyday Answer — Can I Go Outside Right Now?'}
            </span>
          </div>

          <div
            role="tablist"
            aria-label={lang === 'hi' ? 'किसके लिए जांच रहे हैं' : 'Who is checking?'}
            className="flex flex-wrap items-center gap-1"
          >
            {audienceOptions.map((opt) => {
              const active = audience === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAudience(opt.key)}
                  className={`min-h-[30px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                      : 'border-white/12 bg-[#0C1322]/75 text-[#E6EDF7] hover:bg-[#182947]'
                  }`}
                >
                  {lang === 'hi' ? opt.labelHi : opt.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold font-display sm:text-xl text-[#E6EDF7]">{verdict.headline}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#E6EDF7]/90">{verdict.body}</p>
        </div>
      </div>

      {/* ARCHITECTURAL TOP METRICS ROW (5 + 4 + 3 = 12 cols) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 5 Cols: Deep Cosmic Indigo Stage US AQI + Progress Ring */}
        <div className="flex items-center gap-4 rounded-2xl border border-[#38BDF8]/25 bg-[#182947] p-5 text-[#E6EDF7] lg:col-span-5">
          <AirProgressRing
            usAqi={snapshot.current.usAqi}
            label={lang === 'hi' ? usLabel.hi : usLabel.en}
            size={118}
            strokeWidth={9}
            theme="dark"
            lang={lang}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
              {t(lang, 'usAqiLabel')} · Scale 0–500
              {snapshot.usAqiDerivedFromPm25 ? ' (EPA PM2.5)' : ''}
            </p>
            <p className="font-display text-xl font-semibold text-white leading-tight">
              {lang === 'hi' ? usLabel.hi : usLabel.en}
            </p>
            <p className="text-xs text-[#9FB0C7] font-mono-tabular">
              {t(lang, 'dominantPollutant')}: <strong className="text-[#E6EDF7]">{snapshot.dominantPollutant}</strong>
              {' · '}PM2.5 {snapshot.current.pm25} µg/m³
            </p>
            <p className="text-xs font-semibold text-[#5DCAA5] font-mono-tabular">
              {lang === 'hi'
                ? `WHO 2021 सीमा से ${whoMultiple}×`
                : `${whoMultiple}× WHO 2021 limit`}
            </p>
            <p className="text-[11px] text-[#9FB0C7]/80 font-mono-tabular truncate">
              {snapshot.sourceName} · {freshness}
            </p>
          </div>
        </div>

        {/* 4 Cols: Smoked Obsidian Indian CPCB & European AQI Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/12 bg-[#142138] p-5 text-[#E6EDF7] lg:col-span-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
              {t(lang, 'cpcbLabel')}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <CategoryBadge
                categoryKey={snapshot.cpcb.categoryKey}
                label={lang === 'hi' ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn}
              />
            </div>
            <p className="mt-2.5 text-xs text-[#E6EDF7] font-mono-tabular">
              CPCB est. index: <strong>{snapshot.cpcb.estimatedSubIndex}</strong> ({snapshot.cpcb.dominantPmPollutant} driven)
            </p>
            {euLabel && snapshot.current.europeanAqi !== null && snapshot.current.europeanAqi !== undefined ? (
              <p className="mt-1 text-xs text-[#9FB0C7] font-mono-tabular">
                {lang === 'hi' ? 'यूरोपीय EAQI:' : 'European EAQI:'}{' '}
                <strong className="text-[#E6EDF7]">{snapshot.current.europeanAqi}</strong> ({lang === 'hi' ? euLabel.hi : euLabel.en})
              </p>
            ) : null}

            <div className="mt-3 space-y-1">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#0C1322] flex">
                <div className="h-full w-1/6 bg-[#5DCAA5]" title="Good (0-30)" />
                <div className="h-full w-1/6 bg-[#38BDF8]" title="Satisfactory (31-60)" />
                <div className="h-full w-1/6 bg-amber-400" title="Moderate (61-90)" />
                <div className="h-full w-1/6 bg-orange-400" title="Poor (91-120)" />
                <div className="h-full w-1/6 bg-rose-400" title="Very Poor (121-250)" />
                <div className="h-full w-1/6 bg-red-500" title="Severe (250+)" />
              </div>
              <div className="flex justify-between text-[10px] text-[#9FB0C7] font-mono-tabular">
                <span>Good</span>
                <span>Mod</span>
                <span>Poor</span>
                <span>Severe</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[#9FB0C7]">
            {lang === 'hi' ? snapshot.cpcb.attributionLabelHi : snapshot.cpcb.attributionLabelEn}
          </p>
        </div>

        {/* 3 Cols: Midnight Obsidian Live Weather & Dispersion Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/12 bg-[#0C1322]/85 p-5 text-[#E6EDF7] lg:col-span-3">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9FB0C7]">
                {t(lang, 'weatherLabel')}
              </p>
              <span className="text-[11px] font-semibold text-[#38BDF8]">
                {lang === 'hi' ? snapshot.weather.weatherLabelHi : snapshot.weather.weatherLabelEn}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className="flex items-center gap-1 text-[11px] text-[#9FB0C7]">
                  <Thermometer className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                  <span>{t(lang, 'tempLabel')}</span>
                </div>
                <p className="mt-1 text-xl font-bold font-mono-tabular text-[#E6EDF7]">
                  {snapshot.weather.temperatureC !== null ? `${snapshot.weather.temperatureC}°C` : '--'}
                </p>
                {snapshot.weather.apparentTemperatureC !== null &&
                snapshot.weather.apparentTemperatureC !== undefined ? (
                  <p className="text-[10px] text-[#9FB0C7] font-mono-tabular">
                    Feels {snapshot.weather.apparentTemperatureC}°
                  </p>
                ) : null}
              </div>
              <div>
                <div className="flex items-center gap-1 text-[11px] text-[#9FB0C7]">
                  <Droplets className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                  <span>RH</span>
                </div>
                <p className="mt-1 text-xl font-bold font-mono-tabular text-[#E6EDF7]">
                  {snapshot.weather.humidityPct !== null ? `${snapshot.weather.humidityPct}%` : '--'}
                </p>
                {snapshot.weather.precipitationMm !== null &&
                snapshot.weather.precipitationMm !== undefined ? (
                  <p className="text-[10px] text-[#9FB0C7] font-mono-tabular">
                    Rain {snapshot.weather.precipitationMm}mm
                  </p>
                ) : null}
              </div>
              <div>
                <div className="flex items-center gap-1 text-[11px] text-[#9FB0C7]">
                  <Wind className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                  <span>Wind</span>
                </div>
                <p className="mt-1 text-xl font-bold font-mono-tabular text-[#E6EDF7]">
                  {snapshot.weather.windSpeedKmh !== null ? snapshot.weather.windSpeedKmh : '--'}
                </p>
                <p className="text-[10px] text-[#9FB0C7] font-mono-tabular">
                  {snapshot.weather.windSpeedKmh !== null ? 'km/h' : 'unavailable'}
                  {snapshot.current.uvIndex !== null && snapshot.current.uvIndex !== undefined ? ` · UV ${snapshot.current.uvIndex}` : ''}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-medium text-[#9FB0C7]">
            {snapshot.weather.windSpeedKmh === null
              ? lang === 'hi'
                ? 'ताजा हवा गति डेटा अभी उपलब्ध नहीं है।'
                : 'Live surface wind reading temporarily unavailable.'
              : snapshot.weather.windSpeedKmh < 7
              ? lang === 'hi'
                ? 'धीमी हवा — प्रदूषक जमीन के पास रुक सकते हैं।'
                : 'Calm wind (<7 km/h) — smog lingers near streets.'
              : lang === 'hi'
              ? 'अच्छी हवा गति — प्रदूषकों के फैलने में मदद मिलती है।'
              : 'Steady breeze helps disperse urban smog.'}
          </p>
        </div>
      </div>

      {/* MULTI-SOURCE CROSS-VERIFICATION BAR */}
      {snapshot.verification ? (
        <div
          aria-label={lang === 'hi' ? 'बहु-स्रोत AQI सत्यापन' : 'Multi-source AQI verification'}
          className="flex flex-col gap-2.5 rounded-2xl border border-white/12 bg-[#0C1322]/90 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5 sm:items-center">
            {snapshot.verification.overallAgreement === 'high_agreement' ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5DCAA5] sm:mt-0" aria-hidden="true" />
            ) : snapshot.verification.overallAgreement === 'moderate_variance' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300 sm:mt-0" aria-hidden="true" />
            ) : (
              <Radio className="mt-0.5 h-4 w-4 shrink-0 text-[#38BDF8] sm:mt-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-[#E6EDF7]">
                {lang === 'hi' ? 'क्रॉस-सत्यापन:' : 'Double-Check:'}{' '}
                <span
                  className={
                    snapshot.verification.overallAgreement === 'high_agreement'
                      ? 'text-[#5DCAA5]'
                      : snapshot.verification.overallAgreement === 'moderate_variance'
                      ? 'text-amber-300'
                      : 'text-[#38BDF8]'
                  }
                >
                  {snapshot.verification.overallAgreement === 'high_agreement'
                    ? lang === 'hi'
                      ? 'मॉडल + ग्राउंड सेंसर सहमत'
                      : 'Model + Ground Sensors Agree'
                    : snapshot.verification.overallAgreement === 'moderate_variance'
                    ? lang === 'hi'
                      ? 'स्थानीय सेंसर अंतर पाया गया'
                      : 'Local Street Sensor Variance'
                    : lang === 'hi'
                    ? 'CAMS + US EPA + CPCB सूत्र सत्यापित'
                    : 'CAMS + US EPA & CPCB Formula Verified'}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#9FB0C7]">
                {lang === 'hi' ? snapshot.verification.notesHi : snapshot.verification.notesEn}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono-tabular text-[11px] shrink-0">
            <div className="rounded-lg border border-white/10 bg-[#142138] px-2.5 py-1">
              <span className="text-[#9FB0C7]">EPA PM2.5 Check: </span>
              <strong className="text-[#E6EDF7]">{snapshot.verification.epaCalculatedUsAqi}</strong>
              <span className="text-[#9FB0C7]"> (Δ{snapshot.verification.usAqiDelta})</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#142138] px-2.5 py-1">
              <span className="text-[#9FB0C7]">
                {lang === 'hi' ? 'ग्राउंड सेंसर: ' : 'Ground Nodes: '}
              </span>
              {snapshot.verification.groundCheck.status === 'matched' &&
              snapshot.verification.groundCheck.medianPm25 !== null ? (
                <strong className="text-[#5DCAA5]">
                  {snapshot.verification.groundCheck.outdoorSensorCount} ·{' '}
                  {snapshot.verification.groundCheck.medianPm25} µg/m³
                </strong>
              ) : (
                <strong className="text-[#9FB0C7]">
                  {lang === 'hi' ? '35km में 0' : '0 in 35km'}
                </strong>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* STRUCTURED 6-TILE POLLUTANT GRID (with Table toggle) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#E6EDF7]">{t(lang, 'pollutantTableTitle')}</h3>
          <div className="inline-flex items-center rounded-xl border border-white/12 bg-[#0C1322] p-0.5">
            <button
              type="button"
              onClick={() => setPollutantView('bento')}
              className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                pollutantView === 'bento' ? 'bg-[#182947] text-[#38BDF8]' : 'text-[#9FB0C7]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{lang === 'hi' ? 'ग्रिड' : 'Grid'}</span>
            </button>
            <button
              type="button"
              onClick={() => setPollutantView('table')}
              className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                pollutantView === 'table' ? 'bg-[#182947] text-[#38BDF8]' : 'text-[#9FB0C7]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{lang === 'hi' ? 'तालिका' : 'Table'}</span>
            </button>
          </div>
        </div>

        {pollutantView === 'bento' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {pollutantCards.map((item) => {
              const barPct =
                item.value === null
                  ? 0
                  : Math.min(100, Math.max(8, Math.round((item.value / item.refMax) * 100)));
              return (
                <div
                  key={item.name}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0C1322]/80 p-4"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={`text-xs font-bold ${item.accentText}`}>{item.name}</span>
                      <span className="font-mono-tabular text-[10px] text-[#9FB0C7]">{item.unit}</span>
                    </div>
                    <p className="mt-1.5 font-mono-tabular text-2xl font-extrabold tracking-tight text-[#E6EDF7]">
                      {item.value === null ? '—' : item.value}
                    </p>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${item.barFill}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <p className="text-[10px] font-medium text-[#9FB0C7] leading-snug">
                      {item.value === null
                        ? lang === 'hi'
                          ? 'डेटा उपलब्ध नहीं'
                          : 'Not reported for this hour'
                        : item.note}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/12">
            <table className="min-w-full divide-y divide-white/10 text-left text-xs">
              <thead className="bg-[#0C1322] text-[#9FB0C7]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Pollutant</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-right">Reading</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Source & Freshness</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Primary Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#101A2C]">
                {pollutantCards.map((row) => (
                  <tr key={row.name} className="hover:bg-[#182947]/70">
                    <td className="px-4 py-2.5 font-semibold text-[#E6EDF7]">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#38BDF8]">
                      {row.value === null ? 'Not reported' : `${row.value} ${row.unit}`}
                    </td>
                    <td className="px-4 py-2.5 text-[#9FB0C7] font-mono-tabular">
                      Open-Meteo · {freshness}
                    </td>
                    <td className="px-4 py-2.5 text-[#9FB0C7]">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lazy-loaded 24-hour Forecast Chart */}
      <div className="border-t border-white/10 pt-5">
        <Suspense
          fallback={
            <div className="h-56 w-full animate-pulse rounded-2xl bg-[#0C1322] p-4 text-xs text-[#9FB0C7]">
              Loading 24-hour forecast chart...
            </div>
          }
        >
          <HourlyForecastChart
            hourly24={snapshot.hourly24}
            cleanestWindow={snapshot.cleanestWindow}
            worstWindow={snapshot.worstWindow}
            lang={lang}
          />
        </Suspense>
      </div>
    </section>
  );
}
