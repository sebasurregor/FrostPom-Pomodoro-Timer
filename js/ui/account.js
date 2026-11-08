/*
 * FrostPom — cuenta: nombre de usuario y contraseña (se guardan en este dispositivo;
 * la contraseña solo como hash PBKDF2), bienvenida e inicio de sesión.
 * Cuando exista el servidor, esta misma validación se repite allá.
 */
import * as G from '../game.js';
import * as SEC from '../security.js';
import * as CLOUD from '../cloud.js';
import { checkUsername, isValidNick, makeNickname } from '../identity.js';
import * as FX from './effects.js';
import { $, h, fmtInt } from './dom.js';
import { toast, openDialog, confirmDialog, dlg } from './feedback.js';
import { penguin } from './companions.js';
import { countryPicker } from './widgets.js';
import { chooseAndLoad, photoCropper } from './photo.js';
import { pic } from './pics.js';
import { skipPaywallToday } from './premium.js';
import * as BOARD from '../board.js';
import { birthField, applyRename, adoptEmailSession, deleteBoardOnAccountDelete, errorText as boardErrorText } from './board-ui.js';
import { state, store, mutate, migrated } from './context.js';
import { t, tr } from '../i18n.js';

// ---------- Sesión desbloqueada (solo mientras la pestaña esté abierta) ----------
export const isUnlocked = () => store.tab.get('unlocked') === '1';
const markUnlocked = () => store.tab.set('unlocked', '1');
export function logout() {
  forgetDevice(); // cerrar sesión también apaga "mantener sesión iniciada"
  store.tab.remove('unlocked');
  location.reload();
}

// ---------- Mantener la sesión iniciada en este dispositivo ----------
/** Guarda un token nuevo en este dispositivo y su huella en la cuenta (el anterior deja de servir). */
export async function rememberDevice() {
  if (!state.account || !SEC.isAvailable()) return false;
  const token = SEC.newRememberToken();
  const tag = await SEC.rememberTag(token);
  store.saveRemember({ u: state.account.username.toLowerCase(), t: token, exp: Date.now() + SEC.REMEMBER_MS });
  mutate((s) => { if (s.account) s.account.remember = tag; });
  return true;
}
export function forgetDevice() {
  store.clearRemember();
  if (state.account && state.account.remember) mutate((s) => { delete s.account.remember; });
}
export const isRemembered = () => !!(state.account && state.account.remember && store.loadRemember());

/** Si este dispositivo tiene un token válido, entra sin pedir la contraseña (y renueva el plazo). */
async function enterRemembered() {
  const rec = store.loadRemember();
  if (!rec) return false;
  if (await SEC.rememberValid(rec, state.account)) {
    store.saveRemember({ ...rec, exp: Date.now() + SEC.REMEMBER_MS });
    markUnlocked();
    return true;
  }
  forgetDevice(); // vencido o de otra cuenta: se borra
  return false;
}

/** Casilla "Mantener mi sesión iniciada" (marcada por defecto). */
function keepSignedInField(id) {
  const box = h('input', { type: 'checkbox', id, checked: true });
  const field = h('label', { class: 'switch switch--compact', for: id }, box,
    h('span', { class: 'switch__ui', 'aria-hidden': 'true' }),
    h('span', { class: 'switch__text' }, h('b', { text: 'Mantener mi sesión iniciada' }),
      null));
  return { box, field };
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
  if (wait > 0) return { ok: false, message: t('Demasiados intentos. Espera {n} segundos.', { n: Math.ceil(wait / 1000) }) };
  const ok = username.trim().toLowerCase() === state.account.username.toLowerCase() && await SEC.verifyPassword(password, state.account);
  if (ok) {
    store.saveGuard({ fails: 0, lockedUntil: 0 });
    return { ok: true, message: '' };
  }
  const g = SEC.registerFailure(guard);
  store.saveGuard(g);
  FX.sfx.error();
  const lockMs = SEC.lockRemainingMs(g);
  return { ok: false, message: lockMs > 0 ? t('Datos incorrectos. Espera {n} segundos.', { n: Math.ceil(lockMs / 1000) }) : tr(wrong) };
}

