/*
 * StudyTimer — vista Enfocar: el anillo del temporizador, los modos y "Mi ritmo".
 * El bloque en curso vive en session.js; aquí se decide qué se ve y qué suena.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as C from '../catalog.js';
import * as E from '../engine.js';
import * as FX from './effects.js';
import { $, $$, h } from './dom.js';
import { toast, notify } from './feedback.js';
import { penguin, companion, say } from './companions.js';
import { pickVoice, COMPANION_KIND } from '../voices.js';
import { currentPetId, fullness } from '../pet.js';
import { presetButton, mascotPop } from './widgets.js';
import { premiumDialog } from './premium.js';
import { syncAmbient } from './sound.js';
import { state, mutate, prefs, today, session, isPremium, poleNow } from './context.js';

const MODE_NAMES = { study: 'Estudio', break: 'Descanso', long: 'Descanso largo' };
const RING_R = 120;
const RING_C = 2 * Math.PI * RING_R;
const LATE_MS = 5 * 60 * 1000; // si volviste mucho después del fin, no se arranca solo

// =====================================================================
// Acciones del temporizador
// =====================================================================
/** Tras cualquier cambio del bloque: pantalla encendida solo mientras corre, y repintar. */
function timerChanged() {
  wakeLock(session.running);
  renderTimer();
}

/** Tu compañero de Enfocar dice algo (onomatopeya de su especie). */
export function buddySays(ctx = {}) {
  const kind = COMPANION_KIND[state.profile.companion] || 'penguin';
  const hungry = fullness(state, currentPetId(state)) < 25; // con mucha hambre, te lo recuerda
  say($('#buddy'), pickVoice(kind, { hungry, ...ctx }), { ms: 2400 });
}

export function startOrToggle() {
  FX.sfx.unlock();
  const action = session.toggle();
  if (action === 'pause') FX.sfx.pause();
  else FX.sfx.start();
  if (action === 'start') {
    FX.buzz(25);
    buddySays();
  }
  timerChanged();
}

function finishEarly() {
  const res = session.finishEarly();
  if (!res) return;
  if (res.tooShort) toast('Necesitas al menos 1 minuto para guardar la sesión.', 'warn');
  else afterRecord(res.rec, { auto: false });
}

function skip() {
  const { skippedStudy, lost } = session.skip();
  if (skippedStudy) mutate((s) => E.skipStudy(s));
  timerChanged();
  if (lost) toast('Saltaste la sesión y ese tiempo no se guardó. Usa "Terminar y guardar" si quieres que cuente.');
}

function resetTimer() {
  session.reset();
  timerChanged();
}

/** El bloque llegó a cero (o ya había llegado mientras la app estaba cerrada). */
export async function onDue() {
  const rec = await session.completeDue();
  if (rec) afterRecord(rec, { auto: true });
  else renderTimer(); // otra pestaña ya lo registró
}

function celebrate(rec, res) {
  if (rec.mode !== 'study') {
    FX.sfx.breakDone();
    FX.buzz([40, 30, 40]);
    notify('Descanso terminado', 'Cuando quieras, empieza otra sesión.');
  } else if (rec.completed) {
    FX.sfx.complete();
    mascotPop('saludo', $('#mainBtn'));
    buddySays();
    FX.buzz([60, 40, 60]);
    notify('¡Sesión completa!', res.reward.xp ? `Ganaste ${res.reward.xp} XP. Ahora toca descansar.` : 'Ahora toca descansar.');
  } else if (!res.reward.tooShort) {
    toast(`Sesión guardada: ${U.formatMinutes(rec.actualSec / 60)}.`);
  }
}

function afterRecord(rec, { auto }) {
  const poleBefore = poleNow();
  const res = mutate((s) => E.applyRecord(s, rec, { todayKey: today() }));
  celebrate(rec, res);
  const poleAfter = poleNow();
  if (poleAfter - poleBefore > 0.015) {
    setTimeout(() => toast(`¡Limpiaste tu polo! Ahora está al ${Math.round(poleAfter * 100)} %.`, 'good', { icon: '🐧' }), 900);
  }
  session.advance(C.nextModeAfter(rec, state.progress.cycle));
  timerChanged();
  if (auto && rec.completed && state.settings.autoContinue && Date.now() - rec.endMs <= LATE_MS) {
    setTimeout(() => {
      if (session.state.status === 'idle') startOrToggle();
    }, 1600);
  }
}

/** Se llama 4 veces por segundo. */
export function tick() {
  if (!session.running) return;
  if (session.isDue()) onDue();
  else updateClock();
}

