# Cambios de la v2 a la v3

## v4.8.2: nombres escondidos en el ranking (opción a) y diagnóstico en Ajustes

**Antes de publicar:** vuelve a pegar tus claves en `js/config.js`. **Hay un cambio de servidor:** copia de seguridad y corre el `server/supabase/schema.sql` nuevo (botón verde "Run and enable RLS"); no borra datos.

**Tu decisión (17 nov 2026):** opción **a**: si escondieron tu nombre y eliges uno nuevo, vuelves a aparecer de una vez.

- **Si tu nombre está escondido, la app te avisa al abrirse:**
  - Por **reportes o moderación** (`hide_name`): "Tu nombre está oculto en el ranking", con **"Ahora no"** (como mucho una vez al día). Con un nombre **nuevo** vuelves a aparecer y tus reportes viejos se borran. Con el mismo, sigues escondido.
  - Por una **palabra prohibida** (la lista fija o tus `block_word`): "Elige un nombre nuevo", obligatorio, como antes. Ahora también para las palabras que agregues tú.
  - Nueva función del servidor `public.my_board_status()` (solo dice tu estado, nunca quién te reportó). Si todavía no corriste el schema, la app sigue como antes.
- **Ajustes → Acerca de → "Diagnóstico"** (solo en la app de Android): dice si la app trae el **reproductor y los widgets** (✓/✗), cómo están los **anuncios** (listos de prueba, apagados en config.js, la app se compiló sin AdMob, sin permiso de Google, error…) y si trae **Google Play**. Así se sabe por qué algo no aparece sin cables ni adb.
- versionCode 40802.

## v4.8.1: anuncios encendidos (en modo de prueba) y palabras prohibidas propias en el ranking

**Antes de publicar:** vuelve a pegar tu clave de Turnstile y tu clave `goog_…` en `js/config.js`, y `npm run android:actualizar` (debe decir **"AdMob: tu ID de app"** y el **[OK]** de la parte nativa).

- **Anuncios encendidos con tu cuenta de AdMob** (17 nov 2026): el ID de la app y las unidades "Ver anuncios" (bonificado) y "Descanso" (intersticial) están en `config.ads`. Van con **`testing: true`**: en el celular salen los anuncios de prueba de Google ("Test Ad"), que no pagan ni ponen en riesgo tu cuenta. Para publicar con anuncios reales: `testing: false` (`docs/ANUNCIOS.md`, 5.4).
- **`docs/app-ads/app-ads.txt`** con tu línea de AdMob: súbelo a la raíz de `sebasurregor.github.io`.
- **Servidor (opcional, solo si quieres prohibir palabras tuyas):** `schema.sql` agrega `private.block_word('palabra')`, `private.unblock_word('palabra')` y la tabla `private.extra_blocked_names`. Prohibir una palabra esconde al instante los nombres guardados que la tienen. Copia de seguridad y después corre el `schema.sql` (no borra datos).
- **Política de privacidad, normas de la comunidad y eliminar la cuenta:** ahora muestran **tu logo** arriba (el de la temporada, `assets/icons/icon-192.png`) y el ícono de la pestaña se actualiza aunque el navegador tuviera guardado el viejo. Además, el resumen de la política ya no dice "La app no tiene anuncios": explica los anuncios y las compras de la app de Android.
- versionCode 40801.

## v4.8.0: "¿Necesitas más gemas?", paquetes de gemas y el arreglo de widgets y reproductor

**Antes de publicar:** vuelve a pegar tu clave de Turnstile (`captcha.siteKey`) y tu clave `goog_…` (`premium.play.revenueCatKey`) en `js/config.js`. Después, `npm install` y `npm run android:actualizar`, que ahora **debe terminar con el [OK] de la parte nativa** (si sale [X], no generes el `.aab`).

**Tus decisiones (17 nov 2026):** la 4.7.4 de Prueba interna salió sin widgets ni reproductor; 4 paquetes de gemas (US$ 0,99 / 4,99 / 9,99 / 19,99); primero crear AdMob y después encender los anuncios.

- **"¿Necesitas más gemas?"** Al tocar la gema (arriba, al lado del rango, o en la tienda de la mascota) se abre una ventana con la gema y el brillo de cuando desbloqueas un personaje, tu saldo y tres opciones:
  - **Ver un anuncio: +10 gemas** (con "Quedan N hoy"). Solo aparece cuando los anuncios están encendidos y listos; es el mismo límite de 5 al día de la tienda.
  - **Estudiar un pomodoro:** te lleva a Enfocar y hace brillar el botón de empezar.
  - **Comprar gemas:** los 4 paquetes, del más pequeño al más grande, con el precio de Google Play en tu moneda: **60** (US$ 0,99), **330** (+30 de regalo, US$ 4,99), **700** (+100, US$ 9,99) y **1.500** (+300, US$ 19,99). El que da más gemas por cada peso lleva **"Mejor precio"**.
- **Cómo se compra:** solo en la **app de Android**, con **cuenta en línea** (13+) y el cobro encendido. En la web y en Windows el botón aparece apagado ("Solo en la app de Android."); para menores de 13 no aparece. Si la cuenta es de este equipo, la app te invita a conectarla.
- **Cada compra suma sus gemas UNA sola vez** (se anota el número de la compra de Google en tu progreso, que viaja con tu cuenta). Si la app se cierra al pagar o el pago queda pendiente, las gemas llegan solas al volver a abrir la app. Al terminar sale "¡Gracias por apoyar FrostPom!" con confeti.
- **Widgets y reproductor:** como no aparecían ni en la lista de widgets del celular, lo más probable es que la parte nativa (`@frostpom/timer`) no entró al `.aab`. Ahora `npm run android:actualizar` **lo revisa al final** (`tools/revisar-android.mjs`) y se detiene con un error claro si falta; además, R8 guarda esa parte completa. Diagnóstico paso a paso en `native/frostpom-timer/LEEME.md`, sección "v4.8.0".
- **Textos de las tiendas y privacidad:** la ficha de Google Play ya no dice que las gemas "no se compran con dinero"; la política de privacidad explica los paquetes (17 nov 2026). **Súbela con `git push` antes de publicar.**
- **Lo que haces en Play Console y RevenueCat** (crear los 4 productos únicos): `docs/GOOGLE-PLAY-BILLING.md`, sección 5b.
- Pruebas nuevas: `tests/gem-shop.test.js` y `tests/e2e_gemas.py`.
- versionCode 40800.

## v4.7.4: código optimizado con R8 (aviso "Optimización de código DEX" de Google Play)

**Antes de publicar:** vuelve a pegar tu clave de Turnstile (`captcha.siteKey`) y tu clave `goog_…` (`premium.play.revenueCatKey`) en `js/config.js`.

Play Console avisó (17 nov 2026, con la 4.7.3): "La optimización de código DEX está por debajo de nuestro umbral · Ofuscación (2 %)". Google pide al menos 25 % antes de **febrero de 2027**; si no, puede bajar la visibilidad de la app. Pasaba porque la carpeta `android/` se creó con una plantilla de Capacitor que trae R8 apagado (`minifyEnabled false`).

- **`npm run android:actualizar` enciende R8 en la versión para la tienda** (`minifyEnabled true` y `proguard-android-optimize.txt` en `android/app/build.gradle`) y agrega las reglas de FrostPom a `android/app/proguard-rules.pro` (el puente de JavaScript y los números de línea para los errores). R8 achica, optimiza y ofusca el código Java/Kotlin. La web no cambia.
- Las versiones de prueba (`installDebug`, Run ▶ de Android Studio) **no** cambian: R8 solo corre al generar el `.aab` firmado.
- De paso se va el aviso del **archivo de desofuscación**: el `.aab` ya lleva el `mapping.txt` y los errores en Play se leen con nombres reales.
- No se activa `shrinkResources` (borrar recursos sin usar): las notificaciones buscan su ícono por nombre y podría borrarlo; además, no cuenta para este aviso.
- Capacitor 8.6, RevenueCat y AdMob traen sus propias reglas para R8, así que no hace falta "proteger" librerías enteras (eso bajaría el porcentaje otra vez).
- **Plan B**, si algo deja de funcionar solo en la versión de la tienda: en PowerShell, `$env:FROSTPOM_R8="0"; npm run android:actualizar`, generas el `.aab` otra vez y me cuentas qué falló.
- **Cómo probarla:** súbela primero a **Prueba interna** (sin revisión, llega en minutos), pruébala desde Play y después **promociónala** a Prueba cerrada. Lista en `native/frostpom-timer/LEEME.md`, sección "v4.7.4".
- versionCode 40704.

## v4.7.3: lo que salió de la prueba en el Galaxy, con tus decisiones

**Antes de publicar:** vuelve a pegar tu clave de Turnstile (`captcha.siteKey`) y tu clave `goog_…` (`premium.play.revenueCatKey`) en `js/config.js`. Después, Claude Code en tu PC compila y prueba (mensaje en `native/frostpom-timer/LEEME.md`, sección "v4.7.3").

**Tus decisiones (16 nov 2026, después del informe de Claude Code):** mantener el reproductor y acortar el hueco; ⏮ vuelve a empezar corriendo; para el aviso sin permiso, alarmas escalonadas y pedir el permiso al empezar.

- **Calendario de Progreso:** el día en que cumpliste la meta del polo, **el hielo reemplaza al círculo naranja** (el número va encima del hielo y las gotas cuelgan abajo). Los demás días no cambian.
- **Reproductor de la notificación:** si Android cierra la app para liberar memoria, vuelve en **2 min como mucho** (antes hasta 8). La actualización es cada 2 min y exacta cuando diste el permiso "Alarmas y recordatorios", sin despertar al teléfono.
- **⏮ en el reproductor y en el widget vuelve a empezar el bloque y sigue corriendo**, como en un reproductor (antes lo dejaba en reposo y la notificación se iba). Su nombre ahora es "Volver a empezar". El botón "Reiniciar" de la app no cambia.
- **Aviso del final sin el permiso de alarmas exactas:** Android podía atrasarlo hasta 18 min en un pomodoro de 25. Ahora hay "alarmas de acercamiento" (a la mitad de lo que falta, cada vez) y llega con ~1 min de retraso como mucho.
- **El permiso "Alarmas y recordatorios" se pide al empezar el primer pomodoro** (antes, después del primero completo), una sola vez y con la explicación de siempre.
- **Widgets:** se incluyen los dos arreglos que hizo Claude Code (la hora redondea como la app: 25:00, no 24:59; y en pausa o en reposo queda quieta, como texto fijo).
- **Ícono de Android:** el logo ocupa un poco menos (68 de 108 dp) para que la forma redondeada de Samsung no corte la punta del gorro ni el pompón.
- **Limpieza automática:** `npm run android:actualizar` borra los 9 archivos del widget viejo que se quedaban al descomprimir encima (uno de ellos dejaba la hora gris y delgada).
- versionCode 40703.

## v4.7.2: logo de Navidad, widgets y notificación nuevos, y el aviso del final arreglado

**Antes de publicar:** vuelve a pegar tu clave de Turnstile (`captcha.siteKey`) y tu clave `goog_…` (`premium.play.revenueCatKey`) en `js/config.js`. Después, Claude Code en tu PC compila y prueba (mensaje en `native/frostpom-timer/LEEME.md`, sección "v4.7.2").

- **Logo de temporada (Navidad)** en todas partes: la app de Android (ícono adaptable, redondo y pantalla de inicio), la web (pestaña, iPhone, "instalar app") y los archivos para las tiendas (`docs/google-play/icono-512.png`, `docs/microsoft-store/logo-300.png`). Tus tres logos quedan en `logos/`. **Para cambiarlo después:** `python tools/iconos.py normal` (o `navidad`, o `normal-pico-cerrado`) y sube la versión, como siempre.
- **Widgets nuevos (4 × 2 y 2 × 2)** con el diseño del lienzo "Rediseño FrostPom": una sola tarjeta con los animales del ártico de fondo, la hora grande, la barra con tu compañero (blanco lo hecho, el color del modo lo que falta), lo hecho y el total, botones blancos y el globito. El pequeño: la hora, la barrita y el botón dorado (verde en el descanso). Siempre oscuros, como en el diseño. Si tu pantalla de inicio los hace bajitos, se esconden la frase y los números para que nada se corte.
- **La notificación es un reproductor, como Spotify:** en la pantalla de bloqueo y en el panel rápido sale con los animales de fondo, el modo, la frase, la barra que avanza sola y ⏮ ⏸ ⏭ ✓. No suena nada: solo usa el aspecto de reproductor.
- **Arreglado: el aviso del final no llegaba con el ahorro de batería.** La app, en segundo plano, a veces llegaba a cero y pasaba al descanso antes de que sonara la alarma del teléfono; eso cancelaba la alarma. Ahora, si pasa, el aviso sale igual.
- **Después de reiniciar el teléfono:** además del aviso de encendido, el widget también trae de vuelta la notificación y el aviso del final; y el teléfono deja anotado en su registro (logcat, etiqueta `FrostTimer`) cada paso, para que Claude Code encuentre la causa si todavía falla.
- La barra del widget avanza cada 5 min (antes 15), sin despertar al teléfono.
- "Empezar en el PC y que el celular muestre la notificación sola" necesita avisos push: queda para más adelante, como decidiste.
- versionCode 40702.

## v4.7.1: el cobro con Google Play, encendido

- `config.premium.play.enabled = true`. **Pega tu clave pública de RevenueCat (`goog_…`) en `revenueCatKey`** antes de `npm run android:actualizar`: sin ella, la app sigue en modo prueba (y la herramienta te avisa).
- `rc-webhook`: el aviso de prueba de RevenueCat ("Send test event") solo se anota, sin preguntarle a RevenueCat (antes respondía 502).
- **(Fase 5) La notificación en curso y el widget de Android:** `package.json` ya trae `"@frostpom/timer": "file:native/frostpom-timer"`. Con `npm install` y `npm run android:actualizar`, la app de Android los incluye. Como el Kotlin nunca se compiló con el SDK real, la primera compilación se hace con Claude Code en tu PC (mensaje en `native/frostpom-timer/LEEME.md`).
- versionCode 40701.

