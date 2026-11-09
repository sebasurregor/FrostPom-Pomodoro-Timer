-- =====================================================================
-- FrostPom: servidor del ranking global y de las cuentas en línea (Supabase / PostgreSQL 15+)
-- v3.9: ranking global · v4.0: guardar el progreso de las cuentas con correo (sin la foto)
-- v4.1: reportar nombres del ranking (lo piden Google Play y App Store)
--
-- Por qué existe: si el ranking se calculara en el teléfono, cualquiera podría
-- editar sus minutos. Aquí el SERVIDOR mide el tiempo y decide cuánto cuenta.
--
-- Principios:
--  1. Las tablas viven en el esquema "private", que la API pública no expone.
--     El cliente solo puede llamar funciones (RPC) con reglas estrictas.
--  2. Row Level Security activado en todas las tablas y sin políticas: nadie
--     las lee ni escribe directamente, ni siquiera un usuario con sesión.
--  3. El servidor guarda la hora de inicio con su propio reloj. Al terminar,
--     solo se acredita el MENOR entre: lo que dice la app, lo planeado y
--     el tiempo real que pasó en el servidor. Cambiar la hora del teléfono no sirve.
--  4. Máximo 4 h al día en el ranking, igual para todos (premia constancia, no desvelo).
--  5. El nombre público es el nombre de usuario de FrostPom. El servidor lo revisa con las
--     MISMAS reglas que la app (js/identity.js): formato y lista de groserías. No se repite.
--  6. Todos aparecen por defecto y cualquiera puede salir (show_on_board = false).
--     El dueño de la app puede ocultar un nombre inapropiado (hidden = true).
--  7. La edad NO se guarda aquí: la app pregunta el mes y año de nacimiento, lo guarda solo en
--     el dispositivo, y a los menores de 13 años ni siquiera los conecta con este servidor.
--  8. Cada persona puede descargar y borrar sus datos.
--  9. (v4.0) Las cuentas con correo guardan su progreso para entrar desde otro equipo. El
--     servidor quita la foto y los datos de la cuenta local antes de guardarlo. Las cuentas
--     anónimas (las del ranking) no pueden guardar progreso.
-- 10. (v4.1) Quien tiene sesión puede reportar un nombre del ranking (una vez por nombre, máximo
--     20 al día). Con 3 personas distintas, el nombre se oculta solo hasta que el dueño lo revise.
--
-- Cómo usarlo: Supabase > SQL Editor > pega este archivo > Run. Se puede volver a correr.
-- Paso a paso completo: docs/RANKING-GLOBAL.md
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Limpieza de la versión anterior de este archivo (v3.4, con apodos generados).
-- Nunca se usó con usuarios reales, así que no hay datos que conservar.
-- ---------------------------------------------------------------------
drop function if exists public.set_profile(int, int, int, boolean);
drop function if exists public.finish_session(uuid, int);
drop function if exists private.animals();
drop function if exists private.adjectives();
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'private' and table_name = 'profiles' and column_name = 'nickname') then
    drop table if exists private.daily_totals;
    drop table if exists private.study_sessions;
    drop table if exists private.profiles;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Reglas que deben coincidir con la app
-- ---------------------------------------------------------------------
-- Máximo que cuenta en el ranking por día (4 horas). En la app: config.leaderboard.dailyCapMin.
create or replace function private.board_daily_cap_sec() returns int
language sql immutable set search_path = '' as $$ select 4 * 60 * 60 $$;

-- Animales del avatar (js/identity.js: AVATARS). La foto de perfil nunca se sube.
create or replace function private.avatars() returns text[]
language sql immutable set search_path = '' as $$
  select array['🐧','🐻‍❄️','🦭','🐳','🐋','🦈','🐬','🐙','🦑','🦀','🐟','🦦','🦊','🦉','🐺','🐇','🦌','🦞','🦆','🦐']
$$;

