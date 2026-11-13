/*
 * FrostPom — "Siempre encima" (v4.4.1).
 *
 * Una ventanita con el reloj que queda ENCIMA de las demás ventanas del computador, aunque estés en
 * Word, en el navegador o viendo una clase. Usa Document Picture-in-Picture: existe en Chrome y Edge
 * (también en la app de Microsoft Store, que es Edge). En el celular y en Safari no existe, así que
 * el botón no aparece (en Android, lo equivalente será la notificación y el widget: fase 5).
 *
 * El diseño sigue el mockup del widget del autor: a la izquierda la sesión (título, la hora, una
 * frase, la barra con tu compañero y cinco botones) y a la derecha los animales junto a la fogata.
 * Los botones son los mismos de Enfocar (se llaman las mismas funciones):
 *   ▶/⏸ empezar o pausar · ⏮ reiniciar el bloque · 🔁 "lo siguiente empieza solo" (encendido o
 *   apagado) · ⏭ saltar · ✓ terminar y guardar.
 *
 * Por qué la ventanita también mueve el reloj de la app: si la ventana principal está minimizada,
 * el navegador la frena (revisa el reloj muy de vez en cuando) y el pomodoro terminaría tarde. La
 * ventanita sí está a la vista, así que ella revisa el reloj 4 veces por segundo.
 *
 * Seguridad: la ventanita tiene las mismas reglas (CSP) que la app. Nada de innerHTML: todo se crea
 * con createElement y los textos entran con textContent. Las direcciones van completas (la
 * ventanita no tiene una dirección propia desde la cual buscar los archivos).
 */
import * as U from '../util.js';
import { $ } from './dom.js';
import { toast } from './feedback.js';
import { companionSrc } from './companions.js';
import { isNative } from './native-ui.js';
import { startOrToggle, tick, finishBlock, skipBlock, resetBlock } from './focus.js';
import { session, state, mutate } from './context.js';
import { currentPetId, isDead } from '../pet.js';
import { tr } from '../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = { width: 460, height: 230 }; // como el mockup (2 de ancho por 1 de alto); se puede agrandar

