/*
 * FrostPom — barra superior (rango, XP, racha, gemas) y salud del polo (paisaje del fondo).
 */
import * as U from '../util.js';
import * as G from '../game.js';
import { $, $$, h, fmtInt } from './dom.js';
import { weatherFor, weatherLabel } from '../weather.js';
import { emblem } from './emblems.js';
import * as scenery from './scenery.js';
import { avatarContent } from './widgets.js';
import { state, today, poleNow } from './context.js';

let hudEmblemLevel = -1;
export function renderHUD() {
  const r = G.rankForXp(state.progress.xp);
  $('#hudAvatar').replaceChildren(avatarContent(34));
  $('#hudAvatar').classList.toggle('has-companion', !!state.profile.companion || !!state.profile.photo);
  $('#hudNick').textContent = state.profile.nick || 'Estudiante';
  $('#hudRank').textContent = r.name;
  document.documentElement.style.setProperty('--tier-a', r.colors.a);
  document.documentElement.style.setProperty('--tier-b', r.colors.b);
  if (hudEmblemLevel !== r.level) {
    $('#hudEmblem').replaceChildren(emblem(r, { size: 40 }));
    hudEmblemLevel = r.level;
  }
  const pct = Math.round(r.progress * 100);
  $('#hudXpFill').style.setProperty('--p', `${pct}%`);
  $('#hudXpBar').setAttribute('aria-valuenow', String(pct));
  $('#hudXpBar').setAttribute('aria-valuetext', `${pct} %, faltan ${r.xpToNext} XP para ${r.nextName}`);
  $('#hudXpText').textContent = `${fmtInt(r.xpToNext)} XP para subir`;
  const streak = G.computeStreak(state.daily, today());
  $('#hudStreakN').textContent = String(streak.current);
  $('#hudStreak').classList.toggle('is-hot', streak.activeToday);
  $('#hudStreak').title = streak.activeToday ? `Racha de ${streak.current} días. Hoy ya cuenta.` : `Racha de ${streak.current} días. Estudia 10 minutos hoy para mantenerla.`;
  $('#hudGemsN').textContent = fmtInt(state.progress.gems);
}

export function renderPole() {
  const health = poleNow();
  const level = G.poleLevel(health);
  const pct = Math.round(health * 100);
  scenery.setHealth(health, level.id);
  for (const id of ['#poleFill', '#poleFill2']) $(id).style.setProperty('--p', `${pct}%`);
  $('#polePct').textContent = `${pct} %`;
  $('#polePill').dataset.level = level.id;
  $('#polePill').setAttribute('aria-label', `Tu polo está ${pct} % limpio: ${level.label}. Ver detalles.`);
  $$('.meter--pole').forEach((m) => { m.setAttribute('aria-valuenow', String(pct)); m.dataset.level = level.id; });
  $('#poleLevel').textContent = `${level.label}, ${pct} %`;
  $('#poleText').textContent = level.text;
  $('#poleGoal').textContent = U.formatMinutes(G.POLE_GOAL_MIN);
  renderWeather(level.id);
}

/** Clima del polo (cambia cada 3 horas). Con el polo contaminado, la nieve sale gris. */
function renderWeather(levelId = G.poleLevel(poleNow()).id) {
  const tz = state.settings.timeZone || undefined;
  const now = new Date();
  const id = weatherFor(now, tz);
  scenery.setWeather(id);
  const lab = weatherLabel(id, { night: scenery.phaseFor(now, tz) === 'night', dirty: levelId === 'contaminado' || levelId === 'critico' });
  const line = $('#weatherLine');
  if (line) line.replaceChildren(h('span', { class: 'weather-line__icon', 'aria-hidden': 'true', text: lab.icon }), ` Clima en tu polo: ${lab.text}`);
}

function togglePoleInfo() {
  const btn = $('#poleInfoBtn');
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  $('#poleInfo').hidden = !open;
}

/** El cielo sigue la hora real (amanecer, día, atardecer, noche) de la región elegida. */
export function updatePhase() {
  scenery.setPhase(scenery.phaseFor(new Date(), state.settings.timeZone || undefined));
  renderWeather();
}

export function bindHUD() {
  scenery.mount($('#scenery'));
  $('#poleInfoBtn').addEventListener('click', togglePoleInfo);
}
