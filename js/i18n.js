/*
 * FrostPom — idiomas (español e inglés).
 *
 * Cómo funciona:
 *  - El texto original del código está en español y sirve de "llave".
 *  - js/i18n-en.js tiene la traducción al inglés de cada frase.
 *  - t('Te faltan {n} XP', { n: 40 }) devuelve la frase en el idioma activo con los datos puestos.
 *  - h() (dom.js) traduce solo los textos que crea, y translateDom() traduce el HTML fijo.
 *  - Si una frase no está en el diccionario, se muestra en español (nunca se rompe nada).
 *
 * Idioma: el que la persona eligió en Ajustes; si no eligió, el del sistema
 * (español si el sistema está en español; inglés en cualquier otro caso).
 */
import EN from './i18n-en.js';

const KEY = 'st2_lang';
export const LANGS = Object.freeze([
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' },
]);

function saved() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function detect() {
  if (typeof window === 'undefined') return 'es'; // pruebas en Node: siempre español
  const s = saved();
  if (s === 'es' || s === 'en') return s;
  const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
  for (const l of list) {
    if (/^es\b/i.test(l)) return 'es';
    if (/^en\b/i.test(l)) return 'en';
  }
  return 'en'; // para abrirse al mundo: cualquier otro idioma ve la app en inglés
}

export const lang = detect();
export const locale = lang === 'en' ? 'en-US' : 'es-CO';
export const isEnglish = lang === 'en';

/** Traduce una frase exacta (sin datos). Si no hay traducción, la deja igual. */
export function tr(text) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  return Object.prototype.hasOwnProperty.call(EN, text) ? EN[text] : text;
}

/** Traduce y llena los datos: t('Hola, {nombre}', { nombre: 'Ana' }). */
export function t(text, vars) {
  const out = tr(text);
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/** Cambia el idioma y recarga la app para que todo salga en el idioma nuevo. */
export function setLang(id) {
  if (id !== 'es' && id !== 'en') return;
  try { localStorage.setItem(KEY, id); } catch { /* sin almacenamiento: solo para esta vez */ }
  location.reload();
}
export const chosenLang = () => saved();

const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

/** Traduce el HTML fijo (textos y atributos) una sola vez, al arrancar. */
export function translateDom(root = document.body) {
  document.documentElement.lang = lang;
  if (lang !== 'en' || !root) return;
  document.title = tr(document.title);
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', tr(meta.getAttribute('content')));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const raw = n.nodeValue;
    const key = raw.trim();
    if (!key) continue;
    const out = tr(key);
    if (out !== key) n.nodeValue = raw.replace(key, () => out);
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) el.setAttribute(a, tr(v));
    }
  }
}
