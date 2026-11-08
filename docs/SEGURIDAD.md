# Seguridad y privacidad de FrostPom

Este documento explica qué protege la app hoy, cuáles son sus límites honestos y qué falta antes de lanzarla en las tiendas. La idea central es simple: **el dato más seguro es el que nunca se recolecta.**

## 1. Lo que la app NO recolecta (minimización de datos)

- **No pide nombre real, edad ni ubicación. El correo es opcional** y solo sirve para recuperar la contraseña (ver más abajo). Cada quien crea su nombre de usuario (pasa por un filtro de groserías e insultos, y el registro recuerda no usar uno que revele quién eres). El avatar es un animal asignado al azar, un compañero ganado o una foto opcional que no sale del dispositivo.
- **No registra en qué estudias.** Se eliminó la materia y la meta de cada sesión: solo se guarda cuánto tiempo estudiaste y cuándo. Al migrar desde la v1, tampoco se traen las materias ni las notas antiguas.
- **Un solo tercero, y solo si agregas correo:** Supabase Auth (`js/cloud.js`). Ni analítica, ni anuncios, ni CDNs, ni Google Fonts: las fuentes vienen dentro de la app. Esto es justamente lo que Apple exige para apps infantiles (ver sección 5).

## 1b. Correo de recuperación (v3.7)

- A Supabase va **solo el correo** y una contraseña aleatoria de 48 caracteres que nadie conoce. La contraseña de FrostPom y su huella nunca salen del dispositivo.
- La recuperación usa un **código** (`/auth/v1/recover` + `/auth/v1/verify`). La sesión temporal que devuelve Supabase se cierra enseguida (`/logout`) y no se guarda.
- La app solo envía el código si el correo escrito es **el mismo** que tiene guardada la cuenta (el correo se muestra a medias, `s••••@gmail.com`).
- La clave de `js/config.js` es la **publicable** (pensada para ir en el código). La clave secreta nunca va en la app.
- La CSP (`index.html` y `_headers`) solo permite conectarse a `https://tcxdmziakgppabwyrydd.supabase.co`.
- Límite honesto: quien tenga acceso al equipo y sepa usar las herramientas de desarrollador podría cambiar el correo guardado en el dispositivo. Igual que antes, los datos locales no son una caja fuerte; el código protege contra quien **no** tiene el equipo.

## 1c. Cobro de Premium (v3.8, apagado por ahora)

- El pago lo hace **Microsoft Store** (Digital Goods API + Payment Request API, `js/billing.js`). La app nunca ve la tarjeta.
- Al abrir la app se pregunta a la tienda si la suscripción sigue activa (`listPurchases`) y Premium se ajusta solo.
- Límite honesto: esa revisión ocurre en el dispositivo. Quien sepa usar las herramientas de desarrollador podría "fingir" Premium en su propio equipo. Para algo más fuerte, validar las compras desde un servidor con la *Microsoft Store collection API* (ver `docs/COBRO-PREMIUM.md`, sección 7).

## 2. Protecciones dentro de la app

