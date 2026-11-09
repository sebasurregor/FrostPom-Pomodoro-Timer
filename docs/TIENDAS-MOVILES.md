# FrostPom en Google Play y App Store: paso a paso

FrostPom hoy es una **PWA**: una página web que se instala como app. Microsoft Store acepta PWAs casi tal cual (con PWABuilder), pero **Google Play y sobre todo App Store piden una app de verdad** para el celular. Esta guía explica cómo llegar a las dos tiendas sin reescribir FrostPom: se "envuelve" el mismo código en una app nativa.

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅). Revisado el 9 de noviembre de 2026; las tiendas cambian sus reglas seguido, así que antes de cada paso grande vale la pena mirar los enlaces de la última sección.

---

## 0. Lo primero: el panorama

| | **Google Play** (Android) | **App Store** (iPhone) |
|---|---|---|
| Costo | **US$25, un solo pago** | **US$99 al año** |
| Computador | Tu PC con Windows sirve (Android Studio) | **Necesitas un Mac** con Xcode 26 (o alquilar un Mac en la nube) |
| Requisito especial | Cuentas personales nuevas: **prueba cerrada con al menos 12 personas durante 14 días seguidos** antes de publicar | Revisión estricta: **no aceptan "una página web empaquetada"** (regla 4.2) |
| Cobrar Premium | Solo con **Google Play Billing** | Solo con **compras dentro de la app de Apple** (regla 3.1.1) |
| Tiempo aproximado | 3 a 5 semanas (por los 14 días de prueba) | 1 a 2 semanas, si la revisión sale bien a la primera |

**Mi recomendación de orden:** primero **Google Play** (más barato, sirve tu PC y aprendes el proceso) y después **App Store**.

**Lo bueno que ya tienes:** las cuentas en línea (v4.0). Una persona entra con el mismo correo y contraseña en Windows, Android, iPhone o la web, y su progreso la sigue. Eso es un argumento fuerte en las descripciones de las tiendas.

---

## 1. Cómo convertir FrostPom en app: Capacitor

**Capacitor** (de Ionic, gratis y de código abierto) mete tu carpeta de FrostPom (HTML, CSS, JS, imágenes y sonidos) **dentro** de una app de Android y de iPhone. La app abre esos archivos desde el celular, no desde internet.

Por qué Capacitor y no PWABuilder (el que usaste para Microsoft Store):

- **Para iPhone, PWABuilder ya no sirve:** su parte de iOS quedó archivada en septiembre de 2025 y nadie la mantiene.
- **Para Android, PWABuilder sí existe** (crea una "Trusted Web Activity", que abre tu página en Chrome sin barra de dirección), pero en tu caso trae dos problemas:
  1. Necesita un archivo de verificación en `https://sebasurregor.github.io/.well-known/assetlinks.json`, es decir, en la **raíz** del dominio. Tu app vive en `/FrostPom-Pomodoro-Timer/`, así que tendrías que crear otro repositorio (`sebasurregor.github.io`) o comprar un dominio propio. Si la verificación falla, la app muestra la barra del navegador.
  2. Hay reportes de desarrolladores a los que Google les negó el paso a producción porque, con Trusted Web Activity, el uso de los probadores queda registrado en Chrome y no en la app. Google no publica cómo lo mide, pero es un riesgo con la prueba de 14 días.
- **Con Capacitor, un solo proyecto sirve para las dos tiendas**, funciona sin internet desde el primer momento y deja usar funciones del celular (notificaciones, vibración, compras), lo que también ayuda a pasar la regla 4.2 de Apple.

**El costo de esta decisión:** con Capacitor, cada vez que cambies FrostPom hay que generar una versión nueva y subirla a las tiendas (con la web y Microsoft Store basta con `git push`). Las cuentas, el ranking y el progreso sí se comparten en todas partes porque viven en Supabase.

---

## 2. Fase 1 — Preparar FrostPom (sirve para las dos tiendas)

