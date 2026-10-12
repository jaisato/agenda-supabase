import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthApiError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import { RecuperarComponent } from './recuperar.component';

const enlaceEnviado =
  'Si existe una cuenta con ese email, recibirás un enlace para cambiar la contraseña. ' +
  'Ábrelo en este mismo navegador.';

describe('RecuperarComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<RecuperarComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  const campo = () => elemento.querySelector<HTMLInputElement>('form input#email')!;
  const enviarEnlace = () =>
    elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const texto = () => elemento.textContent?.replace(/\s+/g, ' ');
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  const escribir = async (email: string) => {
    campo().value = email;
    campo().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const enviar = async () => {
    enviarEnlace().click();
    await reposar();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    fixture = TestBed.createComponent(RecuperarComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('muestra el formulario con «Enviar enlace», deshabilitado hasta que hay email', async () => {
    expect(enviarEnlace().textContent?.trim()).toBe('Enviar enlace');
    expect(enviarEnlace().disabled).toBe(true);

    await escribir('ana@test.es');

    expect(enviarEnlace().disabled).toBe(false);
  });

  it('al enviar pide el correo de recuperación y, en lugar del formulario, dice que llegará si la cuenta existe', async () => {
    await escribir('ana@test.es');

    await enviar();

    expect(falso.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('ana@test.es', {
      redirectTo: expect.stringMatching(/\/auth\/nueva-contrasena$/),
    });
    expect(elemento.querySelector('form')).toBeNull();
    expect(texto()).toContain(enlaceEnviado);
    expect(mensajes.mensaje()).toBeNull();
  });

  it('si falla avisa del error legible y el formulario sigue con lo escrito', async () => {
    falso.auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'),
    });
    await escribir('ana@test.es');

    await enviar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'Demasiados correos en poco tiempo; espera un momento',
    });
    expect(texto()).not.toContain(enlaceEnviado);
    expect(campo().value).toBe('ana@test.es');
    expect(enviarEnlace().disabled).toBe(false);
  });

  it('mientras espera la respuesta no deja enviar otra vez: una doble pulsación no manda dos correos', async () => {
    let contestar!: (respuesta: unknown) => void;
    falso.auth.resetPasswordForEmail.mockReturnValue(
      new Promise((resolver) => (contestar = resolver)),
    );
    await escribir('ana@test.es');

    await enviar();
    expect(enviarEnlace().disabled).toBe(true);
    // Intro dentro del campo: envía el formulario sin pasar por el botón deshabilitado.
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    await reposar();
    expect(falso.auth.resetPasswordForEmail).toHaveBeenCalledOnce();

    contestar({ data: {}, error: null });
    await reposar();
    expect(texto()).toContain(enlaceEnviado);
  });
});
