# Hoja de ruta: de la web a App Store y Play Store

## Fase 1. Probar con usuarios reales (ya puedes empezar)

- Publica la app en un hosting gratuito con https (Netlify, Cloudflare Pages o GitHub Pages). El archivo `_headers` ya trae la configuración de seguridad para los dos primeros.
- Pide a 5–10 estudiantes que la usen una semana y anota tres cosas: qué no entendieron, qué los hizo volver y qué los aburrió.
- Ajusta la economía (XP, gemas, límite diario) con esos datos, sin agregar analítica de terceros.

## Fase 2. Convertirla en app nativa con Capacitor

[Capacitor](https://capacitorjs.com/) envuelve esta misma web en una app para iOS y Android sin reescribirla.

```
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init StudyTimer com.tuempresa.studytimer --web-dir .
npx cap add android
npx cap add ios        # requiere un Mac con Xcode
```

Para que Apple no la rechace por ser "solo una web empaquetada" (regla 4.2 de funcionalidad mínima), agrega funciones nativas:

- **Notificaciones locales** (`@capacitor/local-notifications`) para avisar el fin del pomodoro aunque la app esté cerrada. Esto es lo más importante, porque en iOS los temporizadores web se pausan en segundo plano.
- **Vibración** (`@capacitor/haptics`) al completar sesiones y subir de rango.
- **Widget** con la racha o el tiempo restante (requiere código nativo).
- Mantener la pantalla encendida con un plugin nativo.

Costos: la cuenta de desarrollador de Apple cuesta USD 99 al año y la de Google Play, USD 25 una sola vez.

## Fase 3. Ranking global real

1. Crea un proyecto en Supabase y ejecuta `server/supabase/schema.sql`.
2. Activa "Anonymous sign-ins" (el usuario no tiene que dar su correo).
3. Implementa `RemoteProvider` en `js/leaderboard.js` llamando a `start_session`, `finish_session` y `get_leaderboard`.
4. Agrega el dominio de Supabase a `connect-src` en la *Content Security Policy*.
5. Agrega en Ajustes un botón "Borrar mi cuenta" que llame a `delete_my_account()` (lo exige Apple).
6. Sigue la lista de verificación de `docs/SEGURIDAD.md`.

## Decisiones tomadas (noviembre de 2026)

| Tema | Decisión | Qué implica |
|---|---|---|
| Público | Para todas las edades | Público mixto: pantalla de edad neutral antes de cuentas y funciones sociales; para los menores, versión segura. |
| Cuentas | Sí, para guardar el progreso en la nube | Supabase con inicio anónimo y opción de vincular Apple, Google o correo; botón para borrar la cuenta desde la app (ya existe en el servidor). |
| Padres y profesores | Sin control parental (se eliminó en la v2.4). Los resúmenes semanales quedan en pausa | Si se retoman: enlace o código de solo lectura que el estudiante comparte y puede revocar, con minutos, sesiones y racha, nunca el detalle de cada sesión. |
| Amigos | Invitación entre amigos | Códigos de invitación de un solo uso y ranking entre amigos. Sin chat libre y, para menores, con aprobación de un adulto. |
| Iglú global | A futuro | Sala abierta con mesas y zonas de estudio (ver el diseño abajo). |
| Donaciones | La empresa donará un porcentaje de sus ganancias | No se anuncia hasta tener ingresos y un acuerdo firmado con una organización. Nunca se les pide dinero a los usuarios. |
| Prioridad actual | Pruebas | Probar con usuarios reales antes de agregar cuentas y funciones sociales. |
| Temporadas | Cada 3 meses (configurable) | El rango vuelve a Bronce III con premio en gemas; se conservan logros, compañeros, temas, gemas y calendario. En el servidor, el ranking de temporada debe reiniciarse en la misma fecha para todos. |
| Datos | Guardado automático, sin copias manuales | Se quitaron "Guardar copia", "Restaurar copia" y "Borrar todos mis datos". Queda "Eliminar mi cuenta", obligatorio en las tiendas. Para cambiar de teléfono hará falta la cuenta en la nube (Fase 3). |

### Diseño propuesto del Iglú (sala de estudio global)

- **Qué se ve:** un iglú con mesas. Cada persona aparece como su compañero sentado, con su apodo y un temporizador. Todos ven quién está estudiando, pero nadie ve en qué.
- **Mesas por modo**, no por persona: "Pomodoro clásico", "Enfoque largo", "Silencio total"... Al entrar, tu temporizador se sincroniza con el de la mesa.
- **Comunicación sin texto libre:** solo reacciones predefinidas (🐧 ¡vamos!, ❄️ descanso, 🔥 racha). Así no hay acoso ni datos personales que se filtren.
- **Seguridad:**
  - los menores entran a mesas solo para menores, o únicamente a salas de amigos;
  - siempre hay un botón para bloquear y reportar;
  - límite de entradas por minuto, y el servidor valida cada evento (igual que el ranking).
- **Tecnología:** Supabase Realtime (canales de presencia) para mostrar quién está en cada mesa. No hace falta guardar historial de la sala.

## Premium: qué falta para cobrar de verdad

- **Hoy es un modo prueba.** El botón "Suscribirme" activa Premium sin cobro y lo guarda en el dispositivo.
- **Cobro real:** Apple y Google exigen que una suscripción digital se cobre con su sistema de compras dentro de la app (App Store In-App Purchase y Google Play Billing). Con Capacitor se puede usar, por ejemplo, RevenueCat o el plugin oficial de cada tienda.
- **Dónde vive el estado Premium:** en el servidor, a partir del recibo validado de la tienda, nunca solo en el teléfono.
- **Precio:** el que muestra la app es provisional (`js/config.js → premium.priceLabel`). El real se define en App Store Connect y en Google Play Console.
- **Ideas Premium a futuro:**
  - descanso largo configurable;
  - más animaciones del pingüino en el temporizador;
  - temas de temporada.

## Lluvia de ideas

### Vistas nuevas
- **Rincón de calma:** respiración guiada, estiramientos de 2 minutos y un "basurero de pensamientos" que se borra al cerrar.
- **Modo examen:** cuenta regresiva hasta la fecha de un examen, con meta diaria automática.
- **Salas de estudio con amigos:** pomodoro sincronizado en grupo, solo con códigos de invitación, sin chat libre y con aprobación de un adulto para menores.
- **Álbum del polo:** fotos del paisaje en cada rango, para ver cómo ha cambiado tu polo con el tiempo.

### Juego
- **Temporadas:** ya existen desde la v3.1 (trimestrales, con premio y ranking de temporada). Falta darle a cada una su propio compañero de edición limitada.
- **Retos de clase:** un curso entero suma minutos para "salvar un glaciar" común.
- **Protector de racha:** se gana con constancia, no se compra.
- **Datos curiosos** sobre los polos al terminar cada descanso.

### Bienestar
- Aviso suave después de 3 h seguidas.
- Modo nocturno que sugiere dormir después de cierta hora.
- Para menores, que el límite saludable se ajuste según la edad declarada por el adulto.

### Modelo de negocio sin dañar a los niños
- **Recomendado:** una app gratuita con un plan "Familia" o "Colegio" que paguen los adultos (por ejemplo, panel para profesores, salas de estudio y estadísticas).
- **Evitar:** anuncios para menores, gemas que se compran con dinero real y cajas de recompensa al azar ("loot boxes").
- **Causa ambiental:** si quieres donar, haz un acuerdo real con una organización y lee la sección 7 de `docs/SEGURIDAD.md` antes de anunciarlo.
