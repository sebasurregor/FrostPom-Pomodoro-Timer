/*
 * FrostPom — (v4.5.3) los anuncios en las pantallas (solo en la app de Android, 13+).
 *
 *  - Tienda: "Ver un anuncio: +10 gemas" (hasta 5 al día; también con Premium).
 *  - Mascota muerta: "Revivir con anuncios (0 de 3)", además de las 30 gemas.
 *  - Racha apagada: 1 anuncio por cada día que faltó (js/ui/streak.js usa streakAd()).
 *  - Al empezar el descanso: pantalla completa cada 4 pomodoros o 90 min de estudio (lo que
 *    llegue primero), nunca con Premium (js/ui/focus.js usa afterStudy()).
 *  - Ajustes → Acerca de: "Opciones de privacidad de los anuncios", solo donde Google lo pide.
 *
 * Si los anuncios están apagados (config.ads.enabled) o la cuenta no puede verlos, nada de esto
 * aparece. Reglas y decisiones del autor: js/ad-rules.js y docs/ANUNCIOS.md.
 */
import * as ADS from '../ads.js';
import * as E from '../engine.js';
import * as P from '../pet.js';
import { $ } from './dom.js';
import { toast } from './feedback.js';
import { state, mutate, isPremium } from './context.js';
import { t, tr } from '../i18n.js';

/** Al abrir la app (con la cuenta lista): consentimiento y AdMob. Espera como mucho `ms`. */
export async function bootAds(ms = 4000) {
  if (!ADS.enabled()) return false;
  const ok = await Promise.race([ADS.start(state.account), new Promise((r) => setTimeout(() => r(false), ms))]);
  renderAds();
  // Si terminó de iniciarse después de la espera, se vuelve a pintar entonces
  if (!ok) ADS.start(state.account).then((later) => { if (later) renderAds(); });
  return ok;
}

/** Lo que dice "No se pudo ver el anuncio" según el motivo. */
function failText(reason) {
  if (reason === 'cancel') return tr('Cerraste el anuncio antes de terminar: esta vez no hay premio.');
  return tr('No hay un anuncio disponible ahora. Inténtalo en un rato.');
}

let busy = false;
/** Muestra un anuncio con recompensa con el botón ocupado mientras tanto. */
async function rewarded(btn) {
  if (busy) return { ok: false, reason: 'busy' };
  busy = true;
  const old = btn ? btn.disabled : false;
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    return await ADS.showRewarded();
  } finally {
    busy = false;
    if (btn) { btn.disabled = old; btn.removeAttribute('aria-busy'); }
  }
}

// ---------------------------------------------------------------------
// La tienda: ganar gemas y revivir a la mascota
// ---------------------------------------------------------------------
/** Pinta los botones de anuncios de la tienda (lo llama renderTray en feeding.js). */
export function renderTrayAds(st) {
  const row = $('#trayAdGems');
  const revive = $('#reviveAdBtn');
  if (!row || !revive) return;
  const on = ADS.ready();
  // Ganar gemas
  row.hidden = !on || st.dead;
  if (on && !st.dead) {
    const left = ADS.gemAdsLeft();
    $('#adGemsLbl').textContent = t('Ver un anuncio: +{n} gemas', { n: ADS.gemsPerAd() });
    $('#adGemsBtn').disabled = left <= 0 || busy;
    $('#adGemsLeft').textContent = left > 0 ? (left === 1 ? tr('Queda 1 hoy') : t('Quedan {n} hoy', { n: left })) : tr('Vuelve mañana por más');
  }
  // Revivir con anuncios
  revive.hidden = !on || !st.dead;
  if (on && st.dead) {
    const need = ADS.petReviveAds();
    const seen = Math.min(need, ADS.reviveProgress('pet', deathId()));
    $('#reviveAdLbl').textContent = t('Revivir con anuncios ({n} de {total})', { n: seen, total: need });
    revive.disabled = busy;
  }
}

/** Cada muerte es distinta: el avance de los anuncios vale solo para esa. */
function deathId() {
  const petId = P.currentPetId(state);
  const rec = state.pets && state.pets[petId];
  return `${petId}:${(rec && rec.dead) || P.petStatus(state, petId).diedAt || ''}`;
}

