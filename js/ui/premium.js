/*
 * FrostPom — Premium (👑). En la web funciona en MODO PRUEBA: no se cobra nada. En Microsoft Store
 * se cobra con la tienda (v3.8, billing.js) y (v4.7.0) en la app de Android con Google Play
 * (play-billing.js, con RevenueCat): ahí Premium lo decide el servidor, no este dispositivo.
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
import { $, h, fmtInt } from './dom.js';
import { toast, openDialog, dlg } from './feedback.js';
import { penguin, companion } from './companions.js';
import { pic } from './pics.js';
import { state, store, mutate, today, isPremium, rerender } from './context.js';
import { t, tr, locale } from '../i18n.js';
import * as BILL from '../billing.js';
import * as PLAY from '../play-billing.js';
import * as BOARD from '../board.js';
import { isOnline, sessionOk, connectFlow, reconnectFlow } from './cloud-ui.js';

const crown = () => pic('corona', 84);
const hero = (mood) => h('div', { class: 'premium__hero' }, h('span', { class: 'premium__crown' }, crown()), penguin(mood, { size: 96 }));

const BENEFITS = [
  ['cofre', t('Regalo de bienvenida: {n} gemas', { n: fmtInt(E.PREMIUM_GEMS) }), ''],
  ['🐻‍❄️', 'Una mascota de edición limitada', ''],
  ['⏰', 'Recordatorios de tu horario de enfoque', ''],
  ['⏱️', 'Duración del temporizador totalmente libre', ''],
  ['🎨', 'Todos los temas, sonidos y tonos', ''],
  ['🐧', 'Más animaciones adorables en el temporizador', ''],
  ['🚫', 'Sin anuncios', ''],
];

const benefits = () => h('ul', { class: 'premium__list' }, BENEFITS.map(([icon, title, sub]) => h('li', {},
  h('span', { class: 'premium__icon', 'aria-hidden': 'true' }, icon === 'cofre' ? pic('cofre', 30) : icon),
  h('span', {}, h('b', { text: title }), sub ? h('small', { text: sub }) : null))));

export async function premiumDialog() {
  // (v4.7.0) En la app de Android con cobro: Google Play
  if (PLAY.enabled()) return playDialog();
  // Mientras no haya cobro real, el botón no dice "Suscribirme" (las tiendas exigen no confundir)
  const charging = BILL.charging();
  // Con cobro real, el precio sale de Microsoft Store (en la moneda de cada persona)
  const offer = charging ? await BILL.premiumOffer() : null;
  const canBuy = !charging || !!offer;
  const price = offer ? offer.price : (config.premium && config.premium.priceLabel) || '';
  const storeUrl = (config.premium && config.premium.storeUrl) || '';
  if (isPremium()) {
    const r = await openDialog({
      className: 'dlg--premium',
      title: 'Eres Premium',
      body: [
        hero('amor'),
        h('p', { class: 'dlg__text', text: charging ? 'Tu suscripción está activa. Gracias por apoyar FrostPom.' : 'Tienes todas las funciones Premium activas en modo prueba (sin cobro).' }),
        state.premium.giftPending ? h('p', { class: 'dlg__text', text: 'Todavía no eliges tu mascota de regalo.' }) : null,
      ],
      actions: [
        charging ? { label: 'Administrar suscripción', value: 'manage' } : { label: 'Desactivar prueba', value: 'off' },
        state.premium.giftPending ? { label: [pic('cofre', 24), 'Elegir mascota'], value: 'gift', variant: 'btn--crown' } : null,
        { label: 'Genial', value: 'ok', variant: 'btn--gold', primary: true },
      ].filter(Boolean),
    });
    if (r === 'gift') return giftCompanionDialog();
    // Las suscripciones de Microsoft Store se cancelan en la cuenta de Microsoft
    if (r === 'manage') window.open('https://account.microsoft.com/services', '_blank', 'noopener');
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
      hero('saludo'),
      benefits(),
      charging
        ? h('p', { class: 'premium__price', text: price ? t('{price}. Cancela cuando quieras.', { price }) : 'Suscripción mensual. Cancela cuando quieras.' })
        : h('p', { class: 'premium__price', text: 'Gratis por ahora' }),
      h('p', { class: 'dlg__note', text: charging ? (canBuy ? 'El cobro lo hace Microsoft Store. Cancela cuando quieras desde tu cuenta de Microsoft.' : 'Para suscribirte, instala FrostPom desde Microsoft Store.') : tr('Modo prueba: no se cobra nada.') + (price ? t(' Cuando se active el cobro, costará {price}, y te avisaremos antes.', { price }) : '') }),
    ],
    actions: [
      { label: 'Ahora no', value: 'later' },
      !canBuy
        ? (storeUrl ? { label: 'Abrir Microsoft Store', value: 'store', variant: 'btn--gold', primary: true } : null)
        : { label: charging ? (price ? t('Suscribirme, {price}', { price }) : 'Suscribirme') : 'Probar Premium gratis', value: 'buy', variant: 'btn--gold', primary: true },
    ].filter(Boolean),
  });
  if (r === 'store' && storeUrl) window.open(storeUrl, '_blank', 'noopener');
  if (r === 'buy' && charging) {
    const paid = await BILL.buyPremium();
    if (!paid.ok) {
      if (paid.reason !== 'cancel') toast('No se pudo completar la compra. Si se hizo el cobro, Premium se activará solo al volver a abrir la app.', 'warn', { ms: 7000 });
      return;
    }
    const res = mutate((st) => E.setPremium(st, true));
    if (!res.events.some((e) => e.type === 'premiumGift')) toast('¡Bienvenido a Premium! Gracias por apoyar FrostPom.', 'good', { icon: pic('corona', 30) });
    return;
  }
  if (r === 'buy') {
    const res = mutate((st) => E.setPremium(st, true));
    // La primera vez llega el regalo (lo celebra celebrations.js); las siguientes, solo un aviso.
    if (!res.events.some((e) => e.type === 'premiumGift')) {
      FX.sfx.achievement();
      FX.confetti({ count: 90, colors: ['#FFC531', '#FFE680', '#ffffff', '#93c0ed'] });
      toast('¡Premium activado en modo prueba! Sin cobro.', 'good', { icon: pic('corona', 30) });
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
      h('p', { class: 'dlg__text', text: 'Elige una: el regalo es uno solo.' }),
      h('div', { class: 'gift-pets', role: 'radiogroup', 'aria-label': 'Mascotas de edición limitada' }, cards),
      err,
    ],
    actions: [
      { label: 'Luego', value: 'later' },
      { label: 'Quedármela', value: 'ok', variant: 'btn--gold', primary: true, validate: () => { if (!pick) err.textContent = tr('Toca una mascota para elegirla.'); return !!pick; } },
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
  // (v4.7.0) Con cobro en Android, nunca a quien no puede suscribirse por su edad
  if (PLAY.enabled() && playBlocker() && playBlocker().kind === 'young') return;
  const day = today();
  if (store.pref.get('paywall_day') === day || U.dateKey(new Date(state.createdAt)) === day) return;
  store.pref.set('paywall_day', day);
  setTimeout(premiumDialog, 900);
}
/** Quien acaba de crear su cuenta no ve la oferta hoy. */
export const skipPaywallToday = () => store.pref.set('paywall_day', today());

