/*
 * FrostPom — cuentas en línea (v4.0): ventanas y sincronización. La lógica de guardar y traer
 * el progreso está en js/sync.js; la sesión de Supabase la guarda js/board.js.
 *
 *  - "Inicia sesión" (desde la pantalla de crear cuenta, con la flecha para volver): correo y
 *    contraseña → se trae el progreso de la cuenta.
 *  - "Conecta tu cuenta" (Ajustes): para quien ya tenía cuenta en este equipo.
 *  - Mientras usas la app, cada cambio se sube unos segundos después.
 *  - "Cerrar sesión": el progreso queda en tu cuenta y vuelves a "Inicia sesión" (no hace falta
 *    borrar nada). La foto se queda guardada en este equipo para cuando vuelvas.
 *  - Las cuentas de menores de 13 años viven solo en su dispositivo.
 */
import * as SEC from '../security.js';
import * as CLOUD from '../cloud.js';
import * as BOARD from '../board.js';
import * as SYNC from '../sync.js';
import { checkUsername, makeNickname } from '../identity.js';
import { defaultState } from '../storage.js';
import { $, h } from './dom.js';
import { toast, openDialog, confirmDialog, dlg } from './feedback.js';
import { penguin } from './companions.js';
import { birthField, ensureJoined } from './board-ui.js';
import { markUnlocked, rememberDevice, forgetDevice, keepSignedInField, newPasswordError, verifyWithGuard } from './account.js';
import { state, store, mutate, replaceState } from './context.js';
import { t, tr, locale } from '../i18n.js';
import * as U from '../util.js';

/** ¿Esta cuenta guarda su progreso en línea? */
export const isOnline = () => SYNC.enabled() && !!state.account && state.account.online === true;
/** ¿Puede tener cuenta en línea? (13+ o fecha aún desconocida) */
const canBeOnline = () => SYNC.enabled() && !!state.account && (!state.account.birth || BOARD.oldEnough(state.account.birth));

const errText = (e) => (e && e.kind === 'notready' ? tr('Las cuentas en línea todavía no están disponibles.') : CLOUD.errorText(e));
const hours = (s) => {
  const h1 = Math.round(((s && s.progress && s.progress.totals && s.progress.totals.studySec) || 0) / 360) / 10;
  return t('{n} h estudiadas', { n: h1.toLocaleString() });
};

// ---------------------------------------------------------------------
// Crear la cuenta en línea (lo usa el registro, en account.js)
// ---------------------------------------------------------------------
let triedNow = false; // ya se intentó crear la cuenta en línea al abrir esta vez: no se vuelve a preguntar enseguida
export async function createOnline(email, password) {
  try {
    return { ok: true, session: await CLOUD.signUp(email, password) };
  } catch (e) {
    triedNow = true;
    return { ok: false, kind: e.kind || 'server' };
  }
}

/** Después de guardar la cuenta local: se guarda la sesión y se sube el progreso. */
export async function afterOnlineCreated(session) {
  if (!session) return;
  await BOARD.adoptSession(session); // si ya estaba en el ranking (cuenta anónima), su lugar pasa a esta cuenta
  SYNC.markDirty();
  await flush();
  ensureJoined().catch(() => {});
}

