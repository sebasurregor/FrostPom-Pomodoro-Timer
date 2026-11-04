/*
 * FrostPom — tu mascota y su comida.
 * La mascota es el compañero que tienes equipado (o el pingüino si no tienes ninguno).
 * Su barriguita va de 0 a 100 y baja sola con el tiempo (3 puntos por hora: de llena a vacía
 * en poco más de un día). Con gemas le das de comer en la Tienda; cada animal tiene comidas
 * favoritas que lo llenan más. Darle de comer es solo por cariño: no da XP ni ventajas.
 *
 * Módulo puro: sin DOM ni almacenamiento.
 */
import * as U from './util.js';

export const DECAY_PER_HOUR = 3;
export const START_FULLNESS = 60;
export const FULL_AT = 95; // desde aquí ya no quiere comer más
export const FAVORITE_BONUS = 1.5;

// Arte del autor en assets/food. cost = gemas, fill = cuánto llena la barriguita.
export const FOODS = Object.freeze([
  { id: 'pescado', name: 'Pescado', cost: 2, fill: 12 },
  { id: 'camaron', name: 'Camarón', cost: 2, fill: 12 },
  { id: 'arandanos', name: 'Arándanos', cost: 2, fill: 10 },
  { id: 'galleta', name: 'Galleta estrella', cost: 3, fill: 15 },
  { id: 'cangrejo', name: 'Cangrejo', cost: 3, fill: 16 },
  { id: 'calamar', name: 'Calamar', cost: 3, fill: 16 },
  { id: 'pescado-helado', name: 'Pescado congelado', cost: 3, fill: 18 },
  { id: 'sardinas', name: 'Frasco de sardinas', cost: 4, fill: 20 },
  { id: 'sopa', name: 'Sopa de pescado', cost: 4, fill: 22 },
  { id: 'pollo', name: 'Pollo asado', cost: 5, fill: 28 },
  { id: 'jamon', name: 'Jamón asado', cost: 5, fill: 28 },
  { id: 'almeja', name: 'Almeja de lujo', cost: 8, fill: 40 },
].map((f) => Object.freeze({ ...f, img: `assets/food/${f.id}.webp` })));
export const FOOD_BY_ID = U.byId(FOODS);

/** Qué animal es cada mascota y sus comidas favoritas. */
export const PETS = Object.freeze({
  pinguino: { kind: 'penguin', name: 'Pingüino', favorites: ['pescado', 'camaron', 'calamar', 'pescado-helado'] },
  'oso-polar': { kind: 'bear', name: 'Oso Polar', favorites: ['jamon', 'pollo', 'arandanos', 'sardinas'] },
  'oso-marino': { kind: 'seal', name: 'Oso Marino', favorites: ['pescado', 'calamar', 'cangrejo', 'camaron'] },
  'tiburon-martillo': { kind: 'shark', name: 'Tiburón Martillo', favorites: ['pescado', 'calamar', 'jamon', 'pescado-helado'] },
  'zorro-artico': { kind: 'fox', name: 'Zorro Ártico', favorites: ['pollo', 'arandanos', 'galleta', 'cangrejo'] },
});
export const isPetId = (id) => typeof id === 'string' && Object.hasOwn(PETS, id);

/** La mascota de ahora: el compañero equipado o, si no hay, el pingüino. */
export const currentPetId = (state) => (isPetId(state.profile.companion) ? state.profile.companion : 'pinguino');

export const isFavorite = (petId, foodId) => !!PETS[petId] && PETS[petId].favorites.includes(foodId);

/** Barriguita ahora (0–100), descontando lo que bajó desde la última comida. */
export function fullness(state, petId, now = new Date()) {
  const rec = state.pets && state.pets[petId];
  const base = rec ? rec.fullness : START_FULLNESS;
  const since = rec ? Date.parse(rec.at) : Date.parse(state.createdAt);
  const hours = Number.isFinite(since) ? Math.max(0, (now.getTime() - since) / 3600000) : 0;
  return U.clamp(Math.round((base - hours * DECAY_PER_HOUR) * 10) / 10, 0, 100);
}

/** Cómo se siente según su barriguita. */
export function mood(value) {
  if (value >= 80) return { id: 'lleno', label: '¡Lleno y feliz!', emoji: '😊' };
  if (value >= 50) return { id: 'contento', label: 'Contento', emoji: '🙂' };
  if (value >= 25) return { id: 'hambre', label: 'Con hambre', emoji: '😋' };
  return { id: 'mucha-hambre', label: '¡Tiene mucha hambre!', emoji: '🥺' };
}

/** Cuánto llena una comida a esa mascota (sus favoritas llenan más). */
export function fillFor(petId, foodId) {
  const f = FOOD_BY_ID[foodId];
  if (!f) return 0;
  return Math.round(f.fill * (isFavorite(petId, foodId) ? FAVORITE_BONUS : 1));
}