-- Groserías, ofensas y suplantación (js/identity.js: BLOCKED_PATTERNS, generado de BLOCKED).
-- Cada letra lleva "+" para atrapar "puuuta" sin bloquear palabras parecidas ("esperanza").
create or replace function private.blocked_patterns() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'p+u+t+a+','p+u+t+o+','p+u+t+i+t+','m+i+e+r+d+a+','p+e+n+d+e+j+','m+a+r+i+c+a+','m+a+r+i+c+',
    'm+a+l+p+a+r+i+d+','g+o+n+o+r+r+e+a+','h+i+j+u+e+p+u+t+a+','h+d+p+','c+a+r+a+j+o+','v+e+r+g+a+',
    'c+h+i+n+g+a+d+','c+u+l+e+r+o+','j+o+d+e+r+','g+i+l+i+p+o+l+l+','i+d+i+o+t+a+','i+m+b+e+c+i+l+',
    'e+s+t+u+p+i+d+','r+e+t+r+a+s+a+d+','m+o+g+o+l+i+c+','s+u+b+n+o+r+m+a+l+','z+o+r+r+a+','p+e+r+r+a+',
    'c+a+b+r+o+n+','p+a+j+e+r+o+','f+u+c+k+','s+h+i+t+','b+i+t+c+h+','b+a+s+t+a+r+d+','a+s+s+h+o+l+e+',
    'd+i+c+k+','p+u+s+s+y+','c+u+n+t+','w+h+o+r+e+','s+l+u+t+','r+e+t+a+r+d+','s+t+u+p+i+d+','s+e+x+o+',
    'p+o+r+n+o+','p+o+r+n+','x+x+x+','v+i+o+l+a+d+','n+u+d+e+','d+e+s+n+u+d+','n+i+g+g+','n+e+g+r+a+t+a+',
    's+u+d+a+c+a+','c+h+i+n+k+','k+i+k+e+','f+a+g+g+o+t+','t+r+a+n+n+y+','n+a+z+i+','h+i+t+l+e+r+','k+k+k+',
    'g+e+n+o+c+i+d+','t+e+r+r+o+r+i+s+','a+d+m+i+n+','m+o+d+e+r+a+d+o+r+','s+o+p+o+r+t+e+',
    's+t+u+d+y+t+i+m+e+r+','f+r+o+s+t+p+o+m+','o+f+i+c+i+a+l+'
  ]
$$;

-- Forma "plana" del nombre, igual que plainName() en js/identity.js: sin tildes, 0→o, 4→a…,
-- solo letras, y sin las palabras inocentes que contienen un pedazo de grosería.
create or replace function private.plain_name(v text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             lower(translate(coalesce(v, ''),
               'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãåéèêëíìîïóòôöõúùûüñç0134578@$',
               'aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuuncoieastbas')),
             '[^a-z]', '', 'g'),
           'computa|computo|disputa|reputa|imputa|diputa', '', 'g')
$$;

-- Revisa el nombre de usuario (mismas reglas que checkUsername en la app). Devuelve el nombre limpio.
create or replace function private.check_username(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := btrim(coalesce(p, ''));
  n text;
begin
  if char_length(v) < 3 or char_length(v) > 20
     or v !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.]+$'
     or v ~ '^[0-9_.]+$' then
    raise exception 'name_invalid' using errcode = '22023';
  end if;
  n := private.plain_name(v);
  if exists (select 1 from unnest(private.blocked_patterns()) as b(p) where n ~ b.p) then
    raise exception 'name_blocked' using errcode = '22023';
  end if;
  return v;
end $$;

-- La semana del ranking empieza el lunes a las 00:00 UTC (la misma para todo el mundo).
create or replace function private.week_start() returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
$$;
-- La temporada son 3 meses del calendario (ene–mar, abr–jun, jul–sep, oct–dic), en UTC.
-- En la app: config.season.months = 3.
create or replace function private.season_start() returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('quarter', now() at time zone 'UTC') at time zone 'UTC'
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists private.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  country       text check (country ~ '^[A-Z]{2}$'),
  avatar        text not null default '🐧',
  time_zone     text not null default 'UTC',
  show_on_board boolean not null default true,   -- todos aparecen; cualquiera puede salir
  hidden        boolean not null default false,  -- moderación: lo pone el dueño de la app
  xp            int not null default 0 check (xp >= 0),
  xp_season     date,                            -- la XP es de la temporada (se reinicia)
  created_at    timestamptz not null default now(),
  last_active   timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on private.profiles (lower(username));