const NAME_HINT = '3 a 20 caracteres: letras, números, punto o guion bajo.';

/** Campos de nombre (y contraseña) con su validación. validate() devuelve el registro o null. */
function accountFields({ withPassword = true, withEmail = false, withBirth = false, initialName = '' } = {}) {
  const name = h('input', { type: 'text', class: 'acc-input', id: 'accUser', maxlength: '20', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', value: initialName, placeholder: 'Ej.: pingu_estudia' });
  const nameHint = h('p', { class: 'acc-hint', 'aria-live': 'polite', text: NAME_HINT });
  const pass1 = h('input', { type: 'password', class: 'acc-input', id: 'accPass1', maxlength: '64', autocomplete: 'new-password' });
  const pass2 = h('input', { type: 'password', class: 'acc-input', id: 'accPass2', maxlength: '64', autocomplete: 'new-password' });
  const email = h('input', { type: 'email', class: 'acc-input', id: 'accEmail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', placeholder: 'tucorreo@ejemplo.com' });
  const showEmail = withEmail && CLOUD.isConfigured();
  const birth = withBirth && BOARD.enabled() ? birthField('accBirth') : null;
  const err = h('p', { class: 'form-error', role: 'alert' });
  function check() {
    const r = checkUsername(name.value);
    // Con el ranking global, si está libre se sabe al crear la cuenta (lo revisa el servidor)
    nameHint.textContent = r.ok ? tr(BOARD.enabled() ? '¡Ese nombre cumple las reglas!' : '¡Ese nombre está disponible!') : (name.value ? r.reason : tr(NAME_HINT));
    nameHint.classList.toggle('is-ok', r.ok);
    return r;
  }
  name.addEventListener('input', check);
  const nodes = [
    h('label', { class: 'pin-label', for: 'accUser', text: 'Nombre de usuario' }),
    h('p', { class: 'acc-hint acc-hint--privacy', id: 'accPrivacy', text: 'Usa un nombre que no revele quién eres.' }),
    name, nameHint,
    withPassword ? [
      h('label', { class: 'pin-label', for: 'accPass1', text: 'Contraseña' }), pass1,
      h('p', { class: 'acc-hint', text: 'Mínimo 8 caracteres, con letras y números.' }),
      h('label', { class: 'pin-label', for: 'accPass2', text: 'Repite la contraseña' }), pass2,
    ] : null,
    showEmail ? [
      h('label', { class: 'pin-label', for: 'accEmail', text: 'Correo (opcional)' }), email,
      h('p', { class: 'acc-hint', text: 'Solo para enviarte un código si olvidas la contraseña.' }),
    ] : null,
    birth ? birth.nodes : null,
    err,
  ];
  /** Con el ranking global: ¿el nombre está libre? (si no hay internet, se sigue y se revisa al unirse) */
  async function nameFree(username, born) {
    if (!BOARD.enabled() || (born && !BOARD.oldEnough(born))) return true;
    if (state.account && state.account.username === username) return true;
    const free = await BOARD.nameAvailable(username);
    if (free === false) { err.textContent = tr('Ese nombre ya lo usa otra persona en FrostPom. Prueba con otro.'); name.focus(); return false; }
    return true;
  }
  async function validate() {
    const r = check();
    if (!r.ok) { err.textContent = r.reason; name.focus(); return null; }
    if (!withPassword) { err.textContent = ''; return { username: r.value }; }
    const problem = newPasswordError(pass1.value, pass2.value, r.value);
    if (problem) { err.textContent = problem; pass1.focus(); return null; }
    let mail = '';
    if (showEmail && email.value.trim()) {
      mail = CLOUD.cleanEmail(email.value);
      if (!mail) { err.textContent = tr('Revisa el correo: parece que está mal escrito.'); email.focus(); return null; }
    }
    const born = birth ? birth.value() : '';
    if (birth && !born) { err.textContent = tr('Elige el mes y el año en que naciste.'); birth.focus(); return null; }
    if (birth) {
      err.textContent = tr('Comprobando…');
      if (!(await nameFree(r.value, born))) return null;
    }
    try {
      const rec = await SEC.hashPassword(pass1.value);
      err.textContent = '';
      return { username: r.value, ...rec, ...(mail ? { email: mail } : {}), ...(born ? { birth: born } : {}) };
    } catch (e) { err.textContent = e.message; return null; }
  }
  const setError = (msg) => { err.textContent = msg; };
  return { nodes, validate, focus: () => name.focus(), setError };
}

/** Al abrir la app con cuenta, se pide la contraseña (una vez por pestaña). */
export async function loginGate() {
  if (!state.account || isUnlocked()) return;
  if (await enterRemembered()) return;
  const keep = keepSignedInField('loginKeep');
  const user = h('input', { type: 'text', class: 'acc-input', id: 'loginUser', autocomplete: 'username', autocapitalize: 'off', value: state.account.username });
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'loginPass', autocomplete: 'current-password', maxlength: '64' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const res = await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    title: '¡Hola de nuevo!',
    body: [
      h('div', { class: 'onb__mascot' }, penguin('saludo', { size: 96 })),
      h('form', { class: 'pin-form', onsubmit: (e) => { e.preventDefault(); $('[data-primary]', dlg).click(); } },
        h('label', { class: 'pin-label', for: 'loginUser', text: 'Nombre de usuario' }), user,
        h('label', { class: 'pin-label', for: 'loginPass', text: 'Contraseña' }), pass, err,
        keep.field,
        h('button', { type: 'submit', hidden: true, tabindex: '-1' })),
      CLOUD.isConfigured()
        ? h('p', { class: 'dlg__note' }, h('button', { type: 'button', class: 'link-btn', id: 'forgotBtn', onclick: () => dlg.close('forgot') }, '¿Olvidaste la contraseña?'))
        : h('p', { class: 'dlg__note', text: '¿Olvidaste la contraseña? Puedes empezar de nuevo.' }),
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
  if (res === 'forgot') {
    const done = await forgotPasswordFlow();
    if (done) return;
    return loginGate();
  }
  if (res === 'reset') {
    const sure = await confirmDialog('¿Empezar de nuevo?', 'Se borra todo el progreso guardado en este dispositivo. No se puede deshacer.', 'Borrar y empezar');
    if (sure) { store.wipe(); location.reload(); return; }
    return loginGate();
  }
  markUnlocked();
  if (keep.box.checked) await rememberDevice();
  else forgetDevice();
}

export async function createAccountFlow({ required = false } = {}) {
  const nick = state.profile.nick;
  const f = accountFields({ withEmail: true, withBirth: true, initialName: isValidNick(nick) && checkUsername(nick).ok ? nick : '' });
  let rec = null;
  const res = await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: !required,
    title: 'Crea tu cuenta',
    body: [...f.nodes],
    actions: [
      required ? null : { label: 'Ahora no', value: 'later' },
      { label: 'Crear cuenta', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => { rec = await f.validate(); return !!rec; } },
    ].filter(Boolean),
    onOpen: f.focus,
  });
  if (res === 'ok' && rec) {
    mutate((s) => { s.account = rec; s.profile.nick = rec.username; });
    markUnlocked();
    await rememberDevice();
    toast(t('Cuenta creada. ¡Bienvenido, {name}!', { name: rec.username }), 'good');
    if (rec.email) linkEmailQuietly(rec.email);
  }
}

export async function renameFlow() {
  const f = accountFields({ withPassword: false, initialName: state.profile.nick });
  let rec = null;
  const res = await openDialog({
    title: 'Cambiar nombre de usuario', body: f.nodes,
    actions: [{ label: 'Cancelar', value: 'cancel' }, { label: 'Guardar', value: 'ok', variant: 'btn--gold', primary: true, validate: async () => {
      rec = await f.validate();
      if (!rec) return false;
      // En el ranking global el nombre no se repite: se cambia primero allá (necesita internet)
      if (BOARD.enabled() && BOARD.isJoined() && rec.username !== state.profile.nick) {
        f.setError(tr('Comprobando…'));
        const r = await BOARD.update({ username: rec.username, country: state.profile.country, avatar: state.profile.avatar, show: state.settings.leaderboardOn });
        if (!r.ok) { f.setError(boardErrorText(r.kind)); return false; }
        f.setError('');
      }
      return true;
    } }],
    onOpen: f.focus,
  });
  if (res === 'ok' && rec) applyRename(rec.username);
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
    const wasRemembered = isRemembered();
    mutate((s) => { s.account = { ...keepEmail(s.account), username: s.account.username, ...rec }; }); // la huella anterior se descarta
    if (wasRemembered) await rememberDevice(); // este dispositivo sigue dentro, con un token nuevo
    else store.clearRemember();
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
  await deleteBoardOnAccountDelete(); // el ranking global también (si hay internet)
  store.wipe();
  location.reload();
}

/**
 * Primera vez, en dos pasos:
 *  1) cuenta (usuario y contraseña) y nacionalidad;
 *  2) una vista aparte para la foto de perfil (opcional).
 * El animal del avatar se asigna al azar: no se elige de una lista. Si el usuario quiere
 * personalizarlo, sube una foto (o, más adelante, equipa un compañero que haya ganado).
 * La duración de las sesiones se elige después, en Enfocar.
 */
export async function onboarding() {
  // Si viene de la versión anterior conserva su animal; si es nuevo, uno al azar.
  const avatar = state.profile.nick && state.profile.avatar ? state.profile.avatar : makeNickname().avatar;
  const acc = accountFields({ withEmail: true, withBirth: true, initialName: '' });
  let accRec = null;
  let country = state.profile.country || '';
  const r = G.rankForXp(state.progress.xp);
  const keep = keepSignedInField('onbKeep');
  await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    title: migrated ? '¡Tu app subió de nivel!' : '¡Hola! Crea tu cuenta de estudio',
    body: [
      h('div', { class: 'onb__mascot' }, penguin('saludo', { size: 104, label: 'Un pingüino te saluda' })),
      migrated ? h('p', { class: 'dlg__text', text: t('Trajimos tu progreso de la versión anterior: ya eres {rank} con {xp} XP.', { rank: r.name, xp: fmtInt(state.progress.xp) }) }) : null,
      h('div', { class: 'onb__acc' }, ...acc.nodes),
      h('p', { class: 'onb__label', text: 'Tu nacionalidad (opcional)' }),
      countryPicker(country, (v) => { country = v; }),
      keep.field,
    ],
    actions: [{ label: 'Crear cuenta', value: 'ok', variant: 'btn--gold btn--xl', primary: true, validate: async () => { accRec = await acc.validate(); return !!accRec; } }],
    onOpen: acc.focus,
  });
  skipPaywallToday();
  // La cuenta se guarda YA: si la app se cierra en el paso de la foto, no se pierde nada.
  mutate((s) => {
    s.profile.nick = accRec.username;
    s.account = accRec;
    s.profile.avatar = avatar;
    s.profile.onboarded = true;
    s.profile.country = country;
  });
  markUnlocked();
  if (keep.box.checked) await rememberDevice();
  if (accRec.email) linkEmailQuietly(accRec.email);
  const photo = await photoStep(accRec.username, avatar);
  if (photo) {
    mutate((s) => { s.profile.photo = photo; });
    toast('¡Foto de perfil lista!', 'good', { icon: pic('foto', 24) });
  }
}

