// Lightweight canvas particle system: smoke, fire flicker, musical notes, rain.

type Kind = "smoke" | "fire" | "note" | "rain";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  char: string;
  size: number;
  phase: number;
}

interface Opts {
  stage: number;       // 0-8
  rainActive: boolean; // 5% rolled
  reducedMotion: boolean;
}

const SMOKE_CHARS = ["~", ".", "'", "`", ","];
const NOTE_CHARS = ["♪", "♫", "~", "*", "o"];

export function createParticleSystem(canvas: HTMLCanvasElement, getOpts: () => Opts) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop: () => {} };

  const particles: Particle[] = [];
  let raf = 0;
  let running = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function spawn(kind: Kind) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (kind === "smoke") {
      particles.push({
        kind, x: w * 0.42 + (Math.random() - 0.5) * 30,
        y: h * 0.78, vx: (Math.random() - 0.5) * 0.25, vy: -(0.3 + Math.random() * 0.5),
        life: 0, maxLife: 90 + Math.random() * 90,
        char: SMOKE_CHARS[Math.floor(Math.random() * SMOKE_CHARS.length)],
        size: 14 + Math.random() * 6, phase: Math.random() * Math.PI * 2,
      });
    } else if (kind === "fire") {
      particles.push({
        kind, x: w * 0.12 + (Math.random() - 0.5) * 18,
        y: h * 0.58 + Math.random() * 20, vx: (Math.random() - 0.5) * 0.3, vy: -(0.4 + Math.random() * 0.5),
        life: 0, maxLife: 40 + Math.random() * 40, char: "•",
        size: 2 + Math.random() * 3, phase: Math.random() * Math.PI * 2,
      });
    } else if (kind === "note") {
      particles.push({
        kind, x: w * 0.66 + (Math.random() - 0.5) * 30,
        y: h * 0.52, vx: 0, vy: -(0.2 + Math.random() * 0.3),
        life: 0, maxLife: 120 + Math.random() * 60,
        char: NOTE_CHARS[Math.floor(Math.random() * NOTE_CHARS.length)],
        size: 14 + Math.random() * 6, phase: Math.random() * Math.PI * 2,
      });
    } else {
      const w2 = canvas.clientWidth;
      particles.push({
        kind, x: Math.random() * w2,
        y: -10, vx: -1.5, vy: 2.5 + Math.random() * 1.5,
        life: 0, maxLife: 200, char: "", size: 10 + Math.random() * 6, phase: 0,
      });
    }
  }

  function targets() {
    const o = getOpts();
    if (o.reducedMotion) return { smoke: 0, fire: 0, note: 0, rain: 0 };
    return {
      smoke: o.stage >= 3 ? 8 : 0,
      fire: o.stage >= 5 ? 5 : 0,
      note: o.stage >= 4 ? 4 : 0,
      rain: o.rainActive ? 20 : 0,
    };
  }

  function tick() {
    if (!running) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx!.clearRect(0, 0, w, h);

    const t = targets();
    const counts: Record<Kind, number> = { smoke: 0, fire: 0, note: 0, rain: 0 };
    for (const p of particles) counts[p.kind]++;
    (Object.keys(t) as Kind[]).forEach((k) => {
      if (counts[k] < t[k] && Math.random() < 0.4) spawn(k);
    });

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.phase += 0.05;
      p.x += p.vx + (p.kind === "note" ? Math.sin(p.phase) * 0.4 : p.kind === "smoke" ? Math.sin(p.phase) * 0.2 : 0);
      p.y += p.vy;
      const lifeRatio = p.life / p.maxLife;
      const fade = lifeRatio < 0.8 ? 1 : 1 - (lifeRatio - 0.8) / 0.2;

      if (p.kind === "smoke") {
        ctx!.fillStyle = `rgba(138,138,138,${0.35 * fade})`;
        ctx!.font = `${p.size}px JetBrains Mono, monospace`;
        ctx!.fillText(p.char, p.x, p.y);
      } else if (p.kind === "fire") {
        const flick = 0.5 + 0.5 * Math.sin(p.phase * 3);
        ctx!.fillStyle = `rgba(232,166,76,${0.6 * fade * flick})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
      } else if (p.kind === "note") {
        ctx!.fillStyle = `rgba(196,149,106,${0.55 * fade})`;
        ctx!.font = `${p.size}px JetBrains Mono, monospace`;
        ctx!.fillText(p.char, p.x, p.y);
      } else {
        ctx!.strokeStyle = `rgba(95,143,168,${0.32 * fade})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(p.x, p.y);
        ctx!.lineTo(p.x - p.size * 0.5, p.y + p.size);
        ctx!.stroke();
      }

      if (p.life >= p.maxLife || p.y < -20 || p.y > h + 20 || p.x < -20 || p.x > w + 20) {
        particles.splice(i, 1);
      }
    }
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
  };
}
