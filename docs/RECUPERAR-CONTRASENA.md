# Recuperar la contraseña con el correo (v3.7)

Desde la v3.7, FrostPom ya trae programado "¿Olvidaste la contraseña?" y está conectado a tu proyecto de Supabase (`tcxdmziakgppabwyrydd`). Para que los correos lleguen de verdad faltan **unos ajustes en el panel de Supabase**, y eso solo lo puedes hacer tú. Esta guía explica cómo funciona y qué tocar.

---

## 1. Cómo funciona

> **Desde la v4.0** esto describe las cuentas **solo de este dispositivo** (menores de 13 y cuentas de antes sin conectar). En las **cuentas en línea** (13+) el correo es el de la cuenta, Supabase sí guarda la contraseña (cifrada) y "¿Olvidaste la contraseña?" cambia la contraseña también en línea. Ver `CUENTAS-EN-LINEA.md`.

1. Al crear la cuenta (o después, en **Ajustes → Tu cuenta**), la persona puede escribir un **correo opcional**.
2. La app crea un usuario en Supabase con ese correo y una **contraseña aleatoria**. La contraseña de FrostPom **nunca sale del dispositivo**: en Supabase solo queda el correo.
3. Si alguien olvida la contraseña, toca **¿Olvidaste la contraseña?** y escribe su correo. La app comprueba que sea el mismo correo de la cuenta y le pide a Supabase que envíe un **código** (`/auth/v1/recover`).
4. La persona escribe el código y su contraseña nueva. La app comprueba el código con Supabase (`/auth/v1/verify`). Si es correcto, quedó demostrado que el correo es suyo, y la app guarda la contraseña nueva **en el dispositivo**.

¿Por qué un **código** y no un enlace? Porque la app de Microsoft Store guarda los datos aparte del navegador. Un enlace abriría el navegador, que no ve la cuenta guardada en la app. Con el código, todo pasa dentro de FrostPom.

La conexión está en `js/cloud.js` (sin librerías, con `fetch`) y la configuración en `js/config.js` → `cloud`. La **clave publicable** (`sb_publishable_…`) puede ir en el código: está hecha para eso. La **clave secreta** (`sb_secret_…` o `service_role`) **nunca** va en la app.

## 2. Lo que tienes que configurar en Supabase

Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto.

### Paso 1. Que el correo de recuperación traiga el código

**Authentication → Emails → Templates → Reset Password** (o "Recuperar contraseña"). La plantilla de fábrica trae un enlace, pero la app necesita el **código**: la variable `{{ .Token }}`. Cambia el asunto y el contenido por esto:

- **Asunto:** `Tu código de FrostPom / Your FrostPom code`
- **Contenido:**

```html
<h2>FrostPom</h2>
<p>Tu código para cambiar la contraseña es:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Escríbelo en la app. Si no lo pediste, ignora este correo.</p>
<hr>
<p>Your code to change your password is <b>{{ .Token }}</b>. Type it in the app. If you didn't ask for it, ignore this email.</p>
```

Guarda con **Save**.

### Paso 2. No pedir confirmación al registrarse

**Authentication → Sign In / Providers → Email**: deja **Enable Email provider** encendido y **apaga "Confirm email"**.

¿Por qué? Si queda encendido, cada cuenta nueva con correo gasta un envío en un correo de "confirma tu dirección" que la app no usa. La prueba de que el correo es tuyo ya la da el código de recuperación. En esa misma página, revisa que **"Allow new users to sign up"** esté encendido (en algunos paneles está en *Authentication → Sign In / Providers → User Signups*).

### Paso 3. Correo propio (SMTP): obligatorio para usuarios reales

El servicio de correo que trae Supabase es **solo para pruebas**:

- solo envía a los correos de **los miembros de tu equipo** en Supabase (a cualquier otro devuelve `email_address_not_authorized`);
- y tiene un límite muy bajo de correos por hora.

Por eso **puedes probar ya con tu propio correo** (el de tu cuenta de Supabase), pero para tus usuarios necesitas un SMTP propio:

1. Crea una cuenta en un servicio de correo transaccional con plan gratuito (por ejemplo **Resend**, **Brevo** o **SendGrid**).
2. Verifica un dominio o remitente, según te pida el servicio.
3. En Supabase: **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP** y pega host, puerto, usuario y contraseña que te dé el servicio. Remitente sugerido: `FrostPom <no-reply@tu-dominio>`.
4. Después, en **Authentication → Rate Limits**, sube el límite de correos por hora a algo razonable (por ejemplo 30).

### Paso 4. Revisar la duración del código

**Authentication → Sign In / Providers → Email**: *Email OTP Expiration* (cuánto dura el código) y *Email OTP Length* (cuántos dígitos). La app acepta códigos de 6 a 10 dígitos. Una hora o menos de duración está bien.

## 3. Cómo probarlo

1. Sirve la app: `python -m http.server 8000` y abre `http://localhost:8000/`.
2. Crea una cuenta con **tu correo** (el de tu equipo en Supabase, mientras no tengas SMTP propio).
3. En Supabase → **Authentication → Users** debe aparecer tu correo.
4. Cierra sesión (Ajustes → Cerrar sesión), toca **¿Olvidaste la contraseña?**, escribe tu correo y pide el código.
5. Escribe el código que llegó y una contraseña nueva. Debe decir "¡Listo! Tu contraseña nueva ya funciona."

Sin internet ni Supabase también hay una prueba automática que simula el servidor:

```
python tests/e2e_recuperar.py http://localhost:8000/
```

## 4. Mensajes de error que puedes ver

| Lo que dice la app | Qué pasa | Qué hacer |
|---|---|---|
| "Todavía no podemos enviar correos a esa dirección…" | Sin SMTP propio, Supabase solo envía al equipo | Paso 3 |
| "Se pidieron demasiados códigos…" | Límite de correos por hora o el minuto de espera | Esperar, o subir el límite (Paso 3.4) |
| "El código no es correcto o ya venció…" | Código equivocado o vencido | Pedir uno nuevo |
| "No pudimos conectar tu correo ahora…" | Sin internet al crear la cuenta | Agregarlo después en Ajustes |

## 5. Privacidad (ya actualizada)

`privacidad.html` ahora explica que el correo es opcional, que se guarda en Supabase solo para los códigos y cómo pedir que se borre. Si eres menor de edad, el texto pide agregarlo con permiso de un adulto. Revísalo antes de publicar y vuelve a responder el cuestionario de edad de Microsoft Store si te lo pide.

Para **borrar el correo de alguien** que lo pida: Supabase → Authentication → Users → busca el correo → **Delete user**.

---

Fuentes:
- [Supabase: correos con SMTP propio y límites del servicio de prueba](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: códigos de un solo uso con `{{ .Token }}`](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Auth: endpoints `/recover` y `/verify`](https://github.com/supabase/auth)
