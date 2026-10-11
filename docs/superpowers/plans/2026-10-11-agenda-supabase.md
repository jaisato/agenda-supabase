# Agenda sobre Supabase — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la agenda Angular en una aplicación multiusuario sobre Supabase, con contactos
compartidos por roles protegidos por RLS, desplegada en GitHub Pages y con las políticas probadas
en CI.

**Architecture:** La app Angular habla directamente con Supabase (`supabase-js`); toda la
autorización vive en Postgres (RLS + privilegios por columna + funciones `SECURITY DEFINER` en el
esquema `privado`), y la única operación con lógica de servidor es la RPC `compartir_contacto`.
Migraciones versionadas con tests pgTAP sobre el stack local de la CLI; `deploy.yml` empuja las
migraciones al proyecto real y publica el frontend en Pages.

**Tech Stack:** Angular 22 (standalone, zoneless, signals, Vitest), `@supabase/supabase-js` 2.117.3,
CLI `supabase` 2.120.0 (Postgres 17, pgTAP, Mailpit), GitHub Actions, GitHub Pages, Resend (SMTP).

**Spec:** `docs/superpowers/specs/2026-10-10-agenda-supabase-design.md` (la numeración «§» de este
plan se refiere a sus secciones).

## Global Constraints

- Node 24.21.0 (`.nvmrc`); Angular `^22.2.1` sin subir de mayor; TypeScript `~6.0.2`; Vitest `^5`.
- `@supabase/supabase-js` **2.117.3** y CLI `supabase` **2.120.0**, versiones exactas (`--save-exact`),
  ambas en `package.json`; la CLI se invoca siempre como `npx supabase`.
- Base de datos: identificadores en español sin tildes; todas las políticas `to authenticated` y con
  `(select auth.uid())`; todas las funciones con `set search_path = ''`; `anon` sin ningún
  privilegio; `security definer` solo en `privado.*` y en `public.compartir_contacto`.
- Rama principal `master`. Rama de trabajo `feat/supabase`, una PR al final (Tarea 13).
- GitHub Pages en `https://jaisato.github.io/agenda-supabase/` (`--base-href /agenda-supabase/`).
- Proyecto Supabase `zckmejrnscenxwiqykkh`: URL `https://zckmejrnscenxwiqykkh.supabase.co`,
  publishable key `sb_publishable_Dn4i5OCgsn8KRuXrVX_70A_oXKbs-Bc` (pública). La clave secreta
  nunca entra en el repo, en GitHub ni en el chat.
- Stack local: API `http://127.0.0.1:54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`.
  En CI: `npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio`.
- Tests SQL: `npx supabase test db [fichero]` (ficheros `supabase/tests/*.sql`, cada uno
  `begin; … rollback;`, con `create extension if not exists pgtap with schema extensions;` al
  principio). Tests Angular: `npx ng test --watch=false [--include <spec>]`.
- Textos de la interfaz en español. Commits en español con Conventional Commits y los dos trailers
  `Co-Authored-By: Claude Code - Claude Fable 5.1 (max) <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01GUj2jANruAKWJ6XJciFaX2` (los pasos «Commit»
  los omiten por brevedad).
- Acciones de GitHub fijadas por SHA con comentario de versión, como en `ci.yml`.
- Formato: `npx prettier --write` sobre los ficheros tocados antes de cada commit (el repo trae
  Prettier).

## Review Focus

1. Email de compartir con mayúsculas o espacios (` Demo@Jasato.com `) → encuentra al usuario
   (pgTAP `03_compartir.sql`, Tarea 4).
2. Compartir otra vez con alguien ya compartido → cambia el rol sin error de duplicado
   (pgTAP `03_compartir.sql`, Tarea 4).
3. Registro con contraseña de menos de 8 caracteres o con un email ya registrado → aviso legible y
   el formulario sigue (Vitest `registro.component.spec.ts`, Tarea 9).
4. `/auth/confirmar` sin `code`, o con uno caducado → aviso y enlace a «Entrar», nunca una pantalla
   en blanco (Vitest `confirmar.component.spec.ts`, Tarea 9).
5. El dueño borra un contacto que otro usuario tiene compartido → desaparecen sus comparticiones
   (pgTAP `02_contactos.sql`, Tarea 3) y, si ese usuario intenta editarlo, vuelve a `/mis-contactos`
   con aviso (Vitest `editar-contacto.component.spec.ts`, Tarea 10).

---

### Task 1: Preparar el repositorio

**Files:**
- Modify: `.github/dependabot.yml`, `.gitignore`, `README.md:1`
- Modify (fuera del repo): `~/projects/STATUS.md` (tabla «Qué hay» y la nota del proyecto Supabase)

- [ ] **Step 1: Escanear el historial antes de publicarlo**

Run: `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo`
Expected: `no leaks found`. Si aparece algo, PARAR y tratarlo como en los otros repos (reescritura
con `git filter-repo`) antes de seguir; no hacer público el repo con hallazgos.

- [ ] **Step 2: Crear la rama de trabajo**

Run: `git switch -c feat/supabase master`

- [ ] **Step 3: Renombrar el repo y la carpeta local**

Run: `gh repo rename agenda-supabase -R jaisato/kc-boot4-angular --yes && git remote set-url origin https://github.com/jaisato/agenda-supabase.git && cd .. && mv kc-boot4-angular agenda-supabase && cd agenda-supabase`
Expected: `gh repo view jaisato/agenda-supabase --json name --jq .name` → `agenda-supabase`;
`git fetch` funciona.

- [ ] **Step 4: Hacerlo público y activar Pages con Actions**

Run: `gh repo edit jaisato/agenda-supabase --visibility public --accept-visibility-change-consequences && gh api -X POST repos/jaisato/agenda-supabase/pages -f build_type=workflows`
Expected: `gh repo view --json visibility --jq .visibility` → `PUBLIC`;
`gh api repos/jaisato/agenda-supabase/pages --jq '.build_type + " " + .html_url'` →
`workflows https://jaisato.github.io/agenda-supabase/`;
`gh api repos/jaisato/agenda-supabase --jq .security_and_analysis.secret_scanning.status` → `enabled`.

- [ ] **Step 5: Ajustar `.gitignore`, Dependabot y el título del README**

`.gitignore`: añadir las líneas `supabase/.temp/` y `supabase/.branches/`.
`.github/dependabot.yml`: en el ecosistema `npm`, añadir el grupo
`supabase: { patterns: ["@supabase/*", "supabase"] }`; añadir un segundo `update` con
`package-ecosystem: github-actions`, `directory: /`, `schedule: { interval: weekly }`.
`README.md`: primera línea `# agenda-supabase` (el resto se reescribe en la Tarea 13).

- [ ] **Step 6: Commit**

`chore: renombrar el repo a agenda-supabase y preparar Dependabot`

- [ ] **Step 7: Anotar en `~/projects/STATUS.md`** el nombre nuevo del repo y de la carpeta.

