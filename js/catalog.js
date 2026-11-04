/*
 * StudyTimer — catálogo: lo que se puede elegir o poseer y qué está "en efecto".
 * Temas del temporizador, compañeros, modos del pomodoro, tonos, sonidos de concentración,
 * regiones y Premium. Funciones puras, sin DOM ni almacenamiento.
 *
 * Regla central: los ajustes guardan lo que la persona ELIGIÓ; effectivePrefs() dice lo que
 * se USA ahora (por ejemplo, si Premium venció, un tema Premium vuelve al Clásico). La interfaz
 * nunca repite esas comprobaciones por su cuenta.
 */
import * as U from './util.js';
import { TIERS, rankForXp } from './game.js';

// =========================================================
// Premium
// =========================================================
export const isPremium = (state) => !!(state.premium && state.premium.active);

/** Un elemento del catálogo se puede usar si no es Premium o si la persona tiene Premium. */
export function canUse(item, premium) {
  return !!item && (!item.premium || !!premium);
}

// =========================================================
// Temas del temporizador (solo gemas ganadas estudiando, nada con dinero real).
// Gratis: con gemas o por rango. Premium (👑): todos se pueden usar mientras dure la suscripción.
// =========================================================
export const SKINS = [
  { id: 'clasico',   name: 'Clásico',   a: '#5B8CFF', b: '#A9C6FF', cost: 0 },
  { id: 'menta',     name: 'Menta',     a: '#21C995', b: '#B8FFE6', cost: 30 },
  { id: 'hielo',     name: 'Hielo',     a: '#7FD3FF', b: '#E8F7FF', cost: 60 },
  { id: 'dorado',    name: 'Dorado',    a: '#E9A300', b: '#FFF1A6', cost: 0, requireTier: 2 },
  { id: 'aurora',    name: 'Aurora',    a: '#2EE6B6', b: '#B98CFF', cost: 0, premium: true },
  { id: 'atardecer', name: 'Atardecer', a: '#FF5E7E', b: '#FFC531', cost: 0, premium: true },
  { id: 'galaxia',   name: 'Galaxia',   a: '#7A2CF0', b: '#4CC9FF', cost: 0, premium: true },
  { id: 'leyenda',   name: 'Leyenda',   a: '#F2522F', b: '#FFE680', cost: 0, requireTier: 6 },
];
export const SKIN_BY_ID = U.byId(SKINS);

/**
 * Estado de un tema para quien lo mira:
 *  owned      ya es tuyo
 *  unlockable lo ganaste por rango: se desbloquea gratis y queda tuyo
 *  included   no es tuyo, pero Premium te deja usarlo mientras dure
 *  buyable    alcanza con tus gemas
 *  premium / locked / expensive  no se puede todavía (con reason)
 */
export function skinStatus(skin, { gems = 0, owned = [], tierIndex = 0, premium = false } = {}) {
  if (owned.includes(skin.id)) return { state: 'owned' };
  if (skin.requireTier != null && tierIndex >= skin.requireTier) return { state: 'unlockable' };
  if (premium) return { state: 'included' };
  if (skin.premium) return { state: 'premium', reason: 'Incluido en Premium' };
  if (skin.requireTier != null) return { state: 'locked', reason: `Llega a ${TIERS[skin.requireTier].name}` };
  return gems >= skin.cost ? { state: 'buyable' } : { state: 'expensive', reason: `Te faltan ${skin.cost - gems} gemas` };
}

export function skinStatusFor(state, skin) {
  return skinStatus(skin, {
    gems: state.progress.gems,
    owned: state.progress.owned,
    tierIndex: rankForXp(state.progress.xp).tierIndex,
    premium: isPremium(state),
  });
}

