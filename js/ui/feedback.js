/*
 * FrostPom — avisos: toasts, notificaciones del sistema y diálogos (uno a la vez).
 */
import { enhancePasswords } from './password.js';
import { $, h, svg } from './dom.js';
import { tr } from '../i18n.js';

export function toast(text, tone = 'info', { icon, ms = 3800 } = {}) {
  const el = h('div', { class: `toast toast--${tone}`, role: 'status' }, icon ? h('span', { class: 'toast__icon', 'aria-hidden': 'true' }, icon) : null, h('span', { class: 'toast__text', text }));
  const box = $('#toasts');
  box.append(el);
  // (v4.4.1) Si la ventanita "Siempre encima" está abierta, el aviso también sale allá (pip.js)
  document.dispatchEvent(new CustomEvent('frostpom:toast', { detail: { text: el.textContent, tone } }));
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 350);
  }, ms);
  return el;
}

/** Toast siempre; además, notificación del sistema si la app está en segundo plano y hay permiso. */
export async function notify(title, body) {
  title = tr(title); body = tr(body);
  toast(`${title} ${body}`, 'good');
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = 'serviceWorker' in navigator ? await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 800))]) : null;
    const opts = { body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'frostpom', renotify: true };
    if (reg && reg.showNotification) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* sin notificación del sistema; el toast ya avisó */
  }
}

// =====================================================================
// Diálogos: se encolan para que nunca haya dos abiertos a la vez.
// =====================================================================
export const dlg = $('#dlg');
let dialogChain = Promise.resolve();

/**
 * actions: [{ label, value, variant, primary, validate }]. validate() puede ser async y
 * devolver false para dejar el diálogo abierto. Resuelve con el value elegido o 'cancel'.
 */
/** Flecha para volver (el SVG que diseñó el autor; el color sale de CSS con currentColor). */
export function backArrow() {
  return svg('svg', { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M3.80042 8.55124H16.64', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    svg('path', { d: 'M8.71799 2.1983L2.48682 8.42947L8.71799 14.6607', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/**
 * back = valor con el que se cierra la ventana al tocar la flecha de volver (arriba a la
 * izquierda). Sin back, no hay flecha.
 */
export function openDialog({ title, body = [], actions = [], className = '', dismissable = true, onOpen, back = null }) {
  const run = () => new Promise((resolve) => {
    dlg.className = `dlg ${className}`;
    // Entrar / crear cuenta: detrás se ve el paisaje del ártico con la fogata (no la app)
    if (/\bdlg--gate\b/.test(className)) document.documentElement.classList.add('gate-open');
    // (v4.2.1) Con una ventana abierta, el paisaje de atrás (borroso) se queda quieto: el celular descansa
    document.documentElement.classList.add('dlg-open');
    dlg.replaceChildren(
      h('div', { class: `dlg__box${back ? ' dlg__box--back' : ''}` },
        back ? h('button', { type: 'button', class: 'dlg__back', id: 'dlgBack', 'aria-label': 'Volver', title: 'Volver', onclick: () => dlg.close(back) }, backArrow()) : null,
        title ? h('h2', { class: 'dlg__title', id: 'dlgTitle', text: title }) : null,
        h('div', { class: 'dlg__body' }, body),
        actions.length ? h('div', { class: 'dlg__actions' }, actions.map((a) => h('button', {
          type: 'button',
          class: `btn ${a.variant || 'btn--paper'}`,
          'data-primary': a.primary ? 'true' : null,
          onclick: async () => {
            if (a.validate && !(await a.validate())) return;
            dlg.close(a.value);
          },
        }, a.label))) : null));
    const onCancel = (e) => { if (!dismissable) e.preventDefault(); };
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('close', () => {
      dlg.removeEventListener('cancel', onCancel);
      // Si enseguida se abre otro diálogo (por ejemplo, la foto después del registro), el paisaje sigue
      setTimeout(() => { if (!dlg.open) document.documentElement.classList.remove('gate-open', 'dlg-open'); }, 150);
      resolve(dlg.returnValue || 'cancel');
    }, { once: true });
    enhancePasswords(dlg); // (v4.3) el ojo para ver la contraseña, en todos los campos
    dlg.returnValue = '';
    dlg.showModal();
    if (onOpen) onOpen(dlg);
  });
  const p = dialogChain.then(run, run);
  dialogChain = p.catch(() => {});
  return p;
}

export function confirmDialog(title, text, okLabel, variant = 'btn--coral') {
  return openDialog({
    title,
    body: [h('p', { class: 'dlg__text', text })],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      { label: okLabel, value: 'ok', variant, primary: true },
    ],
  }).then((v) => v === 'ok');
}

/** Enfoca el botón principal del diálogo abierto (para usar en onOpen). */
export const focusPrimary = () => $('[data-primary]', dlg).focus();
