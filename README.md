# agenda-supabase

Agenda de contactos multiusuario con Angular 22 y Supabase. Cada persona gestiona sus contactos y
puede compartirlos con otras como `lector` o como `editor`. La aplicación no decide quién puede
qué: lo decide Postgres, con políticas RLS, privilegios por columna y una única RPC
`SECURITY DEFINER` para compartir. Se publica en GitHub Pages y sus migraciones se aplican al
proyecto de Supabase con GitHub Actions.

**Demo:** <https://jaisato.github.io/agenda-supabase/> con `demo@jasato.com` / `agenda-demo-2026`.

## Contenido

- [Qué es y qué demuestra](#qué-es-y-qué-demuestra)
- [Demo](#demo)
- [Arquitectura](#arquitectura)
- [Puesta en marcha local](#puesta-en-marcha-local)
- [Scripts](#scripts)
- [Tests](#tests)
- [Migraciones](#migraciones)
- [Despliegue](#despliegue)
- [Operación](#operación)
- [Decisiones y límites](#decisiones-y-límites)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Créditos](#créditos)

## Qué es y qué demuestra

Una agenda de contactos con cuentas de usuario. Cada persona ve sus contactos y los que otras le
comparten: con el rol `lector` solo los ve; con el rol `editor` también los edita. Solo el
propietario borra un contacto y lo comparte. Es un proyecto de portfolio, y la aplicación es
pequeña a propósito para que se vea lo importante:

- **La autorización vive en la base de datos.** El navegador habla directamente con Supabase
  (`supabase-js`); no hay API propia. Qué filas y qué columnas toca cada usuario lo deciden las
  políticas RLS, los privilegios por columna y unas funciones del esquema `privado`.
- **Las políticas están probadas, también contra el abuso.** Los tests pgTAP intentan robar un
  contacto, insertar comparticiones a mano, ver perfiles ajenos y actuar sin sesión.
- **Autenticación por correo.** Registro con confirmación (los correos salen por el SMTP de
  Resend), flujo PKCE y recuperación de contraseña.
- **Migraciones versionadas** en `supabase/migrations`, con lint del esquema y tipos de TypeScript
  generados a partir de él; el CI comprueba que los tipos están al día.
- **CI y despliegue automáticos.** Dos jobs de CI en cada PR (aplicación y base de datos); al
  fusionar en `master`, un workflow aplica las migraciones al proyecto real y publica el frontend
  en GitHub Pages.

## Demo

<https://jaisato.github.io/agenda-supabase/>

| Cuenta            | Contraseña         |
| ----------------- | ------------------ |
| `demo@jasato.com` | `agenda-demo-2026` |

La cuenta demo tiene cuatro contactos propios (Tim Cook, Bill Gates, Elon Musk y Steve Jobs).
`invitado@jasato.com` es una cuenta que solo existe para dar y recibir comparticiones (nadie entra
con ella): Ada Lovelace es de invitado y está compartida con demo como `editor`, y Tim Cook es de
demo y está compartido con invitado como `lector`. Para ver cómo cambia la interfaz según el rol:

- En «Compartidos conmigo», Ada Lovelace lleva la etiqueta `editor`; su detalle ofrece «Editar» y
  «Dejar de ver», pero no «Eliminar contacto».
- En Tim Cook, que es propio, «Compartir» abre la lista de personas con acceso, donde se cambia el
  rol o se revoca.
- También puedes crear tu propia cuenta: la confirmas con el enlace que llega por correo.

La cuenta demo es pública: cualquiera puede cambiar sus datos (ver
[Decisiones y límites](#decisiones-y-límites)). `npm run seed:demo` los restaura.

## Arquitectura

```text
Navegador ── Angular 22 (GitHub Pages) ── supabase-js (publishable key + JWT del usuario)
                                              │
                      ┌───────────────────────┼───────────────────────┐
                 Auth (GoTrue)          Data API (PostgREST)      (Storage/Realtime: no en v1)
                 correo vía Resend             │
                                        Postgres 17 ── RLS + permisos por columna
                                                   ── privado.* (SECURITY DEFINER)
                                                   ── public.compartir_contacto()
```

La aplicación nunca usa la clave secreta. Toda autorización se decide en Postgres con la identidad
del JWT (`auth.uid()`); la app solo decide qué botones mostrar a partir del rol que ya le llega
filtrado. El esquema está en
[`supabase/migrations/20261011114625_inicial.sql`](supabase/migrations/20261011114625_inicial.sql)
(más el límite de 100 caracteres de `perfiles.nombre`, que añade la migración siguiente) y el
diseño, con las alternativas descartadas, en
[`docs/superpowers/specs/2026-10-10-agenda-supabase-design.md`](docs/superpowers/specs/2026-10-10-agenda-supabase-design.md).

### Modelo de datos

- `perfiles`: una fila por usuario de `auth.users` (`email`, `nombre`, `creado_en`), que mantiene
  el trigger `privado.crear_perfil`.
- `contactos`: los contactos. `propietario_id` es el dueño y por defecto vale `auth.uid()`.
- `contactos_compartidos`: quién tiene acceso a qué contacto y con qué rol (`rol_comparticion`:
  `lector` o `editor`).
- `privado.*`: funciones `SECURITY DEFINER` (para las políticas) y de trigger. El esquema no está
  expuesto en la Data API.
- `public.compartir_contacto(p_contacto_id, p_email, p_rol)`: la RPC con la que se comparte un
  contacto y la única forma de crear una compartición.

### Quién puede qué

| Acción sobre un contacto                       | Propietario | Editor | Lector |
| ---------------------------------------------- | ----------- | ------ | ------ |
| Verlo                                          | sí          | sí     | sí     |
| Editar sus datos                               | sí          | sí     | no     |
| Cambiar `propietario_id` o `id`                | no          | no     | no     |
| Borrarlo                                       | sí          | no     | no     |
| Compartirlo, cambiar un rol o revocar          | sí          | no     | no     |
| Dejar de verlo (borrar su propia compartición) | —           | sí     | sí     |

### Por qué RLS y privilegios por columna

- **RLS decide qué filas.** Un contacto lo ve su propietario o quien tiene una compartición; lo
  edita el propietario o un editor; lo borra solo el propietario. Todas las políticas son
  `to authenticated` y usan `(select auth.uid())`, que Postgres evalúa una vez por consulta.
- **Los privilegios por columna deciden qué columnas.** RLS sola no impide que un editor, que sí
  puede actualizar la fila, cambie `propietario_id` y se quede el contacto (o se lo regale a otro
  usuario): la política de `update` lo dejaría pasar. Por eso `authenticated` solo tiene `update`
  sobre `nombre`, `apellidos`, `email`, `telefono`, `facebook` y `twitter`. Un `update` que toque
  `propietario_id` o `id` falla con `permission denied` (`42501`) antes de llegar a las políticas.
  Por la misma razón `insert` no incluye `propietario_id`: el dueño sale siempre del
  `default auth.uid()`.
- **`anon` no tiene ningún privilegio.** Supabase concede por defecto todos los privilegios de las
  tablas nuevas de `public` a `anon` y `authenticated`; la migración los revoca y concede solo lo
  necesario. Sin sesión, la Data API responde `401` con `42501` (ver [Tests](#tests)).
- **Las funciones de `privado` evitan la recursión.** Las políticas de `contactos` consultan
  `contactos_compartidos` y viceversa, y Postgres abortaría por recursión infinita.
  `privado.es_propietario`, `privado.rol_compartido` y `privado.es_contraparte` consultan la otra
  tabla sin pasar por su RLS (`SECURITY DEFINER`, `set search_path = ''`). Postgres concede
  `EXECUTE` a `public` por defecto: la migración lo revoca y solo `authenticated` ejecuta estas
  tres.
- **Solo la RPC crea comparticiones.** `contactos_compartidos` no tiene `insert`. La función
  `compartir_contacto` comprueba que quien llama es el propietario, busca a la persona por email
  en `perfiles` (que cada usuario solo lee en parte: el suyo y los de sus contrapartes, es decir,
  quien le comparte contactos y aquellos con quienes los comparte), normaliza el email (minúsculas
  y sin espacios en los extremos) y, si ya estaba compartido, cambia el rol en vez de duplicar.
  Sus errores son `42501` (quien llama no es el propietario), `PT404` (no hay nadie con ese email)
  y `22023` (compartir con uno mismo). `PT404` y no `P0002`: PostgREST responde `500` a
  `P0002`, y un código `PTxxx` llega al cliente con el estado `xxx` y `code: 'PT404'`. La
  aplicación distingue los errores por `error.code`, nunca por el estado HTTP.

### La aplicación Angular

Componentes _standalone_ y sin zone.js: la detección de cambios la disparan los signals, los
inputs y los eventos de las plantillas, así que lo que cambia después de un `await` se guarda en
signals. Los estilos son skeleton-css y Font Awesome 4.7, declarados en `angular.json`. Las rutas
están en `src/app/app.routes.ts`:

- `/entrar`, `/registro` y `/auth/recuperar`: solo sin sesión (`sinSesionGuard`).
- `/auth/confirmar` y `/auth/nueva-contrasena`: destino de los enlaces de los correos
  (`?code=…`), sin guard. Canjean el `code` PKCE por la sesión.
- `/mis-contactos` («Mis contactos» y «Compartidos conmigo», con la etiqueta del rol, y el detalle
  del seleccionado), `/nuevo-contacto`, `/contactos/:id/editar` y `/contactos/:id/compartir`:
  llevan `authGuard`, que sin sesión redirige a `/entrar`.
- Cualquier otra ruta redirige a `/mis-contactos`.

`AuthService` expone la sesión como signals; `ContactosService` envuelve las consultas, la RPC y
las comparticiones con Promesas; `MensajesService` pinta el aviso global y traduce los errores
por su `error.code`. El cliente (token `SUPABASE`, en `src/app/supabase/supabase.client.ts`) usa el
flujo PKCE con `detectSessionInUrl: false`: el canje del `code` es explícito en las dos rutas
`auth/*`, porque con la detección automática `supabase-js` lo consumiría al crearse el cliente.

## Puesta en marcha local

Necesitas:

- Node.js 24.21.0, la versión de `.nvmrc` y la que usa el CI. Angular 22 admite
  `^22.22.3 || ^24.15.0 || >=26.0.0`, el rango que declara `engines` en `package.json`.
- npm (el que trae Node 24).
- Docker en marcha: el backend local son los contenedores de la CLI de Supabase. La CLI no hace
  falta instalarla: es una `devDependency` con la versión fijada (2.120.0) y se usa como
  `npx supabase`.

```sh
nvm use                 # Node 24.21.0 (la primera vez, antes: nvm install)
npm ci
npx supabase start      # la primera vez descarga las imágenes de Docker
```

`npm ci` no ejecuta los scripts de instalación de las dependencias (`ignore-scripts=true` en
`.npmrc`): ninguna los necesita, porque los binarios de esbuild, lmdb, msgpackr-extract,
@parcel/watcher y de la CLI de Supabase llegan precompilados como dependencias opcionales.

La primera vez, `start` crea la base, aplica las migraciones y ejecuta `supabase/seed.sql`
(`npx supabase db reset` lo repite desde cero). El stack local queda en:

| Servicio                 | Dirección                |
| ------------------------ | ------------------------ |
| API (Auth y Data API)    | <http://127.0.0.1:54321> |
| Postgres                 | `127.0.0.1:54322`        |
| Studio                   | <http://127.0.0.1:54323> |
| Mailpit (correo de Auth) | <http://127.0.0.1:54324> |

Con el stack en marcha, crea los datos de la demo con las variables que imprime
`npx supabase status -o env`:

```sh
eval "$(npx supabase status -o env | grep -E '^(API_URL|SECRET_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_SECRET_KEY="$SECRET_KEY" npm run seed:demo
```

`seed:demo` lee `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del entorno, nunca del repo, y no imprime la
clave. Crea `demo@jasato.com` e `invitado@jasato.com` (con el email ya confirmado), sus cinco
contactos y las dos comparticiones. Es idempotente: se puede repetir las veces que haga falta.

Después, arranca la aplicación:

```sh
npm start               # http://localhost:4200
```

`npm start` (`ng serve`) usa `src/environments/environment.development.ts`, que apunta al stack
local (`http://127.0.0.1:54321`). `npm run build` y `npm run build:pages` usan
`src/environments/environment.ts`, que apunta al proyecto real.

Entra con `demo@jasato.com` / `agenda-demo-2026`, o crea una cuenta en `/registro`. En local la
confirmación de email también está activa (`supabase/config.toml` replica la configuración de
producción), pero los correos no salen a Internet: llegan a Mailpit, en
<http://127.0.0.1:54324>. Abre ahí el enlace de confirmación en el mismo navegador en que te
registraste (ver [Decisiones y límites](#decisiones-y-límites)).

Para parar el stack, `npx supabase stop`. Para dejar la base local limpia, `npx supabase db reset`:
borra también la demo, así que vuelve a lanzar `seed:demo`.

## Scripts

| Script                      | Qué hace                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `npm start`                 | `ng serve` en <http://localhost:4200>, con el stack local.         |
| `npm run build`             | Build de producción en `dist/agenda/browser/` (proyecto real).     |
| `npm run build:pages`       | Igual, con `--base-href /agenda-supabase/` (lo que publica Pages). |
| `npm run watch`             | `ng build --watch` con la configuración de desarrollo.             |
| `npm test`                  | Vitest en modo _watch_ (en una terminal).                          |
| `npm test -- --watch=false` | Una sola pasada (lo que ejecuta el CI).                            |
| `npm run seed:demo`         | Crea o restaura la cuenta demo y sus datos.                        |
| `npm run ng -- <comando>`   | La CLI de Angular.                                                 |

La CLI de Supabase se invoca siempre como `npx supabase`:

| Comando                                                      | Qué hace                                              |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `npx supabase start` / `npx supabase stop`                   | Arranca o para el stack local.                        |
| `npx supabase status -o env`                                 | URLs y claves del stack local, como `NOMBRE="valor"`. |
| `npx supabase db reset`                                      | Base local limpia: migraciones y `supabase/seed.sql`. |
| `npx supabase migration new <nombre>`                        | Crea una migración vacía.                             |
| `npx supabase migration up`                                  | Aplica las migraciones pendientes, sin borrar datos.  |
| `npx supabase test db [fichero]`                             | Tests pgTAP.                                          |
| `npx supabase db lint --local --fail-on warning`             | Lint del esquema; falla con cualquier aviso.          |
| `npx supabase gen types --local --lang typescript -s public` | Tipos de TypeScript del esquema `public`.             |

## Tests

```sh
npm test                    # Vitest, en modo watch
npm test -- --watch=false   # una sola pasada (lo que ejecuta el CI)
npx supabase test db        # pgTAP sobre la base local (necesita el stack en marcha)
```

Para ejecutar un solo fichero:
`npm test -- --watch=false --include src/app/mensajes.service.spec.ts` (Vitest) o
`npx supabase test db supabase/tests/03_compartir.sql` (pgTAP).

**Vitest** (`src/**/*.spec.ts`, con jsdom) prueba la aplicación con un doble del cliente de
Supabase, `src/app/testing/supabase-falso.ts` (con su propio spec de contrato), que simula las
cadenas `from().select().eq()…` y `rpc()`. No toca la red. La autorización no se prueba aquí, sino
en pgTAP.

**pgTAP** (`supabase/tests/*.sql`): cada fichero corre dentro de una transacción que se deshace,
crea sus usuarios con `pruebas.crear_usuario(…)` y cambia de identidad con
`pruebas.autenticar('a@test.local')` y `pruebas.anonimo()`, que fijan el rol y las claims del JWT
como hace PostgREST. Esos helpers `pruebas.*` viven en `supabase/seed.sql`: existen en las bases
locales y nunca se despliegan.

- `01_esquema.sql`: tablas, enum y funciones; RLS activada en las tres tablas; las políticas
  exactas de cada tabla, todas solo para `authenticated`; los privilegios exactos (`anon` sin
  ninguno, `authenticated` con `insert` y `update` solo en las columnas de datos); el `EXECUTE` de
  las funciones de `privado`, y que ninguna sea ejecutable por `public`.
- `02_contactos.sql`: cada usuario ve y toca solo lo suyo (otro usuario no ve, edita ni borra sus
  contactos); insertar un contacto a nombre de otro falla con `42501`; semántica de lector y
  editor; borrar un contacto borra sus comparticiones; `anon` no lee.
- `03_compartir.sql`: la RPC y las políticas de `contactos_compartidos`. Un lector ve pero no
  edita; un editor edita, pero su `update` de `propietario_id` falla con `permission denied` y no
  borra, no comparte ni inserta comparticiones a mano; «dejar de ver» y revocar; compartir con uno
  mismo o con un email sin cuenta da el error previsto; el email con mayúsculas y espacios se
  encuentra; volver a compartir cambia el rol sin duplicar; `anon` no ejecuta la RPC.
- `04_perfiles.sql`: nadie ve el perfil de otro hasta que hay una compartición entre ambos, y un
  tercero nunca, aunque reciba contactos del mismo dueño; cada uno solo edita su `nombre`, de 100
  caracteres como mucho; el email del perfil sigue al de `auth.users`.

**Sin sesión no se ve nada.** Con el stack local en marcha:

```sh
eval "$(npx supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
curl -s -H "apikey: $PUBLISHABLE_KEY" "$API_URL/rest/v1/contactos?select=id"
```

Responde `401` con `{"code":"42501", … "message":"permission denied for table contactos"}`: `anon`
no tiene ningún privilegio. Contra producción es lo mismo con la URL y la publishable key de
`src/environments/environment.ts`.

### CI

[`ci.yml`](.github/workflows/ci.yml) corre en cada PR y en los push a `master`, con dos jobs en
paralelo. Son los dos checks que exige la protección de `master`.

- **«Build, tests y npm audit»**: `npm ci`, `npx ng build`, `npx ng test --watch=false` y
  `npm audit --audit-level=low`.
- **«Base de datos»**: arranca el stack local sin los servicios que la agenda no usa
  (`npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio`),
  y ejecuta `npx supabase db reset`, `npx supabase test db`,
  `npx supabase db lint --local --fail-on warning` y la comprobación de que
  `src/app/supabase/database.types.ts` coincide con el esquema (`gen types` seguido de
  `git diff --exit-code`). Tiene un límite de 15 minutos: un arranque colgado no ocupa el runner
  las 6 horas que GitHub da por defecto a un job.

## Migraciones

Son imperativas: SQL escrito a mano en `supabase/migrations`, una migración nueva por cada cambio.
Una migración ya desplegada no se edita (Supabase solo aplica las que le faltan): se añade otra. No
hay migraciones _down_; un cambio se deshace con otra migración.

```sh
npx supabase migration new <nombre>   # crea supabase/migrations/<timestamp>_<nombre>.sql vacío
# …escribe el SQL y los tests pgTAP que lo cubren…
npx supabase db reset                 # lo aplica todo desde cero, como el CI
npx supabase test db
npx supabase db lint --local --fail-on warning
npx supabase gen types --local --lang typescript -s public > src/app/supabase/database.types.ts
```

`npx supabase migration up` aplica solo la nueva, sin borrar los datos locales. `database.types.ts`
es un fichero generado: no se edita a mano, está excluido de Prettier (`.prettierignore`) y el CI
falla si no coincide con el esquema, así que se commitea junto con la migración.

Reglas al escribir una migración:

- Tabla nueva en `public`: `enable row level security`, `revoke all … from anon, authenticated`
  (Supabase concede por defecto todos los privilegios a los dos roles) y `grant` solo de lo
  necesario, con `insert` y `update` por columna.
- Políticas `to authenticated` y con `(select auth.uid())`.
- Funciones con `set search_path = ''`; `SECURITY DEFINER` solo en `privado.*` y en
  `public.compartir_contacto`.
- Cada función nueva de `privado` necesita su propio `revoke execute … from public`. Un
  `alter default privileges` no sirve: no resta el privilegio global por defecto de `public`.
  `01_esquema.sql` falla si alguna función de `privado` lo conserva.
- Un test pgTAP para el caso normal y otro para el intento de abuso.

Al fusionar en `master`, `deploy.yml` aplica las migraciones nuevas al proyecto real (ver
[Despliegue](#despliegue)). La configuración de Authentication del proyecto no es una migración.

## Despliegue

Todo cambio entra por PR. Al fusionar en `master`, [`deploy.yml`](.github/workflows/deploy.yml) se
ejecuta con dos jobs encadenados:

1. **`migraciones`**: `npm ci` y, en un solo paso,
   `npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --yes` y
   `npx supabase db push --linked --yes` (`--yes` contesta a las preguntas de la CLI, como la
   confirmación de las migraciones que se van a aplicar: en CI no hay nadie que las conteste).
   `db push` aplica solo las migraciones pendientes de `supabase/migrations` (si no hay ninguna, no
   hace nada) y no ejecuta `supabase/seed.sql`, así que los helpers `pruebas.*` no llegan a
   producción. Los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` y la variable
   `SUPABASE_PROJECT_REF` llegan solo a ese paso. El job solo tiene permiso de lectura sobre el
   repositorio (los de Pages son del job siguiente) y un límite de 15 minutos.
2. **`pages`** (`needs: migraciones`: si las migraciones fallan, el frontend no se publica):
   `npm run build:pages`, copia de `index.html` a `404.html` y despliegue en Pages
   (`configure-pages`, `upload-pages-artifact` y `deploy-pages`). La copia sirve para que los
   enlaces profundos —los de los correos, como `/auth/confirmar?code=…`— arranquen la SPA: GitHub
   Pages sirve `404.html` en las rutas que no existen como fichero.

Solo hay un despliegue a la vez y no se cancela el que está en marcha (`concurrency: deploy`):
cancelar a mitad de un `db push` dejaría las migraciones a medias. Las acciones están fijadas por
SHA y Dependabot las actualiza cada mes.

**«Deploy tras CI verde».** `deploy.yml` no vuelve a ejecutar las pruebas: lo garantiza la
protección de `master`, que exige los checks «Build, tests y npm audit» y «Base de datos», la rama
al día y vale también para administradores. Con ella, a `master` solo llega, por PR, lo que ha
pasado el CI.

### Configuración que no vive en el repositorio

**GitHub**

- Pages: _Source_ = GitHub Actions.
- Secretos y variable que lee `deploy.yml` (`gh secret set` te pide el valor):

  ```sh
  gh secret set SUPABASE_ACCESS_TOKEN
  gh secret set SUPABASE_DB_PASSWORD
  gh variable set SUPABASE_PROJECT_REF --body zckmejrnscenxwiqykkh
  ```

- Protección de `master`: PR obligatoria, checks requeridos «Build, tests y npm audit» y «Base de
  datos», rama al día y también para administradores.

**Supabase, en Authentication** (la configuración local equivalente está en `supabase/config.toml`)

- Confirmación de email activada y contraseña mínima de 8 caracteres.
- Site URL `https://jaisato.github.io/agenda-supabase/` y Redirect URLs
  `https://jaisato.github.io/agenda-supabase/**` y `http://localhost:4200/**`.
- SMTP de Resend: host `smtp.resend.com`, puerto `465`, usuario `resend`, remitente
  `agenda@jasato.com` (nombre `Agenda`). Sin SMTP propio, Supabase solo entrega correos a los
  miembros del equipo del proyecto, así que la demo pública lo necesita. Con SMTP propio el límite
  inicial es de 30 correos por hora (se ajusta en Authentication → Rate Limits); se deja así.
- Plantillas «Confirma tu cuenta en Agenda» (registro) y «Cambia tu contraseña de Agenda»
  (recuperación), las dos con el enlace `{{ .ConfirmationURL }}`.

**Dónde vive cada clave**

- URL del proyecto y publishable key: en el repositorio (`src/environments/environment.ts`).
  Son públicas por diseño.
- Cuenta demo: en el repositorio y en este README. Es pública.
- `SUPABASE_ACCESS_TOKEN`: secreto de GitHub. Token de acceso de Supabase acotado a este proyecto
  y con caducidad.
- `SUPABASE_DB_PASSWORD`: secreto de GitHub. Contraseña de la base de datos del proyecto.
- `SUPABASE_PROJECT_REF`: variable de GitHub. Referencia del proyecto; no es secreta.
- Contraseña SMTP: solo en el dashboard de Supabase. Es una API key de Resend de solo envío y
  limitada al dominio `jasato.com`.
- Clave secreta de Supabase: solo en el entorno de quien ejecuta `seed:demo`.

Nada de esto va al repositorio. La publishable key viaja en el JS del navegador: lo que protege los
datos es la RLS, no la clave. La clave secreta se salta la RLS y da acceso a la API de
administración de usuarios; la aplicación nunca la usa.

## Operación

### Mantener vivo el proyecto (`keep-alive.yml`)

Supabase pausa un proyecto Free que durante una semana no tiene actividad real de usuario en la
base de datos; según su
[documentación](https://supabase.com/docs/guides/platform/free-project-pausing), bastan unas
pocas peticiones al día. Una petición a `/auth/v1/health` no sirve: GoTrue contesta con un JSON
fijo sin consultar Postgres. Por eso [`keep-alive.yml`](.github/workflows/keep-alive.yml) corre
**dos veces al día (06:17 y 18:17 UTC)**: inicia sesión con la cuenta demo pública, lee un contacto
(`GET /rest/v1/contactos?select=id&limit=1`, que ejecuta una consulta en Postgres con RLS) y cierra
esa sesión (`scope=local`, para no echar a quien esté probando la demo). Son dos al día y no una a
la semana para dejar margen si GitHub retrasa u omite alguna ejecución. También se lanza a mano,
desde la pestaña Actions o con `gh workflow run keep-alive.yml`.

Límites:

- GitHub desactiva los workflows programados de un repositorio público tras 60 días sin actividad
  en el repo. Se reactivan desde la pestaña Actions o con `gh workflow enable keep-alive.yml`.
- Supabase avisa por correo antes de pausar el proyecto, y un proyecto pausado se puede restaurar a
  mano desde el dashboard.
- Si alguien cambia la contraseña de la cuenta demo, el workflow falla: es la señal visible.
  `npm run seed:demo` la restaura.

### Restaurar la demo

La cuenta demo es pública y cualquiera puede cambiar sus datos o su contraseña. `seed:demo` crea o
actualiza `demo@jasato.com` e `invitado@jasato.com`, repone los cinco contactos y las dos
comparticiones, y borra los demás contactos de esas dos cuentas (los de nadie más no se tocan).
Contra el proyecto real hace falta la clave secreta de Supabase, solo en el entorno del comando
(no la guardes en ningún fichero):

```sh
SUPABASE_URL=https://zckmejrnscenxwiqykkh.supabase.co SUPABASE_SECRET_KEY=<clave secreta> npm run seed:demo
```

### Incidencias y rotaciones

- **`deploy.yml` falla en `migraciones` al autenticarse**: el token de acceso caducó o se revocó.
  Crea otro (Supabase → Account → Access Tokens, acotado al proyecto y con caducidad) y
  `gh secret set SUPABASE_ACCESS_TOKEN`.
- **`keep-alive.yml` falla al entrar con un 400**: la cuenta demo ya no existe o su contraseña
  cambió. `npm run seed:demo` contra el proyecto real. Con otro error, Supabase no responde:
  mira si el proyecto está pausado.
- **Rotar la clave secreta**: en el dashboard (Project Settings → API Keys), crea una nueva y borra
  la antigua. No hay nada que cambiar en el repositorio, porque solo la usa `seed:demo`, desde el
  entorno.

## Decisiones y límites

- **Plan Free de Supabase.** Sin _branching_ ni backups automáticos: el esquema se reconstruye con
  las migraciones y la demo con `seed:demo`; si algún día hubiera datos que importen, habría que
  hacer `supabase db dump` a mano. El proyecto se pausa tras una semana sin actividad real; ver
  [`keep-alive.yml`](#operación).
- **La RPC revela si existe la cuenta.** `compartir_contacto` responde «No hay ningún usuario con
  ese email» (`PT404`) cuando no hay cuenta con ese email, como hace Google Docs: es una decisión
  consciente, a cambio de un error útil. Cualquier persona con sesión y un contacto propio puede
  averiguar así si un email está registrado. El registro (en producción) y la pantalla de
  recuperación de contraseña no lo revelan.
- **Compartir no requiere aceptación del destinatario.** Quien conozca tu email puede compartirte
  un contacto y, mientras dure esa compartición, ver el `nombre` público de tu perfil y su fecha
  de alta (la política de `perfiles` deja ver el perfil de las contrapartes). Es la misma
  superficie que el aviso anterior, porque el email ya lo conocía quien comparte; `nombre` es un
  nombre público que cada usuario elige y la aplicación aún no tiene pantalla para ponerlo. Quien
  recibe un contacto que no quiere puede dejar de verlo; si no comparten nada más, su perfil deja
  de ser visible para quien se lo compartió.
- **La cuenta demo es pública.** Cualquiera puede cambiar los datos y la contraseña de
  `demo@jasato.com`; la RLS limita el daño a lo que esa cuenta puede ver y editar. `seed:demo`
  (idempotente) restaura los datos y la contraseña.
- **Registro con un email ya registrado.** En local, GoTrue responde `user_already_exists` (HTTP
  422; la configuración local autoconfirma SMS) y la aplicación muestra «Ya existe una cuenta con
  ese email». En producción, con la confirmación de email activa, GoTrue lo oculta
  (anti-enumeración) y la pantalla muestra igualmente «Revisa tu correo».
- **Los enlaces de los correos se abren en el mismo navegador en que se pidieron.** Es el flujo
  PKCE: el `code_verifier` se guarda en el navegador que inició el registro o la recuperación, y
  sin él no se puede canjear el `code`; por eso las dos pantallas lo recuerdan al enviar el correo.
  El enlace de confirmación abierto en otro navegador sí confirma la cuenta (lo hace el servidor
  al abrirlo), pero no abre sesión, y la pantalla lo explica: «No hemos podido confirmar la cuenta.
  El enlace puede haber caducado. Si lo abriste en otro navegador o dispositivo, la cuenta ya está
  confirmada: entra con tu email y contraseña.» Un enlace de recuperación hay que pedirlo de nuevo.
- **`seed:demo` solo gestiona usuarios creados por GoTrue**, no insertados a mano por SQL en
  `auth.users`: GoTrue no sabe listar esas filas y `seed:demo` falla con «Database error finding
  users». Los tests pgTAP los insertan a mano, pero dentro de transacciones que se deshacen.
- **Alcance.** Fuera de la v1: Storage (avatares), Realtime, OAuth, CAPTCHA, cambio de email,
  invitaciones a personas sin cuenta y pruebas E2E. El registro está abierto.

## Estructura del repositorio

| Ruta                    | Contenido                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `src/app/`              | La aplicación Angular: una carpeta por pantalla y `app.routes.ts`.                     |
| `src/app/supabase/`     | El cliente de Supabase y `database.types.ts` (generado).                               |
| `src/app/testing/`      | El doble del cliente de Supabase que usan los specs.                                   |
| `src/environments/`     | URL y publishable key: `environment.ts` (real) y `environment.development.ts` (local). |
| `supabase/migrations/`  | Migraciones SQL.                                                                       |
| `supabase/tests/`       | Tests pgTAP.                                                                           |
| `supabase/seed.sql`     | Helpers de los tests (`pruebas.*`); solo corre en local y en el CI.                    |
| `supabase/config.toml`  | Configuración del stack local: puertos y Authentication.                               |
| `scripts/seed-demo.mjs` | Los datos de la demo (`npm run seed:demo`).                                            |
| `.github/workflows/`    | `ci.yml`, `deploy.yml` y `keep-alive.yml`.                                             |

El diseño y el plan de implementación están en `docs/superpowers/`
([diseño](docs/superpowers/specs/2026-10-10-agenda-supabase-design.md),
[plan](docs/superpowers/plans/2026-10-11-agenda-supabase.md)). Los textos de la interfaz y los
commits (Conventional Commits) están en español, y los identificadores de la base de datos, en
español y sin tildes.

### Versiones y dependencias

- Angular 22 (CLI con el builder `@angular/build`), TypeScript 6.0 y Vitest 5 con jsdom.
- `@supabase/supabase-js` 2.117.3 y la CLI `supabase` 2.120.0, con versiones exactas.
- Dependabot propone cada semana las actualizaciones de npm (todo `@angular/*` en una sola PR, y
  `@supabase/*` con la CLI `supabase` en otra) y cada mes las de las acciones de GitHub. Las
  versiones mayores de Angular se hacen con `ng update`, que también aplica las migraciones de
  código. Por eso Dependabot no propone las mayores de `@angular/*`, ni las de vitest, tslib y rxjs
  (se salen de los peer de Angular 22), ni las mayores y menores de TypeScript (cada Angular
  admite un rango menor concreto).

## Créditos

El origen de esta agenda es una aplicación Angular hecha para el módulo 4 del 4.º Bootcamp
Startup de KeepCoding (2016): una lista de contactos ordenable, con detalle y enlaces a Facebook y
Twitter, alta con formulario validado y baja con confirmación, sobre Angular 2 y json-server. Este
repositorio conserva su historial; la versión actual la lleva a Angular 22 y la convierte en una
aplicación multiusuario sobre Supabase.
