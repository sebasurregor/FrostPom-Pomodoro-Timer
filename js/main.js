/*
 * FrostPom — arranque y navegación.
 * Aquí se conectan las piezas: qué se pinta, en qué orden, y los eventos globales
 * (cambio de ruta, otra pestaña, volver a la app, barra espaciadora).
 */
import { KEY, TIMER_KEY } from './storage.js';
import * as U from './util.js';
import * as E from './engine.js';
import { config } from './config.js';
import { seasonFor } from './season.js';
import * as FX from './ui/effects.js';
import { $, $$ } from './ui/dom.js';
import { toast, dlg } from './ui/feedback.js';
import { state, store, session, prefs, configure, reloadFromStore, mutate, today } from './ui/context.js';
import { play } from './ui/celebrations.js';
import { renderHUD, renderPole, updatePhase, bindHUD } from './ui/hud.js';
import { startChatter } from './ui/scenery.js';
import { renderPremium, maybePaywall, bindPremium, syncStorePremium } from './ui/premium.js';
import { bindSound } from './ui/sound.js';
import { checkReminder, bindReminders } from './ui/reminders.js';
import { renderTimer, renderPresets, renderToday, startOrToggle, tick, onDue, wakeLock, bindFocus, renderBuddy } from './ui/focus.js';
import { renderProgress, bindProgress } from './ui/progress.js';
import { bindActivity } from './ui/activity.js';
import { renderProfile, bindProfile } from './ui/profile.js';
import { renderRanking, bindRanking } from './ui/ranking.js';
import { bindFeeding, renderShopBtn, openTray, petLabel } from './ui/feeding.js';
import { needsSettle, currentPetId, petStatus } from './pet.js';
import { renderSettings, bindSettings } from './ui/settings.js';
import { onboarding, loginGate, createAccountFlow } from './ui/account.js';
import { t, translateDom, isEnglish } from './i18n.js';
import { applyTheme } from './ui/theme.js';
import { mountGateSnow } from './ui/gate-snow.js';
import { initSheets, renderSheetTiles } from './ui/sheets.js';
import { initPip } from './ui/pip.js';
import { bootBoard } from './ui/board-ui.js';
import { bootCloud } from './ui/cloud-ui.js';
import { bootLive } from './ui/live.js';
import { initNative, isNative } from './ui/native-ui.js';

// =====================================================================
// Pintar
// =====================================================================
const VIEWS = {
  enfocar: () => {},
  progreso: renderProgress,
  ranking: renderRanking,
  perfil: renderProfile,
  ajustes: renderSettings,
};
let currentRoute = null;

function renderAll() {
  const p = prefs();
  FX.setPrefs({ sound: state.settings.sound, vibrate: state.settings.vibrate, reduceMotion: state.settings.reduceMotion, tonePack: p.tonePack });
  // Las animaciones las decide el ajuste "Menos animaciones" de la app (ver hintReducedMotion).
  document.documentElement.classList.toggle('reduce-motion', state.settings.reduceMotion);
  applyTheme(state.settings.theme);
  renderPremium();
  renderHUD();
  renderPole();
  renderPresets();
  renderTimer();
  renderShopBtn();
  if (currentRoute) VIEWS[currentRoute]();
  renderSheetTiles(); // (v4.3) los botones de las secciones que en el celular se abren como ventana
}

