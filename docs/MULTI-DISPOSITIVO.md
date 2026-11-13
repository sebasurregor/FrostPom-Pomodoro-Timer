# Fase 4 (v4.5.0): tu cuenta en todos tus aparatos

> **Estado: PLAN para aprobar.** Todavía no hay código de esta fase. Lee las decisiones de la sección 8 y responde antes de que se programe.

**La meta (en palabras del autor):** "Si inicio sesión en la versión de App Store o de Google Play, mis datos se sincronizan y puedo manejar mi pomodoro desde el celular, el computador o la tableta".

## 0. En pocas palabras

1. **Reloj en vivo:** empiezas el pomodoro en el computador y el celular muestra la misma cuenta regresiva. Puedes pausarlo, saltarlo o terminarlo desde cualquiera de los dos.
2. **Progreso sin pérdidas:** si dos aparatos cambian cosas sin internet, al reconectarse se juntan los cambios de los dos en vez de que gane una copia entera y se pierda la otra.
3. **iPhone y Premium:** quedan explicados (secciones 4 y 5) y se programan en otras fases.

## 1. Cómo funciona hoy y qué se puede perder

- Cada cuenta en línea tiene **un solo documento** con todo su progreso (`private.saves`). Se sube unos 8 s después de cada cambio, al esconder la app y al volver el internet; al abrir se trae lo más nuevo.
- Si dos aparatos guardaron a la vez, **gana la copia con más tiempo estudiado, entera**.
- **El reloj vive en cada aparato:** el celular no sabe que empezaste en el computador.
- **Ranking:** al empezar un pomodoro, el servidor abandona el que estaba corriendo en otro aparato.

Un ejemplo de pérdida. El celular, sin internet, guarda 2 pomodoros (+50 min). Mientras tanto, en el computador compras un tema con gemas. Cuando el celular vuelve, tiene más tiempo estudiado y su copia gana entera: **la compra del computador desaparece** (y las gemas vuelven). Si los dos estudiaron, se pierden los minutos del que estudió menos.

## 2. El reloj en vivo

### En el servidor (`schema.sql`)

- **Tabla nueva `private.timers`**, una fila por persona:
  - el estado del reloj: modo, si corre o está en pausa, duración, cuándo empezó (hora del servidor), cuánto faltaba al pausar, el id del bloque y el id de la sesión del ranking;
  - además: versión, hora de la última acción y qué aparato la hizo (un número al azar, no datos del teléfono).
- **`get_timer()`** devuelve el estado y **la hora del servidor**. Con esa hora, cada aparato calcula cuánto se adelanta o atrasa su reloj, y así todos muestran el mismo número aunque la hora del teléfono esté mal.
- **`set_timer(estado, hora_de_la_acción, aparato)`** guarda el cambio solo si es **más nuevo** que el que hay: gana la última acción.
- **`claim_block(id_del_bloque)`** responde "sí" una sola vez por bloque. Cuando el reloj llega a cero en dos aparatos a la vez, solo el que recibe el "sí" guarda el pomodoro: **la XP y los minutos no se cuentan doble**.
- Se borra con la cuenta (`on delete cascade`) y no tiene datos personales.
- Límite de uso: como mucho unas 30 acciones por minuto por persona (con pausar y seguir no se llega ni cerca).

### En la app (`js/timer-sync.js`, nuevo)

- **Al tocar algo** (empezar, pausar, continuar, saltar, terminar, reiniciar, o cuando el reloj avanza solo), se envía el cambio de inmediato.
- **Para enterarse de los otros aparatos**, la app pregunta:
  - al abrirla y al volver a ella,
  - al recuperar el internet,
  - y **cada 10 segundos mientras se ve** (solo con cuenta en línea).

  Son unas 6 consultas pequeñas por minuto por aparato a la vista. Con la ventanita "Siempre encima" abierta, también.
