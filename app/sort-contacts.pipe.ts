import { Pipe, PipeTransform } from "@angular/core";

import { Contacto } from "./contacto";

@Pipe({
    name: "SortContacts"
})
export class SortContactsPipe implements PipeTransform {
    transform(contactos: Contacto[], orden: string) {
        return contactos.sort(
            (contactoA: Contacto, contactoB: Contacto): number => { 
                let nombreContactoA = `${contactoA.nombre} ${contactoA.apellidos}`.toLowerCase();
                let nombreContactoB = `${contactoB.nombre} ${contactoB.apellidos}`.toLowerCase();

                return nombreContactoA > nombreContactoB 
                    ? (orden === 'asc') ? 1 : -1
                    : nombreContactoA < nombreContactoB 
                        ? (orden === 'asc') ? -1 : 1
                        : 0;
             }
        );
    }
}