// Los íconos del pin los entregó el autor (v4.4.1); se pasaron a trazos para que se vean nítidos y
// tomen el color del tema. Lienzo de 512 × 512.
const PIN = 'M249.5 478.6C245.8 476.9 242.5 473.4 241.1 469.7C240.3 467.8 240 443 240 393.5L240 320.1L189.1 319.8C139.4 319.5 138.1 319.4 135.4 317.4C129 312.7 128.5 311.1 128.2 295.4C127.3 255.9 139.3 224.6 165.6 198L176 187.5L176 156.5L176 125.5L169.6 122.2C158.1 116.2 148.9 104.5 145.5 91.3C139 66.4 154.9 40.2 180.5 33.5C189.3 31.2 322.7 31.2 331.5 33.5C357.1 40.2 373 66.4 366.5 91.3C363.1 104.5 353.9 116.2 342.4 122.2L336 125.5L336 156.6L336 187.7L345 196.5C371.8 222.8 384.7 255.4 383.8 295.2C383.5 311.2 383 312.7 376.6 317.4C373.9 319.4 372.6 319.5 322.9 319.8L272 320.1L271.8 395C271.5 468.8 271.5 469.9 269.4 472.6C268.3 474.1 266.2 476.3 264.8 477.3C261.4 479.8 253.5 480.5 249.5 478.6ZM351.6 280C350.1 263.1 343.2 244.8 332.9 231C328.2 224.5 321.3 217.6 311.2 209.2C307.7 206.3 305.7 203.7 305 201.2C304.2 198.7 304 182.6 304.2 151.8C304.5 107.5 304.6 106.1 306.6 103.4C310 98.8 313.3 96.9 320 96C330.5 94.5 335.5 89.4 335.5 80C335.5 73.7 333.9 70.5 328.6 66.6C325.9 64.5 325 64.5 256 64.5C187 64.5 186.1 64.5 183.4 66.6C178.1 70.5 176.5 73.7 176.5 80C176.5 89.4 181.5 94.5 192 96C198.7 96.9 202 98.8 205.4 103.4C207.4 106.1 207.5 107.5 207.8 151.8C208 182.6 207.8 198.7 207 201.2C206.3 203.8 204.3 206.3 200.7 209.2C175.8 229.6 162.8 252.4 160.4 279.9L159.7 288L256 288L352.3 288L351.6 280Z';
const UNPIN = 'M249.5 478.6C245.8 477 242.5 473.4 241.1 469.7C240.3 467.8 240 443 240 393.4L240 320L233.3 320L226.5 320L242.5 304L258.5 288L305.4 288L352.3 288L351.6 280.2C349.9 260 341.2 239.2 328.6 225.3L325.1 221.4L336.4 210.1L347.7 198.8L350.5 201.6C355.9 207.3 364 218.9 368.9 228.1C379.6 248.2 384.4 269.7 383.8 295.4C383.5 311.1 383 312.7 376.6 317.4C373.9 319.4 372.6 319.5 322.9 319.8L272 320.1L271.8 395C271.5 469.2 271.5 469.9 269.4 472.7C264.4 479.4 256.6 481.7 249.5 478.6ZM95 425.9C87.9 423.1 84.1 415.3 86 407.8C87 403.9 103 387.6 252.8 237.7C343.9 146.6 419.9 71.1 421.6 70C425.7 67.4 433.4 67.3 437.7 70C443 73.2 445.6 80 443.9 86.4C443 90 423.1 110.3 276.2 257.3C184.5 349 108.1 424.7 106.3 425.5C102.8 427.2 98.7 427.3 95 425.9ZM137.5 318.6C133.8 317 130.5 313.4 129.1 309.7C127.5 305.5 127.8 281.3 129.6 269.1C132.4 249.6 141.5 227.5 153 212C155.7 208.4 162 201.5 166.9 196.5L176 187.5L176 156.5L176 125.4L170.4 122.7C153.7 114.5 142.8 95.2 144.3 76.5C146 54.8 161 37.5 182 33C186 32.2 207 32 259.5 32.2L331.5 32.5L338 35.3C364.6 46.5 375.4 76.5 362.3 102.4C358.6 109.6 349.9 118.3 342.4 122.2L336 125.5L336 133.5L336 141.5L320.3 157.2C311.7 165.9 304.5 173 304.3 173C304.1 173 304.1 158 304.2 139.6C304.5 107.6 304.6 106 306.6 103.4C310 98.8 313.2 97 320 95.9C331 94.2 336.8 87.6 335.7 78.2C335.2 73.4 333 69.8 328.6 66.6C325.9 64.5 325 64.5 256 64.5C187 64.5 186.1 64.5 183.4 66.6C178.2 70.4 176.5 73.7 176.5 79.8C176.5 84.2 177 86.3 178.9 88.9C181.7 92.8 188 95.9 193.1 96C197.2 96 202.2 99 205.4 103.3C207.5 106.1 207.5 107.3 207.8 152.6C208.1 206.4 208.7 203 198 211.5C175.6 229.4 163 252.6 160.4 280.8L159.7 288L174.4 288C182.4 288 189 288.3 189 288.8C189 289.2 181.8 296.4 173.1 304.8L157.2 320L148.8 320C144.1 319.9 139.2 319.3 137.5 318.6Z';

