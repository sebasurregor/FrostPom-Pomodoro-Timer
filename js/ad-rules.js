/*
 * FrostPom — (v4.5.3) las reglas de los anuncios, sin nada del teléfono (para poder probarlas).
 *
 * Decisiones del autor (16 nov 2026, docs/ANUNCIOS.md):
 *  - Quién: solo mayores de 13. Nunca menores de 13 ni edad desconocida (cuentas sin fecha de
 *    nacimiento que no están en línea). Una cuenta en línea cuenta como 13+ (solo se crea para
 *    ellos), pero, sin saber la edad exacta, se trata como menor de 16: anuncios no personalizados.
 *  - Gemas: +10 por anuncio, hasta 5 al día (Premium también puede, si quiere).
 *  - Revivir la mascota: 3 anuncios (el avance se guarda). La racha: 1 anuncio por cada día que faltó.
 *  - Pantalla completa: al empezar el descanso, cuando desde el último anuncio pasen 4 pomodoros
 *    o 90 minutos de estudio (lo que llegue primero). Los contadores empiezan de cero cada día.
 *    Nunca durante el estudio, al abrir la app, ni con Premium.
 */
import { config } from './config.js';
import { ageYears } from './board.js';

export const MIN_AGE = 13;
const ads = () => config.ads || {};
export const rules = () => ({
  gemsPerAd: ads().gemsPerAd || 10,
  gemAdsPerDay: ads().gemAdsPerDay || 5,
  petReviveAds: ads().petReviveAds || 3,
  everyPomodoros: ads().everyPomodoros || 4,
  everyStudySec: (ads().everyStudyMin || 90) * 60,
});

/**
 * ¿A quién se le pueden mostrar anuncios? null = a nadie (menor de 13, edad desconocida o sin
 * cuenta). Si sí: { age, under16, under18 } (-1 = cuenta en línea sin la fecha en este equipo).
 */
export function audience(account, now = new Date()) {
  if (!account) return null;
  const age = ageYears(account.birth, now);
  if (age >= 0) return age >= MIN_AGE ? { age, under16: age < 16, under18: age < 18 } : null;
  if (account.online === true) return { age: -1, under16: true, under18: true };
  return null;
}

/** Los contadores de hoy (empiezan de cero cada día). c = lo guardado, o nada. */
export function today(c, dayKey) {
  const ok = c && typeof c === 'object' && c.day === dayKey;
  return {
    day: dayKey,
    pomos: ok ? Math.max(0, c.pomos | 0) : 0, // pomodoros completos desde el último anuncio de pantalla completa
    sec: ok ? Math.max(0, Number(c.sec) || 0) : 0, // segundos de estudio desde ese anuncio
    gems: ok ? Math.max(0, c.gems | 0) : 0, // anuncios vistos hoy para ganar gemas
  };
}

/** Terminó un pomodoro completo de `sec` segundos. */
export function noteStudy(c, dayKey, sec) {
  const n = today(c, dayKey);
  return { ...n, pomos: n.pomos + 1, sec: n.sec + Math.max(0, Number(sec) || 0) };
}

/** ¿Toca el anuncio de pantalla completa? (después de anotar el pomodoro que acaba de terminar) */
export function interstitialDue(c, dayKey) {
  const n = today(c, dayKey);
  const r = rules();
  return n.pomos >= 1 && (n.pomos >= r.everyPomodoros || n.sec >= r.everyStudySec);
}

/** Se mostró el anuncio de pantalla completa: los contadores empiezan de nuevo. */
export const interstitialShown = (c, dayKey) => ({ ...today(c, dayKey), pomos: 0, sec: 0 });

/** ¿Cuántos anuncios para ganar gemas quedan hoy? */
export const gemAdsLeft = (c, dayKey) => Math.max(0, rules().gemAdsPerDay - today(c, dayKey).gems);
export const gemAdSeen = (c, dayKey) => { const n = today(c, dayKey); return { ...n, gems: n.gems + 1 }; };
