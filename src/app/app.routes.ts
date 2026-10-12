import { Routes } from '@angular/router';

// Routing components
import { ConfirmarComponent } from './auth/confirmar/confirmar.component';
import { EntrarComponent } from './auth/entrar/entrar.component';
import { NuevaContrasenaComponent } from './auth/nueva-contrasena/nueva-contrasena.component';
import { RecuperarComponent } from './auth/recuperar/recuperar.component';
import { RegistroComponent } from './auth/registro/registro.component';
import { authGuard, sinSesionGuard } from './auth/auth.guard';
import { CompartirContactoComponent } from './compartir-contacto/compartir-contacto.component';
import { EditarContactoComponent } from './editar-contacto/editar-contacto.component';
import { MisContactosComponent } from './mis-contactos/mis-contactos.component';
import { NuevoContactoComponent } from './nuevo-contacto/nuevo-contacto.component';
import { contactoResolver } from './contacto.resolver';
import { contactosResolver } from './contactos.resolver';

// Definimos la rutas de nuestra aplicacion
// Las rutas son pares 'ruta' + 'componente'
export const routes: Routes = [
  // Con la sesión abierta no tienen sentido: sinSesionGuard lleva a /mis-contactos.
  { path: 'entrar', component: EntrarComponent, canActivate: [sinSesionGuard] },
  { path: 'registro', component: RegistroComponent, canActivate: [sinSesionGuard] },
  { path: 'auth/recuperar', component: RecuperarComponent, canActivate: [sinSesionGuard] },
  // Destinos de los enlaces de los correos (?code=…). Sin guard: canjean el code por la sesión.
  { path: 'auth/confirmar', component: ConfirmarComponent },
  { path: 'auth/nueva-contrasena', component: NuevaContrasenaComponent },
  // Rutas privadas: sin sesión, authGuard lleva a /entrar.
  {
    path: 'mis-contactos',
    component: MisContactosComponent,
    canActivate: [authGuard],
    resolve: {
      contactos: contactosResolver,
    },
  },
  {
    path: 'nuevo-contacto',
    component: NuevoContactoComponent,
    canActivate: [authGuard],
  },
  {
    path: 'contactos/:id/editar',
    component: EditarContactoComponent,
    canActivate: [authGuard],
    resolve: {
      contacto: contactoResolver,
    },
  },
  {
    path: 'contactos/:id/compartir',
    component: CompartirContactoComponent,
    canActivate: [authGuard],
    resolve: {
      contacto: contactoResolver,
    },
  },
  // "**" define la ruta por defecto y se pone al final porque matchea con cualquier ruta introducida
  {
    path: '**',
    redirectTo: '/mis-contactos',
  },
];
