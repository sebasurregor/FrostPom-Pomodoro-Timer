/*
 * FrostPom — el reloj en vivo en todos tus aparatos (v4.5): la parte sin pantalla.
 * Lo que se ve (avisos, cuándo preguntar) está en js/ui/live.js; el servidor, en
 * server/supabase/schema.sql (get_timer, set_timer y claim_block).
 *
 * Cómo funciona:
 *  - El servidor guarda UN reloj por cuenta: modo, si corre o está en pausa, cuánto lleva, el
 *    número del bloque y el de su sesión del ranking. Las horas van con el reloj del SERVIDOR.
 *  - Cada aparato calcula cuánto se adelanta o atrasa su reloj ("offset") con la hora que le
 *    devuelve el servidor en cada respuesta. Así todos muestran lo mismo aunque la hora del
 *    teléfono esté mal.
 *  - Cada vez que tocas algo, el aparato envía el reloj completo con la HORA de la acción. El
 *    servidor se queda con la acción más reciente; si otro aparato hizo algo después, te
 *    devuelve lo suyo y este aparato se pone igual.
 *  - Cuando un bloque llega a cero en dos aparatos, claim_block dice "sí" a uno solo: ese guarda
 *    la XP y los minutos. Si no hay internet, se guarda aquí y se pregunta después (y si otro ya
 *    lo había guardado, se quita de aquí).
 *
 * Privacidad: al servidor no se le manda ningún identificador del aparato. Cada acción y cada
 * "¿quién guarda este bloque?" llevan un número al azar NUEVO (para que un reintento se reconozca
 * como el mismo), así que no sirven para saber qué aparato es ni para unir una acción con otra.
 *
 * En el dispositivo (st2_live): la última acción sin enviar, lo que se sabe de los bloques
 * terminados y la diferencia de reloj.
 */
import * as BOARD from './board.js';
import { isBlockId, MODES } from './timer.js';

const KEY = 'st2_live';
/** Cada cuánto pregunta un aparato que se está viendo. */
export const POLL_MS = 10_000;
/** Cuánto se espera la respuesta de "¿quién guarda este bloque?" antes de seguir sin ella. */
export const CLAIM_TIMEOUT_MS = 4000;
/** Diferencia de horas que se considera "lo mismo" (la medición del reloj no es exacta). */
export const SAME_MS = 1500;
const KEEP_MS = 3 * 24 * 60 * 60 * 1000; // el servidor olvida los bloques terminados a los 3 días
const MAX_DONE = 60;
const ACTS = ['start', 'pause', 'resume', 'skip', 'reset', 'finish', 'complete', 'sync'];
const STATUSES = ['idle', 'running', 'paused'];

// ---------------------------------------------------------------------
// Lo guardado en el dispositivo
// ---------------------------------------------------------------------
let storage = null;
const backend = () => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};
/** Para las pruebas. */
export function useStorage(s) { storage = s; mem = null; }

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const newId = () => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 24);
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 14)).slice(0, 24);
};

function clean(v) {
  const o = v && typeof v === 'object' ? v : {};
  const entry = (e) => (e && typeof e === 'object' && num(e.at) !== null && ACTS.includes(e.act) && e.state && typeof e.state === 'object'
    ? { seq: num(e.seq) || 0, at: e.at, act: e.act, auto: e.auto === true, done: MODES.includes(e.done) ? e.done : null, state: e.state, sat: typeof e.sat === 'string' ? e.sat : null, tok: isTok(e.tok) ? e.tok : newId() }
    : null);
  const now = Date.now();
  return {
    seq: num(o.seq) || 0,
    pending: entry(o.pending),
    last: o.last && typeof o.last === 'object' && typeof o.last.sat === 'string' && ACTS.includes(o.last.act) && num(o.last.at) !== null && isTok(o.last.tok)
      ? { seq: num(o.last.seq) || 0, at: o.last.at, act: o.last.act, auto: o.last.auto === true, sat: o.last.sat, tok: o.last.tok }
      : null,
    done: (Array.isArray(o.done) ? o.done : [])
      .filter((d) => d && isBlockId(d.b) && ['won', 'lost', '?'].includes(d.v) && num(d.t) !== null && now - d.t < KEEP_MS)
      .map((d) => ({ b: d.b, v: d.v, t: d.t, k: isTok(d.k) ? d.k : '' }))
      .slice(-MAX_DONE),
    claims: (Array.isArray(o.claims) ? o.claims : [])
      .filter((c) => c && isBlockId(c.block) && MODES.includes(c.mode) && num(c.at) !== null && now - c.at < KEEP_MS)
      .slice(-20),
    off: o.off && num(o.off.ms) !== null && num(o.off.rtt) !== null ? { ms: o.off.ms, rtt: o.off.rtt, at: num(o.off.at) || 0 } : null,
  };
}

