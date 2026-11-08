# Ficha de FrostPom para Microsoft Store

Textos listos para copiar en Partner Center (**Store listings → Español**). Revisa que todo siga siendo cierto antes de enviar: la tienda rechaza fichas que prometen lo que la app no hace.

## Nombre

**FrostPom** (si está ocupado al reservarlo: **FrostPom: Pomodoro Timer** o **FrostPom Pomodoro**). Usa en la ficha exactamente el nombre que reservaste.

## Descripción

¡Estudia con pingüinos! FrostPom es un pomodoro que convierte tus horas de estudio en un juego.

Elige cuánto quieres estudiar (25 + 5, 50 + 10 o tu propio ritmo) y concéntrate mientras tu compañero te acompaña junto al reloj. Cada minuto que estudias mantiene limpio tu polo: si lo dejas, llegan el esmog y la basura, y cuando vuelves a estudiar, todo vuelve a brillar.

• Sube de rango, de Bronce a Leyenda, en temporadas de tres meses.
• Cumple misiones diarias y gana gemas solo estudiando: no se compran con dinero.
• El pingüino te acompaña desde el primer día; desbloquea compañeros de edición limitada: oso polar, zorro ártico, oso marino y tiburón martillo.
• Pon tu foto de perfil (opcional, se queda solo en tu dispositivo).
• Dale de comer a tu compañero: arrastra la comida con el mouse o con el dedo.
• Mira tu progreso en un calendario y en la gráfica de los últimos 7 días.
• Un paisaje polar vivo, que sigue la hora de tu país: nieva, cambia el clima y de noche el oso asa malvaviscos junto a la fogata.
• Sonidos para concentrarte (lluvia, viento, ruido blanco) y descansos guiados.
• Un límite saludable diario, para premiar la constancia y no el desvelo.
• Modo oscuro para estudiar de noche.
• Funciona sin internet.

Privacidad primero: tu progreso se guarda solo en tu dispositivo. No pedimos tu nombre real; el correo es opcional y solo sirve para recuperar la contraseña. No hay anuncios ni rastreadores.

Disponible en español e inglés.

## Características (Product features, una por línea)

- Pomodoro con duraciones listas o a tu medida
- Rangos, temporadas, misiones diarias y logros
- Compañeros de edición limitada que se ganan estudiando
- Tienda para alimentar a tu compañero arrastrando la comida
- Calendario mensual y gráfica de la semana
- Paisaje polar que sigue la hora y el clima
- Sonidos de concentración y descansos guiados
- Límite saludable diario
- Funciona sin conexión
- Sin anuncios y sin rastreadores
- En español e inglés
- Modo claro y oscuro

## Descripción corta

Pomodoro con pingüinos: estudia, sube de rango y mantén limpio tu polo.

## Palabras clave (máximo 7)

pomodoro, estudiar, temporizador, concentración, productividad, hábitos, estudiantes

## Categoría

Educación (secundaria: Productividad)

## Clasificación por edad (cuestionario IARC): respuestas sugeridas

Responde según la app **tal como está hoy**:

| Pregunta | Respuesta |
|---|---|
| Violencia, miedo, sangre | No |
| Contenido sexual o desnudos | No |
| Lenguaje vulgar | No: los nombres de usuario pasan por un filtro de groserías e insultos |
| Drogas, alcohol, tabaco, apuestas | No |
| ¿Los usuarios pueden comunicarse o compartir contenido entre sí? | No: no hay chat, y el ranking actual es local (solo muestra tu propia marca; no hay otros usuarios) |
| ¿Comparte la ubicación del usuario? | No |
| ¿Hay compras digitales? | No por ahora: Premium está en modo prueba gratuito y las gemas no se venden. **Ojo:** cuando actives el cobro de Premium, la respuesta pasa a ser "Sí" (Premium incluye 1000 gemas de regalo, que cuentan como moneda virtual) |
| ¿Acceso sin restricciones a internet? | No |
| ¿Recoge datos personales? | Solo un correo **opcional** para recuperar la contraseña (se guarda en Supabase). Declara esto donde el cuestionario o la ficha pregunten por datos personales |

Clasificación esperada: para todas las edades (por ejemplo, ESRB "Everyone" o PEGI 3). Si más adelante activas el ranking en línea, amigos o el cobro de Premium, **vuelve a hacer el cuestionario**: el ranking en línea cuenta como "los usuarios interactúan" y el cobro como "compras digitales".

## Notas para certificación (Submission options)

FrostPom es una PWA de estudio con el método pomodoro, en español e inglés (según el idioma de Windows; se cambia en Ajustes). No necesita cuenta en línea: el usuario crea su nombre y contraseña dentro de la app, y todo se guarda solo en el dispositivo. El correo es opcional y solo sirve para recibir un código si se olvida la contraseña. Para probarla, basta con crear una cuenta en la pantalla de bienvenida (por ejemplo, usuario `revisor_ms` y contraseña `Revisar2026`). Después aparece un paso opcional para la foto de perfil, que se puede saltar con "Ahora no".