---

### Task 2: Stack local de Supabase, esquema base y helpers de prueba

**Files:**
- Create: `supabase/config.toml` (lo genera `supabase init`), `supabase/migrations/<timestamp>_inicial.sql`,
  `supabase/seed.sql`, `supabase/tests/01_esquema.sql`
- Modify: `package.json`

**Interfaces:**
- Produces: el esquema de §5.1 (enum, tablas, índices), las funciones de §5.2 y los triggers
  `crear_perfil` (sobre `auth.users`) y `marcar_actualizado` (sobre `public.contactos`), los
  privilegios de §5.3 y RLS activada en las tres tablas (todavía sin políticas).
- Produces (solo local, `seed.sql`): `pruebas.crear_usuario(p_email text) returns uuid`,
  `pruebas.autenticar(p_email text) returns void`, `pruebas.anonimo() returns void`.

- [ ] **Step 1: Instalar la CLI y crear el proyecto local**

Run: `npm i -D --save-exact supabase@2.120.0 && npx supabase init`
(responder «no» a la configuración de IDE). Expected: existe `supabase/config.toml`.

- [ ] **Step 2: Configurar `supabase/config.toml`**

Cambiar: `project_id = "agenda-supabase"`; en `[auth]`: `site_url = "http://localhost:4200"`,
`additional_redirect_urls = ["http://localhost:4200/**"]`, `minimum_password_length = 8`; en
`[auth.email]`: `enable_confirmations = true`. El resto queda por defecto.

- [ ] **Step 3: Arrancar el stack**

Run: `npx supabase start` (la primera vez descarga las imágenes).
Expected: `npx supabase status` lista la API en `54321`, la BD en `54322` y Mailpit en `54324`.

- [ ] **Step 4: Escribir los helpers de prueba en `supabase/seed.sql`**

Solo se ejecutan en local (`db reset`); nunca se despliegan. Esquema `pruebas` con:
- `pruebas.crear_usuario(p_email text) returns uuid` — `language sql security definer set search_path = ''`:
  inserta en `auth.users` `(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)` los valores
  `(gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())` y devuelve el `id`.
- `pruebas.autenticar(p_email text) returns void` — `language plpgsql`: busca el `id` en
  `auth.users` por email y ejecuta `set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'email', p_email)::text, true)` y `set_config('role', 'authenticated', true)`.
- `pruebas.anonimo() returns void` — `set_config('request.jwt.claims', '', true)` y `set_config('role', 'anon', true)`.
Conceder `usage` en el esquema `pruebas` y `execute` en las tres funciones a `authenticated` y `anon`, para
poder cambiar de usuario dentro de un test sin volver antes a `postgres`. En los tests, `reset role;`
devuelve la sesión a `postgres`.

- [ ] **Step 5: Escribir el test que falla, `supabase/tests/01_esquema.sql`**

Run: `npx supabase test new esquema -t pgtap` y renombrar el fichero a `01_esquema.sql`.
Aserciones (`select plan(N)` con el total):
- `has_schema('privado')`, `has_table('public','perfiles')`, `has_table('public','contactos')`,
  `has_table('public','contactos_compartidos')`, `has_enum('public','rol_comparticion')`,
  `enum_has_labels('public','rol_comparticion', array['lector','editor'])`.
- `has_function('privado','es_propietario', array['uuid'])`, `has_function('privado','rol_compartido', array['uuid'])`,
  `has_function('privado','es_contraparte', array['uuid'])`, `has_function('privado','crear_perfil')`,
  `has_function('privado','marcar_actualizado')`, `has_trigger('public','contactos','marcar_actualizado')`.
- RLS: para cada tabla, `is((select relrowsecurity from pg_class where oid = 'public.<tabla>'::regclass), true)`.
- Privilegios: `table_privs_are('public','contactos','anon','{}'::text[])` (y lo mismo para las otras dos);
  `table_privs_are('public','contactos','authenticated', array['SELECT','DELETE'])`;
  `column_privs_are('public','contactos','nombre','authenticated', array['INSERT','UPDATE'])`;
  `column_privs_are('public','contactos','propietario_id','authenticated','{}'::text[])`;
  `table_privs_are('public','contactos_compartidos','authenticated', array['SELECT','DELETE'])`;
  `column_privs_are('public','contactos_compartidos','rol','authenticated', array['UPDATE'])`;
  `table_privs_are('public','perfiles','authenticated', array['SELECT'])`;
  `column_privs_are('public','perfiles','nombre','authenticated', array['UPDATE'])`;
  `column_privs_are('public','perfiles','email','authenticated','{}'::text[])`.
- Trigger: tras `select pruebas.crear_usuario('a@test.local')`,
  `results_eq($$select email from public.perfiles$$, $$values ('a@test.local')$$)`.
- Sin políticas, `authenticated` no ve nada: `select pruebas.autenticar('a@test.local')` y
  `results_eq($$select count(*)::int from public.contactos$$, array[0])`.

- [ ] **Step 6: Verificar que falla**

Run: `npx supabase db reset && npx supabase test db supabase/tests/01_esquema.sql`
Expected: FAIL (no existen el esquema ni las tablas).

- [ ] **Step 7: Escribir la migración**

Run: `npx supabase migration new inicial`. En el fichero generado, en este orden: §5.1 (enum,
tablas, índices); `create schema privado` con sus revocaciones/grants y las tres funciones de §5.2;
`privado.crear_perfil()` y `privado.marcar_actualizado()` (`language plpgsql security definer set
search_path = ''`; la segunda asigna `new.actualizado_en := clock_timestamp()` — y no `now()` — para
que un test en una sola transacción pueda ver el cambio); los triggers
`create trigger crear_perfil after insert or update of email on auth.users for each row execute function privado.crear_perfil()`
y `create trigger marcar_actualizado before update on public.contactos for each row execute function privado.marcar_actualizado()`;
`alter table … enable row level security` para las tres tablas; y los `revoke`/`grant` de §5.3.
Las políticas llegan en las Tareas 3-5.

- [ ] **Step 8: Verificar que pasa**

Run: `npx supabase db reset && npx supabase test db supabase/tests/01_esquema.sql`
Expected: PASS, todas las aserciones.

- [ ] **Step 9: Commit**

`feat: esquema base de la agenda en Supabase con privilegios por columna`

---

### Task 3: Políticas de `contactos`

**Files:**
- Modify: `supabase/migrations/<timestamp>_inicial.sql`
- Create: `supabase/tests/02_contactos.sql`

**Interfaces:**
- Consumes: Tarea 2 (esquema y helpers `pruebas.*`).
- Produces: las cuatro políticas de `contactos` de §5.4.

- [ ] **Step 1: Escribir el test que falla**

Fixtures: `a@test.local` y `b@test.local` con `pruebas.crear_usuario`. Aserciones:
- Como A (`pruebas.autenticar`): dos `insert into public.contactos (nombre, apellidos) values …` y
  `results_eq($$select count(*)::int from public.contactos$$, array[2])`.
