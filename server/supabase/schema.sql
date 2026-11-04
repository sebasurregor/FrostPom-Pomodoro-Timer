-- =====================================================================
-- StudyTimer: servidor del ranking global (Supabase / PostgreSQL 15+)
--
-- Por qué existe: si el ranking se calculara en el teléfono, cualquiera podría
-- editar sus minutos. Aquí el SERVIDOR mide el tiempo y decide cuánto cuenta.
--
-- Principios de seguridad:
--  1. Las tablas viven en el esquema "private", que la API pública no expone.
--     El cliente solo puede llamar funciones (RPC) con reglas estrictas.
--  2. Row Level Security activado en todas las tablas y sin políticas: nadie
--     las lee ni escribe directamente, ni siquiera un usuario autenticado.
--  3. El servidor guarda la hora de inicio con su propio reloj. Al terminar,
--     solo se acredita el MENOR entre: lo que dice el cliente, lo planeado y
--     el tiempo real que pasó en el servidor. Cambiar la hora del teléfono no sirve.
--  4. Límite diario igual para todos en el ranking (premia constancia, no desvelo).
--  5. El apodo lo arma el servidor con listas de palabras: no hay texto libre,
--     así no se filtran nombres reales ni se cuelan groserías.
--  6. El ranking nunca devuelve identificadores internos; solo apodo, avatar y minutos
--     de quienes aceptaron aparecer (por defecto, nadie aparece).
--  7. Cada persona puede exportar y borrar su cuenta y sus datos.
--
-- Cómo usarlo: Supabase > SQL Editor > pega este archivo > Run.
-- Requiere activar "Anonymous sign-ins" en Authentication si no quieres pedir correo.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Listas de palabras (deben coincidir con js/game.js: ANIMALS y ADJECTIVES)
-- ---------------------------------------------------------------------
create or replace function private.animals() returns text[]
language sql immutable set search_path = '' as $$
  select array['Pingüino','Oso','Foca','Ballena','Cachalote','Tiburón','Delfín','Pulpo','Calamar','Cangrejo',
               'Pez','Nutria','Zorro','Búho','Lobo','Liebre','Reno','Langosta','Pato','Krill']
$$;

create or replace function private.adjectives() returns text[]
language sql immutable set search_path = '' as $$
  select array['Veloz','Brillante','Valiente','Tenaz','Ágil','Feliz','Audaz','Genial','Fugaz','Estelar',
               'Lunar','Solar','Imparable','Increíble','Alegre','Leal','Capaz','Gentil','Paciente','Constante']
$$;

-- Límite diario que cuenta en el ranking global (4 horas), igual para todos.
create or replace function private.board_daily_cap_sec() returns int
language sql immutable set search_path = '' as $$ select 4 * 60 * 60 $$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists private.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  nickname      text not null unique,
  avatar        smallint not null check (avatar between 0 and 19),
  show_on_board boolean not null default false,   -- privacidad por defecto: no apareces
  time_zone     text not null default 'America/Bogota',
  created_at    timestamptz not null default now(),
  constraint nickname_format check (nickname ~ '^[[:alpha:]]{4,24}[0-9]{2}$')
);

create table if not exists private.study_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references private.profiles (user_id) on delete cascade,
  planned_sec  int not null check (planned_sec between 60 and 10800),
  started_at   timestamptz not null default now(),   -- reloj del SERVIDOR
  finished_at  timestamptz,
  credited_sec int not null default 0 check (credited_sec >= 0),
  status       text not null default 'active' check (status in ('active', 'done', 'abandoned'))
);
create index if not exists study_sessions_user_started on private.study_sessions (user_id, started_at desc);
create unique index if not exists study_sessions_one_active on private.study_sessions (user_id) where status = 'active';

create table if not exists private.daily_totals (
  user_id      uuid not null references private.profiles (user_id) on delete cascade,
  day          date not null,
  credited_sec int not null default 0 check (credited_sec >= 0),
  sessions     int not null default 0,
  primary key (user_id, day)
);

