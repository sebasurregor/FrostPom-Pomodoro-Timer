/*
 * FrostPom — (v4.8.0) "¿Necesitas más gemas?": la ventana que sale al tocar tus gemas (arriba, en
 * la barra, o en la tienda de comida). Idea del autor: la gema grande con el brillo de cuando
 * desbloqueas un compañero detrás, y tres caminos:
 *
 *  1. Ver un anuncio (+10 gemas, hasta 5 al día): solo en la app de Android, 13+ y con los
 *     anuncios encendidos (js/ads.js). Si no se puede, no aparece.
 *  2. Estudiar: te lleva a Enfocar (cada pomodoro, misión y logro da gemas).
 *  3. Comprar gemas: 4 paquetes de Google Play (js/gem-shop.js y play-billing.js). Solo en la app
 *     de Android con el cobro encendido y una cuenta en línea; nunca para menores de 13.
 *
 * Las compras: cada una se suma UNA sola vez (su número de Google queda en progress.gemOrders).
 * Si la app se cierra justo después de pagar o el pago queda pendiente, las gemas llegan solas
 * después (reconcileGems, al abrir la app o cuando RevenueCat avisa).
 */
import * as E from '../engine.js';
import * as GS from '../gem-shop.js';
import * as PLAY from '../play-billing.js';
import * as ADS from '../ads.js';
import * as NATIVE from '../native.js';
import * as BOARD from '../board.js';
import * as FX from './effects.js';
import { $, h, svg, fmtInt } from './dom.js';
import { toast, openDialog, focusPrimary, dlg } from './feedback.js';
import { pic } from './pics.js';
import { state, store, mutate } from './context.js';
import { t, tr } from '../i18n.js';
import { playUid } from './premium.js';
import { isOnline, sessionOk, connectFlow, reconnectFlow } from './cloud-ui.js';
import { watchGemAd } from './ads-ui.js';

const PENDING_KEY = 'gem_pending'; // una compra empezada en este aparato (para sumar sus gemas después)
const PENDING_DAYS = 14;