// =========================================================
// Compañeros: skins limitadas que SOLO se desbloquean con logros.
// Personajes originales de StudyTimer (no usan memes ni personajes de terceros).
// =========================================================
export const COMPANIONS = [
  { id: 'pinguino',         name: 'Pingüino',         unlock: 'primer-paso', tagline: 'Tu primer amigo del polo. Se emociona con cada sesión.' },
  { id: 'zorro-artico',     name: 'Zorro Ártico',     unlock: 'chispa',      tagline: 'Su pelaje cambia con las estaciones; tú, con cada racha.' },
  { id: 'oso-polar',        name: 'Oso Polar',        unlock: 'combo',       tagline: 'Abrazos tibios para sesiones frías.' },
  { id: 'oso-marino',       name: 'Oso Marino',       unlock: 'en-llamas',   tagline: 'Nada miles de kilómetros: la constancia es lo suyo.' },
  { id: 'tiburon-martillo', name: 'Tiburón Martillo', unlock: 'maraton',     tagline: 'Ve el mundo de lado a lado, como tu plan de estudio.' },
];
export const COMPANION_BY_ID = U.byId(COMPANIONS);
export const COMPANION_BY_ACHIEVEMENT = U.byId(COMPANIONS, 'unlock');
export function companionUnlocked(id, achievements) {
  const c = COMPANION_BY_ID[id];
  return !!c && !!(achievements && achievements[c.unlock]);
}

// =========================================================
// Modos del pomodoro y "Mi ritmo"
// =========================================================
export const PRESETS = [
  { id: 'mini',     name: 'Mini',     study: 15, brk: 5,  long: 15 },
  { id: 'clasico',  name: 'Clásico',  study: 25, brk: 5,  long: 15 },
  { id: 'enfoque',  name: 'Enfoque',  study: 45, brk: 10, long: 20 },
  { id: 'profundo', name: 'Profundo', study: 50, brk: 10, long: 25 },
  { id: 'largo',    name: 'Largo',    study: 60, brk: 15, long: 30 },
  { id: 'personalizado', name: 'Mi ritmo' },
];
export const PRESET_BY_ID = U.byId(PRESETS);
export const CUSTOM_PRESET = 'personalizado';

// Descanso largo automático: después de cada 4 pomodoros completos.
export const LONG_EVERY = 4;
export function longBreakFor(breakMin) {
  return U.clamp(Math.round((breakMin * 2) / 5) * 5, 15, 45);
}

// Límites de "Mi ritmo": la versión gratis tiene un rango acotado; Premium es libre.
const DURATION_LIMITS = Object.freeze({
  free: Object.freeze({ study: [10, 60], brk: [5, 15] }),
  premium: Object.freeze({ study: [1, 180], brk: [1, 60] }),
});
export function durationLimits(premium) {
  return premium ? DURATION_LIMITS.premium : DURATION_LIMITS.free;
}

/**
 * Minutos de estudio, descanso y descanso largo que están en efecto.
 * Se derivan SIEMPRE del modo elegido: no hay una copia guardada que se pueda desincronizar.
 * Si Premium venció, "Mi ritmo" vuelve a los límites gratis (sin perder lo que elegiste).
 */
export function sessionDurations(settings, premium) {
  const preset = PRESET_BY_ID[settings.preset];
  if (preset && preset.study) return { study: preset.study, brk: preset.brk, long: preset.long };
  const L = durationLimits(premium);
  const study = U.clamp(settings.customStudyMin, L.study[0], L.study[1]);
  const brk = U.clamp(settings.customBreakMin, L.brk[0], L.brk[1]);
  return { study, brk, long: longBreakFor(brk) };
}
/** Texto corto de un modo: "25 + 5". */
export function presetLabel(preset, settings) {
  return preset.study ? `${preset.study} + ${preset.brk}` : `${settings.customStudyMin} + ${settings.customBreakMin}`;
}

/** Qué bloque sigue después de uno terminado. cycle = pomodoros completos hasta ahora. */
export function nextModeAfter(rec, cycle) {
  if (rec.mode !== 'study') return 'study';
  return rec.completed && cycle > 0 && cycle % LONG_EVERY === 0 ? 'long' : 'break';
}

