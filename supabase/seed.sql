-- Datos de arranque solo para desarrollo local: `supabase db reset` los carga tras las
-- migraciones. Este fichero nunca se despliega (`supabase db push` no lo ejecuta).

-- Helpers para los tests de pgTAP (supabase/tests): crean usuarios y cambian de identidad dentro
-- de la transacción de un test. `auth.uid()` lee las claims del JWT que fijan estas funciones.
create schema if not exists pruebas;

-- Crea un usuario confirmado en auth.users (el trigger privado.crear_perfil crea su perfil) y
-- devuelve su id.
create or replace function pruebas.crear_usuario(p_email text) returns uuid
language sql security definer set search_path = '' as $$
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', p_email, now(), '{"provider":"email","providers":["email"]}', '{}',
          now(), now())
  returning id;
$$;

-- Devuelve el id de un usuario por email. Es security definer porque anon y authenticated no
-- pueden leer auth.users, y así `autenticar` funciona sin volver antes a postgres.
create or replace function pruebas.id_usuario(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = p_email;
$$;

-- Actúa como p_email hasta el fin de la transacción: fija las claims del JWT y el rol
-- authenticated. No puede ser security definer: Postgres prohíbe cambiar `role` dentro de ellas.
create or replace function pruebas.autenticar(p_email text) returns void
language plpgsql set search_path = '' as $$
declare
  v_id uuid := pruebas.id_usuario(p_email);
begin
  if v_id is null then
    raise exception 'pruebas.autenticar: no existe el usuario %', p_email;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Actúa como un visitante sin sesión: sin claims y con el rol anon.
create or replace function pruebas.anonimo() returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

-- Un test cambia de usuario sin `reset role` previo, así que anon y authenticated deben poder
-- usar el esquema y ejecutar los helpers.
grant usage on schema pruebas to authenticated, anon;
grant execute on function pruebas.crear_usuario(text), pruebas.id_usuario(text),
  pruebas.autenticar(text), pruebas.anonimo() to authenticated, anon;
