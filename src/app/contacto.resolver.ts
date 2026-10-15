import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';

import { ContactoVisible } from './contacto';
import { ContactosService } from './contactos.service';

// Resolver funcional: carga el contacto de la ruta (:id) antes de activarla. Con
// withComponentInputBinding() el resultado llega al input 'contacto' del componente; es null si el
// contacto no existe o la persona no puede verlo.
export const contactoResolver: ResolveFn<ContactoVisible | null> = (route) =>
  inject(ContactosService).obtenerContacto(route.paramMap.get('id')!);
