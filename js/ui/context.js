/*
 * StudyTimer — el estado de la app en la interfaz.
 * Un solo dueño del estado: todos los módulos de la interfaz leen `state` (enlace vivo) y lo
 * cambian SOLO con mutate(), que relee lo que otra pestaña haya guardado, aplica el cambio,
 * guarda, vuelve a pintar y reproduce los eventos (XP, logros…).
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as C from '../catalog.js';
import { createStore } from '../storage.js';
import { createSession } from '../session.js';
import { toast } from './feedback.js';

export const store = createStore();
const loaded = store.load();
/** Estado actual. Es un enlace vivo: siempre apunta al estado más reciente. */
export let state = loaded.state;
/** true si los datos vinieron de la v1 en esta carga. */
export const migrated = loaded.migrated;

export const today = () => U.dateKey(new Date());
/** Lo que está en efecto ahora (tema, tono, sonido, duraciones) según Premium. */
export const prefs = () => C.effectivePrefs(state);
export const isPremium = () => C.isPremium(state);
/** Salud del polo de hoy (0 = muy contaminado, 1 = limpio). */
export const poleNow = () => G.poleHealth(state.daily, today(), U.dateKey(new Date(state.createdAt)), G.POLE_GOAL_MIN);

// La composición (main.js) conecta cómo se pinta todo y cómo se celebran los eventos.
let renderAll = () => {};
let playEvents = () => {};
export function configure({ render, play }) {
  renderAll = render;
  playEvents = play;
}

let savedAt = null;
/** Hora del último guardado automático correcto (null si aún no se ha guardado en esta visita). */
export const lastSavedAt = () => savedAt;

function persist() {
  if (store.save(state)) savedAt = new Date();
  else toast('No se pudo guardar. El navegador no tiene espacio o lo bloquea.', 'warn');
}

/** Toda modificación pasa por aquí. fn recibe el estado y puede devolver { events }. */
export function mutate(fn) {
  state = store.refresh(state);
  const result = fn(state) || {};
  persist();
  renderAll();
  if (result.events && result.events.length) playEvents(result.events);
  return result;
}

/** Reemplaza todo el estado (restaurar una copia). */
export function replaceState(next) {
  state = next;
  persist();
  renderAll();
}

/** Otra pestaña guardó cambios: los traemos. */
export function reloadFromStore() {
  state = store.load().state;
  renderAll();
}

/** El bloque en curso, con la duración que digan los ajustes en efecto. */
export const session = createSession({
  store,
  durationFor(mode) {
    const d = prefs().durations;
    return (mode === 'study' ? d.study : mode === 'long' ? d.long : d.brk) * 60;
  },
  withLock: (fn) => (navigator.locks && navigator.locks.request ? navigator.locks.request('studytimer-complete', fn) : fn()),
});
