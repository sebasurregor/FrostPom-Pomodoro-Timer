/*
 * StudyTimer — reglas del progreso: rangos, XP, rachas, misiones, logros y salud del polo.
 * Todo aquí son funciones puras (no tocan el DOM ni el almacenamiento) para poder probarlas.
 * Lo que se puede elegir o poseer (temas, compañeros, sonidos, duraciones) vive en catalog.js.
 */
import * as U from './util.js';

// =========================================================
// Rangos: 6 rangos con 3 divisiones (III → II → I) + Leyenda con estrellas.
// XP ≈ minutos estudiados, así que los umbrales se leen como "minutos".
// =========================================================
export const TIERS = [
  { id: 'bronce',   name: 'Bronce',   thresholds: [0, 60, 150],        colors: { a: '#F6A971', b: '#9C4A1E', glow: '#FFB27A' } },
  { id: 'plata',    name: 'Plata',    thresholds: [300, 480, 720],     colors: { a: '#F4F8FF', b: '#8494B3', glow: '#DCE6FF' } },
  { id: 'oro',      name: 'Oro',      thresholds: [1000, 1400, 1900],  colors: { a: '#FFE680', b: '#CF8A06', glow: '#FFD54A' } },
  { id: 'platino',  name: 'Platino',  thresholds: [2500, 3200, 4000],  colors: { a: '#93F8E4', b: '#12968C', glow: '#5FF0D6' } },
  { id: 'diamante', name: 'Diamante', thresholds: [5000, 6200, 7600],  colors: { a: '#B3E8FF', b: '#4553F5', glow: '#86B6FF' } },
  { id: 'maestro',  name: 'Maestro',  thresholds: [9000, 11000, 13500], colors: { a: '#F5B1FF', b: '#7426E8', glow: '#D884FF' } },
  { id: 'leyenda',  name: 'Leyenda',  thresholds: [16000],             colors: { a: '#FFF1A6', b: '#F2522F', glow: '#FFB347' } },
];
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
const LEGEND_STAR_XP = 4000;

export const STEPS = TIERS.flatMap((tier, tierIndex) => (tier.id === 'leyenda'
  ? [{ tierIndex, division: null, minXp: tier.thresholds[0] }]
  : tier.thresholds.map((minXp, i) => ({ tierIndex, division: 3 - i, minXp }))));

function stepName(i) {
  const st = STEPS[i];
  const tier = TIERS[st.tierIndex];
  return st.division ? `${tier.name} ${ROMAN[st.division]}` : tier.name;
}

export function rankForXp(xpValue) {
  const xp = Math.max(0, Math.floor(U.toNum(xpValue)));
  let idx = 0;
  for (let i = 0; i < STEPS.length; i++) if (xp >= STEPS[i].minXp) idx = i;
  const st = STEPS[idx];
  const tier = TIERS[st.tierIndex];
  const isLegend = tier.id === 'leyenda';
  let nextMinXp, progress, nextName;
  let stars = 0;
  if (!isLegend) {
    nextMinXp = STEPS[idx + 1].minXp;
    progress = (xp - st.minXp) / (nextMinXp - st.minXp);
    nextName = stepName(idx + 1);
  } else {
    const over = xp - st.minXp;
    stars = Math.floor(over / LEGEND_STAR_XP);
    nextMinXp = st.minXp + (stars + 1) * LEGEND_STAR_XP;
    progress = (over % LEGEND_STAR_XP) / LEGEND_STAR_XP;
    nextName = `${tier.name} con ${U.plural(stars + 1, 'estrella', 'estrellas')}`;
  }
  return {
    index: idx,
    level: idx * 1000 + stars, // número comparable para detectar subidas
    tierIndex: st.tierIndex,
    tierId: tier.id,
    tierName: tier.name,
    division: st.division,
    name: stepName(idx) + (stars > 0 ? ` ★${stars}` : ''),
    colors: tier.colors,
    minXp: st.minXp,
    nextMinXp,
    nextName,
    xpToNext: nextMinXp - xp,
    progress: U.clamp(progress, 0, 1),
    stars,
    isLegend,
    xp,
  };
}

export function rankLadder() {
  return STEPS.map((st, i) => ({ index: i, name: stepName(i), minXp: st.minXp }));
}

