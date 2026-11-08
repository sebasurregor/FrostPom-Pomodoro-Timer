# Cobrar Premium en Microsoft Store (paso a paso)

Hoy Premium está en **modo prueba**: se activa gratis y no se cobra nada. Desde la v3.8 el código para cobrar de verdad **ya está listo** (`js/billing.js`) pero apagado. Esta guía explica cómo encenderlo sin romper nada.

> Primero publica la app gratis (`docs/DESPLIEGUE.md`). Microsoft solo deja crear la suscripción cuando la app ya existe en la tienda.

---

## 1. Cómo funciona

FrostPom en la tienda es una PWA. Cuando alguien la instala desde Microsoft Store, Edge le da a la app la **Digital Goods API**, y con ella la app puede:

1. **Leer el precio** de la suscripción que creaste en Partner Center, en la moneda de cada persona (`getDetails`).
2. **Abrir la ventana de pago de Microsoft Store** (`PaymentRequest`). La persona paga con su cuenta Microsoft; tú nunca ves la tarjeta.
3. **Revisar si la suscripción sigue activa** cada vez que se abre la app (`listPurchases`). Si se canceló o no se renovó, Premium se apaga solo; si se compró en otro equipo con la misma cuenta, se enciende solo.

Microsoft se encarga del cobro, las renovaciones mensuales, las cancelaciones, los reembolsos y los impuestos de venta de cada país. A cambio se queda con una comisión: según el anuncio de Microsoft de 2021, las apps que **no** son juegos reciben el 85 %. Confírmalo en el *App Developer Agreement* que aceptas en Partner Center.

**En el navegador normal** (GitHub Pages) esa API no existe. Ahí la app no deja comprar y dice "Para suscribirte, instala FrostPom desde Microsoft Store", con un botón a la tienda si llenas `storeUrl` (paso 4).

### ¿Y cobrar con Stripe, PayPal o similar?

Microsoft permite que las apps que no son juegos usen su propio sistema de pago y se queden con el 100 %. Pero eso exige un servidor que reciba los pagos y valide quién pagó, manejar impuestos y reembolsos tú mismo, y más código. Para empezar, **Microsoft Store es lo más simple y seguro**. Más adelante se puede agregar otro sistema (por ejemplo para iPhone o la web).

---

## 2. Antes de empezar: perfil de impuestos y perfil de pagos

- [ ] FrostPom publicada en Microsoft Store (estado **In the Store**).
- [ ] **Perfil de impuestos** y **perfil de pagos** en estado **Complete** (pasos 2.1 a 2.4).
- [ ] Ser mayor de edad para firmar el acuerdo de pagos. Si no lo eres, el perfil de pagos debe hacerlo un adulto responsable.
- [ ] En Colombia, lo que ganes es un ingreso que puede que tengas que declarar ante la DIAN. Pregúntale a un contador cuando empiecen a llegar pagos.

> Estos perfiles **no** hacen falta para publicar FrostPom gratis: Microsoft los pide solo para poder pagarte. El aviso azul *"You currently have 1 enrollment(s) that require payment and/or tax profile assignments"* significa justo eso. Puedes hacerlos antes o después de publicar.
>
> **Nunca** compartas por chat (con nadie, tampoco con Claude) tu número de cuenta, tu cédula ni el formulario. Solo se escriben dentro de Partner Center.

### 2.1 Qué tener a la mano

- Tu **número de cédula** y tu **fecha de nacimiento**.
- Tu **dirección de residencia** en Colombia (mejor la misma que tiene tu banco).
- Una **cuenta bancaria a tu nombre** que reciba transferencias internacionales: nombre del banco, **código SWIFT**, número y tipo de cuenta. Pregunta en tu banco cuánto cobra por recibir una transferencia del exterior y en qué moneda la recibe.
- O una cuenta de **PayPal** verificada a tu nombre (Microsoft ofrece PayPal en Colombia).
- El **nombre del titular tal cual aparece en el banco**, con segundo nombre y segundo apellido si los tiene.

### 2.2 Perfil de impuestos (formulario W-8BEN)

