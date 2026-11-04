/*
 * StudyTimer — compañeros del polo (skins limitadas que se ganan con logros).
 * Pingüino, Oso Polar, Oso Marino, Tiburón Martillo y Zorro Ártico usan el arte que
 * proporcionó el autor del proyecto (assets/companions/*.webp).
 *
 * Para cambiar una imagen sin tocar el código: js/config.js → companionImages.
 */
import { config } from '../config.js';

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
export function companion(id, { size = 96, locked = false, title } = {}) {
  return img(imageFor(id) || '', size, `companion companion--img${locked ? ' is-locked' : ''}`, title);
}

/**
 * Pingüino animado con el sprite sheet del autor.
 * kind: 'saludo' (3 cuadros), 'amor' (3 cuadros, se queda en el último), 'camina' (4 cuadros), 'quieto'.
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

const WALKER_ART = { fox: 'zorro-artico', seal: 'oso-marino' };

/**
 * Animales que caminan por el paisaje. El pingüino y el oso usan sus ciclos de caminar
 * de 4 cuadros (arte del autor); el zorro y la foca, su imagen con saltos.
 */
export function walker(kind) {
  if (WALKER_ART[kind]) return img(BUILTIN_IMAGES[WALKER_ART[kind]], 72, `walker__art walker__art--${kind}`);
  const sp = kind === 'bear' ? bearSprite() : penguin('camina', { size: 60 });
  sp.classList.add('walker__art');
  return sp;
}

/** Oso polar caminando (sprite de 4 cuadros). */
function bearSprite() {
  const el = document.createElement('span');
  el.className = 'sprite sprite--oso-camina';
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
  bubble.textContent = text;
  anchor.append(bubble);
  setTimeout(() => {
    bubble.classList.add('is-leaving');
    setTimeout(() => bubble.remove(), 300);
  }, ms);
  return bubble;
}
