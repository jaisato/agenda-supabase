import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';
import { Mock } from 'vitest';

import { AuthService } from './auth/auth.service';
import { SUPABASE } from './supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';
import { TiempoRealService } from './tiempo-real.service';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;

describe('TiempoRealService', () => {
  let falso: SupabaseFalso;

  beforeEach(() => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: falso.cliente }],
    });
  });

  it('sin sesión no abre canal', async () => {
    TestBed.inject(TiempoRealService);
    await TestBed.inject(AuthService).listo;
    await TestBed.flushEffects();

    expect(falso.cliente.channel).not.toHaveBeenCalled();
  });

  it('con sesión abre el canal privado agenda:<id> y cada aviso sube la revisión', async () => {
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
    const service = TestBed.inject(TiempoRealService);
    await TestBed.inject(AuthService).listo;
    await TestBed.flushEffects();
    await vi.waitFor(() => expect(falso.cliente.channel).toHaveBeenCalled());

    expect(falso.cliente.realtime.setAuth).toHaveBeenCalledWith('token-u1');
    expect(falso.cliente.channel).toHaveBeenCalledWith('agenda:u1', {
      config: { private: true },
    });
    const canal = vi.mocked(falso.cliente.channel).mock.results[0]!.value as unknown as {
      on: Mock;
    };
    expect(canal.on.mock.calls.map((llamada) => (llamada[1] as { event: string }).event)).toEqual([
      'INSERT',
      'UPDATE',
      'DELETE',
    ]);
    expect(service.revision()).toBe(0);

    falso.emitirTiempoReal();

    expect(service.revision()).toBe(3);
  });

  it('al cerrar la sesión quita el canal', async () => {
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
    TestBed.inject(TiempoRealService);
    const auth = TestBed.inject(AuthService);
    await auth.listo;
    await TestBed.flushEffects();
    await vi.waitFor(() => expect(falso.cliente.channel).toHaveBeenCalled());

    falso.emitirAuth('SIGNED_OUT', null);
    await TestBed.flushEffects();

    expect(falso.cliente.removeChannel).toHaveBeenCalled();
  });
});
