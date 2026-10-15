import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  NavigationError,
  RedirectCommand,
  Router,
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { routes } from './app.routes';
import { MensajesService } from './mensajes.service';

/**
 * Si falla un resolver (sin red, proyecto pausado, sesión caducada, un :id que no es un uuid…), el
 * router cancela la navegación y el error solo llegaría a la consola: la pantalla se quedaría como
 * estaba, o en blanco al abrir la aplicación. Se avisa del error y se vuelve a /mis-contactos, salvo
 * que lo que haya fallado sea la propia /mis-contactos: volver ahí sería un bucle, y basta el aviso.
 */
function avisarDelErrorDeNavegacion(navegacion: NavigationError): RedirectCommand | undefined {
  const mensajes = inject(MensajesService);
  const router = inject(Router);
  mensajes.error(mensajes.deError(navegacion.error as PostgrestError));
  // target es el destino con las redirecciones ya aplicadas (una ruta desconocida lleva a
  // /mis-contactos); falta si el fallo llega antes de reconocer la ruta, y entonces vale la URL
  // pedida. Solo cuenta la ruta: con query o fragmento sigue siendo la lista.
  const destino = (navegacion.target?.url ?? navegacion.url).split(/[?#]/, 1)[0];
  if (destino === '/mis-contactos') {
    return undefined;
  }
  return new RedirectCommand(router.createUrlTree(['/mis-contactos']));
}

// Sustituye a AppModule. Los componentes son standalone y los servicios se
// registran con providedIn: 'root', así que aquí solo queda la configuración
// global. La aplicación no usa zone.js: la detección de cambios la disparan los
// signals, los inputs y los eventos de las plantillas.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding() entrega los datos de los resolvers como inputs
    // del componente de la ruta.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(avisarDelErrorDeNavegacion),
    ),
  ],
};
