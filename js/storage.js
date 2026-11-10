/*
 * FrostPom — almacenamiento local seguro.
 *  - Todo lo que se lee (localStorage o copia importada) se VALIDA campo por campo:
 *    tipos, rangos, longitudes y claves peligrosas (__proto__). Un archivo manipulado no rompe la app.
 *  - Si el navegador bloquea el almacenamiento (modo privado, cuota llena), la app sigue funcionando en memoria.
 *  - Migra automáticamente los datos de la v1 (st_log_v1, st_settings_v1) sin borrarlos.
 *  - Es la ÚNICA puerta al almacenamiento del navegador: el resto de la app no toca localStorage.
 */
import * as U from './util.js';
import * as G from './game.js';
import * as C from './catalog.js';
import { isValidNick, checkUsername, isCountry, AVATARS } from './identity.js';
import { MAX_SESSIONS, applyRecord } from './engine.js';
import { isSeasonId, MAX_ARCHIVE } from './season.js';
import { isPetId, checkPetName, migrateFromV3 } from './pet.js';

export const KEY = 'st2_state';
export const TIMER_KEY = 'st2_timer';
const PREFIX = 'st2_';
const GUARD_KEY = 'st2_login_guard'; // intentos fallidos al iniciar sesión
const REMEMBER_KEY = 'st2_remember'; // "mantener sesión iniciada" en este dispositivo
// Fotos de las cuentas en línea que cerraron sesión en este equipo (v4.0.1). La foto nunca se sube:
// se guarda aquí para devolverla si la misma cuenta vuelve a entrar en este equipo.
const PHOTOS_KEY = 'st2_photos';
const MAX_KEPT_PHOTOS = 3;
const isPhoto = (p) => typeof p === 'string' && p.length <= 300000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(p);
const isAccountId = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const BACKUP_MAX_BYTES = 2 * 1024 * 1024;
const LIMITS = { sessions: MAX_SESSIONS, dailyDays: 800, claimedDays: 14 };

