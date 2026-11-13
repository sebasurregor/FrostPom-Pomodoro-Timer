# Fase 5 (v4.6.0): la notificación tipo Spotify y el widget de Android

> **Estado: PLAN para aprobar.** Todavía no hay código de esta fase. Al final están la lista de pruebas que harás en tu celular y las decisiones que necesito de ti.

## 0. Antes que nada: dónde conviene programarla

Esta fase es código **nativo de Android (Kotlin)**. Para saber si funciona hay que **compilarlo** con Gradle y el SDK de Android, que se descargan de servidores de Google.

- **Donde trabaja Claude en la nube, esos servidores están bloqueados:** se puede escribir el Kotlin, pero no compilarlo ni probarlo. Cada error de compilación sería una vuelta contigo.
- **En tu computador sí se puede:** Android Studio ya tiene el SDK. **Recomendación: hacer esta fase con Claude Code en tu PC.** Puede correr `gradlew assembleDebug`, ver los errores y arreglarlos solo, e incluso probar en el emulador.

## 1. Cómo se organiza el código (sin tocar `android/`)

La carpeta `android/` la crea Capacitor y no se sube al repositorio. Por eso el código nativo va en un **plugin local** dentro del repositorio:

```
native/frostpom-timer/
  package.json                    ← "@frostpom/timer", con "capacitor": { "android": { "src": "android" } }
  android/build.gradle
  android/src/main/AndroidManifest.xml   ← permisos, el receptor de los botones y el widget
  android/src/main/java/com/startupprometeus/frostpom/timer/
      FrostTimerPlugin.kt         ← lo que la app web le pide (update, getPendingActions, …)
      TimerStore.kt               ← la copia nativa del reloj (SharedPreferences)
      TimerNotification.kt        ← la notificación en curso
      TimerActionReceiver.kt      ← los botones de la notificación y del widget
      TimerAlarm.kt               ← el aviso del final
      FrostWidget.kt              ← el widget (AppWidgetProvider)
  android/src/main/res/           ← diseños del widget, íconos y textos (es y en)
```

- En `package.json` de la app: `"@frostpom/timer": "file:native/frostpom-timer"`.
- `npm run android:actualizar` (que corre `npx cap sync`) lo instala solo; `android/` sigue siendo desechable.
- En la web, `js/native.js` gana una función `timerChanged(estado)` que le avisa al plugin en cada cambio del reloj (empezar, pausar, saltar, terminar, avanzar). Fuera de Android no hace nada.

## 2. La notificación en curso ("como Spotify")

**Qué muestra:**
- el modo ("Modo enfoque", "Descanso"),
- la **cuenta regresiva**: un cronómetro de Android que baja solo (`setUsesChronometer` + `setChronometerCountDown`), sin que la app tenga que actualizarla cada segundo,
- tu compañero como imagen,
- y los botones **Pausar/Continuar**, **Saltar** y **Terminar y guardar**.

**Cómo se comporta:**
- Desaparece sola al llegar a cero (`setTimeoutAfter`); en ese momento suena el aviso del final, como hoy.
- En pausa muestra "En pausa · 12:34", con el tiempo quieto.
- Canal propio "Pomodoro en curso", de importancia baja (sin sonido ni vibración, para no molestar cada vez que cambia).

**Sin servicio en primer plano (foreground service).** Google Play exige declarar y justificar esos servicios, y un temporizador no está entre los tipos permitidos (solo cabría como "uso especial", con revisión). El cronómetro de la notificación cuenta solo, así que no hace falta.

## 3. El aviso del final y las alarmas exactas

**Hoy:** el aviso del final lo programa el plugin de notificaciones de Capacitor, de forma **inexacta a propósito** (puede llegar con algo de retraso si el teléfono está en reposo).

**Con los botones de la notificación** se puede pausar con la app cerrada, así que el aviso hay que moverlo o cancelarlo desde el código nativo. Por eso el plugin se encarga de ese aviso:

- **Si el usuario dio permiso de "alarmas y recordatorios"** (`SCHEDULE_EXACT_ALARM`), el aviso es exacto. Desde Android 14 ese permiso viene **apagado** en las apps nuevas: la app lo puede pedir con una explicación, nunca por sorpresa.
- **Si no lo dio**, el aviso llega en una ventana de pocos minutos (`setAndAllowWhileIdle`), como hoy.
- **No se usará `USE_EXACT_ALARM`.** Google Play solo lo permite a apps de despertador o calendario, y FrostPom no es ninguna de las dos.

## 4. Los botones cuando la app está cerrada

Si tocas "Pausar" en la notificación o en el widget con la app cerrada, la parte web no está corriendo. Entonces:

1. El plugin pausa **su copia** del reloj al instante, actualiza la notificación y el widget, y mueve el aviso del final.
2. Anota la acción con su hora en una lista de pendientes.
3. Al abrir la app, la parte web lee esa lista (`getPendingActions()`) y aplica cada acción a su hora: el progreso y el ranking quedan bien.
4. Con la fase 4 hecha, en ese momento también se avisa a tus otros aparatos.

