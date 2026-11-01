import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthError, PostgrestError } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';
import { PerfilService } from '../perfil.service';

const UN_MEGA = 1_048_576;
const TIPOS_AVATAR = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Nombre público, avatar, email y contraseña de la persona con la sesión abierta. */
@Component({
  imports: [FormsModule],
  templateUrl: './perfil.component.html',
  styleUrl: '../auth/auth.css',
})
export class PerfilComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly perfil = inject(PerfilService);
  private readonly mensajes = inject(MensajesService);

  protected readonly email = signal('');
  protected readonly nombre = signal('');
  protected readonly guardandoNombre = signal(false);
  protected readonly guardandoContrasena = signal(false);
  protected readonly guardandoEmail = signal(false);
  protected readonly guardandoAvatar = signal(false);
  protected readonly contrasenasDistintas = signal(false);

  protected urlAvatar(): string | null {
    return this.perfil.urlAvatar();
  }

  protected tieneAvatar(): boolean {
    return !!this.perfil.perfil()?.avatar_ruta;
  }

  async ngOnInit(): Promise<void> {
    this.mensajes.limpiar();
    try {
      const perfil = await this.perfil.cargar();
      this.email.set(perfil.email);
      this.nombre.set(perfil.nombre ?? '');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as PostgrestError));
    }
  }

  async guardarNombre(form: NgForm): Promise<void> {
    if (this.guardandoNombre() || form.invalid) {
      return;
    }
    this.mensajes.limpiar();
    this.guardandoNombre.set(true);
    try {
      const perfil = await this.perfil.guardarNombre(form.value.nombre as string);
      this.nombre.set(perfil.nombre ?? '');
      this.mensajes.exito(perfil.nombre ? 'Nombre guardado' : 'Nombre quitado');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as PostgrestError));
    } finally {
      this.guardandoNombre.set(false);
    }
  }

  async guardarContrasena(form: NgForm): Promise<void> {
    if (this.guardandoContrasena()) {
      return;
    }
    const { password, confirmacion } = form.value as { password: string; confirmacion: string };
    if (password !== confirmacion) {
      this.contrasenasDistintas.set(true);
      return;
    }
    this.contrasenasDistintas.set(false);
    this.mensajes.limpiar();
    this.guardandoContrasena.set(true);
    try {
      await this.auth.nuevaContrasena(password);
      form.resetForm();
      this.mensajes.exito('Contraseña actualizada');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.guardandoContrasena.set(false);
    }
  }

  async cambiarEmail(form: NgForm): Promise<void> {
    if (this.guardandoEmail() || form.invalid) {
      return;
    }
    const email = (form.value.emailNuevo as string).trim();
    this.mensajes.limpiar();
    this.guardandoEmail.set(true);
    try {
      await this.auth.cambiarEmail(email);
      form.resetForm();
      this.mensajes.exito('Revisa el correo nuevo y el actual para confirmar el cambio');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as AuthError));
    } finally {
      this.guardandoEmail.set(false);
    }
  }

  async elegirAvatar(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo || this.guardandoAvatar()) {
      return;
    }
    if (!TIPOS_AVATAR.has(archivo.type) || archivo.size > UN_MEGA) {
      this.mensajes.error('El avatar debe ser JPEG, PNG o WebP y pesar como mucho 1 MB');
      return;
    }
    this.mensajes.limpiar();
    this.guardandoAvatar.set(true);
    try {
      await this.perfil.subirAvatar(archivo);
      this.mensajes.exito('Avatar guardado');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as PostgrestError));
    } finally {
      this.guardandoAvatar.set(false);
    }
  }

  async quitarAvatar(): Promise<void> {
    if (this.guardandoAvatar()) {
      return;
    }
    this.mensajes.limpiar();
    this.guardandoAvatar.set(true);
    try {
      await this.perfil.quitarAvatar();
      this.mensajes.exito('Avatar quitado');
    } catch (error) {
      this.mensajes.error(this.mensajes.deError(error as PostgrestError));
    } finally {
      this.guardandoAvatar.set(false);
    }
  }
}