- Como B: `results_eq(… count …, array[0])`;
  `results_eq($$with u as (update public.contactos set nombre = 'X' returning 1) select count(*)::int from u$$, array[0])`;
  lo mismo con `delete` → `array[0]`.
- Como B, insertar fijando el dueño: `throws_ok($$insert into public.contactos (propietario_id, nombre) values ('<id de A>', 'X')$$, '42501')`.
- Como A, `update … set nombre = 'Timothy' where nombre = 'Tim'` y
  `isnt((select actualizado_en from public.contactos where nombre = 'Timothy'), (select creado_en …))`.
- Review Focus 5: `reset role;` insertar a mano en `contactos_compartidos` una compartición de un
  contacto de A hacia B; como A, borrar ese contacto; `reset role;`
  `results_eq($$select count(*)::int from public.contactos_compartidos$$, array[0])`.
- Como anónimo (`pruebas.anonimo()`): `throws_ok($$select * from public.contactos$$, '42501')`.

- [ ] **Step 2: Verificar que falla**

Run: `npx supabase db reset && npx supabase test db supabase/tests/02_contactos.sql`
Expected: FAIL (sin políticas, A no ve sus propios contactos).

- [ ] **Step 3: Añadir a la migración el bloque de políticas de `contactos` de §5.4**

- [ ] **Step 4: Verificar que pasan `01` y `02`**

Run: `npx supabase db reset && npx supabase test db` → Expected: PASS.

- [ ] **Step 5: Commit**

`feat: políticas RLS de contactos`

---

### Task 4: Compartir — RPC y políticas de `contactos_compartidos`

**Files:**
- Modify: `supabase/migrations/<timestamp>_inicial.sql`
- Create: `supabase/tests/03_compartir.sql`

**Interfaces:**
- Produces: `public.compartir_contacto(p_contacto_id uuid, p_email text, p_rol public.rol_comparticion) returns public.contactos_compartidos`
  (§5.5) y las tres políticas de `contactos_compartidos` (§5.4).

- [ ] **Step 1: Escribir el test que falla**

Fixtures A, B, C. Como A, crear el contacto `c1` (guardar su `id`). Aserciones:
- A comparte: `results_eq($$select rol from public.compartir_contacto('<c1>', 'b@test.local', 'lector')$$, $$values ('lector'::public.rol_comparticion)$$)`.
- Como B: ve 1 contacto; `update … set nombre` → 0 filas; A lo asciende con
  `update public.contactos_compartidos set rol = 'editor' where contacto_id = '<c1>'` → 1 fila.
- Como B (editor): `update … set nombre = 'Editado'` → 1 fila y el nombre cambia;
  `throws_ok($$update public.contactos set propietario_id = '<id de B>' where id = '<c1>'$$, '42501')`;
  `delete` → 0 filas; `throws_ok($$select public.compartir_contacto('<c1>', 'c@test.local', 'lector')$$, '42501')`;
  `throws_ok($$insert into public.contactos_compartidos (contacto_id, usuario_id, rol) values ('<c1>', '<id de C>', 'lector')$$, '42501')`.
- Como A: `throws_ok(… compartir_contacto('<c1>', 'a@test.local', 'lector') …, '22023')`;
  `throws_ok(… compartir_contacto('<c1>', 'nadie@test.local', 'lector') …, 'P0002')`.
- Review Focus 1 y 2: como A, `lives_ok($$select public.compartir_contacto('<c1>', '  B@Test.LOCAL ', 'lector')$$)`
  y `results_eq($$select rol from public.contactos_compartidos where contacto_id = '<c1>'$$, $$values ('lector'::public.rol_comparticion)$$)` (vuelve de editor a lector, sin duplicados).
- Visibilidad de las comparticiones: como A, `count(*)` de `contactos_compartidos` → 1; como C → 0.
- Dejar de ver: como B, `delete from public.contactos_compartidos where contacto_id = '<c1>' and usuario_id = '<id de B>'` → 1 fila; después B ve 0 contactos.
- Como anónimo: `throws_ok($$select public.compartir_contacto('<c1>', 'b@test.local', 'lector')$$, '42501')`.

- [ ] **Step 2: Verificar que falla**

Run: `npx supabase test db supabase/tests/03_compartir.sql` → Expected: FAIL (la función no existe).

- [ ] **Step 3: Añadir a la migración la RPC de §5.5 y las políticas de `contactos_compartidos` de §5.4**

- [ ] **Step 4: Verificar**

Run: `npx supabase db reset && npx supabase test db` → Expected: PASS (01, 02 y 03).

- [ ] **Step 5: Commit**

`feat: compartir contactos con roles lector y editor`

---

### Task 5: Perfiles, lint y tipos generados

**Files:**
- Modify: `supabase/migrations/<timestamp>_inicial.sql`
- Create: `supabase/tests/04_perfiles.sql`, `src/app/supabase/database.types.ts`

**Interfaces:**
- Produces: las dos políticas de `perfiles` (§5.4) y el tipo `Database` exportado por
  `src/app/supabase/database.types.ts` (generado; no se edita a mano).

- [ ] **Step 1: Escribir el test que falla**

Fixtures A, B, C; como A crear `c1`. Aserciones:
- Como A: `results_eq($$select count(*)::int from public.perfiles$$, array[1])` (solo el propio).
- `reset role;` A comparte `c1` con B (RPC como A). Como A → 2 perfiles; como B → 2; como C → 1.
- Como A: `update public.perfiles set nombre = 'Ana' where id = '<A>'` → 1 fila;
  `… where id = '<B>'` → 0 filas; `throws_ok($$update public.perfiles set email = 'x@test.local' where id = '<A>'$$, '42501')`.
- Sincronización: `reset role; update auth.users set email = 'a2@test.local' where id = '<A>'` y
  `results_eq($$select email from public.perfiles where id = '<A>'$$, $$values ('a2@test.local')$$)`.

- [ ] **Step 2: Verificar que falla** — `npx supabase test db supabase/tests/04_perfiles.sql` → FAIL.

- [ ] **Step 3: Añadir a la migración las políticas de `perfiles` de §5.4**

- [ ] **Step 4: Verificar los cuatro ficheros y el lint**

Run: `npx supabase db reset && npx supabase test db && npx supabase db lint --local --fail-on warning`
Expected: PASS y lint sin avisos (si avisa de `search_path` o de plpgsql, corregir la migración).

- [ ] **Step 5: Generar los tipos**

Run: `mkdir -p src/app/supabase && npx supabase gen types --local --lang typescript -s public > src/app/supabase/database.types.ts`
Expected: el fichero exporta `Database` con `Tables.contactos`, `Tables.perfiles`,
`Tables.contactos_compartidos`, `Enums.rol_comparticion` y `Functions.compartir_contacto`.

- [ ] **Step 6: Commit**

