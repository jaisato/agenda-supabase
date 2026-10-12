import { Component, input, output } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

import { DatosContacto } from '../contacto';

@Component({
  selector: 'formulario-contacto',
  imports: [FormsModule],
  templateUrl: './formulario-contacto.component.html',
  styleUrl: './formulario-contacto.component.css',
})
export class FormularioContactoComponent {
  // Valores de partida (al editar un contacto); sin ellos, el formulario empieza vacío.
  readonly inicial = input<DatosContacto | null>(null);
  readonly textoBoton = input('Añadir');
  // Mientras quien usa el formulario espera la respuesta del guardado, el botón no se puede pulsar.
  readonly enviando = input(false);
  readonly guardar = output<DatosContacto>();

  // '#formContacto="ngForm"' es un NgForm (formulario dirigido por plantilla), no un FormGroup.
  notificarGuardado(form: NgForm) {
    // form.value solo tiene los seis campos con name, aunque `inicial` traiga más (un contacto
    // entero): es justo lo que la base de datos deja insertar o actualizar.
    this.guardar.emit(form.value as DatosContacto);
  }
}