## v4.7.0: Premium con Google Play (RevenueCat), con tus decisiones

**Antes de publicar:**

- Vuelve a pegar tu clave del sitio de Turnstile en `js/config.js`.
- Haz `npm install`: llega el complemento `@revenuecat/purchases-capacitor` 14.1.0.
- **Hay cambios de servidor:** copia de seguridad y después corre el `schema.sql` nuevo (solo agrega tablas y funciones). Las Edge Functions se despliegan cuando configures el cobro.
- El cobro viene **apagado** (`config.premium.play.enabled = false`). Para encenderlo sigue `docs/GOOGLE-PLAY-BILLING.md`, sección 5 (son dos subidas a Google Play: la 4.7.0 con el cobro apagado y la 4.7.1 con el cobro encendido).

**Tus decisiones (16 nov 2026):** RevenueCat; US$ 2,99 al mes y US$ 19,99 al año; 7 días gratis; primero solo Android.

### Qué hay

- **La ventana de Premium en Android** (con el cobro encendido):
  - los dos planes con el precio de Google y "Ahorra 44 %" en el anual;
  - "Empezar 7 días gratis" (o "Suscribirme, …" si ya tuvo la prueba);
  - las condiciones claras (renovación automática, cómo cancelar, que cancelando en la prueba no se cobra);
  - "Restaurar compras".
- **Ya eres Premium:** el estado de tu suscripción (prueba gratis, se renueva, cancelada, problema de pago) y "Administrar suscripción", que abre Google Play.
- **Avisos:** período de gracia (Premium sigue, revisa el pago), en espera (sin Premium hasta arreglar el pago), "Tu Premium terminó" (lo ganado sigue siendo tuyo).
- **Solo cuentas en línea (13+)** pueden suscribirse. Sin cuenta en línea, la ventana pide conectarla; los menores de 13 no ven la oferta.
- **Quien usaba la prueba gratis** en Android ve una vez "La prueba gratis de Premium terminó". Con eso se cierra el hueco de la v4.5.3 (quitar el anuncio del descanso gratis).
- **Eliminar la cuenta** avisa que la suscripción de Google Play no se cancela sola.

### Servidor

- `private.entitlements` (el estado de la suscripción, sin datos de pago) y `private.billing_events` (los avisos de RevenueCat que llegaron).
- `get_entitlements()` para la app. `billing_apply()` y `billing_sync_gate()` solo para las Edge Functions (`service_role`).
- `export_my_data()` incluye Premium; `delete_my_cloud_account()` lo borra; `account_check()` lo muestra; `cleanup()` borra los avisos viejos.
- **Edge Functions:** `rc-webhook` (aviso de RevenueCat, con clave; nunca le cree al aviso, le pregunta a RevenueCat) y `premium-sync` (la app pide revisar su propia cuenta). Listas para pegar en el panel: `server/supabase/functions/pegar-en-supabase/` (las arma `npm run edge:pegar`).

### Para quien programa

- `js/play-billing.js`: el complemento de RevenueCat (`NATIVE.purchases()` devuelve `{ api }`, como AdMob) y la lógica pura (estados, precios, prueba gratis, errores), con pruebas.
- `C.setPremiumGate(fn)`: en Android con cobro, `isPremium` lo decide la copia de lo que dijo el servidor (`st2_play`, de este aparato) y no `premium.active` (el de la prueba gratis, que viaja con el progreso).
- `E.premiumGift(state)`: el regalo de bienvenida sin tocar `premium.active`.
- `CLOUD.callFunction(name, token)`: llamar una Edge Function con la sesión.
- Realtime: el aviso `{ k: 'e' }` hace que tus otros aparatos pregunten por Premium.
- `tools/app-android.mjs` se detiene si `revenueCatKey` es una clave secreta (`sk_…`).
- Pruebas nuevas: `tests/billing-server.test.js` (7), `tests/billing-app.test.js` (8), `tests/e2e_play.py` (42) y 9 bloques SQL en `tests.sql`.

## v4.5.3: anuncios de AdMob (con tus decisiones)

**Antes de publicar:**

- Vuelve a pegar tu clave del sitio de Turnstile en `js/config.js`.
- Haz `npm install`: llega el complemento de anuncios.
- No hay cambios de servidor.
- Los anuncios vienen **apagados** (`config.ads.enabled = false`). Para encenderlos sigue `docs/ANUNCIOS.md`, sección 5 (cuenta de AdMob, ID, mensaje de consentimiento, app-ads.txt y Play Console).

**Tus decisiones (16 nov 2026):**

- 3 anuncios para revivir la mascota.
- +10 gemas por anuncio, hasta 5 al día.
- Pantalla completa cada 4 pomodoros o 90 minutos de estudio, lo que llegue primero (los minutos cuentan el estudio, no el reloj; los contadores empiezan de cero cada día).
- Premium puede ganar gemas con anuncios, pero nunca ve el de pantalla completa.
- La mascota **no** se muere más rápido.

### Qué hay

- **Tienda:** "Ver un anuncio: +10 gemas", con "Quedan N hoy". El premio llega solo si el anuncio se ve completo.
- **Mascota muerta:** "Revivir con anuncios (0 de 3)", además de "Revivir por 30 gemas". El avance se guarda.
- **Racha apagada:** "Ver anuncios y revivirla (0 de 2)": 1 anuncio por cada día que faltó.
- **Descanso:** el anuncio de pantalla completa. Se carga al empezar el pomodoro que lo va a tener. El descanso empieza **cuando lo cierras**.
  - **Nunca sale:** durante el estudio, al abrir la app, con la app en segundo plano ni con Premium.
- **Ajustes → Acerca de → "Opciones de privacidad de los anuncios"**: solo donde Google lo pide (por ejemplo, en Europa).

### Quién los ve

- **Solo en la app de Android y solo desde los 13 años.** Menores de 13 y edad desconocida: la app **nunca** inicia AdMob.
- **Menores de 18**, o una cuenta en línea sin la fecha en ese teléfono: anuncios no personalizados y con contenido "con guía de los padres".
- **La web y Microsoft Store** no tienen anuncios.

### Para quien programa

- `js/ad-rules.js` (las reglas, con 5 pruebas de lógica), `js/ads.js` (el complemento `@capacitor-community/admob` 8.4.0) y `js/ui/ads-ui.js`.
- `E.adGems`; `E.revivePet(s, now, { via: 'ad' })`.
- `NATIVE.adMob()` devuelve `{ api }`. El complemento de Capacitor responde también a `then`, así que devolverlo solo desde una función async dejaba la app esperando para siempre.
- `tools/app-android.mjs` pone el ID de la app de AdMob en `AndroidManifest.xml` (el de prueba si está vacío).
- `openDialog`: `validate(btn)` recibe el botón (para "1 de 2").
- **Privacidad:** `privacidad.html` (ES/EN) explica los anuncios. `docs/google-play/FICHA.md` tiene lo nuevo de "Seguridad de los datos" y del ID de publicidad.
- **Pruebas nuevas:** `tests/e2e_anuncios.py`, con Capacitor, AdMob y Supabase simulados.

## v4.5.2: entrar más rápido, la racha se ve y el plan de anuncios

**Antes de publicar:** vuelve a pegar tu clave del sitio de Turnstile en `js/config.js`. Esta versión **no** cambia el servidor: no hay que correr `schema.sql`.

### Entrar es más rápido

- **"Conectando…" ya no espera a Cloudflare.** Antes, al tocar "Entrar", la app recién ahí cargaba Turnstile y esperaba su token, que en Android puede tardar varios segundos. Ahora lo pide **mientras escribes** el correo o la contraseña (`js/captcha.js`). Al tocar "Entrar" ya está listo, y solo se espera a Supabase.
  - Pasa en: Inicia sesión, Crear cuenta (al escribir el correo), Conectar, Volver a entrar y ¿Olvidaste la contraseña?.
  - **Menores de 13: nunca.** Escribir un correo en su registro no carga nada de Cloudflare.
  - Cada token sigue sirviendo una sola vez. Si pasan más de 4,5 minutos, se pide otro solo.
- **También se abre de antemano la conexión con Supabase** (sin enviar nada).
- **Si Cloudflare no responde**, la app sigue a los 30 s (antes, 90 s). Si muestra la casilla, espera a que la toques.
- **Cuánto tardó cada parte** sale en la consola: `[FrostPom] /token: CAPTCHA 3 ms, servidor 640 ms`. En el celular se ve con `chrome://inspect`.
- **Después de entrar dice "Trayendo tu progreso…"**, para que se note que avanza.

### Los avisos de las ventanas: verde mientras avanza, rojo si falla

- **"Conectando…", "Creando tu cuenta…", "Enviando…", "Comprobando…" y "Guardando…"** se ven en **verde y con una ruedita**. Los errores siguen en rojo.
- **Los lectores de pantalla** leen el avance sin interrumpir. Los errores siguen siendo alertas.
- **"¡Hola de nuevo!"** dice "Comprobando…" mientras revisa la contraseña.

### La racha se ve

- **El primer día de una racha** sale una vista con el **fuego encendiéndose** y **"+1 día de racha"**.
- **A los 5, 10, 20, 50, 100, 200 y 365 días**, la vista sale con el fuego **cada vez más grande**: más llamas, más chispas y, desde los 100 días, dorado.
- **Los demás días** sale un aviso corto.
- **La llama** es el dibujo de la fogata de la entrada: es vectorial y se ve nítida aunque crezca.
- **Si la racha se apagó ayer** (faltaron 1 o 2 días y era de 2 días o más), al abrir la app sale **tu compañero llorando junto al fuego congelado**. Se puede **revivir por 100 gemas por cada día que faltó**. Los días que faltaron quedan "congelados":
  - cuentan para la racha;
  - no cuentan como días estudiados;
  - en el calendario llevan el fuego congelado.
- **La vista sale una sola vez.** Después, la opción sigue en Progreso, en la tarjeta de la racha.
- **El botón "Ver un anuncio y revivirla"** ya está programado y aparece cuando se enciendan los anuncios.
- **Sin estudiar hoy**, el fuego del HUD y de la tarjeta de la racha se ve **congelado** (el dibujo que enviaste). Antes se veía en gris.

### Otros arreglos

- **Crear cuenta en el celular:** el 🌐 ya no queda pegado a "Busca tu país…". Una regla del celular le quitaba el espacio.
- **Calendario:** el día que cumpliste la meta del polo usa **"congelada"** (el dibujo que enviaste) en vez del copo.
- **Calendario, tema oscuro:** el número de hoy (sin estudio) ya no se pierde sobre el círculo claro.

### Anuncios: plan para aprobar

- **`docs/ANUNCIOS.md`** tiene el plan completo:
  - quién los ve: nunca los menores de 13;
  - qué formato va en cada lugar;
  - las reglas de Google Play para apps con niños;
  - AdMob y lo que cambia en Play Console;
  - las 5 decisiones que te tocan.
- **`js/ads.js`** existe, pero está apagado. No carga nada.

### Para quien programa

- `G.isStreakDay` (estudiado o congelado), `G.lostStreak`, `G.streakTier`, `G.STREAK_MILESTONES`, `E.reviveStreak` y el evento `streak` en `applyStudy`. `emptyDay()` tiene `frozen`.
- **Cuidado al mezclar versiones:** una versión vieja descarta `frozen`. Si una racha se revive en la v4.5.2 y otro aparato con la v4.5.1 guarda encima, ese día puede perder lo de congelado.
- `CAPTCHA.warm(n)`, `CLOUD.warmAuth(n)`, `CLOUD.warmOnInput(campos, n, permitido)` y `CLOUD.preconnect()`.
- Pruebas nuevas:
  - `tests/e2e_racha.py`;
  - sección F de `tests/e2e_captcha.py` (el token listo de antemano y el verde);
  - 5 pruebas de lógica.

## v4.5.1: arreglos de la prueba cerrada (cuentas, ranking, reloj en vivo y nombres)

Arreglos de lo que reportaron los usuarios de la prueba cerrada de Google Play. El diagnóstico completo y las consultas para revisar casos están en `docs/DIAGNOSTICO-CUENTAS.md`.

**Antes de publicar:**

1. Haz la copia de seguridad (`docs/COPIA-DE-SEGURIDAD.md`).
2. Corre el `server/supabase/schema.sql` nuevo en Supabase.
3. Activa Realtime (`docs/MULTI-DISPOSITIVO.md`, sección 10).
4. Vuelve a pegar tu clave del sitio de Turnstile en `js/config.js`.

### Inicio de sesión y cuentas

- **"El correo o la contraseña no coinciden":** casi siempre era una cuenta que vive solo en el computador (por ejemplo, con el correo de recuperación de una versión vieja). Ahora la pantalla explica qué hacer: abrir la app en ese equipo y tocar **Conectar**. "Demasiados intentos" ya no habla de códigos, y el CAPTCHA, sin internet y "no coinciden" tienen mensajes distintos.
- **Recuperar la contraseña sin progreso en línea:** antes pedía "Elige tu nombre de usuario" y la persona empezaba de cero con otro nombre. Ahora dice **"Tu progreso todavía no está en línea"**, con su nombre del ranking y los pasos para traerlo. La persona elige:
  - **"Lo conecto en mi otro equipo"**: la contraseña NO se cambia y el computador sigue funcionando.
  - **"Empezar de cero aquí"**: se propone su mismo nombre.
