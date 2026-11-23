// @ts-nocheck
// FrostPom (v4.7.0) — Edge Function "rc-webhook": el aviso de RevenueCat cuando cambia una suscripción.
// ARCHIVO GENERADO por tools/edge-pegar.mjs desde server/supabase/functions/_shared/premium.js.
// No lo edites aquí: cambia premium.js y vuelve a correr  node tools/edge-pegar.mjs
// Cómo usarlo: Supabase → Edge Functions → Deploy a new function → Via Editor → nombre
// "rc-webhook" → borra lo que trae y pega TODO este archivo → Deploy. Después, en Details,
// apaga "Verify JWT with legacy secret" (o "Enforce JWT verification"). docs/GOOGLE-PLAY-BILLING.md

/*
 * FrostPom (v4.7.0) — lo que comparten las Edge Functions de Premium (rc-webhook y premium-sync).
 *
 * Por qué JavaScript simple y sin librerías: así lo usa Supabase (Deno) y también Node, donde
 * corren las pruebas (tests/billing-server.test.js). Las funciones reciben `env` (leer un secreto
 * por su nombre) y `fetch`, para poder probarlas sin internet.
 *
 * Cómo funciona (docs/GOOGLE-PLAY-BILLING.md):
 *  1. RevenueCat verifica cada compra con Google y, cuando algo cambia (compra, renovación,
 *     cancelación, reembolso…), avisa a rc-webhook.
 *  2. rc-webhook NO le cree al aviso: le pregunta a RevenueCat por la persona (GET /v1/subscribers,
 *     con la clave secreta de RevenueCat) y guarda el resultado con billing_apply (clave secreta de
 *     Supabase). Así un aviso falso, viejo o repetido nunca da Premium.
 *  3. premium-sync hace lo mismo cuando la app lo pide (justo después de comprar o restaurar), para
 *     no depender de que el aviso llegue rápido. Solo para la persona dueña de la sesión.
 *
 * Secretos (Supabase → Edge Functions → Secrets). NUNCA en la app, el repositorio ni el chat:
 *  - RC_SECRET_KEY    la clave secreta de RevenueCat (sk_…)
 *  - RC_WEBHOOK_AUTH  una clave larga al azar; la misma que pones en RevenueCat → Webhooks
 * Supabase pone solos SUPABASE_URL y las claves del proyecto.
 */

export const ENTITLEMENT = 'premium';
export const STATUSES = Object.freeze(['none', 'trial', 'active', 'cancelled', 'grace', 'on_hold', 'expired', 'refunded']);
const RC_API = 'https://api.revenuecat.com/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es el id de una cuenta de FrostPom (el de Supabase)? Los ids anónimos de RevenueCat no. */
export const isAppUser = (id) => typeof id === 'string' && UUID.test(id);

