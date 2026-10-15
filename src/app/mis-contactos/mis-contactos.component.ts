import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { AuthService } from '../auth/auth.service';
import { ContactoVisible } from '../contacto';
import { ContactosService } from '../contactos.service';
import { DetallesContactoComponent } from '../detalles-contacto/detalles-contacto.component';
import { ListaContactosComponent } from '../lista-contactos/lista-contactos.component';
import { MensajesService } from '../mensajes.service';

@Component({
  imports: [ListaContactosComponent, DetallesContactoComponent],
  templateUrl: './mis-contactos.component.html',
})
export class MisContactosComponent {
  private readonly _auth = inject(AuthService);
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);
  private readonly _router = inject(Router);

  // Datos del resolver de la ruta (contactosResolver), que withComponentInputBinding()
  // entrega como input.
  readonly contactos = input.required<ContactoVisible[]>();

  // Sin zone.js, lo que se asigna tras un await no se repinta salvo que sea un signal. La lista
  // parte de la del resolver y se actualiza al eliminar.
  protected readonly lista = linkedSignal(() => this.contactos());
  // Dos listas con el mismo componente: los contactos propios y los que otras personas han
  // compartido (como lector o editor).
  protected readonly propios = computed(() => this.lista().filter((c) => c.rol === 'propietario'));
  protected readonly compartidos = computed(() =>
    this.lista().filter((c) => c.rol !== 'propietario'),
  );
  protected readonly seleccionado = signal<ContactoVisible | null>(null);

  async eliminarContacto(contacto: ContactoVisible): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar a ${contacto.nombre}?`)) {
      return;
    }
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.eliminarContacto(contacto.id);
    } catch (error) {
      this._mensajes.error(this._mensajes.deError(error as PostgrestError));
      return;
    }
    this.quitarDeLasListas(contacto);
  }

  editar(contacto: ContactoVisible): void {
    this._router.navigate(['/contactos', contacto.id, 'editar']);
  }

  compartir(contacto: ContactoVisible): void {
    this._router.navigate(['/contactos', contacto.id, 'compartir']);
  }

  // Quien tiene un contacto compartido (lector o editor) borra su propia compartición; el contacto
  // sigue siendo de su propietario.
  async dejarDeVer(contacto: ContactoVisible): Promise<void> {
    if (!confirm(`¿Dejar de ver a ${contacto.nombre}?`)) {
      return;
    }
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.dejarDeCompartir(contacto.id, this._auth.usuario()!.id);
    } catch (error) {
      this._mensajes.error(this._mensajes.deError(error as PostgrestError));
      return;
    }
    this.quitarDeLasListas(contacto);
  }

  verDetallesContacto(contacto: ContactoVisible): void {
    this.seleccionado.set(contacto);
  }

  navegarRuta(ruta: string): void {
    // noopener/noreferrer prevent the newly opened tab (external site) from
    // gaining access to `window.opener` and repointing this app's tab
    // (reverse tabnabbing).
    window.open(ruta, '_blank', 'noopener,noreferrer');
  }

  // El contacto ya no se ve (borrado o dejado de ver): fuera de la lista y de los detalles.
  // Mientras esperaba la respuesta, puede haberse seleccionado otro contacto.
  private quitarDeLasListas(contacto: ContactoVisible): void {
    this.seleccionado.update((actual) => (actual?.id === contacto.id ? null : actual));
    this.lista.update((contactos) => contactos.filter((c) => c.id !== contacto.id));
  }
}
