# Publicar StudyTimer en Microsoft Store

StudyTimer es una **PWA** (aplicación web instalable). Microsoft la publica así: tú pones la app en internet con https, **PWABuilder** crea el paquete MSIX a partir de esa dirección y lo subes a **Partner Center**. No hay que reescribir nada.

> Fuentes oficiales:
> - [Get started with Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/publish/get-started?tabs=individual%2Cmsix-pwa-getting-started)
> - [Reserve your MSIX app's name](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)
> - [Publish a PWA to the Microsoft Store](https://learn.microsoft.com/microsoft-edge/progressive-web-apps-chromium/how-to/microsoft-store)

## Lo que ya está listo en el proyecto

| Requisito | Dónde está |
|---|---|
| Manifiesto completo: íconos (incluido "maskable"), capturas, atajos, categorías, una sola ventana (`launch_handler`) y panel lateral de Edge | `manifest.webmanifest` |
| Service worker con modo sin conexión (81 archivos) | `service-worker.js` |
| Funciona en una subcarpeta (como `usuario.github.io/study-timer/`) | probado con `tests/store_check.py` |
| Política de privacidad pública | `privacidad.html` (falta tu correo de soporte, sección 10) |
| Premium sin cobro mostrado como "Probar Premium gratis" (no como compra) | `js/config.js → premium.chargesEnabled: false` |
| Texto de la ficha, respuestas de clasificación por edad y notas para certificación | `docs/microsoft-store/FICHA.md` |
| Capturas en alta resolución (2732 × 1536) y logo de 300 × 300 | el zip `studytimer-kit-microsoft-store` que acompaña esta versión |

## Paso 1. Publicar la app con https (GitHub Pages, gratis)

1. Completa tu correo de soporte en `privacidad.html` (busca `[CORREO DE SOPORTE`).
2. Sube los archivos a tu repositorio `study-timer` con tu cuenta.
3. En GitHub, ve a **Settings → Pages**. En **Build and deployment**, elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`, y guarda.
4. En uno o dos minutos la app queda en `https://TU-USUARIO.github.io/study-timer/`.
5. Ábrela en Microsoft Edge: en la barra de direcciones debe aparecer el ícono de **Instalar**.
6. Opcional, pero recomendado: corre la revisión contra la dirección publicada:

   ```
   python tests/store_check.py https://TU-USUARIO.github.io/study-timer/
   ```

   Debe terminar con "Lista para la tienda."

> **Importante:** la app de la tienda carga lo que está publicado en esa dirección. Lo que subas a `main` les llega a todos los usuarios. Prueba antes de subir: corre `npm test` y `tests/e2e_smoke.py`, o usa otra rama solo para publicar.

## Paso 2. Crear tu cuenta de desarrollador

1. Entra a [Partner Center](https://partner.microsoft.com/dashboard) con una **cuenta Microsoft personal** (no del colegio ni del trabajo).
2. Elige el programa **Windows and Xbox**, tipo de cuenta **Individual** y tu país.
   - El país no se puede cambiar después.
   - Individual es para proyectos personales, de estudio o sin fines comerciales. Si más adelante creas la empresa, se abre una cuenta de tipo Company.
3. Escribe el **Publisher display name**: el nombre que verán los usuarios como desarrollador.
4. Acepta el acuerdo, completa la verificación de identidad y confirma tu correo.

> Según la guía de Microsoft, el registro de cuentas individuales ya no cobra tarifa, pero la misma página menciona un pago en otro punto. Confirma el costo en la pantalla de registro.

## Paso 3. Reservar el nombre

1. En Partner Center ve a **Apps and games → New product → MSIX or PWA app**.
2. Escribe el nombre y pulsa **Check availability**. Si aparece el chulo verde, pulsa **Reserve product name**.
3. Reglas del nombre:
   - debe ser único en la tienda;
   - sin emojis;
   - sin versiones ni fechas al final;
   - que no use una marca ajena.
4. La reserva dura **3 meses**. Puedes reservar varios nombres y elegir el final al publicar.
5. Si "StudyTimer" está ocupado, algunas opciones: **StudyTimer Polar**, **Pomodoro Polar** o **StudyTimer: Pomodoro Polar**.

## Paso 4. Copiar la identidad del paquete

En tu app, ve a **Product management → Product identity** y copia estos tres datos:

- **Package ID**
- **Publisher ID**
- **Publisher display name**

## Paso 5. Crear el paquete con PWABuilder

1. Entra a [pwabuilder.com](https://www.pwabuilder.com), pega la dirección de GitHub Pages y pulsa **Start**.
2. Si el informe muestra tareas pendientes, revísalas en **Action Items**. Con este proyecto no debería haber ninguna obligatoria.
3. Pulsa **Package For Stores**, luego **Windows → Generate Package**.
4. Pega los tres datos del paso 4.
   - **Version:** déjala como sugiere (por ejemplo `1.0.0`) y súbela en cada paquete nuevo.
   - **App name:** el nombre que reservaste.
5. Pulsa **Download Package**. Llega un `.zip` con:
   - un `.msixbundle` y un `.classic.appxbundle` (los dos se suben a la tienda);
   - un paquete de prueba con instrucciones, para instalar la app en tu PC antes de enviarla.
6. **Prueba el paquete en tu Windows** siguiendo las instrucciones del zip. Abre la app y revisa:
   - el temporizador;
   - la tienda de comida (arrastrar con el mouse);
   - tu foto de perfil;
   - que funcione sin internet;
   - que el atajo **Estudiar** aparezca al hacer clic derecho en el ícono de la barra de tareas.

## Paso 6. Enviar a la tienda

En Partner Center, pulsa **Start your submission** y completa cada sección (usa `docs/microsoft-store/FICHA.md`):

1. **Pricing and availability:** gratis, en los mercados que quieras.
2. **Properties:** categoría **Educación** (o Productividad). Pon la URL de la política de privacidad, `https://TU-USUARIO.github.io/study-timer/privacidad.html`, tu sitio web y tu correo de soporte.
3. **Age ratings:** responde el cuestionario de IARC. Hay respuestas sugeridas en la ficha.
4. **Packages:** sube el `.msixbundle` y el `.classic.appxbundle`.
5. **Store listings (Español):**
   - descripción, características y palabras clave (de la ficha);
   - capturas de `capturas/` (2732 × 1536, mínimo 1);
   - logo de 300 × 300.
6. **Submission options:** pega las notas para certificación de la ficha.
7. Pulsa **Submit for certification**. La revisión tarda hasta **3 días hábiles**. Si algo no pasa, Microsoft te dice qué arreglar.

## Después de publicar

- **Cambios de HTML, CSS, JavaScript o del service worker:** llegan solos a los usuarios. Solo los subes a GitHub Pages y subes `VERSION` en `service-worker.js`.
- **Cambios del `manifest.webmanifest`** (nombre, íconos, atajos…): hay que generar un paquete nuevo en PWABuilder, con un número de versión mayor, y enviarlo otra vez.
- **Cuando conectes el cobro real de Premium:** activa `premium.chargesEnabled` en `js/config.js` solo cuando el pago funcione. Para apps (no juegos) puedes usar el sistema de pago de Microsoft (comisión del 15 %) o uno propio.
