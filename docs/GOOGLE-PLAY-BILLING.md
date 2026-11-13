# Fase 6 (v4.7.0): cobrar Premium en Android con Google Play Billing

> **Estado: PLAN para aprobar.** Es dinero real de la gente: aquí manda hacerlo bien, no rápido. Todavía no hay código de cobro para Android.

## 0. Cómo quedó Premium en la v4.4.1 (ya hecho)

- **En la app de Android, Premium sigue en modo prueba (gratis)**, aunque algún día se encienda el cobro de Microsoft Store (`config.premium.chargesEnabled`). Antes de este arreglo, al encenderlo, la app de Android habría dicho "instala FrostPom desde Microsoft Store", y **Google Play prohíbe mandar a pagar por fuera de Google Play**.
- **Se puede publicar en Google Play así:** no se vende nada, Premium es una prueba gratis y el texto lo dice ("Modo prueba: no se cobra nada").

## 1. Lo que hace falta antes de programar (en Play Console)

1. **Cuenta de desarrollador verificada** y **perfil de pagos** (cuenta de comerciante) con la información de impuestos. Es el W-8BEN que estabas llenando: residencia fiscal Colombia, sin negocio en EE. UU.
2. **La app subida al menos a una prueba** (interna o cerrada). Google no deja crear suscripciones hasta que exista una versión con el permiso de cobro, y la librería lo agrega sola.
3. **Crear la suscripción** en **Monetizar → Productos → Suscripciones**:
   - id `frostpom_premium` (permanente: no se puede cambiar después);
   - un **plan base mensual** con renovación automática y precio en dólares (Google calcula el de cada país);
   - opcional: una **oferta de prueba gratis** (por ejemplo, 7 días).
4. **Probadores de licencias** (**Configuración → Prueba de licencias**): tu correo y el de algunos probadores, para comprar sin que se cobre de verdad.

## 2. ¿Con qué librería? (recomendación con razones)

| | **RevenueCat** (`@revenuecat/purchases-capacitor`) | **cordova-plugin-purchase** (CdvPurchase) |
|---|---|---|
| Qué es | Un servicio que hace el cobro y lo **verifica en sus servidores** | Una librería gratis y abierta que solo habla con Google Play |
| Verificar la compra | Ellos (con tus credenciales de Google), con acuse de recibo, renovaciones, gracia, reembolsos… | **Tú**: una Edge Function de Supabase con la API de Google Play y las notificaciones en tiempo real (Pub/Sub) |
| iPhone después | La misma librería y la misma cuenta: Premium vale en los dos | Otra parte que programar |
| Costo | Gratis hasta US$ 2.500 de ingresos al mes; después, 1 % de lo que pase por RevenueCat | Gratis (y la Edge Function, dentro del plan gratis de Supabase) |
| Código que toca dinero | Poco (ellos manejan los casos raros) | Bastante (y es fácil equivocarse en un caso raro) |

**Recomendación: RevenueCat.** Para un primer cobro, lo más seguro es que lo difícil (verificar, renovar, reembolsar, el "acuse de recibo" que Google exige en 3 días o devuelve la plata) lo haga un servicio que solo hace eso.

**Nuestro servidor sigue siendo el que manda:**
- RevenueCat avisa cada cambio a una **Edge Function** de Supabase (`rc-webhook`, protegida con una clave que solo vive en los secretos de Supabase).
- Esa función guarda el estado en `private.entitlements`, la tabla que comparten todas las plataformas (ver `docs/MULTI-DISPOSITIVO.md`, sección 5).
- **La app pregunta a nuestro servidor** si eres Premium, no a un dato guardado en el teléfono.

**Lo que implica RevenueCat:** comparte con ellos el id de tu cuenta (el de Supabase, nunca el correo) y la compra. Hay que agregarlo a la política de privacidad y a "Seguridad de los datos" de Play Console.

Si prefieres no depender de un tercero, la otra opción (CdvPurchase + Edge Function con la API de Google) también es viable, pero toma más tiempo y más pruebas.

