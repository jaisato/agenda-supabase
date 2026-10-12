import { TestBed } from '@angular/core/testing';
import { AuthApiError, AuthRetryableFetchError, PostgrestError } from '@supabase/supabase-js';

import { MensajesService } from './mensajes.service';

describe('MensajesService', () => {
  let service: MensajesService;

  beforeEach(() => {
    service = TestBed.inject(MensajesService);
  });

  describe('aviso visible', () => {
    it('empieza sin ningún aviso', () => {
      expect(service.mensaje()).toBeNull();
    });

    it('error() deja un aviso de tipo error con el texto', () => {
      service.error('No se ha podido guardar');

      expect(service.mensaje()).toEqual({ tipo: 'error', texto: 'No se ha podido guardar' });
    });

    it('exito() deja un aviso de tipo exito con el texto', () => {
      service.exito('Contacto guardado');

      expect(service.mensaje()).toEqual({ tipo: 'exito', texto: 'Contacto guardado' });
    });

    it('un aviso nuevo sustituye al anterior', () => {
      service.error('Algo ha fallado');
      service.exito('Contacto guardado');

      expect(service.mensaje()).toEqual({ tipo: 'exito', texto: 'Contacto guardado' });
    });

    it('limpiar() quita el aviso', () => {
      service.error('Algo ha fallado');
      service.limpiar();

      expect(service.mensaje()).toBeNull();
    });
  });

  describe('deError', () => {
    it('42501 (sin permiso) se traduce, sin mostrar el texto técnico de la base de datos', () => {
      expect(
        service.deError({
          code: '42501',
          message: 'new row violates row-level security policy for table "contactos"',
        }),
      ).toBe('No tienes permiso para hacer eso');
    });

    it('PT404 (no hay usuario con ese email) devuelve el texto de la RPC', () => {
      expect(
        service.deError({ code: 'PT404', message: 'No hay ningún usuario con ese email' }),
      ).toBe('No hay ningún usuario con ese email');
    });

    it('22023 (compartir con uno mismo) devuelve el texto de la RPC', () => {
      expect(
        service.deError({
          code: '22023',
          message: 'No puedes compartir un contacto contigo mismo',
        }),
      ).toBe('No puedes compartir un contacto contigo mismo');
    });

    it('invalid_credentials se traduce', () => {
      expect(
        service.deError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
      ).toBe('Email o contraseña incorrectos');
    });

    it('email_not_confirmed se traduce', () => {
      expect(service.deError({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
        'Confirma tu correo antes de entrar',
      );
    });

    it('user_already_exists se traduce', () => {
      expect(
        service.deError({ code: 'user_already_exists', message: 'User already registered' }),
      ).toBe('Ya existe una cuenta con ese email');
    });

    it('weak_password se traduce', () => {
      expect(service.deError({ code: 'weak_password', message: '' })).toBe(
        'La contraseña debe tener al menos 8 caracteres',
      );
    });

    it('over_email_send_rate_limit se traduce', () => {
      expect(
        service.deError({
          code: 'over_email_send_rate_limit',
          message: 'email rate limit exceeded',
        }),
      ).toBe('Demasiados correos en poco tiempo; espera un momento');
    });

    it('cualquier otro código muestra «Algo ha fallado» con el mensaje original', () => {
      expect(service.deError({ code: '23505', message: 'duplicate key value' })).toBe(
        'Algo ha fallado: duplicate key value',
      );
    });

    it('un error sin código (ausente, null o vacío, como lo deja PostgREST) también cae en «Algo ha fallado»', () => {
      for (const code of [undefined, null, '']) {
        expect(
          service.deError({ code, message: 'SyntaxError: Unexpected end of JSON input' }),
        ).toBe('Algo ha fallado: SyntaxError: Unexpected end of JSON input');
      }
    });

    describe('sin conexión con el servidor (sin red o con el proyecto pausado)', () => {
      // supabase-js no lanza el TypeError de fetch(): PostgREST lo devuelve como un error con code
      // vacío y el nombre delante, y Auth como un AuthRetryableFetchError con status 0. El texto
      // depende del navegador: Chrome, Firefox y Safari.
      const deFetch = [
        'Failed to fetch',
        'NetworkError when attempting to fetch resource.',
        'Load failed',
      ];

      it('el error de PostgREST dice «No hay conexión con el servidor», no el TypeError en inglés', () => {
        for (const mensaje of deFetch) {
          const deLaBase = { message: `TypeError: ${mensaje}`, details: '', hint: '', code: '' };

          expect(service.deError(deLaBase)).toBe('No hay conexión con el servidor');
        }
      });

      it('el de Auth, también', () => {
        for (const mensaje of deFetch) {
          expect(service.deError(new AuthRetryableFetchError(mensaje, 0))).toBe(
            'No hay conexión con el servidor',
          );
        }
      });

      it('un TypeError que no es de fetch() sigue en «Algo ha fallado»', () => {
        const fallo = "TypeError: Cannot read properties of null (reading 'email')";

        expect(service.deError({ code: '', message: fallo })).toBe(`Algo ha fallado: ${fallo}`);
      });
    });

    it('P0002 ya no es el código de «no hay usuario»: la RPC usa PT404', () => {
      expect(service.deError({ code: 'P0002', message: 'no data found' })).toBe(
        'Algo ha fallado: no data found',
      );
    });

    it('acepta los errores reales de supabase-js: PostgrestError y AuthApiError', () => {
      const deLaBase = new PostgrestError({
        message: 'permission denied for table contactos',
        details: '',
        hint: '',
        code: '42501',
      });
      const deAuth = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');

      expect(service.deError(deLaBase)).toBe('No tienes permiso para hacer eso');
      expect(service.deError(deAuth)).toBe('Email o contraseña incorrectos');
    });
  });
});
