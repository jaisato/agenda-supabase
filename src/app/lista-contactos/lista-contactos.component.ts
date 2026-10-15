import { Component, input, output, signal } from '@angular/core';

import { ContactoVisible } from '../contacto';
import { SortContactsPipe } from '../sort-contacts.pipe';

@Component({
  selector: 'lista-contactos',
  imports: [SortContactsPipe],
  templateUrl: './lista-contactos.component.html',
  styleUrl: './lista-contactos.component.css',
})
export class ListaContactosComponent {
  // Usamos la función 'input' para enlazar datos de entrada.
  readonly contactos = input<ContactoVisible[]>([]);

  readonly contactoSeleccionado = output<ContactoVisible>();
  notificarContactoSeleccionado(contacto: ContactoVisible): void {
    this.contactoSeleccionado.emit(contacto);
  }

  protected readonly sentidoOrdenacion = signal<'asc' | 'desc'>('asc');
  cambiarOrden(): void {
    this.sentidoOrdenacion.update((sentido) => (sentido === 'asc' ? 'desc' : 'asc'));
  }
}
