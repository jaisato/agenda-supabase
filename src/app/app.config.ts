import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';

// Sustituye a AppModule. Los componentes son standalone y los servicios se
// registran con providedIn: 'root', así que aquí solo queda la configuración
// global. La aplicación no usa zone.js: la detección de cambios la disparan los
// signals, los inputs y los eventos de las plantillas.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding() entrega los datos de los resolvers como inputs
    // del componente de la ruta.
    provideRouter(routes, withComponentInputBinding()),
  ],
};
