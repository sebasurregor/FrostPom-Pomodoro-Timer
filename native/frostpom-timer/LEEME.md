# FrostTimer: la notificación tipo reproductor y los widgets de Android (v4.8.2)

Este es el código **nativo** (Kotlin) de la notificación en curso, los widgets y el aviso del
final. La parte web está en `js/native.js` y `js/ui/native-ui.js`. Desde la v4.7.1 viene encendido
en `package.json` (`"@frostpom/timer": "file:native/frostpom-timer"`). Se compila en tu PC con
Claude Code, porque en la nube de Claude no se pueden descargar Android ni Gradle.

## Qué hace

- **(v4.9.0) Notificación en curso normal, y el reproductor solo si lo pides.** Por defecto es una
  notificación normal (en su lugar de la lista, con la cuenta regresiva y los botones). El estilo
  reproductor se enciende en **Ajustes → Notificación tipo reproductor** (solo en la app de Android).
  Antes era siempre reproductor, y Android pone los reproductores **arriba y abiertos** en el panel:
  por eso al bajar la cortina "se abría sola", incluso con FrostPom cerrada. Además, en pausa la
  notificación ya **se puede quitar** con el dedo y se va sola a los 30 minutos.
- **Notificación estilo reproductor (opcional, como Spotify)**: en la pantalla de bloqueo y en el
  panel rápido sale con los animales del ártico de fondo, el modo ("Modo enfoque"), la frase, la
  barra que avanza sola y los botones ⏮ volver a empezar · ⏸/▶ · ⏭ saltar · ✓ terminar y guardar.
  No suena nada: solo usa el aspecto de reproductor (una "sesión de reproducción" de Android).
  En Android 12 o anterior es la misma notificación con la cuenta regresiva arriba.
- **Widgets 4 × 2 y 2 × 2** con el diseño del lienzo "Rediseño FrostPom" (las imágenes están en
  `diseno/`): una sola tarjeta con los animales de fondo, la hora grande (baja sola, cada segundo),
  la barra con tu compañero (blanco lo hecho, el color del modo lo que falta), lo hecho · el total,
  los botones blancos y el globito "¡Estudiando juntos!". El 2 × 2: la hora, la barrita, ✓ y el
  botón dorado (verde en el descanso). Siempre oscuros. Si la pantalla de inicio los hace bajitos
  (menos de 176 dp), se esconden la frase y los números de la barra.
- **Aviso del final exacto** si diste el permiso "Alarmas y recordatorios" (la app lo pide una vez,
  al empezar el primer pomodoro). Sin él, (v4.7.3) unas "alarmas de acercamiento" lo dejan con
  ~1 min de retraso como mucho (antes, hasta 18 min). **No** usa `USE_EXACT_ALARM` ni servicios en
  primer plano.
- **(v4.7.3) ⏮ vuelve a empezar el bloque y sigue corriendo** (en la app web llega como "reiniciar"
  + "empezar", a la misma hora).
- **(v4.7.2) El aviso llega aunque la app termine el bloque en segundo plano** (antes, con el ahorro
  de batería, la app pasaba al descanso antes de que sonara la alarma, y la alarma se cancelaba).
- **Botones con la app cerrada**: la copia del reloj del teléfono cambia al instante y la acción
  queda anotada con su hora; al abrir la app, la parte web la aplica a esa hora.
- **Al reiniciar el teléfono** vuelven la notificación y el aviso del final (aviso de encendido y,
  de respaldo, la actualización de los widgets). Cada paso queda en el registro del teléfono con la
  etiqueta `FrostTimer` (`adb logcat -s FrostTimer`), sin datos personales.

### Un límite que hay que probar

La "sesión de reproducción" vive mientras la app está en memoria. Si Android la cierra para
liberar memoria, Samsung lo esconde hasta la siguiente actualización (v4.7.3: cada 2 min, exacta
con el permiso de alarmas; también al tocar un botón del widget, al sonar el aviso o al abrir la
app). En la prueba de la 4.7.2 volvió y sus botones respondieron.
Los botones del widget nunca dependen de eso. Si en tu celular los botones del reproductor dejan de
responder, hay un plan B de una línea: `TimerNotification.MEDIA_SESSION = false` (la notificación
sigue con sus botones, sin la barra que avanza sola). El autor decidió mantener el reproductor.

## Archivos

