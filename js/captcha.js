/*
 * FrostPom — CAPTCHA con Cloudflare Turnstile (v4.0.3; listo de antemano desde la v4.5.2).
 *
 * Para qué: que nadie pueda crear cuentas en masa con un programa, adivinar contraseñas a
 * gran velocidad ni pedir miles de correos de recuperación. Supabase revisa el "token" que
 * entrega Turnstile antes de crear una cuenta, iniciar sesión o enviar un código.
 *
 *  - Solo se usa al hablar con Supabase Auth (crear cuenta, entrar, recuperar la contraseña,
 *    unirse al ranking). Las cuentas de menores de 13 nunca llegan aquí: no salen del equipo.
 *  - Casi siempre es invisible ("interaction-only"): la casilla solo aparece si Cloudflare
 *    duda, y aparece dentro de la ventana que la persona tiene abierta.
 *  - Cada token sirve una sola vez, así que se pide uno nuevo por cada llamada.
 *  - (v4.5.2) LISTO DE ANTEMANO: Cloudflare tarda unos segundos en dar cada token (más en Android).
 *    Antes se pedía al tocar "Entrar", y "Conectando…" esperaba todo eso. Ahora, cuando empiezas a
 *    escribir en una ventana de entrar o de crear la cuenta (warm), se pide mientras escribes; al
 *    tocar "Entrar" ya está listo. Un token vale 300 s: si pasa más tiempo, se pide otro solo.
 *  - config.captcha.siteKey vacío = apagado: la app no carga nada de Cloudflare.
 *  - La clave SECRETA de Turnstile va solo en Supabase, nunca aquí. Paso a paso: docs/CAPTCHA.md
 */
import { config } from './config.js';
import { lang } from './i18n.js';

export const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const enabled = () => !!(config.captcha && config.captcha.siteKey);

const TTL_MS = 270_000; // los tokens valen 300 s: se usan solo los que tienen menos de 4,5 min
const WAIT_MS = 30_000; // si Cloudflare no responde en 30 s, se sigue sin token (antes se esperaban 90 s)
const HUMAN_MS = 180_000; // si muestra la casilla, se espera a que la toques
const RETRY_AFTER_MS = 20_000; // si falló al pedirlo de antemano, no se insiste enseguida

let loading = null;
let policy = null;

/** Carga el script de Turnstile una sola vez (con Trusted Types: solo esta dirección exacta). */
function load() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let url = SCRIPT_URL;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      policy = policy || window.trustedTypes.createPolicy('st-captcha', {
        createScriptURL: (u) => {
          if (u === SCRIPT_URL) return u;
          throw new TypeError('Dirección de CAPTCHA no permitida');
        },
      });
      url = policy.createScriptURL(SCRIPT_URL);
    }
    s.src = url;
    s.async = true;
    s.onload = () => (globalThis.turnstile ? resolve(globalThis.turnstile) : reject(new Error('captcha')));
    s.onerror = () => reject(new Error('captcha'));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null; // se puede volver a intentar (por ejemplo, cuando vuelva el internet)
    for (const el of document.querySelectorAll('script[src^="https://challenges.cloudflare.com/"]')) el.remove();
    throw e;
  });
  return loading;
}

/**
 * Pone la casilla (vacía mientras no haga falta) dentro de la ventana abierta, justo encima de
 * sus botones. Tiene que estar DENTRO de la ventana: lo que queda fuera no se puede tocar.
 */
function place(box) {
  const dlg = document.getElementById('dlg');
  const actions = dlg && dlg.open ? dlg.querySelector('.dlg__actions') : null;
  if (actions) actions.parentElement.insertBefore(box, actions);
  else if (dlg && dlg.open) dlg.appendChild(box);
  else document.body.appendChild(box);
}

/** ¿La casilla sigue en pantalla? (si su ventana se cerró o cambió, Turnstile ya no responde) */
function alive(box) {
  if (!box.isConnected) return false;
  const d = box.closest('dialog');
  return !d || d.open;
}

/**
 * Pide UN token a Turnstile. Devuelve { promise, cancel, box, claimed, gone }: la promesa se
 * resuelve con el token o falla si Cloudflare no responde (sin internet, bloqueado o la persona
 * no completó la casilla a tiempo), o si su ventana se cerró ('gone').
 */