`feat: políticas de perfiles y tipos generados de la base de datos`

---

### Task 6: CI — job de base de datos

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `base-de-datos`** (`name: Base de datos`, `runs-on: ubuntu-latest`), en
paralelo con `build`, con los mismos `checkout` y `setup-node` (mismos SHA) y estos pasos:
`npm ci`; `npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio`;
`npx supabase db reset`; `npx supabase test db`; `npx supabase db lint --local --fail-on warning`;
`npx supabase gen types --local --lang typescript -s public > src/app/supabase/database.types.ts && git diff --exit-code -- src/app/supabase/database.types.ts`.

- [ ] **Step 2: Verificar en GitHub**

Run: `git push -u origin feat/supabase`, y después
`gh api "repos/jaisato/agenda-supabase/actions/runs?branch=feat/supabase&per_page=3" --jq '.workflow_runs[] | "\(.name) \(.status)/\(.conclusion)"'`
(`gh pr checks` no funciona con este token). Expected: `CI completed/success` con los dos jobs
en verde (`gh api repos/jaisato/agenda-supabase/actions/runs/<id>/jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'`).

- [ ] **Step 3: Commit** — `ci: probar las migraciones y las políticas con el stack local de Supabase`

---

### Task 7: Angular — cliente de Supabase, entornos, mensajes, sesión y guards

**Files:**
- Create: `src/environments/environment.ts`, `src/environments/environment.development.ts`
  (con `npx ng generate environments`), `src/app/supabase/supabase.client.ts`,
  `src/app/testing/supabase-falso.ts`, `src/app/mensajes.service.ts`, `src/app/mensajes.service.spec.ts`,
  `src/app/auth/auth.service.ts`, `src/app/auth/auth.service.spec.ts`, `src/app/auth/auth.guard.ts`,
  `src/app/auth/auth.guard.spec.ts`
- Modify: `package.json`, `angular.json` (lo hace el schematic: `fileReplacements` en `development`)

**Interfaces:**
- Produces `supabase.client.ts`:
  `export const SUPABASE = new InjectionToken<SupabaseClient<Database>>('SUPABASE', { providedIn: 'root', factory: () => createClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, { auth: { flowType: 'pkce' } }) })`.
- Produces `supabase-falso.ts` (solo tests): `export function crearSupabaseFalso(): SupabaseFalso`, con
  `cliente: SupabaseClient<Database>` (lo que se provee como `SUPABASE`),
  `auth` con `vi.fn()` para `getSession` (por defecto resuelve `{ data: { session: null }, error: null }`),
  `signUp`, `signInWithPassword`, `signOut`, `resetPasswordForEmail`, `updateUser`, `exchangeCodeForSession`
  y `onAuthStateChange` (guarda el callback y devuelve `{ data: { subscription: { unsubscribe } } }`);
  `emitirAuth(evento: AuthChangeEvent, sesion: Session | null): void`;
  `respuestaDe(tabla: string, respuesta: { data: unknown; error: PostgrestError | null }): void` y
  `respuestaRpc(nombre: string, respuesta: { data: unknown; error: PostgrestError | null }): void`;
  `consultas: Array<{ tabla: string; cadena: Array<{ metodo: string; args: unknown[] }> }>`.
  `from(tabla)` devuelve un *builder* (Proxy) que registra cada método encadenado (`select`, `insert`,
  `update`, `delete`, `upsert`, `eq`, `order`, `single`, `maybeSingle`) y es *thenable*: `await` resuelve la
  respuesta configurada. `rpc(nombre, args)` registra la llamada y resuelve `respuestaRpc`.
- Produces `MensajesService` (`providedIn: 'root'`): `readonly mensaje = signal<Mensaje | null>(null)` con
  `export type Mensaje = { tipo: 'error' | 'exito'; texto: string }`; `error(texto: string): void`;
  `exito(texto: string): void`; `limpiar(): void`;
  `deError(error: { code?: string | null; message: string }): string` con esta tabla exacta:
  `42501` → «No tienes permiso para hacer eso»; `P0002` y `22023` → `error.message` (los textos ya
  son de la RPC); `invalid_credentials` → «Email o contraseña incorrectos»; `email_not_confirmed` →
  «Confirma tu correo antes de entrar»; `user_already_exists` → «Ya existe una cuenta con ese
  email»; `weak_password` → «La contraseña debe tener al menos 8 caracteres»; `over_email_send_rate_limit`
  → «Demasiados correos en poco tiempo; espera un momento»; cualquier otro → `Algo ha fallado: ${error.message}`.
- Produces `AuthService` (`providedIn: 'root'`): `readonly sesion = signal<Session | null>(null)`;
  `readonly usuario = computed(() => this.sesion()?.user ?? null)`; `readonly listo: Promise<void>`
  (resuelta cuando `getSession` ha contestado; el constructor también se suscribe a
  `onAuthStateChange` y actualiza `sesion`); `registrar(email: string, password: string): Promise<void>`
  (`signUp` con `options.emailRedirectTo = this.urlDe('auth/confirmar')`);
  `entrar(email: string, password: string): Promise<void>`; `salir(): Promise<void>`;
  `recuperar(email: string): Promise<void>` (`resetPasswordForEmail` con `redirectTo = this.urlDe('auth/nueva-contrasena')`);
  `nuevaContrasena(password: string): Promise<void>` (`updateUser({ password })`);
  `canjearCodigo(code: string): Promise<void>` (`exchangeCodeForSession`);
  `urlDe(ruta: string): string` = `new URL(ruta, document.baseURI).href`. Todos lanzan el `error` de
  Supabase si lo hay (quien llama lo muestra con `MensajesService`).
- Produces `auth.guard.ts`: `export const authGuard: CanActivateFn` (espera `auth.listo`; sin sesión →
  `router.createUrlTree(['/entrar'])`) y `export const sinSesionGuard: CanActivateFn` (con sesión →
  `['/mis-contactos']`).

- [ ] **Step 1: Dependencia y entornos**

Run: `npm i --save-exact @supabase/supabase-js@2.117.3 && npx ng generate environments`.
`environment.ts`: `{ supabaseUrl: 'https://zckmejrnscenxwiqykkh.supabase.co', supabasePublishableKey: 'sb_publishable_Dn4i5OCgsn8KRuXrVX_70A_oXKbs-Bc' }`.
`environment.development.ts`: `supabaseUrl: 'http://127.0.0.1:54321'` y la clave que imprime
`npx supabase status -o env` (`PUBLISHABLE_KEY`; si esta CLI solo imprime la heredada, `ANON_KEY`).

- [ ] **Step 2: Escribir `supabase.client.ts` y `testing/supabase-falso.ts`** según Interfaces.

- [ ] **Step 3: Tests de `MensajesService`** (`mensajes.service.spec.ts`): un `it` por fila de la tabla de
`deError` (`expect(service.deError({ code: 'weak_password', message: '' })).toBe('La contraseña debe tener al menos 8 caracteres')`, etc.) y `error()`/`exito()`/`limpiar()` sobre el signal.

