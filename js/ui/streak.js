/*
 * FrostPom — (v4.5.2) la racha se ve: el fuego que se enciende, crece y se congela.
 *
 *  - El primer día de una racha: una vista con el fuego ENCENDIÉNDOSE y "+1 día de racha".
 *  - A los 5, 10, 20, 50, 100, 200 y 365 días: la misma vista, con el fuego cada vez más grande.
 *  - Los demás días: un aviso corto ("+1 día de racha").
 *  - Si la racha se apagó AYER: tu compañero triste, el fuego congelado y la opción de revivirla
 *    con gemas (o, cuando haya anuncios, viendo uno: js/ads.js y docs/ANUNCIOS.md).
 *
 * El fuego es el mismo dibujo de la fogata de la pantalla de entrada (index.html, .campfire):
 * es un dibujo vectorial, así que se ve nítido aunque crezca.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as E from '../engine.js';
import * as FX from './effects.js';
import { streakAd } from './ads-ui.js';
import { currentPetId } from '../pet.js';
import { h, svg, wait, fmtInt } from './dom.js';
import { toast, openDialog, focusPrimary } from './feedback.js';
import { petArt } from './companions.js';
import { pic } from './pics.js';
import { state, store, mutate, today } from './context.js';
import { t, tr } from '../i18n.js';

const ORANGE = { a: '#FFB347', b: '#E4572E', glow: '#FF8A3D' };
const TRACK = [1, ...G.STREAK_MILESTONES.slice(0, 5)]; // 1 · 5 · 10 · 20 · 50 · 100

/** La llama (cuerpo naranja + centro amarillo), copiada de la fogata de la entrada. */
function flameSvg(cls = '') {
  const body = document.querySelector('.campfire__body path');
  const core = document.querySelector('.campfire__core path');
  if (!body) return pic('fuego', 96);
  return svg('svg', { class: `sfire__svg ${cls}`.trim(), viewBox: '1350 682 116 144', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { class: 'sfire__body', d: body.getAttribute('d') }),
    core ? svg('path', { class: 'sfire__core', d: core.getAttribute('d') }) : null);
}

/**
 * El fuego del tamaño de la racha: tier 0 = recién encendido; cada meta lo hace más grande, con
 * más llamitas a los lados y más chispas.
 */
export function streakFire(days, { lighting = false } = {}) {
  const tier = G.streakTier(days);
  const sparks = Math.min(3 + tier * 2, 14);
  return h('div', { class: `sfire sfire--t${tier}${lighting ? ' is-lighting' : ''}`, vars: { '--tier': String(tier) }, 'aria-hidden': 'true' },
    h('span', { class: 'sfire__glow' }),
    tier >= 2 ? h('span', { class: 'sfire__side sfire__side--l' }, flameSvg()) : null,
    tier >= 2 ? h('span', { class: 'sfire__side sfire__side--r' }, flameSvg()) : null,
    tier >= 4 ? h('span', { class: 'sfire__side sfire__side--l2' }, flameSvg()) : null,
    tier >= 4 ? h('span', { class: 'sfire__side sfire__side--r2' }, flameSvg()) : null,
    h('span', { class: 'sfire__main' }, flameSvg()),
    Array.from({ length: sparks }, (_, i) => h('span', { class: 'sfire__spark', vars: { '--i': String(i), '--x': `${((i * 37) % 100) - 50}%`, '--d': `${1.4 + ((i * 13) % 10) / 10}s` } })));
}

/** La fila de metas: 1 · 5 · 10 · 20 · 50 · 100 (las que ya lograste, con fuego). */
function track(days) {
  return h('ol', { class: 'streak-track', 'aria-label': tr('Metas de la racha') },
    TRACK.map((m) => h('li', { class: `streak-track__step${days >= m ? ' is-on' : ''}${days === m ? ' is-now' : ''}` },
      pic(days >= m ? 'fuego' : 'fuego-congelado', 26),
      h('span', { text: String(m) }))));
}

const nextGoal = (days) => G.STREAK_MILESTONES.find((m) => m > days) || 0;

/** La racha de hoy se encendió (engine.js: evento 'streak'). */
export async function showStreakLit(e) {
  if (!e.first && !e.milestone) {
    FX.sfx.claim();
    toast(t('+1 día de racha: llevas {n} días seguidos.', { n: e.days }), 'good streak-toast', { icon: '🔥', ms: 4200 });
    return wait(200);
  }
  FX.sfx.rankUp();
  FX.buzz([30, 40, 30, 40, 90]);
  setTimeout(() => FX.confetti({ count: e.first ? 70 : 90 + G.streakTier(e.days) * 20, colors: [ORANGE.a, ORANGE.b, '#FFD45C', '#ffffff'] }), 650);
  const next = nextGoal(e.days);
  await openDialog({
    className: 'dlg--rankup dlg--streak',
    body: [h('div', { class: 'rankup streak-lit', vars: { '--rank-a': ORANGE.a, '--rank-b': ORANGE.b, '--rank-glow': ORANGE.glow } },
      h('div', { class: 'rankup__rays', 'aria-hidden': 'true' }),
      h('div', { class: 'streak-lit__stage' }, streakFire(e.days, { lighting: true })),
      h('p', { class: 'streak-lit__plus', text: tr('+1 día de racha') }),
      h('p', { class: 'rankup__kicker', text: e.first ? tr('¡Encendiste tu racha!') : tr('¡Tu fuego creció!') }),
      h('h2', { class: 'rankup__name rankup__name--sm', id: 'dlgTitle', text: U.plural(e.days, 'día', 'días') }),
      h('p', { class: 'rankup__tagline', text: e.first
        ? tr('Estudia mañana para que siga ardiendo. Cada meta lo hace más grande.')
        : next ? t('Llevas {n} días seguidos. Próxima meta: {next} días.', { n: e.days, next }) : t('Llevas {n} días seguidos. ¡Eres imparable!', { n: e.days }) }),
      track(e.days))],
    actions: [{ label: e.first ? '¡A seguir!' : '¡Vamos por más!', value: 'ok', variant: 'btn--gold btn--xl', primary: true }],
    onOpen: focusPrimary,
  });
}

