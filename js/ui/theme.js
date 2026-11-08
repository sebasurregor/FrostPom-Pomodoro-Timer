/*
 * FrostPom — modo claro u oscuro (v3.8).
 * "auto" sigue el ajuste del sistema (Windows, macOS, Android, iOS) y cambia solo si el
 * sistema cambia. El CSS lee html[data-theme="dark"] y cambia los colores de las tarjetas.
 */
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
let choice = 'auto';

export function applyTheme(next = choice) {
  choice = next;
  const dark = choice === 'dark' || (choice === 'auto' && !!media && media.matches);
  const root = document.documentElement;
  if (root.dataset.theme !== (dark ? 'dark' : 'light')) root.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B1A3C' : '#2d68bc');
}

if (media) media.addEventListener('change', () => applyTheme());
