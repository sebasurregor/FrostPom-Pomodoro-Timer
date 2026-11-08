/*
 * FrostPom — barra superior (rango, XP, racha, gemas) y salud del polo (paisaje del fondo).
 */
import * as G from '../game.js';
import { $, $$, h, fmtInt } from './dom.js';
import { weatherFor, weatherLabel } from '../weather.js';
import { emblem } from './emblems.js';
import * as scenery from './scenery.js';
import { avatarContent } from './widgets.js';
import { state, today, poleNow } from './context.js';
import { t, tr } from '../i18n.js';

let hudEmblemLevel = -1;
export function renderHUD() {
  const r = G.rankForXp(state.progress.xp);
  $('#hudAvatar').replaceChildren(avatarContent(34));
  $('#hudAvatar').classList.toggle('has-companion', !!state.profile.companion || !!state.profile.photo);
  $('#hudNick').textContent = state.profile.nick || tr('Estudiante');
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
  $('#hudXpBar').setAttribute('aria-valuetext', t('{pct} %, faltan {n} XP para {rank}', { pct, n: r.xpToNext, rank: r.nextName }));
  $('#hudXpText').textContent = t('{n} XP para subir', { n: fmtInt(r.xpToNext) });
  const streak = G.computeStreak(state.daily, today());
  $('#hudStreakN').textContent = String(streak.current);
  $('#hudStreak').classList.toggle('is-hot', streak.activeToday);
  $('#hudStreak').title = t(streak.activeToday ? 'Racha de {n} días. Hoy ya cuenta.' : 'Racha de {n} días. Estudia 10 minutos hoy para mantenerla.', { n: streak.current });
  $('#hudGemsN').textContent = fmtInt(state.progress.gems);
}

export function renderPole() {
  const health = poleNow();
  const level = G.poleLevel(health);
  const pct = Math.round(health * 100);
  scenery.setHealth(health, level.id);
  $('#poleFill').style.setProperty('--p', `${pct}%`);
  $('#polePct').textContent = `${pct} %`;
  $('#polePill').dataset.level = level.id;
  $('#polePill').setAttribute('aria-label', t('Tu polo está {pct} % limpio: {level}. Ver detalles.', { pct, level: level.label }));
  $$('.meter--pole').forEach((m) => { m.setAttribute('aria-valuenow', String(pct)); m.dataset.level = level.id; });
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
  if (line) line.replaceChildren(h('span', { class: 'weather-line__icon', 'aria-hidden': 'true', text: lab.icon }), ` ${t('Clima en tu polo: {w}', { w: lab.text })}`);
}


/** El cielo sigue la hora real (amanecer, día, atardecer, noche) de la región elegida. */
export function updatePhase() {
  scenery.setPhase(scenery.phaseFor(new Date(), state.settings.timeZone || undefined));
  renderWeather();
}

export function bindHUD() {
  scenery.mount($('#scenery'));
}