// ---------------------------------------------------------------------
// Iniciar sesión en un equipo nuevo
// ---------------------------------------------------------------------
/** Devuelve true si entró (y trajo el progreso) o false si tocó "volver". */
export async function signInFlow(prefill = '', { signedOut = false } = {}) {
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'signMail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', placeholder: 'tucorreo@ejemplo.com', value: prefill });
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'signPass', maxlength: '64', autocomplete: 'current-password' });
  const keep = keepSignedInField('signKeep');
  const err = h('p', { class: 'form-error', role: 'alert' });
  let session = null;
  let remote = null;
  const res = await openDialog({
    className: 'dlg--onb dlg--gate dlg--signin',
    dismissable: false,
    back: 'back',
    title: 'Inicia sesión',
    body: [
      h('div', { class: 'onb__mascot' }, penguin('saludo', { size: 88 })),
      h('p', { class: 'dlg__text', text: signedOut
        ? 'Cerraste sesión. Tu progreso sigue guardado en tu cuenta: entra cuando quieras con tu correo y tu contraseña.'
        : 'Entra con el correo y la contraseña de tu cuenta. Tu progreso llega contigo.' }),
      h('form', { class: 'pin-form', onsubmit: (e) => { e.preventDefault(); $('[data-primary]', dlg).click(); } },
        h('label', { class: 'pin-label', for: 'signMail', text: 'Correo' }), mail,
        h('label', { class: 'pin-label', for: 'signPass', text: 'Contraseña' }), pass, err,
        keep.field,
        h('button', { type: 'submit', hidden: true, tabindex: '-1' })),
      h('p', { class: 'dlg__note' }, h('button', { type: 'button', class: 'link-btn', id: 'signForgot', onclick: () => dlg.close('forgot') }, '¿Olvidaste la contraseña?')),
      h('p', { class: 'signin-switch' }, h('button', { type: 'button', class: 'link-btn', id: 'toCreate', onclick: () => dlg.close('back') }, '¿No tienes cuenta? Crea una')),
    ],
    actions: [{
      label: 'Entrar', value: 'ok', variant: 'btn--gold btn--xl', primary: true,
      validate: async () => {
        const e = CLOUD.cleanEmail(mail.value);
        if (!e) { err.textContent = tr('Revisa el correo: parece que está mal escrito.'); mail.focus(); return false; }
        if (!pass.value) { err.textContent = tr('Escribe tu contraseña.'); pass.focus(); return false; }
        err.textContent = tr('Conectando…');
        try {
          session = await CLOUD.signIn(e, pass.value);
          BOARD.forget(); // este equipo no tenía cuenta: empieza limpio
          await BOARD.adoptSession(session);
          remote = await SYNC.pull();
          return true;
        } catch (x) {
          err.textContent = errText(x);
          pass.value = '';
          return false;
        }
      },
    }],
    onOpen: () => (prefill ? pass : mail).focus(),
  });
  if (res === 'forgot') return forgotOnlineFlow(CLOUD.cleanEmail(mail.value));
  if (res !== 'ok' || !session) return false;
  return finishSignIn({ email: CLOUD.cleanEmail(mail.value), password: pass.value, remote, keep: keep.box.checked });
}

/** Con la sesión abierta: arma la cuenta de este equipo con el progreso de la nube. */
async function finishSignIn({ email, password, remote, keep }) {
  const rec = await SEC.hashPassword(password);
  let next;
  if (remote && remote.data && remote.data.profile && checkUsername(remote.data.profile.nick).ok) {
    next = SYNC.restore(remote.data, null);
    SYNC.adopted(remote.version);
  } else {
    // La cuenta existe pero todavía no tiene progreso guardado: se elige el nombre de usuario
    const username = await chooseNameFlow();
    next = defaultState();
    next.profile.nick = username;
    next.profile.avatar = makeNickname().avatar;
  }
  next.profile.onboarded = true;
  next.account = { username: next.profile.nick, ...rec, email, emailLinked: true, online: true };
  // Si esta cuenta cerró sesión antes en este equipo, su foto sigue aquí (nunca se sube)
  const id = BOARD.load().uid;
  const photo = id ? store.photoFor(id) : '';
  if (photo) { next.profile.photo = photo; store.dropPhoto(id); }
  replaceState(next);
  markUnlocked();
  if (keep) await rememberDevice(); else forgetDevice();
  SYNC.markDirty();
  flush();
  ensureJoined().catch(() => {});
  toast(remote ? t('¡Hola de nuevo, {name}! Trajimos tu progreso.', { name: next.profile.nick }) : t('¡Bienvenido, {name}!', { name: next.profile.nick }), 'good', { ms: 5000 });
  return true;
}