```
native/frostpom-timer/
  package.json                       "@frostpom/timer" (complemento local de Capacitor)
  diseno/                            el diseño aprobado (para comparar en el celular, .jpg)
  android/build.gradle               biblioteca de Android con Kotlin
  android/src/main/AndroidManifest.xml
  android/src/main/java/com/startupprometeus/frostpom/timer/
    FrostTimerPlugin.kt              lo que la app web le pide (update, getPendingActions…)
    TimerState.kt                    la copia del reloj y sus acciones (lógica pura)
    TimerStore.kt                    lo guardado en el teléfono y los textos
    TimerEngine.kt                   decide: notificación, aviso, widget y cada 2 min
    TimerNotification.kt             la notificación en curso y el aviso del final
    TimerMedia.kt                    (v4.7.2) la sesión de reproductor y sus botones
    TimerAlarm.kt                    las alarmas (exacta si hay permiso; si no, de acercamiento)
    TimerActionReceiver.kt           los botones, el aviso del final y el reinicio del teléfono
    FrostWidget.kt                   los widgets (4 × 2 y 2 × 2)
  android/src/main/res/              diseños, íconos, textos (inglés y español) y arte
  android/src/test/…/TimerStateTest.kt   pruebas de la lógica (sin emulador)
```

El arte de los widgets y de la notificación sale de `assets/scenes/artico-amigos.webp` con
`python tools/arte_widget.py` (ya viene hecho).

## Lo que ya se comprobó

- (v4.7.2, en tu PC) Compiló con el SDK real, pasaron las pruebas y se probó en el Galaxy (Android 16):
  widgets, reproductor, botones y reinicio. Claude Code arregló dos detalles del widget (redondeo y
  la hora quieta en pausa) que ya vienen incluidos en la 4.7.3.
- (v4.7.3, en la nube) El Kotlin compila (Kotlin 2.2.20, clases de Android 14 y Capacitor mínimo) y
  pasan las 6 pruebas de `TimerStateTest.kt` (nueva: ⏮ vuelve a empezar corriendo).
- La parte web, con el complemento simulado: `tests/e2e_android.py`.

## v4.7.3: compilar y probar con Claude Code en tu PC

1. Descomprime la versión nueva encima de tu carpeta como siempre (sin borrar `.git`) y vuelve a
   pegar tus claves en `js/config.js` (`captcha.siteKey` y `premium.play.revenueCatKey`).
2. Conecta el Galaxy por cable, abre la terminal en la carpeta del proyecto y escribe `claude`.
3. Copia y pega este mensaje:

```
Hola, Claude. Quiero compilar y probar FrostPom 4.7.3 en mi Galaxy (conectado por USB). Lee
native/frostpom-timer/LEEME.md y la entrada v4.7.3 de docs/CAMBIOS-v3.md. Esta versión trae tus dos
arreglos del widget de la 4.7.2 (redondeo y hora quieta), así que si mi carpeta ya los tenía, quédate
con la versión del zip. Explícame cada paso en español sencillo.

1. npm install y npm run android:actualizar (debe decir versionCode 40703, "cobro con Google Play
   ENCENDIDO" y, si quedaban, "Borrado (ya no se usa)" de los archivos viejos del widget).
2. cd android && .\gradlew assembleDebug, .\gradlew :frostpom-timer:testDebugUnitTest (6 pruebas) e
   .\gradlew installDebug. Arregla errores de compilación SIN cambiar lo que hace.
3. Ícono: ¿ya no se corta la punta del gorro ni el pompón con la forma de Samsung?
4. Calendario de Progreso: un día con 45 min o más debe verse con el hielo en vez del círculo
   naranja (el número encima, las gotas abajo), en tema claro y oscuro. Saca una captura.
5. ⏮ en el reproductor y en el widget: el bloque vuelve a empezar (25:00) y sigue corriendo; la
   notificación no desaparece. Abre la app: debe mostrar lo mismo.
6. Reproductor después de adb shell am kill com.startupprometeus.frostpom: ¿vuelve en 2 min o menos?
   (adb logcat -s FrostTimer: "acción: TICK" y "media: sesión nueva").
7. Aviso sin el permiso: quita "Alarmas y recordatorios" (Ajustes > Apps > FrostPom), empieza un
   pomodoro de 5 min, bloquea, y mira en el registro las líneas "acción: APPROACH" y cuánto tarda el
   aviso después de la hora (debe ser ~1 min o menos). Revisa también adb shell dumpsys alarm | findstr
   frostpom. Al terminar, vuelve a dar el permiso.
8. Ahorro de batería (pendiente de la 4.7.2): enciéndelo, empieza un pomodoro de 5 min, sal de la
   app y bloquea. En el registro, ¿sale "ended" o "update: el bloque terminó en segundo plano", y
   llega el aviso? Prueba también adb shell dumpsys deviceidle force-idle.
9. Si cambiaste algo, corre npm test y dime qué archivos cambiaste y por qué.

Reglas: no hagas commits ni push (los hago yo con mi cuenta). No subas ni me pidas claves (.jks,
contraseñas, la clave secreta de Supabase o de RevenueCat). No toques server/supabase/schema.sql.
Si necesitas que entre a la app, pídemelo: la contraseña la escribo yo. No pegues registros
completos: solo las líneas de FrostTimer.
```

