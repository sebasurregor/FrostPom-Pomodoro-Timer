/*
 * FrostPom — la nieve, dibujada en un solo <canvas> (v4.2.1, para que el celular no se ponga lento).
 *
 * Antes cada copo era un elemento con su propia animación de CSS: hasta 150 en el paisaje y 40
 * (con dos animaciones cada uno) en la pantalla de entrada. En un computador no se notaba, pero en
 * un celular el navegador tenía que recalcular cada copo en cada cuadro y se ponía lento todo,
 * hasta el teclado. Ahora un solo dibujo se repinta unas 30 veces por segundo, con todos los copos
 * de una vez (y se detiene cuando no se ve).
 *
 * Se ve igual: tres profundidades (lejos: pequeños y lentos; cerca: grandes, desenfocados y
 * rápidos), cada copo se balancea de lado y el viento los inclina según el clima.
 */

// radio (px), opacidad, velocidad de caída (px/s), balanceo (px), borde difuminado
const LAYERS = {
  // la nevada suave de la entrada: los de adelante, grandes y desenfocados (como fuera de foco)
  gate: [
    { r: [1.1, 1.8], op: [0.5, 0.75], v: [38, 54], sway: [5, 11], soft: false },   // lejos
    { r: [2.0, 2.9], op: [0.72, 0.9], v: [58, 82], sway: [8, 16], soft: false },   // en medio
    { r: [4.2, 6.2], op: [0.38, 0.55], v: [88, 116], sway: [14, 24], soft: true }, // cerca
  ],
  // el paisaje de adentro: copos nítidos, como antes
  scene: [
    { r: [1.0, 1.5], op: [0.55, 0.65], v: [42, 60], sway: [3, 8], soft: false },
    { r: [1.6, 2.3], op: [0.8, 0.9], v: [60, 85], sway: [5, 12], soft: false },
    { r: [2.3, 3.0], op: [0.9, 0.97], v: [85, 115], sway: [8, 16], soft: false },
  ],
};

// Copos por cada 100.000 px² de pantalla en cada profundidad, viento (px/s) y rapidez.
// En un celular (≈ 380.000 px²) la nieve ligera da unos 30 copos, la media 80 y la fuerte 150.
// size = qué tan grandes (como antes: la nieve media ×1,3 y la fuerte ×1,8).
export const WEATHER = Object.freeze({
  clear: { n: [0, 0, 0], wind: 0, speed: 1, size: 1 },
  light: { n: [4, 2.5, 1.5], wind: 6, speed: 1, size: 1 },
  medium: { n: [9, 7, 5], wind: 14, speed: 1.1, size: 1.3 },
  heavy: { n: [15, 13, 11], wind: 46, speed: 1.6, size: 1.8 },
  gate: { n: [5.3, 3.7, 1.6], wind: 4, speed: 0.72, size: 1 }, // la nevada suave de la entrada
});
const MAX_FLAKES = 260; // en pantallas muy grandes no se dibujan más
const FPS = 30;

/** Copo pre-dibujado (borde nítido o difuminado), para no calcular el degradado en cada cuadro. */
function dot(color, soft) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(soft ? 0.22 : 0.55, color);
  grad.addColorStop(soft ? 0.5 : 0.78, soft ? 'rgba(255,255,255,0.45)' : color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Aleatorio con semilla (la nieve queda bien repartida y no cambia al recargar). */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crea la nieve dentro de `host` (ocupa todo su tamaño).
 *   weather: 'clear' | 'light' | 'medium' | 'heavy' | 'gate'
 *   active(): ¿se debe animar ahora? (por ejemplo, solo si se ve la pantalla de entrada)
 * Devuelve { setWeather, setDirty, refresh, flakes, canvas }.
 */
export function createSnow(host, { weather = 'light', className = 'snow', active = () => true, seed = 2026 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const sprites = { white: [dot('#ffffff', false), dot('#ffffff', true)], ash: [dot('#7D7666', false), dot('#8B8472', true)] };
  let tint = 'white';
  let W = 0;
  let H = 0;
  let scale = 1;
  let list = [];
  let current = WEATHER[weather] ? weather : 'light';
  let raf = 0;
  let last = 0;
  let acc = 0;

  const reduce = () => document.documentElement.classList.contains('reduce-motion');

  function build() {
    const rnd = seeded(seed);
    const pick = ([a, b]) => a + (b - a) * rnd();
    const w = WEATHER[current];
    const area = (W * H) / 100000;
    list = [];
    LAYERS[current === 'gate' ? 'gate' : 'scene'].forEach((L, layer) => {
      const n = Math.round(w.n[layer] * area);
      for (let i = 0; i < n; i++) {
        list.push({
          layer, soft: L.soft,
          x: ((i + rnd() * 0.9) / Math.max(1, n)) * (W + 60) - 30, // repartidos a lo ancho, sin amontonarse
          y: rnd() * (H + 40) - 20,
          r: pick(L.r) * w.size, op: pick(L.op), v: pick(L.v),
          sway: pick(L.sway), phase: rnd() * Math.PI * 2, swayT: pick([3.2, 6]),
        });
      }
    });
    if (list.length > MAX_FLAKES) list = list.filter((_, i) => i % Math.ceil(list.length / MAX_FLAKES) === 0);
    canvas.dataset.flakes = String(list.length);
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const nw = Math.round(rect.width);
    const nh = Math.round(rect.height);
    if (!nw || !nh) return false;
    scale = Math.min(window.devicePixelRatio || 1, 1.25); // copos difuminados: no hace falta más resolución
    if (nw !== W || nh !== H) {
      W = nw;
      H = nh;
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      build();
    }
    return true;
  }

  function draw(dt, t) {
    const w = WEATHER[current];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sp = sprites[tint];
    for (const f of list) {
      f.y += f.v * w.speed * dt;
      f.x += w.wind * (0.5 + f.layer * 0.35) * dt;
      if (f.y > H + 12) { f.y = -12; }
      if (f.x > W + 30) f.x -= W + 60;
      else if (f.x < -30) f.x += W + 60;
      const sx = Math.sin(t / f.swayT + f.phase) * f.sway;
      const d = f.r * 2;
      ctx.globalAlpha = f.op;
      ctx.drawImage(sp[f.soft ? 1 : 0], f.x + sx - f.r, f.y - f.r, d, d);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!running()) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    acc += dt;
    if (acc >= 1 / FPS - 0.004) { // ~30 cuadros por segundo: suficiente para la nieve y la mitad de trabajo
      draw(acc, now / 1000);
      acc = 0;
    }
    raf = requestAnimationFrame(frame);
  }

  const running = () => !document.hidden && !reduce() && current !== 'clear' && W > 0 && active();

  /** Revisa si hay que empezar a animar (al cambiar de pantalla, de clima o de ajuste). */
  function refresh() {
    if (!W || !H) resize();
    if (raf || !running()) return;
    last = 0;
    acc = 1;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); refresh(); });
  document.addEventListener('visibilitychange', refresh);
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  return {
    canvas,
    get flakes() { return list.length; },
    setWeather(next) {
      if (!WEATHER[next] || next === current) return;
      current = next;
      if (W) build();
      refresh();
    },
    setDirty(dirty) { tint = dirty ? 'ash' : 'white'; },
    refresh,
  };
}
