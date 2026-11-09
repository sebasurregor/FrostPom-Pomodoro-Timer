# Cuentas en línea (v4.0)

Desde la v4.0, quien tiene **13 años o más** crea una **cuenta en línea**: entra con su **correo y su contraseña** desde cualquier equipo y su progreso viaja con él. Los menores de 13 siguen con una cuenta **solo en su dispositivo**, como antes.

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅).

**Lo que decidiste (y así quedó):**

| Decisión | Cómo quedó |
|---|---|
| Para qué sirve | Entrar desde otro equipo con **correo + contraseña** y no perder el progreso si cambias de PC o reinstalas. |
| Correo | **Obligatorio** para las cuentas en línea (13+). Es el mismo correo que recibe el código si olvidas la contraseña. |
| Qué se guarda | **Todo menos la foto de perfil** (y menos la fecha de nacimiento, que nunca sale del dispositivo). |
| Menores de 13 | **Solo cuenta local.** El correo es opcional y solo sirve para recuperar la contraseña (mejor el de un adulto). |
| Contraseña | La misma de FrostPom. La app guarda su huella en el dispositivo (para entrar sin internet) y Supabase la guarda cifrada en su sistema de cuentas. |

---

## Paso 0. Antes de empezar

- [ ] El ranking global ya está encendido (`leaderboard.mode: 'remote'`, lo hiciste en la v3.9.1).
- [ ] Tu proyecto de Supabase (`tcxdmziakgppabwyrydd`) es el mismo de siempre.
- [ ] Brevo sigue enviando los códigos (lo probaste en la recuperación de contraseña).

---

## Paso 1. Actualizar el servidor (SQL) — ANTES de subir la v4.0

La v4.0 necesita una tabla nueva (`private.saves`) y tres funciones (`load_progress`, `save_progress`, `delete_my_cloud_account`). Si subes la app antes, las cuentas se crean pero el progreso no se puede guardar hasta que corras esto.

1. Supabase → **SQL Editor** → **New query**.
2. Abre `server/supabase/schema.sql` (el de la v4.0) en tu PC, copia **todo** y pégalo.
3. Pulsa **Run**. Si sale el aviso amarillo de "destructive operation", confirma con **Run this query** (el archivo se puede correr las veces que quieras: no borra nada de los usuarios).

4. Comprueba que quedó. En una consulta nueva:

   ```sql
   select count(*) as funciones_nuevas
   from pg_proc
   where proname in ('load_progress', 'save_progress', 'delete_my_cloud_account');
   ```

✅ **Quedó bien si** responde `funciones_nuevas = 3`.

---

## Paso 2. Revisar la configuración de correo en Supabase

Supabase → **Authentication** → **Sign In / Providers** → **Email**:

| Opción | Cómo debe quedar | Por qué |
|---|---|---|
| **Enable Email provider** | Encendido | Es lo que permite entrar con correo y contraseña. |
| **Confirm email** | **Apagado** (ya lo tienes así) | La app entra apenas creas la cuenta. Si lo enciendes, nadie podría entrar hasta confirmar el correo, y la app no tiene ese paso. |
| **Secure password change** (si aparece) | Apagado | Si está encendido, cambiar la contraseña desde Ajustes fallaría a quien entró hace más de un día. |
| **Minimum password length** | 8 o menos | La app ya exige mínimo 8 caracteres con letras y números. Si pones más de 8, alguien podría crear la cuenta local pero no la de en línea. |

✅ **Quedó bien si** después de pulsar **Save** y recargar, "Confirm email" sigue apagado.

> **Recuerda:** la llave secreta de Supabase (`service_role` o `sb_secret_…`) **nunca** va en la app. La app solo usa la llave publicable que ya está en `js/config.js`. Y en Brevo **no** actives el bloqueo por IP de las llaves SMTP.

---

## Paso 3. Probar en tu PC

