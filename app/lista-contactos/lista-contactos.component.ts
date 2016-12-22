import { Component, Input, Output, EventEmitter } from "@angular/core";
import { Contacto } from "../contacto";

@Component({
    selector: "lista-contactos",
    templateUrl: "./app/lista-contactos/lista-contactos.component.html",
    styleUrls: ["./app/lista-contactos/lista-contactos.component.css"]
})
export class ListaContactosComponent {

    // Usamos el decorador 'Input' para enlazar datos de entrada.
    @Input() contactos: Contacto[];

    @Output() contactoSeleccionado: EventEmitter<Contacto> = new EventEmitter();
    notificarContactoSeleccionado(contacto: Contacto): void {
        this.contactoSeleccionado.emit(contacto);
    }

    sentidoOrdenacion: string = "asc";
    cambiarOrden(): void {
        this.sentidoOrdenacion = (this.sentidoOrdenacion === "asc") ? "desc" : "asc";
    }
}