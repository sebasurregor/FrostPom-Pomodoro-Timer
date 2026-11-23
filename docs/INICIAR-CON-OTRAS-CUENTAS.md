# Entrar con Google, Microsoft o Discord (v4.9.0)

FrostPom ya trae los botones **"Continuar con Google"**, **"Continuar con Microsoft"** y **"Continuar con Discord"** (y **Facebook**, programado pero apagado). Están **apagados** hasta que configures cada proveedor: esta guía es el paso a paso.

## 1. Lo que decidiste (22 de noviembre de 2026)

- **Google, Microsoft y Discord**, que se pueden encender sin esperar a nadie.
- **Facebook** queda programado pero apagado: Meta pide revisar la app (política de datos, verificación del negocio) antes de que cualquiera pueda entrar. Cuando quieras, se enciende igual que los otros (sección 7).

## 2. Cómo funciona (lo que ve la persona)

1. En la bienvenida (crear cuenta) y en "Inicia sesión", arriba, salen los botones "Continuar con…". Debajo sigue el formulario de siempre ("o crea tu cuenta con un nombre y una contraseña").
2. Al tocar uno:
   - **Si va a crear la cuenta** y todavía no dijo su mes y año de nacimiento, la app los pide primero (una ventanita corta). **Menores de 13 no pueden** crear una cuenta en línea: la app les explica que usen el formulario normal (su cuenta se queda en el dispositivo).
   - Se abre la página de Google (o Microsoft, o Discord). En la **app de Android**, en una pestaña del navegador del teléfono que vuelve sola a la app; en la **web y en Windows**, la página va a Google y regresa.
3. Al volver:
   - **Si ya tenía cuenta** con ese correo, entra y trae su progreso (igual que con correo y contraseña). Supabase une las cuentas con el mismo correo: si alguien creó su cuenta con `ana@gmail.com` y contraseña, y después toca "Continuar con Google" con ese mismo Gmail, entra a **la misma cuenta**.
   - **Si es nueva**, sale **"Termina de crear tu cuenta"**: el **correo ya viene puesto** (lo manda Google), y el **nombre de usuario** viene sugerido (uno al azar, como "PingüinoAlegre60"), que la persona puede cambiar. A propósito **no** se usa el nombre real de su cuenta de Google: en el ranking es mejor no aparecer con el nombre real.
4. Después, la app abre directo, como siempre (la sesión queda abierta). Si la persona cerró sesión o eligió no mantenerla abierta, en vez de pedir contraseña sale **"¡Hola de nuevo!"** con **"Continuar con Google"** (o el que usó).
5. Las cuentas así **no tienen contraseña de FrostPom**: en Ajustes no sale "Cambiar contraseña", y para **eliminar la cuenta** se pide escribir el nombre de usuario (en vez de la contraseña).

**Seguridad:** FrostPom nunca ve la contraseña de Google, Microsoft ni Discord. Se usa OAuth con **PKCE**: la app inventa un secreto al azar, Google devuelve un código de un solo uso y solo la app que tiene el secreto lo puede cambiar por la sesión. Las **claves secretas** de cada proveedor (*client secret*) van **solo** en Supabase: nunca en la app, en GitHub ni en el chat.

## 3. Antes de empezar: dos direcciones

- **La de regreso a Supabase** (la usan Google, Microsoft y Discord):
  `https://tcxdmziakgppabwyrydd.supabase.co/auth/v1/callback`
  (también aparece en Supabase → Authentication → Sign In / Providers → cada proveedor, con un botón para copiarla).
- **Las de regreso a la app** (las usa Supabase): Supabase → **Authentication → URL Configuration → Redirect URLs → Add URL**, y agrega estas dos:
  - `com.startupprometeus.frostpom://login-callback` (la app de Android)
  - `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/**` (la web y la versión de Windows)

  **No cambies el "Site URL"** (es el de los correos de recuperar la contraseña).

## 4. Google

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google de desarrollador. Puedes usar el mismo proyecto de RevenueCat o crear uno ("FrostPom Entrar").
2. Menú → **Google Auth Platform** (antes "Pantalla de consentimiento de OAuth"):
   - **Branding (Desarrollo de la marca):** nombre de la app **FrostPom**, tu correo de asistencia y los enlaces de la página principal (`https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/`), la **política de privacidad** (`…/privacidad.html`) y las **condiciones** (puedes usar `…/normas.html`). En **Dominios autorizados** agrega `sebasurregor.github.io` y `supabase.co`. **El logo déjalo para el paso 5:** con logo, Google pide verificar la marca antes de mostrarlo, y no hace falta para empezar.
   - **Audience (Público):** tipo **Externo**. Mientras esté "En prueba", solo entran los correos que agregues como usuarios de prueba (pon el tuyo y los de tus probadores). Para todo el mundo: **Publicar app** (con solo correo y perfil no hace falta la verificación larga de Google).
   - **Data Access (Acceso a los datos):** deja los que vienen (`.../auth/userinfo.email` y `.../auth/userinfo.profile`) y agrega `openid`. **Nada más**: con permisos "sensibles" Google exige una revisión de semanas.
