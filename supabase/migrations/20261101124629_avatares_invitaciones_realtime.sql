-- Avatares, invitaciones a quien aún no tiene cuenta y Realtime.
--
-- Una compartición sigue naciendo solo en la RPC. Si el email no tiene perfil, no se inserta en
-- contactos_compartidos (usuario_id es NOT NULL y todas las políticas lo comparan con auth.uid()):
-- se guarda en invitaciones_contacto y, cuando ese email queda confirmado en auth.users, el
-- trigger la convierte en una compartición pendiente. El destinatario sigue sin ver el contacto
-- hasta que acepta.
--
-- El bucket avatares es privado. Quien puede ver un perfil puede leer su objeto; solo el dueño
-- escribe el suyo. La ruta vive en perfiles.avatar_ruta, que solo el propio usuario actualiza.

-- § Invitaciones por email

create table public.invitaciones_contacto (
  contacto_id  uuid not null references public.contactos (id) on delete cascade,
  email        text not null check (
    email = lower(email)
    and position('@' in email) > 1
    and char_length(email) between 3 and 254
  ),
  rol          public.rol_comparticion not null,
  creado_en    timestamptz not null default now(),
  primary key (contacto_id, email)
);
create index invitaciones_contacto_email_idx on public.invitaciones_contacto (email);

alter table public.invitaciones_contacto enable row level security;

revoke all on public.invitaciones_contacto from anon, authenticated;
grant select, delete on public.invitaciones_contacto to authenticated;

-- Sin insert ni update: solo la RPC escribe, y el trigger de perfiles borra al canjear.
create policy "invitaciones: las ve el propietario" on public.invitaciones_contacto
  for select to authenticated
  using (privado.es_propietario(contacto_id));
create policy "invitaciones: las borra el propietario" on public.invitaciones_contacto
  for delete to authenticated
  using (privado.es_propietario(contacto_id));

-- § Avatar en el perfil

alter table public.perfiles
  add column avatar_ruta text check (
    avatar_ruta is null
    or avatar_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.(jpg|png|webp)$'
  );

grant update (avatar_ruta) on public.perfiles to authenticated;

-- El check de formato no basta: la carpeta tiene que ser el id del perfil. Si no, alguien podría
-- apuntar su fila al fichero de otra persona y la barra lo enseñaría como propio.
create function privado.guardar_avatar() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.avatar_ruta is not null
     and new.avatar_ruta !~ ('^' || new.id::text || '/avatar\.(jpg|png|webp)$') then
    raise exception 'La ruta del avatar no es válida' using errcode = '22023';
  end if;
  return new;
end $$;

revoke execute on function privado.guardar_avatar() from public;

create trigger guardar_avatar before update on public.perfiles
  for each row execute function privado.guardar_avatar();

-- § Canje al confirmar el email
--
-- Misma función que ya dispara el trigger de auth.users, que pasa a dispararse también cuando
-- cambia email_confirmed_at. El perfil se crea como antes, al insertar el usuario; las
-- invitaciones solo se canjean cuando el email está confirmado. GoTrue inserta el usuario antes de
-- que confirme: sin esta espera, quien registrara primero un email ajeno se quedaría (pendientes)
-- las invitaciones a ese email. Con un proveedor OAuth o el admin API el usuario nace confirmado y
-- el canje va en el propio insert; con el registro por email, en la confirmación. Una invitación
-- al propio contacto (el email nuevo es el del dueño) se tira: no se convierte en una compartición
-- consigo mismo. El conflicto solo cambia el rol, igual que volver a compartir con alguien que ya
-- aceptó.

create or replace function privado.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  if new.email_confirmed_at is null then
    return new;
  end if;

  insert into public.contactos_compartidos (contacto_id, usuario_id, rol, estado)
  select i.contacto_id, new.id, i.rol, 'pendiente'
  from public.invitaciones_contacto i
  join public.contactos c on c.id = i.contacto_id
  where i.email = lower(new.email)
    and c.propietario_id is distinct from new.id
  on conflict (contacto_id, usuario_id) do update set rol = excluded.rol;

  delete from public.invitaciones_contacto where email = lower(new.email);
  return new;
end $$;

-- or replace y no drop + create: crear un trigger pide el privilegio TRIGGER sobre auth.users, que
-- postgres tiene; borrarlo pediría ser el dueño de la tabla (supabase_auth_admin).
create or replace trigger crear_perfil
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function privado.crear_perfil();

