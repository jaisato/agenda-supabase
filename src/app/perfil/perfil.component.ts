import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthError, PostgrestError } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { MensajesService } from '../mensajes.service';
import { PerfilService } from '../perfil.service';

/** Nombre público y contraseña de la persona con la sesión abierta. */
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
  protected readonly contrasenasDistintas = signal(false);

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
}