export function renderPremium() {
  const on = isPremium();
  const play = PLAY.enabled();
  const paid = play ? paidEntry() : null;
  $('#hudCrown').classList.toggle('is-active', on);
  $('#hudCrown').setAttribute('aria-label', tr(on ? 'Eres Premium' : 'Conoce FrostPom Premium'));
  let text;
  if (on && play) text = playStatusText(paid);
  else if (on) text = tr('Premium activo en modo prueba (sin cobro). Tienes todos los temas, sonidos, recordatorios y duración libre.');
  else if (play && paid && paid.status === 'on_hold') text = tr('Tu suscripción está en espera: Google Play no pudo cobrarla. Arregla tu medio de pago en Google Play y Premium vuelve solo.');
  else text = t('Recordatorios, duración libre, todos los temas y sonidos, {n} gemas de regalo y una mascota de edición limitada.', { n: fmtInt(E.PREMIUM_GEMS) });
  $('#premiumStatus').textContent = text;
  $('#premiumStatus').classList.toggle('is-warn', !!(play && paid && (paid.status === 'grace' || paid.status === 'on_hold')));
  $('#premiumActions').replaceChildren(h('button', { type: 'button', class: `btn btn--sm ${on ? 'btn--paper' : 'btn--gold'}`, onclick: premiumDialog }, on ? null : pic('corona', 20), on ? 'Ver mi Premium' : 'Ver Premium'));
}