/** Paso 2 del registro: foto de perfil opcional. Devuelve la foto (data URL) o null. */
function photoStep(username, avatar) {
  let crop = null;
  const stage = h('div', { class: 'onb-photo__stage' }, h('span', { class: 'avatar avatar--hero', text: avatar }));
  const err = h('p', { class: 'form-error', role: 'alert' });
  const pickBtn = h('button', { type: 'button', class: 'btn btn--paper', id: 'onbPhotoBtn', onclick: async () => {
    err.textContent = '';
    const got = await chooseAndLoad();
    if (!got) return;
    if (got.error) { err.textContent = got.error; return; }
    if (crop) crop.close();
    crop = photoCropper(got.bmp, { id: 'onbZoom' });
    stage.replaceChildren(crop.el);
    hint.textContent = tr('Arrastra la foto para encuadrarla y usa el zoom si hace falta.');
    pickBtn.replaceChildren(pic('foto', 22), tr('Elegir otra foto'));
    crop.focus();
  } }, pic('foto', 22), 'Elegir una foto');
  const hint = h('p', { class: 'dlg__text onb-photo__hint', text: 'Si prefieres no subir una foto, te acompañará este animal. Puedes cambiarla cuando quieras en tu perfil.' });
  let result = null;
  return openDialog({
    className: 'dlg--onb dlg--onb-photo dlg--gate',
    title: t('¡Bienvenido, {name}! Ponle cara a tu perfil', { name: username }),
    body: [
      stage, hint,
      h('div', { class: 'btn-row onb-photo__pick' }, pickBtn),
      err,
      h('p', { class: 'dlg__note', text: 'La foto se queda solo en este dispositivo.' }),
    ],
    actions: [
      { label: 'Ahora no', value: 'skip' },
      {
        label: 'Guardar foto', value: 'ok', variant: 'btn--gold', primary: true,
        validate: () => {
          if (!crop) { err.textContent = tr('Primero elige una foto, o toca «Ahora no».'); pickBtn.focus(); return false; }
          result = crop.toDataURL();
          if (!result) err.textContent = tr('No pudimos guardar esa foto. Prueba con otra.');
          return !!result;
        },
      },
    ],
    onOpen: () => pickBtn.focus(),
  }).then((v) => {
    if (crop) crop.close();
    return v === 'ok' ? result : null;
  });
}

