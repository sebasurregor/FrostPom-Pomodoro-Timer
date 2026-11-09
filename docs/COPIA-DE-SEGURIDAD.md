# Copia de seguridad manual de Supabase (plan gratis)

El plan gratis de Supabase **no guarda copias diarias** que puedas restaurar (lo confirma el panel: las copias diarias son del plan Pro). Esta guía hace una copia **desde tu PC con Windows**, sin instalar Docker: solo las herramientas de PostgreSQL.

**Qué se copia:**

- **Tus datos:** el esquema `private`, con perfiles del ranking, sesiones, minutos por día, códigos de traspaso y el progreso guardado de las cuentas en línea.
- **Las cuentas:** las tablas `auth.users` y `auth.identities`, con correos y contraseñas cifradas por Supabase.

Las funciones públicas no hacen falta: están en `server/supabase/schema.sql`.

**Cuándo hacerla:** antes de cualquier cambio grande en el servidor o de una prueba de seguridad, y de vez en cuando (por ejemplo, una vez por semana).

> **La copia tiene datos personales** (correos, progreso, contraseñas cifradas). Guárdala **fuera** de la carpeta del proyecto (que no termine en GitHub), en un lugar privado, y borra las copias viejas. Igual que con las otras claves: la contraseña de la base de datos no va en el código ni por chat.

Cada paso dice **qué hacer**, **dónde** y **cómo saber que quedó bien** (✅). Todos los comandos son para **PowerShell**; no hace falta abrirla como administrador.

---

## Paso 1. Instalar las herramientas de PostgreSQL (una sola vez)

**1.1.** Revisa qué versión usa tu base. En Supabase → **SQL Editor**:

```sql
select version();
```

Anota el número que aparece después de "PostgreSQL" (por ejemplo, 15 o 17).

**1.2.** Descarga el instalador de PostgreSQL para Windows (versión **17**, o la de tu base si es más nueva): postgresql.org/download/windows → "Download the installer".

**1.3.** En el instalador, en **Select Components**, deja marcado **solo "Command Line Tools"**. Quita PostgreSQL Server, pgAdmin y Stack Builder: no los necesitas.

**1.4.** Agrega la carpeta de las herramientas al **PATH** (la lista de carpetas donde Windows busca los programas cuando escribes su nombre). Pega esto en PowerShell; lo agrega solo para tu usuario y no borra nada de lo que ya había:

```powershell
$bin = "C:\Program Files\PostgreSQL\17\bin"
$actual = [Environment]::GetEnvironmentVariable("Path", "User")
if ("$actual" -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable("Path", ("$actual".TrimEnd(";") + ";" + $bin).TrimStart(";"), "User")
}
```

La carpeta se llama `17`, no `17.11`, aunque hayas instalado la 17.11.

**1.5.** Cierra **todas** las ventanas de PowerShell (si usas **Terminal**, ciérrala por completo: las pestañas nuevas heredan el PATH viejo). Abre una nueva y escribe:

```powershell
pg_dump --version
```

✅ **Quedó bien si** responde `pg_dump (PostgreSQL) 17.x` (debe ser igual o mayor que la versión de tu base).

### Si dice "The term 'pg_dump' is not recognized…"

Windows no encuentra el programa. Revisa en este orden:

**A. ¿Está instalado?** Llámalo con su dirección completa (el `&` del comienzo es necesario):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --version
```

- Si responde `pg_dump (PostgreSQL) 17.11`, está instalado y solo falta el PATH: ve a **C**.
- Si dice que no encuentra la ruta, ve a **B**.

**B. ¿Dónde quedó?** Búscalo:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL", "C:\Program Files (x86)\PostgreSQL" -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```

- Si aparece una ruta, por ejemplo `D:\PostgreSQL\17\bin\pg_dump.exe`, esa carpeta (sin `\pg_dump.exe`) es la que va en `$bin` en **C**.
- Si no aparece nada, el instalador no incluyó las herramientas. Vuelve a correrlo y deja marcado **Command Line Tools**. Si dice que ya está instalado, desinstala "PostgreSQL 17" en **Configuración → Aplicaciones** y repite el 1.3.

**C. Agrégalo al PATH y úsalo ya.** Corre el bloque del **1.4** (con la carpeta correcta en `$bin`) y luego esto, en la **misma ventana**, para que la tome sin cerrarla:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
pg_dump --version
```

✅ **Quedó bien si** ahora responde `pg_dump (PostgreSQL) 17.11`.

---

## Paso 2. Conseguir la dirección de conexión

**2.1.** En Supabase, botón **Connect** (arriba en el proyecto).

**2.2.** Elige **Session pooler** (funciona con cualquier internet; la conexión "directa" del plan gratis solo funciona con IPv6).

**2.3.** Copia la dirección. La de FrostPom es esta (región `us-west-2`):

```
postgresql://postgres.tcxdmziakgppabwyrydd:[YOUR-PASSWORD]@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

**2.4.** **La contraseña** es la de la base de datos que pusiste al crear el proyecto (no es tu contraseña de Supabase). Si no la recuerdas: **Project Settings → Database → Reset database password**. Cambiarla **no afecta a la app**, que usa la llave publicable y no esta contraseña.

✅ **Quedó bien si** tienes la dirección copiada y sabes la contraseña.

---

## Paso 3. Hacer la copia

