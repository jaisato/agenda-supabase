import { Component, inject } from '@angular/core';
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

  async agregarContacto(datos: DatosContacto): Promise<void> {
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.agregarContacto(datos);
    } catch (error) {
      this._mensajes.error(this._mensajes.deError(error as PostgrestError));
      return;
    }
    await this._router.navigate(['/mis-contactos']);
  }
}
