import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { ContactoVisible } from '../contacto';
import { ContactosService } from '../contactos.service';
import { DetallesContactoComponent } from '../detalles-contacto/detalles-contacto.component';
import { ListaContactosComponent } from '../lista-contactos/lista-contactos.component';
import { MensajesService } from '../mensajes.service';

@Component({
  imports: [ListaContactosComponent, DetallesContactoComponent],
  templateUrl: './mis-contactos.component.html',
})
export class MisContactosComponent {
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);
  private readonly _router = inject(Router);

  // Datos del resolver de la ruta (contactosResolver), que withComponentInputBinding()
  // entrega como input.
  readonly contactos = input.required<ContactoVisible[]>();

  // Sin zone.js, lo que se asigna tras un await no se repinta salvo que sea un signal. La lista
  // parte de la del resolver y se actualiza al eliminar.
  protected readonly lista = linkedSignal(() => this.contactos());
  // Dos listas con el mismo componente: los contactos propios y los que otras personas han
  // compartido (como lector o editor).
  protected readonly propios = computed(() => this.lista().filter((c) => c.rol === 'propietario'));
  protected readonly compartidos = computed(() =>
    this.lista().filter((c) => c.rol !== 'propietario'),
  );
  protected readonly seleccionado = signal<ContactoVisible | null>(null);

  async eliminarContacto(contacto: ContactoVisible): Promise<void> {
    if (!confirm(`¿Estas seguro de eliminar a ${contacto.nombre}?`)) {
      return;
    }
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.eliminarContacto(contacto.id);
    } catch (error) {
      this._mensajes.error(this._mensajes.deError(error as PostgrestError));
      return;
    }
    // Mientras esperaba, puede haberse seleccionado otro contacto.
    this.seleccionado.update((actual) => (actual?.id === contacto.id ? null : actual));
    this.lista.update((contactos) => contactos.filter((c) => c.id !== contacto.id));
  }

  editar(contacto: ContactoVisible): void {
    this._router.navigate(['/contactos', contacto.id, 'editar']);
  }

  compartir(contacto: ContactoVisible): void {
    this._router.navigate(['/contactos', contacto.id, 'compartir']);
  }

  // Marcador: «Dejar de ver» se completa con la función de compartir contactos (quitar la propia
  // compartición con dejarDeCompartir). Hasta entonces el botón emite el evento y no hace nada.
  dejarDeVer(_contacto: ContactoVisible): void {}

  verDetallesContacto(contacto: ContactoVisible): void {
    this.seleccionado.set(contacto);
  }

  navegarRuta(ruta: string): void {
    // noopener/noreferrer prevent the newly opened tab (external site) from
    // gaining access to `window.opener` and repointing this app's tab
    // (reverse tabnabbing).
    window.open(ruta, '_blank', 'noopener,noreferrer');
  }
}
