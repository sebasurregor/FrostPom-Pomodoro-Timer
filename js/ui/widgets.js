/*
 * FrostPom — piezas de interfaz que se repiten en varias vistas
 * (bienvenida, perfil, ranking y Enfocar): avatar, banderas, buscador de país,
 * selector de animal, botones de modo y el pingüino que celebra.
 */
import { fold } from '../util.js';
import * as C from '../catalog.js';
import { flagEmoji, countryList } from '../identity.js';
import { h } from './dom.js';
import { companion, penguin } from './companions.js';
import { photoImg } from './photo.js';
import { state } from './context.js';

/** Avatar: tu foto (si subiste una), si no el compañero equipado o el animal elegido. */
export function avatarContent(size) {
  if (state.profile.photo) return photoImg(state.profile.photo, size);
  const c = state.profile.companion;
  return c ? companion(c, { size }) : document.createTextNode(state.profile.avatar);
}

export function flagEl(code, cls = '') {
  return code ? h('span', { class: `flag ${cls}`, 'aria-hidden': 'true', text: flagEmoji(code) }) : null;
}

/**
 * Selector de país con banderas (combobox): al tocar el campo se abre la lista, al escribir
 * se filtra y al elegir se cierra y el campo muestra la bandera y el nombre elegido.
 * Teclado: flechas para moverse, Enter para elegir, Escape para cerrar.
 * onChange(code) recibe '' si prefiere no decirlo.
 */
let pickerSeq = 0;
export function countryPicker(initial, onChange) {
  const all = [{ code: '', name: 'Prefiero no decirlo', flag: '' }, ...countryList()];
  const byCode = new Map(all.map((c) => [c.code, c]));
  let value = byCode.has(initial || '') ? initial || '' : '';
  let rows = [];
  let active = -1;
  const id = `country${++pickerSeq}`;
  const shownName = () => (value ? byCode.get(value).name : '');

  const flagBox = h('span', { class: 'country-field__flag', 'aria-hidden': 'true' });
  const input = h('input', {
    type: 'text', class: 'acc-input country-search', id: `${id}-input`, role: 'combobox', autocomplete: 'off', spellcheck: 'false',
    'aria-expanded': 'false', 'aria-controls': `${id}-list`, 'aria-autocomplete': 'list', 'aria-label': 'Tu nacionalidad', placeholder: 'Busca tu país…',
  });
  const toggle = h('button', { type: 'button', class: 'country-field__toggle', tabindex: '-1', 'aria-label': 'Ver países' }, h('span', { 'aria-hidden': 'true', text: '▾' }));
  const list = h('ul', { class: 'country-list', id: `${id}-list`, role: 'listbox', 'aria-label': 'Países', hidden: true });
  const wrap = h('div', { class: 'country-picker' }, h('div', { class: 'country-field' }, flagBox, input, toggle), list);

  function showValue() {
    input.value = shownName();
    flagBox.textContent = value ? flagEmoji(value) : '🌐';
    wrap.classList.toggle('has-value', !!value);
  }
  function draw() {
    const typed = input.value.trim();
    const q = typed === shownName() ? '' : fold(typed); // con el país ya elegido se ve la lista completa
    rows = all.filter((c) => !q || fold(c.name).includes(q) || c.code.toLowerCase() === q);
    if (active >= rows.length) active = rows.length - 1;
    list.replaceChildren(...rows.map((c, i) => h('li', {
      id: `${id}-opt-${c.code || 'none'}`, role: 'option', class: `country-opt${c.code === value ? ' is-on' : ''}${i === active ? ' is-active' : ''}`,
      'aria-selected': String(c.code === value), 'data-code': c.code,
      onmousedown: (e) => e.preventDefault(), // que el campo no pierda el foco antes del clic
      onclick: () => choose(c.code),
    }, c.code ? flagEl(c.code) : h('span', { class: 'flag flag--none', 'aria-hidden': 'true', text: '🌐' }), h('span', { text: c.name }))));
    if (!rows.length) list.append(h('li', { class: 'empty', role: 'presentation', text: 'No encontramos ese país.' }));
    const act = rows[active];
    if (act) {
      input.setAttribute('aria-activedescendant', `${id}-opt-${act.code || 'none'}`);
      const el = list.children[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    wrap.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
    active = Math.max(0, all.findIndex((c) => c.code === value));
    draw();
    // En el celular el campo puede estar al final del formulario: que la lista quede a la vista.
    requestAnimationFrame(() => { if (!list.hidden && list.scrollIntoView) list.scrollIntoView({ block: 'nearest' }); });
  }
  function close({ restore = true } = {}) {
    list.hidden = true;
    wrap.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
    if (restore) showValue();
  }
  function choose(code) {
    value = code;
    close();
    onChange(value);
  }

  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', open);
  input.addEventListener('input', () => { open(); active = 0; draw(); });
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
      if (!rows.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      draw();
    } else if (e.key === 'Enter') {
      if (list.hidden) return;
      e.preventDefault(); // no envía el formulario del diálogo
      if (rows[active]) choose(rows[active].code);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation(); // cierra la lista, no el diálogo
      close();
    }
  });
  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', () => (list.hidden ? input.focus() : close()));
  showValue();
  return wrap;
}

/** Botón de un modo del pomodoro ("Clásico 25 + 5"). */
export function presetButton(preset, { checked, onclick, extra = {} }) {
  return h('button', { type: 'button', role: 'radio', class: 'preset', 'aria-checked': String(checked), onclick, ...extra },
    h('span', { class: 'preset__name', text: preset.name }),
    h('span', { class: 'preset__time', text: C.presetLabel(preset, state.settings) }));
}

/** Pingüino que aparece unos segundos para celebrar (saludo o corazones). */
export function mascotPop(kind, anchor, ms = 2600) {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = h('div', { class: `mascot-pop mascot-pop--${kind}`, 'aria-hidden': 'true', vars: { '--x': `${r.left + r.width / 2}px`, '--y': `${r.top}px` } },
    penguin(kind, { size: 110 }));
  document.body.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 400);
  }, ms);
}
