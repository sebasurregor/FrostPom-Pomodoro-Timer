# Medir la velocidad de FrostPom en tu Galaxy (v4.9.0)

La v4.9.0 trae varios arreglos de velocidad (los animales animados, la nieve, el desenfoque de las ventanas y el arranque; detalle en `docs/CAMBIOS-v3.md`). Se midieron en un celular simulado, pero lo que cuenta es **tu teléfono**. Esta guía sirve para medir **antes** (la versión que tienes ahora desde Google Play) y **después** (la 4.9.0), con números, usando Claude Code en tu computador.

## 1. Prepara el teléfono (una sola vez)

1. **Ajustes → Acerca del teléfono → Información de software** → toca **Número de compilación** 7 veces (pide tu PIN). Se activan las **Opciones de desarrollador**.
2. **Ajustes → Opciones de desarrollador → Depuración USB:** actívala.
3. Conecta el Galaxy al computador con el cable. En el teléfono sale **"¿Permitir depuración USB?"** → marca "Permitir siempre desde este equipo" → **Permitir**.
4. En el computador necesitas `adb` (viene con Android Studio, en `%LOCALAPPDATA%\Android\Sdk\platform-tools`). Claude Code lo busca por ti.

**No desinstales FrostPom** en ningún momento: si la desinstalas, se borra lo que está guardado solo en el teléfono (por ejemplo, tu foto de perfil y, si no tienes cuenta en línea, todo el progreso).

## 2. El orden

1. **Antes de subir la 4.9.0:** con la versión que tienes instalada desde Google Play, abre Claude Code en la carpeta del proyecto y pega el prompt de abajo. Él mide y guarda los números.
2. Sube la 4.9.0 a **Prueba interna**, actualízala en el teléfono **desde Google Play** (no desinstales) y vuelve a pegar el mismo prompt. Como ya existe el archivo de mediciones, compara.
3. Si algo sigue lento, mándame la tabla y lo que sentiste (en qué pantalla, al hacer qué).

## 3. El prompt para Claude Code

```text
Quiero medir qué tan rápida y fluida es mi app FrostPom en mi Samsung Galaxy, conectado por USB
con la depuración USB activada. Solo vas a MEDIR: no cambies ningún archivo del proyecto.

Reglas:
- No hagas commits ni push, y no modifiques el código ni la carpeta android/.
- NUNCA desinstales la app ni borres sus datos (adb uninstall, pm clear, etc.): se perdería
  lo que está guardado solo en el teléfono. Tampoco instales versiones de depuración encima.
- No me pidas contraseñas ni las escribas en ningún comando o archivo. Si hace falta iniciar
  sesión en la app, lo hago yo en el teléfono.
- Escribe los comandos para Windows (PowerShell). Si no encuentras adb, búscalo en
  %LOCALAPPDATA%\Android\Sdk\platform-tools y úsalo con la ruta completa.

Pasos:
1. Revisa que el teléfono esté conectado (adb devices) y anota el modelo
   (adb shell getprop ro.product.model), la versión de Android y la versión de FrostPom
   instalada (adb shell dumpsys package com.startupprometeus.frostpom, versionName y versionCode).
2. Arranque en frío, 5 veces: adb shell am force-stop com.startupprometeus.frostpom y luego
   adb shell am start -W -n com.startupprometeus.frostpom/.MainActivity. Anota TotalTime de cada
   vez y la mediana. Entre una y otra, espera 5 s. Además, pídeme que te diga cuántos segundos
   tarda en verse la ventana de bienvenida o la pantalla de Enfocar (lo cuento yo).
3. Fluidez con dumpsys gfxinfo. Para cada escena: adb shell dumpsys gfxinfo
   com.startupprometeus.frostpom reset, pídeme que haga la acción y que te diga "listo", y después
   adb shell dumpsys gfxinfo com.startupprometeus.frostpom. Anota "Total frames rendered",
   "Janky frames" (y su %), y los percentiles 50, 90 y 99. Escenas:
   a) Enfocar sin tocar nada, 20 segundos (con el paisaje y los animales).
   b) Enfocar con un pomodoro corriendo, 20 segundos.
   c) Cambiar de pestaña 5 veces seguidas: Progreso, Ranking, Perfil y Enfocar.
   d) Abrir la ventana de Premium (la corona), esperar 10 segundos y cerrarla.
   e) Si la app pide entrar al abrirla: la ventana de entrar, 15 segundos sin tocar.
4. Procesador: durante la escena a), adb shell "top -b -n 5 -d 2 | grep -E 'frostpom|sandboxed|webview'"
   (el proceso "sandboxed" es el que dibuja la página dentro de la app). Anota el %CPU promedio
   de cada proceso.
5. Memoria: adb shell dumpsys meminfo com.startupprometeus.frostpom y anota TOTAL PSS.
6. Guarda todo en una tabla en C:\Users\DELL\FrostPom-copias\mediciones-velocidad.md (fuera del
   proyecto), con la fecha, la versión de la app y una columna por medición. Si el archivo ya
   existe, agrega la medición nueva y haz una tabla de comparación antes/después.
7. Al final, explícame en español sencillo qué mejoró, qué empeoró y cuál escena sigue siendo la
   más lenta. Si ves algo raro (por ejemplo, más de 10 % de cuadros con tirones en una escena
   quieta), dime qué crees que es, pero no cambies nada.
```

## 4. Cómo leer los números

- **TotalTime** (arranque): lo que tarda Android en mostrar la app. Dentro de la app, la página tarda un poco más en dibujarse; por eso también cuentas tú los segundos.
- **Janky frames** (cuadros con tirones): el porcentaje de cuadros que llegaron tarde. Menos de 5 % se siente fluido; más de 15 % se nota trabado.
- **Percentil 90:** 9 de cada 10 cuadros tardaron eso o menos. En una pantalla de 60 Hz, 16 ms o menos es lo ideal.
- **%CPU** del proceso "sandboxed": con la app quieta en Enfocar debería ser bajo (un solo dígito en un celular moderno). Si es alto, algo se está dibujando sin parar.
