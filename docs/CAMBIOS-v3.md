# Cambios de la v2 a la v3

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
