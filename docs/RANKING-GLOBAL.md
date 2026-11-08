# Ranking global: cómo encenderlo (v3.9)

Desde la v3.9 el ranking global **ya está construido y probado**, pero viene **apagado** (`leaderboard.mode: 'local'` en `js/config.js`). Así puedes publicar la v3.9 sin que cambie nada para los usuarios, y encenderlo cuando termines estos pasos.

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅).

**Lo que hace el ranking, en una frase:** cuando empiezas un pomodoro con internet, el servidor anota la hora con su propio reloj; cuando terminas, acredita el **menor** entre lo que dice la app, lo planeado y el tiempo real (máximo 4 h al día). Por eso nadie puede hacer trampa cambiando la hora del teléfono.

**Lo que decidiste (y así quedó):**

| Decisión | Cómo quedó |
|---|---|
| Nombre que se ve | Tu **nombre de usuario**, revisado por el servidor con las mismas reglas que la app. No se repite. |
| Quién aparece | **Todos** los de 13 años o más, por defecto. Se puede salir en Ajustes. |
| Periodos | **Semana** de lunes a domingo en hora UTC (en Colombia se reinicia el domingo a las 7 p. m.) y **temporada** de 3 meses. |
| Pomodoros sin internet | **No cuentan** en el ranking global (sí en tu progreso). La app lo avisa. |
| Edad | La app pregunta **mes y año de nacimiento**. Se queda en el dispositivo; los menores de 13 no se conectan. |

---

## Paso 0. Antes de empezar

- [ ] La v3.9 ya está en GitHub y en GitHub Pages (pasos 2 y 3 de `DESPLIEGUE.md`).
- [ ] Tu proyecto de Supabase (`tcxdmziakgppabwyrydd`) es el mismo de la recuperación de contraseña.
- [ ] "Confirm email" sigue **apagado** (lo apagaste en el paso 4 de `DESPLIEGUE.md`). El ranking lo necesita así: cuando alguien agrega su correo, su lugar pasa a esa cuenta.

---

## Paso 1. Activar las cuentas anónimas

Cada persona del ranking tiene una cuenta **anónima** en Supabase: no pide correo ni contraseña, y sirve para saber que tus minutos son tuyos.

1. Supabase → **Authentication** → **Sign In / Providers** (en algunos paneles: *Providers* o *Auth Providers*).
2. Busca **Allow anonymous sign-ins** y actívalo.
3. Pulsa **Save**.

✅ **Quedó bien si** el interruptor queda encendido después de recargar la página.

> **No actives el CAPTCHA** (Attack Protection) por ahora: la app todavía no lo envía y nadie podría unirse. Para frenar abusos ya hay límites: Supabase deja crear 30 cuentas anónimas por hora desde la misma conexión, y el servidor del ranking acepta máximo 60 sesiones al día por persona.

---

## Paso 2. Crear el servidor del ranking (SQL)

1. Supabase → **SQL Editor** → **New query**.
2. Abre `server/supabase/schema.sql` en tu PC, copia **todo** y pégalo.
3. Pulsa **Run**.

Debe decir **Success. No rows returned**. Si sale un aviso amarillo de "destructive operation", es por las líneas que borran la versión vieja del archivo (nunca se usó): confirma con **Run this query**.

4. Comprueba que funciona. En una consulta nueva pega esto y pulsa **Run**:

   ```sql
   select public.username_available('prueba_123') as libre,
          public.username_available('Pu7a_1')     as grosero;
   ```

✅ **Quedó bien si** responde `libre = true` y `grosero = false`.

> El archivo se puede volver a correr sin problema (por ejemplo, si en el futuro te mando una versión nueva). Si alguna vez lo cambias, **no cambies los nombres de las funciones**: la app las llama por su nombre.

---

## Paso 3. Probar en tu PC con el servidor real

1. En `js/config.js`, dentro de `leaderboard`, cambia:

   ```js
   mode: 'remote',
   ```

2. Sube el número de versión en `js/config.js` (`version`) y en `service-worker.js` (`VERSION`) a **`3.9.1`**.
3. Ejecuta `python -m http.server 8000` y abre `http://localhost:8000/` en una **ventana InPrivate** de Edge (así empiezas sin cuenta).
4. Crea una cuenta de prueba con una fecha de nacimiento de 13 años o más. Debe salir el aviso **"Apareces en el ranking global como…"**.
5. Empieza un pomodoro, espera **2 minutos** y pulsa **Terminar y guardar**.
6. Ve a **Ranking**: debes aparecer con **2 min**.
7. En Supabase → **SQL Editor**, comprueba lo que quedó guardado:

   ```sql
   select username, country, show_on_board, created_at from private.profiles order by created_at desc;
   ```

✅ **Quedó bien si** tu cuenta de prueba aparece en la app y en esa consulta.

Si quieres borrar la cuenta de prueba: en la app, **Ajustes → Tus datos del ranking global → Borrar**.

---

## Paso 4. Publicarlo

Con el paso 3 funcionando, sube los cambios con tu cuenta:

```
git add -A
git commit -m "v3.9.1: enciende el ranking global"
git push
```

Como cambió `VERSION`, a los usuarios les llega sola la versión nueva. **No hace falta un paquete nuevo de PWABuilder.**

- **Quien ya tenía cuenta** verá una sola vez **"¡Llegó el ranking global!"**, donde se le pregunta el mes y año de nacimiento.
- **Quien cree su cuenta desde ahora** responde esa pregunta al registrarse.

