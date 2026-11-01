-- Bucket privado avatares. Solo el dueño escribe el fichero de su carpeta. Lo lee él y quien ya es
-- su contraparte, aunque la compartición siga pendiente: es la misma regla que el perfil.
--
-- anon tiene privilegios de tabla sobre storage.objects (los pone Supabase) pero ninguna política,
-- así que no ve filas. Estos tests no pasan por la API de Storage: comprueban la RLS en Postgres.
begin;
set client_min_messages to warning;
create extension if not exists pgtap with schema extensions;
select plan(11);

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');
select pruebas.crear_usuario('c@test.local');

select results_eq(
  $$select public::text, file_size_limit::text
    from storage.buckets where id = 'avatares'$$,
  $$values ('false', '1048576')$$,
  'el bucket avatares existe, es privado y limita el tamaño a 1 MB');
select policies_are('storage', 'objects',
  array['avatares: subir el propio', 'avatares: sustituir el propio',
        'avatares: borrar el propio', 'avatares: ver el propio o el de una contraparte'],
  'storage.objects tiene exactamente las cuatro políticas de avatares');

select pruebas.autenticar('a@test.local');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatares', (select auth.uid())::text || '/avatar.png')$$,
  'A sube su avatar');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatares', pruebas.id_usuario('b@test.local')::text || '/avatar.png')$$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'A no sube un avatar en la carpeta de B');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatares', (select auth.uid())::text || '/otro.txt')$$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'A no sube un fichero que no sea su avatar');

-- storage.protect_delete() impide el DELETE directo (hay que usar la API). La política de borrado
-- se comprueba en 01 por su nombre; aquí se prueba la lectura.
select pruebas.autenticar('b@test.local');
select is_empty($$select name from storage.objects where bucket_id = 'avatares'$$,
  'B no ve el avatar de A antes de ser contraparte');

select pruebas.autenticar('a@test.local');
select lives_ok($$insert into public.contactos (nombre) values ('Ada')$$, 'A crea un contacto');
select lives_ok(
  $$select public.compartir_contacto(
      (select id from public.contactos where nombre = 'Ada'), 'b@test.local', 'lector')$$,
  'A invita a B; la compartición queda pendiente');
select pruebas.autenticar('b@test.local');
select results_eq(
  $$select name from storage.objects where bucket_id = 'avatares'$$,
  array[pruebas.id_usuario('a@test.local')::text || '/avatar.png'],
  'con la invitación pendiente, B ya ve el avatar de A');

select pruebas.autenticar('c@test.local');
select is_empty($$select name from storage.objects where bucket_id = 'avatares'$$,
  'C, que no es contraparte, no ve el avatar');

select pruebas.anonimo();
select is_empty($$select name from storage.objects where bucket_id = 'avatares'$$,
  'anon no ve objetos del bucket, aunque la tabla le deje hacer select');

select * from finish();
rollback;
