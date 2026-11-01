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
    // entero): es justo lo que la base de datos deja insertar o actualizar. Los extremos se
    // recortan aquí y otra vez en el trigger recortar_contacto.
    const bruto = form.value as DatosContacto;
    const datos: DatosContacto = {
      nombre: bruto.nombre.trim(),
      apellidos: bruto.apellidos.trim(),
      email: bruto.email.trim(),
      telefono: bruto.telefono.trim(),
      facebook: bruto.facebook.trim(),
      twitter: bruto.twitter.trim(),
    };
    if (!datos.nombre) {
      form.controls['nombre'].setValue('');
      form.controls['nombre'].markAsTouched();
      return;
    }
    this.guardar.emit(datos);
  }
}