| Riesgo | Qué hace la app | Dónde |
|---|---|---|
| Inyección de código (XSS) | Nunca se usa `innerHTML`; todo texto entra con `textContent`. Además, la *Content Security Policy* solo permite scripts propios, y *Trusted Types* bloquea en Chrome cualquier intento de insertar HTML. Una prueba automática mete `<img onerror=…>` como nombre en datos manipulados y verifica que se descarta. | `index.html`, `js/ui/dom.js` |
| Datos guardados manipulados | Cada campo se valida (tipo, rango y longitud), también el resumen de cada temporada (el nombre del rango se recalcula, no se confía en lo guardado). Se descartan claves peligrosas (`__proto__`) y caracteres invisibles o de dirección (usados para disfrazar texto). Desde la v3.1 la app no exporta ni importa copias; `exportBackup`/`importBackup` siguen en `storage.js` solo como formato para migrar a la nube. | `js/storage.js`, `js/util.js` |
| Menos datos guardados | Al cambiar de temporada se borra el historial detallado de sesiones; solo queda el total de cada día. | `js/engine.js` (rolloverSeason) |
| Foto de perfil | Se vuelve a dibujar en un lienzo de 256 × 256 (WebP o JPEG), así que **se borran los datos ocultos** de la foto original: ubicación GPS, modelo del teléfono y fecha. Solo se aceptan imágenes WebP, JPEG o PNG en base64, nunca SVG ni enlaces. Se queda en el dispositivo: los demás ven tu animal. **Cuando exista el servidor, la foto nunca debe subirse** (fotos de menores = datos personales sensibles). | `js/ui/photo.js`, `js/storage.js` |
| Eliminar la cuenta | "Eliminar mi cuenta" en Ajustes pide la contraseña (con el mismo bloqueo por intentos) y borra todo lo de la app en el dispositivo. Apple (regla 5.1.1(v)) y Google Play exigen esta opción dentro de la app. | `js/ui/account.js` |
| Otra persona usa tu progreso en el mismo dispositivo | La cuenta pide contraseña al abrir la app. Se guarda **solo un hash** PBKDF2-SHA256 (210 000 iteraciones y sal aleatoria). Tras 5 intentos fallidos se bloquea, y el bloqueo se duplica con cada nuevo fallo. Desde la v3 el mismo bloqueo aplica al cambiar la contraseña. El control parental con PIN se eliminó en la v2.4. | `js/security.js` |
| Contar dos veces una sesión | Si la app está abierta en dos pestañas, un candado (*Web Locks*) garantiza que solo una registre el final. | `js/session.js` |
| Caché con datos privados | El *service worker* solo guarda archivos de la propia app, solo peticiones GET y solo respuestas correctas. Nunca guarda respuestas de APIs ni de otros dominios. | `service-worker.js` |
| Navegador sin almacenamiento | Si el navegador bloquea el guardado (modo privado o cuota llena), la app no se rompe: funciona en memoria y avisa. Si un guardado falla, los cambios en memoria no se pierden (corregido en la v3). | `js/storage.js` |

### Límites honestos

- **El almacenamiento local no está cifrado.** Quien tenga el teléfono desbloqueado y conocimientos técnicos puede ver o editar los datos. Por eso la contraseña local protege de un uso casual, no es una caja fuerte.
- **Por la misma razón, el ranking real no puede calcularse en el teléfono:** cualquiera podría editar sus minutos. El ranking global debe validarse en el servidor (sección 3). En el primer MVP (v3.4) el ranking es solo local y no muestra rivales simulados.
- **El regalo de Premium (1000 gemas y una mascota) se entrega hoy en el dispositivo**, porque Premium está en modo prueba. La copia guardada se valida (solo mascotas que existen, sin repetir, y el regalo pendiente solo si de verdad se activó Premium), pero alguien con conocimientos técnicos podría editarla. Cuando haya cobro real, el estado Premium y el regalo deben venir de la compra validada por la tienda o el servidor, no del dispositivo.
- **En la app nativa** (Capacitor), si algún día guardas un token de sesión, debe ir en el llavero del sistema (Keychain en iOS, Keystore en Android) y no en `localStorage`.

## 3. Servidor del ranking global (`server/supabase/schema.sql`, v3.9)

Está hecho para Supabase (PostgreSQL), y sus reglas se probaron en un PostgreSQL real con `server/supabase/test/tests.sql` (23 comprobaciones). La guía para encenderlo es `docs/RANKING-GLOBAL.md`.