create table if not exists private.study_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references private.profiles (user_id) on delete cascade on update cascade,
  planned_sec  int not null check (planned_sec between 60 and 10800),
  started_at   timestamptz not null default now(),   -- reloj del SERVIDOR
  finished_at  timestamptz,
  credited_sec int not null default 0 check (credited_sec >= 0),
  status       text not null default 'active' check (status in ('active', 'done', 'abandoned'))
);
create index if not exists study_sessions_user_started on private.study_sessions (user_id, started_at desc);
create unique index if not exists study_sessions_one_active on private.study_sessions (user_id) where status = 'active';
create index if not exists study_sessions_done_finished on private.study_sessions (finished_at) where status = 'done';

-- Para el tope diario (por día de la persona, según su zona horaria)
create table if not exists private.daily_totals (
  user_id      uuid not null references private.profiles (user_id) on delete cascade on update cascade,
  day          date not null,
  credited_sec int not null default 0 check (credited_sec >= 0),
  sessions     int not null default 0,
  primary key (user_id, day)
);

-- Códigos de un solo uso para pasar tu lugar en el ranking a tu cuenta con correo
create table if not exists private.transfer_codes (
  code_hash  text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

-- (v4.0) El progreso de cada cuenta con correo: un solo documento JSON, con versión para
-- no pisar lo que otro equipo guardó.
create table if not exists private.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    int not null default 1,
  bytes      int not null default 0,
  updated_at timestamptz not null default now()
);

-- (v4.1) Reportes de nombres del ranking. Una fila por persona que reporta y nombre reportado.
create table if not exists private.reports (
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_id   uuid not null references private.profiles (user_id) on delete cascade on update cascade,
  reason      text not null check (reason in ('ofensivo', 'suplantacion', 'datos', 'otro')),
  created_at  timestamptz not null default now(),
  primary key (reporter_id, target_id)
);
create index if not exists reports_target on private.reports (target_id);
create index if not exists reports_reporter_created on private.reports (reporter_id, created_at desc);

alter table private.profiles       enable row level security;
alter table private.study_sessions enable row level security;
alter table private.daily_totals   enable row level security;
alter table private.transfer_codes enable row level security;
alter table private.saves          enable row level security;
alter table private.reports        enable row level security;
-- Sin políticas a propósito: el acceso es SOLO a través de las funciones de abajo.

revoke all on all tables in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon, authenticated';
    execute 'revoke all on all tables in schema private from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Ayudante: exige una sesión iniciada (los usuarios anónimos de Supabase también cuentan)
-- ---------------------------------------------------------------------
create or replace function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '28000';
  end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------
