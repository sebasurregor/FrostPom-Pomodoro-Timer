/*
 * FrostPom — (v4.9.0) entrar con otras cuentas: Google, Microsoft, Discord (y Facebook, apagado).
 * Lógica pura (con pruebas en tests/oauth.test.js). Las ventanas están en js/ui/oauth-ui.js.
 *
 * Cómo funciona (OAuth 2.0 con PKCE, el método que recomienda Supabase para apps):
 *  1. La app inventa un secreto al azar (verifier) y guarda una huella de él (challenge).
 *  2. Abre la página de Supabase → la de Google (o Microsoft, Discord…) con la huella.
 *  3. Al aceptar, Google vuelve a la app con un código de un solo uso.
 *     - En la app de Android vuelve con el enlace com.startupprometeus.frostpom://login-callback
 *       (se registra en el AndroidManifest con tools/app-android.mjs).
 *     - En la web y en Windows, vuelve a la misma página de la app (?code=…).
 *  4. La app cambia el código + el secreto por la sesión. Sin el secreto, el código no sirve:
 *     aunque otra app viera el enlace de regreso, no podría entrar.
 *
 * Nada de esto guarda contraseñas: FrostPom nunca ve la contraseña de Google ni de Microsoft.
 * Cada proveedor se enciende en config.accounts.oauth SOLO después de configurarlo en Supabase
 * (paso a paso: docs/INICIAR-CON-OTRAS-CUENTAS.md).
 */
import { config } from './config.js';

/** Los proveedores, en el orden en que se muestran. id = el nombre del proveedor en Supabase. */
export const PROVIDERS = Object.freeze([
  Object.freeze({ id: 'google', label: 'Google', scopes: '' }),
  // Microsoft (Azure en Supabase): sin "email" en los permisos, Microsoft no manda el correo
  Object.freeze({ id: 'azure', label: 'Microsoft', scopes: 'email' }),
  Object.freeze({ id: 'discord', label: 'Discord', scopes: '' }),
  Object.freeze({ id: 'facebook', label: 'Facebook', scopes: 'email' }),
]);
export const IDS = Object.freeze(PROVIDERS.map((p) => p.id));

/** El enlace por el que vuelve la app de Android (también va en Supabase → Redirect URLs). */
export const SCHEME = 'com.startupprometeus.frostpom';
export const NATIVE_REDIRECT = `${SCHEME}://login-callback`;
/** Un regreso más viejo que esto ya no vale (el código de Supabase dura 5 minutos). */
export const PENDING_MS = 15 * 60 * 1000;
export const PENDING_KEY = 'st2_oauth';

/** El proveedor por su id, o null. */
export const providerOf = (id) => PROVIDERS.find((p) => p.id === id) || null;

/** Los proveedores encendidos en config (y solo si hay Supabase con cuentas en línea). */
export function enabledProviders(cfg = config) {
  const cloud = cfg && cfg.cloud;
  const on = (cfg && cfg.accounts && cfg.accounts.oauth) || {};
  if (!cloud || !cloud.url || !cloud.key || !(cfg.accounts && cfg.accounts.online)) return [];
  return PROVIDERS.filter((p) => on[p.id] === true);
}

/** A dónde vuelve Google: en la app, el enlace de la app; en la web, esta misma página (sin ?…#…). */
export function redirectUrl({ native = false, href = '' } = {}) {
  if (native) return NATIVE_REDIRECT;
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
}

const toB64Url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** El secreto al azar (43 a 128 caracteres seguros para una URL, como pide PKCE). */
export function randomVerifier(bytes = 48) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toB64Url(b);
}

/** La huella del secreto: SHA-256 en base64url (method=S256). */
export async function challengeFor(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toB64Url(new Uint8Array(digest));
}

/** La dirección de Supabase que empieza el inicio de sesión con el proveedor. */
export function authorizeUrl({ base, provider, redirect, challenge }) {
  const p = providerOf(provider);
  if (!p || !base || !redirect || !challenge) return '';
  const u = new URL('/auth/v1/authorize', base);
  u.searchParams.set('provider', p.id);
  u.searchParams.set('redirect_to', redirect);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 's256');
  if (p.scopes) u.searchParams.set('scopes', p.scopes);
  return u.href;
}

/**
 * Lo que trae el enlace de regreso: { code } si salió bien, { error, description } si no, o null
 * si el enlace no es un regreso de inicio de sesión. Supabase pone el resultado en ?… (PKCE) y
 * algunos errores en #….
 */
export function parseReturn(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const q = u.searchParams;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const code = q.get('code') || '';
  const error = q.get('error') || hash.get('error') || '';
  if (code && /^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { code };
  if (error) return { error: error.slice(0, 80), description: (q.get('error_description') || hash.get('error_description') || '').slice(0, 300) };
  return null;
}

/** ¿Este enlace es el regreso de la app de Android? */
export const isNativeReturn = (url) => typeof url === 'string' && url.startsWith(`${SCHEME}://`);

/**
 * El inicio de sesión que está en curso (guardado antes de salir hacia Google, porque en la web la
 * página se recarga al volver). intent: 'join' (crear cuenta), 'signin' (entrar), 'unlock'
 * (abrir la app con tu cuenta) o 'reconnect' (volver a entrar desde Ajustes).
 */
export function savePending(storage, p, now = Date.now()) {
  const v = {
    provider: providerOf(p.provider) ? p.provider : '',
    verifier: String(p.verifier || ''),
    intent: ['join', 'signin', 'unlock', 'reconnect'].includes(p.intent) ? p.intent : 'signin',
    birth: typeof p.birth === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(p.birth) ? p.birth : '',
    country: typeof p.country === 'string' ? p.country.slice(0, 2) : '',
    keep: p.keep !== false,
    at: now,
  };
  try { storage.setItem(PENDING_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  return v;
}

export function loadPending(storage, now = Date.now()) {
  let v = null;
  try { v = JSON.parse(storage.getItem(PENDING_KEY) || 'null'); } catch { v = null; }
  if (!v || typeof v !== 'object' || !providerOf(v.provider) || typeof v.verifier !== 'string' || v.verifier.length < 43) return null;
  if (!(now - Number(v.at) < PENDING_MS) || Number(v.at) > now + 60_000) return null;
  return v;
}

export function clearPending(storage) {
  try { storage.removeItem(PENDING_KEY); } catch { /* nada */ }
}

/** El enlace de la página sin el ?code=… (para limpiar la barra de direcciones al volver). */
export function cleanHref(href) {
  try {
    const u = new URL(href);
    for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) u.searchParams.delete(k);
    u.hash = u.hash && /error|access_token/.test(u.hash) ? '' : u.hash;
    return u.href;
  } catch {
    return href;
  }
}