"Premium" está en modo prueba gratuito: el botón dice "Probar Premium gratis" y no hay ningún cobro ni compra dentro de la app. Al activarlo, la app regala 1000 gemas (moneda del juego, sin valor en dinero) y deja elegir una mascota. El ranking global todavía no existe: la pantalla Ranking solo muestra la marca del propio usuario y un aviso de "llega pronto".

La app funciona sin conexión. Política de privacidad: https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/privacidad.html

## Cuando enciendas el ranking global (v3.9, `docs/RANKING-GLOBAL.md`)

En Partner Center → **Update**, cambia estas tres cosas al mismo tiempo que publicas `mode: 'remote'`.

**1. Cuestionario de edad (cambian dos respuestas):**

| Pregunta | Respuesta nueva |
|---|---|
| ¿Los usuarios pueden comunicarse o compartir contenido entre sí? | Comparten información de forma limitada: un ranking muestra el **nombre de usuario, el país y los minutos de estudio** de cada persona. No hay chat, mensajes, fotos ni contenido creado por usuarios. Los nombres pasan por un filtro de groserías y se pueden ocultar |
| ¿Recoge datos personales? | Correo opcional (recuperar la contraseña) y, para el ranking, nombre de usuario, país opcional y horas de estudio. La fecha de nacimiento se pregunta pero **no sale del dispositivo**. Los menores de 13 no se conectan |

**2. Una línea más en la descripción y en las características:**

- Español: `Ranking global: compite con estudiantes de todo el mundo por los minutos de estudio de la semana (puedes salir cuando quieras).`
- English: `Global leaderboard: compete with students around the world for this week's study minutes (you can leave anytime).`

**3. Notas para certificación: reemplaza la última frase del segundo párrafo por esta:**

> El ranking global es opcional: la app pregunta el mes y año de nacimiento (se queda en el dispositivo) y solo conecta a mayores de 13 años, que aparecen con su nombre de usuario, su país y sus minutos. En Ajustes se puede salir del ranking y descargar o borrar los datos. Para probarlo, crea una cuenta con una fecha de nacimiento de un adulto, empieza un pomodoro, espera 2 minutos, pulsa "Terminar y guardar" y abre Ranking.

## Capturas y logo

En el repositorio, carpeta `docs/microsoft-store/`:

- **Capturas en español** (`capturas-es/`) y **en inglés** (`capturas-en/`), PNG: escritorio 1366 × 768 (Enfocar, noche, Progreso) y celular (Enfocar y la tienda). Microsoft pide al menos una; puedes subir hasta 10.
- **Logo** de 300 × 300: `docs/microsoft-store/logo-300.png`.

## Datos de contacto

- **Correo de soporte:** `startupprometeus@gmail.com` (el mismo de `privacidad.html`).
- **Sitio web:** `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/`
- **Política de privacidad:** `https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/privacidad.html`
- **Copyright:** © 2026 (tu nombre o el de tu proyecto)

---

# English listing (Store listings → English)

En Partner Center: tu app → **Store listings** → **Manage additional languages** → agrega **English (United States)** y copia esto. Capturas en inglés: `docs/microsoft-store/capturas-en/`.

## Description

Study with penguins! FrostPom is a pomodoro timer that turns your study hours into a game.

Pick how long you want to study (25 + 5, 50 + 10 or your own pace) and focus while your buddy keeps you company next to the timer. Every minute you study keeps your pole clean: if you stop, smog and trash roll in, and when you study again, everything shines.

• Rank up from Bronze to Legend in three-month seasons.
• Complete daily missions and earn gems only by studying: they can't be bought with money.
• Your penguin is with you from day one; unlock limited-edition buddies: polar bear, arctic fox, fur seal and hammerhead shark.
• Add a profile photo (optional, it stays only on your device).
• Feed your buddy: drag food with your mouse or finger.
• See your progress in a calendar and a 7-day chart.
• A living polar landscape that follows your local time: it snows, the weather changes and at night the bear roasts marshmallows by the campfire.
• Focus sounds (rain, wind, white noise) and guided breaks.
• A healthy daily limit that rewards consistency, not all-nighters.
• Dark mode for late-night studying.
• Works offline. Available in English and Spanish.

Privacy first: your progress is stored only on your device. We don't ask for your real name; the email is optional and only used to recover your password. No ads, no trackers.

## Product features

- Pomodoro with ready-made or custom lengths
- Ranks, seasons, daily missions and achievements
- Limited-edition buddies you earn by studying
- Shop to feed your buddy by dragging food
- Monthly calendar and weekly chart
- Polar landscape that follows the time and weather
- Focus sounds and guided breaks
- Healthy daily limit
- Works offline
- No ads, no trackers
- In English and Spanish
- Light and dark mode

## Short description

A pomodoro timer with penguins: study, rank up and keep your pole clean.

## Keywords

pomodoro, study, timer, focus, productivity, habits, students
