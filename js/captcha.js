/*
 * FrostPom — CAPTCHA con Cloudflare Turnstile (v4.0.3).
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
 *  - config.captcha.siteKey vacío = apagado: la app no carga nada de Cloudflare.
 *  - La clave SECRETA de Turnstile va solo en Supabase, nunca aquí. Paso a paso: docs/CAPTCHA.md
 */
import { config } from './config.js';
import { lang } from './i18n.js';

export const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const enabled = () => !!(config.captcha && config.captcha.siteKey);

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

/**
 * Pide un token nuevo a Turnstile. Se resuelve con el token, o falla si Cloudflare no
 * responde (sin internet, bloqueado o la persona no completó la casilla a tiempo).
 */
export async function getToken({ timeout = 90000 } = {}) {
  if (!enabled()) throw new Error('off');
  const ts = await load();
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'captcha-box';
    place(box);
    let id = null;
    let done = false;
    const finish = (ok, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (ok) resolve(value); else reject(value);
      // Se quita un instante después, cuando Turnstile ya terminó de llamar a la función de aviso.
      setTimeout(() => {
        try { if (id !== null) ts.remove(id); } catch { /* ya no está */ }
        box.remove();
      }, 0);
    };
    const timer = setTimeout(() => finish(false, new Error('timeout')), timeout);
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
        'error-callback': (code) => {
          // El código dice qué pasó (por ejemplo 110200 = esta dirección no está en el widget). docs/CAPTCHA.md
          console.warn(`[FrostPom] Cloudflare Turnstile no respondió (código ${code}). Ver docs/CAPTCHA.md`);
          finish(false, new Error('captcha'));
          return true;
        },
        'expired-callback': () => finish(false, new Error('expired')),
        'timeout-callback': () => finish(false, new Error('timeout')),
      });
    } catch (e) {
      finish(false, e);
    }
  });
}
