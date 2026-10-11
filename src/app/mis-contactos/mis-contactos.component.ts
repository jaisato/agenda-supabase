import { Component, inject, input, linkedSignal, signal } from '@angular/core';

import { ContactosService } from '../contactos.service';
import { Contacto } from '../contacto';
import { DetallesContactoComponent } from '../detalles-contacto/detalles-contacto.component';
import { ListaContactosComponent } from '../lista-contactos/lista-contactos.component';

@Component({
  imports: [ListaContactosComponent, DetallesContactoComponent],
  templateUrl: './mis-contactos.component.html',
  styleUrl: './mis-contactos.component.css',
})
export class MisContactosComponent {
  private readonly _contactosService = inject(ContactosService);

  // Datos del resolver de la ruta (contactosResolver), que withComponentInputBinding()
  // entrega como input: null si la API no ha devuelto la lista.
  readonly contactos = input.required<Contacto[] | null>();

  // Sin zone.js, lo que se asigna dentro de un subscribe() no se repinta salvo
  // que sea un signal. La lista parte de la del resolver y se actualiza al eliminar.
  protected readonly listaContactos = linkedSignal(() => this.contactos() ?? []);
  protected readonly contactoSeleccionado = signal<Contacto | null>(null);
  // Aviso al usuario cuando falla la API: al cargar la lista o al eliminar un contacto.
  protected readonly mensajeError = linkedSignal<string | null>(() =>
    this.contactos() ? null : 'No se ha podido cargar la agenda. ¿Está arrancado json-server?',
  );

  eliminarContacto(contacto: Contacto): void {
    if (confirm(`¿Estas seguro de eliminar a ${contacto.nombre}?`)) {
      this._contactosService.eliminarContacto(contacto).subscribe({
        next: () => {
          this.mensajeError.set(null);
          this.contactoSeleccionado.set(null);
          this.listaContactos.update((contactos: Contacto[]) =>
            contactos.filter((c: Contacto) => c.id !== contacto.id),
          );
        },
        // Sin callback de error, RxJS relanzaba el error sin capturar y el usuario no sabía
        // que el contacto seguía en la agenda. ContactosService ya lo registra en la consola.
        error: () => this.mensajeError.set(`No se ha podido eliminar a ${contacto.nombre}.`),
      });
    }
  }

  verDetallesContacto(contacto: Contacto): void {
    this.contactoSeleccionado.set(contacto);
  }

  navegarRuta(ruta: string): void {
    // noopener/noreferrer prevent the newly opened tab (external site) from
    // gaining access to `window.opener` and repointing this app's tab
    // (reverse tabnabbing).
    window.open(ruta, '_blank', 'noopener,noreferrer');
  }
}