- **Sin internet**, el reloj funciona igual que hoy. Los cambios quedan anotados con su hora y se envían al volver; si otro aparato hizo algo más nuevo, gana lo más nuevo.
- **Android:** si el cambio llega de otro aparato, se reprograma el aviso del final (y, con la fase 5, la notificación y el widget).
- **Se nota de dónde viene:** un aviso corto del tipo "Pausado desde otro aparato".

### Ranking sin abandonos

- La sesión del servidor (`start_session`) la crea **solo** el aparato que empieza el bloque, y su id viaja dentro del estado del reloj.
- Los demás aparatos **no** crean otra, así que ya no se abandona la del primero.
- `finish_session` la llama solo quien gana `claim_block`.

### ¿Por qué preguntar cada 10 s y no "Realtime" (aviso instantáneo)?

Supabase Realtime avisa al instante por una conexión abierta (websocket), pero para esta app tiene costos:

- FrostPom no usa la librería oficial de Supabase, así que habría que programar ese protocolo a mano.
- Habría que abrir `wss://` en la política de seguridad (CSP, en `index.html` y `_headers`).
- Habría que poner reglas de acceso (RLS) en la tabla.

Preguntar cada 10 s es simple, funciona igual en la web, en Windows y en Android, y se puede probar con el servidor simulado. Si algún día hace falta más rapidez, se cambia la forma de enterarse sin tocar lo demás.

## 3. El progreso: juntar los cambios en vez de elegir una copia

**La idea (mezcla de tres copias):** cada aparato guarda, además de su progreso, **la última copia que sincronizó** (la "base"). Si al guardar el servidor tiene algo más nuevo, se comparan las tres:

- qué cambió **este** aparato desde la base,
- qué cambió **el otro** desde la base,
- y se juntan los dos cambios, campo por campo.

| Dato | Regla |
|---|---|
| XP, gemas, totales (minutos, sesiones, comidas…) | base + lo que sumó o restó este aparato + lo que sumó o restó el otro (las gemas nunca bajan de 0) |
| Historial de sesiones | se unen por su id, sin repetidas (máximo 500) |
| Calendario (`daily`) | cada día se suma igual que la XP; si las sesiones de ese día están en el historial, se recalcula con ellas |
| Logros, misiones cobradas, temas comprados, regalos | se unen (lo que tenga cualquiera de los dos) |
| Mejor racha, mejor combo, sesión más larga | el mayor |
| Combo y ciclo actual | del aparato que estudió de último |
| Mascotas | cada una por separado: gana el registro más reciente (su hora `at`); el nombre, el último que se puso |
| Ajustes y perfil (nombre, país, compañero, tema…) | gana el que cambió; si cambiaron los dos, el más reciente |
| Temporada | si son distintas, gana la más nueva; la XP de la temporada vieja no se suma a la nueva |
| Premium | lo decidirá el servidor (sección 5); mientras tanto, activo si está activo en cualquiera |
| Cuenta local, foto | no viajan (como hoy) |

**Migración:**
- El servidor no cambia (`save_progress` sigue igual).
- La primera vez que un aparato con la v4.5 sincroniza no hay base: se usa la regla de hoy una última vez y desde ahí se guarda la base.
- La base vive en el aparato (`st2_sync_base`) y pesa lo mismo que el progreso (normalmente menos de 100 KB).

**Pruebas:**
- `tests/logic.test.js`, la mezcla como función pura con muchos casos:
  - los dos aparatos estudian sin internet,
  - uno compra y el otro estudia,
  - cambio de temporada,
  - mascotas,
  - ajustes cambiados en los dos.
- `tests/e2e_multidispositivo.py`, con **dos navegadores en la misma cuenta** y el mismo servidor simulado:
  - empezar en A y verlo en B en menos de 12 s;
  - pausar en B y que A se pause;
  - que al llegar a cero se guarde una sola vez (XP y ranking);
  - los dos sin internet → al reconectar se suman los minutos y no se pierde la compra.

## 4. iPhone (más adelante; no es parte de esta fase)

