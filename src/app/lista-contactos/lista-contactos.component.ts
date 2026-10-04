import { Component, input, output } from '@angular/core';

import { Contacto } from '../contacto';
import { SortContactsPipe } from '../sort-contacts.pipe';

@Component({
  selector: 'lista-contactos',
  imports: [SortContactsPipe],
  templateUrl: './lista-contactos.component.html',
  styleUrl: './lista-contactos.component.css',
})
export class ListaContactosComponent {
  // Usamos el decorador 'Input' para enlazar datos de entrada.
  readonly contactos = input<Contacto[]>([]);

  readonly contactoSeleccionado = output<Contacto>();
  notificarContactoSeleccionado(contacto: Contacto): void {
    this.contactoSeleccionado.emit(contacto);
  }

  sentidoOrdenacion: string = 'asc';
  cambiarOrden(): void {
    this.sentidoOrdenacion = this.sentidoOrdenacion === 'asc' ? 'desc' : 'asc';
  }
}
