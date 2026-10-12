import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { MensajesService } from './mensajes.service';
import { SUPABASE } from './supabase/supabase.client';
import { crearSupabaseFalso } from './testing/supabase-falso';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  const aviso = () => elemento.querySelector<HTMLElement>('.mensaje');
  const cerrar = () => aviso()?.querySelector<HTMLButtonElement>('button');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: crearSupabaseFalso().cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    fixture = TestBed.createComponent(AppComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('sin aviso no pinta la zona de mensajes', () => {
    expect(aviso()).toBeNull();
  });

  it('pinta un error con su texto, la clase mensaje-error y role="status"', async () => {
    mensajes.error('Email o contraseña incorrectos');
    await fixture.whenStable();

    expect(aviso()?.textContent).toContain('Email o contraseña incorrectos');
    expect(aviso()?.classList.contains('mensaje-error')).toBe(true);
    expect(aviso()?.classList.contains('mensaje-exito')).toBe(false);
    expect(aviso()?.getAttribute('role')).toBe('status');
  });

  it('pinta un éxito con su texto y la clase mensaje-exito', async () => {
    mensajes.exito('Cuenta confirmada');
    await fixture.whenStable();

    expect(aviso()?.textContent).toContain('Cuenta confirmada');
    expect(aviso()?.classList.contains('mensaje-exito')).toBe(true);
    expect(aviso()?.classList.contains('mensaje-error')).toBe(false);
  });

  it('un aviso nuevo sustituye al anterior', async () => {
    mensajes.error('Algo ha fallado');
    await fixture.whenStable();

    mensajes.exito('Contraseña actualizada');
    await fixture.whenStable();

    expect(elemento.querySelectorAll('.mensaje')).toHaveLength(1);
    expect(aviso()?.textContent).toContain('Contraseña actualizada');
    expect(aviso()?.textContent).not.toContain('Algo ha fallado');
  });

  it('el botón «×» quita el aviso', async () => {
    mensajes.error('Algo ha fallado');
    await fixture.whenStable();
    expect(cerrar()?.textContent?.trim()).toBe('×');

    cerrar()!.click();
    await fixture.whenStable();

    expect(mensajes.mensaje()).toBeNull();
    expect(aviso()).toBeNull();
  });
});
