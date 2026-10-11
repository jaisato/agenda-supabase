-- Compartir contactos (§5.4 y §5.5 del diseño): la RPC compartir_contacto y las políticas de
-- contactos_compartidos. Solo el dueño comparte, cambia el rol y revoca; el compartido puede dejar de
-- ver el contacto borrando su propia fila; un tercero no ve ni el contacto ni la compartición.
--
-- A, B y C se crean aquí y la transacción se deshace al final, así que el test no deja nada en la base
-- local. Todos los recuentos los hace uno de los tres (usuarios recién creados, que solo ven lo
-- suyo), así que el resultado no depende de los datos que ya haya en la base local.
--
-- authenticated no tiene privilegio de insert sobre contactos_compartidos: solo la RPC, que es
-- security definer, crea comparticiones. El test comprueba también que el insert directo falla.
--
-- El id del contacto c1 no se conoce hasta insertarlo y los roles cambian a mitad del test, así que
-- se guarda en la variable de transacción prueba.c1 y cada consulta lo lee con current_setting().
begin;
-- Silencia el NOTICE de que la extensión pgtap ya existe.
set client_min_messages to warning;
create extension if not exists pgtap with schema extensions;
select plan(29);

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');
select pruebas.crear_usuario('c@test.local');

-- A crea el contacto c1. El insert va dentro de lives_ok para que, si falla, lo diga una aserción en
-- vez de abortar el test.
select pruebas.autenticar('a@test.local');
select lives_ok($$insert into public.contactos (nombre, apellidos) values ('Ada', 'Lovelace')$$,
  'A crea el contacto c1');
select set_config('prueba.c1', (select id::text from public.contactos where nombre = 'Ada'), true);

-- A comparte c1 con B como lector: la RPC devuelve la compartición que acaba de crear.
select results_eq(
  $$select rol from public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  $$values ('lector'::public.rol_comparticion)$$,
  'A comparte c1 con B como lector');

-- B es lector: ve el contacto y su compartición, pero no edita el contacto ni se asciende a sí mismo.
-- Un update que RLS filtra no falla, afecta a cero filas; que B vea las dos filas antes demuestra que
-- el cero lo causa la política de update y no que las filas fueran invisibles.
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[1],
  'B ve el contacto que A le comparte');
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[1],
  'B ve su propia compartición');
select results_eq(
  $$with u as (update public.contactos set nombre = 'Intento'
               where id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'un lector no edita el contacto compartido');
select results_eq(
  $$with u as (update public.contactos_compartidos set rol = 'editor'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'un lector no puede ascenderse a editor');

-- A asciende a B a editor con un update directo, bajo RLS.
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with u as (update public.contactos_compartidos set rol = 'editor'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[1], 'A asciende a B a editor');

-- B es editor: edita el contacto, pero no se lo queda, no lo borra, no lo comparte y no inserta
-- comparticiones a mano. Tanto el privilegio de tabla o de columna como la RPC dan 42501; el mensaje
-- distingue qué capa ha respondido.
select pruebas.autenticar('b@test.local');
select results_eq(
  $$with u as (update public.contactos set nombre = 'Editado'
               where id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[1], 'un editor edita el contacto compartido');
select results_eq(
  $$select nombre from public.contactos where id = current_setting('prueba.c1')::uuid$$,
  array['Editado'], 'el cambio del editor queda guardado');
select throws_ok(
  $$update public.contactos set propietario_id = pruebas.id_usuario('b@test.local')
    where id = current_setting('prueba.c1')::uuid$$,
  '42501', 'permission denied for table contactos',
  'un editor no puede quedarse con el contacto (privilegio de columna)');
select results_eq(
  $$with d as (delete from public.contactos where id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from d$$,
  array[0], 'un editor no borra el contacto compartido');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'c@test.local', 'lector')$$,
  '42501', 'Solo el propietario puede compartir el contacto',
  'un editor no puede compartir el contacto con otro usuario');
select throws_ok(
  $$insert into public.contactos_compartidos (contacto_id, usuario_id, rol)
    values (current_setting('prueba.c1')::uuid, pruebas.id_usuario('c@test.local'), 'lector')$$,
  '42501', 'permission denied for table contactos_compartidos',
  'un editor no puede insertar comparticiones a mano');

-- La RPC rechaza compartir con uno mismo (22023) y con un email sin cuenta (PT404: el código con el
-- que PostgREST responde 404, en vez de P0002, que daría un 500).
select pruebas.autenticar('a@test.local');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'a@test.local', 'lector')$$,
  '22023', 'No puedes compartir un contacto contigo mismo',
  'A no puede compartir un contacto consigo mismo');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'nadie@test.local', 'lector')$$,
  'PT404', 'No hay ningún usuario con ese email',
  'compartir con un email sin cuenta falla');