**3.1.** Crea la carpeta de las copias **fuera del proyecto** y entra en ella:

```powershell
New-Item -ItemType Directory -Force "$HOME\FrostPom-copias" | Out-Null
cd "$HOME\FrostPom-copias"
```

✅ La línea de PowerShell debe empezar con `PS C:\Users\<tu usuario>\FrostPom-copias>`. No hagas la copia en `C:\windows\system32`, que es donde abre PowerShell como administrador.

**3.2.** Guarda la dirección y la fecha. Es la del 2.3 **sin** el pedazo `:[YOUR-PASSWORD]` (la contraseña no va en la dirección). Si algún día mueves el proyecto de región, lo que va después de la `@` cambia (si no coincide sale `tenant/user … not found`): cópiala otra vez de **Connect**. Pega cada línea por separado y pulsa Enter después de cada una:

```powershell
$db = "postgresql://postgres.tcxdmziakgppabwyrydd@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
$hoy = Get-Date -Format "yyyy-MM-dd"
```

**3.3.** Copia tus datos:

```powershell
pg_dump --dbname "$db" --schema=private --format=custom --file "frostpom-datos-$hoy.dump"
```

Te pedirá `Password:`. Pega la contraseña de la base (Ctrl + V o clic derecho) y pulsa **Enter**. **No se ve nada mientras la pegas: es normal.** Pedírtela así es más seguro que escribirla en un comando, porque no queda guardada en el historial de PowerShell.

**3.4.** Copia las cuentas (te pedirá la contraseña otra vez):

```powershell
pg_dump --dbname "$db" --data-only --table=auth.users --table=auth.identities --format=custom --file "frostpom-cuentas-$hoy.dump"
```

**3.5.** Mira que los dos archivos existan y pesen algo:

```powershell
Get-ChildItem *.dump | Select-Object Name, @{n="KB";e={[math]::Round($_.Length/1KB)}}
```

✅ **Quedó bien si** aparecen `frostpom-datos-AAAA-MM-DD.dump` y `frostpom-cuentas-AAAA-MM-DD.dump`, ninguno con 0 KB, y `pg_dump` no mostró ningún error.

---

## Paso 4. Comprobar que la copia sirve

En la **misma ventana** del paso 3 (usa `$hoy`):

```powershell
pg_restore --list "frostpom-datos-$hoy.dump" | Select-String "TABLE DATA"
pg_restore --list "frostpom-cuentas-$hoy.dump" | Select-String "TABLE DATA"
```

✅ **Quedó bien si** el primero lista `daily_totals`, `profiles`, `saves`, `study_sessions` y `transfer_codes`, y el segundo `identities` y `users`.

---

## Si `pg_dump` muestra un error

| Lo que dice | Por qué pasa | Qué hacer |
|---|---|---|
| `The term 'pg_dump' is not recognized` | Windows no encuentra el programa | Sección "Si dice…" del paso 1 |
| `password authentication failed` | La contraseña de la base no es esa | Revisa que sea la de la **base**, no la de tu cuenta de Supabase. Si no la sabes, cámbiala (paso 2.4) |
| `tenant/user … not found` | La parte después de la `@` no es la de tu proyecto (se usó la del ejemplo), o el usuario quedó mal | Copia **tu** dirección en **Connect → Session pooler** y cambia `$db`. El usuario debe ser `postgres.tcxdmziakgppabwyrydd` (con el punto) |
| `could not translate host name` | La dirección quedó mal copiada o no hay internet | Vuelve a copiarla del paso 2.3 |
| `server version mismatch` | Tu `pg_dump` es más viejo que la base | Instala la versión de las herramientas que dijo el paso 1.1 (o una más nueva) |
| `Access to the path … is denied` | Estás en una carpeta protegida (como `system32`) | Haz el paso 3.1 para entrar a tu carpeta de copias |

---

## Si algún día hay que restaurar

Lo más seguro es restaurar en un **proyecto nuevo** de Supabase y, cuando todo esté bien, cambiar la dirección y la llave publicable en `js/config.js`. Si llega ese día, avísame y lo hacemos juntos paso a paso; a grandes rasgos:

1. En el proyecto nuevo: activa **Anonymous sign-ins**, apaga **Confirm email** y corre `server/supabase/schema.sql` en el SQL Editor.

2. Restaura primero las cuentas y después tus datos (los datos dependen de las cuentas), sin disparar los triggers (`$dbNuevo` es la dirección del Session pooler del proyecto nuevo, sin la contraseña):

   ```powershell
   $env:PGOPTIONS = "-c session_replication_role=replica"
   pg_restore --data-only --no-owner --dbname "$dbNuevo" "frostpom-cuentas-AAAA-MM-DD.dump"
   pg_restore --data-only --no-owner --schema=private --dbname "$dbNuevo" "frostpom-datos-AAAA-MM-DD.dump"
   Remove-Item Env:PGOPTIONS
   ```

3. Vuelve a configurar en el proyecto nuevo el SMTP de Brevo, la plantilla del código y el CAPTCHA (`RECUPERAR-CONTRASENA.md` y `CAPTCHA.md`).

---

## Fuentes

- Supabase, copia y restauración con la línea de comandos (el método oficial, que usa Docker): https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- PostgreSQL, `pg_dump`: https://www.postgresql.org/docs/current/app-pgdump.html