3. **Clients (Clientes) → Crear cliente:**
   - Tipo de aplicación: **Aplicación web** (aunque sea para la app de Android: el que habla con Google es Supabase).
   - Nombre: `FrostPom Supabase`.
   - **Orígenes de JavaScript autorizados:** `https://sebasurregor.github.io`
   - **URI de redireccionamiento autorizados:** `https://tcxdmziakgppabwyrydd.supabase.co/auth/v1/callback`
   - **Crear.** Copia el **ID de cliente** y el **Secreto del cliente**.
4. Supabase → **Authentication → Sign In / Providers → Google**: enciéndelo, pega el **Client ID** y el **Client Secret** (el secreto, solo aquí) y **Save**.
5. Opcional pero recomendado, cuando ya funcione: sube tu **logo** (120 × 120) en Branding y pide la **verificación de la marca**. Sin ella, en la ventana de Google puede salir el dominio `tcxdmziakgppabwyrydd.supabase.co` en vez de "FrostPom". Tarda unos días hábiles.

## 5. Microsoft (Outlook, Hotmail y cuentas de colegio o empresa)

En Supabase este proveedor se llama **Azure**.

1. Entra a [portal.azure.com](https://portal.azure.com) (o [entra.microsoft.com](https://entra.microsoft.com)) con tu cuenta Microsoft (la de Partner Center sirve).
   - **Ojo:** desde junio de 2024, Microsoft exige que cada app nueva viva dentro de un **directorio** (*tenant*). Si tu cuenta todavía no tiene uno, la forma más directa es crear una **cuenta gratis de Azure** ([aka.ms/signUpForAzure](https://aka.ms/signUpForAzure)). Microsoft suele pedir una tarjeta **solo para verificar tu identidad**: el registro de apps es gratis y no se cobra nada si no creas recursos de pago. Los datos de la tarjeta van **solo** en la página de Microsoft (nunca por chat).
   - Si no quieres hacer eso todavía, deja Microsoft para después: Google y Discord funcionan solos (`azure: false`).
2. **Microsoft Entra ID → Registros de aplicaciones → Nuevo registro:**
   - Nombre: **FrostPom**.
   - Tipos de cuenta compatibles: **"Cuentas en cualquier directorio organizativo y cuentas Microsoft personales"** (así entran los de Hotmail/Outlook y los correos del colegio o la universidad).
   - URI de redirección: plataforma **Web** → `https://tcxdmziakgppabwyrydd.supabase.co/auth/v1/callback`
   - **Registrar.** Copia el **Id. de aplicación (cliente)**.
3. **Certificados y secretos → Secretos de cliente → Nuevo secreto de cliente:** descripción "Supabase", vencimiento **24 meses**. Copia el **Valor** (no el "Id. de secreto"): solo se ve una vez. **Anota en tu calendario la fecha de vencimiento**: ese día hay que crear uno nuevo y pegarlo en Supabase, o Microsoft deja de funcionar.
4. (Recomendado por Supabase) **Manifiesto:** haz una copia del texto, y en `optionalClaims` agrega el reclamo `xms_edov` y `email` en `idToken`, y `xms_edov` en `accessToken`. Así Supabase sabe con certeza que el correo está verificado.
5. Supabase → **Authentication → Sign In / Providers → Azure**: enciéndelo, pega el **Application (client) ID** y el **Secret Value**. Deja vacío "Azure Tenant URL" (así sirve para cuentas personales y de organizaciones). **Save.**
6. La app ya pide el permiso `email` (sin él, Microsoft no manda el correo y Supabase no deja entrar).

**Nota:** algunos colegios o empresas no dejan que sus estudiantes acepten apps de afuera ("Se necesita la aprobación del administrador"). Con un Outlook/Hotmail personal siempre funciona; para quitar ese aviso en las organizaciones, Microsoft pide verificar al editor (*publisher verification*), que necesita una cuenta de Microsoft Partner. No hace falta para empezar.

## 6. Discord

1. Entra a [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** → nombre **FrostPom** → acepta los términos → **Create**.
2. En **General Information** pon el ícono (tu logo), la descripción, y los enlaces de **Privacy Policy URL** y **Terms of Service URL**.
3. **OAuth2 → Redirects → Add Redirect:** `https://tcxdmziakgppabwyrydd.supabase.co/auth/v1/callback` → **Save Changes**.
4. En **OAuth2 → Client information** copia el **Client ID** y el **Client Secret** (si hace falta, **Reset Secret**).
5. Supabase → **Authentication → Sign In / Providers → Discord**: enciéndelo, pega los dos y **Save**.

## 7. Facebook (cuando quieras, más adelante)

Requiere en [developers.facebook.com](https://developers.facebook.com): crear una app tipo **Consumidor** con el caso de uso "Autenticar y solicitar datos a los usuarios con el inicio de sesión con Facebook", poner la URL de la política de privacidad y de **eliminación de datos** (`…/eliminar-cuenta.html`), agregar la dirección de regreso de Supabase en **Inicio de sesión con Facebook → Configuración → URI de redireccionamiento de OAuth válidos**, pedir el permiso `email`, verificar el negocio y pasar la app a **Modo en vivo**. Después: Supabase → Providers → Facebook (App ID y App Secret) y `facebook: true` en `js/config.js`.

## 8. Encender los botones en la app

1. En `js/config.js`, en `accounts.oauth`, cambia a `true` **solo** los que ya configuraste:

   ```js
   oauth: Object.freeze({
     google: true,
     azure: true, // Microsoft
     discord: true,
     facebook: false,
   }),
   ```
2. **Logos:** pon el logo oficial de cada marca en `assets/oauth/` (`google.svg`, `azure.svg`, `discord.svg`). De dónde descargarlos: `assets/oauth/LEEME.md`. Sin logo, el botón funciona igual (solo con el texto).
3. Vuelve a pegar tus claves (Turnstile y `goog_…`), `git push` (la web) y `npm run android:actualizar` para la app de Android. **Este paso es importante en Android:** agrega al `AndroidManifest.xml` el enlace `com.startupprometeus.frostpom://login-callback` (la línea **[OK]** debe terminar con **"Regreso de Google/Microsoft/Discord: listo."**). Sin él, Google no puede volver a la app.

## 9. Cómo probarlo

1. **En la web** (o con `npx serve` en tu computador, agregando `http://localhost:3000/**` a las Redirect URLs mientras pruebas):
   - Crear cuenta con Google → debe pedir tu mes y año, ir a Google, volver con "Termina de crear tu cuenta" y el correo ya puesto.
   - Cerrar sesión (Ajustes → Tu cuenta) y "Inicia sesión" → "Continuar con Google" → debe traer tu progreso.
2. **En la app de Android** (Prueba interna): lo mismo. Debe abrirse una pestaña del navegador del teléfono y **volver sola** a FrostPom.
3. Con una cuenta que ya existía con correo y contraseña: "Continuar con Google" con ese mismo Gmail → debe entrar a la misma cuenta (mismo progreso y mismo nombre).
4. Si algo falla, la ventana dice qué pasó ("No diste permiso…", "Sin conexión…", "No pudimos entrar con esa cuenta…"). Errores comunes:

   | Qué sale | Qué revisar |
   | --- | --- |
   | Google dice `redirect_uri_mismatch` | La URI de redireccionamiento del cliente de Google debe ser exactamente `https://tcxdmziakgppabwyrydd.supabase.co/auth/v1/callback`. |
   | Vuelve a la web principal en vez de a la app | Falta `com.startupprometeus.frostpom://login-callback` en Supabase → Redirect URLs, o no corriste `npm run android:actualizar`. |
   | "Unsupported provider: provider is not enabled" | Ese proveedor no está encendido en Supabase. |
   | Microsoft: "Error getting user email from external provider" | El registro no es para cuentas personales, o falta el permiso `email`. |
   | Google: "Esta app no está verificada" / "Acceso bloqueado" | La app de Google está "En prueba" y ese correo no es usuario de prueba: agrégalo o publica la app (paso 4.2). |

## 10. Google Play y la política de privacidad

- **Política de privacidad:** ya explica entrar con otras cuentas (sección 4, "Entrar con Google, Microsoft o Discord"). **Súbela con `git push` antes de publicar.**
- **Play Console → Contenido de la app → Seguridad de los datos:** **Nombre** ya está marcado (por el nombre de usuario). Ábrelo y agrégale el propósito **Administración de la cuenta**: cuando alguien entra con Google, Microsoft o Discord, Supabase guarda el nombre y la dirección de la foto de perfil que manda ese servicio junto a la cuenta (FrostPom no los usa ni los muestra, y se borran con la cuenta). Tabla completa: `docs/google-play/FICHA.md`.
- **Acceso a la app** (para la revisión de Google): sigue igual, con la cuenta de prueba de correo y contraseña.

## 11. Archivos

- `js/oauth.js`: la lógica (PKCE, direcciones, el inicio de sesión en curso). Pruebas: `tests/oauth.test.js`.
- `js/ui/oauth-ui.js`: los botones, la salida y el regreso. `js/ui/cloud-ui.js` (`oauthEnter`): qué pasa después de entrar.
- `js/native.js` (`authInBrowser`): la pestaña del navegador en Android.
- `tools/app-android.mjs`: agrega el enlace de regreso al `AndroidManifest.xml`.
- Prueba de punta a punta: `tests/e2e_v490.py`.

## Fuentes

- [Supabase: Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Sign in with Azure (Microsoft)](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase: Sign in with Discord](https://supabase.com/docs/guides/auth/social-login/auth-discord)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Microsoft Q&A: desde junio de 2024 las apps nuevas se registran dentro de un directorio](https://learn.microsoft.com/en-us/answers/questions/1663127/question-regarding-notification-about-being-requir)
