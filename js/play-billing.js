/*
 * FrostPom — (v4.7.0) Premium pagado en la app de Android: Google Play Billing con RevenueCat
 * (complemento @revenuecat/purchases-capacitor). Decisiones del autor y paso a paso:
 * docs/GOOGLE-PLAY-BILLING.md
 *
 *  - Solo en la app de Android y solo con config.premium.play encendido y su clave pública de
 *    RevenueCat (goog_…). Apagado (como viene), Premium sigue en modo prueba, como antes.
 *  - Para suscribirse hace falta una cuenta EN LÍNEA (con correo; las cuentas en línea son de
 *    mayores de 13). A RevenueCat solo se le da el id de esa cuenta (el de Supabase), nunca el
 *    correo ni el nombre.
 *  - Quién decide si eres Premium: NUESTRO servidor (get_entitlements), que a su vez le pregunta a
 *    RevenueCat (y RevenueCat a Google). Este aparato guarda una copia de la última respuesta en
 *    st2_play (no se sincroniza con tus otros aparatos) para funcionar sin internet.
 *  - Justo después de comprar o restaurar se confía en lo que dice Google en el teléfono (para no
 *    hacerte esperar) y se le pide al servidor que lo revise (premium-sync). Si el servidor todavía
 *    no se entera, se vuelve a intentar; pasadas 24 h, manda el servidor.
 *  - Nada de aquí puede romper la app: si algo falla, se ve un mensaje y Premium queda como estaba.
 */
import { config } from './config.js';
import * as NATIVE from './native.js';
import * as BOARD from './board.js';
import * as CLOUD from './cloud.js';

const cfg = () => (config.premium && config.premium.play) || {};
const KEY = 'st2_play';
export const PACKAGE_ID = 'com.startupprometeus.frostpom';
export const STATUSES = Object.freeze(['none', 'trial', 'active', 'cancelled', 'grace', 'on_hold', 'expired', 'refunded']);
/** Sin internet, una suscripción que se renueva sigue valiendo 3 días después de la fecha. */
export const OFFLINE_GRACE_MS = 3 * 24 * 3600_000;
/** Lo que dijo Google en el teléfono vale 24 h mientras el servidor se entera. */
export const DEVICE_TRUST_MS = 24 * 3600_000;

/** ¿Se cobra Premium en esta app? (app de Android, cobro encendido y la clave de RevenueCat puesta) */
export const enabled = () => !!cfg().enabled && !!cfg().revenueCatKey && NATIVE.isAndroid();
export const entitlementId = () => cfg().entitlement || 'premium';

// ---------------------------------------------------------------------
// Lógica pura (con pruebas en tests/logic.test.js)
// ---------------------------------------------------------------------
const isoOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Lo que responde el servidor (get_entitlements o premium-sync) en el formato de la app. */
export function fromServer(row) {
  if (!row || typeof row !== 'object') return { premium: false, status: 'none', product: null, periodType: null, expiresAt: null, willRenew: false, billingIssue: false, sandbox: false, store: null };
  return {
    premium: row.premium === true,
    status: STATUSES.includes(row.status) ? row.status : 'none',
    product: typeof row.product === 'string' ? row.product : null,
    periodType: typeof row.period_type === 'string' ? row.period_type : null,
    expiresAt: isoOrNull(row.expires_at),
    willRenew: row.will_renew === true,
    billingIssue: row.billing_issue === true,
    sandbox: row.sandbox === true,
    store: typeof row.store === 'string' ? row.store : null,
  };
}

