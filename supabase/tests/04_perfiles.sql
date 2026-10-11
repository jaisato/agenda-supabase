-- Políticas de RLS de perfiles (§5.4 del diseño): cada usuario ve su propio perfil y los de sus
-- contrapartes (quien le comparte un contacto y aquel a quien se lo comparte), y solo edita el suyo
-- y solo el nombre. El email lo mantiene el trigger crear_perfil a partir de auth.users.
--
-- A, B y C se crean aquí y la transacción se deshace al final, así que el test no deja nada en la
-- base local. Los recuentos los hace uno de los tres (usuarios recién creados, que solo ven lo suyo
-- y lo de sus contrapartes) o, cuando los hace postgres, se filtran por los tres ids, para que el
-- resultado no dependa de los datos que ya haya en la base local.
--
-- A es el dueño del contacto c1 y lo comparte con B; C no participa en ninguna compartición. Las
-- comparticiones las crea la RPC compartir_contacto (se prueba a fondo en 03_compartir.sql): aquí
-- solo hace falta que exista una entre A y B.
begin;
-- Silencia el NOTICE de que la extensión pgtap ya existe.
set client_min_messages to warning;
create extension if not exists pgtap with schema extensions;
select plan(13);

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');
select pruebas.crear_usuario('c@test.local');

-- Los tres perfiles existen: los crea el trigger crear_perfil. Sin esta comprobación, los «solo veo
-- el mío» de más abajo también saldrían si los perfiles de los demás no existieran.
select results_eq(
  $$select count(*)::int from public.perfiles
    where id in (pruebas.id_usuario('a@test.local'), pruebas.id_usuario('b@test.local'),
                 pruebas.id_usuario('c@test.local'))$$,
  array[3], 'existen los perfiles de A, B y C');

-- A crea el contacto c1 y, mientras no lo comparta con nadie, solo ve su propio perfil. El insert
-- va dentro de lives_ok para que, si falla, lo diga una aserción en vez de abortar el test.
select pruebas.autenticar('a@test.local');
select lives_ok($$insert into public.contactos (nombre) values ('Ada')$$,
  'A crea el contacto c1');
select results_eq($$select count(*)::int from public.perfiles$$, array[1],
  'sin compartir nada, A solo ve su propio perfil');

-- A comparte c1 con B. Desde entonces A (el dueño) y B (el destinatario) son contrapartes y cada
-- uno ve el perfil del otro; C, que no participa en ninguna compartición, solo ve el suyo.
select lives_ok(
  $$select public.compartir_contacto((select id from public.contactos where nombre = 'Ada'),
                                     'b@test.local', 'lector')$$,
  'A comparte c1 con B como lector');
select results_eq($$select count(*)::int from public.perfiles$$, array[2],
  'tras compartir, A ve su perfil y el de B');
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.perfiles$$, array[2],
  'tras compartir, B ve su perfil y el de A');
select pruebas.autenticar('c@test.local');
select results_eq($$select count(*)::int from public.perfiles$$, array[1],
  'C, que no es contraparte de nadie, solo ve su propio perfil');

-- A solo edita su perfil, y solo el nombre. Un update que RLS filtra no falla, afecta a cero filas;
-- que A vea el perfil de B (los 2 perfiles de arriba) demuestra que el cero lo causa la política de
-- update y no que la fila fuera invisible. El email no tiene privilegio de update: falla con 42501
-- antes de llegar a las políticas.
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with u as (update public.perfiles set nombre = 'Ana'
               where id = pruebas.id_usuario('a@test.local') returning 1)
    select count(*)::int from u$$,
  array[1], 'A actualiza el nombre de su perfil');
select results_eq(
  $$with u as (update public.perfiles set nombre = 'Intento'
               where id = pruebas.id_usuario('b@test.local') returning 1)
    select count(*)::int from u$$,
  array[0], 'A no actualiza el perfil de B, aunque lo ve');
select throws_ok(
  $$update public.perfiles set email = 'x@test.local'
    where id = pruebas.id_usuario('a@test.local')$$,
  '42501', 'permission denied for table perfiles',
  'A no puede cambiar el email de su perfil (privilegio de columna)');

-- B, la contraparte, ve el nombre que A se ha puesto.
select pruebas.autenticar('b@test.local');
select results_eq(
  $$select nombre from public.perfiles where id = pruebas.id_usuario('a@test.local')$$,
  array['Ana'], 'B ve el nombre nuevo de A');

-- El email de perfiles sigue al de auth.users: el trigger crear_perfil lo actualiza cuando cambia
-- el email del usuario. Tras el cambio ya no existe a@test.local, así que el perfil se busca con
-- el email nuevo (mismo usuario, mismo id).
reset role;
select lives_ok(
  $$update auth.users set email = 'a2@test.local' where id = pruebas.id_usuario('a@test.local')$$,
  'se cambia el email de A en auth.users');
select results_eq(
  $$select email from public.perfiles where id = pruebas.id_usuario('a2@test.local')$$,
  $$values ('a2@test.local')$$,
  'el perfil de A recoge el email nuevo de auth.users');

select * from finish();
rollback;
