import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Rutas privadas: sin sesión, a `/entrar`. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Hasta que getSession() contesta no se sabe si hay sesión guardada en el navegador.
  await auth.listo;
  return auth.sesion() ? true : router.createUrlTree(['/entrar']);
};

/** Entrar, registro y recuperar: con sesión no tienen sentido, a `/mis-contactos`. */
export const sinSesionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;
  return auth.sesion() ? router.createUrlTree(['/mis-contactos']) : true;
};
