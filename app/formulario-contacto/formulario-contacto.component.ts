import { Component, Output, EventEmitter } from "@angular/core";
import { Contacto } from "../contacto";
import { FormGroup } from "@angular/forms";

@Component({
    selector: "formulario-contacto",
    templateUrl: "./app/formulario-contacto/formulario-contacto.component.html",
    styleUrls: ["./app/formulario-contacto/formulario-contacto.component.css"]
})
export class FormularioContactoComponent {
    
    @Output() nuevoContacto: EventEmitter<Contacto> = new EventEmitter();

    notificarCreacionContacto(form: FormGroup) {
        // emitir el evento de crear contacto
        this.nuevoContacto.emit(form.value as Contacto);
    }
}