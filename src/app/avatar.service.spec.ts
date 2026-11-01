import { TestBed } from '@angular/core/testing';

import { AvatarService } from './avatar.service';
import { SUPABASE } from './supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

const UN_MINUTO = 60 * 1000;

describe('AvatarService', () => {
  let falso: SupabaseFalso;
  let service: AvatarService;

  beforeEach(() => {
    falso = crearSupabaseFalso();
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: falso.cliente }],
    });
    service = TestBed.inject(AvatarService);
  });

  afterEach(() => vi.useRealTimers());

  it('no llama a Storage si no hay ruta', async () => {
    await expect(service.urlDe(null)).resolves.toBeNull();
    expect(falso.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('firma la ruta una hora y reutiliza la URL hasta olvidarla', async () => {
    await expect(service.urlDe('u1/avatar.png')).resolves.toBe(
      'https://firmada.local/u1/avatar.png',
    );
    await expect(service.urlDe('u1/avatar.png')).resolves.toBe(
      'https://firmada.local/u1/avatar.png',
    );

    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(falso.storage.createSignedUrl).toHaveBeenCalledWith('u1/avatar.png', 3600);

    service.olvidar('u1/avatar.png');
    await service.urlDe('u1/avatar.png');

    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  // La firma dura 3600 s. Con la caché sin caducidad, pasada una hora la URL guardada ya no servía
  // y los avatares dejaban de cargar hasta recargar la página.
  it('vuelve a firmar cuando a la URL le quedan menos de cinco minutos, no antes, y lo avisa con renovacion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));

    await service.urlDe('u1/avatar.png');
    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(service.renovacion()).toBe(0);

    // A los 54 minutos la firma sigue valiendo: ni firma nueva ni aviso.
    await vi.advanceTimersByTimeAsync(54 * UN_MINUTO);
    await service.urlDe('u1/avatar.png');
    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(service.renovacion()).toBe(0);

    // A los 55 (quedan cinco) el temporizador avisa, y la siguiente petición firma de nuevo.
    await vi.advanceTimersByTimeAsync(UN_MINUTO);
    expect(service.renovacion()).toBe(1);
    await expect(service.urlDe('u1/avatar.png')).resolves.toBe(
      'https://firmada.local/u1/avatar.png',
    );
    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(2);

    // La firma nueva vuelve a valer 55 minutos sin más avisos.
    await vi.advanceTimersByTimeAsync(54 * UN_MINUTO);
    expect(service.renovacion()).toBe(1);
    await vi.advanceTimersByTimeAsync(UN_MINUTO);
    expect(service.renovacion()).toBe(2);
  });

  it('olvidar cancela el aviso pendiente de esa ruta', async () => {
    vi.useFakeTimers();

    await service.urlDe('u1/avatar.png');
    service.olvidar('u1/avatar.png');
    await vi.advanceTimersByTimeAsync(60 * UN_MINUTO);

    expect(service.renovacion()).toBe(0);
  });
});
