import type { Language } from '../types/vayu';

interface AirProgressRingProps {
  usAqi: number;
  label: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  theme?: 'dark' | 'light';
  lang?: Language;
}

function getRingStrokeHex(usAqi: number, theme: 'dark' | 'light'): string {
  if (theme === 'dark') {
    if (usAqi <= 50) return '#5DCAA5'; // Seafoam Emerald
    if (usAqi <= 100) return '#67E8F9'; // Cosmic Ice Cyan
    if (usAqi <= 150) return '#FBBF24'; // Warm Solar Amber
    if (usAqi <= 200) return '#FB7185'; // Electric Coral
    return '#FCA5A5'; // High-alert Rose
  }
  if (usAqi <= 50) return '#1F5E45';
  if (usAqi <= 100) return '#B45309';
  if (usAqi <= 150) return '#C2410C';
  if (usAqi <= 200) return '#BE123C';
  return '#991B1B';
}

export function AirProgressRing({
  usAqi,
  label,
  sublabel,
  size = 132,
  strokeWidth = 10,
  theme = 'dark',
  lang = 'en',
}: AirProgressRingProps) {
  const safeAqi = Math.max(0, Math.round(Number.isFinite(usAqi) ? usAqi : 0));
  const clampedFraction = Math.min(1, Math.max(0.06, safeAqi / 300));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedFraction);

  const strokeColor = getRingStrokeHex(safeAqi, theme);
  const trackColor = theme === 'dark' ? 'rgba(230, 237, 247, 0.14)' : '#E5E3DA';

  return (
    <div
      role="img"
      aria-label={
        lang === 'hi'
          ? `लाइव US AQI ${safeAqi}, श्रेणी: ${label}`
          : `Live US AQI ${safeAqi}, ${label}`
      }
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 450ms ease, stroke 300ms ease' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            theme === 'dark' ? 'text-[#A7A3C7]' : 'text-stone-500'
          }`}
        >
          US AQI
        </span>
        <span
          className={`font-mono-tabular text-3xl font-extrabold leading-none tracking-tight ${
            theme === 'dark' ? 'text-[#E6EDF7]' : 'text-[#14163F]'
          }`}
        >
          {safeAqi}
        </span>
        {sublabel ? (
          <span
            className={`mt-1 max-w-[84%] truncate text-[10px] font-medium ${
              theme === 'dark' ? 'text-[#67E8F9]' : 'text-[#14163F]'
            }`}
          >
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
