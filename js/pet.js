/*
 * FrostPom — tu mascota y su comida.
 * La mascota es el compañero que tienes equipado (o el pingüino si no tienes ninguno).
 * Su barriguita va de 0 a 100 y baja sola con el tiempo (3 puntos por hora: de llena a vacía
 * en poco más de un día). Con gemas le das de comer en la Tienda; cada animal tiene comidas
 * favoritas que lo llenan más. Darle de comer es solo por cariño: no da XP ni ventajas.
 *
 * (v4.2) Se le nota el hambre: entre más vacía la barriguita, más triste se ve (y llora).
 * Si pasa 3 días seguidos con la barriguita en 0, se muere y queda una tumba; se puede revivir
 * con gemas. Solo le da hambre a la mascota que está CONTIGO: las demás descansan en el polo
 * (su barriguita se queda quieta hasta que vuelvas a elegirlas). Cada mascota puede tener nombre.
 *
 * Registro de cada mascota en state.pets[id]:
 *   { fullness, at, name?, rest?, dead? }
 *   fullness = barriguita en el momento `at` (desde ahí baja sola, salvo si descansa o murió)
 *   rest     = true: no es la mascota de ahora, su barriguita no baja
 *   dead     = fecha en que murió (barriguita 0 hasta que la revivas)
 *
 * Módulo puro: sin DOM ni almacenamiento.
 */
import * as U from './util.js';
import { tr } from './i18n.js';
import { isBlockedName } from './identity.js';

export const DECAY_PER_HOUR = 3;
export const START_FULLNESS = 60;
export const FULL_AT = 95; // desde aquí ya no quiere comer más
export const FAVORITE_BONUS = 1.5;
export const STARVE_HOURS = 72; // horas seguidas con la barriguita en 0 antes de morir (3 días)
export const WEAK_HOURS = 24; // en las últimas 24 horas se ve débil (pálido)
export const REVIVE_COST = 30; // gemas para revivirla (más o menos un día de misiones)
export const REVIVE_FULLNESS = 50; // con cuánta barriguita vuelve
export const NAME_MAX = 16; // largo máximo del nombre (en caracteres)
const HOUR = 3600000;

// Arte del autor en assets/food. cost = gemas, fill = cuánto llena la barriguita.
export const FOODS = Object.freeze([
  { id: 'pescado', name: tr('Pescado'), cost: 2, fill: 12 },
  { id: 'camaron', name: tr('Camarón'), cost: 2, fill: 12 },
  { id: 'arandanos', name: tr('Arándanos'), cost: 2, fill: 10 },
  { id: 'galleta', name: tr('Galleta estrella'), cost: 3, fill: 15 },
  { id: 'cangrejo', name: tr('Cangrejo'), cost: 3, fill: 16 },
  { id: 'calamar', name: tr('Calamar'), cost: 3, fill: 16 },
  { id: 'pescado-helado', name: tr('Pescado congelado'), cost: 3, fill: 18 },
  { id: 'sardinas', name: tr('Frasco de sardinas'), cost: 4, fill: 20 },
  { id: 'sopa', name: tr('Sopa de pescado'), cost: 4, fill: 22 },
  { id: 'pollo', name: tr('Pollo asado'), cost: 5, fill: 28 },
  { id: 'jamon', name: tr('Jamón asado'), cost: 5, fill: 28 },
  { id: 'almeja', name: tr('Almeja de lujo'), cost: 8, fill: 40 },
].map((f) => Object.freeze({ ...f, img: `assets/food/${f.id}.webp` })));
export const FOOD_BY_ID = U.byId(FOODS);

/** Qué animal es cada mascota y sus comidas favoritas. */
export const PETS = Object.freeze({
  pinguino: { kind: 'penguin', name: tr('Pingüino'), favorites: ['pescado', 'camaron', 'calamar', 'pescado-helado'] },
  'oso-polar': { kind: 'bear', name: tr('Oso Polar'), favorites: ['jamon', 'pollo', 'arandanos', 'sardinas'] },
  'oso-marino': { kind: 'seal', name: tr('Oso Marino'), favorites: ['pescado', 'calamar', 'cangrejo', 'camaron'] },
  'tiburon-martillo': { kind: 'shark', name: tr('Tiburón Martillo'), favorites: ['pescado', 'calamar', 'jamon', 'pescado-helado'] },
  'zorro-artico': { kind: 'fox', name: tr('Zorro Ártico'), favorites: ['pollo', 'arandanos', 'galleta', 'cangrejo'] },
});
export const isPetId = (id) => typeof id === 'string' && Object.hasOwn(PETS, id);

