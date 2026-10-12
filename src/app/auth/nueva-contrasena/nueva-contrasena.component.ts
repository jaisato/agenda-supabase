import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

/**
 * Destino del enlace del correo de recuperación (`/auth/nueva-contrasena?code=…`): canjea el
 * `code` por una sesión de recuperación y deja elegir la contraseña nueva.
 */
@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './nueva-contrasena.component.html',
  styleUrl: '../auth.css',
})
export class NuevaContrasenaComponent implements OnInit {
  // Query param ?code=, entregado por el router (withComponentInputBinding).
  readonly code = input<string>();

  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  protected readonly enlaceInvalido = signal(false);
  // Canjeando el code o guardando la contraseña: el formulario no se puede enviar.
  protected readonly ocupado = signal(false);

  // Una sola vez al abrir la página: el code es de un solo uso y un segundo canje fallaría.
  async ngOnInit(): Promise<void> {
    const code = this.code();
    if (!code) {
      return;
    }
    this.ocupado.set(true);
    try {
      await this.auth.canjearCodigo(code);
    } catch {
      this.enlaceInvalido.set(true);
    } finally {
      this.ocupado.set(false);
    }
  }

  async guardar(form: NgForm): Promise<void> {
    if (this.ocupado()) {
      return;
    }
    const { password } = form.value as { password: string };
    // Fuera el aviso del intento anterior.
    this.mensajes.limpiar();
    this.ocupado.set(true);
    try {
      await this.auth.nuevaContrasena(password);
      this.mensajes.exito('Contraseña actualizada');
      // replaceUrl: «Atrás» no debe volver a esta URL, cuyo code ya está gastado.
      await this.router.navigate(['/mis-contactos'], { replaceUrl: true });
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.ocupado.set(false);
    }
  }
}
