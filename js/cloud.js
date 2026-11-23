/*
 * FrostPom — conexión con Supabase: recuperar la contraseña por correo (v3.7), la sesión y las
 * funciones del ranking global (v3.9, js/board.js) y las cuentas en línea con correo y
 * contraseña (v4.0, js/sync.js).
 *
 * Cómo funciona (sin librerías, con fetch a la API de Supabase Auth):
 *  1. Al agregar un correo, se crea un usuario en Supabase con ese correo y una contraseña
 *     ALEATORIA. Tu contraseña de FrostPom nunca sale del dispositivo.
 *  2. Si olvidas la contraseña, Supabase te envía un código al correo (/recover).
 *  3. La app comprueba el código (/verify). Si es correcto, quedó demostrado que el correo
 *     es tuyo y la app te deja poner una contraseña nueva en este dispositivo.
 *
 * En el servidor solo queda el correo. La clave publicable (config.cloud.key) puede estar
 * en el código: está hecha para eso. La clave secreta NUNCA va aquí.
 */
import { config } from './config.js';
import { tr } from './i18n.js';
import * as CAPTCHA from './captcha.js';

const cfg = () => config.cloud || {};
export const isConfigured = () => !!(cfg().url && cfg().key);

/** Correo con forma válida (no garantiza que exista: eso lo prueba el código). */
export function cleanEmail(value) {
  // (v4.9.0) Un correo nunca lleva espacios: el teclado de Android pone uno después del punto
  // ("correo@gmail. com"), así que se quitan todos en vez de decir que está mal escrito.
  const v = String(value || '').replace(/\s+/g, '').toLowerCase();
  if (v.length > 254) return '';
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? v : '';
}

/** Muestra el correo a medias: s****@gmail.com */
export function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '';
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

class CloudError extends Error {
  constructor(kind, detail) { super(kind); this.kind = kind; this.detail = detail; }
}

// Traduce las respuestas de Supabase a unos pocos casos que la app sabe explicar.
function classify(status, data) {
  const code = String(data.error_code || data.code || data.error || '').toLowerCase();
  const msg = String(data.msg || data.message || data.error_description || '').toLowerCase();
  // CAPTCHA encendido en Supabase y el token faltó o no sirvió (va primero: el mensaje dice "invalid")
  if (code.includes('captcha') || msg.includes('captcha')) return 'captcha';
  // Sin SMTP propio, Supabase solo envía correos al equipo del proyecto
  if (code.includes('not_authorized') || msg.includes('not authorized')) return 'notallowed';
  if (code.includes('invalid_credentials') || msg.includes('invalid login credentials')) return 'badlogin';
  if (code.includes('weak_password') || msg.includes('password should')) return 'weak';
  if (code.includes('same_password')) return 'same';
  if (status === 429 || code.includes('rate_limit') || msg.includes('rate limit') || msg.includes('only request this after')) return 'rate';
  if (code.includes('email_address_invalid') || msg.includes('email address') || code.includes('validation')) return 'email';
  if (code.includes('already') || msg.includes('already registered')) return 'exists';
  if (code.includes('otp_expired') || code.includes('otp') || msg.includes('expired') || msg.includes('invalid')) return 'badcode';
  if (code.includes('anonymous_provider_disabled') || msg.includes('anonymous sign-ins are disabled')) return 'notready';
  if (code.includes('signup_disabled') || code.includes('email_provider_disabled')) return 'disabled';
  return 'server';
}

// Lo que Supabase protege con CAPTCHA cuando está encendido: crear cuentas (también las
// anónimas del ranking), entrar con contraseña y pedir códigos. Renovar la sesión y comprobar
// el código del correo no lo necesitan.
const needsCaptcha = (path, method) => method === 'POST'
  && (path === '/signup' || path === '/recover' || path.startsWith('/token?grant_type=password'));

const ms = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

