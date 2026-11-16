# Diagnóstico de cuentas, inicio de sesión y ranking (v4.5.1)

Esta guía es para revisar en Supabase los casos que llegaron de la prueba cerrada en Google Play:

- "El correo o la contraseña no coinciden" en el celular, con la contraseña correcta.
- Después de recuperar la contraseña, la app dice que la cuenta no tiene progreso y pide un nombre.
- El ranking muestra a la persona como otra, dice que su nombre "ya existe" y no suma las horas del computador.

> **Antes de empezar:**
> - Todas las consultas de las secciones 2 y 3 son de **solo lectura**: no cambian nada.
> - Las de la sección 4 **sí cambian datos**: antes de correrlas, haz la copia de seguridad ([COPIA-DE-SEGURIDAD.md](COPIA-DE-SEGURIDAD.md)).
> - Los resultados traen correos y nombres de personas reales. **No los compartas (ni en capturas) sin taparlos.**
> - Donde dice `correo@ejemplo.com` o `NombreDeUsuario`, escribe el de la persona. No guardes esas consultas con datos reales en el proyecto.

## 1. Qué encontré en el código (las causas)

### Causa 1: cuentas que viven solo en el computador (la más común)

En las versiones 3.7 a 3.9, agregar un **correo de recuperación** creaba una cuenta en Supabase con ese correo y una contraseña **al azar**. La contraseña de FrostPom nunca salía del computador.

Desde la v4.0, entrar en otro equipo usa el correo y la contraseña **en línea**. Si la persona nunca tocó **Conectar** en el computador, pasa esto:

- **En línea**, su cuenta tiene una contraseña al azar y no tiene progreso. Por eso en el celular sale "no coinciden".
- **Supabase** responde lo mismo cuando la cuenta no existe y cuando la contraseña está mal. Por privacidad, la app no puede distinguirlos solo con ese error.
- **Al recuperar la contraseña** en el celular, la cuenta en línea queda sin progreso. Por eso pedía "Elige tu nombre de usuario".

### Causa 2: recuperar o cambiar la contraseña cierra las otras sesiones

Supabase cierra las demás sesiones de la cuenta cuando cambias o recuperas la contraseña. Al computador se le cerró la sesión del ranking, y la v4.5.0 hacía esto:

- **Cuenta solo del computador:** creaba una sesión **anónima nueva** y quería unirse al ranking con el mismo nombre. El servidor respondía "ese nombre ya existe", pero el dueño era la misma persona. Si elegía otro nombre, aparecía como otra persona y sus horas iban a un perfil nuevo.
- **Cuenta en línea:** dejaba de sumar hasta que la persona volviera a entrar. Eso pasa una sola vez al abrir la app, o con el aviso en la vista Ranking.

### Causa 3: la sesión de OTRA cuenta

Si alguien conectó su cuenta con un correo distinto al de recuperación, la sesión del equipo quedaba en la cuenta del correo de recuperación. Pasaba lo siguiente:

- El progreso se guardaba en **esa** cuenta.
- Al entrar en el celular con el otro correo, aparecía vacío.

### Causa 4: "Conectar" con la contraseña sin guardar

Al conectar una cuenta cuyo correo ya existía, la app pedía un código y ponía la contraseña de FrostPom en línea. Si eso fallaba, seguía de todos modos. La cuenta quedaba "en línea" con otra contraseña.

### Otras dos hipótesis

**c) El CAPTCHA en Android.** Un CAPTCHA que falla se muestra con su propio mensaje: "No pudimos comprobar que eres una persona". No sale como "no coinciden". Igual revisa estas dos cosas:

- En `js/config.js`, `captcha.siteKey` tiene tu clave del sitio. Los zips de Claude la traen vacía y hay que volver a pegarla antes de `npm run android:actualizar`.
- En Cloudflare, el widget de Turnstile tiene el dominio `sebasurregor.github.io`.

**d) Una versión vieja en otro equipo.** Es el mismo caso que la causa 1: una cuenta de la v3.x que nunca se conectó.

## 2. Consultas de solo lectura (funcionan con el servidor actual)

Pégalas en Supabase, en **SQL Editor**, una por una.

### A. ¿Existe la cuenta en línea de ese correo?

```sql
select u.created_at as creada, u.last_sign_in_at as ultimo_inicio, coalesce(u.is_anonymous, false) as anonima
  from auth.users u
 where lower(u.email) = lower('correo@ejemplo.com');
```

| Resultado | Qué significa |
| --- | --- |
| Sin filas | No hay cuenta en línea con ese correo: vive solo en el equipo donde se creó (causa 1). |
| Una fila | La cuenta existe. Sigue con la consulta B. |

### B. ¿Esa cuenta tiene progreso guardado? ¿Con qué nombre y cuántas horas?

```sql
select sv.version, sv.updated_at as ultimo_guardado,
       sv.data #>> '{profile,nick}' as nombre_en_el_progreso,
       round(coalesce((sv.data #>> '{progress,totals,studySec}')::numeric, 0) / 3600, 1) as horas
  from private.saves sv
  join auth.users u on u.id = sv.user_id
 where lower(u.email) = lower('correo@ejemplo.com');
```

**Sin filas:** la cuenta existe pero nunca guardó progreso. Si en la consulta C tiene perfil en el ranking, es la causa 1: el correo era de recuperación y el progreso sigue en el computador.

### C. Su perfil en el ranking

```sql
select p.username as nombre, p.hidden as oculto, p.show_on_board as aparece, p.created_at, p.last_active as ultima_actividad,
       (select (sum(s.credited_sec) / 60)::int from private.study_sessions s
         where s.user_id = p.user_id and s.status = 'done') as minutos_totales
  from private.profiles p
  join auth.users u on u.id = p.user_id
 where lower(u.email) = lower('correo@ejemplo.com');
```

