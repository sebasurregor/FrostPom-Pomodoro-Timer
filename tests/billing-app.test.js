/*
 * (v4.7.0) Pruebas de Premium con Google Play en la app (js/play-billing.js) y de lo que cambia en
 * el motor (regalo una sola vez) y en el catálogo (Premium lo decide el servidor en Android).
 * Ejecuta: node --test tests/ (o npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as PLAY from '../js/play-billing.js';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as S from '../js/storage.js';
import { config } from '../js/config.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const D = 24 * 3600_000;
const iso = (t) => new Date(t).toISOString();
const UID = 'b4700000-0000-4000-8000-000000000001';

/** Un EntitlementInfo como lo da RevenueCat en el teléfono. */
function info(e) {
  return { entitlements: { all: e ? { premium: { identifier: 'premium', isActive: true, willRenew: true, periodType: 'NORMAL', expirationDate: iso(NOW + 30 * D), store: 'PLAY_STORE', productIdentifier: 'frostpom_premium', productPlanIdentifier: 'mensual', isSandbox: false, unsubscribeDetectedAt: null, billingIssueDetectedAt: null, ...e } } : {}, active: {} } };
}

test('play-billing: lo que dice Google en el teléfono (CustomerInfo)', () => {
  assert.deepEqual(PLAY.fromCustomerInfo(info(null)), PLAY.fromServer(null));
  assert.deepEqual(PLAY.fromCustomerInfo(info({})), {
    premium: true, status: 'active', product: 'frostpom_premium:mensual', periodType: 'normal', expiresAt: iso(NOW + 30 * D),
    willRenew: true, billingIssue: false, sandbox: false, store: 'play_store',
  });
  assert.equal(PLAY.fromCustomerInfo(info({ periodType: 'TRIAL' })).status, 'trial');
  assert.equal(PLAY.fromCustomerInfo(info({ unsubscribeDetectedAt: iso(NOW), willRenew: false })).status, 'cancelled');
  assert.equal(PLAY.fromCustomerInfo(info({ billingIssueDetectedAt: iso(NOW) })).status, 'grace');
  const hold = PLAY.fromCustomerInfo(info({ isActive: false, billingIssueDetectedAt: iso(NOW - D) }));
  assert.ok(!hold.premium && hold.status === 'on_hold' && !hold.willRenew);
  assert.equal(PLAY.fromCustomerInfo(info({ isActive: false })).status, 'expired');
  assert.equal(PLAY.fromCustomerInfo(info({ productPlanIdentifier: null })).product, 'frostpom_premium');
});

test('play-billing: lo que dice el servidor y cuándo da Premium', () => {
  const row = { premium: true, status: 'trial', store: 'play_store', product: 'frostpom_premium:anual', period_type: 'trial', expires_at: iso(NOW + 7 * D), will_renew: true, billing_issue: false, sandbox: true };
  const st = PLAY.fromServer(row);
  assert.deepEqual(st, { premium: true, status: 'trial', product: 'frostpom_premium:anual', periodType: 'trial', expiresAt: iso(NOW + 7 * D), willRenew: true, billingIssue: false, sandbox: true, store: 'play_store' });
  assert.equal(PLAY.fromServer({ status: 'gratis-siempre', premium: 'true' }).status, 'none', 'un estado inventado no sirve');
  assert.equal(PLAY.fromServer({ premium: 'true' }).premium, false, 'solo true de verdad');

  const entry = { ...st, uid: UID };
  assert.ok(PLAY.activeNow(entry, UID, NOW));
  assert.ok(!PLAY.activeNow(entry, 'otra-cuenta', NOW), 'la copia es de UNA cuenta: otra cuenta del mismo celular no es Premium');
  assert.ok(!PLAY.activeNow(entry, '', NOW), 'sin cuenta en línea no hay Premium pagado');
  assert.ok(PLAY.activeNow(entry, UID, NOW + 7 * D + 2 * D), 'sin internet, si se renueva, vale 3 días más');
  assert.ok(!PLAY.activeNow(entry, UID, NOW + 7 * D + 4 * D));
  assert.ok(!PLAY.activeNow({ ...entry, willRenew: false }, UID, NOW + 7 * D + 1000), 'cancelada: termina en la fecha');
  assert.ok(PLAY.activeNow({ ...entry, expiresAt: null }, UID, NOW + 999 * D), 'sin fecha (regalo de por vida)');
  assert.ok(!PLAY.activeNow({ ...entry, premium: false }, UID, NOW));
  assert.ok(!PLAY.activeNow(null, UID, NOW));
});

