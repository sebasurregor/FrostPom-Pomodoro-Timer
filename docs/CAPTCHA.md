# CAPTCHA con Cloudflare Turnstile (v4.0.3)

El CAPTCHA frena a los programas que intentan crear cuentas en masa, adivinar contraseñas o pedir miles de correos de recuperación (lo que podría llenar la base de datos o gastar el límite diario de Brevo). Desde la v4.0.3 la app ya sabe usarlo; solo falta encenderlo.

- **Para la persona casi no cambia nada:** casi siempre es invisible. Solo si Cloudflare duda aparece una casilla dentro de la ventana, encima de los botones.
- **Cuándo se usa:** al crear una cuenta en línea, entrar con correo y contraseña, pedir el código de recuperación y unirse al ranking con una cuenta anónima. Renovar la sesión y comprobar el código del correo no lo piden.
- **Los menores de 13 nunca lo ven:** su cuenta no sale del dispositivo, así que la app no carga nada de Cloudflare.
- **Es gratis** para el uso normal de una app como FrostPom.

> **El orden importa.** Primero la clave del sitio en la app y publicar (paso 3); **después** encenderlo en Supabase (paso 4). Si lo enciendes en Supabase antes, nadie podrá crear cuentas ni entrar hasta que publiques.

> **Antes de empezar:** haz una copia de seguridad (`COPIA-DE-SEGURIDAD.md`).

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅).

---

## Paso 1. Crear el widget en Cloudflare

1. Entra a **dash.cloudflare.com** (si no tienes cuenta, créala gratis; no necesitas un dominio propio).
2. En el menú, abre **Turnstile** → **Add widget**.
3. Llena así:

| Campo | Qué poner |
|---|---|
| Widget name | `FrostPom` |
| Hostname management | **solo** `sebasurregor.github.io` (si algún día usas un dominio propio, agrégalo también). **No** agregues `localhost`: Cloudflare recomienda no permitirlo en la llave real, y para probar en tu computador está el paso 2 |
| Widget mode | **Managed** (Cloudflare decide si hace falta la casilla) |
| Pre-clearance | **No** |

4. Pulsa **Create**. Aparecen dos claves:
   - **Site key** (empieza por `0x…`): es **pública**, va en la app.
   - **Secret key**: es **privada**, va **solo** en Supabase. No la pongas en el código, en GitHub ni la mandes por chat.

✅ **Quedó bien si** en la lista de Turnstile aparece "FrostPom" con tu hostname.

> La app de la Microsoft Store abre la misma dirección (`sebasurregor.github.io`), así que este hostname también la cubre.

---

## Paso 2. Probar en tu computador con la llave de prueba

Cloudflare tiene **llaves de prueba** que funcionan en cualquier dirección, incluido `localhost`, y siempre aprueban. Con ellas se comprueba que el script de Cloudflare de verdad funciona con las reglas de seguridad de la app (CSP y Trusted Types) **antes** de publicar.

1. En la carpeta donde pruebas la app, abre `js/config.js`, busca la línea `siteKey: '',` y pon la llave de prueba entre las comillas:

   ```js
       siteKey: '1x00000000000000000000AA',
   ```

2. Sirve la app (`python -m http.server 8000`) y abre `http://localhost:8000/` en una **ventana InPrivate**.
3. Pulsa **F12** antes de seguir, para que la consola registre todo.
4. Entra con tu cuenta de prueba (correo y contraseña). Si ya estabas dentro: **Cerrar sesión** y vuelve a entrar. Puede aparecer un momento una casilla de Cloudflare que se aprueba sola.
5. Revisa:
   - pestaña **Console**: sin errores rojos que digan "Content Security Policy", "Trusted Type" o "Turnstile";
   - pestaña **Network**, filtrando por `turnstile`: pedidos a `challenges.cloudflare.com` con estado **200**.

✅ **Quedó bien si** entraste a tu cuenta y la consola no muestra esos errores. (Supabase todavía no exige el CAPTCHA, así que ignora el token de prueba.)

> **La llave de prueba nunca se publica.** En el paso 3 la cambias por la real.

> **Si probaste en `localhost` con la llave real**, es normal ver en la consola un `POST https://challenges.cloudflare.com/… 400 (Bad Request)` y el aviso `[FrostPom] Cloudflare Turnstile no respondió (código 110200)` ("dominio no permitido"): `localhost` no está en el Hostname management. No pasa en la página publicada.

Si en este paso ves un error de "Content Security Policy" o "Trusted Type", **no sigas** y mándame una captura de la consola.

---

## Paso 3. Poner la clave real y publicar

1. En la carpeta de tu repositorio `FrostPom-Pomodoro-Timer`, abre `js/config.js` y en la línea `siteKey:` cambia la llave de prueba por tu **site key** real (deja las comillas y la coma):

   ```js
       siteKey: '0x4AAAAAAA…',
   ```

   Si copias el contenido de un zip encima del repositorio, hazlo **antes** de este paso: el `js/config.js` del zip trae la llave vacía.

2. Sube el cambio con tu cuenta. Si es la primera vez que publicas la v4.0.3, usa el mensaje de `DESPLIEGUE.md` (paso 2):

   ```
   git add -A
   git commit -m "v4.0.3: CAPTCHA listo (Turnstile), sonidos grabados (y Lluvia y pájaros), cuentas en línea, cerrar sesión sin borrar la cuenta y ajustes del ranking más simples"
   git push
   ```

   Si la v4.0.3 ya estaba publicada y solo cambias la llave:

   ```
   git add js/config.js
   git commit -m "Activa la clave del CAPTCHA (Turnstile)"
   git push
   ```

