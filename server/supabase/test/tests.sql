-- Pruebas del servidor del ranking (v3.9). Se ejecutan con server/supabase/test/run_local.sh
-- Cada bloque falla con un mensaje claro si algo no se cumple.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on

-- Personas de prueba:
--  Ana (con correo), Beto, Caro (sale del ranking), Dani (pasa su lugar a Eva, con correo),
--  Fede (se une con Gabi, con correo), Hugo (nombre ocultado) y una cuenta anónima vieja.
insert into auth.users (id, is_anonymous) values
  ('11111111-1111-1111-1111-111111111111', false),
  ('22222222-2222-2222-2222-222222222222', true),
  ('33333333-3333-3333-3333-333333333333', true),
  ('44444444-4444-4444-4444-444444444444', true),
  ('55555555-5555-5555-5555-555555555555', false),
  ('66666666-6666-6666-6666-666666666666', true),
  ('77777777-7777-7777-7777-777777777777', false),
  ('88888888-8888-8888-8888-888888888888', true);
insert into auth.users (id, is_anonymous, created_at) values
  ('99999999-9999-9999-9999-999999999999', true, now() - interval '10 days');

-- Ayudante de prueba: crea una sesión terminada de N minutos para alguien (como dueño)
create function pg_temp.studied(p_user uuid, p_min int, p_finished timestamptz default now()) returns void
language sql as $$
  insert into private.study_sessions (user_id, planned_sec, started_at, finished_at, credited_sec, status)
  values (p_user, least(p_min * 60, 10800), p_finished - make_interval(mins => p_min), p_finished, p_min * 60, 'done');
$$;

-- ===================== Nombres: mismas reglas que la app =====================
do $$
declare n text;
begin
  foreach n in array array['kevin','nightowl','conocer','xavier','luna.k','Kaka','computadora','esperanza','MariaCálculo','Sebas_23','pingu.estudia'] loop
    perform private.check_username(n);
  end loop;
  foreach n in array array['ab','nombre con espacios','<script>','12345','putito99','Pu7a_123','m.i.e.r.d.a','n1gg4','Hitler88','admin','puuuta','kkk_fan','perrra','frostpom_oficial'] loop
    begin
      perform private.check_username(n);
      raise exception 'FALLO: aceptó el nombre "%"', n;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  raise notice 'OK  nombres: los inocentes pasan ("kevin", "esperanza"…) y los ofensivos no';
end $$;

-- ===================== Ana =====================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare r record;
begin
  select * into r from public.set_profile('Ana_23', 'CO', '🐧', 'America/Bogota');
  assert r.username = 'Ana_23', 'el nombre se guarda tal cual';
  assert r.show_on_board, 'FALLO: por defecto todos aparecen';
  begin
    perform public.set_profile('Pu7a_1');
    raise exception 'FALLO: aceptó un nombre grosero';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  perfil: nombre de usuario revisado y aparece por defecto';
end $$;

-- Trampa 1: empezar y terminar al instante diciendo "estudié 25 min".
do $$
declare sid uuid; r record;
begin
  sid := public.start_session(1500);
  select * into r from public.finish_session(sid, 1500);
  assert r.credited_sec = 0, 'FALLO: terminar al instante dio ' || r.credited_sec || ' s';
  raise notice 'OK  trampa "termino ya y digo 25 min": 0 minutos acreditados';
end $$;

-- Sesión real: el servidor la inicia; simulamos que pasaron 10 minutos.
select public.start_session(1500) as sid \gset
reset role;
update private.study_sessions set started_at = now() - interval '10 minutes' where id = :'sid';
set role authenticated;
set st.sid = :'sid';
do $$
declare r record;
begin
  -- Trampa 2: decir que fueron 25 min cuando pasaron 10. Solo cuentan ~10.
  select * into r from public.finish_session(current_setting('st.sid')::uuid, 1500, 1000000);
  assert r.credited_sec between 600 and 605, 'FALLO: se acreditaron ' || r.credited_sec || ' s en vez de ~600';
  raise notice 'OK  trampa "digo 25 min, pasaron 10": se acreditan % s', r.credited_sec;
  -- Trampa 3: terminar dos veces la misma sesión.
  begin
    perform public.finish_session(current_setting('st.sid')::uuid, 1500);
    raise exception 'FALLO: dejó terminar dos veces la misma sesión';
  exception when no_data_found then null;
  end;
  raise notice 'OK  no se puede terminar dos veces la misma sesión';
end $$;

-- Trampa 4: decir que tienes 1.000.000 de XP para mostrar el emblema de Leyenda.
reset role;
do $$
declare x int;
begin
  select xp into x from private.profiles where user_id = '11111111-1111-1111-1111-111111111111';
  assert x <= 10 * 3 + 60 + 300, 'FALLO: la XP no se acotó (' || x || ')';
  raise notice 'OK  trampa "tengo 1.000.000 de XP": se guarda solo % (lo posible con 10 min)', x;
end $$;
set role authenticated;

