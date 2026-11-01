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

/** Rol de quien ve un contacto: `propietario` si es suyo; si no, el de su compartición. */
export type RolVisible = 'propietario' | Rol;

/** Dueño de un contacto, tal como lo deja ver la política de perfiles. */
export interface PropietarioVisible {
  nombre: string | null;
  email: string;
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
}
