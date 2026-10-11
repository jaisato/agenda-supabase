import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Contacto } from './contacto';
import { ContactosService } from './contactos.service';

// Resolver funcional: carga los contactos antes de activar la ruta. Con
// withComponentInputBinding() el resultado llega al input 'contactos' del componente.
// Si la API falla, entrega null en lugar del error: un resolver que falla cancela la
// navegación, así que /mis-contactos se quedaba en blanco y el enlace «Mis Contactos» no
// hacía nada. Con null, la ruta se activa y el componente avisa al usuario.
export const contactosResolver: ResolveFn<Contacto[] | null> = () =>
  inject(ContactosService)
    .obtenerContactos()
    .pipe(catchError(() => of(null)));