export function bindPremium() {
  $('#hudCrown').addEventListener('click', premiumDialog);
}

/**
 * Con cobro real: al abrir la app se pregunta a Microsoft Store si la suscripción sigue activa
 * (se renovó, se canceló o se compró en otro equipo con la misma cuenta) y Premium se ajusta solo.
 */
export async function syncStorePremium() {
  if (!BILL.charging()) return;
  const has = await BILL.storeHasPremium();
  if (has === null) return; // fuera de la tienda no se puede saber: no se cambia nada
  if (has && !isPremium()) mutate((st) => E.setPremium(st, true));
  if (!has && state.premium.active) mutate((st) => E.setPremium(st, false));
}

// =====================================================================
// (v4.7.0) Premium pagado en la app de Android (Google Play, con RevenueCat)
// Lógica y servidor: js/play-billing.js. Decisiones del autor: docs/GOOGLE-PLAY-BILLING.md
// =====================================================================
/** La cuenta en línea de este equipo (la única que puede suscribirse), o ''. */
export function playUid() {
  if (!state.account || state.account.online !== true || !BOARD.hasAccountSession()) return '';
  return BOARD.load().uid || '';
}
/** Lo que este aparato sabe de la suscripción de la cuenta de ahora (o null). */
function paidEntry() {
  const e = PLAY.cached();
  const uid = playUid();
  return e && uid && e.uid === uid ? e : null;
}
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return String(iso); }
};

/** Lo que dice tu suscripción, en palabras (para el diálogo y Ajustes). */
export function playStatusText(e) {
  if (!e) return tr('Tienes Premium. ¡Gracias por apoyar FrostPom!');
  const date = e.expiresAt ? fmtDate(e.expiresAt) : '';
  let text;
  if (e.status === 'grace') text = tr('Google Play no pudo cobrar tu suscripción. Revisa tu medio de pago en Google Play para no perder Premium.');
  else if (!e.expiresAt) text = tr('Tienes Premium de por vida. ¡Gracias por apoyar FrostPom!');
  else if (e.status === 'trial') {
    text = e.willRenew
      ? t('Estás en tu prueba gratis hasta el {date}. Después, Google Play empieza a cobrar tu suscripción, salvo que la canceles.', { date })
      : t('Cancelaste la renovación: tu prueba gratis termina el {date} y no se cobrará nada.', { date });
  } else if (e.status === 'cancelled' || !e.willRenew) text = t('Cancelaste la renovación: sigues siendo Premium hasta el {date}.', { date });
  else text = t('Tu suscripción se renueva el {date}. Gracias por apoyar FrostPom.', { date });
  return e.sandbox ? `${text} ${tr('(Compra de prueba: no se cobra de verdad.)')}` : text;
}

/** Por qué esta cuenta todavía no puede suscribirse (o null si puede). */
function playBlocker() {
  const acc = state.account;
  if (acc && acc.birth && !BOARD.oldEnough(acc.birth)) return { kind: 'young', text: 'Premium todavía no está disponible para cuentas de menores de 13 años.' };
  if (!acc) return { kind: 'noaccount', text: 'Para suscribirte necesitas una cuenta de FrostPom conectada en línea (con tu correo). Créala en Ajustes → Tu cuenta.' };
  if (!isOnline()) return { kind: 'connect', text: 'Para suscribirte, conecta tu cuenta en línea con tu correo: así Premium te acompaña aunque cambies de celular.' };
  if (!playUid() || !sessionOk()) return { kind: 'relink', text: 'Tu sesión en línea se cerró. Vuelve a entrar para suscribirte.' };
  return null;
}

