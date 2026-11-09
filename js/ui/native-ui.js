/*
 * FrostPom — lo que la app hace distinto dentro de Android (v4.1). En la web no hace nada.
 *
 *  - Botón "atrás": cierra lo que esté abierto (lista de países, tienda, ventana) o vuelve a
 *    Enfocar; si ya estás en Enfocar, la app pasa a segundo plano (el pomodoro sigue contando).
 *  - Si sales de la app con un bloque corriendo, el teléfono programa el aviso del final (en
 *    segundo plano el código de la app se detiene). Al volver, el aviso se cancela.
 *  - Los recordatorios (Premium) los programa el teléfono, así llegan con la app cerrada.
 *  - La vibración usa el motor del teléfono.
 */
import * as N from '../native.js';
import { $ } from './dom.js';
import { dlg } from './feedback.js';
import { state, store, session, isPremium } from './context.js';
import { closeTray, trayOpen } from './feeding.js';
import { tr } from '../i18n.js';

export const isNative = N.isNative;

// ---------------------------------------------------------------------
// Botón atrás
// ---------------------------------------------------------------------
export function handleBack() {
  // 1. La lista de países abierta (dentro de "Crea tu cuenta" o de Perfil)
  const picker = document.querySelector('input[aria-expanded="true"][aria-controls$="-list"]');
  if (picker) {
    picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return true;
  }
  // 2. Una ventana: la flecha de volver si la tiene; si no, como la tecla Escape
  if (dlg.open) {
    const back = document.getElementById('dlgBack');
    if (back) { back.click(); return true; }
    const ev = new Event('cancel', { cancelable: true });
    dlg.dispatchEvent(ev);
    if (ev.defaultPrevented) return false; // ventana obligatoria (entrar, crear cuenta): la app se minimiza
    dlg.close('cancel');
    return true;
  }
  // 3. La tienda de comida
  if (trayOpen()) { closeTray(); return true; }
  // 4. Otra pantalla: Ajustes vuelve a Perfil; las demás, a Enfocar
  const route = document.body.dataset.route;
  if (route && route !== 'enfocar') {
    location.hash = route === 'ajustes' ? '#/perfil' : '#/enfocar';
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Aviso del final del bloque cuando sales de la app
// ---------------------------------------------------------------------
function timerTexts() {
  return session.state.mode === 'study'
    ? { title: tr('¡Sesión completa!'), body: tr('Vuelve a FrostPom para guardar tu sesión y ganar tu XP.') }
    : { title: tr('Descanso terminado'), body: tr('Cuando quieras, empieza otra sesión.') };
}

export async function onAppActive(active) {
  if (active) return N.cancelTimerEnd();
  if (!session.running) return undefined;
  const remaining = session.remainingMs();
  if (!(remaining > 2000)) return undefined;
  return N.scheduleTimerEnd({ at: Date.now() + remaining, ...timerTexts() });
}

// ---------------------------------------------------------------------
// Permiso de notificaciones (Android 13 o superior lo pide con una ventana del sistema)
// ---------------------------------------------------------------------
/** Al empezar el primer pomodoro en la app: pide permiso una sola vez para avisarte del final. */
export async function askOnFirstSession() {
  if (!N.isNative() || store.pref.get('native_notif_asked')) return;
  store.pref.set('native_notif_asked', '1');
  if ((await N.notificationPermission()) === 'prompt') await N.requestNotifications();
  syncReminders();
}

/** El botón "Activar notificaciones" de Ajustes, dentro de la app. Devuelve el permiso final. */
export async function enableFromSettings() {
  let perm = await N.notificationPermission();
  if (perm === 'prompt') perm = await N.requestNotifications();
  syncReminders();
  return perm;
}

// ---------------------------------------------------------------------
// Recordatorios (Premium)
// ---------------------------------------------------------------------
export function syncReminders() {
  if (!N.isNative()) return Promise.resolve(false);
  const r = state.settings.reminders;
  return N.scheduleReminders({
    on: isPremium() && r.on,
    time: r.time,
    days: r.days,
    title: tr('Hora de enfocarte'),
    body: tr('Tu sesión de estudio te espera. ¡Vamos, el polo cuenta contigo!'),
  });
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
export function initNative() {
  if (!N.isNative()) return;
  document.documentElement.classList.add('is-native');
  N.prepareNotifications({
    name: tr('Pomodoros y recordatorios'),
    description: tr('Te avisa cuando termina un bloque y a la hora de tus recordatorios.'),
  });
  N.onBackButton(handleBack);
  N.onAppState(onAppActive);
  syncReminders();
  // Enlaces a las páginas de FrostPom (privacidad…): en el navegador del teléfono, sin salir de la app
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-page]') : null;
    if (!a) return;
    e.preventDefault();
    N.openPage(a.dataset.page);
  });
  const v = $('#appVersion');
  if (v) v.dataset.platform = 'android';
}
