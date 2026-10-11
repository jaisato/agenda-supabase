-- Esquema base de la agenda (§5.1 a §5.4 del diseño): tipo, tablas, funciones auxiliares, triggers,
-- RLS, privilegios y políticas de contactos. Las políticas de contactos_compartidos y perfiles y la
-- RPC compartir_contacto se añaden en este mismo fichero en tareas posteriores.

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

revoke execute on all functions in schema privado from public;
grant execute on function privado.es_propietario(uuid), privado.rol_compartido(uuid),
  privado.es_contraparte(uuid) to authenticated;

-- RLS activada en las tres tablas. Una tabla sin políticas no deja ver ninguna fila a authenticated:
-- las de contactos están al final de este fichero y las de las otras dos llegan en tareas
-- posteriores.

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
-- RLS de contactos ya está activada más arriba. Las políticas de contactos_compartidos y perfiles
-- llegan en tareas posteriores.

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
