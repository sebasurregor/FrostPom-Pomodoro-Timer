/*
 * FrostPom — tienda de comida dentro de Enfocar.
 * Un ícono junto al compañero del reloj abre una bandeja. La comida se ARRASTRA hasta la
 * mascota con el mouse o con el dedo (Pointer Events: funciona igual en computador y celular).
 * Con el teclado (Tab + Enter) la comida se le da directamente, para que nadie se quede por
 * fuera. Las reglas (precios, favoritas, barriguita) viven en pet.js; el cobro, en engine.feedPet.
 */
import * as E from '../engine.js';
import * as P from '../pet.js';
import * as FX from './effects.js';
import { $, h, fmtInt } from './dom.js';
import { toast, openDialog } from './feedback.js';
import { say } from './companions.js';
import { state, mutate } from './context.js';
import { setEating, EATING_MS, buddySays } from './focus.js';
import { pic } from './pics.js';
import { t, tr } from '../i18n.js';

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

/** Cómo se llama la mascota en los textos: su nombre, o "tu pingüino", "tu oso polar"… */
export function petLabel(petId = P.currentPetId(state)) {
  return P.petName(state, petId) || (petId === 'pinguino' ? tr('tu pingüino') : t('tu {pet}', { pet: P.PETS[petId].name.toLowerCase() }));
}

/** Ícono de la tienda: avisa con un "!" cuando la mascota tiene mucha hambre (o se murió). */
export function renderShopBtn() {
  const st = P.petStatus(state, P.currentPetId(state));
  const hungry = st.dead || st.fullness < 25;
  $('#shopHungry').hidden = !hungry;
  $('#shopBtn').classList.toggle('is-hungry', hungry);
  const label = st.dead ? t('Tienda: {pet} se murió de hambre. Revívelo con gemas', { pet: petLabel() }) : tr('Tienda: dale de comer a tu compañero');
  $('#shopBtn').setAttribute('aria-label', label);
  $('#shopBtn').title = label;
  if (trayOpen()) renderTray();
}

/** Cuánto le falta para morirse, en palabras ("2 días", "5 horas"). */
function timeLeft(hours) {
  const h = Math.max(1, Math.ceil(hours));
  const hrs = (n) => (n === 1 ? tr('1 hora') : t('{n} horas', { n }));
  if (h < 24) return hrs(h);
  const d = Math.floor(h / 24);
  const days = d === 1 ? tr('1 día') : t('{n} días', { n: d });
  return h % 24 ? t('{days} y {hours}', { days, hours: hrs(h % 24) }) : days;
}