// ----- Pantalla encendida (Screen Wake Lock) -----
let lock = null;
export async function wakeLock(on) {
  try {
    if (on && state.settings.keepAwake && 'wakeLock' in navigator && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}

// =====================================================================
// Duración: modos y "Mi ritmo"
// =====================================================================
function choosePreset(id) {
  mutate((s) => E.choosePreset(s, id, today()));
  afterDurationChange();
  const btn = $(`.preset[data-preset="${id}"]`);
  if (btn) btn.focus();
}

function setCustomValue(key, value) {
  const res = mutate((s) => E.setCustomMinutes(s, key, value, today()));
  if (res.clamped && !isPremium()) {
    toast(`En la versión gratis el límite es de ${res.limits[0]} a ${res.limits[1]} min. Con Premium la duración es libre.`, 'warn', { icon: '👑' });
  }
  afterDurationChange();
}

function afterDurationChange() {
  if (!session.syncDuration()) toast('El cambio se aplicará en el siguiente bloque.');
}

function openCustomizer() {
  if (state.settings.preset !== C.CUSTOM_PRESET) choosePreset(C.CUSTOM_PRESET);
  const first = $('#customPanel .stepper__input');
  if (first) {
    first.focus({ preventScroll: true });
    first.select();
    $('#customPanel').scrollIntoView({ behavior: FX.motionOff() ? 'auto' : 'smooth', block: 'center' });
  }
}

export function renderPresets() {
  const s = state.settings;
  $('#presets').replaceChildren(...C.PRESETS.map((p) => {
    const active = s.preset === p.id;
    return presetButton(p, { checked: active, onclick: () => choosePreset(p.id), extra: { tabindex: active ? '0' : '-1', dataset: { preset: p.id } } });
  }));
  const custom = s.preset === C.CUSTOM_PRESET;
  $('#customPanel').hidden = !custom;
  $('#customizeBtn').setAttribute('aria-expanded', String(custom));
  const { limits: L, durations, premium } = prefs();
  for (const st of $$('.stepper[data-key]')) {
    const input = $('.stepper__input', st);
    const [min, max] = st.dataset.key === 'customStudyMin' ? L.study : L.brk;
    st.dataset.min = input.min = String(min);
    st.dataset.max = input.max = String(max);
    if (document.activeElement !== input) input.value = String(s[st.dataset.key]);
  }
  $('#customLimits').replaceChildren(premium
    ? 'Duración libre: de 1 a 180 minutos.'
    : h('span', {}, `Versión gratis: estudio de ${L.study[0]} a ${L.study[1]} min y descanso de ${L.brk[0]} a ${L.brk[1]} min. `,
      h('button', { type: 'button', class: 'link-btn', onclick: premiumDialog }, '👑 Duración libre con Premium')));
  $('#longBreakText').textContent = `Cada ${C.LONG_EVERY} pomodoros tomas un descanso largo de ${durations.long} min.`;
}

// =====================================================================
// Pintar el temporizador
// =====================================================================
function buildRingTicks() {
  const g = $('#ringTicks');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r1 = 92, r2 = i % 3 === 0 ? 82 : 86;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(150 + r1 * Math.sin(a)));
    line.setAttribute('y1', String(150 - r1 * Math.cos(a)));
    line.setAttribute('x2', String(150 + r2 * Math.sin(a)));
    line.setAttribute('y2', String(150 - r2 * Math.cos(a)));
    line.setAttribute('class', 'ring__tick');
    g.append(line);
  }
  $('#ringArc').setAttribute('stroke-dasharray', RING_C.toFixed(2));
}

function updateClock() {
  const st = session.state;
  const remaining = st.status === 'idle' ? st.durationSec * 1000 : session.remainingMs();
  const sec = Math.ceil(remaining / 1000);
  $('#clock').textContent = U.formatClock(sec);
  const frac = U.clamp(remaining / (st.durationSec * 1000), 0, 1);
  // El arco restante va de la bola (que avanza como las manecillas del reloj) hasta las 12.
  // Con desplazamiento negativo, lo ya estudiado queda vacío justo detrás de la bola.
  $('#ringArc').setAttribute('stroke-dashoffset', (-RING_C * (1 - frac)).toFixed(2));
  const ang = (1 - frac) * Math.PI * 2;
  $('#ringKnob').setAttribute('cx', (150 + RING_R * Math.sin(ang)).toFixed(2));
  $('#ringKnob').setAttribute('cy', (150 - RING_R * Math.cos(ang)).toFixed(2));
  document.title = st.status === 'idle' ? 'StudyTimer' : `${U.formatClock(sec)} ${MODE_NAMES[st.mode].toLowerCase()} - StudyTimer`;
}

let eatingUntil = 0;
/** Mientras come (ms), el pingüino pone ojos de corazón y los demás compañeros saltan. */
export function setEating(ms) {
  eatingUntil = ms ? Date.now() + ms : 0;
  renderBuddy();
  if (ms) setTimeout(renderBuddy, ms + 50);
}

