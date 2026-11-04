/*
 * FrostPom — motor de progreso.
 * Aplica sesiones, descansos, misiones y compras sobre el estado, y devuelve "eventos"
 * (XP ganada, subida de rango, logro desbloqueado…) que la interfaz convierte en animaciones.
 * Es puro respecto al DOM: recibe el estado, lo modifica y devuelve qué pasó.
 *
 * Contrato: TODO comando devuelve { events, ok } (y a veces más datos). Así la interfaz
 * los trata a todos igual.
 */
import * as U from './util.js';
import * as G from './game.js';
import * as C from './catalog.js';
import * as S from './season.js';
import * as P from './pet.js';

export const MAX_SESSIONS = 500;

const done = (events = [], extra) => ({ events, ok: true, ...extra });
const refused = (extra) => ({ events: [], ok: false, ...extra });

export function ensureDay(state, key) {
  if (!state.daily[key]) state.daily[key] = G.emptyDay();
  return state.daily[key];
}

function addXp(state, amount, events, reason) {
  if (!amount) return;
  const before = G.rankForXp(state.progress.xp);
  state.progress.xp = Math.max(0, state.progress.xp + amount);
  const after = G.rankForXp(state.progress.xp);
  if (amount > 0) events.push({ type: 'xp', amount, reason });
  if (after.level > before.level) {
    const steps = (after.index - before.index) + (after.stars - before.stars);
    const gems = G.RULES.rankUpGems * Math.max(1, steps);
    state.progress.gems += gems;
    events.push({ type: 'rankup', from: before, to: after, gems });
  }
}

function addGems(state, amount, events, reason) {
  if (!amount) return;
  state.progress.gems = Math.max(0, state.progress.gems + amount);
  if (amount > 0) events.push({ type: 'gems', amount, reason });
}

function achievementContext(state, todayKey) {
  const t = state.progress.totals;
  // Días activos por semana (lunes a domingo)
  const perWeek = new Map();
  for (const k of Object.keys(state.daily)) {
    if (!G.isActiveDay(state.daily, k)) continue;
    const wk = U.dateKey(U.startOfWeek(U.parseDateKey(k)));
    perWeek.set(wk, (perWeek.get(wk) || 0) + 1);
  }
  return {
    sessions: t.sessions,
    studySec: t.studySec,
    breaks: t.breaks,
    missionsClaimed: t.missionsClaimed,
    customized: !!state.progress.customized,
    bestStreak: Math.max(state.progress.bestStreak, G.computeStreak(state.daily, todayKey).current),
    bestCombo: state.progress.bestCombo,
    longestSessionSec: state.progress.longestSessionSec,
    maxActiveDaysInWeek: Math.max(0, ...perWeek.values()),
    tierIndex: G.rankForXp(state.progress.xp).tierIndex,
  };
}

function checkAchievements(state, todayKey, events) {
  const ids = G.evaluateAchievements(achievementContext(state, todayKey), state.progress.achievements);
  for (const id of ids) {
    state.progress.achievements[id] = new Date().toISOString();
    const gems = G.RARITY[G.ACHIEVEMENT_BY_ID[id].rarity].gems;
    state.progress.gems += gems;
    events.push({ type: 'achievement', id, gems });
    const comp = C.COMPANION_BY_ACHIEVEMENT[id];
    if (comp && !state.progress.gifted.includes(comp.id)) events.push({ type: 'companion', companion: comp });
  }
}

function refreshStreak(state, todayKey) {
  const cur = G.computeStreak(state.daily, todayKey).current;
  if (cur > state.progress.bestStreak) state.progress.bestStreak = cur;
}

// =========================================================
// Bloques del temporizador
// =========================================================
/**
 * Aplica un bloque de estudio terminado (completo o "terminar y guardar").
 * rec viene de timer.complete() o timer.stopEarly().
 */
