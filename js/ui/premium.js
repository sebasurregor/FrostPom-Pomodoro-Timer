/*
 * StudyTimer — Premium (👑). Hoy funciona en MODO PRUEBA: no se cobra nada. Cuando la app
 * esté en las tiendas, la suscripción se compra con App Store / Google Play y el estado
 * Premium viene de la compra validada (no de este dispositivo).
 *
 * Qué desbloquea Premium lo decide catalog.effectivePrefs(); aquí solo está la oferta.
 */
import * as U from '../util.js';
import * as E from '../engine.js';
import { config } from '../config.js';
import * as FX from './effects.js';
import { $, h, svg } from './dom.js';
import { toast, openDialog } from './feedback.js';
import { penguin } from './companions.js';
import { state, store, mutate, today, isPremium } from './context.js';

const crown = () => svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  svg('path', { class: 'i-crown', d: 'M3 8.5l4.2 3.6L12 5l4.8 7.1L21 8.5l-2 10H5z' }),
  svg('circle', { class: 'i-crown-gem', cx: 12, cy: 15, r: 1.6 }));

const BENEFITS = [
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
      ],
      actions: [{ label: 'Desactivar prueba', value: 'off' }, { label: 'Genial', value: 'ok', variant: 'btn--gold', primary: true }],
    });
    if (r === 'off') {
      mutate((st) => E.setPremium(st, false));
      toast('Premium desactivado. Tus temas y sonidos gratis siguen igual.');
    }
    return;
  }
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'StudyTimer Premium',
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
    mutate((st) => E.setPremium(st, true));
    FX.sfx.achievement();
    FX.confetti({ count: 90, colors: ['#FFC531', '#FFE680', '#ffffff', '#93c0ed'] });
    toast('¡Premium activado en modo prueba! 👑 Sin cobro.', 'good', { icon: '👑' });
  }
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
  $('#hudCrown').setAttribute('aria-label', on ? 'Eres Premium' : 'Conoce StudyTimer Premium');
  $('#premiumStatus').textContent = on
    ? 'Premium activo en modo prueba (sin cobro). Tienes todos los temas, sonidos, recordatorios y duración libre.'
    : 'Recordatorios, duración libre, todos los temas y sonidos, y más animaciones del temporizador.';
  $('#premiumActions').replaceChildren(h('button', { type: 'button', class: `btn btn--sm ${on ? 'btn--paper' : 'btn--gold'}`, onclick: premiumDialog }, on ? 'Ver mi Premium' : '👑 Ver Premium'));
}

export function bindPremium() {
  $('#hudCrown').addEventListener('click', premiumDialog);
}