1. **Las tablas no se pueden tocar directamente.** Viven en un esquema privado, con *Row Level Security* y sin políticas. El único acceso son funciones con reglas. La prueba verifica que leer o escribir las tablas directamente falla.
2. **El servidor mide el tiempo con su propio reloj.** Al terminar una sesión se acredita el *menor* entre lo que dice la app, lo planeado y el tiempo real que pasó. Cambiar la hora del teléfono o decir "estudié 25 min" a los 10 segundos no sirve, y terminar dos veces la misma sesión tampoco. Esas trampas están probadas.
3. **Hay un límite diario igual para todos (4 h)**, y un máximo de 60 sesiones iniciadas en 24 horas para frenar abusos.
4. **La XP que manda la app se acota.** Solo decide el emblema que se ve en el ranking, y el servidor no acepta más de lo posible con los minutos que él mismo midió (la prueba intenta mandar 1.000.000).
5. **El nombre público es el nombre de usuario**, revisado en el servidor con las *mismas* reglas que en la app: formato y lista de groserías (una prueba unitaria verifica que las dos listas sean idénticas). No se repite, sin importar mayúsculas. El dueño puede ocultar un nombre con `private.hide_name()`.
6. **Todos (13+) aparecen por defecto y cualquiera puede salir** (`show_on_board`). El ranking nunca devuelve identificadores internos.
7. **La edad no sale del dispositivo.** La app pregunta el mes y año de nacimiento, lo guarda solo en el dispositivo y a los menores de 13 ni siquiera los conecta con el servidor. Pueden ver el ranking (sin sesión), pero no aparecen.
8. **Identidad:** cada persona tiene una cuenta **anónima** de Supabase. Si agrega su correo de recuperación (o recupera la contraseña), su lugar pasa a la cuenta con correo mediante un código de un solo uso que dura 10 minutos. Solo quien tiene las dos sesiones puede hacerlo.
9. **Cada persona puede descargar y borrar sus datos** desde Ajustes (`export_my_data()` y `delete_my_account()`). Al eliminar la cuenta de FrostPom también se borran del servidor.
10. **Limpieza:** `private.cleanup(90)` borra las cuentas anónimas sin actividad en 90 días y las sesiones de hace más de 400 días. La política de privacidad lo promete, así que hay que programarla (paso 7 de `RANKING-GLOBAL.md`).

**Reglas de oro con Supabase:**

- La clave **publicable** (`sb_publishable_…`) puede ir en la app: es pública por diseño. La clave **secreta** (`sb_secret_…` o `service_role`) **NUNCA** puede ir en la app, ni en el repositorio, ni en capturas de pantalla.
- El dominio de Supabase ya está en `connect-src` de la *Content Security Policy* (`index.html` y `_headers`).
- No actives el CAPTCHA de Supabase todavía: la app aún no lo envía y nadie podría unirse al ranking.

## 4. Si la publicas en la web

El archivo `_headers` (formato de Netlify y Cloudflare Pages) agrega protecciones que no se pueden poner dentro del HTML. Por ejemplo, impide que otra página meta tu app en un marco (*clickjacking*) y obliga a usar https.

## 5. Requisitos de tiendas y leyes: la app es para todo el público

Al ser para todas las edades, la app es de **público mixto**. En la práctica, eso significa:

- **No se publica en la categoría Niños de Apple.** Si la incluyes en el público objetivo de Google Play, aplica la política de Familias para los usuarios menores.
- **Pantalla de edad neutral (v3.9):** con el ranking global encendido, la app pregunta el mes y el año de nacimiento sin sugerir una respuesta. Los menores de 13 no se conectan al servidor. Si algún día hay amigos o salas, los menores deben recibir la versión segura: amigos solo por código, sin salas abiertas y con permiso de un adulto.
- **Adolescentes (13 a 17):** por decisión del autor aparecen en el ranking por defecto, con su nombre de usuario, y pueden salir en Ajustes. Lo único público es el nombre de usuario, el país, el animal y los minutos. Conviene revisar con un abogado si en tu país hace falta que, para ellos, el ranking venga apagado o con permiso de un adulto. Cambiarlo es sencillo: la edad mínima es `MIN_AGE` en `js/board.js`, y quién aparece por defecto se decide en `ensureJoined()` de `js/ui/board-ui.js`.

> Esto es orientación técnica, no asesoría legal. Antes de lanzar, conviene revisarlo con un abogado.

- **Apple (categoría Niños):** las apps para niños no pueden incluir analítica ni publicidad de terceros, ni enviar datos a terceros. Si la app permite crear cuentas, también debe permitir borrarlas desde la propia app.
- **Google Play (política de Familias):** hay que declarar todos los datos que se recolectan de niños, no usar identificadores como el ID de publicidad, no pedir ubicación en apps solo para niños y exigir la acción de un adulto antes de que un niño comparta información en funciones sociales. Además, la app debe cumplir COPPA y GDPR.
- **Colombia, Ley 1581 de 2012, artículo 7:** el texto prohíbe tratar datos personales de niños, niñas y adolescentes, salvo los de naturaleza pública. Por lo que sé (verifícalo con un abogado), la Corte Constitucional y el Decreto 1377 de 2013 lo interpretan como permitido solo si responde al interés superior del menor y con autorización de su representante legal. El diseño ayuda a reducir ese riesgo: no pide el nombre real, la fecha de nacimiento no sale del dispositivo, los menores de 13 no se conectan y se recomienda un nombre de usuario que no sea el real.

