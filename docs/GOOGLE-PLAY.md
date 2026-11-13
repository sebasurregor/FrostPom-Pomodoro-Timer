# FrostPom en Google Play: paso a paso (v4.1)

La v4.1 ya trae todo lo que Google Play pide del lado del código:

- la página para pedir que borren la cuenta;
- las normas de la comunidad;
- reportar y ocultar nombres en el ranking;
- el modo app de Android (botón atrás, avisos que llegan aunque salgas de la app, vibración);
- el proyecto de Capacitor;
- los íconos, la imagen destacada y las capturas.

Esta guía es lo que haces **tú**, en orden. Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅).

**Tiempo total:** de 3 a 5 semanas, sobre todo por la prueba cerrada de 14 días que Google exige a las cuentas personales nuevas.

> **Nunca por chat ni en GitHub:** tu cédula y los datos de pago (van solo en las páginas de Google), la **llave de firma** (`.jks`) y sus contraseñas, la llave secreta de Supabase y las contraseñas de las cuentas de prueba.

---

## Paso 0. Publicar la v4.1 en la web (antes que nada)

Google revisa que las direcciones de la ficha (privacidad y borrar cuenta) abran sin errores, y el botón "Reportar nombre" necesita el SQL nuevo.

1. **Supabase (proyecto real) → SQL Editor → New query.** Pega **todo** `server/supabase/schema.sql` y pulsa **Run**.

   ✅ Dice **Success**. El SQL se puede correr las veces que quieras y no borra datos: lo probé subiendo de la v4.0.3 a la v4.1 con datos.
2. **Copia el contenido del zip encima de tu repositorio** (sin borrar la carpeta `.git`).
3. **Vuelve a poner tu clave del CAPTCHA:** en `js/config.js`, en `siteKey: '',`, pega tu site key `0x…`. El zip la trae vacía.
4. Sube los cambios con tu cuenta:
   ```
   git add -A
   git commit -m "v4.1: listo para Google Play (normas, reportar y ocultar en el ranking, eliminar cuenta, app de Android)"
   git push
   ```
5. Espera unos minutos y abre en una ventana InPrivate:
   - https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/eliminar-cuenta.html
   - https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/normas.html
   - la app: al final de **Ajustes** debe decir **versión 4.4.1** (o la que estés publicando).

✅ **Quedó bien si** las dos páginas abren, y en el ranking tocas **⋯** junto a un nombre y aparecen **Reportar nombre** y **No ver más a esta persona**.

**Para revisar los reportes** que lleguen (de vez en cuando), en Supabase → SQL Editor:

```sql
select * from private.report_summary();                    -- los nombres reportados
select private.hide_name('nombre_feo');                    -- ocultarlo del ranking
select private.hide_name('nombre_que_estaba_bien', false); -- volver a mostrarlo (borra sus reportes)
```

Un nombre con 3 reportes de personas distintas se oculta solo hasta que lo revises.

---

## Paso 1. Crear tu cuenta de desarrollador de Google Play

1. Entra a **play.google.com/console** con la cuenta de Google que quieras usar para publicar y elige cuenta **personal**.
2. **Nombre de desarrollador** (el que ve la gente en Play): por ejemplo **Startup Prometeus**.
3. Paga los **US$25** (un solo pago, con tarjeta a tu nombre).
4. Google verifica tu identidad (documento) **en sus propias páginas** y te pide verificar un **celular Android** con la app **Google Play Console**. Usa el tuyo.
5. Correo de contacto: `startupprometeus@gmail.com`.

✅ **Quedó bien si** en Play Console aparece el botón **Crear app**. La verificación puede tardar unos días.

---

## Paso 2. Preparar tu PC (una sola vez)

1. **Node.js 22 o más nuevo** (Capacitor 8 lo exige): nodejs.org → la versión **LTS** → instálala con las opciones normales.

   ✅ En una PowerShell **nueva**, `node -v` responde `v22…` o más.
2. **Android Studio**: developer.android.com/studio → instala la versión estable más reciente. La primera vez que lo abras, deja que el asistente descargue el **Android SDK** (elige la instalación "Standard").
3. En Android Studio: **More Actions → SDK Manager** (o **Tools → SDK Manager**). En **SDK Platforms**, marca **Android 16 (API 36)** si no lo está y pulsa **Apply**.

✅ **Quedó bien si** `node -v` funciona y Android Studio abre sin avisos rojos.

---

## Paso 3. Crear el proyecto de Android

En una PowerShell, dentro de la carpeta de tu repositorio:

```
npm install
npm run android:crear
npm run android:abrir
```

