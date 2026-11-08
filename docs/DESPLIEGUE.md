# Despliegue de FrostPom, de principio a fin (v3.9)

Esta guía junta **todo lo que hemos hecho** hasta la v3.9 y lo lleva a internet y a Microsoft Store. Está en orden: cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅). Si ya hiciste un paso antes, revisa el ✅ y sigue con el siguiente.

**Lo que vas a publicar:** temporizador con rangos, misiones y compañeros (el pingüino viene incluido); Progreso estilo racha; tarjetas claras con modo oscuro; español e inglés; entrada con el paisaje ártico y la fogata animada; recuperar la contraseña por correo (Supabase + Brevo); Premium en modo prueba (el cobro real se enciende después con `docs/COBRO-PREMIUM.md`); el ranking global listo pero apagado (se enciende después con `docs/RANKING-GLOBAL.md`).

---

## Paso 0. Lo que necesitas tener a la mano

- [ ] Tu cuenta de **GitHub** (`sebasurregor`) y el repositorio `FrostPom-Pomodoro-Timer` clonado en tu PC.
- [ ] **Git** (o GitHub Desktop) y **Python 3** instalados.
- [ ] **Microsoft Edge**.
- [ ] Tu proyecto de **Supabase** (`tcxdmziakgppabwyrydd`) y tu cuenta de **Brevo** con la clave SMTP.
- [ ] Una **cuenta Microsoft personal** (Outlook/Hotmail o una creada con tu Gmail). **No** la cuenta de trabajo `.onmicrosoft.com`.
- [ ] El zip `frostpom-v3.9.zip`.

---

## Paso 1. Probar la v3.9 en tu computador

1. Descomprime `frostpom-v3.9.zip` en una carpeta nueva.
2. Abre una terminal en esa carpeta y ejecuta:

   ```
   python -m http.server 8000
   ```

3. Abre `http://localhost:8000/` en Edge. Si ya la habías abierto antes, recarga con **Ctrl + Shift + R**.
4. Revisa rápido:
   - la pantalla de crear cuenta, con la **fogata que se mueve**;
   - **Ajustes → Apariencia → Oscura**, y luego vuelve a **Automática**;
   - **Ajustes → Idioma · Language → English**, y vuelve a Español;
   - **Perfil → Compañeros**: el Pingüino ya aparece desbloqueado;
   - **Ranking**: el globo con birrete se mueve;
   - los sonidos de concentración salen solo con su nombre.
5. Opcional (si tienes Node y Playwright): `npm test` debe decir **pass 66, fail 0**.

✅ **Quedó bien si** todo lo anterior se ve y la terminal no muestra errores en rojo.

---

## Paso 2. Subir el código a GitHub (tú haces el commit)

1. Abre la carpeta donde está clonado `FrostPom-Pomodoro-Timer`.
2. Copia **el contenido** de la carpeta de la v3.9 encima y acepta reemplazar. **No borres la carpeta oculta `.git`.**
3. Si todavía existe **`README.txt`**, bórralo (son instrucciones de la v1).
4. En la terminal, dentro de la carpeta del repositorio:

   ```
   git add -A
   git commit -m "v3.9: ranking global listo (apagado), modo oscuro, nevada y fogata en la entrada, íconos nuevos y cobro de Premium listo"
   git push
   ```

   (Con GitHub Desktop: escribe el mismo mensaje, **Commit to main** y **Push origin**.)

✅ **Quedó bien si** en github.com/sebasurregor/FrostPom-Pomodoro-Timer ves `docs/RANKING-GLOBAL.md`, `js/board.js` y `js/ui/gate-snow.js`.

---

