/*
 * FrostPom — configuración pública de la app.
 * Aquí NUNCA van secretos (claves privadas, tokens de servicio). Todo lo que viaja al
 * teléfono o al navegador lo puede leer cualquiera. Ver docs/SEGURIDAD.md.
 */
export const config = Object.freeze({
  version: '4.0.2',
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
  }),
});
