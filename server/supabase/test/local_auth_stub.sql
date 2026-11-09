-- SOLO PARA PROBAR EN UN POSTGRESQL LOCAL. NO lo ejecutes en Supabase:
-- Supabase ya trae los roles anon/authenticated, el esquema auth y auth.uid().
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
-- Como en Supabase: las cuentas anónimas tienen is_anonymous = true.
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false, created_at timestamptz not null default now());
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
