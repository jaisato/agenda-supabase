import { Component, Output, EventEmitter } from "@angular/core";

@Component({
    selector: "formulario-contacto",
    templateUrl: "./app/formulario-contacto/formulario-contacto.component.html"
})
export class FormularioContactoComponent {

    nombreContacto: string;

    @Output() nuevoContacto: EventEmitter<string> = new EventEmitter();
    notificarCreacionContacto() {
        // emitir el evento de crear contacto
        this.nuevoContacto.emit(this.nombreContacto);
    }
}