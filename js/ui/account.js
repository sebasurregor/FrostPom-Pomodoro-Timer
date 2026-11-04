/*
 * StudyTimer — cuenta: nombre de usuario y contraseña (se guardan en este dispositivo;
 * la contraseña solo como hash PBKDF2), bienvenida e inicio de sesión.
 * Cuando exista el servidor, esta misma validación se repite allá.
 */
import * as G from '../game.js';
import * as SEC from '../security.js';
import { checkUsername, isValidNick, makeNickname } from '../identity.js';
import * as FX from './effects.js';
import { $, h, fmtInt } from './dom.js';
import { toast, openDialog, confirmDialog, dlg } from './feedback.js';
import { penguin } from './companions.js';
import { avatarOptions, countryPicker } from './widgets.js';
import { pickProfilePhoto, photoImg } from './photo.js';
import { skipPaywallToday } from './premium.js';
import { state, store, mutate, migrated } from './context.js';

// ---------- Sesión desbloqueada (solo mientras la pestaña esté abierta) ----------
export const isUnlocked = () => store.tab.get('unlocked') === '1';
const markUnlocked = () => store.tab.set('unlocked', '1');
export function logout() {
  store.tab.remove('unlocked');
  location.reload();
}

/** Reglas de una contraseña nueva. Devuelve el motivo del error o '' si está bien. */
function newPasswordError(pass1, pass2, username) {
  const pc = SEC.checkPassword(pass1);
  if (!pc.ok) return pc.reason;
  if (pass1 !== pass2) return 'Las dos contraseñas no coinciden.';
  if (pass1.toLowerCase().includes(username.toLowerCase())) return 'La contraseña no puede contener tu nombre de usuario.';
  return '';
}

/**
 * Comprueba usuario y contraseña respetando el bloqueo por intentos fallidos
 * (el mismo para iniciar sesión y para cambiar la contraseña).
 */
async function verifyWithGuard(password, { username = state.account.username, wrong }) {
  const guard = store.loadGuard();
  const wait = SEC.lockRemainingMs(guard);
  if (wait > 0) return { ok: false, message: `Demasiados intentos. Espera ${Math.ceil(wait / 1000)} segundos.` };
  const ok = username.trim().toLowerCase() === state.account.username.toLowerCase() && await SEC.verifyPassword(password, state.account);
  if (ok) {
    store.saveGuard({ fails: 0, lockedUntil: 0 });
    return { ok: true, message: '' };
  }
  const g = SEC.registerFailure(guard);
  store.saveGuard(g);
  FX.sfx.error();
  const lockMs = SEC.lockRemainingMs(g);
  return { ok: false, message: lockMs > 0 ? `Datos incorrectos. Espera ${Math.ceil(lockMs / 1000)} segundos.` : wrong };
}

const NAME_HINT = '3 a 20 caracteres: letras, números, punto o guion bajo.';

