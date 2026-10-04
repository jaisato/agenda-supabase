import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'barra-navegacion',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './barra-navegacion.component.html',
  styleUrl: './barra-navegacion.component.css',
  // Las pestañas son <li> inline-block: el espacio entre ellas es el salto de línea de la
  // plantilla. Angular 2 conservaba ese espacio; desde Angular 6 se elimina por defecto y las
  // pestañas quedaban pegadas.
  preserveWhitespaces: true,
})
export class BarraNavegacionComponent {}
