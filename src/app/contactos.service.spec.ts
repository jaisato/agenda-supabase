import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_URL } from './api-url.token';
import { Contacto } from './contacto';
import { ContactosService } from './contactos.service';

const API = 'http://api.test';
const tim: Contacto = {
  id: 11,
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@gmail.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};

describe('ContactosService', () => {
  let service: ContactosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: API },
      ],
    });
    service = TestBed.inject(ContactosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('usa por defecto el json-server local del puerto 3005', () => {
    TestBed.resetTestingModule();
    expect(TestBed.inject(API_URL)).toBe('http://localhost:3005');
  });

  it('obtiene los contactos con GET /contactos', () => {
    let contactos: Contacto[] | undefined;
    service.obtenerContactos().subscribe((respuesta) => (contactos = respuesta));

    const req = http.expectOne(`${API}/contactos`);
    expect(req.request.method).toBe('GET');
    req.flush([tim]);

    expect(contactos).toEqual([tim]);
  });

  it('crea un contacto con POST /contactos y devuelve el que guarda el servidor', () => {
    const { id: _, ...nuevo } = tim;
    let creado: Contacto | undefined;
    service.agregarContacto(nuevo).subscribe((respuesta) => (creado = respuesta));

    const req = http.expectOne(`${API}/contactos`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(nuevo);
    req.flush(tim, { status: 201, statusText: 'Created' });

    expect(creado).toEqual(tim);
  });

  it('elimina un contacto con DELETE /contactos/:id', () => {
    let completado = false;
    service.eliminarContacto(tim).subscribe({ complete: () => (completado = true) });

    const req = http.expectOne(`${API}/contactos/11`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});

    expect(completado).toBe(true);
  });

  it('registra el error de un alta fallida y lo propaga con un mensaje legible', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: Error | undefined;
    service.agregarContacto(tim).subscribe({ error: (e: Error) => (error = e) });

    http
      .expectOne(`${API}/contactos`)
      .flush({ error: 'duplicado' }, { status: 500, statusText: 'Server Error' });

    expect(error?.message).toBe('500 - Server Error duplicado');
    expect(consola).toHaveBeenCalledWith('500 - Server Error duplicado');
    consola.mockRestore();
  });

  it('registra el error al obtener los contactos y lo propaga con un mensaje legible', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: Error | undefined;
    service.obtenerContactos().subscribe({ error: (e: Error) => (error = e) });

    http
      .expectOne(`${API}/contactos`)
      .flush({ error: 'mantenimiento' }, { status: 503, statusText: 'Service Unavailable' });

    expect(error?.message).toBe('503 - Service Unavailable mantenimiento');
    expect(consola).toHaveBeenCalledWith('503 - Service Unavailable mantenimiento');
    consola.mockRestore();
  });

  it('registra el error de una baja fallida y lo propaga con un mensaje legible', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: Error | undefined;
    service.eliminarContacto(tim).subscribe({ error: (e: Error) => (error = e) });

    http
      .expectOne(`${API}/contactos/11`)
      .flush({ error: 'no existe' }, { status: 404, statusText: 'Not Found' });

    expect(error?.message).toBe('404 - Not Found no existe');
    expect(consola).toHaveBeenCalledWith('404 - Not Found no existe');
    consola.mockRestore();
  });
});
