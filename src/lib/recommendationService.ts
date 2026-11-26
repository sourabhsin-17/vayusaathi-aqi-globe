import { generateFallbackAdvisory, generateFallbackAssistantReply } from './fallbackEngine';
import { aiAdvisorySchema, assistantReplySchema, detectPromptInjection, sanitizeUserText } from './validators';
import type {
  AdvisoryResult,
  AirQualitySnapshot,
  AssistantReply,
  HouseholdProfile,
} from '../types/vayu';

export async function fetchPersonalizedAdvisory(
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile
): Promise<AdvisoryResult> {
  try {
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        snapshot: {
          location: snapshot.location,
          sourceName: snapshot.sourceName,
          observationTimestampIso: snapshot.observationTimestampIso,
          current: snapshot.current,
          weather: snapshot.weather,
          cpcb: snapshot.cpcb,
          dominantPollutant: snapshot.dominantPollutant,
          cleanestWindow: snapshot.cleanestWindow,
          worstWindow: snapshot.worstWindow,
          hourly24: snapshot.hourly24.map((h) => ({
            hourLabel: h.hourLabel,
            pm25: h.pm25,
            pm10: h.pm10,
            usAqi: h.usAqi,
          })),
        },
      }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      advisory?: unknown;
      error?: string;
    };

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Server error (${res.status})`);
    }

    const validated = aiAdvisorySchema.safeParse(data.advisory);
    if (!validated.success) {
      throw new Error('AI advisory failed client schema validation.');
    }

    return {
      mode: 'ai',
      advisory: validated.data,
      generatedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'AI service unreachable';
    return {
      mode: 'fallback',
      fallbackReason: reason,
      advisory: generateFallbackAdvisory(snapshot, profile),
      generatedAtIso: new Date().toISOString(),
    };
  }
}

export async function askAssistantQuestion(
  rawQuestion: string,
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile
): Promise<AssistantReply> {
  const cleanQuestion = sanitizeUserText(rawQuestion, 400);
  const guardTriggered = detectPromptInjection(cleanQuestion);

  if (guardTriggered) {
    return generateFallbackAssistantReply(cleanQuestion, snapshot, profile, true);
  }

  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: cleanQuestion,
        profile,
        snapshotSummary: {
          cityName: snapshot.location.name,
          sourceName: snapshot.sourceName,
          observationTimestampIso: snapshot.observationTimestampIso,
          usAqi: snapshot.current.usAqi,
          pm25: snapshot.current.pm25,
          pm10: snapshot.current.pm10,
          cpcbLabel: profile.language === 'hi' ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn,
          dominantPollutant: snapshot.dominantPollutant,
          temperatureC: snapshot.weather.temperatureC,
          humidityPct: snapshot.weather.humidityPct,
          windSpeedKmh: snapshot.weather.windSpeedKmh,
          cleanestWindowLabel: `${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}`,
          cleanestWindowPm25: snapshot.cleanestWindow.avgPm25,
          worstWindowLabel: `${snapshot.worstWindow.startLabel}–${snapshot.worstWindow.endLabel}`,
          worstWindowPm25: snapshot.worstWindow.avgPm25,
          hourlySummary: snapshot.hourly24.map((h) => ({
            hourLabel: h.hourLabel,
            pm25: h.pm25,
            usAqi: h.usAqi,
          })),
        },
      }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      reply?: unknown;
      promptGuardTriggered?: boolean;
      error?: string;
    };

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Assistant server error (${res.status})`);
    }

    const validated = assistantReplySchema.safeParse(data.reply);
    if (!validated.success) {
      throw new Error('Assistant reply failed validation.');
    }

    return {
      ...validated.data,
      mode: 'ai',
      promptGuardTriggered: Boolean(data.promptGuardTriggered),
    };
  } catch {
    return generateFallbackAssistantReply(cleanQuestion, snapshot, profile, false);
  }
}
