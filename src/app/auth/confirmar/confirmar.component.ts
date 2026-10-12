import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

/**
 * Destino del enlace del correo de confirmación (`/auth/confirmar?code=…`, flujo PKCE): canjea el
 * `code` por la sesión. Sin `code`, o con uno caducado o ya usado, no hay pantalla en blanco:
 * avisa y ofrece volver a «Entrar».
 */
@Component({
  imports: [RouterLink],
  templateUrl: './confirmar.component.html',
})
export class ConfirmarComponent implements OnInit {
  // Query param ?code=, entregado por el router (withComponentInputBinding).
  readonly code = input<string>();

  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  protected readonly fallido = signal(false);

  // Una sola vez al abrir la página: el code es de un solo uso y un segundo canje fallaría.
  async ngOnInit(): Promise<void> {
    const code = this.code();
    if (!code) {
      this.fallido.set(true);
      return;
    }
    try {
      await this.auth.canjearCodigo(code);
    } catch {
      this.fallido.set(true);
      return;
    }
    this.mensajes.exito('Cuenta confirmada');
    // replaceUrl: «Atrás» no debe volver a esta URL, cuyo code ya está gastado.
    await this.router.navigate(['/mis-contactos'], { replaceUrl: true });
  }
}
