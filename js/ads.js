/*
 * FrostPom — anuncios de Google AdMob (v4.5.3), SOLO en la app de Android.
 *
 * Las reglas (quién, cuántos, cuándo) están en js/ad-rules.js; este archivo habla con el
 * complemento @capacitor-community/admob. Decisiones del autor y paso a paso: docs/ANUNCIOS.md
 *
 *  - En la web y en Microsoft Store no hay anuncios: aquí nada hace nada.
 *  - Menores de 13 y edad desconocida: la app NUNCA inicia AdMob ni pide anuncios (Google recoge
 *    el identificador de publicidad al pedir un anuncio; así nunca se pide para ellos).
 *  - Al abrir la app (13+): primero el mensaje de consentimiento de Google (solo donde la ley lo
 *    pide, como Europa), después se inicia AdMob. Menores de 18 o sin saber la edad: anuncios no
 *    personalizados (npa) y de contenido apto para su edad.
 *  - config.ads.enabled = false (o sin el complemento): nada de anuncios, y los botones de
 *    "Ver un anuncio" no aparecen.
 *  - Ningún error de aquí puede romper la app: si algo falla, simplemente no hay anuncio.
 */
import { config } from './config.js';
import * as NATIVE from './native.js';
import * as R from './ad-rules.js';

// Las unidades de PRUEBA de Google (siempre dan anuncios de prueba)
export const TEST_IDS = Object.freeze({
  app: 'ca-app-pub-3940256099942544~3347511713',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
});

const cfg = () => config.ads || {};
const KEY = 'st2_ads'; // contadores de hoy (ad-rules.js)
const KEY_REVIVE = 'st2_ads_revive'; // avance de "revivir con anuncios" { pet: {id, n}, streak: {id, n} }

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio: no pasa nada */ } };
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let plugin = null;
let who = null; // la audiencia de la cuenta con la que se inició (ad-rules.audience)
let started = false;
let starting = null;
let privacyRequired = false;

/** ¿Esta versión de la app puede mostrar anuncios? (config encendida y app de Android) */
export const enabled = () => !!cfg().enabled && NATIVE.isAndroid();
/** ¿Ya se inició AdMob para esta cuenta? */
export const ready = () => started && !!plugin;

function unit(kind) {
  const id = cfg()[`${kind}Id`];
  return cfg().testing || !id ? TEST_IDS[kind] : id;
}
const adOptions = (kind) => ({ adId: unit(kind), isTesting: !!cfg().testing, npa: !who || who.under18 });

/**
 * Al abrir la app (y con la cuenta lista): consentimiento y AdMob. Devuelve true si se pueden
 * pedir anuncios. Se puede llamar varias veces (lo hace una sola).
 */
export function start(account) {
  if (started) return Promise.resolve(true);
  if (starting) return starting;
  const aud = R.audience(account);
  if (!enabled() || !aud) return Promise.resolve(false);
  starting = (async () => {
    const box = await NATIVE.adMob(); // { api } (ver native.js: el complemento no se puede "esperar" solo)
    plugin = box ? box.api : null;
    if (!plugin) return false;
    let info = await plugin.requestConsentInfo({ tagForUnderAgeOfConsent: aud.under16 });
    if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') info = await plugin.showConsentForm();
    privacyRequired = !!info && info.privacyOptionsRequirementStatus === 'REQUIRED';
    if (!info || !info.canRequestAds) return false;
    await plugin.initialize({
      tagForChildDirectedTreatment: false, // la app nunca inicia AdMob para menores de 13
      tagForUnderAgeOfConsent: aud.under16,
      maxAdContentRating: aud.under18 ? 'ParentalGuidance' : 'Teen',
    });
    who = aud;
    started = true;
    return true;
  })().catch((e) => {
    console.info('[FrostPom] AdMob no se pudo iniciar:', (e && e.message) || e);
    return false;
  }).finally(() => { starting = null; });
  return starting;
}

/** ¿Hay que mostrar "Opciones de privacidad de los anuncios" en Ajustes? (Europa y similares) */
export const privacyOptions = () => ready() && privacyRequired;
export async function showPrivacyOptions() {
  try { if (plugin) await plugin.showPrivacyOptionsForm(); } catch { /* nada */ }
}

// ---------------------------------------------------------------------
// Anuncios con recompensa (la persona elige verlos)
// ---------------------------------------------------------------------
/**
 * ¿Se puede ofrecer un anuncio con recompensa? reason: 'gems' | 'pet' | 'streak'.
 * Premium también puede (decisión del autor), y para ganar gemas hay un límite al día.
 */
export function canReward(reason) {
  if (!ready()) return false;
  if (reason === 'gems') return gemAdsLeft() > 0;
  return true;
}