## Paso 3. Activar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. *Build and deployment*: **Deploy from a branch**, rama **`main`**, carpeta **`/ (root)`** → **Save**.
3. Espera 1 o 2 minutos y abre **https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/** (con las mayúsculas tal cual).

✅ **Quedó bien si** la app abre, en Edge aparece el botón **Instalar** en la barra de direcciones, y `…/privacidad.html` abre (con la versión en inglés al final).

---

## Paso 4. Configurar Supabase y Brevo (recuperar contraseña)

La guía larga es `docs/RECUPERAR-CONTRASENA.md`. Resumen:

1. **Brevo → Remitentes:** agrega y verifica `startupprometeus@gmail.com` con el nombre **FrostPom**.
2. **Supabase → Authentication → Emails → SMTP Settings → Enable Custom SMTP:**

   | Campo | Valor |
   |---|---|
   | Correo del remitente | `startupprometeus@gmail.com` |
   | Nombre del remitente | `FrostPom` |
   | Host | `smtp-relay.brevo.com` |
   | Puerto | `587` |
   | Usuario | el de Brevo (`…@smtp-brevo.com`) |
   | Contraseña | la **clave SMTP completa** de Brevo |

3. **Authentication → Emails → Templates → Reset Password:** pega la plantilla que trae `{{ .Token }}` (está en la guía).
4. **Authentication → Sign In / Providers → Email:** apaga **Confirm email**.
5. **Authentication → URL Configuration → Site URL:** `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/`.
6. **Authentication → Rate Limits:** correos por hora en `30`.
7. En Brevo **no** actives el bloqueo de IP para claves SMTP.

✅ **Quedó bien si** en la página publicada creas una cuenta con un correo tuyo, cierras sesión, tocas **¿Olvidaste la contraseña?** y te llega un correo de **FrostPom** con el código.

---

## Paso 5. Probar la versión publicada

1. Instálala desde Edge (botón **Instalar**) y crea una cuenta de prueba.
2. Revisa: el temporizador, arrastrar comida, Premium en modo prueba con su regalo (ya no aparece el pingüino entre las mascotas a elegir), el modo oscuro y el inglés.
3. Desconecta el internet y vuelve a abrirla: debe funcionar igual (menos lo del correo, que necesita internet).
4. Opcional, con Python y Playwright:

   ```
   python tests/store_check.py https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/
   ```

✅ **Quedó bien si** `store_check.py` termina en **"Lista para la tienda."**

---

## Paso 6. Cuenta de desarrollador de Microsoft (personal)

1. Entra por **[storedeveloper.microsoft.com](https://storedeveloper.microsoft.com)** con tu cuenta Microsoft **personal**.
2. Tipo de cuenta: **Individual**. Elige tu país (no se puede cambiar después).
3. **Publisher display name:** por ejemplo `Prometeus` o tu nombre. Es lo que ven los usuarios.
4. Completa la verificación de identidad (documento + selfie).

✅ **Quedó bien si** en Partner Center ves **Apps and games** y puedes crear un producto. Este registro no debería pedir tarjeta; si la pide, entraste por el registro antiguo.

---

## Paso 7. Reservar el nombre y copiar la identidad

1. **Apps and games → New product → MSIX or PWA app**.
2. Escribe **FrostPom** → **Check availability** → **Reserve product name**. Si está ocupado: **FrostPom: Pomodoro Timer** o **FrostPom Pomodoro**.
3. Ve a **Product management → Product identity** y copia:
   - **Package ID** (Package/Identity/Name)
   - **Publisher ID** (Package/Identity/Publisher, empieza por `CN=`)
   - **Publisher display name**
4. En esa misma página copia también la **URL de la tienda** (la necesitarás para el cobro de Premium).

✅ **Quedó bien si** tienes los tres datos guardados en un archivo de texto.

---

## Paso 8. Crear el paquete con PWABuilder

1. Ve a **[pwabuilder.com](https://www.pwabuilder.com)**, pega `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/` y pulsa **Start**.
2. Revisa que no haya errores rojos en el informe (los avisos amarillos no impiden publicar).
3. **Package For Stores → Windows → Generate Package**.
4. Pega los datos del paso 7:
   - **Package ID**, **Publisher ID** y **Publisher display name**;
   - **App name:** el nombre que reservaste;
   - **Version:** `1.0.0` (si ya habías subido un paquete antes, usa uno mayor: `1.0.1`).
5. Descarga el `.zip`. Trae un `.msixbundle`, un `.classic.appxbundle` y un paquete de prueba.
6. Instala el paquete de prueba siguiendo el archivo de instrucciones que viene en el zip y revisa que la app abra.

✅ **Quedó bien si** la app de prueba abre en su propia ventana, sin barra de direcciones.

---

## Paso 9. Enviar a Microsoft Store

En Partner Center → tu app → **Start your submission**. Los textos están en `docs/microsoft-store/FICHA.md`.

1. **Pricing and availability:** **Free**. Mercados: todos (o los que quieras).
2. **Properties:**
   - Categoría: **Education** (secundaria: Productivity);
   - Privacy policy: `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/privacidad.html`;
   - Support: `startupprometeus@gmail.com`.
3. **Age ratings:** responde con la tabla de `FICHA.md`. Declara que la app pide un **correo opcional**. En "compras digitales" responde **No** mientras Premium siga en modo prueba.
4. **Packages:** sube el `.msixbundle` y el `.classic.appxbundle`.
5. **Store listings:**
   - **Español:** descripción, características y palabras clave de `FICHA.md`; las capturas de `docs/microsoft-store/capturas-es/`; el logo `docs/microsoft-store/logo-300.png`.
   - **Manage additional languages → English (United States):** la sección *English listing* de `FICHA.md` y las capturas de `docs/microsoft-store/capturas-en/`.
6. **Submission options:** pega las *Notas para certificación* de `FICHA.md`.
7. Pulsa **Submit for certification**.

✅ **Quedó bien si** el estado cambia a **In certification**. Tarda hasta 3 días hábiles. Si rechazan algo, Microsoft dice exactamente qué arreglar: tráemelo y lo corregimos.

---

## Paso 10. Cuando la app ya esté en la tienda

1. Instálala desde Microsoft Store en tu PC y ábrela.
2. Al final de **Ajustes** debe decir **versión 3.9.0**.
3. Guarda la URL de la tienda: va en `js/config.js` → `premium.storeUrl` cuando enciendas el cobro.

✅ **Quedó bien si** la app de la tienda abre, guarda tu progreso y muestra la versión 3.9.0.

---

## Paso 11. Cómo publicar las próximas versiones

| Qué cambiaste | Qué hacer |
|---|---|
| Código (HTML, CSS, JS, imágenes) | Sube la versión en `js/config.js` y en `service-worker.js` (`VERSION`), y haz `git push`. Les llega sola a los usuarios: **no** hace falta paquete nuevo. |
| Capturas, descripción o idiomas de la ficha | Partner Center → **Update** → *Store listings* → **Submit to the Store**. |
| `manifest.webmanifest` (nombre, ícono, atajos) | Paquete nuevo en PWABuilder con número mayor (`1.0.1`, `1.0.2`…) y súbelo en **Update** → *Packages*. |
| Encender el ranking global | Sigue `docs/RANKING-GLOBAL.md`. |
| Encender el cobro de Premium | Sigue `docs/COBRO-PREMIUM.md`. |
| Algo de privacidad (datos nuevos) | Actualiza `privacidad.html` **antes** y vuelve a responder el cuestionario de edad. |

---

## Lista final

- [ ] Paso 1: probada en tu PC
- [ ] Paso 2: subida a GitHub con tu cuenta
- [ ] Paso 3: GitHub Pages activo
- [ ] Paso 4: Supabase + Brevo configurados y correo de prueba recibido
- [ ] Paso 5: versión publicada probada (`store_check.py` en verde)
- [ ] Paso 6: cuenta personal de Partner Center verificada
- [ ] Paso 7: nombre reservado e identidad copiada
- [ ] Paso 8: paquete de PWABuilder probado
- [ ] Paso 9: enviada a certificación (ES + EN)
- [ ] Paso 10: instalada desde la tienda
- [ ] Después: ranking global (`docs/RANKING-GLOBAL.md`)
- [ ] Después: cobro de Premium (`docs/COBRO-PREMIUM.md`)
