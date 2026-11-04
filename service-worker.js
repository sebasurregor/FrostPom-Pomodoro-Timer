/*
 * StudyTimer — service worker (modo sin conexión).
 * Correcciones respecto a la v1:
 *  - Antes la página nunca registraba este archivo, así que no había modo offline.
 *  - addAll() fallaba porque la carpeta icons/ no existía; ahora todos los archivos existen.
 *  - El HTML se pide primero a la red (para recibir actualizaciones) y se usa la copia guardada sin conexión.
 *  - Solo se guarda en caché lo de este mismo sitio y respuestas correctas. Nunca respuestas de APIs
 *    ni de otros dominios (podrían contener datos personales).
 */
const VERSION = '3.3.0';
const CACHE = `studytimer-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './privacidad.html',
  './css/legal.css',
  './assets/icons/icon-48.png',
  './assets/icons/icon-96.png',
  './js/config.js',
  './js/util.js',
  './js/game.js',
  './js/catalog.js',
  './js/identity.js',
  './js/timer.js',
  './js/session.js',
  './js/engine.js',
  './js/storage.js',
  './js/security.js',
  './js/leaderboard.js',
  './js/season.js',
  './js/weather.js',
  './js/voices.js',
  './js/pet.js',
  './js/main.js',
  './js/ui/dom.js',
  './js/ui/feedback.js',
  './js/ui/context.js',
  './js/ui/widgets.js',
  './js/ui/effects.js',
  './js/ui/emblems.js',
  './js/ui/companions.js',
  './js/ui/scenery.js',
  './js/ui/celebrations.js',
  './js/ui/premium.js',
  './js/ui/sound.js',
  './js/ui/reminders.js',
  './js/ui/hud.js',
  './js/ui/focus.js',
  './js/ui/activity.js',
  './js/ui/progress.js',
  './js/ui/profile.js',
  './js/ui/ranking.js',
  './js/ui/settings.js',
  './js/ui/account.js',
  './js/ui/feeding.js',
  './js/ui/photo.js',
  './assets/fonts/lilita-one-latin.woff2',
  './assets/fonts/nunito-latin-wght.woff2',
  './assets/fonts/twemoji-country-flags.woff2',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/companions/pinguino.webp',
  './assets/companions/oso-polar.webp',
  './assets/companions/oso-marino.webp',
  './assets/companions/tiburon-martillo.webp',
  './assets/companions/zorro-artico.webp',
  './assets/sprites/pinguino-quieto.webp',
  './assets/sprites/pinguino-saludo.webp',
  './assets/sprites/pinguino-amor.webp',
  './assets/sprites/pinguino-camina.webp',
  './assets/sprites/oso-camina.webp',
  './assets/sprites/oso-malvavisco.webp',
  './assets/sprites/fogata-llama.webp',
  './assets/sprites/fogata-lenos.webp',
  './assets/food/pescado.webp',
  './assets/food/camaron.webp',
  './assets/food/arandanos.webp',
  './assets/food/galleta.webp',
  './assets/food/cangrejo.webp',
  './assets/food/calamar.webp',
  './assets/food/pescado-helado.webp',
  './assets/food/sardinas.webp',
  './assets/food/sopa.webp',
  './assets/food/pollo.webp',
  './assets/food/jamon.webp',
  './assets/food/almeja.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('studytimer') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // otros dominios: sin caché

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});

// Al tocar una notificación, vuelve a la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('./#/enfocar');
    }),
  );
});
