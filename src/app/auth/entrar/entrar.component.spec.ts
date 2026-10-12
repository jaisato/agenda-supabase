import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApiError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { MensajesService } from '../../mensajes.service';
import { SUPABASE } from '../../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../../testing/supabase-falso';
import { EntrarComponent } from './entrar.component';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const credencialesInvalidas = new AuthApiError(
  'Invalid login credentials',
  400,
  'invalid_credentials',
);
const sinSesion = { data: { user: null, session: null }, error: credencialesInvalidas };

describe('EntrarComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<EntrarComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const campo = (id: 'email' | 'password') =>
    elemento.querySelector<HTMLInputElement>(`form input#${id}`)!;
  const entrar = () => elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const enlace = (texto: string) =>
    Array.from(elemento.querySelectorAll('a')).find((a) => a.textContent?.trim() === texto);
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
    entrar().click();
    await reposar();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EntrarComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('muestra el botón «Entrar» y los enlaces «Crear cuenta» y «¿Olvidaste la contraseña?»', () => {
    expect(entrar().textContent?.trim()).toBe('Entrar');
    expect(enlace('Crear cuenta')?.getAttribute('href')).toBe('/registro');
    expect(enlace('¿Olvidaste la contraseña?')?.getAttribute('href')).toBe('/auth/recuperar');
  });

  it('deshabilita «Entrar» hasta que hay email y contraseña', async () => {
    expect(entrar().disabled).toBe(true);

    await escribir('ana@test.es', '');
    expect(entrar().disabled).toBe(true);

    await escribir('ana@test.es', 'secreto123');
    expect(entrar().disabled).toBe(false);
  });

  it('al enviar llama a entrar con el email y la contraseña y navega a /mis-contactos', async () => {
    falso.auth.signInWithPassword.mockResolvedValue({
      data: { user: ana.user, session: ana },
      error: null,
    });
    await escribir('ana@test.es', 'secreto123');

    await enviar();

    expect(falso.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: 'ana@test.es',
      password: 'secreto123',
    });
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
    expect(mensajes.mensaje()).toBeNull();
  });

  it('con invalid_credentials avisa «Email o contraseña incorrectos», no navega y deja el formulario con lo escrito', async () => {
    falso.auth.signInWithPassword.mockResolvedValue(sinSesion);
    await escribir('ana@test.es', 'mala');

    await enviar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'Email o contraseña incorrectos',
    });
    expect(navegar).not.toHaveBeenCalled();
    expect(campo('email').value).toBe('ana@test.es');
    expect(entrar().disabled).toBe(false);
  });

  it('al reintentar quita el aviso del intento anterior', async () => {
    falso.auth.signInWithPassword
      .mockResolvedValueOnce(sinSesion)
      .mockResolvedValueOnce({ data: { user: ana.user, session: ana }, error: null });
    await escribir('ana@test.es', 'mala');
    await enviar();
    expect(mensajes.mensaje()?.tipo).toBe('error');

    await escribir('ana@test.es', 'secreto123');
    await enviar();

    expect(mensajes.mensaje()).toBeNull();
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos']);
  });

  it('mientras espera la respuesta no deja enviar otra vez y, al contestar, vuelve a permitirlo', async () => {
    let contestar!: (respuesta: unknown) => void;
    falso.auth.signInWithPassword.mockReturnValue(
      new Promise((resolver) => (contestar = resolver)),
    );
    await escribir('ana@test.es', 'secreto123');

    await enviar();
    expect(entrar().disabled).toBe(true);
    // Intro dentro de un campo: envía el formulario sin pasar por el botón deshabilitado.
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    await reposar();
    expect(falso.auth.signInWithPassword).toHaveBeenCalledOnce();

    contestar(sinSesion);
    await reposar();
    expect(entrar().disabled).toBe(false);
  });
});