// Íconos de los controles (lienzo de 24 × 24). fill = relleno; line = trazo.
const ICONS = {
  play: { fill: 'M8.2 5.3a1.2 1.2 0 0 1 1.8-1l9.6 6.7a1.2 1.2 0 0 1 0 2L10 19.7a1.2 1.2 0 0 1-1.8-1z' },
  pause: { fill: 'M6.5 5.2A1.2 1.2 0 0 1 7.7 4h2.1a1.2 1.2 0 0 1 1.2 1.2v13.6A1.2 1.2 0 0 1 9.8 20H7.7a1.2 1.2 0 0 1-1.2-1.2zm6.5 0A1.2 1.2 0 0 1 14.2 4h2.1a1.2 1.2 0 0 1 1.2 1.2v13.6a1.2 1.2 0 0 1-1.2 1.2h-2.1a1.2 1.2 0 0 1-1.2-1.2z' },
  prev: { fill: 'M18.5 5.6a1 1 0 0 0-1.6-.8l-8.6 6.4a1 1 0 0 0 0 1.6l8.6 6.4a1 1 0 0 0 1.6-.8z', line: 'M6.2 5v14' },
  next: { fill: 'M5.5 5.6a1 1 0 0 1 1.6-.8l8.6 6.4a1 1 0 0 1 0 1.6l-8.6 6.4a1 1 0 0 1-1.6-.8z', line: 'M17.8 5v14' },
  loop: { line: 'M4.5 11a7.5 7.5 0 0 1 13.4-4.6M19.5 13a7.5 7.5 0 0 1-13.4 4.6M18.6 3v4h-4M5.4 21v-4h4' },
  check: { line: 'M6.5 12.5l3.8 3.8 7.4-8.6' },
  glass: { line: 'M6.5 3h11M6.5 21h11M8 3v3.2c0 2.2 4 3.6 4 5.8s-4 3.6-4 5.8V21M16 3v3.2c0 2.2-4 3.6-4 5.8s4 3.6 4 5.8V21' },
};

let win = null; // la ventanita abierta (o null)
let ui = null; // sus partes
let loop = 0;
let noticeTimer = 0;

const supported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window && !isNative();
const abs = (path) => new URL(path, document.baseURI).href;
export const pipOpen = () => !!win;

/** Un ícono SVG creado en el documento `doc` (la app o la ventanita). */
function icon(doc, spec, { box = 24, className = '' } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  for (const [kind, d] of Object.entries(typeof spec === 'string' ? { fill: spec } : spec)) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', kind === 'fill' ? 'i-fill' : 'i-line');
    svg.append(p);
  }
  return svg;
}

/** Crea un elemento en la ventanita. on<evento> agrega el evento; text va con textContent. */
function make(doc, tag, props = {}, ...kids) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids.filter(Boolean));
  return el;
}

/** Cambia el texto solo si cambió (así no se repinta 4 veces por segundo sin necesidad). */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function setLabel(el, text) {
  if (el.getAttribute('aria-label') !== text) {
    el.setAttribute('aria-label', text);
    el.title = text;
  }
}

// ---------------------------------------------------------------------
// El botón de la app (en Enfocar, arriba a la derecha del reloj)
// ---------------------------------------------------------------------
function renderButton() {
  const btn = $('#pinBtn');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(!!win));
  setLabel(btn, tr(win ? 'Quitar el reloj de encima' : 'Mantener el reloj encima de las otras ventanas'));
}

export function initPip() {
  const btn = $('#pinBtn');
  if (!btn || !supported()) {
    if (btn) btn.hidden = true;
    return;
  }
  btn.replaceChildren(
    icon(document, PIN, { box: 512, className: 'pin-btn__pin' }),
    icon(document, UNPIN, { box: 512, className: 'pin-btn__unpin' }),
  );
  btn.hidden = false;
  btn.addEventListener('click', togglePip);
  // Los avisos de la app también salen en la ventanita (por si la app está escondida)
  document.addEventListener('frostpom:toast', (e) => { if (win && e.detail && e.detail.text) notice(e.detail.text); });
  renderButton();
}

/** Abre o cierra la ventanita. Se llama con un clic (el navegador lo exige para abrirla). */
export async function togglePip() {
  if (win) {
    win.close(); // el resto lo hace onClose (pagehide)
    return;
  }
  try {
    const w = await window.documentPictureInPicture.requestWindow(SIZE);
    setup(w);
  } catch {
    toast('Tu navegador no dejó abrir la ventanita. Inténtalo otra vez.', 'warn');
  }
}

