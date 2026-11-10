/*
 * FrostPom — botón para ver u ocultar la contraseña (v4.3).
 *
 * Antes la app no tenía ojo propio: en Windows se veía el de Edge, que desaparece apenas sales del
 * campo y solo vuelve si borras toda la contraseña (por eso, al llegar a "Repite la contraseña", no
 * se podía revisar la primera). En Android no había ninguno. Ahora cada campo de contraseña tiene
 * su ojo, siempre visible, y el de Edge se esconde (ver styles.css).
 */
import { tr } from '../i18n.js';

const SVG = 'http://www.w3.org/2000/svg';
function icon(open) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const eye = document.createElementNS(SVG, 'path');
  eye.setAttribute('d', 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z');
  const dot = document.createElementNS(SVG, 'circle');
  dot.setAttribute('cx', '12'); dot.setAttribute('cy', '12'); dot.setAttribute('r', '3');
  svg.append(eye, dot);
  if (!open) {
    const cross = document.createElementNS(SVG, 'path');
    cross.setAttribute('d', 'M4 4l16 16');
    svg.append(cross);
  }
  return svg;
}

/** Pone el ojo a cada campo de contraseña dentro de `root` (una sola vez por campo). */
export function enhancePasswords(root) {
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach((input) => {
    input.dataset.eye = '1';
    const wrap = document.createElement('div');
    wrap.className = 'pass-wrap';
    input.replaceWith(wrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass-eye';
    if (input.id) btn.setAttribute('aria-controls', input.id);
    const paint = () => {
      const shown = input.type === 'text';
      btn.replaceChildren(icon(!shown));
      btn.setAttribute('aria-pressed', String(shown));
      const label = shown ? tr('Ocultar contraseña') : tr('Mostrar contraseña');
      btn.setAttribute('aria-label', label);
      btn.title = label;
    };
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // no le quita el foco al campo
    btn.addEventListener('click', () => {
      const a = input.selectionStart;
      const b = input.selectionEnd;
      input.type = input.type === 'password' ? 'text' : 'password';
      paint();
      if (document.activeElement === input && a !== null) { try { input.setSelectionRange(a, b); } catch { /* sin selección */ } }
    });
    paint();
    wrap.append(input, btn);
  });
}
