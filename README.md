# kc-boot4-angular
An Angular application for module 4 of the 4th Keepcoding Bootcamp Startup

## Instalación reproducible y comprobación de tipos

Se incluye `package-lock.json` para fijar las versiones instaladas y permitir que
las herramientas de análisis identifiquen las dependencias reales. Con npm 9:

```sh
npm ci --ignore-scripts --no-audit --no-fund
./node_modules/.bin/tsc --noEmit
```

La configuración `.npmrc` conserva la resolución de peer dependencies de npm 3–6
que utilizaba este proyecto Angular 2. Debe mantenerse al regenerar el lockfile y
al ejecutar `npm ci`; no garantiza compatibilidad de ejecución entre dependencias.
Se omiten los scripts de instalación en esta comprobación, incluidos los de las
herramientas antiguas de navegador. Para ejecutar esas herramientas hace falta
validar por separado sus requisitos y scripts.

`compilerOptions.types` está vacío porque la aplicación usa las bibliotecas DOM
y los tipos de sus módulos importados. Así se evita que TypeScript 2 cargue
automáticamente tipos globales de herramientas transitivas, como `@types/ws`,
que requieren compiladores más recientes. Si se añaden tests que necesiten tipos
globales, deberán usar una configuración de tests explícita.

Esta comprobación valida la compilación; no sustituye las pruebas en navegador.
Angular 2 y varias herramientas de este proyecto tienen dependencias obsoletas y
avisos de seguridad pendientes. El lockfile no corrige esos avisos: la migración
del framework y del entorno de desarrollo debe planificarse y probarse aparte.

## Servidor de desarrollo

`npm start` compila, arranca `lite-server` (browser-sync) y `json-server` en el
puerto 3005. `bs-config.json` hace que browser-sync escuche solo en `localhost`
y desactiva su panel de control (puerto 3001): por defecto ambos quedaban
expuestos a toda la red local, sirviendo el proyecto entero (incluido
`db.json`) y un panel que permite controlar los navegadores conectados. La
aplicación llama a la API en `http://localhost:3005`, así que desde otra
máquina tampoco funcionaba.
