import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthError } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';
import { PerfilService } from '../perfil.service';

@Component({
  selector: 'barra-navegacion',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './barra-navegacion.component.html',
  styleUrl: './barra-navegacion.component.css',
  // Las pestañas son <li> inline-block: el espacio entre ellas es el salto de línea de la
  // plantilla. Angular 2 conservaba ese espacio; desde Angular 6 se elimina por defecto y las
  // pestañas quedaban pegadas.
  preserveWhitespaces: true,
})
export class BarraNavegacionComponent {
  protected readonly auth = inject(AuthService);
  private readonly perfil = inject(PerfilService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  protected readonly nombreVisible = computed(() => {
    const nombre = this.perfil.perfil()?.nombre?.trim();
    return nombre || this.auth.usuario()?.email || '';
  });

  protected urlAvatar(): string | null {
    return this.perfil.urlAvatar();
  }

  async salir(): Promise<void> {
    try {
      await this.auth.salir();
      await this.router.navigate(['/entrar']);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    }
  }
}
