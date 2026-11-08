/*
 * FrostPom — íconos a color (archivos en assets/icons).
 * Fuego, copo, corona y cofre: los eligió el autor. Candado, check, info, reloj, música,
 * llave y quitar: Icons8 (licencia gratuita con atribución, ver Ajustes → Acerca de).
 * Gema (gema.png, sin la sombra del piso) y editar foto (foto.png): los eligió el autor en la v3.8.2.
 */
export function pic(name, size = 24, alt = '') {
  const el = document.createElement('img');
  el.src = `assets/icons/${name}.png`;
  el.width = size;
  el.height = size;
  el.alt = alt;
  if (!alt) el.setAttribute('aria-hidden', 'true');
  el.decoding = 'async';
  el.draggable = false;
  el.className = `pic pic--${name}`;
  return el;
}
