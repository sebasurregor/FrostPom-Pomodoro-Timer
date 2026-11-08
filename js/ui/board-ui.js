/*
 * FrostPom — ranking global (v3.9): ventanas y avisos. La lógica está en js/board.js.
 *
 *  - La fecha de nacimiento (mes y año) se pregunta al crear la cuenta o, a quien ya tenía
 *    cuenta, una sola vez con "¡Llegó el ranking global!". Se queda en el dispositivo.
 *  - Con 13 años o más, todos aparecen con su nombre de usuario; se puede salir en Ajustes.
 *  - Si el nombre ya lo tiene otra persona del ranking, se elige otro (cambia también en la
 *    cuenta) o, si es tuyo de otro equipo, se recupera con el correo.
 */
import * as U from '../util.js';
import * as BOARD from '../board.js';
import * as CLOUD from '../cloud.js';
import { checkUsername } from '../identity.js';
import { $, h, download } from './dom.js';
import { toast, openDialog, confirmDialog, dlg } from './feedback.js';
import { state, store, mutate } from './context.js';
import { t, tr } from '../i18n.js';

/** Avisa a la vista Ranking (y a Ajustes) que algo del ranking cambió. */
const changed = () => document.dispatchEvent(new CustomEvent('frostpom:board'));

export function errorText(kind) {
  switch (kind) {
    case 'offline': return tr('No hay conexión a internet. Inténtalo cuando vuelvas a estar en línea.');
    case 'name_taken': return tr('Ese nombre ya lo usa otra persona en FrostPom. Prueba con otro.');
    case 'name_invalid':
    case 'name_blocked': return tr('Ese nombre no está permitido. Elige uno respetuoso para todos.');
    case 'notready': return tr('El ranking global todavía no está disponible.');
    case 'rate': return tr('Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.');
    case 'code_invalid':
    case 'badcode': return tr('El código no es correcto o ya venció. Revisa el correo o pide uno nuevo.');
    default: return tr('Algo falló al hablar con el servidor. Inténtalo de nuevo en un rato.');
  }
}

// ---------------------------------------------------------------------
// Mes y año de nacimiento
// ---------------------------------------------------------------------
/** Dos listas (mes y año), sin sugerir ninguna respuesta. value() → "YYYY-MM" o "". */
export function birthField(id = 'accBirth', initial = '') {
  const [iy, im] = BOARD.isBirth(initial) ? initial.split('-') : ['', ''];
  const year = new Date().getFullYear();
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const month = h('select', { class: 'acc-input birth__month', id: `${id}M`, 'aria-label': 'Mes' },
    h('option', { value: '', text: 'Mes' }),
    ...U.MONTHS_LONG.map((m, i) => h('option', { value: U.pad2(i + 1), text: cap(m), selected: U.pad2(i + 1) === im })));
  const yr = h('select', { class: 'acc-input birth__year', id: `${id}Y`, 'aria-label': 'Año' },
    h('option', { value: '', text: 'Año' }),
    ...Array.from({ length: 100 }, (_, i) => String(year - i)).map((y) => h('option', { value: y, text: y, selected: y === iy })));
  return {
    nodes: [
      h('label', { class: 'pin-label', for: `${id}M`, text: '¿Cuándo naciste?' }),
      h('div', { class: 'birth' }, month, yr),
      h('p', { class: 'acc-hint', text: 'Solo para saber si puedes aparecer en el ranking global. Se queda en tu dispositivo.' }),
    ],
    value: () => (month.value && yr.value ? `${yr.value}-${month.value}` : ''),
    focus: () => month.focus(),
  };
}

// ---------------------------------------------------------------------
// Unirse
// ---------------------------------------------------------------------
const profileFields = (username = state.account.username) => ({
  username, country: state.profile.country, avatar: state.profile.avatar, show: state.settings.leaderboardOn,
});
const inBoard = () => BOARD.isJoined() && BOARD.joinedName() === (state.account && state.account.username);

/** Cambia el nombre de usuario en este dispositivo (cuenta, perfil y "mantener sesión"). */
export function applyRename(username) {
  mutate((s) => { s.profile.nick = username; if (s.account) s.account.username = username; });
  const kept = store.loadRemember();
  if (kept) store.saveRemember({ ...kept, u: username.toLowerCase() });
}

