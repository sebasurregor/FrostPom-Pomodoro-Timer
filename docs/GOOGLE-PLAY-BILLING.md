# Cobrar Premium en Android con Google Play (v4.7.0)

> **Estado:** programado y probado en la v4.7.0, pero **apagado** (`config.premium.play.enabled = false`) hasta que termines los pasos de la sección 5. Mientras esté apagado, Premium en Android sigue en modo prueba, como antes.
>
> Es dinero real de la gente: aquí manda hacerlo bien, no rápido. Haz los pasos en orden y prueba con probadores de licencias antes de publicar.

## 1. Lo que decidiste (16 de noviembre de 2026)

| Pregunta | Tu respuesta | Cómo quedó |
| --- | --- | --- |
| ¿Con qué se verifica la compra? | **RevenueCat** | El complemento `@revenuecat/purchases-capacitor` 14.1.0 en la app, y nuestro servidor (Supabase) le pregunta a RevenueCat. |
| ¿Precio? | **US$ 2,99 al mes y US$ 19,99 al año** | Dos planes base en Google Play. La app muestra el precio que manda Google en la moneda de cada persona, y el ahorro del anual (**44 %**) lo calcula sola. |
| ¿Prueba gratis? | **7 días gratis** | Una oferta en cada plan, solo para quien nunca se suscribió (Google decide quién puede tenerla). |
| ¿Dónde? | **Primero solo Android** | En la web sigue la prueba gratis, y en Microsoft Store, su propio cobro. Lo comprado en Android todavía **no** da Premium en Windows (ver la sección 8). |

## 2. Cómo funciona

```
 Teléfono (FrostPom)                Google Play            RevenueCat                 Supabase (nuestro servidor)
 ─────────────────────              ───────────            ──────────                 ──────────────────────────
 Toca "Empezar 7 días gratis" ───▶  cobra y confirma ───▶  verifica la compra ──┐
 Premium se ve al instante                                                       │ aviso (webhook)
 premium-sync ("revisa mi Premium") ──────────────────────────────────────────────┼──▶ rc-webhook / premium-sync
                                                            ◀── GET /v1/subscribers ──┘     guardan el estado en
 Al abrir: get_entitlements() ◀─────────────────────────────────────────────────────────── private.entitlements
```

1. **El que decide es nuestro servidor.** La app pregunta con `get_entitlements()` si eres Premium, en vez de creerle a un dato guardado en el teléfono (que cualquiera podría cambiar).
2. **Quién escribe en el servidor:** solo las dos **Edge Functions**, con la clave secreta de Supabase:
   - `rc-webhook`: RevenueCat la avisa cada vez que algo cambia (compra, renovación, cancelación, reembolso…). La función **no le cree al aviso**: le pregunta a RevenueCat por esa persona y guarda lo que responde. Así un aviso falso, viejo o repetido nunca da Premium.
   - `premium-sync`: la app la llama justo después de comprar o restaurar (para no depender de que el aviso llegue rápido). Solo revisa la cuenta de la sesión: nadie puede pedirlo por otra persona.
3. **Justo después de pagar** la app confía en lo que dice Google en el teléfono (hasta 24 horas), mientras el servidor se entera. Sin internet, una suscripción que se renueva sigue valiendo 3 días después de su fecha.
4. **El regalo de bienvenida** (1.000 gemas y una mascota) llega una sola vez por cuenta. Quien ya lo recibió con la prueba gratis de antes no lo recibe otra vez.

### Los estados de una suscripción

| Estado | Qué ve la persona |
| --- | --- |
| Prueba gratis | Premium. "Estás en tu prueba gratis hasta el …". |
| Activa | Premium. "Tu suscripción se renueva el …". |
| Cancelada (pero le queda tiempo) | Premium hasta la fecha. "Cancelaste la renovación: sigues siendo Premium hasta el …". |
| Período de gracia (falló el pago y Google reintenta) | Premium, con un aviso (una vez al día) para revisar el medio de pago. |
| En espera (*account hold*) | Sin Premium, con un aviso y el botón "Abrir Google Play". Arreglado el pago, Premium vuelve solo. |
| Vencida o reembolsada | Sin Premium. **Nunca se quita lo ganado** (gemas, mascotas, temas comprados con gemas). |

### Quién puede suscribirse

