import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';

import { AuthService } from './auth/auth.service';
import { AvatarService } from './avatar.service';
import { PerfilService } from './perfil.service';
import { SUPABASE } from './supabase/supabase.client';
import { SupabaseFalso, crearSupabaseFalso } from './testing/supabase-falso';

const ana = { access_token: 'token-u1', user: { id: 'u1', email: 'ana@test.es' } } as Session;
const fila = {
  id: 'u1',
  email: 'ana@test.es',
  nombre: 'Ana',
  creado_en: '2026-10-01T10:00:00+00:00',
};

describe('PerfilService', () => {
  let falso: SupabaseFalso;
  let service: PerfilService;

  beforeEach(async () => {
    falso = crearSupabaseFalso();
    falso.auth.getSession.mockResolvedValue({ data: { session: ana }, error: null });
    falso.respuestaDe('perfiles', { data: fila, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: falso.cliente }],
    });
    service = TestBed.inject(PerfilService);
    await TestBed.inject(AuthService).listo;
    await new Promise((resolver) => setTimeout(resolver));
  });

  it('al haber sesión carga el perfil', () => {
    expect(service.perfil()).toEqual(fila);
    expect(falso.consultas[0]).toEqual({
      tabla: 'perfiles',
      cadena: [
        { metodo: 'select', args: ['id, email, nombre, avatar_ruta, creado_en'] },
        { metodo: 'eq', args: ['id', 'u1'] },
        { metodo: 'single', args: [] },
      ],
    });
  });

  it('guardarNombre recorta, persiste y actualiza el signal', async () => {
    falso.respuestaDe('perfiles', { data: { ...fila, nombre: 'Ana Ruiz' }, error: null });

    await expect(service.guardarNombre('  Ana Ruiz  ')).resolves.toEqual({
      ...fila,
      nombre: 'Ana Ruiz',
    });
    expect(service.perfil()?.nombre).toBe('Ana Ruiz');
  });

  it('con avatar firma su URL y la vuelve a pedir cuando AvatarService avisa de la caducidad', async () => {
    const reposar = async () => {
      await TestBed.flushEffects();
      await new Promise((resolver) => setTimeout(resolver));
      await TestBed.flushEffects();
    };
    falso.respuestaDe('perfiles', {
      data: { ...fila, avatar_ruta: 'u1/avatar.png' },
      error: null,
    });

    await service.cargar();
    await reposar();

    expect(service.urlAvatar()).toBe('https://firmada.local/u1/avatar.png');
    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(1);

    // Lo que hace el temporizador de AvatarService cuando quedan menos de cinco minutos.
    const avatares = TestBed.inject(AvatarService);
    avatares.olvidar('u1/avatar.png');
    avatares.renovacion.update((valor) => valor + 1);
    await reposar();

    expect(falso.storage.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(service.urlAvatar()).toBe('https://firmada.local/u1/avatar.png');
  });

  it('al cerrar la sesión olvida el perfil', async () => {
    falso.emitirAuth('SIGNED_OUT', null);
    await TestBed.flushEffects();

    expect(service.perfil()).toBeNull();
  });
});
