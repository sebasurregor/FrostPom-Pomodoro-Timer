/*
 * FrostPom — configuración pública de la app.
 * Aquí NUNCA van secretos (claves privadas, tokens de servicio). Todo lo que viaja al
 * teléfono o al navegador lo puede leer cualquiera. Ver docs/SEGURIDAD.md.
 */
export const config = Object.freeze({
  version: '4.9.2',
  // Dirección pública de la app. La app de Android abre aquí las normas, la privacidad y la
  // página para eliminar la cuenta (en el navegador del teléfono). Ver js/native.js.
  publicUrl: 'https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/',
  // Correo de soporte (también para reportar un nombre sin cuenta en línea).
  supportEmail: 'startupprometeus@gmail.com',
  // Supabase (solo para recuperar la contraseña por correo; ver docs/RECUPERAR-CONTRASENA.md).
  // La clave publicable puede ir aquí. La clave secreta (service_role / sb_secret_…) NUNCA.
  // Si dejas url vacía, la app oculta todo lo del correo.
  cloud: Object.freeze({
    url: 'https://tcxdmziakgppabwyrydd.supabase.co',
    key: 'sb_publishable_P3zAO_4mbYu-190JTAHqjA_HezuxMeb',
  }),
  accounts: Object.freeze({
    // (v4.0) Cuentas en línea: los mayores de 13 entran desde cualquier equipo con correo y
    // contraseña, y su progreso (menos la foto) se guarda en Supabase. Necesita el SQL de
    // server/supabase/schema.sql. Paso a paso: docs/CUENTAS-EN-LINEA.md
    online: true,
    // (v4.9.0) Entrar o crear la cuenta con otras cuentas. Enciende cada una (true) SOLO después de
    // configurarla en Supabase → Authentication → Sign In / Providers y de poner las direcciones de
    // regreso. Paso a paso: docs/INICIAR-CON-OTRAS-CUENTAS.md. Facebook necesita que Meta apruebe la app.
    oauth: Object.freeze({
      google: false,
      azure: false, // Microsoft (cuentas personales de Outlook/Hotmail y de colegios o empresas)
      discord: false,
      facebook: false,
    }),
  }),
  captcha: Object.freeze({
    // (v4.0.3) CAPTCHA de Cloudflare Turnstile: frena a los programas que crean cuentas en masa.
    // siteKey = la clave del SITIO (pública, empieza por 0x…). Vacía = apagado.
    // La clave SECRETA va solo en Supabase. Orden: primero esta clave y publicar; después
    // encenderlo en Supabase. Paso a paso: docs/CAPTCHA.md
    siteKey: '0x4AAAAAAF6Reo5ZUf_d9-AG',
  }),
  ads: Object.freeze({
    // (v4.5.3) Anuncios de Google AdMob: SOLO en la app de Android y SOLO para mayores de 13
    // (nunca para menores de 13 ni para edad desconocida). Decisiones y paso a paso: docs/ANUNCIOS.md
    // false = apagado: la app no inicia AdMob ni muestra nada. Enciéndelo cuando tu cuenta de AdMob
    // esté lista y hayas puesto los ID de abajo.
    enabled: true, // (v4.8.1) encendido con tu cuenta de AdMob (17 nov 2026)
    // true = anuncios de PRUEBA de Google (para probar en tu celular sin riesgo; nunca toques los
    // de verdad). Ponlo en false solo para publicar, con los ID de verdad.
    testing: true,
    // Los ID de AdMob (son públicos, no secretos). El de la app lleva "~"; las unidades, "/".
    appId: 'ca-app-pub-6440860677235047~2817802157', // ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY (tools/app-android.mjs lo pone en Android)
    rewardedId: 'ca-app-pub-6440860677235047/6885039675', // unidad de tipo "Recompensa" (ganar gemas, revivir la mascota o la racha)
    interstitialId: 'ca-app-pub-6440860677235047/9226638699', // unidad de tipo "Intersticial" (al empezar el descanso)
    gemsPerAd: 10, // gemas por anuncio
    gemAdsPerDay: 5, // anuncios para ganar gemas, por día
    petReviveAds: 3, // anuncios para revivir a la mascota
    everyPomodoros: 4, // pantalla completa cada 4 pomodoros…
    everyStudyMin: 90, // …o cada 90 minutos de estudio (lo que llegue primero)
  }),
  leaderboard: Object.freeze({
    // 'local'  = solo tu marca en este dispositivo y el aviso "llega pronto".
    // 'remote' = ranking global con el servidor de Supabase (v3.9). Cámbialo SOLO después de
    //            correr server/supabase/schema.sql y activar "Anonymous sign-ins".
    //            Paso a paso: docs/RANKING-GLOBAL.md
    mode: 'remote',
    dailyCapMin: 240, // máximo que cuenta por día en el ranking (igual al del servidor)
  }),
  // Reemplazar la imagen de un compañero (opcional). Ejemplo:
  // companionImages: { 'tiburon-ballena': 'assets/companions/tiburon-ballena.webp' }
  // Solo imágenes tuyas, encargadas o con licencia para uso comercial.
  companionImages: Object.freeze({}),
  season: Object.freeze({
    // Duración de cada temporada de estudio, en meses del calendario. 3 = trimestral
    // (ene–mar, abr–jun, jul–sep, oct–dic). Con el límite saludable de 4 h al día, en una
    // temporada de 3 meses se puede llegar a Leyenda; en una de 1 mes, no.
    months: 3,
  }),
  premium: Object.freeze({
    // Precio provisional para el modo prueba. Con cobro real, el precio sale de Microsoft Store
    // (el que pongas en Partner Center, en la moneda de cada persona).
    priceLabel: 'US$ 2,99 al mes',
    // false = modo prueba: el botón dice "Probar Premium gratis" y no se cobra nada.
    // Ponlo en true SOLO cuando la suscripción esté publicada en Partner Center (docs/COBRO-PREMIUM.md).
    chargesEnabled: false,
    // Product ID de la suscripción (add-on) que creas en Partner Center. Debe ser idéntico.
    storeProductId: 'frostpom_premium_mensual',
    // Enlace de FrostPom en Microsoft Store (Partner Center → Product identity → URL de la Store).
    // Se ofrece a quien abre la app en el navegador, donde no se puede comprar.
    storeUrl: '',
    // (v4.7.0) Cobro en la app de ANDROID con Google Play (con RevenueCat). Decisiones y paso a paso:
    // docs/GOOGLE-PLAY-BILLING.md. Mientras enabled sea false, en Android Premium sigue en modo prueba.
    play: Object.freeze({
      enabled: true, // (v4.7.1) encendido: falta solo pegar abajo tu clave pública goog_…
      // La clave PÚBLICA de RevenueCat para Android (empieza por goog_…). Puede ir en GitHub.
      // La clave SECRETA de RevenueCat (sk_…) NUNCA va aquí: va solo en los secretos de Supabase.
      revenueCatKey: 'goog_usnfxhcfEMnuKypsIlNaZNPosfo',
      entitlement: 'premium', // el "entitlement" de RevenueCat
      offering: '', // '' = la oferta marcada como "current" en RevenueCat (la "default")
      // (v4.9.1) Los IDs de Play Console de los otros planes. La app los busca en la oferta por tipo
      // (Annual / Lifetime) y, si no, por estos IDs; y si no están en la oferta, se los pide a Google.
      annualPlan: 'anual-12m', // el ID del plan base anual de la suscripción
      lifetimeProduct: 'frostpom_premium_vida', // el ID del producto de una sola compra (de por vida)
      // (v4.8.0) Paquetes de gemas: productos de UNA sola compra en Google Play (Play Console →
      // Productos integrados). id = el ID del producto en Play Console (idéntico); gems = las que
      // da en total; bonus = cuántas de esas son de regalo. El PRECIO lo pones en Play Console
      // (aquí no), y la app muestra el de Google en la moneda de cada persona. Paso a paso:
      // docs/GOOGLE-PLAY-BILLING.md, sección "Paquetes de gemas".
      gemPacks: Object.freeze([
        Object.freeze({ id: 'gemas_60', gems: 60, bonus: 0 }), // US$ 0,99
        Object.freeze({ id: 'gemas_330', gems: 330, bonus: 30 }), // US$ 4,99
        Object.freeze({ id: 'gemas_700', gems: 700, bonus: 100 }), // US$ 9,99
        Object.freeze({ id: 'gemas_1500', gems: 1500, bonus: 300 }), // US$ 19,99
      ]),
    }),
  }),
});