/** Lo que dice Google en el teléfono (CustomerInfo de RevenueCat), en el mismo formato. */
export function fromCustomerInfo(info, entitlement = 'premium') {
  const all = (info && info.entitlements && info.entitlements.all) || {};
  const e = all[entitlement];
  if (!e || typeof e !== 'object') return fromServer(null);
  const active = e.isActive === true;
  let status;
  if (active) {
    if (e.billingIssueDetectedAt) status = 'grace';
    else if (e.periodType === 'TRIAL') status = 'trial';
    else if (e.unsubscribeDetectedAt) status = 'cancelled';
    else status = 'active';
  } else status = e.billingIssueDetectedAt && !e.unsubscribeDetectedAt ? 'on_hold' : 'expired';
  const plan = typeof e.productPlanIdentifier === 'string' && e.productPlanIdentifier ? `:${e.productPlanIdentifier}` : '';
  return {
    premium: active,
    status,
    product: typeof e.productIdentifier === 'string' ? e.productIdentifier + plan : null,
    periodType: typeof e.periodType === 'string' ? e.periodType.toLowerCase() : null,
    expiresAt: isoOrNull(e.expirationDate),
    willRenew: active && e.willRenew === true,
    billingIssue: !!e.billingIssueDetectedAt,
    sandbox: e.isSandbox === true,
    store: typeof e.store === 'string' ? e.store.toLowerCase() : null,
  };
}

/** ¿Esta copia da Premium a la cuenta uid ahora? */
export function activeNow(entry, uid, now = Date.now()) {
  if (!entry || !uid || entry.uid !== uid || !entry.premium) return false;
  if (entry.expiresAt === null) return true;
  const end = Date.parse(entry.expiresAt);
  if (!Number.isFinite(end)) return false;
  return now < end + (entry.willRenew ? OFFLINE_GRACE_MS : 0);
}

/**
 * Junta lo que había en el aparato (prev) con lo que acaba de decir el servidor (server).
 * Devuelve { entry, recheck }: recheck = hay que pedirle al servidor que revise con RevenueCat.
 */
export function decide(prev, server, uid, now = Date.now()) {
  const fresh = { ...server, uid, source: 'server', checkedAt: now };
  if (server.premium) {
    // El servidor dice Premium, pero la fecha ya pasó y debía renovarse: que revise (quizá no llegó el aviso)
    const end = server.expiresAt ? Date.parse(server.expiresAt) : Infinity;
    return { entry: fresh, recheck: server.willRenew && end <= now };
  }
  // Recién comprado aquí y el servidor todavía no se entera: se espera hasta 24 h
  if (prev && prev.uid === uid && prev.source === 'device' && prev.premium && now - (prev.checkedAt || 0) < DEVICE_TRUST_MS) {
    return { entry: prev, recheck: true };
  }
  // El servidor no sabe nada (o dice que venció) pero aquí debía renovarse: que revise una vez
  const due = !!(prev && prev.uid === uid && prev.premium && prev.willRenew);
  return { entry: fresh, recheck: due };
}

/** Cuánto se ahorra con el plan anual (porcentaje entero), o 0. */
export function savings(monthlyPrice, annualPrice) {
  const m = Number(monthlyPrice);
  const a = Number(annualPrice);
  if (!(m > 0) || !(a > 0)) return 0;
  const pct = Math.round((1 - a / (m * 12)) * 100);
  return pct > 0 && pct < 100 ? pct : 0;
}

const UNIT_DAYS = { DAY: 1, WEEK: 7 };
/**
 * La prueba gratis de un producto de Google (si esta persona puede tenerla: Google solo la ofrece a
 * quien nunca se suscribió). Devuelve { days } o { months }, o null si no hay.
 */
export function trialOf(product) {
  if (!product || typeof product !== 'object') return null;
  const free = product.defaultOption && product.defaultOption.freePhase;
  const p = free && free.billingPeriod;
  let unit = p && p.unit;
  let value = p && Number(p.value);
  if (!unit && p && typeof p.iso8601 === 'string') {
    const m = /^P(\d+)([DWMY])$/.exec(p.iso8601);
    if (m) { value = Number(m[1]); unit = { D: 'DAY', W: 'WEEK', M: 'MONTH', Y: 'YEAR' }[m[2]]; }
  }
  if (!unit && product.introPrice && Number(product.introPrice.price) === 0) {
    unit = product.introPrice.periodUnit;
    value = Number(product.introPrice.periodNumberOfUnits);
  }
  if (!(value > 0)) return null;
  if (UNIT_DAYS[unit]) return { days: value * UNIT_DAYS[unit] };
  if (unit === 'MONTH') return { months: value };
  if (unit === 'YEAR') return { months: value * 12 };
  return null;
}

