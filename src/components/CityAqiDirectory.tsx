import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Globe, Radio, RefreshCw, Search } from 'lucide-react';
import {
  ALL_MONITORED_CITIES,
  ALL_WORLD_REGIONS,
  GLOBAL_REGIONS,
  INDIA_REGIONS,
  type MonitoredCityMeta,
  type WorldRegion,
} from '../lib/aqiCities';
import {
  fetchBatchCitiesLiveAqi,
  formatFreshnessLabel,
  searchGlobalCities,
  type LiveCityAqiEntry,
} from '../lib/airQualityService';
import { getLocationVisualAsset } from '../lib/cityMedia';
import { CPCB_CATEGORY_STYLES } from '../lib/cpcb';
import type { IndianLocation, Language } from '../types/vayu';

interface CityAqiDirectoryProps {
  selectedLocation: IndianLocation;
  onSelectLocation: (loc: IndianLocation) => void;
  lang: Language;
}

type SortMode = 'name' | 'aqi_desc' | 'aqi_asc';
type ScopeTab = 'all' | 'India' | 'World';
type RegionOrCapitalFilter = 'ALL' | 'CAPITALS' | WorldRegion;

export function CityAqiDirectory({
  selectedLocation,
  onSelectLocation,
  lang,
}: CityAqiDirectoryProps) {
  const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
  const [regionFilter, setRegionFilter] = useState<RegionOrCapitalFilter>('CAPITALS');
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [readingsById, setReadingsById] = useState<Record<string, LiveCityAqiEntry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [globalLookupResults, setGlobalLookupResults] = useState<IndianLocation[]>([]);
  const [globalLookupLoading, setGlobalLookupLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleRegions = useMemo(() => {
    if (scopeTab === 'India') return INDIA_REGIONS;
    if (scopeTab === 'World') return GLOBAL_REGIONS;
    return ALL_WORLD_REGIONS;
  }, [scopeTab]);

  // Reset regionFilter smoothly when changing continent scope tab
  const handleChangeScope = (next: ScopeTab) => {
    setScopeTab(next);
    if (next === 'India') {
      if (regionFilter !== 'ALL' && regionFilter !== 'CAPITALS' && !INDIA_REGIONS.includes(regionFilter)) {
        setRegionFilter('CAPITALS');
      }
    } else if (next === 'World') {
      if (regionFilter !== 'ALL' && !GLOBAL_REGIONS.includes(regionFilter as WorldRegion)) {
        setRegionFilter('Europe');
      }
    }
  };

  const filteredCities = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const list = ALL_MONITORED_CITIES.filter((city) => {
      if (scopeTab !== 'all' && city.countryGroup !== scopeTab) return false;
      // When typing a search query, search across the entire active scope automatically!
      if (!q && regionFilter === 'CAPITALS' && !city.capitalLabel) return false;
      if (!q && regionFilter !== 'ALL' && regionFilter !== 'CAPITALS' && city.region !== regionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        city.name.toLowerCase().includes(q) ||
        city.state.toLowerCase().includes(q) ||
        city.region.toLowerCase().includes(q) ||
        city.stationNetwork.toLowerCase().includes(q) ||
        (city.capitalLabel ? city.capitalLabel.toLowerCase().includes(q) : false)
      );
    });

    const sorted = [...list];
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'aqi_desc') {
      sorted.sort((a, b) => {
        const ra = readingsById[a.id]?.usAqi ?? -1;
        const rb = readingsById[b.id]?.usAqi ?? -1;
        return rb - ra || a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'aqi_asc') {
      sorted.sort((a, b) => {
        const ra = readingsById[a.id]?.usAqi ?? 9999;
        const rb = readingsById[b.id]?.usAqi ?? 9999;
        return ra - rb || a.name.localeCompare(b.name);
      });
    }
    return sorted;
  }, [scopeTab, regionFilter, searchText, sortMode, readingsById]);

  const loadRegionStations = useCallback(
    async (citiesToLoad: MonitoredCityMeta[], forceRefresh = false) => {
      if (citiesToLoad.length === 0) return;
      setLoading(true);
      setError(null);
      try {
        const batch = await fetchBatchCitiesLiveAqi(citiesToLoad, { forceRefresh });
        setReadingsById((prev) => ({ ...prev, ...batch }));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load live AQI station batch.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const targetList =
      regionFilter === 'ALL' && searchText.trim().length === 0
        ? filteredCities.slice(0, 20)
        : regionFilter === 'CAPITALS'
        ? filteredCities.slice(0, 36)
        : filteredCities.slice(0, 24);

    const hasMissing = targetList.some((c) => !readingsById[c.id]);
    if (hasMissing) {
      void loadRegionStations(targetList, false);
    }
  }, [regionFilter, searchText, filteredCities, readingsById, loadRegionStations]);

  const handleLoadAllVisible = () => {
    void loadRegionStations(filteredCities, true);
  };

  const handleGlobalSearch = async () => {
    const trimmed = searchText.trim();
    if (trimmed.length < 2) return;
    setGlobalLookupLoading(true);
    setError(null);
    try {
      const hits = await searchGlobalCities(trimmed, { scope: 'all' });
      setGlobalLookupResults(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Global geocoding search failed.');
    } finally {
      setGlobalLookupLoading(false);
    }
  };

  const indiaCount = useMemo(
    () => ALL_MONITORED_CITIES.filter((c) => c.countryGroup === 'India').length,
    []
  );
  const capitalsCount = useMemo(
    () => ALL_MONITORED_CITIES.filter((c) => Boolean(c.capitalLabel)).length,
    []
  );
  const worldCount = useMemo(
    () => ALL_MONITORED_CITIES.filter((c) => c.countryGroup === 'World').length,
    []
  );

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {
      CAPITALS: capitalsCount,
      ALL:
        scopeTab === 'all'
          ? ALL_MONITORED_CITIES.length
          : scopeTab === 'India'
          ? indiaCount
          : worldCount,
    };
    ALL_WORLD_REGIONS.forEach((r) => {
      counts[r] = ALL_MONITORED_CITIES.filter((c) => c.region === r).length;
    });
    return counts;
  }, [scopeTab, indiaCount, capitalsCount, worldCount]);

  return (
    <section
      id="all-cities"
      aria-labelledby="all-cities-heading"
      className="obsidian-surface rounded-3xl p-5 sm:p-7 space-y-5"
    >
      {/* Section Header */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#67E8F9]">
            02. {lang === 'hi' ? 'वैश्विक और भारतीय AQI नेटवर्क' : 'Global & India Airshed Directory'}
          </p>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-[#67E8F9]" aria-hidden="true" />
            <h2
              id="all-cities-heading"
              className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display"
            >
              {lang === 'hi'
                ? `दुनिया और भारत के ${ALL_MONITORED_CITIES.length} AQI-निगरानी शहर`
                : `Worldwide & All-India AQI Meter Network (${ALL_MONITORED_CITIES.length} Cities)`}
            </h2>
          </div>
          <p className="text-xs text-[#A7A3C7]">
            {lang === 'hi'
              ? 'CPCB, EPA, EEA, AirKorea और Open-Meteo (CAMS/ECMWF) द्वारा आच्छादित शहर। किसी भी शहर पर क्लिक करके लाइव पूर्वानुमान और 3D ग्लोब देखें।'
              : 'Live Open-Meteo (CAMS/ECMWF) telemetry across global capitals, coastal hubs, and Indian CAAQMS stations. Search any town on Earth.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadAllVisible}
          disabled={loading || filteredCities.length === 0}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#67E8F9] px-4 py-2 text-xs font-semibold text-[#0B0A16] hover:bg-[#A5F3FC] disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-[#0B0A16] ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>
            {loading
              ? lang === 'hi'
                ? 'लाइव डेटा लोड हो रहा है...'
                : 'Fetching Live Stations...'
              : lang === 'hi'
              ? `दिख रहे ${filteredCities.length} शहरों का लाइव AQI जांचें`
              : `Fetch Live AQI (${filteredCities.length} shown)`}
          </span>
        </button>
      </div>

      {/* Scope Bar (All Worldwide | India | Global) + Region Tabs + Search + Sort */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Geographic Scope Filter */}
          <div
            role="group"
            aria-label="Geographic scope"
            className="inline-flex items-center rounded-xl border border-white/12 bg-[#0B0A16] p-1 self-start"
          >
            {([
              { key: 'all' as const, labelEn: `World & India (${ALL_MONITORED_CITIES.length})`, labelHi: `दुनिया व भारत (${ALL_MONITORED_CITIES.length})` },
              { key: 'India' as const, labelEn: `India (${indiaCount})`, labelHi: `भारत (${indiaCount})` },
              { key: 'World' as const, labelEn: `Global (${worldCount})`, labelHi: `विश्व (${worldCount})` },
            ]).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleChangeScope(item.key)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  scopeTab === item.key
                    ? 'bg-[#14163F] text-[#67E8F9]'
                    : 'text-[#A7A3C7] hover:text-[#E6EDF7]'
                }`}
              >
                {lang === 'hi' ? item.labelHi : item.labelEn}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A7A3C7]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setGlobalLookupResults([]);
                }}
                placeholder={
                  lang === 'hi'
                    ? 'कोई भी शहर, राज्य या देश खोजें...'
                    : 'Filter city, country, or region...'
                }
                aria-label="Filter monitored cities"
                className="min-h-[38px] w-full rounded-xl border border-white/12 bg-[#0B0A16] pl-8 pr-3 text-xs text-[#E6EDF7] placeholder:text-[#A7A3C7]/70 focus:border-[#67E8F9] focus:bg-[#14122E] focus:outline-none"
              />
            </div>

            {searchText.trim().length >= 2 ? (
              <button
                type="button"
                onClick={() => void handleGlobalSearch()}
                disabled={globalLookupLoading}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#67E8F9]/45 bg-[#14163F] px-3 py-1.5 text-xs font-semibold text-[#67E8F9] hover:bg-[#1C1F52] whitespace-nowrap shrink-0"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {globalLookupLoading
                    ? lang === 'hi'
                      ? 'खोज रहे हैं...'
                      : 'Searching...'
                    : lang === 'hi'
                    ? 'पूरे विश्व में खोजें'
                    : 'Search Worldwide'}
                </span>
              </button>
            ) : null}

            <div className="inline-flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#A7A3C7]" aria-hidden="true" />
              <select
                aria-label="Sort cities"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="min-h-[38px] rounded-xl border border-white/12 bg-[#0B0A16] px-2.5 text-xs font-medium text-[#E6EDF7]"
              >
                <option value="name">
                  {lang === 'hi' ? 'नाम (A–Z)' : 'Sort: Name (A–Z)'}
                </option>
                <option value="aqi_desc">
                  {lang === 'hi' ? 'सबसे अधिक AQI पहले' : 'Sort: Highest AQI'}
                </option>
                <option value="aqi_asc">
                  {lang === 'hi' ? 'सबसे साफ हवा पहले' : 'Sort: Cleanest AQI'}
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Region Filter Strip */}
        <div
          role="tablist"
          aria-label="Filter monitored cities by region"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(scopeTab === 'World'
            ? ([...visibleRegions, 'ALL'] as const)
            : (['CAPITALS', ...visibleRegions, 'ALL'] as const)
          ).map((region) => {
            const active = regionFilter === region && searchText.trim().length === 0;
            const label =
              region === 'CAPITALS'
                ? lang === 'hi'
                  ? `भारत की सभी राजधानियाँ (${regionCounts.CAPITALS})`
                  : `All India Capitals (${regionCounts.CAPITALS})`
                : region === 'ALL'
                ? lang === 'hi'
                  ? `सभी (${regionCounts.ALL})`
                  : `All (${regionCounts.ALL})`
                : `${region} (${regionCounts[region]})`;
            return (
              <button
                key={region}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSearchText('');
                  setGlobalLookupResults([]);
                  setRegionFilter(region);
                }}
                className={`min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#67E8F9] bg-[#67E8F9] text-[#0B0A16]'
                    : 'border-white/10 bg-[#0B0A16]/80 text-[#E6EDF7] hover:bg-[#14163F]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Worldwide Geocoding Lookup Results */}
      {globalLookupResults.length > 0 ? (
        <div className="rounded-2xl border border-[#5DCAA5]/35 bg-[#1D9E75]/12 p-4 space-y-2.5">
          <p className="text-xs font-semibold text-[#5DCAA5]">
            {lang === 'hi'
              ? `"${searchText.trim()}" के लिए Open-Meteo वैश्विक परिणाम (क्लिक करके चुनें):`
              : `Open-Meteo Worldwide Results for "${searchText.trim()}" (click to inspect live air):`}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {globalLookupResults.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => {
                  onSelectLocation(hit);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-[#0B0A16] px-3.5 py-2.5 text-left text-xs hover:border-[#67E8F9]"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-[#E6EDF7]">{hit.name}</p>
                  <p className="truncate text-[#A7A3C7]">{hit.state}</p>
                </div>
                <span className="font-mono-tabular text-[11px] font-semibold text-[#67E8F9] shrink-0">
                  Inspect →
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Explicit Error State with Retry */}
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/35 bg-rose-500/15 px-4 py-3 text-xs text-rose-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={handleLoadAllVisible}
            className="font-semibold text-[#67E8F9] underline hover:no-underline"
          >
            {lang === 'hi' ? 'पुनः प्रयास करें' : 'Retry live fetch'}
          </button>
        </div>
      ) : null}

      {/* Cities Grid */}
      {filteredCities.length === 0 ? (
        <div className="rounded-2xl border border-white/12 bg-[#0B0A16]/80 p-6 text-center space-y-3 text-xs text-[#A7A3C7]">
          <p>
            {lang === 'hi'
              ? 'क्युुरेटेड सूची में कोई मेल खाने वाला शहर नहीं मिला।'
              : 'No curated hub matches that name—you can query every town & city worldwide via Open-Meteo.'}
          </p>
          {searchText.trim().length >= 2 ? (
            <button
              type="button"
              onClick={() => void handleGlobalSearch()}
              disabled={globalLookupLoading}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#67E8F9] px-4 py-2 text-xs font-semibold text-[#0B0A16] hover:bg-[#A5F3FC]"
            >
              <Globe className="h-3.5 w-3.5 text-[#0B0A16]" aria-hidden="true" />
              <span>
                {lang === 'hi'
                  ? `दुनिया भर में "${searchText.trim()}" खोजें`
                  : `Find "${searchText.trim()}" anywhere on Earth`}
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCities.map((city) => {
            const reading = readingsById[city.id];
            const isSelected = selectedLocation.id === city.id;
            const cpcbStyle = reading
              ? CPCB_CATEGORY_STYLES[reading.cpcb.categoryKey]
              : null;
            const cityVisual = getLocationVisualAsset({
              id: city.id,
              name: city.name,
              state: city.state,
              latitude: city.latitude,
              longitude: city.longitude,
            });

            return (
              <button
                key={city.id}
                type="button"
                onClick={() => {
                  onSelectLocation({
                    id: city.id,
                    name: city.name,
                    state: city.state,
                    latitude: city.latitude,
                    longitude: city.longitude,
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
                  isSelected
                    ? 'border-[#67E8F9] bg-[#14163F] text-[#E6EDF7] shadow-[0_0_24px_-8px_rgba(103,232,249,0.35)]'
                    : reading && cpcbStyle
                    ? 'border-white/12 bg-[#14122E]/85 hover:border-[#67E8F9]/60'
                    : 'border-white/10 bg-[#0B0A16]/80 hover:border-[#67E8F9]/50 hover:bg-[#14122E]'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={cityVisual.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-xl object-cover shrink-0 border border-white/15"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#E6EDF7]">
                        {city.name}
                      </p>
                      <p className="truncate text-xs text-[#A7A3C7]">
                        {city.state}
                      </p>
                      {city.capitalLabel ? (
                        <p className="mt-0.5 truncate font-mono-tabular text-[10px] font-semibold text-[#5DCAA5]">
                          ★ {city.capitalLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {reading && cpcbStyle ? (
                    <div
                      className={`rounded-xl px-2.5 py-1 text-right shrink-0 border ${
                        isSelected
                          ? 'border-[#67E8F9]/40 bg-[#0B0A16] text-[#67E8F9]'
                          : 'border-white/10 bg-[#0B0A16] text-[#67E8F9]'
                      }`}
                    >
                      <p className="font-mono-tabular text-base font-extrabold leading-none">
                        {reading.usAqi}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#A7A3C7]">
                        AQI
                      </p>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold shrink-0 text-[#67E8F9]">
                      {lang === 'hi' ? 'चुनें →' : 'Inspect →'}
                    </span>
                  )}
                </div>

                <div className="mt-3 border-t border-white/10 pt-2.5 text-[11px]">
                  {reading && cpcbStyle ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-bold ${
                            isSelected ? 'text-[#5DCAA5]' : cpcbStyle.badgeText
                          }`}
                        >
                          {lang === 'hi' ? reading.cpcb.labelHi : reading.cpcb.labelEn}
                        </span>
                        <span className="font-mono-tabular text-[#E6EDF7]/90">
                          PM2.5: <strong>{reading.pm25}</strong> µg/m³
                        </span>
                      </div>
                      <p className="truncate text-[10px] font-mono-tabular text-[#A7A3C7]">
                        {reading.sourceName} · {formatFreshnessLabel(reading.fetchedAtIso, lang, nowMs)}
                      </p>
                    </div>
                  ) : (
                    <p className="truncate text-[#A7A3C7]">
                      {city.stationNetwork}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
