import * as THREE from 'three';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries50mRaw from 'world-atlas/countries-50m.json';
import { ALL_MONITORED_CITIES } from './aqiCities';

export interface EarthTextureBundle {
  colorMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  nightLightsMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  starSpriteMap: THREE.CanvasTexture;
}

// Fast deterministic integer hash for tileable organic multi-octave FBM
function hash2D(ix: number, iy: number, seed: number): number {
  let n = ix * 374761393 + iy * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x: number, y: number, periodX: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const x0 = ((xi % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;

  const a = hash2D(x0, yi, seed);
  const b = hash2D(x1, yi, seed);
  const c = hash2D(x0, yi + 1, seed);
  const d = hash2D(x1, yi + 1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2D(x: number, y: number, basePeriodX: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.52;
  let norm = 0;
  let freq = 1;
  for (let oct = 0; oct < octaves; oct += 1) {
    sum += amp * valueNoise2D(x * freq, y * freq, basePeriodX * freq, seed + oct * 37);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function ridgedFbm2D(x: number, y: number, basePeriodX: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.55;
  let norm = 0;
  let freq = 1;
  for (let oct = 0; oct < octaves; oct += 1) {
    const n = valueNoise2D(x * freq, y * freq, basePeriodX * freq, seed + oct * 53);
    const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
    sum += amp * ridge * ridge;
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ellipseWeight(
  lng: number,
  lat: number,
  cLng: number,
  cLat: number,
  rx: number,
  ry: number,
  angleDeg = 0
): number {
  let dLng = lng - cLng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  const dLat = lat - cLat;
  let dx = dLng;
  let dy = dLat;
  if (angleDeg !== 0) {
    const rad = (angleDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    dx = dLng * c - dLat * s;
    dy = dLng * s + dLat * c;
  }
  const d2 = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (d2 >= 1) return 0;
  const t = 1 - d2;
  return t * t;
}

interface WorldAtlasTopology extends Topology {
  objects: {
    land: GeometryCollection;
    countries: GeometryCollection;
  };
}

function projectX(lng: number, w: number): number {
  return ((lng + 180) / 360) * w;
}

function projectY(lat: number, h: number): number {
  return ((90 - lat) / 180) * h;
}

function traceRing(
  ctx: CanvasRenderingContext2D,
  ring: number[][],
  w: number,
  h: number,
  moveOnlyOnJump = false
) {
  for (let i = 0; i < ring.length; i += 1) {
    const [lng, lat] = ring[i];
    const px = projectX(lng, w);
    const py = projectY(lat, h);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else if (moveOnlyOnJump && Math.abs(lng - ring[i - 1][0]) > 180) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
}

// Major real-world rivers & alluvial corridors painted smoothly into terrain relief & moisture mask
const MAJOR_RIVER_PATHS: Array<{ widthPx: number; pts: Array<[number, number]> }> = [
  // Ganga + Yamuna + Brahmaputra delta
  { widthPx: 3.4, pts: [[78.0, 30.2], [79.8, 27.6], [83.0, 25.3], [86.5, 25.1], [89.6, 23.8], [90.6, 22.1]] },
  { widthPx: 2.8, pts: [[94.5, 27.8], [91.6, 26.2], [89.8, 24.8], [89.8, 22.5]] },
  // Indus valley
  { widthPx: 2.8, pts: [[76.2, 34.4], [73.4, 32.1], [71.1, 29.3], [68.9, 26.8], [67.7, 24.0]] },
  // Nile + Delta
  { widthPx: 3.2, pts: [[32.6, 15.6], [32.5, 21.8], [31.2, 27.2], [31.2, 30.1], [30.1, 31.3]] },
  { widthPx: 2.2, pts: [[31.2, 30.1], [32.3, 31.4]] },
  // Amazon main stem + tributaries
  { widthPx: 4.5, pts: [[-73.5, -4.4], [-68.0, -3.2], [-60.0, -3.1], [-54.5, -2.1], [-50.0, -0.4]] },
  // Congo
  { widthPx: 3.6, pts: [[25.2, 0.5], [22.1, 1.9], [18.2, 0.4], [15.3, -4.3], [12.4, -6.0]] },
  // Yangtze & Yellow River
  { widthPx: 3.4, pts: [[102.5, 29.0], [108.5, 30.4], [114.3, 30.6], [118.8, 32.1], [121.6, 31.4]] },
  { widthPx: 2.6, pts: [[106.5, 38.5], [110.2, 35.1], [114.8, 34.8], [118.9, 37.7]] },
  // Mekong
  { widthPx: 2.6, pts: [[100.8, 20.2], [103.5, 17.8], [105.0, 12.1], [106.3, 9.8]] },
  // Mississippi-Missouri
  { widthPx: 3.2, pts: [[-93.2, 44.8], [-90.2, 38.6], [-90.1, 35.1], [-91.2, 30.4], [-89.4, 29.2]] },
  // Danube & Rhine
  { widthPx: 2.2, pts: [[9.5, 48.2], [16.4, 48.2], [20.5, 44.8], [28.8, 45.1]] },
];

export function createRealisticEarthTextures(maxAnisotropy: number): EarthTextureBundle {
  const fullW = 2048;
  const fullH = 1024;
  const synthW = 1536;
  const synthH = 768;

  const topology = countries50mRaw as unknown as WorldAtlasTopology;
  const landGeo = feature(topology, topology.objects.land);
  const countryBordersGeo = mesh(
    topology,
    topology.objects.countries,
    (a, b) => a !== b
  );

  // ── 1. RASTERIZE EXACT NATURAL EARTH 1:50M LAND MASK AT 2048×1024 ──
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = fullW;
  maskCanvas.height = fullH;
  const mCtx = maskCanvas.getContext('2d')!;
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, fullW, fullH);

  mCtx.fillStyle = '#ffffff';
  const fillLandPolygons = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const drawPolygon = (rings: number[][][]) => {
      ctx.beginPath();
      for (const ring of rings) {
        traceRing(ctx, ring, w, h, false);
        ctx.closePath();
      }
      ctx.fill('evenodd');
    };

    for (const f of landGeo.features) {
      if (!f.geometry) continue;
      if (f.geometry.type === 'Polygon') {
        drawPolygon(f.geometry.coordinates);
      } else if (f.geometry.type === 'MultiPolygon') {
        for (const poly of f.geometry.coordinates) {
          drawPolygon(poly);
        }
      }
    }
  };
  fillLandPolygons(mCtx, fullW, fullH);

  // Downsampled 1536×768 land mask + coastal shelf blur
  const synthMaskCanvas = document.createElement('canvas');
  synthMaskCanvas.width = synthW;
  synthMaskCanvas.height = synthH;
  const smCtx = synthMaskCanvas.getContext('2d')!;
  smCtx.drawImage(maskCanvas, 0, 0, synthW, synthH);
  const maskData = smCtx.getImageData(0, 0, synthW, synthH).data;

  const shelfCanvas = document.createElement('canvas');
  shelfCanvas.width = synthW;
  shelfCanvas.height = synthH;
  const shCtx = shelfCanvas.getContext('2d')!;
  shCtx.filter = 'blur(11px)';
  shCtx.drawImage(synthMaskCanvas, 0, 0);
  shCtx.filter = 'none';
  const shelfData = shCtx.getImageData(0, 0, synthW, synthH).data;

  // River moisture/valley rasterization at synthW×synthH
  const riverCanvas = document.createElement('canvas');
  riverCanvas.width = synthW;
  riverCanvas.height = synthH;
  const rvCtx = riverCanvas.getContext('2d')!;
  rvCtx.fillStyle = '#000000';
  rvCtx.fillRect(0, 0, synthW, synthH);
  rvCtx.lineCap = 'round';
  rvCtx.lineJoin = 'round';
  for (const river of MAJOR_RIVER_PATHS) {
    // Broad fertile floodplain halo
    rvCtx.strokeStyle = 'rgba(130, 130, 130, 0.55)';
    rvCtx.lineWidth = river.widthPx * 3.4;
    rvCtx.beginPath();
    river.pts.forEach(([lng, lat], idx) => {
      const px = projectX(lng, synthW);
      const py = projectY(lat, synthH);
      if (idx === 0) rvCtx.moveTo(px, py);
      else rvCtx.lineTo(px, py);
    });
    rvCtx.stroke();

    // Crisp river thread
    rvCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    rvCtx.lineWidth = river.widthPx * 0.95;
    rvCtx.stroke();
  }
  const riverData = rvCtx.getImageData(0, 0, synthW, synthH).data;

  // ── 2. SYNTHESIZE OROGRAPHY, BATHYMETRY, BIOMES & ROUGHNESS (1536×768) ──
  const biomeCanvas = document.createElement('canvas');
  biomeCanvas.width = synthW;
  biomeCanvas.height = synthH;
  const bCtx = biomeCanvas.getContext('2d')!;
  const biomeImg = bCtx.createImageData(synthW, synthH);
  const bd = biomeImg.data;

  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = synthW;
  oceanCanvas.height = synthH;
  const oCtx = oceanCanvas.getContext('2d')!;
  const oceanImg = oCtx.createImageData(synthW, synthH);
  const od = oceanImg.data;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = synthW;
  roughCanvas.height = synthH;
  const rCtx = roughCanvas.getContext('2d')!;
  const roughImg = rCtx.createImageData(synthW, synthH);
  const rd = roughImg.data;

  const heightField = new Float32Array(synthW * synthH);
  const periodX = 16;

  for (let y = 0; y < synthH; y += 1) {
    const lat = 90 - ((y + 0.5) / synthH) * 180;
    const absLat = Math.abs(lat);
    const ny = (y / synthH) * (periodX * 0.5);

    for (let x = 0; x < synthW; x += 1) {
      const lng = ((x + 0.5) / synthW) * 360 - 180;
      const nx = (x / synthW) * periodX;
      const pIdx = y * synthW + x;
      const rgbaIdx = pIdx * 4;

      const landFactor = maskData[rgbaIdx] / 255;
      const shelfFactor = shelfData[rgbaIdx] / 255;
      const riverFactor = riverData[rgbaIdx] / 255;

      // High-detail multi-octave FBM + sharp mountain ridge noise
      const macroNoise = fbm2D(nx, ny, periodX, 11, 4);
      const detailNoise = fbm2D(nx * 3.5, ny * 3.5, periodX * 3.5, 47, 4);
      const microNoise = valueNoise2D(nx * 10, ny * 10, periodX * 10, 173);
      const ridgeNoise = ridgedFbm2D(nx * 2.6, ny * 2.6, periodX * 2.6, 83, 5);

      // Geographic orogenic mountain & plateau belts
      const himalayaTibet =
        ellipseWeight(lng, lat, 86, 32, 19, 8.5, -14) * 0.96 +
        ellipseWeight(lng, lat, 74, 36, 9, 6.2, 25) * 0.78 +
        ellipseWeight(lng, lat, 88, 34, 14, 6, -4) * 0.36; // Tibetan high plateau
      const andes =
        ellipseWeight(lng, lat, -68.5, -20, 4.2, 26, -6) * 0.92 +
        ellipseWeight(lng, lat, -74, 2, 3.8, 12, 16) * 0.68;
      const rockies =
        ellipseWeight(lng, lat, -114, 48, 9, 20, -22) * 0.76 +
        ellipseWeight(lng, lat, -144, 62, 12, 5, -10) * 0.7;
      const alpsAnatolia =
        ellipseWeight(lng, lat, 11, 46.5, 7, 3.2, 10) * 0.68 +
        ellipseWeight(lng, lat, 44, 42, 6, 3.5, -25) * 0.6 +
        ellipseWeight(lng, lat, 51, 33, 9, 6, -32) * 0.48 +
        ellipseWeight(lng, lat, -4, 32, 8, 3, 18) * 0.45 + // Atlas Mountains
        ellipseWeight(lng, lat, 14, 64, 6, 8, 28) * 0.48; // Scandinavian Highlands
      const eastAfrica =
        ellipseWeight(lng, lat, 38, 8, 6.5, 7.5, 10) * 0.64 +
        ellipseWeight(lng, lat, 28, -28, 7, 6) * 0.46;
      const indiaTopography =
        ellipseWeight(lng, lat, 75.2, 14.5, 2.3, 7.6, -15) * 0.48 + // Western Ghats
        ellipseWeight(lng, lat, 77.6, 18.0, 6.0, 7.0) * 0.25 + // Deccan Plateau
        ellipseWeight(lng, lat, 81.5, 17.5, 3.8, 4.5, 32) * 0.24; // Eastern Ghats
      const polarIce =
        clamp01((absLat - 67) / 13.5) +
        ellipseWeight(lng, lat, -42, 72, 16, 12, 15) * 0.92;

      const mountainMask = clamp01(
        himalayaTibet +
          andes +
          rockies +
          alpsAnatolia +
          eastAfrica +
          indiaTopography +
          macroNoise * 0.28
      );
      const elevation = clamp01(
        0.15 +
          mountainMask * (0.48 + 0.54 * ridgeNoise) +
          detailNoise * 0.14 +
          microNoise * 0.04 -
          riverFactor * 0.08
      );

      // Ocean bathymetry: deep trenches, mid-ocean ridges & bright continental reefs
      const oceanSwell = fbm2D(nx * 2.0, ny * 2.0, periodX * 2.0, 109, 4);
      const abyssalTrenches =
        ellipseWeight(lng, lat, 145, 17, 5, 11, -18) * 0.95 + // Mariana Trench
        ellipseWeight(lng, lat, -73, -22, 3.5, 20, -4) * 0.85 + // Peru-Chile Trench
        ellipseWeight(lng, lat, 106, -9, 13, 3.5, -24) * 0.85 + // Java/Sunda Trench
        ellipseWeight(lng, lat, -174, -23, 3.5, 12, 12) * 0.8 + // Tonga Trench
        ellipseWeight(lng, lat, 154, 44, 9, 4, 34) * 0.75; // Kuril Trench
      const midOceanRidges =
        ellipseWeight(lng, lat, -30, 8, 5, 45, -14) * 0.55 + // Mid-Atlantic Ridge
        ellipseWeight(lng, lat, -110, -22, 6, 32, 16) * 0.5 + // East Pacific Rise
        ellipseWeight(lng, lat, 89, -12, 2.5, 24, 2) * 0.45; // Ninety East Ridge
      const reefShelves =
        ellipseWeight(lng, lat, -77, 23, 6, 4.5, -25) * 0.65 + // Bahamas Bank
        ellipseWeight(lng, lat, 148, -18, 4.5, 7, -28) * 0.6 + // Great Barrier Reef
        ellipseWeight(lng, lat, 73, 7, 3.5, 8) * 0.45 + // Lakshadweep/Maldives
        ellipseWeight(lng, lat, 110, 4, 15, 11) * 0.5; // Sundaland Shallow Sea

      const shallow = clamp01(shelfFactor * 1.48 - landFactor * 0.82 + reefShelves * 0.45);
      const polarSeaIce = clamp01((absLat - 76) / 11 + (macroNoise - 0.54) * 0.35);

      let oR = lerp(5, 14, oceanSwell) - abyssalTrenches * 4 + midOceanRidges * 4 + shallow * 22;
      let oG = lerp(22, 48, oceanSwell) - abyssalTrenches * 10 + midOceanRidges * 10 + shallow * 74;
      let oB = lerp(52, 92, oceanSwell) - abyssalTrenches * 16 + midOceanRidges * 14 + shallow * 82;

      if (polarSeaIce > 0.12) {
        const fracture = 0.72 + 0.28 * ridgeNoise;
        const iceMix = clamp01((polarSeaIce - 0.12) * 1.15);
        oR = lerp(oR, 198 * fracture, iceMix);
        oG = lerp(oG, 220 * fracture, iceMix);
        oB = lerp(oB, 238 * fracture, iceMix);
      }

      od[rgbaIdx] = Math.max(0, Math.min(255, Math.round(oR)));
      od[rgbaIdx + 1] = Math.max(0, Math.min(255, Math.round(oG)));
      od[rgbaIdx + 2] = Math.max(0, Math.min(255, Math.round(oB)));
      od[rgbaIdx + 3] = 255;

      // Aridity & desert sandstone belts
      const aridity = clamp01(
        ellipseWeight(lng, lat, 13, 23, 30, 12) * 1.05 +
          ellipseWeight(lng, lat, 46, 23.5, 14, 10, -15) * 1.0 +
          ellipseWeight(lng, lat, 64, 28, 10, 7.5, 15) * 0.88 + // Thar / Balochistan
          ellipseWeight(lng, lat, 94, 41, 20, 7.5, 8) * 0.9 + // Taklamakan / Gobi
          ellipseWeight(lng, lat, 129, -24, 15, 8.5) * 0.96 + // Australian Outback
          ellipseWeight(lng, lat, -110, 31, 11, 9, -20) * 0.84 + // Sonoran / Mojave
          ellipseWeight(lng, lat, 18, -24, 7.5, 7) * 0.86 + // Namib / Kalahari
          ellipseWeight(lng, lat, -69, -24, 4, 10) * 0.75 + // Atacama
          (macroNoise - 0.5) * 0.24 -
          riverFactor * 0.72 // River floodplains turn green even through deserts (Nile, Indus!)
      );

      // Forest & lush monsoon vegetation belts
      const forestDensity = clamp01(
        ellipseWeight(lng, lat, -62, -4, 19, 12) * 1.0 +
          ellipseWeight(lng, lat, 21, 0.5, 13, 9.5) * 0.95 +
          ellipseWeight(lng, lat, 109, 2, 22, 13) * 0.92 +
          ellipseWeight(lng, lat, 88, 24, 12, 7.5) * 0.8 +
          ellipseWeight(lng, lat, 75.5, 13, 4.2, 7) * 0.84 +
          riverFactor * 0.68 +
          clamp01(1 - absLat / 24) * 0.44 * (1 - aridity) +
          ellipseWeight(lng, lat, 75, 58, 45, 9) * 0.68 +
          ellipseWeight(lng, lat, -98, 56, 32, 8) * 0.68
      );

      // Base temperate savanna/plains
      let lR = lerp(60, 96, detailNoise * 0.75 + microNoise * 0.25);
      let lG = lerp(84, 114, detailNoise * 0.75 + microNoise * 0.25);
      let lB = lerp(52, 70, detailNoise * 0.75 + microNoise * 0.25);

      if (forestDensity > 0.05) {
        const fMix = clamp01(forestDensity * 0.94);
        const canR = lerp(20, 42, detailNoise);
        const canG = lerp(54, 88, detailNoise);
        const canB = lerp(30, 48, detailNoise);
        lR = lerp(lR, canR, fMix);
        lG = lerp(lG, canG, fMix);
        lB = lerp(lB, canB, fMix);
      }

      if (aridity > 0.08) {
        const dMix = clamp01(aridity * 0.96);
        const duneGrain = 0.68 + 0.32 * ridgeNoise;
        const desR = lerp(154, 210, detailNoise * duneGrain);
        const desG = lerp(126, 176, detailNoise * duneGrain);
        const desB = lerp(88, 132, detailNoise * duneGrain);
        lR = lerp(lR, desR, dMix);
        lG = lerp(lG, desG, dMix);
        lB = lerp(lB, desB, dMix);
      }

      // River channel slate-teal ribbon highlight
      if (riverFactor > 0.72) {
        const wMix = clamp01((riverFactor - 0.72) * 2.2);
        lR = lerp(lR, 28, wMix);
        lG = lerp(lG, 72, wMix);
        lB = lerp(lB, 98, wMix);
      }

      // Alpine rock & glacier-carved valleys
      if (elevation > 0.54) {
        const rockMix = clamp01((elevation - 0.54) / 0.24);
        const rockR = lerp(96, 140, ridgeNoise);
        const rockG = lerp(90, 132, ridgeNoise);
        const rockB = lerp(86, 126, ridgeNoise);
        lR = lerp(lR, rockR, rockMix);
        lG = lerp(lG, rockG, rockMix);
        lB = lerp(lB, rockB, rockMix);
      }

      const snowLine = clamp01((elevation - 0.76) / 0.15 + polarIce * 0.95);
      if (snowLine > 0.08) {
        const iceCrevasse = 0.9 + 0.1 * ridgeNoise;
        const sMix = clamp01(snowLine);
        lR = lerp(lR, 232 * iceCrevasse, sMix);
        lG = lerp(lG, 240 * iceCrevasse, sMix);
        lB = lerp(lB, 250 * iceCrevasse, sMix);
      }

      const reliefShade = 0.87 + elevation * 0.24;
      bd[rgbaIdx] = Math.min(255, Math.round(lR * reliefShade));
      bd[rgbaIdx + 1] = Math.min(255, Math.round(lG * reliefShade));
      bd[rgbaIdx + 2] = Math.min(255, Math.round(lB * reliefShade));
      bd[rgbaIdx + 3] = 255;

      const oceanDepth =
        0.07 +
        oceanSwell * 0.07 +
        shallow * 0.09 +
        midOceanRidges * 0.06 -
        abyssalTrenches * 0.06;
      heightField[pIdx] = lerp(oceanDepth, 0.24 + elevation * 0.76, landFactor);

      // Physical PBR roughness: sun-specular ocean (68..86), wet riverbeds, rough forest/sand/rock
      const oceanRough = 68 + oceanSwell * 16 + (polarSeaIce > 0.28 ? 64 : 0);
      const landRough =
        lerp(222, 138, snowLine) - forestDensity * 20 - (riverFactor > 0.7 ? 70 : 0);
      const rVal = Math.round(lerp(oceanRough, Math.max(110, Math.min(244, landRough)), landFactor));
      rd[rgbaIdx] = rVal;
      rd[rgbaIdx + 1] = rVal;
      rd[rgbaIdx + 2] = rVal;
      rd[rgbaIdx + 3] = 255;
    }
  }

  bCtx.putImageData(biomeImg, 0, 0);
  oCtx.putImageData(oceanImg, 0, 0);
  rCtx.putImageData(roughImg, 0, 0);

  // ── 3. HIGH-RELIEF TANGENT-SPACE NORMAL & BUMP MAPS (1536×768) ──
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = synthW;
  normalCanvas.height = synthH;
  const nCtx = normalCanvas.getContext('2d')!;
  const normalImg = nCtx.createImageData(synthW, synthH);
  const nd = normalImg.data;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = synthW;
  bumpCanvas.height = synthH;
  const bmCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bmCtx.createImageData(synthW, synthH);
  const bmd = bumpImg.data;

  const normalStrength = 5.4;
  for (let y = 0; y < synthH; y += 1) {
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(synthH - 1, y + 1);
    for (let x = 0; x < synthW; x += 1) {
      const xm1 = (x - 1 + synthW) % synthW;
      const xp1 = (x + 1) % synthW;
      const idx = y * synthW + x;
      const rgbaIdx = idx * 4;

      const hL = heightField[y * synthW + xm1];
      const hR = heightField[y * synthW + xp1];
      const hU = heightField[ym1 * synthW + x];
      const hD = heightField[yp1 * synthW + x];

      const dx = (hR - hL) * normalStrength;
      const dy = (hD - hU) * normalStrength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      nd[rgbaIdx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      nd[rgbaIdx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      nd[rgbaIdx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      nd[rgbaIdx + 3] = 255;

      const hByte = Math.max(0, Math.min(255, Math.round(heightField[idx] * 255)));
      bmd[rgbaIdx] = hByte;
      bmd[rgbaIdx + 1] = hByte;
      bmd[rgbaIdx + 2] = hByte;
      bmd[rgbaIdx + 3] = 255;
    }
  }
  nCtx.putImageData(normalImg, 0, 0);
  bmCtx.putImageData(bumpImg, 0, 0);

  // ── 4. COMPOSITE FULL 2048×1024 COLOR ALBEDO WITH CRISP 50M COASTLINES ──
  const landComposite = document.createElement('canvas');
  landComposite.width = fullW;
  landComposite.height = fullH;
  const lcCtx = landComposite.getContext('2d')!;
  lcCtx.drawImage(biomeCanvas, 0, 0, fullW, fullH);

  // Crisp sub-pixel national boundaries on land
  lcCtx.save();
  lcCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  lcCtx.lineWidth = 0.85;
  lcCtx.beginPath();
  if (countryBordersGeo.type === 'MultiLineString') {
    for (const line of countryBordersGeo.coordinates) {
      traceRing(lcCtx, line, fullW, fullH, true);
    }
  }
  lcCtx.stroke();
  lcCtx.restore();

  lcCtx.globalCompositeOperation = 'destination-in';
  lcCtx.drawImage(maskCanvas, 0, 0, fullW, fullH);
  lcCtx.globalCompositeOperation = 'source-over';

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = fullW;
  colorCanvas.height = fullH;
  const cCtx = colorCanvas.getContext('2d')!;
  cCtx.drawImage(oceanCanvas, 0, 0, fullW, fullH);
  cCtx.drawImage(landComposite, 0, 0, fullW, fullH);

  // Delicate coastal shoreline anti-aliased transition
  cCtx.save();
  cCtx.strokeStyle = 'rgba(182, 206, 214, 0.24)';
  cCtx.lineWidth = 1.0;
  const tracePolys = (rings: number[][][]) => {
    cCtx.beginPath();
    for (const ring of rings) {
      traceRing(cCtx, ring, fullW, fullH, true);
    }
    cCtx.stroke();
  };
  if (landGeo.type === 'FeatureCollection') {
    for (const f of landGeo.features) {
      if (!f.geometry) continue;
      if (f.geometry.type === 'Polygon') tracePolys(f.geometry.coordinates);
      else if (f.geometry.type === 'MultiPolygon') {
        for (const poly of f.geometry.coordinates) tracePolys(poly);
      }
    }
  }
  cCtx.restore();

  // ── 5. BLACK-MARBLE SPARKLING NIGHT CITY LIGHT ARTERIES (1536×768) ──
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = synthW;
  nightCanvas.height = synthH;
  const ntCtx = nightCanvas.getContext('2d')!;
  ntCtx.fillStyle = '#000000';
  ntCtx.fillRect(0, 0, synthW, synthH);

  const paintGlowCluster = (lng: number, lat: number, radiusPx: number, intensity = 0.78) => {
    const cx = projectX(lng, synthW);
    const cy = projectY(lat, synthH);
    const g = ntCtx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
    g.addColorStop(0, `rgba(255, 240, 192, ${intensity})`);
    g.addColorStop(0.32, `rgba(251, 191, 36, ${intensity * 0.56})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ntCtx.fillStyle = g;
    ntCtx.beginPath();
    ntCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ntCtx.fill();
  };

  const urbanCorridors: Array<[number, number, number, number]> = [
    [77.2, 28.6, 17, 0.88],
    [80.9, 26.8, 13, 0.7],
    [85.1, 25.6, 10, 0.64],
    [88.3, 22.6, 13, 0.8],
    [72.8, 19.0, 12, 0.85],
    [77.6, 13.0, 10, 0.75],
    [80.2, 13.1, 9, 0.7],
    [78.5, 17.4, 9, 0.7],
    [74.3, 31.5, 12, 0.68],
    [31.2, 30.1, 14, 0.86],
    [2.3, 48.8, 16, 0.78],
    [-0.1, 51.5, 13, 0.8],
    [9.2, 45.4, 13, 0.72],
    [13.4, 52.5, 12, 0.68],
    [37.6, 55.7, 15, 0.8],
    [116.4, 39.9, 17, 0.82],
    [121.4, 31.2, 17, 0.86],
    [113.3, 23.1, 15, 0.84],
    [139.7, 35.7, 16, 0.88],
    [127.0, 37.5, 12, 0.78],
    [106.8, -6.2, 12, 0.74],
    [-74.0, 40.7, 18, 0.86],
    [-87.6, 41.8, 14, 0.72],
    [-118.2, 34.0, 14, 0.8],
    [-46.6, -23.5, 13, 0.78],
  ];
  for (const [lng, lat, r, alpha] of urbanCorridors) {
    paintGlowCluster(lng, lat, r, alpha);
  }
  for (const city of ALL_MONITORED_CITIES) {
    paintGlowCluster(
      city.longitude,
      city.latitude,
      city.countryGroup === 'India' ? 6.5 : 5.5,
      0.66
    );
  }

  // Strictly clip night lights to land and modulate with crisp high-frequency street-artery grain
  ntCtx.globalCompositeOperation = 'destination-in';
  ntCtx.drawImage(synthMaskCanvas, 0, 0, synthW, synthH);
  ntCtx.globalCompositeOperation = 'source-over';

  const nightImg = ntCtx.getImageData(0, 0, synthW, synthH);
  const ntd = nightImg.data;
  for (let y = 0; y < synthH; y += 1) {
    for (let x = 0; x < synthW; x += 1) {
      const i = (y * synthW + x) * 4;
      if (ntd[i] > 6) {
        const streetGrid = 0.42 + 0.58 * hash2D(x, y, 409);
        const cluster = 0.6 + 0.4 * valueNoise2D(x * 0.35, y * 0.35, Math.round(synthW * 0.35), 503);
        const mod = streetGrid * cluster * 1.15;
        ntd[i] = Math.min(255, Math.round(ntd[i] * mod));
        ntd[i + 1] = Math.min(255, Math.round(ntd[i + 1] * mod));
        ntd[i + 2] = Math.min(255, Math.round(ntd[i + 2] * mod));
      }
    }
  }
  ntCtx.putImageData(nightImg, 0, 0);

  // ── 6. DOMAIN-WARPED CORIOLIS CLOUD & CIRRUS LAYER (1536×768) ──
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = synthW;
  cloudCanvas.height = synthH;
  const clCtx = cloudCanvas.getContext('2d')!;
  const cloudImg = clCtx.createImageData(synthW, synthH);
  const cld = cloudImg.data;
  const cPeriod = 12;

  for (let y = 0; y < synthH; y += 1) {
    const lat = 90 - ((y + 0.5) / synthH) * 180;
    const absLat = Math.abs(lat);
    const ny = (y / synthH) * (cPeriod * 0.5);
    const stormBelt =
      Math.exp(-Math.pow((absLat - 48) / 14, 2)) * 0.14 +
      Math.exp(-Math.pow(absLat / 10, 2)) * 0.12 -
      Math.exp(-Math.pow((absLat - 25) / 8, 2)) * 0.1;

    for (let x = 0; x < synthW; x += 1) {
      const nx = (x / synthW) * cPeriod;
      const warpX = fbm2D(nx * 1.1, ny * 1.1, Math.round(cPeriod * 1.1), 211, 2) - 0.5;
      const warpY = fbm2D(nx * 1.1 + 3.7, ny * 1.1 + 1.9, Math.round(cPeriod * 1.1), 257, 2) - 0.5;
      const cumulus = fbm2D(nx + warpX * 2.3, ny + warpY * 1.45, cPeriod, 313, 4);
      const cirrus = fbm2D((nx + warpX) * 0.75, (ny + warpY * 0.3) * 2.6, Math.round(cPeriod * 0.75), 379, 3);
      const swirl = cumulus * 0.72 + cirrus * 0.28 + stormBelt;
      const idx = (y * synthW + x) * 4;
      const density = clamp01((swirl - 0.52) / 0.29);
      const alpha = Math.round(Math.pow(density, 1.32) * 238);
      cld[idx] = 248;
      cld[idx + 1] = 251;
      cld[idx + 2] = 255;
      cld[idx + 3] = alpha;
    }
  }
  clCtx.putImageData(cloudImg, 0, 0);

  // ── 7. SOFT RADIAL STAR SPRITE TEXTURE ──
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 64;
  starCanvas.height = 64;
  const stCtx = starCanvas.getContext('2d')!;
  const sg = stCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  sg.addColorStop(0, 'rgba(255, 255, 255, 1)');
  sg.addColorStop(0.24, 'rgba(226, 232, 240, 0.85)');
  sg.addColorStop(0.58, 'rgba(148, 163, 184, 0.2)');
  sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  stCtx.fillStyle = sg;
  stCtx.fillRect(0, 0, 64, 64);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;

  const nightLightsMap = new THREE.CanvasTexture(nightCanvas);
  nightLightsMap.colorSpace = THREE.SRGBColorSpace;
  nightLightsMap.anisotropy = maxAnisotropy;

  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.anisotropy = maxAnisotropy;

  const starSpriteMap = new THREE.CanvasTexture(starCanvas);
  starSpriteMap.colorSpace = THREE.SRGBColorSpace;

  return {
    colorMap,
    normalMap,
    bumpMap,
    roughnessMap,
    nightLightsMap,
    cloudMap,
    starSpriteMap,
  };
}
