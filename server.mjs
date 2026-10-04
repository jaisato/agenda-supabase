// API REST de la agenda: json-server 0.17.4 como módulo en lugar de su CLI.
//
// La CLI activa CORS para cualquier origen (responde con el Origin recibido y con
// Access-Control-Allow-Credentials: true), así que cualquier web abierta en el navegador podía
// leer y modificar db.json a través de localhost. Aquí solo se permite el origen de `ng serve`.
//
//   node server.mjs [fichero]   (por defecto, db.json)
import jsonServer from 'json-server';

const PUERTO = 3005;
const ORIGEN_PERMITIDO = 'http://localhost:4200';
const fichero = process.argv[2] ?? 'db.json';

const app = jsonServer.create();

app.use((req, res, next) => {
  res.setHeader('Vary', 'Origin');
  if (req.headers.origin === ORIGEN_PERMITIDO) {
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

app.listen(PUERTO, 'localhost', () => {
  console.log(
    `API en http://localhost:${PUERTO} con ${fichero} (CORS solo para ${ORIGEN_PERMITIDO})`,
  );
});
