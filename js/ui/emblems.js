/*
 * FrostPom — emblemas de rango dibujados en SVG (sin imágenes externas).
 * Cada rango sube en detalle: Bronce (círculo) → Plata (estrella de 4) → Oro (5) → Platino (6)
 * → Diamante (gema) → Maestro (estrella de 8 + alas) → Leyenda (corona + alas).
 * Las divisiones se ven como puntos: III = 1, II = 2, I = 3.
 */
import { svg as s } from './dom.js';

const INK = '#0D2346';
let seq = 0;

function starPoints(n, outer, inner, cx, cy) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function centerSymbol(tierIndex, fill) {
  const cx = 60, cy = 58;
  const common = { fill, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' };
  switch (tierIndex) {
    case 0: return s('circle', { cx, cy, r: 14, ...common });
    case 1: return s('polygon', { points: starPoints(4, 21, 8, cx, cy), ...common });
    case 2: return s('polygon', { points: starPoints(5, 22, 10, cx, cy + 1), ...common });
    case 3: return s('polygon', { points: starPoints(6, 22, 12, cx, cy), ...common });
    case 4: return s('g', {},
      s('polygon', { points: `${cx - 20},${cy - 6} ${cx - 10},${cy - 18} ${cx + 10},${cy - 18} ${cx + 20},${cy - 6} ${cx},${cy + 22}`, ...common }),
      s('polyline', { points: `${cx - 20},${cy - 6} ${cx + 20},${cy - 6}`, fill: 'none', stroke: INK, 'stroke-width': 3 }),
      s('polyline', { points: `${cx - 8},${cy - 6} ${cx},${cy + 20} ${cx + 8},${cy - 6}`, fill: 'none', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    case 5: return s('polygon', { points: starPoints(8, 23, 11, cx, cy), ...common });
    default: return s('g', {},
      s('polygon', { points: starPoints(5, 18, 8, cx, cy + 6), ...common }),
      s('path', { d: `M${cx - 22} ${cy - 14} L${cx - 22} ${cy - 30} L${cx - 11} ${cy - 22} L${cx} ${cy - 34} L${cx + 11} ${cy - 22} L${cx + 22} ${cy - 30} L${cx + 22} ${cy - 14} Z`, ...common }));
  }
}

function wings(fill) {
  const w = (flip) => s('path', {
    d: 'M18 40 C4 40 -6 52 -4 66 C6 60 10 62 14 66 C6 70 4 78 8 86 C14 80 18 80 22 82',
    transform: flip ? 'translate(120 0) scale(-1 1)' : null,
    fill, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round',
  });
  return s('g', {}, w(false), w(true));
}

/**
 * rank: objeto de rankForXp() (game.js). Devuelve un <svg> listo para insertar.
 */
export function emblem(rank, { size = 64, label = true } = {}) {
  const id = 'emb' + ++seq;
  const { a, b } = rank.colors;
  const t = rank.tierIndex;
  const svg = s('svg', {
    viewBox: '-10 -4 140 128', width: size, height: size, class: `emblem emblem--t${t}`,
    role: label ? 'img' : null, 'aria-label': label ? `Rango ${rank.name}` : null, 'aria-hidden': label ? null : 'true', focusable: 'false',
  });
  const defs = s('defs', {},
    s('linearGradient', { id: id + 'g', x1: '0', y1: '0', x2: '0.3', y2: '1' },
      s('stop', { offset: '0', 'stop-color': a }),
      s('stop', { offset: '1', 'stop-color': b })),
    s('linearGradient', { id: id + 's', x1: '0', y1: '0', x2: '1', y2: '1' },
      s('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.7' }),
      s('stop', { offset: '0.5', 'stop-color': '#ffffff', 'stop-opacity': '0' })));
  svg.append(defs);
  if (t >= 5) svg.append(wings(b));
  const shield = 'M60 8 L104 22 V60 C104 86 84 104 60 114 C36 104 16 86 16 60 V22 Z';
  svg.append(
    s('path', { d: shield, fill: INK, transform: 'translate(0 5)' }), // sombra "pegatina"
    s('path', { d: shield, fill: `url(#${id}g)`, stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M60 19 L94 30 V60 C94 80 79 95 60 103 C41 95 26 80 26 60 V30 Z', fill: 'none', stroke: '#ffffff', 'stroke-opacity': '0.45', 'stroke-width': 3 }),
    s('path', { d: 'M22 26 L60 13 L60 44 L22 64 Z', fill: `url(#${id}s)` }),
    centerSymbol(t, t === 1 ? '#ffffff' : a === '#F4F8FF' ? '#ffffff' : '#FFF8E1'),
  );
  const pips = rank.division ? 4 - rank.division : 0;
  for (let i = 0; i < pips; i++) {
    const x = 60 + (i - (pips - 1) / 2) * 13;
    svg.append(s('circle', { cx: x, cy: 92, r: 4.5, fill: '#ffffff', stroke: INK, 'stroke-width': 2.5 }));
  }
  if (rank.stars > 0) {
    const txt = s('text', { x: 60, y: 97, 'text-anchor': 'middle', 'font-size': 16, 'font-family': 'Lilita One, sans-serif', fill: '#ffffff', stroke: INK, 'stroke-width': 3, 'paint-order': 'stroke' });
    txt.textContent = `★${rank.stars}`;
    svg.append(txt);
  }
  return svg;
}