// ---------------------------------------------------------------------
// La ventanita
// ---------------------------------------------------------------------
function setup(w) {
  win = w;
  const d = w.document;
  d.title = 'FrostPom';
  d.documentElement.lang = document.documentElement.lang || 'es';
  d.documentElement.dataset.theme = document.documentElement.dataset.theme || '';
  d.head.append(
    make(d, 'meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
    make(d, 'link', { rel: 'stylesheet', href: abs('css/pip.css') }),
  );
  ui = build(d);
  d.body.append(ui.root);
  d.addEventListener('keydown', onKey);
  w.addEventListener('pagehide', onClose, { once: true });
  // La ventanita está a la vista: ella revisa el reloj (y el navegador no la frena)
  loop = w.setInterval(() => { tick(); render(); }, 250);
  document.documentElement.classList.add('pip-open');
  render();
  renderButton();
}

function onClose() {
  if (win && loop) win.clearInterval(loop);
  loop = 0;
  win = null;
  ui = null;
  document.documentElement.classList.remove('pip-open');
  renderButton();
}

function onKey(e) {
  const tag = (e.target && e.target.tagName) || '';
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || tag === 'BUTTON') return;
  e.preventDefault();
  act('toggle');
}

function build(d) {
  const btn = (name, spec, extra = '') => make(d, 'button', {
    type: 'button', class: `pip__btn${extra}`, 'data-act': name, onclick: () => act(name),
  }, ...(Array.isArray(spec) ? spec : [spec]));
  const parts = {};
  parts.title = make(d, 'h1', { class: 'pip__title' });
  parts.unpin = make(d, 'button', { type: 'button', class: 'pip__unpin', onclick: () => win && win.close() }, icon(d, UNPIN, { box: 512 }));
  setLabel(parts.unpin, tr('Quitar el reloj de encima'));
  parts.clock = make(d, 'p', { class: 'pip__clock', role: 'timer' });
  parts.sub = make(d, 'p', { class: 'pip__sub' });
  parts.pet = make(d, 'img', { class: 'pip__pet', alt: '', width: 48, height: 48, decoding: 'async', draggable: 'false' });
  parts.bar = make(d, 'div', { class: 'pip__bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': tr('Avance de la sesión') },
    make(d, 'span', { class: 'pip__fill' }), parts.pet);
  parts.done = make(d, 'span', { class: 'pip__done' });
  parts.total = make(d, 'span', { class: 'pip__total' });
  parts.toggle = btn('toggle', [icon(d, ICONS.play, { className: 'pip__play' }), icon(d, ICONS.pause, { className: 'pip__pause' })], ' pip__btn--main');
  parts.reset = btn('reset', icon(d, ICONS.prev));
  parts.auto = btn('auto', icon(d, ICONS.loop));
  parts.skip = btn('skip', icon(d, ICONS.next));
  parts.finish = btn('finish', icon(d, ICONS.check), ' pip__btn--round');
  parts.notice = make(d, 'p', { class: 'pip__notice', role: 'status', hidden: true });
  parts.bubble = make(d, 'p', { class: 'pip__bubble', 'aria-hidden': 'true' });
  parts.root = make(d, 'main', { class: 'pip' },
    make(d, 'div', { class: 'pip__scene', 'aria-hidden': 'true' }),
    parts.bubble,
    make(d, 'section', { class: 'pip__card' },
      make(d, 'header', { class: 'pip__head' }, icon(d, ICONS.glass, { className: 'pip__glass' }), parts.title, parts.unpin),
      parts.clock,
      parts.sub,
      parts.bar,
      make(d, 'div', { class: 'pip__times' }, parts.done, parts.total),
      make(d, 'div', { class: 'pip__controls' }, parts.toggle, parts.reset, parts.auto, parts.skip, parts.finish)),
    parts.notice);
  return parts;
}