1. Ejecuta `python -m http.server 8000` y abre `http://localhost:8000/` en una **ventana InPrivate** de Edge.
2. **Crea una cuenta** con fecha de nacimiento de 13 años o más y un correo tuyo. Pon una foto.
3. Haz un pomodoro corto (o pulsa **Terminar y guardar** a los 2 minutos).
4. Abre **otra ventana InPrivate** (es como otro equipo). En "Crea tu cuenta" toca **¿Ya tienes cuenta? Inicia sesión**, prueba la **flecha ←** (vuelve a crear cuenta) y luego entra con tu correo y contraseña.
5. Debe decir **"¡Hola de nuevo, …! Trajimos tu progreso"**, con tu XP y tu nombre, pero **sin la foto**.
6. En la **primera** ventana: **Ajustes → Cerrar sesión**. Debe aparecer **"Inicia sesión"** con tu correo ya escrito (no te pide eliminar la cuenta). Entra otra vez: vuelven tu progreso **y tu foto**.
7. En Supabase → **SQL Editor**:

   ```sql
   select u.email, s.version, s.updated_at, s.bytes
   from private.saves s join auth.users u on u.id = s.user_id
   order by s.updated_at desc limit 10;
   ```

✅ **Quedó bien si** tu correo aparece en esa consulta, en la segunda ventana llegó tu progreso y al cerrar sesión no se borró nada.

Para borrar la cuenta de prueba: en la app, **Ajustes → Tu cuenta → Eliminar mi cuenta** (borra la cuenta en línea, el progreso y el ranking).

---

## Paso 4. Publicar

Sube los cambios con tu cuenta (los pasos exactos están en `DESPLIEGUE.md`):

```
git add -A
git commit -m "v4.0.2: sonidos grabados, cuentas en línea con correo y contraseña; cerrar sesión sin borrar la cuenta"
git push
```

Como cambió `VERSION` (4.0.2), a los usuarios les llega sola la versión nueva. **No hace falta un paquete nuevo de PWABuilder.**

Qué ve cada persona:

- **Quien crea su cuenta desde ahora (13+):** el correo es obligatorio y la cuenta queda en línea.
- **Quien ya tenía cuenta:** en **Ajustes → Tu cuenta** ve **"Conecta tu cuenta"**. Pone su correo y su contraseña de FrostPom y listo. Si ese correo ya tenía cuenta en Supabase (por ejemplo, el de recuperación), la app le pide el código que llega al correo y le pregunta con cuál progreso quiere seguir.
- **Menores de 13:** no cambia nada; su cuenta sigue solo en su dispositivo.

---

## Paso 5. Actualizar Microsoft Store

En Partner Center → tu app → **Update** (no hace falta subir un paquete nuevo):

1. **Age ratings:** vuelve a responder el cuestionario. Ahora la app **recoge el correo** para crear la cuenta en línea y guarda el progreso en un servidor. Sigue sin chat, sin mensajes y sin compartir ubicación.
2. **Store listings:** usa las descripciones nuevas de `docs/microsoft-store/FICHA.md` (mencionan que puedes entrar desde cualquier equipo).
3. **Submission options → Notas para certificación:** copia las notas de la v4.0 que están en `FICHA.md` (incluyen cómo probar la cuenta en línea).
4. Pulsa **Submit to the Store**.

---

## Si alguien te pide una copia de sus datos o que los borres

La política de privacidad promete responder en **15 días hábiles**. Pide que te escriban **desde el correo de su cuenta**.

**Copia de sus datos.** En **SQL Editor** (cambia el correo):

```sql
-- Cuenta, progreso guardado y perfil del ranking
select u.email, u.created_at as cuenta_creada, s.updated_at as ultimo_guardado,
       s.data as progreso, p.username, p.country, p.avatar, p.show_on_board
from auth.users u
left join private.saves s on s.user_id = u.id
left join private.profiles p on p.user_id = u.id
where lower(u.email) = lower('correo@ejemplo.com');

-- Minutos del ranking por día
select d.day as dia, round(d.credited_sec / 60.0) as minutos
from private.daily_totals d
join auth.users u on u.id = d.user_id
where lower(u.email) = lower('correo@ejemplo.com')
order by d.day;
```

Copia el resultado (botón de descargar CSV en el SQL Editor) y envíaselo.

**Borrar todo.** Supabase → **Authentication** → **Users** → busca el correo → **⋯** → **Delete user**. Al borrar el usuario se borran solos su progreso guardado y su ranking (las tablas están conectadas con `on delete cascade`).

---

