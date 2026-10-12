import { TestBed } from '@angular/core/testing';
import { PostgrestError, Session } from '@supabase/supabase-js';

import { AuthService } from './auth/auth.service';
import { DatosContacto, Rol } from './contacto';
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
const sinUsuario = new PostgrestError({
  message: 'No hay ningún usuario con ese email',
  details: '',
  hint: '',
  code: 'PT404',
});
const conUnoMismo = new PostgrestError({
  message: 'No puedes compartir un contacto contigo mismo',
  details: '',
  hint: '',
  code: '22023',
});
// La fila de contactos_compartidos que devuelve la RPC compartir_contacto.
const filaCompartida = (rol: Rol) => ({
  contacto_id: 'c1',
  usuario_id: 'u2',
  rol,
  creado_en: '2026-10-01T10:00:00+00:00',
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

  describe('compartir', () => {
    it('llama a la RPC compartir_contacto con el contacto, el email y el rol, y devuelve la compartición', async () => {
      falso.respuestaRpc('compartir_contacto', { data: filaCompartida('lector'), error: null });

      const comparticion = await service.compartir('c1', 'b@x.es', 'lector');

      expect(falso.cliente.rpc).toHaveBeenCalledExactlyOnceWith('compartir_contacto', {
        p_contacto_id: 'c1',
        p_email: 'b@x.es',
        p_rol: 'lector',
      });
      // La RPC devuelve la fila de contactos_compartidos, sin email: es el que se ha pedido.
      expect(comparticion).toEqual({ usuario_id: 'u2', rol: 'lector', email: 'b@x.es' });
      // Es una RPC, no una consulta de tabla.
      expect(falso.consultas).toEqual([]);
    });
  });

  describe('listarComparticiones', () => {
    it('pide las comparticiones del contacto con el email de su perfil y aplana perfiles.email', async () => {
      falso.respuestaDe('contactos_compartidos', {
        data: [
          { usuario_id: 'u2', rol: 'lector', perfiles: { email: 'b@x.es' } },
          { usuario_id: 'u3', rol: 'editor', perfiles: { email: 'c@x.es' } },
        ],
        error: null,
      });

      const comparticiones = await service.listarComparticiones('c1');

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'select', args: ['usuario_id, rol, perfiles(email)'] },
            { metodo: 'eq', args: ['contacto_id', 'c1'] },
          ],
        },
      ]);
      expect(comparticiones).toEqual([
        { usuario_id: 'u2', rol: 'lector', email: 'b@x.es' },
        { usuario_id: 'u3', rol: 'editor', email: 'c@x.es' },
      ]);
    });

    it('un contacto que no se ha compartido con nadie da una lista vacía', async () => {
      falso.respuestaDe('contactos_compartidos', { data: [], error: null });

      expect(await service.listarComparticiones('c1')).toEqual([]);
    });
  });

  describe('cambiarRol', () => {
    it('actualiza el rol de esa compartición, filtrando por contacto y por usuario', async () => {
      falso.respuestaDe('contactos_compartidos', { data: null, error: null });

      await expect(service.cambiarRol('c1', 'u2', 'editor')).resolves.toBeUndefined();

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'update', args: [{ rol: 'editor' }] },
            { metodo: 'eq', args: ['contacto_id', 'c1'] },
            { metodo: 'eq', args: ['usuario_id', 'u2'] },
          ],
        },
      ]);
    });
  });

  describe('dejarDeCompartir', () => {
    it('borra esa compartición, filtrando por contacto y por usuario', async () => {
      falso.respuestaDe('contactos_compartidos', { data: null, error: null });

      await expect(service.dejarDeCompartir('c1', 'u2')).resolves.toBeUndefined();

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'delete', args: [] },
            { metodo: 'eq', args: ['contacto_id', 'c1'] },
            { metodo: 'eq', args: ['usuario_id', 'u2'] },
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

  it.each([
    ['listarComparticiones', () => service.listarComparticiones('c1')],
    ['cambiarRol', () => service.cambiarRol('c1', 'u2', 'editor')],
    ['dejarDeCompartir', () => service.dejarDeCompartir('c1', 'u2')],
  ])('%s lanza el error de Supabase si lo hay', async (_nombre, llamar) => {
    falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });

    await expect(llamar()).rejects.toBe(sinPermiso);
  });

  // Los errores de la RPC llegan con el código que decide MensajesService.deError(): 42501 (no es
  // el propietario), PT404 (no hay nadie con ese email) y 22023 (compartir con uno mismo).
  it.each([sinPermiso, sinUsuario, conUnoMismo])(
    'compartir lanza tal cual el error $code de la RPC',
    async (error) => {
      falso.respuestaRpc('compartir_contacto', { data: null, error });

      await expect(service.compartir('c1', 'b@x.es', 'lector')).rejects.toBe(error);
    },
  );
});
