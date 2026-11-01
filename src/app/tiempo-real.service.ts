import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth/auth.service';
import { SUPABASE } from './supabase/supabase.client';

// invitaciones_contacto no entra: Realtime no aplica RLS a los DELETE y difunde la clave primaria a
// todo suscriptor; en estas dos tablas son uuids, allí sería el email invitado. El propietario ve
// cambiar su lista igual: por sus propias acciones y por el INSERT en contactos_compartidos que
// produce el canje.
const TABLAS = ['contactos', 'contactos_compartidos'] as const;

/**
 * Avisa de que alguna tabla de la agenda ha cambiado. Quien escucha vuelve a pedir los datos: el
 * evento no trae la fila ya filtrada por RLS de forma cómoda y un parche a medias se queda viejo.
 * `revision` vuelve a 0 al cambiar de sesión, así abrir la lista no dispara una recarga de más.
 */
@Injectable({ providedIn: 'root' })
export class TiempoRealService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  readonly revision = signal(0);

  constructor() {
    effect((onCleanup) => {
      const id = this.auth.usuario()?.id;
      this.revision.set(0);
      if (!id) {
        return;
      }
      // El nombre `realtime` lo reserva el cliente. Uno por sesión basta.
      const canal = this.supabase.channel(`agenda-${id}`);
      for (const table of TABLAS) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          this.revision.update((valor) => valor + 1);
        });
      }
      canal.subscribe();
      onCleanup(() => {
        void this.supabase.removeChannel(canal);
      });
    });
  }
}
