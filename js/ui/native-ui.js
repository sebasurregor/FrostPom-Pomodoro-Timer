/*
 * FrostPom — lo que la app hace distinto dentro de Android (v4.1). En la web no hace nada.
 *
 *  - Botón "atrás": cierra lo que esté abierto (lista de países, tienda, ventana) o vuelve a
 *    Enfocar; si ya estás en Enfocar, la app pasa a segundo plano (el pomodoro sigue contando).
 *  - Si sales de la app con un bloque corriendo, el teléfono programa el aviso del final (en
 *    segundo plano el código de la app se detiene). Al volver, el aviso se cancela.
 *  - Los recordatorios (Premium) los programa el teléfono, así llegan con la app cerrada.
 *  - La vibración usa el motor del teléfono.
 *  - (v4.6) Con el complemento FrostTimer (native/frostpom-timer): la notificación en curso "como
 *    Spotify" con sus botones, el widget y el aviso exacto del final. Lo que tocas ahí con la app
 *    cerrada se aplica al volver, con la hora en que lo tocaste.
 */
import { sheetOpen, closeSheet } from './sheets.js';
import * as N from '../native.js';
import { $ } from './dom.js';
import { dlg, confirmDialog } from './feedback.js';
import { state, store, session, isPremium, prefs } from './context.js';
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
  // 3. La tienda de comida, o una sección abierta como ventana (v4.3)
  if (trayOpen()) { closeTray(); return true; }
  if (sheetOpen()) { closeSheet(); return true; }
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
  if (active) {
    applyNativeActions(); // (v4.6) lo que tocaste en la notificación o el widget mientras no estabas
    return N.cancelTimerEnd();
  }
  // (v4.6) Con el complemento, el aviso del final lo lleva él (y lo mueve si pausas desde la notificación)
  if (await N.hasTimerPlugin()) return undefined;
  if (!session.running) return undefined;
  const remaining = session.remainingMs();
  if (!(remaining > 2000)) return undefined;
  return N.scheduleTimerEnd({ at: Date.now() + remaining, ...timerTexts() });
}

// ---------------------------------------------------------------------
// (v4.6) La notificación en curso y el widget (complemento FrostTimer)
// ---------------------------------------------------------------------
const handlers = { apply() {} };
/** Enfocar se conecta aquí (focus.js: applyNative aplica cada acción). */
export function connectNative(h) { Object.assign(handlers, h); }

let plugin = null; // null = todavía no se sabe; true / false
let lastSig = '';
let readyDone = null;
const readyPromise = new Promise((r) => { readyDone = r; });
/**
 * Se cumple cuando ya se aplicó lo que tocaste en la notificación o en el widget con la app
 * cerrada (o enseguida, en la web o sin el complemento). Enfocar lo espera antes de guardar un
 * bloque que llegó a cero: quizás lo pausaste antes desde la notificación.
 */
export function nativeReady() {
  if (!N.isNative()) return Promise.resolve();
  return Promise.race([readyPromise, new Promise((r) => setTimeout(r, 3000))]);
}

/** Los textos de la notificación y del widget, en el idioma de la app (el teléfono los guarda). */
function nativeTexts() {
  return {
    modes: { study: tr('Modo enfoque'), break: tr('Descanso'), long: tr('Descanso largo') },
    paused: tr('En pausa'),
    phrases: { study: tr('Hora de concentrarse'), studyIdle: tr('Listo cuando tú lo estés'), break: tr('Hora de descansar'), breakIdle: tr('Tu descanso te espera') },
    bubble: { study: tr('¡Estudiando juntos!'), break: tr('¡A descansar!') },
    start: tr('Empezar'), pause: tr('Pausar'), resume: tr('Continuar'), skip: tr('Saltar'), finish: tr('Terminar y guardar'), reset: tr('Reiniciar'),
    endStudy: { title: tr('¡Sesión completa!'), body: tr('Vuelve a FrostPom para guardar tu sesión y ganar tu XP.') },
    endBreak: { title: tr('Descanso terminado'), body: tr('Cuando quieras, empieza otra sesión.') },
    done: tr('Abre FrostPom para guardar tu sesión.'),
    channel: tr('Pomodoro en curso'),
    channelDesc: tr('La cuenta regresiva de tu pomodoro, con sus botones.'),
  };
}

/** Le cuenta al teléfono cómo está el reloj (solo si cambió algo desde la última vez). */
export function syncNativeTimer() {
  if (!N.isNative() || plugin === false) return;
  const st = session.state;
  const total = st.durationSec * 1000;
  const d = prefs().durations;
  const info = {
    status: st.status,
    mode: st.mode,
    durationSec: st.durationSec,
    // Corriendo: la hora del fin (el cronómetro de Android baja solo). En pausa o en reposo: lo que falta.
    endAt: st.status === 'running' ? Math.round(st.runStartMs + total - st.accumulatedMs) : 0,
    remainingMs: st.status === 'running' ? 0 : Math.max(0, Math.round(total - st.accumulatedMs)),
    block: st.block || '',
    canFinish: st.mode === 'study' && st.status !== 'idle',
    durations: { study: d.study * 60, break: d.brk * 60, long: d.long * 60 }, // para saltar con la app cerrada
    companion: state.profile.companion || 'pinguino',
    theme: state.settings.theme, // 'auto' sigue al teléfono
    texts: nativeTexts(),
  };
  const sig = JSON.stringify(info);
  if (sig === lastSig) return;
  lastSig = sig;
  N.timerUpdate(info);
}

let applying = false;
/** Aplica, en orden y con su hora, lo que tocaste en la notificación o en el widget. */
export async function applyNativeActions() {
  if (!N.isNative() || plugin === false || applying) return;
  applying = true;
  try {
    for (const a of await N.takeTimerActions()) {
      try { handlers.apply(a); } catch { /* una acción rara no frena las demás */ }
    }
  } finally {
    applying = false;
  }
}

/**
 * (v4.6) Desde Android 14 el permiso de "Alarmas y recordatorios" viene apagado: sin él, el aviso
 * del final puede llegar unos minutos tarde. Se pide una sola vez, después del primer pomodoro
 * completo, con una explicación (nunca por sorpresa).
 */
export async function maybeAskExactAlarms() {
  if (!N.isNative() || store.pref.get('exact_asked') || dlg.open) return;
  if (!(await N.hasTimerPlugin()) || (await N.exactAlarms()) !== 'denied') return;
  store.pref.set('exact_asked', '1');
  const ok = await confirmDialog('¿Te aviso justo a tiempo?',
    'Para avisarte en el segundo exacto en que termina cada pomodoro (aunque el teléfono esté en reposo), Android pide el permiso "Alarmas y recordatorios". Si prefieres no darlo, el aviso puede llegar unos minutos tarde.',
    'Abrir ajustes', 'btn--gold');
  if (ok) N.openExactAlarmSettings();
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
  // (v4.6) ¿Trae la app la notificación en curso y el widget?
  N.hasTimerPlugin().then(async (has) => {
    plugin = has;
    if (!has) return;
    N.onTimerActions(applyNativeActions);
    await applyNativeActions();
    syncNativeTimer();
  }).catch(() => {}).finally(() => readyDone());
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