async function call(path, { body, token, method = 'POST' } = {}) {
  if (!isConfigured()) throw new CloudError('off');
  const t0 = ms();
  let waited = -1; // cuánto se esperó a Cloudflare (-1 = esta llamada no lo necesita)
  if (body && CAPTCHA.enabled() && needsCaptcha(path, method)) {
    // Si Cloudflare no responde se intenta igual: con el CAPTCHA apagado en Supabase funciona,
    // y con el CAPTCHA encendido Supabase responde 'captcha' y la app lo explica.
    try { body = { ...body, gotrue_meta_security: { captcha_token: await CAPTCHA.getToken() } }; } catch { /* sin token */ }
    waited = ms() - t0;
  }
  const headers = { apikey: cfg().key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t1 = ms();
  let res;
  try {
    res = await fetch(`${cfg().url}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new CloudError('offline');
  }
  let data = {};
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  // (v4.5.2) Cuánto tardó cada parte: en el celular se ve con chrome://inspect (docs/CAPTCHA.md)
  if (waited >= 0) console.info(`[FrostPom] ${path.split('?')[0]}: CAPTCHA ${Math.round(waited)} ms, servidor ${Math.round(ms() - t1)} ms`);
  if (!res.ok) throw new CloudError(classify(res.status, data || {}), data);
  return data || {};
}

/**
 * (v4.5.2) Abre de antemano la conexión con Supabase (sin enviar nada): el primer "Entrar" se ahorra
 * el saludo de la conexión segura, que en el celular puede tardar medio segundo.
 */
let preconnected = false;
export function preconnect() {
  if (preconnected || !isConfigured() || typeof document === 'undefined') return;
  preconnected = true;
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = String(cfg().url).replace(/\/+$/, '');
    link.crossOrigin = 'anonymous'; // como las llamadas de la app (credentials: 'omit')
    document.head.appendChild(link);
  } catch { /* no importa */ }
}

/**
 * (v4.5.2) La persona empezó a escribir en una ventana de entrar, crear o conectar la cuenta: se
 * prepara todo mientras escribe (la conexión y el token de Cloudflare). n = cuántas llamadas con
 * CAPTCHA puede hacer esa ventana. Nunca se llama para cuentas de menores de 13.
 */
export function warmAuth(n = 1) {
  if (!isConfigured()) return;
  preconnect();
  CAPTCHA.warm(n);
}

/** Llama a warmAuth al escribir en estos campos (si ok() lo permite en ese momento). */
export function warmOnInput(fields, n = 1, ok = () => true) {
  const go = () => { if (ok()) warmAuth(n); };
  for (const f of fields) if (f) f.addEventListener('input', go);
}

/** Contraseña aleatoria para el usuario de Supabase (nadie la conoce ni la necesita). */
function randomSecret() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return `${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}Aa1!`;
}

/** Sesión de Supabase que devuelve Auth: lo justo para usarla en el ranking. */
function sessionFrom(data) {
  if (!data || !data.access_token || !data.refresh_token) return null;
  const user = data.user || {};
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    exp: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    uid: String(user.id || ''),
    anon: user.is_anonymous === true || !user.email,
    email: String(user.email || '').trim().toLowerCase(), // (v4.5.1) de qué cuenta es la sesión
  };
}

/**
 * Registra el correo para poder recuperar la cuenta. Si ya estaba registrado, también sirve.
 * Devuelve el correo. Si Supabase entrega una sesión ("Confirm email" apagado), queda en
 * linkEmail.lastSession para que el ranking pueda pasar tu lugar a esta cuenta.
 */
export async function linkEmail(email) {
  const e = cleanEmail(email);
  if (!e) throw new CloudError('email');
  linkEmail.lastSession = null;
  try {
    const data = await call('/signup', { body: { email: e, password: randomSecret() } });
    linkEmail.lastSession = sessionFrom(data);
  } catch (err) {
    if (err.kind !== 'exists') throw err;
  }
  return e;
}
linkEmail.lastSession = null;

/** Pide a Supabase que envíe el código de recuperación al correo. */
export async function sendRecoveryCode(email) {
  const e = cleanEmail(email);
  if (!e) throw new CloudError('email');
  await call('/recover', { body: { email: e } });
}

/**
 * Comprueba el código del correo. Devuelve true si el correo es de quien lo escribió.
 * Con { keep: true } devuelve la sesión de Supabase (la usa el ranking para que tu lugar quede
 * en tu cuenta con correo); si no, la sesión se cierra enseguida.
 */
export async function verifyRecoveryCode(email, code, { keep = false } = {}) {
  const token = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6,10}$/.test(token)) throw new CloudError('badcode');
  const data = await call('/verify', { body: { type: 'recovery', email: cleanEmail(email), token } });
  if (keep) return sessionFrom(data) || true;
  if (data.access_token) call('/logout', { token: data.access_token }).catch(() => {});
  return true;
}

// ---------------------------------------------------------------------
// Cuentas en línea (v4.0): correo + contraseña
// ---------------------------------------------------------------------
/**
 * Crea la cuenta en línea con el correo y la contraseña de FrostPom. Devuelve la sesión.
 * Error 'exists' si el correo ya tiene cuenta. (Con "Confirm email" apagado, Supabase entrega
 * la sesión enseguida; si estuviera encendido, la cuenta se crea pero sin sesión: 'confirm'.)
 */
export async function signUp(email, password) {
  const e = cleanEmail(email);
  if (!e) throw new CloudError('email');
  const s = sessionFrom(await call('/signup', { body: { email: e, password } }));
  if (!s) throw new CloudError('confirm');
  return s;
}

/** Inicia sesión con correo y contraseña. Error 'badlogin' si no coinciden. */
export async function signIn(email, password) {
  const e = cleanEmail(email);
  if (!e) throw new CloudError('email');
  const s = sessionFrom(await call('/token?grant_type=password', { body: { email: e, password } }));
  if (!s) throw new CloudError('server');
  return s;
}

/**
 * (v4.9.0) Entrar con Google, Microsoft, Discord…: cambia el código de un solo uso (y el secreto
 * que inventó la app, PKCE) por la sesión. Devuelve la sesión con el proveedor. Ver js/oauth.js.
 */
export async function exchangeCode(code, verifier) {
  const data = await call('/token?grant_type=pkce', { body: { auth_code: String(code || ''), code_verifier: String(verifier || '') } });
  const s = sessionFrom(data);
  if (!s || !s.uid) throw new CloudError('auth');
  const app = (data.user && data.user.app_metadata) || {};
  s.provider = typeof app.provider === 'string' ? app.provider : '';
  s.anon = false;
  return s;
}

/** Cambia la contraseña de la cuenta en línea (con una sesión vigente). */
export async function updatePassword(token, password) {
  try {
    await call('/user', { method: 'PUT', token, body: { password } });
  } catch (e) {
    if (e.kind !== 'same') throw e; // ya era esa: no hay nada que cambiar
  }
}

/** Cierra la sesión en Supabase (si falla, no importa: en el equipo ya se borró). */
export async function signOut(token) {
  // (v4.3) scope=local: solo este equipo. Sin eso Supabase cerraba la sesión en TODOS los equipos
  // y en los otros la app dejaba de guardar el progreso y de sumar en el ranking sin decir nada.
  if (token) await call('/logout?scope=local', { token }).catch(() => {});
}

// ---------------------------------------------------------------------
// Ranking global (v3.9): sesión anónima, renovarla y llamar funciones del servidor
// ---------------------------------------------------------------------
/** Crea una cuenta anónima (Supabase → Anonymous sign-ins). Nadie ve ni necesita su contraseña. */
export async function anonSignIn() {
  const data = await call('/signup', { body: { data: {} } });
  const s = sessionFrom(data);
  if (!s) throw new CloudError('server');
  return s;
}

/** Renueva la sesión con el refresh token (la sesión dura 1 hora; el refresh, mucho más). */
export async function refreshSession(refresh) {
  const data = await call('/token?grant_type=refresh_token', { body: { refresh_token: refresh } });
  const s = sessionFrom(data);
  if (!s) throw new CloudError('auth');
  return s;
}

/**
 * Llama una función del servidor (/rest/v1/rpc/…). token = sesión del usuario (opcional:
 * get_leaderboard y username_available también funcionan sin sesión).
 * Errores: 'auth' (sesión vencida), 'notready' (el servidor del ranking aún no está montado),
 * 'name_taken', 'name_invalid', 'name_blocked', 'code_invalid', 'notfound', 'offline', 'rate' o 'server'.
 */
export async function rpc(fn, args = {}, token = '') {
  if (!isConfigured()) throw new CloudError('off');
  const headers = { apikey: cfg().key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${cfg().url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args), cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new CloudError('offline');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía (funciones que no devuelven nada) */ }
  if (res.ok) return data;
  const msg = String((data && (data.message || data.msg)) || '').toLowerCase();
  const code = String((data && data.code) || '');
  let kind = 'server';
  if (res.status === 401 || code === 'PGRST301' || code === 'PGRST303' || code === '28000' || msg.includes('jwt')) kind = 'auth';
  else if (msg.includes('name_taken')) kind = 'name_taken';
  else if (msg.includes('name_blocked')) kind = 'name_blocked';
  else if (msg.includes('name_invalid')) kind = 'name_invalid';
  else if (msg.includes('code_invalid')) kind = 'code_invalid';
  else if (msg.includes('save_conflict')) kind = 'conflict';
  else if (msg.includes('save_too_big')) kind = 'too_big';
  else if (msg.includes('account_required')) kind = 'account_required';
  // La función no existe: todavía no se corrió server/supabase/schema.sql en Supabase
  else if (code === 'PGRST202' || code === '42883' || code === 'PGRST205') kind = 'notready';
  else if (res.status === 404) kind = 'notfound';
  else if (res.status === 429 || code === '54000') kind = 'rate';
  throw new CloudError(kind, data);
}

/**
 * (v4.7.0) Llama una Edge Function de Supabase (/functions/v1/…) con la sesión de la persona.
 * Errores: 'auth', 'rate' (pidió hace muy poco), 'notready' (la función no está desplegada),
 * 'account_required', 'offline' o 'server'.
 */
export async function callFunction(name, token, body = {}) {
  if (!isConfigured()) throw new CloudError('off');
  let res;
  try {
    res = await fetch(`${cfg().url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: cfg().key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', credentials: 'omit',
    });
  } catch {
    throw new CloudError('offline');
  }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.ok) return data;
  let kind = 'server';
  if (res.status === 401) kind = 'auth';
  else if (res.status === 429) kind = 'rate';
  else if (res.status === 404) kind = 'notready';
  else if (res.status === 403) kind = 'account_required';
  throw new CloudError(kind, data);
}

