# Cambios de la v2 a la v3

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
