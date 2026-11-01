import { InjectionToken } from '@angular/core';

import { environment } from '../../environments/environment';

/** Proveedores OAuth que la aplicación sabe pintar y pedir a Auth. */
export type ProveedorOAuth = 'google' | 'github';

export const NOMBRE_DE_PROVEEDOR: Record<ProveedorOAuth, string> = {
  google: 'Google',
  github: 'GitHub',
};

/**
 * Los proveedores que ofrecen «Entrar» y «Crear cuenta». Salen de `environment.oauthProveedores`
 * y van vacíos hasta que el proyecto tenga el client id y el secreto de cada uno: con un proveedor
 * apagado, `signInWithOAuth` no devuelve error, redirige el navegador a un JSON de error de GoTrue.
 * Los specs lo sustituyen con `{ provide: OAUTH_PROVEEDORES, useValue: ['google', 'github'] }`.
 */
export const OAUTH_PROVEEDORES = new InjectionToken<readonly ProveedorOAuth[]>(
  'OAUTH_PROVEEDORES',
  { providedIn: 'root', factory: () => environment.oauthProveedores },
);