- **Cuentas en línea (con correo, desde los 13 años).** A RevenueCat solo se le da el **id de la cuenta** (el de Supabase: un código al azar), **nunca** el correo ni el nombre.
- **Sin cuenta en línea:** la ventana pide conectarla ("Conectar mi cuenta"). A RevenueCat no se le manda nada.
- **Menores de 13:** "Premium todavía no está disponible para cuentas de menores de 13 años". Tampoco les aparece la oferta diaria de Premium.
- **Quien usaba la prueba gratis en Android** ve una vez "La prueba gratis de Premium terminó", con todo lo ganado intacto.
- Con Premium pagado no aparece el anuncio de pantalla completa (y se pueden seguir viendo anuncios por gemas, si quieres). Esto cierra el hueco de la v4.5.3: ya no se puede quitar el anuncio con la prueba gratis.

## 3. Reglas de Google Play que se cumplen

- **Lo digital se cobra solo con Google Play Billing.** En la app de Android no hay enlaces a otras formas de pago.
- **Antes de pagar se dice claro** el precio, que se renueva sola, cómo cancelar y que cancelando antes de que termine la prueba no se cobra nada. El precio sale de Google, nunca escrito a mano.
- **Cancelar es fácil:** "Administrar suscripción" abre la página de suscripciones de Google Play.
- **Eliminar la cuenta avisa** que la suscripción no se cancela sola.
- **Familias:** RevenueCat recibe la indicación de no recoger identificadores de publicidad. Los menores de 13 nunca hablan con RevenueCat.

## 4. Archivos

| Archivo | Qué hace |
| --- | --- |
| `js/play-billing.js` | Habla con el complemento de RevenueCat y con nuestro servidor. Su lógica (estados, precios, prueba gratis) tiene pruebas. |
| `js/ui/premium.js` | La ventana de Premium en Android: planes, condiciones, "Restaurar compras", "Administrar suscripción" y los avisos. |
| `server/supabase/schema.sql` | `private.entitlements`, `private.billing_events`, `get_entitlements()` y, solo para las Edge Functions, `billing_apply()` y `billing_sync_gate()`. |
| `server/supabase/functions/` | Las Edge Functions `rc-webhook` y `premium-sync` (la lógica está en `_shared/premium.js`). En `pegar-en-supabase/` están listas para pegar en el panel de Supabase. |
| `tests/billing-server.test.js`, `tests/billing-app.test.js`, `tests/e2e_play.py` | Pruebas: el servidor sin internet, la lógica de la app y la compra completa con Google Play y Supabase simulados. |

## 5. Lo que tienes que hacer tú (paso a paso)

> **Antes de empezar, lo de siempre:**
> - Los datos de pago, impuestos y banco van **solo en las páginas de Google**. Nunca por chat.
> - El archivo JSON de la cuenta de servicio de Google va **solo a RevenueCat**: nunca al repositorio ni al chat. Cuando lo subas, bórralo de Descargas.
> - La **clave secreta de RevenueCat** (`sk_…`) y la clave del webhook van **solo en los secretos de Supabase**. En la app solo va la clave **pública** de Android (`goog_…`).
> - Nunca pruebes contra producción con datos inventados: para probar, usa probadores de licencias.

Hay **dos subidas** a Google Play, y es normal: Google no deja crear suscripciones hasta que exista una versión con el permiso de cobro, que trae el complemento de RevenueCat.

### Paso 1. Sube la v4.7.0 con el cobro apagado

1. Como siempre, vuelve a pegar tu clave del sitio de Turnstile (`0x…`) en `js/config.js` → `captcha.siteKey` (los zips la traen vacía).
2. `npm install` (instala `@revenuecat/purchases-capacitor`).
3. `npm run android:actualizar`. Debe decir `versionCode 40700` y "Premium en modo prueba (sin cobro)".
4. Genera el `.aab` firmado en Android Studio y súbelo a **Prueba cerrada**.
5. Copia de seguridad de la base de datos (`docs/COPIA-DE-SEGURIDAD.md`), y después corre el `schema.sql` nuevo en **Supabase → SQL Editor**. Es seguro: solo agrega tablas y funciones.
6. Sube a GitHub (`git push`, con tu cuenta) la política de privacidad nueva (`privacidad.html`).

### Paso 2. Perfil de pagos y probadores (Play Console)

