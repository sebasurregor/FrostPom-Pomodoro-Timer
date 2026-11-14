/*
 * FrostPom — cuentas en línea (v4.0): guardar y traer el progreso.
 *
 *  - Solo las cuentas con correo y contraseña (mayores de 13) guardan su progreso en Supabase,
 *    para entrar desde cualquier equipo. Las de menores de 13 viven solo en su dispositivo.
 *  - Se guarda TODO menos la foto de perfil y la cuenta local (la huella de la contraseña).
 *    El servidor también las quita, por si acaso (server/supabase/schema.sql: save_progress).
 *  - Cada guardado lleva una versión. Si otro equipo guardó después, (v4.5) se JUNTAN los
 *    cambios de los dos con la mezcla de tres copias (js/merge.js): la última copia que este
 *    equipo sincronizó (la "base"), la de aquí y la de la nube. Así no se pierde una compra ni
 *    los minutos del que estudió menos. Sin base (la primera vez con la v4.5) gana, como antes,
 *    la copia con MÁS tiempo estudiado.
 *  - Sin internet la app sigue igual; lo pendiente se sube cuando vuelve la conexión.
 *
 * En el dispositivo: st2_sync (la versión que tiene este equipo, si hay cambios sin subir y
 * cuándo fue el último) y st2_sync_base (la base, sin la cuenta local ni la foto).
 */
import { config } from './config.js';
import * as CLOUD from './cloud.js';
import * as BOARD from './board.js';
import { validateState } from './storage.js';
import { checkUsername } from './identity.js';
import { mergeStates } from './merge.js';

