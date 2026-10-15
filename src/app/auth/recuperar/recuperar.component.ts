import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

@Component({
  imports: [FormsModule],
  templateUrl: './recuperar.component.html',
  styleUrl: '../auth.css',
})
export class RecuperarComponent {
  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);

  // Con el correo pedido, el formulario deja paso al aviso de que llegará si la cuenta existe.
  readonly enviado = signal(false);
  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);

  async enviarEnlace(form: NgForm): Promise<void> {
    if (this.enviando()) {
      return;
    }
    const { email } = form.value as { email: string };
    // Fuera el aviso del intento anterior.
    this.mensajes.limpiar();
    this.enviando.set(true);
    try {
      // GoTrue responde igual exista o no la cuenta: la pantalla tampoco lo revela.
      await this.auth.recuperar(email);
      this.enviado.set(true);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.enviando.set(false);
    }
  }
}