/**
 * Mensaje para la persona según el tipo de error. (v4.5.1) when = 'login' (entrar con correo y
 * contraseña) cambia el texto de "demasiados intentos" (antes hablaba de códigos).
 */
export function errorText(err, { when = '' } = {}) {
  switch (err && err.kind) {
    case 'offline': return tr('No hay conexión a internet. Inténtalo cuando vuelvas a estar en línea.');
    case 'rate': return when === 'login'
      ? tr('Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.')
      : tr('Se pidieron demasiados códigos. Espera un minuto y vuelve a intentarlo.');
    case 'badcode': return tr('El código no es correcto o ya venció. Revisa el correo o pide uno nuevo.');
    case 'email': return tr('Revisa el correo: parece que está mal escrito.');
    case 'disabled': return tr('La recuperación por correo no está activa en este momento.');
    case 'notallowed': return tr('Todavía no podemos enviar correos a esa dirección. Inténtalo más adelante.');
    case 'badlogin': return tr('El correo o la contraseña no coinciden.');
    case 'exists': return tr('Ese correo ya tiene una cuenta. Toca «Inicia sesión».');
    case 'weak': return tr('Esa contraseña es muy fácil de adivinar. Prueba con otra más larga.');
    case 'confirm': return tr('Revisa tu correo para confirmar la cuenta y vuelve a intentarlo.');
    case 'off': return tr('La recuperación por correo no está configurada en esta versión.');
    case 'captcha': return tr('No pudimos comprobar que eres una persona. Revisa tu conexión e inténtalo de nuevo.');
    default: return tr('Algo falló al hablar con el servidor. Inténtalo de nuevo en un rato.');
  }
}
