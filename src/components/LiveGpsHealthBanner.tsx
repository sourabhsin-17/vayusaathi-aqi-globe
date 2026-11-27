import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  LocateFixed,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react';
import { getUsAqiLabel } from '../lib/cpcb';
import { formatCoordPair, type HealthWarningEvaluation } from '../lib/geolocationService';
import type { AirQualitySnapshot, IndianLocation, Language } from '../types/vayu';

export type GpsSyncStatus = 'idle' | 'locating' | 'locked' | 'denied' | 'unavailable' | 'manual';

interface LiveGpsHealthBannerProps {
  location: IndianLocation;
  snapshot: AirQualitySnapshot | null;
  aqLoading: boolean;
  gpsStatus: GpsSyncStatus;
  gpsStatusNote: string | null;
  healthWarning: HealthWarningEvaluation | null;
  warningDismissed: boolean;
  browserAlertSent: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  onDetectGps: () => void;
  onEnableNotifications: () => void;
  onDismissWarning: () => void;
  lang: Language;
}

export function LiveGpsHealthBanner({
  location,
  snapshot,
  aqLoading,
  gpsStatus,
  gpsStatusNote,
  healthWarning,
  warningDismissed,
  browserAlertSent,
  notificationPermission,
  onDetectGps,
  onEnableNotifications,
  onDismissWarning,
  lang,
}: LiveGpsHealthBannerProps) {
  const isHi = lang === 'hi';
  const coords = formatCoordPair(location.latitude, location.longitude);
  const accuracyText =
    typeof location.accuracyMeters === 'number' && Number.isFinite(location.accuracyMeters)
      ? `±${Math.round(location.accuracyMeters)}m`
      : null;

  const exactLocationText = location.exactAreaLabel
    ? location.exactAreaLabel
    : `${location.name}, ${location.state}`;

  const usLabel = snapshot ? getUsAqiLabel(snapshot.current.usAqi) : null;

  const warningColors =
    healthWarning?.severity === 'critical'
      ? {
          wrap: 'border-red-400/55 bg-gradient-to-r from-[#2D0A14]/95 via-[#240B18]/95 to-[#142138]/95 text-[#FFE4E6]',
          badge: 'border-red-400/50 bg-red-500/20 text-red-200',
          icon: 'text-red-300',
        }
      : healthWarning?.severity === 'high'
      ? {
          wrap: 'border-rose-400/50 bg-gradient-to-r from-[#260D17]/95 via-[#1C1022]/95 to-[#142138]/95 text-[#FFE4E6]',
          badge: 'border-rose-400/45 bg-rose-500/20 text-rose-200',
          icon: 'text-rose-300',
        }
      : {
          wrap: 'border-amber-400/45 bg-gradient-to-r from-[#241909]/95 via-[#1C1612]/95 to-[#142138]/95 text-[#FEF3C7]',
          badge: 'border-amber-400/45 bg-amber-500/20 text-amber-200',
          icon: 'text-amber-300',
        };

  return (
    <section aria-label={isHi ? 'लाइव GPS और स्वास्थ्य चेतावनी' : 'Live GPS location and health alerts'} className="space-y-3">
      {/* Compact Instant GPS Lock & Area AQI Readout Strip */}
      <div className="obsidian-surface rounded-2xl border border-white/12 px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono-tabular uppercase tracking-wide ${
                  gpsStatus === 'locked'
                    ? 'border-[#5DCAA5]/45 bg-[#1D9E75]/18 text-[#5DCAA5]'
                    : gpsStatus === 'locating'
                    ? 'border-[#38BDF8]/45 bg-[#38BDF8]/15 text-[#38BDF8]'
                    : gpsStatus === 'denied' || gpsStatus === 'unavailable'
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                    : 'border-white/15 bg-[#0C1322] text-[#9FB0C7]'
                }`}
              >
                <LocateFixed
                  className={`h-3 w-3 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {gpsStatus === 'locating'
                  ? isHi
                    ? 'GPS स्थान खोज रहे हैं...'
                    : 'Locking GPS Area...'
                  : gpsStatus === 'locked'
                  ? isHi
                    ? 'लाइव GPS जुड़ा'
                    : 'Live GPS Locked'
                  : gpsStatus === 'denied'
                  ? isHi
                    ? 'GPS अनुमति बंद'
                    : 'GPS Permission Off'
                  : gpsStatus === 'unavailable'
                  ? isHi
                    ? 'GPS अनुपलब्ध'
                    : 'GPS Unavailable'
                  : isHi
                  ? 'चयनित शहर'
                  : 'Selected Area'}
              </span>

              <span className="font-mono-tabular text-[#9FB0C7]">
                {coords}
                {accuracyText ? ` · ${accuracyText}` : ''}
              </span>

              {snapshot ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono-tabular ${
                    snapshot.current.usAqi <= 50
                      ? 'border-[#5DCAA5]/40 bg-[#1D9E75]/15 text-[#5DCAA5]'
                      : snapshot.current.usAqi <= 100
                      ? 'border-[#38BDF8]/35 bg-[#38BDF8]/12 text-[#38BDF8]'
                      : snapshot.current.usAqi <= 150
                      ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                      : 'border-rose-400/45 bg-rose-500/18 text-rose-200'
                  }`}
                >
                  {snapshot.current.usAqi <= 100 ? (
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  )}
                  US AQI {snapshot.current.usAqi} ({isHi ? usLabel?.hi : usLabel?.en}) · PM2.5{' '}
                  {snapshot.current.pm25} µg/m³
                </span>
              ) : aqLoading ? (
                <span className="font-mono-tabular text-[#38BDF8]">
                  {isHi ? 'ताज़ा AQI लोड हो रहा है...' : 'Fetching instant area AQI...'}
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#38BDF8]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#E6EDF7] break-words">
                  {isHi ? 'आपका वर्तमान क्षेत्र: ' : 'Your Area: '}
                  <span className="text-[#38BDF8]">{exactLocationText}</span>
                </p>
                {gpsStatusNote ? (
                  <p className="text-xs text-[#9FB0C7]">{gpsStatusNote}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDetectGps}
              disabled={gpsStatus === 'locating'}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#38BDF8]/45 bg-[#182947] px-3.5 py-1.5 text-xs font-semibold text-[#38BDF8] hover:bg-[#1E2259] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <LocateFixed
                className={`h-3.5 w-3.5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {gpsStatus === 'locating'
                  ? isHi
                    ? 'खोज रहे हैं...'
                    : 'Locating...'
                  : gpsStatus === 'locked'
                  ? isHi
                    ? 'GPS अपडेट करें'
                    : 'Refresh GPS'
                  : isHi
                  ? 'मेरा GPS स्थान लें'
                  : 'Use My GPS'}
              </span>
            </button>

            {notificationPermission !== 'unsupported' ? (
              <button
                type="button"
                onClick={onEnableNotifications}
                disabled={notificationPermission === 'granted' || notificationPermission === 'denied'}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  notificationPermission === 'granted'
                    ? 'border-[#5DCAA5]/40 bg-[#1D9E75]/15 text-[#5DCAA5]'
                    : notificationPermission === 'denied'
                    ? 'border-white/10 bg-[#0C1322] text-[#9FB0C7] opacity-75'
                    : 'border-amber-400/45 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                }`}
              >
                {notificationPermission === 'granted' ? (
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {notificationPermission === 'granted'
                    ? isHi
                      ? 'स्वास्थ्य अलर्ट चालू'
                      : 'Health Alerts ON'
                    : notificationPermission === 'denied'
                    ? isHi
                      ? 'ब्राउज़र अलर्ट ब्लॉक हैं'
                      : 'Browser Alerts Blocked'
                    : isHi
                    ? 'चेतावनी अलर्ट चालू करें'
                    : 'Enable Push Alerts'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Prominent Health Warning Banner when AQI exceeds healthy thresholds */}
      {healthWarning && !warningDismissed ? (
        <div
          role="alert"
          aria-live="assertive"
          className={`rounded-2xl border p-4 sm:p-5 shadow-[0_18px_45px_-20px_rgba(244,63,94,0.45)] ${warningColors.wrap}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <ShieldAlert
                className={`mt-0.5 h-6 w-6 shrink-0 ${warningColors.icon}`}
                aria-hidden="true"
              />
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono-tabular text-[11px] font-bold uppercase tracking-wider ${warningColors.badge}`}
                  >
                    {healthWarning.severity === 'critical'
                      ? isHi
                        ? 'गंभीर स्वास्थ्य चेतावनी'
                        : 'CRITICAL HEALTH WARNING'
                      : healthWarning.severity === 'high'
                      ? isHi
                        ? 'स्वास्थ्य चेतावनी'
                        : 'HEALTH WARNING'
                      : healthWarning.severity === 'elevated'
                      ? isHi
                        ? 'वायु स्वास्थ्य अलर्ट'
                        : 'HEALTH ALERT'
                      : isHi
                      ? 'संवेदनशील समूह सावधानी'
                      : 'SENSITIVE GROUP NOTICE'}
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold">
                    US AQI {healthWarning.usAqi} · PM2.5 {healthWarning.pm25} µg/m³ ({healthWarning.whoMultiple}× WHO)
                  </span>
                  {browserAlertSent ? (
                    <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-medium">
                      {isHi ? 'पुश चेतावनी भेजी गई' : 'Notification sent'}
                    </span>
                  ) : null}
                </div>

                <h2 className="text-base font-bold font-display sm:text-lg leading-snug">
                  {healthWarning.title}
                </h2>
                <p className="text-xs sm:text-sm leading-relaxed opacity-95">
                  {healthWarning.summary}
                </p>

                <ul className="space-y-1 text-xs sm:text-sm opacity-95 list-disc pl-5">
                  {healthWarning.immediateActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {notificationPermission === 'default' ? (
                    <button
                      type="button"
                      onClick={onEnableNotifications}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-[#0C1322] hover:bg-white/90 transition-colors"
                    >
                      <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {isHi
                          ? 'ब्राउज़र पर भी चेतावनी भेजें'
                          : 'Send Browser Health Alerts'}
                      </span>
                    </button>
                  ) : null}
                  <a
                    href="#planner"
                    className="inline-flex min-h-[36px] items-center rounded-xl border border-white/25 bg-black/25 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-black/40 transition-colors"
                  >
                    {isHi ? 'व्यक्तिगत सुरक्षा योजना देखें' : 'View Protective Plan'}
                  </a>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onDismissWarning}
              aria-label={isHi ? 'चेतावनी बंद करें' : 'Dismiss health warning'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/25 text-white/80 hover:bg-black/45 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
