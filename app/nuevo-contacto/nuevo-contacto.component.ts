import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Contacto } from "../contacto";
import { ContactosService } from "../contactos.service";

@Component({
    templateUrl: "./app/nuevo-contacto/nuevo-contacto.component.html",
    styles: [".msg-error { color: red; margin-bottom: 15px; }"]
})
export class NuevoContactoComponent {

    mensajeError: string;

    // A double click on "Añadir" fired two POSTs and stored the contact twice.
    private _guardando: boolean = false;

    constructor(
        private _router: Router, 
        private _contactosService: ContactosService) { }

    agregarContacto(contacto: Contacto): void {
        if (this._guardando) {
            return;
        }
        this._guardando = true;
        this.mensajeError = null;

        this._contactosService
            .agregarContacto(contacto)
            .subscribe(
                () => this._router.navigate(["/mis-contactos"]),
                // The error used to be swallowed: the button did nothing and
                // the user had no way to know the contact was not saved.
                () => {
                    this._guardando = false;
                    this.mensajeError = "No se ha podido guardar el contacto. Inténtalo de nuevo.";
                }
            );
    }
}
