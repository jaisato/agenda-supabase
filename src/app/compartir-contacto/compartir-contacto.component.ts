import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { Comparticion, ContactoVisible, InvitacionPorEmail, Rol } from '../contacto';
import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';
import { TiempoRealService } from '../tiempo-real.service';

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './compartir-contacto.component.html',
  styleUrl: './compartir-contacto.component.css',
})
export class CompartirContactoComponent implements OnInit {
  private readonly _router = inject(Router);
  private readonly _contactosService = inject(ContactosService);
  private readonly _mensajes = inject(MensajesService);
  private readonly tiempoReal = inject(TiempoRealService);

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
  protected readonly invitaciones = signal<InvitacionPorEmail[]>([]);
  protected readonly cargada = signal(false);
  // Mientras espera la respuesta no se puede volver a enviar el formulario.
  protected readonly enviando = signal(false);
  // Como en MisContactosComponent: solo aplica su respuesta la última carga pedida (los avisos de
  // Realtime llegan en ráfaga y pueden contestar en otro orden), y cambiar un rol o revocar a mano
  // pasa turno, para que una carga que salió antes no deshaga en pantalla lo que se acaba de hacer.
  private turno = 0;
  // Las cargas pedidas que aún no han contestado: ver pasarTurno().
  private enVuelo = 0;

  constructor() {
    // revision 0 es el arranque: la carga la hace ngOnInit. Un aviso posterior vuelve a pedirlas.
    effect(() => {
      if (this.tiempoReal.revision() === 0 || !this.propio()) {
        return;
      }
      void this.cargar();
    });
  }

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
      const comparticion = await this._contactosService.compartir(this.propio()!.id, email, rol);
      const destino = comparticion.email;
      const texto = comparticion.sin_cuenta
        ? `Invitación guardada para ${destino}. Cuando cree su cuenta, podrá aceptarla.`
        : comparticion.estado === 'pendiente'
          ? `Invitación enviada a ${destino} como ${rol}`
          : `${destino} ahora es ${rol}`;
      this._mensajes.exito(texto);
    } catch (error) {
      this.avisarDe(error);
      return;
    } finally {
      this.enviando.set(false);
    }
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
    this.pasarTurno();
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
    this.pasarTurno();
    this.comparticiones.update((lista) =>
      lista.filter((c) => c.usuario_id !== comparticion.usuario_id),
    );
  }

  async revocarInvitacion(invitacion: InvitacionPorEmail): Promise<void> {
    this._mensajes.limpiar();
    try {
      await this._contactosService.revocarInvitacion(this.propio()!.id, invitacion.email);
    } catch (error) {
      this.avisarDe(error);
      return;
    }
    this.pasarTurno();
    this.invitaciones.update((lista) => lista.filter((i) => i.email !== invitacion.email));
  }

  // Tras un cambio hecho a mano. La carga que estuviera en vuelo queda invalidada entera, también
  // lo ajeno que trajera (otro invitado que acaba de aceptar), así que se pide otra: sale después
  // del cambio y ya lo refleja. Sin ella la pantalla se quedaba con el estado viejo hasta el aviso
  // del propio cambio, que solo llega si Realtime está en marcha.
  private pasarTurno(): void {
    this.turno++;
    if (this.enVuelo > 0) {
      void this.cargar();
    }
  }

  // Pide las dos listas. Si falla, avisa y deja las que hubiera.
  private async cargar(): Promise<void> {
    const contacto = this.propio();
    if (!contacto) {
      return;
    }
    const turno = ++this.turno;
    this.enVuelo++;
    try {
      const lista = await this._contactosService.listarComparticiones(contacto.id);
      const porEmail = await this._contactosService.listarInvitacionesEmail(contacto.id);
      // Hay una carga posterior en marcha, o un cambio hecho a mano: manda lo de después.
      if (turno !== this.turno) {
        return;
      }
      // PostgREST no garantiza el orden: por email, para que la lista no se reordene al volver a
      // compartir con alguien (que actualiza su fila).
      this.comparticiones.set([...lista].sort((a, b) => a.email.localeCompare(b.email, 'es')));
      this.invitaciones.set([...porEmail].sort((a, b) => a.email.localeCompare(b.email, 'es')));
    } catch (error) {
      if (turno === this.turno) {
        this.avisarDe(error);
      }
      return;
    } finally {
      this.enVuelo--;
    }
    this.cargada.set(true);
  }

  private avisarDe(error: unknown): void {
    this._mensajes.error(this._mensajes.deError(error as PostgrestError));
  }
}
