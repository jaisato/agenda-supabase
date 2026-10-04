import { Component, Input, output } from '@angular/core';

import { Contacto } from '../contacto';

@Component({
  selector: 'detalles-contacto',
  imports: [],
  templateUrl: './detalles-contacto.component.html',
  styleUrl: './detalles-contacto.component.css',
})
export class DetallesContactoComponent {
  @Input() contacto: Contacto | null = null;

  // Usamos el decorador 'Output' para notificar datos de salida.
  readonly eliminar = output<Contacto>();
  // Usamos 'emit' para notificar eventos.
  notificarEliminacion(contacto: Contacto): void {
    this.eliminar.emit(contacto);
  }

  readonly navegarFacebook = output<string>();
  notificarNavegacionFacebook(): void {
    if (this.contacto) {
      this.navegarFacebook.emit(`https://www.facebook.com/${this.perfil(this.contacto.facebook)}`);
    }
  }

  readonly navegarTwitter = output<string>();
  notificarNavegacionTwitter(): void {
    if (this.contacto) {
      this.navegarTwitter.emit(`https://twitter.com/${this.perfil(this.contacto.twitter)}`);
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
