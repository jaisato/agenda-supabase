-- El aviso de un cambio va por Broadcast al canal privado agenda:<usuario>, no por la publicación.
-- Lo recibe el propietario y, si la compartición ya está aceptada, también el destinatario. Un
-- pendiente no recibe los datos del contacto. La invitación por email solo la oye el propietario.
-- authenticated no puede insertar en realtime.messages.
--
-- La partición del día la crea el servicio Realtime. Este fichero la crea si falta, dentro de la
-- transacción, para que el CI (que arranca sin ese servicio) también vea la fila.
begin;
set client_min_messages to warning;
create extension if not exists pgtap with schema extensions;
select plan(24);

set timezone to 'UTC';

select lives_ok(
  $sql$do $particion$
    declare
      v_desde timestamp := date_trunc('day', now());
      v_nombre text := 'messages_' || to_char(v_desde, 'YYYY_MM_DD');
    begin
      if not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'realtime' and c.relname = v_nombre
      ) then
        execute format(
          'create table realtime.%I partition of realtime.messages for values from (%L) to (%L)',
          v_nombre, v_desde, v_desde + interval '1 day');
      end if;
    end
    $particion$;$sql$,
  'existe la partición de realtime.messages de hoy');

select has_function('privado', 'avisar_cambio', 'existe privado.avisar_cambio()');
select has_function(
  'privado', 'emitir_aviso', array['uuid', 'text', 'text', 'text', 'record', 'record'],
  'existe privado.emitir_aviso');
select has_trigger('public', 'contactos', 'avisar_cambio',
  'contactos avisa tras insertar, editar o borrar');
select has_trigger('public', 'contactos_compartidos', 'avisar_cambio',
  'contactos_compartidos avisa tras insertar, editar o borrar');
select has_trigger('public', 'invitaciones_contacto', 'avisar_cambio',
  'invitaciones_contacto avisa tras insertar, editar o borrar');
select policies_are('realtime', 'messages',
  array['agenda: cada usuario recibe su canal'],
  'realtime.messages solo tiene la política del canal de cada usuario');
select function_privs_are('privado', 'avisar_cambio', '{}'::name[], 'anon', '{}'::text[],
  'anon no ejecuta privado.avisar_cambio()');
select function_privs_are('privado', 'avisar_cambio', '{}'::name[], 'authenticated', '{}'::text[],
  'authenticated no ejecuta privado.avisar_cambio()');
select function_privs_are(
  'privado', 'emitir_aviso', array['uuid', 'text', 'text', 'text', 'record', 'record'],
  'anon', '{}'::text[], 'anon no ejecuta privado.emitir_aviso');

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');
select pruebas.crear_usuario('c@test.local');

select pruebas.autenticar('a@test.local');
select lives_ok(
  $$insert into public.contactos (nombre) values ('Ada')$$,
  'A crea un contacto');
select set_config('prueba.c1', (select id::text from public.contactos where nombre = 'Ada'), true);

-- B oye su canal y no ve el aviso del contacto de A.
select pruebas.autenticar('b@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('b@test.local')::text, true);
select is_empty($$select 1 from realtime.messages$$,
  'B no oye el alta del contacto de A');

select pruebas.autenticar('a@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('a@test.local')::text, true);
select cmp_ok(
  (select count(*) from realtime.messages where payload->>'table' = 'contactos'),
  '>=', 1::bigint, 'A oye el alta de su contacto');

select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  'A invita a B; la compartición queda pendiente');

select pruebas.autenticar('b@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('b@test.local')::text, true);
select cmp_ok(
  (select count(*) from realtime.messages where payload->>'table' = 'contactos_compartidos'),
  '>=', 1::bigint, 'B oye la invitación');
select is_empty(
  $$select 1 from realtime.messages where payload->>'table' = 'contactos'$$,
  'mientras la invitación está pendiente, B no oye los datos del contacto');

reset role;
select lives_ok(
  $$update public.contactos_compartidos set estado = 'aceptada'
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  'B acepta (el dueño de la tabla, como haría su update de estado)');

select pruebas.autenticar('a@test.local');
select lives_ok(
  $$update public.contactos set nombre = 'Ada Lovelace'
    where id = current_setting('prueba.c1')::uuid$$,
  'A edita el contacto ya aceptado');

select pruebas.autenticar('b@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('b@test.local')::text, true);
select cmp_ok(
  (select count(*) from realtime.messages where payload->>'table' = 'contactos'),
  '>=', 1::bigint, 'aceptada la invitación, B oye la edición del contacto');

select pruebas.autenticar('c@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('c@test.local')::text, true);
select is_empty(
  $$select 1 from realtime.messages where payload->>'table' = 'contactos'$$,
  'C, que no tiene el contacto, no oye la edición');

select pruebas.autenticar('a@test.local');
select lives_ok(
  $$select public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'nadie@test.local', 'lector')$$,
  'A invita a un email sin cuenta');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('a@test.local')::text, true);
select cmp_ok(
  (select count(*) from realtime.messages where payload->>'table' = 'invitaciones_contacto'),
  '>=', 1::bigint, 'A oye la invitación por email');

select pruebas.autenticar('b@test.local');
select set_config('realtime.topic', 'agenda:' || pruebas.id_usuario('b@test.local')::text, true);
select is_empty(
  $$select 1 from realtime.messages where payload->>'table' = 'invitaciones_contacto'$$,
  'B no oye la invitación por email de A');

select pruebas.autenticar('a@test.local');
select throws_ok(
  $$insert into realtime.messages (topic, extension, private)
    values ('agenda:ajeno', 'broadcast', true)$$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'un usuario no publica avisos en realtime.messages');

select * from finish();
rollback;