export function load() {
  try {
    const raw = backend() && backend().getItem(KEY);
    return clean(raw ? JSON.parse(raw) : {});
  } catch {
    return clean({});
  }
}
function save(patch) {
  const next = { ...load(), ...patch };
  try { backend() && backend().setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}
export function forget() {
  mem = null;
  try { backend() && backend().removeItem(KEY); } catch { /* sin almacenamiento */ }
}

/** Forma de los números al azar de cada acción (los que el servidor guarda como "device"). */
export const isTok = (v) => typeof v === 'string' && /^[A-Za-z0-9-]{4,32}$/.test(v);

// ---------------------------------------------------------------------
// La diferencia entre el reloj de este aparato y el del servidor
// ---------------------------------------------------------------------
let mem = null; // { ms, rtt, at }

/** Diferencia en ms (hora del servidor = hora de aquí + offset), o null si aún no se sabe. */
export function offset() {
  if (!mem) mem = load().off;
  return mem ? mem.ms : null;
}
/** Hace cuánto se midió (ms). Infinity si nunca. */
export function offsetAge(now = Date.now()) {
  if (!mem) mem = load().off;
  return mem ? Math.abs(now - mem.at) : Infinity;
}

/**
 * Una medición: el servidor dijo serverIso entre t0 y t1 (horas de este aparato). Se queda con
 * la más precisa (la respuesta más rápida), pero acepta una nueva si la anterior ya tiene más de
 * un minuto o si el reloj de aquí saltó (alguien cambió la hora del teléfono).
 */
export function sample(serverIso, t0, t1) {
  const server = typeof serverIso === 'string' ? Date.parse(serverIso) : NaN;
  if (!Number.isFinite(server) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return offset();
  const rtt = t1 - t0;
  const ms = Math.round(server - (t0 + rtt / 2));
  const cur = mem || load().off;
  const now = t1;
  if (!cur || rtt <= cur.rtt + 150 || now - cur.at > 60_000 || now < cur.at || Math.abs(ms - cur.ms) > 2000 + rtt) {
    mem = { ms, rtt, at: now };
    save({ off: mem });
  }
  return mem ? mem.ms : ms;
}

// ---------------------------------------------------------------------
// El reloj compartido (horas del servidor) ↔ el de este aparato (horas de aquí)
// ---------------------------------------------------------------------
/** El estado del temporizador de aquí (timer.js) en la forma que se guarda en el servidor. */
export function toShared(st, off, act = 'sync', { auto = false, done = null } = {}) {
  const r = (n) => Math.round(n);
  const out = {
    v: 1,
    mode: st.mode,
    status: st.status,
    durationSec: r(st.durationSec),
    accumulatedMs: r(Math.max(0, Number(st.accumulatedMs) || 0)),
    runStartAt: st.status === 'running' && Number.isFinite(st.runStartMs) ? r(st.runStartMs + off) : null,
    sessionStart: st.status !== 'idle' && Number.isFinite(st.sessionStartMs) ? r(st.sessionStartMs + off) : null,
    pauses: Math.max(0, Math.floor(Number(st.pauses) || 0)),
    block: st.status !== 'idle' && isBlockId(st.block) ? st.block : null,
    rank: st.status !== 'idle' && isBlockId(st.rank) ? st.rank : null,
    act: ACTS.includes(act) ? act : 'sync',
  };
  if (auto) out.auto = true;
  if (MODES.includes(done)) out.done = done;
  return out;
}

/** Lo que llegó del servidor, con las horas de este aparato (para session.adopt). null si no sirve. */
export function fromShared(sh, off) {
  if (!sh || typeof sh !== 'object' || !MODES.includes(sh.mode) || !STATUSES.includes(sh.status)) return null;
  const dur = num(sh.durationSec);
  if (dur === null) return null;
  const st = {
    status: sh.status, mode: sh.mode, durationSec: dur,
    accumulatedMs: Math.max(0, num(sh.accumulatedMs) || 0),
    runStartMs: null, sessionStartMs: null,
    pauses: Math.max(0, Math.floor(num(sh.pauses) || 0)),
    block: isBlockId(sh.block) ? sh.block : null,
    rank: isBlockId(sh.rank) ? sh.rank : null,
  };
  if (sh.status === 'idle') return st;
  const start = num(sh.sessionStart);
  if (start === null) return null;
  st.sessionStartMs = start - off;
  if (sh.status === 'running') {
    const run = num(sh.runStartAt);
    if (run === null) return null;
    st.runStartMs = run - off;
  }
  return st;
}

/**
 * ¿Los dos relojes muestran lo mismo? En reposo basta con el modo (la duración la ponen los
 * ajustes de cada aparato). El número del ranking no cuenta aquí (se completa aparte).
 */
export function same(a, b, tol = SAME_MS) {
  if (!a || !b || a.status !== b.status || a.mode !== b.mode) return false;
  if (a.status === 'idle') return true;
  if ((a.block || null) !== (b.block || null) || a.durationSec !== b.durationSec || (a.pauses || 0) !== (b.pauses || 0)) return false;
  if (Math.abs((a.accumulatedMs || 0) - (b.accumulatedMs || 0)) > tol) return false;
  if (a.status === 'running' && !(Math.abs(a.runStartMs - b.runStartMs) <= tol)) return false;
  return true;
}

/**
 * Qué hacer con lo que tiene el servidor. Función pura (se prueba en tests/logic.test.js).
 *  row: { state, version } de get_timer / set_timer.
 *  ctx: { local: el estado de aquí, pending: acción sin enviar, verdict(block): 'won' | 'lost' | '?' | '', off }
 * Devuelve { do: 'push' } (enviar lo de aquí) · { do: 'sync' } (volver a enviar el estado de aquí
 * con la hora de ahora) · { do: 'adopt', state } · { do: 'rank', rank } (solo falta el número
 * del ranking) · { do: 'none' }.
 */
export function decide(row, { local, pending, verdict = () => '', off = 0 }) {
  if (pending) return { do: 'push' };
  if (!row || !row.state) return local && local.status !== 'idle' ? { do: 'sync' } : { do: 'none' };
  const remote = fromShared(row.state, off);
  if (!remote) return { do: 'none' };
  // Un bloque que ya se terminó aquí y en el servidor sigue corriendo: es una noticia vieja.
  // Si lo guardó este aparato, se vuelve a enviar lo de aquí; si lo guardó otro, se espera lo suyo.
  if (remote.status !== 'idle' && remote.block && (!local || local.block !== remote.block)) {
    const v = verdict(remote.block);
    if (v === 'lost') return { do: 'none' };
    if (v) return { do: 'sync' };
  }
  if (local && same(remote, local)) {
    if (remote.status === 'idle') return { do: 'none' };
    if (remote.rank && !local.rank) return { do: 'rank', rank: remote.rank };
    if (local.rank && !remote.rank) return { do: 'sync' };
    return { do: 'none' };
  }
  return { do: 'adopt', state: remote };
}

// ---------------------------------------------------------------------
// Acciones sin enviar y bloques terminados
// ---------------------------------------------------------------------
/**
 * Anota una acción de aquí para enviarla (reemplaza la anterior: cada una lleva el reloj completo).
 * sat y tok: para REENVIAR una acción ya enviada (misma hora y mismo número al azar).
 */
export function setPending({ at, act, auto = false, done = null, state, sat = null, tok = null }) {
  const st = load();
  const seq = st.seq + 1;
  save({ seq, pending: { seq, at, act, auto: !!auto, done: MODES.includes(done) ? done : null, state: { ...state }, sat, tok: isTok(tok) ? tok : newId() } });
  return seq;
}
export const pending = () => load().pending;
/** Cambia el reloj de la acción sin enviar (por ejemplo, llegó el número del ranking). */
export function updatePending(state) {
  const st = load();
  if (!st.pending) return false;
  save({ pending: { ...st.pending, state: { ...state } } });
  return true;
}
/** La última acción enviada y aceptada (para reenviarla con el número del ranking). */
export const lastSent = () => load().last;
/** El servidor ya tiene esta acción (o una más nueva): ya no hay que enviarla. */
export function sent(entry, sat, accepted) {
  const st = load();
  const patch = {};
  if (st.pending && st.pending.seq === entry.seq) patch.pending = null;
  if (accepted) patch.last = { seq: entry.seq, at: entry.at, act: entry.act, auto: !!entry.auto, sat, tok: isTok(entry.tok) ? entry.tok : newId() };
  if (Object.keys(patch).length) save(patch);
}
export function dropPending() { save({ pending: null }); }

/** Lo que se sabe de un bloque terminado: 'won' (se guardó aquí), 'lost' (en otro aparato), '?' o ''. */
export function verdict(block) {
  const d = load().done.find((x) => x.b === block);
  return d ? d.v : '';
}
export function markDone(block, v) {
  if (!isBlockId(block)) return;
  const list = load().done;
  const prev = list.find((x) => x.b === block);
  const done = list.filter((x) => x.b !== block);
  done.push({ b: block, v, t: Date.now(), k: prev && prev.k ? prev.k : newId() });
  save({ done: done.slice(-MAX_DONE) });
}
/** El número al azar con que se pregunta por este bloque (el mismo en cada reintento). */
function claimToken(block) {
  const d = load().done.find((x) => x.b === block);
  if (d && d.k) return d.k;
  markDone(block, d ? d.v : '?');
  return load().done.find((x) => x.b === block).k;
}

/** Bloques guardados aquí sin saber si otro aparato ya los guardó (sin internet). */
export const claims = () => load().claims;
export function addClaim(rec) {
  if (!isBlockId(rec.block)) return;
  const list = load().claims.filter((c) => c.block !== rec.block);
  list.push({ block: rec.block, mode: rec.mode, at: Date.now() });
  save({ claims: list.slice(-20) });
}
export function removeClaim(block) {
  save({ claims: load().claims.filter((c) => c.block !== block) });
}

// ---------------------------------------------------------------------
// El servidor
// ---------------------------------------------------------------------
const first = (rows) => (Array.isArray(rows) ? rows[0] : rows) || null;
const fail = (kind) => Object.assign(new Error(kind), { kind });

function withTimeout(promise, ms) {
  let t = 0;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, reject) => { t = setTimeout(() => reject(fail('timeout')), ms); }),
  ]);
}

