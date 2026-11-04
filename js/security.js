/*
 * FrostPom — contraseña de la cuenta.
 * La contraseña NUNCA se guarda: se guarda un hash PBKDF2-SHA256 con sal aleatoria.
 * Tras 5 intentos fallidos se bloquea 60 segundos (y el bloqueo crece si siguen fallando).
 *
 * Importante: mientras la cuenta viva solo en el dispositivo, esto protege el progreso de
 * quien use el mismo teléfono, pero no es una caja fuerte. La protección real de las cuentas
 * debe vivir en el servidor (ver docs/SEGURIDAD.md).
 */
const ITERATIONS = 210000;
export const MAX_FAILS = 5;
const BASE_LOCK_MS = 60 * 1000;

const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null);
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

export function isAvailable() {
  return !!subtle();
}
async function derive(secret, saltBytes, iterations) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toHex(bits);
}

// Comparación en tiempo constante (no revela cuántos caracteres coinciden).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Contraseña de la cuenta: 8 a 64 caracteres, con al menos una letra y un número.
export function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return { ok: false, reason: 'La contraseña debe tener al menos 8 caracteres.' };
  if (pw.length > 64) return { ok: false, reason: 'La contraseña es demasiado larga (máximo 64).' };
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(pw) || !/\d/.test(pw)) return { ok: false, reason: 'Usa al menos una letra y un número.' };
  if (/^(.)\1+$/.test(pw) || /12345678|password|contrasena|contraseña|qwerty/i.test(pw)) return { ok: false, reason: 'Esa contraseña es muy fácil de adivinar.' };
  return { ok: true };
}
export async function hashPassword(pw) {
  if (!isAvailable()) throw new Error('Este navegador no permite guardar una contraseña segura (abre la app desde https o localhost).');
  const c = checkPassword(pw);
  if (!c.ok) throw new Error(c.reason);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return { hash: await derive(pw, salt, ITERATIONS), salt: toHex(salt), iter: ITERATIONS };
}
export async function verifyPassword(pw, record) {
  if (!record || !isAvailable() || typeof pw !== 'string' || pw.length > 64) return false;
  return safeEqual(await derive(pw, fromHex(record.salt), record.iter), record.hash);
}

export function lockRemainingMs(guard, now = Date.now()) {
  return Math.max(0, (guard.lockedUntil || 0) - now);
}
export function registerFailure(guard, now = Date.now()) {
  const fails = (guard.fails || 0) + 1;
  let lockedUntil = guard.lockedUntil || 0;
  if (fails >= MAX_FAILS) {
    const rounds = fails - MAX_FAILS; // cada ronda extra duplica el bloqueo
    lockedUntil = now + BASE_LOCK_MS * Math.pow(2, Math.min(rounds, 6));
  }
  return { fails, lockedUntil };
}