- [ ] **Step 4: Verificar que fallan** — `npx ng test --watch=false --include src/app/mensajes.service.spec.ts` → FAIL.

- [ ] **Step 5: Implementar `MensajesService`** y verificar que pasa.

- [ ] **Step 6: Tests de `AuthService`** (`auth.service.spec.ts`, con `{ provide: SUPABASE, useValue: falso.cliente }`):
`registrar` llama a `signUp` con `{ email, password, options: { emailRedirectTo: expect.stringMatching(/\/auth\/confirmar$/) } }`;
`entrar` deja en `sesion()` la sesión que devuelve `signInWithPassword`; `salir` llama a `signOut` y deja `sesion()` en `null`;
`emitirAuth('SIGNED_IN', sesion)` actualiza `sesion()`; `entrar` con `error` lo lanza (`rejects.toThrow`).

- [ ] **Step 7: Verificar que fallan; implementar `AuthService`; verificar que pasan.**

- [ ] **Step 8: Tests de los guards** (`auth.guard.spec.ts`, con `TestBed.runInInjectionContext`):
`authGuard` sin sesión devuelve un `UrlTree` hacia `/entrar` y con sesión `true`; `sinSesionGuard` al revés
(hacia `/mis-contactos`).

- [ ] **Step 9: Verificar que fallan; implementar los guards; verificar que pasan.**

- [ ] **Step 10: Commit** — `feat: cliente de Supabase, sesión y guards`

---

### Task 8: Angular — contactos sobre Supabase, listas con rol y retirada de json-server

**Files:**
- Modify: `src/app/contacto.ts`, `src/app/contactos.service.ts`, `src/app/contactos.service.spec.ts`,
  `src/app/contactos.resolver.ts`, `src/app/mis-contactos/mis-contactos.component.{ts,html,spec.ts}`,
  `src/app/detalles-contacto/detalles-contacto.component.{ts,html}`,
  `src/app/lista-contactos/lista-contactos.component.html` (`track contacto.id`),
  `src/app/nuevo-contacto/nuevo-contacto.component.{ts,spec.ts}`,
  `src/app/formulario-contacto/formulario-contacto.component.{ts,html,spec.ts}`,
  `src/app/app.routes.ts`, `src/app/app.routes.spec.ts`, `src/app/app.config.ts`, `src/styles.css`, `package.json`
- Delete: `server.mjs`, `db.json`, `src/app/api-url.token.ts`

**Interfaces:**
- Produces `contacto.ts`:
  `export type Contacto = Database['public']['Tables']['contactos']['Row']`;
  `export type DatosContacto = Pick<Contacto, 'nombre' | 'apellidos' | 'email' | 'telefono' | 'facebook' | 'twitter'>`;
  `export type Rol = Database['public']['Enums']['rol_comparticion']`;
  `export type RolVisible = 'propietario' | Rol`;
  `export interface ContactoVisible extends Contacto { rol: RolVisible }`;
  `export interface Comparticion { usuario_id: string; rol: Rol; email: string }`.
- Produces `ContactosService` (Promises; lanza el `PostgrestError` si lo hay):
  `obtenerContactos(): Promise<ContactoVisible[]>` — `from('contactos').select('*, contactos_compartidos(usuario_id, rol)').order('nombre')`;
  `rol` = `'propietario'` si `propietario_id === auth.usuario()?.id`, si no el `rol` de la fila de
  `contactos_compartidos` cuyo `usuario_id` es el del usuario;
  `obtenerContacto(id: string): Promise<ContactoVisible | null>` — misma selección con `.eq('id', id).maybeSingle()`;
  `agregarContacto(datos: DatosContacto): Promise<Contacto>` — `insert(datos).select().single()`;
  `editarContacto(id: string, datos: DatosContacto): Promise<Contacto>` — `update(datos).eq('id', id).select().single()`;
  `eliminarContacto(id: string): Promise<void>`.
- Produces `contactosResolver: ResolveFn<ContactoVisible[]>`.
- Produces `FormularioContactoComponent`: `readonly inicial = input<DatosContacto | null>(null)`,
  `readonly textoBoton = input('Añadir')`, `readonly guardar = output<DatosContacto>()` (sustituye a
  `nuevoContacto`); los campos usan `[ngModel]="inicial()?.<campo> ?? ''"`.
- Produces `DetallesContactoComponent`: `readonly contacto = input<ContactoVisible | null>(null)`; outputs
  `eliminar`, `editar`, `compartir`, `dejarDeVer` (todos `output<ContactoVisible>()`), más los dos
  `navegar*` existentes. Botones: «Editar» si `rol !== 'lector'`; «Compartir» y «Eliminar contacto» si
  `rol === 'propietario'`; «Dejar de ver» si `rol !== 'propietario'`.
- Produces `MisContactosComponent`: `readonly contactos = input.required<ContactoVisible[]>()`,
  `lista = linkedSignal(...)`, `propios = computed(…rol === 'propietario')`, `compartidos = computed(…resto)`,
  `seleccionado = signal<ContactoVisible | null>(null)`; `eliminarContacto(c)` (confirm → servicio →
  quitar de `lista`); `editar(c)` → `router.navigate(['/contactos', c.id, 'editar'])`;
  `compartir(c)` → `['/contactos', c.id, 'compartir']`; `dejarDeVer(c)` se completa en la Tarea 11.
  Plantilla: dos listas (`<h4>Mis contactos</h4>` y `<h4>Compartidos conmigo</h4>`, cada una con un
  `lista-contactos`; en la segunda, cada nombre lleva `<span class="rol">{{ rol }}</span>` y, si está
  vacía, «Nadie ha compartido contactos contigo todavía.»).

- [ ] **Step 1: Tests de `ContactosService`** (reescribir `contactos.service.spec.ts` con el falso; eliminar los
de HttpClient): `obtenerContactos` pide `select('*, contactos_compartidos(usuario_id, rol)')` y, con el
usuario `u1` y las filas `{ propietario_id: 'u1', contactos_compartidos: [] }` y
`{ propietario_id: 'u2', contactos_compartidos: [{ usuario_id: 'u1', rol: 'editor' }] }`, devuelve roles
`['propietario', 'editor']`; `agregarContacto(tim)` llama a `insert` con exactamente `tim` y devuelve la
fila; `eliminarContacto('id-1')` encadena `delete` y `eq('id', 'id-1')`; con `error`, `rejects.toThrow`.

- [ ] **Step 2: Verificar que fallan; reescribir `contacto.ts` y `ContactosService`; verificar que pasan.**

