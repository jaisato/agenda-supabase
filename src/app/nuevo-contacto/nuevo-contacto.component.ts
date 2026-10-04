import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Contacto } from "../contacto";
import { ContactosService } from "../contactos.service";
import { FormularioContactoComponent } from "../formulario-contacto/formulario-contacto.component";

@Component({
    imports: [FormularioContactoComponent],
    templateUrl: "./nuevo-contacto.component.html"
})
export class NuevoContactoComponent {

    constructor(
        private _router: Router,
        private _contactosService: ContactosService) { }

    agregarContacto(contacto: Contacto): void {
        this._contactosService
            .agregarContacto(contacto)
            .subscribe({
                next: () => this._router.navigate(["/mis-contactos"]),
                // ContactosService ya registra el error en la consola.
                error: () => {}
            });
    }
}