alter table private.profiles       enable row level security;
alter table private.study_sessions enable row level security;
alter table private.daily_totals   enable row level security;
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
-- Ayudante: exige una sesión iniciada
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
-- Perfil: el apodo se arma aquí con índices de las listas
-- ---------------------------------------------------------------------
create or replace function public.set_profile(p_animal int, p_adjective int, p_avatar int, p_show_on_board boolean default false)
returns table (nickname text, avatar smallint, show_on_board boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid  uuid := private.require_user();
  a    text[] := private.animals();
  j    text[] := private.adjectives();
  nick text;
  tries int := 0;
begin
  if p_animal is null or p_animal not between 0 and cardinality(a) - 1
     or p_adjective is null or p_adjective not between 0 and cardinality(j) - 1
     or p_avatar is null or p_avatar not between 0 and 19 then
    raise exception 'Datos de perfil no válidos' using errcode = '22023';
  end if;
  loop
    nick := a[p_animal + 1] || j[p_adjective + 1] || (10 + floor(random() * 90))::int::text;
    begin
      insert into private.profiles as pr (user_id, nickname, avatar, show_on_board)
      values (uid, nick, p_avatar, coalesce(p_show_on_board, false))
      on conflict (user_id) do update
        set nickname = excluded.nickname, avatar = excluded.avatar, show_on_board = excluded.show_on_board;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 25 then
        raise exception 'No se pudo crear un apodo único; prueba otras palabras' using errcode = '23505';
      end if;
    end;
  end loop;
  return query select pr.nickname, pr.avatar, pr.show_on_board from private.profiles pr where pr.user_id = uid;
end $$;

create or replace function public.set_board_visibility(p_show boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  update private.profiles set show_on_board = coalesce(p_show, false) where user_id = uid;
  if not found then
    raise exception 'Primero crea tu perfil' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.set_time_zone(p_time_zone text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Zona horaria no válida' using errcode = '22023';
  end if;
  update private.profiles set time_zone = p_time_zone where user_id = uid;
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
  return sid;
end $$;

create or replace function public.finish_session(p_session_id uuid, p_actual_sec int)
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

  return query select credit, credit < claimed;
end $$;

-- ---------------------------------------------------------------------
-- Ranking: sin identificadores, solo quienes aceptaron aparecer
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (pos bigint, nickname text, avatar smallint, minutes int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid   uuid := private.require_user();
  lim   int := least(greatest(coalesce(p_limit, 50), 1), 100);
  since date;
begin
  if p_period is null or p_period not in ('week', 'all') then
    raise exception 'Periodo no válido' using errcode = '22023';
  end if;
  since := case when p_period = 'week'
                then date_trunc('week', now() at time zone 'America/Bogota')::date
                else '-infinity'::date end;
  return query
  with totals as (
    select p.user_id, p.nickname, p.avatar, (coalesce(sum(dt.credited_sec), 0) / 60)::int as mins
      from private.profiles p
      left join private.daily_totals dt on dt.user_id = p.user_id and dt.day >= since
     where p.show_on_board
     group by p.user_id, p.nickname, p.avatar
  ), ranked as (
    select rank() over (order by t.mins desc) as rnk, t.user_id, t.nickname, t.avatar, t.mins
      from totals t
  )
  select r.rnk, r.nickname, r.avatar, r.mins, r.user_id = uid
    from ranked r
   where r.rnk <= lim or r.user_id = uid
   order by r.rnk, r.nickname;
end $$;

-- ---------------------------------------------------------------------
-- Derechos sobre los datos: exportar y borrar la cuenta
-- (Apple exige poder borrar la cuenta desde la app; la ley de datos personales
--  reconoce el derecho a conocer y suprimir la información.)
-- ---------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' from private.profiles p where p.user_id = uid),
    'daily_totals', coalesce((select jsonb_agg(to_jsonb(dt) - 'user_id' order by dt.day) from private.daily_totals dt where dt.user_id = uid), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.started_at) from private.study_sessions s where s.user_id = uid), '[]'::jsonb)
  );
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
begin
  delete from private.profiles where user_id = uid;   -- borra en cascada sesiones y totales
  delete from auth.users where id = uid;               -- y la cuenta de autenticación
end $$;

-- ---------------------------------------------------------------------
-- Permisos: solo usuarios autenticados pueden llamar las funciones públicas
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public;
revoke execute on function public.set_profile(int, int, int, boolean) from public;
revoke execute on function public.set_board_visibility(boolean) from public;
revoke execute on function public.set_time_zone(text) from public;
revoke execute on function public.start_session(int) from public;
revoke execute on function public.finish_session(uuid, int) from public;
revoke execute on function public.get_leaderboard(text, int) from public;
revoke execute on function public.export_my_data() from public;
revoke execute on function public.delete_my_account() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.set_profile(int, int, int, boolean), public.set_board_visibility(boolean), public.set_time_zone(text), public.start_session(int), public.finish_session(uuid, int), public.get_leaderboard(text, int), public.export_my_data(), public.delete_my_account() from anon';
    execute 'grant execute on function public.set_profile(int, int, int, boolean), public.set_board_visibility(boolean), public.set_time_zone(text), public.start_session(int), public.finish_session(uuid, int), public.get_leaderboard(text, int), public.export_my_data(), public.delete_my_account() to authenticated';
  end if;
end $$;
