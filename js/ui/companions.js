/*
 * FrostPom — compañeros del polo (skins limitadas que se ganan con logros).
 * Pingüino, Oso Polar, Oso Marino, Tiburón Martillo y Zorro Ártico usan el arte que
 * proporcionó el autor del proyecto (assets/companions/*.webp).
 *
 * Para cambiar una imagen sin tocar el código: js/config.js → companionImages.
 */
import { config } from '../config.js';
import { tr } from '../i18n.js';

// Arte del autor incluido en la app
const BUILTIN_IMAGES = Object.freeze({
  pinguino: 'assets/companions/pinguino.webp',
  'oso-polar': 'assets/companions/oso-polar.webp',
  'oso-marino': 'assets/companions/oso-marino.webp',
  'tiburon-martillo': 'assets/companions/tiburon-martillo.webp',
  'zorro-artico': 'assets/companions/zorro-artico.webp',
});

const IMG_PATH = /^assets\/(companions|sprites)\/[a-z0-9._-]+\.(png|webp|jpg|jpeg|svg)$/i;

function imageFor(id) {
  const custom = config.companionImages && config.companionImages[id];
  if (custom && IMG_PATH.test(custom)) return custom;
  return BUILTIN_IMAGES[id] || null;
}

function img(src, size, className, title) {
  const el = document.createElement('img');
  el.src = src;
  el.width = size;
  el.height = size;
  el.alt = title || '';
  el.decoding = 'async';
  el.draggable = false;
  el.className = className;
  if (!title) el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Devuelve la imagen del compañero. locked = silueta (aún no desbloqueado). */
// Cuánto hay que subir cada dibujo para que el animal (no el cuadro) quede centrado.
// Se midió el contorno de cada imagen: el tiburón asoma del agua en la mitad de abajo.
const ART_DY = Object.freeze({ 'tiburon-martillo': -22, 'zorro-artico': -8, pinguino: -2, 'oso-marino': -1 });
export const artOffset = (id) => (config.companionImages && config.companionImages[id] ? 0 : ART_DY[id] || 0);

/** Dirección de la imagen del compañero (la usa la ventanita "Siempre encima"). */
export const companionSrc = (id) => imageFor(id);

export function companion(id, { size = 96, locked = false, title } = {}) {
  return img(imageFor(id) || '', size, `companion companion--img${locked ? ' is-locked' : ''}`, title);
}

/**
 * Pingüino animado con el sprite sheet del autor.
 * kind: 'saludo' (3 cuadros), 'amor' (3 cuadros, en bucle), 'camina' (4 cuadros), 'quieto'.
 */
export function penguin(kind = 'quieto', { size = 96, label } = {}) {
  const el = document.createElement('span');
  el.className = `sprite sprite--${kind}`;
  el.style.setProperty('--size', `${size}px`);
  if (label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  return el;
}

// ---------------------------------------------------------------------
// (v4.2) El compañero de Enfocar: corazones al comer, llanto con hambre y tumba
// ---------------------------------------------------------------------
// Hojas de assets/sprites (tools/preparar_sprites.py): cuadros de 320 × 320 con el animal del
// mismo tamaño y en el mismo lugar que su dibujo de siempre. El oso polar todavía no tiene
// animación de corazones (al comer, salta) y el pingüino usa su sprite de siempre.
const PET_SHEETS = Object.freeze({
  pinguino: { llora: 'pinguino-llora' },
  'oso-polar': { llora: 'oso-llora' },
  'oso-marino': { amor: 'oso-marino-amor', llora: 'oso-marino-llora' },
  'tiburon-martillo': { amor: 'tiburon-amor', llora: 'tiburon-llora' },
  'zorro-artico': { amor: 'zorro-amor', llora: 'zorro-llora' },
});
const CRYING = new Set(['triste', 'lloroso', 'llorando', 'debil']);

// Dónde queda lo más alto de la cabeza (fracción del alto del dibujo, desde arriba): ahí se
// apoya el nombre. [contento, llorando]; se midió en cada dibujo.
const HEAD_TOP = Object.freeze({
  pinguino: [0.04, 0.04],
  'oso-polar': [0.05, 0.05],
  'oso-marino': [0.08, -0.04],
  'tiburon-martillo': [0.5, 0.34],
  'zorro-artico': [0.21, 0.07],
});
const TOMB_TOP = 0.15;
export function headTop(petId, face) {
  if (face === 'muerto') return TOMB_TOP;
  const t = HEAD_TOP[petId] || [0, 0];
  return CRYING.has(face) ? t[1] : t[0];
}

function sheet(name, extra) {
  const el = document.createElement('span');
  el.className = `psprite psprite--${name}${extra ? ` ${extra}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * El dibujo del compañero según cómo está:
 *  face: 'feliz' | 'triste' | 'lloroso' | 'llorando' | 'debil' | 'muerto' (ver pet.js: face)
 *  eating: true mientras come (corazones en bucle)
 *  pose: para el pingüino contento, 'quieto' o 'saludo' (en los descansos)
 */
export function petArt(petId, face, { eating = false, pose = 'quieto', size = 96 } = {}) {
  const sheets = PET_SHEETS[petId] || {};
  let el;
  if (face === 'muerto') el = sheet('tumba', 'psprite--1');
  else if (eating && petId === 'pinguino') el = penguin('amor', { size });
  else if (eating && sheets.amor) el = sheet(sheets.amor, 'psprite--4 is-amor');
  else if (eating) el = companion(petId, { size }); // sin corazones: contento y saltando
  else if (CRYING.has(face) && sheets.llora) el = sheet(sheets.llora, `psprite--5 is-${face}`);
  else if (petId === 'pinguino') el = penguin(pose, { size });
  else el = companion(petId, { size });
  el.style.setProperty('--size', `${size}px`);
  return el;
}

const WALKER_ART = { seal: 'oso-marino' };

/**
 * Animales que caminan por el paisaje. El pingüino, el oso y (v4.2) el zorro usan sus ciclos
 * de caminar de 4 cuadros (arte del autor); la foca, su imagen con saltos.
 */
export function walker(kind) {
  if (WALKER_ART[kind]) return img(BUILTIN_IMAGES[WALKER_ART[kind]], 72, `walker__art walker__art--${kind}`);
  const sp = kind === 'bear' ? walkSprite('oso-camina') : kind === 'fox' ? walkSprite('zorro-camina') : penguin('camina', { size: 60 });
  sp.classList.add('walker__art');
  return sp;
}

/** Oso polar o zorro caminando (sprite de 4 cuadros). */
function walkSprite(name) {
  const el = document.createElement('span');
  el.className = `sprite sprite--${name}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Globo de diálogo sobre un elemento (onomatopeyas de los animales).
 * Es decorativo: los lectores de pantalla no lo anuncian.
 */
export function say(anchor, text, { ms = 2600 } = {}) {
  if (!anchor || !text) return null;
  const old = anchor.querySelector(':scope > .say');
  if (old) old.remove();
  const bubble = document.createElement('span');
  bubble.className = 'say';
  bubble.setAttribute('aria-hidden', 'true');
  bubble.textContent = tr(text);
  anchor.append(bubble);
  setTimeout(() => {
    bubble.classList.add('is-leaving');
    setTimeout(() => bubble.remove(), 300);
  }, ms);
  return bubble;
}
