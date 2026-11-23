/*
 * FrostPom — (v4.9.1) Que nadie meta la app dentro de su página (clickjacking).
 *
 * Por qué aquí y no en _headers: GitHub Pages no manda encabezados propios, así que la regla
 * "frame-ancestors 'none'" de _headers no llega, y esa regla no sirve dentro de <meta>. Otra página
 * podría mostrar FrostPom en un <iframe> invisible y hacer que la persona toque botones sin saberlo
 * (por ejemplo, "Eliminar mi cuenta").
 *
 * Qué hace: este archivo es lo PRIMERO que importa js/main.js. Si la app está dentro de un marco:
 *  1. intenta abrirse ella misma en la ventana completa;
 *  2. si el navegador no lo deja, cambia la pantalla por un aviso con un enlace a la app y lanza un
 *     error, así main.js nunca arranca y no hay botones que se puedan tocar.
 * En la app de Android, en la ventanita flotante (Picture-in-Picture) y abierta normal en el
 * navegador, la app no está en un marco y esto no hace nada.
 */
export function isFramed(win = window) {
  try {
    return win.self !== win.top;
  } catch {
    return true; // el navegador no deja mirar la ventana de arriba: es de otro sitio
  }
}

function blockPage(doc, href) {
  const lang = (doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.language) || 'es';
  const en = !/^es\b/i.test(lang);
  const p = doc.createElement('p');
  p.textContent = en
    ? 'For your security, FrostPom can only be used in its own window. '
    : 'Por tu seguridad, FrostPom solo se puede usar en su propia ventana. ';
  const a = doc.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = en ? 'Open FrostPom' : 'Abrir FrostPom';
  p.append(a);
  doc.body.replaceChildren(p);
}

/** Revisa la ventana; si está en un marco, la saca o la bloquea. Devuelve true si la bloqueó. */
export function guardFrame(win = window) {
  if (!isFramed(win)) return false;
  const href = win.location.href;
  try {
    win.top.location.replace(href);
  } catch {
    /* el navegador no deja salir del marco: se bloquea abajo */
  }
  blockPage(win.document, href);
  return true;
}

if (typeof window !== 'undefined' && guardFrame(window)) {
  // Detiene la carga de js/main.js (y de todo lo demás): la app no arranca dentro del marco.
  throw new Error('FrostPom no funciona dentro de otra página (iframe).');
}