- **Al pedir el código**, avisa que si no llega puede que ese correo no tenga cuenta en línea. Supabase no lo dice, por privacidad.
- **"Conectar"** ya no deja la cuenta "en línea" con otra contraseña si no pudo guardarla. Si la contraseña de FrostPom no cumple las reglas de las cuentas en línea, pide una nueva.
- **Si el equipo guardaba en OTRA cuenta** (conectó con un correo distinto al de recuperación), al abrir lo detecta. Ya no sube nada allá y pide entrar con la suya: el progreso, la sesión y el lugar del ranking pasan a su cuenta. Si la contraseña en línea no coincide, se puede entrar con un código del correo.
- **Tocar "Entrar" muchas veces** mientras dice "Conectando…" ya no lanza varios intentos a la vez. Esos intentos podían cerrar la ventana siguiente y desarmar la pantalla. Lo mismo vale para todos los botones que comprueban algo.

### Ranking

- **Cambiar o recuperar la contraseña en otro equipo** cierra las demás sesiones (lo hace Supabase). Antes, en una cuenta solo del computador, la app creaba una sesión **anónima nueva**: aparecías como otra persona, tu nombre "ya existía" (el dueño eras tú) y tus horas iban a otro lado. Ahora:
  - no crea nada;
  - al abrir explica **"Vuelve a conectar tu lugar en el ranking"**, con dos salidas: conectar la cuenta o recibir un código;
  - tus pomodoros sin enviar se guardan para después.
- **Conectar, entrar de nuevo o crear la cuenta** siempre deja la sesión en TU cuenta. Antes, si fallaba el paso del lugar del ranking, se quedaba la sesión anónima y el progreso no se guardaba. Si no se pudo pasar tu lugar (sin internet), se reintenta solo al abrir la app.
- **Si las dos sesiones tenían perfil**, al unirlas queda tu nombre de este equipo.
- **La vista Ranking dice la causa real** cuando un pomodoro no sumó: sin internet al empezar, sesión cerrada, otra cuenta, muchos seguidos, terminado en otro equipo… Antes decía "✓ suma" aunque no estuviera sumando.
- **En "Ese nombre ya está en el ranking"**, una cuenta en línea ahora recibe los pasos para recuperarlo sola: Conectar en el otro equipo con el mismo correo.

### Reloj en vivo: de 15 a 20 s a 1 o 2 s

- **Con Supabase Realtime**, el servidor **avisa al instante** a tus otros aparatos por un canal privado de tu cuenta (`js/realtime.js`, sin librerías). El aviso solo dice "algo cambió" y el aparato pregunta al servidor, que sigue mandando.
- **Al tocar se envía enseguida.** Guardar el progreso también avisa.
- **Si el aviso no llega**, se sigue preguntando cada 10 s como antes. Con los avisos funcionando, la pregunta de respaldo es cada 30 s.
- **La conexión solo está abierta mientras se ve la app.** La CSP permite `wss://` al proyecto de Supabase.

### Nombres (riesgo legal: hay niños)

- **Pasaron "PoossyDestroyer" y "Jeffery_Epstein".** El filtro ahora compara también la forma "sonora" del nombre (`oo`→u, `ph`→f, `y`→i, sin letras repetidas…), lee el 1 como i o como l, cambia letras parecidas de otros alfabetos (cirílico, griego) y tiene una lista mucho más amplia en español e inglés:
  - groserías;
  - contenido sexual;
  - drogas;
  - odio y discriminación;
  - violencia y autolesiones;
  - criminales y abusadores conocidos;
  - suplantación.
- **Para no bloquear nombres inocentes**, hay una lista de permitidos ("Maricarmen", "Georgia", "Vergara", "Matsushita", "Badminton"…) y una lista de prueba de 385 nombres que usan la app y el servidor (`tests/_nombres.json`). Además, "Kike" (Enrique) ya no se bloquea.
- **Las mascotas** usan el mismo filtro.
- **Una cuenta vieja con un nombre que ahora no se permite NO se pierde.** Al abrir pide **"Elige un nombre nuevo"**; la cuenta, el progreso y los minutos siguen igual.
- **En el servidor**, al correr el schema, los nombres ya guardados que el filtro no permite se **esconden solos** del ranking. Vuelven a aparecer cuando la persona elige uno permitido. Revisa la lista con `select * from private.review_names();`.
- **Para que las listas de la app y del servidor no se separen**, se generan con `node tools/nombres-sql.mjs`. Una prueba revisa que sean iguales.

### Otros arreglos

- **El pescado ya no se queda pegado** en la pantalla al dárselo muy rápido en el computador, ni sigue ahí al cambiar de vista. Mientras arrastras, la bandeja no se rehace, el arrastre se sigue en toda la ventana y al cambiar de vista se cancela.
- **Los animales ya no caminan en el aire** en el celular, sobre todo en la app de Android con la barra de gestos. El paisaje se sube lo justo para que caminen sobre la nieve.

### En el servidor (`server/supabase/schema.sql`)

- **`account_status()`:** para la app. Dice, con tu sesión, si tu cuenta tiene progreso guardado y tu nombre y minutos en el ranking.
- **`private.account_check('correo')`:** para ti, en el SQL Editor. Cómo está una cuenta, en palabras simples.
- **`private.move_name`** ahora guarda la XP más alta al unir dos perfiles.
- **`private.review_names()`**, la columna `auto_hidden`, y `set_profile` vuelve a mostrar a quien cambió un nombre escondido por el filtro.
- **`private.notify`:** los avisos de Realtime en `set_timer` y `save_progress`, y la política de `realtime.messages`.
- **Se puede volver a correr** las veces que quieras.

### Pruebas

- **`tests/e2e_cuentas.py`, sección H:**
  - la cuenta solo del computador (de "no coinciden" a conectar y entrar en el celular con todo su progreso);
  - la sesión que se cerró en otro equipo (sin perfil anónimo nuevo);
  - el equipo que guardaba en otra cuenta;
  - tocar "Entrar" 6 veces;
  - nombres prohibidos y una cuenta vieja con nombre prohibido.
- **`tests/e2e_multidispositivo.py`, sección 7:** los avisos al instante y la pregunta de respaldo.
- **`tests/e2e_mascota.py`, sección L2:** el pescado.
- **`tests/logic.test.js`:** los nombres de los dos lados, las listas iguales a las del servidor y que la cuenta con nombre prohibido no se pierda.
- **`server/supabase/test/tests.sql`:**
  - nombres con la misma lista de prueba;
  - `review_names`;
  - `account_status` y `account_check`;
  - `move_name`;
  - Realtime: avisos, solo tu canal, sin avisos falsos y sin Realtime.
- **`tests/visual.py`:** hay fotos de referencia nuevas, porque en la nube cambió cómo se dibujan las letras. Comparada con la v4.5.0 en el mismo equipo, la tableta y el computador salen idénticos; en el celular solo cambia la parte de abajo (la nieve). En tu PC, vuelve a tomar las tuyas con `python tests/visual.py --update`.

## v4.5.0: tu cuenta en todos tus aparatos (y Android, listo para compilar)

El autor aprobó las fases 4 y 5 (`docs/MULTI-DISPOSITIVO.md` y `docs/ANDROID-NOTIFICACION-WIDGET.md`) para tenerlas listas y publicarlas como actualizaciones durante la prueba cerrada de Google Play.

**Antes de publicar:** haz la copia de seguridad (`docs/COPIA-DE-SEGURIDAD.md`) y corre el `server/supabase/schema.sql` nuevo en Supabase. Si no lo corres, la app funciona como la v4.4.1 (cada aparato con su reloj) y en F12 sale el aviso "El reloj en vivo no está disponible todavía".

### El reloj en vivo (solo cuentas en línea)

- **El mismo pomodoro en todos tus aparatos:** empiezas en el computador y el celular muestra la misma cuenta regresiva en menos de 12 s. Puedes pausar, continuar, saltar, reiniciar o terminar desde cualquiera.
- **Se nota de dónde vino:** un aviso corto, por ejemplo "Pausado desde otro aparato" o "Empezado desde otro aparato". Solo de cambios recientes (al abrir la app no salen avisos viejos) y no cuando lo siguiente empezó solo.
- **Cómo se entera:** pregunta cada 10 s mientras la app se ve (también con la ventanita "Siempre encima"), al abrirla, al volver a ella y al recuperar el internet. Gana la **acción más reciente**.
- **La hora del servidor manda:** cada aparato mide cuánto se adelanta o atrasa su reloj, así que todos muestran lo mismo aunque la hora del teléfono esté mal.
- **Sin internet** funciona igual: lo que tocas queda anotado con su hora y se envía al volver.
- **Las cuentas solo de este aparato** (menores de 13) siguen exactamente como antes.

### Un pomodoro se guarda una sola vez

- Cuando el bloque llega a cero en dos aparatos a la vez, el servidor (`claim_block`) dice "sí" a uno solo: ese guarda la XP, los minutos y el ranking. El otro avisa **"Sesión completa: se guardó desde tu otro aparato."** y sigue con lo que hizo el primero.
- **Sin internet**, el aparato lo guarda igual y pregunta después. Si otro ya lo había guardado, la mezcla del progreso (abajo) lo cuenta una sola vez apenas se juntan las dos copias (por un momento, ese aparato muestra la XP de más).
- Cada bloque tiene un número y la sesión del historial usa ese número: el mismo pomodoro **nunca** se guarda dos veces en el mismo aparato.
- **Al abrir la app** con un bloque que "terminó" mientras estaba cerrada, primero se pregunta al servidor (y, en Android, se aplica lo que tocaste en la notificación): si lo pausaste o lo terminaste antes en otro lado, no se guarda como completo.

### Ranking sin abandonos

- Solo el aparato que **empieza** el bloque crea la sesión del ranking; su número viaja con el reloj. El que lo guarda la termina, aunque no la haya empezado. Antes, empezar en otro aparato "abandonaba" la sesión del primero.

### El progreso, sin pérdidas: la mezcla de tres copias (`js/merge.js`)

- Antes, si dos aparatos guardaban a la vez, ganaba **entera** la copia con más tiempo estudiado (se perdía, por ejemplo, un tema comprado en el otro). Ahora cada aparato recuerda la última copia que sincronizó (la "base", `st2_sync_base`) y se juntan los cambios de los dos:
  - XP, gemas, totales y cada día del calendario: base + lo que sumó (o restó) cada uno; nunca bajan de 0.
  - Historial: se une por número de sesión; lo que uno quitó, queda quitado.
  - El mismo pomodoro guardado en los dos (sin internet): se cuenta una vez.
  - Logros, misiones, temas y regalos se unen; mejor racha, mejor combo y sesión más larga: el mayor.
  - Combo, ciclo y "descanso ganado": del aparato que estudió de último.
  - Mascotas: cada una aparte (la comida no se pierde y el nombre que se puso tampoco).
  - Ajustes y perfil: gana el que cambió; si cambiaron los dos lo mismo, el más reciente.
  - Temporada: gana la más nueva; la XP de la temporada vieja va a la temporada archivada, y el premio de cerrar la temporada cuenta una vez.
  - Premium: activo si está activo en cualquiera.
- **La primera vez** que un aparato sincroniza con la v4.5 no hay base: se usa la regla de antes una última vez.
- **Lo que hiciste mientras se esperaba al servidor tampoco se pierde:** se junta con lo que llegó y se vuelve a subir.
- **El progreso de otro aparato llega solo:** cada vez que pregunta por el reloj, el servidor dice también la versión del progreso; si otro aparato guardó algo (XP, gemas, una compra), se trae y se junta sin avisos.

### En el servidor (`server/supabase/schema.sql`)

- Tablas `private.timers` (el reloj de cada cuenta) y `private.timer_claims` (qué bloques ya se guardaron), con RLS y sin políticas: solo se usan con las funciones `get_timer`, `set_timer` y `claim_block`, y solo cuentas con correo.
- Límites: 30 cambios por minuto por persona, 500 bloques anotados; los bloques anotados se borran a los 3 días y los relojes sin uso, a los 400. Se borran con la cuenta y salen en "exportar mis datos".
- **Privacidad:** no se guarda ningún identificador del aparato. Cada acción lleva un número al azar NUEVO (solo sirve para reconocer un reintento). `privacidad.html` lo explica (ES e inglés).

### Android: la notificación en curso y el widget (fase 5, listo para compilar)

- **La parte web ya está en esta versión** (`js/native.js`, `js/ui/native-ui.js`): le cuenta al teléfono cada cambio del reloj, aplica con su hora lo que se tocó en la notificación o en el widget (también con la app cerrada), deja de programar el aviso del final con LocalNotifications cuando el complemento lo hace, y pide **una vez**, después del primer pomodoro completo, el permiso "Alarmas y recordatorios" con una explicación.
- **El código nativo** (Kotlin) está en `native/frostpom-timer/`: notificación en curso con la cuenta regresiva y los botones Pausar/Continuar, Saltar y Terminar y guardar; widget 4 × 2 y 2 × 2 con el diseño del mockup y el arte `artico-amigos`; aviso exacto si hay permiso; botones con la app cerrada; vuelve después de reiniciar el teléfono. Sin servicio en primer plano y sin `USE_EXACT_ALARM`.
- **Todavía no está activado:** se activa y se prueba con Claude Code en tu PC (`native/frostpom-timer/LEEME.md` trae el mensaje para pegar). Eso será la v4.6.0. Mientras tanto, la app de Android funciona como la v4.4.1.

### Limitaciones conocidas

- Un aparato que no se está viendo (el celular en el bolsillo) no pregunta. Si pausas en el computador, el aviso del final del celular puede sonar igual; al abrir el celular, el reloj se corrige.
- En una mezcla rara sin internet (los dos aparatos subieron de rango con el mismo pomodoro), pueden sobrar unas gemas del premio por subir de rango.
- "Terminar y guardar" desde la notificación con la app cerrada se cuenta (XP y ranking) cuando abres la app.

### Pruebas

