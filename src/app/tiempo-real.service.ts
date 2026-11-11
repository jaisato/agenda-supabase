import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth/auth.service';
import { SUPABASE } from './supabase/supabase.client';

const EVENTOS = ['INSERT', 'UPDATE', 'DELETE'] as const;

/**
 * Avisa de que alguna tabla de la agenda ha cambiado. Quien escucha vuelve a pedir los datos: el
 * aviso no se parchea en la lista. `revision` vuelve a 0 al cambiar de sesión, así abrir la lista
 * no dispara una recarga de más.
 *
 * El canal es privado y se llama `agenda:<id>`. La base emite con `realtime.broadcast_changes` y
 * la política de `realtime.messages` solo deja suscribirse al dueño de ese id.
 */
@Injectable({ providedIn: 'root' })
export class TiempoRealService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  readonly revision = signal(0);

  constructor() {
    effect((onCleanup) => {
      const sesion = this.auth.sesion();
      const id = sesion?.user.id;
      this.revision.set(0);
      if (!id || !sesion) {
        return;
      }
      let cancelado = false;
      let canal: ReturnType<typeof this.supabase.channel> | undefined;
      onCleanup(() => {
        cancelado = true;
        if (canal) {
          void this.supabase.removeChannel(canal);
        }
      });
      // El JWT tiene que estar puesto antes de suscribir un canal privado. Si Realtime no
      // contesta, la lista sigue pudiendo recargarse al volver a la pestaña.
      void this.supabase.realtime
        .setAuth(sesion.access_token)
        .then(() => {
          if (cancelado) {
            return;
          }
          // El nombre `realtime` lo reserva el cliente.
          canal = this.supabase.channel(`agenda:${id}`, { config: { private: true } });
          for (const event of EVENTOS) {
            canal.on('broadcast', { event }, () => {
              this.revision.update((valor) => valor + 1);
            });
          }
          canal.subscribe();
        })
        .catch(() => undefined);
    });
  }
}
