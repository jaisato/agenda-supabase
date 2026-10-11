import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { API_URL } from '../api-url.token';
import { Contacto } from '../contacto';
import { MisContactosComponent } from './mis-contactos.component';

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
const bill: Contacto = {
  id: 12,
  nombre: 'Bill',
  apellidos: 'Gates',
  email: 'bill.gates@msn.com',
  telefono: '555-123456',
  facebook: 'bill.gates',
  twitter: '@BillGates',
};

describe('MisContactosComponent', () => {
  let fixture: ComponentFixture<MisContactosComponent>;
  let elemento: HTMLElement;
  let http: HttpTestingController;
  const nombres = () =>
    Array.from(elemento.querySelectorAll('lista-contactos li'), (li) => li.textContent?.trim());
  const detalles = () => elemento.querySelector('detalles-contacto h5')?.textContent?.trim();
  const aviso = () => elemento.querySelector('[role="alert"]')?.textContent?.trim();
  const clic = async (selector: string, indice = 0) => {
    elemento.querySelectorAll<HTMLElement>(selector)[indice].click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MisContactosComponent);
    elemento = fixture.nativeElement;
    // Lo que en la aplicación entrega el resolver vía withComponentInputBinding().
    fixture.componentRef.setInput('contactos', [tim, bill]);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('pinta la lista recibida y ningún detalle hasta seleccionar un contacto', () => {
    expect(nombres()).toEqual(['Bill Gates', 'Tim Cook']);
    expect(detalles()).toBeUndefined();
    expect(aviso()).toBeUndefined();
  });

  it('si el resolver no trae la lista (la API falló), avisa en lugar de quedarse en blanco', async () => {
    fixture.componentRef.setInput('contactos', null);
    await fixture.whenStable();

    expect(nombres()).toEqual([]);
    expect(aviso()).toBe('No se ha podido cargar la agenda. ¿Está arrancado json-server?');
  });

  it('muestra los detalles del contacto seleccionado', async () => {
    await clic('lista-contactos li', 1);

    expect(detalles()).toBe('Tim Cook');
    expect(elemento.querySelector('detalles-contacto')?.textContent).toContain(
      '555-123456 | tim.cook@gmail.com',
    );
  });

  it('tras confirmar, borra con DELETE y repinta la lista y los detalles', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await clic('lista-contactos li', 1);
    await clic('detalles-contacto button.boton-eliminar');

    expect(confirmar).toHaveBeenCalledWith('¿Estas seguro de eliminar a Tim?');
    const req = http.expectOne(`${API}/contactos/11`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    // La respuesta llega en un subscribe(): sin zone.js solo se repinta porque
    // la lista y la selección son signals.
    await fixture.whenStable();

    expect(nombres()).toEqual(['Bill Gates']);
    expect(detalles()).toBeUndefined();
  });

  it('si el borrado falla, avisa y mantiene el contacto; al borrarlo después, quita el aviso', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await clic('lista-contactos li', 1);
    await clic('detalles-contacto button.boton-eliminar');

    http
      .expectOne(`${API}/contactos/11`)
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(aviso()).toBe('No se ha podido eliminar a Tim.');
    expect(nombres()).toEqual(['Bill Gates', 'Tim Cook']);
    expect(detalles()).toBe('Tim Cook');

    await clic('detalles-contacto button.boton-eliminar');
    http.expectOne(`${API}/contactos/11`).flush({});
    await fixture.whenStable();

    expect(aviso()).toBeUndefined();
    expect(nombres()).toEqual(['Bill Gates']);
  });

  it('si no se confirma, no borra nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await clic('lista-contactos li', 1);
    await clic('detalles-contacto button.boton-eliminar');

    http.expectNone(`${API}/contactos/11`);
    expect(nombres()).toEqual(['Bill Gates', 'Tim Cook']);
    expect(detalles()).toBe('Tim Cook');
  });

  it('abre los perfiles sociales en una pestaña nueva sin acceso a window.opener', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    await clic('lista-contactos li', 1);
    await clic('detalles-contacto button.icono', 0);
    await clic('detalles-contacto button.icono', 1);

    expect(abrir.mock.calls).toEqual([
      ['https://www.facebook.com/tim.cook', '_blank', 'noopener,noreferrer'],
      ['https://twitter.com/timcook', '_blank', 'noopener,noreferrer'],
    ]);
  });
});
