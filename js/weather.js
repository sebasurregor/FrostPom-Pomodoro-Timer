/*
 * FrostPom — clima del polo.
 * Nieva casi siempre (como en el Ártico), con días despejados de vez en cuando. El clima
 * cambia cada 3 horas y se decide con un azar determinista a partir del día y la hora
 * de tu región: así todas las pestañas (y todos los usuarios de la misma región) ven lo mismo.
 *
 * Módulo puro: sin DOM.
 */
import * as U from './util.js';
import { t, tr } from './i18n.js';

export const WEATHER = Object.freeze({
  clear: Object.freeze({ id: 'clear', label: tr('Despejado'), icon: '☀️', nightIcon: '🌙' }),
  light: Object.freeze({ id: 'light', label: tr('Nieve ligera'), icon: '🌨️' }),
  medium: Object.freeze({ id: 'medium', label: tr('Nevando'), icon: '❄️' }),
  heavy: Object.freeze({ id: 'heavy', label: tr('Nevada fuerte'), icon: '🌬️' }),
});
export const WEATHER_IDS = Object.freeze(Object.keys(WEATHER));

// Probabilidad acumulada de cada clima: 25 % despejado, 35 % poca, 25 % media, 15 % mucha.
const ODDS = [['clear', 0.25], ['light', 0.6], ['medium', 0.85], ['heavy', 1]];
export const BLOCK_HOURS = 3;

/** Clima de un día (clave "2026-11-03") y una hora (0–23.99). */
export function weatherAt(dayKey, hour) {
  const block = Math.floor(U.clamp(hour, 0, 23.99) / BLOCK_HOURS);
  const r = U.mulberry32(U.hashString(`clima:${dayKey}:${block}`))();
  return ODDS.find(([, p]) => r < p)[0];
}

/** Clima ahora en la región elegida (o en la del dispositivo). */
export function weatherFor(date = new Date(), timeZone) {
  const { key, hour } = U.localParts(date, timeZone);
  return weatherAt(key, hour);
}

/** Texto para mostrar. De noche despejado es luna; con el polo contaminado la nieve sale gris. */
export function weatherLabel(id, { night = false, dirty = false } = {}) {
  const w = WEATHER[id] || WEATHER.clear;
  if (w.id === 'clear') return { icon: night ? w.nightIcon : w.icon, text: night ? tr('Noche despejada') : w.label };
  return { icon: w.icon, text: dirty ? t('{w} (gris por el esmog)', { w: w.label }) : w.label };
}