// =========================================================
// XP
// =========================================================
export const RULES = Object.freeze({
  minCreditSec: 60,        // menos de 1 minuto no cuenta
  completionBonusRate: 0.1,
  completionBonusMin: 2,
  breakXp: 3,              // premiamos descansar (solo tras una sesión completa)
  firstOfDayXp: 5,
  streakXpPerDay: 1,
  streakXpMax: 10,
  activeDaySec: 600,       // 10 min estudiados = día activo para la racha
  rankUpGems: 15,
});

/**
 * Calcula la recompensa de un bloque de estudio.
 * capSec = límite saludable diario (en segundos) que cuenta para XP y ranking.
 */
export function studyReward({ actualSec, completed, dayCreditedSec = 0, capSec = 14400, isFirstToday = false, streak = 0 }) {
  const secs = Math.max(0, Math.floor(U.toNum(actualSec)));
  if (secs < RULES.minCreditSec) return { creditedSec: 0, xp: 0, items: [], capped: false, tooShort: true };
  const room = Math.max(0, Math.floor(capSec) - Math.floor(dayCreditedSec));
  const creditedSec = Math.min(secs, room);
  const capped = creditedSec < secs;
  const minutes = Math.floor(creditedSec / 60);
  const items = [];
  if (minutes > 0) {
    items.push({ label: `${minutes} min de estudio`, xp: minutes });
    if (completed) {
      items.push({ label: 'Sesión completa', xp: Math.max(RULES.completionBonusMin, Math.round(minutes * RULES.completionBonusRate)) });
    }
    if (isFirstToday) {
      const s = U.clamp(Math.floor(streak), 0, RULES.streakXpMax);
      items.push({
        label: s > 0 ? `Primera sesión del día (racha de ${s})` : 'Primera sesión del día',
        xp: RULES.firstOfDayXp + s * RULES.streakXpPerDay,
      });
    }
  }
  return { creditedSec, xp: items.reduce((a, b) => a + b.xp, 0), items, capped, tooShort: false };
}

/**
 * Lo que ganarías al completar un bloque de estudio de durationSec que empieza ahora.
 * La racha que da bono es la que venía hasta ayer (y solo en la primera sesión del día).
 */
export function previewStudyReward(state, durationSec, todayKey) {
  const day = state.daily[todayKey] || emptyDay();
  return studyReward({
    actualSec: durationSec,
    completed: true,
    dayCreditedSec: day.creditedSec,
    capSec: state.settings.dailyCapMin * 60,
    isFirstToday: day.creditedSec === 0,
    streak: streakBefore(state.daily, todayKey),
  });
}

// =========================================================
// Rachas
// =========================================================
export function isActiveDay(daily, key) {
  const d = daily && daily[key];
  return !!d && d.studySec >= RULES.activeDaySec;
}
export function computeStreak(daily, todayKey) {
  const activeToday = isActiveDay(daily, todayKey);
  let cursor = activeToday ? todayKey : U.shiftKey(todayKey, -1);
  let current = 0;
  while (current < 4000 && isActiveDay(daily, cursor)) {
    current++;
    cursor = U.shiftKey(cursor, -1);
  }
  return { current, activeToday };
}
/** Racha que venía hasta ayer (0 si ayer no estudiaste). */
export function streakBefore(daily, dayKey) {
  const yesterday = U.shiftKey(dayKey, -1);
  return isActiveDay(daily, yesterday) ? computeStreak(daily, yesterday).current : 0;
}

// =========================================================
// Día vacío (estructura de estadísticas diarias)
// =========================================================
export function emptyDay() {
  return { studySec: 0, creditedSec: 0, sessions: 0, partials: 0, breaks: 0, xp: 0, noPauseSessions: 0 };
}

// =========================================================
// Misiones diarias (3 por día, iguales para todos ese día)
// =========================================================
const MISSION_TYPES = {
  sessions: { core: true, icon: '🎯', pick: [1, 2], text: (n) => (n === 1 ? 'Completa 1 sesión de estudio' : `Completa ${n} sesiones de estudio`), progress: (d) => d.sessions, reward: (n) => ({ xp: 10 + 5 * n, gems: 5 + 2 * n }) },
  minutes:  { core: true, icon: '⏱️', pick: [20, 30, 45], text: (n) => `Estudia ${n} minutos`, progress: (d) => Math.floor(d.studySec / 60), reward: (n) => ({ xp: Math.round(n / 3) + 5, gems: n >= 45 ? 9 : 6 }) },
  breaks:   { icon: '🧃', pick: [1, 2], text: (n) => (n === 1 ? 'Toma 1 descanso completo' : `Toma ${n} descansos completos`), progress: (d) => d.breaks, reward: (n) => ({ xp: 6 * n, gems: 3 + 2 * n }) },
  nopause:  { icon: '🧘', pick: [1], text: () => 'Completa una sesión sin pausar', progress: (d) => d.noPauseSessions, reward: () => ({ xp: 12, gems: 6 }) },
};