async function chooseNameFlow() {
  const name = h('input', { type: 'text', class: 'acc-input', id: 'signName', maxlength: '20', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let chosen = '';
  await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    title: 'Elige tu nombre de usuario',
    body: [
      h('p', { class: 'dlg__text', text: 'Tu cuenta todavía no tiene progreso guardado. Elige cómo te llamarás en FrostPom.' }),
      h('label', { class: 'pin-label', for: 'signName', text: 'Nombre de usuario' }), name,
      h('p', { class: 'acc-hint', text: '3 a 20 caracteres: letras, números, punto o guion bajo.' }), err,
    ],
    actions: [{ label: 'Listo', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
      const c = checkUsername(name.value);
      if (!c.ok) { err.textContent = c.reason; return false; }
      if (BOARD.enabled() && (await BOARD.nameAvailable(c.value)) === false) { err.textContent = tr('Ese nombre ya lo usa otra persona en FrostPom. Prueba con otro.'); return false; }
      chosen = c.value;
      return true;
    } }],
    onOpen: () => name.focus(),
  });
  return chosen;
}

/** "¿Olvidaste la contraseña?" en la pantalla de iniciar sesión: código al correo + contraseña nueva. */
async function forgotOnlineFlow(prefill = '') {
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'fgMail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', value: prefill });
  const err1 = h('p', { class: 'form-error', role: 'alert' });
  let email = '';
  const s1 = await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    back: 'back',
    title: 'Recupera tu contraseña',
    body: [
      h('p', { class: 'dlg__text', text: 'Escribe el correo de tu cuenta. Te enviaremos un código.' }),
      h('label', { class: 'pin-label', for: 'fgMail', text: 'Correo' }), mail, err1,
    ],
    actions: [{ label: 'Enviarme el código', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
      email = CLOUD.cleanEmail(mail.value);
      if (!email) { err1.textContent = tr('Revisa el correo: parece que está mal escrito.'); return false; }
      err1.textContent = tr('Enviando…');
      try { await CLOUD.sendRecoveryCode(email); return true; } catch (x) { err1.textContent = errText(x); return false; }
    } }],
    onOpen: () => mail.focus(),
  });
  if (s1 !== 'ok') return signInFlow(prefill);
  const code = h('input', { type: 'text', class: 'acc-input acc-input--code', id: 'fgCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', spellcheck: 'false', placeholder: '123456' });
  const p1 = h('input', { type: 'password', class: 'acc-input', id: 'fgPass1', maxlength: '64', autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', class: 'acc-input', id: 'fgPass2', maxlength: '64', autocomplete: 'new-password' });
  const err2 = h('p', { class: 'form-error', role: 'alert' });
  let remote = null;
  const s2 = await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    back: 'back',
    title: 'Revisa tu correo',
    body: [
      h('p', { class: 'dlg__text', text: t('Enviamos un código a {mail}. Si no aparece, mira en spam.', { mail: CLOUD.maskEmail(email) }) }),
      h('label', { class: 'pin-label', for: 'fgCode', text: 'Código' }), code,
      h('label', { class: 'pin-label', for: 'fgPass1', text: 'Nueva contraseña' }), p1,
      h('label', { class: 'pin-label', for: 'fgPass2', text: 'Repite la nueva contraseña' }), p2, err2,
    ],
    actions: [{ label: 'Guardar y entrar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
      const problem = newPasswordError(p1.value, p2.value, '\u0001');
      if (problem) { err2.textContent = tr(problem); return false; }
      err2.textContent = tr('Comprobando…');
      try {
        const session = await CLOUD.verifyRecoveryCode(email, code.value, { keep: true });
        if (!session || typeof session !== 'object') throw Object.assign(new Error('server'), { kind: 'server' });
        await CLOUD.updatePassword(session.access, p1.value);
        BOARD.forget();
        await BOARD.adoptSession(session);
        remote = await SYNC.pull();
        return true;
      } catch (x) { err2.textContent = errText(x); return false; }
    } }],
    onOpen: () => code.focus(),
  });
  if (s2 !== 'ok') return signInFlow(email);
  return finishSignIn({ email, password: p1.value, remote, keep: true });
}