/** Lo que hace cada botón: lo mismo que en Enfocar. */
function act(name) {
  if (name === 'toggle') startOrToggle();
  else if (name === 'reset') resetBlock();
  else if (name === 'skip') skipBlock();
  else if (name === 'finish') finishBlock();
  else if (name === 'auto') {
    const on = !state.settings.autoBreak;
    mutate((s) => { s.settings.autoBreak = on; s.settings.autoContinue = on; }); // el mismo ajuste de Ajustes
    notice(tr(on ? 'Lo siguiente empieza solo' : 'El reloj me espera'));
  }
  render();
}

/** Un aviso corto dentro de la ventanita (los de la app y los de sus botones). */
function notice(text) {
  if (!ui || !win) return;
  ui.notice.textContent = text;
  ui.notice.hidden = false;
  win.clearTimeout(noticeTimer);
  noticeTimer = win.setTimeout(() => { if (ui) ui.notice.hidden = true; }, 4000);
}

function subtitle(st) {
  if (st.status === 'paused') return 'En pausa';
  if (st.mode === 'study') return st.status === 'running' ? 'Hora de concentrarse' : 'Listo cuando tú lo estés';
  return st.status === 'running' ? 'Hora de descansar' : 'Tu descanso te espera';
}
function bubble(st) {
  if (st.status === 'paused') return 'Aquí te espero';
  if (st.status === 'idle') return '¿Empezamos?';
  return st.mode === 'study' ? '¡Estudiando juntos!' : '¡A descansar!';
}

function render() {
  if (!win || !ui) return;
  const st = session.state;
  const total = st.durationSec * 1000;
  const left = st.status === 'idle' ? total : U.clamp(session.remainingMs(), 0, total);
  const done = total - left;
  const frac = total ? done / total : 0;
  const root = ui.root;
  const lang = document.documentElement.lang || 'es'; // si cambias el idioma con la ventanita abierta
  if (win.document.documentElement.lang !== lang) win.document.documentElement.lang = lang;
  if (root.dataset.mode !== st.mode) root.dataset.mode = st.mode;
  if (root.dataset.status !== st.status) root.dataset.status = st.status;
  root.style.setProperty('--done', frac.toFixed(4));
  setText(ui.title, tr(st.mode === 'study' ? 'Modo enfoque' : st.mode === 'long' ? 'Descanso largo' : 'Descanso'));
  const clock = U.formatClock(Math.ceil(left / 1000));
  setText(ui.clock, clock);
  ui.clock.classList.toggle('is-long', clock.length > 5); // 1:00:00 necesita letra más pequeña
  setText(ui.sub, tr(subtitle(st)));
  setText(ui.bubble, tr(bubble(st)));
  setText(ui.done, U.formatClock(Math.floor(done / 1000)));
  setText(ui.total, U.formatClock(st.durationSec));
  ui.bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
  // Tu compañero va encima de la barra (o su tumba, si se murió de hambre)
  const petId = currentPetId(state);
  const src = abs(isDead(state, petId) ? 'assets/sprites/tumba.webp' : (companionSrc(petId) || 'assets/companions/pinguino.webp'));
  if (ui.pet.getAttribute('src') !== src) ui.pet.setAttribute('src', src);
  // Botones
  setLabel(ui.toggle, tr(st.status === 'running' ? 'Pausar' : st.status === 'paused' ? 'Continuar' : st.mode === 'study' ? 'Empezar a estudiar' : 'Empezar descanso'));
  setLabel(ui.reset, tr('Reiniciar'));
  setLabel(ui.skip, tr(st.mode === 'study' ? 'Saltar al descanso' : 'Saltar descanso'));
  setLabel(ui.finish, tr('Terminar y guardar'));
  const auto = !!state.settings.autoBreak;
  setLabel(ui.auto, tr(auto ? 'Lo siguiente empieza solo (encendido)' : 'Lo siguiente empieza solo (apagado)'));
  ui.auto.setAttribute('aria-pressed', String(auto));
  ui.reset.disabled = st.status === 'idle';
  ui.finish.disabled = st.mode !== 'study' || st.status === 'idle';
}