-- Nombre y perfil
-- ---------------------------------------------------------------------
-- ¿Está libre este nombre? (se puede preguntar sin sesión, al crear la cuenta)
create or replace function public.username_available(p_username text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  begin
    v := private.check_username(p_username);
  exception when invalid_parameter_value then
    return false;
  end;
  return not exists (select 1 from private.profiles p
                      where lower(p.username) = lower(v) and p.user_id is distinct from auth.uid());
end $$;

-- Crea o actualiza tu perfil. Errores: 'name_invalid' / 'name_blocked' (22023), 'name_taken' (23505).
create or replace function public.set_profile(
  p_username text, p_country text default null, p_avatar text default null,
  p_time_zone text default null, p_show boolean default true)
returns table (username text, show_on_board boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.require_user();
  v   text := private.check_username(p_username);
  c   text := case when p_country ~ '^[A-Z]{2}$' then p_country else null end;
  a   text := case when p_avatar = any (private.avatars()) then p_avatar else '🐧' end;
  tz  text := 'UTC';
begin
  if p_time_zone is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    tz := p_time_zone;
  end if;
  if exists (select 1 from private.profiles pr where lower(pr.username) = lower(v) and pr.user_id <> uid) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  begin
    insert into private.profiles as pr (user_id, username, country, avatar, time_zone, show_on_board)
    values (uid, v, c, a, tz, coalesce(p_show, true))
    on conflict (user_id) do update
      set username = excluded.username, country = excluded.country, avatar = excluded.avatar,
          time_zone = excluded.time_zone, show_on_board = excluded.show_on_board, last_active = now();
  exception when unique_violation then
    raise exception 'name_taken' using errcode = '23505';
  end;
  return query select pr.username, pr.show_on_board from private.profiles pr where pr.user_id = uid;
end $$;

-- Aparecer o no en el ranking (Ajustes → "Aparecer en el ranking")
create or replace function public.set_board_visibility(p_show boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  update private.profiles set show_on_board = coalesce(p_show, false), last_active = now() where user_id = uid;
  if not found then
    raise exception 'Primero crea tu perfil' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Sesiones: el servidor mide el tiempo
-- ---------------------------------------------------------------------
create or replace function public.start_session(p_planned_sec int)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  sid uuid;
  recent int;
begin
  if not exists (select 1 from private.profiles where user_id = uid) then
    raise exception 'Primero crea tu perfil' using errcode = 'P0002';
  end if;
  if p_planned_sec is null or p_planned_sec not between 60 and 10800 then
    raise exception 'Duración no válida' using errcode = '22023';
  end if;
  -- Límite de abuso: máximo 60 sesiones iniciadas en 24 horas.
  select count(*) into recent from private.study_sessions
   where user_id = uid and started_at > now() - interval '24 hours';
  if recent >= 60 then
    raise exception 'Demasiadas sesiones seguidas; descansa un rato' using errcode = '54000';
  end if;
  update private.study_sessions set status = 'abandoned', finished_at = now()
   where user_id = uid and status = 'active';
  insert into private.study_sessions (user_id, planned_sec) values (uid, p_planned_sec) returning id into sid;
  update private.profiles set last_active = now() where user_id = uid;
  return sid;
end $$;

-- Termina la sesión. p_xp = la XP de la temporada según la app; se acota a lo que el
-- servidor considera posible con los minutos que él mismo midió (solo decide el emblema).
create or replace function public.finish_session(p_session_id uuid, p_actual_sec int, p_xp int default null)
returns table (credited_sec int, capped boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid     uuid := private.require_user();
  s       private.study_sessions%rowtype;
  tz      text;
  elapsed int;
  claimed int;
  used    int;
  credit  int;
  d       date;
  s_min   int;
  s_days  int;
begin
  select * into s from private.study_sessions
   where id = p_session_id and user_id = uid and status = 'active'
   for update;
  if not found then
    raise exception 'Sesión no encontrada o ya terminada' using errcode = 'P0002';
  end if;

  elapsed := floor(extract(epoch from (now() - s.started_at)))::int;
  -- Lo que cuenta es el MENOR entre lo que dice la app, lo planeado y el tiempo real (+5 s de margen de red).
  claimed := least(greatest(coalesce(p_actual_sec, 0), 0), s.planned_sec, elapsed + 5);

  if claimed < 60 then
    update private.study_sessions set status = 'abandoned', finished_at = now() where id = s.id;
    return query select 0, false;
    return;
  end if;

  select p.time_zone into tz from private.profiles p where p.user_id = uid;
  d := (now() at time zone tz)::date;

  insert into private.daily_totals (user_id, day) values (uid, d) on conflict do nothing;
  select dt.credited_sec into used from private.daily_totals dt where dt.user_id = uid and dt.day = d for update;

  credit := least(claimed, greatest(private.board_daily_cap_sec() - used, 0));

  update private.study_sessions
     set status = 'done', finished_at = now(), credited_sec = credit
   where id = s.id;
  update private.daily_totals dt
     set credited_sec = dt.credited_sec + credit, sessions = dt.sessions + 1
   where dt.user_id = uid and dt.day = d;

  if p_xp is not null then
    select coalesce(sum(x.credited_sec), 0) / 60, count(distinct (x.finished_at at time zone 'UTC')::date)
      into s_min, s_days
      from private.study_sessions x
     where x.user_id = uid and x.status = 'done' and x.finished_at >= private.season_start();
    update private.profiles
       set xp = least(greatest(p_xp, 0), s_min * 3 + s_days * 60 + 300),
           xp_season = (private.season_start() at time zone 'UTC')::date
     where user_id = uid;
  end if;
  update private.profiles set last_active = now() where user_id = uid;

  return query select credit, credit < claimed;
end $$;

-- ---------------------------------------------------------------------
-- Ranking: sin identificadores internos, solo quienes aparecen y tienen minutos.
-- Se puede ver sin sesión (is_me siempre es false en ese caso).
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, username text, country text, avatar text, minutes int, xp int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid   uuid := auth.uid();
  lim   int := least(greatest(coalesce(p_limit, 50), 1), 100);
  since timestamptz;
  cur   date := (private.season_start() at time zone 'UTC')::date;
begin
  if p_period is null or p_period not in ('week', 'season') then
    raise exception 'Periodo no válido' using errcode = '22023';
  end if;
  since := case when p_period = 'week' then private.week_start() else private.season_start() end;
  return query
  with totals as (
    select p.user_id, p.username, p.country, p.avatar,
           case when p.xp_season = cur then p.xp else 0 end as xp,
           (coalesce(sum(s.credited_sec), 0) / 60)::int as mins
      from private.profiles p
      left join private.study_sessions s
             on s.user_id = p.user_id and s.status = 'done' and s.finished_at >= since
     where p.show_on_board and not p.hidden
     group by p.user_id
  ), ranked as (
    select rank() over (order by t.mins desc) as rnk, t.* from totals t where t.mins > 0
  )
  select r.rnk, r.username, r.country, r.avatar, r.mins, r.xp, coalesce(r.user_id = uid, false)
    from ranked r
   where r.rnk <= lim or r.user_id = uid
   order by r.rnk, lower(r.username);
end $$;

-- ---------------------------------------------------------------------
-- Pasar tu lugar a otra cuenta tuya (por ejemplo, de la cuenta anónima del equipo a tu
-- cuenta con correo). 1) Con la sesión de origen pides un código (dura 10 minutos y sirve
-- una sola vez). 2) Con la sesión de destino lo canjeas. Solo quien tiene las dos sesiones
-- puede hacerlo, porque el código solo se lo entrega el servidor a la de origen.
-- ---------------------------------------------------------------------
create or replace function public.create_transfer_code()
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := private.require_user();
  code text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  delete from private.transfer_codes where user_id = uid or expires_at < now();
  insert into private.transfer_codes (code_hash, user_id, expires_at)
  values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), uid, now() + interval '10 minutes');
  return code;
