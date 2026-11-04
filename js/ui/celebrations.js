/*
 * StudyTimer — eventos de recompensa → animaciones.
 * engine.js devuelve eventos (xp, rankup, achievement…); aquí se muestran uno tras otro.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as E from '../engine.js';
import * as FX from './effects.js';
import { $, h, wait } from './dom.js';
import { toast, openDialog, focusPrimary } from './feedback.js';
import { emblem } from './emblems.js';
import { companion, penguin, say } from './companions.js';
import { pickVoice } from '../voices.js';
import { PETS } from '../pet.js';
import { mutate } from './context.js';

const queue = [];
let playing = false;

export function play(events) {
  queue.push(...events);
  if (!playing) pump();
}
async function pump() {
  playing = true;
  while (queue.length) await showEvent(queue.shift());
  playing = false;
}

const SHOW = {
  xp(e) {
    const anchor = location.hash.includes('progreso') ? $('#showcase') : $('#ring');
    FX.floatText(`+${e.amount} XP`, anchor && anchor.offsetParent ? anchor : $('#hudXpBar'), 'xp');
    const bar = $('#hudXpBar');
    bar.classList.remove('is-gaining');
    void bar.offsetWidth;
    bar.classList.add('is-gaining');
    return wait(250);
  },
  gems(e) {
    FX.floatText(`+${e.amount} gemas`, $('#hudGems'), 'gem');
    return wait(200);
  },
  rankup: showRankUp,
  achievement(e) {
    const a = G.ACHIEVEMENT_BY_ID[e.id];
    FX.sfx.achievement();
    toast(`Logro: ${a.name}. ${G.RARITY[a.rarity].label}, +${e.gems} gemas.`, `ach toast--${a.rarity}`, { icon: a.icon, ms: 4600 });
    if (a.rarity === 'epico' || a.rarity === 'legendario') FX.confetti({ y: 90, count: 60 });
    return wait(700);
  },
  mission() {
    FX.sfx.claim();
    return wait(150);
  },
  capped(e) {
    toast(`Llegaste a tu límite saludable de hoy (${U.formatMinutes(e.capMin)}). Lo que sigas estudiando ya no suma XP: buen momento para descansar.`, 'warn', { ms: 6000 });
    return wait(300);
  },
  tooShort() {
    toast('Menos de 1 minuto no se guarda.');
    return wait(100);
  },
  companion: showCompanionUnlock,
  season: showNewSeason,
  fed(e) {
    const stage = $('#buddy');
    FX.sfx.claim();
    FX.buzz(30);
    if (stage) {
      say(stage, pickVoice(PETS[e.petId].kind, { ate: e.favorite ? 'favorite' : 'yum' }), { ms: 2200 });
      FX.floatText(`+${e.gained} barriguita`, stage, 'gem');
      const r = stage.getBoundingClientRect();
      FX.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 3, count: e.favorite ? 40 : 22, spread: 0.45, colors: ['#FF5E7E', '#FFC531', '#ffffff'] });
    }
    return wait(150);
  },
  skin(e) {
    toast(`Nuevo estilo para tu anillo: ${e.skin.name}.`, 'good');
    return wait(100);
  },
};

function showEvent(e) {
  return SHOW[e.type] ? SHOW[e.type](e) : undefined;
}

/** Tarjeta de celebración con rayos, imagen grande y textos. */
function ceremony({ colors, art, mascot = true, kicker, name, nameClass = '', lines }) {
  return h('div', { class: 'rankup', vars: { '--rank-a': colors.a, '--rank-b': colors.b, '--rank-glow': colors.glow } },
    h('div', { class: 'rankup__rays', 'aria-hidden': 'true' }),
    h('div', { class: 'rankup__emblem' }, art),
    mascot ? h('div', { class: 'rankup__mascot' }, penguin('amor', { size: 92 })) : null,
    h('p', { class: 'rankup__kicker', text: kicker }),
    h('h2', { class: `rankup__name ${nameClass}`.trim(), id: 'dlgTitle', text: name }),
    lines);
}

function fanfare(confettiOpts) {
  FX.sfx.rankUp();
  FX.buzz([30, 40, 30, 40, 90]);
  setTimeout(() => FX.confetti(confettiOpts), 250);
}

async function showRankUp(e) {
  const to = e.to;
  fanfare({ count: 140, colors: [to.colors.a, to.colors.b, '#FFC531', '#ffffff'] });
  await openDialog({
    className: 'dlg--rankup',
    body: [ceremony({
      colors: to.colors,
      art: emblem(to, { size: 168 }),
      kicker: e.from.tierIndex !== to.tierIndex ? '¡Nuevo rango!' : '¡Subiste de división!',
      name: to.name,
      lines: h('p', { class: 'rankup__gems', text: `+${e.gems} gemas de premio` }),
    })],
    actions: [{ label: '¡Vamos!', value: 'ok', variant: 'btn--gold btn--xl', primary: true }],
    onOpen: focusPrimary,
  });
}

async function showCompanionUnlock(e) {
  const c = e.companion;
  fanfare({ count: 120 });
  const res = await openDialog({
    className: 'dlg--rankup',
    body: [ceremony({
      colors: { a: '#FFC531', b: '#FF5E7E', glow: '#FFC531' },
      art: companion(c.id, { size: 170 }),
      mascot: c.id !== 'pinguino',
      kicker: '¡Compañero de edición limitada!',
      name: c.name,
      nameClass: 'rankup__name--sm',
      lines: [
        h('p', { class: 'rankup__tagline', text: c.tagline }),
        h('p', { class: 'rankup__gems', text: `Lo ganaste con el logro ${G.ACHIEVEMENT_BY_ID[c.unlock].name}.` }),
      ],
    })],
    actions: [
      { label: 'Luego', value: 'later' },
      { label: '¡Que me acompañe!', value: 'equip', variant: 'btn--gold', primary: true },
    ],
    onOpen: focusPrimary,
  });
  if (res === 'equip') mutate((s) => E.equipCompanion(s, c.id));
}

/** Cambio de temporada: resumen de la que terminó, premio y rango de vuelta a Bronce III. */
async function showNewSeason(e) {
  const end = e.ended;
  const newName = e.season.name.replace('Temporada ', '');
  fanfare({ count: 120, colors: [e.rank.colors.a, e.rank.colors.b, '#FFC531', '#ffffff'] });
  const studied = end.studyMin ? `${U.formatMinutes(end.studyMin)} en ${U.plural(end.activeDays, 'día', 'días')}` : 'sin sesiones';
  await openDialog({
    className: 'dlg--rankup',
    body: [ceremony({
      colors: e.rank.colors,
      art: emblem(e.rank, { size: 150 }),
      kicker: '¡Nueva temporada de estudio!',
      name: newName,
      nameClass: 'rankup__name--sm',
      lines: [
        h('p', { class: 'rankup__tagline', text: `La temporada pasada terminaste en ${end.rank} (${studied}).` }),
        end.gems ? h('p', { class: 'rankup__gems', text: `+${end.gems} gemas de premio` }) : null,
        h('p', { class: 'rankup__tagline', text: 'Tu rango vuelve a Bronce III. Tus logros, compañeros, temas, gemas y calendario se quedan contigo. ¡A subir otra vez!' }),
      ],
    })],
    actions: [{ label: '¡Empezar la temporada!', value: 'ok', variant: 'btn--gold btn--xl', primary: true }],
    onOpen: focusPrimary,
  });
}