// ---------------------------------------------------------------------
// Conectar una cuenta de este equipo (Ajustes)
// ---------------------------------------------------------------------
export async function connectFlow({ pending = false } = {}) {
  if (!state.account || !SYNC.enabled() || isOnline()) return;
  if (state.account.birth && !BOARD.oldEnough(state.account.birth)) {
    toast('Las cuentas en línea son para mayores de 13 años. Tu progreso sigue guardado en este dispositivo.', 'info', { ms: 6500 });
    return;
  }
  const b = state.account.birth ? null : birthField('conBirth');
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'conMail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', value: state.account.email || '' });
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'conPass', maxlength: '64', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let email = '';
  let birth = state.account.birth || '';
  let session = null;
  let needsCode = false;
  const res = await openDialog({
    title: pending ? 'Termina de crear tu cuenta en línea' : 'Conecta tu cuenta',
    body: [
      h('p', { class: 'dlg__text', text: 'Con tu correo y tu contraseña podrás entrar desde cualquier equipo, y tu progreso (menos la foto) quedará guardado en tu cuenta.' }),
      b ? b.nodes : null,
      h('label', { class: 'pin-label', for: 'conMail', text: 'Correo' }), mail,
      h('label', { class: 'pin-label', for: 'conPass', text: 'Tu contraseña de FrostPom' }), pass, err,
    ],
    actions: [
      { label: 'Ahora no', value: 'cancel' },
      { label: 'Conectar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        if (b) {
          birth = b.value();
          if (!birth) { err.textContent = tr('Elige el mes y el año en que naciste.'); return false; }
          if (!BOARD.oldEnough(birth)) { err.textContent = tr('Las cuentas en línea son para mayores de 13 años.'); return false; }
        }
        email = CLOUD.cleanEmail(mail.value);
        if (!email) { err.textContent = tr('Revisa el correo: parece que está mal escrito.'); mail.focus(); return false; }
        const v = await verifyWithGuard(pass.value, { wrong: 'La contraseña no es correcta.' });
        if (!v.ok) { err.textContent = v.message; pass.value = ''; return false; }
        err.textContent = tr('Conectando…');
        try {
          session = await CLOUD.signUp(email, pass.value);
          return true;
        } catch (x) {
          if (x.kind !== 'exists') { err.textContent = errText(x); return false; }
        }
        // El correo ya tiene cuenta: si la contraseña es la misma, entra; si no, se confirma con un código
        try {
          session = await CLOUD.signIn(email, pass.value);
        } catch (x) {
          if (x.kind !== 'badlogin') { err.textContent = errText(x); return false; }
          needsCode = true;
        }
        return true;
      } },
    ],
    onOpen: () => (b ? b.focus() : pass.focus()),
  });
  if (res !== 'ok') return;
  const password = pass.value;
  if (needsCode) {
    session = await confirmEmailFlow(email);
    if (!session) return;
    try { await CLOUD.updatePassword(session.access, password); } catch { /* se puede cambiar después */ }
  }
  // ¿La cuenta ya tenía progreso guardado (de otro equipo)? Se elige cuál queda.
  await BOARD.adoptSession(session);
  let remote = null;
  try { remote = await SYNC.pull(); } catch { /* sin progreso o sin conexión: se sube el de aquí */ }
  let useRemote = false;
  if (remote && remote.data) {
    const pick = await openDialog({
      title: 'Tu cuenta ya tiene progreso',
      body: [h('p', { class: 'dlg__text', text: '¿Con cuál progreso quieres seguir? El otro se reemplaza.' })],
      actions: [
        { label: t('El de mi cuenta ({h})', { h: hours(remote.data) }), value: 'remote' },
        { label: t('El de este equipo ({h})', { h: hours(state) }), value: 'local', variant: 'btn--gold', primary: true },
      ],
      dismissable: false,
    });
    useRemote = pick === 'remote';
    SYNC.adopted(remote.version);
  }
  mutate((s) => {
    s.account.email = email;
    s.account.emailLinked = true;
    s.account.online = true;
    delete s.account.cloudPending;
    if (birth) s.account.birth = birth;
  });
  if (useRemote) applyRemote(remote.data);
  else { SYNC.markDirty(); await flush(); }
  ensureJoined().catch(() => {});
  toast(t('¡Listo! Ya puedes entrar desde cualquier equipo con {mail}.', { mail: CLOUD.maskEmail(email) }), 'good', { ms: 6000 });
  document.dispatchEvent(new CustomEvent('frostpom:cloud'));
}

