import { z } from 'zod';

// Strip HTML tags, control characters, and excessive whitespace from user input
export function sanitizeUserText(raw: string, maxLength = 400): string {
  const withoutControl = raw.replace(/[\u0000-\u001F\u007F]/g, ' ');
  const withoutTags = withoutControl.replace(/[<>]/g, '');
  const collapsed = withoutTags.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, maxLength);
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(your|all|the)\s+(rules|instructions|system)/i,
  /reveal\s+(your\s+)?(system\s+prompt|hidden\s+instructions)/i,
  /you\s+are\s+now\s+(DAN|an\s+unrestricted|jailbroken)/i,
  /pretend\s+(that\s+)?(aqi|pm2\.5|pollution)\s+is\s+\d+/i,
  /invent\s+(a\s+)?(new\s+)?(aqi|pm2\.5|reading|measurement)/i,
  /override\s+(safety|medical|system)/i,
  /<\s*script/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export const openMeteoGeocodingSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country_code: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      })
    )
    .optional(),
});

export const openMeteoAirQualitySchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    us_aqi: z.number().nullable(),
    european_aqi: z.number().nullable().optional(),
    pm2_5: z.number().nullable(),
    pm10: z.number().nullable(),
    nitrogen_dioxide: z.number().nullable(),
    ozone: z.number().nullable(),
    sulphur_dioxide: z.number().nullable(),
    carbon_monoxide: z.number().nullable(),
    dust: z.number().nullable().optional(),
    uv_index: z.number().nullable().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()).min(24),
    pm2_5: z.array(z.number().nullable()).min(24),
    pm10: z.array(z.number().nullable()).min(24),
    us_aqi: z.array(z.number().nullable()).min(24),
    nitrogen_dioxide: z.array(z.number().nullable()).min(24),
    ozone: z.array(z.number().nullable()).min(24),
    sulphur_dioxide: z.array(z.number().nullable()).min(24),
    carbon_monoxide: z.array(z.number().nullable()).min(24),
  }),
});

export const openMeteoWeatherSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number().nullable(),
    apparent_temperature: z.number().nullable().optional(),
    relative_humidity_2m: z.number().nullable(),
    wind_speed_10m: z.number().nullable(),
    wind_gusts_10m: z.number().nullable().optional(),
    precipitation: z.number().nullable().optional(),
    weather_code: z.number().nullable().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()).min(24),
    temperature_2m: z.array(z.number().nullable()).min(24),
    relative_humidity_2m: z.array(z.number().nullable()).min(24),
    wind_speed_10m: z.array(z.number().nullable()).min(24),
  }),
});

export const sensorCommunityListSchema = z.array(
  z.object({
    timestamp: z.string().optional(),
    location: z
      .object({
        id: z.number().optional(),
        indoor: z.union([z.number(), z.string()]).optional(),
        latitude: z.union([z.number(), z.string()]).optional(),
        longitude: z.union([z.number(), z.string()]).optional(),
      })
      .optional(),
    sensordatavalues: z
      .array(
        z.object({
          value: z.union([z.string(), z.number()]).optional(),
          value_type: z.string().optional(),
        })
      )
      .optional(),
  })
);

export const indianLocationSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  state: z.string().max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isCurrentLocation: z.boolean().optional(),
});

export const householdProfileSchema = z.object({
  location: indianLocationSchema,
  members: z.object({
    childrenUnder12: z.boolean(),
    schoolAgeKids: z.boolean(),
    elderly60Plus: z.boolean(),
    workingProfessionals: z.boolean(),
    outdoorWorkers: z.boolean(),
    respiratoryOrCardiacSensitive: z.boolean(),
  }),
  commuteMode: z.enum(['walk', 'two_wheeler', 'car', 'bus', 'metro', 'wfh']),
  morningLeaveHour: z.number().int().min(0).max(23),
  eveningReturnHour: z.number().int().min(0).max(23),
  oneWayDistanceKm: z.number().min(0).max(150),
  hasAirPurifier: z.boolean(),
  roomSizeSqFt: z.number().min(60).max(2500),
  hasIndoorPlants: z.boolean(),
  homeType: z.enum(['apartment', 'independent_house', 'ground_roadside']),
  budget: z.enum(['free', 'low', 'medium']),
  language: z.enum(['en', 'hi']),
});