**Qué hace falta:**
- **Capacitor iOS:** un Mac con Xcode (o un Mac en la nube) y la cuenta de Apple Developer (US$ 99 al año).
- **El dominio del CAPTCHA:** en iPhone la app no puede presentarse como `https://sebasurregor.github.io` (Apple no deja usar `https` como esquema propio), así que Turnstile la ve con otro origen. Habrá que probarlo y, si no pasa, usar un widget aparte o la página de entrada en la web.
- **Avisos:** el plugin de notificaciones locales ya sirve. Lo equivalente a la notificación tipo Spotify son las **Live Activities**, que necesitan código nativo (Swift).

**Reglas de Apple a tener en cuenta:**
- **4.2 (funcionalidad mínima):** una web "empaquetada" se rechaza. Ayudan los avisos, el widget y las Live Activities.
- **4.8 (Iniciar sesión con Apple):** solo es obligatorio si se agrega inicio de sesión con Google u otra red social. Con correo y contraseña propios **no** hace falta.
- **5.1.1(v) (borrar la cuenta desde la app):** ya existe.
- **3.1.1 (compras dentro de la app):** Premium en iPhone debe venderse con la compra de Apple.
- **3.1.3(b) (multiplataforma):** si alguien pagó Premium en Android o Windows, se le puede respetar en el iPhone, **siempre que en el iPhone también se pueda comprar** dentro de la app.

## 5. Premium en todas las plataformas

- **Tabla nueva `private.entitlements`**, con: persona, producto, de dónde viene (`google`, `apple`, `microsoft`, `prueba`), estado (activo, período de gracia, en espera, vencido, reembolsado), vence el, id de la transacción original y fecha de actualización.
- **`get_entitlements()`:** la app pregunta al servidor si eres Premium, en vez de creerle a un dato guardado en el aparato.
- **Quién la llena:**
  - **Google Play y App Store:** el servidor, al verificar cada compra (fase 6).
  - **Microsoft Store:** hoy la compra se revisa solo en el equipo (Digital Goods API). Para que valga en Android o iPhone hay que verificarla en el servidor con la API de colecciones de Microsoft Store, que pide una aplicación en Azure AD. Queda como fase 6b.
- **Modo prueba:** mientras no haya cobro, sigue igual que hoy (local y gratis).

## 6. Lo que tienes que hacer tú

1. **Antes de correr el SQL nuevo, una copia de seguridad** (`docs/COPIA-DE-SEGURIDAD.md`), porque esta fase toca el progreso de la gente.
2. Correr el `schema.sql` de la v4.5 en Supabase (como siempre).
3. Nada más para el reloj en vivo: no hace falta encender Realtime ni pagar nada.

**Costos:** cero con el plan gratis de Supabase. Cada aparato a la vista hace unas 6 consultas por minuto, que son pocas para el plan gratis con los usuarios de una app nueva. Si algún día hay miles de personas a la vez, se pasa a Realtime.

**Riesgos:**
- **Un error en la mezcla podría dañar progreso.** Por eso: la mezcla es una función pura con muchas pruebas, nunca borra (solo suma o une), y la copia de seguridad va antes.
- **Dos aparatos con la hora muy mal puesta:** se usa la hora del servidor, así que no importa.

## 7. Orden de trabajo

1. **4a:** reloj en vivo + `claim_block` + ranking sin abandonos (una sesión de trabajo).
2. **4b:** la mezcla de tres copias (una sesión).
3. Pruebas con dos navegadores, prueba en tu celular y tu computador a la vez, y la v4.5.0.

Ninguna de las dos es necesaria para publicar en Google Play: pueden salir como actualización durante la prueba cerrada.

## 8. Decisiones para aprobar

1. **Enterarse de los otros aparatos preguntando cada 10 s** (recomendado), o Realtime (instantáneo, más trabajo).
2. **Si cambiaste el mismo ajuste en dos aparatos, gana el más reciente** (recomendado).
3. **¿Avisar "Pausado desde otro aparato"?** Recomendado: sí, un aviso corto.
4. **El reloj en vivo solo existe con cuenta en línea.** Las cuentas solo del aparato (menores de 13) siguen como hoy.
