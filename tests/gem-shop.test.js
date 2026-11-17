/*
 * (v4.8.0) Pruebas de los paquetes de gemas con Google Play (js/gem-shop.js), de cómo se suman
 * (engine.creditGemOrders: cada compra UNA sola vez), cómo se guardan (storage.validateState) y
 * cómo se unen dos aparatos que sumaron la misma compra (merge.mergeStates).
 * Ejecuta: node --test tests/ (o npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as GS from '../js/gem-shop.js';
import * as E from '../js/engine.js';
import * as S from '../js/storage.js';
import { mergeStates } from '../js/merge.js';
import { config } from '../js/config.js';

/** Una compra de una sola vez como la da RevenueCat (nonSubscriptionTransactions). */
const tx = (id, product, date = '2026-11-17T15:00:00Z') => ({ transactionIdentifier: id, productIdentifier: product, purchaseDate: date });

test('gem-shop: los 4 paquetes de config (de menor a mayor) y sus IDs de Play Console', () => {
  const list = GS.packs();
  assert.deepEqual(list.map((p) => p.id), ['gemas_60', 'gemas_330', 'gemas_700', 'gemas_1500']);
  assert.deepEqual(list.map((p) => p.gems), [60, 330, 700, 1500]);
  assert.deepEqual(list.map((p) => p.bonus), [0, 30, 100, 300]);
  assert.equal(config.premium.play.gemPacks.length, 4, 'están en config.premium.play.gemPacks');
  // Datos raros se descartan; un bonus mayor que el total no vale
  assert.deepEqual(GS.packs([{ id: 'X mal', gems: 5 }, { id: 'ok_1', gems: 10, bonus: 50 }, { id: 'ok_2', gems: 0 }]), [{ id: 'ok_1', gems: 10, bonus: 0 }]);
});

test('gem-shop: el paquete de cada producto (también con la opción de compra que agrega Google)', () => {
  assert.equal(GS.packOf('gemas_330').gems, 330);
  assert.equal(GS.packOf('gemas_330:compra-unica').gems, 330);
  assert.equal(GS.packOf('frostpom_premium'), null, 'la suscripción no es un paquete de gemas');
  assert.equal(GS.baseId('gemas_60:x'), 'gemas_60');
});

test('gem-shop: las compras que faltan por sumar (una sola vez cada una)', () => {
  const txs = [tx('GPA.1', 'gemas_60'), tx('GPA.2', 'gemas_700'), tx('GPA.3', 'frostpom_premium'), tx('', 'gemas_60'), tx('GPA.1', 'gemas_60')];
  const out = GS.ordersToCredit(txs, []);
  assert.deepEqual(out.map((o) => [o.tx, o.product, o.gems]), [['GPA.1', 'gemas_60', 60], ['GPA.2', 'gemas_700', 700]]);
  assert.equal(out[0].at, '2026-11-17T15:00:00.000Z');
  // Lo ya sumado no se vuelve a sumar
  assert.deepEqual(GS.ordersToCredit(txs, [{ tx: 'GPA.1', gems: 60 }]).map((o) => o.tx), ['GPA.2']);
  assert.deepEqual(GS.nonSubs({ nonSubscriptionTransactions: [tx('a', 'gemas_60'), null] }).length, 1);
  assert.deepEqual(GS.nonSubs(null), []);
});

test('engine: creditGemOrders suma las gemas UNA sola vez y anota la compra', () => {
  const s = S.defaultState();
  s.progress.gems = 10;
  const first = E.creditGemOrders(s, [{ tx: 'GPA.9', product: 'gemas_330', gems: 330, at: '2026-11-17T15:00:00Z' }]);
  assert.equal(first.ok, true);
  assert.equal(first.gems, 330);
  assert.equal(s.progress.gems, 340);
  assert.deepEqual(first.events, [{ type: 'gems', amount: 330, reason: 'purchase' }]);
  assert.equal(s.progress.gemOrders.length, 1);
  // La misma compra otra vez (por ejemplo, RevenueCat avisó dos veces): nada
  const again = E.creditGemOrders(s, [{ tx: 'GPA.9', product: 'gemas_330', gems: 330 }]);
  assert.equal(again.ok, false);
  assert.equal(s.progress.gems, 340);
  // Datos raros: nada
  assert.equal(E.creditGemOrders(s, [{ tx: '', gems: 10 }, { tx: 'x', gems: -5 }, { tx: 'y', gems: 1e9 }]).ok, false);
  assert.equal(s.progress.gems, 340);
});

test('storage: progress.gemOrders se guarda limpio (y un estado viejo empieza vacío)', () => {
  const s = S.defaultState();
  assert.deepEqual(s.progress.gemOrders, []);
  s.progress.gemOrders = [{ tx: 'A', product: 'gemas_60', gems: 60, at: '2026-11-17T15:00:00Z' }, { tx: 'A', gems: 60 }, { tx: 'B', gems: 'x' }, null];
  const v = S.validateState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(v.progress.gemOrders, [{ tx: 'A', product: 'gemas_60', gems: 60, at: '2026-11-17T15:00:00.000Z' }]);
  const old = JSON.parse(JSON.stringify(S.defaultState()));
  delete old.progress.gemOrders;
  assert.deepEqual(S.validateState(old).progress.gemOrders, []);
});

test('merge: si los dos aparatos sumaron la misma compra, las gemas cuentan una vez', () => {
  const base = S.defaultState();
  base.progress.gems = 100;
  const mine = JSON.parse(JSON.stringify(base));
  const theirs = JSON.parse(JSON.stringify(base));
  const order = { tx: 'GPA.7', product: 'gemas_700', gems: 700, at: '2026-11-17T15:00:00Z' };
  E.creditGemOrders(mine, [order]);
  E.creditGemOrders(theirs, [order]);
  theirs.progress.gems += 5; // y en el otro además ganó 5 estudiando
  const out = mergeStates(base, mine, theirs);
  assert.equal(out.progress.gems, 805, '100 + 700 (una vez) + 5');
  assert.deepEqual(out.progress.gemOrders.map((o) => o.tx), ['GPA.7']);
  // Compras distintas en cada aparato: se suman las dos
  const m2 = JSON.parse(JSON.stringify(base));
  const t2 = JSON.parse(JSON.stringify(base));
  E.creditGemOrders(m2, [{ tx: 'M1', gems: 60 }]);
  E.creditGemOrders(t2, [{ tx: 'T1', gems: 330 }]);
  const out2 = mergeStates(base, m2, t2);
  assert.equal(out2.progress.gems, 490);
  assert.deepEqual(out2.progress.gemOrders.map((o) => o.tx).sort(), ['M1', 'T1']);
  // Una compra que ya estaba en la base (sincronizada antes) no se resta
  const b3 = JSON.parse(JSON.stringify(out));
  const m3 = JSON.parse(JSON.stringify(b3));
  const t3 = JSON.parse(JSON.stringify(b3));
  assert.equal(mergeStates(b3, m3, t3).progress.gems, 805);
});
