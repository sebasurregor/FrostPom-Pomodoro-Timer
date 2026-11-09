/*
 * FrostPom — vista Ajustes: cuenta, región, sonido, recordatorios, temporizador,
 * límite saludable, ranking y guardado automático.
 * Ya no hay copias manuales ni "borrar todo": el progreso se guarda solo, y cada temporada
 * (season.js) archiva lo viejo. Solo queda "Eliminar mi cuenta", que exigen Apple y Google.
 */
import * as U from '../util.js';
import * as C from '../catalog.js';
import { config } from '../config.js';
import { pic } from './pics.js';
import * as FX from './effects.js';
import { $, $$, h } from './dom.js';
import { toast } from './feedback.js';
import { onBoardToggle } from './board-ui.js';
import { renderCloudSettings, onCloudButton } from './cloud-ui.js';
import { renderSound } from './sound.js';
import { renderReminders } from './reminders.js';
import { updatePhase } from './hud.js';
import { wakeLock } from './focus.js';
import { changePasswordFlow, logout, deleteAccountFlow, rememberDevice, forgetDevice, isRemembered, emailFlow, removeEmailFlow } from './account.js';
import * as CLOUD from '../cloud.js';
import { state, store, mutate, today, session, lastSavedAt } from './context.js';
import { t, tr, lang, setLang } from '../i18n.js';
import { notificationPermission } from '../native.js';
import { isNative, enableFromSettings } from './native-ui.js';

export function renderSettings() {
  renderSound();
  renderReminders();
  const reg = $('#setRegion');
  if (!reg.options.length) reg.append(...C.REGIONS.map((r) => h('option', { value: r.id, text: r.name })));
  reg.value = state.settings.timeZone || '';
  $('#accStatus').textContent = state.account ? t('Tu usuario es {name}.', { name: state.account.username }) : tr('Aún no tienes cuenta. Créala para proteger tu progreso con contraseña.');
  $('#setTheme').value = state.settings.theme || 'auto';
  $('#accPassLabel').textContent = tr(state.account ? 'Cambiar contraseña' : 'Crear cuenta');
  const mail = state.account && state.account.email;
  $('#accMailRow').hidden = !state.account || !CLOUD.isConfigured();
  $('#accMailText').textContent = mail ? CLOUD.maskEmail(mail) : tr('Sin correo: si olvidas la contraseña no podrás recuperarla.');
  $('#accMailBtn').textContent = tr(mail ? 'Cambiar correo' : 'Agregar correo');
  $('#accMailRemove').hidden = !mail;
  renderCloudSettings(); // cuenta en línea (v4.0): conectar, salir de este equipo…
  $('#accLogoutBtn').hidden = !state.account;
  $('#rememberRow').hidden = !state.account;
  $('#setRemember').checked = isRemembered();
  const s = state.settings;
  for (const [id, key] of TOGGLES) $(id).checked = s[key];
  $(s.autoBreak ? '#afterStudyAuto' : '#afterStudyWait').checked = true;
  $('#capValue').textContent = U.formatMinutes(s.dailyCapMin);
  $('#setAwake').disabled = !('wakeLock' in navigator);

  const nb = $('#notifBtn');
  if (isNative()) {
    renderNativeNotif(nb); // app de Android: el permiso del teléfono (v4.1)
  } else {
    const notice = !('Notification' in window) ? 'Notificaciones no disponibles'
      : Notification.permission === 'granted' ? 'Notificaciones activadas'
        : Notification.permission === 'denied' ? 'Notificaciones bloqueadas en el navegador' : null;
    if (notice) {
      nb.disabled = true;
      nb.textContent = tr(notice);
    }
  }

  renderSaveStatus();
  $('#appVersion').textContent = t('versión {v}', { v: config.version });
}

/** Estado del guardado automático y de la temporada actual. */
function renderSaveStatus() {
  const at = lastSavedAt();
  const status = $('#saveStatus');
  status.classList.toggle('is-off', !store.persistent);
  const text = !store.persistent
    ? '⚠️ Este navegador no deja guardar (¿modo privado?).'
    : at ? t('Guardado automático activo. Último guardado: hoy a las {time}.', { time: `${U.pad2(at.getHours())}:${U.pad2(at.getMinutes())}` }) : 'Guardado automático activo.';
  status.replaceChildren(store.persistent ? pic('check', 22) : '', h('span', { text }));
}

/** Interruptores que guardan un ajuste booleano, y qué hacer después (opcional). */
const TOGGLES = [
  ['#setAuto', 'autoContinue'],
  ['#setSound', 'sound', (on) => { if (on) { FX.setPrefs({ sound: true }); FX.sfx.start(); } }],
  ['#setVibrate', 'vibrate', (on) => { if (on) FX.buzz(40); }],
  ['#setAwake', 'keepAwake', (on) => wakeLock(on && session.running)],
  ['#setMotion', 'reduceMotion'],
  ['#setBoard', 'leaderboardOn', (on) => onBoardToggle(on).then(renderSettings)],
];

function changeCap(delta) {
  const next = U.clamp(state.settings.dailyCapMin + delta, 60, 600);
  if (next !== state.settings.dailyCapMin) mutate((s) => { s.settings.dailyCapMin = next; });
}

/** App de Android: el botón muestra el permiso del teléfono. */
async function renderNativeNotif(nb) {
  const perm = await notificationPermission();
  const notice = perm === 'granted' ? 'Notificaciones activadas'
    : perm === 'denied' ? 'Notificaciones bloqueadas: actívalas en los ajustes del teléfono'
      : perm === 'unavailable' ? 'Notificaciones no disponibles' : null;
  nb.disabled = !!notice;
  nb.textContent = tr(notice || 'Activar notificaciones');
}

async function enableNotifications() {
  if (isNative()) {
    const perm = await enableFromSettings();
    toast(perm === 'granted' ? 'Listo: te avisaremos aunque la app esté en segundo plano.' : 'No se activaron las notificaciones.', perm === 'granted' ? 'good' : 'warn');
    renderSettings();
    return;
  }
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
  $$('input[name="afterStudy"]').forEach((r) => r.addEventListener('change', (e) => {
    if (!e.target.checked) return;
    const auto = e.target.value === 'auto';
    mutate((s) => { s.settings.autoBreak = auto; });
    toast(auto ? 'Al terminar de estudiar, el descanso empezará solo.' : 'Al terminar de estudiar, el reloj te esperará para empezar el descanso.', 'good');
  }));
  $('#setRemember').addEventListener('change', async (e) => {
    if (e.target.checked) {
      if (await rememberDevice()) toast('Listo: no te pediremos la contraseña en este dispositivo.', 'good');
    } else {
      forgetDevice();
      toast('La próxima vez que abras FrostPom te pediremos la contraseña.');
    }
    renderSettings();
  });
  $('#accPassBtn').addEventListener('click', changePasswordFlow);
  $('#accLogoutBtn').addEventListener('click', logout);
  $('#accDeleteBtn').addEventListener('click', deleteAccountFlow);
  $('#setTheme').addEventListener('change', (e) => mutate((s) => { s.settings.theme = e.target.value; }));
  $('#setLang').value = lang;
  $('#setLang').addEventListener('change', (e) => setLang(e.target.value));
  $('#accMailBtn').addEventListener('click', emailFlow);
  $('#accMailRemove').addEventListener('click', removeEmailFlow);
  $('#accCloudBtn').addEventListener('click', onCloudButton);
  document.addEventListener('frostpom:cloud', renderCloudSettings);
}