/** El mensaje cuando una compra no se completó ('' = la persona la cerró: no hace falta decir nada). */
function buyFailText(reason) {
  switch (reason) {
    case 'cancel': return '';
    case 'pending': return tr('Tu pago está pendiente. Premium se activa solo cuando Google Play lo confirme.');
    case 'offline': return tr('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    case 'notallowed': return tr('Este celular no permite compras (puede ser un control parental de Google). Pide ayuda a quien administra la cuenta.');
    case 'unavailable': return tr('Google Play no tiene la suscripción disponible ahora. Inténtalo más tarde.');
    case 'none': return tr('No encontramos una suscripción de FrostPom en tu cuenta de Google Play.');
    default: return tr('No se pudo completar la compra. Si se hizo el cobro, Premium se activará solo al volver a abrir la app.');
  }
}

const trialName = (tri) => (tri.days ? t('{n} días gratis', { n: tri.days }) : tri.months === 1 ? tr('1 mes gratis') : t('{n} meses gratis', { n: tri.months }));
const perName = (plan) => (plan.id === 'annual' ? tr('al año') : tr('al mes'));
/** Lo que se dice antes de pagar (Google Play pide decirlo claro: precio, renovación, cómo cancelar). */
function termsText(plan) {
  // (v4.9.0) De por vida: un solo pago, sin renovación
  if (plan.id === 'lifetime') return `${t('{price}, un solo pago: Premium para siempre en tu cuenta de FrostPom, sin renovaciones.', { price: plan.priceString })} ${tr('El cobro lo hace Google Play.')}`;
  const price = `${plan.priceString} ${perName(plan)}`;
  const base = plan.trial
    ? t('{trial}. Después, {price}, con renovación automática. Cancela cuando quieras en Google Play → Suscripciones; si cancelas antes de que termine la prueba, no se cobra nada.', { trial: trialName(plan.trial), price })
    : t('{price}, con renovación automática. Cancela cuando quieras en Google Play → Suscripciones.', { price });
  return `${base} ${tr('El cobro lo hace Google Play.')}`;
}
function buyLabel(plan) {
  if (plan.id === 'lifetime') return t('Comprar de por vida, {price}', { price: plan.priceString });
  if (plan.trial && plan.trial.days) return t('Empezar {n} días gratis', { n: plan.trial.days });
  if (plan.trial) return tr('Empezar mi prueba gratis');
  return t('Suscribirme, {price}', { price: plan.priceString });
}

/** Abre la página de Google Play (en la app de Android abre la Play Store). */
function openPlay(url) { window.open(url, '_blank', 'noopener'); }

/**
 * La ventana de Premium en la app de Android con cobro.
 * (v4.9.0) only = 'lifetime': solo el plan de por vida (para pasarse desde una suscripción).
 */
async function playDialog({ only = '' } = {}) {
  if (isPremium() && !only) return playManageDialog(paidEntry());
  const block = playBlocker();
  if (block) return playBlockedDialog(block);
  const uid = playUid();
  // Quizá ya te suscribiste en otro aparato con esta cuenta: se pregunta primero (rápido)
  if (!paidEntry()) {
    await Promise.race([PLAY.refresh(uid), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
    if (isPremium()) { await afterPaid({ quiet: true }); return playManageDialog(paidEntry()); }
  }
  const slow = setTimeout(() => toast('Consultando el precio en Google Play…', 'info', { ms: 2500 }), 700);
  const o = await PLAY.offer(uid);
  clearTimeout(slow);
  if (!o.ok) {
    const again = await openDialog({
      className: 'dlg--premium',
      title: 'FrostPom Premium',
      body: [hero('saludo'), benefits(), h('p', { class: 'dlg__note', text: o.reason === 'offline'
        ? 'Sin conexión: no pudimos traer el precio de Google Play. Revisa tu internet e inténtalo de nuevo.'
        : 'No pudimos traer el precio de Google Play. Inténtalo de nuevo en un rato.' })],
      actions: [{ label: 'Ahora no', value: 'later' }, { label: 'Reintentar', value: 'retry', variant: 'btn--gold', primary: true }],
    });
    if (again === 'retry') return playDialog();
    return;
  }
  const plans = [o.annual && { id: 'annual', ...o.annual }, o.monthly && { id: 'monthly', ...o.monthly }, o.lifetime && { id: 'lifetime', ...o.lifetime }]
    .filter(Boolean).filter((p) => !only || p.id === only);
  if (!plans.length) { toast('Google Play no tiene ese plan disponible ahora. Inténtalo más tarde.', 'info'); return; }
  let pick = plans[0];
  let result = null;
  const terms = h('p', { class: 'dlg__note premium__terms', id: 'playTerms' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const paint = () => {
    terms.textContent = termsText(pick);
    const btn = dlg.querySelector('[data-primary="true"]');
    if (btn) btn.textContent = buyLabel(pick);
  };
  const cards = plans.map((p) => h('button', {
    type: 'button', role: 'radio', class: 'plan', 'data-plan': p.id, 'aria-checked': String(p === pick),
    onclick: () => {
      pick = p;
      err.textContent = '';
      cards.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.plan === p.id)));
      paint();
    },
  },
  h('span', { class: 'plan__name', text: p.id === 'annual' ? 'Anual' : p.id === 'lifetime' ? 'De por vida' : 'Mensual' }),
  h('span', { class: 'plan__price', text: p.id === 'annual' ? t('{price} al año', { price: p.priceString }) : p.id === 'lifetime' ? t('{price}, un solo pago', { price: p.priceString }) : t('{price} al mes', { price: p.priceString }) }),
  p.id === 'lifetime' ? h('span', { class: 'plan__badge plan__badge--forever', text: 'Para siempre' }) : null,
  p.id === 'annual' && p.perMonth && plans.length > 1 ? h('small', { class: 'plan__sub', text: t('Equivale a {price} al mes', { price: p.perMonth }) }) : null,
  p.id === 'annual' && o.savings ? h('span', { class: 'plan__badge', text: t('Ahorra {n} %', { n: o.savings }) }) : null));
  const restoreBtn = h('button', {
    type: 'button', class: 'link-btn', id: 'playRestore',
    onclick: async () => {
      if (restoreBtn.disabled) return;
      restoreBtn.disabled = true;
      err.textContent = tr('Buscando tus compras en Google Play…');
      const res = await PLAY.restore(uid);
      restoreBtn.disabled = false;
      if (res.ok) { result = res; err.textContent = ''; dlg.close('restored'); return; }
      err.textContent = buyFailText(res.reason === 'cancel' ? 'none' : res.reason);
    },
  }, 'Restaurar compras');
  const held = paidEntry() && paidEntry().status === 'on_hold';
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'FrostPom Premium',
    body: [
      hero('saludo'),
      benefits(),
      held ? h('p', { class: 'dlg__text premium__warn', text: 'Tu suscripción está en espera: Google Play no pudo cobrarla. Arregla tu medio de pago en Google Play y Premium vuelve solo.' }) : null,
      h('div', { class: 'plans', role: 'radiogroup', 'aria-label': 'Planes de Premium' }, cards),
      terms,
      err,
      h('p', { class: 'premium__links' }, restoreBtn),
    ],
    actions: [
      { label: 'Ahora no', value: 'later' },
      held ? { label: 'Abrir Google Play', value: 'manage' } : null,
      {
        label: buyLabel(pick), value: 'buy', variant: 'btn--gold', primary: true,
        validate: async () => {
          err.textContent = tr('Abriendo Google Play…');
          const res = await PLAY.buy(uid, pick.pkg, pick.product); // (v4.9.1) o el producto directo de Google
          if (res.ok) { result = res; err.textContent = ''; return true; }
          err.textContent = buyFailText(res.reason);
          return false;
        },
      },
    ].filter(Boolean),
    onOpen: paint,
  });
  if (r === 'manage') openPlay(PLAY.manageLink(paidEntry()));
  if ((r === 'buy' || r === 'restored') && result) await afterPaid({ restored: r === 'restored', upgraded: !!only });
}

