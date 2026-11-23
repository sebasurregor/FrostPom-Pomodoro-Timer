# Cobrar Premium en Android con Google Play (v4.7.0; de por vida y precios: v4.9.0)

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

## 5b. Paquetes de gemas (v4.8.0)

### Lo que decidiste (17 de noviembre de 2026)

Cuatro paquetes de **una sola compra** que se pueden comprar las veces que se quiera (de más pequeño a más grande):

| ID del producto (Play Console) | Gemas | De regalo (ya incluidas) | Precio |
| --- | --- | --- | --- |
| **`gemas_60`** | 60 | — | **US$ 0,99** |
| **`gemas_330`** | 330 | +30 | **US$ 4,99** |
| **`gemas_700`** | 700 | +100 | **US$ 9,99** |
| **`gemas_1500`** | 1.500 | +300 | **US$ 19,99** |

Están en `config.premium.play.gemPacks` (`js/config.js`). Si algún día cambias las gemas de un paquete, cambia ese número allí; el precio **solo** se cambia en Play Console (la app muestra el que manda Google, en la moneda de cada persona).

### Cómo funciona

- Al tocar la **gema** (arriba, al lado del rango, o en la tienda de la mascota) se abre **"¿Necesitas más gemas?"**, con la gema y el brillo de cuando desbloqueas un personaje, y tres opciones:
  1. **Ver un anuncio: +10 gemas** (hasta 5 al día). Solo aparece si los anuncios están encendidos y listos (AdMob, `docs/ANUNCIOS.md`).
  2. **Estudiar un pomodoro**: te lleva a Enfocar y resalta el botón de empezar.
  3. **Comprar gemas**: abre los 4 paquetes. El de mejor precio por gema lleva la etiqueta **"Mejor precio"**.
- **Comprar gemas** solo funciona en la **app de Android**, con una **cuenta en línea** (13+) y con el cobro encendido (`premium.play.enabled` y la clave `goog_…`). En la web y en Windows el botón sale apagado ("Solo en la app de Android."). Para menores de 13 no aparece.
- El cobro lo hace **Google**. RevenueCat lo confirma y "consume" la compra (por eso se puede volver a comprar). La app suma las gemas **una sola vez por compra**: anota el número de la compra de Google en tu progreso (`progress.gemOrders`), que viaja con tu cuenta a tus otros aparatos. Si dos aparatos llegaran a sumar la misma compra, al unirlos se cuenta una vez (`js/merge.js`).
- Si la app se cierra justo después de pagar, o el pago queda **pendiente** (por ejemplo, en efectivo), las gemas llegan **la próxima vez que abras la app**: RevenueCat guarda la lista de compras de la cuenta y la app suma las que falten.
- **Nada cambia en Supabase.** El webhook de RevenueCat también avisa de estas compras, pero solo vuelve a revisar Premium (los paquetes no tienen el entitlement `premium`, así que no dan ni quitan Premium).

### Lo que tienes que hacer tú

**Antes:** tener hecho el paso 5 (RevenueCat conectado). Si todavía no lo hiciste, los paquetes esperan junto con Premium.

1. **Play Console → tu app → Monetizar con Play → Productos → Productos únicos → Crear producto único**, cuatro veces (una por fila de la tabla de arriba):
   - **ID del producto:** `gemas_60` (luego `gemas_330`, `gemas_700`, `gemas_1500`). **No se puede cambiar ni volver a usar**, ni aunque lo borres.
   - **Nombre:** por ejemplo "60 gemas", "330 gemas", "700 gemas", "1.500 gemas".
   - **Descripción:** por ejemplo "Gemas para la tienda de tu mascota en FrostPom." (sin promesas que no cumpla la app).
   - **Siguiente → Opción de compra:** ID `compra`, tipo **Comprar** (*Buy*). La primera opción de compra queda marcada sola como compatible con versiones anteriores: déjala así.
   - **Precios:** "Establecer precios" → **edición masiva** → todos los países → el precio en **USD** de la tabla → Aplicar. Revisa el de Colombia (puedes redondearlo).
   - **Activar.** Revisa que la opción de compra también diga **Activa** (si queda en borrador, Google no la entrega a la app).
2. **RevenueCat → Product catalog → Products → + New** (o **Import**), en la app de Play Store: agrega los cuatro, con el mismo ID (`gemas_60`, …).
   - Si te pregunta el tipo, elige **Consumible** (*Consumable*). Si eliges "No consumible", solo se podrían comprar una vez.
   - **No** los adjuntes al entitlement `premium` ni a la oferta `default`: la app los pide por su ID.
