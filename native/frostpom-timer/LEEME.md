# FrostTimer: la notificación en curso y el widget de Android (fase 5, v4.6.0)

Este es el código **nativo** (Kotlin) de la fase 5. La parte web ya está lista en la app (v4.5.0) y
se prende sola cuando la app de Android trae este complemento. **Todavía no está activado**: hay que
compilarlo y probarlo en tu PC, porque en la nube de Claude no se pueden descargar Android ni Gradle.

Mientras no lo actives, la app de Android funciona igual que la v4.4.1 (el aviso del final lo
programa el complemento de notificaciones de Capacitor).

## Qué hace

- **Notificación en curso ("como Spotify")**: el modo, la cuenta regresiva (el cronómetro de Android
  baja solo), tu compañero y los botones **Pausar/Continuar**, **Saltar** y **Terminar y guardar**.
  Desaparece al llegar a cero. Canal propio "Pomodoro en curso" (sin sonido ni vibración).
- **Widget 4 × 2 y 2 × 2** con el diseño de tu mockup: ⌛ el modo, la hora grande (en Lilita One),
  la frase, la barra con tu compañero, los botones ▶/⏸ ⏮ ⏭ ✓ y, a la derecha, los animales en la
  fogata (`artico-amigos.webp`) con el globito "¡Estudiando juntos!". Claro u oscuro según la app.
- **Aviso del final exacto** si diste el permiso "Alarmas y recordatorios" (la app lo pide **una
  vez**, con explicación, después del primer pomodoro completo). Sin él, llega con unos minutos de
  margen, como hoy. **No** usa `USE_EXACT_ALARM` ni servicios en primer plano.
- **Botones con la app cerrada**: la copia del reloj del teléfono cambia al instante (notificación,
  widget y aviso) y la acción queda anotada con su hora. Al abrir la app, la parte web la aplica a
  esa hora (progreso, ranking y tus otros aparatos quedan bien).
- **Al reiniciar el teléfono** vuelven la notificación y el aviso del final.

## Archivos

```
native/frostpom-timer/
  package.json                       "@frostpom/timer" (complemento local de Capacitor)
  android/build.gradle               biblioteca de Android con Kotlin
  android/src/main/AndroidManifest.xml
  android/src/main/java/com/startupprometeus/frostpom/timer/
    FrostTimerPlugin.kt              lo que la app web le pide (update, getPendingActions…)
    TimerState.kt                    la copia del reloj y sus acciones (lógica pura)
    TimerStore.kt                    lo guardado en el teléfono y los textos
    TimerEngine.kt                   decide: notificación, aviso, widget y cada 15 min
    TimerNotification.kt             la notificación en curso y el aviso del final
    TimerAlarm.kt                    las alarmas (exacta si hay permiso)
    TimerActionReceiver.kt           los botones, el aviso del final y el reinicio del teléfono
    FrostWidget.kt                   los widgets (4 × 2 y 2 × 2)
  android/src/main/res/              diseños, íconos, textos (inglés y español), fuente y arte
  android/src/test/…/TimerStateTest.kt   pruebas de la lógica (sin emulador)
```

La parte web que habla con él: `js/native.js` (sección v4.6) y `js/ui/native-ui.js`
(`syncNativeTimer`, `applyNativeActions`, `maybeAskExactAlarms`). Sus pruebas con un complemento
simulado están en `tests/e2e_android.py` (sección F).

## Lo que ya se comprobó en la nube

- El Kotlin **compila** (Kotlin 2.4) contra una versión mínima de las clases de Android y
  Capacitor que usa: sin errores ni advertencias. No es el SDK real, así que en tu PC puede salir
  algún detalle (por ejemplo, de versiones de Gradle).
- Las 4 pruebas de `TimerStateTest.kt` pasan.
- La parte web, con el complemento simulado: 15 comprobaciones nuevas en `tests/e2e_android.py`.

## Cómo activarlo (con Claude Code en tu PC)

1. Descomprime la versión nueva encima de tu carpeta como siempre (sin borrar `.git`) y vuelve a
   pegar tu clave del sitio de Turnstile en `js/config.js` (`captcha.siteKey`).
2. Abre una terminal en la carpeta del proyecto y escribe `claude`.
3. Copia y pega este mensaje:

```
Hola, Claude. Quiero activar la fase 5 de FrostPom: la notificación en curso y el widget de Android.
El código nativo ya está escrito en native/frostpom-timer (lee native/frostpom-timer/LEEME.md y
docs/ANDROID-NOTIFICACION-WIDGET.md). La parte web ya está lista y probada: no la cambies salvo que
sea necesario para que funcione con el complemento real.

Haz esto, en orden, y explícame cada paso en español sencillo:
1. Agrega "@frostpom/timer": "file:native/frostpom-timer" a "dependencies" de package.json y corre
   npm install.
2. Corre npm run android:actualizar (copia la app y sincroniza Capacitor) y compila con
   cd android && .\gradlew assembleDebug (en Windows). Arregla los errores de compilación del
   complemento SIN cambiar lo que hace (versiones de Gradle, de Kotlin o de AGP, importaciones,
   nombres de la API de Android). El proyecto usa Capacitor 8.6, Java 21, minSdk 24 y targetSdk 36.
3. Corre las pruebas del complemento: .\gradlew :frostpom-timer:testDebugUnitTest
4. Revisa que en android/app/src/main/AndroidManifest.xml (ya unido) estén los permisos
   SCHEDULE_EXACT_ALARM y RECEIVE_BOOT_COMPLETED, y que NO aparezcan USE_EXACT_ALARM ni
   FOREGROUND_SERVICE.
5. Si hay un emulador o mi celular conectado (adb devices), instala la app (.\gradlew installDebug)
   y ayúdame a revisar la lista de pruebas de la sección 7 de docs/ANDROID-NOTIFICACION-WIDGET.md.
6. Cuando todo funcione, sube la versión a 4.6.0 en js/config.js, service-worker.js y package.json,
   agrega la entrada v4.6.0 en docs/CAMBIOS-v3.md y corre npm test.

Reglas: no hagas commits ni push (los hago yo con mi cuenta). No subas ni me pidas claves (.jks,
contraseñas, la clave secreta de Supabase). No toques server/supabase/schema.sql.
```

4. Cuando Claude Code termine, prueba en tu celular con la lista de
   `docs/ANDROID-NOTIFICACION-WIDGET.md` (sección 7) y después genera el `.aab` como siempre
   (`docs/GOOGLE-PLAY.md`), con `versionCode 40600`.

## En Google Play

- No hay formularios nuevos: sin servicio en primer plano y sin `USE_EXACT_ALARM`.
- Conviene agregar una captura del widget a la ficha.
- La fuente Lilita One es de licencia libre (SIL OFL): su licencia va en `OFL-LilitaOne.txt`.
