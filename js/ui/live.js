/*
 * FrostPom — el reloj en vivo en todos tus aparatos (v4.5): cuándo preguntar y qué se ve.
 * La lógica (el reloj compartido, la diferencia de horas, quién guarda cada bloque) está en
 * js/timer-sync.js; el servidor, en server/supabase/schema.sql.
 *
 *  - Solo con cuenta en línea (y con su sesión). Las cuentas solo de este aparato (menores de
 *    13 años) siguen como siempre: el reloj vive en el aparato.
 *  - Lo que tocas en Enfocar se envía un momento después (por si tocas varias veces seguidas).
 *  - Para enterarse de tus otros aparatos, pregunta al abrir la app, al volver a ella, al
 *    recuperar el internet y cada 10 s mientras se ve (también con la ventanita "Siempre encima").
 *  - Si el cambio llegó de otro aparato, sale un aviso corto: "Pausado desde otro aparato".
 *  - Si el servidor todavía no tiene la v4.5 (schema.sql), todo sigue como antes.
 */
import * as TS from '../timer-sync.js';
import * as BOARD from '../board.js';
import * as SYNC from '../sync.js';
import { isBlockId } from '../timer.js';
import { toast } from './feedback.js';
import { state, session } from './context.js';

const PUSH_DELAY_MS = 400;
/** Un cambio de hace más de minuto y medio ya no se anuncia (por ejemplo, al abrir la app). */
const NEWS_MS = 90_000;
const NEWS = {
  start: 'Empezado desde otro aparato.',
  pause: 'Pausado desde otro aparato.',
  resume: 'Reanudado desde otro aparato.',
  skip: 'Saltado desde otro aparato.',
  reset: 'Reiniciado desde otro aparato.',
  finish: 'Terminado y guardado desde otro aparato.',
};

/** Enfocar se conecta aquí para repintar el reloj (focus.js). */
const hooks = { changed() {} };
export function connect(h) { Object.assign(hooks, h); }

let disabled = false; // el servidor todavía no tiene la v4.5
let booted = false;
let lastPoll = -Infinity;
let busy = 0; // guardando un bloque: lo que llegue del servidor espera un momento
let pushTimer = 0;
let laterTimer = 0;
let syncing = null;
let again = false;
let warned = false;

/** ¿Este aparato comparte el reloj con tus otros aparatos? */
export function active() {
  return !disabled && SYNC.enabled() && !!state.account && state.account.online === true && BOARD.hasAccountSession();
}

/** ¿Se está viendo la app (o la ventanita "Siempre encima")? */
const visible = () => document.visibilityState === 'visible'
  || !!(window.documentPictureInPicture && window.documentPictureInPicture.window);

// ---------------------------------------------------------------------
// Lo que haces aquí
// ---------------------------------------------------------------------
/**
 * Enfocar hizo algo ('start', 'pause', 'resume', 'skip', 'reset', 'finish' o 'complete'):
 * se envía el reloj como quedó. at = cuándo (hora de este aparato). auto = empezó solo.
 * done = el modo del bloque que se acaba de guardar ('finish' y 'complete').
 */
export function local(act, { at = Date.now(), auto = false, done = null } = {}) {
  if (!active()) return;
  TS.setPending({ at, act, auto, done, state: session.state });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { sync(); }, PUSH_DELAY_MS);
}

/** Llegó el número del ranking del bloque que empezó aquí: viaja a tus otros aparatos. */
export function rankReady(block, id) {
  const st = session.state;
  if (st.status === 'idle' || !block || st.block !== block || st.rank === id) return;
  if (!session.setRank(id)) return;
  hooks.changed();
  if (!active()) return;
  if (TS.updatePending(session.state)) return; // la acción que falta enviar ya lo lleva
  const last = TS.lastSent();
  // Se reenvía la última acción con la MISMA hora y el mismo número al azar: el servidor la acepta
  if (last) TS.setPending({ at: last.at, act: last.act, auto: last.auto, state: session.state, sat: last.sat, tok: last.tok });
  else TS.setPending({ at: Date.now(), act: 'sync', state: session.state });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { sync(); }, PUSH_DELAY_MS);
}

// ---------------------------------------------------------------------
// Hablar con el servidor
// ---------------------------------------------------------------------
const TRANSIENT = ['offline', 'rate', 'auth', 'timeout', 'nooffset'];

