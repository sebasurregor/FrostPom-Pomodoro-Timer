/*
 * FrostPom — (v4.5.1) avisos AL INSTANTE entre tus aparatos con Supabase Realtime.
 *
 * Cuando pausas, empiezas o guardas algo en un aparato, el servidor manda un aviso corto por el
 * canal privado de tu cuenta ("frostpom:<tu id>"). Tus otros aparatos lo reciben en menos de un
 * segundo y preguntan al servidor (get_timer): el aviso solo dice "algo cambió"; lo que vale sigue
 * siendo lo que guarda el servidor. Si el WebSocket no conecta o se cae, la app sigue preguntando
 * cada 10 s como antes (js/ui/live.js).
 *
 * Sin librerías: el protocolo de Phoenix que usa Realtime son unos pocos mensajes JSON:
 *   phx_join (unirse al canal, con tu sesión) · heartbeat (cada 25 s) · access_token (sesión nueva)
 *   broadcast (el aviso) · phx_reply / phx_error / phx_close.
 * Solo se puede ESCUCHAR tu propio canal: lo revisa la política de realtime.messages
 * (server/supabase/schema.sql). Nadie puede enviar avisos desde la app.
 */
import { config } from './config.js';

const HEARTBEAT_MS = 25_000;
const JOIN_TIMEOUT_MS = 10_000;
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];

let ws = null;
let opts = null; // { uid, token: () => Promise<string>, onNotify(payload), onLive(on) }
let topic = '';
let ref = 0;
let joinRef = '';
let joined = false;
let hb = 0;
let joinTimer = 0;
let retryTimer = 0;
let retries = 0;
let sentToken = '';
let refused = false; // el servidor no deja unirse (Realtime apagado o sin la política): no se insiste

const cfg = () => config.cloud || {};
/** ¿Está conectado y escuchando tu canal? */
export const isLive = () => joined;

function url() {
  const base = String(cfg().url || '').replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg().key || '')}&vsn=1.0.0`;
}

function send(msg) {
  try {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
  } catch { /* se cerró justo ahora */ }
  return false;
}
const nextRef = () => String(++ref);

function setLive(on) {
  if (joined === on) return;
  joined = on;
  try { if (opts && opts.onLive) opts.onLive(on); } catch { /* nada */ }
}

/**
 * Empieza a escuchar (o sigue, si ya está). o = { uid, token, onNotify, onLive }.
 * token() devuelve la sesión vigente (la renueva js/board.js).
 */
export function start(o) {
  if (!o || !o.uid || !cfg().url || !cfg().key || typeof WebSocket !== 'function' || refused) return;
  const sameUser = !!opts && opts.uid === o.uid;
  if (!sameUser) stop();
  opts = o;
  if (sameUser && ws && ws.readyState <= 1) return; // ya está conectando o conectado
  topic = `realtime:frostpom:${o.uid}`;
  connect();
}

/** Deja de escuchar (al salir de la cuenta, al esconder la app un buen rato…). */
export function stop() {
  clearTimeout(retryTimer);
  clearTimeout(joinTimer);
  clearInterval(hb);
  setLive(false);
  const old = ws;
  ws = null;
  if (old) {
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try { old.close(1000); } catch { /* ya estaba cerrado */ }
  }
}

function connect() {
  clearTimeout(retryTimer);
  let sock;
  try { sock = new WebSocket(url()); } catch { return retry(); }
  ws = sock;
  sock.onopen = () => { join(); };
  sock.onmessage = (ev) => { if (ws === sock) receive(ev.data); };
  sock.onerror = () => { /* llega también onclose */ };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(hb);
    clearTimeout(joinTimer);
    setLive(false);
    retry();
  };
}

function retry() {
  if (!opts || refused) return;
  clearTimeout(retryTimer);
  const wait = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
  retries += 1;
  retryTimer = setTimeout(() => { if (opts && !ws) connect(); }, wait);
}

async function join() {
  let token = '';
  try { token = await opts.token(); } catch { token = ''; }
  if (!token) { stop(); return; } // sin sesión no hay canal privado
  sentToken = token;
  joinRef = nextRef();
  send({
    topic, event: 'phx_join', ref: joinRef, join_ref: joinRef,
    payload: {
      config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: true },
      access_token: token,
    },
  });
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => { if (!joined && ws) { try { ws.close(); } catch { /* nada */ } } }, JOIN_TIMEOUT_MS);
  clearInterval(hb);
  hb = setInterval(beat, HEARTBEAT_MS);
}

/** Cada 25 s: "sigo aquí" y, si la sesión se renovó, la sesión nueva (si no, el canal se cierra). */
async function beat() {
  send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
  if (!joined || !opts) return;
  let token = '';
  try { token = await opts.token(); } catch { return; }
  if (token && token !== sentToken) {
    sentToken = token;
    send({ topic, event: 'access_token', payload: { access_token: token }, ref: nextRef(), join_ref: joinRef });
  }
}

function receive(raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.event === 'phx_reply' && m.ref === joinRef && m.topic === topic) {
    clearTimeout(joinTimer);
    const ok = m.payload && m.payload.status === 'ok';
    if (ok) {
      retries = 0;
      setLive(true);
    } else {
      // Sin permiso para el canal privado (falta la política) o Realtime apagado: se sigue preguntando cada 10 s
      const why = JSON.stringify((m.payload && m.payload.response) || {}).slice(0, 160);
      console.info(`[FrostPom] Los avisos al instante no están disponibles (${why}). El reloj en vivo pregunta cada 10 s.`);
      refused = /unauthori[sz]ed|not allowed|denied|permission|private/i.test(why);
      stop();
      if (!refused) retry();
    }
    return;
  }
  if (m.topic !== topic) return;
  if (m.event === 'phx_error' || m.event === 'phx_close') {
    setLive(false);
    if (ws) { try { ws.close(); } catch { /* nada */ } }
    return;
  }
  if (m.event === 'broadcast') {
    const inner = m.payload || {};
    const data = inner.payload && typeof inner.payload === 'object' ? inner.payload : {};
    try { if (opts && opts.onNotify) opts.onNotify(data); } catch { /* nada */ }
  }
}

/** Para las pruebas: vuelve a intentar aunque el servidor haya dicho que no. */
export function reset() { refused = false; retries = 0; }
