# kc-boot4-angular

An Angular application for module 4 of the 4th Keepcoding Bootcamp Startup

Agenda de contactos: lista ordenable, detalle con enlaces a Facebook y Twitter, alta con
formulario validado y baja con confirmación. Los datos los sirve
[json-server](https://github.com/typicode/json-server) a partir de `db.json`.

## Requisitos

- Node.js 24.21.0, la versión de `.nvmrc` y la que usa el CI. Angular 22 admite
  `^22.22.3 || ^24.15.0 || >=26.0.0`, el rango que declara `engines` en `package.json`.
- npm (el que trae Node 24).

## Puesta en marcha

```sh
nvm use      # usa la versión de .nvmrc
npm ci
npm start
```

`npm start` lanza con `concurrently` dos procesos y para los dos con Ctrl+C:

- `npm run api`: la API en <http://localhost:3005/contactos>. Es json-server 0.17.4 usado como
  módulo desde `server.mjs`, para que solo acepte peticiones CORS de la aplicación
  (`http://localhost:4200`). Las altas y bajas se guardan en `db.json`.
- `ng serve`: la aplicación en <http://localhost:4200>.

`npm ci` no ejecuta los scripts de instalación de las dependencias (`ignore-scripts=true` en
`.npmrc`): ninguna los necesita, porque los binarios de esbuild, lmdb, msgpackr-extract y
@parcel/watcher llegan precompilados como dependencias opcionales.

## Scripts

| Script                      | Qué hace                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `npm start`                 | API (json-server) y servidor de desarrollo de Angular.          |
| `npm run api`               | Solo la API.                                                    |
| `npm run build`             | Build de producción en `dist/agenda/browser/`.                  |
| `npm test`                  | Pruebas unitarias con Vitest (en modo _watch_ en una terminal). |
| `npm test -- --watch=false` | Una sola pasada de las pruebas (lo que ejecuta el CI).          |
| `npm run test:api`          | Pruebas de `server.mjs` con el runner de Node.                  |

## Qué cambió respecto a la versión con Angular 2

La aplicación se comporta igual; cambian el entorno y algunos detalles internos:

- **Puerto.** La aplicación se sirve con `ng serve` en <http://localhost:4200>, no con lite-server
  en el 3000, y ya no abre el navegador. La API sigue en el 3005.
- **Arranque.** `npm start` ya no compila con `tsc` ni vigila los cambios con `tsc -w`: lo hace
  `ng serve`. Desaparecen SystemJS, `systemjs.config.js` y el `index.html` de la raíz (ahora
  `src/index.html`).
- **CORS de la API.** La CLI de json-server respondía a cualquier origen, con credenciales, así que
  cualquier web abierta en el navegador podía leer y modificar `db.json`. `server.mjs` solo
  acepta el origen de `ng serve`. Si cambias su puerto, cambia también `ORIGEN_PERMITIDO`.
  Como CORS no impide que la petición llegue, también rechaza con 403 las escrituras con otro
  `Origin` (un `<form>` de cualquier web podía dar de alta contactos con un POST
  `x-www-form-urlencoded`) y las peticiones cuyo `Host` no es `localhost`, `127.0.0.1` o `[::1]`
  (DNS rebinding). `npm run test:api` lo comprueba.
- **Consola.** `FormularioContactoComponent` ya no vuelca el formulario con `console.log` al dar
  de alta un contacto. Los errores del alta se siguen registrando con `console.error`, con el
  mismo mensaje.
- **Código retirado.** `actualizarListaContactos()`, que nadie llamaba.
- **Modelo.** `Contacto` pasa de clase a interfaz, con `id?: number` (antes `id: Number`): lo
  asigna json-server y el formulario no lo envía.
- **Errores del alta.** `agregarContacto()` propaga un `Error` con el mensaje, en lugar de la
  cadena sola.
- **Espacios en blanco.** Angular 6 dejó de conservar por defecto los espacios entre elementos de
  las plantillas. La barra de navegación y los botones de Facebook y Twitter usan
  `preserveWhitespaces: true` para mantener la separación de antes entre pestañas e iconos.

## Estructura

- `src/app/app.config.ts` y `src/app/app.routes.ts`: configuración de la aplicación y rutas
  (`/mis-contactos`, `/nuevo-contacto` y redirección del resto a `/mis-contactos`).
- `src/app/contactos.service.ts`: acceso a la API con `HttpClient`. La URL base es el
  `InjectionToken` `API_URL` (`src/app/api-url.token.ts`).
- `src/app/contactos.resolver.ts`: resolver funcional que carga los contactos antes de mostrar
  `/mis-contactos`; el componente los recibe como input (`withComponentInputBinding()`).
- `src/app/sort-contacts.pipe.ts`: pipe `SortContacts` que ordena por nombre y apellidos.
- Componentes standalone en `src/app/*/`, cada uno con su plantilla, estilos y, en algunos
  casos, pruebas (`*.spec.ts`).

La aplicación no usa zone.js: la detección de cambios la disparan los signals, los inputs y los
eventos de las plantillas. Por eso el estado que se modifica al llegar una respuesta HTTP (dentro
de un `subscribe()`) se guarda en signals.

Los estilos globales (skeleton-css y Font Awesome 4.7) se declaran en `angular.json`.

## Versiones

- Angular 22 (Angular CLI con el builder `@angular/build`), RxJS 7 y TypeScript 6.0.
- json-server está fijado a 0.17.4: la rama 1.0 (beta) cambia la sintaxis de consulta (`_sort`,
  `_order`, `q`).
- Dependabot propone cada semana las actualizaciones de npm (todo `@angular/*` en una sola PR) y
  cada mes las de las acciones de GitHub. Las versiones mayores de Angular se hacen con
  `ng update`, que también aplica las migraciones de código. Por eso Dependabot tampoco propone
  las mayores de vitest, tslib y rxjs, que se salen de los peer de Angular 22.