// =====================================================================
// Navegación
// =====================================================================
function route(fromUser) {
  let name = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  if (name === 'tienda') { // la tienda vive en Enfocar (las gemas de la barra llevan aquí)
    history.replaceState(null, '', '#/enfocar');
    name = 'enfocar';
    setTimeout(openTray, 0);
  }
  const r = Object.hasOwn(VIEWS, name || '') ? name : 'enfocar';
  if (r === currentRoute) return;
  currentRoute = r;
  for (const v of $$('.view')) v.hidden = v.dataset.view !== r;
  const tabRoute = r === 'ajustes' ? 'perfil' : r; // Ajustes vive dentro de Perfil
  for (const t of $$('.tab')) {
    if (t.dataset.route === tabRoute) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  document.body.dataset.route = r;
  VIEWS[r]();
  renderSheetTiles();
  if (fromUser) {
    $('#main').focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
}

// =====================================================================
// Service worker (con Trusted Types: solo se permite esta URL exacta)
// =====================================================================
function registerServiceWorker() {
  // En la app de Android los archivos ya están dentro del teléfono: no hace falta (v4.1)
  if (isNative() || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  let url = './service-worker.js';
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    const policy = window.trustedTypes.createPolicy('st-sw', {
      createScriptURL: (u) => {
        if (u === './service-worker.js') return u;
        throw new TypeError('URL de service worker no permitida');
      },
    });
    url = policy.createScriptURL(url);
  }
  navigator.serviceWorker.register(url, { scope: './' }).catch(() => { /* la app sigue funcionando sin modo offline */ });
}

// =====================================================================
// Eventos globales
// =====================================================================
function bindGlobal() {
  window.addEventListener('hashchange', () => route(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tick();
    if (session.running) wakeLock(true);
    renderHUD();
    renderPole();
    renderToday();
    checkPet();
  });
  // Otra pestaña cambió los datos: nos sincronizamos.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) reloadFromStore();
    else if (e.key === TIMER_KEY) {
      session.syncFromStore();
      renderTimer();
    }
  });
  // Barra espaciadora: empezar / pausar (solo en Enfocar y fuera de campos o botones).
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || currentRoute !== 'enfocar' || dlg.open) return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(tag)) return;
    e.preventDefault();
    startOrToggle();
  });
  document.addEventListener('pointerdown', () => FX.sfx.unlock(), { once: true });
}

// =====================================================================
// Temporadas, guardado del día y animaciones
// =====================================================================
/** Si empezó una temporada nueva, se cierra la anterior (con su ceremonia). */
function checkSeason() {
  if (!state.profile.onboarded) return;
  if (state.progress.season === seasonFor(new Date(), config.season.months).id) return;
  mutate((s) => E.rolloverSeason(s, new Date(), config.season.months));
}

/**
 * Guardado automático del día: cada minuto estudiado ya se guarda al instante. Cuando cambia
 * el día, avisamos que el total de ayer quedó guardado en el calendario.
 */
function checkNewDay() {
  const now = today();
  const last = store.pref.get('last_day');
  if (last === now) return;
  store.pref.set('last_day', now);
  const d = last && U.isDateKey(last) ? state.daily[last] : null;
  if (d && d.studySec >= 60) {
    toast(t('Guardado automático: el {day} estudiaste {time}. Ya está en tu calendario.', { day: isEnglish ? U.formatDayLong(last) : U.formatDayLong(last).toLowerCase(), time: U.formatMinutes(d.studySec / 60) }), 'good', { icon: '📒', ms: 6500 });
  }
}

/**
 * (v4.2.1) En el celular, mientras escribes en un campo, el paisaje, la fogata y la nieve se quedan
 * quietos: así el teclado responde al instante (en celulares sencillos las animaciones lo frenaban).
 * Vuelven a moverse 2 segundos después de la última tecla (o al salir del campo).
 */
function watchTyping() {
  if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
  const html = document.documentElement;
  let timer = 0;
  const stop = () => { clearTimeout(timer); html.classList.remove('is-typing'); };
  const typing = (e) => {
    if (!e.target || !e.target.matches || !e.target.matches('input, textarea')) return;
    html.classList.add('is-typing');
    clearTimeout(timer);
    timer = setTimeout(stop, 2000);
  };
  document.addEventListener('keydown', typing, true);
  document.addEventListener('input', typing, true);
  document.addEventListener('focusout', stop, true);
}