- `npm install` descarga Capacitor (las versiones exactas que probé: 8.6).
- `android:crear` copia la app a `www/`, crea la carpeta `android/`, pone los íconos de FrostPom y la versión de `package.json` (hoy 4.4.1, `versionCode 40401`), y conecta todo.
- `android:abrir` abre el proyecto en Android Studio.

En Android Studio, espera abajo a que termine **Gradle sync** (la primera vez descarga cosas y tarda unos minutos).

✅ **Quedó bien si** Android Studio dice **"Gradle sync finished"** sin errores rojos.

La carpeta `android/` **sí** se sube a GitHub (es el proyecto de la app). `www/`, las llaves y los `.aab` no se suben: ya están en `.gitignore`.

> **El identificador `com.startupprometeus.frostpom` es para siempre:** está en `capacitor.config.json`. No lo cambies después de publicar.

---

## Paso 4. Probar en tu celular

1. En tu Android: **Ajustes → Acerca del teléfono** → toca **Número de compilación** 7 veces (se activan las "Opciones de desarrollador"). Luego **Ajustes → Sistema → Opciones de desarrollador → Depuración por USB**: encendida.
2. Conecta el celular al PC con el cable y acepta **"¿Permitir depuración por USB?"** en el celular.
3. En Android Studio, arriba, elige tu celular y pulsa **▶ Run**.

Revisa en el celular:

- [ ] Crear una cuenta en línea (13+) funciona. Esto también confirma que el CAPTCHA funciona dentro de la app.
- [ ] Al empezar el primer pomodoro te pide permiso de notificaciones. Acéptalo.
- [ ] Empieza un pomodoro, **sal de la app** (botón de inicio) y espera a que termine: llega el aviso **"¡Sesión completa!"**. Puede tardar un poco si el teléfono está en reposo.
- [ ] El botón **atrás** cierra ventanas, vuelve a Enfocar y, en Enfocar, deja la app en segundo plano.
- [ ] En el ranking, **⋯ → Reportar nombre** y **No ver más a esta persona**.
- [ ] Sonidos, vibración y modo avión (la app funciona sin internet).
- [ ] **Ajustes → Política de privacidad** abre en el navegador del teléfono.

✅ **Quedó bien si** todo lo anterior funciona. Si algo falla, mándame una captura.

Mientras pruebas desde Android Studio puedes ver la consola de la app: en Chrome del PC abre `chrome://inspect` y toca **inspect** debajo de FrostPom. En la versión que subes a Play eso queda apagado solo.

---

## Paso 5. Crear la llave de firma y el archivo `.aab`

1. Android Studio → **Build → Generate Signed App Bundle or APK…** → **Android App Bundle** → **Next**.
2. **Key store path → Create new…**
   - **Ruta:** fuera del proyecto, por ejemplo `Documentos\FrostPom-llaves\frostpom-subida.jks`.
   - **Contraseñas:** inventa una fuerte (puede ser la misma para el archivo y la llave).
   - **Alias:** `subida`. **Validity:** 30 años.
   - **Certificate:** tu nombre, organización `Startup Prometeus`, país `CO`.
3. **Next** → **release** → **Create**.

✅ **Quedó bien si** aparece `android/app/release/app-release.aab`.

> **Guarda la llave (`.jks`) y sus contraseñas en dos lugares seguros** (por ejemplo, un gestor de contraseñas y una memoria USB). Con **Play App Signing** (el paso 7 lo activa), Google guarda la llave final de la app: si pierdes esta "llave de subida", se puede pedir otra, pero es un trámite largo.

---

## Paso 6. Crear la app en Play Console

1. **Crear app**:
   - **Nombre:** `FrostPom: Pomodoro Timer`.
   - **Idioma predeterminado:** Español (Latinoamérica).
   - **App o juego:** App. **Gratis o de pago:** Gratis.
   - Acepta las declaraciones.
2. En el **Panel** aparece la lista "Configura tu app". Llénala con `docs/google-play/FICHA.md`, que tiene todas las respuestas:
   - **Ficha de Play Store:** textos en español e inglés, ícono, imagen destacada y capturas (en `docs/google-play/`).
   - **Contenido de la app:** política de privacidad, acceso (con una cuenta de prueba), anuncios (no), clasificación, público objetivo, seguridad de los datos y eliminación de la cuenta.

✅ **Quedó bien si** todas las tareas de "Configura tu app" tienen ✔.

> **Público objetivo:** si incluyes menores de 13, aplica la Política de Familias (más revisión). `FICHA.md` explica las dos opciones. Es tu decisión.

---

## Paso 7. Prueba cerrada: 12 personas durante 14 días

Como tu cuenta personal es nueva, **Google no deja publicar** hasta que **al menos 12 personas** estén inscritas en una **prueba cerrada** durante **14 días seguidos**.

