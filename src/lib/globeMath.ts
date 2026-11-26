export interface CartesianPoint {
  x: number;
  y: number;
  z: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Maps geographic latitude/longitude (degrees) onto a Three.js unit sphere
 * matching standard equirectangular Earth texture UV coordinates.
 */
export function latLngToVector3Coords(
  lat: number,
  lng: number,
  radius = 1
): CartesianPoint {
  const phi = (90 - lat) * DEG_TO_RAD;
  const theta = (lng + 180) * DEG_TO_RAD;
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Inverse projection from a 3D point on/near the globe back to geographic lat/lng.
 */
export function vector3ToLatLngCoords(point: CartesianPoint): { lat: number; lng: number } {
  const len = Math.hypot(point.x, point.y, point.z) || 1;
  const nx = point.x / len;
  const ny = Math.max(-1, Math.min(1, point.y / len));
  const nz = point.z / len;

  const lat = 90 - Math.acos(ny) * RAD_TO_DEG;
  const theta = Math.atan2(nz, -nx);
  let lng = theta * RAD_TO_DEG - 180;
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
  };
}

/**
 * Computes the real astronomical subsolar latitude/longitude for UTC solar terminator shading.
 */
export function computeUtcSunSubsolarCoords(now = new Date()): { lat: number; lng: number } {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear) / 86400000);
  const declinationDeg = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  let subsolarLng = (12 - utcHours) * 15;
  if (subsolarLng > 180) subsolarLng -= 360;
  if (subsolarLng < -180) subsolarLng += 360;
  return { lat: declinationDeg, lng: subsolarLng };
}
