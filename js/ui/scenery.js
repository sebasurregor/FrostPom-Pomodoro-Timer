/*
 * FrostPom — paisaje polar del fondo.
 * Estilo simple con montañas en #93c0ed, #749eda y #2d68bc, nieve y animales que pasan.
 * - El cielo sigue la hora real: amanecer, día, atardecer y noche (data-phase).
 *   De noche hay estrellas, luna, aurora y una fogata con el oso polar asando malvaviscos.
 * - Si el estudiante deja de estudiar, aparecen esmog, una fábrica, basura, petróleo y
 *   nieve sucia. Se controla con la variable CSS --p (0 = limpio, 1 = muy contaminado).
 * - Clima (data-weather): despejado, nieve ligera, nevando o nevada fuerte (ver weather.js).
 * - Los animales caminan, saltan y de vez en cuando dicen algo en un globo (voices.js).
 */
import { svg as s } from './dom.js';
import { walker, say } from './companions.js';
import { localParts } from '../util.js';
import { pickVoice } from '../voices.js';

const lg = (id, stops, x2 = 0, y2 = 1) => s('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, ...stops.map(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op == null ? 1 : op })));

// Picos: [x, y] de cada cima; los casquetes de nieve se dibujan en las más altas.
function ridge(points, baseY) {
  return `0,${baseY} ` + points.map(([x, y]) => `${x},${y}`).join(' ') + ` 1440,${baseY} 1440,900 0,900`;
}
function caps(peaks, minHeight, depth = 26, baseY = 900) {
  // El casquete sigue las dos laderas reales de cada cima (antes era un triángulo fijo que
  // sobresalía en las cimas empinadas y quedaba corto en las suaves).
  return peaks.map(([x, y], i) => {
    if (y > minHeight) return null;
    const [lx, ly] = peaks[i - 1] || [0, baseY];
    const [rx, ry] = peaks[i + 1] || [1440, baseY];
    const d = Math.min(depth, (ly - y) * 0.6, (ry - y) * 0.6);
    const left = x + (lx - x) * (d / (ly - y));
    const right = x + (rx - x) * (d / (ry - y));
    const yb = y + d;
    const pts = [[x, y], [right, yb], [x + (right - x) * 0.45, yb - d * 0.28], [x, yb + d * 0.05], [x + (left - x) * 0.5, yb - d * 0.3], [left, yb]];
    return s('polygon', { class: 'sc-snowcap', points: pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' '), fill: '#F4F9FF' });
  }).filter(Boolean);
}

