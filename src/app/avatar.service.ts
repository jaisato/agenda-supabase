import { Injectable, inject } from '@angular/core';

import { SUPABASE } from './supabase/supabase.client';

const UNA_HORA = 3600;

/**
 * URLs firmadas del bucket privado `avatares`. No lee `perfiles`: quien llama ya trae la ruta, así
 * el detalle de un contacto no carga el perfil de la sesión.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly supabase = inject(SUPABASE);
  private readonly cache = new Map<string, string>();

  async urlDe(ruta: string | null | undefined): Promise<string | null> {
    if (!ruta) {
      return null;
    }
    const guardada = this.cache.get(ruta);
    if (guardada) {
      return guardada;
    }
    const { data, error } = await this.supabase.storage
      .from('avatares')
      .createSignedUrl(ruta, UNA_HORA);
    if (error || !data?.signedUrl) {
      return null;
    }
    this.cache.set(ruta, data.signedUrl);
    return data.signedUrl;
  }

  /** La misma ruta, tras sustituir el fichero, necesita otra firma. */
  olvidar(ruta: string | null | undefined): void {
    if (ruta) {
      this.cache.delete(ruta);
    }
  }
}
