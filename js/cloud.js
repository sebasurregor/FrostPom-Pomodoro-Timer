/*
 * FrostPom — conexión con Supabase: recuperar la contraseña por correo (v3.7) y, desde la
 * v3.9, la sesión y las funciones del ranking global (ver js/board.js).
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

const cfg = () => config.cloud || {};
export const isConfigured = () => !!(cfg().url && cfg().key);

/** Correo con forma válida (no garantiza que exista: eso lo prueba el código). */
export function cleanEmail(value) {
  const v = String(value || '').trim().toLowerCase();
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
  // Sin SMTP propio, Supabase solo envía correos al equipo del proyecto
  if (code.includes('not_authorized') || msg.includes('not authorized')) return 'notallowed';
  if (status === 429 || code.includes('rate_limit') || msg.includes('rate limit') || msg.includes('only request this after')) return 'rate';
  if (code.includes('email_address_invalid') || msg.includes('email address') || code.includes('validation')) return 'email';
  if (code.includes('already') || msg.includes('already registered')) return 'exists';
  if (code.includes('otp_expired') || code.includes('otp') || msg.includes('expired') || msg.includes('invalid')) return 'badcode';
  if (code.includes('anonymous_provider_disabled') || msg.includes('anonymous sign-ins are disabled')) return 'notready';
  if (code.includes('signup_disabled') || code.includes('email_provider_disabled')) return 'disabled';
  return 'server';
}

async function call(path, { body, token, method = 'POST' } = {}) {
  if (!isConfigured()) throw new CloudError('off');
  const headers = { apikey: cfg().key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${cfg().url}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new CloudError('offline');
  }
  let data = {};
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) throw new CloudError(classify(res.status, data || {}), data);
  return data || {};
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
  // La función no existe: todavía no se corrió server/supabase/schema.sql en Supabase
  else if (code === 'PGRST202' || code === '42883' || code === 'PGRST205') kind = 'notready';
  else if (res.status === 404) kind = 'notfound';
  else if (res.status === 429 || code === '54000') kind = 'rate';
  throw new CloudError(kind, data);
}

/** Mensaje para la persona según el tipo de error. */
export function errorText(err) {
  switch (err && err.kind) {
    case 'offline': return tr('No hay conexión a internet. Inténtalo cuando vuelvas a estar en línea.');
    case 'rate': return tr('Se pidieron demasiados códigos. Espera un minuto y vuelve a intentarlo.');
    case 'badcode': return tr('El código no es correcto o ya venció. Revisa el correo o pide uno nuevo.');
    case 'email': return tr('Revisa el correo: parece que está mal escrito.');
    case 'disabled': return tr('La recuperación por correo no está activa en este momento.');
    case 'notallowed': return tr('Todavía no podemos enviar correos a esa dirección. Inténtalo más adelante.');
    case 'off': return tr('La recuperación por correo no está configurada en esta versión.');
    default: return tr('Algo falló al hablar con el servidor. Inténtalo de nuevo en un rato.');
  }
}