1. **Configuración → Perfil de pagos:** crea el perfil de comerciante (país Colombia). Los datos fiscales y bancarios, **solo ahí**.
2. **Configuración → Prueba de licencias** (está en la configuración de la cuenta, no de la app): agrega tu correo de Gmail y el de tus probadores. Respuesta de licencia: `RESPOND_NORMALLY`. Con estos correos las compras **no se cobran de verdad** y las suscripciones se renuevan cada pocos minutos.
3. Los mismos correos deben estar en la lista de **Prueba cerrada**.

### Paso 3. Crea la suscripción (Play Console → tu app → Monetizar con Play → Productos → Suscripciones)

1. **Crear suscripción:**
   - ID del producto: **`frostpom_premium`**. No se puede cambiar después.
   - Nombre: **FrostPom Premium**.
   - Beneficios: los de la ventana de Premium (por ejemplo, "Duración libre", "Todos los temas y sonidos", "Sin anuncios de pantalla completa").
2. **Agregar plan base** (dos veces):

   | ID del plan base | Tipo | Período | Precio |
   | --- | --- | --- | --- |
   | **`mensual`** | Renovación automática | 1 mes | **US$ 2,99** |
   | **`anual`** | Renovación automática | 1 año | **US$ 19,99** |

   - Al poner el precio en dólares, toca **"Actualizar tipos de cambio"** para que Google calcule el de cada país. Revisa el de Colombia (puedes redondearlo).
   - Deja el **período de gracia** y la **suspensión de la cuenta** (*account hold*) como vienen: la app ya entiende los dos.
   - **Activa** cada plan base.
3. **Agregar oferta** en cada plan base (la prueba gratis):
   - ID de la oferta: **`prueba-7-dias`**.
   - Elegibilidad: **Adquisición de clientes nuevos → Nunca tuvo esta suscripción**.
   - Fase: **Prueba gratuita, 7 días**.
   - **Activa** la oferta.

### Paso 4. La cuenta de servicio de Google (para RevenueCat)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con la misma cuenta de Google de Play Console y crea un proyecto (por ejemplo, "FrostPom Pagos").
2. **APIs y servicios → Biblioteca:** activa **Google Play Android Developer API**, **Google Play Developer Reporting API** y **Cloud Pub/Sub API**.
3. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio:**
   - Nombre: `revenuecat`.
   - Roles: **Editor de Pub/Sub** (si después da error al crear el tema, usa **Administrador de Pub/Sub**) y **Visualizador de supervisión** (*Monitoring Viewer*).
4. En esa cuenta de servicio: **⋮ → Administrar claves → Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo. **Ese archivo es secreto:** va solo a RevenueCat (paso 5), nunca al repositorio ni al chat.
5. **Play Console → Usuarios y permisos → Invitar usuario:**
   - Correo: el `client_email` que está dentro del JSON (termina en `iam.gserviceaccount.com`).
   - Permisos de la app: agrega FrostPom.
   - Permisos de la cuenta: **Ver información de la app y descargar informes masivos**, **Ver datos financieros, pedidos y respuestas a encuestas de cancelación**, **Administrar pedidos y suscripciones** y **Administrar la presencia en la tienda**.
   - **Invitar usuario.**

Las credenciales nuevas pueden tardar **hasta 36 horas** en funcionar. Un truco que suele acelerarlo: cambia un momento la descripción de la suscripción en Play Console, guarda y vuelve a dejarla como estaba.

### Paso 5. RevenueCat

