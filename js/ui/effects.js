/*
 * FrostPom — efectos: tonos de aviso sintetizados, sonidos de concentración (grabados y
 * sintetizados), vibración, confeti y textos flotantes.
 * Todo respeta las preferencias: sonido apagado, vibración apagada y "reducir movimiento".
 */

let prefs = { sound: true, vibrate: true, reduceMotion: false, tonePack: 'clasico' };
// El movimiento lo controla "Menos animaciones" en Ajustes (main.js avisa si el sistema lo pide).
const motionOff = () => prefs.reduceMotion;

// ---------------- Sonido ----------------
let ctx = null;
function context() {
  try {
    ctx = ctx || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function audio() {
  return prefs.sound ? context() : null;
}

// Paquetes de tonos: cambian la forma de onda, la octava, la duración y un pequeño deslizamiento.
const PACKS = {
  clasico:    { type: 'triangle', mul: 1,   dur: 1,   glide: 1,    gain: 1 },
  campanitas: { type: 'sine',     mul: 2,   dur: 2.2, glide: 1,    gain: 0.9 },
  suave:      { type: 'sine',     mul: 0.5, dur: 1.6, glide: 1,    gain: 0.7 },
  burbujas:   { type: 'sine',     mul: 1.5, dur: 0.8, glide: 1.6,  gain: 1 },
  arcade:     { type: 'square',   mul: 1,   dur: 0.7, glide: 1,    gain: 0.45 },
};
function tone(freq, at, dur, { type, gain = 0.06, raw = false } = {}) {
  const c = audio();
  if (!c) return;
  const pk = raw ? PACKS.clasico : PACKS[prefs.tonePack] || PACKS.clasico;
  const f = freq * pk.mul;
  const d = dur * pk.dur;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || pk.type;
  o.frequency.setValueAtTime(f, t0);
  if (pk.glide !== 1) o.frequency.exponentialRampToValueAtTime(f * pk.glide, t0 + d * 0.8);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * pk.gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}
const sfx = {
  unlock() { audio(); }, // los navegadores exigen un toque del usuario antes de sonar
  start() { tone(659, 0, 0.12); tone(988, 0.1, 0.18); },
  pause() { tone(523, 0, 0.12, { gain: 0.04 }); },
  complete() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22)); },
  breakDone() { tone(784, 0, 0.18); tone(659, 0.14, 0.26); },
  claim() { tone(988, 0, 0.08, { type: 'square', gain: 0.035 }); tone(1319, 0.07, 0.2, { type: 'square', gain: 0.035 }); },
  achievement() { [784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.25)); },
  rankUp() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.3));
    [1047, 1319, 1568].forEach((f) => tone(f, 0.6, 0.9, { gain: 0.035 }));
  },
  error() { tone(220, 0, 0.18, { type: 'sawtooth', gain: 0.025, raw: true }); },
};

// ---------------- Sonidos de concentración ----------------
// v4.0.2: la mayoría son GRABACIONES (assets/sounds/, de Pixabay) que suenan en bucle sin cortes.
// Viento polar y Ruido rosa se siguen generando en el dispositivo. Si una grabación todavía no se
// ha descargado y no hay internet, suena la versión generada (RECIPES) para que nunca quede mudo.
const ambient = { id: '', nodes: [], timers: [], master: null, volume: 50 };

/*
 * Cada archivo trae 1 s de más al principio y al final, copiado del mismo bucle. El bucle va de
 * loopStart a loopEnd: aunque el decodificador de MP3 corra el audio unos milisegundos, en la
 * unión siempre se encuentra el mismo sonido y no se oye el corte. Los archivos se prepararon con
 * tools/preparar_sonidos.py (todos a -20 LUFS: suenan igual de fuerte; la fogata un poco menos).
 */
export const RECORDED = {
  blanco:  { file: 'blanco.mp3',  loopStart: 1, loopEnd: 31 },
  lluvia:  { file: 'lluvia.mp3',  loopStart: 1, loopEnd: 61 },
  marron:  { file: 'marron.mp3',  loopStart: 1, loopEnd: 31 },
  olas:    { file: 'olas.mp3',    loopStart: 1, loopEnd: 92 },
  fogata:  { file: 'fogata.mp3',  loopStart: 1, loopEnd: 39.5 },
  pajaros: { file: 'pajaros.mp3', loopStart: 1, loopEnd: 91, fallback: 'lluvia' },
};
const SOUNDS_DIR = 'assets/sounds/';
// Los generados pasan por (volumen/100 × 0,35). Las grabaciones ya vienen a su volumen: se
// compensa ese 0,35 para que con el volumen al 100 % suenen tal cual (sin pasarse de 0 dBFS).
const RECORDED_GAIN = 1 / 0.35;
// Nivel de los generados para que suenen parecido a las grabaciones (medido en LUFS).
const SYNTH_LEVEL = { blanco: 0.55, marron: 1.8, lluvia: 0.8, olas: 2.55, fogata: 1.65, rosa: 1.45, viento: 2.5 };

