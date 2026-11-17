/*
 * (v4.7.0) Pruebas de las Edge Functions de Premium (server/supabase/functions/_shared/premium.js)
 * sin internet: RevenueCat y Supabase son simulados. Ejecuta: node --test tests/ (o npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../server/supabase/functions/_shared/premium.js';
import { pasteFile } from '../tools/edge-pegar.mjs';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const H = 3600_000;
const D = 24 * H;
const iso = (t) => new Date(t).toISOString();
const PAU = 'b4700000-0000-4000-8000-000000000001';
const OTRA = 'b4700000-0000-4000-8000-000000000002';

/** Lo que responde GET /v1/subscribers con una suscripción de Google Play. */
function subscriber({ exp = NOW + 20 * D, grace = null, period = 'normal', unsub = null, issue = null, refunded = null, sandbox = false, product = 'frostpom_premium:mensual', store = 'play_store', ent = true } = {}) {
  return {
    request_date_ms: NOW,
    subscriber: {
      management_url: 'https://play.google.com/store/account/subscriptions',
      entitlements: ent ? { premium: { expires_date: exp === null ? null : iso(exp), grace_period_expires_date: grace ? iso(grace) : null, product_identifier: product, purchase_date: iso(NOW - 10 * D) } } : {},
      subscriptions: {
        [product]: {
          expires_date: exp === null ? null : iso(exp), period_type: period, store, is_sandbox: sandbox,
          unsubscribe_detected_at: unsub ? iso(unsub) : null, billing_issues_detected_at: issue ? iso(issue) : null,
          refunded_at: refunded ? iso(refunded) : null, grace_period_expires_date: grace ? iso(grace) : null,
        },
      },
    },
  };
}
const stateOf = (o) => P.stateFromSubscriber(subscriber(o), { now: NOW });

test('premium (servidor): cada estado de la suscripción', () => {
  assert.deepEqual(P.stateFromSubscriber({ subscriber: { entitlements: {}, subscriptions: {} } }, { now: NOW }), { ...P.NONE });
  assert.deepEqual(P.stateFromSubscriber(null, { now: NOW }), { ...P.NONE }, 'una respuesta rara no da Premium');

  const trial = stateOf({ period: 'trial', exp: NOW + 7 * D, product: 'frostpom_premium:anual', sandbox: true });
  assert.deepEqual(trial, { premium: true, status: 'trial', store: 'play_store', product: 'frostpom_premium:anual', period_type: 'trial', expires_at: iso(NOW + 7 * D), will_renew: true, billing_issue: false, sandbox: true });

  const active = stateOf({});
  assert.equal(active.status, 'active');
  assert.ok(active.premium && active.will_renew);

  const cancelled = stateOf({ unsub: NOW - D });
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.premium && !cancelled.will_renew, 'canceló: sigue siendo Premium hasta la fecha, sin renovar');

  const trialCancelled = stateOf({ period: 'trial', exp: NOW + 3 * D, unsub: NOW - H });
  assert.equal(trialCancelled.status, 'trial');
  assert.equal(trialCancelled.will_renew, false, 'canceló en la prueba gratis: no se cobrará');

  const grace = stateOf({ exp: NOW + 2 * D, issue: NOW - D });
  assert.ok(grace.premium && grace.status === 'grace' && grace.billing_issue, 'falló el pago: período de gracia');
  const grace2 = stateOf({ exp: NOW - H, grace: NOW + 3 * D, issue: NOW - D });
  assert.ok(grace2.premium && grace2.status === 'grace');
  assert.equal(grace2.expires_at, iso(NOW + 3 * D), 'en gracia, vence al final de la gracia');

  const hold = stateOf({ exp: NOW - D, issue: NOW - 5 * D });
  assert.ok(!hold.premium && hold.status === 'on_hold' && !hold.will_renew, 'en espera: sin Premium');

  const expired = stateOf({ exp: NOW - D, unsub: NOW - 10 * D });
  assert.ok(!expired.premium && expired.status === 'expired');
  const expired2 = stateOf({ exp: NOW - D, issue: NOW - 5 * D, unsub: NOW - 2 * D });
  assert.equal(expired2.status, 'expired', 'en espera y después canceló: vencido');

  const refunded = stateOf({ exp: NOW - H, refunded: NOW - H });
  assert.ok(!refunded.premium && refunded.status === 'refunded');

  const forever = stateOf({ exp: null, product: 'rc_promo_premium_lifetime', store: 'promotional' });
  assert.ok(forever.premium && forever.expires_at === null && forever.status === 'active', 'un regalo de por vida');

  assert.equal(P.stateFromSubscriber(subscriber({ exp: NOW + D }), { now: NOW + 2 * D }).premium, false, 'cuenta la hora de ahora');
  assert.ok(P.STATUSES.includes(trial.status) && P.STATUSES.includes(hold.status));
});

