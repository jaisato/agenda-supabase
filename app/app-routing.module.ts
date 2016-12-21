import { RouterModule, Routes } from "@angular/router";
import { NgModule } from "@angular/core";

// Routing components
import { MisContactosComponent } from "./mis-contactos/mis-contactos.component";
import { NuevoContactoComponent } from "./nuevo-contacto/nuevo-contacto.component";
import { ContactosResolve } from "./contactos-resolve.service";

// Definimos la rutas de nuestra aplicacion
// Las rutas son pares 'ruta' + 'componente'
const rutas: Routes = [
    {
        path: "mis-contactos",
        component: MisContactosComponent,
        resolve: {
            contactos: ContactosResolve
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

@NgModule({
    // Importamos un nuevo modulo generado a partir de las rutas
    imports: [RouterModule.forRoot(rutas)],
    // Exportamos el 'RouterModule' para evitar cargarlo de nuevo en 'AppModule'
    exports: [RouterModule]
})
export class AppRoutingModule { }