3. **Prueba** con tu correo de probador de licencias (paso 8): compra el de 60 con la "tarjeta de prueba que siempre aprueba" y revisa que lleguen las 60 gemas y la ventana de "¡Gracias!". Después prueba la "tarjeta que aprueba después de unos minutos": la app dice que el pago está pendiente y, cuando Google lo aprueba, las gemas llegan al volver a abrir la app.
4. **Seguridad de los datos:** no hay nada nuevo que marcar. "Historial de compras" ya está (paso 9); solo cuenta también los paquetes.
5. **Ficha de Play Store:** la ficha ya no dice que las gemas "no se compran con dinero" (`docs/google-play/FICHA.md`). Copia el texto nuevo cuando publiques. Google marca sola que la app "ofrece compras dentro de la aplicación".

## 5c. Premium de por vida (v4.9.0)

### Lo que decidiste (22 de noviembre de 2026)

Además de la suscripción mensual y la anual, **Premium para siempre con un solo pago** de **US$ 29,99**. Es una compra **de una sola vez que no se gasta** (no consumible): se compra una vez por cuenta y queda para siempre.

### Cómo funciona

- En la ventana de Premium (app de Android, cuenta en línea 13+) sale un tercer plan, **"De por vida"**, con la etiqueta **"Para siempre"** y el precio de Google en la moneda de cada persona ("{precio}, un solo pago").
- Al comprarlo: confeti y **"¡Ya eres Premium de por vida!"**. En Ajustes dice "Tienes Premium de por vida" y ya no sale "Administrar suscripción" (no hay nada que renovar ni cancelar).
- **Si ya tenía la suscripción**, en "Administrar" aparece **"Pasarme a de por vida"**. Después de comprar, la app le recuerda **cancelar la suscripción en Google Play** (Google no la cancela sola).
- Funciona como la suscripción: RevenueCat da el entitlement `premium` **sin fecha de vencimiento** y el servidor lo guarda como Premium de por vida (`expires_at` vacío). Si Google **reembolsa** la compra, RevenueCat quita el entitlement y Premium se apaga.
- Antes de **borrar la cuenta**, la app avisa que Premium de por vida se pierde con ella.

### Lo que tienes que hacer tú

1. **Play Console → tu app → Monetizar con Play → Productos → Productos únicos → Crear producto único:**
   - **ID del producto:** `frostpom_premium_vida` (no se puede cambiar ni volver a usar).
   - **Nombre:** "FrostPom Premium de por vida". **Descripción:** "Todo Premium para siempre, con un solo pago."
   - **Opción de compra:** ID `compra`, tipo **Comprar** (*Buy*).
   - **Precio:** edición masiva → todos los países → **US$ 29,99** → Aplicar. Revisa el de Colombia.
   - **Activar** (el producto y la opción de compra).
2. **RevenueCat → Product catalog → Products → + New** (en la app de Play Store): `frostpom_premium_vida`, y márcalo como **No consumible** (*Non-consumable*). **Esto es lo más importante:** si queda como consumible, RevenueCat lo "gasta" y Google dejaría comprarlo otra vez.
3. **Entitlements → `premium` → Attach:** adjunta `frostpom_premium_vida` (así da Premium).
4. **Offerings → `default` → + New package:** identificador **`$rc_lifetime`** (*Lifetime*) → producto `frostpom_premium_vida`. La app busca el paquete de tipo *Lifetime*: no hace falta cambiar nada en `js/config.js`.
5. **Supabase (recomendado):** vuelve a desplegar las funciones `rc-webhook` y `premium-sync` con el código de `server/supabase/pegar-en-supabase/` (mismo procedimiento del paso 6). La versión vieja ya entiende "sin vencimiento", pero la nueva no marca la compra de por vida como "se renueva" y guarda bien la tienda.
6. **Prueba** con tu correo de probador (paso 8): compra "De por vida" con la tarjeta de prueba que siempre aprueba → confeti, Ajustes dice "Premium de por vida". Para volver a probar, en Play Console → **Pedidos** reembolsa la compra de prueba (o en RevenueCat → el cliente → *Delete customer*).
7. **Ficha y privacidad:** nada nuevo que marcar en Seguridad de los datos ("Historial de compras" ya está). La política de privacidad ya menciona Premium de por vida.

## 5d. Corregir los precios (22 de noviembre de 2026)

Lo que se vio en las capturas y cómo arreglarlo:

| Qué se vio | ¿Está mal? | Qué hacer |
| --- | --- | --- |
| `gemas_60` a **COP 329.000** | **Sí.** Debería costar **US$ 0,99** (Google calcula los pesos: unos pocos miles, no cientos de miles). | Play Console → Productos únicos → `gemas_60` → opción de compra → **Precios** → edición masiva → **US$ 0,99** → Aplicar → revisa Colombia → **Guardar**. El precio de un producto único se puede cambiar cuando quieras. Revisa también `gemas_330` (US$ 4,99), `gemas_700` (US$ 9,99) y `gemas_1500` (US$ 19,99). |
| Premium: "prueba gratis de **3 minutos**" | **No.** Con un correo de probador, Google acorta la prueba de 7 días a 3 minutos. A la gente le sale "7 días". | Nada. |
| "COP 10.000 / **5 min**" | **No.** Con probadores, un mes dura 5 minutos. | Nada (revisa solo que el precio sea el que quieres). |
| Un plan a **"COP 66.000 / 5 min"** | **Probablemente sí.** Si es el plan **anual**, con un probador debería renovarse cada **30 minutos** (un año de prueba = 30 min). Si dice 5 minutos, ese plan quedó con período de **1 mes** (o 1 semana). | Ver abajo. |

**Arreglar el plan anual** (Play Console → Monetizar con Play → Productos → Suscripciones → `frostpom_premium`):

1. Abre el plan base `anual` y mira **Período de facturación**. Si dice **1 año**, está bien y no hagas nada más (en ese caso, cuéntame qué plan era el de COP 66.000).
2. Si dice 1 mes (o 1 semana): el período de un plan base **activo** normalmente ya no se puede cambiar, así que:
   1. **Agregar plan base:** ID `anual-12m` (los ID viejos no se pueden volver a usar), **Renovación automática**, período **1 año**, precio **US$ 19,99** (o el que decidas), "Actualizar tipos de cambio", revisa Colombia. **Activar.**
   2. **Agregar oferta** en ese plan nuevo: ID `prueba-7-dias-anual`, **Nunca tuvo esta suscripción**, **Prueba gratuita de 7 días**. **Activar.**
   3. En el plan viejo `anual`: **Desactivar**. Nadie nuevo puede comprarlo; las suscripciones de prueba que existan siguen hasta que se cancelen (puedes cancelarlas en Pedidos).
   4. **RevenueCat → Products → Import** (o + New): `frostpom_premium:anual-12m`. Adjúntalo al entitlement **`premium`**.
   5. **Offerings → `default` → paquete `$rc_annual`** → cambia el producto a `frostpom_premium:anual-12m` y guarda. (Puedes quitar el viejo `frostpom_premium:anual` del paquete; déjalo en el entitlement para las suscripciones de prueba que sigan vivas.)
   6. Abre la app desde Prueba interna: el plan anual debe decir el precio anual, "Ahorras X %" frente al mensual y, con el probador, renovar cada **30 min**.
3. Haz lo mismo con el plan `mensual` si no dice **1 mes**.

**Recuerda:** los precios **solo** se cambian en Play Console. La app muestra el que manda Google, en la moneda de cada persona; `js/config.js` no tiene precios de Google Play.

## 6. Costos

- **Google** se queda con el **15 %** de las suscripciones. De los **paquetes de gemas** también se queda una comisión (15 % en el nivel para desarrolladores pequeños, si estás inscrito; revisa "Tarifas de servicio" en la ayuda de Play Console).
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
| "Comprar gemas" dice que no pudo traer los paquetes | Los cuatro productos únicos (y su opción de compra) deben estar **activos** en Play Console, la app instalada desde Play con un correo de probador, y los productos agregados en RevenueCat. Las credenciales de Google pueden tardar hasta 36 h. |
| Pagué gemas y no llegaron | Cierra y abre la app (se revisan las compras que falten). Si el pago está "pendiente" en Google, llegan cuando se apruebe. En `chrome://inspect` busca `[FrostPom] gemas`. En Play Console → **Pedidos** puedes ver el pedido (el número `GPA.…`). |
| No sale el plan "De por vida" | El producto `frostpom_premium_vida` debe estar **activo** (con su opción de compra), en RevenueCat como **No consumible**, adjunto a `premium` y en la oferta `default` como paquete **`$rc_lifetime`**. |
| Compré "De por vida" y se pudo comprar otra vez | En RevenueCat el producto quedó como consumible: márcalo como **No consumible** y reembolsa la compra repetida en Play Console → Pedidos. |
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