/**
 * Se une al ranking (o actualiza el nombre) si la cuenta puede y quiere aparecer.
 * interactive = si el nombre está ocupado, abre la ventana para elegir otro.
 */
export async function ensureJoined({ interactive = false } = {}) {
  if (!BOARD.eligible(state.account) || !state.settings.leaderboardOn) return null;
  if (inBoard()) return { ok: true };
  const r = await BOARD.join(profileFields());
  if (r.ok) {
    if (!BOARD.load().noticed) {
      BOARD.markNoticed();
      toast(t('Apareces en el ranking global como {name}. Puedes salir en Ajustes.', { name: state.account.username }), 'good', { ms: 6500 });
    }
    changed();
    return r;
  }
  if (interactive && ['name_taken', 'name_invalid', 'name_blocked'].includes(r.kind)) return nameTakenFlow(r.kind);
  return r;
}

/** "¡Llegó el ranking global!": para cuentas sin fecha de nacimiento (o desde el botón "Unirme"). */
export async function joinDialog() {
  if (!BOARD.enabled() || !state.account) return null;
  const b = birthField('joinBirth', state.account.birth || '');
  const err = h('p', { class: 'form-error', role: 'alert' });
  let birth = '';
  const res = await openDialog({
    className: 'dlg--board',
    title: '¡Llegó el ranking global!',
    body: [
      h('p', { class: 'dlg__text', text: 'Compite con estudiantes de todo el mundo por los minutos de estudio de la semana y de la temporada.' }),
      h('ul', { class: 'board-facts' },
        h('li', { text: t('Apareces con tu nombre de usuario ({name}), tu país y tu animal. Tu foto nunca se sube.', { name: state.account.username }) }),
        h('li', { text: t('Solo cuentan los pomodoros que empiezas con internet, hasta {cap} al día.', { cap: U.formatMinutes(BOARD.capMin()) }) }),
        h('li', { text: 'Puedes salir cuando quieras en Ajustes.' })),
      ...b.nodes, err,
    ],
    actions: [
      { label: 'Ahora no', value: 'later' },
      { label: 'Unirme', value: 'ok', variant: 'btn--gold', primary: true, validate: () => {
        birth = b.value();
        if (!birth) { err.textContent = tr('Elige el mes y el año.'); b.focus(); return false; }
        return true;
      } },
    ],
    onOpen: b.focus,
  });
  BOARD.markAsked();
  if (res !== 'ok') return null;
  mutate((s) => { s.account.birth = birth; s.settings.leaderboardOn = true; });
  if (!BOARD.oldEnough(birth)) {
    toast('El ranking global es para mayores de 13 años. Tus minutos siguen contando en tu progreso.', 'info', { ms: 6500 });
    changed();
    return null;
  }
  const r = await ensureJoined({ interactive: true });
  if (r && !r.ok && r.kind && !r.kind.startsWith('name')) toast(errorText(r.kind), 'warn', { ms: 6000 });
  changed();
  return r;
}

