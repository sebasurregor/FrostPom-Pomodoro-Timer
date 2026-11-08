/*
 * FrostPom — ayudantes de DOM.
 * Regla de seguridad: nunca se usa innerHTML. Todo texto escrito por el usuario entra con textContent.
 */

import { tr, locale } from '../i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Crea un elemento HTML. props especiales: class, text, dataset, vars (variables CSS)
 * y on<evento> con una función. null, undefined y false se omiten.
 * Idioma: text, los textos hijos y aria-label/title/placeholder/alt pasan por tr(): si la frase
 * exacta está en el diccionario, sale traducida (las frases con datos usan t() antes).
 */
const I18N_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt']);
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = tr(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'vars') for (const [vk, vv] of Object.entries(v)) el.style.setProperty(vk, vv);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, I18N_ATTRS.has(k) ? tr(String(v)) : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) { // listas anidadas: se aplanan todas
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(tr(String(kid))));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Crea un elemento SVG. Los atributos null o undefined se omiten. */
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export const fmtInt = (n) => Math.round(n).toLocaleString(locale);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
