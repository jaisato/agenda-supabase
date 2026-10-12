import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApiError, Session } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { BarraNavegacionComponent } from './barra-navegacion.component';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;

describe('BarraNavegacionComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<BarraNavegacionComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const enlaces = () =>
    Array.from(elemento.querySelectorAll('nav a'), (a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);
  const salir = () =>
    Array.from(elemento.querySelectorAll<HTMLButtonElement>('nav button')).find(
      (boton) => boton.textContent?.trim() === 'Salir',
    );
  // Crea la barra con la sesión que getSession devuelve al arrancar.
  const crear = async (sesion: Session | null) => {
    falso.auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });
    fixture = TestBed.createComponent(BarraNavegacionComponent);
    elemento = fixture.nativeElement;
    await TestBed.inject(AuthService).listo;
    await fixture.whenStable();
  };
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
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

  describe('sin sesión', () => {
    it('solo ofrece «Entrar»', async () => {
      await crear(null);

      expect(enlaces()).toEqual([['Entrar', '/entrar']]);
      expect(salir()).toBeUndefined();
    });
  });

  describe('con sesión', () => {
    it('ofrece «Mis Contactos» y «Nuevo Contacto», el email de quien ha entrado y «Salir», pero no «Entrar»', async () => {
      await crear(ana);

      expect(enlaces()).toEqual([
        ['Mis Contactos', '/mis-contactos'],
        ['Nuevo Contacto', '/nuevo-contacto'],
      ]);
      expect(elemento.querySelector('nav')?.textContent).toContain('ana@test.es');
      expect(salir()).toBeDefined();
    });

    it('«Salir» cierra la sesión de este navegador, navega a /entrar y la barra pasa a ofrecer «Entrar»', async () => {
      await crear(ana);

      salir()!.click();
      await reposar();

      expect(falso.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/entrar']);
      expect(enlaces()).toEqual([['Entrar', '/entrar']]);
    });

    it('si cerrar la sesión falla, avisa del error, no navega y sigue con la sesión', async () => {
      falso.auth.signOut.mockResolvedValue({
        error: new AuthApiError('Servicio no disponible', 503, 'unexpected_failure'),
      });
      await crear(ana);

      salir()!.click();
      await reposar();

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'Algo ha fallado: Servicio no disponible',
      });
      expect(navegar).not.toHaveBeenCalled();
      expect(salir()).toBeDefined();
    });
  });

  it('sigue los cambios de sesión: entra al recibir SIGNED_IN y vuelve a «Entrar» con SIGNED_OUT', async () => {
    await crear(null);

    falso.emitirAuth('SIGNED_IN', ana);
    await fixture.whenStable();
    expect(enlaces().map(([texto]) => texto)).toEqual(['Mis Contactos', 'Nuevo Contacto']);
    expect(elemento.querySelector('nav')?.textContent).toContain('ana@test.es');

    falso.emitirAuth('SIGNED_OUT', null);
    await fixture.whenStable();
    expect(enlaces()).toEqual([['Entrar', '/entrar']]);
    expect(elemento.querySelector('nav')?.textContent).not.toContain('ana@test.es');
  });
});
