/*
 * FrostPom — ranking global (v3.9). Lógica sin interfaz: sesión con el servidor, unirse,
 * avisar inicio y fin de cada pomodoro, y traer la tabla. El servidor está en
 * server/supabase/schema.sql y la guía para montarlo en docs/RANKING-GLOBAL.md.
 *
 * Cómo funciona:
 *  - Cada persona tiene una cuenta ANÓNIMA en Supabase (no pide correo). Si agrega su correo de
 *    recuperación o recupera la contraseña, su lugar pasa a la cuenta con correo, así puede
 *    recuperarlo en otro equipo.
 *  - Al EMPEZAR un pomodoro la app avisa al servidor y él anota la hora con su reloj. Al
 *    TERMINAR, el servidor acredita el menor entre lo que dice la app, lo planeado y el tiempo
 *    real. Si al empezar no había internet, ese pomodoro no cuenta en el ranking global
 *    (sí en tu progreso). Si se va el internet al terminar, el aviso se reintenta solo.
 *  - La edad se pregunta en la app (mes y año) y se queda en el dispositivo. A los menores de
 *    13 años no se los conecta con el servidor.
 *
 * Lo que se guarda en este dispositivo (st2_board): la sesión de Supabase (refresh token),
 * si ya te uniste, el nombre con el que te uniste, el pomodoro en curso y los avisos pendientes.
 */
import { config } from './config.js';
import * as CLOUD from './cloud.js';

const KEY = 'st2_board';
export const MIN_AGE = 13;

export const enabled = () => !!(config.leaderboard && config.leaderboard.mode === 'remote' && CLOUD.isConfigured());
export const capMin = () => (config.leaderboard && config.leaderboard.dailyCapMin) || 240;

// ---------------------------------------------------------------------
// Edad (mes y año de nacimiento, "YYYY-MM")
// ---------------------------------------------------------------------
export const isBirth = (v) => typeof v === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
/** Años cumplidos, con precisión de mes. En el mes del cumpleaños se cuenta como "aún no". */
export function ageYears(birth, now = new Date()) {
  if (!isBirth(birth)) return -1;
  const [y, m] = birth.split('-').map(Number);
  const months = (now.getFullYear() * 12 + now.getMonth()) - (y * 12 + (m - 1));
  return Math.floor((months - 1) / 12);
}
export const oldEnough = (birth, now = new Date()) => ageYears(birth, now) >= MIN_AGE;

/** ¿Esta cuenta puede estar en el ranking global? */
export function eligible(account, now = new Date()) {
  return enabled() && !!account && oldEnough(account.birth, now);
}

// ---------------------------------------------------------------------
// Lo guardado en el dispositivo
// ---------------------------------------------------------------------
let storage = null;
const backend = () => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};
/** Para las pruebas (y para reemplazar el almacenamiento si hiciera falta). */
export function useStorage(s) { storage = s; }

