import { inject } from "@angular/core";
import { ResolveFn } from "@angular/router";

import { Contacto } from "./contacto";
import { ContactosService } from "./contactos.service";

// Resolver funcional: carga los contactos antes de activar la ruta. Con
// withComponentInputBinding() el resultado llega al input 'contactos' del componente.
export const contactosResolver: ResolveFn<Contacto[]> = () =>
    inject(ContactosService).obtenerContactos();