/**
 * Lo que tiene el servidor: { state, version, action_at, device, progress } (y mide el reloj).
 * progress = la versión del progreso guardado en la cuenta (si es más nueva, otro aparato guardó algo).
 */
export async function fetchTimer() {
  const t0 = Date.now();
  const r = first(await BOARD.callServer('get_timer', {}));
  if (!r) throw fail('server');
  sample(r.server_now, t0, Date.now());
  return { state: r.state || null, version: Number(r.version) || 0, action_at: r.action_at || null, device: r.device || null, progress: Number(r.progress_version) || 0 };
}

/** Envía una acción. Devuelve lo que quedó en el servidor (con accepted) y la hora usada (sat). */
export async function sendTimer(entry) {
  const off = offset();
  if (off === null) throw fail('nooffset');
  const sat = entry.sat || new Date(Math.round(entry.at + off)).toISOString();
  const t0 = Date.now();
  const r = first(await BOARD.callServer('set_timer', {
    p_state: toShared(entry.state, off, entry.act, { auto: entry.auto, done: entry.done }),
    p_action_at: sat,
    p_device: isTok(entry.tok) ? entry.tok : newId(),
  }));
  if (!r) throw fail('server');
  sample(r.server_now, t0, Date.now());
  return { state: r.state || null, version: Number(r.version) || 0, action_at: r.action_at || null, device: r.device || null, accepted: r.accepted === true, sat };
}

/**
 * ¿Este aparato guarda el bloque? true (sí), false (ya lo guardó otro aparato) o null (no se
 * pudo saber: sin internet, el servidor tardó…). Si el servidor todavía no tiene la v4.5,
 * true (como antes: cada aparato guarda lo suyo).
 */
export async function claim(block, { timeoutMs = CLAIM_TIMEOUT_MS } = {}) {
  if (!isBlockId(block)) return true;
  try {
    const r = await withTimeout(BOARD.callServer('claim_block', { p_block: block, p_device: claimToken(block) }), timeoutMs);
    return r === true ? true : r === false ? false : null;
  } catch (e) {
    if (e && e.kind === 'notready') return true;
    return null;
  }
}
