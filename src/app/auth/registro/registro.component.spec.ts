import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthApiError, AuthWeakPasswordError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import { RegistroComponent } from './registro.component';

const revisaTuCorreo =
  'Revisa tu correo: te hemos enviado un enlace para confirmar la cuenta. Ábrelo en este mismo navegador.';
const respuestaDe = (error: AuthApiError | AuthWeakPasswordError | null) => ({
  data: { user: null, session: null },
  error,
});

describe('RegistroComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<RegistroComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  const campo = (id: 'email' | 'password') =>
    elemento.querySelector<HTMLInputElement>(`form input#${id}`)!;
  const crearCuenta = () =>
    elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const formulario = () => elemento.querySelector('form');
  const texto = () => elemento.textContent?.replace(/\s+/g, ' ');
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  const escribir = async (email: string, password: string) => {
    campo('email').value = email;
    campo('email').dispatchEvent(new Event('input'));
    campo('password').value = password;
    campo('password').dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const enviar = async () => {
    crearCuenta().click();
    await reposar();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    fixture = TestBed.createComponent(RegistroComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('muestra el formulario con el botón «Crear cuenta», deshabilitado hasta que hay email y contraseña', async () => {
    expect(crearCuenta().textContent?.trim()).toBe('Crear cuenta');
    expect(crearCuenta().disabled).toBe(true);

    await escribir('ana@test.es', 'secreto123');

    expect(crearCuenta().disabled).toBe(false);
  });

  it('al enviar llama a registrar con el email y la contraseña, y en lugar del formulario pide revisar el correo', async () => {
    await escribir('ana@test.es', 'secreto123');

    await enviar();

    expect(falso.auth.signUp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ email: 'ana@test.es', password: 'secreto123' }),
    );
    expect(fixture.componentInstance.enviado()).toBe(true);
    expect(formulario()).toBeNull();
    expect(texto()).toContain(revisaTuCorreo);
    expect(mensajes.mensaje()).toBeNull();
  });

  it('si GoTrue oculta que el email ya existe (responde sin error y con identities vacío), se muestra igual «Revisa tu correo»', async () => {
    falso.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u9', identities: [] }, session: null },
      error: null,
    });
    await escribir('ana@test.es', 'secreto123');

    await enviar();

    expect(texto()).toContain(revisaTuCorreo);
    expect(mensajes.mensaje()).toBeNull();
  });

  it('con weak_password avisa «La contraseña debe tener al menos 8 caracteres» y el formulario sigue con lo escrito', async () => {
    falso.auth.signUp.mockResolvedValue(
      respuestaDe(new AuthWeakPasswordError('Password should be at least 8 characters', 422, [])),
    );
    await escribir('ana@test.es', 'corta');

    await enviar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'La contraseña debe tener al menos 8 caracteres',
    });
    expect(fixture.componentInstance.enviado()).toBe(false);
    expect(formulario()).not.toBeNull();
    expect(campo('email').value).toBe('ana@test.es');
    expect(crearCuenta().disabled).toBe(false);
    expect(texto()).not.toContain('Revisa tu correo');
  });

  it('con user_already_exists avisa «Ya existe una cuenta con ese email» y el formulario sigue', async () => {
    falso.auth.signUp.mockResolvedValue(
      respuestaDe(new AuthApiError('User already registered', 422, 'user_already_exists')),
    );
    await escribir('ana@test.es', 'secreto123');

    await enviar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'Ya existe una cuenta con ese email',
    });
    expect(formulario()).not.toBeNull();
    expect(texto()).not.toContain('Revisa tu correo');
  });

  it('al reintentar quita el aviso del intento anterior', async () => {
    falso.auth.signUp
      .mockResolvedValueOnce(respuestaDe(new AuthWeakPasswordError('Corta', 422, [])))
      .mockResolvedValueOnce(respuestaDe(null));
    await escribir('ana@test.es', 'corta');
    await enviar();
    expect(mensajes.mensaje()?.tipo).toBe('error');

    await escribir('ana@test.es', 'secreto123');
    await enviar();

    expect(mensajes.mensaje()).toBeNull();
    expect(texto()).toContain(revisaTuCorreo);
  });

  it('mientras espera la respuesta no deja enviar otra vez: una doble pulsación no manda dos correos', async () => {
    let contestar!: (respuesta: unknown) => void;
    falso.auth.signUp.mockReturnValue(new Promise((resolver) => (contestar = resolver)));
    await escribir('ana@test.es', 'secreto123');

    await enviar();
    expect(crearCuenta().disabled).toBe(true);
    // Intro dentro de un campo: envía el formulario sin pasar por el botón deshabilitado.
    formulario()!.dispatchEvent(new Event('submit'));
    await reposar();
    expect(falso.auth.signUp).toHaveBeenCalledOnce();

    contestar(respuestaDe(null));
    await reposar();
    expect(texto()).toContain(revisaTuCorreo);
  });
});
