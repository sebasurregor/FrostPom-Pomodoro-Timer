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

/**
 * ¿Esta cuenta puede estar en el ranking global? Una cuenta en línea (v4.0) cuenta como mayor
 * de 13: solo se crea para ellos (en otro equipo, la fecha de nacimiento no viaja).
 */
export function eligible(account, now = new Date()) {
  return enabled() && !!account && (account.online === true || oldEnough(account.birth, now));
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
      // (v4.5.1) El correo de la sesión (para saber si es la de TU cuenta en línea)
      email: typeof v.email === 'string' ? v.email : '',
      // (v4.5.1) La sesión con correo se cerró en este equipo: hay que volver a entrar (no se crea una anónima)
      relink: v.relink === true,
      // (v4.5.1) Sesión anterior cuyo lugar en el ranking falta pasar a esta cuenta (se reintenta)
      from: typeof v.from === 'string' ? v.from : '',
      // (v4.5.1) El último problema al avisarle al ranking (para decir la causa real en la vista Ranking)
      issue: v.issue && typeof v.issue.kind === 'string' && Number.isFinite(v.issue.at) ? { kind: v.issue.kind, at: v.issue.at } : null,
    };
  } catch {
    return { uid: '', refresh: '', anon: true, joined: false, name: '', asked: false, noticed: false, active: null, pending: [], email: '', relink: false, from: '', issue: null };
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
/** (v4.5.1) El nombre cambió sin internet: al volver, ensureJoined lo manda otra vez. */
export function markRejoin() { save({ joined: false }); }
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

/**
 * (v4.5.1) Lo que dice el token de acceso de Supabase (un JWT): sub, email, is_anonymous…
 * Solo se LEE para saber de qué cuenta es la sesión; la firma la revisa el servidor.
 */
export function claimsOf(access) {
  try {
    const part = String(access || '').split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

const withLock = (fn) => (globalThis.navigator && navigator.locks && navigator.locks.request
  ? navigator.locks.request('frostpom-board-auth', fn)
  : fn());

function keep(session) {
  mem = { access: session.access, exp: session.exp };
  const c = claimsOf(session.access);
  const email = String(session.email || (c && c.email) || '').trim().toLowerCase();
  save({ uid: session.uid, refresh: session.refresh, anon: session.anon, email: session.anon ? '' : email, relink: false });
}

/** (v4.5.1) Un error con su tipo, como los de cloud.js. */
const fail = (kind) => Object.assign(new Error(kind), { kind });

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
        mem = null;
        if (!st.anon) {
          // (v4.5.1) Se cerró la sesión de tu cuenta CON CORREO (por ejemplo, cambiaste o recuperaste la
          // contraseña en otro equipo: Supabase cierra las demás sesiones). Antes aquí se creaba una
          // cuenta anónima nueva: aparecías en el ranking como otra persona, tu nombre quedaba "ocupado"
          // por ti mismo y tus horas iban a otro lado. Ahora se espera a que vuelvas a entrar.
          save({ refresh: '', joined: false, relink: true });
          console.warn('[FrostPom] La sesión de tu cuenta con correo se cerró en este equipo: hay que volver a entrar.');
          return '';
        }
        // La sesión anónima ya no sirve (se borró por inactividad): se empieza de nuevo
        save({ refresh: '', uid: '', joined: false, active: null, pending: [] });
      }
    }
    if (!create || load().relink) return '';
    keep(await CLOUD.anonSignIn());
    return mem.access;
  });
}

/** Llamar al servidor con la sesión de este equipo (renueva y reintenta si venció). */
export const callServer = (fn, args, opts) => call(fn, args, opts);
/** Token de la sesión de este equipo (también la usa la cuenta en línea). '' si no hay. */
export const authToken = (opts) => token(opts);
/** ¿La sesión guardada es de una cuenta con correo (no anónima)? */
export const hasAccountSession = () => { const st = load(); return !!st.refresh && !st.anon; };
/**
 * (v4.5.1) ¿La sesión de este equipo es de OTRA cuenta con correo, distinta de email? Pasaba al
 * conectar con un correo distinto al de recuperación: el progreso se guardaba en la otra cuenta.
 */
export function sessionMismatch(email) {
  const st = load();
  const want = String(email || '').trim().toLowerCase();
  return !!(st.refresh && !st.anon && st.email && want && st.email !== want);
}
/** (v4.5.1) ¿Hay que volver a entrar para que el ranking siga sumando en tu cuenta con correo? */
export const needsRelink = () => load().relink;
/** (v4.5.1) Anota (o borra, con kind = '') el último problema al hablar con el ranking. */
export function noteIssue(kind) {
  save({ issue: kind ? { kind, at: Date.now() } : null });
}

