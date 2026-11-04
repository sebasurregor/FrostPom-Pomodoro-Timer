/*
 * FrostPom — Premium (👑). Hoy funciona en MODO PRUEBA: no se cobra nada. Cuando la app
 * esté en las tiendas, la suscripción se compra con Microsoft Store / App Store / Google Play
 * y el estado Premium viene de la compra validada (no de este dispositivo).
 *
 * Regalo de bienvenida (una sola vez, ver engine.setPremium): 1000 gemas para alimentar a la
 * mascota y una mascota de edición limitada que el usuario elige (giftCompanionDialog).
 *
 * Qué desbloquea Premium lo decide catalog.effectivePrefs(); aquí solo está la oferta.
 */
import * as U from '../util.js';
import * as E from '../engine.js';
import * as C from '../catalog.js';
import { config } from '../config.js';
import * as FX from './effects.js';
import { $, h, svg, fmtInt } from './dom.js';
import { toast, openDialog } from './feedback.js';
import { penguin, companion } from './companions.js';
import { state, store, mutate, today, isPremium } from './context.js';

const crown = () => svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  svg('path', { class: 'i-crown', d: 'M3 8.5l4.2 3.6L12 5l4.8 7.1L21 8.5l-2 10H5z' }),
  svg('circle', { class: 'i-crown-gem', cx: 12, cy: 15, r: 1.6 }));

const BENEFITS = [
  ['🎁', `Regalo de bienvenida: ${fmtInt(E.PREMIUM_GEMS)} gemas`, 'Para alimentar a tu mascota en la tienda de Enfocar. Se entrega una sola vez.'],
  ['🐻‍❄️', 'Una mascota de edición limitada', 'Elige la que quieras, sin esperar a ganar su logro.'],
  ['⏰', 'Recordatorios de tu horario de enfoque', ''],
  ['⏱️', 'Duración del temporizador totalmente libre', 'De 1 a 180 minutos de estudio.'],
  ['🎨', 'Todos los temas, sonidos y tonos', 'Aurora, Galaxia, Olas del mar, Fogata y más.'],
  ['🐧', 'Más animaciones adorables en el temporizador', 'Próximamente.'],
  ['🚫', 'Sin anuncios', 'Cuando la versión gratis tenga anuncios, tú no los verás.'],
];

export async function premiumDialog() {
  const price = (config.premium && config.premium.priceLabel) || '';
  // Mientras no haya cobro real, el botón no dice "Suscribirme" (las tiendas exigen no confundir)
  const charging = !!(config.premium && config.premium.chargesEnabled);
  if (isPremium()) {
    const r = await openDialog({
      className: 'dlg--premium',
      title: 'Eres Premium 👑',
      body: [
        h('div', { class: 'premium__hero' }, h('span', { class: 'premium__crown' }, crown()), penguin('amor', { size: 96 })),
        h('p', { class: 'dlg__text', text: 'Tienes todas las funciones Premium activas en modo prueba (sin cobro).' }),
        state.premium.giftPending ? h('p', { class: 'dlg__text', text: 'Todavía no eliges tu mascota de regalo. 🎁' }) : null,
      ],
      actions: [
        { label: 'Desactivar prueba', value: 'off' },
        state.premium.giftPending ? { label: '🎁 Elegir mascota', value: 'gift', variant: 'btn--crown' } : null,
        { label: 'Genial', value: 'ok', variant: 'btn--gold', primary: true },
      ].filter(Boolean),
    });
    if (r === 'gift') return giftCompanionDialog();
    if (r === 'off') {
      mutate((st) => E.setPremium(st, false));
      toast('Premium desactivado. Tus temas y sonidos gratis siguen igual.');
    }
    return;
  }
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'FrostPom Premium',
    body: [
      h('div', { class: 'premium__hero' }, h('span', { class: 'premium__crown' }, crown()), penguin('saludo', { size: 96 })),
      h('ul', { class: 'premium__list' }, BENEFITS.map(([icon, title, sub]) => h('li', {},
        h('span', { class: 'premium__icon', 'aria-hidden': 'true', text: icon }),
        h('span', {}, h('b', { text: title }), sub ? h('small', { text: sub }) : null)))),
      charging
        ? h('p', { class: 'premium__price', text: price ? `${price}. Cancela cuando quieras.` : 'Suscripción mensual. Cancela cuando quieras.' })
        : h('p', { class: 'premium__price', text: 'Gratis por ahora' }),
      h('p', { class: 'dlg__note', text: charging ? 'El cobro lo hace la tienda donde instalaste la app. Cancela cuando quieras.' : `Modo prueba: no se cobra nada.${price ? ` Cuando se active el cobro, costará ${price}, y te avisaremos antes.` : ''}` }),
    ],
    actions: [
      { label: 'Ahora no', value: 'later' },
      { label: charging ? (price ? `Suscribirme, ${price}` : 'Suscribirme') : 'Probar Premium gratis', value: 'buy', variant: 'btn--gold', primary: true },
    ],
  });
  if (r === 'buy') {
    const res = mutate((st) => E.setPremium(st, true));
    // La primera vez llega el regalo (lo celebra celebrations.js); las siguientes, solo un aviso.
    if (!res.events.some((e) => e.type === 'premiumGift')) {
      FX.sfx.achievement();
      FX.confetti({ count: 90, colors: ['#FFC531', '#FFE680', '#ffffff', '#93c0ed'] });
      toast('¡Premium activado en modo prueba! 👑 Sin cobro.', 'good', { icon: '👑' });
    }
  }
}

