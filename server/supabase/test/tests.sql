-- Pruebas del servidor del ranking. Se ejecutan con server/supabase/test/run_local.sh
-- Cada bloque falla con un mensaje claro si algo no se cumple.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on

-- Dos usuarios de prueba (Ana y Beto) y una tercera que nunca aparece en el ranking (Caro).
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

-- ===================== Ana =====================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare r record;
begin
  select * into r from public.set_profile(0, 1, 0, true);
  assert r.nickname ~ '^PingüinoBrillante[0-9]{2}$', 'el apodo lo arma el servidor: ' || r.nickname;
  assert r.show_on_board, 'Ana aceptó aparecer en el ranking';
  begin
    perform public.set_profile(99, 0, 0, true);
    raise exception 'FALLO: aceptó un índice de apodo inválido';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  perfil: apodo generado por el servidor (%)', r.nickname;
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
  select * into r from public.finish_session(current_setting('st.sid')::uuid, 1500);
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
  raise notice 'OK  las tablas no se pueden leer ni escribir directamente';
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
declare r record;
begin
  perform public.set_profile(5, 3, 5, true);
  -- Beto no puede terminar la sesión de Ana.
  begin
    perform public.finish_session(current_setting('st.sid2')::uuid, 60);
    raise exception 'FALLO: Beto terminó una sesión ajena';
  exception when no_data_found then null;
  end;
  raise notice 'OK  nadie puede tocar sesiones de otra persona';
end $$;

-- ===================== Caro (no acepta aparecer) =====================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare n int; cols text;
begin
  perform public.set_profile(2, 2, 2, false);
  select count(*) into n from public.get_leaderboard('week', 50) where is_me;
  assert n = 0, 'FALLO: Caro aparece sin haber aceptado';
  select count(*) into n from public.get_leaderboard('all', 50);
  assert n = 2, 'FALLO: el ranking debería tener 2 personas, tiene ' || n;
  raise notice 'OK  ranking: solo aparecen quienes aceptaron (Ana y Beto)';
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

-- ===================== Sin sesión (anon) =====================
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.get_leaderboard('week', 10);
    raise exception 'FALLO: un visitante sin cuenta pudo ver el ranking';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin iniciar sesión no se puede llamar ninguna función';
end $$;

-- ===================== Exportar y borrar (Ana) =====================
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare j jsonb;
begin
  j := public.export_my_data();
  assert j->'profile'->>'nickname' is not null and jsonb_array_length(j->'sessions') = 3, 'FALLO: exportación incompleta';
  assert not (j->'profile' ? 'user_id'), 'FALLO: la exportación incluye user_id';
  perform public.delete_my_account();
  raise notice 'OK  exportar mis datos (% sesiones) y borrar mi cuenta', jsonb_array_length(j->'sessions');
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from private.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'FALLO: quedó el perfil';
  assert not exists (select 1 from private.study_sessions where user_id = '11111111-1111-1111-1111-111111111111'), 'FALLO: quedaron sesiones';
  assert not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'FALLO: quedó la cuenta';
  raise notice 'OK  al borrar la cuenta no queda nada de Ana';
end $$;
\echo 'Todas las pruebas del servidor pasaron.'
