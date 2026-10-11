-- Políticas de RLS de contactos (§5.4 del diseño): cada usuario ve y toca solo sus contactos y los
-- que otro le comparte según el rol (el lector los ve, el editor los ve y los edita, y solo el dueño
-- los borra).
--
-- A y B se crean aquí y la transacción se deshace al final, así que el test no deja nada en la base
-- local. Las filas las cuentan A o B (usuarios recién creados) o, cuando las cuenta postgres, se
-- filtran por B, para que el resultado no dependa de los datos que ya haya en la base local.
--
-- authenticated no puede insertar en contactos_compartidos (solo lo hará la RPC compartir_contacto,
-- que llega en otra tarea): las comparticiones se insertan a mano como postgres, que no pasa por
-- RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');

-- A crea dos contactos y los ve. propietario_id sale del default auth.uid(). Los insert van dentro
-- de lives_ok para que, sin política, el test falle en una aserción y no aborte con el error.
select pruebas.autenticar('a@test.local');
select lives_ok($$insert into public.contactos (nombre, apellidos) values ('Tim', 'Cook')$$,
  'A crea el contacto Tim Cook');
select lives_ok($$insert into public.contactos (nombre, apellidos) values ('Ada', 'Lovelace')$$,
  'A crea el contacto Ada Lovelace');
select results_eq($$select count(*)::int from public.contactos$$, array[2],
  'A ve sus dos contactos');

-- B no ve, ni modifica, ni borra los contactos de A. Un update o un delete que RLS filtra no falla:
-- afecta a cero filas, por eso se cuentan las filas devueltas.
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'B no ve los contactos de A');
select results_eq(
  $$with u as (update public.contactos set nombre = 'X' returning 1) select count(*)::int from u$$,
  array[0], 'B no actualiza ningún contacto de A');
select results_eq(
  $$with d as (delete from public.contactos returning 1) select count(*)::int from d$$,
  array[0], 'B no borra ningún contacto de A');

-- B tampoco puede crear un contacto a nombre de A: propietario_id no tiene privilegio de insert, y
-- eso falla antes de que se evalúe ninguna política. Tanto el privilegio como la política dan 42501;
-- el mensaje distingue cuál de las dos capas ha respondido.
select throws_ok(
  format($$insert into public.contactos (propietario_id, nombre) values (%L, 'X')$$,
         pruebas.id_usuario('a@test.local')),
  '42501', 'permission denied for table contactos',
  'B no puede crear un contacto a nombre de A (privilegio de columna)');

-- La política «crear propios» cierra ese mismo hueco por sí sola: aunque algún día se concediera
-- insert sobre propietario_id, B seguiría sin poder crear contactos de A. El grant vale solo para
-- esta transacción, que se deshace al final.
reset role;
grant insert (propietario_id) on public.contactos to authenticated;
select pruebas.autenticar('b@test.local');
select throws_ok(
  format($$insert into public.contactos (propietario_id, nombre) values (%L, 'X')$$,
         pruebas.id_usuario('a@test.local')),
  '42501', 'new row violates row-level security policy for table "contactos"',
  'la política «crear propios» rechaza por sí sola un contacto a nombre de A');
reset role;
revoke insert (propietario_id) on public.contactos from authenticated;

-- A edita su contacto y el trigger marcar_actualizado mueve actualizado_en (clock_timestamp(): dentro
-- de una transacción now() no cambiaría).
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with u as (update public.contactos set nombre = 'Timothy' where nombre = 'Tim' returning 1)
    select count(*)::int from u$$,
  array[1], 'A edita su contacto');
select isnt(
  (select actualizado_en from public.contactos where nombre = 'Timothy'),
  (select creado_en from public.contactos where nombre = 'Timothy'),
  'editar un contacto cambia actualizado_en');

-- A comparte Timothy con B como lector: B lo ve pero no lo edita.
reset role;
insert into public.contactos_compartidos (contacto_id, usuario_id, rol)
select id, pruebas.id_usuario('b@test.local'), 'lector'
from public.contactos
where nombre = 'Timothy' and propietario_id = pruebas.id_usuario('a@test.local');
select pruebas.autenticar('b@test.local');
select results_eq($$select nombre from public.contactos$$, array['Timothy'],
  'B ve el contacto que A le comparte como lector');
select results_eq(
  $$with u as (update public.contactos set telefono = '600000000' returning 1)
    select count(*)::int from u$$,
  array[0], 'un lector no edita el contacto compartido');

-- A sube a B a editor: B lo edita, pero sigue sin poder borrarlo (solo borra el dueño).
reset role;
update public.contactos_compartidos set rol = 'editor'
where usuario_id = pruebas.id_usuario('b@test.local');
select pruebas.autenticar('b@test.local');
select results_eq(
  $$with u as (update public.contactos set telefono = '600000000' returning 1)
    select count(*)::int from u$$,
  array[1], 'un editor edita el contacto compartido');
select results_eq(
  $$with d as (delete from public.contactos returning 1) select count(*)::int from d$$,
  array[0], 'un editor no borra el contacto compartido');

-- Borrar un contacto borra en cascada sus comparticiones. Antes se comprueba que la compartición
-- existe: sin esa aserción, el cero final también saldría si nunca se hubiera insertado.
reset role;
select results_eq(
  $$select count(*)::int from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('b@test.local')$$,
  array[1], 'la compartición con B existe antes de borrar el contacto');
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with d as (delete from public.contactos where nombre = 'Timothy' returning 1)
    select count(*)::int from d$$,
  array[1], 'A borra su contacto compartido');
reset role;
select results_eq(
  $$select count(*)::int from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('b@test.local')$$,
  array[0], 'borrar el contacto borra en cascada sus comparticiones');

-- Un visitante sin sesión no tiene privilegio de select sobre contactos: error, no cero filas.
select pruebas.anonimo();
select throws_ok($$select * from public.contactos$$, '42501', null,
  'anon no puede leer contactos');

reset role;
select * from finish();
rollback;