// ---------------------------------------------------------------------
// La gema grande (dibujada, para que se vea nítida en cualquier tamaño; igual a gema.png)
// ---------------------------------------------------------------------
export function gemArt(size = 150) {
  const poly = (points, fill) => svg('polygon', { points, fill });
  return svg('svg', { class: 'gemart', width: size, height: size, viewBox: '0 0 72 72', 'aria-hidden': 'true' },
    poly('21,1 51,1 71,21 71,51 51,71 21,71 1,51 1,21', '#68E5FD'),
    poly('1,21 21,1 51,1 71,21 48,24 24,24', '#A0EFFE'),
    poly('1,51 21,71 51,71 71,51 48,48 24,48', '#A0EFFE'),
    poly('24,24 48,24 48,48 24,48', '#37D0EE'),
    poly('71,44 71,51 51,71 42,71 46,66 53,66 66,53 66,46', '#91D8E5'),
    poly('71,49 71,51 51,71 47,71', '#59C2D6'),
    svg('path', { d: 'M8 23 L22 8', stroke: '#E6FBFF', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }),
    svg('path', { d: 'M27 6 L31 6', stroke: '#E6FBFF', 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none' }));
}

/** La gema con el brillo que gira detrás (como cuando desbloqueas un compañero). */
function gemHero(size = 150, kicker = '', title = '', line = '') {
  return h('div', { class: 'rankup gemhero', vars: { '--rank-a': '#7FE6FF', '--rank-b': '#37D0EE', '--rank-glow': '#7FE6FF' } },
    h('div', { class: 'rankup__rays', 'aria-hidden': 'true' }),
    h('div', { class: 'rankup__emblem gemhero__stage' },
      gemArt(size),
      ['a', 'b', 'c'].map((k) => h('span', { class: `gemhero__spark gemhero__spark--${k}`, 'aria-hidden': 'true' }))),
    kicker ? h('p', { class: 'rankup__kicker', text: kicker }) : null,
    title ? h('h2', { class: 'rankup__name rankup__name--sm gemhero__title', id: 'dlgTitle', text: title }) : null,
    line ? h('p', { class: 'gemhero__line', id: 'gemsBalance', text: line }) : null);
}

const balanceText = () => t('Tienes {n} gemas', { n: fmtInt(state.progress.gems) });

// ---------------------------------------------------------------------
// ¿Se pueden comprar gemas aquí?
// ---------------------------------------------------------------------
/** 'ok' (se puede), 'android' (solo en la app de Android), 'soon' (sin cobro todavía) o 'young' (menor de 13). */
export function buyState() {
  const acc = state.account;
  if (acc && acc.birth && !BOARD.oldEnough(acc.birth)) return 'young';
  if (!NATIVE.isAndroid()) return 'android';
  if (!PLAY.enabled()) return 'soon';
  return 'ok';
}

/** Por qué esta cuenta todavía no puede comprar (o null si puede). */
function blocker() {
  if (!state.account) return { kind: 'noaccount', text: 'Para comprar gemas necesitas una cuenta de FrostPom conectada en línea (con tu correo). Créala en Ajustes → Tu cuenta.' };
  if (!isOnline()) return { kind: 'connect', text: 'Para comprar gemas, conecta tu cuenta en línea con tu correo: así tus gemas te acompañan aunque cambies de celular.' };
  if (!playUid() || !sessionOk()) return { kind: 'relink', text: 'Tu sesión en línea se cerró. Vuelve a entrar para comprar gemas.' };
  return null;
}

// ---------------------------------------------------------------------
// La ventana principal
// ---------------------------------------------------------------------
function option({ id, icon, title, sub, badge, disabled = false, onClick }) {
  return h('button', {
    type: 'button',
    class: `gemopt gemopt--${id}`,
    id: `gemOpt-${id}`,
    disabled: disabled || null,
    onclick: onClick,
  },
  h('span', { class: 'gemopt__icon', 'aria-hidden': 'true' }, icon),
  h('span', { class: 'gemopt__text' }, h('b', { text: title }), h('small', { class: 'gemopt__sub', text: sub })),
  badge ? h('span', { class: 'gemopt__badge', 'aria-hidden': 'true' }, badge) : null);
}

function adSub() {
  const left = ADS.gemAdsLeft();
  if (left <= 0) return tr('Vuelve mañana por más');
  return left === 1 ? tr('Queda 1 hoy') : t('Quedan {n} hoy', { n: left });
}

/** "¿Necesitas más gemas?" */
export async function gemsDialog() {
  FX.sfx.claim();
  const opts = [];
  if (ADS.ready()) {
    ADS.warmRewarded();
    opts.push(option({
      id: 'ad',
      icon: '🎬',
      title: t('Ver un anuncio: +{n} gemas', { n: ADS.gemsPerAd() }),
      sub: adSub(),
      badge: h('span', {}, `+${ADS.gemsPerAd()}`, pic('gema', 16)),
      disabled: ADS.gemAdsLeft() <= 0,
      onClick: async (ev) => {
        const btn = ev.currentTarget;
        await watchGemAd(btn);
        // La ventana sigue abierta: se ponen al día las gemas y los anuncios que quedan
        const bal = $('#gemsBalance');
        if (bal) bal.textContent = balanceText();
        const sub = btn.querySelector('.gemopt__sub');
        if (sub) sub.textContent = adSub();
        btn.disabled = ADS.gemAdsLeft() <= 0;
      },
    }));
  }
  opts.push(option({
    id: 'study',
    icon: pic('reloj', 30),
    title: 'Estudiar un pomodoro',
    sub: 'Cada pomodoro, misión y logro te da gemas.',
    badge: '→',
    onClick: () => dlg.close('study'),
  }));
  const bs = buyState();
  if (bs !== 'young') {
    opts.push(option({
      id: 'buy',
      icon: pic('cofre', 34),
      title: 'Comprar gemas',
      sub: bs === 'ok' ? 'Paquetes pequeños y grandes, con Google Play.' : bs === 'android' ? 'Solo en la app de Android.' : 'Muy pronto en la app de Android.',
      badge: bs === 'ok' ? '→' : null,
      disabled: bs !== 'ok',
      onClick: () => dlg.close('buy'),
    }));
  }
  const r = await openDialog({
    className: 'dlg--rankup dlg--gems',
    body: [
      gemHero(150, '', '¿Necesitas más gemas?', balanceText()),
      h('div', { class: 'gemopts', role: 'list' }, opts),
    ],
    actions: [{ label: 'Cerrar', value: 'close' }],
    onOpen: () => { const first = dlg.querySelector('.gemopt:not([disabled])'); if (first) first.focus(); },
  });
  if (r === 'study') return goStudy();
  if (r === 'buy') return buyFlow();
  return undefined;
}

function goStudy() {
  if (!location.hash.includes('enfocar')) location.hash = '#/enfocar';
  const btn = $('#mainBtn');
  if (btn) {
    btn.classList.remove('is-nudge');
    void btn.offsetWidth;
    btn.classList.add('is-nudge');
    setTimeout(() => btn.classList.remove('is-nudge'), 2600);
  }
  toast('Cada pomodoro completo, misión y logro te da gemas. ¡A estudiar!', 'info', { icon: pic('gema', 26), ms: 4200 });
}

// ---------------------------------------------------------------------
// Comprar
// ---------------------------------------------------------------------
async function buyFlow() {
  const block = blocker();
  if (block) return blockedDialog(block);
  return packsDialog();
}

async function blockedDialog(block) {
  const act = block.kind === 'connect' ? { label: 'Conectar mi cuenta', value: 'connect', variant: 'btn--gold', primary: true }
    : block.kind === 'relink' ? { label: 'Volver a entrar', value: 'relink', variant: 'btn--gold', primary: true } : null;
  const r = await openDialog({
    className: 'dlg--rankup dlg--gems',
    body: [gemHero(110, '', 'Comprar gemas'), h('p', { class: 'gemhero__note', id: 'gemsBlocked', text: block.text })],
    actions: [act ? { label: 'Ahora no', value: 'later' } : { label: 'Entendido', value: 'ok', variant: 'btn--gold', primary: true }, act].filter(Boolean),
    onOpen: focusPrimary,
  });
  if (r === 'connect') {
    await connectFlow();
    if (isOnline() && playUid()) return packsDialog();
  }
  if (r === 'relink') {
    await reconnectFlow();
    if (playUid() && sessionOk()) return packsDialog();
  }
  return undefined;
}

/** El mensaje cuando una compra no se completó ('' = la persona la cerró). */
function buyFailText(reason) {
  switch (reason) {
    case 'cancel': return '';
    case 'pending': return tr('Tu pago está pendiente. Las gemas llegan solas cuando Google Play lo confirme.');
    case 'offline': return tr('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    case 'notallowed': return tr('Este celular no permite compras (puede ser un control parental de Google). Pide ayuda a quien administra la cuenta.');
    case 'unavailable': return tr('Google Play no tiene ese paquete disponible ahora. Inténtalo más tarde.');
    default: return tr('No se pudo completar la compra. Si se hizo el cobro, las gemas llegarán solas al volver a abrir la app.');
  }
}

/** Los paquetes con su precio de Google, del más pequeño al más grande. */
async function packsDialog() {
  const uid = playUid();
  const list = GS.packs();
  const slow = setTimeout(() => toast('Consultando los precios en Google Play…', 'info', { ms: 2500 }), 700);
  const res = await PLAY.storeProducts(uid, list.map((p) => p.id));
  clearTimeout(slow);
  const offers = res.ok
    ? list.map((pack) => ({ pack, product: res.products.find((p) => p && GS.baseId(p.identifier) === pack.id) })).filter((o) => o.product)
    : [];
  if (!offers.length) {
    console.info('[FrostPom] gemas: Google Play no devolvió los paquetes:', res.ok ? 'ninguno activo' : res.reason);
    const again = await openDialog({
      className: 'dlg--rankup dlg--gems',
      body: [gemHero(110, '', 'Comprar gemas'), h('p', { class: 'gemhero__note', text: res.reason === 'offline'
        ? 'Sin conexión: no pudimos traer los paquetes de Google Play. Revisa tu internet e inténtalo de nuevo.'
        : 'No pudimos traer los paquetes de Google Play. Inténtalo de nuevo en un rato.' })],
      actions: [{ label: 'Ahora no', value: 'later' }, { label: 'Reintentar', value: 'retry', variant: 'btn--gold', primary: true }],
      onOpen: focusPrimary,
    });
    if (again === 'retry') return packsDialog();
    return undefined;
  }
  // "Mejor precio": el que da más gemas por cada peso (con los precios de Google de verdad)
  const rate = (o) => (Number(o.product.price) > 0 ? o.pack.gems / Number(o.product.price) : 0);
  const best = offers.length > 2 ? offers.reduce((a, b) => (rate(b) > rate(a) ? b : a)) : null;
  const sizes = [30, 38, 46, 54, 60];
  const cards = offers.map((o, i) => h('button', {
    type: 'button',
    class: `gempack${o === best ? ' is-best' : ''}`,
    id: `gemPack-${o.pack.id}`,
    'aria-label': t('{n} gemas por {price}', { n: fmtInt(o.pack.gems), price: o.product.priceString || '' }),
    onclick: () => dlg.close(`pack:${o.pack.id}`),
  },
  o === best ? h('span', { class: 'gempack__tag', text: 'Mejor precio' }) : null,
  h('span', { class: 'gempack__art', 'aria-hidden': 'true' }, gemArt(sizes[Math.min(i, sizes.length - 1)])),
  h('span', { class: 'gempack__text' },
    h('b', { class: 'gempack__n', text: t('{n} gemas', { n: fmtInt(o.pack.gems) }) }),
    o.pack.bonus ? h('small', { class: 'gempack__bonus', text: t('+{n} de regalo', { n: fmtInt(o.pack.bonus) }) }) : null),
  h('span', { class: 'gempack__price', text: o.product.priceString || '' })));
  const r = await openDialog({
    className: 'dlg--rankup dlg--gems',
    back: 'back',
    body: [
      gemHero(96, '', 'Paquetes de gemas', balanceText()),
      h('div', { class: 'gempacks' }, cards),
      h('p', { class: 'gemhero__note', text: 'El cobro lo hace Google Play. Las gemas se suman al instante y viajan con tu cuenta.' }),
    ],
    actions: [{ label: 'Cerrar', value: 'close' }],
    onOpen: () => { const first = dlg.querySelector('.gempack'); if (first) first.focus(); },
  });
  if (r === 'back') return gemsDialog();
  if (typeof r === 'string' && r.startsWith('pack:')) {
    const o = offers.find((x) => x.pack.id === r.slice(5));
    if (o) return buyPack(uid, o.pack, o.product);
  }
  return undefined;
}

/** Compra un paquete y suma sus gemas (una sola vez). */
async function buyPack(uid, pack, product) {
  store.pref.set(PENDING_KEY, String(Date.now()));
  const r = await PLAY.buyProduct(uid, product);
  if (!r.ok) {
    console.info('[FrostPom] gemas: la compra no terminó:', r.reason);
    const text = buyFailText(r.reason);
    if (r.reason === 'cancel') store.pref.remove(PENDING_KEY);
    if (text) toast(text, r.reason === 'pending' ? 'info' : 'warn', { ms: 7000 });
    return;
  }
  const txs = [...(r.transaction ? [r.transaction] : []), ...GS.nonSubs(r.customerInfo)];
  const gems = credit(GS.ordersToCredit(txs, state.progress.gemOrders));
  store.pref.remove(PENDING_KEY);
  if (gems > 0) await thanks(gems);
  else toast(tr('¡Gracias por tu compra! Tus gemas llegarán en un momento.'), 'good', { icon: pic('gema', 26), ms: 6000 });
}

function credit(orders) {
  if (!orders.length) return 0;
  const res = mutate((s) => E.creditGemOrders(s, orders));
  return res && res.ok ? res.gems : 0;
}

async function thanks(gems) {
  FX.sfx.achievement();
  FX.buzz([30, 40, 60]);
  setTimeout(() => FX.confetti({ count: 90, colors: ['#7FE6FF', '#37D0EE', '#ffffff', '#FFC531'] }), 200);
  await openDialog({
    className: 'dlg--rankup dlg--gems',
    body: [gemHero(150, '¡Gracias por apoyar FrostPom!', t('+{n} gemas', { n: fmtInt(gems) }), balanceText())],
    actions: [{ label: '¡Genial!', value: 'ok', variant: 'btn--gold btn--xl', primary: true }],
    onOpen: focusPrimary,
  });
}

// ---------------------------------------------------------------------
// Gemas que quedaron sin sumar (la app se cerró al pagar, o el pago estaba pendiente)
// ---------------------------------------------------------------------
let reconciling = null;
/** Suma las compras de gemas de esta cuenta que todavía no estén en tu progreso. */
export async function reconcileGems(info = null) {
  if (buyState() !== 'ok') return 0;
  const uid = playUid();
  if (!uid) return 0;
  if (reconciling) return reconciling;
  reconciling = (async () => {
    const ci = info || (await PLAY.customerInfo(uid));
    if (!ci) return 0;
    const gems = credit(GS.ordersToCredit(GS.nonSubs(ci), state.progress.gemOrders));
    if (gems > 0) console.info('[FrostPom] gemas: se sumaron', gems, 'de compras que faltaban');
    if (gems > 0) toast(t('Llegaron {n} gemas de tu compra en Google Play. ¡Gracias!', { n: fmtInt(gems) }), 'good', { icon: pic('gema', 26), ms: 6000 });
    return gems;
  })();
  try {
    return await reconciling;
  } finally {
    reconciling = null;
  }
}

/** Al abrir la app: si una compra quedó sin terminar en este aparato, se revisa. */
export async function bootGems() {
  if (buyState() !== 'ok' || !playUid()) return;
  const since = Number(store.pref.get(PENDING_KEY)) || 0;
  if (!since) return;
  if (Date.now() - since > PENDING_DAYS * 86400_000) { store.pref.remove(PENDING_KEY); return; }
  const gems = await reconcileGems();
  if (gems > 0) store.pref.remove(PENDING_KEY);
}

export function bindGems() {
  // RevenueCat avisa cuando una compra se confirma (por ejemplo, un pago que estaba pendiente)
  PLAY.onCustomerInfo((info) => {
    reconcileGems(info).then((n) => { if (n > 0) store.pref.remove(PENDING_KEY); }).catch(() => {});
  });
  const open = (ev) => {
    ev.preventDefault();
    gemsDialog();
  };
  const hud = $('#hudGems');
  if (hud) {
    hud.setAttribute('aria-haspopup', 'dialog');
    hud.title = tr('¿Necesitas más gemas?');
    hud.addEventListener('click', open);
  }
  const tray = $('#trayGems');
  const chip = tray && tray.closest('.tray-gems');
  if (chip) {
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.title = tr('¿Necesitas más gemas?');
    chip.addEventListener('click', open);
    chip.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') open(ev); });
  }
}
