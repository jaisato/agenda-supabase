-- Compartir contactos: la RPC compartir_contacto y las políticas de contactos_compartidos.
-- La RPC crea la fila en pendiente. El destinatario no ve el contacto hasta que acepta (update de
-- estado); rechazar o dejar de ver es borrar la fila. Solo el dueño comparte, cambia el rol y
-- revoca. Un tercero no ve ni el contacto ni la compartición.
--
-- A, B y C se crean aquí y la transacción se deshace al final, así que el test no deja nada en la
-- base local. Todos los recuentos los hace uno de los tres (usuarios recién creados, que solo ven
-- lo suyo), así que el resultado no depende de los datos que ya haya en la base local.
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
select plan(88);

select pruebas.crear_usuario('a@test.local');
select pruebas.crear_usuario('b@test.local');
select pruebas.crear_usuario('c@test.local');

-- A crea el contacto c1. El insert va dentro de lives_ok para que, si falla, lo diga una aserción en
-- vez de abortar el test.
select pruebas.autenticar('a@test.local');
select lives_ok($$insert into public.contactos (nombre, apellidos) values ('Ada', 'Lovelace')$$,
  'A crea el contacto c1');
select set_config('prueba.c1', (select id::text from public.contactos where nombre = 'Ada'), true);

-- A comparte c1 con B como lector. La fila nace pendiente: B todavía no ve el contacto.
select results_eq(
  $$select rol, estado from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  $$values ('lector'::public.rol_comparticion, 'pendiente'::public.estado_comparticion)$$,
  'A comparte c1 con B como lector y la compartición queda pendiente');

select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'B no ve el contacto mientras la invitación está pendiente');
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[1],
  'B ve su propia compartición pendiente');
select results_eq(
  $$select nombre, rol::text, propietario_email from public.invitaciones_pendientes()$$,
  $$values ('Ada', 'lector', 'a@test.local')$$,
  'B ve la invitación con el nombre del contacto y el email de quien invita, y nada más');
select results_eq(
  $$with u as (update public.contactos set nombre = 'Intento'
               where id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'una invitación pendiente no deja editar el contacto');
select throws_ok(
  $$update public.contactos_compartidos set rol = 'editor'
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  '42501', 'Solo el propietario puede cambiar el rol',
  'el destinatario no puede ascenderse a editor');
select throws_ok(
  $$update public.contactos_compartidos set rol = 'editor', estado = 'aceptada'
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  '42501', 'No se puede cambiar el rol y el estado a la vez',
  'aceptar no sirve para cambiarse el rol en el mismo update');

-- El dueño puede cambiar el rol antes de que acepten, pero no puede aceptar por el destinatario.
-- Un tercero no toca la fila: el update no falla, afecta a cero filas.
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with u as (update public.contactos_compartidos set rol = 'editor'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[1], 'A cambia el rol de una invitación que sigue pendiente');
select throws_ok(
  $$update public.contactos_compartidos set estado = 'aceptada'
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  '42501', 'Solo el destinatario puede aceptar la invitación',
  'el propietario no puede aceptar en nombre del destinatario');
select is_empty($$select * from public.invitaciones_pendientes()$$,
  'quien invita no recibe su propia invitación en invitaciones_pendientes');
select pruebas.autenticar('c@test.local');
select results_eq(
  $$with u as (update public.contactos_compartidos set estado = 'aceptada'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'un tercero no acepta la invitación de otro');
select is_empty($$select * from public.invitaciones_pendientes()$$,
  'un tercero no ve la invitación');

-- B acepta. A partir de aquí es editor (A ya le cambió el rol) y ve el contacto.
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'ni aunque el rol ya sea editor ve B el contacto antes de aceptar');
select results_eq(
  $$with u as (update public.contactos_compartidos set estado = 'aceptada'
               where contacto_id = current_setting('prueba.c1')::uuid
                 and usuario_id = (select auth.uid()) returning 1)
    select count(*)::int from u$$,
  array[1], 'B acepta la invitación');
select results_eq($$select count(*)::int from public.contactos$$, array[1],
  'tras aceptar, B ve el contacto');
select is_empty($$select * from public.invitaciones_pendientes()$$,
  'tras aceptar, B ya no tiene invitaciones pendientes');
select results_eq(
  $$with u as (update public.contactos_compartidos set estado = 'pendiente'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'B no puede devolver a pendiente una compartición aceptada');
select results_eq(
  $$with u as (update public.contactos_compartidos set rol = 'lector'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[0], 'un editor no puede cambiarse el rol');

-- B edita el contacto, pero no se lo queda, no lo borra, no lo comparte y no inserta
-- comparticiones a mano. Tanto el privilegio de tabla o de columna como la RPC dan 42501; el
-- mensaje distingue qué capa ha respondido.
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

-- La RPC rechaza compartir con uno mismo (22023). Un email sin cuenta no falla: queda una invitación
-- en invitaciones_contacto y no una fila de contactos_compartidos. Quien invita ve la diferencia
-- (sin_cuenta); es la misma superficie que el antiguo PT404, ahora como fila y no como error.
select pruebas.autenticar('a@test.local');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'a@test.local', 'lector')$$,
  '22023', 'No puedes compartir un contacto contigo mismo',
  'A no puede compartir un contacto consigo mismo');
select results_eq(
  $$select usuario_id::text, rol::text, estado::text, email, sin_cuenta
    from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, '  Nadie@Test.LOCAL ', 'editor')$$,
  $$values (null::text, 'editor', 'pendiente', 'nadie@test.local', true)$$,
  'compartir con un email sin cuenta guarda una invitación');
