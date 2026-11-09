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
      .then(({ registerPlugin }) => ({
        App: registerPlugin('App'),
        LocalNotifications: registerPlugin('LocalNotifications'),
        Haptics: registerPlugin('Haptics'),
        Browser: registerPlugin('Browser'),
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

/** Solo para las pruebas: olvida los complementos cargados. */
export function _reset() { loading = null; }
