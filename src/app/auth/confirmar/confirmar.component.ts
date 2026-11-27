import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MensajesService } from '../../mensajes.service';
import { AuthService } from '../auth.service';

/** `?message=` de GoTrue: el cambio de email con confirmación doble acepta el primer enlace. */
export const AVISO_PASO_PENDIENTE =
  'Enlace aceptado. Si estás cambiando el email, abre también el enlace que te hemos enviado al ' +
  'otro correo para terminar.';
/** `?error_code=otp_expired`: el enlace del correo ya se usó o ha caducado. */
export const FALLO_ENLACE_CADUCADO =
  'El enlace no es válido o ha caducado. Entra con tu email y contraseña o pide otro.';
/** `?error=access_denied`: la persona canceló en el proveedor OAuth o este denegó el acceso. */
export const FALLO_ACCESO_DENEGADO =
  'No se ha iniciado sesión: se canceló el acceso o el proveedor lo denegó.';
/** Cualquier otro `?error=`. */
export const FALLO_GENERICO = 'No se ha podido iniciar sesión. Vuelve a intentarlo desde «Entrar».';

// Un parámetro repetido (?message=a&message=b) llega del router como array, sin trim(): cuenta
// como ausente, en vez de lanzar un TypeError que dejaba la página en «Confirmando…».
const leer = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

/**
 * Destino del enlace del correo, de la vuelta de OAuth y del cambio de email (`/auth/confirmar`,
 * flujo PKCE). Con `?code=…` lo canjea por la sesión. GoTrue también vuelve aquí sin `code`: con
 * `?message=…` cuando falta un paso (el cambio de email con confirmación doble acepta el primer
 * enlace y espera el del otro correo) y con `?error=…&error_code=…&error_description=…` cuando el
 * proveedor OAuth deniega el acceso, la persona cancela o el enlace del correo ha caducado.
 *
 * La página enseña textos propios según esos códigos, nunca el texto de la URL: cualquiera puede
 * fabricar un enlace a /auth/confirmar con el `?message=` o el `?error_description=` que quiera, y
 * mostrarlo tal cual ponía en el dominio de la aplicación el mensaje de un tercero (por ejemplo, un
 * aviso falso con un teléfono o un correo de «soporte»). Sin nada de eso, o con un code caducado o
 * ya usado, no hay pantalla en blanco: avisa y ofrece volver a «Entrar».
 */
@Component({
  imports: [RouterLink],
  templateUrl: './confirmar.component.html',
})
export class ConfirmarComponent implements OnInit {
  // Query params, entregados por el router (withComponentInputBinding). GoTrue manda ?error= (como
  // access_denied), ?error_code= (como otp_expired) y ?error_description= (el texto en inglés); los
  // dos códigos eligen el texto propio y la descripción solo cuenta como señal de que hubo error.
  readonly code = input<string>();
  readonly message = input<string>();
  readonly error = input<string>();
  readonly errorCode = input<string | undefined>(undefined, { alias: 'error_code' });
  readonly errorDescription = input<string | undefined>(undefined, {
    alias: 'error_description',
  });

  private readonly auth = inject(AuthService);
  private readonly mensajes = inject(MensajesService);
  private readonly router = inject(Router);

  protected readonly fallido = signal(false);
  /** Con `?message=`: un paso hecho y otro pendiente. */
  protected readonly aviso = signal<string | null>(null);
  /** Con `?error=`, `?error_code=` o `?error_description=`: no hay sesión. */
  protected readonly fallo = signal<string | null>(null);

  // Una sola vez al abrir la página: el code es de un solo uso y un segundo canje fallaría.
  async ngOnInit(): Promise<void> {
    const code = this.code();
    if (!code) {
      const error = leer(this.error());
      const codigoError = leer(this.errorCode());
      if (error || codigoError || leer(this.errorDescription())) {
        this.fallo.set(
          codigoError === 'otp_expired'
            ? FALLO_ENLACE_CADUCADO
            : error === 'access_denied'
              ? FALLO_ACCESO_DENEGADO
              : FALLO_GENERICO,
        );
      } else if (leer(this.message())) {
        this.aviso.set(AVISO_PASO_PENDIENTE);
      } else {
        this.fallido.set(true);
      }
      return;
    }
    try {
      await this.auth.canjearCodigo(code);
    } catch {
      this.fallido.set(true);
      return;
    }
    this.mensajes.exito('Sesión iniciada');
    // replaceUrl: «Atrás» no debe volver a esta URL, cuyo code ya está gastado.
    await this.router.navigate(['/mis-contactos'], { replaceUrl: true });
  }
}