- `tests/e2e_multidispositivo.py` (nuevo, 51 comprobaciones): dos navegadores con la misma cuenta y el servidor simulado: empezar en A y verlo en B; pausar en B y que A se pause; llegar a cero en los dos y guardarlo una vez (XP, historial y ranking); "Terminar y guardar" en B; los dos sin internet (se suman los minutos, no se pierde la compra y el pomodoro que terminó en los dos se cuenta una vez); el servidor sin la v4.5.
- `tests/e2e_android.py`, sección F (15 comprobaciones nuevas, 60 en total) con el complemento FrostTimer simulado.
- **Pruebas visuales:** se tomaron las 315 fotos de la v4.4.1 en Linux y se compararon con la v4.5.0: **las 315 salen idénticas** (esta versión no cambia nada de lo que se ve, salvo los avisos nuevos). No hace falta volver a tomar fotos por esta versión.
- `tests/logic.test.js`: 13 pruebas nuevas (90 en total): la mezcla, el reloj compartido, qué hacer con lo que tiene el servidor, las acciones sin enviar, la sesión y que cada módulo de la app quede guardado para usarla sin internet (`store_check.py` encontró que faltaba `js/merge.js`).
- Servidor: 9 comprobaciones nuevas del reloj en vivo en `server/supabase/test/tests.sql` (50 en total).
- Kotlin: `native/frostpom-timer/android/src/test/…/TimerStateTest.kt` (4 pruebas; pasan en la JVM).
- `tests/_fake_supabase.py` simula `get_timer`, `set_timer` y `claim_block`, con el reloj del servidor que la prueba adelanta junto con los aparatos.

## v4.4.1: "Siempre encima" (el reloj encima de las otras ventanas)

El autor pidió poder dejar el reloj **siempre encima** de las demás ventanas, con dos íconos suyos (el pin y el pin tachado). La ventanita sigue el mockup de su widget.

- **El botón del pin**, arriba a la derecha del reloj en Enfocar (solo en el computador). Al tocarlo se abre una **ventanita que queda encima de todas las ventanas** de Windows (o de Mac/Linux), aunque estés en Word o en una clase en línea. Mientras está abierta, el botón muestra el pin tachado; tocarlo la cierra.
  - Usa *Document Picture-in-Picture*, que tienen Chrome y Edge desde la versión 116. La app de Microsoft Store corre en Edge, así que también debería tenerla (compruébalo al instalarla).
  - En `docs/microsoft-store/FICHA.md` se agregó a las características: "Reloj siempre encima de tus otras ventanas".
  - En el celular, en Safari y en navegadores sin esa función el botón no aparece. En Android, lo equivalente será la notificación y el widget de la fase 5.
- **La ventanita**, como el mockup:
  - de noche con la aurora y, a la derecha, los animales junto a la fogata;
  - a la izquierda, una tarjeta con "MODO ENFOQUE" (o "DESCANSO"), la hora, una frase ("Hora de concentrarse", "En pausa"…) y la barra con **tu compañero encima**, que avanza con el pomodoro (o su tumba, si se murió de hambre);
  - un globito: "¡Estudiando juntos!", "¿Empezamos?", "¡A descansar!".
- **Sus cinco botones** hacen lo mismo que los de Enfocar: ▶/⏸ empezar o pausar (también con la barra espaciadora), ⏮ reiniciar el bloque, 🔁 "lo siguiente empieza solo" (el mismo ajuste de Ajustes; dorado = encendido), ⏭ saltar y ✓ terminar y guardar. El pin tachado de la ventanita también la cierra.
- **Se ajusta a cualquier tamaño:** se puede agrandar. Si queda angosta, la tarjeta ocupa todo el ancho; si queda bajita, solo quedan la hora, la barra y los botones.
- **No se atrasa:** si la ventana principal está minimizada, el navegador la frena y el pomodoro terminaría tarde. Mientras la ventanita está abierta, ella revisa el reloj 4 veces por segundo, y los avisos de la app ("Necesitas al menos 1 minuto…", "¡Sesión completa!") también salen en ella.
- **Los íconos del pin** son los que entregó el autor, pasados a trazos (SVG) para que se vean nítidos y tomen el color del tema.
- **Premium en Android (antes de subir a Google Play):** si algún día se enciende el cobro de Microsoft Store, la app de Android **no** lo usa. Antes, diría "instala FrostPom desde Microsoft Store", y Google Play prohíbe mandar a pagar por fuera. En Android, Premium sigue en modo prueba (gratis) hasta tener Google Play Billing (fase 6).
- **Planes para aprobar** (sin código todavía):
  - `docs/MULTI-DISPOSITIVO.md` (fase 4: reloj en vivo entre aparatos y mezcla del progreso sin pérdidas);
  - `docs/ANDROID-NOTIFICACION-WIDGET.md` (fase 5: notificación tipo Spotify y widget con el diseño del autor);
  - `docs/GOOGLE-PLAY-BILLING.md` (fase 6: cobrar Premium en Android).
- **Pruebas:**
  - `tests/e2e_encima.py` (29 comprobaciones):
    - el botón aparece solo en el computador y no tapa la hora ni la tienda;
    - la ventanita carga sus estilos y su paisaje, tiene los cinco botones y la hora es la misma de la app;
    - cada botón mueve el reloj de la app;
    - los avisos salen en ella;
    - se cierra desde los dos pines;
    - en inglés habla inglés;
    - sin errores en la consola.

  Ojo: esa prueba no usa el servidor simulado, porque Playwright deja de cargar los archivos de la ventanita cuando intercepta las peticiones.
  - `tests/e2e_mascota.py`: "la fogata se ve de noche" fallaba a veces. La prueba pone la noche a mano, pero la app, cada minuto, vuelve a poner la fase según la hora real; si ese minuto caía justo ahí, la noche se quitaba. Ahora la prueba vuelve a poner la noche si la app la quitó y espera a que termine el cambio de día a noche (hasta 12 s) en vez de un tiempo fijo.
- **Pruebas visuales:** el pin aparece en las fotos del computador (`escritorio-*`). Hay que volver a tomar esas fotos **en el computador del autor**, porque las letras se dibujan distinto en Windows y en Linux (ver `docs/PRUEBAS-VISUALES.md`).
  - Cómo se comprobó aquí: se tomaron fotos de la v4.4.0 sin tocar en Linux y se compararon con la v4.4.1. Las 252 fotos de celulares y tableta salen idénticas; en el computador cambian solo las 17 pantallas donde se ve Enfocar (inicio, corriendo, bandeja, tumba y el diálogo del nombre encima), y lo único distinto es el botón del pin.

## v4.4.0: los estilos, ordenados (la app se ve igual)

Nada cambia en la pantalla: las 315 fotos de `tests/visual.py` salen idénticas. Lo que cambió es por dentro. `css/styles.css` tenía unas 2.800 líneas con arreglos apilados versión tras versión (un bloque de la v3.7 que cambiaba lo de la v3.1, otro de la v4.3 que cambiaba lo de la v3.7…). Por eso, al tocar algo en un lugar, se dañaba otra cosa en otro.

- **Seis archivos en vez de uno**, que se cargan en este orden: `tokens.css` (las variables: colores, bordes redondeados, sombras y espacios, del tema claro y del oscuro), `base.css` (letras, la página y los campos del navegador), `layout.css` (el contenedor, las vistas y sus rejillas), `components.css` (una sección por componente: la barra de arriba, el menú, el reloj, el compañero, la tienda, las ventanas, el ranking, las tarjetas…), `scenery.css` (el paisaje, los animales y el paisaje de entrar) y `utilities.css` (ayudas sueltas, las pausas para que el celular vaya rápido y "Menos animaciones"). `css/legal.css` sigue aparte.
- **Un mapa** al principio de `tokens.css` dice dónde vive cada cosa y por qué importa el orden.
- **Los puntos de quiebre, juntos:** antes había 25 bloques `@media` repartidos por todo el archivo. Ahora, al final de cada archivo hay un solo bloque por punto de quiebre (computador, celular, celular de pie, celular bajito y unos pocos ajustes finos), siempre en el mismo orden.
- **Una regla por cosa:** las reglas que se pisaban unas a otras se unieron en una sola (50 uniones), y se quitaron 175 propiedades que nunca se veían porque otra regla más abajo las cambiaba.
- **Lo que no se usaba, fuera:** 80 clases que ya no existen en `index.html` ni en el JavaScript (115 reglas enteras y 9 a medias, por ejemplo `.task`, `.streak`, `.showcase__rank` o `.avail`), 3 animaciones sin uso (`bob`, `flicker` y `hop-fox`) y 3 variables sin uso (`--polar-1`, `--polar-2`, `--polar-3`).
- **Variables nuevas** para valores que se repetían: `--r-pill` (999px), `--r-round` (50 %), `--shadow-chip`, `--gold-edge`, `--cream`, `--good-text` y una escala de espacios `--sp-1` a `--sp-10` para los `gap`. Cada una vale exactamente lo mismo que el número que reemplaza.
- **Comentarios:** se quedan los que explican *por qué* existe algo y se quitaron las marcas de versión ("v3.7 —", "(v4.3.1)"…): esa historia ya está en este archivo.
- **Cómo se comprobó que se ve igual:** se hizo en 5 pasos, y después de cada uno corrió la prueba visual completa (315 fotos, todas iguales). Además, una comparación del estilo calculado de **cada elemento** de las 315 pantallas contra la hoja original, y una revisión que calcula, para cada selector y cada tamaño de pantalla, qué regla gana.
- **Pruebas:** `npm test` comprueba que cada CSS de `index.html` existe, va en el orden correcto, está en el `PRECACHE` del service worker y no usa `@import`, y que ya nadie pide `css/styles.css`.

## v4.3.3: pruebas visuales (fotos de cada pantalla)

Nada cambia en la app: esta versión agrega una prueba que **mira** la app, para pillar los errores que se ven (un botón encima de otro, un texto cortado, un color que cambió sin querer) antes de que lleguen al celular.

- **`tests/visual.py`** abre la app en un navegador de verdad y le toma una foto a cada pantalla: las puertas de entrada (crear cuenta, iniciar sesión, "¡Hola de nuevo!"), Enfocar quieto y con el reloj corriendo, la bandeja de comida, las 7 ventanas del celular (Duración, Tu estudio, Historial, Compañeros, Temporadas, Temas, Logros), Progreso, Ranking (la lista y la tarjeta de estado), Perfil, Ajustes, 8 diálogos y la tumba de la mascota. Cada foto se compara, punto por punto, con la foto aprobada.
- **En 12 combinaciones:** celulares de 360 × 640, 384 × 832 y 412 × 915, tableta de 768 × 1024 y computador de 1366 × 768, con tema claro y oscuro, en español; y en inglés en un celular y en el computador. Son **315 fotos** y tarda unos 6 a 7 minutos.
- **Siempre sale la misma foto:** la fecha y la hora están fijas (martes 10 de marzo de 2026, 10:00 a. m.), "Menos animaciones" está encendido, los datos son siempre los mismos, el servidor es el simulado, el azar siempre da los mismos números, y se tapa lo que se mueve al azar (la nieve, los animales que caminan y sus globos, el confeti y los avisos).
- **Si algo cambió**, la prueba falla, dice cuáles pantallas y deja en `tests/visual/out/` tres imágenes de cada una: la esperada, la actual y la diferencia (lo que cambió, en fucsia). Se perdona un cambio de color muy pequeño en un punto (hasta 24 de 255) y que cambien hasta 40 puntos (menos que una letra).
- **Cómo se usa:** `npm run test:visual` compara; `npm run test:visual:update` vuelve a tomar las fotos aprobadas (solo después de que el autor apruebe un cambio visual). La guía corta está en `docs/PRUEBAS-VISUALES.md`.
- **Las fotos aprobadas** viven en `tests/visual/baseline/` (315 archivos, unos 49 MB) y se suben a GitHub; `tests/visual/out/` no se sube.
- **Un error viejo en `package-lock.json`:** al subir la versión de la app en la v4.3.1 y la v4.3.2 se cambió por accidente la versión anotada de una librería de desarrollo (`ansi-styles`, que es la 4.3.0), y la versión de la app en ese archivo seguía en 4.2.0. Ya quedaron bien las dos. No afectaba a la app.

## v4.3.2: dos arreglos visuales

- **La barra de abajo dejaba un hueco a la derecha.** La barra estaba hecha para 5 pestañas (`repeat(5, 1fr)`), pero desde que Ajustes vive dentro de Perfil son 4, y la quinta columna quedaba vacía. Ahora la barra reparte el espacio entre las pestañas que haya, sean las que sean (`grid-auto-flow: column`). En el computador el menú sigue en una sola columna a la izquierda, y al abrir una ventana la barra se sigue escondiendo.
- **El botón de la tienda tapaba la cara del compañero.** Estaba abajo a la derecha del reloj, encima del zorro. Ahora está al lado contrario (abajo a la izquierda, en espejo), en todas las pantallas y también con la bandeja abierta (cuando el reloj se achica). El "!" de hambre, su animación, el orden del teclado y arrastrar la comida siguen igual.
- **El sol de día se veía como una mancha detrás de "Silencio"** en el celular (en 412 × 915 quedaba justo detrás del botón). En el celular de pie se corre a la derecha, al borde de la pantalla, sin tocar los botones. En el computador no cambia.
- **Una ventana que salía chiquita en Progreso.** Si tocabas "Tu estudio" o "Historial" justo al llegar a Progreso (en el primer cuarto de segundo, mientras la sección aparece con su animación), la ventana salía corrida y pequeña, atrapada dentro de la sección, hasta que la animación terminaba. Ahora, con una ventana abierta, esa animación no corre. (La prueba `e2e_smoke.py` "Tu estudio se abre encima de todo" fallaba a veces por esto.)
- **Pruebas:** `e2e_mascota.py` comprueba en 360 × 640, 384 × 832, 412 × 915 y 1280 × 800, con la bandeja cerrada y abierta, que el botón de la tienda no se monta sobre el compañero ni sobre su nombre; que las 4 pestañas llenan la barra parejo; y que el sol de día no toca los botoncitos en el celular.