/**
 * (v4.2) Tu mascota: ordena sus registros (la que no está contigo descansa), vuelve a pintar su
 * cara (el hambre cambia con el tiempo) y, si se murió, lo avisa una sola vez.
 */
function checkPet() {
  if (!state.profile.onboarded) return;
  if (needsSettle(state)) mutate((s) => E.settlePets(s));
  else {
    renderBuddy();
    renderShopBtn();
  }
  const petId = currentPetId(state);
  const st = petStatus(state, petId);
  if (!st.dead) return;
  const mark = `${petId}@${st.diedAt}`;
  if (store.pref.get('pet_rip') === mark) return;
  store.pref.set('pet_rip', mark);
  const who = petLabel(petId);
  toast(t('{pet} se murió de hambre. Tócalo para revivirlo con gemas.', { pet: who[0].toLocaleUpperCase() + who.slice(1) }), 'warn', { icon: '🪦', ms: 8000 });
}

/**
 * Windows, macOS, Android e iOS tienen un ajuste para "reducir movimiento". Antes la app lo
 * obedecía en silencio y el paisaje se quedaba quieto. Ahora el control es "Menos animaciones"
 * en Ajustes (cumple WCAG 2.2.2: hay una forma de detener el movimiento), y si el sistema lo
 * pide, se avisa una sola vez dónde está.
 */
function hintReducedMotion() {
  const asks = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!asks || state.settings.reduceMotion || store.pref.get('motion_hint')) return;
  store.pref.set('motion_hint', '1');
  setTimeout(() => toast('Tu dispositivo pide menos movimiento. Si los animales y la nieve te molestan, activa "Menos animaciones" en Ajustes.', 'info', { icon: '🐧', ms: 8000 }), 2500);
}

/** Bienvenida, inicio de sesión u oferta de crear cuenta, según el caso. */
async function greet() {
  if (!state.profile.onboarded) return onboarding();
  if (state.account) return loginGate().then(maybePaywall);
  if (!store.tab.get('acc_later')) return createAccountFlow().then(() => store.tab.set('acc_later', '1'));
  if (!store.persistent) toast('Este navegador no permite guardar datos: tu progreso se perderá al cerrar.', 'warn', { ms: 7000 });
}

function boot() {
  translateDom(); // textos fijos del HTML en el idioma elegido (antes de pintar)
  mountGateSnow(); // nevada suave de la pantalla de entrada
  watchTyping(); // en el celular, el paisaje se queda quieto mientras escribes
  initSheets(); // (v4.3) en el celular, varias secciones se abren como ventana
  configure({ render: renderAll, play });
  initNative(); // solo dentro de la app de Android: botón atrás, avisos, vibración
  bindHUD();
  updatePhase();
  setInterval(() => { updatePhase(); checkNewDay(); checkSeason(); checkPet(); }, 60 * 1000);
  startChatter(() => session.running && session.state.mode === 'study');
  for (const bind of [bindPremium, bindSound, bindReminders, bindFocus, bindProgress, bindActivity, bindProfile, bindRanking, bindSettings, bindFeeding, bindGlobal]) bind();
  initPip(); // (v4.4.1) "Siempre encima" (solo donde el navegador lo permite)
  renderAll();
  route(false);
  setInterval(tick, 250);
  setInterval(checkReminder, 20 * 1000);
  if (session.isDue()) onDue();
  checkNewDay();
  // Cuentas en línea (v4.0) primero: si hay progreso más nuevo en la nube, se trae antes del ranking.
  // (v4.5) Después, el reloj en vivo con tus otros aparatos.
  Promise.resolve(greet()).then(bootCloud).then(() => bootLive().catch(() => {})).then(bootBoard).catch(() => {}).finally(() => { checkSeason(); checkPet(); });
  syncStorePremium(); // con cobro real: Premium sigue a la suscripción de Microsoft Store
  hintReducedMotion();
  registerServiceWorker();
  document.documentElement.classList.add('is-ready');
}

boot();
