import { Routes } from "@angular/router";

// Routing components
import { MisContactosComponent } from "./mis-contactos/mis-contactos.component";
import { NuevoContactoComponent } from "./nuevo-contacto/nuevo-contacto.component";
import { contactosResolver } from "./contactos.resolver";

// Definimos la rutas de nuestra aplicacion
// Las rutas son pares 'ruta' + 'componente'
export const routes: Routes = [
    {
        path: "mis-contactos",
        component: MisContactosComponent,
        resolve: {
            contactos: contactosResolver
        }
    },
    {
        path: "nuevo-contacto",
        component: NuevoContactoComponent
    },
    // "**" define la ruta por defecto y se pone al final porque matchea con cualquier ruta introducida
    {
        path: "**",
        redirectTo: "/mis-contactos"
    }
];