let rewardPrep = null; // el que ya se está cargando (para que salga más rápido)
let rewardAt = 0;
const PREP_TTL_MS = 50 * 60_000; // Google los da por 1 hora: se cambian antes
/** Empieza a cargar un anuncio con recompensa (al abrir la tienda o la racha apagada). */
export function warmRewarded() {
  if (!ready() || (rewardPrep && Date.now() - rewardAt < PREP_TTL_MS)) return;
  rewardAt = Date.now();
  const p = plugin.prepareRewardVideoAd(adOptions('rewarded'));
  rewardPrep = p;
  p.catch(() => { if (rewardPrep === p) rewardPrep = null; });
}

/**
 * Muestra un anuncio con recompensa. Devuelve { ok: true } SOLO si se vio completo; si no,
 * { ok: false, reason: 'off' | 'load' | 'cancel' }.
 */
export async function showRewarded() {
  if (!ready()) return { ok: false, reason: 'off' };
  try {
    warmRewarded();
    await rewardPrep;
  } catch {
    rewardPrep = null;
    return { ok: false, reason: 'load' };
  }
  rewardPrep = null;
  try {
    const item = await plugin.showRewardVideoAd();
    return { ok: true, item };
  } catch (e) {
    return { ok: false, reason: /cancel/i.test(String((e && (e.code || e.message)) || '')) ? 'cancel' : 'show' };
  }
}

// Ganar gemas: hasta 5 al día
export const gemAdsLeft = () => R.gemAdsLeft(read(KEY), dayKey());
export const gemsPerAd = () => R.rules().gemsPerAd;
export function noteGemAd() { write(KEY, R.gemAdSeen(read(KEY), dayKey())); }

// Revivir con anuncios: el avance se guarda (por mascota muerta y por racha apagada)
export function reviveProgress(kind, id) {
  const all = read(KEY_REVIVE) || {};
  const p = all[kind];
  return p && p.id === id ? Math.max(0, p.n | 0) : 0;
}
export function noteReviveAd(kind, id) {
  const all = read(KEY_REVIVE) || {};
  const n = reviveProgress(kind, id) + 1;
  write(KEY_REVIVE, { ...all, [kind]: { id, n } });
  return n;
}
export function clearRevive(kind) {
  const all = read(KEY_REVIVE) || {};
  delete all[kind];
  write(KEY_REVIVE, all);
}
export const petReviveAds = () => R.rules().petReviveAds;

// ---------------------------------------------------------------------
// Pantalla completa al empezar el descanso
// ---------------------------------------------------------------------
let interPrep = null;
let interAt = 0;
const INTER_TTL_MS = PREP_TTL_MS;

/** Terminó un pomodoro completo aquí: se anota (para saber cuándo toca el anuncio). */
export function noteStudy(sec) {
  write(KEY, R.noteStudy(read(KEY), dayKey(), sec));
}

/** ¿Toca el anuncio de pantalla completa ahora? Nunca con Premium. */
export function interstitialDue(premium) {
  return ready() && !premium && R.interstitialDue(read(KEY), dayKey());
}

/**
 * Empieza a cargar el anuncio de pantalla completa (al empezar un pomodoro que podría
 * terminar en anuncio), para que al empezar el descanso ya esté listo.
 */
export function warmInterstitial(premium, plannedSec = 0) {
  if (!ready() || premium) return;
  if (interPrep && Date.now() - interAt < INTER_TTL_MS) return;
  const after = R.noteStudy(read(KEY), dayKey(), plannedSec);
  if (!R.interstitialDue(after, dayKey())) return;
  interAt = Date.now();
  const p = plugin.prepareInterstitial(adOptions('interstitial'));
  interPrep = p;
  p.catch(() => { if (interPrep === p) interPrep = null; });
}

/**
 * Muestra el anuncio de pantalla completa y espera a que se cierre (así el descanso empieza
 * después, sin perder ni un segundo). Si no está listo, no se muestra (no se hace esperar a nadie).
 */
export async function showInterstitial() {
  if (!ready() || !interPrep || Date.now() - interAt >= INTER_TTL_MS) return false;
  try { await interPrep; } catch { interPrep = null; return false; }
  interPrep = null;
  const handles = [];
  let finish = () => {};
  const closed = new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(false), 180_000);
    finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const hd of handles) { try { hd.remove(); } catch { /* nada */ } }
      resolve(ok);
    };
  });
  try {
    handles.push(await plugin.addListener('interstitialAdDismissed', () => finish(true)));
    handles.push(await plugin.addListener('interstitialAdFailedToShow', () => finish(false)));
    await plugin.showInterstitial();
  } catch {
    finish(false);
  }
  const ok = await closed;
  if (ok) write(KEY, R.interstitialShown(read(KEY), dayKey()));
  return ok;
}

/** Para las pruebas: olvidar todo lo de esta sesión. */
export function _reset() { plugin = null; who = null; started = false; starting = null; rewardPrep = null; interPrep = null; privacyRequired = false; }