test('premium (servidor): a quién toca un aviso', () => {
  assert.deepEqual(P.usersOfEvent({ app_user_id: PAU.toUpperCase() }), [PAU]);
  assert.deepEqual(P.usersOfEvent({ app_user_id: '$RCAnonymousID:abc' }), [], 'los ids anónimos de RevenueCat no son cuentas');
  assert.deepEqual(P.usersOfEvent({ type: 'TRANSFER', transferred_from: [PAU, '$RCAnonymousID:x'], transferred_to: [OTRA] }), [PAU, OTRA]);
  assert.deepEqual(P.usersOfEvent(null), []);
  assert.ok(P.sameSecret('clave-larga', 'clave-larga'));
  assert.ok(!P.sameSecret('clave-larg', 'clave-larga'));
  assert.ok(!P.sameSecret('', ''), 'sin clave configurada nunca coincide');
});

/** Un fetch simulado: RevenueCat, la base de datos y /auth/v1/user. */
function fakeNet({ subs = {}, rcStatus = 200, gate = true, users = {}, applied = [] } = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
      if (rcStatus !== 200) return res(rcStatus, { message: 'no' });
      const id = decodeURIComponent(u.split('/').pop());
      return res(200, subs[id] || { request_date_ms: NOW, subscriber: { entitlements: {}, subscriptions: {} } });
    }
    if (u === 'https://proj.supabase.co/rest/v1/rpc/billing_apply') {
      const body = JSON.parse(opts.body);
      applied.push(body);
      return res(200, /^[0-9a-f-]{36}$/.test(body.p_user));
    }
    if (u === 'https://proj.supabase.co/rest/v1/rpc/billing_sync_gate') return res(200, gate);
    if (u === 'https://proj.supabase.co/auth/v1/user') {
      const tk = String(opts.headers.Authorization || '').replace('Bearer ', '');
      return users[tk] ? res(200, users[tk]) : res(401, { msg: 'bad jwt' });
    }
    return res(404, {});
  };
  return { fetch, calls, applied };
}
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_xxx' }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_yyy' }),
  RC_SECRET_KEY: 'sk_rc_test',
  RC_WEBHOOK_AUTH: 'una-clave-muy-larga-al-azar',
};
const envOf = (extra = {}) => (n) => ({ ...ENV, ...extra })[n] || '';
const hook = (body, auth = 'Bearer una-clave-muy-larga-al-azar', method = 'POST') => new Request('https://proj.supabase.co/functions/v1/rc-webhook', {
  method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
});

test('rc-webhook: solo con la clave, y nunca le cree al aviso', async () => {
  const net = fakeNet({ subs: { [PAU]: subscriber({ period: 'trial', exp: Date.now() + 7 * D }) } });
  const deps = { env: envOf(), fetch: net.fetch };
  // El aviso dice "EXPIRATION", pero lo que manda es lo que RevenueCat responde ahora
  const event = { event: { id: 'evt-1', type: 'EXPIRATION', app_user_id: PAU, environment: 'SANDBOX' } };
  assert.equal((await P.handleWebhook(hook(event, 'Bearer otra-clave'), deps)).status, 401);
  assert.equal((await P.handleWebhook(hook(event, ''), deps)).status, 401);
  assert.equal((await P.handleWebhook(hook(event, 'Bearer x'), { env: envOf({ RC_WEBHOOK_AUTH: '' }), fetch: net.fetch })).status, 500, 'sin clave configurada no acepta nada');
  assert.equal((await P.handleWebhook(hook(null, undefined, 'GET'), deps)).status, 405);
  assert.equal(net.applied.length, 0, 'nada se guardó sin la clave');

  const r = await P.handleWebhook(hook(event), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, users: 1 });
  assert.equal(net.applied.length, 1);
  assert.equal(net.applied[0].p_user, PAU);
  assert.equal(net.applied[0].p_state.status, 'trial', 'se guarda lo que dice RevenueCat, no el tipo del aviso');
  assert.deepEqual(net.applied[0].p_event, { id: 'evt-1', type: 'EXPIRATION', environment: 'SANDBOX' });
  const rc = net.calls.find((c) => c.url.includes('revenuecat'));
  assert.equal(rc.opts.headers.Authorization, 'Bearer sk_rc_test');
  const db = net.calls.find((c) => c.url.includes('billing_apply'));
  assert.equal(db.opts.headers.apikey, 'sb_secret_xxx');
  assert.equal(db.opts.headers.Authorization, undefined, 'la clave nueva va solo en apikey (no es un JWT)');
  // La clave en RevenueCat se puede escribir con o sin "Bearer"
  assert.equal((await P.handleWebhook(hook(event, 'una-clave-muy-larga-al-azar'), deps)).status, 200);
});