## 6. Propiedad intelectual

Las tiendas rechazan apps que usan contenido de terceros sin permiso, y esos dueños pueden reclamar.

- **Ya resuelto:** el paisaje, los emblemas, los íconos y cuatro compañeros (Pingüino Ninja, Hielo Gruñón, Tiburón Ballena y Tiburón de Groenlandia) son ilustraciones originales de este proyecto. Se inspiran en el estilo de apps y series conocidas, pero no copian sus personajes.
- **Arte del autor:** el pingüino (y sus sprites), el oso polar (caminando y asando malvaviscos, con su fogata), el oso marino, el tiburón martillo, el zorro ártico y las 12 comidas de la Tienda los proporcionó el autor. Antes de publicar, confirma que tienes los derechos de uso comercial. Si se generaron con una herramienta de IA, revisa sus términos y guarda una copia de la licencia. Las fuentes Lilita One y Nunito usan la licencia SIL Open Font, cuyo texto va incluido en `assets/fonts/`.
- **Necesitan permiso:** personajes de series y apps (Gunther o Jake de Hora de Aventura, el búho o el oso de Duolingo), portadas de libros (como el Álgebra de Baldor), personajes de memes, logotipos y diseños de marcas (como Casio), e imágenes tomadas de Google o de páginas educativas.
- **Puedes usar sin problema:** tus propias fotos, arte que encargues con cesión de derechos e imágenes de dominio público o con licencia CC0.

## 7. Donaciones a causas ambientales

Si vas a decir que parte de los ingresos ayuda a los polos:

- **Primero, un acuerdo real** con una organización, por escrito y con un porcentaje concreto. Anunciar una donación que no existe o que no se puede comprobar es publicidad engañosa.
- **Apple** solo permite recolectar donaciones dentro de la app a organizaciones sin ánimo de lucro aprobadas. Si no, la donación debe hacerse fuera de la app (por ejemplo, en Safari). **Google Play** tiene reglas parecidas para las apps que recaudan dinero para causas.
- **Lo más seguro:** que la empresa done una parte de sus ingresos por su cuenta y lo informe con transparencia (informe anual, certificados), sin pedirles dinero a los niños.

## 8. Lista de verificación antes de lanzar

- [ ] Decidir el público (solo niños, mixto o estudiantes mayores) y si habrá cuentas.
- [ ] Publicar una política de privacidad en lenguaje simple (es obligatoria en ambas tiendas).
- [ ] Llenar la "etiqueta de privacidad" de Apple y la sección "Seguridad de los datos" de Google.
- [ ] Si hay cuentas: borrado desde la app (ya existe en la app y en el servidor) y consentimiento del adulto.
- [ ] Mantener cero SDKs de terceros (analítica, anuncios, crash reporting) o usar solo los certificados para niños.
- [ ] Revisar que la clave `service_role` no esté en ningún archivo del repositorio.
- [ ] Confirmar que toda imagen agregada a `assets/companions/` tiene permiso de uso.
- [ ] Repetir las pruebas: `node --test tests/logic.test.js`, `tests/e2e_smoke.py`, `tests/e2e_ranking.py` y `server/supabase/test/run_local.sh`.

## Accesibilidad: movimiento

Antes, si Windows, macOS, Android o iOS tenían activado "reducir movimiento" (en Windows: *Efectos de animación* apagado), la app detenía todas las animaciones sin avisar, y parecía que el fondo estaba roto. Desde la v3.1 el control es **"Menos animaciones"** en Ajustes. Si el sistema pide menos movimiento, la app lo avisa una vez y dice dónde está ese ajuste. Así se cumple WCAG 2.2.2 ("Pausar, detener, ocultar"): el movimiento automático se puede detener.
