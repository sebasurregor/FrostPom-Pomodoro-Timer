/*
 * StudyTimer — tienda de comida dentro de Enfocar.
 * Un ícono junto al compañero del reloj abre una bandeja. La comida se ARRASTRA hasta la
 * mascota con el mouse o con el dedo (Pointer Events: funciona igual en computador y celular).
 * Con el teclado (Tab + Enter) la comida se le da directamente, para que nadie se quede por
 * fuera. Las reglas (precios, favoritas, barriguita) viven en pet.js; el cobro, en engine.feedPet.
 */
import * as E from '../engine.js';
import * as P from '../pet.js';
import * as FX from './effects.js';
import { $, h, fmtInt } from './dom.js';
import { toast } from './feedback.js';
import { say } from './companions.js';
import { state, mutate } from './context.js';
import { setEating } from './focus.js';

const tray = () => $('#foodTray');
export const trayOpen = () => !tray().hidden;

export function openTray() {
  tray().hidden = false;
  $('#shopBtn').setAttribute('aria-expanded', 'true');
  renderTray();
  const first = $('#trayFoods .tray-food:not([disabled])');
  if (first) first.focus({ preventScroll: true });
  requestAnimationFrame(showPetAboveTray);
}
/** Que se vean la mascota y la bandeja a la vez (en el celular la bandeja flota abajo). */
function showPetAboveTray() {
  const pet = $('#buddy').getBoundingClientRect();
  const css = getComputedStyle(tray());
  const behavior = FX.motionOff() ? 'auto' : 'smooth';
  if (css.position === 'fixed') {
    const hud = $('.hud').getBoundingClientRect().bottom;
    // Arriba final de la bandeja (sin contar su animación de entrada)
    const top = innerHeight - parseFloat(css.bottom) - tray().offsetHeight;
    const want = top - 20; // el borde de abajo de la mascota, un poco arriba de la bandeja
    if (pet.bottom > want || pet.top < hud + 8) window.scrollBy({ top: pet.bottom - want, behavior });
  } else if (pet.top < 0 || pet.bottom > innerHeight) {
    $('#buddy').scrollIntoView({ block: 'center', behavior });
  }
}

export function closeTray() {
  tray().hidden = true;
  $('#shopBtn').setAttribute('aria-expanded', 'false');
}
const toggleTray = () => (trayOpen() ? closeTray() : openTray());

/** Ícono de la tienda: avisa con un "!" cuando la mascota tiene mucha hambre. */
export function renderShopBtn() {
  const hungry = P.fullness(state, P.currentPetId(state)) < 25;
  $('#shopHungry').hidden = !hungry;
  $('#shopBtn').classList.toggle('is-hungry', hungry);
  if (trayOpen()) renderTray();
}

export function renderTray() {
  const petId = P.currentPetId(state);
  const pet = P.PETS[petId];
  const full = P.fullness(state, petId);
  const pct = Math.round(full);
  const m = P.mood(full);
  const isFull = full >= P.FULL_AT;
  $('#trayPetName').textContent = state.profile.companion ? `tu ${pet.name.toLowerCase()}` : 'tu pingüino';
  $('#trayPct').textContent = `${pct} %`;
  $('#trayFill').style.setProperty('--p', `${pct}%`);
  $('#trayMeter').setAttribute('aria-valuenow', String(pct));
  $('#trayMeter').setAttribute('aria-valuetext', `${pct} %: ${m.label}`);
  $('#trayMeter').dataset.mood = m.id;
  $('#trayGems').textContent = fmtInt(state.progress.gems);
  $('#trayHint').textContent = isFull
    ? `${m.emoji} ¡Está lleno! Vuelve cuando le dé hambre otra vez.`
    : 'Arrastra una comida hasta tu compañero (con el mouse o con el dedo). ★ = su favorita.';
  $('#trayFoods').replaceChildren(...P.FOODS.map((f) => {
    const fav = P.isFavorite(petId, f.id);
    const missing = f.cost - state.progress.gems;
    const can = !isFull && missing <= 0;
    const why = isFull ? 'está lleno' : missing > 0 ? `te faltan ${missing} gemas` : `${f.cost} gemas, +${P.fillFor(petId, f.id)} barriguita${fav ? ', su favorita' : ''}`;
    return h('li', {},
      h('button', {
        type: 'button', class: `tray-food${fav ? ' is-fav' : ''}`, 'data-food': f.id, disabled: !can,
        'aria-label': `Darle ${f.name}: ${why}`, title: `${f.name}: ${why}`,
      },
      fav ? h('span', { class: 'tray-food__fav', 'aria-hidden': 'true', text: '★' }) : null,
      h('img', { class: 'tray-food__img', src: f.img, alt: '', width: '52', height: '52', draggable: 'false', decoding: 'async' }),
      h('span', { class: 'tray-food__price', 'aria-hidden': 'true', text: `${f.cost} 💎` })));
  }));
}

