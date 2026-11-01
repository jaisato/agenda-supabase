-- Esquema base de la agenda: tablas, funciones, triggers, RLS, políticas y privilegios (§5.1 a §5.4
-- del diseño). Lo que hacen las políticas de cada tabla se prueba en los ficheros siguientes
-- (02_contactos.sql, …); aquí solo se comprueba que la RLS está activada, qué políticas hay y a qué
-- rol se aplican, y que la RLS aísla a un usuario de los contactos de otro.
--
-- Todas las aserciones llevan descripción. Sin ella, pgTAP lee has_table('public', 'perfiles')
-- como (tabla, descripción) y busca una tabla llamada «public».
begin;
-- Silencia el NOTICE de que la extensión pgtap ya existe.
set client_min_messages to warning;
create extension if not exists pgtap with schema extensions;
select plan(80);

-- Tipo, tablas y funciones
select has_schema('privado', 'existe el esquema privado');
select has_table('public', 'perfiles', 'existe la tabla perfiles');
select has_table('public', 'contactos', 'existe la tabla contactos');
select has_table('public', 'contactos_compartidos', 'existe la tabla contactos_compartidos');
select has_table('public', 'invitaciones_contacto', 'existe la tabla invitaciones_contacto');
select has_type('public', 'resultado_compartir', 'existe el tipo resultado_compartir');
select has_enum('public', 'rol_comparticion', 'existe el enum rol_comparticion');
select enum_has_labels('public', 'rol_comparticion', array['lector', 'editor'],
  'rol_comparticion tiene los valores lector y editor');
select has_enum('public', 'estado_comparticion', 'existe el enum estado_comparticion');
select enum_has_labels('public', 'estado_comparticion', array['pendiente', 'aceptada'],
  'estado_comparticion tiene los valores pendiente y aceptada');

select has_function('privado', 'es_propietario', array['uuid'],
  'existe privado.es_propietario(uuid)');
select has_function('privado', 'rol_compartido', array['uuid'],
  'existe privado.rol_compartido(uuid)');
select has_function('privado', 'es_contraparte', array['uuid'],
  'existe privado.es_contraparte(uuid)');
select has_function('privado', 'crear_perfil', 'existe privado.crear_perfil');
select has_function('privado', 'marcar_actualizado', 'existe privado.marcar_actualizado');
select has_function('privado', 'recortar_contacto', 'existe privado.recortar_contacto');
select has_function('privado', 'guardar_comparticion', 'existe privado.guardar_comparticion');
select has_function('privado', 'guardar_avatar', 'existe privado.guardar_avatar');
select has_function('public', 'invitaciones_pendientes', 'existe public.invitaciones_pendientes');
select has_trigger('public', 'contactos', 'marcar_actualizado',
  'contactos tiene el trigger marcar_actualizado');
select has_trigger('public', 'contactos', 'recortar_contacto',
  'contactos tiene el trigger recortar_contacto');
select has_trigger('public', 'contactos_compartidos', 'guardar_comparticion',
  'contactos_compartidos tiene el trigger guardar_comparticion');
select has_trigger('public', 'perfiles', 'guardar_avatar',
  'perfiles tiene el trigger guardar_avatar');

-- RLS activada en las tres tablas
select is((select relrowsecurity from pg_class where oid = 'public.perfiles'::regclass), true,
  'RLS activada en perfiles');
select is((select relrowsecurity from pg_class where oid = 'public.contactos'::regclass), true,
  'RLS activada en contactos');
select is((select relrowsecurity from pg_class where oid = 'public.contactos_compartidos'::regclass),
  true, 'RLS activada en contactos_compartidos');
select is((select relrowsecurity from pg_class where oid = 'public.invitaciones_contacto'::regclass),
  true, 'RLS activada en invitaciones_contacto');

-- Políticas (§5.4). Lo que hacen se prueba en los ficheros siguientes; aquí se fija cuáles hay y a
-- quién se aplican, para que no entre una política de más, ni una que valga para otro rol que
-- authenticated, sin que falle un test.
select policies_are('public', 'perfiles',
  array['perfiles: ver el propio y las contrapartes', 'perfiles: editar el propio'],
  'perfiles tiene exactamente sus dos políticas');
select policies_are('public', 'contactos',
  array['contactos: ver propios y compartidos', 'contactos: crear propios',
        'contactos: editar el dueño o un editor', 'contactos: borrar el dueño'],
  'contactos tiene exactamente sus cuatro políticas');
select policies_are('public', 'contactos_compartidos',
  array['compartidos: ver el compartido o el dueño', 'compartidos: cambiar rol el dueño',
        'compartidos: aceptar el destinatario', 'compartidos: revocar el dueño o dejar de ver'],
  'contactos_compartidos tiene exactamente sus cuatro políticas');
select policies_are('public', 'invitaciones_contacto',
  array['invitaciones: las ve el propietario', 'invitaciones: las borra el propietario'],
  'invitaciones_contacto tiene exactamente sus dos políticas');

