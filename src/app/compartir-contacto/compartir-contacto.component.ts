import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { Comparticion, ContactoVisible, Rol } from '../contacto';
import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './compartir-contacto.component.html',
  styleUrl: './compartir-contacto.component.css',
})
export class CompartirContactoComponent implements OnInit {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);

  // Dato del resolver de la ruta (contactoResolver), que withComponentInputBinding() entrega como
  // input. Es null si el contacto no existe o la persona no puede verlo (por ejemplo, porque su
  // dueño lo ha borrado y con él las comparticiones): la RLS no distingue los dos casos.
  readonly contacto = input.required<ContactoVisible | null>();

  // El contacto que esta persona puede compartir: solo el propietario. Quien lo tiene compartido
  // (lector o editor) queda igual que si no existiera: la RLS le ocultaría las comparticiones de
  // los demás y la RPC rechazaría el intento.
  protected readonly propio = computed(() => {
    const contacto = this.contacto();
    return contacto?.rol === 'propietario' ? contacto : null;
  });

  // Las personas con acceso. Sin zone.js, lo que se asigna tras un await no se repinta salvo que
  // sea un signal. `cargada` distingue «aún no ha llegado» de «no hay nadie».
  protected readonly comparticiones = signal<Comparticion[]>([]);
  protected readonly cargada = signal(false);
  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);

  // Una sola vez al abrir la pantalla.
  async ngOnInit(): Promise<void> {
    if (!this.propio()) {
      this._mensajes.error('Solo el propietario puede compartir');
      // replaceUrl: «Atrás» no debe volver a una dirección que solo llevaría otra vez a /mis-contactos.
      await this._router.navigate(['/mis-contactos'], { replaceUrl: true });
      return;
    }
    await this.cargar();
  }

  async compartir(form: NgForm): Promise<void> {
    if (this.enviando()) {
      return;
    }
    const { email, rol } = form.value as { email: string; rol: Rol };
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    this.enviando.set(true);
    try {
      await this._contactosService.compartir(this.propio()!.id, email, rol);
    } catch (error) {
      this.avisarDe(error);
      return;
    } finally {
      this.enviando.set(false);
    }
    this._mensajes.exito(`Compartido con ${email} como ${rol}`);
    // Listo para compartir con otra persona: sin email y con el mismo rol.
    form.resetForm({ email: '', rol });
    await this.cargar();
  }

  async cambiarRol(comparticion: Comparticion, selector: HTMLSelectElement): Promise<void> {
    const rol = selector.value as Rol;
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.cambiarRol(this.propio()!.id, comparticion.usuario_id, rol);
    } catch (error) {
      // El selector ya enseña el rol nuevo y la base de datos sigue con el anterior; como el
      // rol de la lista no ha cambiado, Angular no lo repintaría.
      selector.value = comparticion.rol;
      this.avisarDe(error);
      return;
    }
    this.comparticiones.update((lista) =>
      lista.map((c) => (c.usuario_id === comparticion.usuario_id ? { ...c, rol } : c)),
    );
  }

  async revocar(comparticion: Comparticion): Promise<void> {
    // Fuera el aviso del intento anterior.
    this._mensajes.limpiar();
    try {
      await this._contactosService.dejarDeCompartir(this.propio()!.id, comparticion.usuario_id);
    } catch (error) {
      this.avisarDe(error);
      return;
    }
    this.comparticiones.update((lista) =>
      lista.filter((c) => c.usuario_id !== comparticion.usuario_id),
    );
  }

  // Pide la lista de personas con acceso. Si falla, avisa y deja la que hubiera.
  private async cargar(): Promise<void> {
    try {
      const lista = await this._contactosService.listarComparticiones(this.propio()!.id);
      // PostgREST no garantiza el orden: por email, para que la lista no se reordene al volver a
      // compartir con alguien (que actualiza su fila).
      this.comparticiones.set([...lista].sort((a, b) => a.email.localeCompare(b.email)));
    } catch (error) {
      this.avisarDe(error);
      return;
    }
    this.cargada.set(true);
  }

  private avisarDe(error: unknown): void {
    this._mensajes.error(this._mensajes.deError(error as PostgrestError));
  }
}