// ---------------------------------------------------------------------
// Arrastrar y soltar (mouse, dedo o lápiz)
// ---------------------------------------------------------------------
let drag = null;
const DRAG_START_PX = 6;

/** ¿El puntero está sobre la mascota? (con un margen generoso para los dedos) */
function overPet(x, y) {
  const r = $('#buddy').getBoundingClientRect();
  const pad = 34;
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function onDown(e) {
  const btn = e.target.closest('.tray-food');
  if (!btn || btn.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); // sin selección de texto ni el "arrastrar imagen" del navegador
  drag = { id: btn.dataset.food, btn, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
  btn.setPointerCapture(e.pointerId);
}

function onMove(e) {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START_PX) return;
    drag.moved = true;
    const img = $('img', drag.btn);
    const r = img.getBoundingClientRect();
    drag.home = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    drag.ghost = h('img', { class: 'food-ghost', src: img.src, alt: '', 'aria-hidden': 'true', draggable: 'false' });
    document.body.append(drag.ghost);
    drag.btn.classList.add('is-dragging');
    $('#buddy').classList.add('is-waiting');
    document.documentElement.classList.add('is-feeding');
  }
  drag.ghost.style.setProperty('--x', `${e.clientX}px`);
  drag.ghost.style.setProperty('--y', `${e.clientY}px`);
  const over = overPet(e.clientX, e.clientY);
  if (over !== drag.over) {
    drag.over = over;
    $('#buddy').classList.toggle('is-target', over);
    if (over) say($('#buddy'), '¿Ñam?', { ms: 900 });
  }
}

function onUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) return; // fue un toque: lo maneja onClick
  d.btn.dataset.dragged = '1'; // el "click" que llega después de soltar no cuenta
  setTimeout(() => { delete d.btn.dataset.dragged; }, 0);
  d.btn.classList.remove('is-dragging');
  $('#buddy').classList.remove('is-waiting', 'is-target');
  document.documentElement.classList.remove('is-feeding');
  const dropped = e.type === 'pointerup' && overPet(e.clientX, e.clientY);
  if (dropped) {
    const r = $('#buddy').getBoundingClientRect();
    flyGhost(d.ghost, r.left + r.width / 2, r.top + r.height * 0.45, true);
    feed(d.id);
  } else {
    flyGhost(d.ghost, d.home.x, d.home.y, false);
  }
}

/** La comida vuela a la boca de la mascota (y se encoge) o vuelve a su lugar. */
function flyGhost(ghost, x, y, eaten) {
  if (!ghost) return;
  if (FX.motionOff()) { ghost.remove(); return; }
  ghost.classList.add(eaten ? 'is-eaten' : 'is-back');
  ghost.style.setProperty('--x', `${x}px`);
  ghost.style.setProperty('--y', `${y}px`);
  setTimeout(() => ghost.remove(), 320);
}

/** Toque sin arrastrar: le enseña a arrastrar. Teclado (Enter/Espacio): le da la comida. */
function onClick(e) {
  const btn = e.target.closest('.tray-food');
  if (!btn || btn.disabled || btn.dataset.dragged) return;
  if (e.detail === 0) { feed(btn.dataset.food); return; } // activado con el teclado
  say($('#buddy'), '¡Arrástrala hasta mí!', { ms: 1800 });
  $('#buddy').classList.remove('is-hint');
  void $('#buddy').offsetWidth;
  $('#buddy').classList.add('is-hint');
}

function feed(foodId) {
  setEating(2200);
  const res = mutate((s) => E.feedPet(s, foodId));
  if (!res.ok) {
    setEating(0);
    toast(res.reason === 'full' ? 'Tu compañero ya está lleno. Vuelve más tarde.' : 'No te alcanzan las gemas. Las ganas estudiando y con las misiones.', 'warn');
  }
}

export function bindFeeding() {
  $('#shopBtn').addEventListener('click', toggleTray);
  $('#trayClose').addEventListener('click', () => { closeTray(); $('#shopBtn').focus(); });
  const list = $('#trayFoods');
  list.addEventListener('pointerdown', onDown);
  list.addEventListener('pointermove', onMove);
  list.addEventListener('pointerup', onUp);
  list.addEventListener('pointercancel', onUp);
  list.addEventListener('click', onClick);
  list.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trayOpen() && !document.querySelector('dialog[open]')) { closeTray(); $('#shopBtn').focus(); }
  });
}
