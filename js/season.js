/*
 * StudyTimer — temporadas de estudio.
 * Cada temporada dura `months` meses del calendario (por defecto 3: ene–mar, abr–jun,
 * jul–sep y oct–dic, como un periodo escolar). Al empezar una nueva:
 *  - el rango vuelve a Bronce III y recibes gemas según el rango que alcanzaste;
 *  - el resumen de la temporada queda guardado (rango, minutos y días);
 *  - el historial detallado de sesiones de temporadas pasadas se borra (solo queda el total
 *    de cada día en el calendario).
 * Logros, compañeros, temas, gemas, racha y el calendario se conservan.
 *
 * Módulo puro: sin DOM ni almacenamiento.
 */
import * as U from './util.js';

export const DEFAULT_MONTHS = 3;
export const MAX_ARCHIVE = 24; // temporadas que se recuerdan
const ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const norm = (months) => ([1, 2, 3, 4, 6, 12].includes(months) ? months : DEFAULT_MONTHS);

/** Temporada a partir de su índice absoluto (año * 12 + mes, dividido en bloques). */
function fromIndex(index, months) {
  const first = index * months; // mes absoluto en que empieza
  const y = Math.floor(first / 12);
  const m = first % 12;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + months, 1); // exclusivo
  const last = new Date(y, m + months - 1, 1);
  const short = (d) => U.MONTHS_SHORT[d.getMonth()];
  const name = months === 1
    ? `${U.MONTHS_LONG[m][0].toUpperCase()}${U.MONTHS_LONG[m].slice(1)} ${y}`
    : `${short(start)} – ${short(last)} ${last.getFullYear()}`;
  return {
    id: `${y}-${U.pad2(m + 1)}`,
    index,
    months,
    start,
    end,
    startKey: U.dateKey(start),
    endKey: U.dateKey(new Date(end.getFullYear(), end.getMonth(), 0)), // último día (incluido)
    name: `Temporada ${name}`,
  };
}

/** Temporada que contiene la fecha dada. */
export function seasonFor(date = new Date(), months = DEFAULT_MONTHS) {
  const mo = norm(months);
  return fromIndex(Math.floor((date.getFullYear() * 12 + date.getMonth()) / mo), mo);
}

/** Temporada a partir de su id ("2026-10"). null si el id no es válido. */
export function seasonById(id, months = DEFAULT_MONTHS) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const [y, m] = id.split('-').map(Number);
  return seasonFor(new Date(y, m - 1, 1), months);
}

export const isSeasonId = (id) => typeof id === 'string' && ID_RE.test(id);

/** Días que faltan para que termine la temporada (contando hoy). */
export function daysLeft(season, todayKey) {
  return Math.max(0, U.daysBetween(todayKey, season.endKey) + 1);
}

/** Gemas de premio al cerrar la temporada, según el rango (tierIndex 0 = Bronce … 6 = Leyenda). */
export function seasonReward(tierIndex) {
  return 10 + 15 * U.clamp(Math.floor(tierIndex) || 0, 0, 6);
}

/** Minutos, días con estudio y días que cumplieron la meta, dentro de la temporada. */
export function summarize(daily, season, goalMin = 45) {
  let studySec = 0;
  let creditedSec = 0;
  let activeDays = 0;
  let goalDays = 0;
  for (const [key, d] of Object.entries(daily || {})) {
    if (key < season.startKey || key > season.endKey || !d) continue;
    studySec += d.studySec || 0;
    creditedSec += d.creditedSec || 0;
    if ((d.studySec || 0) >= 60) activeDays += 1;
    if ((d.studySec || 0) >= goalMin * 60) goalDays += 1;
  }
  return { studyMin: Math.round(studySec / 60), creditedMin: Math.floor(creditedSec / 60), activeDays, goalDays };
}