**Limitación honesta:** "Terminar y guardar" desde la notificación con la app cerrada se apunta, pero la XP y el ranking se cuentan **cuando abres la app**. El ranking acepta el final hasta varias horas después, así que no se pierde.

**Al reiniciar el teléfono** se restauran la notificación y el aviso (`RECEIVE_BOOT_COMPLETED`).

## 5. El widget, con tu diseño

Basado en tu mockup ("FOCUS SESSION · 25:00 · Hora de concentrarse", la barra con el pingüino, los cinco botones y los animales en la fogata con "¡Estudiando juntos!"):

- **Tamaño principal 4 × 2.**
  - A la izquierda, sobre una tarjeta oscura: ⌛ "MODO ENFOQUE", la hora grande (cronómetro que baja solo), la frase y la barra con tu compañero.
  - Debajo, los botones ▶/⏸ ⏮ ⏭ ✓.
  - A la derecha, el dibujo de los animales en la fogata (sacado de tu arte `artico-amigos.webp`) con el globito.
- **Tamaño pequeño 2 × 2:** la hora, el modo y ▶/⏸.
- **Letras:** Lilita One para la hora y Nunito para lo demás (las mismas de la app, incluidas como recurso).
- **Claro y oscuro:** de noche como el mockup; en tema claro, la tarjeta clara.

**Límites de Android que cambian el mockup:**

| Del mockup | En el widget | Por qué |
|---|---|---|
| El pingüino avanza por la barra todo el tiempo | Se mueve cuando cambia el estado (empezar, pausar, al abrir la app) y, como mucho, cada 15 min | Android limita cuántas veces se actualiza un widget (por batería). La **hora sí baja cada segundo**, porque el cronómetro lo hace solo. |
| 🔁 "lo siguiente empieza solo" | Se queda en la app (y en la ventanita de Windows) | En 4 × 2 caben bien cuatro botones; es un ajuste, no algo de cada rato. |

## 6. Seguridad del código nativo

- **Todo en `try/catch`:** un error del plugin nunca cierra la app (en el peor caso, no se ve la notificación).
- **Android 7 (API 24) en adelante**, hasta Android 16 (API 36), como el resto de la app.
- **Sin servicios en primer plano y sin permisos raros.** Los permisos serían notificaciones (ya se pide), alarmas exactas (opcional) y arranque del teléfono.

## 7. Pruebas

**Automáticas:**
- `tests/e2e_android.py` con un plugin simulado: cada cambio del reloj le llega al plugin con los datos correctos, y las acciones pendientes se aplican bien al volver.
- Pruebas del Kotlin con Robolectric, si Claude Code lo corre en tu PC.

**En tu celular (lista para marcar):**
- [ ] La notificación aparece al empezar y baja segundo a segundo con la pantalla bloqueada.
- [ ] Pausar, Continuar, Saltar y Terminar desde la notificación con la app **abierta**.
- [ ] Lo mismo con la app **cerrada** (deslízala en apps recientes). Al abrirla, el progreso es correcto.
- [ ] Reinicia el teléfono con un pomodoro corriendo: vuelven la notificación y el aviso del final.
- [ ] Ahorro de batería encendido: el aviso del final llega (quizás con un poco de retraso).
- [ ] Modo oscuro e inglés: la notificación y el widget se ven bien.
- [ ] Widget 4 × 2 y 2 × 2: se ven bien, sus botones funcionan con la app cerrada y abren la app al tocar la hora.
- [ ] Con la fase 4: empiezas en el PC y el celular muestra la notificación sola.

## 8. Lo que tienes que hacer tú

1. Tener Android Studio actualizado (ya lo tienes) y abrir el proyecto después de `npm run android:actualizar`.
2. Probar en tu celular con la lista de arriba.
3. **En Play Console no hay declaraciones nuevas:** sin servicio en primer plano y sin `USE_EXACT_ALARM`, no hay formularios especiales. Sí hay que actualizar las capturas de la ficha con el widget.

## 9. Decisiones para aprobar

1. **¿Programarla con Claude Code en tu PC?** (Recomendado: así se compila y se prueba sola.)
2. **Tamaños del widget:** 4 × 2 y 2 × 2 (recomendado), ¿o solo 4 × 2?
3. **¿Está bien** que el pingüino de la barra del widget se mueva solo con los cambios (y cada 15 min), mientras la hora sí baja cada segundo?
4. **¿Pedir el permiso de alarmas exactas** (con una explicación) para que el aviso del final sea puntual? (Recomendado: sí, una vez, después del primer pomodoro.)
5. **El arte del widget:** ¿uso tu `artico-amigos.webp` (los animales en la fogata), o tienes una versión del mockup sin textos ni botones (solo el fondo y los animales) para usarla tal cual?