-- Acceso directo a las tablas: debe estar prohibido.
do $$
begin
  begin
    perform 1 from private.daily_totals;
    raise exception 'FALLO: pudo leer la tabla directamente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into private.daily_totals (user_id, day, credited_sec) values (auth.uid(), current_date, 999999);
    raise exception 'FALLO: pudo escribir minutos directamente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.hide_name('Ana_23');
    raise exception 'FALLO: un usuario pudo usar las herramientas del dueño';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  las tablas y las herramientas del dueño no se pueden usar desde la app';
end $$;

-- Límite diario: aunque estudie 6 horas, solo cuentan 4 en el ranking.
reset role;
update private.daily_totals set credited_sec = 4 * 3600 - 300 where user_id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.start_session(3600) as sid2 \gset
reset role;
update private.study_sessions set started_at = now() - interval '60 minutes' where id = :'sid2';
set role authenticated;
set st.sid2 = :'sid2';
do $$
declare r record;
begin
  select * into r from public.finish_session(current_setting('st.sid2')::uuid, 3600);
  assert r.credited_sec = 300 and r.capped, 'FALLO: el límite diario no se aplicó (' || r.credited_sec || ')';
  raise notice 'OK  límite diario: de 60 min solo cuentan 5 (se llegó a las 4 h)';
end $$;

-- ===================== Beto =====================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  -- El nombre no se repite (sin importar mayúsculas)
  begin
    perform public.set_profile('ana_23');
    raise exception 'FALLO: Beto tomó el nombre de Ana';
  exception when unique_violation then null;
  end;
  perform public.set_profile('Beto.fan', 'MX', 'no-es-un-animal', 'Zona/Inventada');
  -- Beto no puede terminar la sesión de Ana.
  begin
    perform public.finish_session(current_setting('st.sid2')::uuid, 60);
    raise exception 'FALLO: Beto terminó una sesión ajena';
  exception when no_data_found then null;
  end;
  raise notice 'OK  el nombre no se repite y nadie puede tocar sesiones de otra persona';
end $$;
reset role;
do $$
declare r record;
begin
  select avatar, time_zone into r from private.profiles where username = 'Beto.fan';
  assert r.avatar = '🐧' and r.time_zone = 'UTC', 'FALLO: aceptó un avatar o una zona horaria inventados';
  raise notice 'OK  avatar y zona horaria inventados se reemplazan por los de siempre';
end $$;
do $$ begin perform pg_temp.studied('22222222-2222-2222-2222-222222222222', 20); end $$;

-- ===================== Caro (sale del ranking) =====================
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin perform public.set_profile('caro.lee', 'AR', '🦊', 'America/Argentina/Buenos_Aires', false); end $$;
reset role;
do $$ begin perform pg_temp.studied('33333333-3333-3333-3333-333333333333', 45); end $$;
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.get_leaderboard('week', 50) where username = 'caro.lee';
  assert n = 0, 'FALLO: Caro aparece aunque salió del ranking';
  perform public.set_board_visibility(true);
  select count(*) into n from public.get_leaderboard('week', 50) where username = 'caro.lee' and is_me;
  assert n = 1, 'FALLO: Caro no volvió a aparecer';
  perform public.set_board_visibility(false);
  raise notice 'OK  salir del ranking y volver funciona';
end $$;

-- ===================== El ranking =====================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r record; n int;
begin
  select count(*) into n from public.get_leaderboard('week', 50);
  assert n = 2, 'FALLO: el ranking debería tener a Ana y Beto, tiene ' || n;
  select * into r from public.get_leaderboard('week', 50) where is_me;
  assert r.username = 'Beto.fan' and r.minutes = 20 and r.pos = 1, 'FALLO: Beto debería ser 1.º con 20 min: ' || row_to_json(r)::text;
  select * into r from public.get_leaderboard('week', 50) where username = 'Ana_23';
  assert r.minutes = 15 and r.country = 'CO' and r.avatar = '🐧' and not r.is_me, 'FALLO: fila de Ana: ' || row_to_json(r)::text;
  select count(*) into n from public.get_leaderboard('season', 50);
  assert n = 2, 'FALLO: la temporada debería tener 2 personas';
  begin
    perform public.get_leaderboard('all', 50);
    raise exception 'FALLO: aceptó un periodo inválido';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  ranking semanal y de temporada: Beto 20 min (1.º), Ana 15 min';
end $$;

-- La semana empieza el lunes 00:00 UTC: lo de antes no cuenta en la semana.
reset role;
do $$ begin perform pg_temp.studied('22222222-2222-2222-2222-222222222222', 30, private.week_start() - interval '1 minute'); end $$;
select (case when private.week_start() - interval '1 minute' >= private.season_start() then 50 else 20 end) as expect \gset
set st.expect = :'expect';
set role authenticated;
do $$
declare w int; s int; expect int := current_setting('st.expect')::int;
begin
  select minutes into w from public.get_leaderboard('week', 50) where is_me;
  select minutes into s from public.get_leaderboard('season', 50) where is_me;
  assert w = 20, 'FALLO: una sesión de la semana pasada contó en esta semana';
  assert s = expect, 'FALLO: la temporada debería sumar ' || expect || ', suma ' || s;
  raise notice 'OK  la semana se reinicia el lunes 00:00 UTC (temporada: % min)', s;