Esto es código. **Lo puedo hacer yo** y entregártelo en un zip, como siempre.

### 2.1 Página web para pedir que borren la cuenta (obligatorio en Google Play)

Google exige que, si la app permite crear cuentas, haya **(1)** una forma de borrarla dentro de la app (ya la tienes: Ajustes → Eliminar mi cuenta) y **(2)** una página web donde se pueda **pedir** el borrado sin tener la app instalada, que nombre la app y explique los pasos.

- Qué hacer: crear `eliminar-cuenta.html` (español e inglés) con los pasos dentro de la app y un botón para escribir a `startupprometeus@gmail.com` desde el correo de la cuenta. Tú ya sabes cómo atender el pedido (`CUENTAS-EN-LINEA.md`, sección "Si alguien te pide…").
- ✅ Quedó bien si `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/eliminar-cuenta.html` abre sin errores.

### 2.2 Reportar y ocultar nombres en el ranking (muy probable que lo pidan las dos)

El ranking muestra **nombres de usuario que escribieron otras personas**. Las dos tiendas tratan eso como "contenido creado por usuarios" y piden:

- **Apple (regla 1.2):** un filtro (✅ ya existe), **una forma de reportar** contenido ofensivo, **poder bloquear** a usuarios abusivos y un contacto publicado (✅ el correo de soporte).
- **Google Play:** que la persona **acepte unas normas** antes de que su nombre aparezca, y **reportar y bloquear** dentro de la app.

Qué haría: un botón "⋯" en cada fila del ranking con **"Reportar nombre"** (queda guardado en Supabase para que tú lo revises y lo ocultes con `private.hide_name`) y **"No ver más a esta persona"** (se oculta solo en tu dispositivo). Más una línea al unirse al ranking: "Al aparecer en el ranking aceptas las normas de la comunidad", con enlace a las normas.

### 2.3 Que la app sepa que está "dentro" de una app

- **Service worker:** dentro de Capacitor no hace falta (los archivos ya están en el celular) y en iPhone no funciona. Se desactiva solo ahí.
- **Recordatorios:** las notificaciones web no funcionan dentro de una app. Se usa el complemento oficial `@capacitor/local-notifications` (en Android 13 o superior pide permiso; para que suenen a la hora exacta, Android pide un permiso de alarmas).
- **Vibración:** el complemento `@capacitor/haptics` (en iPhone la vibración web no existe).
- **Botón "atrás" de Android:** que cierre las ventanas de FrostPom y no la app.
- **Premium:** mientras siga en "Probar Premium gratis" (sin cobrar), se puede publicar así. El código de cobro actual es solo de Microsoft Store; cuando quieras cobrar en el celular hay que agregar Google Play Billing y las compras de Apple (por ejemplo con RevenueCat, que maneja las dos). Ojo: en iPhone **no** se puede mencionar ni enlazar otra forma de pagar.
- **Sonidos en iPhone:** revisar que los sonidos de concentración sigan sonando con el interruptor de silencio activado (en iPhone el audio de las páginas web se calla en silencio).

### 2.4 Imágenes para las tiendas

| | Google Play | App Store |
|---|---|---|
| Ícono | 512 × 512 PNG (ya lo tienes) | **1024 × 1024 sin transparencia** (el tuyo tiene fondo transparente: hay que darle fondo) |
| Imagen destacada | **1024 × 500** (nueva) | No |
| Capturas | Mínimo 2 de teléfono (vertical, por ejemplo 1080 × 1920) | iPhone de 6,9 pulgadas (por ejemplo 1320 × 2868); si la app funciona en iPad, también de iPad 13 pulgadas |

Las capturas las puedo generar igual que las de Microsoft Store.

### 2.5 Política de privacidad

Agregar que la app también está en Google Play y App Store, que los pagos (si algún día se cobra) los procesan Google o Apple, y enlazar `eliminar-cuenta.html`.

---

