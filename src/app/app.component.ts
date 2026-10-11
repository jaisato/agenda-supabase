import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { BarraNavegacionComponent } from './barra-navegacion/barra-navegacion.component';

@Component({
  selector: 'my-app',
  imports: [RouterOutlet, BarraNavegacionComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {}