/** Llama una función del servidor; si la sesión venció, la renueva y reintenta una vez. */
async function call(fn, args, { create = false, auth = true } = {}) {
  const tk = auth ? await token({ create }) : '';
  // (v4.5.1) Sin sesión no se molesta al servidor: se sabe que va a decir que no
  if (auth && !tk) throw fail(load().relink ? 'relink' : 'nosession');
  try {
    return await CLOUD.rpc(fn, args, tk);
  } catch (e) {
    if (e.kind !== 'auth' || !auth) throw e;
    mem = null;
    const again = await token({ create });
    if (!again) throw fail(load().relink ? 'relink' : 'nosession');
    return CLOUD.rpc(fn, args, again);
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
export async function join({ username, country = '', avatar = '', show = true }, { create = true } = {}) {
  if (!enabled()) return { ok: false, kind: 'off' };
  try {
    // create = false (cuenta en línea): nunca se inventa una sesión anónima; si la sesión de la
    // cuenta se cerró, hay que volver a entrar (si no, el nombre quedaba "ocupado" por la otra)
    if (load().relink) return { ok: false, kind: 'relink' };
    if (!create && !load().refresh) return { ok: false, kind: 'nosession' };
    await call('set_profile', {
      p_username: username, p_country: country || null, p_avatar: avatar || null,
      p_time_zone: timeZone(), p_show: show !== false,
    }, { create });
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

/**
 * (v4.8.2) ¿Cómo está TU nombre en el ranking? { username, status } con status 'ok', 'optout',
 * 'blocked' (palabra prohibida), 'hidden' (reportes o moderación) o 'none'. null si no se pudo saber
 * (sin internet, sin sesión, o el servidor todavía no tiene la función: falta correr schema.sql).
 */
export async function myStatus() {
  if (!enabled() || !load().joined || !load().refresh) return null;
  try {
    const rows = await call('my_board_status', {});
    const r = Array.isArray(rows) ? rows[0] : rows;
    const ok = ['ok', 'optout', 'blocked', 'hidden', 'none'];
    return r && ok.includes(r.status) ? { username: typeof r.username === 'string' ? r.username : '', status: r.status } : null;
  } catch {
    return null;
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
    save({ active: { start: startMs, id }, issue: null });
    return { ok: true, id };
  } catch (e) {
    save({ active: null, issue: { kind: e.kind || 'server', at: Date.now() } });
    console.warn(`[FrostPom] El ranking no pudo anotar el inicio de este pomodoro (${e.kind || 'server'}).`);
    return { ok: false, kind: e.kind || 'server' };
  }
}

/**
 * Se guardó un bloque de estudio (completo o "Terminar y guardar").
 * (v4.5) rankId = el número de la sesión del ranking que viajó con el reloj en vivo: así la
 * termina el aparato que guardó el pomodoro aunque lo haya empezado otro.
 */
export async function finishSession(startMs, actualSec, xp, rankId = '') {
  if (!enabled()) return { ok: false, kind: 'off' };
  const st = load();
  const rank = typeof rankId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(rankId) ? rankId : '';
  const mine = st.active && (st.active.start === startMs || (rank && st.active.id === rank)) ? st.active.id : '';
  const id = mine || rank;
  if (!id) return { ok: false, kind: 'nostart' };
  if (st.pending.some((p) => p.id === id)) return flush(); // ya estaba anotado
  save({ active: mine ? null : st.active, pending: [...st.pending, { id, actualSec: Math.round(actualSec), xp: Math.max(0, Math.round(xp || 0)) }] });
  return flush();
}

/** Se saltó o reinició el bloque: el servidor lo da por abandonado al empezar el siguiente. */
export function dropSession(startMs, rankId = '') {
  const st = load();
  if (st.active && (st.active.start === startMs || (rankId && st.active.id === rankId))) save({ active: null });
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
        // (v4.5.1) Sin sesión (o hay que volver a entrar) tampoco se descarta: se envía después
        if (['offline', 'rate', 'auth', 'nosession', 'relink'].includes(e.kind)) return { ok: false, kind: e.kind, credited };
        // 'Sesión no encontrada o ya terminada' u otro error definitivo: se descarta (y queda en F12)
        console.warn(`[FrostPom] El ranking no aceptó el final de un pomodoro (${e.kind || 'server'}).`);
        save({ issue: { kind: 'finish', at: Date.now() } });
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
// (v4.1) Reportar un nombre (normas de la comunidad; lo piden Google Play y App Store)
// ---------------------------------------------------------------------
export const REPORT_REASONS = Object.freeze(['ofensivo', 'suplantacion', 'datos', 'otro']);

/** ¿Este equipo puede reportar por el servidor? (necesita una sesión: con correo o anónima). */
export const canReport = () => enabled() && !!load().refresh;

/**
 * Reporta un nombre del ranking. { ok: true } o { ok: false, kind } con kind = 'nosession'
 * (sin sesión: hay que escribir por correo) | 'rate' (demasiados hoy) | 'offline' | 'notready'…
 * El servidor no dice si el nombre existe ni si ya se ocultó.
 */
export async function reportName(nick, reason) {
  if (!REPORT_REASONS.includes(reason) || typeof nick !== 'string' || !nick.trim()) return { ok: false, kind: 'invalid' };
  if (!canReport()) return { ok: false, kind: 'nosession' };
  try {
    await call('report_name', { p_username: nick.trim(), p_reason: reason });
    return { ok: true };
  } catch (e) {
    return { ok: false, kind: e.kind || 'server' };
  }
}

// ---------------------------------------------------------------------
// Tus datos
// ---------------------------------------------------------------------
/** Borra tus datos del ranking en el servidor y olvida la sesión en este dispositivo. */
export async function deleteData() {
  if (load().refresh) await call('delete_my_account', {});
  forget();
}

// ---------------------------------------------------------------------
// Pasar tu lugar a tu cuenta con correo
// ---------------------------------------------------------------------
/** Pasa el perfil del ranking de la sesión `fromAccess` a la sesión `toAccess` (códigos de un solo uso). */
async function transfer(fromAccess, toAccess) {
  const code = await CLOUD.rpc('create_transfer_code', {}, fromAccess);
  await CLOUD.rpc('redeem_transfer_code', { p_code: code }, toAccess);
}

/**
 * session = sesión de la cuenta con correo (al agregar el correo, al recuperar la contraseña, al
 * conectar o al entrar). Si tu lugar estaba en otra sesión de este equipo, el servidor lo pasa a esta
 * cuenta con un código de un solo uso. Desde ahí, el ranking usa la cuenta con correo.
 *
 * (v4.5.1) takeover = la cuenta EN LÍNEA de este equipo es la de `session` (conectar, entrar de
 * nuevo, crear la cuenta). Entonces:
 *  - la sesión SIEMPRE pasa a ser la de esa cuenta (antes, si fallaba el paso del lugar, se quedaba
 *    la anónima o la de OTRO correo, y el progreso no se guardaba o se guardaba en otra cuenta);
 *  - el lugar se pasa también desde una sesión con otro correo (las dos están en este equipo: es la
 *    misma persona);
 *  - si no se pudo pasar ahora (sin internet), se reintenta después (retryTransfer).
 */
export async function adoptSession(session, { takeover = false } = {}) {
  if (!session || !session.access || !session.refresh) return { ok: false, kind: 'nosession' };
  if (!enabled()) { keep(session); return { ok: true }; } // sin ranking: solo se guarda la sesión (cuenta en línea)
  const st = load();
  if (st.uid === session.uid) {
    keep(session); // la misma cuenta (por ejemplo, al volver a entrar): todo sigue igual
    return { ok: true };
  }
  if (st.refresh && !st.anon && !takeover) return { ok: false, kind: 'already' }; // ya está en una cuenta con correo
  let pendingFrom = '';
  if (st.refresh && (st.joined || takeover)) {
    try {
      const old = await token(); // la sesión anterior (si ya no sirve, no hay nada que pasar)
      if (old) await transfer(old, session.access);
    } catch (e) {
      if (!takeover) return { ok: false, kind: e.kind || 'server' };
      // Sin internet o el servidor no respondió: se guarda la sesión anterior para reintentarlo
      if (['offline', 'rate', 'server', 'notready', 'timeout'].includes(e.kind)) pendingFrom = load().refresh;
      console.warn(`[FrostPom] Tu lugar en el ranking se pasará a tu cuenta más tarde (${e.kind || 'server'}).`);
    }
  }
  keep(session);
  // El pomodoro en curso quedó en la cuenta anterior (el servidor lo cerró): no se puede terminar.
  // joined = false: al unirse se vuelve a mandar tu nombre (si las dos tenían perfil, queda el tuyo).
  save({ active: null, pending: [], joined: false, from: pendingFrom, issue: null });
  return { ok: true };
}

/**
 * (v4.5.1) Reintenta pasar tu lugar del ranking desde la sesión anterior de este equipo (si al
 * conectar no había internet). { ok, moved } o { ok: false, kind }.
 */
export async function retryTransfer() {
  const st = load();
  if (!enabled() || !st.from || !st.refresh || st.anon) return { ok: true, moved: false };
  try {
    const old = await CLOUD.refreshSession(st.from);
    save({ from: old.refresh });
    await transfer(old.access, await token());
    save({ from: '', joined: false });
    return { ok: true, moved: true };
  } catch (e) {
    if (!['offline', 'rate', 'timeout'].includes(e.kind)) save({ from: '' }); // ya no se puede: no se insiste
    return { ok: false, kind: e.kind || 'server' };
  }
}