const KEY = 'st2_sync';
const BASE_KEY = 'st2_sync_base';
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
    return {
      version: Number.isInteger(v.version) && v.version >= 0 ? v.version : 0,
      dirty: v.dirty === true,
      at: typeof v.at === 'string' ? v.at : '',
      rev: Number.isInteger(v.rev) && v.rev >= 0 ? v.rev : 0, // (v4.5) cuenta los cambios hechos aquí
      editAt: typeof v.editAt === 'string' ? v.editAt : '', // (v4.5) el último cambio hecho aquí
    };
  } catch {
    return { version: 0, dirty: false, at: '', rev: 0, editAt: '' };
  }
}
function save(patch) {
  const next = { ...load(), ...patch };
  try { backend() && backend().setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}
export const markDirty = () => save({ dirty: true, rev: load().rev + 1, editAt: new Date().toISOString() });
/** Este equipo ya tiene la versión v de la nube (se acaba de traer). data = esa copia (la base). */
export function adopted(v, data) {
  if (data) setBase(data);
  return save({ version: Number(v) || 0, dirty: false, at: new Date().toISOString() });
}
export const lastSync = () => load().at;
export function forget() {
  try {
    if (backend()) {
      backend().removeItem(KEY);
      backend().removeItem(BASE_KEY);
    }
  } catch { /* sin almacenamiento */ }
}

// ---------------------------------------------------------------------
// (v4.5) La base: la última copia que este equipo sincronizó con la nube
// ---------------------------------------------------------------------
/** La base (validada), o null si todavía no hay (o no sirve). */
export function loadBase() {
  try {
    const raw = backend() && backend().getItem(BASE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? snapshot(validateState({ ...data, account: null })) : null;
  } catch {
    return null;
  }
}
function setBase(data) {
  try { backend() && backend().setItem(BASE_KEY, JSON.stringify(snapshot(data))); } catch { /* sin espacio: sin base, gana el que más estudió */ }
}
const ms = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
};
/**
 * Junta la base, lo de aquí (mine: la copia que se tomó ANTES de esperar al servidor) y lo de la
 * nube (remote). state solo pone la cuenta local y la foto. Lo que cambie aquí mientras tanto lo
 * agrega rebase() (si se usara el estado de ahora, esos cambios se contarían dos veces).
 */
function mergeWith(base, mine, remote, state) {
  const merged = mergeStates(base, mine, snapshot(restore(remote.data, state)), { mineAt: ms(load().editAt), theirsAt: ms(remote.at) });
  return restore(merged, state);
}

/**
 * Lo que llegó de la nube (next) más lo que cambió aquí mientras se esperaba la respuesta (de
 * from a current). changed = hubo cambios aquí (y hay que volver a subir).
 */
export function rebase(next, from, current) {
  if (!from) return { state: next, changed: false };
  const now = snapshot(current);
  if (JSON.stringify(now) === JSON.stringify(from)) return { state: next, changed: false };
  return { state: restore(mergeStates(from, now, snapshot(next), { mineAt: Date.now(), theirsAt: 0 }), current), changed: true };
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
 *  { ok: true, adopt: estado, from }              → otro equipo guardó algo: usa este (los dos
 *                                                   juntos); from = lo que se intentó subir
 *  { ok: false, kind }                            → no se pudo (offline, sin sesión…)
 */
let pushing = null;
// (v4.3) Freno de seguridad: nunca se intenta guardar más de una vez cada 5 s, y si el choque de
// versiones no se resuelve 3 veces seguidas, se deja de intentar hasta volver a abrir la app
// (un aparato atascado llegó a llamar al servidor una vez por segundo durante horas).
const MIN_GAP_MS = 5000;
let lastTry = 0;
let conflicts = 0;
export function push(state, { force = false } = {}) {
  if (!enabled()) return Promise.resolve({ ok: false, kind: 'off' });
  if (pushing) return pushing.then(() => push(state, { force }));
  if (conflicts >= 3) return Promise.resolve({ ok: false, kind: 'stuck' });
  if (!force && Date.now() - lastTry < MIN_GAP_MS) return Promise.resolve({ ok: false, kind: 'wait' });
  lastTry = Date.now();
  pushing = (async () => {
    try {
      if (!BOARD.hasAccountSession()) return { ok: false, kind: 'nosession' };
      const snap = snapshot(state);
      const rev = load().rev;
      // Guardado: si mientras tanto hubo cambios aquí, siguen pendientes
      const done = (v, data) => {
        setBase(data);
        save({ version: Number(v) || 0, dirty: load().rev !== rev, at: new Date().toISOString() });
      };
      try {
        done(await BOARD.callServer('save_progress', { p_data: snap, p_base_version: load().version }), snap);
        return { ok: true };
      } catch (e) {
        if (e.kind !== 'conflict') throw e;
        const remote = await pull();
        const base = loadBase();
        if (remote && base) {
          // (v4.5) Otro equipo guardó después: se juntan los cambios de los dos
          const merged = mergeWith(base, snap, remote, state);
          const up = snapshot(merged);
          done(await BOARD.callServer('save_progress', { p_data: up, p_base_version: remote.version }), up);
          return { ok: true, adopt: merged, from: snap };
        }
        // Sin base (la primera vez con la v4.5): gana la copia con más tiempo estudiado
        if (remote && studied(remote.data) > studied(snap)) {
          adopted(remote.version, remote.data);
          return { ok: true, adopt: restore(remote.data, state), from: snap };
        }
        done(await BOARD.callServer('save_progress', { p_data: snap, p_base_version: remote ? remote.version : 0 }), snap);
        return { ok: true };
      }
    } catch (e) {
      if (e.kind === 'conflict') {
        conflicts += 1;
        console.warn(`[FrostPom] No se pudo guardar en tu cuenta: otro equipo guardó al mismo tiempo (${conflicts}/3).`);
      }
      return { ok: false, kind: e.kind || 'server' };
    }
  })().then((r) => { if (r.ok) conflicts = 0; return r; }).finally(() => { pushing = null; });
  return pushing;
}

/**
 * Al abrir la app (y, desde la v4.5, cuando otro equipo guardó algo): si la nube tiene una
 * versión más nueva que la de este equipo, se trae; si aquí también hay cambios sin subir, se
 * juntan. Devuelve { adopt: estado, from } si hay que reemplazar el progreso local y
 * { push: true } si después hay que subir lo de aquí.
 * current = el estado de aquí, o una función que lo devuelve (así se usa el de DESPUÉS de esperar).
 */
export async function syncOnOpen(current) {
  if (!enabled() || !BOARD.hasAccountSession()) return {};
  try {
    if (pushing) await pushing; // primero termina lo que se estaba subiendo
    const remote = await pull();
    const state = typeof current === 'function' ? current() : current;
    const from = snapshot(state); // lo de aquí, justo ahora (desde aquí no se espera nada más)
    const mine = load();
    if (remote && remote.version > mine.version) {
      if (!mine.dirty) {
        adopted(remote.version, remote.data);
        return { adopt: restore(remote.data, state), from };
      }
      const base = loadBase();
      if (base) {
        // Los dos equipos cambiaron cosas: se juntan, y la mezcla se sube (sigue pendiente)
        const merged = mergeWith(base, from, remote, state);
        setBase(remote.data);
        save({ version: remote.version });
        return { adopt: merged, from, push: true };
      }
      // Sin base (la primera vez con la v4.5): gana el que más estudió
      if (studied(remote.data) >= studied(state)) {
        adopted(remote.version, remote.data);
        return { adopt: restore(remote.data, state), from };
      }
      save({ version: remote.version });
    }
    // (v4.5) Al día y sin cambios aquí: esa copia es la base (así la próxima vez ya se puede juntar)
    if (remote && remote.version === mine.version && !mine.dirty && !loadBase()) setBase(remote.data);
    return !remote || mine.dirty ? { push: true } : {};
  } catch {
    return {};
  }
}
