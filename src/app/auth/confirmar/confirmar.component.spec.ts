import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApiError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import {
  AVISO_PASO_PENDIENTE,
  ConfirmarComponent,
  FALLO_ACCESO_DENEGADO,
  FALLO_ENLACE_CADUCADO,
  FALLO_GENERICO,
} from './confirmar.component';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
// Si el enlace se abre en otro navegador, GoTrue ya ha confirmado la cuenta, pero sin el
// code_verifier de PKCE el canje falla: el texto tiene que decirlo.
const noSePudoConfirmar =
  'No hemos podido confirmar la cuenta. El enlace puede haber caducado. Si lo abriste en otro ' +
  'navegador o dispositivo, la cuenta ya está confirmada: entra con tu email y contraseña.';
const codigoCaducado = new AuthApiError(
  'invalid flow state, no valid flow state found',
  404,
  'flow_state_not_found',
);

describe('ConfirmarComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<ConfirmarComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const texto = () => elemento.textContent?.replace(/\s+/g, ' ');
  const enlaceEntrar = () =>
    Array.from(elemento.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Entrar');
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  // Lo que en la aplicación entrega el router (withComponentInputBinding) desde ?code=…, ?message=…
  // o ?error_description=… (los nombres son los de la query, como los recibe el componente).
  // Un parámetro repetido en la URL (?message=a&message=b) llega como array.
  const abrir = async (code?: string, query: Record<string, string | string[]> = {}) => {
    fixture = TestBed.createComponent(ConfirmarComponent);
    elemento = fixture.nativeElement;
    if (code !== undefined) {
      fixture.componentRef.setInput('code', code);
    }
    for (const [nombre, valor] of Object.entries(query)) {
      fixture.componentRef.setInput(nombre, valor);
    }
    await reposar();
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

  describe('sin code (enlace incompleto)', () => {
    it('muestra el texto de error y un enlace a /entrar, sin llamar a exchangeCodeForSession ni navegar', async () => {
      await abrir();

      expect(texto()).toContain(noSePudoConfirmar);
      expect(enlaceEntrar()?.getAttribute('href')).toBe('/entrar');
      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(navegar).not.toHaveBeenCalled();
    });

    it('un code vacío (?code=) cuenta como ausente', async () => {
      await abrir('');

      expect(texto()).toContain(noSePudoConfirmar);
      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    // El cambio de email con confirmación doble: el primer enlace acepta y GoTrue vuelve sin code,
    // con el aviso de que falta el del otro correo. No es un error y no hay nada que canjear.
    it('con ?message= avisa de que falta el otro enlace, sin darlo por error ni canjear nada', async () => {
      const aviso =
        'Confirmation link accepted. Please proceed to confirm link sent to the other email';

      await abrir(undefined, { message: aviso });

      expect(texto()).toContain(AVISO_PASO_PENDIENTE);
      expect(texto()).not.toContain(aviso);
      expect(texto()).not.toContain(noSePudoConfirmar);
      expect(texto()).not.toContain('Confirmando…');
      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(navegar).not.toHaveBeenCalled();
      expect(mensajes.mensaje()).toBeNull();
    });

    // OAuth cancelado o denegado en el proveedor: GoTrue vuelve con ?error=&error_description=.
    it('con ?error=access_denied avisa de que no hay sesión y enlaza a /entrar, sin canjear nada', async () => {
      await abrir(undefined, { error: 'access_denied', error_description: 'User denied access' });

      expect(texto()).toContain(FALLO_ACCESO_DENEGADO);
      expect(texto()).not.toContain('User denied access');
      expect(texto()).not.toContain(noSePudoConfirmar);
      expect(enlaceEntrar()?.getAttribute('href')).toBe('/entrar');
      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(navegar).not.toHaveBeenCalled();
    });

    // Un enlace del correo caducado: GoTrue añade ?error_code=otp_expired al access_denied.
    it('con ?error_code=otp_expired dice que el enlace ha caducado', async () => {
      await abrir(undefined, {
        error: 'access_denied',
        error_code: 'otp_expired',
        error_description: 'Email link is invalid or has expired',
      });

      expect(texto()).toContain(FALLO_ENLACE_CADUCADO);
      expect(enlaceEntrar()?.getAttribute('href')).toBe('/entrar');
      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    // Cualquiera puede fabricar un enlace a /auth/confirmar: lo que trae la URL no se enseña nunca.
    it('no muestra el texto de un ?message= ni de un ?error_description= fabricados', async () => {
      const falsoAviso = 'Tu cuenta está bloqueada. Llama al 900 000 000 para recuperarla.';

      await abrir(undefined, { message: falsoAviso });
      expect(texto()).not.toContain(falsoAviso);
      expect(texto()).toContain(AVISO_PASO_PENDIENTE);

      await abrir(undefined, { error: 'server_error', error_description: falsoAviso });
      expect(texto()).not.toContain(falsoAviso);
      expect(texto()).toContain(FALLO_GENERICO);

      await abrir(undefined, { error_description: falsoAviso });
      expect(texto()).not.toContain(falsoAviso);
      expect(texto()).toContain(FALLO_GENERICO);
    });

    // Un enlace fabricado con un parámetro repetido no deja la página en «Confirmando…».
    it.each(['message', 'error', 'error_code', 'error_description'])(
      'con ?%s repetido trata el enlace como incompleto',
      async (nombre) => {
        await abrir(undefined, { [nombre]: ['a', 'b'] });

        expect(texto()).toContain(noSePudoConfirmar);
        expect(texto()).not.toContain('Confirmando…');
        expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      },
    );
  });

  describe('con code', () => {
    it('lo canjea, avisa «Sesión iniciada» y navega a /mis-contactos sustituyendo en el historial la URL con el code', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue({
        data: { session: ana, user: ana.user },
        error: null,
      });

      await abrir('codigo-pkce');

      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Sesión iniciada' });
      // replaceUrl: «Atrás» no debe volver a una URL cuyo code ya está gastado.
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
    });

    it('mientras lo canjea muestra «Confirmando…», no un error ni una pantalla en blanco', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      await abrir('codigo-pkce');

      expect(texto()).toContain('Confirmando…');
      expect(texto()).not.toContain(noSePudoConfirmar);
      expect(navegar).not.toHaveBeenCalled();
    });

    it('si el code ha caducado o ya se usó, muestra el texto de error y el enlace a /entrar, sin navegar ni dar la cuenta por confirmada', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: null, session: null },
        error: codigoCaducado,
      });

      await abrir('caducado');

      expect(texto()).toContain(noSePudoConfirmar);
      expect(texto()).not.toContain('Confirmando…');
      expect(enlaceEntrar()?.getAttribute('href')).toBe('/entrar');
      expect(navegar).not.toHaveBeenCalled();
      // El aviso es el propio texto de la página: ni «Sesión iniciada» ni un error técnico aparte.
      expect(mensajes.mensaje()).toBeNull();
    });

    it('el code se canjea una sola vez (es de un solo uso), aunque el input cambie después', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue({
        data: { session: ana, user: ana.user },
        error: null,
      });
      await abrir('codigo-pkce');

      fixture.componentRef.setInput('code', 'otro-codigo');
      await reposar();

      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
    });
  });
});
