import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

import { API_URL } from './api-url.token';
import { Contacto } from './contacto';

@Injectable({ providedIn: 'root' })
export class ContactosService {
  private _http = inject(HttpClient);

  private readonly _rutaApiContactos: string;

  constructor() {
    const apiUrl = inject(API_URL);

    this._rutaApiContactos = `${apiUrl}/contactos`;
  }

  obtenerContactos(): Observable<Contacto[]> {
    return this._http.get<Contacto[]>(this._rutaApiContactos);
  }

  agregarContacto(contacto: Contacto): Observable<Contacto> {
    return this._http
      .post<Contacto>(this._rutaApiContactos, contacto)
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  eliminarContacto(contacto: Contacto): Observable<unknown> {
    return this._http.delete(`${this._rutaApiContactos}/${contacto.id}`);
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    // In a real world app, we might use a remote logging infrastructure
    // HttpClient ya parsea el cuerpo de la respuesta de error en error.error.
    const body = error.error || '';
    const err = body.error || JSON.stringify(body);
    const errMsg = `${error.status} - ${error.statusText || ''} ${err}`;
    console.error(errMsg);
    return throwError(() => new Error(errMsg));
  }
}