/** La mascota de ahora: el compañero equipado o, si no hay, el pingüino. */
export const currentPetId = (state) => (isPetId(state.profile.companion) ? state.profile.companion : 'pinguino');

export const isFavorite = (petId, foodId) => !!PETS[petId] && PETS[petId].favorites.includes(foodId);

const record = (state, petId) => (state.pets && Object.hasOwn(state.pets, petId) ? state.pets[petId] : null);

/**
 * Cómo está la mascota ahora:
 *  { fullness, dead, diedAt?, resting?, starvingHours?, hoursLeft? }
 *  starvingHours = cuántas horas lleva con la barriguita en 0; hoursLeft = cuántas le quedan.
 * Una mascota que todavía no tiene registro está como recién llegada (START_FULLNESS).
 */
export function petStatus(state, petId, now = new Date()) {
  const r = record(state, petId);
  if (!r) return { fullness: START_FULLNESS, dead: false };
  if (r.dead) return { fullness: 0, dead: true, diedAt: r.dead };
  if (r.rest) return { fullness: U.clamp(r.fullness, 0, 100), dead: false, resting: true };
  const since = Date.parse(r.at);
  const hours = Number.isFinite(since) ? Math.max(0, (now.getTime() - since) / HOUR) : 0;
  const raw = r.fullness - hours * DECAY_PER_HOUR;
  if (raw > 0) return { fullness: U.clamp(Math.round(raw * 10) / 10, 0, 100), dead: false };
  const zeroAt = since + (Math.max(0, r.fullness) / DECAY_PER_HOUR) * HOUR;
  const starving = Number.isFinite(zeroAt) ? Math.max(0, (now.getTime() - zeroAt) / HOUR) : 0;
  if (starving >= STARVE_HOURS) return { fullness: 0, dead: true, diedAt: new Date(zeroAt + STARVE_HOURS * HOUR).toISOString() };
  return { fullness: 0, dead: false, starvingHours: starving, hoursLeft: STARVE_HOURS - starving };
}

/** Barriguita ahora (0–100). */
export const fullness = (state, petId, now = new Date()) => petStatus(state, petId, now).fullness;
export const isDead = (state, petId, now = new Date()) => petStatus(state, petId, now).dead;

/** Cómo se siente según su barriguita (lo que dice la bandeja de comida). */
export function mood(value, status = null) {
  if (status && status.dead) return { id: 'muerto', label: tr('Se murió de hambre'), emoji: '🪦' };
  if (value >= 80) return { id: 'lleno', label: tr('¡Lleno y feliz!'), emoji: '😊' };
  if (value >= 50) return { id: 'contento', label: tr('Contento'), emoji: '🙂' };
  if (value >= 25) return { id: 'hambre', label: tr('Con hambre'), emoji: '😟' };
  if (value > 0) return { id: 'mucha-hambre', label: tr('¡Tiene mucha hambre!'), emoji: '🥺' };
  return { id: 'muriendo', label: tr('¡Se muere de hambre!'), emoji: '😭' };
}

/**
 * Qué cara pone el compañero de Enfocar (la animación que se ve):
 *  'feliz' (50 o más) → 'triste' (25–49) → 'lloroso' (menos de 25) → 'llorando' (en 0)
 *  → 'debil' (en 0 y le queda menos de un día) → 'muerto' (la tumba).
 */
export function face(status) {
  if (status.dead) return 'muerto';
  if (status.fullness >= 50) return 'feliz';
  if (status.fullness >= 25) return 'triste';
  if (status.fullness > 0) return 'lloroso';
  return status.hoursLeft !== undefined && status.hoursLeft <= WEAK_HOURS ? 'debil' : 'llorando';
}

