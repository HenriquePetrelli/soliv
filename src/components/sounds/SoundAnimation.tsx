import { useEffect, useRef } from "react";
import type { AudioLevels } from "@/hooks/useAudioAnalyser";

export type AnimationType =
  | "waves"
  | "rain"
  | "fire"
  | "breathing"
  | "ambient";

interface SoundAnimationProps {
  type: AnimationType;
  isPlaying: boolean;
  levelsRef: React.MutableRefObject<AudioLevels>;
  circular?: boolean;
  /** Optional ref pointing to the <audio> element to sync visual time with playback position. */
  audioRef?: React.MutableRefObject<HTMLAudioElement | null>;
}

// Paleta identidade — laranja é exclusivo do SOS (Fase 3), aqui usamos âmbar
const COLORS = {
  orange: { r: 217, g: 119, b: 6 },
  orangeSoft: { r: 252, g: 211, b: 77 },
  purple: { r: 124, g: 58, b: 237 },
  purpleSoft: { r: 167, g: 139, b: 250 },
  white: { r: 255, g: 250, b: 240 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface AnimState {
  particles: Array<Record<string, number>>;
  intensity: number;
  time: number;
  smoothLevels: AudioLevels;
}

const SoundAnimation = ({ type, isPlaying, levelsRef, circular = false, audioRef }: SoundAnimationProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<AnimState>({
    particles: [],
    intensity: 0,
    time: 0,
    smoothLevels: { volume: 0, bass: 0, mid: 0, treble: 0 },
  });

  // Setup canvas + DPR + resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    stateRef.current.particles = [];
  }, [type]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    const MIN_FRAME = 1000 / 60;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      const delta = now - last;
      if (delta < MIN_FRAME) return;
      last = now;
      const dt = Math.min(delta / 16.67, 2);

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return;

      // Fade play/pause
      const target = isPlaying ? 1 : 0;
      stateRef.current.intensity = lerp(stateRef.current.intensity, target, 0.06 * dt);
      // Sincroniza o "relógio" da animação com a posição do áudio quando
      // disponível — assim o seek move a visualização junto com a música.
      const audioEl = audioRef?.current;
      if (audioEl && Number.isFinite(audioEl.currentTime)) {
        stateRef.current.time = audioEl.currentTime;
      } else {
        stateRef.current.time += dt * 0.016;
      }

      // Suaviza levels para movimento orgânico
      const raw = levelsRef.current;
      const s = stateRef.current.smoothLevels;
      const a = 0.15;
      s.volume = lerp(s.volume, raw.volume, a);
      s.bass = lerp(s.bass, raw.bass, a);
      s.mid = lerp(s.mid, raw.mid, a);
      s.treble = lerp(s.treble, raw.treble, a);

      const intensity = stateRef.current.intensity;

      // Trail fade
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = circular ? "rgba(18, 10, 38, 0.18)" : "rgba(15, 8, 30, 0.20)";
      ctx.fillRect(0, 0, w, h);

      switch (type) {
        case "rain":
          drawRain(ctx, w, h, s, intensity, stateRef.current, dt);
          break;
        case "waves":
          drawWaves(ctx, w, h, s, intensity, stateRef.current.time);
          break;
        case "fire":
          drawFire(ctx, w, h, s, intensity, stateRef.current, dt);
          break;
        case "breathing":
          drawBreathing(ctx, w, h, s, intensity, stateRef.current.time);
          break;
        case "ambient":
        default:
          drawAmbient(ctx, w, h, s, intensity, stateRef.current, dt);
          break;
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [type, isPlaying, levelsRef, circular]);

  if (circular) {
    return (
      <div className="relative w-full h-full rounded-full overflow-hidden shadow-[0_25px_70px_-20px_hsl(var(--primary)/0.45)] ring-1 ring-white/10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, rgba(124,58,237,0.55), transparent 60%), radial-gradient(circle at 70% 80%, rgba(217,119,6,0.30), transparent 55%), linear-gradient(135deg, #1a0d3a 0%, #0f0820 100%)",
          }}
        />
        <canvas ref={canvasRef} className="relative w-full h-full block" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.14), transparent 45%)",
            boxShadow: "inset 0 0 40px rgba(0,0,0,0.35), inset 0 2px 20px rgba(255,255,255,0.06)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-[28px] overflow-hidden border border-white/10 shadow-[0_20px_60px_-20px_rgba(124,58,237,0.6)]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(124,58,237,0.55), transparent 60%), radial-gradient(circle at 70% 80%, rgba(217,119,6,0.35), transparent 55%), linear-gradient(135deg, #1a0d3a 0%, #0f0820 100%)",
        }}
      />
      <canvas ref={canvasRef} className="relative w-full h-full block" aria-hidden />
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px] bg-white/[0.02]" />
    </div>
  );
};

export default SoundAnimation;

/* ============================================================
 *  Renderers
 * ============================================================ */

function drawWaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: AudioLevels,
  intensity: number,
  time: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const bass = levels.bass;
  const mid = levels.mid;
  const treble = levels.treble;

  // Glow de fundo pulsante
  const glowR = Math.min(w, h) * (0.35 + 0.15 * intensity + bass * 0.2);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  glow.addColorStop(0, `rgba(124, 58, 237, ${0.35 * intensity})`);
  glow.addColorStop(0.6, `rgba(217, 119, 6, ${0.12 * intensity})`);
  glow.addColorStop(1, "rgba(124, 58, 237, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const layers = 5;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < layers; i++) {
    const phase = time * (0.5 + i * 0.22);
    const amp = (14 + i * 8) * (0.4 + intensity) * (0.7 + bass * 1.2);
    const yBase = h * (0.5 + (i - layers / 2) * 0.06);
    const t = i / (layers - 1);
    const r = Math.round(lerp(COLORS.purpleSoft.r, COLORS.orange.r, t));
    const g = Math.round(lerp(COLORS.purpleSoft.g, COLORS.orange.g, t));
    const b = Math.round(lerp(COLORS.purpleSoft.b, COLORS.orange.b, t));
    const alpha = (0.12 + 0.10 * intensity) * (1 - i * 0.08);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const y =
        yBase +
        Math.sin(x * 0.010 + phase) * amp +
        Math.sin(x * 0.028 + phase * 1.4) * (amp * 0.45) +
        Math.sin(x * 0.06 + phase * 0.7) * (amp * 0.18) * (0.4 + mid);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, yBase - amp, 0, h);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // Reflexos brancos nas cristas (treble)
  ctx.strokeStyle = `rgba(255,240,220,${0.15 + treble * 0.4 * intensity})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const phase = time * 0.9;
  const yBase = h * 0.44;
  const amp = 20 * (0.5 + intensity);
  for (let x = 0; x <= w; x += 3) {
    const y = yBase + Math.sin(x * 0.010 + phase) * amp + Math.sin(x * 0.03 + phase * 1.3) * amp * 0.4;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawRain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: AudioLevels,
  intensity: number,
  state: AnimState,
  dt: number
) {
  const targetCount = Math.floor(90 + levels.volume * 260 * intensity);
  const particles = state.particles;

  while (particles.length < targetCount) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 6 + Math.random() * 16,
      speed: 3.5 + Math.random() * 6,
      alpha: 0.35 + Math.random() * 0.5,
      thickness: Math.random() < 0.15 ? 1.6 : 1,
    });
  }
  if (particles.length > targetCount) particles.length = targetCount;

  const speedMul = 0.6 + intensity * (1 + levels.volume * 2.2);
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "lighter";

  for (const p of particles) {
    p.y += p.speed * speedMul * dt;
    p.x += 0.5 * dt;
    if (p.y > h + 10) {
      p.y = -10;
      p.x = Math.random() * w;
    }
    if (p.x > w + 10) p.x = -10;

    const grad = ctx.createLinearGradient(p.x, p.y, p.x + 1, p.y + p.len);
    grad.addColorStop(0, "rgba(200, 210, 255, 0)");
    grad.addColorStop(1, `rgba(210, 220, 255, ${p.alpha * intensity})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = p.thickness;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 1.5, p.y + p.len);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  // Aurora violeta pulsando com bass
  const cx = w / 2;
  const cy = h * 0.55;
  const r = Math.min(w, h) * (0.25 + levels.bass * 0.35 * intensity);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, `rgba(124, 58, 237, ${0.32 * intensity})`);
  glow.addColorStop(0.5, `rgba(167, 139, 250, ${0.12 * intensity})`);
  glow.addColorStop(1, "rgba(124, 58, 237, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawFire(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: AudioLevels,
  intensity: number,
  state: AnimState,
  dt: number
) {
  const targetCount = Math.floor(80 + 180 * intensity);
  const particles = state.particles;
  const cx = w / 2;
  const cy = h * 0.68;

  while (particles.length < targetCount) {
    particles.push({
      x: cx + (Math.random() - 0.5) * w * 0.28,
      y: cy + Math.random() * 24,
      vy: -(0.7 + Math.random() * 1.6),
      vx: (Math.random() - 0.5) * 0.5,
      r: 5 + Math.random() * 16,
      life: 0,
      maxLife: 70 + Math.random() * 70,
    });
  }
  if (particles.length > targetCount) particles.length = targetCount;

  // Base glow (bloom)
  const base = ctx.createRadialGradient(cx, cy + 20, 0, cx, cy + 20, w * 0.4);
  base.addColorStop(0, `rgba(217, 119, 6, ${0.35 * intensity + 0.05})`);
  base.addColorStop(0.5, `rgba(217, 119, 6, ${0.10 * intensity})`);
  base.addColorStop(1, "rgba(217, 119, 6, 0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt * (1 + levels.bass * 1.6);
    p.r *= 0.99;
    // wobble horizontal
    p.vx += (Math.random() - 0.5) * 0.06 * dt;

    const t = p.life / p.maxLife;
    if (t >= 1 || p.r < 0.8) {
      p.x = cx + (Math.random() - 0.5) * w * 0.28;
      p.y = cy + Math.random() * 18;
      p.vy = -(0.7 + Math.random() * 1.6) * (1 + levels.volume);
      p.vx = (Math.random() - 0.5) * 0.5;
      p.r = 5 + Math.random() * 16;
      p.life = 0;
      continue;
    }

    // Amarelo → laranja → roxo conforme sobe
    let r: number, g: number, b: number;
    if (t < 0.4) {
      const k = t / 0.4;
      r = Math.round(lerp(255, COLORS.orange.r, k));
      g = Math.round(lerp(220, COLORS.orange.g, k));
      b = Math.round(lerp(120, COLORS.orange.b, k));
    } else {
      const k = (t - 0.4) / 0.6;
      r = Math.round(lerp(COLORS.orange.r, COLORS.purple.r, k));
      g = Math.round(lerp(COLORS.orange.g, COLORS.purple.g, k));
      b = Math.round(lerp(COLORS.orange.b, COLORS.purple.b, k));
    }
    const alpha = clamp01(1 - t) * 0.65 * intensity;

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawBreathing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: AudioLevels,
  intensity: number,
  time: number
) {
  const cx = w / 2;
  const cy = h / 2;
  // Ciclo ~7s (mais calmo)
  const cycle = (Math.sin(time * 0.45) + 1) / 2;
  const baseR = Math.min(w, h) * 0.16;
  const maxAdd = Math.min(w, h) * 0.26;
  const r =
    baseR +
    maxAdd * (0.3 + 0.7 * cycle) * (0.5 + intensity * 0.6) +
    levels.volume * 24 * intensity;

  // Anéis concêntricos com fase
  ctx.globalCompositeOperation = "lighter";
  for (let i = 6; i >= 1; i--) {
    const phase = clamp01(cycle - i * 0.06);
    const rr = r * (1 + i * 0.16) * (0.85 + phase * 0.15);
    const alpha = (0.08 + 0.05 * intensity) * (1 - i / 7) * (0.6 + phase * 0.4);
    const grad = ctx.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr);
    grad.addColorStop(0, `rgba(167, 139, 250, ${alpha})`);
    grad.addColorStop(1, "rgba(124, 58, 237, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // Núcleo laranja → roxo
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  core.addColorStop(0, `rgba(252, 211, 77, ${0.6 * intensity + 0.1})`);
  core.addColorStop(0.5, `rgba(217, 119, 6, ${0.45 * intensity + 0.08})`);
  core.addColorStop(1, "rgba(124, 58, 237, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Anel fino brilhante
  ctx.strokeStyle = `rgba(255, 240, 220, ${0.22 * intensity + 0.06})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

}

function drawAmbient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: AudioLevels,
  intensity: number,
  state: AnimState,
  dt: number
) {
  // Nebulosas de fundo (blobs suaves)
  ctx.globalCompositeOperation = "lighter";
  const nebulaCount = 3;
  for (let i = 0; i < nebulaCount; i++) {
    const t = state.time * (0.15 + i * 0.05);
    const nx = w * (0.5 + Math.cos(t + i) * 0.28);
    const ny = h * (0.5 + Math.sin(t * 1.3 + i * 2) * 0.25);
    const nr = Math.min(w, h) * (0.32 + 0.1 * Math.sin(t * 0.7));
    const isOrange = i % 2 === 0;
    const c = isOrange ? COLORS.orange : COLORS.purple;
    const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${0.18 * intensity + 0.04})`);
    grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Poeira estelar
  const targetCount = 100;
  const particles = state.particles;
  while (particles.length < targetCount) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 2.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.08 + Math.random() * 0.32),
      hue: Math.random(),
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.05,
    });
  }
  if (particles.length > targetCount) particles.length = targetCount;

  for (const p of particles) {
    p.x += p.vx * dt * (1 + levels.mid);
    p.y += p.vy * dt * (1 + levels.bass * 0.5);
    p.twinkle += p.twinkleSpeed * dt;

    if (p.y < -5) {
      p.y = h + 5;
      p.x = Math.random() * w;
    }
    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;

    const c = p.hue < 0.5 ? COLORS.purpleSoft : COLORS.orangeSoft;
    const wh = COLORS.white;
    const mix = 0.5 + 0.5 * Math.sin(p.twinkle);
    const r = Math.round(lerp(c.r, wh.r, mix * 0.5));
    const g = Math.round(lerp(c.g, wh.g, mix * 0.5));
    const b = Math.round(lerp(c.b, wh.b, mix * 0.5));
    const a = (0.35 + 0.45 * mix) * (0.35 + intensity * 0.65);

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