## v4.3.1: tres arreglos del celular

- **Entrar y crear cuenta:** la ventana quedaba muy bajita (46 % de la pantalla). Ahora se apoya 16 px por encima de la cabeza del oso (arriba queda el cielo) y crece hacia arriba hasta el 65 % de la pantalla, así que los animales y la fogata se ven enteros y el formulario muestra más campos sin deslizarse (en un celular de 360 × 640 llega hasta "Correo"; "Inicia sesión" cabe completo).
- **Ponerle nombre al compañero es más fácil:** si no tiene nombre, al tocarlo se abre "Ponle nombre a tu compañero" (antes solo desde el lápiz de la tienda). Con nombre, tocarlo lo hace hablar, y la tumba sigue abriendo la tienda para revivirlo. Además, sin nombre, de vez en cuando (más o menos 1 de cada 4 frases, nunca dos seguidas) dice "¡Todavía no tengo nombre! Tócame para ponerme uno." (tres frases, en español e inglés).
- **La tienda ya no tapa al compañero:** en el celular la bandeja es más baja (hasta 38 % de la pantalla: la comida va en una sola fila que se desliza de lado, y con el dedo hacia arriba se arrastra hasta la mascota; los compañeros, más pequeños). Mientras está abierta (`html.tray-open`), el reloj se achica lo justo para que el compañero y su nombre queden enteros encima de ella (en 360 × 640 el reloj queda de 170 px y la hora se lee bien; en 412 × 915 no cambia). En el computador nada cambia.
- **El paisaje del celular, más lejos:** el dibujo del fondo (1440 × 900) se recortaba a lo alto de la pantalla, así que en un celular de pie solo se veía un pedacito del ancho (unas 400 unidades en 412 × 915: el iglú enorme y todo amontonado). Ahora en el celular de pie se ven 900 unidades de ancho (el 62 %) y el degradado del cielo se estira hasta arriba; se ajusta solo al girar el teléfono. En el computador no cambia.
- **Freno al guardar en la cuenta (de la v4.3.0, se había perdido):** la app nunca intenta guardar más de una vez cada 5 s y, si el choque de versiones no se resuelve 3 veces seguidas, deja de intentar hasta que se vuelva a abrir (`js/sync.js`).
- **Pruebas:** `e2e_mascota.py` comprueba que tocar al compañero sin nombre abre el diálogo (y con nombre, no), el recordatorio del nombre (1 de 4, nunca dos seguidas, también en inglés) y, en 360 × 640, 384 × 832 y 412 × 915, que con la bandeja abierta el compañero y su nombre se ven y se le puede arrastrar la comida.

## v4.3: más paisaje en el celular (y el ranking que no sumaba)

El autor vio en su Android que casi no se veía el paisaje (muchos paneles encima) y que en la pantalla de entrar "no se veía nada". Además, un amigo estudiaba y sus minutos no llegaban al ranking.

- **Celular: menos paneles, más paisaje** (`js/ui/sheets.js`). En pantallas de menos de 900 px, varias secciones se esconden y en su lugar hay un botón; al tocarlo, la sección se abre encima como una ventana, con una **×** (también se cierra con Escape, con el botón atrás de Android y al cambiar de pantalla): **Duración** (un botón pequeño junto a Silencio que dice el modo, por ejemplo "Clásico · 25 + 5", y abre los modos abajo), **Tu estudio** e **Historial** (en Progreso) y **Compañeros**, **Temporadas**, **Temas** y **Logros** (en Perfil, cada botón con su dato: "1 de 5", "0 de 18"…). Enfocar queda con el reloj, tu compañero, el botón y dos botoncitos; sin un pomodoro en curso no se ven Terminar, Saltar ni Reiniciar; la barra de arriba es más delgada. En celulares bajitos el reloj se achica un poco. En el computador todo se ve como antes.
- **Entrar y crear cuenta en el celular:** un **dibujo vertical nuevo** del autor (la aurora, los animales y la fogata), con la fogata animada como en el computador (la llama y su centro se recortaron del dibujo: `tools/preparar_fondo_celular.py`). La ventana va arriba, es más pequeña y compacta (los dos botones lado a lado) y debajo se ven la aurora y los animales; si el formulario es largo, se desliza por dentro.
- **El compañero se elige en la tienda de comida** (arriba de la bandeja salen tus compañeros; tócalo y te acompaña ese). También se puede desde Perfil → Compañeros.
- **Un solo ajuste en vez de dos:** "Volver a estudiar solo" se quitó. Ahora "Al terminar el estudio o el descanso" tiene dos opciones: **Lo siguiente empieza solo** o **El reloj me espera**, para el estudio y para el descanso.
- **El ojito de la contraseña es de la app:** el de Edge desaparecía al salir del campo y había que borrar todo para que volviera (al crear la cuenta, no se podía revisar la primera contraseña desde "Repite la contraseña"). Ahora cada campo de contraseña tiene su ojito siempre.
- **Ranking: los minutos que no sumaban.**
  - *Cerrar sesión cerraba la sesión en todos los equipos* (así funciona Supabase si no se le dice otra cosa). En el otro equipo la app seguía como si nada, pero ya no guardaba el progreso ni sumaba en el ranking. Ahora "Cerrar sesión" cierra solo la de ese equipo (`/logout?scope=local`).
  - *Si la sesión de la cuenta en línea se cierra*, al abrir la app pide la contraseña ("Vuelve a entrar a tu cuenta"); antes solo lo decía Ajustes. Y ya no crea una sesión anónima para el ranking (con ella el servidor decía "ese nombre ya está ocupado", por la misma persona). Al volver a entrar, sigue en el ranking con su nombre.
  - *Se nota si suma:* el Ranking dice "✓ Tus pomodoros con internet suman en el ranking desde este dispositivo" o, si no, por qué y cómo arreglarlo. Si el servidor no anota un pomodoro, avisa (una vez al día) y queda una línea `[FrostPom]` en F12 → Consola.
  - Ya no aparece "El ranking global llega pronto" cuando el servidor falla: dice "No pudimos cargar…".
  - *Para el dueño* (`schema.sql`, hay que correrlo en Supabase): `private.ranking_check('nombre')` dice qué pasó con los últimos pomodoros de alguien, en palabras simples; `private.who_has_name` y `private.move_name` pasan un nombre atrapado en otra sesión a la cuenta con correo. Paso a paso en `docs/RANKING-GLOBAL.md` (pasos 6b y 6c).
  - "Borrar y usar otra cuenta" (cuenta solo del equipo) también borra su lugar en el ranking, para que el nombre no quede atrapado.
- **Otros arreglos:** la tienda de comida se cierra al cambiar de pantalla (al volver tapaba los botones de abajo).
- **Pruebas:** comprobaciones nuevas en `e2e_smoke.py` (ventanas del celular, ojito, elegir compañero en la tienda, entrada vertical), `e2e_cuentas.py` (cerrar sesión en un equipo no cierra el otro; si la sesión se cierra, pide volver a entrar sin crear una anónima) y `e2e_ranking.py`; `tests/_sheets.py` abre sola la ventana donde está lo que una prueba va a tocar. 4 pruebas nuevas del servidor (41 en total). Las capturas de Google Play se volvieron a generar.

## v4.2.1: rápida en el celular

El autor probó la app en su Android y se sentía lenta, sobre todo en la pantalla de entrar: hasta el teclado tardaba en poner las letras. Midiendo con el procesador 4 veces más lento (como un celular de gama media), la pantalla de entrada tenía el procesador ocupado más de la mitad del tiempo y la nevada fuerte de adentro, dos terceras partes. Las causas y lo que se hizo:

- **La nieve, en un solo dibujo** (`js/ui/snow.js`, `<canvas>`): antes cada copo era un elemento con su propia animación (hasta 150 en el paisaje y 40 con dos animaciones cada uno en la entrada) y el navegador recalculaba cada uno en cada cuadro. Ahora un solo dibujo se repinta unas 30 veces por segundo, con las mismas tres profundidades, el balanceo, el viento según el clima y la ceniza gris con contaminación. Se detiene sola cuando no se ve.
- **Con la pantalla de entrada abierta, la app de abajo no se pinta ni se anima** (antes seguía animándose aunque estuviera tapada). Lo mismo con cualquier ventana abierta: el paisaje borroso de atrás se queda quieto.
- **La fogata de la entrada** era un dibujo del tamaño de toda la pantalla que se volvía a pintar en cada cuadro. Ahora la llama, el centro, el brillo y las chispas son capas pequeñas que se mueven sin repintar (se ve igual: posiciones en % sobre el dibujo de 1920 × 1072).
- **Lo que no se ve no se anima:** la fogata del paisaje (con el oso y el zorro) y la luz del iglú solo de noche; el humo de la fábrica y el petróleo solo con contaminación; 2 ráfagas de viento con buen tiempo (las 5 con nevada).
- **Mientras escribes en el celular**, el paisaje, la fogata y la nieve se quedan quietos y vuelven a moverse 2 segundos después de la última tecla (`html.is-typing`, `main.js → watchTyping`).
- Resultado medido (procesador 4 veces más lento): pantalla de entrada de ~530 a ~180 ms de trabajo por segundo (~50 mientras escribes); nevada fuerte adentro de ~650 a ~300.

## v4.2: tu compañero siente hambre (y tiene nombre)

