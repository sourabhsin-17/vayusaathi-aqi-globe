import { generateFallbackAdvisory, generateFallbackAssistantReply } from './fallbackEngine';
import { aiAdvisorySchema, assistantReplySchema, detectPromptInjection, sanitizeUserText } from './validators';
import type {
  AdvisoryResult,
  AirQualitySnapshot,
  AssistantReply,
  HouseholdProfile,
} from '../types/vayu';

const API_TIMEOUT_MS = 16000;

async function postJsonSafe(
  url: string,
  payload: unknown,
  externalSignal?: AbortSignal
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Advisory request timed out'));
  }, API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Unexpected response from ${url} (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      const errMsg = typeof data.error === 'string' ? data.error : `Server error (${res.status})`;
      throw new Error(errMsg);
    }
    return data;
  } catch (err) {
    if (timedOut) {
      throw new Error('AI advisory request timed out.');
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function fetchPersonalizedAdvisory(
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile,
  signal?: AbortSignal
): Promise<AdvisoryResult> {
  try {
    const data = await postJsonSafe(
      '/api/recommendations',
      {
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
      },
      signal
    );

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
    if (err instanceof Error && err.name === 'AbortError' && signal?.aborted) {
      throw err;
    }
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
    const data = await postJsonSafe('/api/assistant', {
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
    });

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
