/*
 * FrostPom — sonidos de concentración (suenan mientras estudias) y tonos de aviso.
 * Qué suena lo decide catalog.effectivePrefs(): un sonido Premium sin Premium no suena.
 */
import * as U from '../util.js';
import * as C from '../catalog.js';
import * as FX from './effects.js';
import { $, h } from './dom.js';
import { state, mutate, prefs, session, isPremium } from './context.js';
import { requirePremium } from './premium.js';
import { pic } from './pics.js';
import { t, tr } from '../i18n.js';

let previewTimer = 0;

/** Pone o quita el sonido de concentración según el bloque en curso. */
export function syncAmbient() {
  const ambient = prefs().ambient;
  const st = session.state;
  if (ambient && st.status === 'running' && st.mode === 'study') FX.playAmbient(ambient.id, state.settings.ambientVolume);
  else if (!previewTimer) FX.stopAmbient();
  renderAmbientBtn();
}

export function renderAmbientBtn() {
  const a = prefs().ambient;
  const btn = $('#ambientBtn');
  btn.textContent = a ? `🔊 ${a.name}` : tr('🔇 Silencio');
  btn.setAttribute('aria-pressed', String(!!a));
  btn.setAttribute('aria-label', a ? t('Sonido de concentración: {name}. Toca para silenciar.', { name: a.name }) : tr('Sonido de concentración apagado. Toca para activarlo.'));
}

function toggleSilence() {
  FX.sfx.unlock();
  mutate((st) => {
    const s = st.settings;
    if (s.ambient) {
      s.lastAmbient = s.ambient;
      s.ambient = '';
    } else {
      s.ambient = C.canUse(C.AMBIENT_BY_ID[s.lastAmbient], C.isPremium(st)) ? s.lastAmbient : C.DEFAULT_AMBIENT;
    }
  });
}

/** Suena unos segundos para que la persona lo escuche antes de estudiar. */
function previewAmbient(id) {
  FX.sfx.unlock();
  clearTimeout(previewTimer);
  if (!id) { previewTimer = 0; FX.stopAmbient(); return; }
  FX.playAmbient(id, state.settings.ambientVolume);
  previewTimer = setTimeout(() => { previewTimer = 0; syncAmbient(); }, 4000);
}

function chooseAmbient(id) {
  if (requirePremium(C.AMBIENT_BY_ID[id])) return;
  mutate((st) => { st.settings.ambient = id; if (id) st.settings.lastAmbient = id; });
  if (!session.running || session.state.mode !== 'study') previewAmbient(id);
}

function chooseTone(id) {
  if (requirePremium(C.TONE_BY_ID[id])) return;
  mutate((st) => { st.settings.tonePack = id; });
  FX.sfx.unlock();
  FX.sfx.complete();
}

export function renderSound() {
  const s = state.settings;
  const premium = isPremium();
  const chip = (item, selected, onclick) => {
    const locked = item.premium && !premium;
    return h('button', {
      type: 'button', role: 'radio', class: `sound-chip${selected ? ' is-on' : ''}${locked ? ' is-locked' : ''}`,
      'aria-checked': String(selected), onclick,
      'aria-label': `${item.name}${locked ? ', Premium' : ''}`,
    }, h('span', { class: 'sound-chip__name', text: item.name }), // v3.8: solo el nombre, sin emoji
    locked ? h('span', { class: 'sound-chip__crown', 'aria-hidden': 'true' }, pic('corona', 20)) : null);
  };
  $('#ambientGrid').replaceChildren(
    chip({ id: '', name: 'Silencio' }, !s.ambient, () => chooseAmbient('')),
    ...C.AMBIENTS.map((a) => chip(a, s.ambient === a.id, () => chooseAmbient(a.id))));
  $('#toneGrid').replaceChildren(...C.TONE_PACKS.map((tone) => chip(tone, s.tonePack === tone.id, () => chooseTone(tone.id))));
  const vol = $('#ambientVol');
  if (document.activeElement !== vol) vol.value = String(s.ambientVolume);
}

export function bindSound() {
  // La grabación elegida se descarga al abrir la app, para que después suene también sin internet
  FX.prefetchAmbient(state.settings.ambient || state.settings.lastAmbient);
  $('#ambientBtn').addEventListener('click', toggleSilence);
  $('#ambientVol').addEventListener('input', (e) => FX.setAmbientVolume(Number(e.target.value)));
  $('#ambientVol').addEventListener('change', (e) => mutate((st) => { st.settings.ambientVolume = U.clamp(Number(e.target.value), 0, 100); }));
}