export function dailyMissions(dayKey) {
  const rnd = U.mulberry32(U.hashString('missions:' + dayKey));
  const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
  const core = pickOne(Object.keys(MISSION_TYPES).filter((k) => MISSION_TYPES[k].core));
  const others = Object.keys(MISSION_TYPES).filter((k) => !MISSION_TYPES[k].core);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return [core, others[0], others[1]].map((type) => {
    const def = MISSION_TYPES[type];
    const target = pickOne(def.pick);
    return { id: `${dayKey}:${type}:${target}`, day: dayKey, type, icon: def.icon, target, text: def.text(target), reward: def.reward(target) };
  });
}

export function missionProgress(mission, day) {
  const def = MISSION_TYPES[mission.type];
  const raw = def ? Math.floor(U.toNum(def.progress(day || emptyDay()))) : 0;
  const current = U.clamp(raw, 0, mission.target);
  return { current, target: mission.target, done: raw >= mission.target };
}

// =========================================================
// Logros
// =========================================================
export const RARITY = {
  comun:      { label: 'Común', gems: 10 },
  raro:       { label: 'Raro', gems: 20 },
  epico:      { label: 'Épico', gems: 40 },
  legendario: { label: 'Legendario', gems: 80 },
};

export const ACHIEVEMENTS = [
  { id: 'primer-paso',     icon: '🌱', name: 'Primer paso',    desc: 'Completa tu primera sesión de estudio.', rarity: 'comun', test: (c) => c.sessions >= 1 },
  { id: 'a-tu-medida',     icon: '🛠️', name: 'A tu medida',    desc: 'Ajusta la duración de tu temporizador.', rarity: 'comun', test: (c) => c.customized },
  { id: 'madrugador',      icon: '🧃', name: 'Pausa activa',   desc: 'Toma 5 descansos completos.', rarity: 'comun', test: (c) => c.breaks >= 5 },
  { id: 'descanso-pro',    icon: '🧘', name: 'Descanso pro',   desc: 'Completa 10 descansos.', rarity: 'comun', test: (c) => c.breaks >= 10 },
  { id: 'chispa',          icon: '✨', name: 'Chispa',         desc: 'Estudia 3 días seguidos.', rarity: 'comun', test: (c) => c.bestStreak >= 3 },
  { id: 'en-marcha',       icon: '🚲', name: 'En marcha',      desc: 'Completa 10 sesiones.', rarity: 'comun', test: (c) => c.sessions >= 10 },
  { id: 'en-llamas',       icon: '🔥', name: 'En llamas',      desc: 'Estudia 7 días seguidos.', rarity: 'raro', test: (c) => c.bestStreak >= 7 },
  { id: 'combo',           icon: '🎯', name: 'Combo x4',       desc: 'Completa 4 sesiones seguidas sin saltar ni terminar antes.', rarity: 'raro', test: (c) => c.bestCombo >= 4 },
  { id: 'semana-constante', icon: '📅', name: 'Semana constante', desc: 'Estudia al menos 10 minutos en 5 días de una misma semana.', rarity: 'raro', test: (c) => c.maxActiveDaysInWeek >= 5 },
  { id: 'maraton',         icon: '🏃', name: 'Maratón',        desc: 'Completa una sesión de 90 minutos o más.', rarity: 'raro', test: (c) => c.longestSessionSec >= 5400 },
  { id: 'veinticinco',     icon: '🏅', name: 'Veinticinco',    desc: 'Completa 25 sesiones.', rarity: 'raro', test: (c) => c.sessions >= 25 },
  { id: 'diez-horas',      icon: '⏳', name: '10 horas',       desc: 'Acumula 10 horas de estudio.', rarity: 'raro', test: (c) => c.studySec >= 36000 },
  { id: 'imparable',       icon: '🚀', name: 'Imparable',      desc: 'Completa 50 sesiones.', rarity: 'epico', test: (c) => c.sessions >= 50 },
  { id: 'cazamisiones',    icon: '🎖️', name: 'Cazamisiones',   desc: 'Reclama 15 misiones diarias.', rarity: 'epico', test: (c) => c.missionsClaimed >= 15 },
  { id: 'toque-dorado',    icon: '🥇', name: 'Toque dorado',   desc: 'Llega al rango Oro.', rarity: 'epico', test: (c) => c.tierIndex >= 2 },
  { id: 'cincuenta-horas', icon: '📚', name: '50 horas',       desc: 'Acumula 50 horas de estudio.', rarity: 'epico', test: (c) => c.studySec >= 180000 },
  { id: 'inquebrantable',  icon: '💎', name: 'Inquebrantable', desc: 'Estudia 30 días seguidos.', rarity: 'legendario', test: (c) => c.bestStreak >= 30 },
  { id: 'centenario',      icon: '🏛️', name: 'Centenario',     desc: 'Acumula 100 horas de estudio.', rarity: 'legendario', test: (c) => c.studySec >= 360000 },
];
export const ACHIEVEMENT_BY_ID = U.byId(ACHIEVEMENTS);