- [ ] **Step 3: Tests de componentes**: `mis-contactos.component.spec.ts` (con `setInput('contactos', …)`
de un propio, un lector y un editor): la primera lista tiene 1 nombre y la segunda 2 con `span.rol`
`lector` y `editor`; seleccionar el propio muestra «Editar», «Compartir» y «Eliminar contacto»;
seleccionar el lector muestra solo «Dejar de ver»; el editor, «Editar» y «Dejar de ver»; eliminar
con `confirm` → `eliminarContacto(id)` y desaparece de la lista. `nuevo-contacto.component.spec.ts`:
enviar el formulario llama a `agregarContacto` con los seis campos y navega a `/mis-contactos`; con
error, no navega y `MensajesService.mensaje()` tiene `tipo: 'error'`. `formulario-contacto.component.spec.ts`:
con `inicial` pinta los valores y el botón dice `textoBoton`. `app.routes.spec.ts`: `/mis-contactos`
con sesión resuelve con el falso y pinta los nombres; sin sesión acaba en `/entrar`.

- [ ] **Step 4: Verificar que fallan; adaptar componentes, resolver, rutas (`authGuard` en `mis-contactos`
y `nuevo-contacto`) y `app.config.ts` (quitar `provideHttpClient`); verificar que pasan.**

- [ ] **Step 5: Retirar json-server**

Borrar `server.mjs`, `db.json`, `src/app/api-url.token.ts`; `npm uninstall json-server concurrently`;
`package.json`: quitar el script `api` y dejar `"start": "ng serve"`. `src/styles.css`: clase `.rol`
(etiqueta pequeña, mayúsculas, fondo gris claro). Run: `npx ng build && npx ng test --watch=false` → PASS.

- [ ] **Step 6: Commits** — `feat: contactos sobre Supabase con listas propias y compartidas` y
`build: retirar json-server`

---

### Task 9: Angular — registro, inicio de sesión, confirmación y recuperación

**Files:**
- Create: `src/app/auth/entrar/entrar.component.{ts,html,spec.ts}`, `src/app/auth/registro/registro.component.{ts,html,spec.ts}`,
  `src/app/auth/confirmar/confirmar.component.{ts,html,spec.ts}`, `src/app/auth/recuperar/recuperar.component.{ts,html}`,
  `src/app/auth/nueva-contrasena/nueva-contrasena.component.{ts,html,spec.ts}`
- Modify: `src/app/app.routes.ts`, `src/app/app.routes.spec.ts`, `src/app/barra-navegacion/barra-navegacion.component.{ts,html}`,
  `src/app/app.component.html`

**Interfaces:**
- Consumes: `AuthService`, `MensajesService`, guards (Tarea 7).
- Produces las rutas de §7: `entrar`, `registro`, `auth/recuperar` con `sinSesionGuard`; `auth/confirmar` y
  `auth/nueva-contrasena` sin guard; en `ConfirmarComponent` y `NuevaContrasenaComponent`,
  `readonly code = input<string>()` (query param, vía `withComponentInputBinding`).
- Textos exactos: Entrar: botón «Entrar», enlaces «Crear cuenta» (`/registro`) y «¿Olvidaste la
  contraseña?» (`/auth/recuperar`). Registro: botón «Crear cuenta»; tras éxito, `enviado` pasa a `true` y
  se muestra «Revisa tu correo: te hemos enviado un enlace para confirmar la cuenta. Ábrelo en este mismo
  navegador.». Confirmar: con `code` → `canjearCodigo` → `/mis-contactos` y `exito('Cuenta confirmada')`;
  sin `code` o con error → «No hemos podido confirmar la cuenta. El enlace puede haber caducado.» y
  enlace «Entrar». Recuperar: tras enviar, «Si existe una cuenta con ese email, recibirás un enlace para
  cambiar la contraseña.». Nueva contraseña: si llega `code`, canjearlo primero; al guardar →
  `/mis-contactos` y `exito('Contraseña actualizada')`.
- `BarraNavegacionComponent`: con `auth.usuario()` muestra «Mis Contactos», «Nuevo Contacto», el email y
  un botón «Salir» (`auth.salir()` y `/entrar`); sin sesión, solo «Entrar». `app.component.html` pinta
  `mensajes.mensaje()` en un `<div class="mensaje mensaje-{{ tipo }}" role="status">` con botón «×».

- [ ] **Step 1: Tests**: `entrar.component.spec.ts` (enviar llama a `entrar(email, password)` y navega a
`/mis-contactos`; con `invalid_credentials`, el mensaje es «Email o contraseña incorrectos» y no navega);
`registro.component.spec.ts` (Review Focus 3: `weak_password` → «La contraseña debe tener al menos 8
caracteres» y el formulario sigue; `user_already_exists` → «Ya existe una cuenta con ese email»; éxito →
el texto «Revisa tu correo…»); `confirmar.component.spec.ts` (Review Focus 4: sin `code` → el texto de
error y un enlace a `/entrar`, sin llamar a `exchangeCodeForSession`; con `code` → se llama con ese
valor y navega); `nueva-contrasena.component.spec.ts` (guardar llama a `updateUser({ password })`);
`app.routes.spec.ts`: `/entrar` con sesión redirige a `/mis-contactos`; `/no-existe` sin sesión acaba en
`/entrar`.

- [ ] **Step 2: Verificar que fallan; implementar componentes, rutas, barra y zona de mensajes;
verificar que pasan** (`npx ng test --watch=false`).

- [ ] **Step 3: Prueba manual local**: `npx supabase start` + `npm start`; registrarse con
`prueba@test.local`; abrir el enlace desde Mailpit (`http://127.0.0.1:54324`); la app confirma y entra.

- [ ] **Step 4: Commit** — `feat: registro, inicio de sesión y recuperación de contraseña`

---

### Task 10: Angular — editar contacto

**Files:**
- Create: `src/app/contacto.resolver.ts`, `src/app/editar-contacto/editar-contacto.component.{ts,html,spec.ts}`
- Modify: `src/app/app.routes.ts`, `src/app/mis-contactos/mis-contactos.component.ts`

**Interfaces:**
- Produces `contactoResolver: ResolveFn<ContactoVisible | null>` =
  `inject(ContactosService).obtenerContacto(route.paramMap.get('id')!)`.
- Produces `EditarContactoComponent`: `readonly contacto = input.required<ContactoVisible | null>()`
  (del resolver); si es `null` (Review Focus 5) → `mensajes.error('Ese contacto ya no existe o no tienes acceso')`
  y `/mis-contactos`; si no, `formulario-contacto` con `[inicial]="contacto()"` y `textoBoton="Guardar"`;
  `guardar(datos)` → `editarContacto(id, datos)` → `/mis-contactos` y `exito('Contacto guardado')`; con
  error, `mensajes.error(deError(e))`.
- Ruta: `{ path: 'contactos/:id/editar', component: EditarContactoComponent, canActivate: [authGuard], resolve: { contacto: contactoResolver } }`.