end $$;

-- El ranking no expone identificadores internos.
do $$
declare cols text;
begin
  select string_agg(a.attname, ',' order by a.n) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames) with ordinality as a(attname, n)
   where p.proname = 'get_leaderboard' and a.attname not like 'p\_%';
  assert cols !~ 'user_id', 'FALLO: el ranking devuelve user_id';
  raise notice 'OK  el ranking solo devuelve: %', cols;
end $$;

-- ===================== Moderación: ocultar un nombre =====================
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$ begin perform public.set_profile('hugo.x'); end $$;
reset role;
do $$ begin perform pg_temp.studied('88888888-8888-8888-8888-888888888888', 5); end $$;
do $$
declare n int;
begin
  assert private.hide_name('HUGO.X') = 1, 'FALLO: no encontró el nombre';
  select count(*) into n from public.get_leaderboard('week', 50) where username = 'hugo.x';
  assert n = 0, 'FALLO: el nombre ocultado sigue en el ranking';
  perform private.hide_name('hugo.x', false);
  select count(*) into n from public.get_leaderboard('week', 50) where username = 'hugo.x';
  assert n = 1, 'FALLO: el nombre no volvió a aparecer';
  raise notice 'OK  el dueño puede ocultar y volver a mostrar un nombre';
end $$;

-- ===================== Sin sesión (anon) =====================
set role anon;
set request.jwt.claim.sub = '';
do $$
declare n int;
begin
  select count(*) into n from public.get_leaderboard('week', 10) where is_me;
  assert n = 0, 'FALLO: sin sesión no puede haber "tú"';
  assert public.username_available('libre_99'), 'FALLO: un nombre libre aparece ocupado';
  assert not public.username_available('ANA_23'), 'FALLO: un nombre ocupado aparece libre';
  assert not public.username_available('Pu7a_1'), 'FALLO: un nombre grosero aparece libre';
  begin
    perform public.start_session(1500);
    raise exception 'FALLO: un visitante sin cuenta pudo empezar una sesión';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin sesión: se puede ver el ranking y revisar nombres, pero no sumar minutos';
end $$;

-- ===================== Pasar el lugar: Dani (anónima) → Eva (con correo) =====================
reset role;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin perform public.set_profile('dani_x'); end $$;
reset role;
do $$ begin perform pg_temp.studied('44444444-4444-4444-4444-444444444444', 12); end $$;
set role authenticated;
select public.create_transfer_code() as code \gset
set st.code = :'code';
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare r record;
begin
  begin
    perform public.redeem_transfer_code('codigo-inventado');
    raise exception 'FALLO: aceptó un código inventado';
  exception when no_data_found then null;
  end;
  assert public.redeem_transfer_code(current_setting('st.code')), 'FALLO: no canjeó el código';
  select * into r from public.get_leaderboard('week', 50) where is_me;
  assert r.username = 'dani_x' and r.minutes = 12, 'FALLO: el lugar no pasó a la cuenta con correo';
  begin
    perform public.redeem_transfer_code(current_setting('st.code'));
    raise exception 'FALLO: el código sirvió dos veces';
  exception when no_data_found then null;
  end;
  raise notice 'OK  pasar el lugar a la cuenta con correo (código de un solo uso)';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from auth.users where id = '44444444-4444-4444-4444-444444444444'), 'FALLO: quedó la cuenta anónima';
  raise notice 'OK  la cuenta anónima de origen se borra';
end $$;

-- Código vencido
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$ begin perform public.set_profile('fede.f'); end $$;
select public.create_transfer_code() as oldcode \gset
reset role;
update private.transfer_codes set expires_at = now() - interval '1 second';
set role authenticated;
set st.oldcode = :'oldcode';
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$
begin
  begin
    perform public.redeem_transfer_code(current_setting('st.oldcode'));
    raise exception 'FALLO: aceptó un código vencido';
  exception when no_data_found then null;
  end;
  raise notice 'OK  un código vencido no sirve';
end $$;

-- Unir dos perfiles: Fede (anónimo, 30 min) → Gabi (con correo, 20 min) = 50 min a nombre de Gabi
do $$ begin perform public.set_profile('gabi.g'); end $$;
reset role;
do $$ begin perform pg_temp.studied('66666666-6666-6666-6666-666666666666', 30); end $$;
do $$ begin perform pg_temp.studied('77777777-7777-7777-7777-777777777777', 20); end $$;
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select public.create_transfer_code() as code2 \gset
set st.code2 = :'code2';
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$
declare r record;
begin
  perform public.redeem_transfer_code(current_setting('st.code2'));
  select * into r from public.get_leaderboard('week', 50) where is_me;
  assert r.username = 'gabi.g' and r.minutes = 50, 'FALLO: no se sumaron los minutos: ' || row_to_json(r)::text;
  assert public.username_available('fede.f'), 'FALLO: el nombre del perfil unido no quedó libre';
  raise notice 'OK  unir dos perfiles suma los minutos (50 min para gabi.g)';