export function evaluateAchievements(ctx, unlocked) {
  return ACHIEVEMENTS.filter((a) => !(unlocked && unlocked[a.id]) && a.test(ctx)).map((a) => a.id);
}

// =========================================================
// Salud del polo: si estudias, el paisaje se mantiene limpio; si lo dejas, se contamina.
// Usa los últimos 3 días (los días antes de crear tu perfil cuentan como limpios) y hoy.
// =========================================================
export const POLE_GOAL_MIN = 45; // minutos al día que mantienen el polo limpio

export function poleHealth(daily, todayKey, createdKey, goalMin = POLE_GOAL_MIN) {
  const ratio = (key) => {
    if (createdKey && key < createdKey) return 1;
    const d = daily && daily[key];
    return d ? U.clamp(d.studySec / 60 / goalMin, 0, 1) : 0;
  };
  const day = (n) => U.shiftKey(todayKey, -n);
  const base = 0.5 * ratio(day(1)) + 0.3 * ratio(day(2)) + 0.2 * ratio(day(3));
  return U.clamp(base * 0.7 + ratio(todayKey) * 0.5, 0, 1);
}

export function poleLevel(health) {
  if (health >= 0.8) return { id: 'limpio', label: 'Limpio', text: 'Tu polo está limpio. ¡Los pingüinos están felices!' };
  if (health >= 0.55) return { id: 'neblina', label: 'Algo de neblina', text: 'Empieza a aparecer neblina. Una sesión más y vuelve a brillar.' };
  if (health >= 0.3) return { id: 'contaminado', label: 'Contaminándose', text: 'El esmog está llegando. Estudia hoy para limpiarlo.' };
  return { id: 'critico', label: 'Muy contaminado', text: 'Tu polo necesita ayuda. Cada sesión que completes lo limpia.' };
}

// =========================================================
// Calendario: intensidad de cada día y resumen del mes
// =========================================================
/** 0 = no estudió, 1 = poquito, 2 = casi la meta, 3 = cumplió la meta del polo, 4 = el doble o más. */
export function studyLevel(min, goalMin = POLE_GOAL_MIN) {
  if (!(min > 0)) return 0;
  if (min < goalMin / 3) return 1;
  if (min < goalMin) return 2;
  if (min < goalMin * 2) return 3;
  return 4;
}

/** Minutos totales, días con estudio, días que cumplieron la meta y el mejor día de un mes (0–11). */
export function monthSummary(daily, year, month, goalMin = POLE_GOAL_MIN) {
  const out = { totalMin: 0, activeDays: 0, goalDays: 0, best: null };
  for (const key of U.monthCells(year, month)) {
    if (!key) continue;
    const min = Math.round(((daily && daily[key] && daily[key].studySec) || 0) / 60);
    if (!min) continue;
    out.totalMin += min;
    out.activeDays += 1;
    if (min >= goalMin) out.goalDays += 1;
    if (!out.best || min > out.best.min) out.best = { key, min };
  }
  return out;
}
