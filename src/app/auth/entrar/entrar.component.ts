import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './entrar.component.html',
  styleUrl: '../auth.css',
})
export class EntrarComponent {
  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);

  async entrar(form: NgForm): Promise<void> {
    if (this.enviando()) {
      return;
    }
    const { email, password } = form.value as { email: string; password: string };
    // Fuera el aviso del intento anterior.
    this.mensajes.limpiar();
    this.enviando.set(true);
    try {
      await this.auth.entrar(email, password);
      await this.router.navigate(['/mis-contactos']);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.enviando.set(false);
    }
  }
}