/** Ya pagó (o recuperó su compra): el regalo la primera vez, y el servidor revisa la compra. */
async function afterPaid({ restored = false, quiet = false, upgraded = false } = {}) {
  const uid = playUid();
  // (v4.9.0) Se pasó de una suscripción a de por vida: la suscripción NO se cancela sola
  if (upgraded) {
    toast('¡Ya eres Premium de por vida! Cancela tu suscripción en Google Play → Suscripciones para que no se cobre más.', 'good', { icon: pic('corona', 30), ms: 9000 });
    if (uid) PLAY.serverSync(uid).then(() => { rerender(); }).catch(() => {});
    return;
  }
  const gift = mutate((st) => E.premiumGift(st)); // la primera vez: 1000 gemas y la mascota (celebrations.js)
  if (!gift.ok && !quiet) {
    FX.sfx.achievement();
    FX.confetti({ count: 90, colors: ['#FFC531', '#FFE680', '#ffffff', '#93c0ed'] });
    toast(restored ? '¡Listo! Recuperamos tu Premium.' : '¡Bienvenido a Premium! Gracias por apoyar FrostPom.', 'good', { icon: pic('corona', 30) });
  }
  // El servidor revisa la compra con RevenueCat (para tus otros aparatos y para que no dependa de este)
  if (uid) PLAY.serverSync(uid).then(() => { rerender(); }).catch(() => {});
}

