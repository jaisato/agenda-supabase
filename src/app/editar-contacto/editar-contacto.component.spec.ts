import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { Contacto, ContactoVisible, DatosContacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { contactoDePrueba, contactoVisibleDePrueba } from '../testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { EditarContactoComponent } from './editar-contacto.component';

type Campo = keyof DatosContacto;

const tim: DatosContacto = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};
const campos = Object.keys(tim) as Campo[];
const editado: DatosContacto = { ...tim, telefono: '555-000000', twitter: '@tim_cook' };
// Lo que entrega el resolver: el contacto entero (id, propietario_id…) y el rol de quien lo abre.
const propio = contactoVisibleDePrueba('propietario', { ...tim, id: 'c7' });
const deOtro = (rol: 'lector' | 'editor') =>
  contactoVisibleDePrueba(rol, { ...tim, id: 'c7', propietario_id: 'u2' });

const sinPermiso = new PostgrestError({
  message: 'permission denied for table contactos',
  details: '',
  hint: '',
  code: '42501',
});
// Lo que contesta PostgREST al `.single()` de un update que no ha tocado ninguna fila.
const sinFila = new PostgrestError({
  message: 'Cannot coerce the result to a single JSON object',
  details: 'The result contains 0 rows',
  hint: '',
  code: 'PGRST116',
});
const avisoSinAcceso = { tipo: 'error', texto: 'Ese contacto ya no existe o no tienes acceso' };

describe('EditarContactoComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<EditarContactoComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const campo = (id: Campo) =>
    elemento.querySelector<HTMLInputElement>(`formulario-contacto input#${id}`)!;
  const boton = () =>
    elemento.querySelector<HTMLButtonElement>('formulario-contacto button[type="submit"]')!;
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  // Cambia campos del formulario real (FormularioContactoComponent) y pulsa «Guardar».
  const enviar = async (cambios: Partial<DatosContacto> = {}) => {
    for (const [id, valor] of Object.entries(cambios)) {
      campo(id as Campo).value = valor;
      campo(id as Campo).dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    boton().click();
    await reposar();
  };
  // Abre la pantalla como el router: el resolver entrega el contacto como input.
  const abrir = async (contacto: ContactoVisible | null) => {
    fixture = TestBed.createComponent(EditarContactoComponent);
    elemento = fixture.nativeElement;
    fixture.componentRef.setInput('contacto', contacto);
    await fixture.whenStable();
  };

  beforeEach(() => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('con un contacto que se puede editar', () => {
    it('pinta el formulario con los valores del contacto y el botón «Guardar»', async () => {
      await abrir(propio);

      expect(campos.map((id) => campo(id).value)).toEqual(campos.map((id) => tim[id]));
      expect(boton().textContent?.trim()).toBe('Guardar');
      expect(mensajes.mensaje()).toBeNull();
      expect(navegar).not.toHaveBeenCalled();
    });

    it('un editor, que lo tiene compartido, también lo edita', async () => {
      await abrir(deOtro('editor'));

      expect(campos.map((id) => campo(id).value)).toEqual(campos.map((id) => tim[id]));
      expect(boton().textContent?.trim()).toBe('Guardar');
      expect(navegar).not.toHaveBeenCalled();
    });

    it('al enviar actualiza el contacto por su id solo con los seis campos del formulario, avisa y vuelve a /mis-contactos', async () => {
      falso.respuestaDe('contactos', {
        data: contactoDePrueba({ ...editado, id: 'c7' }),
        error: null,
      });
      await abrir(propio);

      await enviar({ telefono: editado.telefono, twitter: editado.twitter });

      // El formulario parte de un contacto entero, pero el update no lleva id, propietario_id ni
      // rol: solo las seis columnas con privilegio de update.
      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'update', args: [editado] },
            { metodo: 'eq', args: ['id', 'c7'] },
            { metodo: 'select', args: [] },
            { metodo: 'single', args: [] },
          ],
        },
      ]);
      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Contacto guardado' });
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
    });

    it('si el guardado falla, avisa del error, no navega y deja el formulario con lo escrito', async () => {
      falso.respuestaDe('contactos', { data: null, error: sinPermiso });
      await abrir(propio);

      await enviar({ telefono: '555-000000' });

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'No tienes permiso para hacer eso',
      });
      expect(navegar).not.toHaveBeenCalled();
      expect(campo('telefono').value).toBe('555-000000');
    });

    it('al reintentar, el aviso del intento anterior desaparece mientras espera y el resultado lo sustituye', async () => {
      falso.respuestaDe('contactos', { data: null, error: sinPermiso });
      await abrir(propio);
      await enviar();
      expect(mensajes.mensaje()?.tipo).toBe('error');
      let terminarGuardado!: (contacto: Contacto) => void;
      vi.spyOn(TestBed.inject(ContactosService), 'editarContacto').mockReturnValue(
        new Promise<Contacto>((resolver) => (terminarGuardado = resolver)),
      );

      await enviar();
      expect(mensajes.mensaje()).toBeNull();
      terminarGuardado(contactoDePrueba({ id: 'c7' }));
      await reposar();

      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Contacto guardado' });
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
    });

    // El dueño lo borra, o deja de compartirlo, con el formulario ya abierto: el update no toca
    // ninguna fila (la RLS la oculta) y el .single() de PostgREST falla con PGRST116.
    it('si al guardar el contacto ya no existe o ya no es suyo, avisa como al abrirlo y vuelve a /mis-contactos', async () => {
      falso.respuestaDe('contactos', { data: null, error: sinFila });
      await abrir(deOtro('editor'));

      await enviar({ telefono: '555-000000' });

      // El aviso es el nuestro, no el texto en inglés de PostgREST.
      expect(mensajes.mensaje()).toEqual(avisoSinAcceso);
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
    });
  });

  describe('sin un contacto que se pueda editar', () => {
    // Review Focus 5: el dueño borra un contacto que otra persona tiene compartido (se van sus
    // comparticiones) y esa persona intenta editarlo: el resolver ya no lo encuentra.
    it('si no existe o ya no se ve (el resolver entrega null), avisa de que ya no existe y vuelve a /mis-contactos', async () => {
      await abrir(null);

      expect(mensajes.mensaje()).toEqual(avisoSinAcceso);
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
      expect(elemento.querySelector('formulario-contacto')).toBeNull();
      expect(falso.cliente.from).not.toHaveBeenCalled();
    });

    it('un lector que abre /contactos/:id/editar a mano recibe lo mismo que si no existiera', async () => {
      await abrir(deOtro('lector'));

      expect(mensajes.mensaje()).toEqual(avisoSinAcceso);
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
      expect(elemento.querySelector('formulario-contacto')).toBeNull();
      expect(falso.cliente.from).not.toHaveBeenCalled();
    });
  });
});