/** El paquete mensual y el anual de la oferta (la de config o la actual de RevenueCat). */
export function packagesOf(offerings, offeringId = '') {
  const o = (offeringId && offerings && offerings.all && offerings.all[offeringId]) || (offerings && offerings.current);
  if (!o) return { monthly: null, annual: null };
  const list = Array.isArray(o.availablePackages) ? o.availablePackages : [];
  const find = (type) => list.find((p) => p && p.packageType === type) || null;
  return { monthly: o.monthly || find('MONTHLY'), annual: o.annual || find('ANNUAL') };
}

/** Por qué no se pudo comprar, según el error del complemento. */
export function failReason(e) {
  const code = String((e && (e.code ?? (e.data && e.data.code))) || '');
  if (code === '1' || (e && e.data && e.data.userCancelled) || (e && e.userCancelled)) return 'cancel';
  if (code === '20') return 'pending';
  if (code === '6') return 'owned';
  if (code === '10' || code === '35') return 'offline';
  if (code === '3') return 'notallowed';
  if (code === '5' || code === '23' || code === '11') return 'unavailable';
  return 'error';
}

/** La página de Google Play para administrar (o cancelar) la suscripción de FrostPom. */
export function manageUrl(entry, fromRc = '') {
  if (fromRc && /^https:\/\//.test(fromRc)) return fromRc;
  const sku = entry && entry.product ? entry.product.split(':')[0] : '';
  return `https://play.google.com/store/account/subscriptions?package=${PACKAGE_ID}${sku ? `&sku=${encodeURIComponent(sku)}` : ''}`;
}

// ---------------------------------------------------------------------
// La copia en este aparato (st2_play)
// ---------------------------------------------------------------------
let storage = null;
const backend = () => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};
/** Para las pruebas. */
export function useStorage(s) { storage = s; }

const str = (v) => (typeof v === 'string' && v ? v : null);
let memo = { raw: undefined, entry: null }; // se lee muchas veces (cada vez que se pinta)
export function cached() {
  try {
    const raw = backend() && backend().getItem(KEY);
    if (raw === memo.raw) return memo.entry;
    memo = { raw, entry: parse(raw) };
    return memo.entry;
  } catch {
    return null;
  }
}
function parse(raw) {
  try {
    const v = JSON.parse(raw || 'null');
    if (!v || typeof v !== 'object' || typeof v.uid !== 'string' || !v.uid) return null;
    return {
      premium: v.premium === true,
      status: STATUSES.includes(v.status) ? v.status : 'none',
      product: str(v.product),
      periodType: str(v.periodType),
      expiresAt: isoOrNull(v.expiresAt),
      willRenew: v.willRenew === true,
      billingIssue: v.billingIssue === true,
      sandbox: v.sandbox === true,
      store: str(v.store),
      uid: v.uid,
      source: v.source === 'device' ? 'device' : 'server',
      checkedAt: Number(v.checkedAt) || 0,
    };
  } catch {
    return null;
  }
}
function keep(entry) {
  try { backend() && backend().setItem(KEY, JSON.stringify(entry)); } catch { /* sin espacio */ }
  return entry;
}
export function forget() {
  try { backend() && backend().removeItem(KEY); } catch { /* nada */ }
}

// ---------------------------------------------------------------------
// El servidor
// ---------------------------------------------------------------------
/**
 * Pregunta al servidor (get_entitlements). Devuelve { entry, recheck, changed } o, sin internet
 * o sin el SQL nuevo, { entry: la copia de antes, failed: kind }.
 */