## 3. Fase 2 — Google Play

### Paso 1. Crear la cuenta de desarrollador

1. Entra a **play.google.com/console** con tu cuenta de Google y elige cuenta **personal**.
2. Paga los **US$25** (tarjeta a tu nombre; no aceptan prepago).
3. Google te puede pedir **documento de identidad** y verificar tu nombre. Las cuentas personales además deben **verificar un teléfono Android** con la app **Play Console**.

✅ Quedó bien si en Play Console ya puedes tocar **Crear app**.

> Igual que con Microsoft: tu cédula y tus datos bancarios van solo en las páginas oficiales de Google, nunca por chat.

### Paso 2. Crear el proyecto Android con Capacitor (en tu PC)

Necesitas **Node.js** y **Android Studio**. Te doy los comandos exactos cuando lleguemos aquí; a grandes rasgos:

```
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init FrostPom com.TU_DOMINIO.frostpom --web-dir www
npx cap add android
npx cap sync
npx cap open android
```

- **El identificador (`com.algo.frostpom`) es para siempre:** no se puede cambiar después de publicar. Usa el mismo en Android y iPhone.
- En Android Studio: **Build → Generate Signed App Bundle** crea el archivo `.aab` que se sube a Play.
- **La llave de firma (keystore) es como la llave de tu casa:** guárdala en dos lugares seguros y nunca la subas a GitHub. Con **Play App Signing** (lo normal), Google guarda la llave final y tú solo la de subida.

✅ Quedó bien si la app abre en el emulador de Android Studio (o en tu celular) y funciona sin internet.

### Paso 3. Llenar la ficha y el "Contenido de la app"

En Play Console → tu app:

1. **Ficha de Play Store:** nombre (30 caracteres), descripción breve (80), descripción completa (hasta 4000), ícono, imagen destacada y capturas. Puedo adaptar los textos de `docs/microsoft-store/FICHA.md`.
2. **Contenido de la app** (Policy → App content). Las respuestas de FrostPom:
   - **Política de privacidad:** la URL de `privacidad.html`.
   - **Anuncios:** No.
   - **Acceso a la app:** explica que cualquiera puede crear una cuenta en la pantalla de inicio (como en las notas para Microsoft).
   - **Clasificación de contenido (IARC):** el mismo cuestionario que hiciste en Microsoft Store. Responde igual: hay ranking con nombres de usuario, no hay chat.
   - **Público objetivo:** si incluyes **menores de 13**, la app entra a la **Política de Familias** de Google, que es más estricta. FrostPom ya cumple lo principal: pregunta la edad sin sugerir respuesta, no tiene anuncios y los menores de 13 no envían nada a ningún servidor. Revisa la política completa antes de marcar esas edades.
   - **Seguridad de los datos:** declara lo que realmente se envía:
     - **Correo electrónico:** cuentas en línea, para administrar la cuenta.
     - **ID de usuario:** cuenta de Supabase.
     - **Nombre de usuario y país:** se muestran en el ranking.
     - **Actividad en la app:** progreso y horarios de los pomodoros.
     - Todo viaja **cifrado** (HTTPS), no se vende y **se puede pedir el borrado**.
     - **No** se recogen la foto, la fecha de nacimiento ni la ubicación.
   - **Eliminación de cuentas:** la URL de `eliminar-cuenta.html`.

✅ Quedó bien si en el **Panel** todas las tareas de "Configura tu app" tienen check.

### Paso 4. La prueba cerrada: 12 personas durante 14 días

Como tu cuenta personal es nueva, **Google no deja publicar** hasta que **al menos 12 personas** hayan probado la app en una **prueba cerrada**, inscritas **14 días seguidos**.

1. Testing → **Closed testing** → crea una versión y sube el `.aab`.
2. En **Testers**, agrega los correos de Gmail de tus probadores (compañeros, amigos, familia), mejor 15 o más por si alguien se sale.
3. Envíales el **enlace de inscripción**. Cada uno debe aceptarlo e **instalar la app desde Play**, y quedarse inscrito los 14 días.
4. Pídeles que la usen de verdad (un pomodoro al día) y que te escriban qué mejorarían: Google pregunta por eso al final.

