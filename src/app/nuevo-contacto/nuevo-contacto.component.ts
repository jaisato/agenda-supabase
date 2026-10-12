import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { DatosContacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { FormularioContactoComponent } from '../formulario-contacto/formulario-contacto.component';
import { MensajesService } from '../mensajes.service';

@Component({
  imports: [FormularioContactoComponent],
  templateUrl: './nuevo-contacto.component.html',
})
export class NuevoContactoComponent {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);

  // Mientras espera la respuesta no se puede volver a enviar el formulario: una doble pulsación
  // crearía el contacto dos veces.
  protected readonly enviando = signal(false);

  async agregarContacto(datos: DatosContacto): Promise<void> {
    if (this.enviando()) {
      return;
    }
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    this.enviando.set(true);
    try {
      await this._contactosService.agregarContacto(datos);
    } catch (error) {
      this._mensajes.error(this._mensajes.deError(error as PostgrestError));
      this.enviando.set(false);
      return;
    }
    // Con el contacto creado, enviando ya no vuelve a false: la navegación espera al resolver de
    // /mis-contactos y otra pulsación mientras tanto lo crearía otra vez. Si la navegación falla,
    // el contacto ya existe; el aviso lo da el manejador de errores de navegación (app.config.ts).
    await this._router.navigate(['/mis-contactos']);
  }
}
