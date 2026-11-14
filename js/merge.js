/*
 * FrostPom — juntar el progreso de dos aparatos (v4.5): la mezcla de tres copias.
 *
 * Antes, si dos aparatos guardaban a la vez, ganaba ENTERA la copia con más tiempo estudiado y
 * se perdía lo del otro (por ejemplo, un tema comprado con gemas). Ahora cada aparato recuerda la
 * última copia que sincronizó (la "base") y, si la nube tiene algo más nuevo, se comparan las tres:
 *  - qué cambió ESTE aparato desde la base,
 *  - qué cambió el OTRO desde la base,
 *  - y se juntan los dos cambios, campo por campo.
 *
 * | Dato                                         | Regla                                              |
 * |----------------------------------------------|----------------------------------------------------|
 * | XP, gemas, totales, cada día del calendario  | base + lo que sumó (o restó) cada uno; nunca < 0   |
 * | Historial de sesiones                        | se unen por su id; lo que uno borró, queda borrado |
 * | Un pomodoro guardado en los DOS              | se cuenta una sola vez (mismo id = mismo bloque)   |
 * | Logros, misiones, temas, regalos             | se unen                                            |
 * | Mejor racha, mejor combo, sesión más larga   | el mayor                                           |
 * | Combo, ciclo y descanso ganado               | del aparato que estudió de último                  |
 * | Mascotas                                     | cada una aparte: gana la que cambió (o la más      |
 * |                                              | reciente); el nombre que se puso no se pierde      |
 * | Ajustes y perfil                             | gana el que cambió; si cambiaron los dos, el más   |
 * |                                              | reciente                                           |
 * | Temporada                                    | gana la más nueva; la XP de la vieja no se suma    |
 * | Premium                                      | activo si está activo en cualquiera                |
 * | Cuenta local y foto                          | no viajan (las pone sync.js con restore)           |
 *
 * Función pura: no toca el DOM ni el almacenamiento, no cambia sus entradas y nunca borra nada
 * que no haya borrado uno de los dos aparatos. Las pruebas están en tests/logic.test.js.
 */
import * as U from './util.js';
import { MAX_SESSIONS } from './engine.js';
import { MAX_ARCHIVE, isSeasonId } from './season.js';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const time = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Un valor que cada aparato pudo cambiar: si cambió uno solo, gana ese; si cambiaron los dos,
 * gana el más reciente (mineNewer).
 */
function pick(b, m, t, mineNewer) {
  const mc = !same(m, b);
  const tc = !same(t, b);
  if (mc && !tc) return clone(m);
  if (tc && !mc) return clone(t);
  if (!mc && !tc) return clone(m);
  return clone(mineNewer ? m : t);
}

/** Lo que el aparato agregó desde la base (sesiones por id). */
const ids = (list) => new Set(arr(list).map((s) => s && s.id).filter(Boolean));

/**
 * Junta tres copias del progreso (todas ya validadas con validateState o sync.restore):
 *  base   = la última que este aparato sincronizó con la nube,
 *  mine   = la de este aparato,
 *  theirs = la de la nube.
 * opts.mineAt / opts.theirsAt = cuándo cambió cada una por última vez (ms), para los empates.
 * Devuelve una copia nueva (sin cuenta local: la pone quien llama).
 */