✅ Quedó bien si en el **Panel** aparece el contador "12 testers, 14 days" completo.

### Paso 5. Pedir acceso a producción y publicar

1. Panel → **Apply for production**. Te pregunta por la prueba (cuántas personas, qué te dijeron, qué cambiaste), por la app y por si está lista.
2. Google suele responder en **7 días o menos**.
3. Con el acceso aprobado: **Production → Create new release**, sube el `.aab`, escribe las novedades y envía a revisión.

✅ Quedó bien si la app aparece en Play con tu nombre de desarrollador.

---

## 4. Fase 3 — App Store

### Paso 1. Conseguir un Mac (o uno en la nube)

Apple solo deja compilar y subir apps con **Xcode** (desde abril de 2026, **Xcode 26** con el SDK de iOS 26 como mínimo), y Xcode solo funciona en Mac. Opciones:

- **Un Mac propio o prestado:** lo más sencillo (cualquier Mac que soporte la versión actual de macOS).
- **Un Mac en la nube:** servicios como Codemagic o GitHub Actions (con máquinas macOS) compilan y suben la app por ti. Es más técnico, pero se puede hacer desde Windows.
- Para probar, ayuda tener un **iPhone** (con **TestFlight** se instala la versión de prueba).

### Paso 2. Inscribirte en el Apple Developer Program

1. Necesitas una **Apple Account con verificación en dos pasos** y ser **mayor de edad**.
2. Inscríbete como **individual** en developer.apple.com/programs/enroll (o desde la app **Apple Developer**). Cuesta **US$99 al año**.
3. Tu **nombre legal** aparecerá como vendedor en la App Store; si quieres que aparezca una empresa, se necesita inscribirse como organización (con número D-U-N-S).
4. Paga con una tarjeta **a tu nombre**; si no, Apple pide una copia de tu documento y se demora.

✅ Quedó bien si entras a **App Store Connect** (appstoreconnect.apple.com) y ves **Apps**.

### Paso 3. Crear la app y el proyecto de iPhone

1. En App Store Connect → **Apps → +**: nombre, idioma, el **mismo identificador** de Android (`com.algo.frostpom`) y un SKU (por ejemplo `frostpom-ios`).
2. En el Mac, sobre el mismo proyecto de Capacitor: `npx cap add ios`, `npx cap sync` y `npx cap open ios`.
3. En Xcode: elige tu equipo (**Signing & Capabilities**), pon el ícono de 1024 sin transparencia y prueba en el simulador o en tu iPhone.
4. **Product → Archive** y **Distribute App → App Store Connect**.
5. Prueba la versión en **TestFlight** antes de mandarla a revisión.

✅ Quedó bien si la versión aparece en TestFlight y la puedes instalar en un iPhone.

### Paso 4. Llenar la ficha

- **App Privacy** (la "etiqueta nutricional" de privacidad): los mismos datos de la sección de Google (correo, ID, nombre de usuario, actividad; nada de rastreo ni publicidad).
- **Clasificación por edad:** Apple cambió su cuestionario en 2025 (ahora hay 4+, 9+, 13+, 16+ y 18+). Responde con la verdad; el ranking con nombres cuenta como contenido de usuarios.
- **URL de privacidad** y **URL de soporte** (puede ser la de la app con tu correo).
- **Capturas** de iPhone de 6,9 pulgadas.
- **Notas para la revisión:** como las de Microsoft. Explica que se puede crear una cuenta desde la pantalla de inicio, que funciona sin internet, que tiene recordatorios, sonidos y vibración, y que los menores de 13 no envían datos.

### Paso 5. Mandar a revisión