-- § RPC
--
-- CREATE OR REPLACE no puede cambiar el tipo de retorno (antes era contactos_compartidos). El
-- resultado nuevo dice si la fila es una cuenta (sin_cuenta falso, con su estado real) o un email
-- que todavía no existe (sin_cuenta verdadero, usuario_id null, estado pendiente). Quien invita
-- distingue las dos: es la misma decisión que el antiguo PT404, ahora visible en la lista y no
-- en un error. PT404 ya no sale de esta función; el cliente lo sigue traduciendo por si acaso.

create type public.resultado_compartir as (
  usuario_id uuid,
  rol public.rol_comparticion,
  estado public.estado_comparticion,
  email text,
  sin_cuenta boolean
);

drop function public.compartir_contacto(uuid, text, public.rol_comparticion);

create function public.compartir_contacto(p_contacto_id uuid, p_email text, p_rol public.rol_comparticion)
returns public.resultado_compartir
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_usuario uuid;
  v_rol public.rol_comparticion;
  v_estado public.estado_comparticion;
begin
  -- Los mismos límites que el check de invitaciones_contacto: así un email como «a@» recibe este
  -- 22023 y no el 23514 del check.
  if v_email is null
     or position('@' in v_email) < 2
     or char_length(v_email) < 3
     or char_length(v_email) > 254 then
    raise exception 'Escribe un email válido' using errcode = '22023';
  end if;
  if not privado.es_propietario(p_contacto_id) then
    raise exception 'Solo el propietario puede compartir el contacto' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and lower(p.email) = v_email
  ) then
    raise exception 'No puedes compartir un contacto contigo mismo' using errcode = '22023';
  end if;

  select p.id into v_usuario from public.perfiles p where lower(p.email) = v_email;
  if v_usuario is null then
    insert into public.invitaciones_contacto (contacto_id, email, rol)
    values (p_contacto_id, v_email, p_rol)
    on conflict (contacto_id, email) do update set rol = excluded.rol;
    return (null, p_rol, 'pendiente', v_email, true)::public.resultado_compartir;
  end if;

  insert into public.contactos_compartidos (contacto_id, usuario_id, rol, estado)
  values (p_contacto_id, v_usuario, p_rol, 'pendiente')
  on conflict (contacto_id, usuario_id) do update set rol = excluded.rol
  returning contactos_compartidos.rol, contactos_compartidos.estado into v_rol, v_estado;
  return (v_usuario, v_rol, v_estado, v_email, false)::public.resultado_compartir;
end $$;

revoke execute on function public.compartir_contacto(uuid, text, public.rol_comparticion) from public, anon;
grant execute on function public.compartir_contacto(uuid, text, public.rol_comparticion) to authenticated;

-- § Storage
--
-- Bucket privado. El tamaño y los MIME los aplica la API de Storage; la RLS impide leer o escribir
-- fuera de la carpeta del propio usuario, salvo la lectura entre contrapartes (igual que perfiles,
-- también con la invitación todavía pendiente).

-- on conflict: si el bucket ya existía (creado a mano en el dashboard), la migración lo deja con
-- estos límites en vez de fallar y tumbar el despliegue.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatares: subir el propio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
  );
create policy "avatares: sustituir el propio" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
  )
  with check (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
  );
create policy "avatares: borrar el propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
  );
create policy "avatares: ver el propio o el de una contraparte" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatares'
    and (
      name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
      or (
        substring(name from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/')
          is not null
        and privado.es_contraparte(
          substring(name from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/')::uuid
        )
      )
    )
  );

-- § Realtime
--
-- La publicación ya existe en el Postgres de Supabase; el if not exists evita el error «relation is
-- already member of publication» si la tabla se activó antes desde el dashboard. El cliente, al
-- recibir un cambio, vuelve a pedir la lista: no parchea filas con el payload, así que la RLS sigue
-- decidiendo qué ve cada uno en los INSERT y UPDATE. Los DELETE son la excepción: Realtime no les
-- aplica RLS y envía la clave primaria a todos los suscriptores. En contactos y
-- contactos_compartidos esa clave son uuids; invitaciones_contacto lleva el email invitado en la
-- clave y por eso no se publica (el propietario recarga su lista por sus propias acciones y por el
-- INSERT en contactos_compartidos que produce el canje).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos'
  ) then
    alter publication supabase_realtime add table public.contactos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'contactos_compartidos'
  ) then
    alter publication supabase_realtime add table public.contactos_compartidos;
  end if;
end $$;