/** El nombre ya está en el ranking (o no está permitido): elegir otro o recuperarlo. */
async function nameTakenFlow(kind) {
  const current = state.account.username;
  const name = h('input', { type: 'text', class: 'acc-input', id: 'boardName', maxlength: '20', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', value: '' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let chosen = '';
  const res = await openDialog({
    className: 'dlg--board',
    title: kind === 'name_taken' ? 'Ese nombre ya está en el ranking' : 'Elige otro nombre para el ranking',
    body: [
      h('p', { class: 'dlg__text', text: kind === 'name_taken'
        ? t('Otra persona del ranking global ya se llama {name}. Elige otro nombre de usuario: también cambiará en tu cuenta.', { name: current })
        : t('El nombre {name} no está permitido en el ranking global. Elige otro: también cambiará en tu cuenta.', { name: current }) }),
      h('label', { class: 'pin-label', for: 'boardName', text: 'Nuevo nombre de usuario' }), name,
      h('p', { class: 'acc-hint', text: '3 a 20 caracteres: letras, números, punto o guion bajo.' }),
      err,
      kind === 'name_taken' && CLOUD.isConfigured()
        ? h('p', { class: 'dlg__note' }, h('button', { type: 'button', class: 'link-btn', id: 'boardClaim', onclick: () => dlg.close('claim') }, '¿Es tuyo, de otro equipo? Recupéralo con tu correo'))
        : null,
    ],
    actions: [
      { label: 'Ahora no', value: 'later' },
      { label: 'Usar este nombre', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        const c = checkUsername(name.value);
        if (!c.ok) { err.textContent = c.reason; name.focus(); return false; }
        err.textContent = tr('Conectando…');
        const r = await BOARD.join(profileFields(c.value));
        if (!r.ok) { err.textContent = errorText(r.kind); name.focus(); return false; }
        chosen = c.value;
        return true;
      } },
    ],
    onOpen: () => name.focus(),
  });
  if (res === 'claim') {
    const ok = await claimFlow();
    return ok ? ensureJoined({ interactive: true }) : nameTakenFlow(kind);
  }
  if (res !== 'ok' || !chosen) return { ok: false, kind };
  applyRename(chosen);
  BOARD.markNoticed();
  toast(t('Listo: ahora eres {name} y ya apareces en el ranking global.', { name: chosen }), 'good', { ms: 6000 });
  changed();
  return { ok: true };
}

/** Recuperar tu lugar con el correo (código de Supabase, el mismo de "¿Olvidaste la contraseña?"). */
async function claimFlow() {
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'claimMail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', value: (state.account && state.account.email) || '' });
  const err1 = h('p', { class: 'form-error', role: 'alert' });
  let email = '';
  const step1 = await openDialog({
    className: 'dlg--board',
    title: 'Recupera tu lugar',
    body: [
      h('p', { class: 'dlg__text', text: 'Escribe el correo de recuperación que usaste en tu otro equipo. Te enviaremos un código.' }),
      h('label', { class: 'pin-label', for: 'claimMail', text: 'Correo' }), mail, err1,
    ],
    actions: [
      { label: 'Volver', value: 'back' },
      { label: 'Enviarme el código', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        email = CLOUD.cleanEmail(mail.value);
        if (!email) { err1.textContent = tr('Revisa el correo: parece que está mal escrito.'); return false; }
        err1.textContent = tr('Enviando…');
        try { await CLOUD.sendRecoveryCode(email); return true; } catch (x) { err1.textContent = CLOUD.errorText(x); return false; }
      } },
    ],
    onOpen: () => mail.focus(),
  });
  if (step1 !== 'ok') return false;
  const code = h('input', { type: 'text', class: 'acc-input acc-input--code', id: 'claimCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', spellcheck: 'false', placeholder: '123456' });
  const err2 = h('p', { class: 'form-error', role: 'alert' });
  const step2 = await openDialog({
    className: 'dlg--board',
    title: 'Revisa tu correo',
    body: [
      h('p', { class: 'dlg__text', text: t('Enviamos un código a {mail}. Si no aparece, mira en spam.', { mail: CLOUD.maskEmail(email) }) }),
      h('label', { class: 'pin-label', for: 'claimCode', text: 'Código' }), code, err2,
    ],
    actions: [
      { label: 'Cancelar', value: 'back' },
      { label: 'Recuperar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        err2.textContent = tr('Conectando…');
        try {
          const session = await CLOUD.verifyRecoveryCode(email, code.value, { keep: true });
          const r = await BOARD.adoptSession(session);
          if (!r.ok) { err2.textContent = r.kind === 'already' ? tr('Tu ranking ya está conectado con otro correo.') : errorText(r.kind); return false; }
          return true;
        } catch (x) { err2.textContent = CLOUD.errorText(x); return false; }
      } },
    ],
    onOpen: () => code.focus(),
  });
  if (step2 !== 'ok') return false;
  if (state.account && !state.account.email) mutate((s) => { s.account.email = email; s.account.emailLinked = true; });
  return true;
}

/** Al agregar el correo o recuperar la contraseña: el lugar en el ranking pasa a esa cuenta. */
export function adoptEmailSession(session) {
  if (!BOARD.enabled() || !session || typeof session !== 'object') return;
  BOARD.adoptSession(session).then((r) => {
    if (r.ok) ensureJoined().then(changed);
  }).catch(() => {});
}

// ---------------------------------------------------------------------
// Al abrir la app y al volver a tener internet
// ---------------------------------------------------------------------
let bound = false;
export async function bootBoard() {
  if (!BOARD.enabled() || !state.account) return;
  if (!bound) {
    bound = true;
    window.addEventListener('online', () => {
      BOARD.flush().catch(() => {});
      if (state.account && BOARD.eligible(state.account) && state.settings.leaderboardOn && !inBoard()) ensureJoined().catch(() => {});
    });
  }
  BOARD.flush().catch(() => {});
  if (!state.account.birth) {
    if (!BOARD.load().asked) await joinDialog();
    return;
  }
  if (!BOARD.eligible(state.account)) return;
  if (state.settings.leaderboardOn) await ensureJoined({ interactive: true });
  else if (BOARD.isJoined()) BOARD.setVisible(false).catch(() => {}); // por si salió sin internet
}

