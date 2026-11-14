/*
 * FrostPom — la app de Android (Capacitor, v4.1).
 *
 * El mismo código de la web corre dentro de una app de Android. Este archivo es el único que
 * habla con el teléfono; en la web todas sus funciones no hacen nada (o usan la versión web).
 *
 *  - Capacitor mete en la página su "puente" (window.Capacitor) antes de que cargue la app.
 *    Si no está, estamos en la web.
 *  - Los complementos (App, LocalNotifications, Haptics, Browser) se cargan con
 *    js/vendor/capacitor-core.js, solo dentro de la app.
 *  - (v4.6) FrostTimer es el complemento propio de FrostPom (native/frostpom-timer): la
 *    notificación en curso "como Spotify", el widget y el aviso exacto del final. Si la app
 *    se compiló sin él, todo sigue como en la v4.5 (aviso del final con LocalNotifications).
 *  - Ningún error de aquí puede romper la app: todo va en try/catch y, si algo falla, la app
 *    sigue como en la web.
 *
 * Paso a paso para crear la app: docs/GOOGLE-PLAY.md
 */
import { config } from './config.js';

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

/** ¿Estamos dentro de la app de Android (o iPhone)? */
export function isNative() {
  try {
    const c = cap();
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  } catch {
    return false;
  }
}

let loading = null;
/** Los complementos del teléfono, o null en la web (o si no se pudieron cargar). */
function plugins() {
  if (!isNative()) return Promise.resolve(null);
  if (!loading) {
    loading = import('./vendor/capacitor-core.js')
      .then(({ registerPlugin, Capacitor }) => ({
        App: registerPlugin('App'),
        LocalNotifications: registerPlugin('LocalNotifications'),
        Haptics: registerPlugin('Haptics'),
        Browser: registerPlugin('Browser'),
        // (v4.6) Solo si la app trae el complemento (si no, llamarlo daría "not implemented")
        FrostTimer: Capacitor && Capacitor.isPluginAvailable && Capacitor.isPluginAvailable('FrostTimer') ? registerPlugin('FrostTimer') : null,
      }))
      .catch(() => null);
  }
  return loading;
}

const quiet = async (fn) => {
  try { return await fn(); } catch { return undefined; }
};

// ---------------------------------------------------------------------
// Páginas (normas, privacidad, eliminar cuenta)
// ---------------------------------------------------------------------
/**
 * Abre una página de FrostPom (por ejemplo 'normas.html') sin perder lo que estás haciendo:
 * en la web, en una pestaña nueva; en la app, en una ventana del navegador del teléfono con la
 * página publicada (así se ve siempre la versión al día).
 */
export async function openPage(page) {
  const p = await plugins();
  if (p) {
    const url = new URL(page, config.publicUrl).href;
    if (await quiet(() => p.Browser.open({ url }).then(() => true))) return;
  }
  window.open(page, '_blank', 'noopener');
}

// ---------------------------------------------------------------------
// Botón "atrás" de Android y estado de la app
// ---------------------------------------------------------------------
/**
 * handler() decide qué hacer con el botón atrás; si devuelve false (no había nada que cerrar),
 * la app se va a segundo plano, como cualquier app de Android (el pomodoro sigue contando).
 */
export async function onBackButton(handler) {
  const p = await plugins();
  if (!p) return;
  await quiet(() => p.App.addListener('backButton', async () => {
    let handled = false;
    try { handled = await handler(); } catch { handled = false; }
    if (!handled) await quiet(() => p.App.minimizeApp());
  }));
}

/** fn(true) cuando la app vuelve al frente; fn(false) cuando se va a segundo plano. */
export async function onAppState(fn) {
  const p = await plugins();
  if (!p) return;
  await quiet(() => p.App.addListener('appStateChange', ({ isActive }) => fn(!!isActive)));
}

// ---------------------------------------------------------------------
// Vibración
// ---------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** pattern = milisegundos, o [vibrar, pausa, vibrar…] como navigator.vibrate. */
export async function vibrate(pattern) {
  const p = await plugins();
  if (!p) return;
  const steps = (Array.isArray(pattern) ? pattern : [pattern]).map((n) => Math.max(0, Math.min(1000, Number(n) || 0))).slice(0, 9);
  for (let i = 0; i < steps.length; i++) {
    if (i % 2 === 0) { if (steps[i]) await quiet(() => p.Haptics.vibrate({ duration: steps[i] })); }
    if (i < steps.length - 1) await wait(steps[i]);
  }
}

// ---------------------------------------------------------------------
// Notificaciones locales (las programa el teléfono: llegan aunque la app esté cerrada)
// ---------------------------------------------------------------------
export const CHANNEL = 'frostpom';
export const TIMER_ID = 1;
export const REMINDER_BASE = 100; // 100 + día (0 = domingo … 6 = sábado)

/** 'granted' | 'denied' | 'prompt' | 'unavailable' */
export async function notificationPermission() {
  const p = await plugins();
  if (!p) return 'unavailable';
  const r = await quiet(() => p.LocalNotifications.checkPermissions());
  const v = r && r.display;
  return v === 'granted' || v === 'denied' ? v : v ? 'prompt' : 'unavailable';
}

/** Pide permiso (Android 13 o superior muestra la ventana del sistema). Devuelve el resultado. */
export async function requestNotifications() {
  const p = await plugins();
  if (!p) return 'unavailable';
  const r = await quiet(() => p.LocalNotifications.requestPermissions());
  const v = r && r.display;
  return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt';
}

