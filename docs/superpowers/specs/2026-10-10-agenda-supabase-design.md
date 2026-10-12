# Agenda multiusuario sobre Supabase — diseño

Fecha: 2026-10-10. Estado: aprobado en conversación, pendiente de revisión escrita.

## 1. Objetivo

Convertir esta agenda de contactos (Angular 22, datos servidos por json-server) en una aplicación
multiusuario desplegada y pública que demuestre **cómo se usa Supabase bien**: autenticación con
correo, autorización por filas (RLS) no trivial —contactos compartidos entre usuarios con dos
niveles de permiso—, migraciones versionadas, pruebas de las políticas y despliegue automático.

Para quién: portfolio del autor. Quien visite la URL debe poder entrar con una cuenta demo,
ver contactos propios y compartidos, y quien lea el repo debe encontrar un ejemplo completo y
defendible de RLS, migraciones y CI.

Criterios de éxito:

1. URL pública en GitHub Pages con la cuenta demo funcionando de principio a fin.
2. Las políticas RLS están cubiertas por tests pgTAP que pasan en CI, incluidos los intentos de
   abuso (robar un contacto, insertar comparticiones a mano, ver perfiles ajenos).
3. Los *advisors* de seguridad de Supabase no emiten ningún aviso sobre el esquema.
4. CI en cada PR (app y base de datos) y despliegue automático de migraciones y frontend en `master`.
5. Ningún secreto en el repo: solo la URL del proyecto y la publishable key, públicas por diseño.
6. El README sirve de *runbook*: arranque local, tests, migraciones, despliegue y demo.

## 2. Contexto actual

**Aplicación** (`kc-boot4-angular`, privado, rama `master` sin protección): Angular 22 *standalone*
y *zoneless*, signals; `ContactosService` sobre `HttpClient` contra `API_URL/contactos` (listar,
crear, borrar; no hay edición); `contactosResolver`; componentes `barra-navegacion`,
`lista-contactos` (ordenable), `detalles-contacto`, `formulario-contacto` (*template-driven*),
`nuevo-contacto`, `mis-contactos`; 7 specs de Vitest; CI «Build, tests y npm audit»; Dependabot
con grupo `angular` e `ignore` de mayores. Node 24.21.0 (`.nvmrc`). Sin despliegue.

