/*
 * FrostPom — el bloque en curso.
 * Une el temporizador (timer.js) con su guardado y con las otras pestañas abiertas:
 *  - cada acción (empezar, pausar, saltar…) se guarda al instante, así una recarga no pierde nada;
 *  - cuando el bloque llega a cero, solo UNA pestaña lo registra (la otra se sincroniza);
 *  - el siguiente bloque se prepara con la duración que digan los ajustes.
 * No toca el DOM ni el progreso: devuelve "registros" que la interfaz aplica con engine.js.
 *
 * (v4.5) Cada bloque nace con un número (block) para que tus otros aparatos sepan que es el
 * mismo pomodoro; adopt() pone aquí el bloque que llegó de otro aparato (js/ui/live.js).
 * (v4.6) Las acciones pueden recibir { at }: la hora en que se tocó el botón (por ejemplo, en la
 * notificación de Android con la app cerrada).
 */
import { createTimer, isBlockId } from './timer.js';
import { uid } from './util.js';

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
  else if (!isBlockId(timer.state.block)) {
    // Un bloque que empezó con una versión anterior: recibe su número ahora
    timer.restore({ ...timer.state, block: uid() });
    commit();
  }

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
    toggle({ at } = {}) {
      const st = timer.state;
      let action;
      if (st.status === 'running') {
        timer.pause(at);
        action = 'pause';
      } else if (st.status === 'paused') {
        timer.resume(at);
        action = 'resume';
      } else {
        timer.start({ mode: st.mode, durationSec: durationFor(st.mode), block: uid(), at });
        action = 'start';
      }
      commit();
      return action;
    },

    /**
     * "Terminar y guardar" (solo en estudio).
     * null si no aplica, { tooShort: true } si va menos de 1 minuto, o { rec } con lo trabajado.
     */
    finishEarly({ at } = {}) {
      const st = timer.state;
      if (st.mode !== 'study' || st.status === 'idle') return null;
      if (timer.elapsedMs() < MIN_SAVE_MS) return { tooShort: true };
      const rec = timer.stopEarly(at);
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
          const mine = timer.state;
          const other = stored && (isBlockId(stored.block) && isBlockId(mine.block) ? stored.block !== mine.block : stored.sessionStartMs !== mine.sessionStartMs);
          if (stored && (stored.status === 'idle' || other)) {
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

    /** (v4.5) El servidor le dio a este bloque su número del ranking. */
    setRank(id) {
      if (!timer.setRank(id)) return false;
      commit();
      return true;
    },

    /**
     * (v4.5) Pone aquí el bloque que llegó de otro aparato (ya con las horas de este aparato).
     * Devuelve false si no es válido (y no cambia nada).
     */
    adopt(saved) {
      if (!timer.restore(saved)) return false;
      if (timer.state.status === 'idle') prepare(timer.state.mode); // en reposo, con tus duraciones
      commit();
      return true;
    },
  };
}