function buildSvg() {
  const far = [[90, 520], [170, 562], [262, 466], [360, 556], [452, 500], [560, 578], [654, 486], [760, 560], [862, 468], [962, 548], [1064, 482], [1170, 566], [1272, 498], [1362, 556]];
  const mid = [[120, 584], [232, 640], [342, 560], [470, 648], [600, 592], [722, 656], [842, 574], [980, 648], [1102, 590], [1232, 658], [1342, 600]];
  const near = [[140, 690], [300, 716], [470, 680], [640, 712], [800, 684], [960, 716], [1130, 686], [1290, 712]];
  const smoke = [0, 1, 2, 3].map((i) => s('circle', { class: `sc-puff sc-puff--${i}`, cx: 820 + (i % 2) * 42, cy: 566, r: 14 + i * 3, fill: '#6F6B62' }));

  return s('svg', { class: 'scenery__svg', viewBox: '0 0 1440 900', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      lg('scSkyDay', [[0, '#3F86D6'], [0.5, '#7DB3EA'], [0.75, '#B9D8F6'], [1, '#E3F0FC']]),
      lg('scSkyDawn', [[0, '#2B5DA8'], [0.45, '#8DA6DA'], [0.68, '#F4B7C3'], [1, '#FFD9A8']]),
      lg('scSkyDusk', [[0, '#23468A'], [0.45, '#7C6FB4'], [0.66, '#E9909E'], [1, '#FFB27A']]),
      lg('scSkyNight', [[0, '#061430'], [0.5, '#0F2A5C'], [0.8, '#1F4782'], [1, '#2d5a9a']]),
      s('radialGradient', { id: 'scFire', cx: '0.5', cy: '0.5', r: '0.5' },
        s('stop', { offset: 0, 'stop-color': '#FFB86B', 'stop-opacity': 0.55 }),
        s('stop', { offset: 1, 'stop-color': '#FFB86B', 'stop-opacity': 0 })),
      lg('scSnow', [[0, '#F2F8FF'], [1, '#CFE3F8']]),
      lg('scSmog', [[0, '#3E3C38', 0.65], [0.55, '#7D7666', 0.85], [1, '#9A9281', 0.75]]),
      lg('scAurora', [[0, '#5EF2C8', 0], [0.3, '#5EF2C8', 0.55], [0.6, '#7FB6FF', 0.45], [1, '#B98CFF', 0]], 1, 0),
      lg('scOil', [[0, '#14131A'], [0.5, '#2A2433'], [1, '#14131A']], 1, 0),
      lg('scBlizzard', [[0, '#FFFFFF', 0.05], [0.55, '#EAF3FF', 0.45], [1, '#FFFFFF', 0.6]])),
    s('rect', { class: 'sc-sky sc-sky--day', width: 1440, height: 900, fill: 'url(#scSkyDay)' }),
    s('rect', { class: 'sc-sky sc-sky--dawn', width: 1440, height: 900, fill: 'url(#scSkyDawn)' }),
    s('rect', { class: 'sc-sky sc-sky--dusk', width: 1440, height: 900, fill: 'url(#scSkyDusk)' }),
    s('rect', { class: 'sc-sky sc-sky--night', width: 1440, height: 900, fill: 'url(#scSkyNight)' }),
    s('g', { class: 'sc-stars' }, ...[[120, 80], [260, 150], [420, 60], [610, 120], [780, 40], [930, 140], [1110, 70], [1280, 130], [1380, 50], [520, 200], [1010, 210], [200, 240]].map(([x, y], i) =>
      s('circle', { cx: x, cy: y, r: i % 3 === 0 ? 2.2 : 1.4, fill: '#ffffff', opacity: '0.85' }))),
    s('g', { class: 'sc-aurora' },
      s('path', { d: 'M-40 230 C200 150 380 290 640 210 C900 130 1080 270 1480 170 L1480 250 C1080 350 900 220 640 300 C380 380 200 240 -40 320 Z', fill: 'url(#scAurora)' }),
      s('path', { d: 'M-40 300 C260 240 460 340 760 280 C1040 220 1220 320 1480 260 L1480 300 C1220 360 1040 270 760 330 C460 390 260 290 -40 350 Z', fill: 'url(#scAurora)', opacity: '0.6' })),
    s('ellipse', { class: 'sc-glow', cx: 720, cy: 580, rx: 820, ry: 120, fill: '#F9C9D3', opacity: '0.45' }),
    s('circle', { class: 'sc-sun sc-sun--day', cx: 1040, cy: 250, r: 40, fill: '#FFF3C4' }),
    s('circle', { class: 'sc-sun sc-sun--dawn', cx: 330, cy: 545, r: 44, fill: '#FFE0A8' }),
    s('circle', { class: 'sc-sun sc-sun--dusk', cx: 1110, cy: 545, r: 46, fill: '#FFC28A' }),
    s('g', { class: 'sc-moon' },
      s('circle', { cx: 1080, cy: 170, r: 30, fill: '#F4F1E4' }),
      s('circle', { cx: 1070, cy: 162, r: 6, fill: '#DDD8C4' }),
      s('circle', { cx: 1090, cy: 182, r: 4, fill: '#DDD8C4' })),
    s('polygon', { points: ridge(far, 600), fill: '#93c0ed' }),
    ...caps(far, 500, 26, 600),
    s('polygon', { points: ridge(mid, 660), fill: '#749eda' }),
    ...caps(mid, 600, 22, 660),
    // Fábrica (aparece con la contaminación)
    s('g', { class: 'sc-factory' },
      s('rect', { x: 770, y: 640, width: 120, height: 70, fill: '#4D5563' }),
      s('polygon', { points: '770,640 795,622 795,640 820,622 820,640 845,622 845,640', fill: '#4D5563' }),
      s('rect', { x: 812, y: 580, width: 15, height: 62, fill: '#3E4552' }),
      s('rect', { x: 856, y: 596, width: 13, height: 46, fill: '#3E4552' }),
      s('rect', { x: 812, y: 592, width: 15, height: 5, fill: '#C9493A' }),
      s('rect', { x: 856, y: 606, width: 13, height: 5, fill: '#C9493A' }),
      ...smoke),
    s('polygon', { points: ridge(near, 720), fill: '#2d68bc' }),
    s('path', { d: 'M0 742 Q240 722 480 740 T960 736 T1440 734 V900 H0 Z', fill: 'url(#scSnow)' }),
    s('path', { d: 'M90 790 Q180 772 270 792 M620 812 Q720 796 820 814 M1080 786 Q1180 770 1280 790', fill: 'none', stroke: '#BBD6F2', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    // Contaminación sobre la nieve
    s('path', { class: 'sc-dirt', d: 'M0 742 Q240 722 480 740 T960 736 T1440 734 V900 H0 Z', fill: '#8B8472' }),
    s('g', { class: 'sc-oil' },
      s('ellipse', { class: 'sc-oil-pool', cx: 860, cy: 846, rx: 100, ry: 18, fill: 'url(#scOil)' }),
      s('ellipse', { class: 'sc-oil-sheen', cx: 840, cy: 841, rx: 34, ry: 4, fill: '#7E5BB0', opacity: '0.45' }),
      s('path', { class: 'sc-oil-drip', d: 'M890 700 q4 10 0 14 q-4 -4 0 -14 Z', fill: '#1A1820' }),
      s('ellipse', { cx: 240, cy: 830, rx: 130, ry: 20, fill: 'url(#scOil)' })),
    s('g', { class: 'sc-trash' },
      s('rect', { x: 548, y: 812, width: 18, height: 28, rx: 3, fill: '#D9473E', transform: 'rotate(-70 557 826)' }),
      s('rect', { x: 902, y: 806, width: 12, height: 30, rx: 5, fill: '#4F9A6B', opacity: '0.85', transform: 'rotate(20 908 821)' }),
      s('path', { d: 'M780 812 q20 -24 40 0 q-6 18 -20 16 q-14 2 -20 -16 Z', fill: '#B9B6AE', opacity: '0.9' }),
      s('rect', { x: 1080, y: 840, width: 22, height: 14, rx: 3, fill: '#E2E0D8', transform: 'rotate(12 1091 847)' })),
    s('rect', { class: 'sc-nighttint', y: 440, width: 1440, height: 460, fill: '#071733' }),
    igloo(),
    camp(),
    s('g', { class: 'sc-wind' }, ...[[120, 610], [420, 690], [760, 560], [1040, 660], [300, 520]].map(([x, y], i) =>
      s('path', { class: `sc-gust sc-gust--${i}`, d: `M${x} ${y} q40 -10 80 0 t80 0`, fill: 'none', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round' }))),
    s('rect', { class: 'sc-blizzard', width: 1440, height: 900, fill: 'url(#scBlizzard)' }),
    s('rect', { class: 'sc-smog', width: 1440, height: 900, fill: 'url(#scSmog)' }));
}

// Iglú (siempre visible; de noche su entrada brilla)
function igloo() {
  const LINE = '#3A2422';
  const block = (d) => s('path', { d, fill: 'none', stroke: '#B9D3EC', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
  return s('g', { class: 'sc-igloo', transform: 'translate(170 0)' },
    s('ellipse', { cx: 480, cy: 802, rx: 118, ry: 12, fill: '#9FBFE0', opacity: '0.55' }),
    s('path', { d: 'M380 800 A100 96 0 0 1 580 800 Z', fill: '#EEF6FE', stroke: LINE, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M392 800 A88 84 0 0 1 470 718', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: '0.8' }),
    block('M390 772 Q480 760 570 772'), block('M402 744 Q480 732 558 744'), block('M424 720 Q480 710 536 720'),
    block('M430 800 L432 772 M500 800 L500 772 M545 800 L543 772'),
    block('M416 772 L420 744 M466 772 L466 744 M522 772 L520 744 M450 744 L452 720 M508 744 L506 720'),
    // entrada
    s('path', { d: 'M440 800 L440 778 A40 34 0 0 1 520 778 L520 800 Z', fill: '#DCEBFA', stroke: LINE, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }),
    s('path', { class: 'sc-igloo-door', d: 'M456 800 L456 784 A24 22 0 0 1 504 784 L504 800 Z', fill: '#2B3A55' }),
    s('path', { class: 'sc-igloo-glow', d: 'M456 800 L456 784 A24 22 0 0 1 504 784 L504 800 Z', fill: '#FFB86B' }),
    block('M446 788 Q480 780 514 788'));
}

// Escena nocturna: el oso polar y (v4.2) el zorro ártico asan malvaviscos junto a la fogata (arte del autor).
// El oso tiene 5 cuadros (mira el malvavisco, sonríe, se le antoja, se asusta y lo sopla).
// La fogata es la del mismo dibujo, separada en llama (titila) y leños (quietos), con
// resplandor, chispas y humo animados encima.
const ROAST = { x: 750, y: 658.5, w: 182.5, h: 150, frames: 5 }; // ventana de un cuadro, en unidades del paisaje
// (v4.2) El zorro, al otro lado de la fogata: su malvavisco queda junto al del oso, en la punta
// de la llama. Hoja de 5 cuadros de 400 × 320 (tools/preparar_sprites.py).
const ROAST2 = { x: 889, y: 670, w: 174.8, h: 139.8, frames: 5 };
const FIRE = { x: 905, y: 806 }; // centro de la base de los leños
function camp() {
  return s('g', { class: 'sc-camp' },
    s('circle', { cx: FIRE.x, cy: FIRE.y - 34, r: 125, fill: 'url(#scFire)' }),
    s('ellipse', { cx: FIRE.x - 20, cy: FIRE.y + 2, rx: 120, ry: 15, fill: '#FFB86B', opacity: '0.28' }),
    // oso con malvavisco: una tira de 5 cuadros que se recorre dentro de una ventana
    s('svg', { class: 'sc-roast', x: ROAST.x, y: ROAST.y, width: ROAST.w, height: ROAST.h, viewBox: `0 0 ${ROAST.w} ${ROAST.h}`, overflow: 'hidden' },
      s('image', { class: 'sc-roast__strip', href: 'assets/sprites/oso-malvavisco.webp', x: 0, y: 0, width: ROAST.w * ROAST.frames, height: ROAST.h, preserveAspectRatio: 'none' })),
    // zorro con malvavisco (mira el malvavisco, se asoma, se le hace agua la boca, ¡se quema!, se lo come)
    s('svg', { class: 'sc-roast2', x: ROAST2.x, y: ROAST2.y, width: ROAST2.w, height: ROAST2.h, viewBox: `0 0 ${ROAST2.w} ${ROAST2.h}`, overflow: 'hidden' },
      s('image', { class: 'sc-roast2__strip', href: 'assets/sprites/zorro-malvavisco.webp', x: 0, y: 0, width: ROAST2.w * ROAST2.frames, height: ROAST2.h, preserveAspectRatio: 'none' })),
    // fogata del dibujo: leños quietos y llama que titila
    s('image', { class: 'sc-fire-logs', href: 'assets/sprites/fogata-lenos.webp', x: FIRE.x - 24.75, y: FIRE.y - 17.75, width: 49.5, height: 18, preserveAspectRatio: 'none' }),
    s('image', { class: 'sc-flame sc-fire-art', href: 'assets/sprites/fogata-llama.webp', x: FIRE.x - 21.75, y: FIRE.y - 58.25, width: 43.25, height: 40.5, preserveAspectRatio: 'none' }),
    ...[0, 1, 2].map((i) => s('circle', { class: `sc-spark sc-spark--${i}`, cx: FIRE.x - 6 + i * 7, cy: FIRE.y - 56, r: 2, fill: '#FFC46B' })),
    // humo de la fogata
    ...[0, 1, 2, 3].map((i) => s('circle', { class: `sc-firesmoke sc-firesmoke--${i}`, cx: FIRE.x, cy: FIRE.y - 64, r: 9 + i * 2, fill: '#D9DEE6' })));
}

// Animales que caminan: [tipo, dirección, duración (s), retraso (s)].
// El orden importa: con contaminación se van primero los últimos (ver styles.css).
const WALKERS = [
  ['penguin', 'ltr', 46, -6],
  ['penguin', 'ltr', 46, -8.4],
  ['bear', 'rtl', 72, -30],
  ['fox', 'ltr', 32, -20],
  ['penguin', 'rtl', 58, -48],
  ['seal', 'rtl', 96, -70],
];
const FLAKES = 150; // la nieve ligera usa 30, la media 80 y la fuerte todos

let rootEl = null;
export function mount(container) {
  rootEl = container;
  rootEl.replaceChildren(buildSvg());
  const walkers = document.createElement('div');
  walkers.className = 'scenery__walkers';
  WALKERS.forEach(([kind, dir, dur, delay], i) => {
    const w = document.createElement('div');
    w.className = `walker walker--${dir} walker--${kind}`;
    w.dataset.kind = kind;
    w.style.setProperty('--dur', `${dur}s`);
    w.style.setProperty('--delay', `${delay}s`);
    w.style.setProperty('--i', String(i));
    const hop = document.createElement('div'); // salticos (cada animal a su ritmo)
    hop.className = 'walker__hop';
    const body = document.createElement('div'); // bamboleo al caminar
    body.className = 'walker__body';
    body.append(walker(kind));
    hop.append(body);
    w.append(hop);
    walkers.append(w);
  });
  const flakes = document.createElement('div');
  flakes.className = 'scenery__flakes';
  for (let i = 0; i < FLAKES; i++) {
    const f = document.createElement('span');
    const layer = i % 3; // 0 = lejos (pequeños y lentos) … 2 = cerca (grandes y rápidos)
    f.className = `flake flake--${layer}`;
    f.style.setProperty('--x', `${(i * 37 + (i % 7) * 11) % 100}vw`);
    f.style.setProperty('--d', `${(13 - layer * 3) + (i % 5) * 1.6}s`);
    f.style.setProperty('--delay', `${-((i * 1.37) % 16)}s`);
    f.style.setProperty('--s', `${2 + layer * 1.5 + (i % 2)}px`);
    flakes.append(f);
  }
  rootEl.append(flakes, walkers);
  rootEl.dataset.weather = rootEl.dataset.weather || 'light';
}

/** Clima del paisaje: 'clear', 'light', 'medium' o 'heavy'. */
export function setWeather(id) {
  if (rootEl) rootEl.dataset.weather = id;
}

// ---------- Onomatopeyas: de vez en cuando un animal dice algo ----------
let chatterTimer = null;
/** isStudying() dice si hay un bloque de estudio corriendo (entonces hablan menos y bajito). */
export function startChatter(isStudying = () => false) {
  if (chatterTimer || typeof window === 'undefined') return;
  const next = () => {
    const wait = isStudying() ? 16000 + Math.random() * 10000 : 5500 + Math.random() * 5500;
    chatterTimer = setTimeout(() => { speakOnce(isStudying()); next(); }, wait);
  };
  next();
}

/** Hace hablar a un animal visible. Devuelve el texto o '' si no había nadie a la vista. */
export function speakOnce(studying = false) {
  if (!rootEl || document.hidden) return '';
  const w = innerWidth;
  const visible = [...rootEl.querySelectorAll('.walker')].filter((el) => {
    if (getComputedStyle(el).display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left > 16 && r.right < w - 16;
  });
  if (!visible.length) return '';
  const el = visible[Math.floor(Math.random() * visible.length)];
  const ctx = {
    night: rootEl.dataset.phase === 'night',
    weather: rootEl.dataset.weather,
    dirty: rootEl.dataset.level === 'contaminado' || rootEl.dataset.level === 'critico',
    studying,
  };
  const text = pickVoice(el.dataset.kind, ctx);
  say(el, text, { ms: 2600 });
  return text;
}

export function setHealth(health, levelId) {
  if (!rootEl) return;
  const p = Math.max(0, Math.min(1, 1 - health));
  rootEl.style.setProperty('--p', p.toFixed(3));
  rootEl.dataset.level = levelId;
}

/** Fase del día según la hora local: amanecer, día, atardecer o noche. */
export function phaseFor(date = new Date(), timeZone) {
  const h = localParts(date, timeZone).hour;
  if (h >= 5 && h < 6.75) return 'dawn';
  if (h >= 6.75 && h < 17.25) return 'day';
  if (h >= 17.25 && h < 18.75) return 'dusk';
  return 'night';
}
export function setPhase(phase) {
  if (rootEl) rootEl.dataset.phase = phase;
}
