import { useEffect, useRef } from 'react';

interface AtmosphericDriftLayerProps {
  usAqi?: number;
}

type ParticleKind = 'cloud' | 'fog' | 'smog';

interface AtmosphericParticle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  alpha: number;
  phase: number;
  swayAmpX: number;
  swayAmpY: number;
  swayFreq: number;
  rotation: number;
  vr: number;
  spriteIdx: number;
}

function createCloudSprite(tintRgb: string, variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const puffs =
    variant === 0
      ? [
          { x: 52, y: 54, rx: 32, ry: 20 },
          { x: 80, y: 42, rx: 36, ry: 25 },
          { x: 108, y: 53, rx: 30, ry: 19 },
          { x: 80, y: 58, rx: 52, ry: 16 },
        ]
      : [
          { x: 46, y: 52, rx: 28, ry: 18 },
          { x: 74, y: 40, rx: 34, ry: 23 },
          { x: 100, y: 46, rx: 32, ry: 21 },
          { x: 120, y: 56, rx: 24, ry: 15 },
          { x: 82, y: 58, rx: 54, ry: 15 },
        ];

  for (const puff of puffs) {
    ctx.save();
    ctx.translate(puff.x, puff.y);
    ctx.scale(1, puff.ry / puff.rx);
    const g = ctx.createRadialGradient(0, 0, puff.rx * 0.08, 0, 0, puff.rx);
    g.addColorStop(0, `rgba(${tintRgb}, 0.85)`);
    g.addColorStop(0.5, `rgba(${tintRgb}, 0.42)`);
    g.addColorStop(1, `rgba(${tintRgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, puff.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return c;
}

function createFogWispSprite(tintRgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 80;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.save();
  ctx.translate(110, 40);
  ctx.scale(1, 0.34);
  const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 102);
  g.addColorStop(0, `rgba(${tintRgb}, 0.65)`);
  g.addColorStop(0.55, `rgba(${tintRgb}, 0.25)`);
  g.addColorStop(1, `rgba(${tintRgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 102, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return c;
}

function createSmogMoteSprite(tintRgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 28;
  c.height = 28;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const g = ctx.createRadialGradient(14, 14, 1, 14, 14, 13);
  g.addColorStop(0, `rgba(${tintRgb}, 0.95)`);
  g.addColorStop(0.45, `rgba(${tintRgb}, 0.5)`);
  g.addColorStop(1, `rgba(${tintRgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(14, 14, 13, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

/**
 * Full-viewport snowfall-style atmospheric particle overlay where
 * small soft clouds, drifting fog wisps, and suspended smog motes
 * glide right, left, up, and down across the entire webpage.
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

    // Pre-build crisp atmospheric palettes (cool sky cloud/fog + warm smog motes)
    const coolCloudSprites = [
      createCloudSprite('226, 240, 255', 0),
      createCloudSprite('198, 228, 252', 1),
    ];
    const warmSmogCloudSprites = [
      createCloudSprite('240, 206, 172', 0),
      createCloudSprite('212, 198, 222', 1),
    ];
    const coolFogSprite = createFogWispSprite('214, 236, 255');
    const warmFogSprite = createFogWispSprite('232, 194, 152');
    const coolSmogMote = createSmogMoteSprite('225, 243, 255');
    const warmSmogMote = createSmogMoteSprite('247, 190, 124');

    const totalCount = Math.min(82, Math.max(48, Math.round((width * height) / 24000)));
    const particles: AtmosphericParticle[] = [];

    for (let i = 0; i < totalCount; i++) {
      const roll = i / totalCount;
      // ~30% floating miniature clouds, ~25% fog wisps, ~45% fine smog/mist motes
      const kind: ParticleKind =
        roll < 0.3 ? 'cloud' : roll < 0.55 ? 'fog' : 'smog';

      const dirX = Math.random() < 0.55 ? 1 : -1;
      const dirY = Math.random() < 0.62 ? 1 : -1;

      if (kind === 'cloud') {
        const w = 36 + Math.random() * 54;
        particles.push({
          kind,
          x: Math.random() * width,
          y: Math.random() * height,
          vx: dirX * (0.22 + Math.random() * 0.42),
          vy: dirY * (0.12 + Math.random() * 0.25),
          width: w,
          height: w * 0.6,
          alpha: 0.24 + Math.random() * 0.24,
          phase: Math.random() * Math.PI * 2,
          swayAmpX: 0.16 + Math.random() * 0.22,
          swayAmpY: 0.14 + Math.random() * 0.2,
          swayFreq: 0.0005 + Math.random() * 0.0007,
          rotation: (Math.random() - 0.5) * 0.12,
          vr: (Math.random() - 0.5) * 0.0004,
          spriteIdx: i % 2,
        });
      } else if (kind === 'fog') {
        const w = 78 + Math.random() * 110;
        particles.push({
          kind,
          x: Math.random() * width,
          y: Math.random() * height,
          vx: dirX * (0.3 + Math.random() * 0.55),
          vy: dirY * (0.08 + Math.random() * 0.22),
          width: w,
          height: w * 0.36,
          alpha: 0.14 + Math.random() * 0.16,
          phase: Math.random() * Math.PI * 2,
          swayAmpX: 0.2 + Math.random() * 0.28,
          swayAmpY: 0.12 + Math.random() * 0.18,
          swayFreq: 0.00045 + Math.random() * 0.0006,
          rotation: (Math.random() - 0.5) * 0.16,
          vr: (Math.random() - 0.5) * 0.0003,
          spriteIdx: 0,
        });
      } else {
        const size = 5 + Math.random() * 9;
        particles.push({
          kind,
          x: Math.random() * width,
          y: Math.random() * height,
          vx: dirX * (0.28 + Math.random() * 0.55),
          vy: dirY * (0.28 + Math.random() * 0.58),
          width: size,
          height: size,
          alpha: 0.3 + Math.random() * 0.38,
          phase: Math.random() * Math.PI * 2,
          swayAmpX: 0.28 + Math.random() * 0.38,
          swayAmpY: 0.18 + Math.random() * 0.28,
          swayFreq: 0.001 + Math.random() * 0.0015,
          rotation: 0,
          vr: 0,
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
      const smogRatio = Math.min(1, Math.max(0, (currentAqi - 60) / 170));
      const useWarmSmog = currentAqi > 130;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          const waveX = Math.sin(now * p.swayFreq + p.phase) * p.swayAmpX;
          const waveY = Math.cos(now * p.swayFreq * 0.85 + p.phase) * p.swayAmpY;

          p.x += (p.vx + waveX) * dt;
          p.y += (p.vy + waveY) * dt;
          p.rotation += p.vr * dt;

          const padX = p.width * 0.8 + 40;
          const padY = p.height * 0.8 + 40;
          if (p.x < -padX) p.x = width + padX;
          else if (p.x > width + padX) p.x = -padX;
          if (p.y < -padY) p.y = height + padY;
          else if (p.y > height + padY) p.y = -padY;
        }

        let sprite: HTMLCanvasElement;
        if (p.kind === 'cloud') {
          sprite = useWarmSmog && i % 2 === 0
            ? warmSmogCloudSprites[p.spriteIdx]
            : coolCloudSprites[p.spriteIdx];
        } else if (p.kind === 'fog') {
          sprite = useWarmSmog && i % 2 === 1 ? warmFogSprite : coolFogSprite;
        } else {
          sprite = smogRatio > 0.35 && i % 2 === 0 ? warmSmogMote : coolSmogMote;
        }

        ctx.save();
        ctx.globalAlpha = Math.min(0.75, p.alpha * (1 + smogRatio * 0.32));
        ctx.translate(p.x, p.y);
        if (p.rotation !== 0) {
          ctx.rotate(p.rotation);
        }
        ctx.drawImage(sprite, -p.width / 2, -p.height / 2, p.width, p.height);
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
