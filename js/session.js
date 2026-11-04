/*
 * FrostPom — el bloque en curso.
 * Une el temporizador (timer.js) con su guardado y con las otras pestañas abiertas:
 *  - cada acción (empezar, pausar, saltar…) se guarda al instante, así una recarga no pierde nada;
 *  - cuando el bloque llega a cero, solo UNA pestaña lo registra (la otra se sincroniza);
 *  - el siguiente bloque se prepara con la duración que digan los ajustes.
 * No toca el DOM ni el progreso: devuelve "registros" que la interfaz aplica con engine.js.
 */
import { createTimer } from './timer.js';

/** Menos de 1 minuto de estudio no se puede guardar. */
export const MIN_SAVE_MS = 60 * 1000;

/**
 * store: el de storage.js (loadTimer / saveTimer).
 * durationFor(mode): segundos que dura un bloque 'study' | 'break' | 'long' con los ajustes actuales.
 * withLock(fn): exclusión entre pestañas (navigator.locks en el navegador).
 */
export function createSession({ store, durationFor, now, withLock = (fn) => fn() }) {
  const timer = createTimer({ now });
  const commit = () => store.saveTimer(timer.serialize());
  const prepare = (mode) => timer.prepare(mode, durationFor(mode));
  let completing = false;

  // Al abrir la app se retoma lo que había (aunque se haya cerrado a mitad de un bloque).
  if (!timer.restore(store.loadTimer())) prepare('study');
  else if (timer.state.status === 'idle') prepare(timer.state.mode);

  return {
    get state() {
      return timer.state;
    },
    get running() {
      return timer.state.status === 'running';
    },
    remainingMs: timer.remainingMs,
    elapsedMs: timer.elapsedMs,
    isDue: timer.isDue,

    /** Empezar, pausar o continuar. Devuelve 'start', 'pause' o 'resume'. */
    toggle() {
      const st = timer.state;
      let action;
      if (st.status === 'running') {
        timer.pause();
        action = 'pause';
      } else if (st.status === 'paused') {
        timer.resume();
        action = 'resume';
      } else {
        timer.start({ mode: st.mode, durationSec: durationFor(st.mode) });
        action = 'start';
      }
      commit();
      return action;
    },

    /**
     * "Terminar y guardar" (solo en estudio).
     * null si no aplica, { tooShort: true } si va menos de 1 minuto, o { rec } con lo trabajado.
     */
    finishEarly() {
      const st = timer.state;
      if (st.mode !== 'study' || st.status === 'idle') return null;
      if (timer.elapsedMs() < MIN_SAVE_MS) return { tooShort: true };
      const rec = timer.stopEarly();
      commit();
      return { rec };
    },

    /** Salta al siguiente bloque sin registrar nada. lost = se descartó al menos 1 minuto de estudio. */
    skip() {
      const st = timer.state;
      const skippedStudy = st.mode === 'study' && st.status !== 'idle';
      const lost = skippedStudy && timer.elapsedMs() >= MIN_SAVE_MS;
      timer.reset();
      prepare(st.mode === 'study' ? 'break' : 'study');
      commit();
      return { skippedStudy, lost };
    },

    reset() {
      timer.reset();
      prepare(timer.state.mode);
      commit();
    },

    /**
     * Mientras no haya nada corriendo, el reloj muestra la duración de los ajustes actuales.
     * Devuelve false si hay un bloque en curso (el cambio se aplicará en el siguiente).
     */
    syncDuration() {
      const st = timer.state;
      if (st.status !== 'idle') return false;
      if (st.durationSec !== durationFor(st.mode)) {
        prepare(st.mode);
        commit();
      }
      return true;
    },

    /** Deja listo (sin empezar) el bloque que sigue. */
    advance(mode) {
      prepare(mode);
      commit();
    },

    /**
     * El bloque llegó a cero: lo cierra con la hora real de fin y devuelve su registro.
     * Si otra pestaña ya lo registró, se sincroniza con ella y devuelve null.
     */
    async completeDue() {
      if (completing) return null;
      completing = true;
      try {
        return await withLock(async () => {
          const stored = store.loadTimer();
          if (stored && (stored.status === 'idle' || stored.sessionStartMs !== timer.state.sessionStartMs)) {
            timer.restore(stored); // otra pestaña ya lo procesó
            return null;
          }
          const rec = timer.complete();
          if (rec) commit();
          return rec;
        });
      } finally {
        completing = false;
      }
    },

    /** Otra pestaña cambió el temporizador. */
    syncFromStore() {
      timer.restore(store.loadTimer());
    },
  };
}