const ms = (iso) => {
  if (iso === null || iso === undefined || iso === '') return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const iso = (t) => (Number.isFinite(t) ? new Date(t).toISOString() : null);

/** Sin suscripción. */
export const NONE = Object.freeze({
  premium: false, status: 'none', store: null, product: null, period_type: null,
  expires_at: null, will_renew: false, billing_issue: false, sandbox: false,
});

/**
 * Lo que RevenueCat dice de una persona (la respuesta de GET /v1/subscribers/{id}) convertido en
 * el estado que guarda el servidor. Una sola regla para todos los casos:
 *  - Premium = el entitlement "premium" vence en el futuro (o en el período de gracia, o nunca).
 *  - status: trial (prueba gratis), active, cancelled (canceló pero le queda tiempo), grace (falló
 *    el pago y Google reintenta: sigue siendo Premium), on_hold (en espera: sin Premium hasta que
 *    arregle el pago), expired, refunded (reembolsado) o none (nunca se suscribió).
 */
export function stateFromSubscriber(body, { entitlement = ENTITLEMENT, now } = {}) {
  const sub = (body && body.subscriber) || {};
  const t = Number.isFinite(now) ? now : (Number(body && body.request_date_ms) || Date.now());
  const ent = (sub.entitlements || {})[entitlement];
  if (!ent || typeof ent !== 'object') return { ...NONE };
  const product = typeof ent.product_identifier === 'string' ? ent.product_identifier : null;
  const s = (product && (sub.subscriptions || {})[product]) || {};
  // (v4.9.0) Premium de por vida: es una compra de una sola vez (non_subscriptions), no una suscripción
  const once = product && Array.isArray((sub.non_subscriptions || {})[product]) ? sub.non_subscriptions[product].slice(-1)[0] || {} : {};
  const lifetime = ent.expires_date === null || ent.expires_date === undefined;
  const exp = ms(ent.expires_date);
  const grace = ms(ent.grace_period_expires_date) ?? ms(s.grace_period_expires_date);
  const until = lifetime ? Infinity : Math.max(exp ?? -Infinity, grace ?? -Infinity);
  const premium = until > t;
  const refunded = !!s.refunded_at;
  const issue = !!s.billing_issues_detected_at;
  const unsub = !!s.unsubscribe_detected_at;
  let status;
  if (premium) {
    if (issue || (exp !== null && exp <= t)) status = 'grace';
    else if (s.period_type === 'trial') status = 'trial';
    else if (unsub) status = 'cancelled';
    else status = 'active';
  } else if (refunded) status = 'refunded';
  else if (issue && !unsub) status = 'on_hold';
  else status = 'expired';
  return {
    premium,
    status,
    store: typeof s.store === 'string' ? s.store : typeof once.store === 'string' ? once.store : null,
    product,
    period_type: typeof s.period_type === 'string' ? s.period_type : null,
    expires_at: lifetime ? null : iso(until),
    will_renew: premium && !lifetime && !unsub && !refunded, // (v4.9.0) lo de por vida no se "renueva"
    billing_issue: issue,
    sandbox: s.is_sandbox === true || once.is_sandbox === true,
  };
}

/** Las cuentas de FrostPom que toca un aviso (en una transferencia, las dos). */
export function usersOfEvent(event) {
  const e = event || {};
  const all = [e.app_user_id, ...(Array.isArray(e.transferred_from) ? e.transferred_from : []),
    ...(Array.isArray(e.transferred_to) ? e.transferred_to : [])];
  return [...new Set(all.filter(isAppUser).map((x) => x.toLowerCase()))];
}

/** Compara dos claves sin dar pistas por el tiempo que tarda. */
export function sameSecret(got, want) {
  const a = new TextEncoder().encode(String(got || ''));
  const b = new TextEncoder().encode(String(want || ''));
  if (!b.length) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** El valor de la cabecera Authorization, con o sin "Bearer ". */
const bearer = (req) => String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

/** Una clave del proyecto: primero las nuevas (sb_secret_… / sb_publishable_…), luego las de antes. */
function projectKey(env, kind) {
  const json = env(kind === 'secret' ? 'SUPABASE_SECRET_KEYS' : 'SUPABASE_PUBLISHABLE_KEYS');
  if (json) {
    try {
      const keys = JSON.parse(json);
      const k = keys.default || Object.values(keys)[0];
      if (k) return String(k);
    } catch { /* se usa la de antes */ }
  }
  return env(kind === 'secret' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY') || '';
}

/**
 * Cabeceras para hablar con Supabase con una clave del proyecto. Las claves nuevas van SOLO en
 * "apikey" (no son JWT); las de antes (eyJ…) también en Authorization.
 */
function keyHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

const fail = (code, status = 500) => Object.assign(new Error(code), { code, status });

/** Pregunta a RevenueCat por una persona. Lanza un error si RevenueCat no responde bien. */
export async function fetchSubscriber(id, { env, fetch }) {
  const key = env('RC_SECRET_KEY');
  if (!key) throw fail('rc_not_configured');
  let res;
  try {
    res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}`, 'X-Platform': 'android', Accept: 'application/json' },
    });
  } catch {
    throw fail('rc_unreachable', 502);
  }
  if (!res.ok) throw fail(`rc_${res.status}`, 502);
  return res.json();
}

/** Llama una función de la base de datos con la clave secreta (rol service_role). */
async function rpc(fn, args, { env, fetch }) {
  const url = env('SUPABASE_URL');
  const key = projectKey(env, 'secret');
  if (!url || !key) throw fail('supabase_not_configured');
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: keyHeaders(key), body: JSON.stringify(args) });
  } catch {
    throw fail('db_unreachable', 502);
  }
  if (!res.ok) throw fail(`db_${res.status}`, 502);
  return res.json();
}

/** Pregunta a RevenueCat y guarda el resultado. Devuelve el estado (y management_url). */
export async function syncUser(id, event, deps) {
  const body = await fetchSubscriber(id, deps);
  const state = stateFromSubscriber(body);
  const saved = await rpc('billing_apply', { p_user: id, p_state: state, p_event: event || null }, deps);
  const sub = (body && body.subscriber) || {};
  return { ...state, saved: saved === true, management_url: typeof sub.management_url === 'string' ? sub.management_url : null };
}

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...extra },
});

// ---------------------------------------------------------------------
// rc-webhook: el aviso de RevenueCat
// ---------------------------------------------------------------------
/**
 * Responde 200 si se guardó (o si el aviso no es de una cuenta de FrostPom); 401 sin la clave;
 * 500/502 si algo falló (RevenueCat vuelve a intentar varias veces).
 */
export async function handleWebhook(req, deps) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const want = deps.env('RC_WEBHOOK_AUTH');
  if (!want) return json({ error: 'not_configured' }, 500); // sin clave, nunca se acepta nada
  if (!sameSecret(bearer(req), want.replace(/^Bearer\s+/i, '').trim())) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const event = body && body.event;
  if (!event || typeof event !== 'object') return json({ error: 'no_event' }, 400);
  const meta = { id: String(event.id || ''), type: String(event.type || '?'), environment: String(event.environment || '') };
  // El aviso de prueba de RevenueCat ("Send test event") trae un id inventado: solo se anota
  const users = meta.type === 'TEST' ? [] : usersOfEvent(event);
  try {
    if (!users.length) {
      // Un aviso de prueba o de un id que no es de FrostPom: solo se anota
      await rpc('billing_apply', { p_user: String(event.app_user_id || ''), p_state: {}, p_event: meta }, deps);
      return json({ ok: true, users: 0 });
    }
    for (const id of users) await syncUser(id, meta, deps);
    return json({ ok: true, users: users.length });
  } catch (e) {
    console.error('[rc-webhook]', meta.type, e.code || e.message);
    return json({ error: e.code || 'error' }, e.status || 500);
  }
}

// ---------------------------------------------------------------------
// premium-sync: la app pide "revisa mi Premium" (después de comprar o restaurar)
// ---------------------------------------------------------------------
export const CORS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
});

/** ¿De quién es esta sesión? (Supabase revisa la firma del token.) null si no sirve. */
async function sessionUser(token, { env, fetch }) {
  const url = env('SUPABASE_URL');
  const key = projectKey(env, 'publishable') || projectKey(env, 'secret');
  if (!url || !key || !token) return null;
  let res;
  try {
    res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  } catch {
    throw fail('auth_unreachable', 502);
  }
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && isAppUser(u.id) ? u : null;
}

export async function handleSync(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, CORS);
  try {
    const user = await sessionUser(bearer(req), deps);
    if (!user) return json({ error: 'auth' }, 401, CORS);
    if (user.is_anonymous) return json({ error: 'account_required' }, 403, CORS);
    const id = user.id.toLowerCase();
    const allowed = await rpc('billing_sync_gate', { p_user: id }, deps);
    if (allowed !== true) return json({ error: 'rate' }, 429, CORS);
    const st = await syncUser(id, null, deps);
    return json(st, 200, CORS);
  } catch (e) {
    console.error('[premium-sync]', e.code || e.message);
    return json({ error: e.code || 'error' }, e.status || 500, CORS);
  }
}

// ---------------------------------------------------------------------
Deno.serve((req) => handleWebhook(req, { env: (n) => Deno.env.get(n) ?? '', fetch }));
