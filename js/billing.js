/*
 * FrostPom — cobro de Premium con Microsoft Store (v3.8).
 *
 * Cuando FrostPom se instala desde Microsoft Store, Edge le da a la app la "Digital Goods API":
 * con ella se lee el precio de la suscripción creada en Partner Center, se abre la ventana de
 * pago de la tienda (PaymentRequest) y se revisa si la suscripción sigue activa (listPurchases).
 * Microsoft cobra, maneja la tarjeta, los impuestos, las renovaciones y las cancelaciones.
 *
 * Nada de esto se usa mientras config.premium.chargesEnabled sea false (modo prueba).
 * En el navegador normal (GitHub Pages) la API no existe: ahí no se puede comprar.
 * Guía completa: docs/COBRO-PREMIUM.md
 */
import { config } from './config.js';
import { locale } from './i18n.js';
import { isNative } from './native.js';

const METHOD = 'https://store.microsoft.com/billing';
const cfg = () => config.premium || {};
// (v4.4.1) En la app de Android, nunca: ahí Premium solo se podrá comprar con Google Play Billing
// (fase 6, docs/GOOGLE-PLAY-BILLING.md). Sin esto, al encender el cobro de Microsoft Store la app de
// Android diría "instala FrostPom desde Microsoft Store", y Google Play prohíbe mandar a pagar por
// fuera de Google Play. Mientras tanto, en Android Premium sigue en modo prueba (gratis).
export const charging = () => !!cfg().chargesEnabled && !isNative();
export const productId = () => cfg().storeProductId || '';

let servicePromise = null;
/** El servicio de pagos de la tienda, o null si no hay (navegador normal, sin producto, etc.). */
export function storeService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      if (typeof window === 'undefined' || typeof window.getDigitalGoodsService !== 'function' || !productId()) return null;
      try {
        return await window.getDigitalGoodsService(METHOD);
      } catch {
        return null; // la app no se instaló desde Microsoft Store
      }
    })();
  }
  return servicePromise;
}

/** Precio y nombre reales de la suscripción (en la moneda del usuario), o null. */
export async function premiumOffer() {
  const s = await storeService();
  if (!s) return null;
  try {
    const items = await s.getDetails([productId()]);
    const item = (items || []).find((i) => i.itemId === productId());
    if (!item) return null;
    const price = new Intl.NumberFormat(locale, { style: 'currency', currency: item.price.currency }).format(Number(item.price.value));
    return { id: item.itemId, title: item.title, price };
  } catch {
    return null;
  }
}

/** Abre la ventana de pago de Microsoft Store. Devuelve { ok, reason }. */
export async function buyPremium() {
  const s = await storeService();
  if (!s) return { ok: false, reason: 'unavailable' };
  const methods = [{ supportedMethods: METHOD, data: { sku: productId() } }];
  let request;
  try {
    // El total lo ignora la tienda (el precio real es el de Partner Center), pero algunos navegadores lo exigen
    request = new PaymentRequest(methods, { total: { label: 'FrostPom Premium', amount: { currency: 'USD', value: '0' } } });
  } catch {
    try { request = new PaymentRequest(methods); } catch { return { ok: false, reason: 'error' }; }
  }
  try {
    const response = await request.show();
    await response.complete('success');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e && e.name === 'AbortError' ? 'cancel' : 'error' };
  }
}

/** true/false si la tienda dice que la suscripción está activa; null si no se puede saber. */
export async function storeHasPremium() {
  const s = await storeService();
  if (!s) return null;
  try {
    const list = await s.listPurchases(); // no incluye suscripciones vencidas ni canceladas
    return (list || []).some((p) => p.itemId === productId());
  } catch {
    return null;
  }
}
