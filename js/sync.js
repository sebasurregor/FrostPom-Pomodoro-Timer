/*
 * FrostPom — cuentas en línea (v4.0): guardar y traer el progreso.
 *
 *  - Solo las cuentas con correo y contraseña (mayores de 13) guardan su progreso en Supabase,
 *    para entrar desde cualquier equipo. Las de menores de 13 viven solo en su dispositivo.
 *  - Se guarda TODO menos la foto de perfil y la cuenta local (la huella de la contraseña).
 *    El servidor también las quita, por si acaso (server/supabase/schema.sql: save_progress).
 *  - Cada guardado lleva una versión. Si otro equipo guardó después, gana la copia con MÁS
 *    tiempo estudiado, para no perder progreso.
 *  - Sin internet la app sigue igual; lo pendiente se sube cuando vuelve la conexión.
 *
 * En el dispositivo (st2_sync) solo se guarda la versión que tiene este equipo y si hay
 * cambios sin subir.
 */
import { config } from './config.js';
import * as CLOUD from './cloud.js';
import * as BOARD from './board.js';
import { validateState } from './storage.js';
import { checkUsername } from './identity.js';

const KEY = 'st2_sync';
export const enabled = () => !!(config.accounts && config.accounts.online) && CLOUD.isConfigured();

let storage = null;
const backend = () => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};
/** Para las pruebas. */
export function useStorage(s) { storage = s; }

export function load() {
  try {
    const v = JSON.parse((backend() && backend().getItem(KEY)) || '{}');
    return { version: Number.isInteger(v.version) && v.version >= 0 ? v.version : 0, dirty: v.dirty === true, at: typeof v.at === 'string' ? v.at : '' };
  } catch {
    return { version: 0, dirty: false, at: '' };
  }
}
function save(patch) {
  const next = { ...load(), ...patch };
  try { backend() && backend().setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}
export const markDirty = () => save({ dirty: true });
/** Este equipo ya tiene la versión v de la nube (se acaba de traer). */
export const adopted = (v) => save({ version: Number(v) || 0, dirty: false, at: new Date().toISOString() });
export const lastSync = () => load().at;
export function forget() {
  try { backend() && backend().removeItem(KEY); } catch { /* sin almacenamiento */ }
}

/** Lo que se sube: todo menos la cuenta local y la foto. */
export function snapshot(state) {
  const d = JSON.parse(JSON.stringify(state));
  delete d.account;
  if (d.profile) d.profile.photo = '';
  return d;
}

/** Cuánto ha estudiado esta copia (para decidir cuál gana si dos equipos guardaron a la vez). */
export const studied = (s) => Number(s && s.progress && s.progress.totals && s.progress.totals.studySec) || 0;

/**
 * Convierte lo guardado en la nube en un estado válido para este equipo, conservando la cuenta
 * local y la foto de este equipo. validateState() limpia cualquier cosa rara.
 */
export function restore(data, local) {
  const account = local && local.account ? { ...local.account } : null;
  // El nombre de usuario viaja con el progreso: si se cambió en otro equipo, aquí también cambia
  const nick = data && data.profile && data.profile.nick;
  if (account && checkUsername(nick).ok) account.username = checkUsername(nick).value;
  const next = validateState({ ...data, account });
  next.profile.onboarded = !!next.profile.nick;
  next.profile.photo = (local && local.profile && local.profile.photo) || '';
  return next;
}

/** Trae lo guardado: { data, version } o null si la cuenta todavía no tiene nada. */
export async function pull() {
  const rows = await BOARD.callServer('load_progress', {});
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (!r || !r.data) return null;
  return { data: r.data, version: Number(r.version) || 0, at: r.updated_at || '' };
}

/**
 * Sube el progreso. Devuelve:
 *  { ok: true }                                   → guardado
 *  { ok: true, adopt: estado }                    → otro equipo tenía más progreso: usa este
 *  { ok: false, kind }                            → no se pudo (offline, sin sesión…)
 */
let pushing = null;
export function push(state) {
  if (!enabled()) return Promise.resolve({ ok: false, kind: 'off' });
  if (pushing) return pushing.then(() => push(state));
  pushing = (async () => {
    try {
      if (!BOARD.hasAccountSession()) return { ok: false, kind: 'nosession' };
      const snap = snapshot(state);
      try {
        const v = await BOARD.callServer('save_progress', { p_data: snap, p_base_version: load().version });
        save({ version: Number(v) || 0, dirty: false, at: new Date().toISOString() });
        return { ok: true };
      } catch (e) {
        if (e.kind !== 'conflict') throw e;
        // Otro equipo guardó después: gana la copia con más tiempo estudiado
        const remote = await pull();
        if (remote && studied(remote.data) > studied(state)) {
          save({ version: remote.version, dirty: false, at: new Date().toISOString() });
          return { ok: true, adopt: restore(remote.data, state) };
        }
        const v = await BOARD.callServer('save_progress', { p_data: snap, p_base_version: remote ? remote.version : 0 });
        save({ version: Number(v) || 0, dirty: false, at: new Date().toISOString() });
        return { ok: true };
      }
    } catch (e) {
      return { ok: false, kind: e.kind || 'server' };
    }
  })().finally(() => { pushing = null; });
  return pushing;
}

/**
 * Al abrir la app: si la nube tiene una versión más nueva que la de este equipo, se trae.
 * Devuelve { adopt: estado } si hay que reemplazar el progreso local, o {}.
 */
export async function syncOnOpen(state) {
  if (!enabled() || !BOARD.hasAccountSession()) return {};
  try {
    const remote = await pull();
    const mine = load();
    if (remote && remote.version > mine.version) {
      // Hay algo más nuevo en la nube. Si este equipo también tiene cambios sin subir, gana el que más estudió.
      if (!mine.dirty || studied(remote.data) >= studied(state)) {
        save({ version: remote.version, dirty: false, at: new Date().toISOString() });
        return { adopt: restore(remote.data, state) };
      }
      save({ version: remote.version });
    }
    if (!remote || mine.dirty) await push(state);
    return {};
  } catch {
    return {};
  }
}
