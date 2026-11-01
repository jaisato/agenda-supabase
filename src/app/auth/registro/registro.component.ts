import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';
import { CaptchaComponent } from '../captcha.component';

@Component({
  imports: [FormsModule, CaptchaComponent],
  templateUrl: './registro.component.html',
  styleUrl: '../auth.css',
})
export class RegistroComponent {
  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly captcha = viewChild(CaptchaComponent);

  // Con la cuenta creada, el formulario deja paso al aviso de que el correo está en camino.
  readonly enviado = signal(false);
  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);

  protected captchaBloquea(): boolean {
    return this.captcha()?.bloqueaEnvio() ?? false;
  }

  async crearCuenta(form: NgForm): Promise<void> {
    if (this.enviando() || this.captchaBloquea()) {
      return;
    }
    const { email, password } = form.value as { email: string; password: string };
    // Fuera el aviso del intento anterior.
    this.mensajes.limpiar();
    this.enviando.set(true);
    try {
      // Con un email ya registrado, GoTrue responde user_already_exists (confirmaciones de teléfono
      // desactivadas, como en el stack local) o, para no revelar qué cuentas existen, como si fuera
      // nuevo (confirmaciones de email y teléfono activas, identities vacío): en ese caso también
      // toca «Revisa tu correo».
      await this.auth.registrar(email, password, this.captcha()?.tokenSiHay());
      this.enviado.set(true);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.enviando.set(false);
    }
  }

  async entrarCon(proveedor: 'google' | 'github'): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.mensajes.limpiar();
    this.enviando.set(true);
    try {
      await this.auth.entrarCon(proveedor);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
      this.enviando.set(false);
    }
  }
}
