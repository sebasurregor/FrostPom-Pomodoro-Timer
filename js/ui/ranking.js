/*
 * StudyTimer — vista Ranking (modo demostración hoy; ver leaderboard.js).
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

/** Tu fila usa tu avatar real; las demás, el emoji del rival. */
const who = (r) => ({
  avatar: (size) => (r.isYou ? avatarContent(size) : r.avatar),
  name: [flagEl(r.isYou ? state.profile.country : r.country), ' ', r.isYou ? `${r.nick} (tú)` : r.nick],
});

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
    $('#podium').replaceChildren();
    $('#board').replaceChildren();
    return;
  }
  if (mine !== token) return;
  const cap = U.formatMinutes(state.settings.dailyCapMin);
  $('#boardNotice').textContent = (provider.mode === 'demo'
    ? `Modo demostración: los rivales son simulados y solo tus minutos son reales. Cada persona suma como máximo ${cap} al día, para premiar la constancia y no el desvelo.`
    : `Cada persona suma como máximo ${cap} al día.`)
    + (state.settings.leaderboardOn ? '' : ' Ahora no apareces: puedes activarlo en Ajustes.');

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
  const rowEl = (r) => {
    const w = who(r);
    return h('li', { class: `row${r.isYou ? ' is-you' : ''}` },
      h('span', { class: 'row__pos', text: String(r.position) }),
      h('span', { class: 'avatar avatar--sm' }, w.avatar(28)),
      h('span', { class: 'row__nick' }, w.name),
      h('span', { class: 'row__emblem' }, emblem(r.rank, { size: 30 })),
      h('span', { class: 'row__min', text: U.formatMinutes(r.minutes) }));
  };
  $('#board').replaceChildren(...rows.slice(3, LIMIT).map(rowEl), ...(extra.length ? [h('li', { class: 'row row--gap', 'aria-hidden': 'true', text: '…' }), ...extra.map(rowEl)] : []));
  $('#board').setAttribute('start', '4');
}

export function bindRanking() {
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => { period = b.dataset.period; renderRanking(); }));
}
