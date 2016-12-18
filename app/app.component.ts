import { Component, OnInit } from '@angular/core';
import { ContactosService } from "./contactos.service";
import { Contacto } from "./contacto";

@Component({
    selector: 'my-app',
    templateUrl: './app/app.component.html',
})
export class AppComponent implements OnInit {
    listaContactos: Contacto[];
    
    constructor(private _contactosService: ContactosService) {}
    
    private actualizarListaContactos(): void {
        this._contactosService
            .obtenerContactos()
            .subscribe((contactos: Contacto[]) => this.listaContactos = contactos);
    }

    ngOnInit(): void {
        this.actualizarListaContactos();
    }
    
    agregarContacto(contacto: Contacto): void {
        this._contactosService
            .agregarContacto(contacto)
            .subscribe((nuevoContacto: Contacto) => this.actualizarListaContactos());
    }

    eliminarContacto(contacto: Contacto): void {
        this._contactosService
            .eliminarContacto(contacto)
            .subscribe(() => this.actualizarListaContactos());
    }
}