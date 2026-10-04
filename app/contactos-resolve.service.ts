import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { Observable } from "rxjs/Observable";
import "rxjs/add/observable/of";
import "rxjs/add/operator/catch";

import { Contacto } from "./contacto";
import { ContactosService } from "./contactos.service";

@Injectable()
export class ContactosResolve implements Resolve<Contacto[]> {

    constructor(private _contactosService: ContactosService) {}

    // A resolver that errors cancels the navigation: with the API down the
    // router left an empty outlet (and an unhandled promise rejection) and the
    // "Mis Contactos" link did nothing. Resolving to null lets the view load
    // and tell the user the list could not be retrieved.
    resolve(ruta: ActivatedRouteSnapshot): Observable<Contacto[]> {
        return this._contactosService
            .obtenerContactos()
            .catch(() => Observable.of(null));
    }
}
