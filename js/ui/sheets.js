/*
 * FrostPom — en el celular, menos paneles y más paisaje (v4.3).
 *
 * Una sección con data-sheet="Título" se esconde en el celular y en su lugar aparece un botón
 * (dentro del contenedor que dice data-sheet-in). Al tocarlo, la sección se abre encima como una
 * ventana, con una × para cerrarla (también se cierra con Escape, con el botón atrás de Android y
 * al cambiar de pantalla). En pantallas grandes todo se ve como siempre: no cambia nada.
 *
 *   data-sheet-icon  = emoji del botón
 *   data-sheet-meta  = selector de un texto de la sección que se copia en el botón ("3 de 18")
 *   data-sheet-style = "bottom" para una ventana pequeña abajo (Duración), si no ocupa la pantalla
 */
import { h } from './dom.js';
import { tr } from '../i18n.js';

const PHONE = '(max-width: 899px)';
const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
let current = null;
let opener = null;

export const sheetOpen = () => !!current;

/** Abre una sección como ventana (solo en el celular). */
export function openSheet(sec, from = null) {
  if (!sec || !isPhone()) return;
  closeSheet({ restore: false });
  document.dispatchEvent(new Event('frostpom:sheet-open')); // la tienda de comida se cierra
  current = sec;
  opener = from;
  sec.classList.add('is-open');
  sec.setAttribute('role', 'dialog');
  sec.setAttribute('aria-modal', sec.dataset.sheetStyle === 'bottom' ? 'false' : 'true');
  document.documentElement.classList.add('sheet-open');
  if (sec.dataset.sheetStyle !== 'bottom') document.documentElement.classList.add('sheet-full');
  if (from) from.setAttribute('aria-expanded', 'true');
  const x = sec.querySelector('.sheet-close');
  if (x) x.focus({ preventScroll: true });
  sec.scrollTop = 0;
}

/** Cierra la ventana abierta. Devuelve true si había una. */
export function closeSheet({ restore = true } = {}) {
  if (!current) return false;
  current.classList.remove('is-open');
  current.removeAttribute('role');
  current.removeAttribute('aria-modal');
  document.documentElement.classList.remove('sheet-open', 'sheet-full');
  if (opener) {
    opener.setAttribute('aria-expanded', 'false');
    if (restore) opener.focus({ preventScroll: true });
  }
  current = null;
  opener = null;
  return true;
}

/** Botones de las secciones escondidas (se vuelven a pintar cuando cambian los datos). */
export function renderSheetTiles() {
  const boxes = new Map();
  document.querySelectorAll('[data-sheet][data-sheet-in]').forEach((sec) => {
    const box = document.querySelector(sec.dataset.sheetIn);
    if (!box) return;
    if (!boxes.has(box)) boxes.set(box, []);
    const metaEl = sec.dataset.sheetMeta ? sec.querySelector(sec.dataset.sheetMeta) : null;
    const meta = metaEl ? metaEl.textContent.trim() : '';
    const btn = h('button', {
      type: 'button', class: 'sheet-tile', 'aria-expanded': String(current === sec), 'aria-haspopup': 'dialog',
      onclick: (e) => openSheet(sec, e.currentTarget),
    },
    h('span', { class: 'sheet-tile__icon', 'aria-hidden': 'true', text: sec.dataset.sheetIcon || '•' }),
    h('span', { class: 'sheet-tile__text' },
      h('b', { text: sec.dataset.sheet }),
      meta ? h('small', { text: meta }) : null));
    if (current === sec) opener = btn;
    boxes.get(box).push(btn);
  });
  for (const [box, btns] of boxes) box.replaceChildren(...btns);
}

/** Pone la × a cada sección y escucha Escape, el cambio de pantalla y el tamaño de la ventana. */
export function initSheets() {
  document.querySelectorAll('[data-sheet]').forEach((sec) => {
    if (sec.querySelector(':scope > .sheet-close, :scope > * > .sheet-close')) return;
    const head = sec.querySelector(':scope > .panel__head, :scope > .prog__head') || sec;
    head.append(h('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': tr('Cerrar'), title: tr('Cerrar'), onclick: () => closeSheet() }, '×'));
  });
  renderSheetTiles();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !document.querySelector('dialog[open]')) closeSheet();
  });
  window.addEventListener('hashchange', () => closeSheet({ restore: false }));
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia(PHONE);
    const onChange = () => { if (!mq.matches) closeSheet({ restore: false }); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
}
