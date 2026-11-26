import type {
  AirQualitySnapshot,
  CommuteMode,
  HouseholdProfile,
  WhatIfChoices,
  WhatIfResult,
  WhatIfStepBreakdown,
} from '../types/vayu';

// Standard India passenger emission factors (kg CO2e per passenger-km)
export const CO2_KG_PER_PKM: Record<CommuteMode, number> = {
  car: 0.171,
  two_wheeler: 0.058,
  bus: 0.042,
  metro: 0.025,
  walk: 0,
  wfh: 0,
};

// Relative personal PM2.5 inhalation exposure multiplier compared to ambient roadside air (1.0)
export const MODE_PM_FACTOR: Record<CommuteMode, number> = {
  two_wheeler: 1.25, // open exhaust-plume exposure
  walk: 1.05, // elevated breathing rate outdoors
  bus: 0.85,
  car: 0.65, // closed cabin with recirculation / AC
  metro: 0.45, // enclosed climate-controlled rail
  wfh: 0.35, // indoor baseline
};

export function calculateCommuteShiftImpact(
  fromMode: CommuteMode,
  toMode: CommuteMode | 'carpool',
  oneWayDistanceKm: number,
  ambientPm25: number
): {
  co2SavedPerTripKg: number;
  co2SavedWeeklyKg: number;
  exposureChangePct: number;
  formulaDetail: string;
} {
  const safeDist = Math.max(1, oneWayDistanceKm || 8);
  const fromCo2 = CO2_KG_PER_PKM[fromMode];
  const toCo2 = toMode === 'carpool' ? CO2_KG_PER_PKM.car / 2.5 : CO2_KG_PER_PKM[toMode];
  const co2SavedPerTripKg = Math.max(0, Number(((fromCo2 - toCo2) * safeDist).toFixed(2)));
  const co2SavedWeeklyKg = Number((co2SavedPerTripKg * 10).toFixed(1)); // 5 workdays x 2 trips

  const fromFactor = MODE_PM_FACTOR[fromMode];
  const toFactor = toMode === 'carpool' ? MODE_PM_FACTOR.car : MODE_PM_FACTOR[toMode];
  const exposureDeltaPct = Math.round(((toFactor - fromFactor) / fromFactor) * 100);

  const formulaDetail =
    `CO2 saved/trip = (${fromCo2.toFixed(3)} - ${toCo2.toFixed(3)}) kg/km × ${safeDist} km = ${co2SavedPerTripKg} kg CO2e. ` +
    `Personal PM2.5 exposure estimate compares mode intake factors (${fromMode}: ${fromFactor} vs ${toMode}: ${toFactor}) at current ${Math.round(ambientPm25)} µg/m³.`;

  return {
    co2SavedPerTripKg,
    co2SavedWeeklyKg,
    exposureChangePct: exposureDeltaPct,
    formulaDetail,
  };
}

export function calculateRequiredCadr(roomSizeSqFt: number): {
  roomAreaSqM: number;
  roomVolumeM3: number;
  recommendedCadrM3Hr: number;
  formulaDetail: string;
} {
  const safeSqFt = Math.max(80, Math.min(2000, roomSizeSqFt || 180));
  const roomAreaSqM = Number((safeSqFt * 0.0929).toFixed(1));
  const ceilingHeightM = 2.9; // typical Indian urban ceiling ~9.5 ft
  const roomVolumeM3 = Number((roomAreaSqM * ceilingHeightM).toFixed(1));
  const targetAch = 4.5; // 4.5 Air Changes per Hour for severe pollution protection
  const recommendedCadrM3Hr = Math.round(roomVolumeM3 * targetAch);

  const formulaDetail =
    `Room area ${safeSqFt} sq ft = ${roomAreaSqM} m². Volume = ${roomAreaSqM} m² × ${ceilingHeightM} m ceiling = ${roomVolumeM3} m³. ` +
    `Target CADR = ${roomVolumeM3} m³ × ${targetAch} air changes/hr ≈ ${recommendedCadrM3Hr} m³/hr.`;

  return {
    roomAreaSqM,
    roomVolumeM3,
    recommendedCadrM3Hr,
    formulaDetail,
  };
}

