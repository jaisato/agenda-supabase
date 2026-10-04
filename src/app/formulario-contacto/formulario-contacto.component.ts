import { Component, Output, EventEmitter } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Contacto } from '../contacto';

@Component({
  selector: 'formulario-contacto',
  imports: [FormsModule, NgIf],
  templateUrl: './formulario-contacto.component.html',
  styleUrl: './formulario-contacto.component.css',
})
export class FormularioContactoComponent {
  @Output() nuevoContacto: EventEmitter<Contacto> = new EventEmitter();

  // '#formContacto="ngForm"' es un NgForm (formulario dirigido por plantilla), no un FormGroup.
  notificarCreacionContacto(form: NgForm) {
    // emitir el evento de crear contacto
    this.nuevoContacto.emit(form.value as Contacto);
  }
}
