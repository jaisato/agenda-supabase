import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

import { API_URL } from './api-url.token';
import { Contacto } from './contacto';

@Injectable({ providedIn: 'root' })
export class ContactosService {
  private readonly _http = inject(HttpClient);
  private readonly _rutaApiContactos = `${inject(API_URL)}/contactos`;

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
    // statusText está obsoleto: con HTTP/2 o posterior el servidor no envía el texto del estado
    // y Angular deja «OK» aunque el código no sea 200. Se mantiene para conservar el mensaje que
    // registraba la versión con @angular/http («500 - Internal Server Error …»): json-server
    // sirve HTTP/1.1, que sí lo envía.
    const errMsg = `${error.status} - ${error.statusText || ''} ${err}`;
    console.error(errMsg);
    return throwError(() => new Error(errMsg));
  }
}