export function load() {
  try {
    const raw = backend() && backend().getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return {
      uid: typeof v.uid === 'string' ? v.uid : '',
      refresh: typeof v.refresh === 'string' ? v.refresh : '',
      anon: v.anon !== false,
      joined: v.joined === true,
      name: typeof v.name === 'string' ? v.name : '',
      asked: v.asked === true,
      noticed: v.noticed === true,
      active: v.active && Number.isFinite(v.active.start) && typeof v.active.id === 'string' ? { start: v.active.start, id: v.active.id } : null,
      pending: Array.isArray(v.pending) ? v.pending.filter((p) => p && typeof p.id === 'string').slice(-20) : [],
    };
  } catch {
    return { uid: '', refresh: '', anon: true, joined: false, name: '', asked: false, noticed: false, active: null, pending: [] };
  }
}
function save(patch) {
  const next = { ...load(), ...patch };
  try { backend() && backend().setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}
export const isJoined = () => load().joined;
export const joinedName = () => load().name;
export function markAsked() { save({ asked: true }); }
export function markNoticed() { save({ noticed: true }); }
/** Olvida todo lo del ranking en este dispositivo (al borrar la cuenta o salir del ranking). */
export function forget() {
  mem = null;
  try { backend() && backend().removeItem(KEY); } catch { /* sin almacenamiento */ }
}

// ---------------------------------------------------------------------
// Sesión con Supabase (la de acceso dura 1 hora; se renueva con el refresh token)
// ---------------------------------------------------------------------
let mem = null; // { access, exp }
const withLock = (fn) => (globalThis.navigator && navigator.locks && navigator.locks.request
  ? navigator.locks.request('frostpom-board-auth', fn)
  : fn());

function keep(session) {
  mem = { access: session.access, exp: session.exp };
  save({ uid: session.uid, refresh: session.refresh, anon: session.anon });
}

/** Token de acceso. create = crear una cuenta anónima si todavía no hay. '' si no hay sesión. */
async function token({ create = false } = {}) {
  if (mem && mem.exp - 60_000 > Date.now()) return mem.access;
  return withLock(async () => {
    if (mem && mem.exp - 60_000 > Date.now()) return mem.access;
    const st = load(); // otra pestaña pudo renovarla: se usa siempre la última guardada
    if (st.refresh) {
      try {
        keep(await CLOUD.refreshSession(st.refresh));
        return mem.access;
      } catch (e) {
        if (e.kind === 'offline' || e.kind === 'rate') throw e;
        // La sesión ya no sirve (revocada o vencida): se empieza de nuevo
        save({ refresh: '', uid: '', joined: false, active: null, pending: [] });
        mem = null;
      }
    }
    if (!create) return '';
    keep(await CLOUD.anonSignIn());
    return mem.access;
  });
}

/** Llama una función del servidor; si la sesión venció, la renueva y reintenta una vez. */
async function call(fn, args, { create = false, auth = true } = {}) {
  const tk = auth ? await token({ create }) : '';
  try {
    return await CLOUD.rpc(fn, args, tk);
  } catch (e) {
    if (e.kind !== 'auth' || !auth) throw e;
    mem = null;
    return CLOUD.rpc(fn, args, await token({ create }));
  }
}

// ---------------------------------------------------------------------
// Unirse, actualizar y salir
// ---------------------------------------------------------------------
const timeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

/**
 * Crea o actualiza tu perfil en el ranking.
 * Devuelve { ok: true } o { ok: false, kind } con kind = 'name_taken' | 'name_invalid' |
 * 'name_blocked' | 'offline' | 'notready' | 'server'…
 */
export async function join({ username, country = '', avatar = '', show = true }) {
  if (!enabled()) return { ok: false, kind: 'off' };
  try {
    await call('set_profile', {
      p_username: username, p_country: country || null, p_avatar: avatar || null,
      p_time_zone: timeZone(), p_show: show !== false,
    }, { create: true });
    save({ joined: true, name: username });
    return { ok: true };
  } catch (e) {
    return { ok: false, kind: e.kind || 'server' };
  }
}

/** Si ya te uniste, actualiza nombre, país o avatar. Mismo resultado que join(). */
export async function update(fields) {
  if (!load().joined) return { ok: true, skipped: true };
  return join(fields);
}

export async function setVisible(show) {
  if (!enabled() || !load().joined) return { ok: true, skipped: true };
  try {
    await call('set_board_visibility', { p_show: !!show });
    return { ok: true };
  } catch (e) {
    return { ok: false, kind: e.kind || 'server' };
  }
}

/** ¿Está libre este nombre en el ranking? true / false, o null si no se pudo saber. */
export async function nameAvailable(username) {
  if (!enabled()) return null;
  try {
    const tk = load().refresh ? await token().catch(() => '') : '';
    return (await CLOUD.rpc('username_available', { p_username: username }, tk)) === true;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Pomodoros
// ---------------------------------------------------------------------
/** Empezó un bloque de estudio. Sin internet no cuenta en el ranking (por diseño). */
export async function startSession(startMs, plannedSec) {
  if (!enabled() || !load().joined) return { ok: false, kind: 'notjoined' };
  await flush();
  try {
    const id = await call('start_session', { p_planned_sec: Math.round(plannedSec) });
    if (typeof id !== 'string') throw Object.assign(new Error('server'), { kind: 'server' });
    save({ active: { start: startMs, id } });
    return { ok: true };
  } catch (e) {
    save({ active: null });
    return { ok: false, kind: e.kind || 'server' };
  }
}

/** Se guardó un bloque de estudio (completo o "Terminar y guardar"). */
export async function finishSession(startMs, actualSec, xp) {
  if (!enabled()) return { ok: false, kind: 'off' };
  const st = load();
  if (!st.active || st.active.start !== startMs) return { ok: false, kind: 'nostart' };
  save({ active: null, pending: [...st.pending, { id: st.active.id, actualSec: Math.round(actualSec), xp: Math.max(0, Math.round(xp || 0)) }] });
  return flush();
}

/** Se saltó o reinició el bloque: el servidor lo da por abandonado al empezar el siguiente. */
export function dropSession(startMs) {
  const st = load();
  if (st.active && st.active.start === startMs) save({ active: null });
}

/** Envía los avisos de fin pendientes (por ejemplo, si se fue el internet). */
let flushing = null;
export function flush() {
  if (!enabled()) return Promise.resolve({ ok: true, credited: 0 });
  if (flushing) return flushing;
  flushing = (async () => {
    let credited = 0;
    let st = load();
    while (st.pending.length) {
      const p = st.pending[0];
      try {
        const rows = await call('finish_session', { p_session_id: p.id, p_actual_sec: p.actualSec, p_xp: p.xp });
        const r = Array.isArray(rows) ? rows[0] : rows;
        credited += (r && r.credited_sec) || 0;
      } catch (e) {
        if (e.kind === 'offline' || e.kind === 'rate' || e.kind === 'auth') return { ok: false, kind: e.kind, credited };
        // 'Sesión no encontrada o ya terminada' u otro error definitivo: se descarta
      }
      st = save({ pending: load().pending.filter((x) => x.id !== p.id) });
    }
    return { ok: true, credited };
  })().finally(() => { flushing = null; });
  return flushing;
}

// ---------------------------------------------------------------------
// La tabla
// ---------------------------------------------------------------------
/**
 * Filas del ranking: [{ position, nick, country, avatar, minutes, xp, isYou }].
 * Sin sesión también funciona (isYou siempre false). Lanza el error si no se pudo.
 */
export async function fetchBoard(period = 'week', limit = 30) {
  const st = load();
  const rows = await call('get_leaderboard', { p_period: period === 'season' ? 'season' : 'week', p_limit: limit }, { auth: !!st.refresh });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    position: Number(r.pos) || 0,
    nick: String(r.username || ''),
    country: typeof r.country === 'string' ? r.country : '',
    avatar: typeof r.avatar === 'string' ? r.avatar : '🐧',
    minutes: Number(r.minutes) || 0,
    xp: Number(r.xp) || 0,
    isYou: r.is_me === true,
  }));
}