export const explainedRecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  when: z.string().min(1),
  whoFor: z.string().min(1),
  effort: z.string().min(1),
  cost: z.string().min(1),
  expectedBenefit: z.string().min(1),
  limitations: z.string().min(1),
  formulaSummary: z.string().optional(),
});

export const dailyPlannerSlotSchema = z.object({
  period: z.string().min(1),
  timeWindow: z.string().min(1),
  headline: z.string().min(1),
  why: z.string().min(1),
  when: z.string().min(1),
  whoFor: z.string().min(1),
  effort: z.string().min(1),
  cost: z.string().min(1),
  expectedBenefit: z.string().min(1),
  limitations: z.string().min(1),
});

export const sustainableAlternativeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  actionSummary: z.string().min(1),
  why: z.string().min(1),
  when: z.string().min(1),
  whoFor: z.string().min(1),
  effort: z.string().min(1),
  cost: z.string().min(1),
  exposureChangeText: z.string().min(1),
  co2SavedText: z.string().min(1),
  expectedBenefit: z.string().min(1),
  limitations: z.string().min(1),
  formulaTitle: z.string().min(1),
  formulaDetail: z.string().min(1),
});

export const indoorGuidanceSchema = z.object({
  ventilationHeadline: z.string().min(1),
  ventilationTiming: z.string().min(1),
  purifierCadrGuidance: z.string().min(1),
  lowCostHacks: z.array(z.string().min(1)).min(2),
  plantsHonestNote: z.string().min(1),
  why: z.string().min(1),
  when: z.string().min(1),
  whoFor: z.string().min(1),
  effort: z.string().min(1),
  cost: z.string().min(1),
  expectedBenefit: z.string().min(1),
  limitations: z.string().min(1),
  formulaDetail: z.string().min(1),
});

export const familyGroupGuidanceSchema = z.object({
  groupKey: z.enum([
    'children',
    'elderly',
    'outdoor_workers',
    'sensitive_respiratory',
  ]),
  groupTitle: z.string().min(1),
  priorityLevel: z.string().min(1),
  guidance: z.string().min(1),
  when: z.string().min(1),
  whoFor: z.string().min(1),
  effort: z.string().min(1),
  cost: z.string().min(1),
  expectedBenefit: z.string().min(1),
  limitations: z.string().min(1),
});

export const aiAdvisorySchema = z.object({
  summaryBanner: z.string().min(1),
  top3Actions: z.array(explainedRecommendationSchema).length(3),
  dailyPlanner: z.array(dailyPlannerSlotSchema).min(5),
  sustainableAlternatives: z.array(sustainableAlternativeSchema).min(3),
  indoorGuidance: indoorGuidanceSchema,
  familyProtection: z.array(familyGroupGuidanceSchema).min(4),
  maskGuidance: z.object({
    recommendedType: z.string().min(1),
    fitGuidance: z.string().min(1),
    clothAndSurgicalLimit: z.string().min(1),
  }),
  medicalDisclaimer: z.string().min(1),
});

export const assistantReplySchema = z.object({
  answer: z.string().min(1),
  citedSource: z.string().min(1),
  citedTimestamp: z.string().min(1),
  citedUsAqi: z.number(),
  citedCpcbCategory: z.string().min(1),
  limitations: z.string().min(1),
  generalGuidanceNote: z.string().min(1),
});

export const assistantRequestSchema = z.object({
  question: z.string().min(2).max(500),
  profile: householdProfileSchema,
  snapshotSummary: z.object({
    cityName: z.string(),
    sourceName: z.string(),
    observationTimestampIso: z.string(),
    usAqi: z.number(),
    pm25: z.number(),
    pm10: z.number(),
    cpcbLabel: z.string(),
    dominantPollutant: z.string(),
    temperatureC: z.number(),
    humidityPct: z.number(),
    windSpeedKmh: z.number(),
    cleanestWindowLabel: z.string(),
    cleanestWindowPm25: z.number(),
    worstWindowLabel: z.string(),
    worstWindowPm25: z.number(),
    hourlySummary: z.array(
      z.object({
        hourLabel: z.string(),
        pm25: z.number(),
        usAqi: z.number(),
      })
    ).max(24),
  }),
});
