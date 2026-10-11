import { TestBed } from '@angular/core/testing';
import { AuthApiError, Session } from '@supabase/supabase-js';

import { SUPABASE } from '../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { AuthService } from './auth.service';

const sesionDe = (id: string, email: string) =>
  ({ access_token: `token-${id}`, user: { id, email } }) as Session;
const ana = sesionDe('u1', 'ana@test.es');
const luis = sesionDe('u2', 'luis@test.es');
const fallo = new AuthApiError('Algo ha ido mal', 400, 'unexpected_failure');

describe('AuthService', () => {
  let falso: SupabaseFalso;
  let service: AuthService;

  beforeEach(() => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: falso.cliente }],
    });
  });

  // El servicio se crea al inyectarlo, y lee la sesión inicial en ese momento: los tests que
  // configuran getSession lo hacen antes de llamar a esta función.
  const crearServicio = () => (service = TestBed.inject(AuthService));

  describe('sesión inicial', () => {
    it('sin sesión guardada, listo se resuelve y no hay sesión ni usuario', async () => {
      crearServicio();
      await service.listo;

      expect(service.sesion()).toBeNull();
      expect(service.usuario()).toBeNull();
    });

    it('con una sesión guardada, listo se resuelve con la sesión y el usuario ya cargados', async () => {
      falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
      crearServicio();
      await service.listo;

      expect(service.sesion()).toBe(ana);
      expect(service.usuario()).toBe(ana.user);
    });

    it('listo no se resuelve hasta que getSession contesta', async () => {
      let contestar!: (respuesta: unknown) => void;
      falso.auth.getSession.mockReturnValue(new Promise((resolver) => (contestar = resolver)));
      crearServicio();
      let resuelto = false;
      service.listo.then(() => (resuelto = true));

      await new Promise((resolver) => setTimeout(resolver));
      expect(resuelto).toBe(false);
      expect(service.sesion()).toBeNull();

      contestar({ data: { session: ana }, error: null });
      await service.listo;
      expect(service.sesion()).toBe(ana);
    });

    it('si getSession contesta con un error, no hay sesión y listo se resuelve igualmente', async () => {
      falso.auth.getSession.mockResolvedValue({ data: { session: null }, error: fallo });
      crearServicio();
      await service.listo;

      expect(service.sesion()).toBeNull();
    });
  });

  describe('eventos de autenticación', () => {
    beforeEach(async () => {
      crearServicio();
      await service.listo;
    });

    it('emitirAuth("SIGNED_IN", sesion) actualiza sesion() y usuario()', () => {
      falso.emitirAuth('SIGNED_IN', ana);

      expect(service.sesion()).toBe(ana);
      expect(service.usuario()).toBe(ana.user);
    });

    it('un evento posterior sustituye la sesión, y SIGNED_OUT la quita', () => {
      falso.emitirAuth('SIGNED_IN', ana);
      falso.emitirAuth('TOKEN_REFRESHED', luis);
      expect(service.sesion()).toBe(luis);

      falso.emitirAuth('SIGNED_OUT', null);
      expect(service.sesion()).toBeNull();
      expect(service.usuario()).toBeNull();
    });
  });

  describe('operaciones', () => {
    beforeEach(async () => {
      crearServicio();
      await service.listo;
    });

    it('registrar llama a signUp con el email, la contraseña y la URL a la que vuelve el enlace del correo', async () => {
      await service.registrar('ana@test.es', 'secreto123');

      expect(falso.auth.signUp).toHaveBeenCalledExactlyOnceWith({
        email: 'ana@test.es',
        password: 'secreto123',
        options: { emailRedirectTo: expect.stringMatching(/\/auth\/confirmar$/) },
      });
    });

    it('entrar deja en sesion() la sesión que devuelve signInWithPassword', async () => {
      falso.auth.signInWithPassword.mockResolvedValue({
        data: { user: ana.user, session: ana },
        error: null,
      });

      await service.entrar('ana@test.es', 'secreto123');

      expect(falso.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
        email: 'ana@test.es',
        password: 'secreto123',
      });
      expect(service.sesion()).toBe(ana);
      expect(service.usuario()?.email).toBe('ana@test.es');
    });

    it('salir llama a signOut solo para este navegador y deja sesion() en null', async () => {
      falso.emitirAuth('SIGNED_IN', ana);

      await service.salir();

      // Sin { scope: 'local' }, supabase-js cierra la sesión en todos los dispositivos.
      expect(falso.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
      expect(service.sesion()).toBeNull();
      expect(service.usuario()).toBeNull();
    });

    it('recuperar pide el correo de recuperación con la URL de nueva contraseña', async () => {
      await service.recuperar('ana@test.es');

      expect(falso.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('ana@test.es', {
        redirectTo: expect.stringMatching(/\/auth\/nueva-contrasena$/),
      });
    });

    it('nuevaContrasena llama a updateUser con la contraseña', async () => {
      await service.nuevaContrasena('otra-clave-123');

      expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
    });

    it('canjearCodigo llama a exchangeCodeForSession con el código', async () => {
      await service.canjearCodigo('codigo-pkce');

      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
    });
  });

  describe('si Supabase devuelve un error, lo lanza tal cual para que quien llama lo muestre', () => {
    beforeEach(async () => {
      crearServicio();
      await service.listo;
    });

    it('entrar, y no toca la sesión', async () => {
      falso.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: fallo,
      });

      await expect(service.entrar('ana@test.es', 'mala')).rejects.toBe(fallo);
      expect(service.sesion()).toBeNull();
    });

    it('registrar', async () => {
      falso.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: fallo });

      await expect(service.registrar('ana@test.es', 'secreto123')).rejects.toBe(fallo);
    });

    it('salir, y no da la sesión por cerrada', async () => {
      falso.emitirAuth('SIGNED_IN', ana);
      falso.auth.signOut.mockResolvedValue({ error: fallo });

      await expect(service.salir()).rejects.toBe(fallo);
      expect(service.sesion()).toBe(ana);
    });

    it('recuperar', async () => {
      falso.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: fallo });

      await expect(service.recuperar('ana@test.es')).rejects.toBe(fallo);
    });

    it('nuevaContrasena', async () => {
      falso.auth.updateUser.mockResolvedValue({ data: { user: null }, error: fallo });

      await expect(service.nuevaContrasena('otra-clave-123')).rejects.toBe(fallo);
    });

    it('canjearCodigo', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: null, session: null },
        error: fallo,
      });

      await expect(service.canjearCodigo('caducado')).rejects.toBe(fallo);
    });
  });

  describe('urlDe', () => {
    let base: HTMLBaseElement;

    beforeEach(() => {
      crearServicio();
      base = document.createElement('base');
      document.head.appendChild(base);
    });

    afterEach(() => base.remove());

    it('resuelve la ruta contra <base href>: en GitHub Pages la aplicación cuelga de /agenda-supabase/', () => {
      base.href = '/agenda-supabase/';

      expect(service.urlDe('auth/confirmar')).toBe(
        `${document.location.origin}/agenda-supabase/auth/confirmar`,
      );
    });

    it('con la aplicación en la raíz, cuelga de ella', () => {
      base.href = '/';

      expect(service.urlDe('auth/nueva-contrasena')).toBe(
        `${document.location.origin}/auth/nueva-contrasena`,
      );
    });
  });
});