/** El correo ya tiene cuenta con otra contraseña: se confirma que es tuyo con un código. */
async function confirmEmailFlow(email) {
  try { await CLOUD.sendRecoveryCode(email); } catch (x) { toast(errText(x), 'warn'); return null; }
  const code = h('input', { type: 'text', class: 'acc-input acc-input--code', id: 'conCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', spellcheck: 'false', placeholder: '123456' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let session = null;
  const res = await openDialog({
    title: 'Confirma que el correo es tuyo',
    body: [
      h('p', { class: 'dlg__text', text: t('Ese correo ya tiene una cuenta. Enviamos un código a {mail}: escríbelo para conectarla con esta.', { mail: CLOUD.maskEmail(email) }) }),
      h('label', { class: 'pin-label', for: 'conCode', text: 'Código' }), code, err,
    ],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Confirmar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        err.textContent = tr('Comprobando…');
        try {
          session = await CLOUD.verifyRecoveryCode(email, code.value, { keep: true });
          return !!session && typeof session === 'object';
        } catch (x) { err.textContent = errText(x); return false; }
      } },
    ],
    onOpen: () => code.focus(),
  });
  return res === 'ok' ? session : null;
}

// ---------------------------------------------------------------------
// La sesión en línea se cerró (por ejemplo, cambiaste la contraseña en otro equipo)
// ---------------------------------------------------------------------
export async function reconnectFlow() {
  if (!isOnline()) return;
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'recPass', maxlength: '64', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let session = null;
  const res = await openDialog({
    title: 'Vuelve a entrar a tu cuenta',
    body: [
      h('p', { class: 'dlg__text', text: t('Escribe la contraseña de tu cuenta ({mail}) para seguir guardando tu progreso.', { mail: CLOUD.maskEmail(state.account.email) }) }),
      h('label', { class: 'pin-label', for: 'recPass', text: 'Contraseña' }), pass, err,
    ],
    actions: [
      { label: 'Ahora no', value: 'cancel' },
      { label: 'Entrar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
        err.textContent = tr('Conectando…');
        try { session = await CLOUD.signIn(state.account.email, pass.value); return true; } catch (x) { err.textContent = errText(x); return false; }
      } },
    ],
    onOpen: () => pass.focus(),
  });
  if (res !== 'ok' || !session) return;
  // Si la contraseña cambió en otro equipo, aquí también
  if (!(await SEC.verifyPassword(pass.value, state.account))) {
    const rec = await SEC.hashPassword(pass.value);
    mutate((s) => { Object.assign(s.account, rec); });
  }
  await BOARD.adoptSession(session);
  await startOrResume();
  await ensureJoined().catch(() => null); // (v4.3) y tus pomodoros vuelven a sumar en el ranking
  toast('Listo: tu progreso se vuelve a guardar en tu cuenta.', 'good');
  document.dispatchEvent(new CustomEvent('frostpom:cloud'));
  document.dispatchEvent(new CustomEvent('frostpom:board'));
}

// ---------------------------------------------------------------------
// Cerrar sesión
// ---------------------------------------------------------------------
/**
 * Cerrar sesión en una cuenta en línea (v4.0.1). El progreso queda guardado en la cuenta y este
 * equipo vuelve a la pantalla de "Inicia sesión", con el correo ya escrito. No hace falta borrar
 * la cuenta para salir. La foto (que nunca se sube) se guarda aparte en este equipo y vuelve si
 * la misma cuenta entra otra vez aquí. Devuelve false si no se cerró.
 */
