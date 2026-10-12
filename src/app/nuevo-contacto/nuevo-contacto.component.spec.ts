import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { Contacto, DatosContacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { contactoDePrueba } from '../testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { NuevoContactoComponent } from './nuevo-contacto.component';

const tim: DatosContacto = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};
const sinPermiso = new PostgrestError({
  message: 'new row violates row-level security policy for table "contactos"',
  details: '',
  hint: '',
  code: '42501',
});

describe('NuevoContactoComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<NuevoContactoComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const formulario = () => elemento.querySelector<HTMLFormElement>('formulario-contacto form')!;
  const anadir = () =>
    elemento.querySelector<HTMLButtonElement>('formulario-contacto button[type="submit"]')!;
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  // Rellena el formulario real (FormularioContactoComponent) y pulsa «Añadir».
  const enviar = async (datos: DatosContacto) => {
    for (const [id, valor] of Object.entries(datos)) {
      const campo = elemento.querySelector<HTMLInputElement>(`formulario-contacto input#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    anadir().click();
    await reposar();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NuevoContactoComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('da de alta el contacto con los seis campos del formulario y, hecho el alta, vuelve a /mis-contactos', async () => {
    falso.respuestaDe('contactos', { data: contactoDePrueba(tim), error: null });

    await enviar(tim);

    expect(falso.consultas).toEqual([
      {
        tabla: 'contactos',
        cadena: [
          { metodo: 'insert', args: [tim] },
          { metodo: 'select', args: [] },
          { metodo: 'single', args: [] },
        ],
      },
    ]);
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
    expect(mensajes.mensaje()).toBeNull();
  });

  it('si el alta falla, avisa del error, no navega y deja el formulario con lo escrito', async () => {
    falso.respuestaDe('contactos', { data: null, error: sinPermiso });

    await enviar(tim);

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'No tienes permiso para hacer eso',
    });
    expect(navegar).not.toHaveBeenCalled();
    expect(
      elemento.querySelector<HTMLInputElement>('formulario-contacto input#nombre')!.value,
    ).toBe('Tim');
    expect(anadir().disabled).toBe(false);
  });

  it('al reintentar quita el aviso del intento anterior', async () => {
    falso.respuestaDe('contactos', { data: null, error: sinPermiso });
    await enviar(tim);
    expect(mensajes.mensaje()?.tipo).toBe('error');

    falso.respuestaDe('contactos', { data: contactoDePrueba(tim), error: null });
    await enviar(tim);

    expect(mensajes.mensaje()).toBeNull();
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
  });

  it('mientras espera la respuesta no deja enviar otra vez: una doble pulsación no crea dos contactos', async () => {
    let terminarAlta!: (contacto: Contacto) => void;
    const agregar = vi
      .spyOn(TestBed.inject(ContactosService), 'agregarContacto')
      .mockReturnValue(new Promise<Contacto>((resolver) => (terminarAlta = resolver)));

    await enviar(tim);
    expect(anadir().disabled).toBe(true);
    // Intro dentro de un campo: envía el formulario sin pasar por el botón deshabilitado.
    formulario().dispatchEvent(new Event('submit'));
    await reposar();
    expect(agregar).toHaveBeenCalledOnce();

    terminarAlta(contactoDePrueba(tim));
    await reposar();
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
  });

  it('con el contacto ya creado, tampoco deja enviar otra vez mientras navega a /mis-contactos', async () => {
    falso.respuestaDe('contactos', { data: contactoDePrueba(tim), error: null });
    // La navegación espera al resolver de /mis-contactos, que vuelve a pedir los contactos.
    navegar.mockReturnValue(new Promise(() => {}));

    await enviar(tim);
    formulario().dispatchEvent(new Event('submit'));
    await reposar();

    expect(falso.consultas).toHaveLength(1);
    expect(anadir().disabled).toBe(true);
  });
});
