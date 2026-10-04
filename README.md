# kc-boot4-angular

An Angular application for module 4 of the 4th Keepcoding Bootcamp Startup

Agenda de contactos: lista ordenable, detalle con enlaces a Facebook y Twitter, alta con
formulario validado y baja con confirmación. Los datos los sirve
[json-server](https://github.com/typicode/json-server) a partir de `db.json`.

## Requisitos

- Node.js 24 (versión fijada en `.nvmrc`). Angular 22 admite `^22.22.3 || ^24.15.0`.
- npm (el que trae Node 24).

## Puesta en marcha

```sh
nvm use      # usa la versión de .nvmrc
npm ci
npm start
```

`npm start` lanza con `concurrently` dos procesos y para los dos con Ctrl+C:

- `npm run api`: json-server 0.17.4 en <http://localhost:3005/contactos>. Las altas y bajas se
  guardan en `db.json`.
- `ng serve`: la aplicación en <http://localhost:4200>.

## Scripts

| Script                      | Qué hace                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `npm start`                 | API (json-server) y servidor de desarrollo de Angular.          |
| `npm run api`               | Solo la API.                                                    |
| `npm run build`             | Build de producción en `dist/agenda/browser/`.                  |
| `npm test`                  | Pruebas unitarias con Vitest (en modo _watch_ en una terminal). |
| `npm test -- --watch=false` | Una sola pasada de las pruebas (lo que ejecuta el CI).          |

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
  `ng update`, que también aplica las migraciones de código.
