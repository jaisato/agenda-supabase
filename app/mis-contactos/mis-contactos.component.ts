import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

import { ContactosService } from "../contactos.service";
import { Contacto } from "../contacto";

@Component({
    templateUrl: "./app/mis-contactos/mis-contactos.component.html"
})
export class MisContactosComponent implements OnInit {
    listaContactos: Contacto[];
    contactoSeleccionado: Contacto;
    
    constructor(
        private _contactosService: ContactosService,
        private _activatedRoute: ActivatedRoute) { }
    
    private actualizarListaContactos(): void {
        this._contactosService
            .obtenerContactos()
            .subscribe((contactos: Contacto[]) => this.listaContactos = contactos);
    }

    ngOnInit(): void {
        this._activatedRoute.data.forEach(
            (data: { contactos: Contacto[] }) => {
                this.listaContactos = data.contactos;
            }
        );
    }

    eliminarContacto(contacto: Contacto): void {

        if(confirm(`¿Estas seguro de eliminar a ${contacto.nombre}?`)) {
            this._contactosService
                .eliminarContacto(contacto)
                .subscribe(() => {
                    this.contactoSeleccionado = null; 
                    this.listaContactos = this.listaContactos.filter(
                        (c: Contacto) => c.id !== contacto.id 
                    );
                });
        }
    }

    verDetallesContacto(contacto: Contacto): void {
        this.contactoSeleccionado = contacto;
    }

    navegarRuta(ruta: string): void {
        window.open(ruta, "_blank");
    }
 }