/** Canal de notificaciones de Android (nombre y descripción que se ven en los ajustes del teléfono). */
export async function prepareNotifications({ name, description }) {
  const p = await plugins();
  if (!p) return;
  await quiet(() => p.LocalNotifications.createChannel({ id: CHANNEL, name, description, importance: 4, visibility: 1, vibration: true, lights: false }));
}

// Inexacta a propósito: si fuera "exacta", Android 12+ abriría solo la pantalla de permisos de
// alarmas. Con allowWhileIdle suena aunque el teléfono esté en reposo.
const base = (n) => ({ channelId: CHANNEL, isExactNotification: false, autoCancel: true, ...n });

/** Programa el aviso del final del bloque (si la app está en segundo plano). */
export async function scheduleTimerEnd({ at, title, body }) {
  const p = await plugins();
  if (!p || !(at > Date.now() + 1000)) return false;
  if ((await notificationPermission()) !== 'granted') return false;
  await quiet(() => p.LocalNotifications.cancel({ notifications: [{ id: TIMER_ID }] }));
  const r = await quiet(() => p.LocalNotifications.schedule({
    notifications: [base({ id: TIMER_ID, title, body, schedule: { at: new Date(at), allowWhileIdle: true } })],
  }));
  return !!r;
}

export async function cancelTimerEnd() {
  const p = await plugins();
  if (!p) return;
  await quiet(() => p.LocalNotifications.cancel({ notifications: [{ id: TIMER_ID }] }));
}

/**
 * Recordatorios semanales (Premium): days = [0..6] con 0 = domingo, time = 'HH:MM'.
 * on = false los quita todos.
 */
export async function scheduleReminders({ on, time, days, title, body }) {
  const p = await plugins();
  if (!p) return false;
  await quiet(() => p.LocalNotifications.cancel({ notifications: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: REMINDER_BASE + d })) }));
  const m = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!on || !m || !Array.isArray(days) || !days.length) return false;
  if ((await notificationPermission()) !== 'granted') return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const list = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).map((d) => base({
    id: REMINDER_BASE + d, title, body,
    schedule: { on: { weekday: d + 1, hour, minute }, allowWhileIdle: true }, // Capacitor: 1 = domingo
  }));
  if (!list.length) return false;
  return !!(await quiet(() => p.LocalNotifications.schedule({ notifications: list })));
}

// ---------------------------------------------------------------------
// (v4.6) La notificación en curso, el widget y el aviso exacto del final (complemento FrostTimer)
// ---------------------------------------------------------------------
// OJO: nunca se devuelve el complemento desde una función async (await lo trataría como una
// promesa: el "proxy" de Capacitor tiene .then y la espera no termina nunca). Se devuelve el grupo.
const withTimer = async () => {
  const p = await plugins();
  return p && p.FrostTimer ? p : null;
};

/** ¿La app trae el complemento de la notificación en curso y el widget? */
export async function hasTimerPlugin() {
  return !!(await withTimer());
}

/**
 * Le cuenta al teléfono cómo está el reloj: la notificación en curso, el widget y el aviso del
 * final se actualizan solos (aunque después cierres la app). Ver native-ui.js: syncNativeTimer.
 */
export async function timerUpdate(info) {
  const p = await withTimer();
  if (!p) return false;
  return !!(await quiet(() => p.FrostTimer.update(info).then(() => true)));
}

const ACTS = ['start', 'pause', 'resume', 'skip', 'reset', 'finish'];
/**
 * Lo que tocaste en la notificación o en el widget (también con la app cerrada), en orden:
 * [{ act, at, block }]. El teléfono las olvida al entregarlas.
 */
export async function takeTimerActions() {
  const p = await withTimer();
  if (!p) return [];
  const r = await quiet(() => p.FrostTimer.getPendingActions());
  const list = r && Array.isArray(r.actions) ? r.actions : [];
  return list
    .filter((a) => a && ACTS.includes(a.act) && Number.isFinite(a.at) && a.at > 0)
    .map((a) => ({ act: a.act, at: Math.min(a.at, Date.now()), block: typeof a.block === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(a.block) ? a.block : '' }))
    .sort((a, b) => a.at - b.at)
    .slice(0, 50);
}

/** fn() cuando tocas un botón de la notificación o del widget con la app abierta. */
export async function onTimerActions(fn) {
  const p = await withTimer();
  if (!p) return;
  await quiet(() => p.FrostTimer.addListener('actionsPending', () => fn()));
}

/** Alarmas exactas ("Alarmas y recordatorios"): 'granted' | 'denied' | 'unavailable'. */
export async function exactAlarms() {
  const p = await withTimer();
  if (!p) return 'unavailable';
  const r = await quiet(() => p.FrostTimer.canScheduleExactAlarms());
  return r && typeof r.value === 'boolean' ? (r.value ? 'granted' : 'denied') : 'unavailable';
}

/** Abre la pantalla de Android donde se da ese permiso a FrostPom. */
export async function openExactAlarmSettings() {
  const p = await withTimer();
  if (p) await quiet(() => p.FrostTimer.openExactAlarmSettings());
}

/** Solo para las pruebas: olvida los complementos cargados. */
export function _reset() { loading = null; }