export async function signOutOnline({ title = '¿Cerrar sesión?', confirmLabel = 'Cerrar sesión' } = {}) {
  if (!isOnline()) return false;
  const email = state.account.email;
  const ok = await confirmDialog(title,
    t('Tu progreso queda guardado en tu cuenta ({mail}). Para volver, entra con tu correo y tu contraseña, en este o en cualquier equipo.', { mail: CLOUD.maskEmail(email) }),
    confirmLabel, 'btn--gold'); // no se borra nada: no es un botón rojo
  if (!ok) return false;
  clearTimeout(timer);
  const r = await SYNC.push(state);
  if (!r.ok && SYNC.load().dirty) {
    const anyway = await confirmDialog('No pudimos guardar tus últimos cambios',
      'Puede que no haya internet. Si cierras sesión ahora, se pierde lo que hiciste desde el último guardado. Mejor conéctate y vuelve a intentarlo.',
      'Cerrar sesión igual');
    if (!anyway) return false;
  }
  await BOARD.flush().catch(() => {}); // minutos del ranking que quedaron pendientes
  const id = BOARD.load().uid;
  const photo = state.profile.photo;
  try { await CLOUD.signOut(await BOARD.authToken()); } catch { /* sin conexión: igual se cierra aquí */ }
  if (id && photo) store.keepPhoto(id, photo);
  store.tab.remove('unlocked');
  store.tab.set('signedout', email);
  clearTimeout(timer);
  BOARD.forget();
  SYNC.forget();
  store.wipe({ keep: ['lang', 'photos'], final: true }); // el idioma es del equipo, no de la cuenta
  return reloadApp();
}

/** Recarga la app. La promesa nunca se cumple: lo que esperaba (la entrada) ya no debe seguir. */
export function reloadApp() {
  location.reload();
  return new Promise(() => {});
}

/** Correo de la cuenta que acaba de cerrar sesión en esta pestaña (para escribirlo en "Inicia sesión"). */
export function justSignedOut() {
  const v = store.tab.get('signedout');
  if (v === null) return null;
  store.tab.remove('signedout');
  return CLOUD.cleanEmail(v) || '';
}

/** Al eliminar la cuenta: la cuenta en línea se borra completa (necesita internet). */
export async function deleteOnlineAccount() {
  if (!isOnline()) return { ok: true };
  try {
    await BOARD.callServer('delete_my_cloud_account', {});
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.kind === 'offline' ? tr('Necesitas internet para eliminar tu cuenta en línea.') : errText(e) };
  }
}

/** Cambiar la contraseña: en una cuenta en línea, también allá (necesita internet). */
export async function changeOnlinePassword(password) {
  if (!isOnline()) return { ok: true };
  try {
    const tk = await BOARD.authToken();
    if (!tk) return { ok: false, message: tr('Tu sesión en línea se cerró. Vuelve a entrar desde Ajustes → Tu cuenta.') };
    await CLOUD.updatePassword(tk, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.kind === 'offline' ? tr('Necesitas internet para cambiar la contraseña de tu cuenta en línea.') : errText(e) };
  }
}

// ---------------------------------------------------------------------
// Sincronizar mientras usas la app
// ---------------------------------------------------------------------
let timer = 0;
let applying = false;
let bound = false;

/** Reemplaza el progreso de este equipo por el de la cuenta (sin volver a subirlo). */
function adoptState(next) {
  const before = state.account && state.account.username;
  applying = true;
  try { replaceState(next); } finally { applying = false; }
  // Si el nombre se cambió en otro equipo, el "mantener sesión iniciada" sigue valiendo
  if (before && state.account && state.account.username !== before) {
    const kept = store.loadRemember();
    if (kept) store.saveRemember({ ...kept, u: state.account.username.toLowerCase() });
  }
}
const applyRemote = (data) => adoptState(SYNC.restore(data, state));

async function flush() {
  clearTimeout(timer);
  if (!isOnline()) return;
  const r = await SYNC.push(state);
  if (r.adopt) {
    adoptState(r.adopt);
    toast('Trajimos tu progreso más reciente de tu cuenta.', 'info');
  }
  document.dispatchEvent(new CustomEvent('frostpom:cloud'));
}

