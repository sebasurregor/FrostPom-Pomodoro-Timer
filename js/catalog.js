/*
 * FrostPom — catálogo: lo que se puede elegir o poseer y qué está "en efecto".
 * Temas del temporizador, compañeros, modos del pomodoro, tonos, sonidos de concentración,
 * regiones y Premium. Funciones puras, sin DOM ni almacenamiento.
 *
 * Regla central: los ajustes guardan lo que la persona ELIGIÓ; effectivePrefs() dice lo que
 * se USA ahora (por ejemplo, si Premium venció, un tema Premium vuelve al Clásico). La interfaz
 * nunca repite esas comprobaciones por su cuenta.
 */
import * as U from './util.js';
import { TIERS, rankForXp } from './game.js';
import { t, tr } from './i18n.js';

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
  { id: 'clasico',   name: tr('Clásico'),   a: '#5B8CFF', b: '#A9C6FF', cost: 0 },
  { id: 'menta',     name: tr('Menta'),     a: '#21C995', b: '#B8FFE6', cost: 30 },
  { id: 'hielo',     name: tr('Hielo'),     a: '#7FD3FF', b: '#E8F7FF', cost: 60 },
  { id: 'dorado',    name: tr('Dorado'),    a: '#E9A300', b: '#FFF1A6', cost: 0, requireTier: 2 },
  { id: 'aurora',    name: tr('Aurora'),    a: '#2EE6B6', b: '#B98CFF', cost: 0, premium: true },
  { id: 'atardecer', name: tr('Atardecer'), a: '#FF5E7E', b: '#FFC531', cost: 0, premium: true },
  { id: 'galaxia',   name: tr('Galaxia'),   a: '#7A2CF0', b: '#4CC9FF', cost: 0, premium: true },
  { id: 'leyenda',   name: tr('Leyenda'),   a: '#F2522F', b: '#FFE680', cost: 0, requireTier: 6 },
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
  if (skin.premium) return { state: 'premium', reason: tr('Incluido en Premium') };
  if (skin.requireTier != null) return { state: 'locked', reason: t('Llega a {rank}', { rank: tr(TIERS[skin.requireTier].name) }) };
  return gems >= skin.cost ? { state: 'buyable' } : { state: 'expensive', reason: t('Te faltan {n} gemas', { n: skin.cost - gems }) };
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
// Compañeros: el Pingüino viene con la cuenta (starter); los demás son skins limitadas
// que SOLO se desbloquean con logros (o con el regalo de Premium).
// Personajes originales de FrostPom (no usan memes ni personajes de terceros).
// =========================================================
export const COMPANIONS = [
  { id: 'pinguino',         name: tr('Pingüino'),         unlock: null, starter: true, tagline: tr('Tu primer amigo del polo. Se emociona con cada sesión.') },
  { id: 'zorro-artico',     name: tr('Zorro Ártico'),     unlock: 'chispa',      tagline: tr('Su pelaje cambia con las estaciones; tú, con cada racha.') },
  { id: 'oso-polar',        name: tr('Oso Polar'),        unlock: 'combo',       tagline: tr('Abrazos tibios para sesiones frías.') },
  { id: 'oso-marino',       name: tr('Oso Marino'),       unlock: 'en-llamas',   tagline: tr('Nada miles de kilómetros: la constancia es lo suyo.') },
  { id: 'tiburon-martillo', name: tr('Tiburón Martillo'), unlock: 'maraton',     tagline: tr('Ve el mundo de lado a lado, como tu plan de estudio.') },
];
export const COMPANION_BY_ID = U.byId(COMPANIONS);
export const COMPANION_BY_ACHIEVEMENT = U.byId(COMPANIONS.filter((c) => c.unlock), 'unlock');
/** Un compañero está desbloqueado si viene con la cuenta, si ganaste su logro o si te lo regalaron (Premium). */
export function companionUnlocked(id, achievements, gifted = []) {
  const c = COMPANION_BY_ID[id];
  return !!c && (!!c.starter || !!(c.unlock && achievements && achievements[c.unlock]) || (Array.isArray(gifted) && gifted.includes(id)));
}
/** Compañeros que todavía no tienes (los que se pueden elegir como regalo). El Pingüino nunca sale aquí. */
export function lockedCompanions(progress) {
  return COMPANIONS.filter((c) => !companionUnlocked(c.id, progress.achievements, progress.gifted));
}