4. Cuando todo esté bien, genera el `.aab` firmado (versionCode 40703), súbelo a Prueba cerrada y
   sube el ícono de Navidad en Play Console (`docs/google-play/icono-512.png`).

## v4.7.4: probar la versión con R8 (la de la tienda)

R8 solo corre al generar el `.aab` firmado, así que esta prueba se hace con la versión que baja de
Google Play, no con Run ▶.

1. Descomprime, pega tus claves en `js/config.js`, `npm install` y `npm run android:actualizar`.
   Debe decir **versionCode 40704** y **"R8 (código optimizado) ENCENDIDO en la versión para la tienda"**.
2. Android Studio → **Build → Generate Signed App Bundle / APK → Android App Bundle → release**
   (tarda un poco más que antes: es R8 trabajando).
3. Play Console → **Pruebas → Prueba interna** → Crear versión → sube el `.aab`. En **Verificadores**,
   agrega tu correo y copia el **enlace para unirse**. La prueba interna no pasa por revisión.
4. En el Galaxy, **desinstala** la FrostPom que instaló Claude Code (está firmada distinto y Play no
   puede actualizarla), abre el enlace, acepta y instálala desde Play Store.
5. Revisa (lo que R8 podría romper es lo nativo):
   - la app abre normal (sin pantalla blanca) y entras con tu cuenta;
   - empiezas, pausas y terminas un pomodoro; sale el reproductor y responden ⏮ ⏸ ⏭ ✓;
   - los widgets 4 × 2 y 2 × 2 y sus botones;
   - el aviso del final (con la app cerrada) y los sonidos;
   - la pantalla de Premium muestra los precios de Google Play (RevenueCat);
   - el anuncio del descanso (si los anuncios están encendidos) y abrir la página de privacidad.
6. Si todo está bien: Prueba interna → la versión 40704 → **Promocionar versión → Prueba cerrada**
   (no hay que volver a subir nada).
7. Si algo falla: Play Console → **Android vitals → Fallos y ANR** muestra el error con nombres
   reales (gracias al mapping.txt). Mándale a Claude la captura y, mientras, usa el plan B
   (`$env:FROSTPOM_R8="0"; npm run android:actualizar` y genera el `.aab` otra vez).

## v4.8.0: si faltan los widgets o el reproductor

En la 4.7.4 bajada de Prueba interna **no aparecían los widgets** en la lista del celular y el
**reproductor no salía** aunque el permiso de notificaciones estaba dado. La lista de widgets sale
del manifiesto de la app, y Android (y R8) nunca quitan lo que el manifiesto nombra; así que, si los
widgets no están ni en la lista, lo más probable es que **esta pieza (@frostpom/timer) no entró al
`.aab`**. Pasa cuando `npx cap sync` no la encuentra en `node_modules` (por ejemplo, si
`npm install` falló o se corrió en otra carpeta), y antes nada avisaba.

Lo que cambió en la 4.8.0:

- `npm run android:actualizar` termina con `tools/revisar-android.mjs`: si la pieza no quedó en el
  proyecto de Android, **se detiene con un error rojo [X]** y dice cómo arreglarlo. Si todo está
  bien, dice **"[OK] La parte nativa de FrostPom… está en el proyecto de Android."**
- R8 tiene una regla extra que guarda todo `com.startupprometeus.frostpom.timer` tal cual (por si
  acaso).

**(v4.8.2) Lo más fácil para saberlo, sin cables:** en el celular, **Ajustes → Acerca de** (al
final) dice **"Diagnóstico: reproductor y widgets ✓/✗ · anuncios: … · Google Play ✓/✗"**. Si dice
✗ en "reproductor y widgets", esta pieza no entró a la app que instalaste: sigue los pasos de abajo.

Pasos (a mano, en PowerShell, en la carpeta del proyecto):