3. Espera unos minutos (GitHub Pages tarda en actualizar) y abre la app publicada en una **ventana InPrivate**: https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/
4. Al final de **Ajustes** debe decir **versión 4.0.3**.
5. Pulsa **F12**, entra con tu cuenta de prueba y revisa **Console** y **Network** igual que en el paso 2.

✅ **Quedó bien si** entraste, la consola no tiene errores de Turnstile y en Network aparecen pedidos a `challenges.cloudflare.com` con estado 200. (Supabase todavía no exige el CAPTCHA, así que nada se rompe aunque algo falle.)

Si la consola muestra un error de Turnstile en este paso, **no hagas el paso 4** y mándame una captura del error.

---

## Paso 4. Encenderlo en Supabase

1. Supabase → tu proyecto → **Authentication** → **Attack Protection** (en algunas versiones del panel se llama **Bot and Abuse Protection**).
2. Enciende **Enable CAPTCHA protection**.
3. En la lista de proveedores elige **Turnstile** (de Cloudflare).
4. En el campo de la clave secreta pega la **secret key** del paso 1.
5. Pulsa **Save**.

✅ **Quedó bien si**, al recargar la página, el CAPTCHA sigue encendido con Turnstile.

---

## Paso 5. Probar en la app publicada (ventana InPrivate)

- [ ] **Cerrar sesión** y volver a entrar con correo y contraseña.
- [ ] **¿Olvidaste la contraseña?**: el código llega al correo y se puede poner una contraseña nueva.
- [ ] Crear una cuenta en línea nueva (13+), si quieres probarlo también.
- [ ] Crear una cuenta de menor de 13: funciona sin internet y sin Cloudflare.

✅ **Quedó bien si** todo funciona igual que antes.

**Si algo falla:** apaga **Enable CAPTCHA protection** en Supabase (un clic, efecto inmediato) y avísame con una captura. Nadie se queda por fuera más de lo que tardes en apagarlo.

---

## Si algo falla

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| "No pudimos comprobar que eres una persona" | Turnstile no respondió: sin internet, un bloqueador de anuncios, o el sitio no está en el **Hostname management** del widget | Revisa el hostname del paso 1. Prueba sin bloqueadores. Si pasa con todo el mundo, apaga el CAPTCHA en Supabase |
| `código 110200` en la consola (y un `400 (Bad Request)` de `challenges.cloudflare.com`) | La dirección no está en el Hostname management (por ejemplo, `localhost` con la llave real) | En la página publicada no debe salir. En tu computador, usa la llave de prueba (paso 2) |
| Otro `código …` en la consola | Cloudflare no pudo hacer la comprobación (bloqueador, red, navegador) | Busca el código en la lista de Cloudflare (Fuentes) o mándame la captura |
| Nadie puede crear cuentas justo después del paso 4 | La app publicada todavía no tenía la site key, o el navegador usa una versión vieja | Revisa el paso 3. La versión nueva llega sola en unos minutos (la versión es 4.0.3 en Ajustes) |
| Todos ven "No pudimos comprobar…" justo después del paso 4, pero la consola no muestra errores | La secret key quedó mal copiada en Supabase, o quedó publicada la llave de prueba | Vuelve a copiar la secret key en Supabase, y revisa que `js/config.js` publicado tenga tu site key `0x…` y no la `1x…` de prueba |

---

## Cómo funciona por dentro

- `js/captcha.js` carga el script de Turnstile **solo cuando hace falta**, y solo desde `https://challenges.cloudflare.com` (lo permite la CSP de `index.html`, con su propia regla de Trusted Types, `st-captcha`).
- `js/cloud.js` pide un token **nuevo** antes de cada llamada protegida (`/signup`, `/token?grant_type=password`, `/recover`) y lo envía a Supabase en `gotrue_meta_security.captcha_token`. Supabase se lo pregunta a Cloudflare con la secret key.
- Si Cloudflare no responde, la app intenta igual: con el CAPTCHA apagado en Supabase funciona, y con el CAPTCHA encendido Supabase lo rechaza y la app lo explica.
- La casilla aparece dentro de la ventana abierta porque lo que queda fuera de una ventana no se puede tocar.
- Si Turnstile falla, la consola muestra un aviso amarillo con el código de Cloudflare: `[FrostPom] Cloudflare Turnstile no respondió (código …)`. La app le pide a Turnstile **no reintentar solo** (`retry: 'never'`): antes, a los 8 s intentaba reiniciar una casilla ya quitada y dejaba el error rojo "Nothing to reset found for provided container".
- Pruebas: `python tests/e2e_captcha.py http://localhost:8000/` (24 comprobaciones con Supabase y Turnstile simulados; el Turnstile simulado reintenta como el real).

## Fuentes

- Supabase, activar el CAPTCHA: https://supabase.com/docs/guides/auth/auth-captcha
- Cloudflare, crear el widget en el panel: https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/
- Cloudflare, llaves de prueba y `localhost`: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- Cloudflare, lista de códigos de error: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
- Cloudflare, Turnstile y la política de seguridad de contenido: https://developers.cloudflare.com/turnstile/reference/content-security-policy/