select policy_roles_are('public', 'perfiles', 'perfiles: ver el propio y las contrapartes',
  array['authenticated'], '«perfiles: ver el propio y las contrapartes» es solo de authenticated');
select policy_roles_are('public', 'perfiles', 'perfiles: editar el propio',
  array['authenticated'], '«perfiles: editar el propio» es solo de authenticated');
select policy_roles_are('public', 'contactos', 'contactos: ver propios y compartidos',
  array['authenticated'], '«contactos: ver propios y compartidos» es solo de authenticated');
select policy_roles_are('public', 'contactos', 'contactos: crear propios',
  array['authenticated'], '«contactos: crear propios» es solo de authenticated');
select policy_roles_are('public', 'contactos', 'contactos: editar el dueño o un editor',
  array['authenticated'], '«contactos: editar el dueño o un editor» es solo de authenticated');
select policy_roles_are('public', 'contactos', 'contactos: borrar el dueño',
  array['authenticated'], '«contactos: borrar el dueño» es solo de authenticated');
select policy_roles_are('public', 'contactos_compartidos',
  'compartidos: ver el compartido o el dueño', array['authenticated'],
  '«compartidos: ver el compartido o el dueño» es solo de authenticated');
select policy_roles_are('public', 'contactos_compartidos', 'compartidos: cambiar rol el dueño',
  array['authenticated'], '«compartidos: cambiar rol el dueño» es solo de authenticated');
select policy_roles_are('public', 'contactos_compartidos', 'compartidos: aceptar el destinatario',
  array['authenticated'], '«compartidos: aceptar el destinatario» es solo de authenticated');
select policy_roles_are('public', 'contactos_compartidos',
  'compartidos: revocar el dueño o dejar de ver', array['authenticated'],
  '«compartidos: revocar el dueño o dejar de ver» es solo de authenticated');
select policy_roles_are('public', 'invitaciones_contacto', 'invitaciones: las ve el propietario',
  array['authenticated'], '«invitaciones: las ve el propietario» es solo de authenticated');
select policy_roles_are('public', 'invitaciones_contacto', 'invitaciones: las borra el propietario',
  array['authenticated'], '«invitaciones: las borra el propietario» es solo de authenticated');