/**
 * Pone en orden los registros: la mascota de ahora tiene registro y su barriguita corre;
 * las demás descansan (su barriguita se congela en lo que tenían). Devuelve true si cambió algo.
 * Se llama al cambiar de compañero, al darle de comer y al abrir la app.
 */
export function settle(state, now = new Date()) {
  if (!state.pets || typeof state.pets !== 'object') state.pets = U.dict();
  const cur = currentPetId(state);
  const iso = now.toISOString();
  let changed = false;
  for (const id of Object.keys(PETS)) {
    const r = record(state, id);
    if (id === cur) {
      if (!r) {
        state.pets[id] = { fullness: START_FULLNESS, at: iso };
        changed = true;
      } else if (r.rest && !r.dead) {
        const next = { ...r, at: iso };
        delete next.rest;
        state.pets[id] = next;
        changed = true;
      }
    } else if (r && !r.rest && !r.dead) {
      const st = petStatus(state, id, now);
      state.pets[id] = st.dead
        ? { ...r, fullness: 0, at: st.diedAt, dead: st.diedAt }
        : { ...r, fullness: st.fullness, at: iso, rest: true };
      changed = true;
    }
  }
  return changed;
}
/** ¿Hace falta settle()? (para no guardar si no cambió nada) */
export function needsSettle(state) {
  const cur = currentPetId(state);
  return Object.keys(PETS).some((id) => {
    const r = record(state, id);
    return id === cur ? !r || (r.rest && !r.dead) : !!r && !r.rest && !r.dead;
  });
}

/**
 * Datos de la v4.1 o anteriores: la mascota de ahora conserva su barriguita, pero el reloj de
 * "3 días en 0" empieza hoy (nadie encuentra su mascota muerta solo por actualizar la app).
 * Las demás quedan descansando con la barriguita que tenían.
 */
export function migrateFromV3(state, now = new Date()) {
  const cur = currentPetId(state);
  const iso = now.toISOString();
  const old = (id) => {
    const r = record(state, id);
    const base = r ? r.fullness : START_FULLNESS;
    const since = r ? Date.parse(r.at) : Date.parse(state.createdAt);
    const hours = Number.isFinite(since) ? Math.max(0, (now.getTime() - since) / HOUR) : 0;
    return U.clamp(Math.round((base - hours * DECAY_PER_HOUR) * 10) / 10, 0, 100);
  };
  for (const id of Object.keys(PETS)) {
    if (id === cur) state.pets[id] = { fullness: old(id), at: iso };
    else if (record(state, id)) state.pets[id] = { fullness: old(id), at: iso, rest: true };
  }
}

/** Nombre de la mascota ('' si no tiene). */
export const petName = (state, petId) => {
  const r = record(state, petId);
  return r && typeof r.name === 'string' ? r.name : '';
};

/**
 * Revisa un nombre para la mascota. Letras (con tildes y ñ), números, espacios y . , - ' ! ?
 * Máximo NAME_MAX caracteres y respetuoso (el mismo filtro de los nombres de usuario).
 * { ok: true, value } (value '' = quitar el nombre) o { ok: false, reason }.
 */
export function checkPetName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: tr('Escribe un nombre.') };
  const v = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!v) return { ok: true, value: '' };
  if ([...v].length > NAME_MAX) return { ok: false, reason: tr('Usa máximo 16 caracteres.') };
  if (!/^[\p{L}\p{M}\p{N} .,'!¡?¿-]+$/u.test(v)) return { ok: false, reason: tr('Usa solo letras, números y espacios.') };
  if (!/[\p{L}\p{N}]/u.test(v)) return { ok: false, reason: tr('Incluye al menos una letra o un número.') };
  if (isBlockedName(v)) return { ok: false, reason: tr('Ese nombre no está permitido. Elige uno respetuoso para todos.') };
  return { ok: true, value: v };
}

/** Cuánto llena una comida a esa mascota (sus favoritas llenan más). */
export function fillFor(petId, foodId) {
  const f = FOOD_BY_ID[foodId];
  if (!f) return 0;
  return Math.round(f.fill * (isFavorite(petId, foodId) ? FAVORITE_BONUS : 1));
}