- **Corazones en bucle al comer (arreglo):** la animación de "salto" se aplicaba al mismo dibujo del pingüino y tapaba su animación de corazones: se quedaba en el primer cuadro. Ahora el salto va en una envoltura (`.buddy__body`) y los corazones hacen el ciclo completo una y otra vez mientras come (3,6 s, dos vueltas). El zorro, la foca y el tiburón estrenan sus corazones (4 cuadros); el oso polar salta contento (todavía no tiene animación de corazones).
- **Se le nota el hambre:** el compañero de Enfocar cambia de cara según su barriguita: **contento** (50 % o más), **triste** (25–49 %), **lloroso** (menos de 25 %), **llorando** con todo el cuerpo (en 0) y **débil** (pálido, el último día). Los cinco animales tienen su llanto de 5 cuadros (triste, ojos llorosos, berrinche, se seca las lágrimas, suspira). Con la barriguita en 0 dice "¡Buaaa! … hambre", la tienda tiene "!" y la bandeja dice cuánto tiempo le queda.
- **Se puede morir… y revivir:** si pasa **3 días seguidos con la barriguita en 0**, se muere y en su lugar queda una **tumba** (con su nombre). Avisa una sola vez. Tocar la tumba abre la tienda, que muestra el botón **Revivir por 30 gemas** (más o menos un día de misiones): vuelve con la barriguita a la mitad (50 %), con corazones. Muerto no se le puede dar comida.
- **Solo le da hambre al que está contigo:** al cambiar de compañero, el anterior "descansa" (su barriguita se congela) y el nuevo llega con 60 %. Así nadie encuentra una tumba al desbloquear o volver a elegir a otro animal. En el perfil, cada tarjeta muestra el nombre del animal y, si se murió, su tumba.
- **Nombre con etiqueta:** el lápiz de la tienda abre "Ponle nombre a tu compañero" (hasta 16 caracteres; letras, números, espacios y . , - ' ! ?; el mismo filtro de palabras feas de los nombres de usuario). Aparece encima de su cabeza en una etiqueta oscura y semitransparente con letra de píxeles (**Pixelify Sans**, licencia OFL, `assets/fonts/`), al estilo de los juegos de bloques. Cada animal tiene su propio nombre. Solo lo ves tú (no aparece en el ranking) y no se traduce.
- **Paisaje:** el **zorro camina** con su ciclo de 4 cuadros (antes era su dibujo con saltos) y **de noche asa un malvavisco** al otro lado de la fogata, junto al oso (5 cuadros: lo mira, se asoma, se le hace agua la boca, ¡se le quema!, se lo come).
- **Datos (v4 del estado):** cada mascota guarda `{ fullness, at, name?, rest?, dead? }` y hay un total nuevo, `revived`. Todo se valida al cargar (nombres incluidos). **Al actualizar desde la v4.1, el reloj de los 3 días empieza de nuevo:** nadie encuentra a su mascota muerta solo por actualizar (si estaba en 0, llora y tiene 3 días para comer).
- **Arte:** `tools/preparar_sprites.py` convierte las tiras del autor (fondo blanco) en las hojas de `assets/sprites/`: quita el fondo con bordes suaves, separa los cuadros (cada corazón o lágrima suelta va con su dibujo), deja cada animal del mismo tamaño y en el mismo lugar que su dibujo de siempre y borra las fogatas dibujadas del zorro. 11 hojas nuevas (≈ 600 KB en total, se guardan para usar sin internet).
- **Privacidad:** `privacidad.html` (ES/EN) menciona el nombre de la mascota (viaja con tu progreso; nadie más lo ve). En la ficha de Google Play, "Seguridad de los datos" suma "Otro contenido generado por el usuario".
- **Pruebas:** `tests/e2e_mascota.py` (60 comprobaciones) y 6 pruebas unitarias nuevas (76 en total).

## v4.1: lista para Google Play

- **Página para eliminar la cuenta sin la app** (`eliminar-cuenta.html`, ES/EN): nombra la app y al desarrollador (Startup Prometeus), explica cómo borrarla desde la app y tiene un botón para pedirlo por correo; dice qué se borra y qué se conserva. Google Play la exige a las apps con cuentas.
- **Normas de la comunidad** (`normas.html`, ES/EN): qué no puede tener un nombre de usuario, cómo se reporta y se oculta, y qué pasa si alguien no las cumple. "Crea tu cuenta" dice ahora "Al crear tu cuenta aceptas las normas de la comunidad y la política de privacidad" (los enlaces abren aparte para no perder lo escrito). En Ajustes, junto a la política de privacidad.
- **Reportar y ocultar en el ranking:** cada nombre de otra persona tiene **⋯** con **Reportar nombre** (motivo: ofensivo, suplantación, datos personales u otro) y **No ver más a esta persona** (solo en este dispositivo; "Mostrar de nuevo" al final del ranking). Quien reporta deja de ver ese nombre. Sin cuenta en línea (menores de 13), el reporte se ofrece por correo y no se envía nada al servidor.
- **Servidor (`schema.sql`, hay que correrlo en Supabase):** tabla `private.reports` y función `report_name()` (una vez por persona y nombre, máximo 20 al día, no revela si el nombre existe). Con 3 personas distintas el nombre se oculta solo. Para el dueño: `private.report_summary()`, y `hide_name(nombre, false)` ahora también borra sus reportes. La copia de datos incluye los reportes hechos; borrar la cuenta los borra; `cleanup()` borra los de más de 400 días. 10 pruebas nuevas (37 en total).
- **Modo app de Android (Capacitor 8.6):** `js/native.js` (lo único que habla con el teléfono) y `js/ui/native-ui.js`. Botón atrás (cierra la lista de países, la tienda o la ventana; Ajustes → Perfil → Enfocar; en Enfocar la app pasa a segundo plano). Si sales de la app con un pomodoro corriendo, el teléfono programa el aviso del final y lo cancela al volver. Pide el permiso de notificaciones al primer pomodoro. Recordatorios Premium semanales programados por el teléfono. Vibración nativa. Las páginas (privacidad, normas) se abren en el navegador del teléfono. Sin service worker dentro de la app. En la web nada cambia y no se carga nada de Capacitor.
- **Proyecto de Android:** `capacitor.config.json` (identificador `com.startupprometeus.frostpom`; la app usa la dirección `sebasurregor.github.io` para que el CAPTCHA la reconozca, y deja abrir `challenges.cloudflare.com`), `npm run android:crear / android:actualizar / android:abrir`, `tools/app-www.mjs`, `tools/app-android.mjs` (íconos y versión: 4.1.0 → `versionCode 40100`) y `android-recursos/` (ícono adaptable, ícono de notificaciones con un tomate, pantalla de inicio; los genera `tools/recursos_android.py`).
- **Imágenes para Play** (`docs/google-play/`): ícono de 512, imagen destacada de 1024 × 500 y 6 capturas de teléfono por idioma (`tools/capturas_play.py`). Textos de la ficha y respuestas de "Contenido de la app" en `docs/google-play/FICHA.md`. Paso a paso: `docs/GOOGLE-PLAY.md`.
- **Privacidad:** aplica también a Google Play; explica los reportes y el ocultar, los avisos programados por el teléfono, el pago por la tienda donde instalaste la app y el enlace para borrar la cuenta sin la app.
- **Pruebas:** `tests/e2e_android.py` (45 comprobaciones, con Capacitor y Supabase simulados), el Supabase simulado ya conoce `report_name`.

## v4.0.3: CAPTCHA (Cloudflare Turnstile)

- **Nuevo `js/captcha.js`:** la app sabe pedir un token de Cloudflare Turnstile antes de crear una cuenta (también la anónima del ranking), entrar con contraseña y pedir el código de recuperación, y lo envía a Supabase (`gotrue_meta_security.captcha_token`). Un token nuevo por llamada. Renovar la sesión y comprobar el código no lo piden.
- **Apagado hasta que pongas la clave:** `config.captcha.siteKey` vacío = como antes, sin cargar nada de Cloudflare. Paso a paso para encenderlo (Cloudflare → la clave en la app → publicar → Supabase): `docs/CAPTCHA.md`.
- **Casi invisible:** si Cloudflare duda, la casilla aparece dentro de la ventana abierta, encima de los botones. Si Cloudflare no responde, la app lo explica ("No pudimos comprobar que eres una persona…") en vez de quedarse pegada.
- **Seguridad:** la CSP permite solo `https://challenges.cloudflare.com` (script y marco), con una regla de Trusted Types propia (`st-captcha`) que acepta únicamente la dirección del script.
- **Menores de 13:** nunca cargan Turnstile.
- **Privacidad:** `privacidad.html` (ES/EN) menciona a Cloudflare Turnstile y qué datos recibe.
- **Brevo:** recordatorio de **no** activar el bloqueo de IP de las claves SMTP (los códigos dejarían de llegar).
- **Pruebas:** `tests/e2e_captcha.py` (24 comprobaciones, con Supabase y Turnstile simulados). El Supabase simulado puede exigir el CAPTCHA como el real.
- **Arreglo tras la prueba del autor con Cloudflare real (9 nov):** cuando Turnstile fallaba (en `localhost` con la llave real, código 110200), a los 8 s Turnstile intentaba reiniciar una casilla que la app ya había quitado y dejaba el error rojo "Uncaught TurnstileError: Nothing to reset found for provided container". Ahora la app pide `retry: 'never'` (ella misma maneja el error), quita la casilla un instante después del aviso y escribe en la consola el código de Cloudflare para saber qué pasó.
- **Aviso de Chrome corregido:** los dos campos de minutos de "Personalizar" (estudio y descanso) no tenían `id` ni `name`, y Chrome lo marcaba en la pestaña *Issues* ("A form field element should have an id or name attribute"). Ahora tienen `id`/`name` (`customStudyMin`, `customBreakMin`) y `autocomplete="off"`, para que el navegador no sugiera números viejos. `e2e_smoke` comprueba que ningún campo quede sin `id` ni `name`.
- **`_headers` al día:** su política de seguridad (para Netlify o Cloudflare Pages; GitHub Pages no la usa) no tenía las reglas de Cloudflare ni `st-captcha`. Ahora es igual a la de `index.html` (más `frame-ancestors 'none'`), y una prueba nueva revisa que sigan iguales (71 pruebas lógicas).
- **Prueba de seguridad externa:** `docs/PRUEBA-DE-SEGURIDAD.md` (lo que preparas tú: proyecto de pruebas, correos, CAPTCHA opcional, documento firmado) y el paquete `frostpom-kit-prueba-seguridad.zip` para quien prueba (código que no apunta a ningún proyecto hasta que se configura, `preparar_copia.py`, que lo apunta al proyecto de pruebas y se niega a usar el real o una llave secreta, y su `LEEME.md`).

## v4.0.2: sonidos de concentración grabados

- **Sonidos nuevos (grabaciones de Pixabay):** Ruido blanco, Lluvia, Ruido marrón, Olas del mar y Fogata ya no se generan en el dispositivo: ahora son grabaciones reales. Y hay uno nuevo, **Lluvia y pájaros** (Premium; en inglés "Rain and birds").
- **Bucle sin corte:** cada archivo es un pedazo tranquilo de la grabación (30 a 91 s) cuyo final se funde con su comienzo. La app lo repite entre `loopStart` y `loopEnd` con la Web Audio API; el archivo trae 1 s extra a cada lado para que, aunque el decodificador de MP3 corra el audio unos milisegundos, no se oiga el corte. Una prueba lo comprueba con el Chrome de verdad.
- **Mismo volumen:** todos quedaron a -20 LUFS (la fogata a -22, para no aplastar sus chasquidos). Viento polar y Ruido rosa, que siguen generados, se subieron para sonar parecido; antes, al pasar de un sonido a otro, el volumen cambiaba hasta 13 dB.
- **Livianos y sin internet:** 5,2 MB en total (MP3; las olas en mono). Lluvia y Ruido blanco (los gratis) se guardan al instalar; los Premium, la primera vez que suenan o al abrir la app si son los elegidos. Si una grabación todavía no se ha descargado y no hay internet, suena la versión generada: nunca queda mudo.
- **Memoria:** solo se guarda decodificada la grabación que está sonando.
- **Créditos:** "Acerca de" menciona a Pixabay (su licencia permite usarlos en la app sin mencionar al autor, pero se agradece). Autores en Pixabay (como aparecen en los nombres de los archivos): themediaguy (ruido blanco, n.º 378857), cosmic-scapes (ruido marrón, 299934), dragon-studio (lluvia, 437305, y olas, 372489), soundreality (fogata, 334130) y whitenoisesleepers (lluvia y pájaros, 194011).
- **`tools/preparar_sonidos.py`:** el programa que recorta, vuelve bucle e iguala el volumen, explicado paso a paso, por si quieres cambiar o agregar sonidos.
- **Pruebas:** `tests/e2e_sonidos.py` (28 comprobaciones) y 1 prueba unitaria nueva (70 en total).

## v4.0.1: cerrar sesión sin borrar la cuenta

- **Antes:** al cerrar sesión, la pantalla "¡Hola de nuevo!" solo dejaba entrar a la misma cuenta; para salir de ella había que tocar "Empezar de nuevo", que **borraba todo**. No debía ser así.
- **Cuenta en línea:** **"Cerrar sesión"** ahora sube lo pendiente, cierra la sesión y lleva a **"Inicia sesión"** con el correo ya escrito y el aviso "Cerraste sesión. Tu progreso sigue guardado en tu cuenta". Con la flecha ← se puede crear otra cuenta. La cuenta y su progreso **no se borran**. Si no hay internet y quedó algo sin subir, avisa antes de cerrar.
- **La foto vuelve:** como la foto nunca se sube, al cerrar sesión se guarda aparte en ese equipo (máximo 3 cuentas) y regresa cuando la misma cuenta entra otra vez. El idioma elegido también se conserva.
- **"Empezar de nuevo" ahora es "Usar otra cuenta":** con cuenta en línea cierra la sesión sin borrar nada. Con una cuenta solo de este dispositivo (menores de 13 o cuentas de antes sin conectar) explica qué pasa antes de borrar, con "Volver" como opción principal, y a los de 13+ les dice cómo conectarla primero.
- **"Salir de este equipo" desapareció:** hacía lo mismo que el nuevo "Cerrar sesión".
- **"Crea tu cuenta" más corta:** se quitaron las notas debajo de "¿Cuándo naciste?" y de "Correo" (lo explica la política de privacidad, y si alguien de 13+ deja el correo vacío, el aviso de error le dice para qué es). El aviso de error ya no ocupa espacio cuando está vacío, así que el correo queda cerca de "Tu nacionalidad", y cada campo deja el mismo aire con el siguiente.
- **Arreglo:** al salir desde la pantalla de entrar, la app alcanzaba a volver a guardar la cuenta antes de recargarse. Ahora, después de borrar, ya no se guarda nada.
- **Pruebas:** `tests/e2e_cuentas.py` pasa de 47 a 60 comprobaciones; 1 prueba unitaria nueva (69 en total).

## v4.0: cuentas en línea

- **Cuentas en línea (13+):** al crear la cuenta, quien tiene 13 años o más escribe su **correo** (ahora obligatorio para ellos) y la cuenta se crea también en Supabase con la misma contraseña. Desde cualquier equipo entra con **correo + contraseña** y su progreso llega con él. Se guarda **todo menos la foto** (y la fecha de nacimiento, que nunca sale del dispositivo). Guía: `docs/CUENTAS-EN-LINEA.md`.
- **Volver a iniciar sesión desde "Crea tu cuenta":** el registro tiene **"¿Ya tienes cuenta? Inicia sesión"**, y la pantalla de entrar tiene la **flecha ←** (tu SVG, `#AFAFAF`) para volver a crear cuenta. La flecha también está en "Recupera tu contraseña" y "Revisa tu correo".
- **Sincronización** (`js/sync.js`, `js/ui/cloud-ui.js`): el progreso se sube unos 8 segundos después de cada cambio, al esconder la app y al volver el internet; al abrir, se trae lo más nuevo. Si dos equipos guardan a la vez, gana la copia con más tiempo estudiado. El nombre de usuario viaja con el progreso.
- **Ajustes → Tu cuenta:** muestra la cuenta en línea y el último guardado, con **"Salir de este equipo"** (en la v4.0.1 se unió con "Cerrar sesión"). A quien ya tenía cuenta le aparece **"Conectar"** (si el correo ya existía en Supabase, confirma con un código y elige con qué progreso seguir). Cambiar la contraseña también la cambia en línea, y **"Eliminar mi cuenta"** borra también la cuenta en línea.
- **Menores de 13:** su cuenta sigue solo en su dispositivo; el correo es opcional y solo sirve para recuperar la contraseña.
- **Ranking con la misma cuenta:** quien tiene cuenta en línea ya no crea una cuenta anónima para el ranking; si ya estaba en el ranking, su lugar pasa a la cuenta en línea.
- **Bienestar y ranking más simple:** se quitaron **"Descargar"** y **"Borrar"** (generaban un archivo JSON que casi nadie entendía). Al apagar **"Aparecer en el ranking"** sale una ventana con la casilla **"Borrar también mis minutos del ranking"**. Quien quiera una copia de sus datos la pide por correo.
- **Servidor** (`server/supabase/schema.sql`): tabla `private.saves` y funciones `load_progress`, `save_progress` (versiones, máximo 1 MB, quita la foto y la cuenta) y `delete_my_cloud_account`. Hay que correrlo en Supabase **antes** de subir la v4.0. 27 comprobaciones en PostgreSQL.
- **Privacidad:** `privacidad.html` (ES/EN) explica las cuentas en línea, qué se guarda en Supabase, Brevo para los correos, cómo borrar (todo, solo este equipo o solo el ranking) y cómo pedir una copia.
- **Pruebas:** `tests/e2e_cuentas.py` (47 comprobaciones con Supabase simulado), 2 pruebas unitarias nuevas (68 en total). `store_check.py` usa el Supabase simulado cuando revisa en local.

## v3.9: ranking global (listo, apagado hasta que lo enciendas)

- **Servidor nuevo** (`server/supabase/schema.sql`): el nombre público es el nombre de usuario (revisado con las mismas reglas que la app y único); todos los de 13+ aparecen por defecto y se puede salir; semana de lunes 00:00 UTC y temporada de 3 meses; XP acotada; ocultar nombres (`private.hide_name`); pasar tu lugar a tu cuenta con correo con un código de un solo uso; descargar y borrar; limpieza (`private.cleanup`). Probado en PostgreSQL: 23 comprobaciones.
- **App** (`js/board.js`, `js/ui/board-ui.js`): cuenta anónima de Supabase; avisa al servidor al empezar y al terminar cada pomodoro (sin internet al empezar no cuenta; si se va al terminar, se reintenta solo); podio y tabla con tu fila; tarjetas para unirte, para menores de 13 y si saliste; nombre ocupado → elegir otro o recuperarlo con el correo; Ajustes → descargar y borrar tus datos; al eliminar la cuenta también se borran del servidor.
- **Edad:** con el ranking encendido, el registro pregunta mes y año de nacimiento (sin sugerir respuesta). Se queda en el dispositivo; los menores de 13 no se conectan. A quien ya tenía cuenta se le pregunta una vez ("¡Llegó el ranking global!").
- **Arreglo del filtro de nombres:** bloqueaba nombres inocentes. "kkk" quedaba como "k" y bloqueaba cualquier nombre con k ("kevin"); "xxx" hacía lo mismo con la x ("xavier"); "perra" quedaba como "pera" ("esperanza") y "coño" bloqueaba "conocer". Ahora cada palabra se busca permitiendo letras repetidas ("puuuta" sigue bloqueado), y se ignoran palabras comunes como computadora, disputa o diputado.
- **Correo y contraseña:** al recuperar la contraseña ya no se pierde la fecha de nacimiento; los errores "no encontrado" del servidor ya no se confunden con "servidor sin montar".
- **Privacidad:** `privacidad.html` (ES/EN) explica el ranking: qué se envía, qué no, cuánto se guarda, cómo salir, descargar y borrar, y menores de 13.
- **Pruebas:** `tests/e2e_ranking.py` (55 comprobaciones con Supabase simulado), 6 pruebas unitarias nuevas (66 en total).
- Guía: `docs/RANKING-GLOBAL.md`.

## v3.8.3: nevada suave en la entrada

- **Nieve en la pantalla de entrar / crear cuenta** (`js/ui/gate-snow.js`): 40 copos con borde difuminado en tres profundidades. Los de lejos son pequeños y lentos; los de cerca, grandes, desenfocados y pocos. Caen despacio, se balancean de lado a lado y aparecen y se desvanecen poco a poco. Solo usa `transform` y `opacity`, y solo se anima mientras se ve la entrada.
- **La capa negra leve** ahora va dentro de la escena (`.gate-scene__art::after`) y no en el fondo del diálogo. La imagen queda igual de oscurecida, pero la nieve queda encima, en primer plano.
- Con **"Menos animaciones"** la nevada no aparece. `tests/e2e_smoke.py` lo revisa.

## v3.8.2: íconos nuevos de gema y de foto

- **Gema nueva** (`assets/icons/gema.png`, azul hielo, sin la sombra del piso para que se vea nítida en tamaño pequeño): en la barra de arriba, en el contador de la bandeja de comida y en el precio de cada comida. El color de las gemas (`--gem`, el "+N gemas" que flota y el borde al pasar el mouse) pasó de morado a azul hielo. El logro "Inquebrantable" conserva su 💎 porque es la insignia del logro, no la moneda.
- **Ícono de foto nuevo** (`assets/icons/foto.png`) en lugar del emoji 📷: "Cambiar foto" / "Subir una foto" en el perfil, "Elegir una foto" / "Elegir otra foto" al crear la cuenta y el aviso "¡Foto de perfil lista!".
- **Capturas actualizadas** con la gema nueva: `docs/microsoft-store/capturas-es/`, `capturas-en/` y las del manifiesto (`assets/screenshots/`).

## v3.8.1: arreglos del globo y del inglés

- **Globo sin parches blancos:** en el video, los huecos entre el birrete, el cordón y el globo eran blancos y quedaban como manchas que aparecían y desaparecían. Ahora todo hueco blanco es transparente (solo se conserva el brillo del birrete), los bordes se suavizan sin halo y todos los cuadros usan el mismo recorte, así que el birrete ya no queda pegado al borde.
- **Botón "Genial" en inglés:** la ventana "Eres Premium" ya dice "Awesome".
- **Perfil de impuestos y pagos:** la sección 2 de `docs/COBRO-PREMIUM.md` explica paso a paso el W-8BEN y el perfil de pagos en Partner Center.

## v3.8: modo oscuro, fogata animada, pingüino incluido y cobro de Premium listo

- **Fogata animada al entrar:** el paisaje ártico ahora es un elemento de la página (`#gateScene`) y encima va una llama dibujada con el contorno de la original: se estira, se mece, el centro titila, brilla la nieve y suben gotitas de fuego. Con "Menos animaciones" queda quieta. Las chispas fijas del dibujo se borraron para que no se dupliquen.
- **Modo oscuro:** Ajustes → **Apariencia** (Automática, Clara u Oscura). Los colores son variables (`--text`, `--surface`, `--card`…) y `html[data-theme="dark"]` cambia sus valores; el paisaje se oscurece un poco. Lo controla `js/ui/theme.js`.
- **El Pingüino viene con la cuenta:** ya está desbloqueado en Perfil (etiqueta "Incluido"), el primer pomodoro ya no muestra su ceremonia y nunca sale entre las mascotas del regalo de Premium. El logro "Primer paso" se sigue ganando.
- **Sonidos de concentración sin emojis:** solo el nombre.
- **Globo animado** (el del MP4) en "El ranking global llega pronto": WebP animado con fondo transparente (`assets/icons/globo.webp`) y versión quieta para "Menos animaciones".
- **Cobro de Premium listo pero apagado:** `js/billing.js` usa la Digital Goods API de Microsoft Store (precio real, ventana de pago, revisar la suscripción al abrir). Se enciende con `config.premium.chargesEnabled`. Prueba simulada: `tests/e2e_cobro.py`. Guía: `docs/COBRO-PREMIUM.md`.
- **Guía de despliegue completa:** `docs/DESPLIEGUE.md`.

## v3.7: inglés y español, tarjetas claras en toda la app y recuperar contraseña por correo

- **Idiomas:** la app sale en el idioma de Windows (español si está en español; inglés en cualquier otro caso) y se cambia en **Ajustes → Idioma · Language**. Funciona con `js/i18n.js` + el diccionario `js/i18n-en.js`: el texto en español es la "llave" y `t()` pone los datos. Fechas, números, días y meses también cambian. La prueba `tests/e2e_ingles.py` recorre todo en inglés y avisa si queda algo en español.
- **Tarjetas claras en toda la app:** el estilo de Progreso (blanco, borde gris suave, esquinas grandes y sombra difusa) ahora lo usan los paneles, la placa de Enfocar, el ranking, los diálogos y los avisos. La **barra de arriba es una tarjeta redondeada** que flota, y el menú (abajo en el celular, a la izquierda en escritorio) también.
- **Se quitó la pantalla blanca de Progreso:** vuelve a verse el paisaje.
- **Entrar / crear cuenta:** una capa negra leve sobre el paisaje ártico para que no encandile.
- **Recuperar contraseña:** correo opcional al crear la cuenta o en Ajustes; "¿Olvidaste la contraseña?" envía un **código** con Supabase y deja poner una contraseña nueva. A Supabase solo va el correo (con una contraseña aleatoria); la de FrostPom no sale del dispositivo. Prueba: `tests/e2e_recuperar.py` (simula Supabase). Configuración: `docs/RECUPERAR-CONTRASENA.md`.
- **Privacidad:** `privacidad.html` explica el correo opcional y trae versión en inglés.
- **Tienda:** ficha en inglés en `docs/microsoft-store/FICHA.md` y capturas en inglés en `docs/microsoft-store/capturas-en/`.

## v3.6: íconos dibujados, Progreso estilo racha y pantalla de entrada ártica

- **Íconos nuevos** (`assets/icons/`, función `pic()` en `js/ui/pics.js`): fuego de la racha, copo, corona de Premium, cofre del regalo y los de Icons8 (candado, check, info, reloj, música, llave, quitar). Reemplazan emojis como 🔥 👑 🔒 ⏱️ ✓. Crédito a Icons8 en Ajustes → Créditos.
- **Progreso en blanco, como la racha de Duolingo:** la pantalla se vuelve blanca, arriba va una banda del color de tu rango con el escudo **nevado**, debajo la tarjeta de la racha con el fuego (gris si hoy aún no estudias, con "Estudiar ahora").
- **El calendario sale primero** (la pestaña "7 días" sigue disponible y la app recuerda cuál elegiste). Días con meta en naranja con un copo, días estudiados en naranja suave y una banda que une los días seguidos.
- **Se quitó "Tu polo" de Progreso** (ya está en la placa de Enfocar).
- **Nuevo compañero:** el fondo ahora es un degradado negro en vez de azul y cada animal queda centrado (el tiburón y el zorro se medían mal porque su dibujo no está en el centro de la imagen).
- **Entrar / crear cuenta:** detrás del cuadro ya no se ve la app, sino el paisaje ártico con los personajes junto a la fogata.
- **Capturas de la tienda** rehechas con el nuevo Progreso.
- **Guía** `docs/RECUPERAR-CONTRASENA.md` para la recuperación por correo (aún no programada).
- **Pruebas:** 60 de lógica, todas las del navegador y `store_check.py` dice "Lista para la tienda".

## v3.5: menos texto, sesión recordada y descanso a tu ritmo

- **Placa de estado en Enfocar:** el botón de sonido, los minutos de hoy y la salud de tu polo juntos en un solo recuadro. Con el reloj quieto también se ve el clima.
- **Mantener la sesión iniciada:** casilla al registrarte y al entrar (marcada por defecto) e interruptor en Ajustes → Tu cuenta. El dispositivo guarda un token aleatorio y la cuenta solo su huella (nunca la contraseña); dura 60 días y se anula al cerrar sesión o cambiar la contraseña.
- **Al terminar de estudiar** (Ajustes → Temporizador): "El descanso empieza solo" o "El reloj me espera". Aparte, "Volver a estudiar solo".
- **Menos descripciones:** se quitaron las explicaciones de Ajustes (guardado automático, temporadas, sonido, región, límite saludable, recordatorios y todos los subtítulos de los interruptores), de Compañeros, de Personalizar, de la tienda, de Premium y de varios diálogos.
- **Montañas:** la nieve de cada cima ahora sigue las dos laderas reales (antes era un triángulo fijo que sobresalía o quedaba corto).
- **Arreglado:** en celulares de 430 px la barra de XP se montaba sobre la racha y Premium; ahora la barra de arriba usa dos filas hasta 640 px.
- **Pruebas:** 60 de lógica y 107 comprobaciones en el navegador; `store_check.py` dice "Lista para la tienda".

## v3.4: la app ahora se llama FrostPom (primer MVP para Microsoft Store)

- **Nuevo nombre: FrostPom.**
  - Cambia en la ventana, la pestaña del navegador, el manifiesto (`FrostPom: Pomodoro Timer`, nombre corto `FrostPom`), la política de privacidad, Acerca de, Premium, las notificaciones y la documentación.
  - Dirección pública: `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/`.
  - **No se pierde nada:** los datos siguen guardados con las mismas claves (`st2_…`), así que quien ya usaba la app conserva su progreso. Las copias hechas con el nombre anterior también se pueden restaurar.
  - El modo sin conexión usa ahora la caché `frostpom-3.4.0` y borra las cachés viejas de `studytimer`.
- **Registro en dos pasos.**
  - Paso 1: nombre de usuario, contraseña y nacionalidad (opcional). Se quitó el botón **"Sugerir uno"**: cada quien crea su nombre.
  - Paso 2: una **vista aparte para la foto de perfil**, después de crear la cuenta, con "Ahora no" y "Guardar foto". La cuenta ya queda guardada antes de este paso.
  - Si no sube foto, la app le **asigna un animal al azar**. Se quitó la lista de emojis, tanto del registro como del Perfil.
- **Arreglado: el botón de la foto no hacía nada en el registro.** El selector de archivos se creaba fuera de la ventana de bienvenida, y el navegador ignora los clics fuera de una ventana modal. Además, el recorte abría una segunda ventana, que no puede abrirse encima de otra. Ahora el selector se crea dentro de la ventana abierta y el recorte aparece en la misma vista.
- **Arreglado: sin conexión, la app podía abrir en la política de privacidad.** El modo sin conexión guardaba cualquier página que se abriera como si fuera la portada. Si alguien abría la política de privacidad con internet y después abría la app sin conexión, veía la política en vez del temporizador. Ahora cada página se guarda con su propia dirección. Lo detectó `store_check.py`.
- **En Perfil**, la sección se llama "Tu foto de perfil" (subir, cambiar o quitar la foto) y sigue abierta después de guardar. El botón "Usar animal" ahora se llama "Quitar compañero".
- **Ranking sin datos inventados.** Se quitaron los 42 rivales simulados: en una app nueva no tenía sentido que ya hubiera gente. Ahora la pantalla muestra:
  - un aviso, **"El ranking global llega pronto"**;
  - tu marca de la semana y de la temporada.
  - El código del ranking en línea quedó listo (`rankRows` ordena y maneja empates) para cuando exista el servidor.
- **Regalo de bienvenida de Premium** (una sola vez, aunque se desactive y se vuelva a activar):
  - **1000 gemas** para alimentar a la mascota en la tienda de Enfocar;
  - **una mascota de edición limitada** que el usuario elige entre las que todavía no tiene. Si dice "Luego", puede elegirla después con el botón **🎁 Elige tu mascota** en Perfil → Compañeros o desde la corona.
  - La mascota regalada tiene su ceremonia ("Tu regalo por ser Premium") y la etiqueta "Regalo Premium". Si más adelante gana el logro de esa mascota, no se repite la ceremonia.
  - La oferta Premium muestra los dos regalos al principio de la lista.
- **Pruebas:**
  - 57 de lógica: regalo de Premium (una sola vez y sin trampas en la copia guardada) y ranking sin bots;
  - 95 comprobaciones en el navegador, incluidas la foto en el registro con EXIF/GPS, "Ahora no" y el regalo completo;
  - `store_check.py` en la raíz y en la subcarpeta `/FrostPom-Pomodoro-Timer/`.
- **Nuevo:** `docs/PROXIMOS-PASOS.md`, con el paso a paso de lo que sigue.

## v3.3: tienda en Enfocar (arrastrar la comida), foto de perfil y lista para Microsoft Store

- **La tienda ahora vive en Enfocar.**
  - El ícono de la bolsa, junto al compañero del reloj, abre la bandeja de comida. En el celular flota abajo y la mascota queda visible encima; en el computador aparece al lado del reloj.
  - La comida se **arrastra** hasta el compañero con el mouse o con el dedo. Cuando la comida está encima, la mascota se agranda y pregunta "¿Ñam?"; al soltarla, la comida vuela a su boca.
  - Si sueltas la comida lejos, vuelve a su lugar y no se cobra nada. Si solo la tocas, la mascota te pide que se la arrastres.
  - Con el teclado (Tab + Enter) también se le da la comida, para que nadie se quede por fuera.
  - Si tiene mucha hambre, el ícono muestra un "!".
  - Se quitó la pestaña Tienda. Las gemas de la barra de arriba y el atajo "Tienda" de Windows abren la bandeja.
- **Foto de perfil** (opcional), en el registro y en Perfil → "Cambiar foto o animal".
  - Se recorta en círculo, con zoom y arrastrando para encuadrar.
  - Se guarda en 256 × 256 **sin los datos ocultos de la foto** (GPS, modelo del teléfono).
  - Se queda solo en el dispositivo: en el ranking, los demás verían tu animal.
- **Lista para Microsoft Store.**
  - Manifiesto completo: íconos de 48 a 512 y "maskable", 5 capturas, 3 atajos (Estudiar, Tienda y Progreso), una sola ventana (`launch_handler`, para que no corran dos temporizadores) y panel lateral de Edge.
  - **Política de privacidad** en `privacidad.html`, enlazada desde Ajustes → Acerca de.
  - **Premium honesto:** mientras no haya cobro real, el botón dice "Probar Premium gratis" y no "Suscribirme, US$ 2,99". Se activa el cobro con `premium.chargesEnabled` en `js/config.js`.
  - `.nojekyll` para GitHub Pages.
  - Guía paso a paso en `docs/MICROSOFT-STORE.md` y ficha de la tienda en `docs/microsoft-store/FICHA.md`.
- **Pruebas:**
  - 54 de lógica;
  - 76 comprobaciones en el navegador (incluidos arrastrar con el mouse, soltar lejos, teclado y la foto con GPS);
  - `tests/store_check.py` (nuevo): manifiesto, que sea instalable, sin conexión, sin archivos faltantes, 8 tamaños de ventana (de 360 a 1920 px) y accesibilidad con axe, sin problemas graves.
  - Todo se probó también con la app servida en una subcarpeta, como quedará en GitHub Pages.


## v3.2: tienda para tu mascota y oso polar animado

- **Tienda (pestaña nueva y también desde las gemas de la barra de arriba).**
  - Le das de comer a tu mascota: el compañero que tengas equipado o, si no hay, el pingüino.
  - Hay 12 comidas del arte del autor, de 2 a 8 gemas: pescado, camarón, arándanos, galleta estrella, cangrejo, calamar, pescado congelado, frasco de sardinas, sopa de pescado, pollo asado, jamón asado y almeja de lujo.
  - La **barriguita** (de 0 a 100) baja 3 puntos por hora.
  - Cada animal tiene 4 comidas **favoritas** (★) que llenan un 50 % más.
  - Con la barriguita en 95 o más ya no quiere comer, así que nadie se gasta todas las gemas de una vez.
  - Al comer, la mascota dice "¡Ñam ñam!" o "¡Mi favorito!", salta y salen corazones; el pingüino pone ojos de corazón.
  - Si tiene mucha hambre, tu compañero de Enfocar te lo recuerda.
  - Es solo por cariño: no da XP ni ventajas.
- **Temporadas con barra.** En Perfil, la temporada ahora es una barra que se llena con los días (del 1 oct al 31 dic) y muestra cuántos días quedan. La explicación quedó dentro del botón (i).
- **Oso polar animado.**
  - El oso que pasea por el paisaje usa su ciclo de caminar de 4 cuadros.
  - De noche, el oso asa malvaviscos en lugar del explorador: mira el malvavisco, sonríe, se le antoja, se asusta porque se quema y lo sopla.
  - La fogata es la del mismo dibujo, separada en llama y leños para que la llama siga titilando, con su resplandor, chispas y humo.
- **Pruebas:** 53 de lógica (tienda y mascotas) y 66 comprobaciones en el navegador (barra de temporada, tienda y escena del oso).


## v3.1: el polo cobra vida, temporadas y guardado automático

### Errores corregidos

1. **El fondo no se animaba en algunos computadores.** Si Windows (u otro sistema) tenía apagados los *efectos de animación*, el navegador pedía "reducir movimiento" y la app detenía todo: los animales se quedaban quietos y se apagaban la fogata, el humo, el viento, la nieve y el confeti. Ahora eso lo decide **"Menos animaciones"** en Ajustes. Si el sistema pide menos movimiento, la app avisa una vez dónde está ese ajuste.
2. **El anillo del temporizador avanzaba al revés de la bola.** La bola recorría el anillo en el sentido del reloj, pero el arco se vaciaba por el otro lado. Ahora lo ya estudiado se vacía justo detrás de la bola.
3. **El campo de la hora de los recordatorios salía negro** con el sistema en modo oscuro. Los paneles ahora fuerzan controles claros.
4. **Los diálogos con campos anidados mostraban "[object HTMLInputElement]"** en vez del campo; pasaba, por ejemplo, en "Crea tu cuenta". El ayudante `h()` ahora aplana todas las listas.
5. **La ceremonia de temporada intentaba vibrar antes del primer toque** y Chrome lo anotaba como error. Ahora solo vibra después de que tocas la pantalla.

### Lo nuevo

- **Los animales caminan y dan salticos.** El pingüino usa su ciclo de caminar de 4 cuadros y salta de vez en cuando; el zorro ártico da brincos, la foca rebota y el oso camina bamboleándose. Ahora pasan 6 animales: 3 pingüinos, el oso, el zorro y la foca.
- **Onomatopeyas.** De vez en cuando un animal dice algo en un globo: "¡Cuac!", "¡Pi-pi!", "¡Grrr!", "¡Ñam ñam!", "¡Yip yip!", "¡Arf arf!". Lo que dicen depende del momento:
  - de noche tienen sueño ("Zzz…");
  - con nevada fuerte tienen frío ("¡Brrr!");
  - con el polo contaminado tosen ("¡Cof, cof!", "¡Puaj!");
  - mientras estudias hablan menos y bajito.

  Tu compañero de Enfocar también habla al empezar y al terminar una sesión.
- **Clima del polo.** Cambia cada 3 horas y es igual para toda tu región: despejado, nieve ligera, nevando o nevada fuerte (con viento y bruma). En Enfocar aparece "Clima en tu polo". Con esmog, la nieve sale gris.
- **Temporadas de estudio** (cada 3 meses: ene–mar, abr–jun, jul–sep, oct–dic):
  - al empezar una nueva hay una ceremonia, tu rango vuelve a Bronce III y ganas de 10 a 100 gemas según el rango que alcanzaste;
  - tu perfil guarda una medalla por temporada;
  - se conservan logros, compañeros, temas, gemas, racha y calendario, y se borra el historial detallado de sesiones viejas;
  - el ranking tiene "Esta semana" y "Esta temporada";
  - la duración se cambia en `js/config.js → season.months`. Con 1 mes no se alcanzaría Leyenda con el límite saludable de 4 h diarias.
- **Guardado automático.** El panel "Tus datos" ahora se llama "Guardado automático": muestra la hora del último guardado y explica la temporada. Al cambiar el día, un aviso confirma que el total de ayer quedó en el calendario.
- **Ya no hay "Guardar copia", "Restaurar copia" ni "Borrar todos mis datos".** Queda solo **"Eliminar mi cuenta"** (pide tu contraseña), porque Apple y Google la exigen dentro de la app.
- **País en una lista emergente.** Al tocar el campo se abre la lista; al escribir se filtra; al elegir se cierra y el campo muestra la bandera y el nombre. Funciona con teclado (flechas, Enter y Escape).
- **El registro ya no pregunta cuánto estudiar por bloque:** eso se elige en Enfocar.

### Pruebas

- 50 pruebas de lógica (`npm test`): se agregaron las de temporadas, clima, onomatopeyas y zonas horarias.
- La prueba en navegador tiene ahora 59 comprobaciones. Corre en "modo oscuro" del sistema y también revisa:
  - que el anillo y la bola avancen en el mismo sentido;
  - la lista de países;
  - el cambio de temporada y el guardado del día;
  - eliminar la cuenta;
  - que los animales caminen aunque el sistema pida "reducir movimiento", y que se queden quietos con "Menos animaciones".


La v3 se ve y se usa igual que la v2.4. Lo que cambió es por dentro: el código se reorganizó para que sea más fácil de cambiar sin romper nada, y se corrigieron varios errores que aparecieron en la revisión.

Tus datos de la v2 se abren tal cual. La primera vez que guardas algo, se convierten al formato v3 y se descartan los restos del antiguo planificador.

## Errores corregidos

1. **Con Premium, "Usar" un tema cobraba gemas.** El botón decía "Usar", pero el tema se compraba con tus gemas. Ahora Premium solo lo usa mientras dure, sin cobrar nada.
2. **Cambiar la contraseña no tenía límite de intentos.** Al iniciar sesión, la app se bloquea después de 5 intentos fallidos, pero en "Cambiar contraseña" se podía probar sin límite. Ahora aplica el mismo bloqueo.
3. **Una nueva contraseña podía contener el nombre de usuario.** Al crear la cuenta eso se rechazaba; al cambiarla, no. Ahora se usa la misma regla en los dos casos.
4. **Si guardar fallaba (almacenamiento lleno), se perdían cambios.** La app releía lo último guardado antes de cada cambio, así que lo que estaba solo en memoria desaparecía. Ahora solo relee si otra pestaña guardó algo nuevo.
5. **Borrar una sesión dejaba cumplida la misión "Completa una sesión sin pausar".** Ahora también descuenta esa sesión.
6. **El reloj en reposo no se actualizaba al activar o desactivar Premium** con "Mi ritmo" fuera de los límites gratis. Ahora, mientras no hay nada corriendo, el reloj siempre muestra la duración que está en efecto.
7. **Cuando el navegador bloqueaba `sessionStorage`, la app fallaba al arrancar** en el aviso de crear cuenta. Ahora todo el almacenamiento pasa por `storage.js`, que no falla.

## Reorganización del código

- **`app.js` (1 927 líneas) se dividió en módulos pequeños** dentro de `js/ui/`: uno por vista (Enfocar, Progreso, Perfil, Ranking, Ajustes) y uno por pieza (cuenta, Premium, sonido, recordatorios, celebraciones). El más grande tiene ~310 líneas.
- **Módulos ES nativos.** Se quitaron las 13 envolturas `(function (root, factory) {…})` y el objeto global `window.ST`. Ahora cada archivo dice qué usa con `import`, y Node prueba exactamente el mismo código que corre en el navegador.
- **`session.js` (nuevo): el bloque en curso.** Une el temporizador con su guardado y con las otras pestañas. Antes esta lógica estaba repartida en seis funciones de la interfaz, y cada una repetía "guardar, pantalla encendida, repintar". Ahora tiene sus propias pruebas.
- **Una sola fuente de verdad para "lo que está en efecto":** `catalog.effectivePrefs(state)` decide qué tema, tono, sonido y duración se usan según Premium. Antes había cinco comprobaciones parecidas repartidas por la interfaz y el motor.
- **Los ajustes guardan solo lo elegido.** Se eliminaron `studyMin`, `breakMin`, `longBreakMin`, `customLongMin`, `longEvery` y `longBreakOn`, que eran copias que había que mantener sincronizadas a mano en cuatro lugares. Los minutos se derivan con `catalog.sessionDurations()`.
- **`game.js` se dividió en tres:** `game.js` (cómo se gana el progreso), `catalog.js` (lo que se elige o se posee) e `identity.js` (apodos, nombres de usuario y países).
- **Todos los comandos del motor devuelven `{ events, ok }`.** `getSkin` se llama ahora `chooseSkin` y decide según el estado del tema en el catálogo (`owned`, `included`, `unlockable`, `buyable`…).
- **Índices sin prototipo.** `ACHIEVEMENT_BY_ID['constructor']` ya no devuelve algo; antes había que acordarse de filtrar esas claves aparte.
- **Se eliminó código muerto** del planificador (quitado en la v2.2): tareas, disponibilidad semanal, XP por tareas, `plansGenerated`. También el CSV (quitado en la v2.3) y el kit de dibujo SVG de compañeros que ya no se usaba.

## Pruebas

- 44 pruebas de lógica (`npm test`). Antes eran 35: se retiraron las del planificador y se agregaron pruebas para la duración, las preferencias en efecto, el almacenamiento y el bloque en curso.
- La prueba en navegador (`tests/e2e_smoke.py`) pasa sin cambios: 38 de 38 comprobaciones.
