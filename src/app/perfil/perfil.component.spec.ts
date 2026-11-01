import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthApiError, PostgrestError, Session } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { PerfilComponent } from './perfil.component';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const perfil = {
  id: 'u1',
  email: 'ana@test.es',
  nombre: 'Ana',
  creado_en: '2026-10-01T10:00:00+00:00',
};
const sinPermiso = new PostgrestError({
  message: 'permission denied',
  details: '',
  hint: '',
  code: '42501',
});

describe('PerfilComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<PerfilComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  const campo = (id: string) => elemento.querySelector<HTMLInputElement>(`#${id}`)!;
  const boton = (texto: string) =>
    Array.from(elemento.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidato) => candidato.textContent?.trim() === texto,
    )!;
  const escribir = async (id: string, valor: string) => {
    campo(id).value = valor;
    campo(id).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
    falso.respuestaDe('perfiles', { data: perfil, error: null });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    fixture = TestBed.createComponent(PerfilComponent);
    elemento = fixture.nativeElement;
    await TestBed.inject(AuthService).listo;
    await reposar();
  });

  it('cambiar email no sustituye el que se muestra', async () => {
    await escribir('email-nuevo', 'nueva@test.es');
    boton('Cambiar email').click();
    await reposar();

    expect(falso.auth.updateUser).toHaveBeenCalledWith(
      { email: 'nueva@test.es' },
      { emailRedirectTo: expect.stringMatching(/\/auth\/confirmar$/) },
    );
    expect(elemento.textContent).toContain('ana@test.es');
    expect(mensajes.mensaje()?.texto).toContain('Revisa el correo nuevo y el actual');
  });

  it('rechaza un avatar que no es imagen o pesa más de 1 MB', async () => {
    const input = elemento.querySelector<HTMLInputElement>('#avatar')!;
    const grande = new File([new Uint8Array(1_048_577)], 'a.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [grande] });

    input.dispatchEvent(new Event('change'));
    await reposar();

    expect(mensajes.mensaje()?.texto).toContain('1 MB');
    expect(falso.storage.upload).not.toHaveBeenCalled();
  });

  it('muestra el email y el nombre guardado', () => {
    expect(elemento.textContent).toContain('ana@test.es');
    expect(campo('nombre').value).toBe('Ana');
  });

  it('guarda el nombre recortado y un nombre vacío como null', async () => {
    await escribir('nombre', '  Ana Ruiz  ');
    boton('Guardar nombre').click();
    await reposar();

    const actualizacion = falso.consultas.find((consulta) =>
      consulta.cadena.some((paso) => paso.metodo === 'update'),
    );
    expect(actualizacion?.cadena).toEqual([
      { metodo: 'update', args: [{ nombre: 'Ana Ruiz' }] },
      { metodo: 'eq', args: ['id', 'u1'] },
      { metodo: 'select', args: ['id, email, nombre, avatar_ruta, creado_en'] },
      { metodo: 'single', args: [] },
    ]);
    expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Nombre guardado' });

    falso.respuestaDe('perfiles', { data: { ...perfil, nombre: null }, error: null });
    await escribir('nombre', '   ');
    boton('Guardar nombre').click();
    await reposar();

    expect(falso.consultas.at(-1)?.cadena[0]).toEqual({
      metodo: 'update',
      args: [{ nombre: null }],
    });
    expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Nombre quitado' });
  });

  it('si guardar el nombre falla, avisa y no dice que se ha guardado', async () => {
    falso.respuestaDe('perfiles', { data: null, error: sinPermiso });

    boton('Guardar nombre').click();
    await reposar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'No tienes permiso para hacer eso',
    });
  });

  it('cambia la contraseña cuando las dos coinciden', async () => {
    await escribir('password', 'otra-clave-123');
    await escribir('confirmacion', 'otra-clave-123');
    boton('Guardar contraseña').click();
    await reposar();

    expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
    expect(mensajes.mensaje()).toEqual({ tipo: 'exito', texto: 'Contraseña actualizada' });
    expect(campo('password').value).toBe('');
  });

  it('no cambia la contraseña si no coinciden', async () => {
    await escribir('password', 'otra-clave-123');
    await escribir('confirmacion', 'otra-distinta');
    boton('Guardar contraseña').click();
    await reposar();

    expect(falso.auth.updateUser).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('Las contraseñas no coinciden');
  });

  it('una contraseña de menos de 8 caracteres no se puede guardar', async () => {
    await escribir('password', 'corta');
    campo('password').dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(boton('Guardar contraseña').disabled).toBe(true);
    expect(elemento.textContent).toContain('al menos 8 caracteres');
  });

  it('si el cambio de contraseña falla, avisa', async () => {
    falso.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('Demasiado débil', 422, 'weak_password'),
    });
    await escribir('password', 'otra-clave-123');
    await escribir('confirmacion', 'otra-clave-123');
    boton('Guardar contraseña').click();
    await reposar();

    expect(mensajes.mensaje()).toEqual({
      tipo: 'error',
      texto: 'La contraseña debe tener al menos 8 caracteres',
    });
  });
});
