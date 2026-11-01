import { Component, effect, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterOutlet } from '@angular/router';

import { authGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
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
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);

  constructor() {
    // authGuard solo se evalúa al navegar. Si la sesión se cierra estando ya en una ruta privada
    // (desde otra pestaña, que supabase-js avisa con SIGNED_OUT, o porque el refresh token ha
    // caducado o se ha revocado), la pantalla seguía mostrando los contactos y cada acción fallaba
    // o, bajo RLS, no hacía nada sin avisar. Al perder la sesión en una ruta privada se va a
    // /entrar, como haría el guard. Con «Salir» la barra ya navega a /entrar y esta segunda
    // navegación a la misma URL no hace nada.
    let habiaSesion = false;
    effect(() => {
      const haySesion = this._auth.sesion() !== null;
      if (habiaSesion && !haySesion && this.enRutaPrivada()) {
        void this._router.navigate(['/entrar']);
      }
      habiaSesion = haySesion;
    });
  }

  private enRutaPrivada(): boolean {
    let ruta: ActivatedRouteSnapshot | null = this._router.routerState.snapshot.root;
    while (ruta) {
      if (ruta.routeConfig?.canActivate?.includes(authGuard)) {
        return true;
      }
      ruta = ruta.firstChild;
    }
    return false;
  }
}
