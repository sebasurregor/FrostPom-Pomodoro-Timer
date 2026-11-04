/*
 * FrostPom — recordatorios de enfoque (Premium). En la web solo suenan con la app
 * abierta o instalada; en la app nativa serán notificaciones locales.
 */
import * as U from '../util.js';
import * as FX from './effects.js';
import { $, h } from './dom.js';
import { toast, notify } from './feedback.js';
import { state, store, mutate, today, session, isPremium } from './context.js';
import { premiumDialog } from './premium.js';

const DAYS = [['L', 1, 'lunes'], ['M', 2, 'martes'], ['X', 3, 'miércoles'], ['J', 4, 'jueves'], ['V', 5, 'viernes'], ['S', 6, 'sábado'], ['D', 0, 'domingo']];

function toggleDay(d) {
  mutate((st) => {
    const set = new Set(st.settings.reminders.days);
    if (set.has(d)) set.delete(d); else set.add(d);
    st.settings.reminders.days = [...set].sort();
  });
}

export function renderReminders() {
  const r = state.settings.reminders;
  const prem = isPremium();
  $('#remOn').checked = prem && r.on;
  $('#remTime').value = r.time;
  $('#remTime').disabled = !prem;
  $('#remNote').textContent = prem ? 'Suena con la app abierta o instalada. En la app del teléfono llegará como notificación.' : 'Función Premium 👑. Toca para conocerla.';
  $('#remDays').replaceChildren(...DAYS.map(([lab, d, name]) => h('button', {
    type: 'button', class: `day-chip${r.days.includes(d) ? ' is-on' : ''}`, 'aria-pressed': String(r.days.includes(d)), 'aria-label': name, disabled: !prem,
    onclick: () => toggleDay(d),
  }, lab)));
}

async function toggleReminders(e) {
  const want = e.target.checked;
  if (!isPremium()) { e.target.checked = false; premiumDialog(); return; }
  if (want && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* sin permiso */ }
  }
  mutate((st) => { st.settings.reminders.on = want; });
  if (want) toast(`Te recordaremos a las ${state.settings.reminders.time}.`, 'good', { icon: '⏰' });
}

/** Se llama cada 20 s: avisa una sola vez en el minuto elegido (aunque haya varias pestañas). */
export function checkReminder() {
  const r = state.settings.reminders;
  if (!isPremium() || !r.on) return;
  const now = new Date();
  const hm = `${U.pad2(now.getHours())}:${U.pad2(now.getMinutes())}`;
  if (hm !== r.time || !r.days.includes(now.getDay())) return;
  const stamp = `${today()} ${hm}`;
  if (store.pref.get('reminder_last') === stamp) return;
  store.pref.set('reminder_last', stamp);
  if (session.running) return;
  FX.sfx.unlock();
  FX.sfx.start();
  notify('Hora de enfocarte', 'Tu sesión de estudio te espera. ¡Vamos, el polo cuenta contigo!');
}

export function bindReminders() {
  $('#remOn').addEventListener('change', toggleReminders);
  $('#remTime').addEventListener('change', (e) => { if (/^\d{2}:\d{2}$/.test(e.target.value)) mutate((st) => { st.settings.reminders.time = e.target.value; }); });
}
