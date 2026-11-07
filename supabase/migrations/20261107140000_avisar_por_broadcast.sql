-- El aviso de cambios deja de ir por la publicación supabase_realtime. Postgres Changes no aplica
-- RLS a los DELETE y difundía la clave primaria a cualquier suscriptor. Las invitaciones llevan el
-- email en esa clave. A partir de aquí cada cambio se emite con realtime.broadcast_changes al canal
-- privado agenda:<usuario>, y solo ese usuario puede suscribirse (política de realtime.messages).
-- El cliente no usa el payload: vuelve a pedir la lista, y la RLS de las tablas sigue decidiendo
-- qué filas ve.
--
-- Quién recibe cada cambio:
--   contactos: el propietario y quien ya tiene la compartición aceptada (un pendiente no recibe
--     los datos del contacto);
--   contactos_compartidos: el destinatario y el propietario;
--   invitaciones_contacto: solo el propietario.
--
-- realtime.send traga el fallo de insertar (por ejemplo, si todavía no existe la partición del
-- día) y deja un aviso. Un contacto se guarda igual aunque Realtime no esté en marcha.

create function privado.emitir_aviso(
  p_usuario uuid,
  p_operacion text,
  p_tabla text,
  p_esquema text,
  p_nuevo record,
  p_viejo record
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then
    return;
  end if;
  perform realtime.broadcast_changes(
    'agenda:' || p_usuario::text,
    p_operacion,
    p_operacion,
    p_tabla,
    p_esquema,
    p_nuevo,
    p_viejo
  );
end $$;

revoke execute on function privado.emitir_aviso(uuid, text, text, text, record, record) from public;

create function privado.avisar_cambio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contacto uuid;
  v_propietario uuid;
  v_destinatario uuid;
  v_usuario uuid;
begin
  if tg_table_name = 'contactos' then
    perform privado.emitir_aviso(
      coalesce(new.propietario_id, old.propietario_id),
      tg_op, tg_table_name, tg_table_schema, new, old);
    -- En el DELETE del contacto las comparticiones ya se han ido en cascada: cada una avisó a su
    -- destinatario desde su propio trigger.
    if tg_op <> 'DELETE' then
      for v_usuario in
        select cc.usuario_id
        from public.contactos_compartidos cc
        where cc.contacto_id = new.id
          and cc.estado = 'aceptada'
      loop
        perform privado.emitir_aviso(
          v_usuario, tg_op, tg_table_name, tg_table_schema, new, old);
      end loop;
    end if;
  elsif tg_table_name = 'contactos_compartidos' then
    v_destinatario := coalesce(new.usuario_id, old.usuario_id);
    v_contacto := coalesce(new.contacto_id, old.contacto_id);
    perform privado.emitir_aviso(
      v_destinatario, tg_op, tg_table_name, tg_table_schema, new, old);
    select c.propietario_id into v_propietario
    from public.contactos c
    where c.id = v_contacto;
    if v_propietario is distinct from v_destinatario then
      perform privado.emitir_aviso(
        v_propietario, tg_op, tg_table_name, tg_table_schema, new, old);
    end if;
  elsif tg_table_name = 'invitaciones_contacto' then
    select c.propietario_id into v_propietario
    from public.contactos c
    where c.id = coalesce(new.contacto_id, old.contacto_id);
    perform privado.emitir_aviso(
      v_propietario, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
end $$;

revoke execute on function privado.avisar_cambio() from public;

create trigger avisar_cambio
  after insert or update or delete on public.contactos
  for each row execute function privado.avisar_cambio();

create trigger avisar_cambio
  after insert or update or delete on public.contactos_compartidos
  for each row execute function privado.avisar_cambio();

create trigger avisar_cambio
  after insert or update or delete on public.invitaciones_contacto
  for each row execute function privado.avisar_cambio();

-- La publicación deja de incluir tablas de la agenda. El if exists cubre el proyecto local, donde una
-- migración anterior llegó a publicar invitaciones_contacto, y el CI, donde solo están las otras dos.
-- ALTER PUBLICATION … DROP TABLE no admite IF EXISTS en esta versión de Postgres.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos'
  ) then
    alter publication supabase_realtime drop table public.contactos;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'contactos_compartidos'
  ) then
    alter publication supabase_realtime drop table public.contactos_compartidos;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'invitaciones_contacto'
  ) then
    alter publication supabase_realtime drop table public.invitaciones_contacto;
  end if;
end $$;

-- RLS de realtime.messages ya está activa. No hace falta (ni se puede) un ALTER TABLE: la tabla no
-- es de postgres. Sin política de INSERT, authenticated no publica. La de SELECT solo deja oír el
-- canal propio, y solo las filas de ese canal.
create policy "agenda: cada usuario recibe su canal"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and private is true
    and topic = 'agenda:' || (select auth.uid())::text
    and (select realtime.topic()) = topic
  );
