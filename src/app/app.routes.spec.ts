import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthPKCECodeVerifierMissingError, PostgrestError, Session } from '@supabase/supabase-js';

import { appConfig } from './app.config';
import { ConfirmarComponent } from './auth/confirmar/confirmar.component';
import { EntrarComponent } from './auth/entrar/entrar.component';
import { NuevaContrasenaComponent } from './auth/nueva-contrasena/nueva-contrasena.component';
import { RecuperarComponent } from './auth/recuperar/recuperar.component';
import { RegistroComponent } from './auth/registro/registro.component';
import { CompartirContactoComponent } from './compartir-contacto/compartir-contacto.component';
import { ContactosService } from './contactos.service';
import { EditarContactoComponent } from './editar-contacto/editar-contacto.component';
import { MensajesService } from './mensajes.service';
import { MisContactosComponent } from './mis-contactos/mis-contactos.component';
import { NuevoContactoComponent } from './nuevo-contacto/nuevo-contacto.component';
import { SUPABASE } from './supabase/supabase.client';
import { contactoDePrueba, contactoVisibleDePrueba } from './testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
// Lo que devuelve PostgREST con la compartición embebida: Elon es de Ana (u1); Bill es de u2 y lo
// ha compartido con ella como editor.
const camposElon = { id: 'c3', nombre: 'Elon', apellidos: 'Musk', email: 'elon.musk@tesla.com' };
const camposBill = { id: 'c2', propietario_id: 'u2', nombre: 'Bill', apellidos: 'Gates' };
const filaElon = { ...contactoDePrueba(camposElon), contactos_compartidos: [] };
const filaBill = {
  ...contactoDePrueba(camposBill),
  contactos_compartidos: [{ usuario_id: 'u1', rol: 'editor' }],
};