test('rc-webhook: transferencias, avisos de prueba y fallas', async () => {
  const net = fakeNet({ subs: { [OTRA]: subscriber({}) } });
  const deps = { env: envOf(), fetch: net.fetch };
  const tr = await P.handleWebhook(hook({ event: { id: 'evt-t', type: 'TRANSFER', transferred_from: [PAU], transferred_to: [OTRA] } }), deps);
  assert.equal(tr.status, 200);
  assert.deepEqual(net.applied.map((a) => [a.p_user, a.p_state.premium]), [[PAU, false], [OTRA, true]], 'la compra pasa de una cuenta a la otra');

  const test0 = await P.handleWebhook(hook({ event: { id: 'evt-test', type: 'TEST', app_user_id: '$RCAnonymousID:abc' } }), deps);
  assert.equal(test0.status, 200);
  assert.deepEqual(net.applied.at(-1), { p_user: '$RCAnonymousID:abc', p_state: {}, p_event: { id: 'evt-test', type: 'TEST', environment: '' } });
  assert.ok(!net.calls.some((c) => c.url.includes('RCAnonymousID')), 'por un id anónimo no se le pregunta a RevenueCat');

  // El aviso de prueba de RevenueCat trae un id con forma de cuenta: igual solo se anota
  const before = net.calls.length;
  assert.equal((await P.handleWebhook(hook({ event: { id: 'evt-t2', type: 'TEST', app_user_id: PAU } }), deps)).status, 200);
  assert.ok(!net.calls.slice(before).some((c) => c.url.includes('revenuecat')), 'el aviso de prueba no le pregunta a RevenueCat');
  assert.equal((await P.handleWebhook(hook({ nada: 1 }), deps)).status, 400);
  const down = fakeNet({ rcStatus: 503 });
  const r = await P.handleWebhook(hook({ event: { id: 'e', type: 'RENEWAL', app_user_id: PAU } }), { env: envOf(), fetch: down.fetch });
  assert.equal(r.status, 502, 'si RevenueCat falla, se responde error para que vuelva a intentar');
  assert.equal(down.applied.length, 0);
});

test('premium-sync: solo tu propia cuenta con correo, con límite de uso', async () => {
  const users = { 'jwt-pau': { id: PAU, is_anonymous: false }, 'jwt-anon': { id: OTRA, is_anonymous: true } };
  const req = (token, method = 'POST') => new Request('https://proj.supabase.co/functions/v1/premium-sync', {
    method, headers: token ? { Authorization: `Bearer ${token}`, apikey: 'sb_publishable_yyy' } : {},
  });
  const net = fakeNet({ users, subs: { [PAU]: subscriber({ period: 'trial', exp: Date.now() + 7 * D }) } });
  const deps = { env: envOf(), fetch: net.fetch };

  const pre = await P.handleSync(req('', 'OPTIONS'), deps);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /authorization/);

  assert.equal((await P.handleSync(req(''), deps)).status, 401);
  assert.equal((await P.handleSync(req('jwt-falso'), deps)).status, 401);
  assert.equal((await P.handleSync(req('jwt-anon'), deps)).status, 403, 'las cuentas anónimas no tienen Premium pagado');
  assert.equal(net.applied.length, 0);

  const ok = await P.handleSync(req('jwt-pau'), deps);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.status, 'trial');
  assert.equal(body.premium, true);
  assert.equal(body.saved, true);
  assert.equal(body.management_url, 'https://play.google.com/store/account/subscriptions');
  assert.equal(net.applied[0].p_user, PAU, 'se revisa la cuenta de la sesión, nunca otra');
  const who = net.calls.find((c) => c.url.endsWith('/auth/v1/user'));
  assert.equal(who.opts.headers.apikey, 'sb_publishable_yyy');

  const slow = fakeNet({ users, gate: false });
  assert.equal((await P.handleSync(req('jwt-pau'), { env: envOf(), fetch: slow.fetch })).status, 429, 'dos veces seguidas: espera');
  assert.ok(!slow.calls.some((c) => c.url.includes('revenuecat')));
});

test('premium-sync: también con las claves de antes (service_role)', async () => {
  const net = fakeNet({ users: { 'jwt-pau': { id: PAU } } });
  const env = (n) => ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy', SUPABASE_ANON_KEY: 'eyJ.anon', RC_SECRET_KEY: 'sk' })[n] || '';
  const r = await P.handleSync(new Request('https://x/functions/v1/premium-sync', { method: 'POST', headers: { Authorization: 'Bearer jwt-pau' } }), { env, fetch: net.fetch });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'none');
  const db = net.calls.find((c) => c.url.includes('billing_apply'));
  assert.equal(db.opts.headers.Authorization, 'Bearer eyJ.legacy', 'la clave de antes (JWT) va también en Authorization');
});

test('premium (servidor): los archivos para pegar en Supabase están al día', () => {
  for (const name of ['rc-webhook', 'premium-sync']) {
    const file = readFileSync(new URL(`../server/supabase/functions/pegar-en-supabase/${name}.ts`, import.meta.url), 'utf8');
    assert.equal(file, pasteFile(name), `corre: node tools/edge-pegar.mjs (${name})`);
    assert.ok(!/sk_|sb_secret_[a-z0-9]{6}|eyJhbGci/i.test(file.replace(/sk_…|sb_secret_…/g, '')), 'ninguna clave dentro del código');
  }
});
