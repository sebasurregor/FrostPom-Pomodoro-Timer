/*
 * StudyTimer — configuración pública de la app.
 * Aquí NUNCA van secretos (claves privadas, tokens de servicio). Todo lo que viaja al
 * teléfono o al navegador lo puede leer cualquiera. Ver docs/SEGURIDAD.md.
 */
export const config = Object.freeze({
  version: '3.3.0',
  leaderboard: Object.freeze({
    // 'demo' = rivales simulados en el dispositivo. 'remote' = servidor (aún no conectado).
    mode: 'demo',
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
    // Precio provisional para mostrar en la app. El precio real se define en App Store Connect
    // y Google Play Console (cada tienda lo muestra en la moneda local del usuario).
    priceLabel: 'US$ 2,99 al mes',
    // false = modo prueba: el botón dice "Probar Premium gratis" y no se muestra como compra.
    // Ponlo en true SOLO cuando el cobro real esté conectado (Microsoft Store, App Store, Google Play).
    chargesEnabled: false,
  }),
});