1. Crea tu cuenta en [app.revenuecat.com](https://app.revenuecat.com) y un **proyecto** "FrostPom".
2. **Apps → + Nueva → Google Play Store:**
   - Nombre del paquete: `com.startupprometeus.frostpom`.
   - **Service Account Credentials JSON:** sube el archivo del paso 4. Después **borra el archivo** de tu computador (Descargas y papelera).
3. En esa misma app, **Google developer notifications → Connect to Google**: RevenueCat crea un tema de Pub/Sub. **Copia el ID del tema** y pégalo en **Play Console → Monetizar con Play → Configuración de monetización → Notificaciones para desarrolladores en tiempo real → Nombre del tema**. Contenido: **Suscripciones, compras anuladas y todos los productos únicos**. Guarda y toca **Enviar notificación de prueba**: en RevenueCat debe aparecer "Last received" con la hora.
4. **Product catalog → Products → Import** (o **+ New**): `frostpom_premium:mensual` y `frostpom_premium:anual`.
5. **Entitlements → + New:** identificador **`premium`** (exactamente así). Adjúntale los dos productos.
6. **Offerings:** la oferta **`default`** (márcala como *Current*) con dos paquetes:
   - **`$rc_monthly`** → `frostpom_premium:mensual`.
   - **`$rc_annual`** → `frostpom_premium:anual`.
7. **Project settings → API keys:**
   - Copia la **clave pública de la app de Play Store** (empieza por **`goog_`**). Esta sí va en la app.
   - **+ New secret API key**, versión **V1**, nombre "supabase". Empieza por **`sk_`**. Esta **nunca** va en la app: va solo en Supabase (paso 6).
8. Revisa en **Project settings → General** que "Restore behavior" sea **"Transfer to new App User ID"** (el que viene): si alguien restaura su compra en otra cuenta de FrostPom, la compra pasa a esa cuenta.

### Paso 6. Supabase: las Edge Functions y sus secretos

**6.1 Los secretos** (**Edge Functions → Secrets → Add new secret**):

| Nombre | Valor |
| --- | --- |
| `RC_SECRET_KEY` | La clave secreta de RevenueCat (`sk_…`) del paso 5.7 |
| `RC_WEBHOOK_AUTH` | Una clave larga al azar que inventas tú (abajo cómo) |

Para inventar `RC_WEBHOOK_AUTH` en Windows, abre **PowerShell** y escribe:

```powershell
"fp_" + [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

Cópiala solo en dos lugares: este secreto y RevenueCat (paso 6.3). **No la mandes por chat.**

**6.2 Las dos funciones.** Hay dos formas; usa la que te resulte más fácil.

- **A. Desde el panel (sin instalar nada):**
  1. **Edge Functions → Deploy a new function → Via Editor.**
  2. Nombre: **`rc-webhook`**. Borra el código de ejemplo y pega **todo** `server/supabase/functions/pegar-en-supabase/rc-webhook.ts`. **Deploy.**
  3. En la función, **Details** (o **Settings**): **apaga "Verify JWT with legacy secret"** ("Enforce JWT verification"). Sin esto, RevenueCat recibe 401.
  4. Repite con **`premium-sync`** y `pegar-en-supabase/premium-sync.ts` (también con "Verify JWT" apagado: la función revisa la sesión por su cuenta).
- **B. Con la terminal** (desde la carpeta `server/` del proyecto):

  ```bash
  npx supabase login
  npx supabase functions deploy rc-webhook --project-ref tcxdmziakgppabwyrydd --no-verify-jwt
  npx supabase functions deploy premium-sync --project-ref tcxdmziakgppabwyrydd --no-verify-jwt
  ```

**6.3 El webhook en RevenueCat** (**Integrations → Webhooks → + New webhook**):

- URL: `https://tcxdmziakgppabwyrydd.supabase.co/functions/v1/rc-webhook`
- **Authorization header value:** `Bearer ` seguido de tu `RC_WEBHOOK_AUTH`.
- Entorno: **producción y sandbox** (ambos). Eventos: **todos**.
- Toca **Send test event**: debe responder **200**. Para confirmarlo en Supabase (**SQL Editor**, solo lectura):

  ```sql
  select type, environment, received_at from private.billing_events order by received_at desc limit 5;
  ```

### Paso 7. Enciende el cobro en la app (v4.7.1)

1. En `js/config.js` → `premium.play`:

   ```js
   enabled: true,
   revenueCatKey: 'goog_…',   // la PÚBLICA de Android (paso 5.7)
   ```

   Esta clave **puede ir en GitHub**: es pública. Si por error pegas la secreta (`sk_…`), `npm run android:actualizar` se detiene y te avisa.
2. Sube la versión a **4.7.1** en los tres lugares de siempre: `js/config.js` (`version`), `service-worker.js` (`VERSION`) y `package.json` (`version`).
3. Vuelve a pegar tu `captcha.siteKey`, haz `npm run android:actualizar` (debe decir "cobro con Google Play ENCENDIDO" y `versionCode 40701`), genera el `.aab` y súbelo a **Prueba cerrada**.
4. Haz `git push` (con tu cuenta).

### Paso 8. Prueba en tu celular (con un correo de probador)

Instala la app desde el enlace de **Prueba cerrada** (no desde Android Studio) con una cuenta de Google que esté en **Prueba de licencias**. Revisa esta lista:

- [ ] Sin cuenta en línea, Premium pide "Conectar mi cuenta".
- [ ] Con una cuenta en línea: los dos planes con el precio de Google, "Ahorra 44 %" y "Empezar 7 días gratis".
- [ ] Al pagar con la **tarjeta de prueba "Aprueba siempre"**: el regalo, la corona encendida y "Estás en tu prueba gratis hasta el …". En Supabase, `private.entitlements` dice `trial` y `sandbox = true`.
- [ ] Las suscripciones de prueba se renuevan solas cada pocos minutos: al rato, "Tu suscripción se renueva el …".
- [ ] Con la tarjeta **"Rechaza siempre"**, o cancelando en Google Play, se ven los avisos de gracia, en espera o "Tu Premium terminó" (al volver a abrir la app).
- [ ] "Administrar suscripción" abre Google Play.
- [ ] Desinstala, instala y entra con la misma cuenta: sigue siendo Premium. "Restaurar compras" también funciona.
- [ ] En otro celular (Android) con la misma cuenta de FrostPom: también es Premium.

Para ver el estado de una cuenta (solo lectura; el resultado trae datos de esa persona, así que no lo compartas sin taparlo):

```sql
select * from private.account_check('correo@ejemplo.com');
```

### Paso 9. Publicar

1. **Play Console → Contenido de la app:**
   - **Seguridad de los datos:** agrega **Información financiera → Historial de compras**, como en `docs/google-play/FICHA.md`.
   - **Clasificación de contenido:** repite el cuestionario y responde **Sí** a compras digitales.
2. Promueve la versión de Prueba cerrada a **Producción** cuando la lista del paso 8 esté completa.

## 6. Costos

- **Google** se queda con el **15 %** de las suscripciones.
- **RevenueCat:** gratis hasta US$ 2.500 al mes de ingresos que pasen por RevenueCat; después, un porcentaje pequeño.
- **Supabase:** dentro del plan gratis (dos funciones pequeñas y una tabla).

## 7. Si algo sale mal

| Qué pasa | Qué hacer |
| --- | --- |
| "No pudimos traer el precio de Google Play" | Revisa que la suscripción y sus planes estén **activos**, que la app esté instalada desde Prueba cerrada con un correo de probador y que en RevenueCat la oferta `default` sea *Current* con `$rc_monthly` y `$rc_annual`. Las credenciales de Google pueden tardar hasta 36 h. |
| Pagué pero no soy Premium al volver a abrir | En Supabase revisa `private.account_check(…)`: "Premium (Google Play)" y "Avisos de RevenueCat". Si no hay avisos, revisa el webhook (URL, `Bearer …`) y que `premium-sync` y `rc-webhook` tengan "Verify JWT" **apagado**. En `chrome://inspect` busca `[FrostPom] premium-sync`. |
| RevenueCat dice 401 al enviar el webhook | La clave de `Authorization` no coincide con `RC_WEBHOOK_AUTH`, o "Verify JWT" está encendido. |
| El webhook responde 502 | `RC_SECRET_KEY` falta o no es una clave secreta **V1** de RevenueCat. |
| `npm run android:actualizar` se detiene por la clave | Pegaste la clave secreta (`sk_…`) en la app. Bórrala, **créala de nuevo en RevenueCat** (la vieja ya no es secreta si llegó a GitHub) y pon la pública (`goog_…`). |
| Quiero apagar el cobro ya | `enabled: false` en `js/config.js` y publica. Quien ya pagó sigue con su suscripción en Google Play: cancélalas o reembólsalas desde Play Console → Pedidos. |

## 8. Lo que queda para después

- **Premium comprado en Android, también en Windows** (y al revés). La app de Windows tendría que preguntar al servidor (fácil), y para lo inverso hay que verificar Microsoft Store en el servidor (fase 6b).
- **iPhone:** RevenueCat sirve igual; habría que crear el producto en App Store Connect.

## Fuentes

- [Google Play: suscripciones (planes base y ofertas)](https://support.google.com/googleplay/android-developer/answer/12154973)
- [Google Play: probar la facturación con probadores de licencias](https://developer.android.com/google/play/billing/test)
- [Política de pagos de Google Play](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Política de suscripciones de Google Play](https://support.google.com/googleplay/android-developer/answer/140504)
- [RevenueCat: credenciales de Google Play](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCat: notificaciones en tiempo real de Google](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications)
- [RevenueCat: webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat: API v1 (GET /subscribers)](https://www.revenuecat.com/docs/api-v1)
- [RevenueCat: formulario de seguridad de los datos de Google Play](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety)
- [Supabase: claves nuevas en las Edge Functions](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