async function startOrResume() {
  const r = await SYNC.syncOnOpen(state);
  if (r.adopt) {
    adoptState(r.adopt);
    toast('Trajimos tu progreso más reciente de tu cuenta.', 'info');
  }
  document.dispatchEvent(new CustomEvent('frostpom:cloud'));
}

/** Al abrir la app (después de entrar). */
export async function bootCloud() {
  if (!SYNC.enabled() || !state.account) return;
  if (!bound) {
    bound = true;
    document.addEventListener('frostpom:saved', () => {
      if (applying || !isOnline()) return;
      SYNC.markDirty();
      clearTimeout(timer);
      timer = setTimeout(flush, 8000);
    });
    window.addEventListener('online', () => { if (isOnline() && SYNC.load().dirty) flush(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && isOnline() && SYNC.load().dirty) flush(); });
  }
  if (isOnline()) {
    if (BOARD.hasAccountSession()) await startOrResume(); // (si la sesión ya no sirve, aquí se nota)
    // (v4.3) Si la sesión se cerró (por ejemplo, cerraste sesión en otro equipo con una versión
    // anterior), se pide la contraseña una vez al abrir: antes solo se veía en Ajustes y, mientras
    // tanto, no se guardaba el progreso ni sumaban los pomodoros en el ranking.
    if (!BOARD.hasAccountSession() && navigator.onLine !== false && !store.tab.get('reconnect_asked')) {
      store.tab.set('reconnect_asked', '1');
      await reconnectFlow();
    }
    return;
  }
  if (state.account.cloudPending && navigator.onLine && !triedNow) await connectFlow({ pending: true });
}

// ---------------------------------------------------------------------
// Ajustes → Tu cuenta
// ---------------------------------------------------------------------
export function renderCloudSettings() {
  const row = $('#accCloudRow');
  if (!row) return;
  const show = SYNC.enabled() && !!state.account;
  row.hidden = !show;
  $('#accMailRow').hidden = !state.account || !CLOUD.isConfigured() || isOnline(); // en línea, el correo es para entrar
  if (!show) return;
  const text = $('#accCloudText');
  const btn = $('#accCloudBtn');
  btn.hidden = false;
  if (isOnline() && !BOARD.hasAccountSession()) {
    text.textContent = tr('Tu sesión en línea se cerró. Vuelve a entrar para seguir guardando tu progreso.');
    btn.textContent = tr('Volver a entrar');
    btn.dataset.action = 'reconnect';
  } else if (isOnline()) {
    const at = SYNC.lastSync();
    let when = '';
    if (at) {
      const d = new Date(at);
      let day = '';
      try { day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }); } catch { day = ''; }
      when = `${day ? `${day}, ` : ''}${U.pad2(d.getHours())}:${U.pad2(d.getMinutes())}`;
    }
    text.textContent = t('Cuenta en línea: {mail}. Tu progreso (menos la foto) se guarda en tu cuenta.', { mail: CLOUD.maskEmail(state.account.email) })
      + (when ? ` ${t('Último guardado: {when}.', { when })}` : '');
    btn.hidden = true; // para salir: "Cerrar sesión" (el progreso queda en la cuenta)
    btn.dataset.action = '';
  } else if (!canBeOnline()) {
    text.textContent = tr('Las cuentas de menores de 13 años se guardan solo en este dispositivo.');
    btn.hidden = true;
  } else {
    text.textContent = tr(state.account.cloudPending
      ? 'Tu cuenta en línea quedó pendiente porque no había internet. Termina de crearla para entrar desde cualquier equipo.'
      : 'Conecta tu cuenta para entrar desde cualquier equipo con tu correo y tu contraseña.');
    btn.textContent = tr('Conectar');
    btn.dataset.action = 'connect';
  }
}

export function onCloudButton(e) {
  const a = e.currentTarget.dataset.action;
  if (a === 'reconnect') reconnectFlow();
  else if (a === 'connect') connectFlow({ pending: !!(state.account && state.account.cloudPending) });
}
