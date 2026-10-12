import { Injectable, signal } from '@angular/core';

export type Mensaje = { tipo: 'error' | 'exito'; texto: string };

/**
 * El mensaje del TypeError de fetch() cuando la petición no llega al servidor (sin red, o con el
 * proyecto pausado), en Chrome, Firefox y Safari. supabase-js no lanza ese error: PostgREST lo
 * devuelve con code vacío y el nombre delante («TypeError: Failed to fetch») y Auth, como un
 * AuthRetryableFetchError sin code y con el mensaje tal cual.
 */
const SIN_CONEXION =
  /^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource|Load failed)/;

/**
 * El único aviso visible de la aplicación (lo pinta app.component.html) y la traducción a texto
 * legible de los errores de PostgREST y de Supabase Auth.
 */
@Injectable({ providedIn: 'root' })
export class MensajesService {
  readonly mensaje = signal<Mensaje | null>(null);

  error(texto: string): void {
    this.mensaje.set({ tipo: 'error', texto });
  }

  exito(texto: string): void {
    this.mensaje.set({ tipo: 'exito', texto });
  }

  limpiar(): void {
    this.mensaje.set(null);
  }

  /**
   * Texto para mostrar de un error de Supabase (`PostgrestError` o `AuthError`). Se decide por
   * `error.code`, nunca por el estado HTTP: varios errores distintos comparten estado. Solo un error
   * sin code se reconoce por su mensaje: el de fetch() cuando no hay conexión.
   */
  deError(error: { code?: string | null; message: string }): string {
    if (!error.code && SIN_CONEXION.test(error.message)) {
      return 'No hay conexión con el servidor';
    }
    switch (error.code) {
      case '42501':
        return 'No tienes permiso para hacer eso';
      // Errores de la RPC compartir_contacto (PT404: no hay usuario con ese email; 22023:
      // compartir con uno mismo). Su mensaje ya está en español.
      case 'PT404':
      case '22023':
        return error.message;
      case 'invalid_credentials':
        return 'Email o contraseña incorrectos';
      case 'email_not_confirmed':
        return 'Confirma tu correo antes de entrar';
      case 'user_already_exists':
        return 'Ya existe una cuenta con ese email';
      case 'weak_password':
        return 'La contraseña debe tener al menos 8 caracteres';
      case 'over_email_send_rate_limit':
        return 'Demasiados correos en poco tiempo; espera un momento';
      default:
        return `Algo ha fallado: ${error.message}`;
    }
  }
}