end $$;

create or replace function public.redeem_transfer_code(p_code text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid      uuid := private.require_user();
  src      uuid;
  has_mine boolean;
  has_src  boolean;
begin
  delete from private.transfer_codes tc
   where tc.code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex')
     and tc.expires_at > now()
  returning tc.user_id into src;
  if src is null then
    raise exception 'code_invalid' using errcode = 'P0002';
  end if;
  if src = uid then
    return true;
  end if;
  has_mine := exists (select 1 from private.profiles where user_id = uid);
  has_src  := exists (select 1 from private.profiles where user_id = src);
  if has_src then
    update private.study_sessions set status = 'abandoned', finished_at = now()
     where user_id = src and status = 'active';
    if not has_mine then
      -- Tu perfil (nombre, minutos, todo) pasa tal cual a la cuenta de destino
      update private.profiles set user_id = uid where user_id = src;
    else
      -- Las dos tenían perfil: se queda el de destino y se suman los minutos
      update private.study_sessions set user_id = uid where user_id = src;
      insert into private.daily_totals as dt (user_id, day, credited_sec, sessions)
      select uid, d.day, d.credited_sec, d.sessions from private.daily_totals d where d.user_id = src
      on conflict (user_id, day) do update
        set credited_sec = least(dt.credited_sec + excluded.credited_sec, private.board_daily_cap_sec()),
            sessions = dt.sessions + excluded.sessions;
      delete from private.profiles where user_id = src;
    end if;
  end if;
  -- La cuenta de origen solo se borra si era anónima (nunca una con correo)
  delete from auth.users where id = src and coalesce(is_anonymous, false);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Derechos sobre los datos: descargar y borrar
-- ---------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' - 'hidden' from private.profiles p where p.user_id = uid),
    'daily_totals', coalesce((select jsonb_agg(to_jsonb(dt) - 'user_id' order by dt.day) from private.daily_totals dt where dt.user_id = uid), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.started_at) from private.study_sessions s where s.user_id = uid), '[]'::jsonb),
    'progress', (select sv.data from private.saves sv where sv.user_id = uid),
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'reason', r.reason, 'created_at', r.created_at) order by r.created_at)
                                from private.reports r join private.profiles p on p.user_id = r.target_id
                               where r.reporter_id = uid), '[]'::jsonb)
  );
end $$;

