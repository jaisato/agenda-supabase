import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApiError, AuthWeakPasswordError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import { NuevaContrasenaComponent } from './nueva-contrasena.component';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const canjeValido = { data: { session: ana, user: ana.user }, error: null };
const canjeCaducado = {
  data: { user: null, session: null },
  error: new AuthApiError(
    'invalid flow state, no valid flow state found',
    404,
    'flow_state_not_found',
  ),
};

describe('NuevaContrasenaComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<NuevaContrasenaComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const campo = () => elemento.querySelector<HTMLInputElement>('form input#password')!;
  const guardar = () => elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const texto = () => elemento.textContent?.replace(/\s+/g, ' ');
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  // Lo que en la aplicación entrega el router (withComponentInputBinding) desde ?code=…
  const abrir = async (code?: string) => {
    fixture = TestBed.createComponent(NuevaContrasenaComponent);
    elemento = fixture.nativeElement;
    if (code !== undefined) {
      fixture.componentRef.setInput('code', code);
    }
    await reposar();
  };
  const escribir = async (password: string) => {
    campo().value = password;
    campo().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const enviar = async () => {
    guardar().click();
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

  it('guardar llama a updateUser con la contraseña, avisa «Contraseña actualizada» y navega a /mis-contactos sustituyendo la URL', async () => {
    falso.auth.exchangeCodeForSession.mockResolvedValue(canjeValido);
    await abrir('codigo-pkce');
    await escribir('otra-clave-123');

    await enviar();

    expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
    expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Contraseña actualizada' });
    // replaceUrl: «Atrás» no debe volver a la URL cuyo code ya está gastado.
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
  });

  describe('con code (enlace del correo de recuperación)', () => {
    it('lo canjea primero y solo después deja guardar', async () => {
      let terminarElCanje!: (respuesta: unknown) => void;
      falso.auth.exchangeCodeForSession.mockReturnValue(
        new Promise((resolver) => (terminarElCanje = resolver)),
      );
      await abrir('codigo-pkce');
      await escribir('otra-clave-123');

      // Sin sesión todavía: guardar fallaría.
      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
      expect(guardar().disabled).toBe(true);

      terminarElCanje(canjeValido);
      await reposar();
      expect(guardar().disabled).toBe(false);

      await enviar();
      expect(falso.auth.updateUser).toHaveBeenCalledOnce();
      expect(falso.auth.exchangeCodeForSession.mock.invocationCallOrder[0]).toBeLessThan(
        falso.auth.updateUser.mock.invocationCallOrder[0],
      );
    });

    it('si el code ha caducado o ya se usó, no hay formulario: avisa y ofrece pedir otro enlace en /auth/recuperar', async () => {
      falso.auth.exchangeCodeForSession.mockResolvedValue(canjeCaducado);

      await abrir('caducado');

      expect(texto()).toContain('No hemos podido validar el enlace. Puede haber caducado.');
      const enlace = Array.from(elemento.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Pedir otro enlace',
      );
      expect(enlace?.getAttribute('href')).toBe('/auth/recuperar');
      expect(elemento.querySelector('form')).toBeNull();
      expect(navegar).not.toHaveBeenCalled();
    });
  });

  describe('sin code (la sesión ya está abierta)', () => {
    it('no canjea nada y deja guardar la nueva contraseña', async () => {
      await abrir();

      expect(guardar().disabled).toBe(true);
      await escribir('otra-clave-123');
      expect(guardar().disabled).toBe(false);
      await enviar();

      expect(falso.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
    });
  });

  describe('si guardar falla', () => {
    it('avisa del error legible, no navega y el formulario sigue para reintentar', async () => {
      falso.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: new AuthWeakPasswordError('Password should be at least 8 characters', 422, []),
      });
      await abrir();
      await escribir('corta');

      await enviar();

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'La contraseña debe tener al menos 8 caracteres',
      });
      expect(navegar).not.toHaveBeenCalled();
      expect(campo().value).toBe('corta');
      expect(guardar().disabled).toBe(false);
    });

    it('mientras espera la respuesta no deja enviar otra vez', async () => {
      let contestar!: (respuesta: unknown) => void;
      falso.auth.updateUser.mockReturnValue(new Promise((resolver) => (contestar = resolver)));
      await abrir();
      await escribir('otra-clave-123');

      await enviar();
      expect(guardar().disabled).toBe(true);
      // Intro dentro del campo: envía el formulario sin pasar por el botón deshabilitado.
      elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
      await reposar();
      expect(falso.auth.updateUser).toHaveBeenCalledOnce();

      contestar({ data: { user: ana.user }, error: null });
      await reposar();
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
    });
  });
});