✅ **Quedó bien si** en la página publicada (`https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/`) el Ranking ya no dice "llega pronto".

---

## Paso 5. Actualizar Microsoft Store

En Partner Center → tu app → **Update**:

1. **Age ratings:** vuelve a responder el cuestionario. Ahora la app **muestra a otras personas el nombre de usuario, el país y los minutos** (no hay chat ni mensajes). Responde que los usuarios pueden ver información de otros usuarios y que hay una forma de salir y de borrar los datos.
2. **Store listings:** en la descripción (español e inglés) agrega una línea sobre el ranking. Los textos están en `docs/microsoft-store/FICHA.md`.
3. **Submission options → Notas para certificación:** explica que el ranking es opcional, que los menores de 13 no se conectan y que se puede salir y borrar los datos desde Ajustes.
4. Pulsa **Submit to the Store**.

---

## Paso 6. Moderar nombres

Si alguien se pone un nombre que pasó el filtro pero es ofensivo, ocúltalo. En **SQL Editor**:

```sql
-- Ver los últimos nombres
select username, country, created_at from private.profiles order by created_at desc limit 50;

-- Ocultar uno (deja de aparecer, pero sus minutos siguen contando)
select private.hide_name('nombre_feo');

-- Volver a mostrarlo
select private.hide_name('nombre_feo', false);
```

Si una palabra se repite mucho, agrégala a la lista `BLOCKED` de `js/identity.js` y pídeme actualizar `server/supabase/schema.sql`: las dos listas deben ser iguales (una prueba lo revisa).

---

## Paso 7. Limpieza automática (recomendado)

La política de privacidad promete que se borran las cuentas anónimas sin actividad en 90 días y las sesiones de hace más de 400 días. Para que pase solo, cada lunes:

1. Supabase → **Database** → **Extensions** → busca **pg_cron** y actívalo.
2. En **SQL Editor**:

   ```sql
   select cron.schedule('frostpom-limpieza', '0 8 * * 1', $$select private.cleanup(90)$$);
   ```

   (`0 8 * * 1` = los lunes a las 8:00 UTC, las 3:00 a. m. en Colombia.)

✅ **Quedó bien si** `select * from cron.job;` muestra `frostpom-limpieza`.

---

## Si algo falla

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| El Ranking sigue diciendo "llega pronto" | `mode` sigue en `'local'`, o falta el SQL | Revisa el paso 3.1 y vuelve a correr el paso 2 |
| "No pudimos cargar el ranking global" | Sin internet, o el proyecto de Supabase está **en pausa** | En el plan gratis, Supabase pausa los proyectos tras una semana sin uso. Entra al panel y pulsa **Restore project** |
| Al crear una cuenta no sale "Apareces en el ranking" | Las cuentas anónimas están apagadas | Paso 1 |
| Alguien dice "mi nombre ya está en el ranking", y es suyo | Reinstaló la app o cambió de equipo | Si tenía correo de recuperación: botón **"¿Es tuyo, de otro equipo? Recupéralo con tu correo"**. Si no, que elija otro nombre (el viejo se libera en 90 días con la limpieza) |
| Necesitas apagar el ranking ya | — | `mode: 'local'`, sube `VERSION` y haz `git push`. Los datos quedan en Supabase |

---

## Cómo funciona por dentro (para entenderlo y explicarlo)

- **Cuentas anónimas.** Al unirte, la app crea una cuenta anónima en Supabase y guarda en el dispositivo una llave para renovarla (*refresh token*). La llave de acceso dura una hora y se renueva sola.
- **El servidor mide el tiempo.** `start_session` anota la hora del servidor y `finish_session` acredita `mínimo(lo que dice la app, lo planeado, el tiempo real + 5 s)`. Si al terminar no hay internet, la app guarda el aviso y lo manda cuando vuelve la conexión.
- **Tope diario de 4 h** por persona, contado en su zona horaria. La **semana** es igual para todo el mundo: empieza el lunes a las 00:00 UTC.
- **Nombres.** Mismas reglas que la app: formato, groserías (también disfrazadas: "Pu7a", "p.u.t.a", "puuuta") y nombres que suplantan (admin, soporte, frostpom). Son únicos sin importar mayúsculas.
- **XP acotada.** La app manda tu XP de la temporada solo para mostrar tu emblema, y el servidor no acepta más de lo posible con los minutos que él midió.
- **Tu correo.** Si agregas un correo de recuperación (o recuperas la contraseña), tu lugar pasa de la cuenta anónima a la del correo. Se hace con un código de un solo uso que dura 10 minutos. Así puedes recuperar tu nombre en otro equipo.
- **Menores de 13.** No se conectan: pueden ver el ranking, pero no se envía nada suyo. La fecha de nacimiento nunca sale del dispositivo.
- **Tus datos.** En Ajustes puedes salir del ranking, descargar tus datos (JSON) y borrarlos. Al eliminar tu cuenta de FrostPom también se borran del servidor.

## Pruebas

- **Servidor** (PostgreSQL real, 23 comprobaciones: trampas, tope diario, nombres, quién aparece, moderación, pasar el lugar al correo, borrar y limpieza): `server/supabase/test/run_local.sh`
- **App con un Supabase simulado** (55 comprobaciones: registro, unirse, pomodoros con y sin internet, ranking, nombre ocupado, recuperar con correo, salir, descargar, borrar, menores de 13 e inglés): `python tests/e2e_ranking.py http://localhost:8000/`
- **Unitarias** (edad, semana UTC y que las reglas de nombres de la app y del servidor sean idénticas): `npm test`