### D. ¿De quién es un nombre del ranking?

```sql
select * from private.who_has_name('NombreDeUsuario');
```

Si `anonymous` es `true`, ese nombre está en una sesión anónima de algún equipo y no en la cuenta con correo (causa 2).

### E. Perfiles parecidos a un nombre

Sirve por si la persona tuvo que elegir otro, por ejemplo `nombre_2` o `nombre.pc`.

```sql
select p.username as nombre, coalesce(u.is_anonymous, false) as anonima, u.email is not null as con_correo,
       p.created_at as creado, p.last_active as ultima_actividad,
       (select (sum(s.credited_sec) / 60)::int from private.study_sessions s
         where s.user_id = p.user_id and s.status = 'done') as minutos
  from private.profiles p
  join auth.users u on u.id = p.user_id
 where p.username ilike '%parte_del_nombre%'
 order by p.last_active desc;
```

Si sale un perfil **anónimo** con muchos minutos y otro **con correo** creado hace poco, es el caso de "aparece como otra persona". Para unirlos, usa la sección 4.

### F. ¿Qué pasó con los últimos pomodoros de alguien?

```sql
select * from private.ranking_check('NombreDeUsuario');
```

Si no aparece ningún pomodoro reciente, la app de esa persona no le está avisando al servidor. Casi siempre es porque su sesión se cerró.

### G. Cuántas cuentas están en la causa 1

Son las cuentas con correo y perfil en el ranking, pero **sin** progreso en línea. Esta consulta no muestra correos.

```sql
select p.username as nombre, u.created_at as cuenta_creada, u.last_sign_in_at as ultimo_inicio, p.last_active as ultima_actividad
  from private.profiles p
  join auth.users u on u.id = p.user_id
 where not coalesce(u.is_anonymous, false)
   and not exists (select 1 from private.saves sv where sv.user_id = u.id)
 order by p.last_active desc;
```

### H. Posibles perfiles duplicados (un anónimo y uno con correo con nombres parecidos)

```sql
select a.username as nombre_anonimo, b.username as nombre_con_correo,
       a.last_active as anonimo_activo, b.created_at as con_correo_creado
  from private.profiles a
  join auth.users ua on ua.id = a.user_id and coalesce(ua.is_anonymous, false)
  join private.profiles b on b.user_id <> a.user_id
  join auth.users ub on ub.id = b.user_id and not coalesce(ub.is_anonymous, false)
 where lower(b.username) like lower(a.username) || '%' or lower(a.username) like lower(b.username) || '%'
 order by a.last_active desc;
```

### I. El tamaño del problema

```sql
select count(*) filter (where coalesce(u.is_anonymous, false)) as anonimas,
       count(*) filter (where not coalesce(u.is_anonymous, false)) as con_correo,
       count(*) filter (where not coalesce(u.is_anonymous, false)
                          and not exists (select 1 from private.saves s where s.user_id = u.id)) as con_correo_sin_progreso
  from auth.users u;
```

### J. Los errores de inicio de sesión (registro de Supabase)

En Supabase, abre **Logs** → **Auth** y busca:

- **`invalid_credentials`:** "no coinciden". Es la causa 1, o de verdad la contraseña está mal.
- **`captcha`:** el CAPTCHA falló (hipótesis c).
- **`over_request_rate_limit`:** demasiados intentos seguidos.

## 3. Con el servidor nuevo (después de correr el schema.sql de la v4.5.1)

Ese archivo agrega tres herramientas de solo lectura más fáciles de usar.

```sql
-- Todo sobre la cuenta de un correo, en palabras simples (la consulta A + B + C de arriba juntas)
select * from private.account_check('correo@ejemplo.com');

-- Los nombres YA guardados que el filtro nuevo no permite (también se esconden solos al correr el schema)
select * from private.review_names();

-- Los nombres reportados por la comunidad
select * from private.report_summary();
```

## 4. Arreglar a mano un caso que ya está roto (CAMBIA datos: haz la copia antes)

> **La v4.5.1 arregla esto sola en la mayoría de los casos.** Pídele a la persona estos pasos:
>
> 1. Abrir FrostPom **en el computador** e ir a **Ajustes → Tu cuenta → Conectar** (o «Volver a entrar», si la app lo pide).
> 2. Escribir el **mismo correo**.
> 3. Escribir el código que le llega.
>
> Su nombre y sus minutos pasan solos a su cuenta. La app hace esto con una sesión en cada lado, así que nadie puede quedarse con el nombre de otro.

Usa las funciones de abajo solo si la persona ya no tiene ese equipo, o si los pasos de arriba no funcionaron.

**Unir el perfil viejo con la cuenta con correo:**

```sql
select private.move_name('NombreViejo', 'correo@ejemplo.com');
```

- **El perfil viejo** (nombre, minutos y XP) pasa a la cuenta de ese correo.
- **Si la cuenta ya tenía otro perfil**, se queda con el nombre viejo, se suman los minutos y se guarda la XP más alta.
- **La sesión anónima vieja** se borra.

Antes de correrla, confirma con la consulta D que ese nombre es de esa persona. Por ejemplo, que el equipo, las fechas y los minutos coincidan con lo que te cuenta. **Nunca lo hagas solo porque alguien te lo pide por mensaje:** así se podría robar el nombre de otra persona.

**Ocultar un nombre inapropiado** (o volver a mostrarlo):

```sql
select private.hide_name('NombreFeo');
select private.hide_name('NombreInocente', false);
```