// ---------- Backend (inyectable para las pruebas) ----------
export function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function usable(kind) {
  const ls = U.webStorage(kind);
  try {
    const probe = '__st_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

// ---------- Estado por defecto ----------
export function defaultState() {
  return {
    v: 4, // 4 = v4.2 (mascotas que descansan, mueren y tienen nombre; ver pet.js)
    createdAt: new Date().toISOString(),
    profile: { nick: '', avatar: '🐧', photo: '', companion: null, country: '', onboarded: false }, // photo: data URL, solo en este dispositivo
    settings: {
      // Solo se guarda lo ELEGIDO: los minutos en efecto se derivan con catalog.sessionDurations().
      preset: 'clasico', customStudyMin: 40, customBreakMin: 10,
      // autoBreak: al terminar el estudio, el descanso empieza solo (si no, el reloj espera).
      // autoContinue: al terminar el descanso, la siguiente sesión de estudio empieza sola.
      autoBreak: true, autoContinue: true, sound: true, vibrate: true, reduceMotion: false, keepAwake: false, theme: 'auto',
      dailyCapMin: 240, leaderboardOn: true, skin: 'clasico', timeZone: '',
      tonePack: 'clasico', ambient: '', lastAmbient: C.DEFAULT_AMBIENT, ambientVolume: 50,
      reminders: { on: false, time: '18:00', days: [1, 2, 3, 4, 5] },
    },
    // Premium: hoy solo existe el modo de prueba (sin cobro). Cuando la app esté en las tiendas,
    // el estado real vendrá de la compra validada en App Store / Google Play, no de este archivo.
    premium: { active: false, demo: true, since: null, bonusClaimed: false, giftPending: false },
    account: null, // { username, hash, salt, iter, remember?, email?, emailLinked?, birth?, online?, cloudPending? } — la contraseña nunca se guarda, solo su hash
    progress: {
      xp: 0, gems: 0, achievements: U.dict(), claimed: U.dict(), owned: ['clasico'], gifted: [],
      bestStreak: 0, combo: 0, bestCombo: 0, longestSessionSec: 0, cycle: 0, breakEarned: false, customized: false,
      totals: { studySec: 0, creditedSec: 0, sessions: 0, partials: 0, breaks: 0, missionsClaimed: 0, fed: 0, revived: 0 },
      season: '', // temporada a la que pertenecen xp y rango ("2026-10"); ver season.js
    },
    seasons: [], // resumen de las temporadas terminadas (la más reciente primero)
    pets: U.dict(), // cada mascota: { pinguino: { fullness, at, name?, rest?, dead? } } (ver pet.js)
    daily: U.dict(),
    sessions: [],
  };
}

// ---------- Validadores ----------
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const int = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? U.clamp(Math.round(n), min, max) : d;
};
const oneOf = (byId, v, d) => (typeof v === 'string' && byId[v] ? v : d);
const isISO = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const BIG = 1e9;
const MAX_BLOCK_SEC = 3 * 3600;

function sanitizeDay(raw) {
  const r = obj(raw);
  const d = G.emptyDay();
  for (const k of Object.keys(d)) d[k] = int(r[k], 0, BIG, 0);
  d.creditedSec = Math.min(d.creditedSec, d.studySec);
  return d; // cualquier otro campo (materias, tareas de versiones viejas) se descarta
}

export function sanitizeSession(raw) {
  const r = obj(raw);
  if (!isISO(r.startedAt) || !isISO(r.endedAt)) return null;
  const actualSec = int(r.actualSec, 0, MAX_BLOCK_SEC, 0);
  if (actualSec <= 0) return null;
  // Solo tiempo: no se conserva en qué se trabajó (ni materia ni notas).
  return {
    id: typeof r.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(r.id) ? r.id : U.uid(),
    plannedMin: int(r.plannedMin, 1, 180, Math.ceil(actualSec / 60)),
    actualSec,
    creditedSec: Math.min(actualSec, int(r.creditedSec, 0, MAX_BLOCK_SEC, 0)),
    completed: r.completed === true,
    pauses: int(r.pauses, 0, 999, 0),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    xp: int(r.xp, 0, 100000, 0),
  };
}

function sanitizeSeason(raw) {
  const r = obj(raw);
  if (!isSeasonId(r.id)) return null;
  const rank = G.rankForXp(int(r.xp, 0, BIG, 0));
  return {
    id: r.id,
    months: [1, 2, 3, 4, 6, 12].includes(r.months) ? r.months : 3,
    xp: rank.xp,
    rank: rank.name, // se recalcula: un nombre manipulado en la copia no se muestra
    tierIndex: rank.tierIndex,
    studyMin: int(r.studyMin, 0, BIG, 0),
    activeDays: int(r.activeDays, 0, 400, 0),
    goalDays: int(r.goalDays, 0, 400, 0),
    gems: int(r.gems, 0, 1000, 0),
  };
}

function sanitizeSettings(s) {
  const ds = defaultState().settings;
  ds.preset = oneOf(C.PRESET_BY_ID, s.preset, ds.preset);
  const limits = C.durationLimits(true); // se guarda lo elegido; los límites gratis se aplican al usarlo
  ds.customStudyMin = int(s.customStudyMin, ...limits.study, ds.customStudyMin);
  ds.customBreakMin = int(s.customBreakMin, ...limits.brk, ds.customBreakMin);
  for (const k of ['autoContinue', 'sound', 'vibrate', 'reduceMotion', 'keepAwake', 'leaderboardOn']) ds[k] = bool(s[k], ds[k]);
  // Antes un solo ajuste ("Seguir solo") decidía las dos cosas: si no hay uno propio, se hereda.
  ds.autoBreak = bool(s.autoBreak, ds.autoContinue);
  ds.dailyCapMin = int(s.dailyCapMin, 30, 720, ds.dailyCapMin);
  ds.skin = oneOf(C.SKIN_BY_ID, s.skin, ds.skin);
  ds.timeZone = oneOf(C.REGION_BY_ID, s.timeZone, '');
  ds.tonePack = oneOf(C.TONE_BY_ID, s.tonePack, ds.tonePack);
  ds.theme = ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto'; // modo oscuro (v3.8)
  ds.ambient = oneOf(C.AMBIENT_BY_ID, s.ambient, '');
  ds.lastAmbient = oneOf(C.AMBIENT_BY_ID, s.lastAmbient, ds.lastAmbient);
  ds.ambientVolume = int(s.ambientVolume, 0, 100, ds.ambientVolume);
  const rm = obj(s.reminders);
  ds.reminders = {
    on: rm.on === true,
    time: typeof rm.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(rm.time) ? rm.time : '18:00',
    days: Array.isArray(rm.days) ? [...new Set(rm.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [1, 2, 3, 4, 5],
  };
  return ds;
}

export function validateState(raw) {
  const out = defaultState();
  if (!isObj(raw)) return out;
  if (isISO(raw.createdAt)) out.createdAt = raw.createdAt;

  const p = obj(raw.profile);
  out.profile.nick = isValidNick(p.nick) ? p.nick : '';
  out.profile.avatar = AVATARS.includes(p.avatar) ? p.avatar : out.profile.avatar;
  out.profile.onboarded = p.onboarded === true && !!out.profile.nick;
  out.profile.country = isCountry(p.country) ? p.country : '';
  // Foto de perfil: solo imágenes WebP, JPEG o PNG en base64 y de tamaño razonable (nada de SVG ni enlaces).
  out.profile.photo = isPhoto(p.photo) ? p.photo : '';

  const pm = obj(raw.premium);
  out.premium = { active: pm.active === true, demo: true, since: pm.active === true && isISO(pm.since) ? pm.since : null, bonusClaimed: pm.bonusClaimed === true, giftPending: pm.giftPending === true && pm.bonusClaimed === true };
  out.settings = sanitizeSettings(obj(raw.settings));

  const acc = obj(raw.account);
  if (checkUsername(acc.username).ok && /^[0-9a-f]{64}$/.test(acc.hash || '') && /^[0-9a-f]{32}$/.test(acc.salt || '')) {
    out.account = { username: acc.username, hash: acc.hash, salt: acc.salt, iter: int(acc.iter, 100000, 2000000, 210000) };
    // Huella del "mantener sesión iniciada" (el token vive aparte, en st2_remember).
    if (/^[0-9a-f]{64}$/.test(acc.remember || '')) out.account.remember = acc.remember;
    // Correo de recuperación (opcional). emailLinked = ya quedó registrado en Supabase.
    const mail = typeof acc.email === 'string' ? acc.email.trim().toLowerCase() : '';
    if (mail.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(mail)) {
      out.account.email = mail;
      if (acc.emailLinked === true) out.account.emailLinked = true;
    }
    // Mes y año de nacimiento (v3.9): solo para saber si puede estar en el ranking global.
    // Se queda en el dispositivo (la copia de seguridad no lleva la cuenta).
    if (typeof acc.birth === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(acc.birth)) out.account.birth = acc.birth;
    // Cuenta en línea (v4.0): el correo es también para entrar desde otro equipo.
    if (acc.online === true && out.account.email) out.account.online = true;
    if (acc.cloudPending === true && out.account.email && !out.account.online) out.account.cloudPending = true;
    out.profile.nick = acc.username;
  }

  const pr = obj(raw.progress);
  const dp = out.progress;
  dp.xp = int(pr.xp, 0, BIG, 0);
  dp.gems = int(pr.gems, 0, BIG, 0);
  for (const [id, when] of Object.entries(obj(pr.achievements))) {
    if (G.ACHIEVEMENT_BY_ID[id] && isISO(when)) dp.achievements[id] = when;
  }
  // Solo se conservan misiones reclamadas recientes (el id empieza por la fecha).
  const oldest = U.dateKey(U.addDays(new Date(), -LIMITS.claimedDays));
  for (const [id, v] of Object.entries(obj(pr.claimed))) {
    if (v === true && /^\d{4}-\d{2}-\d{2}:[a-z]+:\d+$/.test(id) && id.slice(0, 10) >= oldest) dp.claimed[id] = true;
  }
  dp.owned = ['clasico', ...new Set(arr(pr.owned).filter((x) => C.SKIN_BY_ID[x] && x !== 'clasico'))];
  dp.bestStreak = int(pr.bestStreak, 0, 100000, 0);
  dp.combo = int(pr.combo, 0, 100000, 0);
  dp.bestCombo = int(pr.bestCombo, 0, 100000, 0);
  dp.longestSessionSec = int(pr.longestSessionSec, 0, MAX_BLOCK_SEC, 0);
  dp.cycle = int(pr.cycle, 0, BIG, 0);
  dp.breakEarned = bool(pr.breakEarned, false);
  dp.customized = bool(pr.customized, false);
  const tot = obj(pr.totals);
  for (const k of Object.keys(dp.totals)) dp.totals[k] = int(tot[k], 0, BIG, 0);
  dp.season = isSeasonId(pr.season) ? pr.season : '';
  out.seasons = arr(raw.seasons).map(sanitizeSeason).filter(Boolean).slice(0, MAX_ARCHIVE);
  for (const [id, rec] of Object.entries(obj(raw.pets))) {
    const r = obj(rec);
    if (!isPetId(id) || !isISO(r.at)) continue;
    const pet = { fullness: int(r.fullness, 0, 100, 60), at: r.at };
    const name = checkPetName(r.name);
    if (typeof r.name === 'string' && name.ok && name.value) pet.name = name.value;
    if (isISO(r.dead)) {
      pet.dead = r.dead;
      pet.fullness = 0;
    } else if (r.rest === true) {
      pet.rest = true;
    }
    out.pets[id] = pet;
  }

  // El tema elegido solo se conserva si es tuyo o si Premium lo incluye.
  if (!dp.owned.includes(out.settings.skin) && !out.premium.active) out.settings.skin = 'clasico';
  // El compañero solo vale si su logro está desbloqueado.
  dp.gifted = [...new Set(arr(pr.gifted).filter((x) => typeof x === 'string' && C.COMPANION_BY_ID[x]))];
  out.profile.companion = typeof p.companion === 'string' && C.companionUnlocked(p.companion, dp.achievements, dp.gifted) ? p.companion : null;
  // Datos de antes de la v4.2: el reloj del hambre de la mascota empieza de nuevo (ver pet.js)
  if (!(Number(raw.v) >= 4)) migrateFromV3(out);

  const dayKeys = Object.keys(obj(raw.daily)).filter(U.isDateKey).sort().slice(-LIMITS.dailyDays);
  for (const k of dayKeys) out.daily[k] = sanitizeDay(raw.daily[k]);

  out.sessions = arr(raw.sessions).slice(0, LIMITS.sessions).map(sanitizeSession).filter(Boolean);
  return out;
}

// ---------- Migración desde la v1 ----------
export function migrateV1(backend) {
  const read = (k) => {
    try {
      const raw = backend.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const log = read('st_log_v1');
  const set = read('st_settings_v1');
  // Las tareas y la disponibilidad del antiguo planificador ya no existen: no se migran.
  if (!Array.isArray(log) && !isObj(set)) return null;

  const st = defaultState();
  if (isObj(set)) {
    const studyMin = int(set.studyMin, 1, 180, 25);
    const breakMin = int(set.breakMin, 1, 60, 5);
    const preset = C.PRESETS.find((p) => p.study === studyMin && p.brk === breakMin);
    st.settings.preset = preset ? preset.id : C.CUSTOM_PRESET;
    if (!preset) {
      st.settings.customStudyMin = studyMin;
      st.settings.customBreakMin = breakMin;
    }
    st.settings.autoContinue = bool(set.autoContinue, true);
    st.settings.autoBreak = st.settings.autoContinue;
    st.settings.sound = bool(set.soundOn, true);
  }
  if (Array.isArray(log)) {
    // Se "reproducen" las sesiones antiguas para que tu progreso de la v1 cuente en el nuevo rango.
    const entries = log
      .filter((e) => isObj(e) && isISO(e.startedAtISO) && isISO(e.endedAtISO))
      .sort((a, b) => Date.parse(a.endedAtISO) - Date.parse(b.endedAtISO));
    for (const e of entries) {
      const endMs = Date.parse(e.endedAtISO);
      // De la v1 solo se trae el TIEMPO; la materia y las notas no se migran.
      const rec = { mode: e.type === 'break' ? 'break' : 'study', completed: e.partial !== true, plannedSec: int(e.plannedMin, 1, 180, 25) * 60, actualSec: int(e.actualSec, 0, MAX_BLOCK_SEC, 0), startedAt: e.startedAtISO, endedAt: e.endedAtISO, endMs, pauses: 0 };
      applyRecord(st, rec, { todayKey: U.dateKey(new Date(endMs)) });
    }
  }
  return st;
}

// ---------- API ----------
/**
 * backend: localStorage (o uno en memoria para las pruebas).
 * session: sessionStorage (datos que duran solo mientras la pestaña está abierta).
 */
export function createStore(backendOverride, sessionOverride) {
  const local = backendOverride || usable('localStorage');
  const backend = local || memoryBackend();
  const session = sessionOverride || usable('sessionStorage') || memoryBackend();
  let lastRaw = null; // el último st2_state que leímos o escribimos nosotros
  let frozen = false; // después de borrar todo para recargar: no se vuelve a guardar nada

  function readJSON(key) {
    try {
      const raw = backend.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function writeJSON(key, value) {
    if (frozen) return false;
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function rawState() {
    try {
      return backend.getItem(KEY);
    } catch {
      return null;
    }
  }

  return {
    persistent: !!local,
    load() {
      const raw = rawState();
      const parsed = readJSON(KEY);
      if (parsed) {
        lastRaw = raw;
        return { state: validateState(parsed), migrated: false };
      }
      const migrated = migrateV1(backend);
      if (migrated) {
        const clean = validateState(migrated);
        this.save(clean);
        return { state: clean, migrated: true };
      }
      return { state: defaultState(), migrated: false };
    },
    /**
     * Devuelve el estado más reciente: el que otra pestaña guardó, o `current` si nadie lo cambió.
     * Si el último guardado falló (cuota llena), los cambios en memoria NO se pierden.
     */
    refresh(current) {
      const raw = rawState();
      if (raw === lastRaw || !raw) return current;
      return this.load().state;
    },
    save(state) {
      if (frozen) return false;
      try {
        const raw = JSON.stringify(state);
        backend.setItem(KEY, raw);
        lastRaw = raw;
        return true;
      } catch {
        return false;
      }
    },
    loadTimer: () => readJSON(TIMER_KEY),
    saveTimer: (t) => writeJSON(TIMER_KEY, t),
    loadGuard() {
      const g = obj(readJSON(GUARD_KEY));
      return { fails: int(g.fails, 0, 1000, 0), lockedUntil: int(g.lockedUntil, 0, 1e14, 0) };
    },
    saveGuard: (g) => writeJSON(GUARD_KEY, g),
    /** "Mantener sesión iniciada": { u: usuario en minúsculas, t: token, exp: vencimiento }. */
    loadRemember() {
      const r = obj(readJSON(REMEMBER_KEY));
      if (typeof r.t !== 'string' || !/^[0-9a-f]{64}$/.test(r.t) || typeof r.u !== 'string' || !/^[a-z0-9._]{3,20}$/.test(r.u)) return null;
      return { u: r.u, t: r.t, exp: int(r.exp, 0, 1e14, 0) };
    },
    saveRemember: (r) => writeJSON(REMEMBER_KEY, r),
    clearRemember() {
      try { backend.removeItem(REMEMBER_KEY); } catch { /* sin almacenamiento */ }
    },
    /** Preferencias pequeñas de este dispositivo (pestaña elegida, último aviso…). Nunca fallan. */
    pref: {
      get(name) {
        try { return backend.getItem(PREFIX + name); } catch { return null; }
      },
      set(name, value) {
        if (frozen) return;
        try { backend.setItem(PREFIX + name, String(value)); } catch { /* sin almacenamiento */ }
      },
    },
    /** Lo mismo, pero solo mientras la pestaña esté abierta (sessionStorage). */
    tab: {
      get(name) {
        try { return session.getItem(PREFIX + name); } catch { return null; }
      },
      set(name, value) {
        try { session.setItem(PREFIX + name, String(value)); } catch { /* sin almacenamiento */ }
      },
      remove(name) {
        try { session.removeItem(PREFIX + name); } catch { /* sin almacenamiento */ }
      },
    },
    /** La foto que dejó en este equipo la cuenta en línea `id` al cerrar sesión ('' si no hay). */
    photoFor(id) {
      const m = obj(readJSON(PHOTOS_KEY));
      return isAccountId(id) && isPhoto(m[id]) ? m[id] : '';
    },
    /** Guarda la foto de la cuenta `id` al cerrar sesión (solo las 3 más recientes). */
    keepPhoto(id, photo) {
      if (!isAccountId(id) || !isPhoto(photo)) return false;
      const m = obj(readJSON(PHOTOS_KEY));
      delete m[id];
      const ids = Object.keys(m).filter((k) => isAccountId(k) && isPhoto(m[k])).slice(-(MAX_KEPT_PHOTOS - 1));
      const next = {};
      for (const k of ids) next[k] = m[k];
      next[id] = photo;
      return writeJSON(PHOTOS_KEY, next);
    },
    dropPhoto(id) {
      const m = obj(readJSON(PHOTOS_KEY));
      if (!(id in m)) return;
      delete m[id];
      if (Object.keys(m).length) writeJSON(PHOTOS_KEY, m);
      else try { backend.removeItem(PHOTOS_KEY); } catch { /* sin almacenamiento */ }
    },
    /**
     * Borra TODO lo de FrostPom en este dispositivo (incluye datos de la v1).
     * `keep`: claves que se conservan (sin el prefijo), por ejemplo ['lang', 'photos'] al cerrar sesión.
     * `final`: la app se va a recargar; lo que siga corriendo ya no puede volver a guardar el estado.
     */
    wipe({ keep = [], final = false } = {}) {
      const kept = new Set(keep.map((k) => PREFIX + k));
      const keys = [];
      for (let i = 0; i < backend.length; i++) {
        const k = backend.key(i);
        if (k && !kept.has(k) && (k.startsWith(PREFIX) || k.startsWith('st_'))) keys.push(k);
      }
      keys.forEach((k) => backend.removeItem(k));
      lastRaw = null;
      if (final) frozen = true;
      return keys.length;
    },
  };
}

export function exportBackup(state) {
  const data = { ...state, account: null }; // la copia nunca lleva la contraseña
  return JSON.stringify({ app: 'frostpom', format: 2, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importBackup(text) {
  if (typeof text !== 'string') throw new Error('El archivo no es de texto.');
  if (text.length > BACKUP_MAX_BYTES) throw new Error('El archivo es demasiado grande (máximo 2 MB).');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es una copia válida de FrostPom.');
  }
  if (!isObj(parsed) || !['frostpom', 'studytimer'].includes(parsed.app) || parsed.format !== 2 || !isObj(parsed.data)) {
    throw new Error('Este archivo no es una copia de FrostPom.');
  }
  const state = validateState(parsed.data);
  state.account = null; // la cuenta tampoco: la contraseña se define en este dispositivo
  return state;
}
export { BACKUP_MAX_BYTES };
