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

    // Usamos el decorador 'Output' para notificar datos de salida.
    @Output() eliminar: EventEmitter<Contacto> = new EventEmitter();

    // Usamos 'emit' para notificar eventos.
    notificarEliminacion(contacto: Contacto): void {
        this.eliminar.emit(contacto);
    }
}