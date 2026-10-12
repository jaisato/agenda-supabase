import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PostgrestError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { contactoVisibleDePrueba } from '../testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { MisContactosComponent } from './mis-contactos.component';

// Uno propio, uno compartido como lector y otro compartido como editor.
const tim = contactoVisibleDePrueba('propietario', {
  id: 'c1',
  propietario_id: 'u1',
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@gmail.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
});
const bill = contactoVisibleDePrueba('lector', {
  id: 'c2',
  propietario_id: 'u2',
  nombre: 'Bill',
  apellidos: 'Gates',
  email: 'bill.gates@msn.com',
});
const elon = contactoVisibleDePrueba('editor', {
  id: 'c3',
  propietario_id: 'u2',
  nombre: 'Elon',
  apellidos: 'Musk',
  email: 'elon.musk@tesla.com',
});
// La persona con la sesión abierta: dueña de Tim; Bill (lector) y Elon (editor) le han compartido
// sus contactos.
const sesion = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const sinPermiso = new PostgrestError({
  message: 'permission denied for table contactos',
  details: '',
  hint: '',
  code: '42501',
});

describe('MisContactosComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<MisContactosComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const listas = () => Array.from(elemento.querySelectorAll('lista-contactos'));
  // El nombre de cada <li> de una de las dos listas, sin la etiqueta del rol.
  const nombres = (lista: 'propios' | 'compartidos') =>
    Array.from(listas()[lista === 'propios' ? 0 : 1].querySelectorAll('li'), (li) =>
      li.firstChild?.textContent?.trim(),
    );
  const roles = () =>
    Array.from(listas()[1].querySelectorAll('li span.rol'), (rol) => rol.textContent?.trim());
  const detalles = () => elemento.querySelector('detalles-contacto h5')?.textContent?.trim();
  // Los botones de acción del contacto seleccionado (no los iconos de las redes sociales).
  const acciones = () =>
    Array.from(elemento.querySelectorAll('detalles-contacto button:not(.icono)'), (boton) =>
      boton.textContent?.trim(),
    );
  const accion = (texto: string) =>
    Array.from(elemento.querySelectorAll<HTMLButtonElement>('detalles-contacto button')).find(
      (boton) => boton.textContent?.trim() === texto,
    )!;
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  const clic = async (elementoClicado: HTMLElement) => {
    elementoClicado.click();
    await reposar();
  };
  const seleccionar = (lista: 'propios' | 'compartidos', indice = 0) =>
    clic(listas()[lista === 'propios' ? 0 : 1].querySelectorAll('li')[indice]);

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    falso.auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MisContactosComponent);
    elemento = fixture.nativeElement;
    // Lo que en la aplicación entrega el resolver vía withComponentInputBinding().
    fixture.componentRef.setInput('contactos', [tim, bill, elon]);
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('pinta dos listas: «Mis contactos» con los propios y «Compartidos conmigo» con el resto y su rol', () => {
    expect(Array.from(elemento.querySelectorAll('h4'), (h) => h.textContent?.trim())).toEqual([
      'Mis contactos',
      'Compartidos conmigo',
    ]);
    expect(nombres('propios')).toEqual(['Tim Cook']);
    expect(nombres('compartidos')).toEqual(['Bill Gates', 'Elon Musk']);
    expect(roles()).toEqual(['lector', 'editor']);
  });

  it('no pinta ningún detalle hasta seleccionar un contacto', () => {
    expect(detalles()).toBeUndefined();
    expect(acciones()).toEqual([]);
  });

  it('si nadie ha compartido nada, lo dice bajo «Compartidos conmigo»', async () => {
    const aviso = 'Nadie ha compartido contactos contigo todavía.';
    expect(elemento.textContent).not.toContain(aviso);

    fixture.componentRef.setInput('contactos', [tim]);
    await fixture.whenStable();

    expect(nombres('compartidos')).toEqual([]);
    expect(elemento.textContent).toContain(aviso);
  });

  it('muestra los detalles del contacto seleccionado, sea de una lista o de la otra', async () => {
    await seleccionar('propios');
    expect(detalles()).toBe('Tim Cook');
    expect(elemento.querySelector('detalles-contacto')?.textContent).toContain(
      '555-123456 | tim.cook@gmail.com',
    );

    await seleccionar('compartidos', 1);
    expect(detalles()).toBe('Elon Musk');
  });

  describe('botones del contacto seleccionado, según su rol', () => {
    it('propio: «Editar», «Compartir» y «Eliminar contacto»', async () => {
      await seleccionar('propios');

      expect(acciones()).toEqual(['Editar', 'Compartir', 'Eliminar contacto']);
    });

    it('lector: solo «Dejar de ver»', async () => {
      await seleccionar('compartidos', 0);

      expect(detalles()).toBe('Bill Gates');
      expect(acciones()).toEqual(['Dejar de ver']);
    });

    it('editor: «Editar» y «Dejar de ver»', async () => {
      await seleccionar('compartidos', 1);

      expect(detalles()).toBe('Elon Musk');
      expect(acciones()).toEqual(['Editar', 'Dejar de ver']);
    });
  });

  describe('eliminar', () => {
    it('tras confirmar, borra el contacto por su id y repinta la lista y los detalles', async () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      await seleccionar('propios');

      await clic(accion('Eliminar contacto'));

      expect(confirmar).toHaveBeenCalledWith('¿Estas seguro de eliminar a Tim?');
      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'delete', args: [] },
            { metodo: 'eq', args: ['id', 'c1'] },
          ],
        },
      ]);
      // Sin zone.js solo se repinta porque la lista y la selección son signals.
      expect(nombres('propios')).toEqual([]);
      expect(nombres('compartidos')).toEqual(['Bill Gates', 'Elon Musk']);
      expect(detalles()).toBeUndefined();
    });

    it('si no se confirma, no borra nada', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await seleccionar('propios');

      await clic(accion('Eliminar contacto'));

      expect(falso.consultas).toEqual([]);
      expect(nombres('propios')).toEqual(['Tim Cook']);
      expect(detalles()).toBe('Tim Cook');
    });

    it('si el borrado falla, avisa del error y deja el contacto en la lista y seleccionado', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      falso.respuestaDe('contactos', { data: null, error: sinPermiso });
      await seleccionar('propios');

      await clic(accion('Eliminar contacto'));

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'No tienes permiso para hacer eso',
      });
      expect(nombres('propios')).toEqual(['Tim Cook']);
      expect(detalles()).toBe('Tim Cook');
    });

    it('al borrar quita el aviso anterior', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mensajes.error('Algo ha fallado');
      await seleccionar('propios');

      await clic(accion('Eliminar contacto'));

      expect(mensajes.mensaje()).toBeNull();
    });

    it('si mientras espera se selecciona otro contacto, la selección no cambia', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      let terminarBorrado!: () => void;
      vi.spyOn(TestBed.inject(ContactosService), 'eliminarContacto').mockReturnValue(
        new Promise<void>((resolver) => (terminarBorrado = resolver)),
      );
      await seleccionar('propios');
      await clic(accion('Eliminar contacto'));

      await seleccionar('compartidos', 0);
      terminarBorrado();
      await reposar();

      expect(nombres('propios')).toEqual([]);
      expect(detalles()).toBe('Bill Gates');
    });
  });

  describe('navegación', () => {
    it('«Editar» lleva a /contactos/:id/editar', async () => {
      await seleccionar('compartidos', 1);

      await clic(accion('Editar'));

      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/contactos', 'c3', 'editar']);
    });

    it('«Compartir» lleva a /contactos/:id/compartir', async () => {
      await seleccionar('propios');

      await clic(accion('Compartir'));

      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/contactos', 'c1', 'compartir']);
    });
  });

  describe('dejar de ver', () => {
    it('tras confirmar, quita la compartición propia (la de la persona con sesión) y repinta la lista y los detalles', async () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      await seleccionar('compartidos', 0);

      await clic(accion('Dejar de ver'));

      expect(confirmar).toHaveBeenCalledWith('¿Dejar de ver a Bill?');
      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'delete', args: [] },
            { metodo: 'eq', args: ['contacto_id', 'c2'] },
            { metodo: 'eq', args: ['usuario_id', 'u1'] },
          ],
        },
      ]);
      expect(nombres('propios')).toEqual(['Tim Cook']);
      expect(nombres('compartidos')).toEqual(['Elon Musk']);
      expect(detalles()).toBeUndefined();
    });

    it('un editor también puede dejar de verlo', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await seleccionar('compartidos', 1);

      await clic(accion('Dejar de ver'));

      expect(falso.consultas[0].cadena).toEqual([
        { metodo: 'delete', args: [] },
        { metodo: 'eq', args: ['contacto_id', 'c3'] },
        { metodo: 'eq', args: ['usuario_id', 'u1'] },
      ]);
      expect(nombres('compartidos')).toEqual(['Bill Gates']);
    });

    it('si no se confirma, no borra nada', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await seleccionar('compartidos', 0);

      await clic(accion('Dejar de ver'));

      expect(falso.consultas).toEqual([]);
      expect(nombres('compartidos')).toEqual(['Bill Gates', 'Elon Musk']);
      expect(detalles()).toBe('Bill Gates');
    });

    it('si falla, avisa del error y deja el contacto en la lista y seleccionado', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });
      await seleccionar('compartidos', 0);

      await clic(accion('Dejar de ver'));

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'No tienes permiso para hacer eso',
      });
      expect(nombres('compartidos')).toEqual(['Bill Gates', 'Elon Musk']);
      expect(detalles()).toBe('Bill Gates');
    });

    it('quita el aviso anterior', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mensajes.error('Algo ha fallado');
      await seleccionar('compartidos', 0);

      await clic(accion('Dejar de ver'));

      expect(mensajes.mensaje()).toBeNull();
    });

    it('si mientras espera se selecciona otro contacto, la selección no cambia', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      let terminarBorrado!: () => void;
      vi.spyOn(TestBed.inject(ContactosService), 'dejarDeCompartir').mockReturnValue(
        new Promise<void>((resolver) => (terminarBorrado = resolver)),
      );
      await seleccionar('compartidos', 0);
      await clic(accion('Dejar de ver'));

      await seleccionar('compartidos', 1);
      terminarBorrado();
      await reposar();

      expect(nombres('compartidos')).toEqual(['Elon Musk']);
      expect(detalles()).toBe('Elon Musk');
    });
  });

  it('abre los perfiles sociales en una pestaña nueva sin acceso a window.opener', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    await seleccionar('propios');
    const iconos = elemento.querySelectorAll<HTMLElement>('detalles-contacto button.icono');

    await clic(iconos[0]);
    await clic(iconos[1]);

    expect(abrir.mock.calls).toEqual([
      ['https://www.facebook.com/tim.cook', '_blank', 'noopener,noreferrer'],
      ['https://twitter.com/timcook', '_blank', 'noopener,noreferrer'],
    ]);
  });
});