export async function refresh(uid) {
  const prev = cached();
  let rows;
  try {
    rows = await BOARD.callServer('get_entitlements', {});
  } catch (e) {
    return { entry: prev && prev.uid === uid ? prev : null, failed: e.kind || 'error' };
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  const { entry, recheck } = decide(prev && prev.uid === uid ? prev : null, fromServer(row), uid);
  keep(entry);
  return { entry, recheck, changed: !prev || prev.uid !== uid || prev.premium !== entry.premium || prev.status !== entry.status };
}

/**
 * Pide al servidor que revise con RevenueCat (premium-sync). Devuelve la copia nueva, o null si no
 * se pudo (sin internet, la función no está, o se pidió hace menos de 10 s).
 */
export async function serverSync(uid) {
  let token = '';
  try { token = await BOARD.authToken(); } catch { return null; }
  if (!token) return null;
  let body;
  try {
    body = await CLOUD.callFunction('premium-sync', token);
  } catch (e) {
    if (e.kind === 'rate') return (await refresh(uid)).entry;
    console.info('[FrostPom] premium-sync:', e.kind || e.message);
    return null;
  }
  if (body && typeof body.management_url === 'string') lastManage = body.management_url;
  const prev = cached();
  const server = fromServer(body);
  // Si el servidor todavía no ve la compra recién hecha, se conserva lo que dijo Google aquí
  const { entry } = decide(prev && prev.uid === uid ? prev : null, server, uid);
  return keep(entry);
}

// ---------------------------------------------------------------------
// El complemento de RevenueCat
// ---------------------------------------------------------------------
let rc = null; // { api } (dentro de un objeto: el complemento responde a "then", ver native.js)
let rcUser = '';
let lastManage = '';
let connecting = null;

/** Conecta RevenueCat con la cuenta uid (la primera vez, configure; si cambió la cuenta, logIn). */
async function connect(uid) {
  if (!enabled() || !uid) return null;
  while (connecting) await connecting.catch(() => {});
  connecting = (async () => {
    if (!rc) {
      const box = await NATIVE.purchases();
      if (!box) return null;
      await box.api.configure({
        apiKey: cfg().revenueCatKey,
        appUserID: uid,
        // Sin identificadores del aparato para publicidad (público mixto, Familias)
        automaticDeviceIdentifierCollectionEnabled: false,
      });
      rc = box;
      rcUser = uid;
      try {
        // (Los métodos con "callback" de Capacitor reciben primero las opciones y después la función.)
        await box.api.addCustomerInfoUpdateListener({}, (info, err) => {
          if (err || !info || !rcUser) return;
          for (const fn of infoListeners) { try { fn(info); } catch { /* que uno no frene a los demás */ } }
        });
      } catch { /* sin avisos: se revisa al abrir */ }
    } else if (rcUser !== uid) {
      await rc.api.logIn({ appUserID: uid });
      rcUser = uid;
    }
    return rc;
  })();
  try {
    return await connecting;
  } catch (e) {
    console.info('[FrostPom] RevenueCat no se pudo iniciar:', (e && e.message) || e);
    return null;
  } finally {
    connecting = null;
  }
}

let infoListeners = [];
/**
 * Lo que avise RevenueCat (una renovación, un cambio o, v4.8.0, una compra de gemas que se
 * confirmó) mientras la app está abierta. Premium y las gemas escuchan cada uno lo suyo.
 */
export function onCustomerInfo(fn) { if (typeof fn === 'function' && !infoListeners.includes(fn)) infoListeners.push(fn); }

/** Guarda lo que dijo Google en el teléfono (justo después de comprar o restaurar). */
export function keepDevice(uid, info) {
  if (info && typeof info.managementURL === 'string') lastManage = info.managementURL;
  const st = fromCustomerInfo(info, entitlementId());
  return keep({ ...st, uid, source: 'device', checkedAt: Date.now() });
}

/**
 * Los planes con su precio de Google (en la moneda de cada persona):
 * { ok: true, monthly, annual, savings } o { ok: false, reason }.
 * Cada plan: { pkg, priceString, price, perMonth, trial }.
 */
export async function offer(uid) {
  const box = await connect(uid);
  if (!box) return { ok: false, reason: 'unavailable' };
  let offerings;
  try {
    offerings = await box.api.getOfferings();
  } catch (e) {
    return { ok: false, reason: failReason(e) === 'offline' ? 'offline' : 'unavailable' };
  }
  const { monthly, annual } = packagesOf(offerings, cfg().offering || '');
  const plan = (pkg) => {
    if (!pkg || !pkg.product) return null;
    const p = pkg.product;
    return { pkg, priceString: p.priceString || '', price: Number(p.price) || 0, perMonth: p.pricePerMonthString || '', trial: trialOf(p) };
  };
  const m = plan(monthly);
  const a = plan(annual);
  if (!m && !a) return { ok: false, reason: 'unavailable' };
  return { ok: true, monthly: m, annual: a, savings: m && a ? savings(m.price, a.price) : 0 };
}

/** Compra un plan. Devuelve { ok: true, entry } o { ok: false, reason }. */
export async function buy(uid, pkg) {
  const box = await connect(uid);
  if (!box) return { ok: false, reason: 'unavailable' };
  let res;
  try {
    res = await box.api.purchasePackage({ aPackage: pkg });
  } catch (e) {
    const reason = failReason(e);
    if (reason === 'owned') return restore(uid); // ya la tenías (en otra cuenta o sin terminar)
    return { ok: false, reason };
  }
  const entry = keepDevice(uid, res && res.customerInfo);
  return { ok: entry.premium, entry, reason: entry.premium ? '' : 'error' };
}

/** "Restaurar compras": busca en Google Play las suscripciones de esta cuenta de Google. */
export async function restore(uid) {
  const box = await connect(uid);
  if (!box) return { ok: false, reason: 'unavailable' };
  let res;
  try {
    res = await box.api.restorePurchases();
  } catch (e) {
    return { ok: false, reason: failReason(e) };
  }
  const entry = keepDevice(uid, res && res.customerInfo);
  return { ok: entry.premium, entry, reason: entry.premium ? '' : 'none' };
}

// ---------------------------------------------------------------------
// (v4.8.0) Paquetes de gemas: productos de una sola compra (js/gem-shop.js)
// ---------------------------------------------------------------------
/** Los productos con su precio de Google: { ok: true, products } o { ok: false, reason }. */
export async function storeProducts(uid, ids) {
  const box = await connect(uid);
  if (!box) return { ok: false, reason: 'unavailable' };
  try {
    const r = await box.api.getProducts({ productIdentifiers: ids, type: 'NON_SUBSCRIPTION' });
    return { ok: true, products: r && Array.isArray(r.products) ? r.products : [] };
  } catch (e) {
    return { ok: false, reason: failReason(e) === 'offline' ? 'offline' : 'unavailable' };
  }
}

/** Compra un producto: { ok: true, transaction, customerInfo } o { ok: false, reason }. */
export async function buyProduct(uid, product) {
  const box = await connect(uid);
  if (!box) return { ok: false, reason: 'unavailable' };
  try {
    const res = await box.api.purchaseStoreProduct({ product });
    return { ok: true, transaction: (res && res.transaction) || null, customerInfo: (res && res.customerInfo) || null };
  } catch (e) {
    return { ok: false, reason: failReason(e) };
  }
}

/** Lo que sabe RevenueCat de esta cuenta (para sumar gemas que quedaron sin sumar), o null. */
export async function customerInfo(uid) {
  const box = await connect(uid);
  if (!box) return null;
  try {
    const r = await box.api.getCustomerInfo();
    return (r && r.customerInfo) || null;
  } catch {
    return null;
  }
}

/** La página de Google Play para administrar la suscripción. */
export const manageLink = (entry) => manageUrl(entry, lastManage);

/** Para las pruebas. */
export function _reset() { rc = null; rcUser = ''; lastManage = ''; connecting = null; infoListeners = []; storage = null; memo = { raw: undefined, entry: null }; }