- [ ] **Step 1: Tests** (`editar-contacto.component.spec.ts`): con un contacto, los inputs del formulario
traen sus valores y el botón dice «Guardar»; enviar llama a `editarContacto(id, datos)` y navega; con
`contacto = null`, navega a `/mis-contactos` y el mensaje contiene «ya no existe».

- [ ] **Step 2: Verificar que fallan; implementar; verificar que pasan.**

- [ ] **Step 3: Commit** — `feat: editar contactos`

---

### Task 11: Angular — compartir contactos

**Files:**
- Create: `src/app/compartir-contacto/compartir-contacto.component.{ts,html,spec.ts}`
- Modify: `src/app/contactos.service.ts`, `src/app/contactos.service.spec.ts`, `src/app/app.routes.ts`,
  `src/app/mis-contactos/mis-contactos.component.{ts,html,spec.ts}`

**Interfaces:**
- Produces en `ContactosService`:
  `compartir(contactoId: string, email: string, rol: Rol): Promise<Comparticion>` — `rpc('compartir_contacto', { p_contacto_id: contactoId, p_email: email, p_rol: rol })` y devuelve `{ usuario_id, rol, email }`;
  `cambiarRol(contactoId: string, usuarioId: string, rol: Rol): Promise<void>` — `update({ rol }).eq('contacto_id', …).eq('usuario_id', …)`;
  `dejarDeCompartir(contactoId: string, usuarioId: string): Promise<void>` — `delete()` con los dos `eq`;
  `listarComparticiones(contactoId: string): Promise<Comparticion[]>` — `from('contactos_compartidos').select('usuario_id, rol, perfiles(email)').eq('contacto_id', contactoId)` y aplanar `perfiles.email`.
- Produces `CompartirContactoComponent` (ruta `contactos/:id/compartir`, `authGuard`, `resolve: { contacto: contactoResolver }`):
  si `contacto()?.rol !== 'propietario'` → `mensajes.error('Solo el propietario puede compartir')` y
  `/mis-contactos`. Formulario: email + `<select>` con `lector`/`editor` + botón «Compartir»; al
  compartir, `exito(`Compartido con ${email} como ${rol}`)` y recarga la lista. Lista de
  comparticiones: email, `<select>` de rol (cambia con `cambiarRol`) y botón «Revocar»
  (`dejarDeCompartir`). Enlace «Volver» a `/mis-contactos`.
- `MisContactosComponent.dejarDeVer(c)`: `confirm` → `dejarDeCompartir(c.id, auth.usuario()!.id)` → quitar de `lista`.

- [ ] **Step 1: Tests de servicio**: `compartir` llama a `rpc` con exactamente
`['compartir_contacto', { p_contacto_id: 'c1', p_email: 'b@x.es', p_rol: 'lector' }]`;
`listarComparticiones` aplana `{ usuario_id: 'u2', rol: 'lector', perfiles: { email: 'b@x.es' } }` a
`{ usuario_id: 'u2', rol: 'lector', email: 'b@x.es' }`; `cambiarRol` y `dejarDeCompartir` encadenan los dos `eq`.

- [ ] **Step 2: Verificar que fallan; implementar; verificar que pasan.**

- [ ] **Step 3: Tests de componente** (`compartir-contacto.component.spec.ts`): pinta la lista de
comparticiones; enviar llama a `compartir('c1', 'b@x.es', 'editor')`; «Revocar» llama a
`dejarDeCompartir('c1', 'u2')`; con rol `lector` redirige a `/mis-contactos`. `mis-contactos.component.spec.ts`:
«Dejar de ver» con `confirm` llama a `dejarDeCompartir(id, idUsuario)` y quita el contacto.

- [ ] **Step 4: Verificar que fallan; implementar; verificar que pasan.**

- [ ] **Step 5: Commit** — `feat: compartir contactos con otros usuarios`

---

### Task 12: Despliegue automático, keep-alive y datos de demostración

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/keep-alive.yml`, `scripts/seed-demo.mjs`
- Modify: `package.json` (`"build:pages": "ng build --base-href /agenda-supabase/"`, `"seed:demo": "node scripts/seed-demo.mjs"`)

**Interfaces:**
- `deploy.yml`: `on: push: branches: [master]`; `permissions: { contents: read, pages: write, id-token: write }`;
  `concurrency: { group: deploy, cancel-in-progress: false }`. Job `migraciones`: checkout, setup-node, `npm ci`,
  `npx supabase link --project-ref "$SUPABASE_PROJECT_REF"` y `npx supabase db push --linked`, con
  `env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}, SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}, SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }} }`.
  Job `pages` (`needs: migraciones`, `environment: github-pages`): `npm ci`, `npm run build:pages`,
  `cp dist/agenda/browser/index.html dist/agenda/browser/404.html`, `actions/configure-pages`,
  `actions/upload-pages-artifact` (`path: dist/agenda/browser`), `actions/deploy-pages`.
- `keep-alive.yml`: `schedule: - cron: "17 6 * * 1"` y `workflow_dispatch`; un paso
  `curl -fsS -H "apikey: sb_publishable_Dn4i5OCgsn8KRuXrVX_70A_oXKbs-Bc" https://zckmejrnscenxwiqykkh.supabase.co/auth/v1/health`.
