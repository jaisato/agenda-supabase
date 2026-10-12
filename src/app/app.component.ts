import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { BarraNavegacionComponent } from './barra-navegacion/barra-navegacion.component';
import { MensajesService } from './mensajes.service';

@Component({
  selector: 'my-app',
  imports: [RouterOutlet, BarraNavegacionComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  protected readonly mensajes = inject(MensajesService);
}
