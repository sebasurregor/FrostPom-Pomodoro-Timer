/*
 * FrostPom — vista Ranking.
 * Primer MVP: ranking local (solo tu marca) + aviso de que el ranking global llega pronto.
 * Cuando exista el servidor, el modo "remote" muestra el podio y la tabla completa.
 */
import * as U from '../util.js';
import * as E from '../engine.js';
import { getProvider } from '../leaderboard.js';
import { config } from '../config.js';
import { seasonFor } from '../season.js';
import { $, $$, h } from './dom.js';
import { emblem } from './emblems.js';
import { avatarContent, flagEl } from './widgets.js';
import { state } from './context.js';

const LIMIT = 30;
let period = 'week';
let token = 0;

/** Tu fila usa tu avatar real; las demás, el emoji de cada persona. */
const who = (r) => ({
  avatar: (size) => (r.isYou ? avatarContent(size) : r.avatar),
  name: [flagEl(r.isYou ? state.profile.country : r.country), ' ', r.isYou ? `${r.nick} (tú)` : r.nick],
});

const rowEl = (r, pos = String(r.position)) => {
  const w = who(r);
  return h('li', { class: `row${r.isYou ? ' is-you' : ''}` },
    h('span', { class: 'row__pos', text: pos }),
    h('span', { class: 'avatar avatar--sm' }, w.avatar(28)),
    h('span', { class: 'row__nick' }, w.name),
    h('span', { class: 'row__emblem' }, emblem(r.rank, { size: 30 })),
    h('span', { class: 'row__min', text: U.formatMinutes(r.minutes) }));
};

/** Tarjeta "El ranking global llega pronto". */
function soonCard() {
  return h('div', { class: 'panel soon' },
    h('div', { class: 'soon__icon', 'aria-hidden': 'true', text: '🌍' }),
    h('h2', { class: 'panel__title', text: 'El ranking global llega pronto' }),
    h('p', { class: 'panel__text', text: 'FrostPom acaba de nacer. Cuando el ranking en línea esté listo, aquí competirás con estudiantes de todo el mundo, semana a semana y por temporada. Mientras tanto, cada minuto que estudies ya cuenta para tu marca.' }));
}

export async function renderRanking() {
  const mine = ++token;
  const provider = getProvider(config);
  const months = config.season.months;
  const season = seasonFor(new Date(), months);
  const mins = E.boardMinutes(state, new Date(), months);
  const you = { nick: state.profile.nick, avatar: state.profile.avatar, xp: state.progress.xp, week: mins.week, season: mins.season, optIn: state.settings.leaderboardOn };
  $('#seasonTab').textContent = 'Esta temporada';
  $('#seasonTab').title = season.name;
  $$('.seg__btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.period === period)));
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
  const cap = U.formatMinutes(state.settings.dailyCapMin);
  const optOut = state.settings.leaderboardOn ? '' : ' Elegiste no aparecer en el ranking: puedes cambiarlo en Ajustes.';

  if (provider.mode === 'local') {
    $('#boardNotice').textContent = `Cada persona sumará como máximo ${cap} al día, para premiar la constancia y no el desvelo.${optOut}`;
    $('#boardSoon').replaceChildren(soonCard());
    $('#podium').replaceChildren();
    const label = period === 'week' ? 'Tu marca de esta semana' : `Tu marca de la temporada (${season.name.replace(/^Temporada\s+/, '')})`;
    $('#board').removeAttribute('start');
    $('#board').replaceChildren(
      h('li', { class: 'board__label', text: label }),
      ...rows.map((r) => rowEl(r, '★')));
    return;
  }

  $('#boardNotice').textContent = `Cada persona suma como máximo ${cap} al día.${optOut}`;
  $('#boardSoon').replaceChildren();
  const top3 = rows.slice(0, 3);
  $('#podium').replaceChildren(...[1, 0, 2].filter((i) => top3[i]).map((i) => {
    const r = top3[i];
    const w = who(r);
    return h('div', { class: `podium__spot podium__spot--${i + 1}${r.isYou ? ' is-you' : ''}` },
      h('span', { class: 'avatar avatar--podium' }, w.avatar(46)),
      h('span', { class: 'podium__nick' }, w.name),
      h('span', { class: 'podium__min', text: U.formatMinutes(r.minutes) }),
      h('span', { class: 'podium__block' }, h('b', { text: String(r.position) })));
  }));
  const youRow = rows.find((r) => r.isYou);
  const extra = youRow && rows.indexOf(youRow) >= LIMIT ? [youRow] : [];
  $('#board').replaceChildren(...rows.slice(3, LIMIT).map((r) => rowEl(r)), ...(extra.length ? [h('li', { class: 'row row--gap', 'aria-hidden': 'true', text: '…' }), ...extra.map((r) => rowEl(r))] : []));
  $('#board').setAttribute('start', '4');
}

export function bindRanking() {
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => { period = b.dataset.period; renderRanking(); }));
}
