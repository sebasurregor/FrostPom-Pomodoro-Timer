/*
 * FrostPom — vista Ranking.
 *  - Modo "local" (config.leaderboard.mode): solo tu marca y el aviso "llega pronto".
 *  - Modo "remote" (v3.9): ranking global con el servidor (js/board.js): podio, tabla y tu
 *    lugar; avisos para unirte, para menores de 13 años y si elegiste no aparecer. Sin conexión
 *    se muestra tu marca local con un botón para reintentar.
 *  - (v4.1) Cada nombre de otra persona tiene un botón ⋯: "Reportar nombre" (al servidor; sin
 *    cuenta en línea, por correo) y "No ver más a esta persona" (solo en este dispositivo).
 *    Normas: normas.html. Lo piden Google Play y App Store para el contenido de los usuarios.
 */
import * as U from '../util.js';
import * as E from '../engine.js';
import * as BOARD from '../board.js';
import { getProvider } from '../leaderboard.js';
import { rankForXp } from '../game.js';
import { config } from '../config.js';
import { seasonFor } from '../season.js';
import { $, $$, h } from './dom.js';
import { emblem } from './emblems.js';
import { avatarContent, flagEl } from './widgets.js';
import { joinDialog, ensureJoined, onBoardToggle } from './board-ui.js';
import { openDialog, toast } from './feedback.js';
import { state, store, mutate } from './context.js';
import { t, tr, locale } from '../i18n.js';

const LIMIT = 30;
let period = 'week';
let token = 0;

/** Tu fila usa tu avatar real; las demás, el emoji de cada persona. */
const who = (r) => ({
  avatar: (size) => (r.isYou ? avatarContent(size) : r.avatar),
  name: [flagEl(r.isYou ? state.profile.country : r.country), ' ', r.isYou ? t('{name} (tú)', { name: r.nick }) : r.nick],
});

// ---------------------------------------------------------------------
// (v4.1) Reportar y ocultar personas
// ---------------------------------------------------------------------
const HIDDEN_KEY = 'board_hidden';
const MAX_HIDDEN = 300;

/** Nombres que elegiste no ver (en minúsculas, solo en este dispositivo). */
export function hiddenNames() {
  try {
    const v = JSON.parse(store.pref.get(HIDDEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.length <= 40).slice(-MAX_HIDDEN) : [];
  } catch {
    return [];
  }
}
function setHiddenNames(list) {
  store.pref.set(HIDDEN_KEY, JSON.stringify([...new Set(list.map((n) => n.toLowerCase()))].slice(-MAX_HIDDEN)));
}
const hidePerson = (nick) => setHiddenNames([...hiddenNames(), nick]);

/** Botón ⋯ de un nombre (no está en tu propia fila ni en el ranking local). */
const moreBtn = (r) => (r.canAct ? h('button', {
  type: 'button', class: 'row__more', 'aria-label': t('Opciones para {name}', { name: r.nick }), title: t('Opciones para {name}', { name: r.nick }),
  onclick: () => personMenu(r.nick),
}, '⋯') : null);

async function personMenu(nick) {
  const v = await openDialog({
    title: t('Opciones para {name}', { name: nick }),
    body: [h('p', { class: 'dlg__text', text: '¿Qué quieres hacer con este nombre? Si no cumple las normas de la comunidad, repórtalo.' })],
    actions: [
      { label: 'Reportar nombre', value: 'report', variant: 'btn--coral' },
      { label: 'No ver más a esta persona', value: 'hide' },
      { label: 'Cancelar', value: 'cancel' },
    ],
  });
  if (v === 'report') return reportFlow(nick);
  if (v === 'hide') {
    hidePerson(nick);
    toast(t('Ya no verás a {name} en tu ranking.', { name: nick }), 'good');
    renderRanking();
  }
  return undefined;
}

const REASONS = [
  ['ofensivo', 'Es grosero u ofensivo'],
  ['suplantacion', 'Se hace pasar por otra persona'],
  ['datos', 'Muestra datos personales'],
  ['otro', 'Otro motivo'],
];

async function reportFlow(nick) {
  if (!BOARD.canReport()) return reportByEmail(nick);
  let choice = REASONS[0][0];
  const err = h('p', { class: 'form-error', role: 'alert' });
  const group = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': 'Motivo del reporte' },
    REASONS.map(([value, label], i) => h('label', { class: 'report-reason' },
      h('input', { type: 'radio', name: 'reportReason', id: `reportReason-${value}`, value, checked: i === 0, onchange: () => { choice = value; } }),
      h('span', { text: label }))));
  const res = await openDialog({
    title: t('Reportar a {name}', { name: nick }),
    body: [h('p', { class: 'dlg__text', text: '¿Por qué lo reportas? Lo revisaremos según las normas de la comunidad. Esa persona no sabrá que fuiste tú.' }), group, err],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      {
        label: 'Enviar reporte', value: 'ok', variant: 'btn--coral', primary: true,
        validate: async () => {
          err.textContent = '';
          const r = await BOARD.reportName(nick, choice);
          if (r.ok) return true;
          err.textContent = r.kind === 'rate' ? tr('Ya enviaste muchos reportes hoy. Inténtalo mañana.')
            : r.kind === 'offline' ? tr('Sin conexión: no pudimos enviar el reporte. Inténtalo de nuevo.')
              : t('No pudimos enviar el reporte. Escríbenos a {email} con el nombre.', { email: config.supportEmail });
          return false;
        },
      },
    ],
  });
  if (res !== 'ok') return undefined;
  hidePerson(nick);
  toast('Gracias por avisar. Lo revisaremos, y ya no verás ese nombre en tu ranking.', 'good');
  renderRanking();
  return undefined;
}

