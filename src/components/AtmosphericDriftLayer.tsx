import { useEffect, useRef } from 'react';

interface AtmosphericDriftLayerProps {
  usAqi?: number;
}

type ParticleKind = 'cloud' | 'fog';

interface AtmosphericParticle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  alpha: number;
  spriteIdx: number;
}

function createCloudSprite(tintRgb: string, variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 280;
  c.height = 150;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const puffs =
    variant === 0
      ? [
          { x: 78, y: 88, rx: 52, ry: 32 },
          { x: 128, y: 66, rx: 62, ry: 40 },
          { x: 184, y: 78, rx: 54, ry: 34 },
          { x: 222, y: 94, rx: 38, ry: 24 },
          { x: 146, y: 96, rx: 94, ry: 26 },
        ]
      : variant === 1
      ? [
          { x: 64, y: 90, rx: 46, ry: 28 },
          { x: 108, y: 70, rx: 54, ry: 36 },
          { x: 158, y: 60, rx: 60, ry: 40 },
          { x: 208, y: 82, rx: 48, ry: 30 },
          { x: 140, y: 98, rx: 96, ry: 24 },
        ]
      : [
          { x: 74, y: 86, rx: 48, ry: 30 },
          { x: 126, y: 68, rx: 58, ry: 38 },
          { x: 176, y: 74, rx: 52, ry: 33 },
          { x: 214, y: 92, rx: 36, ry: 22 },
          { x: 142, y: 96, rx: 88, ry: 24 },
        ];

  for (const puff of puffs) {
    ctx.save();
    ctx.translate(puff.x, puff.y);
    ctx.scale(1, puff.ry / puff.rx);
    const g = ctx.createRadialGradient(0, 0, puff.rx * 0.1, 0, 0, puff.rx);
    g.addColorStop(0, `rgba(${tintRgb}, 0.88)`);
    g.addColorStop(0.52, `rgba(${tintRgb}, 0.44)`);
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
  c.width = 360;
  c.height = 110;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const layers = [
    { x: 180, y: 55, rx: 165, ry: 36, peak: 0.72 },
    { x: 125, y: 48, rx: 110, ry: 28, peak: 0.46 },
    { x: 235, y: 62, rx: 112, ry: 28, peak: 0.44 },
  ];

  for (const layer of layers) {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.scale(1, layer.ry / layer.rx);
    const g = ctx.createRadialGradient(0, 0, layer.rx * 0.08, 0, 0, layer.rx);
    g.addColorStop(0, `rgba(${tintRgb}, ${layer.peak})`);
    g.addColorStop(0.55, `rgba(${tintRgb}, ${layer.peak * 0.38})`);
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
 * Full-viewport atmospheric cloud & fog overlay.
 * Renders larger soft clouds and wide fog bands drifting horizontally
 * left-to-right and right-to-left only, with zero snowfall dots.
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

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const coolClouds = [
      createCloudSprite('220, 238, 255', 0),
      createCloudSprite('194, 224, 250', 1),
      createCloudSprite('210, 232, 255', 2),
    ];
    const warmClouds = [
      createCloudSprite('238, 202, 165', 0),
      createCloudSprite('216, 198, 218', 1),
      createCloudSprite('230, 190, 152', 2),
    ];
    const coolFog = createFogSprite('212, 234, 255');
    const warmFog = createFogSprite('234, 194, 152');

    // Larger, clean clouds & fog banks moving purely horizontally (left->right or right->left)
    const totalCount = Math.min(34, Math.max(20, Math.round((width * height) / 62000)));
    const particles: AtmosphericParticle[] = [];

    for (let i = 0; i < totalCount; i++) {
      const kind: ParticleKind = i % 2 === 0 ? 'cloud' : 'fog';
      const dirX = i % 2 === 0 ? 1 : -1;
      // Even vertical distribution across the page so clouds/fog cover top, middle, and bottom cleanly
      const laneY = ((i + 0.5) / totalCount) * height + (Math.random() - 0.5) * 32;

      if (kind === 'cloud') {
        const w = 120 + Math.random() * 140;
        particles.push({
          kind,
          x: Math.random() * (width + 260) - 130,
          y: Math.max(20, Math.min(height - 20, laneY)),
          vx: dirX * (0.28 + Math.random() * 0.45),
          width: w,
          height: w * 0.54,
          alpha: 0.16 + Math.random() * 0.16,
          spriteIdx: i % 3,
        });
      } else {
        const w = 190 + Math.random() * 190;
        particles.push({
          kind,
          x: Math.random() * (width + 320) - 160,
          y: Math.max(20, Math.min(height - 20, laneY)),
          vx: dirX * (0.32 + Math.random() * 0.52),
          width: w,
          height: w * 0.31,
          alpha: 0.12 + Math.random() * 0.14,
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

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          // Pure horizontal drift only (left-to-right or right-to-left)
          p.x += p.vx * dt;

          const padX = p.width * 0.65 + 40;
          if (p.vx > 0 && p.x > width + padX) {
            p.x = -padX;
          } else if (p.vx < 0 && p.x < -padX) {
            p.x = width + padX;
          }
        }

        const sprite =
          p.kind === 'cloud'
            ? useWarmSmog && i % 3 === 0
              ? warmClouds[p.spriteIdx]
              : coolClouds[p.spriteIdx]
            : useWarmSmog && i % 2 === 1
            ? warmFog
            : coolFog;

        ctx.save();
        ctx.globalAlpha = Math.min(0.45, p.alpha * (1 + smogRatio * 0.28));
        ctx.drawImage(sprite, p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 select-none"
    />
  );
}