select results_eq(
  $$select email, rol::text from public.invitaciones_contacto$$,
  $$values ('nadie@test.local', 'editor')$$,
  'la invitación por email queda en invitaciones_contacto, normalizada');
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[1],
  'esa invitación no crea una compartición');

-- La RPC normaliza el email y hace upsert del rol, sin tocar el estado: volver a compartir con B
-- lo baja a lector y la compartición sigue aceptada.
select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, '  B@Test.LOCAL ', 'lector')$$,
  'A comparte c1 con el email de B escrito en mayúsculas y con espacios');
select results_eq(
  $$select rol, estado from public.contactos_compartidos
    where contacto_id = current_setting('prueba.c1')::uuid$$,
  $$values ('lector'::public.rol_comparticion, 'aceptada'::public.estado_comparticion)$$,
  'volver a compartir cambia el rol y no devuelve la compartición a pendiente');

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

-- Dejar de ver: B borra su propia compartición y el contacto desaparece para él, pero sigue siendo
-- de A (con el cambio que hizo el editor).
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

-- Rechazar: A vuelve a invitar y B borra la fila antes de aceptar. El contacto no llega a verse.
select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  'A vuelve a invitar a B');
select pruebas.autenticar('b@test.local');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'la nueva invitación tampoco enseña el contacto');
select results_eq(
  $$with d as (delete from public.contactos_compartidos
               where contacto_id = current_setting('prueba.c1')::uuid
                 and usuario_id = (select auth.uid()) returning 1)
    select count(*)::int from d$$,
  array[1], 'B rechaza la invitación borrando la compartición');
select results_eq($$select count(*)::int from public.contactos_compartidos$$, array[0],
  'tras rechazar, B no conserva la compartición');

-- Revocar: A invita otra vez, B acepta y A le retira el acceso. Antes se comprueba que B vuelve a
-- ver el contacto, para que el cero final no salga también si la aceptación no hubiera valido.
select pruebas.autenticar('a@test.local');
select lives_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  'A invita a B por tercera vez');
select pruebas.autenticar('b@test.local');
select results_eq(
  $$with u as (update public.contactos_compartidos set estado = 'aceptada'
               where contacto_id = current_setting('prueba.c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[1], 'B acepta la tercera invitación');
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

-- La invitación que se guardó arriba sigue ahí. Volver a invitar cambia el rol y no duplica la fila.
-- Un tercero no la ve, no la borra y no puede insertarla: no hay privilegio de insert.
select pruebas.autenticar('a@test.local');
select results_eq(
  $$select rol::text, sin_cuenta from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'nadie@test.local', 'lector')$$,
  $$values ('lector', true)$$,
  'volver a invitar el mismo email cambia el rol y sigue sin cuenta');
select results_eq($$select count(*)::int from public.invitaciones_contacto$$, array[1],
  'volver a invitar no duplica la invitación por email');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, '   ', 'lector')$$,
  '22023', 'Escribe un email válido',
  'un email vacío no se invita');
select pruebas.autenticar('c@test.local');
select is_empty($$select * from public.invitaciones_contacto$$,
  'un tercero no ve las invitaciones por email');
select results_eq(
  $$with d as (delete from public.invitaciones_contacto returning 1) select count(*)::int from d$$,
  array[0], 'un tercero no revoca una invitación por email');