/** Ya eres Premium (pagado): estado de la suscripción y "Administrar suscripción". */
async function playManageDialog(e) {
  const warn = !!(e && e.status === 'grace');
  const forever = PLAY.isLifetime(e);
  // (v4.9.0) Con una suscripción, se ofrece pasarse a de por vida (y con de por vida no hay nada que administrar)
  const canUpgrade = !!(e && e.premium && !forever);
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'Eres Premium',
    body: [
      hero('amor'),
      h('p', { class: `dlg__text${warn ? ' premium__warn' : ''}`, text: playStatusText(e) }),
      state.premium.giftPending ? h('p', { class: 'dlg__text', text: 'Todavía no eliges tu mascota de regalo.' }) : null,
    ],
    actions: [
      forever ? null : { label: 'Administrar suscripción', value: 'manage' },
      canUpgrade ? { label: 'Pasarme a de por vida', value: 'lifetime' } : null,
      state.premium.giftPending ? { label: [pic('cofre', 24), 'Elegir mascota'], value: 'gift', variant: 'btn--crown' } : null,
      { label: 'Genial', value: 'ok', variant: 'btn--gold', primary: true },
    ].filter(Boolean),
  });
  if (r === 'gift') return giftCompanionDialog();
  if (r === 'manage') openPlay(PLAY.manageLink(e));
  if (r === 'lifetime') return playDialog({ only: 'lifetime' });
}

/** Todavía no se puede suscribir (sin cuenta en línea, sesión cerrada o menor de 13). */
async function playBlockedDialog(block) {
  const act = block.kind === 'connect' ? { label: 'Conectar mi cuenta', value: 'connect', variant: 'btn--gold', primary: true }
    : block.kind === 'relink' ? { label: 'Volver a entrar', value: 'relink', variant: 'btn--gold', primary: true } : null;
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'FrostPom Premium',
    body: [hero('saludo'), benefits(), h('p', { class: 'dlg__note', id: 'playBlocked', text: block.text })],
    actions: [act ? { label: 'Ahora no', value: 'later' } : { label: 'Entendido', value: 'ok', variant: 'btn--gold', primary: true }, act].filter(Boolean),
  });
  if (r === 'connect') {
    await connectFlow();
    if (isOnline() && playUid()) return playDialog();
  }
  if (r === 'relink') {
    await reconnectFlow();
    if (playUid() && sessionOk()) return playDialog();
  }
}

/**
 * Al abrir la app (antes de pintar): en Android con cobro, Premium lo decide lo que dijo el servidor
 * (la copia de este aparato), no premium.active (el de la prueba gratis, que viaja con el progreso).
 */