1. Partner Center → ⚙️ (arriba a la derecha) → **Account settings** → en el menú de la izquierda, al final: **Payout and tax profile assignment**.
2. Selecciona la fila del programa de Microsoft Store (puede llamarse *Windows and Xbox* o *Microsoft Store*) → **Edit**.
3. En el panel que se abre: **Create a new tax profile**.
4. *Permanent residence country/region:* **Colombia**. *Account type:* **Individual** → **Next**.
5. Completa tus datos → **Next** → abre el formulario de impuestos.
6. Responde así:

   | Pregunta | Qué poner |
   |---|---|
   | ¿Eres ciudadano o residente de EE. UU.? | **No** |
   | Formulario | **W-8BEN** (el de personas). No el W-8BEN-E (empresas) ni el W-9 (estadounidenses) |
   | *Name* | Tu nombre completo, como en la cédula |
   | *Country of citizenship* | **Colombia** |
   | *Permanent residence address* | Tu dirección en Colombia (no un apartado postal) |
   | *Mailing address* | La misma |
   | *U.S. TIN* (SSN o ITIN) | Vacío. No lo necesitas |
   | *Foreign TIN* | Tu número de cédula (si tienes RUT, ese número es tu NIT; el dígito de verificación no va) |
   | *Date of birth* | Ojo: formato de EE. UU., **mes-día-año** (MM-DD-AAAA) |
   | *Claim of tax treaty benefits* (Parte II) | **No** / vacío: Colombia no tiene tratado de impuestos con EE. UU. |
   | ¿Haces trabajo o actividades dentro de EE. UU.? | **No** (si todo lo haces desde Colombia) |
   | Firma | Escribe tu nombre completo y acepta la firma electrónica |

7. Al final pulsa **Finish** (arriba a la derecha) y **después** **Complete** (abajo a la izquierda). En ese orden: si no, el perfil queda incompleto.
8. El estado pasa a **Pending Microsoft Validation** y luego a **Complete**. Puede tardar hasta **48 horas**.

En *Tax profiles* verás **Tax treaty status: False**. Es normal para Colombia. Según la documentación de Microsoft, sin tratado se puede retener hasta el **30 % solo de las ventas a clientes de EE. UU.**; las ventas en Colombia y otros países no tienen esa retención.

### 2.3 Perfil de pagos

1. En la misma página (**Payout and tax profile assignment**) → la fila del programa → **Edit**.
2. En el panel, en la sección del perfil de pagos (*payment profile*) → **Edit**.
3. Método: **Electronic Bank Transfer** (cuenta bancaria) o **PayPal**.
4. **Create a new payment profile** → si dice que te va a llevar a otro sitio de Microsoft → **Continue**.
5. **Cuenta bancaria:**
   - *Profile name:* por ejemplo `Pagos FrostPom`;
   - datos de la cuenta (solo letras y números: sin espacios, guiones ni puntos), código del banco o **SWIFT**;
   - *Beneficiary:* nombre y apellidos legales, país (**Colombia**), dirección y ciudad;
   - el titular debe coincidir **exactamente** con el del banco. Si el formulario no acepta tildes o la ñ, escríbelo como lo tiene el banco (normalmente en mayúsculas y sin tildes).

   **PayPal:** escribe el correo de tu PayPal y los datos del titular. En PayPal, no bloquees los pagos *eCheck* y apaga la opción **Ask Me** (si no, tendrías que aceptar cada pago a mano y los que no aceptes se devuelven a los 30 días).
6. De vuelta en *Profile assignment*: elige la **moneda** de pago (una que tu banco acepte) → **Submit**.
7. La validación también puede tardar hasta **48 horas**.

### 2.4 Cómo saber que quedó bien

✅ **Quedó bien si** en **Account settings → Payout and tax profiles** aparecen tu perfil de pagos y tu perfil de impuestos en **Complete**, el aviso azul desaparece y la página principal no muestra *Action required*.

Para saber: Microsoft paga cada mes **cuando acumulas al menos USD 50**, y la plata llega unos días hábiles después de enviada. El formulario W-8BEN **vence** (dura unos tres años): Partner Center te avisa cuando toque renovarlo.

---

## 3. Crear la suscripción en Partner Center

1. Entra a [partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard) → **Apps and games** → **FrostPom**.
2. En el menú de la app: **Add-ons** → **Create a new add-on**.
3. **Product type:** `Subscription`.
4. **Product ID:** escribe exactamente **`frostpom_premium_mensual`**. Es el mismo que está en `js/config.js` (`storeProductId`); si usas otro, cámbialo allí también. No se puede cambiar después.
5. Pulsa **Create**. Se abre el envío del add-on:
   - **Properties**
     - *Subscription period:* **1 month**. No se puede cambiar después.
     - *Free trial:* `No free trial` (recomendado al principio) o `1 week`. Tampoco se puede cambiar después.
     - *Content type:* `Software as a service` (o la opción más parecida a "servicio dentro de la app").
   - **Pricing and availability**
     - *Base price:* el escalón de **USD 2.99** (o el que decidas). Ojo: **el precio de una suscripción no se puede subir después de publicarla**, solo bajar.
     - *Visibility:* para la primera prueba puedes elegir **Hidden in the Store** (solo se compra desde la app).
   - **Store listings:** agrega **Español** y **English (United States)**:
     - Título: `FrostPom Premium`.
     - Descripción ES: `Recordatorios, duración libre del temporizador, todos los temas y sonidos, 1.000 gemas de regalo y una mascota de edición limitada. Se renueva cada mes; cancélala cuando quieras desde tu cuenta de Microsoft.`
     - Descripción EN: `Reminders, any timer length, every theme and sound, 1,000 gift gems and a limited-edition pet. Renews monthly; cancel anytime from your Microsoft account.`
     - Ícono: `assets/icons/icon-512.png` (si te pide 300 × 300, usa `docs/microsoft-store/logo-300.png`).
