# Seguridad y privacidad de FrostPom

Este documento explica qué protege la app hoy, cuáles son sus límites honestos y qué falta antes de lanzarla en las tiendas. La idea central es simple: **el dato más seguro es el que nunca se recolecta.**

## 1. Lo que la app NO recolecta (minimización de datos)

- **No pide nombre real, correo, edad ni ubicación.** Cada quien crea su nombre de usuario (pasa por un filtro de groserías e insultos, y el registro recuerda no usar uno que revele quién eres). El avatar es un animal asignado al azar, un compañero ganado o una foto opcional que no sale del dispositivo.
- **No registra en qué estudias.** Se eliminó la materia y la meta de cada sesión: solo se guarda cuánto tiempo estudiaste y cuándo. Al migrar desde la v1, tampoco se traen las materias ni las notas antiguas.
- **No hay terceros.** Ni analítica, ni anuncios, ni CDNs, ni Google Fonts: las fuentes vienen dentro de la app. Ninguna petición sale del dispositivo. Esto es justamente lo que Apple exige para apps infantiles (ver sección 5).

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

## 3. Servidor del ranking global (`server/supabase/schema.sql`)

Está diseñado para Supabase (PostgreSQL), y sus reglas se probaron en un PostgreSQL real con `server/supabase/test/tests.sql`.

1. **Las tablas no se pueden tocar directamente.** Viven en un esquema privado, con *Row Level Security* y sin políticas. El único acceso son funciones con reglas.
2. **El servidor mide el tiempo con su propio reloj.** Al terminar una sesión se acredita el *menor* entre lo que dice la app, lo planeado y el tiempo real que pasó. Cambiar la hora del teléfono o decir "estudié 25 min" a los 10 segundos no sirve. Ambas trampas están probadas.
3. **Hay un límite diario igual para todos (4 h)**, y un máximo de 60 sesiones iniciadas en 24 horas para frenar abusos.
4. **El apodo lo arma el servidor.** El cliente solo elige índices de las listas, así que no hay texto libre, groserías ni nombres reales.
5. **Nadie aparece en el ranking sin aceptarlo** (por defecto, `show_on_board = false`), y el ranking nunca devuelve identificadores internos.
6. **Cada persona puede exportar y borrar su cuenta.** `export_my_data()` y `delete_my_account()` lo hacen, y la prueba verifica que no quede nada.

**Reglas de oro con Supabase:**

- La clave `anon` puede ir en la app (es pública por diseño). La clave **`service_role` NUNCA** puede ir en la app, ni en el repositorio, ni en capturas de pantalla.
- Cuando conectes el servidor, agrega su dominio a `connect-src` en la *Content Security Policy* de `index.html`.
- Activa "Anonymous sign-ins" si no vas a pedir correo, y revisa los límites de peticiones (*rate limits*) en el panel de Supabase.

## 4. Si la publicas en la web

El archivo `_headers` (formato de Netlify y Cloudflare Pages) agrega protecciones que no se pueden poner dentro del HTML. Por ejemplo, impide que otra página meta tu app en un marco (*clickjacking*) y obliga a usar https.

## 5. Requisitos de tiendas y leyes: la app es para todo el público

Al ser para todas las edades, la app es de **público mixto**. En la práctica, eso significa:

- **No se publica en la categoría Niños de Apple.** Si la incluyes en el público objetivo de Google Play, aplica la política de Familias para los usuarios menores.
- **Antes de las funciones sociales y de las cuentas** hay que poner una pantalla de edad neutral, que pregunte el año de nacimiento sin sugerir una respuesta. Con ella, los menores reciben la versión segura: amigos solo por código, sin salas abiertas y con permiso de un adulto.
- **La versión de hoy, sin cuentas ni funciones sociales,** ya cumple: no recolecta datos personales.

> Esto es orientación técnica, no asesoría legal. Antes de lanzar, conviene revisarlo con un abogado.

- **Apple (categoría Niños):** las apps para niños no pueden incluir analítica ni publicidad de terceros, ni enviar datos a terceros. Si la app permite crear cuentas, también debe permitir borrarlas desde la propia app.
- **Google Play (política de Familias):** hay que declarar todos los datos que se recolectan de niños, no usar identificadores como el ID de publicidad, no pedir ubicación en apps solo para niños y exigir la acción de un adulto antes de que un niño comparta información en funciones sociales. Además, la app debe cumplir COPPA y GDPR.
- **Colombia, Ley 1581 de 2012, artículo 7:** el texto prohíbe tratar datos personales de niños, niñas y adolescentes, salvo los de naturaleza pública. Por lo que sé (verifícalo con un abogado), la Corte Constitucional y el Decreto 1377 de 2013 lo interpretan como permitido solo si responde al interés superior del menor y con autorización de su representante legal. El diseño actual, sin nombre, sin correo y con apodo generado, reduce mucho ese riesgo.

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
- [ ] Repetir las pruebas: `node --test tests/logic.test.js`, `tests/e2e_smoke.py` y `server/supabase/test/run_local.sh`.

## Accesibilidad: movimiento

Antes, si Windows, macOS, Android o iOS tenían activado "reducir movimiento" (en Windows: *Efectos de animación* apagado), la app detenía todas las animaciones sin avisar, y parecía que el fondo estaba roto. Desde la v3.1 el control es **"Menos animaciones"** en Ajustes. Si el sistema pide menos movimiento, la app lo avisa una vez y dice dónde está ese ajuste. Así se cumple WCAG 2.2.2 ("Pausar, detener, ocultar"): el movimiento automático se puede detener.