// ---------------------------------------------------------------------
// El temporizador avisa aquí
// ---------------------------------------------------------------------
const counting = () => BOARD.enabled() && state.account && BOARD.eligible(state.account) && state.settings.leaderboardOn && inBoard();
let warnedOffline = '';

/** Empezó un bloque de estudio. */
export function onStudyStart(st) {
  if (!counting()) return;
  BOARD.startSession(st.sessionStartMs, st.durationSec).then((r) => {
    if (!r.ok && r.kind === 'offline' && warnedOffline !== U.dateKey(new Date())) {
      warnedOffline = U.dateKey(new Date());
      toast('Sin conexión: este pomodoro no sumará en el ranking global, pero sí en tu progreso.', 'info', { ms: 6000 });
    }
  }).catch(() => {});
}

/** Se guardó un bloque de estudio. */
export function onStudyRecorded(rec) {
  if (!BOARD.enabled() || rec.mode !== 'study') return;
  BOARD.finishSession(rec.sessionStartMs, rec.actualSec, state.progress.xp).then(changed).catch(() => {});
}

/** Se saltó o reinició el bloque. */
export function onStudyDropped(startMs) {
  if (BOARD.enabled()) BOARD.dropSession(startMs);
}

// ---------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------
/** Interruptor "Aparecer en el ranking". */
export async function onBoardToggle(on) {
  if (!BOARD.enabled() || !state.account) return;
  if (on) {
    if (!state.account.birth) { await joinDialog(); return; }
    if (!BOARD.oldEnough(state.account.birth)) {
      toast('El ranking global es para mayores de 13 años. Tus minutos siguen contando en tu progreso.', 'info', { ms: 6500 });
      return;
    }
    const r = BOARD.isJoined() ? await BOARD.setVisible(true) : await ensureJoined({ interactive: true });
    if (r && !r.ok && r.kind === 'offline') toast('Sin conexión: volverás a aparecer cuando estés en línea.', 'info');
    else if (r && r.ok) toast('Volviste a aparecer en el ranking global.', 'good');
  } else {
    const r = await BOARD.setVisible(false);
    toast(r.ok ? 'Ya no apareces en el ranking global.' : 'Sin conexión: dejarás de aparecer cuando vuelvas a estar en línea.', r.ok ? 'good' : 'info');
  }
  changed();
}

/** Descargar tus datos del ranking (lo que guarda el servidor). */
export async function downloadBoardData() {
  try {
    const data = await BOARD.exportData();
    download('frostpom-ranking.json', JSON.stringify(data, null, 2), 'application/json');
  } catch (e) {
    toast(errorText(e.kind), 'warn');
  }
}

/** Borrar tus datos del ranking (perfil, sesiones y totales en el servidor). */
export async function deleteBoardData() {
  const ok = await confirmDialog('¿Borrar tus datos del ranking global?', 'Se borran tu lugar, tus minutos y tus sesiones del servidor, y dejas de aparecer. Tu progreso en este dispositivo no cambia.', 'Borrar mis datos');
  if (!ok) return;
  try {
    await BOARD.deleteData();
    mutate((s) => { s.settings.leaderboardOn = false; });
    toast('Borramos tus datos del ranking global. Ya no apareces en él.', 'good');
  } catch (e) {
    toast(errorText(e.kind), 'warn');
  }
  changed();
}

/** Al eliminar la cuenta: también se borra lo del servidor (si no hay internet, se olvida aquí). */
export async function deleteBoardOnAccountDelete() {
  if (!BOARD.enabled() || !BOARD.load().refresh) return;
  try {
    await Promise.race([BOARD.deleteData(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
  } catch {
    BOARD.forget();
  }
}

/** Fila de Ajustes con "Descargar" y "Borrar" (solo si ya te uniste). */
export function renderBoardData() {
  const row = $('#boardData');
  if (row) row.hidden = !(BOARD.enabled() && BOARD.load().refresh && BOARD.isJoined());
}
