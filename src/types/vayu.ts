export type Language = 'en' | 'hi';

export type CommuteMode =
  | 'walk'
  | 'two_wheeler'
  | 'car'
  | 'bus'
  | 'metro'
  | 'wfh';

export type HomeType =
  | 'apartment'
  | 'independent_house'
  | 'ground_roadside';

export type BudgetTier = 'free' | 'low' | 'medium';

export type CpcbCategoryKey =
  | 'good'
  | 'satisfactory'
  | 'moderate'
  | 'poor'
  | 'very_poor'
  | 'severe';

export interface IndianLocation {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  isCurrentLocation?: boolean;
  exactAreaLabel?: string;
  accuracyMeters?: number;
}

export interface HouseholdMembers {
  childrenUnder12: boolean;
  schoolAgeKids: boolean;
  elderly60Plus: boolean;
  workingProfessionals: boolean;
  outdoorWorkers: boolean;
  respiratoryOrCardiacSensitive: boolean;
}

export interface HouseholdProfile {
  location: IndianLocation;
  members: HouseholdMembers;
  commuteMode: CommuteMode;
  morningLeaveHour: number; // 0-23
  eveningReturnHour: number; // 0-23
  oneWayDistanceKm: number;
  hasAirPurifier: boolean;
  roomSizeSqFt: number;
  hasIndoorPlants: boolean;
  homeType: HomeType;
  budget: BudgetTier;
  language: Language;
}

export interface PollutantReadings {
  pm25: number;
  pm10: number | null;
  usAqi: number;
  europeanAqi?: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  dustUgM3?: number | null;
  uvIndex?: number | null;
}

export interface WeatherReadings {
  temperatureC: number | null;
  apparentTemperatureC?: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  windGustsKmh?: number | null;
  precipitationMm?: number | null;
  weatherCode?: number | null;
  weatherLabelEn?: string;
  weatherLabelHi?: string;
}

export interface HourlyForecastPoint {
  timeIso: string;
  hourLabel: string;
  pm25: number;
  pm10: number | null;
  usAqi: number;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
}

export interface TimeWindowSummary {
  startIso: string;
  endIso: string;
  startLabel: string;
  endLabel: string;
  avgPm25: number;
  avgUsAqi: number;
}

export interface CpcbEvaluation {
  categoryKey: CpcbCategoryKey;
  labelEn: string;
  labelHi: string;
  estimatedSubIndex: number;
  pm25SubIndex: number;
  pm10SubIndex: number | null;
  dominantPmPollutant: 'PM2.5' | 'PM10';
  attributionLabelEn: string;
  attributionLabelHi: string;
}

export interface GroundSensorCrossCheck {
  providerName: string;
  radiusKm: number;
  stationCount: number;
  outdoorSensorCount: number;
  medianPm25: number | null;
  medianPm10: number | null;
  latestReadingIso: string | null;
  status: 'matched' | 'no_nearby_stations' | 'unavailable';
}

export interface AqiVerificationReport {
  primaryModelSource: string;
  epaCalculatedUsAqi: number;
  reportedUsAqi: number;
  usAqiDelta: number;
  modelParityStatus: 'exact_match' | 'within_tolerance' | 'divergent';
  cpcbSubIndex: number;
  groundCheck: GroundSensorCrossCheck;
  overallAgreement: 'high_agreement' | 'moderate_variance' | 'model_only';
  checkedAtIso: string;
  autoRefreshMinutes: number;
  notesEn: string;
  notesHi: string;
}

export interface AirQualitySnapshot {
  location: IndianLocation;
  sourceName: string;
  observationTimestampIso: string;
  fetchedAtIso: string;
  timezone: string;
  whoPm25Ratio?: number;
  current: PollutantReadings;
  weather: WeatherReadings;
  cpcb: CpcbEvaluation;
  dominantPollutant: string;
  hourly24: HourlyForecastPoint[];
  hourly48: HourlyForecastPoint[];
  cleanestWindow: TimeWindowSummary;
  worstWindow: TimeWindowSummary;
  verification?: AqiVerificationReport;
  fromCache: boolean;
  isStale?: boolean;
  usAqiDerivedFromPm25?: boolean;
}

export interface ExplainedRecommendation {
  id: string;
  title: string;
  why: string;
  when: string;
  whoFor: string;
  effort: 'Low' | 'Medium' | 'High' | string;
  cost: string;
  expectedBenefit: string;
  limitations: string;
  formulaSummary?: string;
}

export interface DailyPlannerSlot {
  period: 'Morning' | 'Commute' | 'Afternoon' | 'Evening' | 'Night' | string;
  timeWindow: string;
  headline: string;
  why: string;
  when: string;
  whoFor: string;
  effort: string;
  cost: string;
  expectedBenefit: string;
  limitations: string;
}

export interface SustainableAlternative {
  id: string;
  title: string;
  actionSummary: string;
  why: string;
  when: string;
  whoFor: string;
  effort: string;
  cost: string;
  exposureChangeText: string;
  co2SavedText: string;
  expectedBenefit: string;
  limitations: string;
  formulaTitle: string;
  formulaDetail: string;
}

export interface IndoorGuidanceData {
  ventilationHeadline: string;
  ventilationTiming: string;
  purifierCadrGuidance: string;
  lowCostHacks: string[];
  plantsHonestNote: string;
  why: string;
  when: string;
  whoFor: string;
  effort: string;
  cost: string;
  expectedBenefit: string;
  limitations: string;
  formulaDetail: string;
}

export interface FamilyGroupGuidance {
  groupKey: 'children' | 'elderly' | 'outdoor_workers' | 'sensitive_respiratory';
  groupTitle: string;
  priorityLevel: string;
  guidance: string;
  when: string;
  whoFor: string;
  effort: string;
  cost: string;
  expectedBenefit: string;
  limitations: string;
}

export interface AiAdvisoryPayload {
  summaryBanner: string;
  top3Actions: ExplainedRecommendation[];
  dailyPlanner: DailyPlannerSlot[];
  sustainableAlternatives: SustainableAlternative[];
  indoorGuidance: IndoorGuidanceData;
  familyProtection: FamilyGroupGuidance[];
  maskGuidance: {
    recommendedType: string;
    fitGuidance: string;
    clothAndSurgicalLimit: string;
  };
  medicalDisclaimer: string;
}

export interface AdvisoryResult {
  mode: 'ai' | 'fallback';
  fallbackReason?: string;
  advisory: AiAdvisoryPayload;
  generatedAtIso: string;
}

export interface AssistantReply {
  answer: string;
  citedSource: string;
  citedTimestamp: string;
  citedUsAqi: number;
  citedCpcbCategory: string;
  limitations: string;
  generalGuidanceNote: string;
  mode: 'ai' | 'fallback';
  promptGuardTriggered?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  replyMeta?: AssistantReply;
  createdAtIso: string;
}

export interface WhatIfChoices {
  switchToTransit: boolean;
  combineErrands: boolean;
  runPurifier: boolean;
  shiftOutdoorActivity: boolean;
  wearN95Mask: boolean;
  sealAndDampMop: boolean;
}

export interface WhatIfStepBreakdown {
  key: keyof WhatIfChoices;
  label: string;
  exposureReductionPct: number;
  co2SavedKgPerWeek: number;
  formula: string;
}

export interface WhatIfResult {
  totalExposureReductionPct: number;
  estimatedBaselineDoseIndex: number;
  estimatedAdjustedDoseIndex: number;
  weeklyCo2SavedKg: number;
  monthlyCo2SavedKg: number;
  breakdown: WhatIfStepBreakdown[];
  assumptionsAndLimits: string;
}
