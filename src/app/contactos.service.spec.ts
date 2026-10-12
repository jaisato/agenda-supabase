import { TestBed } from '@angular/core/testing';
import { PostgrestError, Session } from '@supabase/supabase-js';

import { AuthService } from './auth/auth.service';
import { DatosContacto } from './contacto';
import { ContactosService } from './contactos.service';
import { SUPABASE } from './supabase/supabase.client';
import { contactoDePrueba, contactoVisibleDePrueba } from './testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

const SELECCION = '*, contactos_compartidos(usuario_id, rol)';
const sesionDe = (id: string) =>
  ({ access_token: `token-${id}`, user: { id, email: `${id}@test.es` } }) as Session;
const tim: DatosContacto = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};
const sinPermiso = new PostgrestError({
  message: 'permission denied for table contactos',
  details: '',
  hint: '',
  code: '42501',
});
// Lo que devuelve PostgREST con la compartición embebida.
const propio = {
  ...contactoDePrueba({ id: 'c1', propietario_id: 'u1' }),
  contactos_compartidos: [],
};
const deOtro = {
  ...contactoDePrueba({ id: 'c2', propietario_id: 'u2', nombre: 'Bill', apellidos: 'Gates' }),
  contactos_compartidos: [{ usuario_id: 'u1', rol: 'editor' }],
};

describe('ContactosService', () => {
  let falso: SupabaseFalso;
  let service: ContactosService;

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    // La sesión guardada en el navegador: la persona usuaria es u1.
    falso.auth.getSession.mockResolvedValue({ data: { session: sesionDe('u1') }, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: falso.cliente }],
    });
    service = TestBed.inject(ContactosService);
    await TestBed.inject(AuthService).listo;
  });

  describe('obtenerContactos', () => {
    it('pide los contactos con la compartición embebida, ordenados por nombre', async () => {
      falso.respuestaDe('contactos', { data: [], error: null });

      await service.obtenerContactos();

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'select', args: [SELECCION] },
            { metodo: 'order', args: ['nombre'] },
          ],
        },
      ]);
    });

    it('el rol es «propietario» en los contactos propios y el de su compartición en los demás', async () => {
      falso.respuestaDe('contactos', { data: [propio, deOtro], error: null });

      const contactos = await service.obtenerContactos();

      expect(contactos.map((contacto) => contacto.rol)).toEqual(['propietario', 'editor']);
    });

    it('devuelve el contacto sin la compartición embebida, con el rol añadido', async () => {
      falso.respuestaDe('contactos', { data: [propio, deOtro], error: null });

      expect(await service.obtenerContactos()).toEqual([
        contactoVisibleDePrueba('propietario', { id: 'c1', propietario_id: 'u1' }),
        contactoVisibleDePrueba('editor', {
          id: 'c2',
          propietario_id: 'u2',
          nombre: 'Bill',
          apellidos: 'Gates',
        }),
      ]);
    });

    it('un contacto propio sigue siendo «propietario» aunque esté compartido con otras personas', async () => {
      const compartidoPorMi = {
        ...propio,
        contactos_compartidos: [
          { usuario_id: 'u2', rol: 'lector' },
          { usuario_id: 'u3', rol: 'editor' },
        ],
      };
      falso.respuestaDe('contactos', { data: [compartidoPorMi], error: null });

      expect((await service.obtenerContactos())[0].rol).toBe('propietario');
    });

    it('toma el usuario de la sesión en cada llamada, no el del momento de crearse el servicio', async () => {
      const compartidoConU2 = {
        ...propio,
        contactos_compartidos: [{ usuario_id: 'u2', rol: 'lector' }],
      };
      falso.respuestaDe('contactos', { data: [compartidoConU2], error: null });
      expect((await service.obtenerContactos())[0].rol).toBe('propietario');

      falso.emitirAuth('SIGNED_IN', sesionDe('u2'));

      expect((await service.obtenerContactos())[0].rol).toBe('lector');
    });

    it('si el contacto no es propio ni está compartido con la persona (la RLS no lo permite), el rol mínimo', async () => {
      const ajeno = { ...deOtro, contactos_compartidos: [{ usuario_id: 'u3', rol: 'editor' }] };
      falso.respuestaDe('contactos', { data: [ajeno], error: null });

      expect((await service.obtenerContactos())[0].rol).toBe('lector');
    });
  });

  describe('obtenerContacto', () => {
    it('pide un contacto por su id con la misma selección y devuelve su rol', async () => {
      falso.respuestaDe('contactos', { data: deOtro, error: null });

      const contacto = await service.obtenerContacto('c2');

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'select', args: [SELECCION] },
            { metodo: 'eq', args: ['id', 'c2'] },
            { metodo: 'maybeSingle', args: [] },
          ],
        },
      ]);
      expect(contacto).toEqual(
        contactoVisibleDePrueba('editor', {
          id: 'c2',
          propietario_id: 'u2',
          nombre: 'Bill',
          apellidos: 'Gates',
        }),
      );
    });

    it('devuelve null si no existe o no se puede ver', async () => {
      falso.respuestaDe('contactos', { data: null, error: null });

      expect(await service.obtenerContacto('c9')).toBeNull();
    });
  });

  describe('agregarContacto', () => {
    it('inserta exactamente los datos recibidos y devuelve la fila creada', async () => {
      const fila = contactoDePrueba({ ...tim, id: 'c9' });
      falso.respuestaDe('contactos', { data: fila, error: null });

      const creado = await service.agregarContacto(tim);

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
      expect(creado).toEqual(fila);
    });
  });

  describe('editarContacto', () => {
    it('actualiza el contacto por su id con los datos recibidos y devuelve la fila', async () => {
      const fila = contactoDePrueba({ ...tim, id: 'c1' });
      falso.respuestaDe('contactos', { data: fila, error: null });

      const editado = await service.editarContacto('c1', tim);

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'update', args: [tim] },
            { metodo: 'eq', args: ['id', 'c1'] },
            { metodo: 'select', args: [] },
            { metodo: 'single', args: [] },
          ],
        },
      ]);
      expect(editado).toEqual(fila);
    });
  });

  describe('eliminarContacto', () => {
    it('borra el contacto por su id', async () => {
      falso.respuestaDe('contactos', { data: null, error: null });

      await expect(service.eliminarContacto('id-1')).resolves.toBeUndefined();

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'delete', args: [] },
            { metodo: 'eq', args: ['id', 'id-1'] },
          ],
        },
      ]);
    });
  });

  // Como el cliente, que no rechaza: el fallo viene en `error`. El servicio lo lanza tal cual,
  // con su `code`, para que quien lo llame lo traduzca con MensajesService.deError().
  it.each([
    ['obtenerContactos', () => service.obtenerContactos()],
    ['obtenerContacto', () => service.obtenerContacto('c1')],
    ['agregarContacto', () => service.agregarContacto(tim)],
    ['editarContacto', () => service.editarContacto('c1', tim)],
    ['eliminarContacto', () => service.eliminarContacto('c1')],
  ])('%s lanza el error de Supabase si lo hay', async (_nombre, llamar) => {
    falso.respuestaDe('contactos', { data: null, error: sinPermiso });

    await expect(llamar()).rejects.toBe(sinPermiso);
  });
});
