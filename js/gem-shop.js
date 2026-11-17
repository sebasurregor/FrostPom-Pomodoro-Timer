/*
 * FrostPom — (v4.8.0) Paquetes de gemas con Google Play (lógica pura, con pruebas en
 * tests/gem-shop.test.js). La compra la hace js/play-billing.js (RevenueCat) y la ventana
 * "¿Necesitas más gemas?", js/ui/gems-ui.js.
 *
 *  - Cada paquete es un producto de UNA sola compra en Play Console ("gemas_60", "gemas_330"…).
 *    RevenueCat lo "consume" al terminar, así que se puede comprar las veces que quieras.
 *  - Cada compra tiene su número de transacción (tx) de Google. Las gemas de una compra se suman
 *    UNA sola vez: el tx queda anotado en progress.gemOrders, que viaja con tu progreso a tus
 *    otros aparatos (y al unir dos aparatos, una compra repetida se resta: js/merge.js).
 *  - Si la app se cierra justo después de pagar, o el pago quedó pendiente, las gemas llegan
 *    después: RevenueCat guarda la lista de compras de la cuenta (nonSubscriptionTransactions) y
 *    aquí se suman las que falten.
 */
import { config } from './config.js';

/** Lo más que se guarda en progress.gemOrders (las más viejas se olvidan). */
export const MAX_ORDERS = 500;
/** Lo más que puede dar una compra (protección contra datos raros). */
export const MAX_GEMS_PER_ORDER = 100000;

const DEFAULT_PACKS = Object.freeze([
  { id: 'gemas_60', gems: 60, bonus: 0 },
  { id: 'gemas_330', gems: 330, bonus: 30 },
  { id: 'gemas_700', gems: 700, bonus: 100 },
  { id: 'gemas_1500', gems: 1500, bonus: 300 },
]);

/** Los paquetes de config.premium.play.gemPacks (válidos y ordenados de menor a mayor). */
export function packs(list = config.premium && config.premium.play && config.premium.play.gemPacks) {
  const src = Array.isArray(list) && list.length ? list : DEFAULT_PACKS;
  return src
    .filter((p) => p && typeof p.id === 'string' && /^[a-z0-9_.]{1,100}$/.test(p.id) && Number.isInteger(p.gems) && p.gems > 0 && p.gems <= MAX_GEMS_PER_ORDER)
    .map((p) => ({ id: p.id, gems: p.gems, bonus: Number.isInteger(p.bonus) && p.bonus > 0 && p.bonus < p.gems ? p.bonus : 0 }))
    .sort((a, b) => a.gems - b.gems);
}

/** El ID del producto sin la opción de compra que a veces agrega Google ("gemas_60:compra" → "gemas_60"). */
export const baseId = (id) => String(id || '').split(':')[0];

/** El paquete de un producto de Google (o null si no es un paquete de gemas). */
export function packOf(productId, list = packs()) {
  const id = baseId(productId);
  return list.find((p) => p.id === id) || null;
}

/** Las compras de una sola vez que guarda RevenueCat (CustomerInfo.nonSubscriptionTransactions). */
export function nonSubs(info) {
  const list = info && Array.isArray(info.nonSubscriptionTransactions) ? info.nonSubscriptionTransactions : [];
  return list.filter((t) => t && typeof t === 'object');
}

/**
 * Las compras de gemas que todavía no se sumaron: [{ tx, product, gems, at }].
 * transactions: lo que dice RevenueCat; credited: progress.gemOrders (lo ya sumado).
 */
export function ordersToCredit(transactions, credited = [], list = packs()) {
  const seen = new Set((Array.isArray(credited) ? credited : []).map((o) => o && o.tx).filter(Boolean));
  const out = [];
  for (const t of Array.isArray(transactions) ? transactions : []) {
    if (!t || typeof t !== 'object') continue;
    const tx = typeof t.transactionIdentifier === 'string' ? t.transactionIdentifier.trim() : '';
    const pack = packOf(t.productIdentifier, list);
    if (!tx || tx.length > 200 || !pack || seen.has(tx)) continue;
    seen.add(tx);
    const ms = Date.parse(t.purchaseDate || '') || Number(t.purchaseDateMillis) || 0;
    out.push({ tx, product: pack.id, gems: pack.gems, at: ms > 0 ? new Date(ms).toISOString() : null });
  }
  return out;
}

/** progress.gemOrders limpio (para storage.js): solo registros válidos, sin repetidos. */
export function sanitizeOrders(list) {
  const seen = new Set();
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || typeof o !== 'object' || typeof o.tx !== 'string') continue;
    const tx = o.tx.trim();
    if (!tx || tx.length > 200 || seen.has(tx)) continue;
    const gems = Number(o.gems);
    if (!Number.isInteger(gems) || gems <= 0 || gems > MAX_GEMS_PER_ORDER) continue;
    seen.add(tx);
    const at = typeof o.at === 'string' && Number.isFinite(Date.parse(o.at)) ? new Date(Date.parse(o.at)).toISOString() : null;
    out.push({ tx, product: typeof o.product === 'string' ? o.product.slice(0, 100) : '', gems, at });
  }
  return out.slice(-MAX_ORDERS);
}

/**
 * Al unir dos aparatos (merge.js): la lista unida y cuántas gemas restar porque los DOS sumaron
 * la misma compra después de la última vez que se sincronizaron (base).
 */
export function mergeOrders(base, mine, theirs) {
  const inBase = new Set(sanitizeOrders(base).map((o) => o.tx));
  const m = sanitizeOrders(mine);
  const t = sanitizeOrders(theirs);
  const inTheirs = new Map(t.map((o) => [o.tx, o]));
  let dup = 0;
  for (const o of m) if (!inBase.has(o.tx) && inTheirs.has(o.tx)) dup += Math.min(o.gems, inTheirs.get(o.tx).gems);
  const all = sanitizeOrders([...t, ...m]).sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  return { orders: all.slice(-MAX_ORDERS), dup };
}
