/*
 * StudyTimer — vista Ajustes: cuenta, región, sonido, recordatorios, temporizador,
 * límite saludable, ranking y guardado automático.
 * Ya no hay copias manuales ni "borrar todo": el progreso se guarda solo, y cada temporada
 * (season.js) archiva lo viejo. Solo queda "Eliminar mi cuenta", que exigen Apple y Google.
 */
import * as U from '../util.js';
import * as C from '../catalog.js';
import { config } from '../config.js';
import { seasonFor, daysLeft } from '../season.js';
import * as FX from './effects.js';
import { $, $$, h } from './dom.js';
import { toast } from './feedback.js';
import { renderSound } from './sound.js';
import { renderReminders } from './reminders.js';
import { updatePhase } from './hud.js';
import { wakeLock } from './focus.js';
import { changePasswordFlow, logout, deleteAccountFlow } from './account.js';
import { state, store, mutate, today, session, lastSavedAt } from './context.js';

export function renderSettings() {
  renderSound();
  renderReminders();
  const reg = $('#setRegion');
  if (!reg.options.length) reg.append(...C.REGIONS.map((r) => h('option', { value: r.id, text: r.name })));
  reg.value = state.settings.timeZone || '';
  $('#accStatus').textContent = state.account ? `Tu usuario es ${state.account.username}.` : 'Aún no tienes cuenta. Créala para proteger tu progreso con contraseña.';
  $('#accPassBtn').textContent = state.account ? 'Cambiar contraseña' : 'Crear cuenta';
  $('#accLogoutBtn').hidden = !state.account;
  const s = state.settings;
  for (const [id, key] of TOGGLES) $(id).checked = s[key];
  $('#capValue').textContent = U.formatMinutes(s.dailyCapMin);
  $('#setAwake').disabled = !('wakeLock' in navigator);

  const nb = $('#notifBtn');
  const notice = !('Notification' in window) ? 'Notificaciones no disponibles'
    : Notification.permission === 'granted' ? 'Notificaciones activadas'
      : Notification.permission === 'denied' ? 'Notificaciones bloqueadas en el navegador' : null;
  if (notice) {
    nb.disabled = true;
    nb.textContent = notice;
  }

  renderSaveStatus();
  $('#appVersion').textContent = `versión ${config.version}`;
}

/** Estado del guardado automático y de la temporada actual. */
function renderSaveStatus() {
  const at = lastSavedAt();
  const status = $('#saveStatus');
  status.classList.toggle('is-off', !store.persistent);
  status.textContent = !store.persistent
    ? '⚠️ Este navegador no deja guardar (¿modo privado?). Lo que hagas se perderá al cerrar.'
    : at ? `✅ Guardado automático activo. Último guardado: hoy a las ${U.pad2(at.getHours())}:${U.pad2(at.getMinutes())}.` : '✅ Guardado automático activo.';
  $('#storageNote').textContent = 'Cada minuto que estudias se guarda solo, al instante, en este dispositivo. Al terminar el día, su total queda en tu calendario. No tienes que guardar nada a mano.';
  const season = seasonFor(new Date(), config.season.months);
  const left = daysLeft(season, today());
  $('#seasonNote').textContent = `${season.name}: quedan ${U.plural(left, 'día', 'días')}. Al empezar la siguiente, tu rango vuelve a Bronce III, ganas gemas según el rango que alcances y el historial detallado de sesiones se borra (el calendario, los logros, los compañeros y los temas se quedan).`;
}

/** Interruptores que guardan un ajuste booleano, y qué hacer después (opcional). */
const TOGGLES = [
  ['#setAuto', 'autoContinue'],
  ['#setSound', 'sound', (on) => { if (on) { FX.setPrefs({ sound: true }); FX.sfx.start(); } }],
  ['#setVibrate', 'vibrate', (on) => { if (on) FX.buzz(40); }],
  ['#setAwake', 'keepAwake', (on) => wakeLock(on && session.running)],
  ['#setMotion', 'reduceMotion'],
  ['#setBoard', 'leaderboardOn'],
];

function changeCap(delta) {
  const next = U.clamp(state.settings.dailyCapMin + delta, 60, 600);
  if (next !== state.settings.dailyCapMin) mutate((s) => { s.settings.dailyCapMin = next; });
}

async function enableNotifications() {
  try {
    const perm = await Notification.requestPermission();
    toast(perm === 'granted' ? 'Listo: te avisaremos aunque la app esté en segundo plano.' : 'No se activaron las notificaciones.', perm === 'granted' ? 'good' : 'warn');
  } catch {
    toast('Este navegador no permitió activar notificaciones.', 'warn');
  }
  renderSettings();
}

export function bindSettings() {
  for (const [id, key, after] of TOGGLES) {
    $(id).addEventListener('change', (e) => {
      mutate((s) => { s.settings[key] = e.target.checked; });
      if (after) after(e.target.checked);
    });
  }
  $$('#capStepper .stepper__btn').forEach((b) => b.addEventListener('click', () => changeCap(Number(b.dataset.cap))));
  $('#notifBtn').addEventListener('click', enableNotifications);
  $('#setRegion').addEventListener('change', (e) => {
    mutate((s) => { s.settings.timeZone = e.target.value; });
    updatePhase();
  });
  $('#accPassBtn').addEventListener('click', changePasswordFlow);
  $('#accLogoutBtn').addEventListener('click', logout);
  $('#accDeleteBtn').addEventListener('click', deleteAccountFlow);
}
