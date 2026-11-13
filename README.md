# FrostPom: Pomodoro Timer (v4.4.1)

> Antes se llamaba **StudyTimer**. Publicada en **https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/**

Pomodoro gamificado para niños y estudiantes, ambientado en el polo. Mientras más estudias (sin pasarte del límite saludable), más subes de rango, desbloqueas compañeros kawaii de edición limitada y **mantienes limpio tu polo**: si dejas de estudiar, el paisaje se llena de esmog, basura y petróleo.

> Este archivo reemplaza al antiguo `README.txt` (puedes borrarlo del repositorio).

**¿Qué sigue?** El paso a paso para publicar está en [`docs/PROXIMOS-PASOS.md`](docs/PROXIMOS-PASOS.md).

## Cómo probarla en tu computador (Windows)

1. Descomprime la carpeta, por ejemplo en `C:\Users\DELL\OneDrive\Documentos\planner`.
2. Abre una terminal en esa carpeta y ejecuta:

   ```
   cd C:\Users\DELL\OneDrive\Documentos\planner
   python -m http.server 8000
   ```

3. Abre en el navegador: **http://localhost:8000/**

   Ojo: ahora el archivo principal es `index.html`, así que la dirección es solo `/`. Ya no existe `study-planner-timer.html`.

Si ya usabas la v2, la v3 **abre tus datos tal cual** (mismo almacenamiento). Si venías de la v1, la app **trae tu historial automáticamente** y calcula tu rango con lo que ya habías estudiado. Los datos de la v1 no se borran.

> Se necesita `http://localhost` (o https) y no abrir el archivo con doble clic, porque el modo sin conexión y la contraseña de la cuenta requieren un "contexto seguro".

## Qué tiene

**Registro en dos pasos:** primero el nombre de usuario, la contraseña y la nacionalidad (opcional); después, una vista aparte para subir la foto de perfil (opcional, con recorte y zoom). Si no sube foto, la app le asigna un animal al azar; no hay lista de emojis para elegir ni botón de "Sugerir" nombre.

Diseño: paisaje polar simple (montañas en #2d68bc, #749eda y #93c0ed) con pingüinos, un oso polar, un zorro ártico y una foca que caminan, dan salticos y de vez en cuando dicen algo ("¡Cuac!", "¡Grrr!", "¡Yip yip!"). El cielo sigue la hora real (amanecer, día, atardecer y noche) y de noche el oso polar y el zorro ártico asan malvaviscos junto a la fogata y al iglú. El clima cambia cada 3 horas: despejado, nieve ligera, nevando o nevada fuerte. Encima van paneles claros tipo pegatina y botones de videojuego.

| Vista | Para qué sirve |
|---|---|
| **Enfocar** | Temporizador con modos (Mini 15+5, Clásico 25+5, Enfoque 45+10, Profundo 50+10, Largo 60+15) y **Mi ritmo**, donde eliges tus minutos de estudio y descanso. El descanso largo llega solo cada 4 pomodoros. Solo registra *cuánto* estudiaste, no *qué*. Junto al reloj está tu compañero (v4.2): con la tienda le das de comer (corazones al comer), le pones **nombre** (etiqueta sobre su cabeza) y se le nota el hambre (triste, llora); si pasa 3 días en 0 queda una tumba y se revive con 30 gemas. **Siempre encima** (v4.4.1, en el computador con Chrome o Edge): el botón del pin abre una ventanita con el reloj que queda encima de las demás ventanas, con el diseño del widget del autor y sus cinco botones. |
| **Premium 👑** | Corona en la barra superior. Modo prueba sin cobro: duración libre, todos los temas, sonidos y tonos, y recordatorios de enfoque. **Regalo de bienvenida (una sola vez):** 1000 gemas para alimentar a la mascota y una mascota de edición limitada que el usuario elige. |
| **Progreso** | Salud de tu polo, rango (Bronce → Leyenda), racha, misiones diarias, **Tu estudio** (pestañas: gráfica de los últimos 7 días o calendario del mes con los minutos de cada día) e historial (las 5 últimas sesiones, con "Ver más"). |
| **Ranking** | **Ranking global** (`docs/RANKING-GLOBAL.md`): podio y tabla de la semana y la temporada, el servidor mide el tiempo, máximo 4 h al día, aparecen los de 13+ con su nombre de usuario y se puede salir (y borrar los minutos). Con `mode: 'local'`: tu marca y el aviso "llega pronto". |
| **Tienda (en Enfocar)** | El ícono de la bolsa junto al compañero del reloj abre la bandeja de comida. **Arrastra** la comida hasta tu compañero con el mouse o con el dedo (con el teclado: Tab + Enter). 12 comidas de 2 a 8 gemas; la barriguita baja un poco cada hora y cada animal tiene favoritas. Es solo por cariño: no da XP. |
| **Perfil** | Tu personaje, resumen de estadísticas, **compañeros de edición limitada** (se ganan con logros), **foto de perfil** (opcional, solo en tu dispositivo), temas del temporizador (con gemas o Premium), **temporadas** (barra con los días que faltan, (i) con la explicación y tus medallas) y logros. Desde aquí se entra a **Ajustes**. |
| **Ajustes** | Cuenta (en línea: último guardado, y "Cerrar sesión" sin borrar nada; de antes: "Conectar"), región y "Eliminar mi cuenta", Premium, sonidos de concentración y tonos, recordatorios, temporizador ("Menos animaciones"), límite saludable diario, ranking y **guardado automático**. |

### Cómo se gana

- **XP:** 1 XP por minuto, más un bono por sesión completa, uno por la primera sesión del día (crece con la racha) y uno por **descansar completo** después de estudiar.
- **Límite saludable:** por defecto 4 h al día. Pasado eso, puedes seguir estudiando, pero ya no suma XP ni ranking.
- **Rangos:** Bronce, Plata, Oro, Platino, Diamante y Maestro (cada uno con III, II, I), y Leyenda con estrellas.
- **Temporadas:** cada 3 meses (ene–mar, abr–jun, jul–sep, oct–dic) empieza una temporada nueva. Tu rango vuelve a Bronce III, ganas gemas según el rango que alcanzaste (de 10 a 100) y queda una medalla en tu perfil. Logros, compañeros, temas, gemas, racha y calendario se conservan; el historial detallado de sesiones viejas se borra. La duración se cambia en `js/config.js → season.months`.
- **Guardado automático:** cada minuto se guarda al instante y el total de cada día queda en el calendario. Ya no hay copias manuales.
- **Gemas:** salen de misiones, logros, subidas de rango, el premio de cada temporada y el regalo de bienvenida de Premium (1000, una sola vez). Hoy **no hay compras con dinero real** (Premium está en modo prueba gratis).
- **Salud del polo:** cada día que estudias al menos 45 min el paisaje se mantiene limpio. Cuentan hoy y los últimos 3 días, y al empezar el polo arranca casi limpio.
- **Compañeros de edición limitada:** 5 personajes (Pingüino, Zorro Ártico, Oso Polar, Oso Marino y Tiburón Martillo). Cada uno se desbloquea con un logro (o uno de ellos como regalo de Premium) y te acompaña en el temporizador, el HUD y el ranking.
- **Pingüino animado:** te saluda al empezar y al completar una sesión, se enamora cuando subes de rango o reclamas una misión, y camina por el paisaje. Si no tienes otro compañero equipado, se queda contigo junto al temporizador.

### Arte

- `assets/companions/` tiene el arte del autor (Pingüino, Oso Polar, Oso Marino, Tiburón Martillo y Zorro Ártico) en WebP de 384 × 384, ya recortado y sin fondo.
- `assets/sprites/` tiene las animaciones del autor. Cada archivo es una tira horizontal de cuadros:
  - pingüino (256 × 256): `pinguino-saludo` y `pinguino-amor` (3 cuadros), `pinguino-camina` (4 cuadros) y `pinguino-quieto` (1 cuadro);
  - `oso-camina` (4 cuadros de 256 × 256);
  - `oso-malvavisco` (5 cuadros de 389 × 320, sin la fogata);
  - `fogata-llama` y `fogata-lenos`: la fogata del mismo dibujo, separada para que la llama titile.
- `assets/food/` tiene las 12 comidas de la Tienda (WebP sin fondo).
- `assets/sounds/` tiene los sonidos de concentración grabados (v4.0.2, de Pixabay: no exige mencionar al autor, pero se agradece en "Acerca de"): Ruido blanco, Lluvia, Ruido marrón, Olas del mar, Fogata y Lluvia y pájaros. Cada uno es un bucle sin corte, todos al mismo volumen (-20 LUFS). Se preparan con `python tools/preparar_sonidos.py CARPETA_CON_LOS_ORIGINALES` (necesita ffmpeg, numpy y scipy); el programa explica paso a paso qué hace. Viento polar y Ruido rosa se generan en el dispositivo (`js/ui/effects.js`).
- Para sumar un compañero nuevo: agrega su arte en `assets/companions/`, su entrada en `js/catalog.js → COMPANIONS` (con el logro que lo desbloquea) y su imagen en `js/ui/companions.js → BUILTIN_IMAGES`.

### Cambiar la imagen de un compañero

1. Guarda la imagen (PNG o WebP con fondo transparente, cuadrada y de 384 × 384 o más) en `assets/companions/`.
2. En `js/config.js`, agrega la ruta en `companionImages`. Por ejemplo: `companionImages: { 'tiburon-ballena': 'assets/companions/tiburon-ballena.webp' }`.
3. Agrega el archivo a la lista `PRECACHE` de `service-worker.js` para que funcione sin conexión.
4. Usa solo imágenes que puedas publicar: hechas por ti, encargadas con cesión de derechos o generadas con una herramienta cuyos términos permitan el uso comercial.

## Estructura

```
index.html              Estructura de las vistas (carga un solo módulo: js/main.js)
manifest.webmanifest    Datos para instalarla como app
service-worker.js       Modo sin conexión
_headers                Encabezados de seguridad para cuando la publiques en la web
package.json            Solo para `npm test` (no hay dependencias)
css/                    Estilos, en este orden (el mapa de dónde vive cada cosa está al principio de tokens.css)
  tokens.css            Variables: colores, bordes, sombras y medidas (tema claro y oscuro)
  base.css              Letras, la página y los campos del navegador
  layout.css            El contenedor, las vistas y sus rejillas
  components.css        Una sección por componente (barra de arriba, reloj, compañero, tienda, ventanas…)
  scenery.css           El paisaje de fondo, los animales y el paisaje de entrar
  utilities.css         Ayudas sueltas, pausas de rendimiento y "Menos animaciones"
  legal.css             Solo las páginas de privacidad, normas y eliminar cuenta
js/                     Lógica pura: sin DOM, se prueba en Node
  config.js             Configuración pública (aquí NUNCA van secretos)
  util.js               Fechas, formatos, limpieza de texto
  game.js               Reglas del progreso: rangos, XP, rachas, misiones, logros, salud del polo
  catalog.js            Lo que se elige o se posee: temas, compañeros, modos, sonidos, regiones, Premium
                        y effectivePrefs(): qué está EN EFECTO ahora (única fuente de verdad)
  identity.js           Apodos, avatares, filtro de nombres de usuario, países
  timer.js              Reloj del bloque (pausas, hora real de fin)
  session.js            El bloque en curso: reloj + guardado + coordinación entre pestañas
  engine.js             Aplica sesiones, misiones y compras al estado y devuelve "eventos"
  storage.js            Única puerta a localStorage: validación y migración desde la v1
  season.js             Temporadas: fechas, nombre, premio y resumen
  weather.js            Clima del polo (cambia cada 3 horas, igual para toda la región)
  voices.js             Onomatopeyas de los animales según el momento
  pet.js                Tienda: comidas, barriguita de tu mascota y sus favoritas
  ui/feeding.js         Bandeja de comida en Enfocar: arrastrar y soltar (Pointer Events)
  ui/photo.js           Foto de perfil: recorte, zoom y sin datos ocultos (EXIF)
  security.js           Contraseña de la cuenta (PBKDF2 + bloqueo por intentos)
  leaderboard.js        Ranking local (tu marca, sin bots)
  board.js              Ranking global: sesión de Supabase, pomodoros medidos por el servidor
  sync.js               Cuentas en línea: qué se sube (todo menos la foto) y qué se trae
  cloud.js              Supabase: cuentas, recuperar la contraseña y llamadas al servidor
  captcha.js            CAPTCHA de Cloudflare Turnstile (apagado hasta poner la clave del sitio)
  main.js               Arranque, navegación y eventos globales
  ui/                   Interfaz (un archivo por vista o pieza)
    context.js          Dueño del estado en pantalla: state, mutate(), session
    dom.js, feedback.js Ayudantes de DOM; toasts y diálogos
    widgets.js          Piezas repetidas: avatar, banderas, buscador de país, botones de modo
    focus.js            Enfocar (temporizador)        progress.js / activity.js  Progreso
    profile.js          Perfil                        ranking.js                 Ranking
    settings.js         Ajustes                       account.js                 Cuenta e inicio
    cloud-ui.js         Iniciar sesión, conectar, cerrar sesión            board-ui.js   Ventanas del ranking
    premium.js, sound.js, reminders.js, hud.js, celebrations.js
    effects.js, emblems.js, companions.js, scenery.js   Sonidos, emblemas, arte y paisaje
assets/                 Fuentes (licencia OFL, incluidas), íconos, arte y sonidos (assets/sounds/)
tools/                  preparar_sonidos.py: recorta, vuelve bucle e iguala el volumen de los sonidos
server/supabase/        Base de datos del ranking global y de las cuentas en línea + pruebas
tests/                  Pruebas automáticas
docs/                   Seguridad, cambios y hoja de ruta
```

## Pruebas

```
npm test                                             # 71 pruebas de la lógica (necesita Node 18+)
python tests/e2e_smoke.py http://localhost:8000/     # recorrido en navegador (opcional, ver el archivo)
python tests/e2e_ingles.py http://localhost:8000/    # toda la app en inglés: avisa si queda texto en español
python tests/e2e_recuperar.py http://localhost:8000/ # recuperar contraseña por correo (simula Supabase)
python tests/e2e_cobro.py http://localhost:8000/     # cobro de Premium con Microsoft Store (simulado)
python tests/e2e_ranking.py http://localhost:8000/   # ranking global con un Supabase simulado
python tests/e2e_cuentas.py http://localhost:8000/   # cuentas en línea con un Supabase simulado
python tests/e2e_sonidos.py http://localhost:8000/   # sonidos grabados: bucle sin corte y sin internet
python tests/e2e_captcha.py http://localhost:8000/   # CAPTCHA con Supabase y Turnstile simulados
python tests/e2e_android.py http://localhost:8000/   # reportar y ocultar, normas, borrar cuenta y app de Android (simulada)
python tests/e2e_mascota.py http://localhost:8000/   # v4.2: corazones, hambre, tumba, revivir y nombre de tu compañero
python tests/e2e_encima.py http://localhost:8000/    # v4.4.1: "Siempre encima" (la ventanita con el reloj)
python tests/store_check.py http://localhost:8000/   # lista para Microsoft Store: manifiesto, instalable,
                                                     # sin conexión, 8 tamaños de ventana y accesibilidad (axe)
npm run test:visual                                  # v4.3.3: fotos de cada pantalla comparadas con las aprobadas
                                                     # (guía: docs/PRUEBAS-VISUALES.md)
```

Para las pruebas del servidor del ranking necesitas PostgreSQL: `server/supabase/test/run_local.sh` (37 comprobaciones).

## App de Android (Google Play)

Con Node 22+ y Android Studio: `npm install`, `npm run android:crear` y `npm run android:abrir`. Paso a paso completo: [`docs/GOOGLE-PLAY.md`](docs/GOOGLE-PLAY.md).

## Publicar en Microsoft Store

Sigue `docs/MICROSOFT-STORE.md`: GitHub Pages, cuenta individual en Partner Center, reservar el nombre, PWABuilder y envío. El texto de la ficha y las respuestas de clasificación por edad están en `docs/microsoft-store/FICHA.md`.

## Documentación

- [`docs/PROXIMOS-PASOS.md`](docs/PROXIMOS-PASOS.md): **qué hacer ahora**, en orden, hasta tener la app en Microsoft Store.
- [`docs/COPIA-DE-SEGURIDAD.md`](docs/COPIA-DE-SEGURIDAD.md): **copia de seguridad manual** de Supabase (plan gratis) desde Windows, y cómo restaurarla.
- [`docs/CAPTCHA.md`](docs/CAPTCHA.md): **encender el CAPTCHA** (Cloudflare Turnstile) en orden, sin dejar a nadie por fuera.
- [`docs/GOOGLE-PLAY.md`](docs/GOOGLE-PLAY.md): **publicar en Google Play** (v4.1): proyecto de Android, prueba en tu celular, firma, ficha (`docs/google-play/FICHA.md`), prueba cerrada y producción.
- [`docs/PRUEBA-DE-SEGURIDAD.md`](docs/PRUEBA-DE-SEGURIDAD.md): preparar una **prueba de seguridad** externa en un proyecto aparte.
- [`docs/TIENDAS-MOVILES.md`](docs/TIENDAS-MOVILES.md): **llevar FrostPom a Google Play y App Store** paso a paso (Capacitor, costos, prueba cerrada de 12 personas, revisión de Apple).
- [`docs/CUENTAS-EN-LINEA.md`](docs/CUENTAS-EN-LINEA.md): **cuentas en línea (v4.0)**: qué correr en Supabase antes de publicar, cómo probarlas y cómo atender pedidos de copia o borrado de datos.
- [`docs/RANKING-GLOBAL.md`](docs/RANKING-GLOBAL.md): **encender el ranking global** paso a paso (Supabase, SQL, moderación y limpieza).
- [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md): cómo se protegen los datos hoy y qué hacer antes de lanzar.
- [`docs/CAMBIOS-v3.md`](docs/CAMBIOS-v3.md): reorganización del código y errores corregidos en la v3.
- [`docs/CAMBIOS-v2.md`](docs/CAMBIOS-v2.md): errores que tenía la v1 y cómo se corrigieron.
- [`docs/HOJA-DE-RUTA.md`](docs/HOJA-DE-RUTA.md): pasos para llegar a App Store y Play Store, e ideas.
- Planes por aprobar (v4.4.1): [`docs/MULTI-DISPOSITIVO.md`](docs/MULTI-DISPOSITIVO.md) (tu cuenta en todos tus aparatos, con el reloj en vivo), [`docs/ANDROID-NOTIFICACION-WIDGET.md`](docs/ANDROID-NOTIFICACION-WIDGET.md) (notificación tipo Spotify y widget) y [`docs/GOOGLE-PLAY-BILLING.md`](docs/GOOGLE-PLAY-BILLING.md) (cobrar Premium en Android).