/** Elegir la mascota de edición limitada del regalo de Premium (una sola vez). */
export async function giftCompanionDialog() {
  const options = C.lockedCompanions(state.progress);
  if (!state.premium.giftPending || !options.length) return;
  let pick = null;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const cards = options.map((c) => h('button', {
    type: 'button', role: 'radio', class: 'gift-pet', 'aria-checked': 'false', 'data-id': c.id,
    onclick: (ev) => {
      pick = c.id;
      err.textContent = '';
      cards.forEach((b) => b.setAttribute('aria-checked', String(b === ev.currentTarget)));
    },
  }, h('span', { class: 'gift-pet__art' }, companion(c.id, { size: 76, title: c.name })), h('span', { class: 'gift-pet__name', text: c.name })));
  const res = await openDialog({
    className: 'dlg--gift',
    title: 'Elige tu mascota de regalo',
    body: [
      h('p', { class: 'dlg__text', text: 'Por ser Premium te quedas con una mascota de edición limitada sin ganar su logro. Elige con calma: el regalo es uno solo.' }),
      h('div', { class: 'gift-pets', role: 'radiogroup', 'aria-label': 'Mascotas de edición limitada' }, cards),
      err,
    ],
    actions: [
      { label: 'Luego', value: 'later' },
      { label: 'Quedármela', value: 'ok', variant: 'btn--gold', primary: true, validate: () => { if (!pick) err.textContent = 'Toca una mascota para elegirla.'; return !!pick; } },
    ],
    onOpen: () => cards[0].focus(),
  });
  if (res === 'ok' && pick) mutate((s) => E.giftCompanion(s, pick));
}

/** Ofrece Premium cuando algo es solo Premium. Devuelve true si lo era (y se mostró la oferta). */
export function requirePremium(item) {
  if (!item || !item.premium || isPremium()) return false;
  premiumDialog();
  return true;
}

/** Al entrar, una vez al día, se ofrece Premium (nunca el primer día de uso). */
export function maybePaywall() {
  if (isPremium() || !state.profile.onboarded) return;
  const day = today();
  if (store.pref.get('paywall_day') === day || U.dateKey(new Date(state.createdAt)) === day) return;
  store.pref.set('paywall_day', day);
  setTimeout(premiumDialog, 900);
}
/** Quien acaba de crear su cuenta no ve la oferta hoy. */
export const skipPaywallToday = () => store.pref.set('paywall_day', today());

export function renderPremium() {
  const on = isPremium();
  $('#hudCrown').classList.toggle('is-active', on);
  $('#hudCrown').setAttribute('aria-label', on ? 'Eres Premium' : 'Conoce FrostPom Premium');
  $('#premiumStatus').textContent = on
    ? 'Premium activo en modo prueba (sin cobro). Tienes todos los temas, sonidos, recordatorios y duración libre.'
    : `Recordatorios, duración libre, todos los temas y sonidos, ${fmtInt(E.PREMIUM_GEMS)} gemas de regalo y una mascota de edición limitada.`;
  $('#premiumActions').replaceChildren(h('button', { type: 'button', class: `btn btn--sm ${on ? 'btn--paper' : 'btn--gold'}`, onclick: premiumDialog }, on ? 'Ver mi Premium' : '👑 Ver Premium'));
}

export function bindPremium() {
  $('#hudCrown').addEventListener('click', premiumDialog);
}