/** Sin cuenta en línea (por ejemplo, menores de 13) el reporte se envía por correo. */
async function reportByEmail(nick) {
  const res = await openDialog({
    title: t('Reportar a {name}', { name: nick }),
    body: [h('p', { class: 'dlg__text', text: t('Para reportar sin cuenta en línea, escríbenos a {email} con el nombre y el motivo. Lo revisaremos según las normas de la comunidad.', { email: config.supportEmail }) })],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Escribir el correo', value: 'ok', variant: 'btn--coral', primary: true },
    ],
  });
  if (res !== 'ok') return;
  const subject = encodeURIComponent(tr('Reporte de un nombre del ranking'));
  const body = encodeURIComponent(t('Quiero reportar este nombre del ranking de FrostPom: {name}\n\nMotivo: ', { name: nick }));
  hidePerson(nick);
  location.href = `mailto:${config.supportEmail}?subject=${subject}&body=${body}`;
  renderRanking();
}

/** Al final de la tabla: cuántas personas ocultaste y un botón para volver a verlas. */
function hiddenFooter() {
  const n = hiddenNames().length;
  if (!n) return null;
  return h('li', { class: 'board__label board__hidden' },
    h('span', { text: n === 1 ? tr('Ocultaste a 1 persona en este dispositivo.') : t('Ocultaste a {n} personas en este dispositivo.', { n }) }), ' ',
    h('button', {
      type: 'button', class: 'link-btn', id: 'boardUnhide',
      onclick: () => { setHiddenNames([]); toast('Listo: vuelves a ver a todas las personas.', 'good'); renderRanking(); },
    }, 'Mostrar de nuevo'));
}

const rowEl = (r, pos = String(r.position)) => {
  const w = who(r);
  return h('li', { class: `row${r.isYou ? ' is-you' : ''}${r.canAct ? ' has-more' : ''}` },
    h('span', { class: 'row__pos', text: pos }),
    h('span', { class: 'avatar avatar--sm' }, w.avatar(28)),
    h('span', { class: 'row__nick' }, w.name),
    h('span', { class: 'row__emblem' }, emblem(r.rank, { size: 30 })),
    h('span', { class: 'row__min', text: U.formatMinutes(r.minutes) }),
    moreBtn(r));
};

/** Globo con birrete animado (con "Menos animaciones", la versión quieta). */
function globe() {
  const still = document.documentElement.classList.contains('reduce-motion');
  return h('img', { class: 'soon__globe', src: still ? 'assets/icons/globo-quieto.webp' : 'assets/icons/globo.webp', width: '60', height: '60', alt: '', decoding: 'async', draggable: 'false' });
}

/** Tarjeta "El ranking global llega pronto". */
function soonCard() {
  return h('div', { class: 'panel soon' },
    h('div', { class: 'soon__icon', 'aria-hidden': 'true' }, globe()),
    h('h2', { class: 'panel__title', text: 'El ranking global llega pronto' }),
    h('p', { class: 'panel__text', text: 'Mientras tanto, tus minutos ya cuentan.' }));
}

