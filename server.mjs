// API REST de la agenda: json-server 0.17.4 como módulo en lugar de su CLI.
//
// La CLI activa CORS para cualquier origen (responde con el Origin recibido y con
// Access-Control-Allow-Credentials: true), así que cualquier web abierta en el navegador podía
// leer y modificar db.json a través de localhost. Aquí solo se permite el origen de `ng serve`.
//
// CORS solo impide que otra web LEA la respuesta, no que la petición llegue. Un <form> de
// cualquier web puede enviar un POST application/x-www-form-urlencoded sin preflight, y
// json-server lo parsea y lo guarda en db.json. Por eso, además:
//   - se rechazan (403) las escrituras cuyo Origin no es el de `ng serve` (CSRF), y
//   - se rechazan (403) las peticiones cuyo Host no es localhost/127.0.0.1/[::1] en este puerto,
//     para que una web no pueda leer la API resolviendo su dominio a 127.0.0.1 (DNS rebinding).
//
//   node server.mjs [fichero]   (por defecto, db.json)
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import jsonServer from 'json-server';

export const PUERTO = 3005;
export const ORIGEN_PERMITIDO = 'http://localhost:4200';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

const hostsPermitidos = (puerto) =>
  new Set([`localhost:${puerto}`, `127.0.0.1:${puerto}`, `[::1]:${puerto}`]);

/**
 * Crea la aplicación Express de json-server sobre `fichero`. `puerto` es el puerto en el que
 * escuchará, necesario para validar la cabecera Host.
 */
export function crearApi(fichero, puerto = PUERTO) {
  const hosts = hostsPermitidos(puerto);
  const app = jsonServer.create();

  app.use((req, res, next) => {
    if (!hosts.has((req.headers.host ?? '').toLowerCase())) {
      res.statusCode = 403;
      res.end();
      return;
    }
    const origen = req.headers.origin;
    if (origen !== undefined && origen !== ORIGEN_PERMITIDO && !METODOS_SEGUROS.has(req.method)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    res.setHeader('Vary', 'Origin');
    if (origen === ORIGEN_PERMITIDO) {
      res.setHeader('Access-Control-Allow-Origin', ORIGEN_PERMITIDO);
      // Preflight de las altas (POST con JSON) y de las bajas (DELETE).
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.statusCode = 204;
        res.end();
        return;
      }
    }
    next();
  });
  // Los mismos middlewares que monta la CLI (compresión, ficheros de public/, log y cabeceras
  // sin caché), salvo el de CORS. El router añade body-parser y guarda los cambios en el fichero.
  app.use(jsonServer.defaults({ noCors: true }));
  app.use(jsonServer.router(fichero));
  return app;
}

const esPrincipal =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (esPrincipal) {
  const fichero = process.argv[2] ?? 'db.json';
  crearApi(fichero).listen(PUERTO, 'localhost', () => {
    console.log(
      `API en http://localhost:${PUERTO} con ${fichero} (CORS solo para ${ORIGEN_PERMITIDO})`,
    );
  });
}
