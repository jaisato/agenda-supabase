import { PostgrestError, Session } from '@supabase/supabase-js';

import { SupabaseFalso, crearSupabaseFalso } from './supabase-falso';

const sesion = { access_token: 'token-u1', user: { id: 'u1' } } as Session;
const sinPermiso = new PostgrestError({
  message: 'permission denied for table contactos',
  details: '',
  hint: '',
  code: '42501',
});
const argumentosRpc = { p_contacto_id: 'c1', p_email: 'b@x.es', p_rol: 'lector' } as const;
// Para llamar a los métodos del builder sin pasar por los tipos de PostgREST.
type Builder = Record<string, (...args: unknown[]) => unknown>;

describe('crearSupabaseFalso', () => {
  let falso: SupabaseFalso;

  beforeEach(() => {
    falso = crearSupabaseFalso();
  });

  describe('from()', () => {
    it('sin respuesta configurada, esperar la consulta resuelve { data: null, error: null }', async () => {
      expect(await falso.cliente.from('contactos').select()).toEqual({ data: null, error: null });
    });

    it('registra la tabla y cada método encadenado con sus argumentos, en orden', async () => {
      await falso.cliente
        .from('contactos')
        .select('*, contactos_compartidos(usuario_id, rol)')
        .order('nombre');

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'select', args: ['*, contactos_compartidos(usuario_id, rol)'] },
            { metodo: 'order', args: ['nombre'] },
          ],
        },
      ]);
    });

    it('registra también las mutaciones con sus datos y los filtros con su columna y valor', async () => {
      const datos = { nombre: 'Tim' };
      await falso.cliente.from('contactos').update(datos).eq('id', 'c1').select().single();

      expect(falso.consultas[0].cadena).toEqual([
        { metodo: 'update', args: [datos] },
        { metodo: 'eq', args: ['id', 'c1'] },
        { metodo: 'select', args: [] },
        { metodo: 'single', args: [] },
      ]);
    });

    it('admite los nueve métodos de la cadena y cada uno devuelve el mismo builder', () => {
      const builder = falso.cliente.from('contactos') as unknown as Builder;
      const metodos = [
        'select',
        'insert',
        'update',
        'delete',
        'upsert',
        'eq',
        'order',
        'single',
        'maybeSingle',
      ];

      for (const metodo of metodos) {
        expect(builder[metodo](), metodo).toBe(builder);
      }
      expect(falso.consultas[0].cadena.map((eslabon) => eslabon.metodo)).toEqual(metodos);
    });

    it('un método que no está en la lista no existe: un uso no previsto falla de forma visible', () => {
      const builder = falso.cliente.from('contactos') as unknown as Builder;

      expect(builder['limit']).toBeUndefined();
      expect(() => builder['limit'](1)).toThrow(TypeError);
    });

    it('resuelve, sin rechazar, la respuesta configurada para la tabla, también con error', async () => {
      falso.respuestaDe('contactos', { data: [{ id: 'c1' }], error: null });
      falso.respuestaDe('perfiles', { data: null, error: sinPermiso });

      expect(await falso.cliente.from('contactos').select()).toEqual({
        data: [{ id: 'c1' }],
        error: null,
      });
      expect(await falso.cliente.from('perfiles').select()).toEqual({
        data: null,
        error: sinPermiso,
      });
    });

    it('toma la respuesta al esperar la consulta, no al crearla', async () => {
      const consulta = falso.cliente.from('contactos').select();
      falso.respuestaDe('contactos', { data: [], error: null });

      expect(await consulta).toEqual({ data: [], error: null });
    });

    it('una tabla sin configurar no hereda la respuesta de otra', async () => {
      falso.respuestaDe('contactos', { data: [{ id: 'c1' }], error: null });

      expect(await falso.cliente.from('contactos_compartidos').select()).toEqual({
        data: null,
        error: null,
      });
    });

    it('registra una consulta por cada from(), en el orden en que se crean', async () => {
      await falso.cliente.from('contactos').select();
      await falso.cliente.from('contactos_compartidos').delete().eq('contacto_id', 'c1');

      expect(falso.consultas.map((consulta) => consulta.tabla)).toEqual([
        'contactos',
        'contactos_compartidos',
      ]);
    });

    it('from es un mock de Vitest: se puede comprobar con qué tabla se llamó', () => {
      falso.cliente.from('perfiles');

      expect(falso.cliente.from).toHaveBeenCalledExactlyOnceWith('perfiles');
    });
  });

  describe('rpc()', () => {
    it('sin respuesta configurada resuelve { data: null, error: null }', async () => {
      expect(await falso.cliente.rpc('compartir_contacto', argumentosRpc)).toEqual({
        data: null,
        error: null,
      });
    });

    it('resuelve la respuesta configurada para esa función y registra la llamada', async () => {
      const fila = { usuario_id: 'u2', rol: 'lector' };
      falso.respuestaRpc('compartir_contacto', { data: fila, error: null });
      falso.respuestaRpc('otra_funcion', { data: null, error: sinPermiso });

      const respuesta = await falso.cliente.rpc('compartir_contacto', argumentosRpc);

      expect(respuesta).toEqual({ data: fila, error: null });
      expect(falso.cliente.rpc).toHaveBeenCalledExactlyOnceWith(
        'compartir_contacto',
        argumentosRpc,
      );
    });

    it('resuelve también un error de la función, sin rechazar', async () => {
      falso.respuestaRpc('compartir_contacto', { data: null, error: sinPermiso });

      expect(await falso.cliente.rpc('compartir_contacto', argumentosRpc)).toEqual({
        data: null,
        error: sinPermiso,
      });
    });

    it('su respuesta no se mezcla con la de una tabla del mismo nombre', async () => {
      falso.respuestaDe('compartir_contacto', { data: [1], error: null });

      expect(await falso.cliente.rpc('compartir_contacto', argumentosRpc)).toEqual({
        data: null,
        error: null,
      });
    });

    it('una llamada a rpc no se registra como consulta de tabla', async () => {
      await falso.cliente.rpc('compartir_contacto', argumentosRpc);

      expect(falso.consultas).toEqual([]);
    });
  });

  describe('auth', () => {
    it('getSession resuelve por defecto sin sesión', async () => {
      expect(await falso.cliente.auth.getSession()).toEqual({
        data: { session: null },
        error: null,
      });
    });

    it('los métodos de cliente.auth son los mocks de falso.auth y se pueden reconfigurar', async () => {
      falso.auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });

      expect(falso.cliente.auth.getSession).toBe(falso.auth.getSession);
      expect(await falso.cliente.auth.getSession()).toEqual({
        data: { session: sesion },
        error: null,
      });
    });

    it('el resto de métodos de auth resuelven por defecto una respuesta sin error', async () => {
      const auth = falso.cliente.auth;
      const respuestas = await Promise.all([
        auth.signUp({ email: 'a@b.es', password: 'secreto123' }),
        auth.signInWithPassword({ email: 'a@b.es', password: 'secreto123' }),
        auth.signOut(),
        auth.resetPasswordForEmail('a@b.es'),
        auth.updateUser({ password: 'secreto123' }),
        auth.exchangeCodeForSession('codigo'),
      ]);

      expect(respuestas.map((respuesta) => respuesta.error)).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    });

    it('emitirAuth avisa al callback registrado con onAuthStateChange', () => {
      const callback = vi.fn();
      falso.cliente.auth.onAuthStateChange(callback);

      falso.emitirAuth('SIGNED_IN', sesion);
      falso.emitirAuth('SIGNED_OUT', null);

      expect(callback.mock.calls).toEqual([
        ['SIGNED_IN', sesion],
        ['SIGNED_OUT', null],
      ]);
    });

    it('avisa a todos los suscriptores', () => {
      const uno = vi.fn();
      const otro = vi.fn();
      falso.cliente.auth.onAuthStateChange(uno);
      falso.cliente.auth.onAuthStateChange(otro);

      falso.emitirAuth('SIGNED_IN', sesion);

      expect(uno).toHaveBeenCalledExactlyOnceWith('SIGNED_IN', sesion);
      expect(otro).toHaveBeenCalledExactlyOnceWith('SIGNED_IN', sesion);
    });

    it('onAuthStateChange devuelve { data: { subscription: { unsubscribe } } } y esa suscripción deja de avisar', () => {
      const quitado = vi.fn();
      const seQueda = vi.fn();
      const { data } = falso.cliente.auth.onAuthStateChange(quitado);
      falso.cliente.auth.onAuthStateChange(seQueda);

      data.subscription.unsubscribe();
      falso.emitirAuth('SIGNED_IN', sesion);

      expect(quitado).not.toHaveBeenCalled();
      expect(seQueda).toHaveBeenCalledExactlyOnceWith('SIGNED_IN', sesion);
    });

    it('emitirAuth sin nadie suscrito falla con un mensaje claro en vez de no hacer nada', () => {
      expect(() => falso.emitirAuth('SIGNED_IN', sesion)).toThrow(/onAuthStateChange/);
    });
  });

  it('cada llamada a crearSupabaseFalso crea un falso independiente', async () => {
    falso.respuestaDe('contactos', { data: [1], error: null });
    const otro = crearSupabaseFalso();

    expect(await otro.cliente.from('contactos').select()).toEqual({ data: null, error: null });
    expect(otro.consultas).toHaveLength(1);
    expect(falso.consultas).toHaveLength(0);
  });
});
