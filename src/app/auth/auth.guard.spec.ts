import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Session } from '@supabase/supabase-js';

import { SUPABASE } from '../supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { authGuard, sinSesionGuard } from './auth.guard';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;

describe('guards de sesión', () => {
  let falso: SupabaseFalso;

  beforeEach(() => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
  });

  const hayUnaSesionGuardada = () =>
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
  // Ejecuta el guard como lo hace el router: dentro del contexto de inyección.
  const ejecutar = async (guard: CanActivateFn) =>
    (await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    )) as GuardResult;
  const url = (resultado: GuardResult) => TestBed.inject(Router).serializeUrl(resultado as UrlTree);
  // getSession tarda hasta que se llama a la función devuelta.
  const getSessionPendiente = () => {
    let contestar!: () => void;
    falso.auth.getSession.mockReturnValue(
      new Promise((resolver) => {
        contestar = () => resolver({ data: { session: ana }, error: null });
      }),
    );
    return contestar;
  };
  const dejarPasarElTiempo = () => new Promise((resolver) => setTimeout(resolver));

  describe('authGuard', () => {
    it('sin sesión devuelve un UrlTree hacia /entrar', async () => {
      const resultado = await ejecutar(authGuard);

      expect(resultado).toBeInstanceOf(UrlTree);
      expect(url(resultado)).toBe('/entrar');
    });

    it('con sesión deja pasar', async () => {
      hayUnaSesionGuardada();

      expect(await ejecutar(authGuard)).toBe(true);
    });

    it('espera a conocer la sesión guardada antes de decidir, para no echar a quien ya había entrado', async () => {
      const contestar = getSessionPendiente();
      let decidido = false;
      const decision = ejecutar(authGuard).then((resultado) => {
        decidido = true;
        return resultado;
      });

      await dejarPasarElTiempo();
      expect(decidido).toBe(false);

      contestar();
      expect(await decision).toBe(true);
    });
  });

  describe('sinSesionGuard', () => {
    it('sin sesión deja pasar', async () => {
      expect(await ejecutar(sinSesionGuard)).toBe(true);
    });

    it('con sesión devuelve un UrlTree hacia /mis-contactos', async () => {
      hayUnaSesionGuardada();

      const resultado = await ejecutar(sinSesionGuard);

      expect(resultado).toBeInstanceOf(UrlTree);
      expect(url(resultado)).toBe('/mis-contactos');
    });

    it('espera a conocer la sesión guardada antes de decidir', async () => {
      const contestar = getSessionPendiente();
      let decidido = false;
      const decision = ejecutar(sinSesionGuard).then((resultado) => {
        decidido = true;
        return resultado;
      });

      await dejarPasarElTiempo();
      expect(decidido).toBe(false);

      contestar();
      expect(url(await decision)).toBe('/mis-contactos');
    });
  });
});