**Supabase**: organización «jaisato's Org», plan **free** (sin *branching*; el proyecto se pausa
tras 7 días sin actividad; sin backups automáticos). Proyecto `zckmejrnscenxwiqykkh`
(«jaisato's Project», `eu-west-1`, Postgres 17.6), vacío: 0 tablas, 0 buckets, 0 usuarios, solo
el proveedor `email`. En `public` existe `rls_auto_enable()`, función de la **plataforma** ligada
al *event trigger* `ensure_rls`: activa RLS en cada tabla nueva de `public`. Se conserva; las
migraciones activan RLS explícitamente de todos modos, porque el stack local puede no tenerla.

**Herramientas** (versiones al redactar): CLI `supabase` 2.120.0, `@supabase/supabase-js`
2.117.3. Comandos verificados con `--help`: `start -x`, `db reset`, `test db`,
`db lint --local --fail-on`, `gen types --local --lang typescript`, `migration new`, `link`,
`db push --linked`.

## 3. Decisiones tomadas

| Decisión | Elección | Alternativas descartadas |
|---|---|---|
| Repo | Este, renombrado a **`agenda-supabase`** y hecho público | whatapop (fork), movies (móvil, historial con clave ajena), Next.js nuevo |
| Compartición | **Por contacto**, roles `lector` y `editor`; se añade la edición de contactos | solo lectura; agendas con miembros |
| Autenticación | **Email + contraseña con confirmación**, correos por **Resend** (SMTP, dominio `jasato.com`) | sin confirmación; magic link; OAuth |
| Arquitectura | **Cliente directo + RLS** como única autorización; una RPC `SECURITY DEFINER` para compartir por email | API propia (Edge Functions); híbrido |
| Nombres en BD | **Español sin tildes** (`perfiles`, `contactos`, `contactos_compartidos`) | inglés |
| Hosting | **GitHub Pages** (Actions) | Vercel/Netlify |
| Migraciones | **Imperativas** (`supabase migration new`) | esquemas declarativos |
| Fuera de la v1 | Storage (avatares), Realtime, OAuth, CAPTCHA, E2E, invitaciones a no registrados | — |

## 4. Arquitectura

```
Navegador ── Angular 22 (GitHub Pages) ── supabase-js (publishable key + JWT del usuario)
                                              │
                      ┌───────────────────────┼───────────────────────┐
                 Auth (GoTrue)          Data API (PostgREST)      (Storage/Realtime: no en v1)
                 correo vía Resend             │
                                        Postgres 17 ── RLS + permisos por columna
                                                   ── privado.* (SECURITY DEFINER)
                                                   ── public.compartir_contacto()
```

La aplicación nunca usa la clave secreta. Toda autorización se decide en Postgres con la
identidad del JWT (`auth.uid()`); la app solo decide qué botones mostrar a partir del rol que ya
le llega filtrado.

## 5. Modelo de datos y RLS

### 5.1 Esquema `public`

```sql
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
```

Los campos de texto del contacto son `not null default ''`, como el modelo `Contacto` actual
(todo cadenas), para que el tipo generado siga siendo `string` y no `string | null`.

### 5.2 Esquema `privado` (no expuesto en la Data API)

Tres funciones `SECURITY DEFINER`, `stable`, con `set search_path = ''`, ejecutables solo por
`authenticated`. Existen para que las políticas de una tabla no consulten otra tabla con RLS:
`contactos` ↔ `contactos_compartidos` se referencian mutuamente y Postgres abortaría por
recursión infinita.

```sql
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
```

Más dos funciones de trigger en el mismo esquema: `privado.crear_perfil()` (inserta o actualiza
`perfiles` tras `insert` o `update of email` en `auth.users`) y `privado.marcar_actualizado()`
(`actualizado_en = clock_timestamp()` antes de cada `update` en `contactos`; `clock_timestamp()` y
no `now()`, que es constante dentro de una transacción y ocultaría el cambio a un test que corre
en una sola).

Postgres concede `EXECUTE` a `public` en toda función nueva, así que la migración lo revoca en todas
las de `privado` (`revoke execute on all functions in schema privado from public`) y lo concede a
`authenticated` solo en las tres de las políticas; las de trigger no lo necesitan, porque Postgres
comprueba `EXECUTE` al crear el trigger y no al dispararlo. Un `alter default privileges` no sirve
de sustituto (no resta el privilegio global por defecto de `public`), así que cada función nueva de
`privado` necesita su propio `revoke`, y `01_esquema.sql` falla si alguna conserva `EXECUTE` para
`public`.

### 5.3 Privilegios

Supabase concede por defecto todos los privilegios de las tablas nuevas de `public` a `anon` y
`authenticated`. La migración los **revoca** y concede solo lo necesario:

| Tabla | `anon` | `authenticated` |
|---|---|---|
| `perfiles` | nada | `select`; `update (nombre)` |
| `contactos` | nada | `select`, `delete`; `insert (nombre, apellidos, email, telefono, facebook, twitter)`; `update (mismas columnas)` |
| `contactos_compartidos` | nada | `select`, `delete`; `update (rol)` — **sin `insert`**: solo la RPC inserta |

Los privilegios **por columna** son lo que impide «robar» un contacto: un editor puede cambiar
los datos, pero cualquier `update` que toque `propietario_id` o `id` falla con *permission denied*
(`42501`) antes de llegar a las políticas. Al no conceder `insert` sobre `propietario_id`, los
contactos nacen siempre del `default auth.uid()`.

### 5.4 Políticas (todas `to authenticated`)

```sql
alter table public.contactos enable row level security;
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

alter table public.contactos_compartidos enable row level security;
create policy "compartidos: ver el compartido o el dueño" on public.contactos_compartidos for select
  to authenticated
  using (usuario_id = (select auth.uid()) or privado.es_propietario(contacto_id));
create policy "compartidos: cambiar rol el dueño" on public.contactos_compartidos for update
  to authenticated
  using (privado.es_propietario(contacto_id)) with check (privado.es_propietario(contacto_id));
create policy "compartidos: revocar el dueño o dejar de ver" on public.contactos_compartidos for delete
  to authenticated
  using (privado.es_propietario(contacto_id) or usuario_id = (select auth.uid()));

alter table public.perfiles enable row level security;
create policy "perfiles: ver el propio y las contrapartes" on public.perfiles for select
  to authenticated
  using (id = (select auth.uid()) or privado.es_contraparte(id));
create policy "perfiles: editar el propio" on public.perfiles for update
  to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
```

`(select auth.uid())` en lugar de `auth.uid()` para que Postgres lo evalúe una vez por consulta
(recomendación de rendimiento de Supabase).

### 5.5 RPC `compartir_contacto`

```sql
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
```

Decisión consciente: el mensaje revela si existe una cuenta con ese email (como Google Docs).
Cambiar el rol de alguien ya compartido y revocar se hacen con `update`/`delete` directos bajo RLS.

El error «No hay ningún usuario con ese email» usa `PT404` y no `P0002`: PostgREST responde HTTP 500
a `P0002`, mientras que un código `PTxxx` llega al cliente con el estado `xxx` (aquí 404) y
`code: 'PT404'`. Los errores de usuario de la RPC son `42501` (quien llama no es el propietario),
`PT404` y `22023` (compartir con uno mismo), y la aplicación los distingue por `error.code`, nunca
por el estado HTTP.

### 5.6 Qué no hay

Vistas (evitan el problema de `security_invoker`), triggers de negocio aparte de los dos citados,
Storage, Realtime. `rls_auto_enable`/`ensure_rls` (plataforma) se dejan como están.

## 6. Autenticación y correo

**Proveedor**: email + contraseña; confirmación obligatoria; longitud mínima 8; registro abierto.
Flujo **PKCE**: el enlace del correo vuelve a `/auth/confirmar?code=…` y `supabase-js` lo canjea
por la sesión. Recuperación de contraseña: `/auth/recuperar` → correo → `/auth/nueva-contrasena`.
Cambio de email, OAuth y CAPTCHA fuera de la v1.

**SMTP (dashboard → Authentication → SMTP)**: `smtp.resend.com`, puerto 465, usuario `resend`,
contraseña = API key de Resend **solo de envío y limitada al dominio `jasato.com`**; remitente
`Agenda <agenda@jasato.com>`. Plantillas en español (confirmación, recuperación). La clave vive
solo en el dashboard. Sin SMTP propio, Supabase solo entrega correos a los miembros del equipo
del proyecto (documentación «Send emails with custom SMTP»), así que este paso es obligatorio
para una demo pública. Límite por defecto con SMTP propio: 30 registros/hora; se deja.

**URLs**: *Site URL* = URL de Pages; redirecciones permitidas = Pages y `http://localhost:4200/**`.

**Local**: el stack de la CLI incluye **Mailpit** (`http://127.0.0.1:54324`): los correos de
confirmación se leen ahí. `supabase/config.toml` replica confirmación activa, longitud mínima y
redirecciones.

**Cuenta demo**: `demo@jasato.com` (contactos de ejemplo) e `invitado@jasato.com`, que comparte
un contacto con `demo` como lector y recibe otro como editor, para que «compartidos conmigo»
tenga contenido. Los crea `npm run seed:demo` (`scripts/seed-demo.mjs`: supabase-js con la Admin
API, `email_confirm: true`, idempotente; lee `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del entorno,
nunca del repo) tanto en local como en el proyecto real. Credenciales de `demo` en el README;
con RLS, un visitante solo puede alterar los contactos de la cuenta demo, y el mismo script los
restaura.

## 7. Aplicación Angular

**Dependencias**: `@supabase/supabase-js` 2.117.x (fijada) y `supabase` (CLI) como devDependency
fijada. Se eliminan `json-server`, `concurrently`, `server.mjs`, `db.json` y `api-url.token.ts`.
`npm start` = `ng serve`; el backend local es `npx supabase start`.

**Configuración**: `src/environments/environment.ts` (producción: URL y publishable key del
proyecto) y `environment.development.ts` (stack local: `http://127.0.0.1:54321` y su publishable
key), con `fileReplacements` en `angular.json`. `src/app/supabase/supabase.client.ts` expone el
cliente (`createClient<Database>(url, key, { auth: { flowType: 'pkce' } })`) como *provider*;
`src/app/supabase/database.types.ts` lo genera `supabase gen types` y CI comprueba que está al día.

**Modelo**: `Contacto` = fila de `contactos` (tipo generado); `ContactoVisible = Contacto & { rol:
'propietario' | 'lector' | 'editor' }`. Una sola consulta `contactos` con
`contactos_compartidos(usuario_id, rol)` embebido: el dueño ve todas las comparticiones de sus
contactos; el compartido solo la suya, y de ella sale su rol.

**Servicios**:

- `ContactosService` (Promises): `obtenerContactos(): Promise<ContactoVisible[]>`,
  `obtenerContacto(id)`, `agregarContacto(datos)`, `editarContacto(id, datos)`,
  `eliminarContacto(id)`, `compartir(id, email, rol)` (RPC), `cambiarRol(id, usuarioId, rol)`,
  `dejarDeCompartir(id, usuarioId)`, `listarComparticiones(id)` (con el email vía `perfiles`).
  Promesas y no Observables: `supabase-js` es *promise*; envolverlo en RxJS añadiría ruido.
- `AuthService`: `sesion` y `usuario` como signals (desde `onAuthStateChange`), `registrar`,
  `entrar`, `salir`, `recuperar`, `nuevaContrasena`, `canjearCodigo`.
- `MensajesService`: un aviso visible en `app.component.html`; traduce errores de PostgREST
  (`42501` → «No tienes permiso»; `PT404` y `22023` → el mensaje de la RPC) y de Auth, siempre por
  `error.code` y no por el estado HTTP.
- Guards funcionales: `authGuard` (sin sesión → `/entrar`) y `sinSesionGuard` (con sesión →
  `/mis-contactos`).

**Rutas**:

| Ruta | Componente | Guard | Resolver |
|---|---|---|---|
| `entrar`, `registro`, `auth/recuperar` | páginas de auth | `sinSesionGuard` | — |
| `auth/confirmar`, `auth/nueva-contrasena` | canje de código / nueva contraseña | — | — |
| `mis-contactos` | `MisContactosComponent` | `authGuard` | `contactosResolver` |
| `nuevo-contacto` | `NuevoContactoComponent` | `authGuard` | — |
| `contactos/:id/editar` | `EditarContactoComponent` | `authGuard` | `contactoResolver` |
| `contactos/:id/compartir` | `CompartirContactoComponent` | `authGuard` | `contactoResolver` |
| `**` | redirección a `mis-contactos` | | |

**Pantallas**: `mis-contactos` muestra dos listas con el mismo `lista-contactos` («Mis contactos»
y «Compartidos conmigo», con etiqueta de rol); `detalles-contacto` recibe el rol y emite editar
(dueño/editor), compartir y eliminar (dueño) o «dejar de ver» (compartido).
`formulario-contacto` admite un valor inicial y lo comparten nuevo y editar. `compartir-contacto`:
email + rol → RPC; lista de personas con acceso (email de `perfiles`), cambiar rol y revocar.
Auth: `entrar`, `registro` (estado «revisa tu correo»), `confirmar`, `recuperar`,
`nueva-contrasena`. `barra-navegacion` muestra el email y «Salir» o «Entrar». Todo con formularios
*template-driven* y el CSS actual (skeleton-css), sin librerías de UI.

**Tests Vitest**: los 7 specs se adaptan con un doble del cliente (fábrica que simula la cadena
`from().select().eq()…` y `rpc()`); nuevos specs para `AuthService`, los guards, editar y
compartir. La autorización no se prueba aquí: eso es pgTAP.

**GitHub Pages**: `baseHref=/agenda-supabase/` y `404.html` = copia de `index.html`, para que las
rutas profundas (incluida `/auth/confirmar?code=…`) arranquen la SPA.

## 8. CI/CD y despliegue

**Una versión de la CLI**: `npx supabase` en local y en CI, desde la devDependency.

**`ci.yml`** (en cada PR y push), dos jobs en paralelo:

1. **App**: lo actual (`npm ci`, build, Vitest, `npm audit`).
2. **Base de datos**: `npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector`
   → `npx supabase db reset` (migraciones + `seed.sql`) → `npx supabase test db` →
   `npx supabase db lint --local --fail-on warning` →
   `npx supabase gen types --local --lang typescript -s public > src/app/supabase/database.types.ts`
   y `git diff --exit-code` sobre ese fichero. Coste estimado: 4-6 minutos de Linux por ejecución.

**`deploy.yml`** (push a `master`, tras CI verde), en orden:

1. **Migraciones**: `npx supabase link --project-ref $SUPABASE_PROJECT_REF` y
   `npx supabase db push --linked`, con los secretos `SUPABASE_ACCESS_TOKEN` (PAT **acotado** a este
   proyecto y a los permisos de migraciones, con caducidad) y `SUPABASE_DB_PASSWORD`; la
   referencia del proyecto es una variable, no un secreto.
2. **Frontend**: `ng build` de producción con `baseHref`, `404.html`,
   `actions/upload-pages-artifact` y `actions/deploy-pages`. Fuente de Pages: GitHub Actions.

«Tras CI verde» no lo comprueba el workflow: lo garantiza la protección de `master` (checks
requeridos «Build, tests y npm audit» y «Base de datos», rama al día, también para administradores),
aplicada antes de fusionar. Todo cambio entra por PR.

Las acciones se fijan por SHA, como en el resto de repos del autor.

**`keep-alive.yml`** (dos veces al día, 06:17 y 18:17 UTC): inicia sesión con la cuenta demo pública,
lee un contacto (`GET /rest/v1/contactos?select=id&limit=1`) y cierra esa sesión (`scope=local`, para
no echar a quien esté probando la demo). Supabase pausa un proyecto Free que durante una semana no
recibe actividad real de usuario en la base de datos
(https://supabase.com/docs/guides/platform/free-project-pausing): un `GET /auth/v1/health` no cuenta,
porque GoTrue contesta sin consultar Postgres, y una sola ejecución semanal no deja margen si GitHub
retrasa u omite alguna. Límites: GitHub desactiva los workflows programados de un repositorio
público tras 60 días sin actividad en él, y si alguien cambia la contraseña de la cuenta demo el
workflow falla (es la señal visible) y `npm run seed:demo` la restaura.

**Inventario de secretos**:

| Dónde | Qué | Quién lo crea |
|---|---|---|
| Repo (público) | URL del proyecto, publishable key, credenciales de la cuenta demo | — (son públicos) |
| GitHub Secrets | `SUPABASE_ACCESS_TOKEN` (PAT acotado), `SUPABASE_DB_PASSWORD` | el autor |
| GitHub Variables | `SUPABASE_PROJECT_REF` | el autor |
| Dashboard Supabase | API key de Resend (SMTP) | el autor (o la sesión vía MCP de Resend, con permiso) |
| Solo local | clave secreta de Supabase para `seed:demo` | el autor, en variables de entorno |

**Repo**: renombrar a `agenda-supabase` (GitHub redirige el nombre antiguo; actualizar el remoto
local), hacerlo público, activar Pages, proteger `master` con PR obligatoria y CI
requerido, y añadir `@supabase/supabase-js` y `supabase` a Dependabot (grupo de menores y parches).

## 9. Pruebas

**pgTAP** (`supabase/tests/*.sql`, cada fichero en su transacción; `npx supabase test db`).
*Fixtures*: tres usuarios insertados en `auth.users` (el trigger crea sus `perfiles`); la identidad
se cambia con `set local role authenticated` y `request.jwt.claims` (`sub`, `role`), que es lo que
hace PostgREST. Ficheros:

1. `01_esquema.sql`: tablas, RLS activada en las tres, enum, funciones de `privado`, y los GRANT
   exactos (`anon` sin privilegios; `authenticated` con `insert`/`update` solo en columnas de datos;
   ninguna función de `privado` ejecutable por `public`).
2. `02_contactos.sql`: A ve los suyos y B no; B no edita ni borra los de A (0 filas); insertar con
   `propietario_id` ajeno falla (`42501`).
3. `03_compartir.sql`: tras la RPC como lector, B ve pero no edita; ascendido a editor, B edita el
   nombre pero su `update` de `propietario_id` falla con *permission denied*; B no borra, no
   comparte con C ni inserta en `contactos_compartidos`; B sí deja de ver; compartir con uno mismo
   o con un email inexistente devuelve el error previsto; como `anon`, todo falla.
4. `04_perfiles.sql`: B no ve el perfil de A hasta que exista una compartición; C nunca los ve;
   cada uno solo edita su `nombre`.

**Lint y advisors**: `db lint` en CI; tras cada despliegue de migraciones, advisors de seguridad y
rendimiento del proyecto (MCP `get_advisors`): cero avisos de RLS y `search_path` fijo en todas
las funciones.

**Vitest**: sección 7. **E2E (Playwright)** fuera de la v1.

**Aceptación manual** (en la URL de Pages): registro con correo real vía Resend → confirmar →
entrar → crear, editar, compartir con `demo@`, ver la etiqueta de rol desde la otra cuenta,
ascender a editor y editar desde ella, revocar, borrar; recuperar contraseña; y comprobar que la
Data API con la publishable key sin sesión devuelve vacío.

## 10. Operación

- Logs de Auth y PostgREST en el dashboard (y `query_logs` por MCP); runs de Actions.
- Plan free sin backups: el esquema se reconstruye con las migraciones y la demo con `seed:demo`;
  `supabase db dump` a mano si alguna vez hay datos que importen.
- Rotaciones al cerrar la v1: la clave secreta de Supabase que circuló por el chat de diseño, el
  PAT acotado (con caducidad), la API key de Resend.
- Costes: Supabase free; Actions ≈ 5 minutos por PR y ≈ 3 por despliegue.
- README como *runbook*: `npm ci`, `npx supabase start`, `npm run seed:demo`, `npm start`;
  `npm test` y `npx supabase test db`; `npx supabase migration new <nombre>`; regenerar tipos;
  despliegue (push a la rama principal); restaurar la demo.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Recursión infinita entre políticas | funciones `SECURITY DEFINER` en `privado` (5.2) |
| Un editor se apropia de un contacto | privilegios por columna (5.3), probado en pgTAP |
| Correos que no llegan | SMTP propio por Resend; Mailpit en local; límite 30/h documentado |
| Proyecto pausado por inactividad | `keep-alive.yml` dos veces al día, con actividad real en la base de datos (§8) |
| El canje PKCE exige el mismo navegador que inició el registro | texto en la pantalla «revisa tu correo» |
| Supabase cambia API o CLI | versiones fijadas; verificar changelog y `--help` antes de cada cambio |
| Rutas profundas en Pages | `404.html` = `index.html` |

## 12. Orden de implementación propuesto (para el plan)

1. Repo: renombrar, actualizar remoto y `baseHref`, hacerlo público, Pages y protección de rama.
2. `supabase init`, `config.toml`, migración `inicial` (sección 5), `seed.sql` mínimo, pgTAP
   (sección 9) en verde en local.
3. CI: job de base de datos y comprobación de tipos generados.
4. Angular: cliente, entornos, `AuthService`, guards y pantallas de auth.
5. Angular: `ContactosService` sobre Supabase, listas con rol, editar.
6. Angular: compartir (RPC, cambiar rol, revocar, dejar de ver).
7. Despliegue: `deploy.yml` (db push + Pages), SMTP de Resend, URLs, `seed:demo` en el proyecto
   real, `keep-alive.yml`.
8. README, advisors, aceptación manual, rotación de secretos.