6. Pulsa **Submit to the Store**. Microsoft revisa el add-on (puede tardar hasta 3 días hábiles).

✅ **Quedó bien si** en *Add-ons* aparece `frostpom_premium_mensual` con estado **In the Store**.

---

## 4. Encender el cobro en el código

Solo cuando el add-on ya esté **In the Store**:

1. Abre `js/config.js` y en `premium` cambia:

   ```js
   chargesEnabled: true,
   storeProductId: 'frostpom_premium_mensual',   // igual al de Partner Center
   storeUrl: 'https://apps.microsoft.com/detail/TU_ID_DE_LA_TIENDA',
   ```

   El enlace lo encuentras en Partner Center → tu app → **Product management** → **Product identity** → *URL for Windows 10/11*.
2. Sube el número de versión en **`js/config.js`** (`version`) y en **`service-worker.js`** (`VERSION`), por ejemplo `3.9.0`, para que los usuarios reciban el cambio.
3. Prueba en tu PC que nada se rompió:

   ```
   npm test
   python tests/e2e_cobro.py http://localhost:8000/
   ```

   `e2e_cobro.py` finge la tienda: comprueba que el botón muestra el precio, que cancelar no activa Premium, que pagar sí lo activa con el regalo, y que si la suscripción se cancela, Premium se apaga al volver a abrir.
4. Sube los cambios a GitHub (`git add -A`, `git commit`, `git push`).

No hace falta un paquete nuevo de PWABuilder: la app de la tienda carga tu página de GitHub Pages.

---

## 5. Probar con dinero real

Microsoft no tiene un "modo de pruebas sin cobro" para las suscripciones de apps. La forma práctica es esta:

1. Instala FrostPom **desde Microsoft Store** (no desde Edge). La API de pagos solo existe ahí.
2. Abre Premium: el botón debe decir **Suscribirme, US$ 2,99** (o el precio en tu moneda). Si dice "instala FrostPom desde Microsoft Store", la app no se instaló desde la tienda o el Product ID no coincide.
3. Cómprala con tu cuenta. Debe aparecer la ceremonia del regalo.
4. Ve a [account.microsoft.com/services](https://account.microsoft.com/services), busca *FrostPom Premium* y **cancela la renovación**. Si quieres que te devuelvan el dinero, desde esa página puedes pedir el reembolso.
5. Cuando termine el mes pagado, vuelve a abrir la app: Premium se apaga solo.

---

## 6. Actualizar la ficha y el cuestionario de edad

Cuando el cobro esté encendido, en Partner Center → tu app → **Update**:

- **Age ratings:** vuelve a responder el cuestionario y marca que **hay compras digitales**. Premium incluye 1.000 gemas de regalo, que cuentan como moneda virtual.
- **Store listings:** en la descripción, cambia "Premium está en prueba gratis" (si lo dice) por algo como *"Premium es una suscripción mensual opcional"*. La tienda marca sola que la app "ofrece compras dentro de la aplicación".
- **Notas para certificación:** explica que Premium es una suscripción de Microsoft Store (`frostpom_premium_mensual`) y que sin ella la app es completamente usable.

---

## 7. Límites que conviene conocer

- Las suscripciones de Microsoft Store **no tienen periodo de gracia**: si el cobro de la renovación falla, se cancela.
- No se puede pasar de un plan a otro (por ejemplo, de mensual a anual): la persona cancela y compra el otro.
- Los códigos promocionales no sirven para suscripciones.
- La app confía en lo que dice Microsoft Store en el dispositivo. Para una seguridad mayor (que nadie pueda "fingir" Premium tocando el código), más adelante se puede validar cada compra desde un servidor con la *Microsoft Store collection API* (por ejemplo, con una función de Supabase). Para una app pequeña, lo de ahora es suficiente.

---

Fuentes:
- [Microsoft Learn: Digital Goods API y Payment Request API para PWA en Microsoft Store](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/digital-goods-api)
- [Microsoft Learn: suscripciones como add-on (periodos, prueba gratis, límites)](https://learn.microsoft.com/en-us/windows/uwp/monetize/enable-subscription-add-ons-for-your-app)
- [Microsoft Learn: envíos de add-ons](https://learn.microsoft.com/en-us/windows/uwp/publish/add-on-submissions)
- [Neowin: cómo funciona el pago con sistemas propios en Microsoft Store](https://www.neowin.net/news/microsoft-explains-how-third-party-billing-works-in-the-microsoft-store/)
- [TweakTown: apps que no son juegos y sistema de pago propio (100 %)](https://www.tweaktown.com/news/80216/windows-11s-new-100-dev-revenue-share-is-for-apps-only-not-pc-games/index.html)