function trouble(e) {
  const kind = (e && e.kind) || 'server';
  if (kind === 'notready' || kind === 'account_required') {
    disabled = true;
    if (!warned) {
      warned = true;
      console.info('[FrostPom] El reloj en vivo no está disponible todavía (falta correr el schema.sql de la v4.5 en Supabase). Cada aparato sigue con su reloj.');
    }
  } else if (kind === 'rate') {
    lastPoll = Date.now() + 50_000; // demasiadas acciones seguidas: se espera un minuto
  }
}

/** Envía lo pendiente y trae lo de tus otros aparatos. quiet = sin avisos. */
export function sync({ quiet = false } = {}) {
  if (!active()) return Promise.resolve();
  if (syncing) { again = true; return syncing; }
  syncing = (async () => {
    try {
      // Como mucho 3 vueltas seguidas (por si llegan acciones nuevas mientras tanto)
      for (let i = 0; i < 3 && active(); i++) {
        again = false;
        await once({ quiet });
        if (!again) break;
      }
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function once({ quiet }) {
  lastPoll = Date.now();
  try {
    let row = null;
    if (TS.claims().length) await settleClaims();
    if (TS.pending()) {
      // Sin una medición reciente de la hora, primero se mide (la acción lleva su hora)
      if (TS.offset() === null || TS.offsetAge() > 5 * 60_000) row = await TS.fetchTimer();
      const p = TS.pending();
      if (p) {
        try {
          row = await TS.sendTimer(p);
          TS.sent(p, row.sat, row.accepted);
        } catch (e) {
          if (!TRANSIENT.includes(e && e.kind) && e && e.kind !== 'notready') {
            TS.dropPending(); // el servidor no la acepta (no tiene arreglo): no se reintenta
            console.warn(`[FrostPom] El reloj en vivo no pudo enviar un cambio (${e.kind || 'server'}).`);
          }
          throw e;
        }
      }
    }
    if (!row) row = await TS.fetchTimer();
    apply(row, { quiet });
    // Otro aparato guardó progreso (XP, gemas, compras…): se trae (y se junta con lo de aquí)
    if (row.progress && row.progress > SYNC.load().version) pull();
  } catch (e) {
    trouble(e);
  }
}

/** Decide qué hacer con lo que tiene el servidor (timer-sync.js: decide). */
function apply(row, { quiet }) {
  if (busy) { later(1200); return; } // se está guardando un bloque: se mira otra vez en un momento
  const d = TS.decide(row, { local: session.state, pending: TS.pending(), verdict: TS.verdict, off: TS.offset() || 0 });
  if (d.do === 'push') again = true;
  else if (d.do === 'sync') {
    TS.setPending({ at: Date.now(), act: 'sync', state: session.state });
    again = true;
  } else if (d.do === 'rank') {
    if (session.setRank(d.rank)) hooks.changed();
  } else if (d.do === 'adopt') {
    adopt(row, d.state, quiet);
  }
}

function adopt(row, next, quiet) {
  const before = session.state;
  if (!session.adopt(next)) return;
  const after = session.state;
  // Ranking: si aquí corría otro bloque de estudio, ya no es tuyo (lo reemplazó otro aparato)
  if (before.mode === 'study' && before.status !== 'idle' && before.block !== after.block) BOARD.dropSession(before.sessionStartMs, before.rank || '');
  hooks.changed();
  // Si solo se corrigió la hora (mismo bloque, mismo modo), no hay nada que anunciar
  const real = before.status !== after.status || before.mode !== after.mode || (before.block || null) !== (after.block || null);
  if (real && !quiet) announce(row);
}

function announce(row) {
  const sh = row.state || {};
  if (sh.auto || sh.act === 'sync' || !visible()) return;
  const at = Date.parse(row.action_at || '');
  if (Number.isFinite(at) && Date.now() + (TS.offset() || 0) - at > NEWS_MS) return;
  let text = NEWS[sh.act];
  if (sh.act === 'complete') text = sh.done === 'study' ? 'Sesión completa: se guardó desde tu otro aparato.' : 'Descanso terminado.';
  if (text) toast(text, 'info', { icon: '📲' });
}

/** Vuelve a preguntar en ms (una sola espera a la vez). */
function later(ms) {
  clearTimeout(laterTimer);
  laterTimer = setTimeout(() => { sync(); }, ms);
}

// ---------------------------------------------------------------------
// ¿Quién guarda el bloque terminado?
// ---------------------------------------------------------------------
/** Mientras se guarda un bloque, el reloj no cambia con lo que llegue del servidor. */
export function hold() { busy += 1; }
export function release() { busy = Math.max(0, busy - 1); }

/**
 * ¿Este aparato guarda el bloque que terminó (rec de session.js)?
 * true = sí · false = ya lo guardó otro aparato · null = no se pudo preguntar (se guarda aquí y
 * se pregunta después) · 'dup' = ya se había guardado aquí.
 */
export async function claimBlock(rec) {
  if (!rec || !isBlockId(rec.block) || !active()) return true;
  const known = TS.verdict(rec.block);
  if (known === 'lost') return false;
  if (known) return 'dup';
  TS.markDone(rec.block, '?');
  const v = await TS.claim(rec.block);
  if (v === null) {
    TS.addClaim(rec);
    return null;
  }
  TS.markDone(rec.block, v ? 'won' : 'lost');
  return v;
}

let settling = null;
/**
 * Pregunta por los bloques que se guardaron aquí sin internet. Si otro aparato ya los había
 * guardado, NO se quitan de aquí: la mezcla del progreso (js/merge.js) cuenta una sola vez el
 * mismo pomodoro (mismo número de sesión) apenas se juntan las dos copias, y se pide traer el
 * progreso enseguida. (Quitarlo a mano era peligroso: si esa copia ya iba camino a la nube y se
 * había juntado con la del otro aparato, se borraba la única que quedaba.)
 * Lo llama también cloud-ui.js antes de subir el progreso.
 */
export function settleClaims() {
  if (!active() || !TS.claims().length) return Promise.resolve();
  if (settling) return settling;
  settling = (async () => {
    let lostOne = false;
    for (const c of TS.claims()) {
      const v = await TS.claim(c.block);
      if (v === null) break; // sin internet: después
      TS.removeClaim(c.block);
      TS.markDone(c.block, v ? 'won' : 'lost');
      if (!v) lostOne = true;
    }
    if (lostOne) pull();
  })().finally(() => { settling = null; });
  return settling;
}

/** Otro aparato guardó el bloque: se mira pronto qué hizo después (y su progreso llega solo). */
export function lost() {
  later(2500);
}

let pulledAt = -Infinity;
/** Pide traer el progreso de la cuenta (cloud-ui.js). Como mucho una vez cada 8 s. */
function pull() {
  if (Date.now() - pulledAt < 8000) return;
  pulledAt = Date.now();
  document.dispatchEvent(new CustomEvent('frostpom:pull'));
}

// ---------------------------------------------------------------------
// Arranque y cada 250 ms
// ---------------------------------------------------------------------
let bound = false;
/** Al abrir la app (después de entrar y de traer el progreso). */
export async function bootLive() {
  if (!bound) {
    bound = true;
    window.addEventListener('online', () => { if (booted && active()) sync(); });
    // Al volver a la app se pregunta; al salir, se envía lo que falte (en el celular, la app se duerme)
    document.addEventListener('visibilitychange', () => {
      if (!booted || !active()) return;
      if (document.visibilityState === 'visible' || TS.pending()) sync();
    });
    window.addEventListener('focus', () => { if (booted && active() && Date.now() - lastPoll > 2000) sync(); });
  }
  booted = true;
  if (!active()) return;
  await sync();
}

/**
 * Antes de guardar un bloque que llegó a cero: si hace rato no se pregunta (por ejemplo, la app
 * estaba cerrada), se pregunta primero, porque otro aparato pudo pausarlo, terminarlo o empezar
 * otro. Espera como mucho 4 s (sin internet sigue enseguida).
 */
export function freshen() {
  if (!active() || Date.now() - lastPoll < TS.POLL_MS) return Promise.resolve();
  return Promise.race([sync(), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
}

/** Se llama 4 veces por segundo (desde Enfocar y desde la ventanita "Siempre encima"). */
export function tick() {
  if (!booted || syncing || !active() || !visible()) return;
  if (Date.now() - lastPoll < TS.POLL_MS) return;
  sync();
}
