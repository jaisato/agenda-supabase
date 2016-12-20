import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Contacto } from "../contacto";
import { ContactosService } from "../contactos.service";

@Component({
    templateUrl: "./app/nuevo-contacto/nuevo-contacto.component.html"
})
export class NuevoContactoComponent {

    constructor(
        private _router: Router, 
        private _contactosService: ContactosService) { }

    agregarContacto(contacto: Contacto): void {
        this._contactosService
            .agregarContacto(contacto)
            .subscribe(
                () => this._router.navigate(["/mis-contactos"]),
                () => {},
                () => {}
            );
    }
}