import { Database } from './supabase/database.types';

/** Una fila de la tabla `contactos`. */
export type Contacto = Database['public']['Tables']['contactos']['Row'];

/** Lo que escribe la persona en el formulario; el resto de columnas las pone la base de datos. */
export type DatosContacto = Pick<
  Contacto,
  'nombre' | 'apellidos' | 'email' | 'telefono' | 'facebook' | 'twitter'
>;

/** Rol con el que el propietario comparte un contacto. */
export type Rol = Database['public']['Enums']['rol_comparticion'];

/** `pendiente` hasta que el destinatario acepta; rechazar borra la fila. */
export type EstadoComparticion = Database['public']['Enums']['estado_comparticion'];

/** Rol de quien ve un contacto: `propietario` si es suyo; si no, el de su compartición. */
export type RolVisible = 'propietario' | Rol;

/** Dueño de un contacto, tal como lo deja ver la política de perfiles. */
export interface PropietarioVisible {
  nombre: string | null;
  email: string;
  /** Ruta en el bucket privado `avatares`, o null si no ha subido foto. */
  avatar_ruta: string | null;
}

/** Un contacto tal como lo ve la persona con la sesión abierta. */
export interface ContactoVisible extends Contacto {
  rol: RolVisible;
  propietario: PropietarioVisible;
}

/** Una persona con acceso a un contacto compartido. */
export interface Comparticion {
  usuario_id: string;
  rol: Rol;
  email: string;
  estado: EstadoComparticion;
}

/** Lo que devuelve `compartir_contacto`: una compartición o una invitación a quien no tiene cuenta. */
export interface ResultadoCompartir {
  usuario_id: string | null;
  rol: Rol;
  estado: EstadoComparticion;
  email: string;
  sin_cuenta: boolean;
}

/** Email guardado porque todavía no hay cuenta con la que compartir. */
export interface InvitacionPorEmail {
  email: string;
  rol: Rol;
}

/** Invitación que el destinatario aún no ha aceptado. No incluye el contacto entero. */
export interface InvitacionPendiente {
  contacto_id: string;
  nombre: string;
  rol: Rol;
  propietario_nombre: string | null;
  propietario_email: string;
}