-- Privilegios (§5.3). column_privs_are cuenta también los privilegios de tabla, así que SELECT
-- aparece en todas las columnas; lo que se comprueba es que INSERT y UPDATE solo estén donde toca.
select table_privs_are('public', 'perfiles', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre perfiles');
select table_privs_are('public', 'contactos', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre contactos');
select table_privs_are('public', 'contactos_compartidos', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre contactos_compartidos');
select table_privs_are('public', 'invitaciones_contacto', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre invitaciones_contacto');
select column_privs_are('public', 'perfiles', 'email', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre perfiles.email');

select table_privs_are('public', 'contactos', 'authenticated', array['SELECT', 'DELETE'],
  'authenticated lee y borra contactos');
select column_privs_are('public', 'contactos', 'nombre', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated inserta y actualiza contactos.nombre');
select column_privs_are('public', 'contactos', 'propietario_id', 'authenticated',
  array['SELECT'], 'authenticated no inserta ni actualiza contactos.propietario_id');
select column_privs_are('public', 'contactos', 'id', 'authenticated',
  array['SELECT'], 'authenticated no inserta ni actualiza contactos.id');

select table_privs_are('public', 'contactos_compartidos', 'authenticated',
  array['SELECT', 'DELETE'], 'authenticated lee y borra contactos_compartidos, sin insertar');
select table_privs_are('public', 'invitaciones_contacto', 'authenticated',
  array['SELECT', 'DELETE'], 'authenticated lee y borra invitaciones_contacto, sin insertar');
select column_privs_are('public', 'contactos_compartidos', 'rol', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza contactos_compartidos.rol');
select column_privs_are('public', 'contactos_compartidos', 'estado', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza contactos_compartidos.estado');

select table_privs_are('public', 'perfiles', 'authenticated', array['SELECT'],
  'authenticated solo lee perfiles a nivel de tabla');
select column_privs_are('public', 'perfiles', 'nombre', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza perfiles.nombre');
select column_privs_are('public', 'perfiles', 'email', 'authenticated',
  array['SELECT'], 'authenticated no actualiza perfiles.email');
select column_privs_are('public', 'perfiles', 'avatar_ruta', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza perfiles.avatar_ruta');

-- EXECUTE de las funciones de privado (§5.2). Postgres lo concede a public por defecto y la migración
-- lo revoca; function_privs_are cuenta también lo heredado de public, así que «anon sin privilegios»
-- comprueba que public ya no ejecuta las funciones. Las tres de las políticas las ejecuta
-- authenticated; las dos de trigger no las ejecuta ni anon ni authenticated (solo conserva el
-- EXECUTE su propietario, postgres) y no les hace falta, porque Postgres comprueba EXECUTE al
-- crear el trigger y no al dispararlo.
select function_privs_are('privado', 'es_propietario', array['uuid'], 'anon', '{}'::text[],
  'anon no ejecuta privado.es_propietario(uuid)');
select function_privs_are('privado', 'rol_compartido', array['uuid'], 'anon', '{}'::text[],
  'anon no ejecuta privado.rol_compartido(uuid)');
select function_privs_are('privado', 'es_contraparte', array['uuid'], 'anon', '{}'::text[],
  'anon no ejecuta privado.es_contraparte(uuid)');
select function_privs_are('privado', 'es_propietario', array['uuid'], 'authenticated',
  array['EXECUTE'], 'authenticated ejecuta privado.es_propietario(uuid)');
select function_privs_are('privado', 'rol_compartido', array['uuid'], 'authenticated',
  array['EXECUTE'], 'authenticated ejecuta privado.rol_compartido(uuid)');
select function_privs_are('privado', 'es_contraparte', array['uuid'], 'authenticated',
  array['EXECUTE'], 'authenticated ejecuta privado.es_contraparte(uuid)');
select function_privs_are('privado', 'crear_perfil', '{}'::name[], 'authenticated', '{}'::text[],
  'authenticated no ejecuta privado.crear_perfil()');
select function_privs_are('privado', 'marcar_actualizado', '{}'::name[], 'authenticated',
  '{}'::text[], 'authenticated no ejecuta privado.marcar_actualizado()');
select function_privs_are('privado', 'recortar_contacto', '{}'::name[], 'authenticated',
  '{}'::text[], 'authenticated no ejecuta privado.recortar_contacto()');
select function_privs_are('privado', 'guardar_comparticion', '{}'::name[], 'authenticated',
  '{}'::text[], 'authenticated no ejecuta privado.guardar_comparticion()');
select function_privs_are('public', 'invitaciones_pendientes', '{}'::name[], 'anon', '{}'::text[],
  'anon no ejecuta public.invitaciones_pendientes()');
select function_privs_are('public', 'invitaciones_pendientes', '{}'::name[], 'authenticated',
  array['EXECUTE'], 'authenticated ejecuta public.invitaciones_pendientes()');

-- Ninguna función de privado, presente o futura, conserva el EXECUTE de public. Un alter default
-- privileges in schema privado no lo evita (ver la migración): esta aserción es la red de seguridad,
-- y una función nueva sin su revoke la hace fallar.
select is_empty(
  $$select p.oid::regprocedure::text
    from pg_proc p
    where p.pronamespace = 'privado'::regnamespace
      and exists (select 1
                  from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')$$,
  'ninguna función de privado es ejecutable por public');

-- invitaciones_contacto no se publica: Realtime no aplica RLS a los DELETE y difundiría el email
-- invitado (está en la clave primaria) a cualquier suscriptor.
select is(
  (select array_agg(tablename order by tablename)
     from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['contactos', 'contactos_compartidos']::name[],
  'Realtime publica contactos y comparticiones, no las invitaciones por email');

-- crear_perfil se dispara al crear el usuario y al cambiar email o email_confirmed_at: el canje de
-- las invitaciones espera a la confirmación (lo prueba 03_compartir.sql).
select is(
  (select string_agg(a.attname::text, ',' order by a.attname)
     from pg_trigger t
     join pg_attribute a
       on a.attrelid = t.tgrelid
      and a.attnum = any (string_to_array(t.tgattr::text, ' ')::int2[])
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'crear_perfil'),
  'email,email_confirmed_at',
  'crear_perfil se dispara al cambiar email y email_confirmed_at de auth.users');

-- El trigger crear_perfil copia el usuario nuevo de auth.users a perfiles
select pruebas.crear_usuario('a@test.local');
select results_eq(
  $$select email from public.perfiles where id = pruebas.id_usuario('a@test.local')$$,
  $$values ('a@test.local')$$, 'crear_perfil crea el perfil al crear el usuario');

-- La RLS de contactos aísla a los usuarios: A no ve el contacto de B. La fila existe: la inserta
-- postgres, que es el dueño de la tabla y no pasa por RLS.
select pruebas.crear_usuario('b@test.local');
insert into public.contactos (propietario_id, nombre)
values (pruebas.id_usuario('b@test.local'), 'Contacto de B');
select pruebas.autenticar('a@test.local');
select is(current_user::text, 'authenticated', 'pruebas.autenticar cambia el rol a authenticated');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'A no ve el contacto de B');

-- Los helpers cambian de usuario sin necesidad de volver antes a postgres
select pruebas.anonimo();
select is(current_user::text, 'anon', 'pruebas.anonimo cambia el rol desde authenticated');
select pruebas.autenticar('a@test.local');
select is(current_user::text, 'authenticated', 'pruebas.autenticar cambia el rol desde anon');

reset role;
select * from finish();
rollback;