/** Tarjeta de estado del ranking global (unirte, menores, saliste…). null si no hace falta. */
function statusCard() {
  const acc = state.account;
  if (!acc) return null;
  const card = (title, text, button) => h('div', { class: 'panel soon board-status' },
    h('div', { class: 'soon__icon', 'aria-hidden': 'true' }, globe()),
    h('h2', { class: 'panel__title', text: title }),
    h('p', { class: 'panel__text', text }),
    button || null);
  if (!acc.birth && !acc.online) {
    return card('Únete al ranking global', 'Compite con estudiantes de todo el mundo por los minutos de estudio de la semana.',
      h('button', { type: 'button', class: 'btn btn--gold', id: 'boardJoinBtn', onclick: () => joinDialog().then(renderRanking) }, 'Unirme al ranking'));
  }
  if (!BOARD.eligible(acc)) {
    return card('El ranking global es para mayores de 13 años', 'Puedes ver quién va adelante, y tus minutos siguen contando en tu progreso.');
  }
  if (!state.settings.leaderboardOn) {
    return card('No apareces en el ranking', 'Elegiste no aparecer. Tus pomodoros no se envían al servidor.',
      h('button', { type: 'button', class: 'btn btn--paper', id: 'boardBackBtn', onclick: async () => { mutate((s) => { s.settings.leaderboardOn = true; }); await onBoardToggle(true); renderRanking(); } }, 'Volver a aparecer'));
  }
  if (!BOARD.isJoined() || BOARD.joinedName() !== acc.username) {
    return card('Todavía no estás en el ranking global', 'Necesitas internet para unirte. Tus pomodoros empiezan a contar desde que te unas.',
      h('button', { type: 'button', class: 'btn btn--gold', id: 'boardRetryJoin', onclick: () => ensureJoined({ interactive: true }).then(renderRanking) }, 'Unirme ahora'));
  }
  return null;
}

