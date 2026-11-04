/*
 * FrostPom — "Tu estudio": últimos 7 días o calendario del mes.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import { $, $$, h } from './dom.js';
import { state, store, today } from './context.js';

let tab = store.pref.get('activity_tab') === 'cal' ? 'cal' : 'week'; // recuerda la última pestaña vista
let calView = null; // { y, m } del mes que se está viendo; null = el mes actual
let calSelected = null; // día elegido en el calendario

const dayMinutes = (key) => Math.round(((state.daily[key] || {}).studySec || 0) / 60);
/** Formato corto para las casillas: "45m", "1h 05", "2h". */
const shortMinutes = (min) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${U.pad2(min % 60)}` : ''}`);
const monthIndex = (o) => o.y * 12 + o.m;

export function renderActivity() {
  const isCal = tab === 'cal';
  for (const [id, on] of [['#tabWeek', !isCal], ['#tabCal', isCal]]) {
    $(id).setAttribute('aria-selected', String(on));
    $(id).tabIndex = on ? 0 : -1;
  }
  $('#weekPane').hidden = isCal;
  $('#calPane').hidden = !isCal;
  if (isCal) renderCalendar(); else renderWeek();
}

function setTab(next, focus = false) {
  tab = next;
  store.pref.set('activity_tab', next);
  renderActivity();
  if (focus) $(next === 'cal' ? '#tabCal' : '#tabWeek').focus();
}

function renderWeek() {
  const days = Array.from({ length: 7 }, (_, i) => U.dateKey(U.addDays(new Date(), i - 6)));
  const mins = days.map(dayMinutes);
  const max = Math.max(60, ...mins);
  const total = mins.reduce((a, b) => a + b, 0);
  $('#weekMeta').textContent = `${U.formatMinutes(total)} en total`;
  $('#weekBars').replaceChildren(...days.map((k, i) => {
    const d = U.parseDateKey(k);
    const isToday = i === 6;
    const label = `${U.WEEKDAY_LONG[d.getDay()]} ${d.getDate()}: ${U.formatMinutes(mins[i])}`;
    return h('div', { class: `bar${isToday ? ' is-today' : ''}${mins[i] === 0 ? ' is-zero' : ''}`, role: 'listitem', tabindex: '0', 'aria-label': label, title: label },
      h('span', { class: 'bar__value', text: mins[i] ? U.formatMinutes(mins[i]) : '' }),
      h('span', { class: 'bar__track' }, h('span', { class: 'bar__fill', vars: { '--h': `${(mins[i] / max) * 100}%` } })),
      h('span', { class: 'bar__day', text: isToday ? 'Hoy' : U.WEEKDAY_SHORT[d.getDay()] }));
  }));
}

/** Primer mes que se puede ver: el de tu primer día con datos o el de tu perfil (máx. 26 meses atrás). */
function firstCalendarMonth(now) {
  const keys = Object.keys(state.daily).sort();
  let first = U.dateKey(new Date(state.createdAt));
  if (keys.length && keys[0] < first) first = keys[0];
  const d = U.isDateKey(first) ? U.parseDateKey(first) : now;
  const min = { y: now.getFullYear(), m: now.getMonth() - 26 };
  const f = { y: d.getFullYear(), m: d.getMonth() };
  return monthIndex(f) < monthIndex(min) ? min : f;
}

