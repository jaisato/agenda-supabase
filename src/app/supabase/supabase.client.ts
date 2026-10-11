import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';
import { Database } from './database.types';

/**
 * Cliente de Supabase de toda la aplicación, tipado con el esquema generado. Flujo PKCE: el
 * enlace del correo vuelve con `?code=…` y `AuthService.canjearCodigo()` lo canjea por la sesión.
 * Las pruebas lo sustituyen con `{ provide: SUPABASE, useValue: crearSupabaseFalso().cliente }`.
 */
export const SUPABASE = new InjectionToken<SupabaseClient<Database>>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        // Con la detección automática, supabase-js canjearía el ?code= al crearse el cliente y
        // gastaría el code_verifier: el exchangeCodeForSession de la página ya no lo encontraría.
        detectSessionInUrl: false,
      },
    }),
});
