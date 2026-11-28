import { useEffect, useRef } from 'react';

interface AtmosphericDriftLayerProps {
  usAqi?: number;
}

type ParticleKind = 'cloud' | 'fog';

interface AtmosphericParticle {
  kind: ParticleKind;
  xRatio: number;
  yRatio: number;
  vx: number;
  width: number;
  height: number;
  alpha: number;
  parallax: number;
  spriteIdx: number;
}

function createCloudSprite(tintRgb: string, variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const puffs =
    variant === 0
      ? [
          { x: 82, y: 92, rx: 56, ry: 34 },
          { x: 136, y: 68, rx: 66, ry: 42 },
          { x: 196, y: 82, rx: 58, ry: 36 },
          { x: 236, y: 98, rx: 40, ry: 25 },
          { x: 156, y: 102, rx: 102, ry: 28 },
        ]
      : variant === 1
      ? [
          { x: 68, y: 94, rx: 50, ry: 30 },
          { x: 116, y: 74, rx: 58, ry: 38 },
          { x: 168, y: 62, rx: 64, ry: 42 },
          { x: 222, y: 86, rx: 52, ry: 32 },
          { x: 150, y: 104, rx: 104, ry: 26 },
        ]
      : [
          { x: 78, y: 90, rx: 52, ry: 32 },
          { x: 134, y: 70, rx: 62, ry: 40 },
          { x: 188, y: 78, rx: 56, ry: 35 },
          { x: 228, y: 96, rx: 40, ry: 24 },
          { x: 152, y: 102, rx: 96, ry: 26 },
        ];

  for (const puff of puffs) {
    ctx.save();
    ctx.translate(puff.x, puff.y);
    ctx.scale(1, puff.ry / puff.rx);
    const g = ctx.createRadialGradient(0, 0, puff.rx * 0.08, 0, 0, puff.rx);
    g.addColorStop(0, `rgba(${tintRgb}, 0.92)`);
    g.addColorStop(0.5, `rgba(${tintRgb}, 0.48)`);
    g.addColorStop(1, `rgba(${tintRgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, puff.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return c;
}

function createFogSprite(tintRgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 120;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const layers = [
    { x: 200, y: 60, rx: 184, ry: 40, peak: 0.78 },
    { x: 138, y: 52, rx: 122, ry: 30, peak: 0.52 },
    { x: 262, y: 68, rx: 124, ry: 30, peak: 0.48 },
  ];

  for (const layer of layers) {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.scale(1, layer.ry / layer.rx);
    const g = ctx.createRadialGradient(0, 0, layer.rx * 0.08, 0, 0, layer.rx);
    g.addColorStop(0, `rgba(${tintRgb}, ${layer.peak})`);
    g.addColorStop(0.55, `rgba(${tintRgb}, ${layer.peak * 0.42})`);
    g.addColorStop(1, `rgba(${tintRgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, layer.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return c;
}

/**
 * Full-page atmospheric cloud & fog overlay.
 * Uses normalized 0..1 vertical distribution + ResizeObserver + smooth scroll
 * wrap so larger clouds and fog bands remain visible across the entire page
 * (top, middle, and bottom) drifting horizontally left-to-right and right-to-left.
 */
export function AtmosphericDriftLayer({ usAqi = 65 }: AtmosphericDriftLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const aqiRef = useRef<number>(usAqi);
  aqiRef.current = usAqi;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = Math.max(320, canvas.clientWidth || window.innerWidth || 1024);
    let height = Math.max(320, canvas.clientHeight || window.innerHeight || 768);
    let dpr = Math.min(window.devicePixelRatio || 1, height > 2400 ? 1 : 2);

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.round(rect.width || window.innerWidth));
      const nextHeight = Math.max(320, Math.round(rect.height || window.innerHeight));
      const nextDpr = Math.min(window.devicePixelRatio || 1, nextHeight > 2400 ? 1 : 2);

      if (
        nextWidth === width &&
        nextHeight === height &&
        nextDpr === dpr &&
        canvas.width === Math.floor(nextWidth * nextDpr) &&
        canvas.height === Math.floor(nextHeight * nextDpr)
      ) {
        return;
      }

      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncSize();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', syncSize);
    window.visualViewport?.addEventListener('resize', syncSize);

    const coolClouds = [
      createCloudSprite('224, 242, 255', 0),
      createCloudSprite('198, 228, 252', 1),
      createCloudSprite('214, 236, 255', 2),
    ];
    const warmClouds = [
      createCloudSprite('240, 206, 170', 0),
      createCloudSprite('220, 202, 222', 1),
      createCloudSprite('234, 194, 158', 2),
    ];
    const coolFog = createFogSprite('216, 236, 255');
    const warmFog = createFogSprite('236, 198, 158');

    // Normalized vertical lanes cover 100% of the height evenly regardless of resize timing
    const totalCount = 42;
    const particles: AtmosphericParticle[] = [];

    for (let i = 0; i < totalCount; i++) {
      const kind: ParticleKind = i % 2 === 0 ? 'cloud' : 'fog';
      const dirX = i % 2 === 0 ? 1 : -1;
      const laneCenter = (i + 0.5) / totalCount;
      const yRatio = Math.min(0.98, Math.max(0.02, laneCenter + (Math.random() - 0.5) * 0.03));

      if (kind === 'cloud') {
        const w = 135 + Math.random() * 145;
        particles.push({
          kind,
          xRatio: Math.random(),
          yRatio,
          vx: dirX * (0.3 + Math.random() * 0.45),
          width: w,
          height: w * 0.54,
          alpha: 0.18 + Math.random() * 0.15,
          parallax: 0.14 + Math.random() * 0.14,
          spriteIdx: i % 3,
        });
      } else {
        const w = 220 + Math.random() * 210;
        particles.push({
          kind,
          xRatio: Math.random(),
          yRatio,
          vx: dirX * (0.34 + Math.random() * 0.52),
          width: w,
          height: w * 0.31,
          alpha: 0.14 + Math.random() * 0.14,
          parallax: 0.08 + Math.random() * 0.1,
          spriteIdx: 0,
        });
      }
    }

    let rafId = 0;
    let lastTs = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(48, Math.max(8, now - lastTs)) / 16.6667;
      lastTs = now;

      ctx.clearRect(0, 0, width, height);

      const currentAqi = aqiRef.current;
      const smogRatio = Math.min(1, Math.max(0, (currentAqi - 70) / 160));
      const useWarmSmog = currentAqi > 130;
      const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const padX = p.width * 0.65 + 40;
        const spanX = width + padX * 2;

        if (!prefersReducedMotion) {
          // Pure horizontal drift only (left-to-right or right-to-left)
          p.xRatio += (p.vx * dt) / spanX;
          if (p.xRatio > 1) {
            p.xRatio -= 1;
          } else if (p.xRatio < 0) {
            p.xRatio += 1;
          }
        }

        const x = p.xRatio * spanX - padX;
        const spanY = height + p.height * 1.4;
        const rawY = p.yRatio * spanY - scrollY * p.parallax;
        const y = (((rawY % spanY) + spanY) % spanY) - p.height * 0.7;

        const sprite =
          p.kind === 'cloud'
            ? useWarmSmog && i % 3 === 0
              ? warmClouds[p.spriteIdx]
              : coolClouds[p.spriteIdx]
            : useWarmSmog && i % 2 === 1
            ? warmFog
            : coolFog;

        ctx.save();
        ctx.globalAlpha = Math.min(0.46, p.alpha * (1 + smogRatio * 0.28));
        ctx.drawImage(sprite, x - p.width / 2, y - p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncSize);
      window.visualViewport?.removeEventListener('resize', syncSize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full select-none"
    />
  );
}
