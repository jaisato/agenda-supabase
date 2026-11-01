import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthError } from '@supabase/supabase-js';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';
import { CaptchaComponent } from '../captcha.component';
import { NOMBRE_DE_PROVEEDOR, OAUTH_PROVEEDORES, ProveedorOAuth } from '../oauth-proveedores';

@Component({
  imports: [FormsModule, RouterLink, CaptchaComponent],
  templateUrl: './entrar.component.html',
  styleUrl: '../auth.css',
})
export class EntrarComponent {
  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);
  private readonly captcha = viewChild(CaptchaComponent);

  // Solo los proveedores configurados en el proyecto: con uno apagado, signInWithOAuth manda el
  // navegador a un error de GoTrue. Vacío en la demo publicada.
  protected readonly proveedores = inject(OAUTH_PROVEEDORES);

  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);

  protected nombreDe(proveedor: ProveedorOAuth): string {
    return NOMBRE_DE_PROVEEDOR[proveedor];
  }

  protected captchaBloquea(): boolean {
    return this.captcha()?.bloqueaEnvio() ?? false;
  }

  async entrar(form: NgForm): Promise<void> {
    if (this.enviando() || this.captchaBloquea()) {
      return;
    }
    const { email, password } = form.value as { email: string; password: string };
    // Fuera el aviso del intento anterior.
    this.mensajes.limpiar();
    this.enviando.set(true);
    try {
      await this.auth.entrar(email, password, this.captcha()?.tokenSiHay());
      await this.router.navigate(['/mis-contactos']);
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.enviando.set(false);
      // El token de hCaptcha es de un solo uso: sin esto, el siguiente intento fallaría.
      this.captcha()?.reiniciar();
    }
  }

  async entrarCon(proveedor: ProveedorOAuth): Promise<void> {
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