/**
 * (v4.8.0) Un anuncio para ganar gemas, desde cualquier botón (la tienda o "¿Necesitas más
 * gemas?"). Devuelve true si se vio completo y se sumaron las gemas.
 */
export async function watchGemAd(btn) {
  if (!ADS.canReward('gems')) return false;
  const r = await rewarded(btn);
  if (r.ok) {
    ADS.noteGemAd();
    mutate((s) => E.adGems(s, ADS.gemsPerAd()));
    toast(t('¡Gracias! Ganaste {n} gemas.', { n: ADS.gemsPerAd() }), 'good', { icon: '💎' });
  } else if (r.reason !== 'busy') toast(failText(r.reason), 'info');
  renderAfter();
  return r.ok;
}

async function watchForGems() {
  await watchGemAd($('#adGemsBtn'));
}

async function watchToRevive() {
  const id = deathId();
  const r = await rewarded($('#reviveAdBtn'));
  if (!r.ok) {
    if (r.reason !== 'busy') toast(failText(r.reason), 'info');
    renderAfter();
    return;
  }
  const need = ADS.petReviveAds();
  const n = ADS.noteReviveAd('pet', id);
  if (n >= need) {
    const res = mutate((s) => E.revivePet(s, new Date(), { via: 'ad' }));
    if (res.ok) ADS.clearRevive('pet');
  } else {
    toast(t('Anuncio {n} de {total}. ¡Ya casi!', { n, total: need }), 'good', { icon: '🎬' });
  }
  renderAfter();
}

function renderAfter() {
  const st = P.petStatus(state, P.currentPetId(state));
  renderTrayAds(st);
}

// ---------------------------------------------------------------------
// La racha apagada (js/ui/streak.js)
// ---------------------------------------------------------------------
/**
 * El botón "Ver un anuncio" de la racha: 1 anuncio por cada día que faltó. Devuelve null si no
 * hay anuncios, o { need, seen, watch() } (watch devuelve 'done', 'more' o el motivo del fallo).
 */
export function streakAd(lost) {
  if (!lost || !ADS.canReward('streak')) return null;
  const id = `${lost.missed[0]}:${lost.length}`;
  const need = lost.missed.length;
  return {
    need,
    seen: Math.min(need, ADS.reviveProgress('streak', id)),
    async watch(btn) {
      const r = await rewarded(btn);
      if (!r.ok) return failText(r.reason);
      const n = ADS.noteReviveAd('streak', id);
      if (n < need) return 'more';
      ADS.clearRevive('streak');
      return 'done';
    },
  };
}

// ---------------------------------------------------------------------
// Pantalla completa al empezar el descanso (js/ui/focus.js)
// ---------------------------------------------------------------------
/** Empezó un pomodoro: si al terminarlo tocará el anuncio, se carga desde ya. */
export function onFocusStart(plannedSec) {
  ADS.warmInterstitial(isPremium(), plannedSec);
}

/**
 * Terminó un pomodoro completo aquí, con la app abierta. Se anota y, si toca, se muestra el
 * anuncio. Devuelve una promesa que termina cuando se cerró (el descanso empieza después).
 */
export async function afterStudy(rec) {
  if (!ADS.ready()) return false;
  ADS.noteStudy(rec.actualSec);
  if (!ADS.interstitialDue(isPremium()) || document.visibilityState !== 'visible') return false;
  return ADS.showInterstitial();
}

// ---------------------------------------------------------------------
// Ajustes y arranque
// ---------------------------------------------------------------------
export function renderAds() {
  const row = $('#adPrivacyRow');
  if (row) row.hidden = !ADS.privacyOptions();
  const st = P.petStatus(state, P.currentPetId(state));
  renderTrayAds(st);
}

export function bindAds() {
  const g = $('#adGemsBtn');
  if (g) g.addEventListener('click', watchForGems);
  const r = $('#reviveAdBtn');
  if (r) r.addEventListener('click', watchToRevive);
  const p = $('#adPrivacyBtn');
  if (p) p.addEventListener('click', () => ADS.showPrivacyOptions());
  // Al abrir la tienda se empieza a cargar el anuncio (así sale más rápido al tocar)
  const shop = $('#shopBtn');
  if (shop) shop.addEventListener('click', () => { if (ADS.ready()) ADS.warmRewarded(); });
}

