import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { HttpModule } from "@angular/http";

import { AppComponent }  from './app.component';
import { ContactosService } from "./contactos.service";
import { ListaContactosComponent } from "./lista-contactos/lista-contactos.component";
import { FormularioContactoComponent } from "./formulario-contacto/formulario-contacto.component";
import { DetallesContactoComponent } from "./detalles-contacto/detalles-contacto.component";
import { BarraNavegacionComponent } from "./barra-navegacion/barra-navegacion.component";
// Routing components
import { AppRoutingModule } from "./app-routing.module";
import { MisContactosComponent } from "./mis-contactos/mis-contactos.component";
import { NuevoContactoComponent } from "./nuevo-contacto/nuevo-contacto.component";

import { ContactosResolve } from "./contactos-resolve.service";

@NgModule({
  // Dependencias de módulos externos
  imports: [ 
    BrowserModule,
    FormsModule,
    HttpModule,
    AppRoutingModule
  ],
  // Components, Pipes & Directives de nuestra Application
  declarations: [ 
    AppComponent,
    ListaContactosComponent,
    FormularioContactoComponent,
    DetallesContactoComponent,
    MisContactosComponent,
    NuevoContactoComponent,
    BarraNavegacionComponent
  ],
  // Servicios de nuestro Aplicacion
  providers: [
    ContactosService,
    ContactosResolve
  ],
  // Componente raiz o de arranque de la Aplicacion
  bootstrap: [
    AppComponent 
  ]
})
export class AppModule { }