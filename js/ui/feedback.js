/*
 * StudyTimer — avisos: toasts, notificaciones del sistema y diálogos (uno a la vez).
 */
import { $, h } from './dom.js';

export function toast(text, tone = 'info', { icon, ms = 3800 } = {}) {
  const el = h('div', { class: `toast toast--${tone}`, role: 'status' }, icon ? h('span', { class: 'toast__icon', 'aria-hidden': 'true', text: icon }) : null, h('span', { class: 'toast__text', text }));
  const box = $('#toasts');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 350);
  }, ms);
  return el;
}

/** Toast siempre; además, notificación del sistema si la app está en segundo plano y hay permiso. */
export async function notify(title, body) {
  toast(`${title} ${body}`, 'good');
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = 'serviceWorker' in navigator ? await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 800))]) : null;
    const opts = { body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'studytimer', renotify: true };
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
export function openDialog({ title, body = [], actions = [], className = '', dismissable = true, onOpen }) {
  const run = () => new Promise((resolve) => {
    dlg.className = `dlg ${className}`;
    dlg.replaceChildren(
      h('div', { class: 'dlg__box' },
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
      resolve(dlg.returnValue || 'cancel');
    }, { once: true });
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