export function applyStudy(state, rec, { todayKey } = {}) {
  const events = [];
  const endKey = U.dateKey(new Date(rec.endMs));
  todayKey = todayKey || endKey;
  const day = ensureDay(state, endKey);
  const reward = G.studyReward({
    actualSec: rec.actualSec,
    completed: rec.completed,
    dayCreditedSec: day.creditedSec,
    capSec: state.settings.dailyCapMin * 60,
    isFirstToday: day.creditedSec === 0,
    streak: G.streakBefore(state.daily, endKey),
  });

  if (reward.tooShort) {
    if (!rec.completed) state.progress.combo = 0;
    events.push({ type: 'tooShort' });
    return done(events, { reward });
  }

  // Solo se guarda CUÁNTO estudiaste, no en qué (decisión de privacidad).
  day.studySec += rec.actualSec;
  day.creditedSec += reward.creditedSec;
  day.xp += reward.xp;
  const p = state.progress;
  p.totals.studySec += rec.actualSec;
  p.totals.creditedSec += reward.creditedSec;
  if (rec.completed) {
    day.sessions += 1;
    if (!rec.pauses) day.noPauseSessions += 1;
    p.totals.sessions += 1;
    p.combo += 1;
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    p.longestSessionSec = Math.max(p.longestSessionSec, rec.actualSec);
    p.cycle += 1;
    p.breakEarned = true;
  } else {
    day.partials += 1;
    p.totals.partials += 1;
    p.combo = 0;
  }

  state.sessions.unshift({
    id: U.uid(),
    plannedMin: Math.round(rec.plannedSec / 60),
    actualSec: rec.actualSec,
    creditedSec: reward.creditedSec,
    completed: !!rec.completed,
    pauses: rec.pauses || 0,
    startedAt: rec.startedAt,
    endedAt: rec.endedAt,
    xp: reward.xp,
  });
  if (state.sessions.length > MAX_SESSIONS) state.sessions.length = MAX_SESSIONS;

  if (reward.capped) events.push({ type: 'capped', capMin: state.settings.dailyCapMin });
  addXp(state, reward.xp, events, 'study');
  refreshStreak(state, todayKey);
  checkAchievements(state, todayKey, events);
  return done(events, { reward });
}

/** Descanso terminado. Solo da XP si viene después de una sesión completa (evita "granjear" descansos). */
export function applyBreak(state, rec, { todayKey } = {}) {
  const events = [];
  if (!rec || !rec.completed) return done(events);
  const endKey = U.dateKey(new Date(rec.endMs));
  const day = ensureDay(state, endKey);
  day.breaks += 1;
  state.progress.totals.breaks += 1;
  if (state.progress.breakEarned) {
    state.progress.breakEarned = false;
    day.xp += G.RULES.breakXp;
    addXp(state, G.RULES.breakXp, events, 'break');
  }
  checkAchievements(state, todayKey || endKey, events);
  return done(events);
}

/** Cualquier bloque terminado: estudio o descanso. */
export function applyRecord(state, rec, opts) {
  return rec.mode === 'study' ? applyStudy(state, rec, opts) : applyBreak(state, rec, opts);
}

/** Saltar un bloque de estudio corta el combo. */
export function skipStudy(state) {
  state.progress.combo = 0;
  return done();
}

/** Quita una sesión del historial y descuenta su tiempo y XP (por si se quedó corriendo por error). */
export function removeSession(state, id) {
  const i = state.sessions.findIndex((x) => x.id === id);
  if (i < 0) return refused();
  const [s] = state.sessions.splice(i, 1);
  const dec = (obj, key, by = 1) => { obj[key] = Math.max(0, obj[key] - by); };
  const day = state.daily[U.dateKey(new Date(s.endedAt))];
  const t = state.progress.totals;
  for (const bucket of [day, t].filter(Boolean)) {
    dec(bucket, 'studySec', s.actualSec);
    dec(bucket, 'creditedSec', s.creditedSec);
    dec(bucket, s.completed ? 'sessions' : 'partials');
  }
  if (day) {
    dec(day, 'xp', s.xp);
    if (s.completed && !s.pauses) dec(day, 'noPauseSessions');
  }
  dec(state.progress, 'xp', s.xp);
  return done();
}

