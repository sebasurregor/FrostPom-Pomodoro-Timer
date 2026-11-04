/*
 * StudyTimer — motor del temporizador.
 * Lleva la cuenta del tiempo REAL trabajado aunque pauses varias veces o recargues la página.
 * Correcciones respecto a la v1:
 *  - Antes, al pausar y reanudar se perdía la hora real de inicio y el tiempo parcial se contaba mal.
 *  - "Registrar progreso" sumaba el tiempo dos veces; ahora "Terminar y guardar" cierra la sesión.
 *  - El estado se puede guardar y restaurar: si cierras la app, la sesión sigue al volver.
 */
export const MODES = ['study', 'break', 'long'];
const STATUSES = ['idle', 'running', 'paused'];
export const MIN_SEC = 60;
export const MAX_SEC = 3 * 60 * 60;

export function createTimer({ now = () => Date.now() } = {}) {
  let s = idle('study', 25 * 60);

  function idle(mode, durationSec) {
    return { status: 'idle', mode, durationSec, accumulatedMs: 0, runStartMs: null, sessionStartMs: null, pauses: 0 };
  }
  function elapsedMs() {
    const running = s.status === 'running' ? Math.max(0, now() - s.runStartMs) : 0;
    return s.accumulatedMs + running;
  }
  function remainingMs() {
    return Math.max(0, s.durationSec * 1000 - elapsedMs());
  }
  function record(completed, actualSec, endMs) {
    return {
      mode: s.mode,
      completed,
      plannedSec: s.durationSec,
      actualSec: Math.max(0, Math.min(Math.floor(actualSec), s.durationSec)),
      sessionStartMs: s.sessionStartMs,
      startedAt: new Date(s.sessionStartMs).toISOString(),
      endMs,
      endedAt: new Date(endMs).toISOString(),
      pauses: s.pauses,
    };
  }

  return {
    get state() {
      return { ...s };
    },
    elapsedMs,
    remainingMs,
    /** Cambia el modo/duración mostrados cuando no hay nada corriendo. */
    prepare(mode, durationSec) {
      if (s.status !== 'idle') return false;
      s = idle(mode, clampDuration(durationSec));
      return true;
    },
    start({ mode, durationSec }) {
      const t = now();
      s = { status: 'running', mode, durationSec: clampDuration(durationSec), accumulatedMs: 0, runStartMs: t, sessionStartMs: t, pauses: 0 };
    },
    pause() {
      if (s.status !== 'running') return false;
      s.accumulatedMs += Math.max(0, now() - s.runStartMs);
      s.runStartMs = null;
      s.status = 'paused';
      s.pauses += 1;
      return true;
    },
    resume() {
      if (s.status !== 'paused') return false;
      s.runStartMs = now();
      s.status = 'running';
      return true;
    },
    isDue() {
      return s.status === 'running' && remainingMs() <= 0;
    },
    /** Cierra un intervalo que llegó a cero. La hora de fin es la real, aunque se procese tarde. */
    complete() {
      if (s.status !== 'running') return null;
      const endMs = s.runStartMs + (s.durationSec * 1000 - s.accumulatedMs);
      const rec = record(true, s.durationSec, endMs);
      s = idle(s.mode, s.durationSec);
      return rec;
    },
    /** Termina antes de tiempo y devuelve lo trabajado. */
    stopEarly() {
      if (s.status === 'idle') return null;
      const rec = record(false, elapsedMs() / 1000, now());
      s = idle(s.mode, s.durationSec);
      return rec;
    },
    reset() {
      s = idle(s.mode, s.durationSec);
    },
    serialize() {
      return { ...s };
    },
    /** Restaura desde almacenamiento, validando cada campo (podría estar manipulado). */
    restore(saved) {
      if (!saved || typeof saved !== 'object') return false;
      if (!STATUSES.includes(saved.status) || !MODES.includes(saved.mode)) return false;
      const durationSec = clampDuration(saved.durationSec);
      const t = now();
      const next = idle(saved.mode, durationSec);
      if (saved.status !== 'idle') {
        const start = Number(saved.sessionStartMs);
        if (!Number.isFinite(start) || start > t + 60000) return false;
        next.status = saved.status;
        next.sessionStartMs = start;
        next.accumulatedMs = Math.min(Math.max(0, Number(saved.accumulatedMs) || 0), durationSec * 1000);
        next.pauses = Math.max(0, Math.floor(Number(saved.pauses) || 0));
        if (saved.status === 'running') {
          const rs = Number(saved.runStartMs);
          if (!Number.isFinite(rs)) return false;
          next.runStartMs = Math.min(rs, t); // si el reloj del equipo retrocedió, no regalamos tiempo
        }
      }
      s = next;
      return true;
    },
  };
}

function clampDuration(sec) {
  const n = Math.round(Number(sec));
  if (!Number.isFinite(n)) return 25 * 60;
  return Math.min(MAX_SEC, Math.max(MIN_SEC, n));
}

