import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Contacto } from '../contacto';
import { ContactosService } from '../contactos.service';
import { FormularioContactoComponent } from '../formulario-contacto/formulario-contacto.component';

@Component({
  imports: [FormularioContactoComponent],
  templateUrl: './nuevo-contacto.component.html',
  styles: `
    .msg-error {
      color: red;
      margin-bottom: 15px;
    }
  `,
})
export class NuevoContactoComponent {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);

  // Mientras el alta está en curso se ignoran más envíos: un doble clic en «Añadir» hacía dos
  // POST y json-server guardaba el contacto dos veces.
  protected readonly enviando = signal(false);
  // Antes el error solo se registraba en la consola y el usuario no veía nada.
  protected readonly error = signal(false);

  agregarContacto(contacto: Contacto): void {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(false);
    this._contactosService.agregarContacto(contacto).subscribe({
      next: () => this._router.navigate(['/mis-contactos']),
      // ContactosService ya registra el detalle del error en la consola.
      error: () => {
        this.enviando.set(false);
        this.error.set(true);
      },
    });
  }
}
