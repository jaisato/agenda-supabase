import { Component, effect, inject, input, output, signal } from '@angular/core';

import { AvatarService } from '../avatar.service';
import { ContactoVisible } from '../contacto';

@Component({
  selector: 'detalles-contacto',
  templateUrl: './detalles-contacto.component.html',
  styleUrl: './detalles-contacto.component.css',
  // Los botones de Facebook y Twitter son inline-block y los separa el salto de línea de la
  // plantilla, como en Angular 2. Desde Angular 6 ese espacio se elimina por defecto.
  preserveWhitespaces: true,
})
export class DetallesContactoComponent {
  private readonly avatares = inject(AvatarService);

  readonly contacto = input<ContactoVisible | null>(null);
  protected readonly urlPropietario = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const ruta = this.contacto()?.propietario.avatar_ruta ?? null;
      if (!ruta) {
        this.urlPropietario.set(null);
        return;
      }
      let vigente = true;
      onCleanup(() => {
        vigente = false;
      });
      void this.avatares.urlDe(ruta).then((url) => {
        if (vigente) {
          this.urlPropietario.set(url);
        }
      });
    });
  }

  protected linea(contacto: ContactoVisible): string {
    return [contacto.telefono, contacto.email].filter((parte) => parte.trim()).join(' | ');
  }

  protected actualizado(iso: string): string {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  }

  protected tienePerfil(valor: string): boolean {
    return valor.trim().length > 0;
  }

  // Usamos la función 'output' para notificar datos de salida.
  readonly eliminar = output<ContactoVisible>();
  // Usamos 'emit' para notificar eventos.
  notificarEliminacion(contacto: ContactoVisible): void {
    this.eliminar.emit(contacto);
  }

  readonly editar = output<ContactoVisible>();
  notificarEdicion(contacto: ContactoVisible): void {
    this.editar.emit(contacto);
  }

  readonly compartir = output<ContactoVisible>();
  notificarComparticion(contacto: ContactoVisible): void {
    this.compartir.emit(contacto);
  }

  readonly dejarDeVer = output<ContactoVisible>();
  notificarDejarDeVer(contacto: ContactoVisible): void {
    this.dejarDeVer.emit(contacto);
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
