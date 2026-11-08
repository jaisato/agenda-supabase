import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PostgrestError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { InvitacionPendiente } from '../contacto';
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
  // El nombre de cada fila de una de las dos listas, sin la etiqueta del rol.
  const nombres = (lista: 'propios' | 'compartidos') =>
    Array.from(
      listas()[lista === 'propios' ? 0 : 1].querySelectorAll('li button.fila'),
      (boton) => {
        const rol = boton.querySelector('.rol')?.textContent ?? '';
        return boton.textContent?.replace(rol, '').trim();
      },
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
    clic(
      listas()[lista === 'propios' ? 0 : 1].querySelectorAll<HTMLButtonElement>('button.fila')[
        indice
      ],
    );

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    falso.auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    // Como withComponentInputBinding() en la aplicación: navegar a /mis-contactos con ?contacto=
    // entrega el parámetro al input (null lo quita). Los demás destinos no tocan el componente.
    navegar = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockImplementation(async (comandos, extras) => {
        const query = extras?.queryParams;
        if (comandos[0] === '/mis-contactos' && query && 'contacto' in query) {
          fixture.componentRef.setInput('contacto', query['contacto'] ?? undefined);
        }
        return true;
      });
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
    expect(elemento.querySelector('detalles-contacto')?.textContent).toContain(
      'Selecciona un contacto para ver sus datos.',
    );
  });

  it('si nadie ha compartido nada, lo dice bajo «Compartidos conmigo»', async () => {
    const aviso = 'Nadie ha compartido contactos contigo todavía.';
    expect(elemento.textContent).not.toContain(aviso);

    fixture.componentRef.setInput('contactos', [tim]);
    await fixture.whenStable();

    expect(nombres('compartidos')).toEqual([]);
    expect(elemento.textContent).toContain(aviso);
  });

  it('si no hay contactos propios, lo dice', async () => {
    fixture.componentRef.setInput('contactos', [bill]);
    await fixture.whenStable();

    expect(elemento.textContent).toContain('Todavía no tienes contactos.');
  });

  it('la búsqueda filtra por nombre, email o teléfono en las dos listas', async () => {
    const buscar = elemento.querySelector<HTMLInputElement>('#buscar')!;
    buscar.value = 'tesla';
    buscar.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(nombres('propios')).toEqual([]);
    expect(nombres('compartidos')).toEqual(['Elon Musk']);
    expect(elemento.textContent).toContain('Ningún contacto tuyo coincide con la búsqueda.');
  });

  it('?contacto= restaura el contacto seleccionado', async () => {
    fixture.componentRef.setInput('contacto', 'c2');
    await fixture.whenStable();

    expect(detalles()).toBe('Bill Gates');
  });

  it('elegir un contacto deja su id en la dirección', async () => {
    await seleccionar('propios');

    expect(navegar).toHaveBeenCalledWith(['/mis-contactos'], { queryParams: { contacto: 'c1' } });
  });

  describe('la selección sale de ?contacto=', () => {
    const recargarCon = async (contactos: (typeof tim)[]) => {
      const service = TestBed.inject(ContactosService);
      vi.spyOn(service, 'obtenerContactos').mockResolvedValue(contactos);
      vi.spyOn(service, 'invitaciones').mockResolvedValue([]);
      // Volver a la pestaña recarga la lista, igual que un aviso de Realtime.
      document.dispatchEvent(new Event('visibilitychange'));
      await reposar();
    };

    // El hallazgo: el contacto anterior seguía abierto al volver atrás o seguir un enlace sin la
    // query, porque solo se miraba el parámetro cuando traía un id.
    it('con el parámetro se selecciona y, al quitarlo (atrás, un enlace sin query), no queda ninguno', async () => {
      fixture.componentRef.setInput('contacto', 'c2');
      await fixture.whenStable();
      expect(detalles()).toBe('Bill Gates');

      fixture.componentRef.setInput('contacto', undefined);
      await fixture.whenStable();

      expect(detalles()).toBeUndefined();
      expect(acciones()).toEqual([]);
      expect(elemento.querySelector('detalles-contacto')?.textContent).toContain(
        'Selecciona un contacto para ver sus datos.',
      );
      expect(elemento.querySelector('button.fila.seleccionado')).toBeNull();
    });

    it('elegir un contacto solo navega: el detalle cambia cuando llega el parámetro', async () => {
      navegar.mockResolvedValue(true);

      await seleccionar('propios');

      expect(navegar).toHaveBeenCalledWith(['/mis-contactos'], { queryParams: { contacto: 'c1' } });
      expect(detalles()).toBeUndefined();

      fixture.componentRef.setInput('contacto', 'c1');
      await fixture.whenStable();

      expect(detalles()).toBe('Tim Cook');
    });

    it('al recargar la lista con el parámetro, la selección se mantiene con los datos nuevos', async () => {
      fixture.componentRef.setInput('contacto', 'c2');
      await fixture.whenStable();

      await recargarCon([tim, { ...bill, telefono: '555-000111' }, elon]);

      expect(detalles()).toBe('Bill Gates');
      expect(elemento.querySelector('detalles-contacto')?.textContent).toContain('555-000111');
      expect(navegar).not.toHaveBeenCalled();
    });

    it('si al recargar el contacto abierto ya no está, no queda ninguno y se quita de la URL', async () => {
      fixture.componentRef.setInput('contacto', 'c2');
      await fixture.whenStable();

      await recargarCon([tim, elon]);

      expect(detalles()).toBeUndefined();
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], {
        queryParams: { contacto: null },
      });
    });
  });

  it('un contacto compartido dice quién lo comparte', async () => {
    fixture.componentRef.setInput('contactos', [
      contactoVisibleDePrueba(
        'lector',
        { id: 'c9', propietario_id: 'u9', nombre: 'Ada', apellidos: 'Lovelace' },
        { nombre: 'Invitado', email: 'invitado@jasato.com', avatar_ruta: null },
      ),
    ]);
    await fixture.whenStable();

    await seleccionar('compartidos');

    expect(elemento.querySelector('detalles-contacto')?.textContent).toContain(
      'Compartido por Invitado',
    );
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

      expect(confirmar).toHaveBeenCalledWith('¿Estás seguro de eliminar a Tim?');
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

      expect(navegar).toHaveBeenLastCalledWith(['/contactos', 'c3', 'editar']);
    });

    it('«Compartir» lleva a /contactos/:id/compartir', async () => {
      await seleccionar('propios');

      await clic(accion('Compartir'));

      expect(navegar).toHaveBeenLastCalledWith(['/contactos', 'c1', 'compartir']);
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

  it('al volver a la pestaña vuelve a pedir los contactos y las invitaciones', async () => {
    const service = TestBed.inject(ContactosService);
    const obtener = vi.spyOn(service, 'obtenerContactos').mockResolvedValue([tim, bill]);
    const pedirInvitaciones = vi.spyOn(service, 'invitaciones').mockResolvedValue([]);

    document.dispatchEvent(new Event('visibilitychange'));
    await reposar();

    expect(obtener).toHaveBeenCalledOnce();
    expect(pedirInvitaciones).toHaveBeenCalledOnce();
  });

  it('ocultar la pestaña no recarga la lista', async () => {
    const obtener = vi.spyOn(TestBed.inject(ContactosService), 'obtenerContactos');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });

    document.dispatchEvent(new Event('visibilitychange'));
    await reposar();

    expect(obtener).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  describe('recargas que contestan en otro orden', () => {
    // Una respuesta que se entrega a mano, para contestar las peticiones en el orden que convenga.
    const diferida = <T>() => {
      let resolver!: (valor: T) => void;
      const promesa = new Promise<T>((r) => (resolver = r));
      return { promesa, resolver };
    };

    it('se queda la lista de la última recarga, aunque la anterior llegue después', async () => {
      const service = TestBed.inject(ContactosService);
      vi.spyOn(service, 'invitaciones').mockResolvedValue([]);
      const primera = diferida<(typeof tim)[]>();
      vi.spyOn(service, 'obtenerContactos')
        .mockReturnValueOnce(primera.promesa)
        .mockResolvedValueOnce([tim]);

      // Dos avisos seguidos (volver a la pestaña, Realtime): la segunda contesta antes.
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      await reposar();
      expect(nombres('compartidos')).toEqual([]);

      primera.resolver([tim, bill, elon]);
      await reposar();

      expect(nombres('propios')).toEqual(['Tim Cook']);
      expect(nombres('compartidos')).toEqual([]);
    });

    it('lo mismo con las invitaciones', async () => {
      const service = TestBed.inject(ContactosService);
      vi.spyOn(service, 'obtenerContactos').mockResolvedValue([tim]);
      const primera = diferida<InvitacionPendiente[]>();
      vi.spyOn(service, 'invitaciones')
        .mockReturnValueOnce(primera.promesa)
        .mockResolvedValueOnce([]);

      document.dispatchEvent(new Event('visibilitychange'));
      await reposar();
      document.dispatchEvent(new Event('visibilitychange'));
      await reposar();
      primera.resolver([
        {
          contacto_id: 'c9',
          nombre: 'Ada',
          rol: 'lector',
          propietario_nombre: 'Invitado',
          propietario_email: 'invitado@test.es',
        },
      ]);
      await reposar();

      expect(elemento.textContent).not.toContain('Invitaciones');
    });

    it('una recarga que salió antes de eliminar no devuelve el contacto a la lista', async () => {
      const service = TestBed.inject(ContactosService);
      vi.spyOn(service, 'invitaciones').mockResolvedValue([]);
      const enCurso = diferida<(typeof tim)[]>();
      vi.spyOn(service, 'obtenerContactos').mockReturnValueOnce(enCurso.promesa);
      vi.spyOn(service, 'eliminarContacto').mockResolvedValue();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      document.dispatchEvent(new Event('visibilitychange'));
      fixture.componentRef.setInput('contacto', 'c1');
      await fixture.whenStable();
      await clic(accion('Eliminar contacto'));
      expect(nombres('propios')).toEqual([]);

      // La respuesta de antes del borrado todavía trae a Tim.
      enCurso.resolver([tim, bill, elon]);
      await reposar();

      expect(nombres('propios')).toEqual([]);
    });
  });

  describe('invitaciones', () => {
    const invitacion: InvitacionPendiente = {
      contacto_id: 'c9',
      nombre: 'Ada',
      rol: 'lector',
      propietario_nombre: 'Invitado',
      propietario_email: 'invitado@test.es',
    };
    const botonDe = (texto: string) =>
      Array.from(elemento.querySelectorAll('button')).find(
        (boton) => boton.textContent?.trim() === texto,
      )!;

    const montar = async (fila = invitacion) => {
      fixture.destroy();
      const service = TestBed.inject(ContactosService);
      vi.spyOn(service, 'invitaciones').mockResolvedValue([fila]);
      fixture = TestBed.createComponent(MisContactosComponent);
      elemento = fixture.nativeElement;
      fixture.componentRef.setInput('contactos', [tim]);
      await reposar();
      return service;
    };

    it('pinta quién invita y avisa de que el contacto aparece al aceptar', async () => {
      await montar();

      expect(elemento.textContent).toContain('Invitaciones');
      expect(elemento.textContent).toContain('Ada');
      expect(elemento.textContent).toContain('de Invitado');
      expect(elemento.textContent).toContain(
        'Cuando aceptes una invitación, el contacto aparecerá aquí.',
      );
    });

    it('sin nombre público enseña el email de quien invita', async () => {
      await montar({ ...invitacion, propietario_nombre: null });

      expect(elemento.textContent).toContain('de invitado@test.es');
    });

    it('aceptar incorpora el contacto a «Compartidos conmigo»', async () => {
      const service = await montar();
      vi.spyOn(service, 'aceptar').mockResolvedValue();
      vi.spyOn(service, 'obtenerContactos').mockResolvedValue([
        tim,
        contactoVisibleDePrueba('lector', {
          id: 'c9',
          propietario_id: 'u2',
          nombre: 'Ada',
          apellidos: '',
        }),
      ]);
      vi.mocked(service.invitaciones).mockResolvedValue([]);

      await clic(botonDe('Aceptar'));

      expect(service.aceptar).toHaveBeenCalledExactlyOnceWith('c9');
      expect(nombres('compartidos')).toEqual(['Ada']);
      expect(elemento.textContent).not.toContain('Aceptar');
      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Invitación aceptada' });
    });

    it('rechazar, tras confirmar, borra la compartición', async () => {
      const service = await montar();
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(service, 'dejarDeCompartir').mockResolvedValue();

      await clic(botonDe('Rechazar'));

      expect(confirmar).toHaveBeenCalledWith('¿Rechazar la invitación a Ada?');
      expect(service.dejarDeCompartir).toHaveBeenCalledExactlyOnceWith('c9', 'u1');
      expect(elemento.textContent).not.toContain('Ada');
      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Invitación rechazada' });
    });

    it('una carga de invitaciones que salió antes de rechazar no la devuelve', async () => {
      const service = await montar();
      vi.spyOn(service, 'obtenerContactos').mockResolvedValue([tim]);
      let resolverInvitaciones!: (valor: InvitacionPendiente[]) => void;
      vi.mocked(service.invitaciones).mockReturnValueOnce(
        new Promise((resolver) => (resolverInvitaciones = resolver)),
      );
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(service, 'dejarDeCompartir').mockResolvedValue();

      document.dispatchEvent(new Event('visibilitychange'));
      await reposar();
      await clic(botonDe('Rechazar'));
      expect(elemento.textContent).not.toContain('Ada');

      // La respuesta de antes del rechazo todavía trae la invitación.
      resolverInvitaciones([invitacion]);
      await reposar();

      expect(elemento.textContent).not.toContain('Ada');
    });

    it('si no se confirma el rechazo, la invitación sigue', async () => {
      const service = await montar();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const dejar = vi.spyOn(service, 'dejarDeCompartir');

      await clic(botonDe('Rechazar'));

      expect(dejar).not.toHaveBeenCalled();
      expect(elemento.textContent).toContain('Ada');
    });
  });
});
