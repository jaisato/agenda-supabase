-- Esquema base de la agenda: tablas, funciones, triggers, RLS y privilegios (§5.1 a §5.3 del
-- diseño). Las políticas llegan en tareas posteriores: con RLS activada y sin políticas,
-- authenticated no ve ninguna fila.
--
-- Todas las aserciones llevan descripción. Sin ella, pgTAP lee has_table('public', 'perfiles')
-- como (tabla, descripción) y busca una tabla llamada «public».
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Tipo, tablas y funciones
select has_schema('privado', 'existe el esquema privado');
select has_table('public', 'perfiles', 'existe la tabla perfiles');
select has_table('public', 'contactos', 'existe la tabla contactos');
select has_table('public', 'contactos_compartidos', 'existe la tabla contactos_compartidos');
select has_enum('public', 'rol_comparticion', 'existe el enum rol_comparticion');
select enum_has_labels('public', 'rol_comparticion', array['lector', 'editor'],
  'rol_comparticion tiene los valores lector y editor');

select has_function('privado', 'es_propietario', array['uuid'],
  'existe privado.es_propietario(uuid)');
select has_function('privado', 'rol_compartido', array['uuid'],
  'existe privado.rol_compartido(uuid)');
select has_function('privado', 'es_contraparte', array['uuid'],
  'existe privado.es_contraparte(uuid)');
select has_function('privado', 'crear_perfil', 'existe privado.crear_perfil');
select has_function('privado', 'marcar_actualizado', 'existe privado.marcar_actualizado');
select has_trigger('public', 'contactos', 'marcar_actualizado',
  'contactos tiene el trigger marcar_actualizado');

-- RLS activada en las tres tablas
select is((select relrowsecurity from pg_class where oid = 'public.perfiles'::regclass), true,
  'RLS activada en perfiles');
select is((select relrowsecurity from pg_class where oid = 'public.contactos'::regclass), true,
  'RLS activada en contactos');
select is((select relrowsecurity from pg_class where oid = 'public.contactos_compartidos'::regclass),
  true, 'RLS activada en contactos_compartidos');

-- Privilegios (§5.3). column_privs_are cuenta también los privilegios de tabla, así que SELECT
-- aparece en todas las columnas; lo que se comprueba es que INSERT y UPDATE solo estén donde toca.
select table_privs_are('public', 'perfiles', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre perfiles');
select table_privs_are('public', 'contactos', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre contactos');
select table_privs_are('public', 'contactos_compartidos', 'anon', '{}'::text[],
  'anon no tiene privilegios sobre contactos_compartidos');

select table_privs_are('public', 'contactos', 'authenticated', array['SELECT', 'DELETE'],
  'authenticated lee y borra contactos');
select column_privs_are('public', 'contactos', 'nombre', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated inserta y actualiza contactos.nombre');
select column_privs_are('public', 'contactos', 'propietario_id', 'authenticated',
  array['SELECT'], 'authenticated no inserta ni actualiza contactos.propietario_id');

select table_privs_are('public', 'contactos_compartidos', 'authenticated',
  array['SELECT', 'DELETE'], 'authenticated lee y borra contactos_compartidos, sin insertar');
select column_privs_are('public', 'contactos_compartidos', 'rol', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza contactos_compartidos.rol');

select table_privs_are('public', 'perfiles', 'authenticated', array['SELECT'],
  'authenticated solo lee perfiles a nivel de tabla');
select column_privs_are('public', 'perfiles', 'nombre', 'authenticated',
  array['SELECT', 'UPDATE'], 'authenticated actualiza perfiles.nombre');
select column_privs_are('public', 'perfiles', 'email', 'authenticated',
  array['SELECT'], 'authenticated no actualiza perfiles.email');

-- El trigger crear_perfil copia el usuario nuevo de auth.users a perfiles
select pruebas.crear_usuario('a@test.local');
select results_eq($$select email from public.perfiles$$, $$values ('a@test.local')$$,
  'crear_perfil crea el perfil al crear el usuario');

-- Sin políticas, authenticated no ve nada, ni siquiera sus propias filas. La fila existe: la
-- inserta postgres, que es el dueño de la tabla y no pasa por RLS.
insert into public.contactos (propietario_id, nombre)
values (pruebas.id_usuario('a@test.local'), 'Contacto oculto');
select pruebas.autenticar('a@test.local');
select is(current_user::text, 'authenticated', 'pruebas.autenticar cambia el rol a authenticated');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'sin políticas, authenticated no ve ningún contacto');

-- Los helpers cambian de usuario sin necesidad de volver antes a postgres
select pruebas.anonimo();
select is(current_user::text, 'anon', 'pruebas.anonimo cambia el rol desde authenticated');
select pruebas.autenticar('a@test.local');
select is(current_user::text, 'authenticated', 'pruebas.autenticar cambia el rol desde anon');

reset role;
select * from finish();
rollback;
