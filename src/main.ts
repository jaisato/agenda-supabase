import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Versión que etiqueta cada evento. La define el build (angular.json → define, y --define en el
// despliegue con el commit); en desarrollo queda sin valor.
declare const __SENTRY_RELEASE__: string | undefined;

// Antes que nada: así Sentry ve también los errores del propio arranque. El ErrorHandler y la
// instrumentación del router se registran en app.config.ts.
Sentry.init({
  dsn: environment.sentry.dsn,
  environment: environment.sentry.environment,
  release: __SENTRY_RELEASE__,
  integrations: [
    // Trazas de la carga de la página y de cada navegación del router de Angular.
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: environment.sentry.tracesSampleRate,
  // Sin tracePropagationTargets: las cabeceras sentry-trace/baggage solo van a localhost y al
  // mismo origen. A Supabase no, que es otro origen y las rechazaría en el CORS.
});

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