end $$;

-- ===================== Descargar y borrar =====================
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare j jsonb;
begin
  j := public.export_my_data();
  assert j->'profile'->>'username' = 'Ana_23' and jsonb_array_length(j->'sessions') = 3, 'FALLO: exportación incompleta: ' || j::text;
  assert not (j->'profile' ? 'user_id') and not (j->'profile' ? 'hidden'), 'FALLO: la exportación incluye datos internos';
  perform public.delete_my_account();
  raise notice 'OK  descargar mis datos (% sesiones) y borrarlos', jsonb_array_length(j->'sessions');
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin perform public.delete_my_account(); end $$;
reset role;
do $$
begin
  assert not exists (select 1 from private.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'FALLO: quedó el perfil de Ana';
  assert not exists (select 1 from private.study_sessions where user_id = '11111111-1111-1111-1111-111111111111'), 'FALLO: quedaron sesiones de Ana';
  assert exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'FALLO: se borró la cuenta con correo (debe quedar para recuperar la contraseña)';
  assert not exists (select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222'), 'FALLO: quedó la cuenta anónima de Beto';
  raise notice 'OK  al borrar no quedan datos del ranking (la cuenta con correo se conserva; la anónima no)';
end $$;

-- ===================== Limpieza (dueño) =====================
update private.profiles set last_active = now() - interval '100 days' where username = 'hugo.x';
do $$
declare r record;
begin
  select * into r from private.cleanup(90);
  assert not exists (select 1 from auth.users where id = '99999999-9999-9999-9999-999999999999'), 'FALLO: no borró la cuenta anónima abandonada';
  assert not exists (select 1 from auth.users where id = '88888888-8888-8888-8888-888888888888'), 'FALLO: no borró al anónimo inactivo 100 días';
  assert exists (select 1 from auth.users where id = '33333333-3333-3333-3333-333333333333'), 'FALLO: borró a alguien activo';
  assert exists (select 1 from auth.users where id = '55555555-5555-5555-5555-555555555555'), 'FALLO: borró una cuenta con correo';
  raise notice 'OK  limpieza: % cuentas anónimas abandonadas borradas', r.deleted_users;
end $$;

-- ===================== (v4.0) Cuentas en línea: guardar el progreso =====================
insert into auth.users (id, is_anonymous) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$
declare v int; r record;
begin
  select count(*) into v from public.load_progress();
  assert v = 0, 'FALLO: una cuenta nueva no debería tener progreso';
  v := public.save_progress('{"progress":{"xp":120},"profile":{"nick":"iris","photo":"data:image/png;base64,AAAA"},"account":{"hash":"secreto"}}', 0);
  assert v = 1, 'FALLO: la primera versión debe ser 1';
  select * into r from public.load_progress();
  assert (r.data->'progress'->>'xp')::int = 120 and r.version = 1, 'FALLO: no se trajo lo guardado';
  assert not (r.data->'profile' ? 'photo'), 'FALLO: la foto se guardó en el servidor';
  assert not (r.data ? 'account'), 'FALLO: la cuenta local (huella de la contraseña) se guardó en el servidor';
  v := public.save_progress('{"progress":{"xp":150}}', 1);
  assert v = 2, 'FALLO: la segunda versión debe ser 2';
  begin
    perform public.save_progress('{"progress":{"xp":10}}', 1);  -- otro equipo con una copia vieja
    raise exception 'FALLO: una copia vieja pisó a una más nueva';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_progress(jsonb_build_object('x', repeat('a', 1100000)), 2);
    raise exception 'FALLO: aceptó un guardado de más de 1 MB';
  exception when program_limit_exceeded then null;
  end;
  begin
    perform public.save_progress('[1,2,3]', 2);
    raise exception 'FALLO: aceptó algo que no es un objeto';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  cuentas en línea: guardar y traer el progreso (sin foto ni contraseña), versiones y tamaño máximo';
end $$;

-- Las cuentas anónimas (las del ranking) no guardan progreso, y sin sesión tampoco
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    perform public.save_progress('{"progress":{}}', 0);
    raise exception 'FALLO: una cuenta anónima guardó progreso';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  una cuenta anónima no puede guardar progreso';
end $$;
set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.load_progress();
    raise exception 'FALLO: un visitante sin cuenta leyó progreso';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin sesión no se puede leer ni guardar progreso';
end $$;

-- Eliminar la cuenta en línea: se va todo, también la cuenta con correo
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin perform public.set_profile('iris.v'); perform public.delete_my_cloud_account(); end $$;
reset role;
do $$
begin
  assert not exists (select 1 from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'FALLO: quedó la cuenta con correo';
  assert not exists (select 1 from private.saves where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'FALLO: quedó el progreso';
  assert not exists (select 1 from private.profiles where username = 'iris.v'), 'FALLO: quedó el perfil del ranking';
  raise notice 'OK  eliminar la cuenta en línea borra el progreso, el ranking y la cuenta';
end $$;
-- ===================== (v4.1) Reportar nombres del ranking =====================
reset role;
insert into auth.users (id, is_anonymous) values
  ('b0000000-0000-0000-0000-000000000001', false),   -- Tomi: su nombre será reportado
  ('b0000000-0000-0000-0000-000000000011', false),   -- quienes reportan
  ('b0000000-0000-0000-0000-000000000012', true),
  ('b0000000-0000-0000-0000-000000000013', false),
  ('b0000000-0000-0000-0000-000000000014', false);
-- 20 nombres más, para probar el tope diario
insert into auth.users (id, is_anonymous)
  select ('c0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, true from generate_series(1, 21) i;
insert into private.profiles (user_id, username)
  select ('c0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'relleno_' || i from generate_series(1, 21) i;

set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
do $$ begin perform public.set_profile('tomi.reportado'); end $$;
do $$
begin
  perform public.report_name('tomi.reportado', 'ofensivo');   -- reportarse a sí mismo no cuenta
  perform public.report_name('no_existe_este_nombre', 'ofensivo');   -- no dice si existe: no falla
  raise notice 'OK  reportarse a uno mismo o un nombre que no existe no da error ni revela nada';
end $$;

set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000011';
do $$
begin
  perform public.report_name('TOMI.reportado ', 'ofensivo');   -- sin importar mayúsculas ni espacios
  perform public.report_name('tomi.reportado', 'otro');        -- la segunda vez no suma
  begin
    perform public.report_name('tomi.reportado', 'me cae mal');
    raise exception 'FALLO: aceptó un motivo inventado';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  reportar: un reporte por persona y nombre, y solo motivos de la lista';
end $$;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000012';
do $$ begin perform public.report_name('tomi.reportado', 'suplantacion'); end $$;
reset role;
do $$
begin
  assert (select count(*) from private.reports r join private.profiles p on p.user_id = r.target_id where p.username = 'tomi.reportado') = 2,
    'FALLO: debían quedar 2 reportes (uno por persona, sin el de él mismo)';
  assert not (select hidden from private.profiles where username = 'tomi.reportado'), 'FALLO: se ocultó con solo 2 reportes';
  raise notice 'OK  con 2 personas el nombre sigue visible';
end $$;
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000013';
do $$ begin perform public.report_name('tomi.reportado', 'datos'); end $$;
reset role;
do $$
declare r record;
begin
  assert (select hidden from private.profiles where username = 'tomi.reportado'), 'FALLO: con 3 personas el nombre debía ocultarse';
  select * into r from private.report_summary() where username = 'tomi.reportado';
  assert r.reports = 3 and r.hidden and r.reasons like '%datos%', 'FALLO: el resumen para el dueño no cuadra';
  raise notice 'OK  con 3 personas distintas el nombre se oculta solo y el dueño lo ve en report_summary()';
end $$;

-- Lo que hiciste también sale en tu copia de datos
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000011';
do $$
declare d jsonb := public.export_my_data();
begin
  assert jsonb_array_length(d->'reports_made') = 1 and d->'reports_made'->0->>'username' = 'tomi.reportado', 'FALLO: la copia de datos no trae los reportes hechos';
  raise notice 'OK  la copia de tus datos incluye los reportes que hiciste';
end $$;

-- Tope: 20 reportes al día por persona
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000014';
do $$
declare i int;
begin
  for i in 1..20 loop perform public.report_name('relleno_' || i, 'otro'); end loop;
  begin
    perform public.report_name('relleno_21', 'otro');
    raise exception 'FALLO: dejó reportar más de 20 veces en un día';
  exception when program_limit_exceeded then null;
  end;
  raise notice 'OK  máximo 20 reportes al día por persona';
end $$;

-- Sin sesión no se puede reportar
set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.report_name('tomi.reportado', 'ofensivo');
    raise exception 'FALLO: un visitante sin sesión reportó';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin sesión no se puede reportar';
end $$;

-- Nadie lee la tabla de reportes directamente (ni con sesión)
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000011';
do $$
begin
  begin
    perform 1 from private.reports;
    raise exception 'FALLO: alguien con sesión leyó la tabla de reportes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.report_summary();
    raise exception 'FALLO: alguien con sesión usó la herramienta del dueño';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  los reportes y el resumen solo los ve el dueño';
end $$;

-- El dueño revisa: si el nombre estaba bien, lo vuelve a mostrar y se borran sus reportes
reset role;
do $$
begin
  perform private.hide_name('tomi.reportado', false);
  assert not (select hidden from private.profiles where username = 'tomi.reportado'), 'FALLO: no se volvió a mostrar';
  assert not exists (select 1 from private.report_summary() where username = 'tomi.reportado'), 'FALLO: quedaron sus reportes (se ocultaría otra vez)';
  raise notice 'OK  hide_name(nombre, false) lo vuelve a mostrar y limpia sus reportes';
end $$;

-- Borrar tu cuenta del ranking borra también los reportes que hiciste
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000014';
do $$ begin perform public.delete_my_account(); end $$;
reset role;
do $$
begin
  assert not exists (select 1 from private.reports where reporter_id = 'b0000000-0000-0000-0000-000000000014'), 'FALLO: quedaron los reportes de quien borró su cuenta';
  raise notice 'OK  al borrar tu cuenta se borran los reportes que hiciste';
end $$;

-- (v4.3) El dueño pasa un nombre atrapado en una sesión anónima a la cuenta con correo
reset role;
do $$
declare
  anon_id uuid := 'd4300000-0000-0000-0000-000000000001';
  mail_id uuid := 'd4300000-0000-0000-0000-000000000002';
  msg text;
begin
  insert into auth.users (id, email, is_anonymous) values (anon_id, null, true), (mail_id, 'sebas.prueba@ejemplo.com', false);
  insert into private.profiles (user_id, username) values (anon_id, 'sebas.atrapado');
  insert into private.daily_totals (user_id, day, credited_sec, sessions) values (anon_id, current_date, 1800, 1);
  assert (select anonymous from private.who_has_name('SEBAS.atrapado')), 'FALLO: who_has_name no dice que es anónima';
  msg := private.move_name('sebas.atrapado', 'Sebas.Prueba@ejemplo.com');
  assert (select user_id from private.profiles where username = 'sebas.atrapado') = mail_id, 'FALLO: el nombre no pasó a la cuenta con correo';
  assert (select credited_sec from private.daily_totals where user_id = mail_id and day = current_date) = 1800, 'FALLO: se perdieron los minutos';
  assert not exists (select 1 from auth.users where id = anon_id), 'FALLO: quedó la sesión anónima';
  assert msg like 'Listo:%', 'FALLO: mensaje inesperado';
  assert private.move_name('sebas.atrapado', 'sebas.prueba@ejemplo.com') like '%no hubo que mover%', 'FALLO: mover dos veces';
  raise notice 'OK  move_name pasa un nombre de una sesión anónima a la cuenta con correo (con sus minutos)';
end $$;

-- Si la cuenta con correo ya tenía otro nombre, se queda con el que se pasa y se suman los minutos
do $$
declare
  anon_id uuid := 'd4300000-0000-0000-0000-000000000003';
  mail_id uuid := 'd4300000-0000-0000-0000-000000000004';
begin
  insert into auth.users (id, email, is_anonymous) values (anon_id, null, true), (mail_id, 'otra.prueba@ejemplo.com', false);
  insert into private.profiles (user_id, username) values (anon_id, 'nombre.viejo'), (mail_id, 'nombre.nuevo');
  insert into private.daily_totals (user_id, day, credited_sec, sessions) values (anon_id, current_date, 600, 1), (mail_id, current_date, 900, 1);
  perform private.move_name('nombre.viejo', 'otra.prueba@ejemplo.com');
  assert (select username from private.profiles where user_id = mail_id) = 'nombre.viejo', 'FALLO: no quedó el nombre pedido';
  assert not exists (select 1 from private.profiles where username = 'nombre.nuevo'), 'FALLO: quedó el otro nombre';
  assert (select credited_sec from private.daily_totals where user_id = mail_id and day = current_date) = 1500, 'FALLO: no se sumaron los minutos';
  raise notice 'OK  move_name con dos perfiles: se queda el nombre pedido y se suman los minutos';
end $$;

-- (v4.3) ranking_check: qué pasó con los pomodoros de alguien, en palabras simples
do $$
declare
  uid uuid := 'd4300000-0000-0000-0000-000000000005';
  r   record;
begin
  insert into auth.users (id, email, is_anonymous) values (uid, 'revisar.prueba@ejemplo.com', false);
  insert into private.profiles (user_id, username) values (uid, 'amigo.revisar');
  insert into private.study_sessions (user_id, planned_sec, started_at, finished_at, credited_sec, status) values
    (uid, 1500, now() - interval '3 hours', now() - interval '150 minutes', 1500, 'done'),
    (uid, 1500, now() - interval '2 hours', now() - interval '119 minutes', 0, 'abandoned'),
    (uid, 1500, now() - interval '90 minutes', null, 0, 'active');
  assert (select count(*) from private.ranking_check('AMIGO.revisar')) = 5, 'FALLO: ranking_check no muestra perfil, semana y 3 pomodoros';
  select * into r from private.ranking_check('amigo.revisar') limit 1;
  assert r.que_paso like 'Aparece en el ranking · cuenta con correo%', 'FALLO: ranking_check no describe el perfil: ' || r.que_paso;
  assert exists (select 1 from private.ranking_check('amigo.revisar') where que_paso = 'Contó' and minutos = 25), 'FALLO: no muestra el pomodoro que contó';
  assert exists (select 1 from private.ranking_check('amigo.revisar') where que_paso like 'No contó: duró menos%'), 'FALLO: no explica el pomodoro corto';
  assert exists (select 1 from private.ranking_check('amigo.revisar') where que_paso like 'Empezó, pero la app nunca%'), 'FALLO: no explica el que nunca terminó';
  assert (select que_paso from private.ranking_check('nadie.asi') limit 1) like 'No hay nadie%', 'FALLO: nombre que no existe';
  raise notice 'OK  ranking_check explica qué pasó con los pomodoros de alguien';
end $$;

-- Nadie con sesión puede usar estas herramientas
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000011';
do $$
begin
  begin
    perform private.move_name('nombre.viejo', 'x@ejemplo.com');
    raise exception 'FALLO: alguien con sesión movió un nombre';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from private.ranking_check('amigo.revisar');
    raise exception 'FALLO: alguien con sesión revisó los pomodoros de otro';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  move_name, who_has_name y ranking_check solo los usa el dueño';
end $$;
reset role;

-- ===================== (v4.5) El reloj en vivo en todos tus aparatos =====================
insert into auth.users (id, is_anonymous) values
  ('d5000000-0000-0000-0000-000000000001', false),
  ('d5000000-0000-0000-0000-000000000002', false),
  ('d5000000-0000-0000-0000-000000000003', true);
set role authenticated;
set request.jwt.claim.sub = 'd5000000-0000-0000-0000-000000000001';
do $$
declare r record; t0 timestamptz := now();
begin
  select * into r from public.get_timer();
  assert r.version = 0 and r.state is null, 'FALLO: una cuenta nueva no debería tener reloj';
  assert r.progress_version = 0, 'FALLO: una cuenta sin progreso debería decir versión 0';
  perform public.save_progress('{"progress":{"xp":1}}'::jsonb, 0);
  assert (select g.progress_version from public.get_timer() g) = 1, 'FALLO: get_timer no dice la versión del progreso';
  assert abs(extract(epoch from (r.server_now - clock_timestamp()))) < 5, 'FALLO: get_timer no devuelve la hora del servidor';
  select * into r from public.set_timer('{"mode":"study","status":"running","durationSec":1500,"block":"blk-0000-aaaa"}', t0 - interval '10 minutes', 'pc-1234');
  assert r.accepted and r.version = 1 and r.device = 'pc-1234', 'FALLO: no se guardó la primera acción';
  -- El celular pausa después: gana
  select * into r from public.set_timer('{"mode":"study","status":"paused","durationSec":1500,"block":"blk-0000-aaaa"}', t0 - interval '5 minutes', 'cel-5678');
  assert r.accepted and r.version = 2 and r.state->>'status' = 'paused', 'FALLO: la acción más nueva no ganó';
  -- Una acción vieja (de un aparato que estaba sin internet) no pisa la nueva: devuelve lo más nuevo
  select * into r from public.set_timer('{"mode":"break","status":"idle","durationSec":300}', t0 - interval '7 minutes', 'pc-1234');
  assert not r.accepted and r.version = 2 and r.state->>'status' = 'paused', 'FALLO: una acción vieja pisó a una nueva';
  -- El mismo aparato puede reenviar su acción (con el número del ranking, que llega un momento después)
  select * into r from public.set_timer('{"mode":"study","status":"paused","durationSec":1500,"block":"blk-0000-aaaa","rank":"x"}', t0 - interval '5 minutes', 'cel-5678');
  assert r.accepted and r.version = 3 and r.state->>'rank' = 'x', 'FALLO: el mismo aparato no pudo completar su acción';
  select * into r from public.set_timer('{"mode":"study","status":"running","durationSec":1500}', t0 - interval '5 minutes', 'otro-9999');
  assert not r.accepted, 'FALLO: otro aparato con la misma hora ganó';
  -- Una hora en el futuro se ajusta a la del servidor (nadie puede "congelar" el reloj de los demás)
  select * into r from public.set_timer('{"mode":"study","status":"idle","durationSec":1500}', t0 + interval '3 hours', 'pc-1234');
  assert r.accepted and r.action_at <= clock_timestamp(), 'FALLO: aceptó una hora en el futuro';
  raise notice 'OK  reloj en vivo: gana la última acción, una vieja no pisa la nueva y el futuro se ajusta';
end $$;

do $$
declare bad jsonb;
begin
  foreach bad in array array['[1]'::jsonb, '{"mode":"dormir","status":"idle","durationSec":1500}',
      '{"mode":"study","status":"idle","durationSec":5}', '{"mode":"study","status":"idle","durationSec":"1500"}',
      '{"mode":"study","status":"idle","durationSec":1500,"block":"<script>"}',
      jsonb_build_object('mode', 'study', 'status', 'idle', 'durationSec', 1500, 'x', repeat('a', 3000))] loop
    begin
      perform public.set_timer(bad, now(), 'pc-1234');
      raise exception 'FALLO: aceptó un estado raro: %', left(bad::text, 60);
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.set_timer('{"mode":"study","status":"idle","durationSec":1500}', now(), 'a b');
    raise exception 'FALLO: aceptó un aparato con un nombre raro';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  reloj en vivo: rechaza estados raros, enormes o de un aparato inválido';
end $$;

reset role;
update private.timers set window_start = now(), window_count = 0 where user_id = 'd5000000-0000-0000-0000-000000000001';
set role authenticated;
do $$
declare i int; n int := 0;
begin
  for i in 1..40 loop
    begin
      perform public.set_timer('{"mode":"study","status":"idle","durationSec":1500}', now(), 'pc-1234');
      n := n + 1;
    exception when program_limit_exceeded then exit;
    end;
  end loop;
  assert n = 30, 'FALLO: el límite debería ser 30 cambios por minuto y fue ' || n;
  raise notice 'OK  reloj en vivo: máximo 30 cambios por minuto por persona';
end $$;

do $$
begin
  assert public.claim_block('blk-0000-aaaa', 'pc-1234'), 'FALLO: el primer aparato no pudo guardar el pomodoro';
  assert not public.claim_block('blk-0000-aaaa', 'cel-5678'), 'FALLO: el mismo pomodoro se guardó dos veces';
  assert public.claim_block('blk-0000-aaaa', 'pc-1234'), 'FALLO: el mismo aparato, al reintentar, perdió su pomodoro';
  assert not public.claim_block('blk-0000-aaaa'), 'FALLO: sin decir el aparato, un pomodoro ya guardado volvió a guardarse';
  assert public.claim_block('blk-0000-bbbb', 'cel-5678'), 'FALLO: otro pomodoro no se pudo guardar';
  begin
    perform public.claim_block('x', 'pc-1234');
    raise exception 'FALLO: aceptó un pomodoro con un número raro';
  exception when invalid_parameter_value then null;
  end;
  assert public.export_my_data()->'timer'->>'device' = 'pc-1234', 'FALLO: la copia de tus datos no trae el reloj';
  begin
    perform 1 from private.timers;
    raise exception 'FALLO: alguien con sesión leyó la tabla del reloj';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  claim_block: cada pomodoro se guarda una sola vez (el mismo aparato puede reintentar)';
end $$;

-- Cada persona tiene su propio reloj y sus propios pomodoros guardados
set request.jwt.claim.sub = 'd5000000-0000-0000-0000-000000000002';
do $$
begin
  assert public.claim_block('blk-0000-aaaa', 'pc-1234'), 'FALLO: los pomodoros de otra persona chocaron con los tuyos';
  assert (select r.version from public.get_timer() r) = 0, 'FALLO: se ve el reloj de otra persona';
  raise notice 'OK  el reloj y los pomodoros guardados son de cada persona';
end $$;

-- Solo cuentas con correo (las anónimas del ranking no), y sin sesión nada
set request.jwt.claim.sub = 'd5000000-0000-0000-0000-000000000003';
do $$
begin
  begin
    perform public.get_timer();
    raise exception 'FALLO: una cuenta anónima usó el reloj en vivo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_block('blk-0000-cccc', 'pc-1234');
    raise exception 'FALLO: una cuenta anónima guardó un pomodoro compartido';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  el reloj en vivo es solo para cuentas con correo';
end $$;
set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.set_timer('{"mode":"study","status":"idle","durationSec":1500}', now(), 'pc-1234');
    raise exception 'FALLO: sin sesión se cambió un reloj';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin sesión no hay reloj en vivo';
end $$;

-- La limpieza borra los pomodoros anotados de hace más de 3 días, y eliminar la cuenta borra todo
reset role;
insert into private.timer_claims (user_id, block, device, claimed_at)
values ('d5000000-0000-0000-0000-000000000002', 'blk-viejo-0001', 'pc-1234', now() - interval '4 days');
do $$ begin perform private.cleanup(90); end $$;
do $$
begin
  assert not exists (select 1 from private.timer_claims where block = 'blk-viejo-0001'), 'FALLO: la limpieza no borró un pomodoro anotado viejo';
  assert exists (select 1 from private.timer_claims where user_id = 'd5000000-0000-0000-0000-000000000002'), 'FALLO: la limpieza borró uno reciente';
  raise notice 'OK  limpieza: los pomodoros anotados se guardan solo 3 días';
end $$;
set role authenticated;
set request.jwt.claim.sub = 'd5000000-0000-0000-0000-000000000001';
do $$ begin perform public.delete_my_cloud_account(); end $$;
reset role;
do $$
begin
  assert not exists (select 1 from private.timers where user_id = 'd5000000-0000-0000-0000-000000000001'), 'FALLO: quedó el reloj de una cuenta eliminada';
  assert not exists (select 1 from private.timer_claims where user_id = 'd5000000-0000-0000-0000-000000000001'), 'FALLO: quedaron sus pomodoros anotados';
  raise notice 'OK  eliminar la cuenta en línea borra también el reloj en vivo';
end $$;
\echo 'Todas las pruebas del servidor pasaron.'
