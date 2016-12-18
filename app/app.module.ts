import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from "@angular/forms";
import { HttpModule } from "@angular/http";

import { AppComponent }  from './app.component';
import { ContactosService } from "./contactos.service";
import { ListaContactosComponent } from "./lista-contactos/lista-contactos.component";
import { FormularioContactoComponent } from "./formulario-contacto/formulario-contacto.component";

@NgModule({
  imports: [ 
    BrowserModule,
    FormsModule,
    HttpModule
  ],
  declarations: [ 
    AppComponent,
    ListaContactosComponent,
    FormularioContactoComponent 
  ],
  providers: [
    ContactosService
  ],
  bootstrap: [ 
    AppComponent 
  ]
})
export class AppModule { }