## 3. Cómo funciona la compra

1. En Android, el botón dice **"Suscribirme, $X al mes"** con el **precio que manda Google** en la moneda de cada persona; nunca un precio escrito a mano.
2. Se abre la ventana de pago de Google Play.
3. Al pagar, la librería confirma, la app muestra Premium al instante y le pide al servidor que se actualice. El aviso de RevenueCat también llega por su lado.
4. **"Restaurar compras"** (cambio de teléfono o reinstalación) y **"Administrar suscripción"**, que abre la página de suscripciones de Google Play para FrostPom.
5. **Estados:**

| Estado | Qué pasa en la app |
|---|---|
| Activo | Premium |
| Período de gracia (falló el pago, Google reintenta) | Premium, con un aviso para revisar el medio de pago |
| En espera (*account hold*) | Sin Premium y con un aviso |
| Cancelado (sigue hasta la fecha) | Premium hasta esa fecha |
| Vencido o reembolsado | Sin Premium; **nunca se quita lo ganado** (gemas del regalo, temas comprados con gemas) |

6. **El regalo de bienvenida** (1.000 gemas y una mascota) se da una sola vez por cuenta, aunque compre en dos plataformas.

## 4. Reglas de Google Play que se cumplen

- **El contenido digital se cobra solo con Google Play Billing:** sin enlaces a otras formas de pago en la app de Android.
- **Antes de pagar se dice claro:** el precio, que se renueva cada mes, cómo cancelar y, si hay prueba gratis, cuándo empieza a cobrar.
- **Política de suscripciones:** cancelar debe ser fácil (el enlace a Google Play) y no se cobra sin avisar.

## 5. Pruebas

- **Automáticas:**
  - pruebas de lógica para los estados de la tabla (activo → gracia → en espera → vencido, reembolso, renovación);
  - pruebas SQL de `private.entitlements` y de `get_entitlements()`;
  - e2e con la librería simulada: comprar, cancelar, restaurar, sin internet.
- **En Play Console:** con probadores de licencias se usan tarjetas de prueba ("siempre aprueba", "siempre rechaza"), y las suscripciones de prueba se renuevan cada pocos minutos, así que se ven todos los estados en una tarde.

## 6. Lo que tienes que hacer tú (paso a paso, cuando se programe)

1. Lo de la sección 1 (perfil de pagos, subir a prueba, crear la suscripción, probadores).
2. **Google Cloud:** activar la API "Google Play Android Developer", crear una cuenta de servicio y darle permisos en Play Console. Su archivo de claves va **solo** a RevenueCat, **nunca** al repositorio ni al chat.
3. **RevenueCat:** crear el proyecto, conectar Google Play con esa cuenta de servicio, activar las notificaciones en tiempo real (Google Cloud Pub/Sub; RevenueCat da los pasos), crear el *entitlement* `premium` y la *offering*.
4. **Supabase:** correr el SQL nuevo, desplegar la Edge Function `rc-webhook` y guardar su clave como secreto.
5. Probar con la lista del paso 5 y, solo entonces, encender el cobro en Android.

**Costos:**
- Google se queda con el **15 %** de las suscripciones.
- RevenueCat: gratis hasta US$ 2.500 al mes.
- Supabase: dentro del plan gratis.

## 7. Decisiones para aprobar

1. **¿RevenueCat** (recomendado) o librería abierta con verificación propia?
2. **¿Prueba gratis de 7 días** para nuevos suscriptores? (Recomendado: sí, aumenta las suscripciones.)
3. **Precio base:** ¿US$ 2,99 al mes, como en Microsoft Store?
4. **¿Premium comprado en Android debe valer también en Windows?** Requiere que la app de Windows lea el estado del servidor (fácil) y, para lo inverso (comprado en Microsoft Store → valga en Android), verificar Microsoft Store en el servidor (fase 6b).
5. **¿Cuándo?** Recomendado: **después** de que empiece la prueba cerrada, para no frenar la publicación. El cobro llega como actualización.