// =========================================================
// Misiones, temas, compañeros
// =========================================================
export function claimMission(state, missionId, todayKey) {
  const events = [];
  const mission = G.dailyMissions(todayKey).find((m) => m.id === missionId);
  if (!mission || state.progress.claimed[missionId]) return refused();
  if (!G.missionProgress(mission, state.daily[todayKey]).done) return refused();
  state.progress.claimed[missionId] = true;
  state.progress.totals.missionsClaimed += 1;
  events.push({ type: 'mission', mission });
  addXp(state, mission.reward.xp, events, 'mission');
  addGems(state, mission.reward.gems, events, 'mission');
  checkAchievements(state, todayKey, events);
  return done(events);
}

/** Usar, comprar o desbloquear un tema del temporizador, según su estado en el catálogo. */
export function chooseSkin(state, skinId, todayKey) {
  const skin = C.SKIN_BY_ID[skinId];
  if (!skin) return refused();
  const status = C.skinStatusFor(state, skin);
  switch (status.state) {
    case 'owned':
    case 'included': // Premium: se usa sin "poseerlo"; si Premium vence, vuelve al Clásico.
      state.settings.skin = skin.id;
      return done();
    case 'buyable':
      state.progress.gems -= skin.cost;
    // falls through: comprado = desbloqueado
    case 'unlockable': {
      const events = [{ type: 'skin', skin }];
      state.progress.owned.push(skin.id);
      state.settings.skin = skin.id;
      checkAchievements(state, todayKey, events);
      return done(events);
    }
    default:
      return refused({ reason: status.reason });
  }
}

export function equipCompanion(state, id) {
  if (id !== null && !C.companionUnlocked(id, state.progress.achievements, state.progress.gifted)) return refused();
  state.profile.companion = id;
  return done();
}

// =========================================================
// Duración del temporizador
// =========================================================
function noteCustomized(state, todayKey) {
  const events = [];
  if (!state.progress.customized) {
    state.progress.customized = true;
    checkAchievements(state, todayKey, events);
  }
  return done(events);
}

export function choosePreset(state, id, todayKey) {
  if (!C.PRESET_BY_ID[id]) return refused();
  state.settings.preset = id;
  return id === C.CUSTOM_PRESET ? noteCustomized(state, todayKey) : done();
}

/**
 * Cambia un valor de "Mi ritmo" (key: 'customStudyMin' o 'customBreakMin') y lo activa.
 * Se ajusta a los límites de la versión gratis o Premium; clamped dice si hubo que recortarlo.
 */
export function setCustomMinutes(state, key, minutes, todayKey) {
  const L = C.durationLimits(C.isPremium(state));
  const [min, max] = key === 'customStudyMin' ? L.study : L.brk;
  const want = Math.round(U.toNum(minutes, state.settings[key]));
  const value = U.clamp(want, min, max);
  state.settings[key] = value;
  state.settings.preset = C.CUSTOM_PRESET;
  return { ...noteCustomized(state, todayKey), clamped: value !== want, limits: [min, max] };
}

// =========================================================
// Premium (modo prueba: sin cobro)
// =========================================================
export const PREMIUM_GEMS = 1000;

/**
 * Activa o desactiva Premium. La PRIMERA vez que se activa llega el regalo de bienvenida:
 * 1000 gemas y una mascota de edición limitada que el usuario elige (giftCompanion).
 * El regalo se da una sola vez: activar y desactivar no lo repite.
 */
export function setPremium(state, active) {
  const pm = state.premium;
  const events = [];
  pm.active = !!active;
  pm.since = active ? new Date().toISOString() : null;
  if (active && !pm.bonusClaimed) {
    pm.bonusClaimed = true;
    addGems(state, PREMIUM_GEMS, events, 'premium');
    pm.giftPending = C.lockedCompanions(state.progress).length > 0;
    events.push({ type: 'premiumGift', gems: PREMIUM_GEMS, choosePet: pm.giftPending });
  }
  return done(events);
}