// Solo se guarda decodificada la última grabación (una de 90 s ocupa unos 35 MB en memoria).
let decoded = { id: '', buffer: null };
let loading = null; // { id, promise }
function loadRecorded(c, id) {
  if (decoded.id === id && decoded.buffer) return Promise.resolve(decoded.buffer);
  if (loading && loading.id === id) return loading.promise;
  const promise = fetch(SOUNDS_DIR + RECORDED[id].file)
    .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.arrayBuffer(); })
    .then((data) => new Promise((resolve, reject) => {
      // Safari viejo solo acepta la versión con funciones (sin promesa)
      const p = c.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    }))
    .then((buffer) => {
      decoded = { id, buffer };
      return buffer;
    })
    .finally(() => { if (loading && loading.id === id) loading = null; });
  loading = { id, promise };
  return promise;
}
/** Descarga (y guarda sin conexión) una grabación antes de que haga falta. No suena. */
export function prefetchAmbient(id) {
  if (!RECORDED[id]) return;
  try { fetch(SOUNDS_DIR + RECORDED[id].file).catch(() => {}); } catch { /* sin red */ }
}
function playRecorded(c, out, rec, buffer) {
  const s = c.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.loopStart = rec.loopStart;
  s.loopEnd = Math.min(rec.loopEnd, buffer.duration);
  const g = c.createGain();
  g.gain.value = RECORDED_GAIN;
  s.connect(g).connect(out);
  s.start(0, rec.loopStart);
  return [s, g];
}
/** Versión generada (sin archivo), al volumen parecido al de las grabaciones. */
function playSynth(c, out, id) {
  const g = c.createGain();
  g.gain.value = SYNTH_LEVEL[id] || 1;
  g.connect(out);
  return [g, ...RECIPES[id](c, g)];
}
function noiseBuffer(c, color) {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    } else {
      d[i] = w;
    }
  }
  return buf;
}
function src(c, color) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, color);
  s.loop = true;
  return s;
}
function filter(c, type, freq, q = 0.7) {
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}
function lfo(c, target, rate, depth) {
  const o = c.createOscillator(); const g = c.createGain();
  o.frequency.value = rate; g.gain.value = depth;
  o.connect(g).connect(target); o.start();
  return [o, g];
}
const RECIPES = {
  blanco(c, out) { const s = src(c, 'white'); const f = filter(c, 'lowpass', 9000); s.connect(f).connect(out); s.start(); return [s, f]; },
  rosa(c, out) { const s = src(c, 'pink'); s.connect(out); s.start(); return [s]; },
  marron(c, out) { const s = src(c, 'brown'); const f = filter(c, 'lowpass', 1200); s.connect(f).connect(out); s.start(); return [s, f]; },
  lluvia(c, out) {
    const s = src(c, 'white'); const hp = filter(c, 'highpass', 900); const lp = filter(c, 'lowpass', 7000); const g = c.createGain(); g.gain.value = 0.8;
    s.connect(hp).connect(lp).connect(g).connect(out); s.start();
    return [s, hp, lp, g, ...lfo(c, g.gain, 0.3, 0.12)];
  },
  viento(c, out) {
    const s = src(c, 'pink'); const bp = filter(c, 'bandpass', 500, 1.2); const g = c.createGain(); g.gain.value = 1.6;
    s.connect(bp).connect(g).connect(out); s.start();
    return [s, bp, g, ...lfo(c, bp.frequency, 0.08, 280), ...lfo(c, g.gain, 0.13, 0.6)];
  },
  olas(c, out) {
    const s = src(c, 'pink'); const lp = filter(c, 'lowpass', 1400); const g = c.createGain(); g.gain.value = 0.7;
    s.connect(lp).connect(g).connect(out); s.start();
    return [s, lp, g, ...lfo(c, g.gain, 0.1, 0.65), ...lfo(c, lp.frequency, 0.1, 600)];
  },
  fogata(c, out) {
    const s = src(c, 'brown'); const lp = filter(c, 'lowpass', 600); s.connect(lp).connect(out); s.start();
    // chasquidos al azar
    const crackle = () => {
      if (!ambient.master) return;
      const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 'white');
      const hp = filter(c, 'highpass', 2000); const g = c.createGain(); const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.4, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + Math.random() * 0.05);
      n.connect(hp).connect(g).connect(out); n.start(t, Math.random() * 3); n.stop(t + 0.12);
      ambient.timers.push(setTimeout(crackle, 80 + Math.random() * 420));
    };
    crackle();
    return [s, lp];
  },
};
function stopAmbient() {
  ambient.timers.forEach(clearTimeout);
  ambient.timers = [];
  const m = ambient.master;
  ambient.master = null;
  ambient.id = '';
  if (m && ctx) {
    const t = ctx.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(m.gain.value, t);
    m.gain.linearRampToValueAtTime(0, t + 0.6);
    const nodes = ambient.nodes;
    setTimeout(() => nodes.forEach((n) => { try { n.stop && n.stop(); n.disconnect(); } catch { /* ya detenido */ } }), 700);
  }
  ambient.nodes = [];
}
/** Reproduce un sonido de concentración (id de catalog.AMBIENTS). volume: 0 a 100. */
function playAmbient(id, volume = 50) {
  if (ambient.id === id && ambient.master) { setAmbientVolume(volume); return; }
  stopAmbient();
  const c = context();
  const rec = RECORDED[id];
  if (!c || (!rec && !RECIPES[id])) return;
  const master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);
  ambient.master = master;
  ambient.id = id;
  const fadeIn = () => {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(0, c.currentTime);
    master.gain.linearRampToValueAtTime((ambient.volume / 100) * 0.35, c.currentTime + 1.2);
  };
  ambient.volume = volume;
  if (!rec) { ambient.nodes = playSynth(c, master, id); fadeIn(); return; }
  const still = () => ambient.master === master; // ¿sigue siendo este sonido? (se pudo cambiar mientras cargaba)
  const ready = decoded.id === id && decoded.buffer;
  if (ready) { ambient.nodes = playRecorded(c, master, rec, decoded.buffer); fadeIn(); return; }
  loadRecorded(c, id)
    .then((buffer) => { if (still()) { ambient.nodes = playRecorded(c, master, rec, buffer); fadeIn(); } })
    .catch(() => {
      // Sin internet y todavía sin descargar (o el equipo no pudo leerla): suena la versión generada
      if (!still()) return;
      const alt = RECIPES[id] ? id : rec.fallback;
      if (alt && RECIPES[alt]) { ambient.nodes = playSynth(c, master, alt); fadeIn(); }
    });
}
function setAmbientVolume(volume) {
  ambient.volume = volume;
  if (ambient.master && ctx) ambient.master.gain.setTargetAtTime((volume / 100) * 0.35, ctx.currentTime, 0.1);
}