## Si algo falla

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| "Las cuentas en línea todavía no están disponibles" | Falta el SQL de la v4.0 | Paso 1 |
| "Ese correo ya tiene una cuenta" al registrarse | El correo ya está en Supabase (de otro equipo o del correo de recuperación) | Que toque **¿Ya tienes cuenta? Inicia sesión**. Si no recuerda la contraseña: **¿Olvidaste la contraseña?** |
| Ajustes dice "Tu cuenta en línea quedó pendiente" | Se registró sin internet | Con internet, que toque **Conectar** en Ajustes y ponga su contraseña |
| Ajustes dice "Tu sesión en línea se cerró" | Cambió la contraseña en otro equipo, o pasó mucho tiempo sin abrir la app | Que toque **Volver a entrar** |
| Nadie puede crear cuentas | El proyecto de Supabase está **en pausa** (plan gratis, una semana sin uso) | Entra al panel y pulsa **Restore project** |
| No llegan los códigos | Brevo pausó el envío o el remitente dejó de estar verificado | Revisa Brevo → **Transactional** → **Logs** y `RECUPERAR-CONTRASENA.md` |
| Alguien dice que su correo "ya tenía cuenta" y no la creó él | Otra persona escribió ese correo (no se confirma el correo) | Con **¿Olvidaste la contraseña?** el código llega a su correo y recupera la cuenta. Si quiere empezar de cero, bórrala (sección anterior) |

---

## Cómo funciona por dentro (para entenderlo y explicarlo)

- **Crear la cuenta.** Al registrarse con 13 años o más, la app llama a Supabase (`/auth/v1/signup`) con el correo y la contraseña. Como "Confirm email" está apagado, Supabase devuelve una **sesión** de inmediato. En el dispositivo se guarda la **huella** de la contraseña (para entrar sin internet) y una llave para renovar la sesión.
- **Qué se sube.** Un solo documento con el progreso, los ajustes y el historial. Antes de subirlo, la app le quita la **foto** y la **cuenta local** (la huella de la contraseña y la fecha de nacimiento), y el servidor lo vuelve a quitar por si acaso. Máximo 1 MB por persona.
- **Cuándo se sube.** Unos 8 segundos después de cada cambio, al cerrar o esconder la app, y al volver el internet. Al abrir la app, si la nube tiene una versión más nueva, la trae.
- **Dos equipos a la vez.** Cada guardado lleva un número de versión. Si otro equipo guardó después, gana la copia con **más tiempo estudiado**, para no perder pomodoros.
- **El nombre viaja con el progreso.** Si cambias tu nombre de usuario en un equipo, en el otro también cambia la próxima vez que se abra.
- **El ranking usa la misma cuenta.** Quien tiene cuenta en línea ya no necesita una cuenta anónima para el ranking. Si estaba en el ranking con una anónima, su lugar pasa a la cuenta en línea.
- **Cerrar sesión (v4.0.1).** Con cuenta en línea: sube lo pendiente (si no hay internet y quedó algo sin subir, avisa antes), cierra la sesión, borra el progreso de ese equipo y muestra **"Inicia sesión"** con el correo ya escrito. La cuenta y el progreso siguen en línea: **no hace falta eliminar la cuenta para salir**. La foto (que nunca se sube) se queda guardada aparte en ese equipo y vuelve cuando la misma cuenta entra otra vez; el idioma también se conserva.
- **"Usar otra cuenta"** (pantalla "¡Hola de nuevo!", reemplaza a "Empezar de nuevo"): con cuenta en línea hace lo mismo que cerrar sesión. Con una cuenta solo de este dispositivo explica que para usar otra hay que borrarla, y a los de 13+ les indica cómo conectarla primero para no perder nada.
- **Eliminar mi cuenta.** Borra el dispositivo y, con internet, la cuenta en línea completa (correo incluido), su progreso y su ranking (`delete_my_cloud_account`).
- **Menores de 13.** Nunca se conectan: ni cuenta en línea ni ranking. El correo es opcional y solo sirve para recuperar la contraseña.

## Pruebas

- **Servidor** (PostgreSQL real, 27 comprobaciones; las de la v4.0 revisan guardar, conflicto de versiones, que nunca se guarde la foto, el límite de tamaño y borrar la cuenta): `server/supabase/test/run_local.sh`
- **App con un Supabase simulado** (60 comprobaciones: registro con correo, menor de 13, iniciar sesión en otro equipo con la flecha para volver, la foto no viaja, el progreso más nuevo llega al otro equipo, cerrar sesión sin borrar la cuenta y volver a entrar con la foto, "Usar otra cuenta", cambiar y recuperar la contraseña, eliminar la cuenta, conectar una cuenta de antes, registro sin internet e inglés): `python tests/e2e_cuentas.py http://localhost:8000/`
- **Unitarias** (qué se sube, qué se conserva al traer, el nombre que viaja, edad): `npm test`
