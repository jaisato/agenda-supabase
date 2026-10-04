import { Injectable } from "@angular/core";
import { Http, Response } from "@angular/http";
import { Observable } from "rxjs/Observable";
import "rxjs/add/observable/throw";
import "rxjs/add/operator/map";
import "rxjs/add/operator/catch";

import { Contacto } from "./contacto";

@Injectable()
export class ContactosService {

    private _rutaApiContactos: string = "http://localhost:3005/contactos";

    constructor(private _http: Http) { }

    obtenerContactos(): Observable<Contacto[]> {
        return this._http
            .get(this._rutaApiContactos)
            .map((datos: Response) => {
                return datos.json() as Contacto[];
            })
            .catch(this.handleError);
    }

    agregarContacto(contacto: Contacto): Observable<Contacto> {
        return this._http
            .post(this._rutaApiContactos, contacto)
            .map((datos: Response) => {
                return datos.json() as Contacto;
            })
            .catch(this.handleError);
    }

    eliminarContacto(contacto: Contacto): Observable<any> {
        return this._http
            .delete(`${this._rutaApiContactos}/${contacto.id}`)
            .catch(this.handleError);
    }

    private handleError(error: Response | any) {
        // In a real world app, we might use a remote logging infrastructure
        let errMsg: string;
        if (error instanceof Response) {
            // A 404/500 page from a proxy or an empty body is not JSON:
            // Response.json() would throw a SyntaxError here and the caller
            // would get that instead of the HTTP status.
            let err: string;
            try {
                const body = error.json() || "";
                err = body.error || JSON.stringify(body);
            } catch (e) {
                err = error.text();
            }
            errMsg = `${error.status} - ${error.statusText || ""} ${err}`;
        } else {
            errMsg = error.message ? error.message : error.toString();
        }
        console.error(errMsg);
        return Observable.throw(errMsg);
    }
}
