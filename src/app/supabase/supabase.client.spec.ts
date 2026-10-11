import { TestBed } from '@angular/core/testing';
import { createClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';
import { SUPABASE } from './supabase.client';

// Solo importa con qué argumentos crea el token el cliente, así que createClient se sustituye.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: {} })) }));

describe('SUPABASE', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });

  it('crea el cliente con la URL y la clave del entorno, con PKCE y sin canjear el code de la URL al arrancar', () => {
    TestBed.inject(SUPABASE);

    // detectSessionInUrl: false es lo que deja el canje del ?code= a AuthService.canjearCodigo().
    // Con el valor por defecto, supabase-js lo canjearía antes y la página fallaría al canjearlo.
    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
      { auth: { flowType: 'pkce', detectSessionInUrl: false } },
    );
  });

  it('es un único cliente para toda la aplicación', () => {
    const cliente = TestBed.inject(SUPABASE);

    expect(TestBed.inject(SUPABASE)).toBe(cliente);
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
