/*
 * FrostPom — (v4.9.0) "Continuar con Google / Microsoft / Discord": botones, salida y regreso.
 * La lógica (PKCE, direcciones, el inicio de sesión en curso) está en js/oauth.js; lo que pasa
 * DESPUÉS de entrar (traer el progreso o terminar de crear la cuenta) está en js/ui/cloud-ui.js
 * (oauthEnter), junto a "Inicia sesión" con correo y contraseña.
 *
 *  - En la app de Android, Google se abre en una pestaña del navegador del teléfono y vuelve a la
 *    app por su enlace: todo pasa sin recargar.
 *  - En la web y en Windows, la página va a Google y vuelve a la app: al abrirse, greet() llama a
 *    resumeOAuth() antes que a la bienvenida.
 *  - Edad: para CREAR una cuenta así se pide antes el mes y el año (13+), como con el correo.
 */
import * as O from '../oauth.js';
import * as CLOUD from '../cloud.js';
import * as N from '../native.js';
import { config } from '../config.js';
import { h } from './dom.js';
import { toast } from './feedback.js';
import { t, tr } from '../i18n.js';

const storage = () => {
  try { return globalThis.localStorage; } catch { return null; }
};
const mem = new Map();
const store = () => storage() || { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

/** Los proveedores encendidos (config.accounts.oauth). */
export const providers = () => O.enabledProviders();
export const providerLabel = (id) => (O.providerOf(id) || { label: id }).label;

/**
 * Los botones "Continuar con …". onPick(id) decide qué hacer (por ejemplo, revisar la edad antes).
 * El logo de cada proveedor va en assets/oauth/<id>.svg (el oficial de cada marca: ver la guía);
 * si falta, el botón queda solo con el texto.
 */
export function oauthButtons(onPick, { lead = '', after = '' } = {}) {
  const list = providers();
  if (!list.length) return null;
  return h('div', { class: 'oauth', role: 'group', 'aria-label': tr('Otras formas de entrar') },
    lead ? h('p', { class: 'oauth__or' }, h('span', { text: lead })) : null,
    h('div', { class: 'oauth__btns' }, list.map((p) => {
      const logo = h('img', { class: 'oauth__logo', src: `assets/oauth/${p.id}.svg`, alt: '', width: '20', height: '20', 'aria-hidden': 'true' });
      logo.addEventListener('error', () => logo.remove());
      return h('button', { type: 'button', class: `oauth__btn oauth__btn--${p.id}`, id: `oauth-${p.id}`, 'data-provider': p.id, onclick: () => onPick(p.id) },
        logo, h('span', { text: t('Continuar con {name}', { name: p.label }) }));
    })),
    after ? h('p', { class: 'oauth__or' }, h('span', { text: after })) : null);
}

/**
 * Lo que pasó con el último intento, para decirlo DENTRO de la ventana a la que se vuelve (un
 * aviso suelto se pierde detrás de la bienvenida). La ventana lo toma una sola vez.
 */
let notice = '';
export const setOAuthNotice = (text) => { notice = text || ''; };
export function takeOAuthNotice() { const n = notice; notice = ''; return n; }

/** El texto de un intento que no terminó ('' = la persona lo cerró: no hace falta decir nada). */
export function failText(r) {
  if (!r || r.reason === 'cancel') return '';
  if (r.reason === 'denied') return tr('No diste permiso para entrar con esa cuenta.');
  if (r.reason === 'offline') return tr('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  if (r.reason === 'expired') return tr('El inicio de sesión tardó demasiado. Inténtalo otra vez.');
  if (r.reason === 'open') return tr('No pudimos abrir la página para entrar. Inténtalo otra vez.');
  return tr('No pudimos entrar con esa cuenta. Inténtalo otra vez o usa tu correo y tu contraseña.');
}

/** Cambia el regreso de Google por la sesión. { ok: true, session, pending } o { ok: false, reason }. */
async function exchange(ret, pending) {
  O.clearPending(store());
  if (!ret) return { ok: false, reason: 'error' };
  if (ret.error) return { ok: false, reason: /denied|cancel/i.test(ret.error) ? 'denied' : 'error', detail: ret.description };
  try {
    const session = await CLOUD.exchangeCode(ret.code, pending.verifier);
    return { ok: true, session, pending };
  } catch (e) {
    return { ok: false, reason: e && e.kind === 'offline' ? 'offline' : 'error' };
  }
}

/**
 * Sale a entrar con el proveedor. intent: 'join' | 'signin' | 'unlock' | 'reconnect'.
 * En la app de Android devuelve el resultado; en la web la página se va (la promesa no se cumple)
 * y el resultado llega al volver, con resumeOAuth().
 */
export async function startOAuth(provider, { intent = 'signin', birth = '', country = '', keep = true } = {}) {
  if (!O.providerOf(provider) || !config.cloud || !config.cloud.url) return { ok: false, reason: 'error' };
  let verifier;
  let challenge;
  try {
    verifier = O.randomVerifier();
    challenge = await O.challengeFor(verifier);
  } catch {
    return { ok: false, reason: 'error' }; // sin crypto.subtle (página sin https)
  }
  const native = N.isNative();
  const redirect = O.redirectUrl({ native, href: location.href });
  const url = O.authorizeUrl({ base: config.cloud.url, provider, redirect, challenge });
  if (!url) return { ok: false, reason: 'error' };
  const pending = O.savePending(store(), { provider, verifier, intent, birth, country, keep });
  if (!native) {
    location.assign(url);
    return new Promise(() => {}); // la página se va a Google
  }
  const back = await N.authInBrowser(url, O.isNativeReturn);
  if (!back) { O.clearPending(store()); return { ok: false, reason: 'open' }; }
  if (back.cancel) { O.clearPending(store()); return { ok: false, reason: 'cancel' }; }
  return exchange(O.parseReturn(back.url), pending);
}

/**
 * Al abrir la app: ¿viene de entrar con Google (en la web, o la app de Android se cerró mientras
 * tanto)? Devuelve null si no, o el resultado ({ ok, session, pending } / { ok: false, reason }).
 */
export async function resumeOAuth() {
  const native = N.isNative();
  const url = native ? await N.launchUrl() : location.href;
  const ret = url ? O.parseReturn(url) : null;
  const pending = O.loadPending(store());
  if (!ret) {
    // Volvió sin terminar (por ejemplo, con el botón atrás del navegador): se olvida
    if (pending && !native) O.clearPending(store());
    return null;
  }
  if (!native) {
    try { history.replaceState(null, '', O.cleanHref(location.href)); } catch { /* nada */ }
  }
  if (!pending) return native ? null : { ok: false, reason: 'expired' };
  return exchange(ret, pending);
}