/** Elige la mascota de regalo de Premium (solo si el regalo está pendiente y no la tenías). */
export function giftCompanion(state, id) {
  const c = C.COMPANION_BY_ID[id];
  if (!state.premium.giftPending || !c || C.companionUnlocked(id, state.progress.achievements, state.progress.gifted)) return refused();
  state.progress.gifted.push(id);
  state.premium.giftPending = false;
  return done([{ type: 'companion', companion: c, gift: true }]);
}

// =========================================================
// Tienda: darle de comer a tu mascota
// =========================================================
/**
 * Gasta gemas en una comida para la mascota de ahora. No se puede si no alcanzan las gemas
 * o si ya está llena (así nadie se gasta todo de una vez).
 */
export function feedPet(state, foodId, now = new Date()) {
  const food = P.FOOD_BY_ID[foodId];
  if (!food) return refused({ reason: 'unknown' });
  const petId = P.currentPetId(state);
  const before = P.fullness(state, petId, now);
  if (before >= P.FULL_AT) return refused({ reason: 'full' });
  if (state.progress.gems < food.cost) return refused({ reason: 'gems' });
  const gained = P.fillFor(petId, foodId);
  const after = Math.min(100, before + gained);
  state.progress.gems -= food.cost;
  state.progress.totals.fed += 1;
  state.pets[petId] = { fullness: after, at: now.toISOString() };
  return done([{ type: 'fed', petId, food, favorite: P.isFavorite(petId, foodId), gained: Math.round(after - before), fullness: after }]);
}

// =========================================================
// Temporadas
// =========================================================
/**
 * Si empezó una temporada nueva, cierra la anterior: guarda su resumen, da las gemas de
 * premio, vuelve el rango a Bronce III y borra el historial detallado de sesiones viejas.
 * Si es la primera vez (datos de antes de las temporadas), solo adopta la temporada actual.
 */
export function rolloverSeason(state, now = new Date(), months = S.DEFAULT_MONTHS) {
  const cur = S.seasonFor(now, months);
  const p = state.progress;
  if (!S.isSeasonId(p.season)) {
    p.season = cur.id;
    return done();
  }
  if (p.season === cur.id) return refused();
  const prev = S.seasonById(p.season, months) || cur;
  if (prev.index > cur.index) { // reloj del dispositivo atrasado: no se borra nada
    p.season = cur.id;
    return refused();
  }
  const rank = G.rankForXp(p.xp);
  const sum = S.summarize(state.daily, prev, G.POLE_GOAL_MIN);
  const reward = sum.studyMin > 0 || p.xp > 0 ? S.seasonReward(rank.tierIndex) : 0;
  const entry = { id: prev.id, months: prev.months, xp: p.xp, rank: rank.name, tierIndex: rank.tierIndex, studyMin: sum.studyMin, activeDays: sum.activeDays, goalDays: sum.goalDays, gems: reward };
  state.seasons = [entry, ...(state.seasons || []).filter((x) => x.id !== entry.id)].slice(0, S.MAX_ARCHIVE);
  p.gems += reward;
  p.xp = 0;
  p.season = cur.id;
  // Solo se conserva el detalle de la temporada actual; el total de cada día sigue en el calendario.
  state.sessions = state.sessions.filter((x) => U.dateKey(new Date(x.startedAt)) >= cur.startKey);
  return done([{ type: 'season', ended: entry, season: cur, reward, rank }]);
}

// =========================================================
// Ranking
// =========================================================
/** Minutos que cuentan para el ranking (ya con el límite diario aplicado). */
export function boardMinutes(state, now = new Date(), months = S.DEFAULT_MONTHS) {
  const start = U.startOfWeek(now);
  let weekSec = 0;
  for (let i = 0; i < 7; i++) {
    const key = U.dateKey(U.addDays(start, i));
    if (state.daily[key]) weekSec += state.daily[key].creditedSec;
  }
  const season = S.summarize(state.daily, S.seasonFor(now, months), G.POLE_GOAL_MIN);
  return { week: Math.floor(weekSec / 60), season: season.creditedMin, all: Math.floor(state.progress.totals.creditedSec / 60) };
}
