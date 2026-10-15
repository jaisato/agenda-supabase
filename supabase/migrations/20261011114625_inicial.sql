-- Esquema base de la agenda (§5.1 a §5.5 del diseño): tipo, tablas, funciones auxiliares, triggers,
-- RLS, privilegios, las políticas de las tres tablas y la RPC compartir_contacto.

-- §5.1 Esquema public

create type public.rol_comparticion as enum ('lector', 'editor');

create table public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  nombre     text,
  creado_en  timestamptz not null default now()
);
create unique index perfiles_email_unico on public.perfiles (lower(email));

create table public.contactos (
  id              uuid primary key default gen_random_uuid(),
  propietario_id  uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre          text not null check (char_length(nombre) between 1 and 100),
  apellidos       text not null default '' check (char_length(apellidos) <= 100),
  email           text not null default '' check (char_length(email) <= 254),
  telefono        text not null default '' check (char_length(telefono) <= 30),
  facebook        text not null default '' check (char_length(facebook) <= 100),
  twitter         text not null default '' check (char_length(twitter) <= 100),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index contactos_propietario_idx on public.contactos (propietario_id);

create table public.contactos_compartidos (
  contacto_id  uuid not null references public.contactos (id) on delete cascade,
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  rol          public.rol_comparticion not null,
  creado_en    timestamptz not null default now(),
  primary key (contacto_id, usuario_id)
);
create index contactos_compartidos_usuario_idx on public.contactos_compartidos (usuario_id);

-- §5.2 Esquema privado (no expuesto en la Data API)
--
-- Las tres funciones security definer existen para que las políticas de una tabla no consulten
-- otra tabla con RLS: contactos y contactos_compartidos se referencian mutuamente y Postgres
-- abortaría por recursión infinita.

create schema privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

create function privado.es_propietario(p_contacto uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contactos c
                 where c.id = p_contacto and c.propietario_id = (select auth.uid()));
$$;

create function privado.rol_compartido(p_contacto uuid) returns public.rol_comparticion
language sql stable security definer set search_path = '' as $$
  select cc.rol from public.contactos_compartidos cc
  where cc.contacto_id = p_contacto and cc.usuario_id = (select auth.uid());
$$;

create function privado.es_contraparte(p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contactos_compartidos cc
    join public.contactos c on c.id = cc.contacto_id
    where (c.propietario_id = (select auth.uid()) and cc.usuario_id = p_usuario)
       or (cc.usuario_id = (select auth.uid()) and c.propietario_id = p_usuario));
$$;

-- Funciones de trigger

-- Inserta el perfil al crearse un usuario y mantiene su email al cambiarlo.
create function privado.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- clock_timestamp() y no now(): now() es el inicio de la transacción y no cambiaría dentro de un
-- test que corre en una sola transacción.
create function privado.marcar_actualizado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.actualizado_en := clock_timestamp();
  return new;
end $$;

create trigger crear_perfil after insert or update of email on auth.users
  for each row execute function privado.crear_perfil();

create trigger marcar_actualizado before update on public.contactos
  for each row execute function privado.marcar_actualizado();

-- Privilegios de ejecución del esquema privado: Postgres concede EXECUTE a public por defecto, así
-- que se revoca en todas las funciones y solo authenticated ejecuta las tres que usan las políticas.
-- Las dos funciones de trigger no necesitan grant: Postgres comprueba EXECUTE al crear el trigger,
-- no al dispararlo.
--
-- Esto no cubre las funciones que se añadan después. Un alter default privileges in schema privado
-- no quita el EXECUTE de public: los privilegios por defecto de un esquema se suman a los globales,
-- no los restan. Cada función nueva de privado necesita, pues, su propio revoke, y 01_esquema.sql
-- falla si alguna conserva el EXECUTE de public.

revoke execute on all functions in schema privado from public;
grant execute on function privado.es_propietario(uuid), privado.rol_compartido(uuid),
  privado.es_contraparte(uuid) to authenticated;

-- RLS activada en las tres tablas. Una tabla sin políticas no deja ver ninguna fila a authenticated:
-- las políticas de las tres están más abajo.

alter table public.perfiles enable row level security;
alter table public.contactos enable row level security;
alter table public.contactos_compartidos enable row level security;

-- §5.3 Privilegios
--
-- Supabase concede por defecto todos los privilegios de las tablas nuevas de public a anon y
-- authenticated: se revocan y se concede solo lo necesario. Los privilegios por columna impiden
-- «robar» un contacto: cualquier update que toque propietario_id o id falla con permission denied
-- (42501) antes de llegar a las políticas, y los contactos nacen siempre del default auth.uid().

revoke all on public.perfiles, public.contactos, public.contactos_compartidos
  from anon, authenticated;

grant select on public.perfiles to authenticated;
grant update (nombre) on public.perfiles to authenticated;

grant select, delete on public.contactos to authenticated;
grant insert (nombre, apellidos, email, telefono, facebook, twitter)
  on public.contactos to authenticated;
grant update (nombre, apellidos, email, telefono, facebook, twitter)
  on public.contactos to authenticated;

-- Sin insert: solo la RPC compartir_contacto crea filas.
grant select, delete on public.contactos_compartidos to authenticated;
grant update (rol) on public.contactos_compartidos to authenticated;

-- §5.4 Políticas de contactos (todas to authenticated)
--
-- (select auth.uid()) en lugar de auth.uid() para que Postgres lo evalúe una vez por consulta. La
-- RLS de contactos ya está activada más arriba.

create policy "contactos: ver propios y compartidos" on public.contactos for select
  to authenticated
  using (propietario_id = (select auth.uid()) or privado.rol_compartido(id) is not null);
create policy "contactos: crear propios" on public.contactos for insert
  to authenticated
  with check (propietario_id = (select auth.uid()));
create policy "contactos: editar el dueño o un editor" on public.contactos for update
  to authenticated
  using (propietario_id = (select auth.uid()) or privado.rol_compartido(id) = 'editor')
  with check (propietario_id = (select auth.uid()) or privado.rol_compartido(id) = 'editor');
create policy "contactos: borrar el dueño" on public.contactos for delete
  to authenticated
  using (propietario_id = (select auth.uid()));

-- §5.4 Políticas de contactos_compartidos (todas to authenticated)
--
-- Consultan contactos solo a través de privado.es_propietario: contactos ya consulta
-- contactos_compartidos desde sus políticas (privado.rol_compartido), y un select directo de una
-- tabla en la otra daría recursión infinita. No hay política de insert (ni privilegio): solo la RPC
-- compartir_contacto crea comparticiones.

create policy "compartidos: ver el compartido o el dueño" on public.contactos_compartidos for select
  to authenticated
  using (usuario_id = (select auth.uid()) or privado.es_propietario(contacto_id));
create policy "compartidos: cambiar rol el dueño" on public.contactos_compartidos for update
  to authenticated
  using (privado.es_propietario(contacto_id)) with check (privado.es_propietario(contacto_id));
create policy "compartidos: revocar el dueño o dejar de ver" on public.contactos_compartidos for delete
  to authenticated
  using (privado.es_propietario(contacto_id) or usuario_id = (select auth.uid()));

-- §5.4 Políticas de perfiles (todas to authenticated)
--
-- Cada usuario ve su perfil y los de sus contrapartes (quien le comparte un contacto y aquel a
-- quien se lo comparte). Para saberlo llama a privado.es_contraparte, que consulta las otras dos
-- tablas sin pasar por sus políticas, como el resto de funciones de privado. Solo edita su propio
-- perfil, y solo el nombre: el email no tiene privilegio de update (§5.3) y lo mantiene el trigger
-- crear_perfil a partir de auth.users.

create policy "perfiles: ver el propio y las contrapartes" on public.perfiles for select
  to authenticated
  using (id = (select auth.uid()) or privado.es_contraparte(id));
create policy "perfiles: editar el propio" on public.perfiles for update
  to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- §5.5 RPC compartir_contacto
--
-- security definer porque authenticated no puede insertar en contactos_compartidos ni leer los
-- perfiles de otros usuarios. Decisión consciente: el mensaje revela si existe una cuenta con ese
-- email (como Google Docs). Cambiar el rol de alguien ya compartido y revocar se hacen con
-- update/delete directos bajo RLS.
--
-- Errores de usuario: 42501 (quien llama no es el propietario), PT404 (no hay usuario con ese
-- email) y 22023 (compartir con uno mismo). El diseño usaba P0002 para el segundo, pero PostgREST
-- responde 500 a P0002; un código PTxxx hace que responda con el estado HTTP xxx (aquí 404) y que
-- el cliente reciba code: 'PT404'.

create function public.compartir_contacto(p_contacto_id uuid, p_email text, p_rol public.rol_comparticion)
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
  insert into public.contactos_compartidos (contacto_id, usuario_id, rol)
  values (p_contacto_id, v_usuario, p_rol)
  on conflict (contacto_id, usuario_id) do update set rol = excluded.rol
  returning * into v_fila;
  return v_fila;
end $$;
revoke execute on function public.compartir_contacto(uuid, text, public.rol_comparticion) from public, anon;
grant  execute on function public.compartir_contacto(uuid, text, public.rol_comparticion) to authenticated;