1. `npm install` y luego `npm run android:actualizar`. En lo que imprime, busca la línea
   **"Found N Capacitor plugins for android"**: en la lista de abajo debe estar
   **`@frostpom/timer`**. Al final debe salir el **[OK]**.
2. Si sale **[X]**:
   - Revisa que exista la carpeta: `dir node_modules\@frostpom` (debe mostrar `timer`).
   - Si Windows dice "Filename too long", borra `native\frostpom-timer\android\build` y repite
     `npm install`.
   - Repite `npm run android:actualizar` hasta ver el [OK]. **No generes el `.aab` antes.**
3. Genera el `.aab` firmado (versionCode **40800**), súbelo a **Prueba interna** e instálalo desde
   Play Store (desinstala antes la versión instalada desde Android Studio, si la hay).
4. Prueba: la lista de widgets del celular (mantén presionado el inicio → Widgets → FrostPom) y el
   reproductor (empieza un pomodoro y sal de la app).
5. Si **aun así** falta algo, conecta el celular por USB (con depuración USB) y corre:

```
adb shell dumpsys package com.startupprometeus.frostpom | findstr /i "FrostWidget TimerActionReceiver"
adb shell dumpsys appwidget | findstr /i frostpom
findstr /i frostpom android\capacitor.settings.gradle android\app\capacitor.build.gradle android\app\src\main\assets\capacitor.plugins.json
adb logcat -c
adb logcat -s Capacitor FrostTimer
```

   (con el último abierto, abre FrostPom y empieza un pomodoro; Ctrl + C para parar). Mándale a
   Claude lo que salga: lo importante es si aparece `FrostWidget` en el primero y
   `Registering plugin instance: FrostTimer` en el último. No hace falta ningún dato tuyo.
6. Plan B mientras tanto: `$env:FROSTPOM_R8="0"; npm run android:actualizar` y genera el `.aab`
   otra vez (sale sin R8; Play solo vuelve a mostrar el aviso de optimización).

Si prefieres que lo revise Claude Code en tu PC, pégale esto:

```
En este proyecto (FrostPom, Capacitor 8), la versión de la tienda salió sin los widgets ni la
notificación tipo reproductor del plugin local @frostpom/timer (native/frostpom-timer). Revisa,
sin cambiar código todavía: 1) que node_modules/@frostpom/timer exista y apunte a
native/frostpom-timer; 2) que "npm run android:actualizar" liste @frostpom/timer en "Found …
Capacitor plugins for android" y termine con [OK]; 3) que android/capacitor.settings.gradle,
android/app/capacitor.build.gradle y android/app/src/main/assets/capacitor.plugins.json
mencionen frostpom-timer / FrostTimerPlugin; 4) genera el bundle release (gradlew bundleRelease,
SIN firmar con mi llave: no me pidas contraseñas) y revisa con bundletool o apkanalyzer que el
manifiesto del módulo base tenga los receivers FrostWidget y TimerActionReceiver. Dime qué
encontraste antes de arreglar nada. No hagas commits.
```

## v4.9.0: la notificación que "se abría sola"

Lo que pasaba: con la sesión de reproducción, Android (y más One UI de Samsung) trata a FrostPom
como música: la pone **arriba del todo y expandida** al bajar la cortina, y la deja ahí aunque la
app esté cerrada (la notificación vive aparte de la app). Arreglo:

- `TimerStore.player` (lo manda la web: `player` en los textos de la notificación) decide el estilo.
  Por defecto `false` → notificación normal **sin** `MediaStyle` ni sesión (`TimerMedia.release()`).
- Corriendo, sigue fija (`setOngoing(true)`); **en pausa** se puede deslizar y, en el modo normal,
  tiene `setTimeoutAfter(30 min)` (`PAUSED_TIMEOUT_MS`), así no se queda para siempre si te olvidaste.
- Con el reproductor encendido en Ajustes, todo es como en la v4.8 (los widgets no cambian).

Cómo probarlo: inicia un pomodoro, cierra la app (deslízala en Recientes) y baja la cortina: la
notificación debe estar en la lista normal, plegada. Pausa y deslízala: debe irse. Después enciende
**Ajustes → Notificación tipo reproductor**, vuelve a empezar y debe salir el reproductor como antes.

## En Google Play

- No hay formularios nuevos: sin servicio en primer plano y sin `USE_EXACT_ALARM`. La sesión de
  reproductor no reproduce audio ni pide permisos.
- Conviene agregar una captura de los widgets a la ficha.
