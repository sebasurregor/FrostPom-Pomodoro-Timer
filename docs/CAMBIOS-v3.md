# Cambios de la v2 a la v3

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