/** Ranking global (modo "remote"). */
async function renderGlobal(mine, { you, season }) {
  const cap = U.formatMinutes(BOARD.capMin());
  let when = '';
  try { when = BOARD.nextWeekReset().toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit' }); } catch { /* sin Intl */ }
  $('#boardNotice').textContent = (period === 'week' && when ? `${t('La semana se reinicia el {when} (tu hora).', { when })} ` : '')
    + t('Cada persona suma como máximo {cap} al día. Solo cuentan los pomodoros que empiezas con internet.', { cap });
  $('#boardSoon').replaceChildren(...[statusCard()].filter(Boolean));
  $('#board').setAttribute('aria-busy', 'true');
  let rows;
  try {
    rows = await BOARD.fetchBoard(period, LIMIT);
  } catch (e) {
    if (mine !== token) return;
    $('#board').removeAttribute('aria-busy');
    if (e.kind === 'notready') return renderLocal({ you, season, rows: await getProvider({}).fetchBoard({ period, you }) }); // el servidor aún no está montado
    $('#boardNotice').textContent = e.kind === 'offline'
      ? tr('No pudimos cargar el ranking global: no hay conexión. Esta es tu marca en este dispositivo.')
      : tr('No pudimos cargar el ranking global en este momento. Esta es tu marca en este dispositivo.');
    $('#podium').replaceChildren();
    const local = await getProvider({}).fetchBoard({ period, you });
    $('#board').removeAttribute('start');
    $('#board').replaceChildren(
      h('li', { class: 'board__label', text: period === 'week' ? tr('Tu marca de esta semana') : t('Tu marca de la temporada ({name})', { name: season.label }) }),
      ...local.map((r) => rowEl(r, '★')),
      h('li', { class: 'board__retry' }, h('button', { type: 'button', class: 'btn btn--paper btn--sm', id: 'boardRetry', onclick: renderRanking }, 'Reintentar')));
    return;
  }
  if (mine !== token) return;
  $('#board').removeAttribute('aria-busy');
  rows = rows.map((r) => ({ ...r, rank: rankForXp(r.isYou ? state.progress.xp : r.xp), canAct: !r.isYou })); // tu emblema, el de tu app
  const hidden = new Set(hiddenNames());
  rows = rows.filter((r) => r.isYou || !hidden.has(r.nick.toLowerCase())); // "No ver más a esta persona"
  if (!rows.length) {
    $('#podium').replaceChildren();
    $('#board').removeAttribute('start');
    $('#board').replaceChildren(h('li', { class: 'board__label board__empty', text: period === 'week'
      ? tr('Todavía nadie suma minutos esta semana. ¡Empieza un pomodoro y sé el primero!')
      : tr('Todavía nadie suma minutos esta temporada. ¡Empieza un pomodoro y sé el primero!') }), ...[hiddenFooter()].filter(Boolean));
    return;
  }
  renderTable(rows);
  const counting = BOARD.isJoined() && state.settings.leaderboardOn && BOARD.eligible(state.account);
  if (counting && !rows.some((r) => r.isYou)) {
    $('#board').append(h('li', { class: 'board__label board__you', text: period === 'week'
      ? tr('Aún no sumas minutos esta semana: tus pomodoros con internet aparecen aquí.')
      : tr('Aún no sumas minutos esta temporada: tus pomodoros con internet aparecen aquí.') }));
  }
  const foot = hiddenFooter();
  if (foot) $('#board').append(foot);
}

/** Ranking local (modo "local", o si el servidor del ranking todavía no está montado). */
function renderLocal({ you, season, rows }) {
  const cap = U.formatMinutes(state.settings.dailyCapMin);
  const optOut = state.settings.leaderboardOn ? '' : tr(' Elegiste no aparecer en el ranking: puedes cambiarlo en Ajustes.');
  $('#boardNotice').textContent = t('Cada persona sumará como máximo {cap} al día, para premiar la constancia y no el desvelo.', { cap }) + optOut;
  $('#boardSoon').replaceChildren(soonCard());
  $('#podium').replaceChildren();
  const label = period === 'week' ? tr('Tu marca de esta semana') : t('Tu marca de la temporada ({name})', { name: season.label });
  $('#board').removeAttribute('start');
  $('#board').replaceChildren(
    h('li', { class: 'board__label', text: label }),
    ...rows.map((r) => rowEl(r, '★')));
}

/** Podio (los 3 primeros) y la tabla desde el 4.º; tu fila al final si quedaste más abajo. */
function renderTable(rows) {
  const top3 = rows.slice(0, 3);
  $('#podium').replaceChildren(...[1, 0, 2].filter((i) => top3[i]).map((i) => {
    const r = top3[i];
    const w = who(r);
    return h('div', { class: `podium__spot podium__spot--${i + 1}${r.isYou ? ' is-you' : ''}` },
      h('span', { class: 'avatar avatar--podium' }, w.avatar(46)),
      h('span', { class: 'podium__nick' }, w.name),
      h('span', { class: 'podium__min', text: U.formatMinutes(r.minutes) }),
      moreBtn(r),
      h('span', { class: 'podium__block' }, h('b', { text: String(r.position) })));
  }));
  const youRow = rows.find((r) => r.isYou);
  const extra = youRow && rows.indexOf(youRow) >= LIMIT ? [youRow] : [];
  $('#board').replaceChildren(...rows.slice(3, LIMIT).map((r) => rowEl(r)), ...(extra.length ? [h('li', { class: 'row row--gap', 'aria-hidden': 'true', text: '…' }), ...extra.map((r) => rowEl(r))] : []));
  $('#board').setAttribute('start', '4');
}

export async function renderRanking() {
  const mine = ++token;
  const provider = getProvider(config);
  const months = config.season.months;
  const season = seasonFor(new Date(), months);
  const mins = E.boardMinutes(state, new Date(), months);
  const you = { nick: state.profile.nick, avatar: state.profile.avatar, xp: state.progress.xp, week: mins.week, season: mins.season, optIn: state.settings.leaderboardOn };
  $('#seasonTab').textContent = tr('Esta temporada');
  $('#seasonTab').title = season.name;
  $$('.seg__btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.period === period)));
  if (BOARD.enabled()) return renderGlobal(mine, { you, season });
  let rows;
  try {
    rows = await provider.fetchBoard({ period, you, seasonStartKey: season.startKey });
  } catch (e) {
    if (mine !== token) return;
    $('#boardNotice').textContent = e.message;
    $('#boardSoon').replaceChildren();
    $('#podium').replaceChildren();
    $('#board').replaceChildren();
    return;
  }
  if (mine !== token) return;
  if (provider.mode === 'local') return renderLocal({ you, season, rows });
  renderTable(rows);
}

export function bindRanking() {
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => { period = b.dataset.period; renderRanking(); }));
  // Algo del ranking global cambió (te uniste, terminaste un pomodoro…): si estás viendo el ranking, se repinta
  document.addEventListener('frostpom:board', () => { if (document.body.dataset.route === 'ranking') renderRanking(); });
}