export function initPlayPremium() {
  if (!PLAY.enabled()) return;
  C.setPremiumGate(() => PLAY.activeNow(PLAY.cached(), playUid()));
  // Mientras la app está abierta, RevenueCat avisa si algo cambió (por ejemplo, se renovó o se
  // reembolsó). No se le cree a ciegas (puede ser una copia vieja): se le pide al servidor que revise.
  PLAY.onCustomerInfo((info) => {
    const uid = playUid();
    if (!uid) return;
    const dev = PLAY.fromCustomerInfo(info, PLAY.entitlementId());
    const c = PLAY.cached();
    const known = c && c.uid === uid ? c : null;
    if (known && known.premium === dev.premium && known.status === dev.status) return;
    const before = isPremium();
    // Lo que se creyó al comprar aquí ya no vale (por ejemplo, se reembolsó): se borra esa confianza
    if (!dev.premium && known && known.source === 'device') PLAY.keepDevice(uid, info);
    PLAY.serverSync(uid).then(() => checkChange(before)).catch(() => {});
  });
  document.addEventListener('frostpom:premium', () => { refreshPlayPremium().catch(() => {}); });
}

/** Después de preguntar al servidor: avisos si Premium empezó, terminó o tiene un problema de pago. */
async function checkChange(before) {
  const now = isPremium();
  const e = paidEntry();
  if (now && !before) {
    await afterPaid({ quiet: true });
    toast('Tu Premium está activo. ¡Gracias por apoyar FrostPom!', 'good', { icon: pic('corona', 30) });
  } else if (!now && before) {
    rerender();
    if (e && e.status === 'on_hold') toast('Tu suscripción está en espera: Google Play no pudo cobrarla. Arregla tu medio de pago en Google Play y Premium vuelve solo.', 'warn', { ms: 9000 });
    else toast('Tu Premium terminó. Todo lo que ganaste sigue siendo tuyo (gemas, mascotas y temas comprados).', 'info', { ms: 8000 });
  } else rerender();
  // Falló el pago (período de gracia): se avisa una vez al día
  if (e && e.status === 'grace' && store.pref.get('play_grace_day') !== today()) {
    store.pref.set('play_grace_day', today());
    toast('Google Play no pudo cobrar tu suscripción. Revisa tu medio de pago en Google Play para no perder Premium.', 'warn', { ms: 9000 });
  }
}

/** Pregunta al servidor por la suscripción de esta cuenta (y, si hace falta, que revise con RevenueCat). */
export async function refreshPlayPremium() {
  if (!PLAY.enabled()) return;
  const uid = playUid();
  if (!uid) { rerender(); return; }
  const before = isPremium();
  const r = await PLAY.refresh(uid);
  if (r.recheck) await PLAY.serverSync(uid);
  await checkChange(before);
}

/**
 * (v4.7.0) Al abrir la app con el cobro encendido: si usabas la prueba gratis de Premium (de antes),
 * se avisa una vez que ahora Premium es una suscripción. Después se pregunta al servidor.
 */
export async function bootPlayPremium() {
  if (!PLAY.enabled()) return;
  await refreshPlayPremium().catch(() => {});
  if (state.premium.active && !isPremium() && !store.pref.get('play_demo_end')) demoEnded(); // sin esperar
}

async function demoEnded() {
  store.pref.set('play_demo_end', '1');
  const r = await openDialog({
    className: 'dlg--premium',
    title: 'La prueba gratis de Premium terminó',
    body: [
      hero('saludo'),
      h('p', { class: 'dlg__text', text: 'Ahora Premium es una suscripción de Google Play. Todo lo que ganaste sigue siendo tuyo: tus gemas, tu mascota de regalo y lo que compraste con gemas.' }),
    ],
    actions: [{ label: 'Entendido', value: 'ok' }, { label: 'Ver Premium', value: 'see', variant: 'btn--gold', primary: true }],
  });
  if (r === 'see') premiumDialog();
}

/** (v4.9.0) ¿Tiene Premium de por vida? (para avisar antes de borrar la cuenta) */
export function hasLifetime() {
  return PLAY.enabled() && PLAY.isLifetime(paidEntry());
}

/** ¿Tiene una suscripción de Google Play que se renueva? (para avisar antes de borrar la cuenta) */
export function hasPlaySubscription() {
  const e = PLAY.enabled() ? paidEntry() : null;
  return !!(e && (e.willRenew || e.status === 'grace' || e.status === 'on_hold'));
}
