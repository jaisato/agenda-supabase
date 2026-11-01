-- Una compartición nace pendiente: el destinatario no ve el contacto hasta que la acepta, y
-- rechazarla es borrar la fila (la misma política de «dejar de ver»). Las filas que ya existían
-- pasan a aceptada en esta misma migración, para que la demo y los datos actuales no desaparezcan.
--
-- privado.rol_compartido solo cuenta las aceptadas, así que las políticas de contactos (ver y
-- editar) dejan fuera la invitación. privado.es_contraparte no filtra el estado: al invitar ya se
-- puede leer el perfil público de la otra persona (nombre y email), que es lo que la lista de
-- invitaciones necesita, y el contacto en sí sigue oculto.
--
-- El trigger guarda la transición. Los privilegios de columna no distinguen quién actualiza: tanto
-- el dueño como el destinatario tienen UPDATE sobre rol y sobre estado, y sin el trigger el
-- destinatario podría ascenderse a editor en el mismo update con el que acepta, o el dueño podría
-- aceptar por él. postgres y service_role quedan fuera (tests con reset role, seed y SQL editor):
-- la función es security invoker para ver ese current_user. Dentro de una security definer,
-- current_user sería siempre el propietario de la función.

create type public.estado_comparticion as enum ('pendiente', 'aceptada');

alter table public.contactos_compartidos
  add column estado public.estado_comparticion not null default 'pendiente';

update public.contactos_compartidos set estado = 'aceptada';

create or replace function privado.rol_compartido(p_contacto uuid) returns public.rol_comparticion
language sql stable security definer set search_path = '' as $$
  select cc.rol from public.contactos_compartidos cc
  where cc.contacto_id = p_contacto
    and cc.usuario_id = (select auth.uid())
    and cc.estado = 'aceptada';
$$;

create function privado.guardar_comparticion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'No tienes permiso para cambiar la compartición' using errcode = '42501';
  end if;

  if new.rol is distinct from old.rol and new.estado is distinct from old.estado then
    raise exception 'No se puede cambiar el rol y el estado a la vez' using errcode = '42501';
  end if;

  if new.rol is distinct from old.rol and not privado.es_propietario(old.contacto_id) then
    raise exception 'Solo el propietario puede cambiar el rol' using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado
     and (old.usuario_id is distinct from (select auth.uid())
          or old.estado is distinct from 'pendiente'
          or new.estado is distinct from 'aceptada') then
    raise exception 'Solo el destinatario puede aceptar la invitación' using errcode = '42501';
  end if;

  return new;
end $$;

revoke execute on function privado.guardar_comparticion() from public;

create trigger guardar_comparticion
  before update on public.contactos_compartidos
  for each row execute function privado.guardar_comparticion();

-- El destinatario acepta con un update directo. Sigue sin haber INSERT: solo la RPC crea filas.
grant update (estado) on public.contactos_compartidos to authenticated;

create policy "compartidos: aceptar el destinatario" on public.contactos_compartidos
  for update to authenticated
  using (usuario_id = (select auth.uid()) and estado = 'pendiente')
  with check (usuario_id = (select auth.uid()) and estado = 'aceptada');

-- El insert nuevo queda pendiente. Volver a compartir solo cambia el rol: una invitación ya
-- aceptada no vuelve a pendiente, y una que sigue pendiente tampoco se acepta sola.
create or replace function public.compartir_contacto(p_contacto_id uuid, p_email text, p_rol public.rol_comparticion)
returns public.contactos_compartidos
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
  v_fila    public.contactos_compartidos;
begin
  if not privado.es_propietario(p_contacto_id) then
    raise exception 'Solo el propietario puede compartir el contacto' using errcode = '42501';
  end if;
  select id into v_usuario from public.perfiles where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'No hay ningún usuario con ese email' using errcode = 'PT404';
  end if;
  if v_usuario = (select auth.uid()) then
    raise exception 'No puedes compartir un contacto contigo mismo' using errcode = '22023';
  end if;
  insert into public.contactos_compartidos (contacto_id, usuario_id, rol, estado)
  values (p_contacto_id, v_usuario, p_rol, 'pendiente')
  on conflict (contacto_id, usuario_id) do update set rol = excluded.rol
  returning * into v_fila;
  return v_fila;
end $$;

-- El nombre del contacto, y nada más: el teléfono, el email y las redes siguen ocultos hasta que
-- se acepta. La RLS de contactos no dejaría embeber ese nombre, porque la fila aún no es visible.
create function public.invitaciones_pendientes()
returns table (
  contacto_id uuid,
  nombre text,
  rol public.rol_comparticion,
  propietario_nombre text,
  propietario_email text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select c.id, c.nombre, cc.rol, p.nombre, p.email
    from public.contactos_compartidos cc
    join public.contactos c on c.id = cc.contacto_id
    join public.perfiles p on p.id = c.propietario_id
    where cc.usuario_id = (select auth.uid())
      and cc.estado = 'pendiente'
    order by cc.creado_en;
end $$;

revoke execute on function public.invitaciones_pendientes() from public, anon;
grant execute on function public.invitaciones_pendientes() to authenticated;
