import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Compass,
  Grid,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ALL_MONITORED_CITIES } from '../lib/aqiCities';
import { CPCB_CATEGORY_STYLES } from '../lib/cpcb';
import { createRealisticEarthTextures } from '../lib/earthTextures';
import {
  computeUtcSunSubsolarCoords,
  latLngToVector3Coords,
  vector3ToLatLngCoords,
} from '../lib/globeMath';
import type { AirQualitySnapshot, IndianLocation, Language } from '../types/vayu';

interface InteractiveGlobeProps {
  selectedLocation: IndianLocation;
  snapshot?: AirQualitySnapshot | null;
  onSelectLocation: (loc: IndianLocation) => void;
  onDetectGps: () => void;
  isLocating: boolean;
  lang: Language;
}

const GLOBE_RADIUS = 1.0;

const GLOBE_REGION_TARGETS = [
  { id: 'india', labelEn: 'India', labelHi: 'भारत', lat: 21.5, lng: 78.9, dist: 2.55 },
  { id: 'asia', labelEn: 'Asia', labelHi: 'एशिया', lat: 30.0, lng: 112.0, dist: 2.85 },
  { id: 'europe', labelEn: 'Europe', labelHi: 'यूरोप', lat: 48.8, lng: 10.0, dist: 2.7 },
  { id: 'americas', labelEn: 'Americas', labelHi: 'अमेरिका', lat: 22.0, lng: -80.0, dist: 3.05 },
  { id: 'africa', labelEn: 'Africa/ME', labelHi: 'अफ्रीका/ME', lat: 10.0, lng: 28.0, dist: 2.95 },
  { id: 'oceania', labelEn: 'Oceania', labelHi: 'ओशिनिया', lat: -28.0, lng: 145.0, dist: 2.8 },
];

const FALLBACK_HUB_IDS = new Set([
  'in-delhi',
  'in-mumbai',
  'in-bengaluru',
  'in-chennai',
  'in-kolkata',
  'in-hyderabad',
  'in-jaipur',
  'in-lucknow',
  'in-srinagar',
  'in-guwahati',
  'gl-london',
  'gl-paris',
  'gl-zurich',
  'gl-new-york',
  'gl-san-francisco',
  'gl-mexico-city',
  'gl-sao-paulo',
  'gl-cairo',
  'gl-dubai',
  'gl-nairobi',
  'gl-tokyo',
  'gl-beijing',
  'gl-singapore',
  'gl-sydney',
]);

function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const { x, y, z } = latLngToVector3Coords(lat, lng, radius);
  return out.set(x, y, z);
}

function vector3ToLatLng(point: THREE.Vector3): { lat: number; lng: number } {
  return vector3ToLatLngCoords(point);
}

// Compute real astronomical subsolar vector from UTC date/clock
function computeUtcSunDirection(now = new Date(), out = new THREE.Vector3()): THREE.Vector3 {
  const { lat, lng } = computeUtcSunSubsolarCoords(now);
  return latLngToVector3(lat, lng, 1, out).normalize();
}

