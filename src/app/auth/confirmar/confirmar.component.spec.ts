import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApiError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import { ConfirmarComponent } from './confirmar.component';

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
  // Lo que en la aplicación entrega el router (withComponentInputBinding) desde ?code=…
  const abrir = async (code?: string) => {
    fixture = TestBed.createComponent(ConfirmarComponent);
    elemento = fixture.nativeElement;
    if (code !== undefined) {
      fixture.componentRef.setInput('code', code);
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
  });

  describe('con code', () => {
    it('lo canjea, avisa «Cuenta confirmada» y navega a /mis-contactos sustituyendo en el historial la URL con el code', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue({
        data: { session: ana, user: ana.user },
        error: null,
      });

      await abrir('codigo-pkce');

      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
      expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Cuenta confirmada' });
      // replaceUrl: «Atrás» no debe volver a una URL cuyo code ya está gastado.
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
    });

    it('mientras lo canjea muestra «Confirmando tu cuenta…», no un error ni una pantalla en blanco', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      await abrir('codigo-pkce');

      expect(texto()).toContain('Confirmando tu cuenta…');
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
      expect(texto()).not.toContain('Confirmando tu cuenta');
      expect(enlaceEntrar()?.getAttribute('href')).toBe('/entrar');
      expect(navegar).not.toHaveBeenCalled();
      // El aviso es el propio texto de la página: ni «Cuenta confirmada» ni un error técnico aparte.
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