// =========================================================
// Sonido: tonos de aviso y sonidos de concentración
// =========================================================
export const TONE_PACKS = [
  { id: 'clasico',    name: 'Clásico' },
  { id: 'campanitas', name: 'Campanitas' },
  { id: 'suave',      name: 'Suave' },
  { id: 'burbujas',   name: 'Burbujas', premium: true },
  { id: 'arcade',     name: 'Arcade',   premium: true },
];
export const TONE_BY_ID = U.byId(TONE_PACKS);
export const AMBIENTS = [
  { id: 'blanco', name: 'Ruido blanco', icon: '🌫️' },
  { id: 'lluvia', name: 'Lluvia',       icon: '🌧️' },
  { id: 'viento', name: 'Viento polar', icon: '🌬️' },
  { id: 'marron', name: 'Ruido marrón', icon: '🟤', premium: true },
  { id: 'rosa',   name: 'Ruido rosa',   icon: '🌸', premium: true },
  { id: 'olas',   name: 'Olas del mar', icon: '🌊', premium: true },
  { id: 'fogata', name: 'Fogata',       icon: '🔥', premium: true },
];
export const AMBIENT_BY_ID = U.byId(AMBIENTS);
export const DEFAULT_AMBIENT = 'lluvia';

// =========================================================
// Región: define cuándo es de día o de noche en el paisaje (y la fogata)
// =========================================================
export const REGIONS = [
  { id: '', name: 'Automática (este dispositivo)' },
  { id: 'America/Bogota', name: 'Colombia' },
  { id: 'America/Mexico_City', name: 'México' },
  { id: 'America/Lima', name: 'Perú' },
  { id: 'America/Guayaquil', name: 'Ecuador' },
  { id: 'America/Caracas', name: 'Venezuela' },
  { id: 'America/Panama', name: 'Panamá' },
  { id: 'America/Costa_Rica', name: 'Costa Rica' },
  { id: 'America/Guatemala', name: 'Guatemala' },
  { id: 'America/Santo_Domingo', name: 'República Dominicana' },
  { id: 'America/Puerto_Rico', name: 'Puerto Rico' },
  { id: 'America/Santiago', name: 'Chile' },
  { id: 'America/Argentina/Buenos_Aires', name: 'Argentina' },
  { id: 'America/Montevideo', name: 'Uruguay' },
  { id: 'America/Asuncion', name: 'Paraguay' },
  { id: 'America/La_Paz', name: 'Bolivia' },
  { id: 'America/Sao_Paulo', name: 'Brasil (São Paulo)' },
  { id: 'America/New_York', name: 'Estados Unidos (Este)' },
  { id: 'America/Chicago', name: 'Estados Unidos (Centro)' },
  { id: 'America/Los_Angeles', name: 'Estados Unidos (Pacífico)' },
  { id: 'America/Toronto', name: 'Canadá (Toronto)' },
  { id: 'Europe/Madrid', name: 'España' },
  { id: 'Europe/London', name: 'Reino Unido' },
  { id: 'Europe/Berlin', name: 'Alemania' },
  { id: 'Asia/Tokyo', name: 'Japón' },
  { id: 'Australia/Sydney', name: 'Australia (Sídney)' },
];
export const REGION_BY_ID = U.byId(REGIONS);

// =========================================================
// Lo que está en efecto ahora mismo
// =========================================================
/**
 * Resuelve los ajustes elegidos contra lo que la persona puede usar hoy.
 * Es la ÚNICA fuente de verdad para "¿qué tema / tono / sonido / duración se usa?".
 */
export function effectivePrefs(state) {
  const premium = isPremium(state);
  const s = state.settings;
  const chosenSkin = SKIN_BY_ID[s.skin];
  const skin = chosenSkin && (premium || state.progress.owned.includes(chosenSkin.id)) ? chosenSkin : SKINS[0];
  const ambient = AMBIENT_BY_ID[s.ambient];
  return {
    premium,
    skin,
    tonePack: canUse(TONE_BY_ID[s.tonePack], premium) ? s.tonePack : 'clasico',
    ambient: canUse(ambient, premium) ? ambient : null,
    durations: sessionDurations(s, premium),
    limits: durationLimits(premium),
  };
}