- `scripts/seed-demo.mjs` (ESM, Node 24; usa `@supabase/supabase-js` ya instalado): exige
  `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en el entorno (si faltan, mensaje y `exit 1`);
  `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })`. Usuarios:
  `demo@jasato.com` con contraseña `agenda-demo-2026` e `invitado@jasato.com` con `crypto.randomUUID()`;
  para cada uno, si existe (`auth.admin.listUsers`) → `updateUserById(id, { password, email_confirm: true })`,
  si no → `createUser({ email, password, email_confirm: true })`. Contactos con UUID fijos:
  demo: `11111111-1111-4111-8111-000000000001` Tim Cook (tim.cook@gmail.com, 555-123456, tim.cook, @timcook),
  `…0002` Bill Gates (bill.gates@msn.com, 555-123456, bill.gates, @BillGates),
  `…0003` Elon Musk (elon.musk@tesla.com, 393-209423, elon.musk, @elonmusk),
  `…0004` Steve Jobs (steve.jobs@apple.com, 303-23032, steve.jobs, @stevejobs);
  invitado: `…0005` Ada Lovelace (ada@analytical.engine, 000-000000, ada.lovelace, @ada).
  `upsert` por `id` en `contactos` (con `propietario_id`), borrado de los demás contactos de demo e
  invitado (`not('id', 'in', '(…)')`), y `upsert` en `contactos_compartidos` por `contacto_id,usuario_id`:
  `…0005` → demo como `editor`, `…0001` → invitado como `lector`. Al terminar imprime un resumen (sin claves).

- [ ] **Step 1: Resolver los SHA de las acciones**: para `actions/configure-pages`,
`actions/upload-pages-artifact` y `actions/deploy-pages`, `gh api repos/actions/<accion>/releases/latest --jq .tag_name`
y `gh api repos/actions/<accion>/git/ref/tags/<tag> --jq '.object.sha'` (si `.object.type` es `tag`,
desreferenciar con `gh api repos/actions/<accion>/git/tags/<sha> --jq .object.sha`). `checkout` y
`setup-node` reutilizan los SHA de `ci.yml`.

- [ ] **Step 2: Escribir `deploy.yml` y `keep-alive.yml`** según Interfaces. Verificar sintaxis:
`docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest` (actionlint sobre todos los workflows).

- [ ] **Step 3: Escribir `scripts/seed-demo.mjs` y probarlo en local**

Run: `eval "$(npx supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY|SECRET_KEY)=')"; SUPABASE_URL=$API_URL SUPABASE_SECRET_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY} npm run seed:demo`
Expected: resumen con 2 usuarios, 5 contactos y 2 comparticiones;
`npx supabase db query --local "select email from public.perfiles order by 1"` → `demo@jasato.com`, `invitado@jasato.com`
(más los de pruebas anteriores). Ejecutarlo dos veces no duplica nada.

- [ ] **Step 4: Prueba manual local**: entrar como `demo@jasato.com` / `agenda-demo-2026` →
4 contactos propios y «Ada Lovelace» como `editor` en «Compartidos conmigo».

- [ ] **Step 5: Commits** — `ci: desplegar migraciones y GitHub Pages, y mantener vivo el proyecto` y
`feat: script de datos de demostración`

---

### Task 13: Configurar el proyecto real, publicar y cerrar

**Files:**
- Modify: `README.md` (reescritura completa), `~/projects/STATUS.md`

- [ ] **Step 1 (autor, dashboard de Supabase):**
Authentication → Providers → Email: *Confirm email* activado, *Minimum password length* 8.
Authentication → URL Configuration: *Site URL* `https://jaisato.github.io/agenda-supabase/`;
*Redirect URLs* `https://jaisato.github.io/agenda-supabase/**` y `http://localhost:4200/**`.
Authentication → Emails → SMTP Settings: activar; *Sender email* `agenda@jasato.com`, *Sender name*
`Agenda`, *Host* `smtp.resend.com`, *Port* `465`, *Username* `resend`, *Password* = API key de Resend
creada en Resend → API Keys con permiso *Sending access* y dominio `jasato.com`.
Authentication → Emails → Templates: *Confirm signup*: asunto «Confirma tu cuenta en Agenda», cuerpo
`<h2>Confirma tu cuenta</h2><p>Pulsa el enlace para activar tu cuenta en Agenda:</p><p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p><p>Si no te has registrado, ignora este correo.</p>`;
*Reset password*: asunto «Cambia tu contraseña de Agenda», cuerpo
`<h2>Cambiar la contraseña</h2><p>Pulsa el enlace para elegir una contraseña nueva:</p><p><a href="{{ .ConfirmationURL }}">Cambiar mi contraseña</a></p><p>Si no lo has pedido, ignora este correo.</p>`.
Opcional: Project Settings → General → renombrar el proyecto a `agenda`.
(Alternativa: con un PAT acotado, la sesión lo hace por la Management API, `PATCH /v1/projects/{ref}/config/auth`.)

- [ ] **Step 2 (autor, GitHub):** crear en Supabase (Account → Access Tokens) un **PAT acotado** al
proyecto `zckmejrnscenxwiqykkh` con los permisos que la guía de PAT indica para `supabase link` y
`db push`, con caducidad; comprobarlo en local con `SUPABASE_ACCESS_TOKEN=… npx supabase link --project-ref zckmejrnscenxwiqykkh && npx supabase db push --linked --dry-run`;
después `gh secret set SUPABASE_ACCESS_TOKEN`, `gh secret set SUPABASE_DB_PASSWORD` (contraseña de la
BD, en Project Settings → Database) y `gh variable set SUPABASE_PROJECT_REF --body zckmejrnscenxwiqykkh`.
Nada de esto pasa por el chat.

- [ ] **Step 3: Reescribir el README** con estas secciones: qué es y qué demuestra; demo (URL de Pages y
`demo@jasato.com` / `agenda-demo-2026`); arquitectura (diagrama de §4 y por qué RLS + privilegios por
columna); puesta en marcha local (`npm ci`, `npx supabase start`, `npm run seed:demo` con las variables
de `supabase status -o env`, `npm start`, Mailpit); scripts; tests (`npm test`, `npx supabase test db`);
migraciones (`npx supabase migration new`, regenerar tipos); despliegue (qué hace `deploy.yml`, secretos
y variable); decisiones y límites (plan free, `keep-alive`, el mensaje de la RPC revela si existe la
cuenta); créditos del origen (KeepCoding). Commit: `docs: README como runbook de la agenda sobre Supabase`.

- [ ] **Step 4: Abrir la PR `feat/supabase` → `master`** (`gh pr create`, cuerpo con el resumen y el pie de
atribución), esperar CI en verde, fusionarla (`gh pr merge --merge`), y verificar `deploy.yml`:
`gh api "repos/jaisato/agenda-supabase/actions/runs?branch=master&per_page=3"` → `Deploy success`;
`curl -s -o /dev/null -w '%{http_code}' https://jaisato.github.io/agenda-supabase/` → `200`;
`curl -s -H "apikey: <publishable>" https://zckmejrnscenxwiqykkh.supabase.co/rest/v1/contactos?select=id` →
error `42501` (sin sesión no se ve nada).

- [ ] **Step 5: Advisors** (MCP `get_advisors`, `security` y `performance`) sobre el proyecto: cero avisos
sobre RLS, `search_path` o funciones expuestas; si aparece alguno, corregirlo con una migración nueva.

- [ ] **Step 6: Datos de demo en el proyecto real (autor, en su máquina):**
`SUPABASE_URL=https://zckmejrnscenxwiqykkh.supabase.co SUPABASE_SECRET_KEY=<clave secreta> npm run seed:demo`.

- [ ] **Step 7: Proteger `master`:** `gh api -X PUT repos/jaisato/agenda-supabase/branches/master/protection --input -`
con `{"required_status_checks":{"strict":true,"contexts":["Build, tests y npm audit","Base de datos"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null}`.

- [ ] **Step 8: Aceptación manual (§9 de la spec)** en la URL de Pages, marcando cada punto: registro con
un correo real (llega vía Resend desde `agenda@jasato.com`) → confirmar → entrar → crear, editar,
compartir con `demo@jasato.com` como lector → entrar como demo y ver la etiqueta → ascender a editor y
editar desde demo → revocar → borrar; recuperar contraseña; «Dejar de ver» desde demo.

- [ ] **Step 9: Cierre:** rotar la clave secreta de Supabase (Project Settings → API Keys: crear una
nueva, borrar la antigua), anotar en `~/projects/STATUS.md` (URL, PR, pendientes) y cerrar la PR #15
de diseño fusionándola o incorporando `docs/` en `feat/supabase`.
