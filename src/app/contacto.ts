export interface Contacto {
  // Lo asigna json-server al crear el contacto; el formulario no lo envía.
  id?: number;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  facebook: string;
  twitter: string;
}
