// Pruebas de server.mjs (CORS, CSRF y DNS rebinding) con el runner de Node: `npm run test:api`.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ORIGEN_PERMITIDO, crearApi } from './server.mjs';

const ORIGEN_AJENO = 'https://otra-web.example';

describe('server.mjs', () => {
  let dir;
  let fichero;
  let servidor;
  let puerto;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agenda-api-'));
    fichero = join(dir, 'db.json');
    copyFileSync(new URL('./db.json', import.meta.url), fichero);
    // Se reserva el puerto antes de crear la app: la app valida Host con él.
    servidor = (await import('node:http')).createServer();
    await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    puerto = servidor.address().port;
    servidor.on('request', crearApi(fichero, puerto));
  });

  after(() => {
    servidor.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const peticion = ({ method = 'GET', path = '/contactos', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: puerto,
          method,
          path,
          headers: { Host: `localhost:${puerto}`, ...headers },
        },
        (res) => {
          let datos = '';
          res.on('data', (trozo) => (datos += trozo));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, datos }));
        },
      );
      req.on('error', reject);
      req.end(body);
    });

  const contactosGuardados = () => JSON.parse(readFileSync(fichero, 'utf8')).contactos;

  it('responde a la aplicación con CORS solo para su origen', async () => {
    const propia = await peticion({ headers: { Origin: ORIGEN_PERMITIDO } });
    assert.equal(propia.status, 200);
    assert.equal(propia.headers['access-control-allow-origin'], ORIGEN_PERMITIDO);

    const ajena = await peticion({ headers: { Origin: ORIGEN_AJENO } });
    assert.equal(ajena.headers['access-control-allow-origin'], undefined);
  });

  it('rechaza el POST de un formulario de otra web (CSRF) sin tocar db.json', async () => {
    const antes = contactosGuardados();
    const res = await peticion({
      method: 'POST',
      headers: {
        Origin: ORIGEN_AJENO,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'nombre=Intruso&apellidos=CSRF',
    });
    assert.equal(res.status, 403);
    assert.deepEqual(contactosGuardados(), antes);
  });

  it('acepta el alta desde la aplicación', async () => {
    const res = await peticion({
      method: 'POST',
      headers: { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Ada', apellidos: 'Lovelace' }),
    });
    assert.equal(res.status, 201);
    assert.ok(contactosGuardados().some((c) => c.nombre === 'Ada'));
  });

  it('rechaza las peticiones con un Host ajeno (DNS rebinding)', async () => {
    const res = await peticion({ headers: { Host: `otra-web.example:${puerto}` } });
    assert.equal(res.status, 403);
  });
});