/** Campos de nombre (y contraseña) con su validación. validate() devuelve el registro o null. */
function accountFields({ withPassword = true, initialName = '' } = {}) {
  const name = h('input', { type: 'text', class: 'acc-input', id: 'accUser', maxlength: '20', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', value: initialName, placeholder: 'Ej.: pingu_estudia' });
  const nameHint = h('p', { class: 'acc-hint', 'aria-live': 'polite', text: NAME_HINT });
  const suggest = h('button', { type: 'button', class: 'btn btn--paper btn--sm', onclick: () => { name.value = makeNickname().nick; check(); } }, 'Sugerir uno');
  const pass1 = h('input', { type: 'password', class: 'acc-input', id: 'accPass1', maxlength: '64', autocomplete: 'new-password' });
  const pass2 = h('input', { type: 'password', class: 'acc-input', id: 'accPass2', maxlength: '64', autocomplete: 'new-password' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  function check() {
    const r = checkUsername(name.value);
    nameHint.textContent = r.ok ? '¡Ese nombre está disponible!' : (name.value ? r.reason : NAME_HINT);
    nameHint.classList.toggle('is-ok', r.ok);
    return r;
  }
  name.addEventListener('input', check);
  const nodes = [
    h('label', { class: 'pin-label', for: 'accUser', text: 'Nombre de usuario' }),
    h('p', { class: 'acc-hint acc-hint--privacy', id: 'accPrivacy', text: '🔒 Usa un nombre que no revele quién eres: es lo único que otros verán en el ranking.' }),
    h('div', { class: 'acc-row' }, name, suggest), nameHint,
    withPassword ? [
      h('label', { class: 'pin-label', for: 'accPass1', text: 'Contraseña' }), pass1,
      h('p', { class: 'acc-hint', text: 'Mínimo 8 caracteres, con letras y números.' }),
      h('label', { class: 'pin-label', for: 'accPass2', text: 'Repite la contraseña' }), pass2,
    ] : null,
    err,
  ];
  async function validate() {
    const r = check();
    if (!r.ok) { err.textContent = r.reason; name.focus(); return null; }
    if (!withPassword) { err.textContent = ''; return { username: r.value }; }
    const problem = newPasswordError(pass1.value, pass2.value, r.value);
    if (problem) { err.textContent = problem; pass1.focus(); return null; }
    try {
      const rec = await SEC.hashPassword(pass1.value);
      err.textContent = '';
      return { username: r.value, ...rec };
    } catch (e) { err.textContent = e.message; return null; }
  }
  return { nodes, validate, focus: () => name.focus() };
}

/** Al abrir la app con cuenta, se pide la contraseña (una vez por pestaña). */
export async function loginGate() {
  if (!state.account || isUnlocked()) return;
  const user = h('input', { type: 'text', class: 'acc-input', id: 'loginUser', autocomplete: 'username', autocapitalize: 'off', value: state.account.username });
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'loginPass', autocomplete: 'current-password', maxlength: '64' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const res = await openDialog({
    className: 'dlg--onb',
    dismissable: false,
    title: '¡Hola de nuevo!',
    body: [
      h('div', { class: 'onb__mascot' }, penguin('saludo', { size: 96 })),
      h('form', { class: 'pin-form', onsubmit: (e) => { e.preventDefault(); $('[data-primary]', dlg).click(); } },
        h('label', { class: 'pin-label', for: 'loginUser', text: 'Nombre de usuario' }), user,
        h('label', { class: 'pin-label', for: 'loginPass', text: 'Contraseña' }), pass, err,
        h('button', { type: 'submit', hidden: true, tabindex: '-1' })),
      h('p', { class: 'dlg__note', text: 'Tu cuenta vive en este dispositivo. Si olvidaste la contraseña, puedes empezar de nuevo (se borra el progreso de aquí).' }),
    ],
    actions: [
      { label: 'Empezar de nuevo', value: 'reset' },
      {
        label: 'Entrar', value: 'ok', variant: 'btn--gold', primary: true,
        validate: async () => {
          const v = await verifyWithGuard(pass.value, { username: user.value, wrong: 'Nombre o contraseña incorrectos.' });
          if (v.ok) return true;
          pass.value = '';
          err.textContent = v.message;
          return false;
        },
      },
    ],
    onOpen: () => pass.focus(),
  });
  if (res === 'reset') {
    const sure = await confirmDialog('¿Empezar de nuevo?', 'Se borra todo el progreso guardado en este dispositivo. No se puede deshacer.', 'Borrar y empezar');
    if (sure) { store.wipe(); location.reload(); return; }
    return loginGate();
  }
  markUnlocked();
}

export async function createAccountFlow({ required = false } = {}) {
  const nick = state.profile.nick;
  const f = accountFields({ initialName: isValidNick(nick) && checkUsername(nick).ok ? nick : '' });
  let rec = null;
  const res = await openDialog({
    className: 'dlg--onb',
    dismissable: !required,
    title: 'Crea tu cuenta',
    body: [h('p', { class: 'dlg__text', text: 'Elige tu nombre de usuario y una contraseña.' }), ...f.nodes],
    actions: [
      required ? null : { label: 'Ahora no', value: 'later' },
      { label: 'Crear cuenta', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => { rec = await f.validate(); return !!rec; } },
    ].filter(Boolean),
    onOpen: f.focus,
  });
  if (res === 'ok' && rec) {
    mutate((s) => { s.account = rec; s.profile.nick = rec.username; });
    markUnlocked();
    toast(`Cuenta creada. ¡Bienvenido, ${rec.username}!`, 'good');
  }
}

export async function renameFlow() {
  const f = accountFields({ withPassword: false, initialName: state.profile.nick });
  let rec = null;
  const res = await openDialog({
    title: 'Cambiar nombre de usuario', body: f.nodes,
    actions: [{ label: 'Cancelar', value: 'cancel' }, { label: 'Guardar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => { rec = await f.validate(); return !!rec; } }],
    onOpen: f.focus,
  });
  if (res === 'ok' && rec) mutate((s) => { s.profile.nick = rec.username; if (s.account) s.account.username = rec.username; });
}

export async function changePasswordFlow() {
  if (!state.account) return createAccountFlow();
  const field = (label, autocomplete) => h('input', { type: 'password', class: 'acc-input', autocomplete, maxlength: '64', 'aria-label': label });
  const cur = field('Contraseña actual', 'current-password');
  const p1 = field('Nueva contraseña', 'new-password');
  const p2 = field('Repite la nueva contraseña', 'new-password');
  const err = h('p', { class: 'form-error', role: 'alert' });
  let rec = null;
  const res = await openDialog({
    title: 'Cambiar contraseña',
    body: [h('label', { class: 'pin-label', text: 'Contraseña actual' }), cur, h('label', { class: 'pin-label', text: 'Nueva contraseña' }), p1, h('label', { class: 'pin-label', text: 'Repítela' }), p2, err],
    actions: [{ label: 'Cancelar', value: 'cancel' }, {
      label: 'Guardar', value: 'ok', variant: 'btn--gold', primary: true,
      validate: async () => {
        // El mismo bloqueo por intentos que al iniciar sesión (antes aquí no había límite).
        const v = await verifyWithGuard(cur.value, { wrong: 'La contraseña actual no es correcta.' });
        if (!v.ok) { err.textContent = v.message; return false; }
        const problem = newPasswordError(p1.value, p2.value, state.account.username);
        if (problem) { err.textContent = problem; return false; }
        try { rec = await SEC.hashPassword(p1.value); return true; } catch (e) { err.textContent = e.message; return false; }
      },
    }],
    onOpen: () => cur.focus(),
  });
  if (res === 'ok' && rec) {
    mutate((s) => { s.account = { username: s.account.username, ...rec }; });
    toast('Contraseña actualizada.', 'good');
  }
}

/**
 * Eliminar la cuenta desde la app (lo exigen Apple, regla 5.1.1(v), y Google Play).
 * Pide la contraseña con el mismo bloqueo por intentos que el inicio de sesión.
 */
export async function deleteAccountFlow() {
  const hasAccount = !!state.account;
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'delPass', autocomplete: 'current-password', maxlength: '64', 'aria-label': 'Tu contraseña' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const res = await openDialog({
    title: hasAccount ? '¿Eliminar tu cuenta?' : '¿Borrar los datos de este dispositivo?',
    body: [
      h('p', { class: 'dlg__text', text: 'Se borran para siempre tu cuenta, tu rango, tus temporadas, tu calendario, tus logros y tus ajustes. No se puede deshacer.' }),
      hasAccount ? [h('label', { class: 'pin-label', for: 'delPass', text: 'Escribe tu contraseña para confirmar' }), pass] : null,
      err,
    ],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      {
        label: hasAccount ? 'Eliminar mi cuenta' : 'Borrar todo', value: 'ok', variant: 'btn--coral', primary: true,
        validate: async () => {
          if (!hasAccount) return true;
          const v = await verifyWithGuard(pass.value, { wrong: 'La contraseña no es correcta.' });
          if (!v.ok) { err.textContent = v.message; pass.value = ''; }
          return v.ok;
        },
      },
    ],
    onOpen: () => (hasAccount ? pass.focus() : null),
  });
  if (res !== 'ok') return;
  store.wipe();
  location.reload();
}

/** Primera vez: cuenta, nacionalidad y avatar (la duración se elige después, en Enfocar). */
export async function onboarding() {
  let avatar = state.profile.nick ? state.profile.avatar : makeNickname().avatar;
  let photo = '';
  const acc = accountFields({ initialName: '' });
  let accRec = null;
  let country = state.profile.country || '';
  const avatarBig = h('span', { class: 'avatar avatar--xl', text: avatar });
  const showAvatar = () => {
    avatarBig.replaceChildren(photo ? photoImg(photo, 84) : document.createTextNode(avatar));
    avatarBig.classList.toggle('has-companion', !!photo);
  };
  const photoBtn = h('button', { type: 'button', class: 'btn btn--paper btn--sm', id: 'onbPhotoBtn', onclick: async () => {
    const url = await pickProfilePhoto();
    if (url) { photo = url; showAvatar(); drawGrid(); photoBtn.textContent = '📷 Cambiar foto'; }
  } }, '📷 Subir una foto');
  const grid = h('div', { class: 'avatars avatars--onb', role: 'radiogroup', 'aria-label': 'Elige tu avatar' });
  const drawGrid = () => grid.replaceChildren(...avatarOptions({
    labelPrefix: 'Avatar',
    isChecked: (a) => !photo && a === avatar,
    onPick: (a) => { avatar = a; photo = ''; showAvatar(); drawGrid(); photoBtn.textContent = '📷 Subir una foto'; },
  }));
  drawGrid();
  const r = G.rankForXp(state.progress.xp);
  await openDialog({
    className: 'dlg--onb',
    dismissable: false,
    title: migrated ? '¡Tu app subió de nivel!' : '¡Hola! Crea tu cuenta de estudio',
    body: [
      h('div', { class: 'onb__mascot' }, penguin('saludo', { size: 104, label: 'Un pingüino te saluda' })),
      migrated ? h('p', { class: 'dlg__text', text: `Trajimos tu progreso de la versión anterior: ya eres ${r.name} con ${fmtInt(state.progress.xp)} XP.` }) : null,
      h('div', { class: 'onb__who' }, avatarBig, h('div', { class: 'onb__acc' }, ...acc.nodes)),
      h('p', { class: 'onb__label', text: 'Tu nacionalidad (opcional)' }),
      countryPicker(country, (v) => { country = v; }),
      h('p', { class: 'onb__label', text: 'Tu foto o tu animal' }),
      h('div', { class: 'btn-row photo-row' }, photoBtn),
      h('p', { class: 'photo-note', text: 'La foto es opcional y se queda solo en este dispositivo.' }),
      grid,
      h('p', { class: 'dlg__note', text: 'Cada minuto que estudias mantiene limpio tu polo. No te pedimos tu correo, y por ahora la cuenta se guarda en este dispositivo.' }),
    ],
    actions: [{ label: '¡Listo, a estudiar!', value: 'ok', variant: 'btn--gold btn--xl', primary: true, validate: async () => { accRec = await acc.validate(); return !!accRec; } }],
    onOpen: acc.focus,
  });
  skipPaywallToday();
  mutate((s) => {
    s.profile.nick = accRec.username;
    s.account = accRec;
    s.profile.avatar = avatar;
    s.profile.photo = photo;
    s.profile.onboarded = true;
    s.profile.country = country;
  });
  markUnlocked();
}
