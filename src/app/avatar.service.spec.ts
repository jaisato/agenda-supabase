import { TestBed } from '@angular/core/testing';

import { AvatarService } from './avatar.service';
import { SUPABASE } from './supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

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
});