test('play-billing: el servidor manda, salvo justo después de comprar', () => {
  const none = PLAY.fromServer(null);
  const paid = PLAY.fromServer({ premium: true, status: 'active', expires_at: iso(NOW + 30 * D), will_renew: true });
  // El servidor dice Premium
  let r = PLAY.decide(null, paid, UID, NOW);
  assert.ok(r.entry.premium && r.entry.source === 'server' && !r.recheck);
  // Premium vencido para el servidor pero debía renovarse: que revise con RevenueCat
  r = PLAY.decide(null, { ...paid, expiresAt: iso(NOW - 1000) }, UID, NOW);
  assert.ok(r.recheck);
  // Recién comprado aquí y el servidor todavía no se entera: se espera (hasta 24 h)
  const device = { ...paid, uid: UID, source: 'device', checkedAt: NOW - 3600_000 };
  r = PLAY.decide(device, none, UID, NOW);
  assert.equal(r.entry, device);
  assert.ok(r.recheck);
  r = PLAY.decide({ ...device, checkedAt: NOW - 25 * 3600_000 }, none, UID, NOW);
  assert.ok(!r.entry.premium, 'pasadas 24 h manda el servidor');
  // Lo del teléfono de OTRA cuenta no cuenta
  r = PLAY.decide({ ...device, uid: 'otra' }, none, UID, NOW);
  assert.ok(!r.entry.premium && !r.recheck);
  // Era Premium (del servidor) y ahora no: revisa una vez, y si sigue igual, ya no
  r = PLAY.decide({ ...paid, uid: UID, source: 'server' }, none, UID, NOW);
  assert.ok(!r.entry.premium && r.recheck);
  r = PLAY.decide(r.entry, none, UID, NOW);
  assert.ok(!r.recheck, 'no se queda preguntando');
});

test('play-billing: precios, prueba gratis y errores', () => {
  assert.equal(PLAY.savings(2.99, 19.99), 44);
  assert.equal(PLAY.savings(2.99, 0), 0);
  assert.equal(PLAY.savings(2.99, 40), 0, 'si el anual no ahorra, no se dice nada');
  assert.deepEqual(PLAY.trialOf({ defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 7, iso8601: 'P7D' } } } }), { days: 7 });
  assert.deepEqual(PLAY.trialOf({ defaultOption: { freePhase: { billingPeriod: { iso8601: 'P1W' } } } }), { days: 7 });
  assert.deepEqual(PLAY.trialOf({ defaultOption: { freePhase: { billingPeriod: { unit: 'MONTH', value: 1 } } } }), { months: 1 });
  assert.deepEqual(PLAY.trialOf({ introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } }), { days: 7 });
  assert.equal(PLAY.trialOf({ defaultOption: { freePhase: null } }), null, 'quien ya tuvo la prueba no la ve otra vez (Google no la ofrece)');
  assert.equal(PLAY.trialOf({ introPrice: { price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1 } }), null);

  const monthly = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { price: 2.99 } };
  const annual = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { price: 19.99 } };
  assert.deepEqual(PLAY.packagesOf({ current: { availablePackages: [annual, monthly] } }), { monthly, annual });
  assert.deepEqual(PLAY.packagesOf({ current: { monthly, annual: null, availablePackages: [monthly] }, all: { otra: { availablePackages: [annual] } } }, 'otra'), { monthly: null, annual });
  assert.deepEqual(PLAY.packagesOf(null), { monthly: null, annual: null });

  assert.equal(PLAY.failReason({ code: '1' }), 'cancel');
  assert.equal(PLAY.failReason({ code: '0', data: { userCancelled: true } }), 'cancel');
  assert.equal(PLAY.failReason({ code: '20' }), 'pending');
  assert.equal(PLAY.failReason({ code: '6' }), 'owned');
  assert.equal(PLAY.failReason({ code: '10' }), 'offline');
  assert.equal(PLAY.failReason({ code: '3' }), 'notallowed');
  assert.equal(PLAY.failReason(new Error('x')), 'error');

  assert.equal(PLAY.manageUrl({ product: 'frostpom_premium:anual' }), 'https://play.google.com/store/account/subscriptions?package=com.startupprometeus.frostpom&sku=frostpom_premium');
  assert.equal(PLAY.manageUrl(null, 'https://play.google.com/store/account/subscriptions?x'), 'https://play.google.com/store/account/subscriptions?x');
  assert.equal(PLAY.manageUrl(null, 'javascript:alert(1)'), 'https://play.google.com/store/account/subscriptions?package=com.startupprometeus.frostpom', 'solo enlaces https');
});