select throws_ok(
  $$insert into public.invitaciones_contacto (contacto_id, email, rol)
    values (current_setting('prueba.c1')::uuid, 'otro@test.local', 'lector')$$,
  '42501', 'permission denied for table invitaciones_contacto',
  'nadie inserta invitaciones por email a mano');

-- El propietario sí revoca. Al recrear la cuenta, la invitación se convierte en compartición
-- pendiente y el contacto sigue oculto hasta que se acepta. Volver a compartir entonces ya no dice
-- que no hay cuenta, y no devuelve a pendiente una fila que siguiera pendiente.
select pruebas.autenticar('a@test.local');
select results_eq(
  $$with d as (delete from public.invitaciones_contacto where email = 'nadie@test.local' returning 1)
    select count(*)::int from d$$,
  array[1], 'el propietario revoca la invitación por email');
select results_eq(
  $$select sin_cuenta from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'nadie@test.local', 'lector')$$,
  array[true], 'A vuelve a dejar la invitación para cuando exista la cuenta');
select lives_ok($$select pruebas.crear_usuario('nadie@test.local')$$,
  'se crea la cuenta del email invitado');
select is_empty($$select * from public.invitaciones_contacto$$,
  'al crear la cuenta, la invitación por email desaparece');
select pruebas.autenticar('nadie@test.local');
select results_eq(
  $$select rol::text, estado::text from public.contactos_compartidos$$,
  $$values ('lector', 'pendiente')$$,
  'la cuenta nueva recibe la compartición pendiente, con el rol de la invitación');
select results_eq($$select count(*)::int from public.contactos$$, array[0],
  'quien acaba de crear la cuenta no ve el contacto hasta aceptar');
select results_eq(
  $$select nombre from public.invitaciones_pendientes()$$,
  array['Editado'],
  'la invitación canjeada sale en invitaciones_pendientes, solo con el nombre');
select pruebas.autenticar('a@test.local');
select results_eq(
  $$select estado::text, rol::text, sin_cuenta from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'nadie@test.local', 'editor')$$,
  $$values ('pendiente', 'editor', false)$$,
  'volver a compartir con la cuenta ya creada no la acepta ni dice que no tiene cuenta');

-- Si el dueño cambia su email al de una invitación propia, esa invitación se tira y no nace una
-- compartición consigo mismo.
select lives_ok(
  $$select public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'futuro@test.local', 'lector')$$,
  'A invita a un email que luego será el suyo');
reset role;
select lives_ok(
  $$update auth.users set email = 'futuro@test.local'
    where id = pruebas.id_usuario('a@test.local')$$,
  'A cambia su email de auth.users al de esa invitación');
select is_empty($$select * from public.invitaciones_contacto where email = 'futuro@test.local'$$,
  'la invitación al propio email nuevo desaparece');
select results_eq(
  $$select count(*)::int from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('futuro@test.local')$$,
  array[0], 'el cambio de email no le comparte a A su propio contacto');

-- El canje espera a que el email esté confirmado. GoTrue inserta el usuario antes de que confirme:
-- si el canje fuera en el insert, quien registrara primero un email ajeno se quedaría sus
-- invitaciones. A entra ya con su email nuevo (futuro@test.local).
select pruebas.autenticar('futuro@test.local');
select lives_ok(
  $$select public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'tarde@test.local', 'lector')$$,
  'A invita a un email que todavía no tiene cuenta');
reset role;
select lives_ok($$select pruebas.crear_usuario('tarde@test.local', false)$$,
  'ese email se registra sin confirmar');
select results_eq(
  $$select email from public.perfiles where email = 'tarde@test.local'$$,
  array['tarde@test.local'], 'el perfil se crea aunque el email no esté confirmado');
select results_eq(
  $$select count(*)::int from public.invitaciones_contacto where email = 'tarde@test.local'$$,
  array[1], 'la invitación sigue guardada mientras el email no está confirmado');
select results_eq(
  $$select count(*)::int from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('tarde@test.local')$$,
  array[0], 'sin confirmar no nace la compartición');
select lives_ok(
  $$update auth.users set email_confirmed_at = now()
    where id = pruebas.id_usuario('tarde@test.local')$$,
  'GoTrue confirma el email');
select is_empty($$select * from public.invitaciones_contacto where email = 'tarde@test.local'$$,
  'al confirmar, la invitación se canjea');
select results_eq(
  $$select rol::text, estado::text from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('tarde@test.local')$$,
  $$values ('lector', 'pendiente')$$,
  'y nace la compartición pendiente con el rol de la invitación');
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'a@', 'lector')$$,
  '22023', 'Escribe un email válido',
  'un email de dos caracteres lo rechaza la RPC, no el check de la tabla');