// ---------------- Vibración (Android; iOS la ignora) ----------------
function buzz(pattern) {
  if (!prefs.vibrate || !navigator.vibrate) return;
  // Antes del primer toque el navegador bloquea la vibración (y lo anota como error).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(pattern); } catch { /* sin vibración */ }
}

// ---------------- Confeti ----------------
let canvas, g2d, particles = [], raf = 0;
function ensureCanvas() {
  if (canvas) return;
  canvas = document.getElementById('fx');
  g2d = canvas.getContext('2d');
  const fit = () => {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  globalThis.addEventListener('resize', fit);
}
function confetti({ x = innerWidth / 2, y = innerHeight / 3, count = 90, colors = ['#FFC531', '#93c0ed', '#2ED8A3', '#FF5E7E', '#ffffff'], spread = 1 } = {}) {
  if (motionOff()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (3 + Math.random() * 7) * spread;
    particles.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 6,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
      life: 90 + Math.random() * 50,
      round: Math.random() < 0.3,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}
function step() {
  g2d.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of particles) {
    p.vy += 0.25;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1;
    g2d.save();
    g2d.globalAlpha = Math.min(1, p.life / 30);
    g2d.translate(p.x, p.y);
    g2d.rotate(p.rot);
    g2d.fillStyle = p.color;
    g2d.strokeStyle = '#0D2346';
    g2d.lineWidth = 1.5;
    if (p.round) {
      g2d.beginPath();
      g2d.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      g2d.fill();
      g2d.stroke();
    } else {
      g2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g2d.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    g2d.restore();
  }
  raf = particles.length ? requestAnimationFrame(step) : 0;
  if (!raf) g2d.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------------- Texto flotante (+25 XP) ----------------
function floatText(text, anchor, variant = 'xp') {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `float-text float-text--${variant}`;
  el.textContent = text;
  el.style.setProperty('--x', `${r.left + r.width / 2}px`);
  el.style.setProperty('--y', `${r.top + r.height / 3}px`);
  document.body.append(el);
  const done = () => el.remove();
  if (motionOff()) setTimeout(done, 1200);
  else el.addEventListener('animationend', done, { once: true });
}

export function setPrefs(p) {
  prefs = { ...prefs, ...p };
}
export { motionOff, sfx, playAmbient, stopAmbient, setAmbientVolume, buzz, confetti, floatText };