describe('rutas de la aplicación', () => {
  let falso: SupabaseFalso;
  let harness: RouterTestingHarness;
  const url = () => TestBed.inject(Router).url;
  // Lo que getSession devuelve al arrancar: la sesión guardada en el navegador. Hay que
  // indicarla antes de navegar, que es cuando el guard crea AuthService y la lee.
  const hayUnaSesionGuardada = () =>
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
  // Lo que contesta la base de datos al resolver, que pide los contactos antes de activar
  // /mis-contactos.
  const hayContactos = (...filas: object[]) =>
    falso.respuestaDe('contactos', { data: filas, error: null });
  // Deja que terminen las promesas pendientes (el canje de un code, la navegación que le sigue)
  // y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  };

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    hayContactos();
    TestBed.configureTestingModule({
      // La configuración real de la aplicación (router con withComponentInputBinding()) con el
      // cliente de Supabase sustituido por el falso.
      providers: [...appConfig.providers, { provide: SUPABASE, useValue: falso.cliente }],
    });
    harness = await RouterTestingHarness.create();
  });

  describe('con sesión', () => {
    beforeEach(hayUnaSesionGuardada);

    it('/mis-contactos resuelve los contactos con el falso, los entrega al componente como input y pinta los nombres', async () => {
      hayContactos(filaElon, filaBill);

      const componente = await harness.navigateByUrl('/mis-contactos', MisContactosComponent);

      // El rol sale del usuario de la sesión: Elon es propio y Bill, compartido como editor.
      expect(componente.contactos()).toEqual([
        contactoVisibleDePrueba('propietario', camposElon),
        contactoVisibleDePrueba('editor', camposBill),
      ]);
      expect(falso.consultas.map((consulta) => consulta.tabla)).toEqual(['contactos']);
      const listas = harness.routeNativeElement!.querySelectorAll('lista-contactos');
      expect(listas[0].textContent).toContain('Elon Musk');
      expect(listas[1].textContent).toContain('Bill Gates');
      expect(listas[1].querySelector('.rol')?.textContent).toBe('editor');
    });

    it('/nuevo-contacto muestra el formulario de alta', async () => {
      await harness.navigateByUrl('/nuevo-contacto', NuevoContactoComponent);

      expect(harness.routeNativeElement?.querySelector('form #nombre')).not.toBeNull();
    });

    it('/contactos/:id/editar resuelve el contacto por su id, lo entrega al componente como input y rellena el formulario', async () => {
      // maybeSingle: una fila, no una lista.
      falso.respuestaDe('contactos', { data: filaBill, error: null });

      const componente = await harness.navigateByUrl(
        '/contactos/c2/editar',
        EditarContactoComponent,
      );
      await reposar();

      // El resolver pide el contacto del :id (con su compartición, de donde sale el rol).
      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'select', args: ['*, contactos_compartidos(usuario_id, rol)'] },
            { metodo: 'eq', args: ['id', 'c2'] },
            { metodo: 'maybeSingle', args: [] },
          ],
        },
      ]);
      expect(componente.contacto()).toEqual(contactoVisibleDePrueba('editor', camposBill));
      const formulario = harness.routeNativeElement!;
      expect(formulario.querySelector<HTMLInputElement>('form #nombre')?.value).toBe('Bill');
      expect(formulario.querySelector<HTMLInputElement>('form #apellidos')?.value).toBe('Gates');
      expect(formulario.querySelector('form button[type="submit"]')?.textContent?.trim()).toBe(
        'Guardar',
      );
    });

    // Review Focus 5: el dueño borró el contacto (con él, las comparticiones) y quien lo tenía
    // compartido intenta editarlo.
    it('/contactos/:id/editar de un contacto que ya no existe lleva a /mis-contactos con el aviso', async () => {
      // El resolver recibe data null (maybeSingle sin fila). El falso contesta lo mismo a todas las
      // consultas de la tabla y eso no vale para la lista de /mis-contactos, a la que se vuelve:
      // esa se sustituye.
      falso.respuestaDe('contactos', { data: null, error: null });
      vi.spyOn(TestBed.inject(ContactosService), 'obtenerContactos').mockResolvedValue([]);

      await harness.navigateByUrl('/contactos/c9/editar', EditarContactoComponent);

      await vi.waitFor(() => expect(url()).toBe('/mis-contactos'));
      expect(TestBed.inject(MensajesService).mensaje()).toEqual({
        tipo: 'error',
        texto: 'Ese contacto ya no existe o no tienes acceso',
      });
    });

    it('/contactos/:id/compartir resuelve el contacto por su id, lo entrega al componente como input y pinta las personas con acceso', async () => {
      // Elon es de Ana (u1), que lo tiene compartido con u2 como lector.
      falso.respuestaDe('contactos', { data: filaElon, error: null });
      falso.respuestaDe('contactos_compartidos', {
        data: [{ usuario_id: 'u2', rol: 'lector', perfiles: { email: 'b@x.es' } }],
        error: null,
      });

      const componente = await harness.navigateByUrl(
        '/contactos/c3/compartir',
        CompartirContactoComponent,
      );
      await reposar();

      // El resolver pide el contacto del :id y el componente, las personas con las que se comparte.
      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos',
          cadena: [
            { metodo: 'select', args: ['*, contactos_compartidos(usuario_id, rol)'] },
            { metodo: 'eq', args: ['id', 'c3'] },
            { metodo: 'maybeSingle', args: [] },
          ],
        },
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'select', args: ['usuario_id, rol, perfiles(email)'] },
            { metodo: 'eq', args: ['contacto_id', 'c3'] },
          ],
        },
      ]);
      expect(componente.contacto()).toEqual(contactoVisibleDePrueba('propietario', camposElon));
      const pantalla = harness.routeNativeElement!;
      expect(pantalla.querySelector('h5')?.textContent).toContain('Elon Musk');
      expect(pantalla.querySelector('tbody tr td')?.textContent).toBe('b@x.es');
      expect(pantalla.querySelector('form button[type="submit"]')?.textContent?.trim()).toBe(
        'Compartir',
      );
    });

    // Bill es de u2 y lo ha compartido con Ana: ella no puede compartirlo.
    it('/contactos/:id/compartir de un contacto de otra persona lleva a /mis-contactos con el aviso, sin pedir las comparticiones', async () => {
      // El falso contesta lo mismo a todas las consultas de la tabla y eso no vale para la lista
      // de /mis-contactos, a la que se vuelve: esa se sustituye.
      falso.respuestaDe('contactos', { data: filaBill, error: null });
      vi.spyOn(TestBed.inject(ContactosService), 'obtenerContactos').mockResolvedValue([]);

      await harness.navigateByUrl('/contactos/c2/compartir', CompartirContactoComponent);

      await vi.waitFor(() => expect(url()).toBe('/mis-contactos'));
      expect(TestBed.inject(MensajesService).mensaje()).toEqual({
        tipo: 'error',
        texto: 'Solo el propietario puede compartir',
      });
      expect(falso.consultas.map((consulta) => consulta.tabla)).toEqual(['contactos']);
    });

    // Sin manejador, el router cancela la navegación y el error solo llega a la consola: la
    // pantalla se queda como estaba, o en blanco si es la primera.
    describe('si falla un resolver (sin red, proyecto pausado, sesión caducada…)', () => {
      // Lo que devuelve PostgREST cuando la petición no llega al servidor.
      const sinConexion = new PostgrestError({
        message: 'TypeError: Failed to fetch',
        details: '',
        hint: '',
        code: '',
      });
      const aviso = () => TestBed.inject(MensajesService).mensaje();
      // El resolver de /mis-contactos falla la primera vez. Si se repitiera, la segunda iría bien y
      // la navegación acabaría en /mis-contactos (sin esto, un bucle de reintentos no terminaría).
      const fallaLaListaUnaVez = () =>
        vi
          .spyOn(TestBed.inject(ContactosService), 'obtenerContactos')
          .mockRejectedValueOnce(sinConexion)
          .mockResolvedValue([]);

      it('el de otra ruta avisa del error y lleva a /mis-contactos', async () => {
        // Un :id que no es un uuid: la base de datos contesta 22P02.
        falso.respuestaDe('contactos', {
          data: null,
          error: new PostgrestError({
            message: 'invalid input syntax for type uuid: "no-es-un-uuid"',
            details: '',
            hint: '',
            code: '22P02',
          }),
        });
        // El falso contesta lo mismo a todas las consultas de la tabla y eso no vale para la lista
        // de /mis-contactos, a la que se vuelve: esa se sustituye.
        vi.spyOn(TestBed.inject(ContactosService), 'obtenerContactos').mockResolvedValue([]);

        await harness.navigateByUrl('/contactos/no-es-un-uuid/editar', MisContactosComponent);

        expect(url()).toBe('/mis-contactos');
        expect(aviso()).toEqual({
          tipo: 'error',
          texto: 'Algo ha fallado: invalid input syntax for type uuid: "no-es-un-uuid"',
        });
      });

      it('el de /mis-contactos avisa y se queda donde estaba, sin repetirlo: volver a /mis-contactos sería un bucle', async () => {
        await harness.navigateByUrl('/nuevo-contacto', NuevoContactoComponent);
        const obtenerContactos = fallaLaListaUnaVez();

        await expect(harness.navigateByUrl('/mis-contactos')).rejects.toBe(sinConexion);

        expect(url()).toBe('/nuevo-contacto');
        expect(aviso()).toEqual({ tipo: 'error', texto: 'No hay conexión con el servidor' });
        expect(obtenerContactos).toHaveBeenCalledOnce();
      });

      it('el de /mis-contactos tampoco se repite cuando se llega por la redirección de otra ruta', async () => {
        const obtenerContactos = fallaLaListaUnaVez();

        await expect(harness.navigateByUrl('/no-existe')).rejects.toBe(sinConexion);

        expect(aviso()).toEqual({ tipo: 'error', texto: 'No hay conexión con el servidor' });
        expect(obtenerContactos).toHaveBeenCalledOnce();
      });
    });

    it('cualquier otra ruta redirige a /mis-contactos', async () => {
      await harness.navigateByUrl('/no-existe');

      expect(url()).toBe('/mis-contactos');
    });

    // Entrar, registrarse o pedir otra contraseña no tiene sentido con la sesión abierta.
    for (const ruta of ['/entrar', '/registro', '/auth/recuperar']) {
      it(`${ruta} redirige a /mis-contactos`, async () => {
        await harness.navigateByUrl(ruta, MisContactosComponent);

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
      expect(falso.cliente.from).not.toHaveBeenCalled();
    });

    it('/nuevo-contacto acaba en /entrar', async () => {
      await harness.navigateByUrl('/nuevo-contacto', EntrarComponent);

      expect(url()).toBe('/entrar');
    });

    it('/contactos/:id/editar acaba en /entrar, sin pedir el contacto', async () => {
      await harness.navigateByUrl('/contactos/c2/editar', EntrarComponent);

      expect(url()).toBe('/entrar');
      expect(falso.cliente.from).not.toHaveBeenCalled();
    });

    it('/contactos/:id/compartir acaba en /entrar, sin pedir el contacto', async () => {
      await harness.navigateByUrl('/contactos/c3/compartir', EntrarComponent);

      expect(url()).toBe('/entrar');
      expect(falso.cliente.from).not.toHaveBeenCalled();
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

      hayContactos(filaElon);

      await harness.navigateByUrl('/auth/confirmar?code=codigo-pkce', ConfirmarComponent);

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

      hayContactos(filaElon);

      guardar().click();

      await vi.waitFor(() => expect(url()).toBe('/mis-contactos'));
      await harness.fixture.whenStable();
      expect(falso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'otra-clave-123' });
      expect(harness.routeNativeElement?.textContent).toContain('Elon Musk');
      expect(TestBed.inject(MensajesService).mensaje()).toEqual({
        tipo: 'exito',
        texto: 'Contraseña actualizada',
      });
    });

    it('recargar la página de nueva contraseña, o volver a ella con «Atrás», no canjea otra vez el code gastado: el formulario sigue ahí', async () => {
      // Como el cliente real: el code es de un solo uso. El primer canje abre la sesión de
      // recuperación; el segundo falla, porque auth-js ya borró el code_verifier.
      let gastado = false;
      falso.auth.exchangeCodeForSession.mockImplementation(async () => {
        if (gastado) {
          return {
            data: { user: null, session: null },
            error: new AuthPKCECodeVerifierMissingError(),
          };
        }
        gastado = true;
        falso.emitirAuth('PASSWORD_RECOVERY', ana);
        return { data: { session: ana, user: ana.user }, error: null };
      });
      await harness.navigateByUrl(
        '/auth/nueva-contrasena?code=codigo-pkce',
        NuevaContrasenaComponent,
      );
      await reposar();
      // Lo que muestra entonces la barra de direcciones es lo que el navegador abrirá al
      // recargar o al volver con «Atrás».
      const direccion = url();

      // Con la sesión de recuperación abierta se puede salir por la barra de navegación…
      await harness.navigateByUrl('/mis-contactos', MisContactosComponent);
      // …y volver: el router abre otra vez esa dirección.
      await harness.navigateByUrl(direccion, NuevaContrasenaComponent);
      await reposar();

      expect(falso.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('codigo-pkce');
      expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
      expect(harness.routeNativeElement?.textContent).not.toContain(
        'No hemos podido validar el enlace',
      );
      expect(direccion).toBe('/auth/nueva-contrasena');
    });
  });
});