function request(timeout) {
  const job = { claimed: false, gone: false, box: null, stop: null };
  job.cancel = () => { job.gone = true; if (job.stop) job.stop(); };
  job.promise = load().then((ts) => new Promise((resolve, reject) => {
    if (job.gone) { reject(new Error('gone')); return; }
    const box = document.createElement('div');
    box.className = 'captcha-box';
    place(box);
    job.box = box;
    let id = null;
    let done = false;
    let timer = 0;
    let watch = 0;
    const finish = (ok, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(watch);
      if (ok) resolve(value); else reject(value);
      // Se quita un instante después, cuando Turnstile ya terminó de llamar a la función de aviso.
      setTimeout(() => {
        try { if (id !== null) ts.remove(id); } catch { /* ya no está */ }
        box.remove();
      }, 0);
    };
    job.stop = () => finish(false, new Error('gone'));
    timer = setTimeout(() => finish(false, new Error('timeout')), timeout);
    watch = setInterval(() => { if (!alive(box)) { job.gone = true; finish(false, new Error('gone')); } }, 400);
    try {
      id = ts.render(box, {
        sitekey: config.captcha.siteKey,
        action: 'auth',
        appearance: 'interaction-only',
        theme: 'auto',
        language: lang === 'en' ? 'en' : 'es',
        // Sin reintento automático: si falla, la app sigue sola (y lo explica si Supabase lo exige).
        // Con reintento, Turnstile intentaba reiniciar a los 8 s una casilla ya quitada y dejaba
        // "Nothing to reset found for provided container" en la consola.
        retry: 'never',
        callback: (token) => finish(true, token),
        // (v4.5.2) Cloudflare va a mostrar la casilla: se espera a que la toques (no 30 s)
        'before-interactive-callback': () => {
          clearTimeout(timer);
          timer = setTimeout(() => finish(false, new Error('timeout')), HUMAN_MS);
        },
        'error-callback': (code) => {
          // El código dice qué pasó (por ejemplo 110200 = esta dirección no está en el widget). docs/CAPTCHA.md
          console.warn(`[FrostPom] Cloudflare Turnstile no respondió (código ${code}). Ver docs/CAPTCHA.md`);
          finish(false, new Error('captcha'));
          return true;
        },
        'unsupported-callback': () => finish(false, new Error('captcha')),
        'expired-callback': () => finish(false, new Error('expired')),
        'timeout-callback': () => finish(false, new Error('timeout')),
      });
    } catch (e) {
      finish(false, e);
    }
  }));
  return job;
}

// ---------------------------------------------------------------------
// (v4.5.2) Tokens listos de antemano
// ---------------------------------------------------------------------
let pool = []; // tokens listos y sin usar: { token, at }
let job = null; // el que se está pidiendo de antemano
let want = 0; // cuántos va a necesitar la ventana abierta (entrar = 1; conectar = hasta 2)
let anchor = null; // la ventana que los pidió (si se cierra, se deja de pedir)
let failedAt = 0;
let renewTimer = 0;

const now = () => Date.now();
function prune() { pool = pool.filter((p) => now() - p.at < TTL_MS); }
function wanted() {
  const dlg = document.getElementById('dlg');
  return !!anchor && !!dlg && dlg.open && dlg.contains(anchor);
}

/** Cuando el token más viejo esté por vencerse, se cambia por uno nuevo (si la ventana sigue abierta). */
function schedule() {
  clearTimeout(renewTimer);
  if (!pool.length) return;
  renewTimer = setTimeout(() => { prune(); fill(); schedule(); }, Math.max(1000, TTL_MS - (now() - pool[0].at) + 50));
}

function fill() {
  prune();
  if (job || !wanted() || pool.length >= want || now() - failedAt < RETRY_AFTER_MS) return;
  const j = request(WAIT_MS);
  job = j;
  j.promise.then((token) => {
    if (job === j) job = null;
    if (j.claimed) return; // ya lo estaba esperando una llamada: es suyo
    pool.push({ token, at: now() });
    schedule();
    fill(); // ¿hace falta otro?
  }, () => {
    if (job === j) job = null;
    if (j.gone) fill(); // se cerró su ventana: si otra lo pidió, se pide allá
    else if (!j.claimed) failedAt = now();
  });
}

/**
 * (v4.5.2) La persona empezó a escribir en una ventana de entrar o crear la cuenta: se pide el
 * token mientras escribe. n = cuántas llamadas con CAPTCHA puede hacer esa ventana (máx. 3).
 */
export function warm(n = 1) {
  if (!enabled()) return;
  const dlg = document.getElementById('dlg');
  if (!dlg || !dlg.open) return;
  const box = dlg.firstElementChild;
  if (anchor !== box) { anchor = box; want = 0; }
  want = Math.max(want, Math.min(3, n));
  // Uno que quedó en otra ventana ya no puede terminar: se pide de nuevo en esta
  if (job && !job.claimed && job.box && !anchor.contains(job.box)) job.cancel();
  fill();
}

/** ¿Cuántos tokens hay listos? (para las pruebas) */
export const ready = () => { prune(); return pool.length; };

/**
 * Un token para UNA llamada. Si ya hay uno listo, sale al instante; si se está pidiendo, se espera
 * ese; si no, se pide ahora (como antes de la v4.5.2).
 */
export async function getToken({ timeout = WAIT_MS } = {}) {
  if (!enabled()) throw new Error('off');
  prune();
  if (want > 0) want -= 1;
  const p = pool.shift();
  if (p) { schedule(); return p.token; }
  if (job && !job.claimed && !job.gone) {
    job.claimed = true;
    return job.promise;
  }
  const j = request(timeout);
  j.claimed = true;
  return j.promise;
}
