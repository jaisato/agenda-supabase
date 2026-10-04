import { Component, input, output } from '@angular/core';

import { Contacto } from '../contacto';

@Component({
  selector: 'detalles-contacto',
  templateUrl: './detalles-contacto.component.html',
  styleUrl: './detalles-contacto.component.css',
  // Los botones de Facebook y Twitter son inline-block y los separa el salto de línea de la
  // plantilla, como en Angular 2. Desde Angular 6 ese espacio se elimina por defecto.
  preserveWhitespaces: true,
})
export class DetallesContactoComponent {
  readonly contacto = input<Contacto | null>(null);

  // Usamos la función 'output' para notificar datos de salida.
  readonly eliminar = output<Contacto>();
  // Usamos 'emit' para notificar eventos.
  notificarEliminacion(contacto: Contacto): void {
    this.eliminar.emit(contacto);
  }

  readonly navegarFacebook = output<string>();
  notificarNavegacionFacebook(): void {
    const contacto = this.contacto();
    if (contacto) {
      this.navegarFacebook.emit(`https://www.facebook.com/${this.perfil(contacto.facebook)}`);
    }
  }

  readonly navegarTwitter = output<string>();
  notificarNavegacionTwitter(): void {
    const contacto = this.contacto();
    if (contacto) {
      this.navegarTwitter.emit(`https://twitter.com/${this.perfil(contacto.twitter)}`);
    }
  }

  // The handle is free text from the form. Interpolated raw, a value such as
  // "a?next=..." or "../x" rewrote the query or the path of the URL opened in
  // the new tab, and a missing handle opened ".../undefined". Encoding keeps
  // it as a single path segment; the leading "@" is dropped because the
  // form's own example ("@timcook") includes it.
  private perfil(handle: string): string {
    return encodeURIComponent((handle || '').trim().replace(/^@/, ''));
  }
}