export function mergeStates(base, mine, theirs, { mineAt = 0, theirsAt = 0 } = {}) {
  const B = clone(base) || {};
  const M = clone(mine) || {};
  const T = clone(theirs) || {};
  const mineNewer = mineAt >= theirsAt;
  const out = clone(M);
  delete out.account;

  const pB = obj(B.progress);
  const pM = obj(M.progress);
  const pT = obj(T.progress);
  const p = out.progress = clone(pM);

  // ---------------------------------------------------------------- sesiones
  const inB = ids(B.sessions);
  const inM = ids(M.sessions);
  const inT = ids(T.sessions);
  const byId = new Map();
  for (const s of [...arr(T.sessions), ...arr(M.sessions)]) if (s && s.id) byId.set(s.id, s);
  // Se quedan las que nadie borró: las nuevas de cualquiera y las de la base que siguen en los dos
  const keep = [...byId.values()].filter((s) => (inB.has(s.id) ? inM.has(s.id) && inT.has(s.id) : true));
  keep.sort((a, b) => time(b.endedAt) - time(a.endedAt));
  // Un mismo pomodoro guardado en los dos aparatos (sin internet): se cuenta una vez. En el
  // historial queda la copia de este aparato; de los totales se quita la del otro.
  const fromT = new Map(arr(T.sessions).filter((s) => s && s.id).map((s) => [s.id, s]));
  const twice = [...inM].filter((id) => !inB.has(id) && inT.has(id)).map((id) => fromT.get(id));

  // ---------------------------------------------------------------- temporada
  const sB = isSeasonId(pB.season) ? pB.season : '';
  const sM = isSeasonId(pM.season) ? pM.season : '';
  const sT = isSeasonId(pT.season) ? pT.season : '';
  const season = [sB, sM, sT].sort().pop();
  p.season = season;
  // XP de esta temporada que sumó cada lado (la de una temporada vieja no cuenta aquí)
  const xpDelta = (s, x) => (s !== season ? 0 : sB === season ? num(x.xp) - num(pB.xp) : num(x.xp));
  const xpBase = sB === season ? num(pB.xp) : 0;
  const startKey = season ? `${season}-01` : '';
  const dupXp = twice.reduce((a, s) => a + (startKey && U.dateKey(new Date(s.endedAt)) < startKey ? 0 : num(s.xp)), 0);
  p.xp = Math.max(0, xpBase + xpDelta(sM, pM) + xpDelta(sT, pT) - dupXp);

  // El archivo de temporadas: se unen; si las dos cerraron la misma, la de más XP
  const arch = new Map();
  for (const e of [...arr(T.seasons), ...arr(M.seasons)]) {
    if (!e || !isSeasonId(e.id)) continue;
    const prev = arch.get(e.id);
    if (!prev || num(e.xp) > num(prev.xp)) arch.set(e.id, clone(e));
  }
  // Un lado se quedó en la temporada vieja y siguió sumando: esa XP va a la temporada archivada
  for (const [s, x] of [[sM, pM], [sT, pT]]) {
    if (s && s !== season && s === sB && arch.has(s)) arch.get(s).xp = num(arch.get(s).xp) + Math.max(0, num(x.xp) - num(pB.xp));
  }
  out.seasons = [...arch.values()].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, MAX_ARCHIVE);
  // Si los dos cerraron la misma temporada, el premio en gemas se sumó dos veces
  const inBase = new Set(arr(B.seasons).map((e) => e && e.id));
  let dupReward = 0;
  for (const e of arr(M.seasons)) {
    if (!e || inBase.has(e.id)) continue;
    const other = arr(T.seasons).find((x) => x && x.id === e.id);
    if (other) dupReward += Math.min(num(e.gems), num(other.gems));
  }

  // ---------------------------------------------------------------- números que se suman
  const sum = (b, m, t) => num(b) + (num(m) - num(b)) + (num(t) - num(b));
  p.gems = Math.max(0, sum(pB.gems, pM.gems, pT.gems) - dupReward);
  const tB = obj(pB.totals);
  const tM = obj(pM.totals);
  const tT = obj(pT.totals);
  p.totals = {};
  for (const k of new Set([...Object.keys(tB), ...Object.keys(tM), ...Object.keys(tT)])) p.totals[k] = Math.max(0, sum(tB[k], tM[k], tT[k]));
  for (const s of twice) {
    p.totals.studySec = Math.max(0, num(p.totals.studySec) - num(s.actualSec));
    p.totals.creditedSec = Math.max(0, num(p.totals.creditedSec) - num(s.creditedSec));
    const k = s.completed ? 'sessions' : 'partials';
    p.totals[k] = Math.max(0, num(p.totals[k]) - 1);
  }

  // El calendario: cada día se suma igual
  const dB = obj(B.daily);
  const dM = obj(M.daily);
  const dT = obj(T.daily);
  out.daily = U.dict();
  for (const day of new Set([...Object.keys(dB), ...Object.keys(dM), ...Object.keys(dT)])) {
    const b = obj(dB[day]);
    const m = dM[day] ? obj(dM[day]) : b;
    const t = dT[day] ? obj(dT[day]) : b;
    const d = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) d[k] = Math.max(0, sum(b[k], m[k], t[k]));
    out.daily[day] = d;
  }
  for (const s of twice) {
    const d = out.daily[U.dateKey(new Date(s.endedAt))];
    if (!d) continue;
    const dec = (k, by) => { d[k] = Math.max(0, num(d[k]) - by); };
    dec('studySec', num(s.actualSec));
    dec('creditedSec', num(s.creditedSec));
    dec('xp', num(s.xp));
    dec(s.completed ? 'sessions' : 'partials', 1);
    if (s.completed && !s.pauses) dec('noPauseSessions', 1);
  }
  for (const d of Object.values(out.daily)) d.creditedSec = Math.min(num(d.creditedSec), num(d.studySec));

  // Si un aparato seguía en la temporada pasada, sus sesiones de esa temporada ya no se guardan en detalle
  out.sessions = keep.filter((s) => sM === sT || !startKey || U.dateKey(new Date(s.startedAt)) >= startKey).slice(0, MAX_SESSIONS);

  // ---------------------------------------------------------------- lo que se une
  p.achievements = U.dict();
  for (const src of [obj(pT.achievements), obj(pM.achievements)]) {
    for (const [id, when] of Object.entries(src)) {
      if (!p.achievements[id] || time(when) < time(p.achievements[id])) p.achievements[id] = when;
    }
  }
  p.claimed = U.dict();
  for (const src of [obj(pT.claimed), obj(pM.claimed)]) for (const [id, v] of Object.entries(src)) if (v === true) p.claimed[id] = true;
  p.owned = ['clasico', ...new Set([...arr(pM.owned), ...arr(pT.owned)].filter((x) => x !== 'clasico'))];
  p.gifted = [...new Set([...arr(pM.gifted), ...arr(pT.gifted)])];
  p.customized = pM.customized === true || pT.customized === true;

  // ---------------------------------------------------------------- lo mejor
  for (const k of ['bestStreak', 'bestCombo', 'longestSessionSec']) p[k] = Math.max(num(pM[k]), num(pT[k]));

  // Combo, ciclo y "descanso ganado": del que estudió de último
  const newest = (list) => arr(list).reduce((a, s) => Math.max(a, time(s && s.endedAt)), 0);
  const lastM = newest(M.sessions);
  const lastT = newest(T.sessions);
  for (const k of ['combo', 'cycle', 'breakEarned']) {
    if (lastM === lastT) p[k] = pick(pB[k], pM[k], pT[k], mineNewer);
    else p[k] = clone(lastM > lastT ? pM[k] : pT[k]);
  }

  // ---------------------------------------------------------------- mascotas
  const petsB = obj(B.pets);
  const petsM = obj(M.pets);
  const petsT = obj(T.pets);
  out.pets = U.dict();
  for (const id of new Set([...Object.keys(petsM), ...Object.keys(petsT)])) {
    const b = petsB[id];
    const m = petsM[id];
    const t = petsT[id];
    if (!m || !t) { out.pets[id] = clone(m || t); continue; }
    const mc = !same(m, b);
    const tc = !same(t, b);
    let pet;
    if (mc && !tc) pet = clone(m);
    else if (tc && !mc) pet = clone(t);
    else pet = clone(time(m.at) >= time(t.at) ? m : t);
    // El nombre: si solo uno lo cambió, ese nombre se queda (aunque gane el otro registro)
    const bName = b ? b.name : undefined;
    const nameM = m.name;
    const nameT = t.name;
    const name = nameM !== bName && nameT === bName ? nameM : nameT !== bName && nameM === bName ? nameT : pet.name;
    if (name) pet.name = name;
    else delete pet.name;
    out.pets[id] = pet;
  }

  // ---------------------------------------------------------------- ajustes y perfil
  const setB = obj(B.settings);
  const setM = obj(M.settings);
  const setT = obj(T.settings);
  out.settings = {};
  for (const k of new Set([...Object.keys(setM), ...Object.keys(setT)])) out.settings[k] = pick(setB[k], setM[k], setT[k], mineNewer);
  const prB = obj(B.profile);
  const prM = obj(M.profile);
  const prT = obj(T.profile);
  out.profile = clone(prM);
  for (const k of ['nick', 'avatar', 'country', 'companion', 'onboarded']) out.profile[k] = pick(prB[k], prM[k], prT[k], mineNewer);

  // ---------------------------------------------------------------- Premium
  const pmB = obj(B.premium);
  const pmM = obj(M.premium);
  const pmT = obj(T.premium);
  const since = [pmM.since, pmT.since].filter((x) => time(x)).sort((a, b) => time(a) - time(b))[0] || null;
  out.premium = {
    active: pmM.active === true || pmT.active === true,
    demo: true,
    since,
    bonusClaimed: pmM.bonusClaimed === true || pmT.bonusClaimed === true,
    giftPending: pick(pmB.giftPending === true, pmM.giftPending === true, pmT.giftPending === true, mineNewer),
  };

  // ---------------------------------------------------------------- lo demás
  const created = [M.createdAt, T.createdAt].filter((x) => time(x)).sort((a, b) => time(a) - time(b))[0];
  if (created) out.createdAt = created;
  out.v = Math.max(num(M.v), num(T.v)) || M.v;
  return out;
}
