import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { Contacto } from '../contacto';
import { SortContactsPipe } from '../sort-contacts.pipe';

@Component({
  selector: 'lista-contactos',
  imports: [NgClass, NgFor, SortContactsPipe],
  templateUrl: './lista-contactos.component.html',
  styleUrl: './lista-contactos.component.css',
})
export class ListaContactosComponent {
  // Usamos el decorador 'Input' para enlazar datos de entrada.
  @Input() contactos: Contacto[] = [];

  @Output() contactoSeleccionado: EventEmitter<Contacto> = new EventEmitter();
  notificarContactoSeleccionado(contacto: Contacto): void {
    this.contactoSeleccionado.emit(contacto);
  }

  sentidoOrdenacion: string = 'asc';
  cambiarOrden(): void {
    this.sentidoOrdenacion = this.sentidoOrdenacion === 'asc' ? 'desc' : 'asc';
  }
}