export function calculateActivityShiftImpact(
  peakPm25: number,
  cleanestPm25: number
): {
  reductionPct: number;
  formulaDetail: string;
} {
  const safePeak = Math.max(1, peakPm25);
  const safeClean = Math.max(0, Math.min(safePeak, cleanestPm25));
  const reductionPct = Math.round(((safePeak - safeClean) / safePeak) * 100);

  return {
    reductionPct,
    formulaDetail:
      `Estimated exposure reduction = ((${Math.round(safePeak)} peak µg/m³ − ${Math.round(safeClean)} cleanest µg/m³) / ${Math.round(safePeak)}) × 100 = ${reductionPct}% (assumes outdoor duration stays constant).`,
  };
}

export function calculateWhatIfImpact(
  choices: WhatIfChoices,
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile
): WhatIfResult {
  const breakdown: WhatIfStepBreakdown[] = [];
  const distanceKm = Math.max(2, profile.oneWayDistanceKm || 8);
  const ambientPm = Math.max(1, snapshot.current.pm25);

  // Multiplicative remaining exposure fraction (starts at 1.0 = 100% baseline personal exposure)
  let remainingFraction = 1.0;
  let weeklyCo2SavedKg = 0;

  if (choices.switchToTransit) {
    const targetMode: CommuteMode = profile.commuteMode === 'metro' ? 'wfh' : 'metro';
    const commuteImpact = calculateCommuteShiftImpact(
      profile.commuteMode,
      targetMode,
      distanceKm,
      ambientPm
    );
    // Commute accounts for ~22% of daily inhaled PM dose on high-traffic roads
    const dailyDoseDropPct = profile.commuteMode === 'wfh'
      ? 0
      : Math.max(4, Math.min(18, Math.round(Math.abs(commuteImpact.exposureChangePct) * 0.25)));

    remainingFraction *= 1 - dailyDoseDropPct / 100;
    weeklyCo2SavedKg += commuteImpact.co2SavedWeeklyKg;

    breakdown.push({
      key: 'switchToTransit',
      label: profile.language === 'hi'
        ? 'मेट्रो/बस या ट्रिप शिफ्ट अपनाएं'
        : 'Switch commute to Metro / Bus',
      exposureReductionPct: dailyDoseDropPct,
      co2SavedKgPerWeek: commuteImpact.co2SavedWeeklyKg,
      formula: commuteImpact.formulaDetail,
    });
  }

  if (choices.combineErrands) {
    const savedTripKm = Math.max(3, Math.round(distanceKm * 0.6));
    const perErrandCo2 = CO2_KG_PER_PKM[profile.commuteMode === 'wfh' ? 'two_wheeler' : profile.commuteMode] * savedTripKm;
    const weeklyErrandCo2 = Number((perErrandCo2 * 3).toFixed(1)); // 3 combined errands/week
    const dailyDropPct = 5;
    remainingFraction *= 1 - dailyDropPct / 100;
    weeklyCo2SavedKg += weeklyErrandCo2;

    breakdown.push({
      key: 'combineErrands',
      label: profile.language === 'hi'
        ? 'बाहरी काम एक ही ट्रिप में जोड़ें'
        : 'Combine errands into one trip',
      exposureReductionPct: dailyDropPct,
      co2SavedKgPerWeek: weeklyErrandCo2,
      formula: `Eliminating 3 extra ${savedTripKm} km local trips/week saves ${weeklyErrandCo2} kg CO2e/wk and cuts ~5% daily roadside exposure.`,
    });
  }

  if (choices.runPurifier) {
    // HEPA purifier running in main living/sleeping room (~14h/day indoors) reduces indoor fraction ~45% -> ~32% total daily dose reduction
    const dailyDropPct = 32;
    remainingFraction *= 1 - dailyDropPct / 100;
    breakdown.push({
      key: 'runPurifier',
      label: profile.language === 'hi'
        ? 'बंद कमरे में HEPA प्यूरीफायर चलाएं'
        : 'Run properly sized HEPA purifier',
      exposureReductionPct: dailyDropPct,
      co2SavedKgPerWeek: 0,
      formula: `Mass-balance estimate: CADR ≥ 4.5 ACH in a closed ${profile.roomSizeSqFt} sq ft room lowers indoor PM2.5 by ~45–55%, cutting total 24h personal dose by ~32% (assumes doors/windows stay sealed).`,
    });
  }

  if (choices.shiftOutdoorActivity) {
    const shift = calculateActivityShiftImpact(
      snapshot.worstWindow.avgPm25,
      snapshot.cleanestWindow.avgPm25
    );
    // Shifting 1-2h outdoor activity from peak to cleanest window yields ~35% of the window delta on daily dose
    const dailyDropPct = Math.max(4, Math.min(22, Math.round(shift.reductionPct * 0.35)));
    remainingFraction *= 1 - dailyDropPct / 100;

    breakdown.push({
      key: 'shiftOutdoorActivity',
      label: profile.language === 'hi'
        ? 'बाहरी गतिविधि सबसे साफ समय पर शिफ्ट करें'
        : 'Shift outdoor activity to cleanest window',
      exposureReductionPct: dailyDropPct,
      co2SavedKgPerWeek: 0,
      formula: `${shift.formulaDetail} Weighted for ~2 hours outdoors/day → ~${dailyDropPct}% estimated daily exposure reduction.`,
    });
  }

  if (choices.wearN95Mask) {
    // Well-fitted N95/FFP2 filters ~80-90% of PM2.5 while outdoors (~25% of day) -> ~20% daily dose drop
    const dailyDropPct = 20;
    remainingFraction *= 1 - dailyDropPct / 100;
    breakdown.push({
      key: 'wearN95Mask',
      label: profile.language === 'hi'
        ? 'बाहर सही फिटिंग वाला N95/FFP2 मास्क पहनें'
        : 'Wear well-fitted N95 / FFP2 mask outdoors',
      exposureReductionPct: dailyDropPct,
      co2SavedKgPerWeek: 0,
      formula: `Properly sealed N95/FFP2 filters ~85% of PM2.5 during outdoor hours (~20% daily inhaled dose reduction; leaks around nose bridge sharply reduce benefit).`,
    });
  }

  if (choices.sealAndDampMop) {
    // Sealing gaps + damp mopping + zero indoor smoke reduces indoor infiltration & resuspension ~15% -> ~11% daily dose drop
    const dailyDropPct = 11;
    remainingFraction *= 1 - dailyDropPct / 100;
    breakdown.push({
      key: 'sealAndDampMop',
      label: profile.language === 'hi'
        ? 'दरारें सील करें और गीला पोंछा लगाएं'
        : 'Seal window gaps, damp mop & avoid incense',
      exposureReductionPct: dailyDropPct,
      co2SavedKgPerWeek: 0,
      formula: `Reducing air exchange rate via door/window draft strips + damp mopping + avoiding incense/coils typically lowers indoor PM2.5 by ~12–20% (~11% daily dose estimate).`,
    });
  }

  const totalExposureReductionPct = Math.min(
    82,
    Math.max(0, Math.round((1 - remainingFraction) * 100))
  );
  const estimatedBaselineDoseIndex = Math.round(ambientPm * 0.72); // baseline indoor/outdoor weighted avg µg/m³
  const estimatedAdjustedDoseIndex = Math.max(
    5,
    Math.round(estimatedBaselineDoseIndex * (1 - totalExposureReductionPct / 100))
  );

  return {
    totalExposureReductionPct,
    estimatedBaselineDoseIndex,
    estimatedAdjustedDoseIndex,
    weeklyCo2SavedKg: Number(weeklyCo2SavedKg.toFixed(1)),
    monthlyCo2SavedKg: Number((weeklyCo2SavedKg * 4.3).toFixed(1)),
    breakdown,
    assumptionsAndLimits:
      profile.language === 'hi'
        ? 'ये मानक मान्यताओं (भारत औसत उत्सर्जन कारक, 4.5 ACH प्यूरीफायर, बंद कमरे और सही मास्क फिटिंग) पर आधारित अनुमान हैं। वास्तविक लाभ घर के वेंटिलेशन और बाहर बिताए समय के अनुसार बदलता है।'
        : 'Estimates use standard assumptions (India passenger CO2 factors, 4.5 ACH HEPA sizing, closed-window compliance, and tight N95 seal). Actual personal exposure varies with building leakage, traffic proximity, and time spent outdoors.',
  };
}
