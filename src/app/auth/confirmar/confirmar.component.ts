import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

/**
 * Destino del enlace del correo, de la vuelta de OAuth y del cambio de email (`/auth/confirmar`,
 * flujo PKCE). Con `?code=…` lo canjea por la sesión. GoTrue también vuelve aquí sin `code`: con
 * `?message=…` cuando falta un paso (el cambio de email con confirmación doble acepta el primer
 * enlace y espera el del otro correo) y con `?error=…&error_description=…` cuando el proveedor
 * OAuth deniega el acceso o la persona cancela. Esos textos se muestran tal cual. Sin nada de eso,
 * o con un code caducado o ya usado, no hay pantalla en blanco: avisa y ofrece volver a «Entrar».
 */
@Component({
  imports: [RouterLink],
  templateUrl: './confirmar.component.html',
})
export class ConfirmarComponent implements OnInit {
  // Query params, entregados por el router (withComponentInputBinding). GoTrue manda ?error= (el
  // código, como access_denied) junto a ?error_description= (el texto); se enseña el texto y, si
  // faltara, el código.
  readonly code = input<string>();
  readonly message = input<string>();
  readonly error = input<string>();
  readonly errorDescription = input<string | undefined>(undefined, {
    alias: 'error_description',
  });

  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  protected readonly fallido = signal(false);
  /** Texto de GoTrue (`?message=`): un paso hecho y otro pendiente. */
  protected readonly aviso = signal<string | null>(null);
  /** Texto de GoTrue (`?error_description=`, o `?error=` a falta de él): no hay sesión. */
  protected readonly fallo = signal<string | null>(null);

  // Una sola vez al abrir la página: el code es de un solo uso y un segundo canje fallaría.
  async ngOnInit(): Promise<void> {
    const code = this.code();
    if (!code) {
      const descripcion = this.errorDescription()?.trim() || this.error()?.trim();
      const mensaje = this.message()?.trim();
      if (descripcion) {
        this.fallo.set(descripcion);
      } else if (mensaje) {
        this.aviso.set(mensaje);
      } else {
        this.fallido.set(true);
      }
      return;
    }
    try {
      await this.auth.canjearCodigo(code);
    } catch {
      this.fallido.set(true);
      return;
    }
    this.mensajes.exito('Sesión iniciada');
    // replaceUrl: «Atrás» no debe volver a esta URL, cuyo code ya está gastado.
    await this.router.navigate(['/mis-contactos'], { replaceUrl: true });
  }
}
