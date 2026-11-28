export type AtmosphereEffectMode =
  | 'initial_clouds'
  | 'wind_only'
  | 'light_clouds'
  | 'medium_clouds_smog'
  | 'high_smog_clouds';

export interface AtmosphereEffectProfile {
  mode: AtmosphereEffectMode;
  cloudDensity: number; // 0..1 fraction of clouds rendered
  smogDensity: number; // 0..1 fraction of smog/fog rendered
  windDensity: number; // 0..1 fraction of wind streamlines rendered
  smogWarmth: number; // 0..1 blend from crisp cloud white to warm hazy smog
}

/**
 * Determines the page-wide atmospheric overlay behavior based on live location AQI:
 * - Before location AQI loads (`undefined` / `null`): clean drifting clouds on open
 * - `usAqi < 10`: wind streamlines only (no clouds, no smog)
 * - `10 <= usAqi < 50`: light airy clouds with gentle breeze, no smog
 * - `50 <= usAqi <= 150` (medium): moderate clouds and light smog haze
 * - `usAqi > 150` (high): dense smog haze and heavier cloud/fog layers
 */
export function getAtmosphereEffectProfile(
  usAqi?: number | null
): AtmosphereEffectProfile {
  if (usAqi === undefined || usAqi === null || !Number.isFinite(usAqi)) {
    return {
      mode: 'initial_clouds',
      cloudDensity: 0.72,
      smogDensity: 0,
      windDensity: 0.15,
      smogWarmth: 0,
    };
  }

  if (usAqi < 10) {
    return {
      mode: 'wind_only',
      cloudDensity: 0,
      smogDensity: 0,
      windDensity: 1,
      smogWarmth: 0,
    };
  }

  if (usAqi < 50) {
    return {
      mode: 'light_clouds',
      cloudDensity: 0.28,
      smogDensity: 0,
      windDensity: 0.55,
      smogWarmth: 0,
    };
  }

  if (usAqi <= 150) {
    const t = (usAqi - 50) / 100;
    return {
      mode: 'medium_clouds_smog',
      cloudDensity: 0.42 + t * 0.2,
      smogDensity: 0.32 + t * 0.25,
      windDensity: 0.18,
      smogWarmth: 0.35 + t * 0.25,
    };
  }

  const severity = Math.min(1, (usAqi - 150) / 150);
  return {
    mode: 'high_smog_clouds',
    cloudDensity: 0.85 + severity * 0.15,
    smogDensity: 0.82 + severity * 0.18,
    windDensity: 0,
    smogWarmth: 0.78 + severity * 0.22,
  };
}