test('play-billing: la copia del aparato se lee con cuidado', () => {
  const mem = new Map();
  PLAY.useStorage({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
  assert.equal(PLAY.cached(), null);
  mem.set('st2_play', '{"uid":"' + UID + '","premium":true,"status":"magia","expiresAt":"no-es-fecha","source":"hack"}');
  const c = PLAY.cached();
  assert.equal(c.status, 'none');
  assert.equal(c.expiresAt, null);
  assert.equal(c.source, 'server');
  mem.set('st2_play', 'esto no es JSON');
  assert.equal(PLAY.cached(), null);
  PLAY.keepDevice(UID, info({ periodType: 'TRIAL' }));
  assert.equal(PLAY.cached().status, 'trial');
  assert.equal(PLAY.cached().source, 'device');
  PLAY.forget();
  assert.equal(PLAY.cached(), null);
  PLAY._reset();
});

test('Premium pagado: el regalo de bienvenida una sola vez, sin tocar la prueba gratis', () => {
  const st = S.validateState({});
  const gems = st.progress.gems;
  const r = E.premiumGift(st);
  assert.ok(r.ok);
  assert.equal(st.progress.gems, gems + E.PREMIUM_GEMS);
  assert.equal(st.premium.bonusClaimed, true);
  assert.equal(st.premium.active, false, 'premium.active es el de la prueba gratis: no se toca');
  assert.ok(r.events.some((e) => e.type === 'premiumGift'));
  assert.equal(E.premiumGift(st).ok, false, 'el regalo no se repite');
  assert.equal(st.progress.gems, gems + E.PREMIUM_GEMS);
  // Quien ya probó Premium gratis ya tuvo su regalo
  const demo = S.validateState({});
  E.setPremium(demo, true);
  assert.equal(E.premiumGift(demo).ok, false);
});

test('Premium en Android con cobro: lo decide el servidor, no premium.active', () => {
  const st = S.validateState({});
  st.premium.active = true; // la prueba gratis (viaja con el progreso desde la web)
  assert.ok(C.isPremium(st));
  C.setPremiumGate(() => false);
  try {
    assert.ok(!C.isPremium(st), 'la prueba gratis de la web no da Premium en la app con cobro');
    assert.equal(C.effectivePrefs(st).premium, false);
    C.setPremiumGate(() => true);
    st.premium.active = false;
    assert.ok(C.isPremium(st));
  } finally {
    C.setPremiumGate(null);
  }
  assert.ok(!C.isPremium(st));
});

test('Premium con Google Play: viene apagado y sin claves secretas', () => {
  const play = config.premium.play;
  assert.equal(play.enabled, false, 'el cobro viene apagado');
  assert.ok(!/^(sk_|atk_)/.test(play.revenueCatKey), 'la clave secreta de RevenueCat nunca va en la app');
  const src = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.ok(!/['"]sk_[A-Za-z0-9]{8,}/.test(src), 'ninguna clave sk_ en config.js');
  const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./js/play-billing.js'"));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@revenuecat/purchases-capacitor'], '14.1.0');
  assert.equal(pkg.version, config.version);
});
