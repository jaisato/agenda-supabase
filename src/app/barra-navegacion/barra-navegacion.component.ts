import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthError } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';

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
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  async salir(): Promise<void> {
    try {
      await this.auth.salir();
      await this.router.navigate(['/entrar']);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    }
  }
}