-- La RPC normaliza el email (minúsculas y sin espacios en los extremos) y hace upsert: volver a
-- compartir con B, escrito de otra forma, no crea una segunda fila y cambia su rol de editor (B acaba
-- de editar el contacto) a lector.
select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, '  B@Test.LOCAL ', 'lector')$$,
  'A comparte c1 con el email de B escrito en mayúsculas y con espacios');
select results_eq(
  $$select rol from public.contactos_compartidos
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  $$values ('lector'::public.rol_comparticion)$$,
  'volver a compartir cambia el rol de editor a lector sin duplicar la compartición');

-- Visibilidad de las comparticiones: las ven el dueño y el compartido, y un tercero no ve nada. Que A
-- vea la compartición y B siga viendo el contacto demuestra que existen antes de comprobar que C,
-- que no es destinatario, no ve ni la compartición ni el contacto.
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[1],
  'A ve la compartición de su contacto');
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[1],
  'tras volver a compartir, B sigue viendo el contacto');
select pruebas.autenticar('c@test.local');
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[0],
  'C no ve la compartición de A con B');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'C, que no es destinatario, no ve el contacto compartido con B');

-- Dejar de ver: B borra su propia compartición y el contacto desaparece para él, pero sigue siendo de
-- A (con el cambio que hizo el editor).
select pruebas.autenticar('b@test.local');
select results_eq(
  $$with d as (delete from public.contactos_compartidos
               where contacto_id = current_setting('prueba.c1')::uuid
                 and usuario_id = pruebas.id_usuario('b@test.local') returning 1)
    select count(*)::int from d$$,
  array[1], 'B borra su compartición para dejar de ver el contacto');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'después de dejar de verlo, B no ve el contacto');
select pruebas.autenticar('a@test.local');
select results_eq(
  $$select nombre from public.contactos where id = current_setting('prueba.c1')::uuid$$,
  array['Editado'], 'A conserva el contacto con el cambio del editor');

-- Revocar: A vuelve a compartir con B y le retira el acceso borrando la compartición. Antes se
-- comprueba que B vuelve a ver el contacto, para que el cero final no salga también si la
-- compartición nunca se hubiera creado.
select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  'A vuelve a compartir c1 con B');
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[1],
  'B vuelve a ver el contacto');
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with d as (delete from public.contactos_compartidos
               where contacto_id = current_setting('prueba.c1')::uuid
                 and usuario_id = pruebas.id_usuario('b@test.local') returning 1)
    select count(*)::int from d$$,
  array[1], 'A revoca el acceso de B borrando la compartición');
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'tras la revocación, B no ve el contacto');

-- Un visitante sin sesión no puede ejecutar la RPC. También daría 42501 si la función llegara a
-- ejecutarse (anon no es el propietario), así que se comprueba el mensaje: es el del privilegio de
-- EXECUTE, no el de la RPC.
select pruebas.anonimo();
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  '42501', 'permission denied for function compartir_contacto',
  'anon no puede ejecutar compartir_contacto');

reset role;
select * from finish();
rollback;
