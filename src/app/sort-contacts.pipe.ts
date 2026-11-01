import { Pipe, PipeTransform } from '@angular/core';

import { Contacto } from './contacto';

@Pipe({
  name: 'SortContacts',
})
export class SortContactsPipe implements PipeTransform {
  transform<T extends Contacto>(contactos: T[] | null | undefined, orden: string): T[] {
    // The list is loaded asynchronously, so the template renders once with
    // `contactos` still undefined - and `undefined.sort()` is a TypeError
    // that takes the whole view down before the data ever arrives.
    if (!contactos) {
      return [];
    }

    // slice() first: Array.prototype.sort() sorts in place, so this pipe was
    // reordering the component's own array every time change detection ran
    // it. A pipe is meant to present the value it is given, not rewrite it -
    // and the component still holds that array as the order the API
    // returned.
    const sentido = orden === 'asc' ? 1 : -1;
    return contactos.slice().sort((contactoA: T, contactoB: T): number => {
      const nombreContactoA = `${contactoA.nombre} ${contactoA.apellidos}`;
      const nombreContactoB = `${contactoB.nombre} ${contactoB.apellidos}`;
      return nombreContactoA.localeCompare(nombreContactoB, 'es') * sentido;
    });
  }
}