/** Cuándo se reinicia la semana del ranking: el próximo lunes a las 00:00 UTC. */
export function nextWeekReset(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const add = (8 - (d.getUTCDay() || 7)) % 7 || 7; // días hasta el próximo lunes
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

// ---------------------------------------------------------------------
// Tus datos
// ---------------------------------------------------------------------
export async function exportData() {
  return call('export_my_data', {});
}

/** Borra tus datos del ranking en el servidor y olvida la sesión en este dispositivo. */
export async function deleteData() {
  if (load().refresh) await call('delete_my_account', {});
  forget();
}

// ---------------------------------------------------------------------
// Pasar tu lugar a tu cuenta con correo
// ---------------------------------------------------------------------
/**
 * session = sesión de la cuenta con correo (al agregar el correo o al recuperar la contraseña).
 * Si tu lugar estaba en una cuenta anónima, el servidor lo pasa a la del correo con un código
 * de un solo uso. Desde ahí, el ranking usa la cuenta con correo.
 */
export async function adoptSession(session) {
  if (!enabled() || !session || !session.access || !session.refresh) return { ok: false, kind: 'nosession' };
  const st = load();
  if (st.uid === session.uid) { keep(session); return { ok: true }; }
  if (st.refresh && !st.anon) return { ok: false, kind: 'already' }; // ya está en una cuenta con correo
  if (st.refresh && st.joined) {
    try {
      const code = await call('create_transfer_code', {});
      await CLOUD.rpc('redeem_transfer_code', { p_code: code }, session.access);
    } catch (e) {
      return { ok: false, kind: e.kind || 'server' };
    }
  }
  keep(session);
  // El pomodoro en curso quedó en la cuenta anterior (el servidor lo cerró): no se puede terminar
  save({ active: null, pending: [] });
  return { ok: true };
}