-- Volver a compartir cuando el perfil ya existe pero el email sigue sin confirmar: manda la
-- compartición y la invitación por email de ese contacto desaparece. Así la confirmación no vuelve
-- a poner el rol antiguo de la invitación, y la pantalla de compartir no enseña dos filas para la
-- misma persona.
select pruebas.autenticar('futuro@test.local');
select lives_ok(
  $$select public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'luego@test.local', 'editor')$$,
  'A invita como editor a un email sin cuenta');
reset role;
select lives_ok($$select pruebas.crear_usuario('luego@test.local', false)$$,
  'ese email se registra sin confirmar');
select pruebas.autenticar('futuro@test.local');
select results_eq(
  $$select rol::text, estado::text, sin_cuenta from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'luego@test.local', 'lector')$$,
  $$values ('lector', 'pendiente', false)$$,
  'A rebaja a lector: con el perfil ya creado, la RPC crea la compartición pendiente');
select is_empty($$select * from public.invitaciones_contacto where email = 'luego@test.local'$$,
  'y borra la invitación por email de ese contacto');
reset role;
select lives_ok(
  $$update auth.users set email_confirmed_at = now()
    where id = pruebas.id_usuario('luego@test.local')$$,
  'GoTrue confirma el email de luego@test.local');
select results_eq(
  $$select rol::text, estado::text from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('luego@test.local')$$,
  $$values ('lector', 'pendiente')$$,
  'la confirmación respeta el último rol del dueño: sigue siendo lector');

-- Si al canjear ya existe la compartición (una invitación huérfana de una carrera con la
-- confirmación, o un cambio de email que junta dos identidades), el canje no la toca: solo borra la
-- invitación. Las dos filas las pone postgres a mano, que es la única forma de llegar a ese estado.
select lives_ok($$select pruebas.crear_usuario('doble@test.local', false)$$,
  'se registra doble@test.local sin confirmar');
insert into public.invitaciones_contacto (contacto_id, email, rol)
values (current_setting('prueba.c1')::uuid, 'doble@test.local', 'editor');
insert into public.contactos_compartidos (contacto_id, usuario_id, rol, estado)
values (current_setting('prueba.c1')::uuid, pruebas.id_usuario('doble@test.local'), 'lector',
        'aceptada');
select lives_ok(
  $$update auth.users set email_confirmed_at = now()
    where id = pruebas.id_usuario('doble@test.local')$$,
  'se confirma el email con una compartición ya existente');
select results_eq(
  $$select rol::text, estado::text from public.contactos_compartidos
    where usuario_id = pruebas.id_usuario('doble@test.local')$$,
  $$values ('lector', 'aceptada')$$,
  'el canje no sobrescribe la compartición existente');
select is_empty($$select * from public.invitaciones_contacto where email = 'doble@test.local'$$,
  'pero sí borra la invitación');

-- El camino inverso: compartir con un perfil confirmado tampoco deja una invitación huérfana para
-- ese contacto (la pone postgres, como quedaría tras una carrera con la confirmación).
insert into public.invitaciones_contacto (contacto_id, email, rol)
values (current_setting('prueba.c1')::uuid, 'c@test.local', 'editor');
select pruebas.autenticar('futuro@test.local');
select results_eq(
  $$select rol::text, sin_cuenta from public.compartir_contacto(
      current_setting('prueba.c1')::uuid, 'c@test.local', 'lector')$$,
  $$values ('lector', false)$$,
  'A comparte con C, que ya tiene la cuenta confirmada');
select is_empty($$select * from public.invitaciones_contacto where email = 'c@test.local'$$,
  'la invitación huérfana a ese email desaparece');

-- Un visitante sin sesión no puede ejecutar la RPC ni listar invitaciones. También daría 42501 si
-- la función llegara a ejecutarse, así que se comprueba el mensaje: es el del privilegio de
-- EXECUTE, no el de la RPC.
select pruebas.anonimo();
select throws_ok(
  $$select public.compartir_contacto(current_setting('prueba.c1')::uuid, 'b@test.local', 'lector')$$,
  '42501', 'permission denied for function compartir_contacto',
  'anon no puede ejecutar compartir_contacto');
select throws_ok(
  $$select * from public.invitaciones_pendientes()$$,
  '42501', 'permission denied for function invitaciones_pendientes',
  'anon no puede ejecutar invitaciones_pendientes');

reset role;
select * from finish();
rollback;