// =========================================================
// Modos del pomodoro y "Mi ritmo"
// =========================================================
export const PRESETS = [
  { id: 'mini',     name: tr('Mini'),     study: 15, brk: 5,  long: 15 },
  { id: 'clasico',  name: tr('Clásico'),  study: 25, brk: 5,  long: 15 },
  { id: 'enfoque',  name: tr('Enfoque'),  study: 45, brk: 10, long: 20 },
  { id: 'profundo', name: tr('Profundo'), study: 50, brk: 10, long: 25 },
  { id: 'largo',    name: tr('Largo'),    study: 60, brk: 15, long: 30 },
  { id: 'personalizado', name: tr('Mi ritmo') },
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
  { id: 'clasico',    name: tr('Clásico') },
  { id: 'campanitas', name: tr('Campanitas') },
  { id: 'suave',      name: tr('Suave') },
  { id: 'burbujas',   name: tr('Burbujas'), premium: true },
  { id: 'arcade',     name: tr('Arcade'),   premium: true },
];
export const TONE_BY_ID = U.byId(TONE_PACKS);
export const AMBIENTS = [
  { id: 'blanco', name: tr('Ruido blanco'), icon: '🌫️' },
  { id: 'lluvia', name: tr('Lluvia'),       icon: '🌧️' },
  { id: 'viento', name: tr('Viento polar'), icon: '🌬️' },
  { id: 'marron', name: tr('Ruido marrón'), icon: '🟤', premium: true },
  { id: 'rosa',   name: tr('Ruido rosa'),   icon: '🌸', premium: true },
  { id: 'olas',   name: tr('Olas del mar'), icon: '🌊', premium: true },
  { id: 'fogata', name: tr('Fogata'),       icon: '🔥', premium: true },
  { id: 'pajaros', name: tr('Lluvia y pájaros'), icon: '🐦', premium: true }, // v4.0.2
];
export const AMBIENT_BY_ID = U.byId(AMBIENTS);
export const DEFAULT_AMBIENT = 'lluvia';

// =========================================================
// Región: define cuándo es de día o de noche en el paisaje (y la fogata)
// =========================================================
export const REGIONS = [
  { id: '', name: tr('Automática (este dispositivo)') },
  { id: 'America/Bogota', name: tr('Colombia') },
  { id: 'America/Mexico_City', name: tr('México') },
  { id: 'America/Lima', name: tr('Perú') },
  { id: 'America/Guayaquil', name: tr('Ecuador') },
  { id: 'America/Caracas', name: tr('Venezuela') },
  { id: 'America/Panama', name: tr('Panamá') },
  { id: 'America/Costa_Rica', name: tr('Costa Rica') },
  { id: 'America/Guatemala', name: tr('Guatemala') },
  { id: 'America/Santo_Domingo', name: tr('República Dominicana') },
  { id: 'America/Puerto_Rico', name: tr('Puerto Rico') },
  { id: 'America/Santiago', name: tr('Chile') },
  { id: 'America/Argentina/Buenos_Aires', name: tr('Argentina') },
  { id: 'America/Montevideo', name: tr('Uruguay') },
  { id: 'America/Asuncion', name: tr('Paraguay') },
  { id: 'America/La_Paz', name: tr('Bolivia') },
  { id: 'America/Sao_Paulo', name: tr('Brasil (São Paulo)') },
  { id: 'America/New_York', name: tr('Estados Unidos (Este)') },
  { id: 'America/Chicago', name: tr('Estados Unidos (Centro)') },
  { id: 'America/Los_Angeles', name: tr('Estados Unidos (Pacífico)') },
  { id: 'America/Toronto', name: tr('Canadá (Toronto)') },
  { id: 'Europe/Madrid', name: tr('España') },
  { id: 'Europe/London', name: tr('Reino Unido') },
  { id: 'Europe/Berlin', name: tr('Alemania') },
  { id: 'Asia/Tokyo', name: tr('Japón') },
  { id: 'Australia/Sydney', name: tr('Australia (Sídney)') },
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
