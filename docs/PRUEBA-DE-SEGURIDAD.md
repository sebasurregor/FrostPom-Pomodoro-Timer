# Prueba de seguridad: lo que preparas tú antes de enviar el paquete

Esta guía es **para ti** (el dueño), no para quien prueba. Explica qué crear, qué llenar y qué enviar para que otra persona intente romper FrostPom **sin tocar la app real ni a sus usuarios**.

**Qué recibe quien prueba:**

1. `frostpom-kit-prueba-seguridad.zip`: el código de la v4.0.3 sin los datos del proyecto real, el programa `preparar_copia.py` y un `LEEME.md` con sus instrucciones.
2. El documento **"FrostPom: alcance de la prueba de seguridad"**, llenado y firmado (paso 5).
3. Solo si haces el paso 4: la *site key* del CAPTCHA de pruebas.

**Qué NUNCA se envía:** la llave secreta de Supabase (`sb_secret_…` o `service_role`), la contraseña de la base de datos, la clave SMTP de Brevo, la *secret key* de Turnstile, las copias de seguridad (`.dump`) ni acceso a tus paneles (Supabase, Brevo, Cloudflare, GitHub). Descubrir cómo hacer lo que esas claves permiten es justamente parte de la prueba.

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅).

---

## Paso 1. Copia de seguridad del proyecto real

La prueba no toca el proyecto real, pero si pasaron varios días desde la última copia, haz otra antes de empezar (`COPIA-DE-SEGURIDAD.md`).

✅ **Quedó bien si** tienes los dos archivos `.dump` de la fecha, guardados fuera del proyecto.

---

## Paso 2. Crear el proyecto de pruebas en Supabase

El plan gratis permite **dos proyectos activos**, así que puedes tener el real y el de pruebas al mismo tiempo.

1. En **supabase.com → New project**:
   - **Name:** `frostpom-pruebas`
   - **Database password:** una **nueva** (no la del proyecto real). Guárdala en un lugar privado; no la compartas.
   - **Region:** cualquiera (por ejemplo, la misma del real).
2. Cuando termine de crearse, ve a **SQL Editor → New query**. Pega **todo** `server/supabase/schema.sql` y pulsa **Run**.

   ✅ Debe decir **Success**.
3. En **Authentication → Sign In / Providers**, déjalo igual que el real:
   - **Allow anonymous sign-ins:** encendido.
   - **Email:** encendido, con **Confirm email** apagado.
4. En **Project Settings → API Keys** (o **Data API**), copia dos cosas:
   - la **Project URL** (`https://xxxxxxxxxxxxxxxxxxxx.supabase.co`);
   - la **Publishable key** (`sb_publishable_…`).

   Estas dos **sí** van en el documento: son públicas a propósito. La *secret key* de esa misma página **no**.

✅ **Quedó bien si** tienes un proyecto `frostpom-pruebas` con el SQL corrido, y anotaste su dirección y su llave publicable.

---

## Paso 3. Correos de recuperación en la copia (elige una opción)

**Opción A, recomendada: con correos.** Así quien prueba puede intentar adivinar o reutilizar códigos de recuperación.

1. En Brevo, ve a **SMTP & API → SMTP → Generate a new SMTP key**, con el nombre `frostpom-pruebas`. Es una clave **aparte** de la que usa la app real, para borrarla al final sin afectar nada.
2. En el proyecto **de pruebas**, ve a **Authentication → Emails → SMTP Settings → Enable Custom SMTP** y pon los mismos datos que en el proyecto real (host `smtp-relay.brevo.com`, puerto `587`, tu usuario de Brevo y el remitente `startupprometeus@gmail.com`), pero con la **clave nueva** como contraseña.
3. En **Authentication → Emails → Templates → Reset Password**, pon la misma plantilla con `{{ .Token }}` de `RECUPERAR-CONTRASENA.md`.
4. En el documento: "Correos de recuperación: **encendidos**", con un máximo de **10** (sección 6). El límite diario de Brevo es el mismo que usa la app real; por eso el máximo es bajo.