-- Borra tu perfil, tus sesiones y tus totales. Si la cuenta era anónima, también la cuenta.
-- (Una cuenta con correo se conserva para que puedas seguir recuperando tu contraseña.)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  delete from private.profiles where user_id = uid;   -- en cascada: sesiones, totales y reportes recibidos
  delete from private.transfer_codes where user_id = uid;
  delete from private.reports where reporter_id = uid;
  delete from auth.users where id = uid and coalesce(is_anonymous, false);
end $$;

-- ---------------------------------------------------------------------
-- Cuentas en línea (v4.0): guardar y traer el progreso
-- ---------------------------------------------------------------------
-- Exige una cuenta con correo (las anónimas del ranking no guardan progreso).
create or replace function private.require_account() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  if exists (select 1 from auth.users u where u.id = uid and coalesce(u.is_anonymous, false)) then
    raise exception 'account_required' using errcode = '42501';
  end if;
  return uid;
end $$;

-- Trae tu progreso guardado (ninguna fila si todavía no hay).
create or replace function public.load_progress()
returns table (data jsonb, version int, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := private.require_account();
begin
  return query select sv.data, sv.version, sv.updated_at from private.saves sv where sv.user_id = uid;
end $$;

-- Guarda tu progreso. p_base_version = la versión que tenía este equipo (0 si es la primera vez).
-- Si otro equipo guardó después, falla con 'save_conflict' y la app decide qué copia queda.
-- Devuelve la versión nueva. Máximo 1 MB. La foto y la cuenta local nunca se guardan.
create or replace function public.save_progress(p_data jsonb, p_base_version int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := private.require_account();
  cur  int;
  d    jsonb;
  size int;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'save_invalid' using errcode = '22023';
  end if;
  d := (p_data - 'account') #- '{profile,photo}';
  size := octet_length(d::text);
  if size > 1048576 then
    raise exception 'save_too_big' using errcode = '54000';
  end if;
  select sv.version into cur from private.saves sv where sv.user_id = uid for update;
  if cur is null then
    insert into private.saves (user_id, data, version, bytes) values (uid, d, 1, size);
    return 1;
  end if;
  if coalesce(p_base_version, 0) <> cur then
    raise exception 'save_conflict' using errcode = '40001', detail = cur::text;
  end if;
  update private.saves set data = d, version = cur + 1, bytes = size, updated_at = now() where user_id = uid;
  return cur + 1;
end $$;

-- Elimina tu cuenta en línea por completo: progreso, ranking y la cuenta misma (con correo o no).
create or replace function public.delete_my_cloud_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  delete from private.saves where user_id = uid;
  delete from private.profiles where user_id = uid;
  delete from private.transfer_codes where user_id = uid;
  delete from auth.users where id = uid;
end $$;

-- ---------------------------------------------------------------------
-- (v4.1) Reportar un nombre del ranking. No dice si el nombre existe ni si ya se ocultó, para
-- que nadie pueda usarlo para averiguar cosas: solo falla si el motivo no es válido o si la
-- persona ya reportó demasiado hoy.
-- ---------------------------------------------------------------------
create or replace function public.report_name(p_username text, p_reason text default 'ofensivo')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := private.require_user();
  target uuid;
  today  int;
begin
  if p_reason is null or p_reason not in ('ofensivo', 'suplantacion', 'datos', 'otro') then
    raise exception 'Motivo no válido' using errcode = '22023';
  end if;
  select count(*) into today from private.reports r
   where r.reporter_id = uid and r.created_at > now() - interval '1 day';
  if today >= 20 then
    raise exception 'too_many_reports' using errcode = '54000';
  end if;
  select p.user_id into target from private.profiles p
   where lower(p.username) = lower(btrim(coalesce(p_username, ''))) and p.show_on_board and not p.hidden;
  if target is null or target = uid then
    return;
  end if;
  insert into private.reports (reporter_id, target_id, reason) values (uid, target, p_reason)
    on conflict (reporter_id, target_id) do nothing;
  if (select count(*) from private.reports r where r.target_id = target) >= 3 then
    update private.profiles set hidden = true where user_id = target;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Herramientas para el dueño de la app (SQL Editor). Nadie más puede llamarlas.
-- ---------------------------------------------------------------------
-- Ocultar (o volver a mostrar) un nombre inapropiado:
--   select private.hide_name('nombre_feo');          select private.hide_name('nombre', false);
-- Al volver a mostrarlo (false) también se borran sus reportes, para que no se oculte de nuevo.
create or replace function private.hide_name(p_username text, p_hide boolean default true)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update private.profiles set hidden = coalesce(p_hide, true)
   where lower(username) = lower(btrim(p_username));
  get diagnostics n = row_count;
  if not coalesce(p_hide, true) then
    delete from private.reports r
     using private.profiles p
     where r.target_id = p.user_id and lower(p.username) = lower(btrim(p_username));
  end if;
  return n;
end $$;

-- (v4.1) Ver los nombres reportados, del más reportado al menos:
--   select * from private.report_summary();
create or replace function private.report_summary()
returns table (username text, reports bigint, reasons text, hidden boolean, last_report timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.username, count(*), string_agg(distinct r.reason, ', '), p.hidden, max(r.created_at)
    from private.reports r
    join private.profiles p on p.user_id = r.target_id
   group by p.user_id, p.username, p.hidden
   order by count(*) desc, max(r.created_at) desc
$$;

-- Limpieza: borra cuentas anónimas sin actividad en p_days días (y las que nunca se unieron
-- después de 7 días), y sesiones de hace más de 400 días. Ejemplo: select * from private.cleanup(90);
create or replace function private.cleanup(p_days int default 90)
returns table (deleted_users int, deleted_sessions int)
language plpgsql security definer set search_path = '' as $$
declare
  du int;
  ds int;
begin
  delete from auth.users u
   where coalesce(u.is_anonymous, false)
     and (exists (select 1 from private.profiles p
                   where p.user_id = u.id and p.last_active < now() - make_interval(days => greatest(p_days, 30)))
          or (not exists (select 1 from private.profiles p where p.user_id = u.id)
              and u.created_at < now() - interval '7 days'));
  get diagnostics du = row_count;
  delete from private.study_sessions where started_at < now() - interval '400 days';
  get diagnostics ds = row_count;
  delete from private.daily_totals where day < (now() - interval '400 days')::date;
  delete from private.transfer_codes where expires_at < now();
  delete from private.reports where created_at < now() - interval '400 days';
  return query select du, ds;
end $$;

-- ---------------------------------------------------------------------
-- Permisos: las funciones públicas solo para quien tiene sesión (anónima o con correo).
-- username_available y get_leaderboard también se pueden llamar sin sesión.
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public;
revoke execute on function public.username_available(text) from public;
revoke execute on function public.set_profile(text, text, text, text, boolean) from public;
revoke execute on function public.set_board_visibility(boolean) from public;
revoke execute on function public.start_session(int) from public;
revoke execute on function public.finish_session(uuid, int, int) from public;
revoke execute on function public.get_leaderboard(text, int) from public;
revoke execute on function public.create_transfer_code() from public;
revoke execute on function public.redeem_transfer_code(text) from public;
revoke execute on function public.export_my_data() from public;
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.load_progress() from public;
revoke execute on function public.save_progress(jsonb, int) from public;
revoke execute on function public.delete_my_cloud_account() from public;
revoke execute on function public.report_name(text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.set_profile(text, text, text, text, boolean), public.set_board_visibility(boolean), public.start_session(int), public.finish_session(uuid, int, int), public.create_transfer_code(), public.redeem_transfer_code(text), public.export_my_data(), public.delete_my_account() from anon';
    execute 'grant execute on function public.username_available(text), public.get_leaderboard(text, int) to anon, authenticated';
    execute 'grant execute on function public.set_profile(text, text, text, text, boolean), public.set_board_visibility(boolean), public.start_session(int), public.finish_session(uuid, int, int), public.create_transfer_code(), public.redeem_transfer_code(text), public.export_my_data(), public.delete_my_account() to authenticated';
    execute 'revoke execute on function public.load_progress(), public.save_progress(jsonb, int), public.delete_my_cloud_account() from anon';
    execute 'grant execute on function public.load_progress(), public.save_progress(jsonb, int), public.delete_my_cloud_account() to authenticated';
    execute 'revoke execute on function public.report_name(text, text) from anon';
    execute 'grant execute on function public.report_name(text, text) to authenticated';
  end if;
end $$;
