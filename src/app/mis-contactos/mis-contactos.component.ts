import { Component, input, linkedSignal, signal } from "@angular/core";

import { ContactosService } from "../contactos.service";
import { Contacto } from "../contacto";
import { DetallesContactoComponent } from "../detalles-contacto/detalles-contacto.component";
import { ListaContactosComponent } from "../lista-contactos/lista-contactos.component";

@Component({
    imports: [ListaContactosComponent, DetallesContactoComponent],
    templateUrl: "./mis-contactos.component.html"
})
export class MisContactosComponent {
    // Datos del resolver de la ruta (contactosResolver), que withComponentInputBinding()
    // entrega como input.
    readonly contactos = input.required<Contacto[]>();

    // Sin zone.js, lo que se asigna dentro de un subscribe() no se repinta salvo
    // que sea un signal. La lista parte de la del resolver y se actualiza al eliminar.
    protected readonly listaContactos = linkedSignal(() => this.contactos());
    protected readonly contactoSeleccionado = signal<Contacto | null>(null);

    constructor(private _contactosService: ContactosService) { }

    eliminarContacto(contacto: Contacto): void {

        if(confirm(`¿Estas seguro de eliminar a ${contacto.nombre}?`)) {
            this._contactosService
                .eliminarContacto(contacto)
                .subscribe(() => {
                    this.contactoSeleccionado.set(null);
                    this.listaContactos.update((contactos: Contacto[]) =>
                        contactos.filter((c: Contacto) => c.id !== contacto.id)
                    );
                });
        }
    }

    verDetallesContacto(contacto: Contacto): void {
        this.contactoSeleccionado.set(contacto);
    }

    navegarRuta(ruta: string): void {
        // noopener/noreferrer prevent the newly opened tab (external site) from
        // gaining access to `window.opener` and repointing this app's tab
        // (reverse tabnabbing).
        window.open(ruta, "_blank", "noopener,noreferrer");
    }
 }
