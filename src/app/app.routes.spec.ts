import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { API_URL } from './api-url.token';
import { appConfig } from './app.config';
import { Contacto } from './contacto';
import { MisContactosComponent } from './mis-contactos/mis-contactos.component';
import { NuevoContactoComponent } from './nuevo-contacto/nuevo-contacto.component';

const API = 'http://api.test';
const elon: Contacto = {
  id: 13,
  nombre: 'Elon',
  apellidos: 'Musk',
  email: 'elon.musk@tesla.com',
  telefono: '393-209423',
  facebook: 'elon.musk',
  twitter: '@elonmusk',
};

describe('rutas de la aplicación', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      // La configuración real de la aplicación (router con withComponentInputBinding() y
      // HttpClient), con el backend HTTP de pruebas y la URL de la API sustituidos.
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: API_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it('/mis-contactos resuelve los contactos y los entrega al componente como input', async () => {
    const navegacion = harness.navigateByUrl('/mis-contactos', MisContactosComponent);
    // El resolver pide los contactos antes de activar la ruta.
    const req = await vi.waitFor(() => http.expectOne(`${API}/contactos`));
    req.flush([elon]);
    const componente = await navegacion;

    expect(componente.contactos()).toEqual([elon]);
    expect(harness.routeNativeElement?.textContent).toContain('Elon Musk');
  });

  it('/nuevo-contacto muestra el formulario de alta', async () => {
    await harness.navigateByUrl('/nuevo-contacto', NuevoContactoComponent);

    expect(harness.routeNativeElement?.querySelector('form #nombre')).not.toBeNull();
  });

  it('cualquier otra ruta redirige a /mis-contactos', async () => {
    const navegacion = harness.navigateByUrl('/no-existe');
    (await vi.waitFor(() => http.expectOne(`${API}/contactos`))).flush([]);
    await navegacion;

    expect(TestBed.inject(Router).url).toBe('/mis-contactos');
  });
});