function renderCalendar(focusKey) {
  const now = new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() };
  const first = firstCalendarMonth(now);
  let view = calView || cur;
  if (monthIndex(view) > monthIndex(cur)) view = cur;
  if (monthIndex(view) < monthIndex(first)) view = first;
  calView = monthIndex(view) === monthIndex(cur) ? null : view;

  const todayKey = today();
  const cells = U.monthCells(view.y, view.m);
  const monthName = U.MONTHS_LONG[view.m];
  if (calSelected && !cells.includes(calSelected)) calSelected = null;
  if (!calSelected && cells.includes(todayKey)) calSelected = todayKey;

  const sum = G.monthSummary(state.daily, view.y, view.m);
  $('#calTitle').textContent = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${view.y}`;
  $('#calMeta').textContent = sum.activeDays
    ? `${U.formatMinutes(sum.totalMin)} en ${U.plural(sum.activeDays, 'día', 'días')}`
    : 'Sin estudio este mes';
  $('#calPrev').disabled = monthIndex(view) <= monthIndex(first);
  $('#calNext').disabled = monthIndex(view) >= monthIndex(cur);
  $('#calGoal').textContent = `Meta del polo: ${G.POLE_GOAL_MIN} min`;

  // Solo un día recibe Tab (el elegido o el primero con datos); las flechas mueven entre días.
  const tabKey = calSelected || cells.find((k) => k && k <= todayKey);
  $('#calGrid').replaceChildren(...cells.map((k) => {
    if (!k) return h('span', { class: 'cal__pad', 'aria-hidden': 'true' });
    const day = Number(k.slice(8));
    if (k > todayKey) return h('span', { class: 'cal__day is-future', 'aria-hidden': 'true' }, h('span', { class: 'cal__num', text: String(day) }));
    const min = dayMinutes(k);
    const isToday = k === todayKey;
    const sel = k === calSelected;
    return h('button', {
      type: 'button', 'data-key': k, tabindex: k === tabKey ? '0' : '-1', 'aria-pressed': String(sel),
      class: `cal__day lv-${G.studyLevel(min)}${isToday ? ' is-today' : ''}${sel ? ' is-sel' : ''}`,
      'aria-label': `${U.formatDayLong(k)}${isToday ? ' (hoy)' : ''}: ${min ? U.formatMinutes(min) : 'sin estudio'}`,
      onclick: () => { calSelected = k; renderCalendar(k); },
    },
    h('span', { class: 'cal__num', text: String(day) }),
    h('span', { class: 'cal__min', 'aria-hidden': 'true', text: min ? shortMinutes(min) : '' }));
  }));
  $('#calDetail').textContent = calendarDetail(calSelected, sum);
  if (focusKey) {
    const b = $(`#calGrid [data-key="${focusKey}"]`);
    if (b) b.focus();
  }
}

function calendarDetail(key, sum) {
  if (!key) {
    if (!sum.best) return 'Este mes no hay sesiones guardadas.';
    return `Tu mejor día fue el ${U.formatDayLong(sum.best.key).toLowerCase()}, con ${U.formatMinutes(sum.best.min)}. Cumpliste la meta del polo ${U.plural(sum.goalDays, 'día', 'días')}.`;
  }
  const d = state.daily[key] || G.emptyDay();
  const min = dayMinutes(key);
  const label = U.formatDayLong(key);
  if (!min) return `${label}: no estudiaste.`;
  const blocks = d.sessions + d.partials;
  const parts = [`${label}: ${U.formatMinutes(min)}`];
  if (blocks) parts[0] += ` en ${U.plural(blocks, 'sesión', 'sesiones')}`;
  if (min >= G.POLE_GOAL_MIN) parts.push('¡meta del polo cumplida! ❄️');
  return parts.join(' · ');
}

function moveCalendar(delta) {
  const now = new Date();
  const base = calView || { y: now.getFullYear(), m: now.getMonth() };
  const idx = monthIndex(base) + delta;
  calView = { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 };
  calSelected = null;
  renderCalendar();
}

/** Flechas, Inicio y Fin para moverse entre los días (como un calendario de escritorio). */
function calendarKeys(e) {
  const btn = e.target.closest('.cal__day[data-key]');
  if (!btn) return;
  const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const days = $$('#calGrid .cal__day[data-key]');
  let target = null;
  if (e.key in steps) {
    const key = U.shiftKey(btn.dataset.key, steps[e.key]);
    target = days.find((b) => b.dataset.key === key) || null;
  } else if (e.key === 'Home') target = days[0];
  else if (e.key === 'End') target = days[days.length - 1];
  else return;
  e.preventDefault();
  if (!target) return;
  for (const b of days) b.tabIndex = b === target ? 0 : -1;
  target.focus();
}

export function bindActivity() {
  $('#tabWeek').addEventListener('click', () => setTab('week'));
  $('#tabCal').addEventListener('click', () => setTab('cal'));
  for (const id of ['#tabWeek', '#tabCal']) {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setTab(tab === 'cal' ? 'week' : 'cal', true); }
    });
  }
  $('#calPrev').addEventListener('click', () => moveCalendar(-1));
  $('#calNext').addEventListener('click', () => moveCalendar(1));
  $('#calGrid').addEventListener('keydown', calendarKeys);
}