- Apple revisa a mano. El riesgo principal es la **regla 4.2** ("una página web empaquetada"). FrostPom tiene buenos argumentos: funciona sin internet, tiene progreso, mascotas, sonidos, recordatorios y vibración nativa. Si aun así la rechazan, responde en el **Resolution Center** explicando esas funciones; no es el final del camino.
- También revisan la **regla 5.1.1(v)** (borrar la cuenta dentro de la app: ✅ ya la tienes) y la **1.2** (reportar y bloquear en el ranking: punto 2.2).
- No hace falta "Iniciar sesión con Apple": solo es obligatorio si ofreces entrar con Google, Facebook u otro servicio, y FrostPom usa su propia cuenta.

✅ Quedó bien si el estado pasa a **Ready for Distribution**.

### Si algún día cobras Premium en iPhone

Hay que firmar el **Paid Apps Agreement** en App Store Connect, con datos bancarios y de impuestos (el W-8BEN de Apple, parecido al de Microsoft), y crear la suscripción en **In-App Purchases**. Con la app gratis basta el acuerdo de apps gratis, que se acepta al inscribirte.

---

## 5. Después de publicar: cómo actualizar

1. Haces el cambio en FrostPom (como hasta ahora) y lo pruebas en la web.
2. `npx cap sync` para copiar los archivos nuevos al proyecto Android y al de iPhone.
3. Subes el número de versión (en Android, `versionCode` y `versionName`; en iPhone, la versión y el build).
4. Generas el `.aab` (Android) y el archivo de Xcode (iPhone) y los subes como versión nueva.
5. La web y Microsoft Store se siguen actualizando solos con `git push`.

---

## 6. Lista de chequeo

**Fase 1: preparar FrostPom (lo hago yo)**
- [ ] `eliminar-cuenta.html` (ES/EN)
- [ ] Reportar nombre y "No ver más a esta persona" en el ranking, más las normas de la comunidad
- [ ] Modo app: sin service worker, notificaciones locales, vibración nativa, botón atrás de Android
- [ ] Ícono de 1024 sin transparencia, imagen destacada de 1024 × 500 y capturas de teléfono
- [ ] Política de privacidad actualizada

**Fase 2: Google Play**
- [ ] Cuenta personal en Play Console (US$25) y teléfono verificado
- [ ] Proyecto Android con Capacitor y `.aab` firmado (llave guardada en dos lugares)
- [ ] Ficha y Contenido de la app completos
- [ ] Prueba cerrada: 12 o más personas durante 14 días seguidos
- [ ] Acceso a producción aprobado y app publicada

**Fase 3: App Store**
- [ ] Mac con Xcode 26 (propio, prestado o en la nube)
- [ ] Apple Developer Program individual (US$99 al año)
- [ ] App creada en App Store Connect con el mismo identificador
- [ ] Versión en TestFlight probada
- [ ] Ficha, privacidad, edad y notas completas
- [ ] Revisión aprobada

---

## Fuentes

- Google Play, prueba cerrada para cuentas personales nuevas: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play, requisitos para borrar cuentas: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play, contenido creado por usuarios: https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play, crear la cuenta de desarrollador: https://support.google.com/googleplay/android-developer/answer/6112435
- Apple, App Review Guidelines (1.2, 3.1.1, 4.2, 4.8, 5.1.1): https://developer.apple.com/app-store/review/guidelines/
- Apple, inscripción en el Developer Program: https://developer.apple.com/support/enrollment/
- PWABuilder iOS (archivado en 2025): https://github.com/pwa-builder/pwabuilder-ios
- Capacitor, notificaciones locales: https://capacitorjs.com/docs/apis/local-notifications
- Trusted Web Activity con varios orígenes y Digital Asset Links: https://developer.chrome.com/docs/android/trusted-web-activity/multi-origin
- Reportes sobre Trusted Web Activity y la prueba cerrada (fuente no oficial): https://www.testerscommunity.com/guides/twa-app-rejected-switch-to-webview
