# FrostTimer: la notificación tipo reproductor y los widgets de Android (v4.7.3)

Este es el código **nativo** (Kotlin) de la notificación en curso, los widgets y el aviso del
final. La parte web está en `js/native.js` y `js/ui/native-ui.js`. Desde la v4.7.1 viene encendido
en `package.json` (`"@frostpom/timer": "file:native/frostpom-timer"`). Se compila en tu PC con
Claude Code, porque en la nube de Claude no se pueden descargar Android ni Gradle.

## Qué hace

- **Notificación en curso, estilo reproductor (como Spotify)**: en la pantalla de bloqueo y en el
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

## En Google Play

- No hay formularios nuevos: sin servicio en primer plano y sin `USE_EXACT_ALARM`. La sesión de
  reproductor no reproduce audio ni pide permisos.
- Conviene agregar una captura de los widgets a la ficha.
