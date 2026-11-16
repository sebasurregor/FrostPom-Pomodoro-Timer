-- SOLO PARA PROBAR EN UN POSTGRESQL LOCAL. NO lo ejecutes en Supabase:
-- Supabase ya trae los roles anon/authenticated, el esquema auth y auth.uid().
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  -- (v4.7.0) El rol de la clave secreta (lo usan las Edge Functions)
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
-- Como en Supabase: las cuentas anónimas tienen is_anonymous = true.
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- (v4.5.1) Lo mínimo de Supabase Realtime: realtime.send() anota el aviso en realtime.messages y
-- realtime.topic() dice el canal (en Supabase lo pone el servidor de Realtime al revisar la política).
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text not null, extension text not null,
  payload jsonb, event text, private boolean default false, inserted_at timestamptz not null default now());
create function realtime.topic() returns text
language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$;
alter table realtime.messages enable row level security; -- como en Supabase
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to authenticated;
grant execute on function realtime.topic() to anon, authenticated;
