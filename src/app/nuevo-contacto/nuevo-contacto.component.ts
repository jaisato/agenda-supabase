import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Contacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { FormularioContactoComponent } from '../formulario-contacto/formulario-contacto.component';

@Component({
  imports: [FormularioContactoComponent],
  templateUrl: './nuevo-contacto.component.html',
  styleUrl: './nuevo-contacto.component.css',
})
export class NuevoContactoComponent {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);

  protected readonly mensajeError = signal<string | null>(null);

  // Alta en curso: un doble clic en «Añadir» enviaba dos POST y guardaba el contacto dos veces.
  private _guardando = false;

  agregarContacto(contacto: Contacto): void {
    if (this._guardando) {
      return;
    }
    this._guardando = true;
    this.mensajeError.set(null);

    this._contactosService.agregarContacto(contacto).subscribe({
      next: () => this._router.navigate(['/mis-contactos']),
      // ContactosService ya registra el error en la consola. Antes el error se descartaba sin
      // más: el usuario no sabía que el contacto no se había guardado.
      error: () => {
        this._guardando = false;
        this.mensajeError.set('No se ha podido guardar el contacto. Inténtalo de nuevo.');
      },
    });
  }
}
