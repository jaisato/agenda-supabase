import { Component, output } from '@angular/core';

import { FormsModule, NgForm } from '@angular/forms';
import { Contacto } from '../contacto';

@Component({
  selector: 'formulario-contacto',
  imports: [FormsModule],
  templateUrl: './formulario-contacto.component.html',
  styleUrl: './formulario-contacto.component.css',
})
export class FormularioContactoComponent {
  readonly nuevoContacto = output<Contacto>();

  // '#formContacto="ngForm"' es un NgForm (formulario dirigido por plantilla), no un FormGroup.
  notificarCreacionContacto(form: NgForm) {
    // emitir el evento de crear contacto
    this.nuevoContacto.emit(form.value as Contacto);
  }
}
