import { AuthChangeEvent, PostgrestError, Session, SupabaseClient } from '@supabase/supabase-js';
import { vi, type Mock } from 'vitest';

import { Database } from '../supabase/database.types';

/** Lo que resuelve una consulta: como `supabase-js`, nunca rechaza; el fallo va en `error`. */
export type RespuestaFalsa = { data: unknown; error: PostgrestError | null };

/** Una consulta registrada: la tabla y cada método encadenado con sus argumentos, en orden. */
export type ConsultaFalsa = {
  tabla: string;
  cadena: Array<{ metodo: string; args: unknown[] }>;
};

type CallbackAuth = (evento: AuthChangeEvent, sesion: Session | null) => void;

export interface SupabaseFalso {
  /** Lo que se provee como `SUPABASE`. */
  readonly cliente: SupabaseClient<Database>;
  /** Los mocks de `cliente.auth`: se reconfiguran con `mockResolvedValue` y se comprueban con `expect`. */
  readonly auth: {
    readonly getSession: Mock;
    readonly signUp: Mock;
    readonly signInWithPassword: Mock;
    readonly signOut: Mock;
    readonly resetPasswordForEmail: Mock;
    readonly updateUser: Mock;
    readonly exchangeCodeForSession: Mock;
    readonly signInWithOAuth: Mock;
    readonly onAuthStateChange: Mock;
  };
  /** Los mocks de `storage.from('avatares')`. Todas las llamadas comparten estos. */
  readonly storage: {
    readonly upload: Mock;
    readonly remove: Mock;
    readonly createSignedUrl: Mock;
  };
  /** Una entrada por cada `from()`, en el orden en que se crean. Las llamadas a `rpc` no entran. */
  readonly consultas: ConsultaFalsa[];
  /** Simula un evento de `onAuthStateChange` (avisa a todos los suscriptores). */
  emitirAuth(evento: AuthChangeEvent, sesion: Session | null): void;
  /** Dispara los callbacks de broadcast registrados en los canales. */
  emitirTiempoReal(): void;
  /** Respuesta de las consultas a `from(tabla)`; sin configurar, `{ data: null, error: null }`. */
  respuestaDe(tabla: string, respuesta: RespuestaFalsa): void;
  /** Respuesta de `rpc(nombre, …)`; sin configurar, `{ data: null, error: null }`. */
  respuestaRpc(nombre: string, respuesta: RespuestaFalsa): void;
}

/**
 * Los métodos de PostgREST que la aplicación encadena sobre `from()`. Cualquier otro no existe en
 * el falso: si una tarea necesita otro (`limit`, `in`…), se añade aquí.
 */
const METODOS_DE_CONSULTA = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'order',
  'single',
  'maybeSingle',
]);

const sinRespuesta = (): RespuestaFalsa => ({ data: null, error: null });

/**
 * Doble de `SupabaseClient<Database>` para las pruebas. Solo lo importan los `*.spec.ts`; queda
 * fuera de la compilación de la aplicación (ver `tsconfig.app.json`).
 *
 *     const falso = crearSupabaseFalso();
 *     TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: falso.cliente }] });
 *     falso.respuestaDe('contactos', { data: [fila], error: null });
 *     …
 *     expect(falso.consultas).toEqual([{ tabla: 'contactos', cadena: [{ metodo: 'select', args: ['*'] }] }]);
 *     expect(falso.cliente.rpc).toHaveBeenCalledWith('compartir_contacto', { … });
 */
export function crearSupabaseFalso(): SupabaseFalso {
  const consultas: ConsultaFalsa[] = [];
  const respuestasDeTablas = new Map<string, RespuestaFalsa>();
  const respuestasDeRpc = new Map<string, RespuestaFalsa>();
  const suscriptores = new Set<CallbackAuth>();

  const auth: SupabaseFalso['auth'] = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    })),
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: null }, error: null })),
    onAuthStateChange: vi.fn((callback: CallbackAuth) => {
      suscriptores.add(callback);
      const unsubscribe = vi.fn(() => {
        suscriptores.delete(callback);
      });
      return { data: { subscription: { unsubscribe } } };
    }),
  };

  // Cada método de la cadena se registra y devuelve el mismo builder; el builder es «thenable»
  // y, al esperarlo, resuelve la respuesta configurada en ese momento.
  const crearBuilder = (consulta: ConsultaFalsa, respuesta: () => RespuestaFalsa): object => {
    const builder: object = new Proxy(
      {},
      {
        get: (_objetivo, propiedad) => {
          if (propiedad === 'then') {
            return (
              resolver: (valor: RespuestaFalsa) => unknown,
              rechazar: (motivo: unknown) => unknown,
            ) => Promise.resolve(respuesta()).then(resolver, rechazar);
          }
          if (typeof propiedad === 'string' && METODOS_DE_CONSULTA.has(propiedad)) {
            return (...args: unknown[]) => {
              consulta.cadena.push({ metodo: propiedad, args });
              return builder;
            };
          }
          return undefined;
        },
      },
    );
    return builder;
  };

  const from = vi.fn((tabla: string) => {
    const consulta: ConsultaFalsa = { tabla, cadena: [] };
    consultas.push(consulta);
    return crearBuilder(consulta, () => respuestasDeTablas.get(tabla) ?? sinRespuesta());
  });

  const rpc = vi.fn(
    async (nombre: string, _args?: unknown) => respuestasDeRpc.get(nombre) ?? sinRespuesta(),
  );

  const upload = vi.fn(async () => ({ data: { path: '' }, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrl = vi.fn(async (ruta: string) => ({
    data: { signedUrl: `https://firmada.local/${ruta}` },
    error: null,
  }));
  const storage = {
    from: vi.fn(() => ({ upload, remove, createSignedUrl })),
  };

  const callbacksTiempoReal: Array<() => void> = [];
  const channel = vi.fn((nombre: string) => {
    const canal = {
      on: vi.fn((...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback === 'function') {
          callbacksTiempoReal.push(callback as () => void);
        }
        return canal;
      }),
      subscribe: vi.fn(() => canal),
      nombre,
    };
    return canal;
  });
  const removeChannel = vi.fn(async () => 'ok');
  const setAuth = vi.fn(async () => undefined);

  return {
    cliente: {
      auth,
      from,
      rpc,
      storage,
      channel,
      removeChannel,
      realtime: { setAuth },
    } as unknown as SupabaseClient<Database>,
    auth,
    storage: { upload, remove, createSignedUrl },
    consultas,
    emitirAuth: (evento, sesion) => {
      if (suscriptores.size === 0) {
        throw new Error(
          'crearSupabaseFalso: nadie está suscrito a onAuthStateChange. ¿Se ha creado ya AuthService?',
        );
      }
      for (const callback of [...suscriptores]) {
        callback(evento, sesion);
      }
    },
    respuestaDe: (tabla, respuesta) => {
      respuestasDeTablas.set(tabla, respuesta);
    },
    respuestaRpc: (nombre, respuesta) => {
      respuestasDeRpc.set(nombre, respuesta);
    },
    emitirTiempoReal: () => {
      for (const callback of [...callbacksTiempoReal]) {
        callback();
      }
    },
  };
}
