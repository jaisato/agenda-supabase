import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MockInstance } from 'vitest';

import { API_URL } from '../api-url.token';
import { Contacto } from '../contacto';
import { NuevoContactoComponent } from './nuevo-contacto.component';

const API = 'http://api.test';
const tim: Omit<Contacto, 'id'> = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};

describe('NuevoContactoComponent', () => {
  let fixture: ComponentFixture<NuevoContactoComponent>;
  let elemento: HTMLElement;
  let http: HttpTestingController;
  let navegar: MockInstance<Router['navigate']>;
  // Rellena el formulario real (FormularioContactoComponent) y pulsa «Añadir».
  const enviar = async (contacto: Omit<Contacto, 'id'>) => {
    for (const [id, valor] of Object.entries(contacto)) {
      const campo = elemento.querySelector<HTMLInputElement>(`formulario-contacto input#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    elemento.querySelector<HTMLButtonElement>('formulario-contacto button[type="submit"]')!.click();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NuevoContactoComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('da de alta el contacto con POST /contactos y, con la respuesta, vuelve a /mis-contactos', async () => {
    await enviar(tim);

    const req = http.expectOne(`${API}/contactos`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(tim);
    expect(navegar).not.toHaveBeenCalled();

    req.flush({ ...tim, id: 14 }, { status: 201, statusText: 'Created' });
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
  });

  it('si el alta falla, no navega y se queda en el formulario', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    await enviar(tim);

    http
      .expectOne(`${API}/contactos`)
      .flush({ error: 'duplicado' }, { status: 500, statusText: 'Server Error' });

    expect(navegar).not.toHaveBeenCalled();
    expect(consola).toHaveBeenCalledWith('500 - Server Error duplicado');
    expect(elemento.querySelector('formulario-contacto form')).not.toBeNull();
  });
});
