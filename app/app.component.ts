import { Component, OnInit } from '@angular/core';
import { ContactosService } from "./contactos.service";

@Component({
    selector: 'my-app',
    templateUrl: './app/app.component.html',
})
export class AppComponent implements OnInit {
    listaContactos: string[];
    
    constructor(private _contactosService: ContactosService) {}
    
    private actualizarListaContactos(): void {
        this.listaContactos = this._contactosService.obtenerContactos();
    }

    ngOnInit(): void {
        this.actualizarListaContactos();
    }
    
    agregarContacto(contacto: string): void {
        this._contactosService.agregarContacto(contacto);
        this.actualizarListaContactos();
    }

    eliminarContacto(contacto: string): void {
        this._contactosService.eliminarContacto(contacto);
        this.actualizarListaContactos();
    }
}