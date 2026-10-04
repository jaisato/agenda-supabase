import { InjectionToken } from '@angular/core';

/**
 * URL base de la API REST: json-server sirviendo `db.json` (`npm run api`).
 * Las pruebas la sustituyen con `{ provide: API_URL, useValue: ... }`.
 */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:3005',
});
