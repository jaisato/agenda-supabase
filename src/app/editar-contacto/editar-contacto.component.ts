import { Component, OnInit, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { ContactoVisible, DatosContacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { FormularioContactoComponent } from '../formulario-contacto/formulario-contacto.component';
import { MensajesService } from '../mensajes.service';

const SIN_ACCESO = 'Ese contacto ya no existe o no tienes acceso';
// Código de PostgREST cuando el `.single()` de un update no encuentra ninguna fila que devolver.
const SIN_FILA = 'PGRST116';

@Component({
  imports: [FormularioContactoComponent],
  templateUrl: './editar-contacto.component.html',
})
export class EditarContactoComponent implements OnInit {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);

  // Dato del resolver de la ruta (contactoResolver), que withComponentInputBinding() entrega como
  // input. Es null si el contacto no existe o la persona no puede verlo (por ejemplo, porque su
  // dueño lo ha borrado y con él las comparticiones): la RLS no distingue los dos casos.
  readonly contacto = input.required<ContactoVisible | null>();

  // El contacto que esta persona puede editar. Un lector que abre la dirección a mano queda igual
  // que si no existiera: solo puede leerlo y la RLS rechazaría el update.
  protected readonly editable = computed(() => {
    const contacto = this.contacto();
    return contacto?.rol === 'lector' ? null : contacto;
  });

  // Una sola vez al abrir la pantalla.
  async ngOnInit(): Promise<void> {
    if (!this.editable()) {
      await this.sinAcceso();
    }
  }

  async guardar(datos: DatosContacto): Promise<void> {
    // El formulario solo se pinta con un contacto editable.
    const { id } = this.editable()!;
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.editarContacto(id, datos);
    } catch (error) {
      const fallo = error as PostgrestError;
      if (fallo.code === SIN_FILA) {
        // Con el formulario abierto, el dueño borró el contacto o dejó de compartirlo: el update
        // no toca ninguna fila (la RLS se la oculta) y PostgREST contesta PGRST116.
        await this.sinAcceso();
      } else {
        this._mensajes.error(this._mensajes.deError(fallo));
      }
      return;
    }
    this._mensajes.exito('Contacto guardado');
    await this._router.navigate(['/mis-contactos']);
  }

  private sinAcceso(): Promise<boolean> {
    this._mensajes.error(SIN_ACCESO);
    // replaceUrl: «Atrás» no debe volver a una dirección que solo llevaría otra vez a /mis-contactos.
    return this._router.navigate(['/mis-contactos'], { replaceUrl: true });
  }
}