function buildCartographicGraticule(radius: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();

  // Parallels every 15° plus Tropics at ±23.44°
  const lats = [-75, -60, -45, -30, -23.44, -15, 0, 15, 23.44, 30, 45, 60, 75];
  const lonSteps = 96;
  for (const lat of lats) {
    for (let i = 0; i < lonSteps; i += 1) {
      const l1 = -180 + (i / lonSteps) * 360;
      const l2 = -180 + ((i + 1) / lonSteps) * 360;
      latLngToVector3(lat, l1, radius, pA);
      latLngToVector3(lat, l2, radius, pB);
      positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
    }
  }

  // Meridians every 15° from 80°S to 80°N
  const latSteps = 64;
  for (let lng = -180; lng < 180; lng += 15) {
    for (let j = 0; j < latSteps; j += 1) {
      const a1 = -80 + (j / latSteps) * 160;
      const a2 = -80 + ((j + 1) / latSteps) * 160;
      latLngToVector3(a1, lng, radius, pA);
      latLngToVector3(a2, lng, radius, pB);
      positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

const _tmpVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _targetCamDir = new THREE.Vector3();
const _curCamDir = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _dotFlatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _surfaceQuat = new THREE.Quaternion();
const _colorGold = new THREE.Color('#fbbf24');
const _colorSky = new THREE.Color('#38bdf8');

export function InteractiveGlobe({
  selectedLocation,
  snapshot,
  onSelectLocation,
  onDetectGps,
  isLocating,
  lang,
}: InteractiveGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
  const [autoSpin, setAutoSpin] = useState(() => !prefersReducedMotion);
  const [showClouds, setShowClouds] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [utcSunMode, setUtcSunMode] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [hoverCityName, setHoverCityName] = useState<string | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const selectedRef = useRef(selectedLocation);
  const prevCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  selectedRef.current = selectedLocation;

  const onSelectRef = useRef(onSelectLocation);
  onSelectRef.current = onSelectLocation;

  const autoSpinRef = useRef(autoSpin);
  autoSpinRef.current = autoSpin;

  const focusLocationTriggerRef = useRef<(() => void) | null>(null);
  const flyToCoordsTriggerRef = useRef<((lat: number, lng: number, dist: number) => void) | null>(
    null
  );
  const zoomTriggerRef = useRef<((factor: number) => void) | null>(null);
  const cloudToggleTriggerRef = useRef<((visible: boolean) => void) | null>(null);
  const gridToggleTriggerRef = useRef<((visible: boolean) => void) | null>(null);
  const lightingToggleTriggerRef = useRef<((useUtcSun: boolean) => void) | null>(null);
  const beaconColorTriggerRef = useRef<((hex: string) => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (autoSpin) {
      requestRenderRef.current?.();
    }
  }, [autoSpin]);

  useEffect(() => {
    focusLocationTriggerRef.current?.();
  }, [selectedLocation.latitude, selectedLocation.longitude]);

  useEffect(() => {
    cloudToggleTriggerRef.current?.(showClouds);
  }, [showClouds]);

  useEffect(() => {
    gridToggleTriggerRef.current?.(showGrid);
  }, [showGrid]);

  useEffect(() => {
    lightingToggleTriggerRef.current?.(utcSunMode);
  }, [utcSunMode]);

  useEffect(() => {
    if (!snapshot) return;
    const accentHex = CPCB_CATEGORY_STYLES[snapshot.cpcb.categoryKey]?.accentHex ?? '#38BDF8';
    beaconColorTriggerRef.current?.(accentHex);
  }, [snapshot?.cpcb.categoryKey, snapshot?.location.id]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    let isSoftwareGl = false;

    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      const fallbackGl = probe ?? document.createElement('canvas').getContext('webgl');
      if (!fallbackGl) {
        setWebglUnavailable(true);
        return;
      }
      if (probe) {
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } else {
        isSoftwareGl = true;
      }

      const width = Math.max(280, container.clientWidth || 720);
      const height = Math.max(280, container.clientHeight || 460);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.touchAction = 'none';
      container.appendChild(renderer.domElement);
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = Math.max(280, container.clientWidth || 720);
    const height = Math.max(280, container.clientHeight || 460);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030712');

    // 33-deg telephoto orbital lens reduces perspective distortion so Earth feels massive
    const camera = new THREE.PerspectiveCamera(33, width / height, 0.1, 70);
    latLngToVector3(
      selectedRef.current.latitude,
      selectedRef.current.longitude,
      2.65,
      camera.position
    );

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.28;
    pmremGenerator.dispose();

    const sunDir = computeUtcSunDirection(new Date());
    const orbitalSunDir = camera.position
      .clone()
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55)
      .add(new THREE.Vector3(0, 0.28, 0))
      .normalize();

    // Default clear orbital sunlight rig (keeps terrain & coastlines crisp across all timezones)
    const hemiLight = new THREE.HemisphereLight('#bae6fd', '#081226', 1.05);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fff8ef', 2.45);
    keyLight.position.copy(orbitalSunDir).multiplyScalar(8);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.45);
    rimLight.position.copy(orbitalSunDir).multiplyScalar(-5).add(new THREE.Vector3(0, 1.8, 0));
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const {
      colorMap,
      normalMap,
      bumpMap,
      roughnessMap,
      nightLightsMap,
      cloudMap,
      starSpriteMap,
    } = createRealisticEarthTextures(maxAniso);

    // High-segment Earth mesh with PBR ocean specular glint, mountain relief & black-marble night lights
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 84);
    const earthUniforms = {
      uSunDirection: { value: orbitalSunDir.clone() },
      uDayNightMix: { value: 0.22 },
    };

    const earthMat = new THREE.MeshPhysicalMaterial({
      map: colorMap,
      normalMap,
      normalScale: new THREE.Vector2(1.65, 1.65),
      bumpMap,
      bumpScale: 0.024,
      roughnessMap,
      roughness: 1.0,
      metalness: 0.02,
      clearcoat: 0.14,
      clearcoatRoughness: 0.28,
      emissive: new THREE.Color('#ffcb75'),
      emissiveMap: nightLightsMap,
      emissiveIntensity: 0.45,
    });

    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDirection = earthUniforms.uSunDirection;
      shader.uniforms.uDayNightMix = earthUniforms.uDayNightMix;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vGlobeWorldNormal;
           varying vec3 vGlobeWorldPos;`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
           vGlobeWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vGlobeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uSunDirection;
           uniform float uDayNightMix;
           varying vec3 vGlobeWorldNormal;
           varying vec3 vGlobeWorldPos;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           vec3 globeN = normalize(vGlobeWorldNormal);
           vec3 globeV = normalize(cameraPosition - vGlobeWorldPos);
           float sunDot = dot(globeN, normalize(uSunDirection));
           float viewRim = pow(1.0 - clamp(dot(globeN, globeV), 0.0, 1.0), 4.6);
           float dayFactor = smoothstep(-0.25, 0.35, sunDot);
           vec3 rayleighHaze = vec3(0.32, 0.65, 0.99);
           diffuseColor.rgb = mix(diffuseColor.rgb, rayleighHaze, viewRim * (0.12 + 0.26 * dayFactor));
           // Subtle warm twilight scatter along solar terminator
           float twilight = exp(-pow(sunDot / 0.14, 2.0)) * uDayNightMix;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.50, 0.24), twilight * 0.22);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float nightDot = dot(normalize(vGlobeWorldNormal), normalize(uSunDirection));
           float nightMask = mix(0.18, smoothstep(0.10, -0.22, nightDot), uDayNightMix);
           totalEmissiveRadiance *= nightMask;
           float darkSide = smoothstep(0.06, -0.45, nightDot) * uDayNightMix;
           totalEmissiveRadiance += diffuseColor.rgb * vec3(0.06, 0.11, 0.20) * darkSide;`
        );
    };

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.layers.enable(1);
    globeGroup.add(earthMesh);

    // Subtle cloud shadow projection layer hovering just above terrain & oceans
    const cloudShadowGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.0045, 72, 54);
    const cloudShadowMat = new THREE.MeshBasicMaterial({
      map: cloudMap,
      color: new THREE.Color('#020617'),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const cloudShadowMesh = new THREE.Mesh(cloudShadowGeo, cloudShadowMat);
    cloudShadowMesh.rotation.y = -0.012;
    cloudShadowMesh.renderOrder = 1;
    globeGroup.add(cloudShadowMesh);

    // Crisp translucent tropospheric cloud deck (keeps continents razor sharp below)
    const cloudGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.012, 88, 64);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.42,
      roughness: 0.92,
      metalness: 0.0,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.renderOrder = 2;
    globeGroup.add(cloudMesh);

    // Faint Toggleable 15-degree Cartographic Latitude / Longitude Graticule (off by default for photorealism)
    const graticuleGeo = buildCartographicGraticule(GLOBE_RADIUS * 1.0025);
    const graticuleMat = new THREE.LineBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
    });
    const graticuleLines = new THREE.LineSegments(graticuleGeo, graticuleMat);
    graticuleLines.visible = false;
    graticuleLines.renderOrder = 2;
    globeGroup.add(graticuleLines);

    // Delicate Night-Side Upper-Mesosphere Airglow Shell (seen in ISS limb photography)
    const airglowGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.032, 64, 48);
    const airglowMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uSunDirection: { value: sunDir.clone() },
      },
      vertexShader: `
        varying vec3 vWNorm;
        varying vec3 vVDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWNorm = normalize(mat3(modelMatrix) * normal);
          vVDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDirection;
        varying vec3 vWNorm;
        varying vec3 vVDir;
        void main() {
          float rim = pow(clamp(0.56 - dot(normalize(vWNorm), normalize(vVDir)), 0.0, 1.0), 4.0);
          float nightSide = smoothstep(0.08, -0.38, dot(normalize(vWNorm), normalize(uSunDirection)));
          gl_FragColor = vec4(0.18, 0.78, 0.62, rim * nightSide * 0.24);
        }
      `,
    });
    const airglowMesh = new THREE.Mesh(airglowGeo, airglowMat);
    airglowMesh.renderOrder = 3;
    globeGroup.add(airglowMesh);

    // Outer Physical Rayleigh Scattering + Solar Twilight Rim Halo
    const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.068, 72, 54);
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uSunDirection: { value: sunDir.clone() },
        uDayGlow: { value: new THREE.Color('#60a5fa') },
        uHorizonGlow: { value: new THREE.Color('#1d4ed8') },
        uSunsetGlow: { value: new THREE.Color('#f59e0b') },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDirection;
        uniform vec3 uDayGlow;
        uniform vec3 uHorizonGlow;
        uniform vec3 uSunsetGlow;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(vViewDir);
          float fresnel = pow(clamp(0.58 - dot(N, V), 0.0, 1.0), 3.4);
          float sunDot = dot(N, normalize(uSunDirection));
          float sunSide = smoothstep(-0.32, 0.78, sunDot);
          float terminatorBand = exp(-pow(sunDot / 0.18, 2.0));
          vec3 col = mix(uHorizonGlow, uDayGlow, sunSide);
          col = mix(col, uSunsetGlow, terminatorBand * 0.30);
          float alpha = fresnel * (0.20 + 0.74 * sunSide);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.renderOrder = 3;
    globeGroup.add(atmoMesh);

    // ── DEEP-SPACE STARFIELD + MILKY WAY GALACTIC BAND ──
    const starCount = 2100;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const galTilt = new THREE.Euler(1.08, 0.42, 0.25);
    const starVec = new THREE.Vector3();

    for (let i = 0; i < starCount; i += 1) {
      const r = 13.5 + ((i * 73) % 21) * 0.9;
      if (i < 850) {
        // Tilted galactic dust plane concentration
        const angle = ((i * 137.508) % 360) * (Math.PI / 180);
        const spreadLat = ((((i * 31) % 100) / 100) - 0.5) * 0.34;
        starVec.set(
          r * Math.cos(spreadLat) * Math.cos(angle),
          r * Math.sin(spreadLat),
          r * Math.cos(spreadLat) * Math.sin(angle)
        );
        starVec.applyEuler(galTilt);
      } else {
        const theta = ((i * 137.508) % 360) * (Math.PI / 180);
        const phi = Math.acos(1 - (2 * (i + 0.5)) / starCount);
        starVec.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
      }
      starPositions[i * 3] = starVec.x;
      starPositions[i * 3 + 1] = starVec.y;
      starPositions[i * 3 + 2] = starVec.z;

      const temp = (i * 29) % 10;
      let sr = 0.92;
      let sg = 0.95;
      let sb = 1.0;
      if (temp < 3) {
        sr = 0.74;
        sg = 0.87;
        sb = 1.0;
      } else if (temp > 7) {
        sr = 1.0;
        sg = 0.86;
        sb = 0.72;
      }
      const brightness = i < 850 ? 0.32 + ((i * 17) % 45) / 100 : 0.48 + ((i * 19) % 52) / 100;
      starColors[i * 3] = sr * brightness;
      starColors[i * 3 + 1] = sg * brightness;
      starColors[i * 3 + 2] = sb * brightness;
    }

    const starPointsGeo = new THREE.BufferGeometry();
    starPointsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starPointsGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starPointsMat = new THREE.PointsMaterial({
      size: 0.13,
      map: starSpriteMap,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const starField = new THREE.Points(starPointsGeo, starPointsMat);
    scene.add(starField);

    // Brighter 1st-magnitude navigation stars
    const brightCount = 120;
    const brightPos = new Float32Array(brightCount * 3);
    for (let i = 0; i < brightCount; i += 1) {
      const r = 18.0 + (i % 7) * 1.4;
      const theta = ((i * 191.3) % 360) * (Math.PI / 180);
      const phi = Math.acos(1 - (2 * (i + 0.5)) / brightCount);
      brightPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      brightPos[i * 3 + 1] = r * Math.cos(phi);
      brightPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const brightStarGeo = new THREE.BufferGeometry();
    brightStarGeo.setAttribute('position', new THREE.BufferAttribute(brightPos, 3));
    const brightStarMat = new THREE.PointsMaterial({
      size: 0.25,
      color: '#e0f2fe',
      map: starSpriteMap,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const brightStars = new THREE.Points(brightStarGeo, brightStarMat);
    scene.add(brightStars);

    // ── SLEEK FLUSH SURFACE TELEMETRY NODES (InstancedMesh) ──
    const cityCount = ALL_MONITORED_CITIES.length;
    const nodeRingGeo = new THREE.RingGeometry(0.0052, 0.0092, 16);
    const nodeCoreGeo = new THREE.CircleGeometry(0.0038, 12);
    const nodeRingMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const nodeCoreMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });

    const cityRingsInst = new THREE.InstancedMesh(nodeRingGeo, nodeRingMat, cityCount);
    const cityCoresInst = new THREE.InstancedMesh(nodeCoreGeo, nodeCoreMat, cityCount);
    cityRingsInst.renderOrder = 4;
    cityCoresInst.renderOrder = 5;

    const clickableProxies: THREE.Mesh[] = [];
    const proxyGeo = new THREE.SphereGeometry(0.026, 8, 8);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    ALL_MONITORED_CITIES.forEach((city, idx) => {
      latLngToVector3(city.latitude, city.longitude, GLOBE_RADIUS + 0.0024, _tmpVec);
      const normalDir = _tmpVec.clone().normalize();
      _surfaceQuat.setFromUnitVectors(_upVec, normalDir).multiply(_dotFlatQuat);

      _dummyObj.position.copy(_tmpVec);
      _dummyObj.quaternion.copy(_surfaceQuat);
      _dummyObj.scale.setScalar(1);
      _dummyObj.updateMatrix();
      cityRingsInst.setMatrixAt(idx, _dummyObj.matrix);
      cityCoresInst.setMatrixAt(idx, _dummyObj.matrix);

      const tint = city.countryGroup === 'India' ? _colorGold : _colorSky;
      cityRingsInst.setColorAt(idx, tint);
      cityCoresInst.setColorAt(idx, tint);

      const hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
      hitProxy.position.copy(_tmpVec);
      hitProxy.layers.set(1);
      hitProxy.userData = { city };
      clickableProxies.push(hitProxy);
      globeGroup.add(hitProxy);
    });
    cityRingsInst.instanceMatrix.needsUpdate = true;
    cityCoresInst.instanceMatrix.needsUpdate = true;
    if (cityRingsInst.instanceColor) cityRingsInst.instanceColor.needsUpdate = true;
    if (cityCoresInst.instanceColor) cityCoresInst.instanceColor.needsUpdate = true;
    cityRingsInst.computeBoundingSphere();
    cityCoresInst.computeBoundingSphere();
    globeGroup.add(cityRingsInst, cityCoresInst);

    // ── PRECISION ORBITAL TARGET RETICLE FOR SELECTED LOCATION ──
    const activeGroup = new THREE.Group();
    const activeOuterRingGeo = new THREE.RingGeometry(0.019, 0.025, 28);
    const activeOuterRingMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const activeOuterRing = new THREE.Mesh(activeOuterRingGeo, activeOuterRingMat);
    activeOuterRing.rotation.x = -Math.PI / 2;
    activeOuterRing.position.y = 0.002;

    const activeInnerDiscGeo = new THREE.CircleGeometry(0.007, 16);
    const activeInnerDiscMat = new THREE.MeshBasicMaterial({
      color: '#5DCAA5',
      side: THREE.DoubleSide,
    });
    const activeInnerDisc = new THREE.Mesh(activeInnerDiscGeo, activeInnerDiscMat);
    activeInnerDisc.rotation.x = -Math.PI / 2;
    activeInnerDisc.position.y = 0.0025;

    const activeBeamGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.052, 8);
    const activeBeamMat = new THREE.MeshBasicMaterial({
      color: '#E6EDF7',
      transparent: true,
      opacity: 0.82,
    });
    const activeBeam = new THREE.Mesh(activeBeamGeo, activeBeamMat);
    activeBeam.position.y = 0.028;

    const activeBeaconGeo = new THREE.OctahedronGeometry(0.0095, 0);
    const activeBeaconMat = new THREE.MeshStandardMaterial({
      color: '#38BDF8',
      emissive: '#1D9E75',
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.4,
    });
    const activeBeacon = new THREE.Mesh(activeBeaconGeo, activeBeaconMat);
    activeBeacon.position.y = 0.058;

    activeGroup.add(activeOuterRing, activeInnerDisc, activeBeam, activeBeacon);

    function placeOnSphere(obj: THREE.Object3D, lat: number, lng: number, radiusOffset = 0) {
      latLngToVector3(lat, lng, GLOBE_RADIUS + radiusOffset, obj.position);
      _tmpVec.copy(obj.position).normalize();
      obj.quaternion.setFromUnitVectors(_upVec, _tmpVec);
    }

    placeOnSphere(
      activeGroup,
      selectedRef.current.latitude,
      selectedRef.current.longitude,
      0.0028
    );
    globeGroup.add(activeGroup);

    // Geodesic arc connecting previous pin to newly selected city
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 56; i += 1) arcPoints.push(new THREE.Vector3());
    let flightArcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const flightArcMat = new THREE.LineBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.72,
    });
    const flightArcLine = new THREE.Line(flightArcGeo, flightArcMat);
    flightArcLine.visible = false;
    globeGroup.add(flightArcLine);

    const updateFlightArc = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
      const startVec = latLngToVector3(fromLat, fromLng, GLOBE_RADIUS + 0.006, new THREE.Vector3());
      const endVec = latLngToVector3(toLat, toLng, GLOBE_RADIUS + 0.006, new THREE.Vector3());
      const chordDist = startVec.distanceTo(endVec);
      if (chordDist < 0.04) {
        flightArcLine.visible = false;
        return;
      }
      const arcApex = 1.0 + Math.min(0.36, chordDist * 0.2);
      const pts: THREE.Vector3[] = [];
      const steps = 56;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const p = new THREE.Vector3().lerpVectors(startVec, endVec, t).normalize();
        const lift = Math.sin(Math.PI * t) * (arcApex - 1.0);
        p.multiplyScalar(GLOBE_RADIUS + 0.006 + lift);
        pts.push(p);
      }
      flightArcGeo.dispose();
      flightArcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      flightArcLine.geometry = flightArcGeo;
      flightArcLine.visible = true;
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.minDistance = 1.28;
    controls.maxDistance = 4.8;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.82;

    let transitionActive = false;
    let targetDist = 2.72;

    const startFocusOnSelected = () => {
      const curLat = selectedRef.current.latitude;
      const curLng = selectedRef.current.longitude;
      if (prevCoordsRef.current) {
        updateFlightArc(prevCoordsRef.current.lat, prevCoordsRef.current.lng, curLat, curLng);
      }
      prevCoordsRef.current = { lat: curLat, lng: curLng };

      placeOnSphere(activeGroup, curLat, curLng, 0.0028);
      latLngToVector3(curLat, curLng, 1, _targetCamDir).normalize();
      targetDist = Math.min(2.72, Math.max(1.75, camera.position.length()));
      transitionActive = true;
      requestRender();
    };

    const flyToCoords = (lat: number, lng: number, dist: number) => {
      latLngToVector3(lat, lng, 1, _targetCamDir).normalize();
      targetDist = dist;
      transitionActive = true;
      requestRender();
    };

    const zoomBy = (factor: number) => {
      _targetCamDir.copy(camera.position).normalize();
      targetDist = Math.max(1.28, Math.min(4.6, camera.position.length() * factor));
      transitionActive = true;
      requestRender();
    };

    const setCloudsVisible = (visible: boolean) => {
      cloudMesh.visible = visible;
      cloudShadowMesh.visible = visible;
      requestRender();
    };

    const setGridVisible = (visible: boolean) => {
      graticuleLines.visible = visible;
      requestRender();
    };

    const setUtcLighting = (useUtcSun: boolean) => {
      if (useUtcSun) {
        hemiLight.intensity = 0.52;
        keyLight.intensity = 2.85;
        keyLight.position.copy(sunDir).multiplyScalar(8);
        rimLight.position.copy(sunDir).multiplyScalar(-5).add(new THREE.Vector3(0, 1.8, 0));
        earthUniforms.uSunDirection.value.copy(sunDir);
        earthUniforms.uDayNightMix.value = 1.0;
        atmoMat.uniforms.uSunDirection.value.copy(sunDir);
        airglowMat.uniforms.uSunDirection.value.copy(sunDir);
        earthMat.emissiveIntensity = 1.5;
        airglowMesh.visible = true;
      } else {
        const curCamSun = camera.position
          .clone()
          .normalize()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.52)
          .add(new THREE.Vector3(0, 0.25, 0))
          .normalize();
        hemiLight.intensity = 1.05;
        keyLight.intensity = 2.45;
        keyLight.position.copy(curCamSun).multiplyScalar(8);
        rimLight.position.copy(curCamSun).multiplyScalar(-5).add(new THREE.Vector3(0, 1.8, 0));
        earthUniforms.uSunDirection.value.copy(curCamSun);
        earthUniforms.uDayNightMix.value = 0.22;
        atmoMat.uniforms.uSunDirection.value.copy(curCamSun);
        airglowMat.uniforms.uSunDirection.value.copy(curCamSun);
        earthMat.emissiveIntensity = 0.45;
        airglowMesh.visible = true;
      }
      requestRender();
    };

    const setBeaconTint = (hex: string) => {
      activeOuterRingMat.color.set(hex);
      activeBeaconMat.color.set(hex);
      activeBeaconMat.emissive.set(hex);
      requestRender();
    };

    focusLocationTriggerRef.current = startFocusOnSelected;
    flyToCoordsTriggerRef.current = flyToCoords;
    zoomTriggerRef.current = zoomBy;
    cloudToggleTriggerRef.current = setCloudsVisible;
    gridToggleTriggerRef.current = setGridVisible;
    lightingToggleTriggerRef.current = setUtcLighting;
    beaconColorTriggerRef.current = setBeaconTint;
    requestRenderRef.current = requestRender;

    controls.addEventListener('start', () => {
      transitionActive = false;
    });

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 60) return;
      lastHoverCheck = now;

      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableProxies, false);
      if (hits.length > 0) {
        const city = hits[0].object.userData.city as IndianLocation | undefined;
        renderer.domElement.style.cursor = 'pointer';
        setHoverCityName(city ? `${city.name}, ${city.state}` : null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoverCityName(null);
      }
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (dist > 6) return;

      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);

      const pinHits = raycaster.intersectObjects(clickableProxies, false);
      if (pinHits.length > 0) {
        const city = pinHits[0].object.userData.city as IndianLocation | undefined;
        if (city) {
          onSelectRef.current(city);
          return;
        }
      }

      const earthHits = raycaster.intersectObject(earthMesh, false);
      if (earthHits.length > 0) {
        const { lat, lng } = vector3ToLatLng(earthHits[0].point);
        const ns = lat >= 0 ? 'N' : 'S';
        const ew = lng >= 0 ? 'E' : 'W';
        onSelectRef.current({
          id: `globe-${lat}-${lng}`,
          name: `Globe Pin (${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lng).toFixed(1)}°${ew})`,
          state: `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`,
          latitude: Math.max(-85, Math.min(85, lat)),
          longitude: lng,
        });
      }
    };

    const handlePointerLeave = () => {
      setHoverCityName(null);
    };

    const handleContextLost = (ev: Event) => {
      ev.preventDefault();
      disposed = true;
      setWebglUnavailable(true);
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointercancel', handlePointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    let rafId = 0;
    let timeoutId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        timeoutId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timeoutId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 80);
        }
      };
      timeoutId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      rafId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const delta = Math.min(0.1, clock.getDelta());

        if (!isSoftwareGl && !prefersReducedMotion) {
          cloudMesh.rotation.y += delta * 0.011;
          cloudShadowMesh.rotation.y = cloudMesh.rotation.y - 0.012;
          activeBeacon.rotation.y += delta * 0.9;
        }

        if (transitionActive) {
          const curLen = camera.position.length();
          _curCamDir.copy(camera.position).normalize();
          const alpha = 1 - Math.exp(-5.2 * delta);
          _curCamDir.lerp(_targetCamDir, alpha).normalize();
          const nextLen = THREE.MathUtils.damp(curLen, targetDist, 5.2, delta);
          camera.position.copy(_curCamDir).multiplyScalar(nextLen);
          if (
            _curCamDir.distanceTo(_targetCamDir) < 0.008 &&
            Math.abs(nextLen - targetDist) < 0.01
          ) {
            transitionActive = false;
          }
        } else if (autoSpinRef.current && !isSoftwareGl && !prefersReducedMotion) {
          camera.position.applyAxisAngle(_upVec, delta * 0.085);
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (
            !disposed &&
            (renderDirty ||
              transitionActive ||
              (autoSpinRef.current && !isSoftwareGl && !prefersReducedMotion))
          ) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 460;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => handleResize()) : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      requestRenderRef.current = null;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointercancel', handlePointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      colorMap.dispose();
      normalMap.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
      nightLightsMap.dispose();
      cloudMap.dispose();
      starSpriteMap.dispose();
      envTex.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      cloudShadowGeo.dispose();
      cloudShadowMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      graticuleGeo.dispose();
      graticuleMat.dispose();
      airglowGeo.dispose();
      airglowMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      starPointsGeo.dispose();
      starPointsMat.dispose();
      brightStarGeo.dispose();
      brightStarMat.dispose();
      nodeRingGeo.dispose();
      nodeCoreGeo.dispose();
      nodeRingMat.dispose();
      nodeCoreMat.dispose();
      proxyGeo.dispose();
      proxyMat.dispose();
      activeOuterRingGeo.dispose();
      activeOuterRingMat.dispose();
      activeInnerDiscGeo.dispose();
      activeInnerDiscMat.dispose();
      activeBeamGeo.dispose();
      activeBeamMat.dispose();
      activeBeaconGeo.dispose();
      activeBeaconMat.dispose();
      flightArcGeo.dispose();
      flightArcMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [prefersReducedMotion]);

  const ns = selectedLocation.latitude >= 0 ? 'N' : 'S';
  const ew = selectedLocation.longitude >= 0 ? 'E' : 'W';

  if (webglUnavailable) {
    const fallbackHubs = ALL_MONITORED_CITIES.filter((c) => FALLBACK_HUB_IDS.has(c.id));
    const selX = ((selectedLocation.longitude + 180) / 360) * 360;
    const selY = ((90 - selectedLocation.latitude) / 180) * 180;

    return (
      <div className="space-y-2.5">
        <div
          role="region"
          aria-label={lang === 'hi' ? '2D ग्लोब मानचित्र फ़ॉलबैक' : 'Interactive 2D World Airshed Fallback'}
          className="relative h-[360px] sm:h-[460px] w-full overflow-hidden rounded-2xl border border-white/15 bg-[#02040d] p-4 flex flex-col justify-between"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold text-[#38BDF8]">
                {lang === 'hi'
                  ? 'WebGL 3D उपलब्ध नहीं — इंटरैक्टिव 2D ग्लोब सक्रिय'
                  : 'WebGL 3D unavailable — interactive 2D globe view active'}
              </p>
              <p className="font-mono-tabular text-[11px] text-[#9FB0C7]">
                {selectedLocation.name} · {Math.abs(selectedLocation.latitude).toFixed(2)}°{ns},{' '}
                {Math.abs(selectedLocation.longitude).toFixed(2)}°{ew}
              </p>
            </div>
            <button
              type="button"
              onClick={onDetectGps}
              disabled={isLocating}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#38BDF8] px-3 py-1 text-xs font-semibold text-[#0C1322] hover:bg-[#7DD3FC] disabled:opacity-60"
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isLocating ? '...' : lang === 'hi' ? 'मेरा स्थान' : 'My Location'}</span>
            </button>
          </div>

          <svg
            viewBox="0 0 360 180"
            role="img"
            aria-label="Equirectangular global airshed selector map"
            onClick={(ev) => {
              const rect = ev.currentTarget.getBoundingClientRect();
              const normX = (ev.clientX - rect.left) / rect.width;
              const normY = (ev.clientY - rect.top) / rect.height;
              const lat = Number(Math.max(-85, Math.min(85, 90 - normY * 180)).toFixed(2));
              const lng = Number(Math.max(-180, Math.min(180, normX * 360 - 180)).toFixed(2));
              const pinNs = lat >= 0 ? 'N' : 'S';
              const pinEw = lng >= 0 ? 'E' : 'W';
              onSelectLocation({
                id: `globe-${lat}-${lng}`,
                name: `Globe Pin (${Math.abs(lat)}°${pinNs}, ${Math.abs(lng)}°${pinEw})`,
                state: `${Math.abs(lat)}°${pinNs}, ${Math.abs(lng)}°${pinEw}`,
                latitude: lat,
                longitude: lng,
              });
            }}
            className="my-2 h-full max-h-[270px] w-full cursor-crosshair rounded-xl border border-white/10 bg-[#070B1A]"
          >
            {[-60, -30, 0, 30, 60].map((lat) => {
              const y = 90 - lat;
              return (
                <line
                  key={`lat-${lat}`}
                  x1={0}
                  x2={360}
                  y1={y}
                  y2={y}
                  stroke="#38BDF8"
                  strokeOpacity={lat === 0 ? 0.25 : 0.1}
                  strokeWidth={0.5}
                />
              );
            })}
            {[-120, -60, 0, 60, 120].map((lng) => {
              const x = lng + 180;
              return (
                <line
                  key={`lng-${lng}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={180}
                  stroke="#38BDF8"
                  strokeOpacity={lng === 0 ? 0.25 : 0.1}
                  strokeWidth={0.5}
                />
              );
            })}

            {fallbackHubs.map((city) => {
              const cx = city.longitude + 180;
              const cy = 90 - city.latitude;
              const isSelected = city.id === selectedLocation.id;
              return (
                <g
                  key={city.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLocation(city);
                  }}
                  className="cursor-pointer"
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 4 : 2.3}
                    fill={city.countryGroup === 'India' ? '#fbbf24' : '#38bdf8'}
                    fillOpacity={isSelected ? 1 : 0.85}
                  />
                  <title>{`${city.name}, ${city.state}`}</title>
                </g>
              );
            })}

            <circle
              cx={selX}
              cy={selY}
              r={6}
              fill="none"
              stroke="#5DCAA5"
              strokeWidth={1.3}
            />
            <circle cx={selX} cy={selY} r={2.2} fill="#5DCAA5" />
          </svg>

          <p className="text-[11px] text-[#9FB0C7]">
            {lang === 'hi'
              ? 'ग्लोब मैप पर किसी भी शहर के बिंदु या निर्देशांक पर क्लिक करें।'
              : 'Click any hub dot or anywhere on the coordinate grid to inspect live AQI.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Globe Region Fly-To Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-[#9FB0C7] mr-1">
          {lang === 'hi' ? 'ग्लोब घुमाएं:' : 'Orbit to:'}
        </span>
        {GLOBE_REGION_TARGETS.map((tgt) => (
          <button
            key={tgt.id}
            type="button"
            onClick={() => {
              setAutoSpin(false);
              flyToCoordsTriggerRef.current?.(tgt.lat, tgt.lng, tgt.dist);
            }}
            className="min-h-[34px] sm:min-h-[30px] rounded-md border border-white/12 bg-[#0C1322] px-2.5 py-0.5 text-[11px] font-medium text-[#E6EDF7] hover:border-[#38BDF8] hover:bg-[#182947] whitespace-nowrap shrink-0 transition-colors"
          >
            {lang === 'hi' ? tgt.labelHi : tgt.labelEn}
          </button>
        ))}
      </div>

      <div className="relative h-[360px] sm:h-[460px] w-full overflow-hidden rounded-2xl border border-white/15 bg-[#02040d]">
        <div
          ref={mountRef}
          className="h-full w-full"
          role="region"
          aria-label="Interactive 3D Earth Globe"
        />

        {/* Crisp Top-Left Spatial Telemetry Readout (Zero Backdrop-Blur) */}
        <div className="pointer-events-none absolute left-3 top-3 sm:left-4 sm:top-4 rounded-xl border border-[#38BDF8]/35 bg-[#0C1322]/95 px-3 py-2 text-xs text-[#E6EDF7]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#38BDF8]">{selectedLocation.name}</span>
            {snapshot ? (
              <span className="font-mono-tabular text-[11px] font-bold text-[#5DCAA5]">
                AQI {snapshot.current.usAqi}
              </span>
            ) : null}
          </div>
          <p className="font-mono-tabular text-[11px] text-[#9FB0C7]">
            {Math.abs(selectedLocation.latitude).toFixed(2)}°{ns},{' '}
            {Math.abs(selectedLocation.longitude).toFixed(2)}°{ew}
          </p>
          {hoverCityName ? (
            <p className="mt-1 text-[11px] font-medium text-amber-300">{hoverCityName}</p>
          ) : null}
        </div>

        {/* Collapsible Bottom Control Dock */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center max-w-[96%]">
          <button
            type="button"
            onClick={() => setHudCollapsed((prev) => !prev)}
            aria-expanded={!hudCollapsed}
            className="mb-1.5 inline-flex min-h-[34px] sm:min-h-[30px] items-center gap-1 rounded-md border border-white/15 bg-[#0C1322]/95 px-2.5 py-1 text-[11px] font-medium text-[#E6EDF7] hover:bg-[#182947] whitespace-nowrap"
          >
            {hudCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{lang === 'hi' ? 'नियंत्रण' : 'Controls'}</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{lang === 'hi' ? 'छिपाएं' : 'Hide'}</span>
              </>
            )}
          </button>

          {!hudCollapsed ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#0C1322]/95 px-2.5 py-2 text-xs text-[#E6EDF7]">
              <button
                type="button"
                onClick={() => setAutoSpin((prev) => !prev)}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border border-white/12 bg-[#070B12] px-2.5 py-1 font-medium hover:bg-[#182947] whitespace-nowrap shrink-0"
              >
                {autoSpin ? (
                  <>
                    <Pause className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                    <span>{lang === 'hi' ? 'रोकें' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                    <span>{lang === 'hi' ? 'घुमाएं' : 'Spin'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowClouds((prev) => !prev)}
                aria-pressed={showClouds}
                className={`inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium whitespace-nowrap shrink-0 ${
                  showClouds
                    ? 'border-[#38BDF8]/50 bg-[#182947] text-[#E6EDF7]'
                    : 'border-white/12 bg-[#070B12] text-[#9FB0C7] hover:bg-[#182947]'
                }`}
              >
                <Cloud className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{showClouds ? (lang === 'hi' ? 'बादल' : 'Clouds') : (lang === 'hi' ? 'साफ' : 'Clear')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGrid((prev) => !prev)}
                aria-pressed={showGrid}
                className={`inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium whitespace-nowrap shrink-0 ${
                  showGrid
                    ? 'border-[#38BDF8]/50 bg-[#182947] text-[#E6EDF7]'
                    : 'border-white/12 bg-[#070B12] text-[#9FB0C7] hover:bg-[#182947]'
                }`}
              >
                <Grid className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{lang === 'hi' ? 'ग्रिड' : '15° Grid'}</span>
              </button>

              <button
                type="button"
                onClick={() => zoomTriggerRef.current?.(0.76)}
                aria-label={lang === 'hi' ? 'ज़ूम इन' : 'Zoom in globe'}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center justify-center rounded-md border border-white/12 bg-[#070B12] px-2 py-1 font-medium hover:bg-[#15243B] whitespace-nowrap shrink-0"
              >
                <ZoomIn className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => zoomTriggerRef.current?.(1.3)}
                aria-label={lang === 'hi' ? 'ज़ूम आउट' : 'Zoom out globe'}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center justify-center rounded-md border border-white/12 bg-[#070B12] px-2 py-1 font-medium hover:bg-[#15243B] whitespace-nowrap shrink-0"
              >
                <ZoomOut className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setUtcSunMode((prev) => !prev)}
                aria-pressed={utcSunMode}
                className={`inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium whitespace-nowrap shrink-0 ${
                  utcSunMode
                    ? 'border-[#38BDF8]/50 bg-[#15243B] text-[#F1F5F9]'
                    : 'border-white/12 bg-[#070B12] text-[#9FB0C7] hover:bg-[#15243B]'
                }`}
              >
                <Sun className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>
                  {utcSunMode
                    ? lang === 'hi'
                      ? 'लाइव सूर्य'
                      : 'Live UTC Sun'
                    : lang === 'hi'
                    ? 'स्पष्ट दिन'
                    : 'Clear Orbit'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => focusLocationTriggerRef.current?.()}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border border-white/12 bg-[#070B12] px-2.5 py-1 font-medium hover:bg-[#15243B] whitespace-nowrap shrink-0"
              >
                <Compass className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{lang === 'hi' ? 'पिन' : 'Pin'}</span>
              </button>

              <button
                type="button"
                onClick={onDetectGps}
                disabled={isLocating}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md bg-[#38BDF8] px-2.5 py-1 font-semibold text-[#070B12] hover:bg-[#7DD3FC] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <LocateFixed className="h-3.5 w-3.5 text-[#070B12]" aria-hidden="true" />
                <span>{isLocating ? '...' : 'GPS'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAutoSpin(true);
                  flyToCoordsTriggerRef.current?.(20.0, 45.0, 3.25);
                }}
                className="inline-flex min-h-[36px] sm:min-h-[32px] items-center gap-1.5 rounded-md border border-white/12 bg-[#070B12] px-2.5 py-1 font-medium hover:bg-[#15243B] whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>{lang === 'hi' ? 'विश्व' : 'World'}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
