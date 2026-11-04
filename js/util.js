/*
 * StudyTimer — utilidades compartidas.
 * Sin dependencias. Módulo ES: lo usan el navegador y las pruebas de Node por igual.
 */

export const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------- Fechas (siempre en hora LOCAL, nunca toISOString para días) ----------
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  return dateKey(parseDateKey(value)) === value; // descarta 2026-02-31, etc.
}
export function addDays(date, n) {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
}
/** Clave del día n días después de key (n negativo = antes). */
export function shiftKey(key, n) {
  return dateKey(addDays(parseDateKey(key), n));
}
export function startOfWeek(date) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = domingo
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); // la semana empieza el lunes
  return x;
}
// Días enteros de a → b, sin errores por cambios de horario.
export function daysBetween(aKey, bKey) {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * Día y hora locales de una zona horaria (IANA, p. ej. 'America/Bogota').
 * Sin zona, usa la del dispositivo. Devuelve { key: '2026-11-03', hour: 16.5 }.
 */
export function localParts(date = new Date(), timeZone) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
      const get = (t) => parts.find((p) => p.type === t).value;
      return { key: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) + Number(get('minute')) / 60 };
    } catch { /* zona desconocida: se usa la del dispositivo */ }
  }
  return { key: dateKey(date), hour: date.getHours() + date.getMinutes() / 60 };
}

export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Celdas de un mes para un calendario que empieza el lunes. Cada celda es la clave del día
 * ("2026-11-01") o null para los huecos antes del día 1 y después del último.
 * month va de 0 (enero) a 11 (diciembre).
 */
export function monthCells(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells = new Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** "2026-11-01" → "Domingo 1 de noviembre". */
export function formatDayLong(key) {
  const d = parseDateKey(key);
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---------- Formatos ----------
export function formatClock(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
export function formatMinutes(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
/** Minúsculas y sin tildes, para comparar textos ("Perú" → "peru"). */
export function fold(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ---------- Azar determinista (para misiones y ranking demo) ----------
export function hashString(str) {
  let h = 0x811c9dc5; // FNV-1a 32 bits
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uid() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Seguridad de texto ----------
// Quita caracteres de control y de dirección (usados para suplantar texto),
// normaliza espacios y limita la longitud.
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
export function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
/**
 * Diccionario sin prototipo: un archivo importado no puede contaminar Object.prototype,
 * y buscar "__proto__" o "constructor" en él nunca encuentra nada.
 */
export function dict(entries) {
  const d = Object.create(null);
  if (entries) for (const [k, v] of entries) d[k] = v;
  return d;
}
/** Índice por id, sin prototipo: byId(lista)['constructor'] es undefined. */
export const byId = (list, key = 'id') => dict(list.map((x) => [x[key], x]));

// ---------- Almacenamiento web tolerante a fallos ----------
/** localStorage o sessionStorage, o null si el navegador lo bloquea (modo privado, políticas). */
export function webStorage(kind = 'localStorage') {
  try {
    const s = globalThis[kind];
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}
