/*
 * FrostPom — vista Progreso: rango y racha, misiones diarias e historial.
 * "Tu estudio" (semana y calendario) vive en activity.js.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as E from '../engine.js';
import * as FX from './effects.js';
import { $, h, fmtInt } from './dom.js';
import { confirmDialog } from './feedback.js';
import { emblem } from './emblems.js';
import { mascotPop } from './widgets.js';
import { state, mutate, today } from './context.js';
import { config } from '../config.js';
import { seasonFor, daysLeft } from '../season.js';
import { renderActivity } from './activity.js';

function renderShowcase() {
  const r = G.rankForXp(state.progress.xp);
  const streak = G.computeStreak(state.daily, today());
  const best = Math.max(state.progress.bestStreak, streak.current);
  const pct = Math.round(r.progress * 100);
  const season = seasonFor(new Date(), config.season.months);
  const left = daysLeft(season, today());
  $('#showcase').replaceChildren(
    h('div', { class: 'showcase__rank', vars: { '--rank-a': r.colors.a, '--rank-b': r.colors.b, '--rank-glow': r.colors.glow } },
      h('div', { class: 'showcase__emblem' }, emblem(r, { size: 150 })),
      h('div', { class: 'showcase__info' },
        h('p', { class: 'showcase__label', text: 'Tu rango esta temporada' }),
        h('h2', { class: 'showcase__name', text: r.name }),
        h('p', { class: 'showcase__xp', text: `${fmtInt(state.progress.xp)} XP esta temporada` }),
        h('div', { class: 'xpbar xpbar--lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `Progreso hacia ${r.nextName}` },
          h('span', { class: 'xpbar__fill', vars: { '--p': `${pct}%` } })),
        h('p', { class: 'showcase__next', text: `Te faltan ${fmtInt(r.xpToNext)} XP para ${r.nextName}.` }),
        h('p', { class: 'showcase__season' }, h('span', { 'aria-hidden': 'true', text: '🏁 ' }), `${season.name} · ${left === 1 ? 'último día' : `quedan ${left} días`}`))),
    h('div', { class: `streak${streak.activeToday ? ' is-hot' : ''}` },
      h('span', { class: 'streak__flame', 'aria-hidden': 'true' }),
      h('div', {},
        h('p', { class: 'streak__n', text: U.plural(streak.current, 'día seguido', 'días seguidos') }),
        h('p', { class: 'streak__sub', text: streak.activeToday ? `Hoy ya cuenta. Tu mejor racha: ${best}.` : `Estudia 10 minutos hoy para mantenerla. Mejor racha: ${best}.` }))),
    h('details', { class: 'ladder' },
      h('summary', { text: 'Ver todos los rangos' }),
      h('ol', { class: 'ladder__list' }, G.rankLadder().map((step) => {
        const reached = state.progress.xp >= step.minXp;
        return h('li', { class: `ladder__item${reached ? ' is-reached' : ''}${step.index === r.index ? ' is-current' : ''}` },
          emblem({ ...G.rankForXp(step.minXp), stars: 0 }, { size: 34, label: false }),
          h('span', { class: 'ladder__name', text: step.name }),
          h('span', { class: 'ladder__xp', text: `${fmtInt(step.minXp)} XP` }));
      }))),
  );
}

function renderMissions() {
  const t0 = today();
  const day = state.daily[t0] || G.emptyDay();
  const missions = G.dailyMissions(t0);
  const claimedCount = missions.filter((m) => state.progress.claimed[m.id]).length;
  $('#missionsMeta').textContent = `${claimedCount} de ${missions.length}, se renuevan a medianoche`;
  $('#missionList').replaceChildren(...missions.map((m) => {
    const prog = G.missionProgress(m, day);
    const claimed = !!state.progress.claimed[m.id];
    const pct = Math.round((prog.current / prog.target) * 100);
    let action;
    if (claimed) action = h('span', { class: 'mission__done', text: 'Reclamada' });
    else if (prog.done) action = h('button', { type: 'button', class: 'btn btn--gold btn--sm mission__claim', onclick: (e) => claimMission(m.id, e.currentTarget) }, 'Reclamar');
    else action = h('span', { class: 'mission__count', text: `${prog.current}/${prog.target}` });
    return h('li', { class: `mission${claimed ? ' is-claimed' : prog.done ? ' is-ready' : ''}` },
      h('span', { class: 'mission__icon', 'aria-hidden': 'true', text: m.icon }),
      h('div', { class: 'mission__body' },
        h('p', { class: 'mission__text', text: m.text }),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(prog.target), 'aria-valuenow': String(prog.current), 'aria-label': m.text },
          h('span', { class: 'meter__fill', vars: { '--p': `${pct}%` } })),
        h('p', { class: 'mission__reward', text: `Premio: +${m.reward.xp} XP y +${m.reward.gems} gemas` })),
      action);
  }));
}

function claimMission(id, btn) {
  const anchor = btn.getBoundingClientRect();
  const res = mutate((s) => E.claimMission(s, id, today()));
  if (res.ok) {
    FX.confetti({ x: anchor.left + anchor.width / 2, y: anchor.top, count: 40, spread: 0.6 });
    mascotPop('amor', $('#missionList'), 2200);
  }
}

const HISTORY_SHORT = 5;
let historyOpen = false;
function renderHistory() {
  const list = $('#historyList');
  const more = $('#historyMore');
  const all = state.sessions.slice(0, 30);
  $('#historyMeta').textContent = all.length > HISTORY_SHORT ? U.plural(all.length, 'sesión reciente', 'sesiones recientes') : '';
  more.hidden = all.length <= HISTORY_SHORT;
  more.textContent = historyOpen ? 'Ver menos' : `Ver más (${all.length - HISTORY_SHORT})`;
  more.setAttribute('aria-expanded', String(historyOpen));
  const items = historyOpen ? all : all.slice(0, HISTORY_SHORT);
  if (!items.length) {
    list.replaceChildren(h('li', { class: 'empty', text: 'Tus sesiones aparecerán aquí. Empieza una en Enfocar.' }));
    return;
  }
  list.replaceChildren(...items.map((s) => h('li', { class: 'hist' },
    h('div', { class: 'hist__main' },
      h('b', { text: `${U.formatMinutes(s.actualSec / 60)} de estudio` }),
      h('span', { class: 'hist__meta', text: U.formatDateTime(s.startedAt) })),
    h('span', { class: `hist__tag${s.completed ? ' is-full' : ''}`, text: s.completed ? 'Completa' : 'Guardada antes' }),
    h('span', { class: 'hist__xp', text: `+${s.xp} XP` }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Eliminar la sesión del ${U.formatDateTime(s.startedAt)}`, onclick: () => deleteSession(s) }, '×'))));
}

async function deleteSession(s) {
  const ok = await confirmDialog('¿Eliminar esta sesión?', `Se descuentan ${U.formatMinutes(s.actualSec / 60)} y ${s.xp} XP. Úsalo si el temporizador se quedó corriendo por error.`, 'Eliminar');
  if (ok) mutate((st) => E.removeSession(st, s.id));
}

export function renderProgress() {
  renderShowcase();
  renderMissions();
  renderActivity();
  renderHistory();
}

export function bindProgress() {
  $('#historyMore').addEventListener('click', () => { historyOpen = !historyOpen; renderHistory(); });
}