/** Se revivió la racha (engine.js: evento 'streakRevived'). */
export function showStreakRevived(e) {
  FX.sfx.achievement();
  FX.buzz([30, 40, 60]);
  FX.confetti({ count: 60, colors: [ORANGE.a, ORANGE.b, '#FFD45C', '#45C6EE'] });
  toast(e.gems
    ? t('¡Tu racha volvió! Llevas {n} días. Gastaste {g} gemas: estudia hoy para que siga ardiendo.', { n: e.days, g: fmtInt(e.gems) })
    : t('¡Tu racha volvió! Llevas {n} días: estudia hoy para que siga ardiendo.', { n: e.days }), 'good', { icon: '🔥', ms: 6000 });
  return wait(200);
}

// ---------------------------------------------------------------------
// La racha se apagó
// ---------------------------------------------------------------------
/** ¿Hay una racha apagada que todavía se puede revivir? (G.lostStreak) */
export const lostNow = () => (state.profile.onboarded ? G.lostStreak(state.daily, today()) : null);

/**
 * La vista de la racha apagada: tu compañero triste y el fuego congelado. Devuelve true si la
 * revivió.
 */
export async function lostStreakDialog(lost = lostNow()) {
  if (!lost) return false;
  const pet = currentPetId(state);
  const err = h('p', { class: 'form-error', role: 'alert' });
  const ad = streakAd(lost); // (v4.5.3) 1 anuncio por cada día que faltó (solo en Android, 13+)
  let revived = false;
  const gemsBtn = { label: t('Revivir por {n} gemas', { n: fmtInt(lost.gems) }), value: 'gems', variant: 'btn--gold', primary: true, validate: () => {
    const res = mutate((s) => E.reviveStreak(s, today()));
    if (res.ok) { revived = true; return true; }
    err.textContent = res.reason === 'gems'
      ? t('Te faltan {n} gemas. Las ganas estudiando y con las misiones.', { n: fmtInt(res.need - state.progress.gems) })
      : tr('Esta racha ya no se puede revivir.');
    return false;
  } };
  const adLabel = (seen) => (ad.need > 1 ? t('Ver anuncios y revivirla ({n} de {total})', { n: seen, total: ad.need }) : tr('Ver un anuncio y revivirla'));
  const adBtn = ad ? { label: adLabel(ad.seen), value: 'ad', variant: 'btn--mint', validate: async (btn) => {
    err.textContent = '';
    const r = await ad.watch(btn);
    if (r === 'more') {
      ad.seen += 1;
      if (btn) btn.textContent = adLabel(ad.seen);
      return false; // falta otro: la ventana sigue abierta
    }
    if (r !== 'done') { err.textContent = r; return false; }
    const res = mutate((s) => E.reviveStreak(s, today(), { via: 'ad' }));
    revived = res.ok;
    return res.ok;
  } } : null;
  await openDialog({
    className: 'dlg--streaklost',
    title: 'Tu racha se apagó',
    body: [
      h('div', { class: 'streak-lost__art', 'aria-hidden': 'true' },
        h('span', { class: 'streak-lost__pet' }, petArt(pet, 'llorando', { size: 112 })),
        h('img', { class: 'streak-lost__fire', src: 'assets/icons/fuego-congelado-lg.webp', width: 96, height: 96, alt: '', decoding: 'async' })),
      h('p', { class: 'dlg__text', text: lost.missed.length > 1
        ? t('Tenías {n} días seguidos, pero faltaron 2 días y el fuego se congeló.', { n: lost.length })
        : t('Tenías {n} días seguidos, pero ayer no estudiaste y el fuego se congeló.', { n: lost.length }) }),
      h('p', { class: 'dlg__text', text: t('Todavía puedes revivirla: volverías a tener {n} días de racha.', { n: lost.restored }) }),
      h('p', { class: 'acc-hint', text: t('Tienes {n} gemas.', { n: fmtInt(state.progress.gems) }) }),
      err,
    ],
    actions: [
      { label: 'Empezar de nuevo', value: 'no' },
      adBtn,
      gemsBtn,
    ].filter(Boolean),
  });
  return revived;
}

/**
 * Al abrir la app: si la racha se apagó ayer y todavía se puede revivir, se muestra la vista una
 * vez (por cada racha apagada). Después sigue en Progreso, en la tarjeta de la racha.
 */
export async function checkStreak({ running = false } = {}) {
  const lost = lostNow();
  if (!lost || running) return;
  const id = `${lost.missed[0]}:${lost.length}`;
  if (store.pref.get('streak_lost_seen') === id) return;
  store.pref.set('streak_lost_seen', id);
  await lostStreakDialog(lost);
}
