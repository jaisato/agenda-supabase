import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';

import { API_URL } from './api-url.token';
import { appConfig } from './app.config';
import { ConfirmarComponent } from './auth/confirmar/confirmar.component';
import { EntrarComponent } from './auth/entrar/entrar.component';
import { NuevaContrasenaComponent } from './auth/nueva-contrasena/nueva-contrasena.component';
import { RecuperarComponent } from './auth/recuperar/recuperar.component';
import { RegistroComponent } from './auth/registro/registro.component';
import { Contacto } from './contacto';
import { MensajesService } from './mensajes.service';
import { MisContactosComponent } from './mis-contactos/mis-contactos.component';
import { NuevoContactoComponent } from './nuevo-contacto/nuevo-contacto.component';
import { SUPABASE } from './supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

const API = 'http://api.test';
const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const elon: Contacto = {
  id: 13,
  nombre: 'Elon',
  apellidos: 'Musk',
  email: 'elon.musk@tesla.com',
  telefono: '393-209423',
  facebook: 'elon.musk',
  twitter: '@elonmusk',
};

describe('rutas de la aplicación', () => {
  let falso: SupabaseFalso;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const url = () => TestBed.inject(Router).url;
  // Lo que getSession devuelve al arrancar: la sesión guardada en el navegador. Hay que
  // indicarla antes de navegar, que es cuando el guard crea AuthService y la lee.
  const hayUnaSesionGuardada = () =>
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
  // El resolver pide los contactos antes de activar /mis-contactos (siguen sobre HTTP).
  const contestarContactos = async (contactos: Contacto[]) =>
    (await vi.waitFor(() => http.expectOne(`${API}/contactos`))).flush(contactos);

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      // La configuración real de la aplicación (router con withComponentInputBinding() y
      // HttpClient), con el backend HTTP de pruebas, la URL de la API y el cliente de
      // Supabase sustituidos.
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: API_URL, useValue: API },
        { provide: SUPABASE, useValue: falso.cliente },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  describe('con sesión', () => {
    beforeEach(hayUnaSesionGuardada);

    it('/mis-contactos resuelve los contactos y los entrega al componente como input', async () => {
      const navegacion = harness.navigateByUrl('/mis-contactos', MisContactosComponent);
      await contestarContactos([elon]);
      const componente = await navegacion;

      expect(componente.contactos()).toEqual([elon]);
      expect(harness.routeNativeElement?.textContent).toContain('Elon Musk');
    });

    it('/nuevo-contacto muestra el formulario de alta', async () => {
      await harness.navigateByUrl('/nuevo-contacto', NuevoContactoComponent);

      expect(harness.routeNativeElement?.querySelector('form #nombre')).not.toBeNull();
    });

    it('cualquier otra ruta redirige a /mis-contactos', async () => {
      const navegacion = harness.navigateByUrl('/no-existe');
      await contestarContactos([]);
      await navegacion;

      expect(url()).toBe('/mis-contactos');
    });

    // Entrar, registrarse o pedir otra contraseña no tiene sentido con la sesión abierta.
    for (const ruta of ['/entrar', '/registro', '/auth/recuperar']) {
      it(`${ruta} redirige a /mis-contactos`, async () => {
        const navegacion = harness.navigateByUrl(ruta, MisContactosComponent);
        await contestarContactos([]);
        await navegacion;

        expect(url()).toBe('/mis-contactos');
      });
    }

    // Los enlaces de los correos no llevan guard: quien tiene una sesión abierta en ese
    // navegador (otra cuenta, o la misma) debe poder canjear igualmente su code.
    it('/auth/confirmar?code=… no tiene guard: se abre también con sesión', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      await harness.navigateByUrl('/auth/confirmar?code=codigo-pkce', ConfirmarComponent);

      expect(url()).toBe('/auth/confirmar?code=codigo-pkce');
    });

    it('/auth/nueva-contrasena?code=… no tiene guard: se abre también con sesión', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      await harness.navigateByUrl(
        '/auth/nueva-contrasena?code=codigo-pkce',
        NuevaContrasenaComponent,
      );

      expect(url()).toBe('/auth/nueva-contrasena?code=codigo-pkce');
    });
  });

  describe('sin sesión', () => {
    it('/mis-contactos acaba en /entrar, sin pedir los contactos', async () => {
      await harness.navigateByUrl('/mis-contactos', EntrarComponent);

      expect(url()).toBe('/entrar');
      http.expectNone(`${API}/contactos`);
    });

    it('/nuevo-contacto acaba en /entrar', async () => {
      await harness.navigateByUrl('/nuevo-contacto', EntrarComponent);

      expect(url()).toBe('/entrar');
    });

    // `**` redirige a /mis-contactos y el guard de esa ruta, a /entrar: sin la ruta /entrar
    // sería un bucle.
    it('cualquier otra ruta acaba en /entrar', async () => {
      await harness.navigateByUrl('/no-existe', EntrarComponent);

      expect(url()).toBe('/entrar');
    });

    it('/entrar, /registro y /auth/recuperar muestran sus pantallas', async () => {
      await harness.navigateByUrl('/entrar', EntrarComponent);
      expect(harness.routeNativeElement?.querySelector('form #password')).not.toBeNull();

      await harness.navigateByUrl('/registro', RegistroComponent);
      expect(harness.routeNativeElement?.textContent).toContain('Crear cuenta');

      await harness.navigateByUrl('/auth/recuperar', RecuperarComponent);
      expect(harness.routeNativeElement?.textContent).toContain('Enviar enlace');
      expect(url()).toBe('/auth/recuperar');
    });

    it('/auth/confirmar?code=… entrega el code al componente (query param → input) y lo canjea', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      const componente = await harness.navigateByUrl(
        '/auth/confirmar?code=codigo-pkce',
        ConfirmarComponent,
      );

      expect(componente.code()).toBe('codigo-pkce');
      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
    });

    it('/auth/nueva-contrasena?code=… entrega el code al componente (query param → input) y lo canjea', async () => {
      falso.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));

      const componente = await harness.navigateByUrl(
        '/auth/nueva-contrasena?code=codigo-pkce',
        NuevaContrasenaComponent,
      );

      expect(componente.code()).toBe('codigo-pkce');
      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
    });

    it('el enlace de confirmación abre la sesión y lleva a /mis-contactos con el aviso «Cuenta confirmada»', async () => {
      // Como el cliente real: el canje emite SIGNED_IN antes de resolver, y el guard de
      // /mis-contactos ya encuentra la sesión.
      falso.auth.exchangeCodeForSession.mockImplementation(async () => {
        falso.emitirAuth('SIGNED_IN', ana);
        return { data: { session: ana, user: ana.user }, error: null };
      });

      await harness.navigateByUrl('/auth/confirmar?code=codigo-pkce', ConfirmarComponent);
      await contestarContactos([elon]);

      await vi.waitFor(() => expect(url()).toBe('/mis-contactos'));
      await harness.fixture.whenStable();
      expect(harness.routeNativeElement?.textContent).toContain('Elon Musk');
      expect(TestBed.inject(MensajesService).mensaje()).toEqual({
        tipo: 'exito',
        texto: 'Cuenta confirmada',
      });
    });

    it('el enlace de recuperación abre la sesión, deja elegir la contraseña y lleva a /mis-contactos con el aviso «Contraseña actualizada»', async () => {
      // Como el cliente real: el canje emite PASSWORD_RECOVERY antes de resolver, y el guard de
      // /mis-contactos ya encuentra la sesión de recuperación.
      falso.auth.exchangeCodeForSession.mockImplementation(async () => {
        falso.emitirAuth('PASSWORD_RECOVERY', ana);
        return { data: { session: ana, user: ana.user }, error: null };
      });
      await harness.navigateByUrl(
        '/auth/nueva-contrasena?code=codigo-pkce',
        NuevaContrasenaComponent,
      );
      const campo = () => harness.routeNativeElement!.querySelector<HTMLInputElement>('input')!;
      const guardar = () =>
        harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      campo().value = 'otra-clave-123';
      campo().dispatchEvent(new Event('input'));
      // Con el canje terminado y la contraseña escrita, se puede guardar.
      await vi.waitFor(() => expect(guardar().disabled).toBe(false));

      guardar().click();
      await contestarContactos([elon]);

      await vi.waitFor(() => expect(url()).toBe('/mis-contactos'));
      await harness.fixture.whenStable();
      expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
      expect(harness.routeNativeElement?.textContent).toContain('Elon Musk');
      expect(TestBed.inject(MensajesService).mensaje()).toEqual({
        tipo: 'exito',
        texto: 'Contraseña actualizada',
      });
    });
  });
});
