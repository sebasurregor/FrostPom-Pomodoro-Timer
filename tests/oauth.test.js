/*
 * (v4.9.0) Entrar con Google, Microsoft, Discord (js/oauth.js): PKCE, direcciones y el inicio de
 * sesión en curso. Ejecuta: node --test tests/ (o npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as O from '../js/oauth.js';
import { config } from '../js/config.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('oauth: los proveedores vienen apagados y solo se muestran los encendidos', () => {
  assert.deepEqual(O.IDS, ['google', 'azure', 'discord', 'facebook']);
  assert.deepEqual(O.enabledProviders(), [], 'los zips salen con todos apagados (se encienden al configurarlos en Supabase)');
  for (const id of O.IDS) assert.equal(config.accounts.oauth[id], false);
  const cfg = { cloud: { url: 'https://x.supabase.co', key: 'k' }, accounts: { online: true, oauth: { google: true, discord: true } } };
  assert.deepEqual(O.enabledProviders(cfg).map((p) => p.id), ['google', 'discord']);
  assert.deepEqual(O.enabledProviders({ ...cfg, accounts: { online: false, oauth: { google: true } } }), [], 'sin cuentas en línea no hay a dónde entrar');
  assert.deepEqual(O.enabledProviders({ ...cfg, cloud: { url: '', key: '' } }), []);
});

test('oauth: PKCE (el secreto y su huella S256)', async () => {
  const v = O.randomVerifier();
  assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(v, O.randomVerifier(), 'cada vez uno nuevo');
  const want = createHash('sha256').update(v).digest('base64url');
  assert.equal(await O.challengeFor(v), want);
});

test('oauth: la dirección de Supabase y el regreso', () => {
  assert.equal(O.redirectUrl({ native: true }), 'com.startupprometeus.frostpom://login-callback');
  assert.equal(O.redirectUrl({ href: 'https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/?code=1#/enfocar' }), 'https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/');
  const u = new URL(O.authorizeUrl({ base: 'https://abc.supabase.co', provider: 'azure', redirect: O.NATIVE_REDIRECT, challenge: 'CH' }));
  assert.equal(u.pathname, '/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'), 'azure');
  assert.equal(u.searchParams.get('redirect_to'), O.NATIVE_REDIRECT);
  assert.equal(u.searchParams.get('code_challenge'), 'CH');
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  assert.equal(u.searchParams.get('scopes'), 'email', 'Microsoft solo manda el correo si se pide');
  assert.equal(O.authorizeUrl({ base: 'https://abc.supabase.co', provider: 'twitter', redirect: 'x', challenge: 'y' }), '', 'un proveedor desconocido no');

  assert.deepEqual(O.parseReturn('com.startupprometeus.frostpom://login-callback?code=9f2c1a7e-1111-2222-3333-444455556666'), { code: '9f2c1a7e-1111-2222-3333-444455556666' });
  assert.deepEqual(O.parseReturn('https://app/?error=access_denied&error_description=El%20usuario%20cancel%C3%B3'), { error: 'access_denied', description: 'El usuario canceló' });
  assert.equal(O.parseReturn('https://app/#/enfocar'), null, 'una página normal no es un regreso');
  assert.equal(O.parseReturn('https://app/?code=<script>'), null, 'un código raro no se usa');
  assert.ok(O.isNativeReturn('com.startupprometeus.frostpom://login-callback?code=x'));
  assert.ok(!O.isNativeReturn('https://evil.example/?code=x'));
  assert.equal(O.cleanHref('https://app/p/?code=abc&x=1#/ranking'), 'https://app/p/?x=1#/ranking');
});

test('oauth: el inicio de sesión en curso (se guarda antes de salir y caduca)', () => {
  const s = memory();
  const now = Date.parse('2026-11-22T15:00:00Z');
  const v = O.randomVerifier();
  O.savePending(s, { provider: 'google', verifier: v, intent: 'join', birth: '2005-03', country: 'CO', keep: false }, now);
  const p = O.loadPending(s, now + 60_000);
  assert.deepEqual({ ...p, at: 0 }, { provider: 'google', verifier: v, intent: 'join', birth: '2005-03', country: 'CO', keep: false, at: 0 });
  assert.equal(O.loadPending(s, now + O.PENDING_MS + 1), null, 'caduca a los 15 minutos');
  O.savePending(s, { provider: 'google', verifier: v, intent: 'hack', birth: 'x' }, now);
  assert.equal(O.loadPending(s, now).intent, 'signin', 'un intent raro se vuelve "entrar"');
  assert.equal(O.loadPending(s, now).birth, '');
  O.clearPending(s);
  assert.equal(O.loadPending(s, now), null);
  s.setItem(O.PENDING_KEY, '{"provider":"google","verifier":"corto","at":1}');
  assert.equal(O.loadPending(s, 2), null, 'un secreto demasiado corto no vale');
});