1. **Probar y publicar → Pruebas → Prueba cerrada → Crear versión**. Si te pregunta por **Play App Signing**, acéptalo.
2. Sube `app-release.aab`. Nombre de la versión: `4.4.1`. En las notas: "Primera versión de prueba".
3. **Testers**: crea una lista con los **correos de Gmail** de tus probadores. Invita a **15 o más**, por si alguien se sale.
4. **Países:** elige al menos Colombia (y los de tus probadores).
5. Envía la versión a revisión. Cuando la aprueben (puede tardar unos días), copia el **enlace para unirse** y mándaselo.
6. Cada probador abre el enlace, acepta y **instala FrostPom desde Play**. Pídeles que no se salgan y que la usen de verdad (un pomodoro al día) y te cuenten qué mejorarían: Google lo pregunta al final.

✅ **Quedó bien si** en el **Panel** el contador llega a **12 testers durante 14 días**.

---

## Paso 8. Pedir acceso a producción y publicar

1. **Panel → Solicitar acceso a producción.** Responde con lo que pasó en la prueba: cuántas personas, qué te dijeron y qué cambiaste.
2. Google suele responder en **7 días o menos**.
3. Con el acceso aprobado: **Producción → Crear versión**. Sube el `.aab` (o uno nuevo), escribe las novedades y envíala a revisión.

✅ **Quedó bien si** FrostPom aparece en Play con tu nombre de desarrollador.

---

## Cada vez que cambies FrostPom

1. Haz el cambio y pruébalo en la web, como siempre.
2. Sube la versión en los **tres** lugares: `js/config.js` (`version`), `service-worker.js` (`VERSION`) y `package.json` (`version`). Por ejemplo, de 4.4.1 a 4.4.2.
3. Ejecuta:
   ```
   npm run android:actualizar
   ```
   Copia la app nueva y pone la versión en Android (4.2.2 queda como `versionCode 40202`: Google exige que suba siempre).
4. Android Studio → **Build → Generate Signed App Bundle or APK…** con **la misma llave** → sube el `.aab` como versión nueva.
5. La web y Microsoft Store se actualizan solas con `git push`. La app de Android solo cambia cuando subes una versión nueva a Play.

---

## Si algo falla

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| `npm` o `npx` no se reconocen | Falta Node.js o la PowerShell estaba abierta desde antes | Instala Node 22+ y abre una PowerShell nueva |
| `Gradle sync failed` | Falta el SDK de Android 16 o la primera descarga se cortó | SDK Manager → Android 16 (API 36) → Apply. Luego **File → Sync Project with Gradle Files** |
| La app abre en blanco | `www/` quedó vieja o vacía | `npm run android:actualizar` y vuelve a pulsar ▶ Run |
| "No pudimos comprobar que eres una persona" en la app | El CAPTCHA no reconoce la app | Revisa que `capacitor.config.json` tenga `"hostname": "sebasurregor.github.io"` y que tu widget de Cloudflare tenga ese hostname |
| No llegan los avisos | Permiso de notificaciones apagado o el ahorro de batería los frena | Ajustes del teléfono → Apps → FrostPom → Notificaciones (encendidas) y Batería → **Sin restricciones** |
| Play dice que el `versionCode` ya se usó | Subiste la misma versión dos veces | Sube la versión (paso "Cada vez que cambies") |
| Play pide la política de privacidad o borrar cuenta y no abre | La v4.1 todavía no está publicada en la web | Haz el paso 0 |

---

## Lo que hay por dentro (por si te preguntan)

- **Capacitor 8.6** mete la misma app web dentro de una app de Android (Android 16, API 36). Funciona sin internet desde el primer momento. No usa el service worker: los archivos ya están en el teléfono.
- **Dirección interna:** dentro de la app, la página se llama `https://sebasurregor.github.io/` (no `localhost`). Así el CAPTCHA de Cloudflare la reconoce con el mismo widget de la web. `challenges.cloudflare.com` puede abrirse dentro de la app (`allowNavigation`).
- **`js/native.js`** es lo único que habla con el teléfono: botón atrás, notificaciones locales (canal "Pomodoros y recordatorios"), vibración y el navegador del teléfono. En la web no hace nada y ni siquiera se carga `js/vendor/capacitor-core.js`.
- **Avisos inexactos a propósito:** con avisos "exactos", Android 12+ abriría solo la pantalla de permisos de alarmas. Con `allowWhileIdle`, el aviso llega aunque el teléfono esté en reposo, quizás con algo de retraso.
- **Pruebas:** `python tests/e2e_android.py http://localhost:8000/` (45 comprobaciones con Capacitor y Supabase simulados), más las del servidor (`server/supabase/test/run_local.sh`, 37).