**Opción B: sin correos.** No configures SMTP. El correo de fábrica de Supabase solo envía a los miembros de tu equipo en Supabase (y 2 por hora), así que a quien prueba no le llegarían los códigos. En el documento: "Correos de recuperación: **apagados** (no se prueba la recuperación por correo)".

✅ **Quedó bien si**, con la opción A, al pedir "¿Olvidaste la contraseña?" en la copia, el código llega a tu correo.

---

## Paso 4 (opcional). CAPTCHA en la copia

Solo si quieres que intenten saltarse el CAPTCHA. Sin este paso, la copia funciona sin CAPTCHA.

1. En Cloudflare, ve a **Turnstile → Add widget**:
   - **Widget name:** `FrostPom pruebas`
   - **Hostname:** `localhost`. Es un widget aparte, solo para la copia; el real sigue sin `localhost`.
   - **Mode:** Managed. **Pre-clearance:** No.
2. Pega la **secret key** de ese widget en el proyecto **de pruebas**: **Authentication → Attack Protection → Enable CAPTCHA protection → Turnstile → Save**.
3. Mándale a quien prueba la **site key** (`0x…`) de ese widget. Es pública; él la pasa como tercer valor a `preparar_copia.py`.

✅ **Quedó bien si** el widget `FrostPom pruebas` aparece en Turnstile y el proyecto de pruebas tiene el CAPTCHA encendido.

---

## Paso 5. Terminar y firmar el documento de alcance

Usa tu documento **`FrostPom-alcance-prueba-seguridad.docx`** (Word). Ya tiene tu nombre y el de quien prueba, las fechas, tu firma, la app de pruebas, el código fuente y el máximo de 10 correos. Faltan los tres espacios **resaltados en amarillo** de la sección 3:

| Espacio | Qué poner |
|---|---|
| Proyecto de Supabase de pruebas | La Project URL del paso 2 |
| Llave publicable | La `sb_publishable_…` del paso 2 |
| Correos de recuperación | "Encendidos (máximo 10)" o "Apagados", según el paso 3 |

Cuando los llenes, quita el resaltado amarillo, pídele a quien prueba que firme y guárdalo como **PDF**.

> **Las fechas:** el documento dice del 9/11/2026 al 9/11/2026, o sea, un solo día. Si la prueba va a durar más, cambia la fecha de fin antes de firmar.

✅ **Quedó bien si** el PDF no tiene ningún `[…]` sin llenar y tiene las dos firmas.

---

## Paso 6. Enviar

Por correo, a quien prueba:

- [ ] `frostpom-kit-prueba-seguridad.zip`
- [ ] El documento de alcance firmado (PDF)
- [ ] Si hiciste el paso 4: la *site key* `0x…` del widget de pruebas

Antes de enviar, revisa que **no** vaya nada de la lista "Qué NUNCA se envía" del comienzo.

---

## Paso 7. Al terminar la prueba

1. Recibe el informe. Si hay hallazgos, mándamelo y los arreglamos en orden de gravedad.
2. Borra lo que se creó solo para la prueba:
   - el proyecto `frostpom-pruebas` en Supabase (**Project Settings → General → Delete project**);
   - la clave SMTP `frostpom-pruebas` en Brevo, si hiciste la opción A;
   - el widget `FrostPom pruebas` en Cloudflare, si hiciste el paso 4.

✅ **Quedó bien si** en Supabase, Brevo y Cloudflare solo queda lo de la app real.

---

## Fuentes

- Supabase, proyectos activos del plan gratis: https://supabase.com/docs/guides/platform/billing-faq
- Supabase, límites del correo de fábrica: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase, reglas para hacer pruebas de seguridad en tu propio proyecto: https://supabase.com/docs/guides/security/security-testing
