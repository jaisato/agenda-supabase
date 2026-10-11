import { TestBed } from '@angular/core/testing';

import { SUPABASE } from './supabase.client';

describe('SUPABASE', () => {
  // Una sola prueba: es un cliente real y, con otro más en el mismo contexto, supabase-js avisa
  // de «Multiple GoTrueClient instances». Sin sesión guardada ni ?code= en la URL no hay red.
  it('es un único cliente, con PKCE y sin canjear por su cuenta el code de la URL', async () => {
    const cliente = TestBed.inject(SUPABASE);
    // Deja que el cliente termine de arrancar dentro de la prueba.
    await cliente.auth.getSession();

    // auth-js guarda sus opciones en la instancia (campos protected), de ahí el cast.
    const auth = cliente.auth as unknown as { flowType: string; detectSessionInUrl: unknown };
    expect(auth.flowType).toBe('pkce');
    // Con true, supabase-js canjearía el ?code= al crearse y gastaría el code_verifier que
    // AuthService.canjearCodigo() necesita después.
    expect(auth.detectSessionInUrl).toBe(false);
    expect(TestBed.inject(SUPABASE)).toBe(cliente);
  });
});