// =====================================================================
// Correo de recuperación (Supabase). La contraseña de FrostPom nunca sale del dispositivo:
// el correo solo sirve para demostrar, con un código, que la cuenta es tuya.
// =====================================================================
// Lo que se conserva de la cuenta al cambiar la contraseña: el correo y la fecha de nacimiento.
const keepEmail = (acc) => ({
  ...(acc && acc.email ? { email: acc.email, emailLinked: acc.emailLinked === true } : {}),
  ...(acc && acc.birth ? { birth: acc.birth } : {}),
});

/** Registra el correo en Supabase sin interrumpir (al crear la cuenta). */
async function linkEmailQuietly(email) {
  try {
    await CLOUD.linkEmail(email);
    mutate((s) => { if (s.account && s.account.email === email) s.account.emailLinked = true; });
    adoptEmailSession(CLOUD.linkEmail.lastSession);
  } catch (e) {
    toast('No pudimos conectar tu correo ahora. Puedes hacerlo en Ajustes → Tu cuenta.', 'warn', { ms: 6000 });
  }
}

/** Ajustes → Tu cuenta: agregar o cambiar el correo de recuperación (pide la contraseña). */
export async function emailFlow() {
  if (!state.account || !CLOUD.isConfigured()) return;
  const cur = state.account.email || '';
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'mailNew', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email', value: cur, placeholder: 'tucorreo@ejemplo.com' });
  const pass = h('input', { type: 'password', class: 'acc-input', id: 'mailPass', autocomplete: 'current-password', maxlength: '64' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  let saved = '';
  const res = await openDialog({
    title: cur ? 'Cambiar correo de recuperación' : 'Agregar correo de recuperación',
    body: [
      h('p', { class: 'dlg__text', text: 'Si olvidas la contraseña, te enviaremos un código a este correo.' }),
      h('label', { class: 'pin-label', for: 'mailNew', text: 'Correo' }), mail,
      h('label', { class: 'pin-label', for: 'mailPass', text: 'Tu contraseña actual' }), pass,
      err,
    ],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      {
        label: 'Guardar correo', value: 'ok', variant: 'btn--gold', primary: true,
        validate: async () => {
          const e = CLOUD.cleanEmail(mail.value);
          if (!e) { err.textContent = tr('Revisa el correo: parece que está mal escrito.'); mail.focus(); return false; }
          const v = await verifyWithGuard(pass.value, { wrong: 'La contraseña no es correcta.' });
          if (!v.ok) { err.textContent = v.message; pass.value = ''; return false; }
          err.textContent = tr('Conectando…');
          try { saved = await CLOUD.linkEmail(e); return true; } catch (x) { err.textContent = CLOUD.errorText(x); return false; }
        },
      },
    ],
    onOpen: () => mail.focus(),
  });
  if (res === 'ok' && saved) {
    mutate((s) => { s.account.email = saved; s.account.emailLinked = true; });
    adoptEmailSession(CLOUD.linkEmail.lastSession);
    toast('Correo guardado. Ya puedes recuperar tu contraseña.', 'good');
  }
}

/** Quitar el correo de este dispositivo (en el servidor se borra pidiéndolo a soporte). */
export async function removeEmailFlow() {
  if (!state.account || !state.account.email) return;
  const ok = await confirmDialog('¿Quitar el correo?', 'Si olvidas la contraseña ya no podrás recuperarla; solo empezar de nuevo.', 'Quitar correo');
  if (ok) mutate((s) => { delete s.account.email; delete s.account.emailLinked; });
}

/**
 * "¿Olvidaste la contraseña?": 1) escribes tu correo, 2) llega un código, 3) lo escribes con la
 * contraseña nueva. Devuelve true si la cuenta quedó con contraseña nueva y abierta.
 */
async function forgotPasswordFlow() {
  const acc = state.account;
  if (!acc.email) {
    await openDialog({
      className: 'dlg--onb dlg--gate',
      title: 'Esta cuenta no tiene correo',
      body: [h('p', { class: 'dlg__text', text: 'Sin un correo de recuperación no hay forma de comprobar que la cuenta es tuya. Puedes volver a intentarlo o empezar de nuevo.' })],
      actions: [{ label: 'Volver', value: 'back', variant: 'btn--gold', primary: true }],
    });
    return false;
  }
  // Paso 1: confirmar el correo (se muestra a medias para no revelarlo a quien tenga el equipo)
  const mail = h('input', { type: 'email', class: 'acc-input', id: 'fpMail', maxlength: '254', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email' });
  const err1 = h('p', { class: 'form-error', role: 'alert' });
  const step1 = await openDialog({
    className: 'dlg--onb dlg--gate',
    title: 'Recuperar contraseña',
    body: [
      h('p', { class: 'dlg__text', text: t('Escribe el correo de tu cuenta ({mail}) y te enviaremos un código.', { mail: CLOUD.maskEmail(acc.email) }) }),
      h('form', { class: 'pin-form', onsubmit: (e) => { e.preventDefault(); $('[data-primary]', dlg).click(); } },
        h('label', { class: 'pin-label', for: 'fpMail', text: 'Correo' }), mail, err1,
        h('button', { type: 'submit', hidden: true, tabindex: '-1' })),
    ],
    actions: [
      { label: 'Volver', value: 'back' },
      {
        label: 'Enviarme el código', value: 'ok', variant: 'btn--gold', primary: true,
        validate: async () => {
          const e = CLOUD.cleanEmail(mail.value);
          if (!e) { err1.textContent = tr('Revisa el correo: parece que está mal escrito.'); return false; }
          if (e !== acc.email) { err1.textContent = tr('Ese no es el correo de esta cuenta.'); return false; }
          err1.textContent = tr('Enviando…');
          try {
            if (!acc.emailLinked) await CLOUD.linkEmail(e); // por si al crear la cuenta no había internet
            await CLOUD.sendRecoveryCode(e);
            return true;
          } catch (x) { err1.textContent = CLOUD.errorText(x); return false; }
        },
      },
    ],
    onOpen: () => mail.focus(),
  });
  if (step1 !== 'ok') return false;
  if (!acc.emailLinked) mutate((s) => { s.account.emailLinked = true; });

  // Paso 2: código + contraseña nueva
  const code = h('input', { type: 'text', class: 'acc-input acc-input--code', id: 'fpCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', spellcheck: 'false', placeholder: '123456' });
  const p1 = h('input', { type: 'password', class: 'acc-input', id: 'fpPass1', maxlength: '64', autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', class: 'acc-input', id: 'fpPass2', maxlength: '64', autocomplete: 'new-password' });
  const err2 = h('p', { class: 'form-error', role: 'alert' });
  const keep = keepSignedInField('fpKeep');
  let wait = 60;
  const resend = h('button', { type: 'button', class: 'link-btn', disabled: true, onclick: async () => {
    if (wait > 0) return;
    err2.textContent = tr('Enviando…');
    try { await CLOUD.sendRecoveryCode(acc.email); err2.textContent = tr('Te enviamos un código nuevo.'); startTimer(); } catch (x) { err2.textContent = CLOUD.errorText(x); }
  } }, 'Reenviar código');
  let timer = 0;
  function startTimer() {
    wait = 60; resend.disabled = true;
    clearInterval(timer);
    timer = setInterval(() => {
      wait -= 1;
      resend.textContent = wait > 0 ? t('Reenviar código ({n} s)', { n: wait }) : tr('Reenviar código');
      if (wait <= 0) { resend.disabled = false; clearInterval(timer); }
    }, 1000);
  }
  startTimer();
  let rec = null;
  const step2 = await openDialog({
    className: 'dlg--onb dlg--gate',
    dismissable: false,
    title: 'Revisa tu correo',
    body: [
      h('p', { class: 'dlg__text', text: t('Enviamos un código a {mail}. Si no aparece, mira en spam.', { mail: CLOUD.maskEmail(acc.email) }) }),
      h('form', { class: 'pin-form', onsubmit: (e) => { e.preventDefault(); $('[data-primary]', dlg).click(); } },
        h('label', { class: 'pin-label', for: 'fpCode', text: 'Código' }), code,
        h('label', { class: 'pin-label', for: 'fpPass1', text: 'Contraseña nueva' }), p1,
        h('p', { class: 'acc-hint', text: 'Mínimo 8 caracteres, con letras y números.' }),
        h('label', { class: 'pin-label', for: 'fpPass2', text: 'Repite la contraseña' }), p2,
        err2, keep.field,
        h('button', { type: 'submit', hidden: true, tabindex: '-1' })),
      h('p', { class: 'dlg__note' }, resend),
    ],
    actions: [
      { label: 'Cancelar', value: 'back' },
      {
        label: 'Guardar contraseña', value: 'ok', variant: 'btn--gold', primary: true,
        validate: async () => {
          const problem = newPasswordError(p1.value, p2.value, acc.username);
          if (problem) { err2.textContent = problem; p1.focus(); return false; }
          err2.textContent = tr('Comprobando…');
          try {
            const ses = await CLOUD.verifyRecoveryCode(acc.email, code.value, { keep: BOARD.enabled() });
            adoptEmailSession(ses); // con el ranking global: tu lugar queda en la cuenta con correo
          } catch (x) { err2.textContent = CLOUD.errorText(x); code.focus(); return false; }
          try { rec = await SEC.hashPassword(p1.value); return true; } catch (x) { err2.textContent = x.message; return false; }
        },
      },
    ],
    onOpen: () => code.focus(),
  });
  clearInterval(timer);
  if (step2 !== 'ok' || !rec) return false;
  mutate((s) => { s.account = { ...keepEmail(s.account), username: s.account.username, ...rec }; });
  store.saveGuard({ fails: 0, lockedUntil: 0 });
  store.clearRemember();
  markUnlocked();
  if (keep.box.checked) await rememberDevice();
  toast('¡Listo! Tu contraseña nueva ya funciona.', 'good');
  return true;
}
