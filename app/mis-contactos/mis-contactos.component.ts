import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

import { ContactosService } from "../contactos.service";
import { Contacto } from "../contacto";

@Component({
    templateUrl: "./app/mis-contactos/mis-contactos.component.html",
    styles: [".msg-error { color: red; margin-bottom: 15px; }"]
})
export class MisContactosComponent implements OnInit {
    listaContactos: Contacto[];
    contactoSeleccionado: Contacto;
    mensajeError: string;
    
    constructor(
        private _contactosService: ContactosService,
        private _activatedRoute: ActivatedRoute) { }
    
    ngOnInit(): void {
        this._activatedRoute.data.forEach(
            (data: { contactos: Contacto[] }) => {
                this.listaContactos = data.contactos;
                this.mensajeError = data.contactos
                    ? null
                    : "No se ha podido cargar la agenda. ¿Está arrancado json-server?";
            }
        );
    }

    eliminarContacto(contacto: Contacto): void {

        if(confirm(`¿Estas seguro de eliminar a ${contacto.nombre}?`)) {
            this._contactosService
                .eliminarContacto(contacto)
                .subscribe(
                    () => {
                        this.mensajeError = null;
                        this.contactoSeleccionado = null;
                        this.listaContactos = this.listaContactos.filter(
                            (c: Contacto) => c.id !== contacto.id
                        );
                    },
                    // Without an error callback RxJS rethrows: the click
                    // ended in an uncaught error and the user was never told
                    // the contact is still there.
                    () => this.mensajeError = `No se ha podido eliminar a ${contacto.nombre}.`
                );
        }
    }

    verDetallesContacto(contacto: Contacto): void {
        this.contactoSeleccionado = contacto;
    }

    navegarRuta(ruta: string): void {
        // noopener/noreferrer prevent the newly opened tab (external site) from
        // gaining access to `window.opener` and repointing this app's tab
        // (reverse tabnabbing).
        window.open(ruta, "_blank", "noopener,noreferrer");
    }
 }