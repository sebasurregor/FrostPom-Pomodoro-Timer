# Próximos pasos de FrostPom

Lista en orden. Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien**. Cuando termines uno, sigue con el siguiente.

Estado actual: **v4.0 lista en tu computador** (cuentas en línea: `docs/CUENTAS-EN-LINEA.md`). 👉 **La guía completa y actualizada para publicar es `docs/DESPLIEGUE.md`** (de tu PC a Microsoft Store, con Supabase y Brevo). Este archivo queda como referencia (incluye el paso 0 de la tarjeta de la cuenta de trabajo). El cobro de Premium está en `docs/COBRO-PREMIUM.md`.

---

## Paso 0. Quitar la tarjeta de la cuenta de trabajo (seguridad)

Al crear la cuenta de trabajo, Microsoft guardó tu tarjeta aunque no cobró nada. Para borrarla:

1. Entra a **[admin.microsoft.com](https://admin.microsoft.com)** con esa cuenta de trabajo (la que termina en `.onmicrosoft.com`).
2. Ve a **Facturación → Facturas y pagos → Métodos de pago**.
3. Elige la tarjeta, abre el menú **…** y pulsa **Eliminar**.

Puede que no te deje eliminarla, por dos motivos:

- **La tarjeta está asociada a una suscripción**, por ejemplo una prueba gratis. Ve a **Facturación → Tus productos**, cancela la suscripción y vuelve a intentarlo.
- **Es el único método de pago.** En ese caso la salida es **eliminar la cuenta de trabajo completa** (el "inquilino" de Microsoft Entra):
  1. Entra a [entra.microsoft.com](https://entra.microsoft.com) → **Microsoft Entra ID → Información general → Administrar inquilinos**.
  2. Elige el inquilino y pulsa **Eliminar**.
  3. Para eso tienes que ser administrador global. Antes hay que quitar los usuarios (menos el tuyo), las apps y las suscripciones. Las suscripciones canceladas tardan unos días en desaparecer.

Si aun así no se puede, pide ayuda a soporte desde el mismo centro de administración (**Ayuda y soporte técnico**) y diles que quieres borrar el método de pago y cerrar la cuenta.

✅ **Quedó bien si** en Métodos de pago ya no aparece la tarjeta, o si la cuenta de trabajo ya no existe.

> No uses esa cuenta de trabajo para publicar. Para la tienda vas a usar una cuenta personal (paso 4).

---

## Paso 1. Subir la v3.8 a tu repositorio de GitHub

Tú haces el commit con tu cuenta. Así el único autor del repositorio eres tú.

1. Descomprime `frostpom-v3.8.zip`.
2. Abre la carpeta donde tienes clonado `FrostPom-Pomodoro-Timer`. Copia **el contenido** de la carpeta descomprimida encima y acepta reemplazar los archivos. **No borres la carpeta oculta `.git`.**
3. Borra el archivo viejo **`README.txt`**: son instrucciones de la v1 y ya las reemplaza `README.md`.
4. Antes de subir, prueba en tu PC:

   ```
   python -m http.server 8000
   ```

   Abre `http://localhost:8000/`. Si ya tenías la app abierta, recarga con **Ctrl + Shift + R**.
5. Sube los cambios con GitHub Desktop, o desde la terminal:

   ```
   git add -A
   git commit -m "v3.8: modo oscuro, fogata animada, pingüino incluido, globo animado y cobro de Premium listo"
   git push
   ```

✅ **Quedó bien si** en github.com/sebasurregor/FrostPom-Pomodoro-Timer ves `docs/PROXIMOS-PASOS.md` y ya no está `README.txt`.

---

## Paso 2. Activar GitHub Pages

1. En el repositorio, ve a **Settings → Pages**.
2. En **Build and deployment**, elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`, y pulsa **Save**.
3. Espera 1 o 2 minutos y abre **https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/**. Escríbela con las mayúsculas tal cual.

✅ **Quedó bien si** la app abre, en Microsoft Edge aparece el ícono de **Instalar** en la barra de direcciones y `…/privacidad.html` también abre.

---

## Paso 3. Probar la versión publicada

1. Instálala desde Edge y crea una cuenta de prueba.
2. Revisa:
   - el paso de la foto (y también "Ahora no");
   - el temporizador;
   - arrastrar comida;
   - Premium con su regalo;
   - el ranking ("llega pronto").
3. Desconecta el internet y vuelve a abrir la app: debe funcionar igual.
4. Opcional, si tienes Python con Playwright:

   ```
   python tests/store_check.py https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/
   ```

   Debe terminar con "Lista para la tienda."

---

## Paso 4. Cuenta de desarrollador (personal)

1. Entra por **[storedeveloper.microsoft.com](https://storedeveloper.microsoft.com)** con una **cuenta Microsoft personal**: Outlook o Hotmail, o una cuenta Microsoft creada con tu Gmail. No uses la cuenta de trabajo.
2. Elige el tipo **Individual** y tu país. El país no se puede cambiar después.
3. Escribe el **Publisher display name**, por ejemplo `Prometeus` o tu nombre. Es lo que verán los usuarios como desarrollador.
4. Completa la verificación con tu documento de identidad y una selfie.

✅ **Quedó bien si** en Partner Center ves **Apps and games** y puedes crear un producto nuevo. Este registro no debería pedir tarjeta. Si te la pide, estás en el registro antiguo: vuelve a entrar por el enlace de arriba.

---

## Paso 5. Reservar el nombre

1. Ve a **Apps and games → New product → MSIX or PWA app**.
2. Escribe **FrostPom** y pulsa **Check availability**.
   - Si está libre, pulsa **Reserve product name**.
   - Si está ocupado, prueba **FrostPom: Pomodoro Timer** o **FrostPom Pomodoro**.
3. La reserva dura 3 meses.

---

## Paso 6. Copiar la identidad del paquete

En tu app: **Product management → Product identity**. Copia y guarda estos tres datos:

- **Package ID**
- **Publisher ID**
- **Publisher display name**

---

## Paso 7. Crear el paquete con PWABuilder

1. Ve a **[pwabuilder.com](https://www.pwabuilder.com)**, pega `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/` y pulsa **Start**.
2. Pulsa **Package For Stores → Windows → Generate Package**.
3. Pega los tres datos del paso 6.
   - **App name:** el nombre que reservaste.
   - **Version:** `1.0.0`.
4. Descarga el `.zip`. Trae un `.msixbundle`, un `.classic.appxbundle` y un paquete de prueba.
5. Instala el paquete de prueba en tu Windows siguiendo sus instrucciones y revisa que todo funcione.

---

## Paso 8. Enviar a certificación

En Partner Center pulsa **Start your submission**. Todos los textos están en `docs/microsoft-store/FICHA.md`.

1. **Pricing and availability:** gratis.
2. **Properties:**
   - categoría **Educación**;
   - política de privacidad: `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/privacidad.html`;
   - soporte: `startupprometeus@gmail.com`.
3. **Age ratings:** responde el cuestionario con las respuestas de la ficha.
4. **Packages:** sube el `.msixbundle` y el `.classic.appxbundle`.
5. **Store listings (Español):**
   - descripción, características y palabras clave;
   - las capturas de `docs/microsoft-store/capturas-es/`;
   - el `docs/microsoft-store/logo-300.png`.
6. **Submission options:** pega las notas para certificación.
7. Pulsa **Submit for certification**.

✅ **Quedó bien si** el estado cambia a **In certification**. Tarda hasta 3 días hábiles. Si te rechazan algo, Microsoft dice exactamente qué arreglar: tráelo y lo corregimos.

---

## Publicar una versión nueva (por ejemplo, la v3.7)

FrostPom en la tienda es una PWA: el paquete de PWABuilder abre tu página de GitHub Pages. Por eso **el código nuevo les llega solo a los usuarios** en cuanto lo subes a GitHub; no hace falta un paquete nuevo para la v3.7.

1. Configura Supabase (`docs/RECUPERAR-CONTRASENA.md`, pasos 1 a 3) y sube la v3.7 a GitHub (paso 1) y espera uno o dos minutos a que Pages se actualice.
2. Comprueba la versión publicada:

   ```
   python tests/store_check.py https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/
   ```

   Debe terminar en "Lista para la tienda".
3. Abre FrostPom instalado desde la tienda, ciérralo y vuelve a abrirlo. El service worker (`frostpom-3.7.0`) descarga lo nuevo; al final de Ajustes debe decir **versión 3.7.0** (o **version 3.7.0** si tu Windows está en inglés).
4. **Ficha de la tienda** en [Partner Center](https://partner.microsoft.com/dashboard) → tu app → **Actualizar**:
   - *Store listings* → **Español**: cambia las capturas por las nuevas (`assets/screenshots/`, conviértelas a PNG si la página no acepta WebP) y pega la descripción de `docs/microsoft-store/FICHA.md` (ahora dice que hay inglés y que el correo es opcional).
   - **Manage additional languages** → agrega **English (United States)** y copia la sección *English listing* de `FICHA.md` con las capturas de `docs/microsoft-store/capturas-en/`. Microsoft permite fichas en idiomas extra sin paquete nuevo.
   - *Age ratings*: vuelve a responder el cuestionario y declara que la app pide un **correo opcional**.
   - Revisa que la URL de privacidad siga siendo `…/privacidad.html` (ya tiene la versión en inglés).
   - Guarda y pulsa **Submit to the Store**.
5. Si algún día cambias el `manifest.webmanifest` (nombre, ícono, atajos), ahí sí: paquete nuevo en PWABuilder con número mayor (`1.0.1`, `1.0.2`…) y se sube en la misma actualización.

✅ **Quedó bien si** la app de la tienda muestra las tarjetas claras, Ajustes tiene **Idioma · Language**, y Partner Center dice **In certification** (o **In the Store** si solo subiste el código).

---

## Después de publicar (siguientes versiones)

| Qué quieres cambiar | Qué hay que hacer |
|---|---|
| Arreglos y funciones (HTML, CSS, JavaScript) | Subir a GitHub y aumentar `VERSION` en `service-worker.js`. Les llega solo a los usuarios. |
| Nombre, íconos o atajos (`manifest.webmanifest`) | Paquete nuevo en PWABuilder con versión mayor (`1.0.1`…) y enviarlo otra vez. |
| Cobrar Premium | Conectar el pago y después `premium.chargesEnabled: true`. Rehacer el cuestionario de edad: las 1000 gemas de regalo cuentan como moneda virtual. |
| Recuperar contraseña por correo | Seguir `docs/RECUPERAR-CONTRASENA.md` (Supabase Auth + SMTP propio), actualizar `privacidad.html` y la ficha. |
| Ranking global | Montar el servidor (`server/supabase/`), luego `leaderboard.mode: 'remote'`, actualizar `privacidad.html` y rehacer el cuestionario de edad. |