/** Sin compañero (o con el Pingüino), el acompañante es el pingüino animado: quieto mientras estudias y saludando en los descansos. */
function renderBuddy() {
  const b = $('#buddy');
  const c = state.profile.companion;
  const st = session.state;
  const eating = Date.now() < eatingUntil;
  b.classList.toggle('is-eating', eating);
  const key = c && c !== 'pinguino' ? c : eating ? 'sprite:amor' : st.status === 'running' && st.mode !== 'study' ? 'sprite:saludo' : 'sprite:quieto';
  if (b.dataset.id !== key) {
    b.replaceChildren(key.startsWith('sprite:') ? penguin(key.slice(7), { size: 96 }) : companion(c, { size: 96 }));
    b.dataset.id = key;
  }
  b.hidden = false;
}

function renderCycleDots(st) {
  const every = C.LONG_EVERY;
  const filled = st.mode === 'long' ? every : state.progress.cycle % every;
  const dots = $('#cycleDots');
  dots.replaceChildren(...Array.from({ length: every }, (_, i) => h('span', { class: `dot${i < filled ? ' is-done' : ''}` })));
  dots.setAttribute('aria-label', `Sesión ${Math.min(filled + (st.mode === 'study' ? 1 : 0), every)} de ${every} antes del descanso largo`);
  dots.setAttribute('role', 'img');
  dots.hidden = false;
}

function renderXpHint(st) {
  const hint = $('#xpHint');
  if (st.mode === 'study') {
    const r = G.previewStudyReward(state, st.durationSec, today());
    hint.className = 'xp-hint';
    if (r.xp === 0) {
      hint.classList.add('is-capped');
      hint.textContent = 'Ya llegaste a tu límite saludable de hoy. Puedes seguir, pero no suma XP.';
    } else {
      hint.textContent = `Si completas esta sesión: +${r.xp} XP${r.capped ? ' (llegarás a tu límite de hoy)' : ''}`;
    }
  } else {
    hint.className = 'xp-hint xp-hint--break';
    hint.textContent = state.progress.breakEarned
      ? `Descanso completo: +${G.RULES.breakXp} XP. Párate, toma agua y mira algo lejano 20 segundos.`
      : 'Párate, toma agua y mira algo lejano 20 segundos.';
  }
}

export function renderToday() {
  const day = state.daily[today()] || G.emptyDay();
  $('#todayMin').textContent = U.formatMinutes(day.studySec / 60);
  $('#todaySessions').textContent = U.plural(day.sessions, 'sesión completa', 'sesiones completas');
}

export function renderTimer() {
  session.syncDuration(); // en reposo, el reloj siempre refleja los ajustes en efecto
  const st = session.state;
  const ring = $('#ring');
  const skin = prefs().skin;
  ring.style.setProperty('--ring-a', skin.a);
  ring.style.setProperty('--ring-b', skin.b);
  ring.dataset.mode = st.mode;
  ring.dataset.status = st.status;
  $('#modeLabel').textContent = MODE_NAMES[st.mode];
  const main = $('#mainBtn');
  main.textContent = st.status === 'running' ? 'Pausar' : st.status === 'paused' ? 'Continuar' : st.mode === 'study' ? 'Empezar a estudiar' : 'Empezar descanso';
  main.className = `btn btn--xl ${st.status === 'running' ? 'btn--paper' : st.mode === 'study' ? 'btn--gold' : 'btn--mint'}`;
  const finish = $('#finishBtn');
  finish.hidden = st.mode !== 'study';
  finish.disabled = st.status === 'idle';
  $('#resetBtn').disabled = st.status === 'idle';
  $('#skipBtn').textContent = st.mode === 'study' ? 'Saltar al descanso' : 'Saltar descanso';
  renderCycleDots(st);
  renderBuddy();
  syncAmbient();
  renderXpHint(st);
  renderToday();
  updateClock();
}

export function bindFocus() {
  buildRingTicks();
  $('#mainBtn').addEventListener('click', startOrToggle);
  $('#finishBtn').addEventListener('click', finishEarly);
  $('#skipBtn').addEventListener('click', skip);
  $('#resetBtn').addEventListener('click', resetTimer);
  $('#customizeBtn').addEventListener('click', openCustomizer);
  $('#presets').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const ids = C.PRESETS.map((p) => p.id);
    const i = ids.indexOf(state.settings.preset);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    choosePreset(ids[(i + d + ids.length) % ids.length]);
  });
  for (const st of $$('.stepper[data-key]')) {
    const key = st.dataset.key;
    const step = Number(st.dataset.step);
    $$('.stepper__btn', st).forEach((b) => b.addEventListener('click', () => {
      const cur = state.settings[key];
      const d = Number(b.dataset.delta);
      const next = step > 1 ? (d > 0 ? Math.floor(cur / step) * step + step : Math.ceil(cur / step) * step - step) : cur + d;
      setCustomValue(key, next);
    }));
    $('.stepper__input', st).addEventListener('change', (e) => setCustomValue(key, e.target.value));
  }
}