export function renderTray() {
  const petId = P.currentPetId(state);
  const st = P.petStatus(state, petId);
  const full = st.fullness;
  const pct = Math.round(full);
  const m = P.mood(full, st);
  const isFull = full >= P.FULL_AT;
  const label = petLabel(petId);
  $('#h-tray').textContent = st.dead ? t('Revive a {pet}', { pet: label }) : t('Dale de comer a {pet}', { pet: label });
  $('#trayNameBtn').setAttribute('aria-label', P.petName(state, petId) ? tr('Cambiar el nombre de tu compañero') : tr('Ponle nombre a tu compañero'));
  $('#trayPct').textContent = `${pct} %`;
  $('#trayFill').style.setProperty('--p', `${pct}%`);
  $('#trayMeter').setAttribute('aria-valuenow', String(pct));
  $('#trayMeter').setAttribute('aria-valuetext', `${pct} %: ${m.label}`);
  $('#trayMeter').dataset.mood = m.id;
  $('#trayGems').textContent = fmtInt(state.progress.gems);
  // Se murió: la tumba y el botón para revivirlo (la comida no se muestra)
  $('#trayRevive').hidden = !st.dead;
  $('#trayFoods').hidden = st.dead;
  if (st.dead) {
    const missing = P.REVIVE_COST - state.progress.gems;
    $('#trayHint').textContent = `${m.emoji} ${t('{pet} se murió porque pasó 3 días sin comer.', { pet: capital(label) })}`;
    $('#reviveCost').textContent = String(P.REVIVE_COST);
    $('#reviveBtn').disabled = missing > 0;
    $('#reviveNote').textContent = missing > 0
      ? t('Te faltan {n} gemas. Las ganas estudiando y con las misiones.', { n: missing })
      : t('Vuelve con la barriguita a la mitad ({n} %).', { n: P.REVIVE_FULLNESS });
    $('#trayFoods').replaceChildren();
    return;
  }
  $('#trayHint').textContent = isFull
    ? `${m.emoji} ${tr('¡Está lleno!')}`
    : st.hoursLeft !== undefined
      ? `${m.emoji} ${t('¡Su barriguita está vacía! Si no come en {time}, se muere.', { time: timeLeft(st.hoursLeft) })}`
      : tr('Arrástrala hasta tu compañero. ★ = favorita.');
  $('#trayFoods').replaceChildren(...P.FOODS.map((f) => {
    const fav = P.isFavorite(petId, f.id);
    const missing = f.cost - state.progress.gems;
    const can = !isFull && missing <= 0;
    const why = isFull ? tr('está lleno') : missing > 0 ? t('te faltan {n} gemas', { n: missing }) : t('{cost} gemas, +{fill} barriguita', { cost: f.cost, fill: P.fillFor(petId, f.id) }) + (fav ? tr(', su favorita') : '');
    return h('li', {},
      h('button', {
        type: 'button', class: `tray-food${fav ? ' is-fav' : ''}`, 'data-food': f.id, disabled: !can,
        'aria-label': t('Darle {food}: {why}', { food: f.name, why }), title: `${f.name}: ${why}`,
      },
      fav ? h('span', { class: 'tray-food__fav', 'aria-hidden': 'true', text: '★' }) : null,
      h('img', { class: 'tray-food__img', src: f.img, alt: '', width: '52', height: '52', draggable: 'false', decoding: 'async' }),
      h('span', { class: 'tray-food__price', 'aria-hidden': 'true' }, String(f.cost), pic('gema', 14))));
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

const capital = (txt) => (txt ? txt[0].toLocaleUpperCase() + txt.slice(1) : txt);

function feed(foodId) {
  const res = mutate((s) => E.feedPet(s, foodId));
  if (res.ok) setEating(EATING_MS); // corazones en bucle (dos vueltas completas)
  else {
    const why = { full: 'Tu compañero ya está lleno. Vuelve más tarde.', dead: 'Tu compañero se murió de hambre. Primero revívelo.' };
    toast(why[res.reason] || 'No te alcanzan las gemas. Las ganas estudiando y con las misiones.', 'warn');
  }
}

/** (v4.2) Revivir a la mascota con gemas. */
function revive() {
  const res = mutate((s) => E.revivePet(s));
  if (!res.ok) {
    if (res.reason === 'gems') toast('No te alcanzan las gemas. Las ganas estudiando y con las misiones.', 'warn');
    return;
  }
  setEating(EATING_MS); // vuelve feliz, con corazones
  const first = $('#trayFoods .tray-food:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

/** (v4.2) Ponerle nombre a la mascota: aparece en una etiqueta encima de su cabeza. */
export async function nameFlow() {
  const petId = P.currentPetId(state);
  const id = 'petNameInput';
  const input = h('input', {
    type: 'text', id, name: 'petName', class: 'acc-input acc-input--pet', maxlength: String(P.NAME_MAX + 4),
    autocomplete: 'off', spellcheck: 'false', value: P.petName(state, petId), placeholder: tr('Por ejemplo: Copito'),
  });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const preview = h('span', { class: 'nametag nametag--preview', 'aria-hidden': 'true' });
  const showPreview = () => {
    const c = P.checkPetName(input.value);
    preview.textContent = c.ok && c.value ? c.value : input.value.trim() || '…';
  };
  input.addEventListener('input', () => { err.textContent = ''; showPreview(); });
  showPreview();
  let value = '';
  const res = await openDialog({
    title: 'Ponle nombre a tu compañero',
    body: [
      h('p', { class: 'dlg__text', text: t('Aparece en una etiqueta encima de {pet}. Solo lo ves tú.', { pet: petLabel(petId) }) }),
      h('div', { class: 'name-preview' }, preview),
      h('div', { class: 'field' }, h('label', { for: id, text: 'Nombre (máximo 16 caracteres)' }), input, err),
    ],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      ...(P.petName(state, petId) ? [{ label: 'Quitar nombre', value: 'clear' }] : []),
      { label: 'Guardar', value: 'ok', variant: 'btn--gold', primary: true, validate: () => {
        const c = P.checkPetName(input.value);
        if (!c.ok) { err.textContent = c.reason; input.focus(); return false; }
        value = c.value;
        return true;
      } },
    ],
    onOpen: () => { input.focus(); input.select(); },
  });
  if (res !== 'ok' && res !== 'clear') return;
  const r = mutate((s) => E.namePet(s, res === 'clear' ? '' : value));
  if (r.ok && r.name) {
    toast(t('¡Ahora se llama {name}!', { name: r.name }), 'good', { icon: '🏷️' });
    buddySays();
  }
}

export function bindFeeding() {
  $('#shopBtn').addEventListener('click', toggleTray);
  $('#trayClose').addEventListener('click', () => { closeTray(); $('#shopBtn').focus(); });
  $('#trayNameBtn').addEventListener('click', nameFlow);
  $('#reviveBtn').addEventListener('click', revive);
  // Tocar la tumba abre la tienda (ahí se revive); tocar al compañero lo hace hablar
  $('#buddy').addEventListener('click', () => {
    if (P.isDead(state, P.currentPetId(state))) openTray();
    else buddySays();
  });
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
