import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth/auth.service';
import { Contacto, ContactoVisible, DatosContacto, Rol } from './contacto';
import { SUPABASE } from './supabase/supabase.client';

// Un contacto con las comparticiones embebidas. La RLS decide qué comparticiones llegan: el
// propietario ve todas las de sus contactos; quien recibe un contacto, solo la suya, y de ella
// sale su rol.
const CONTACTO_CON_COMPARTICIONES = '*, contactos_compartidos(usuario_id, rol)';

type FilaConComparticiones = Contacto & {
  contactos_compartidos: { usuario_id: string; rol: Rol }[];
};

/**
 * Los contactos de la persona con la sesión abierta, sobre Supabase. Todas las operaciones lanzan
 * el `PostgrestError` de Supabase si lo hay; quien las llama lo muestra con
 * `MensajesService.deError()`.
 */
@Injectable({ providedIn: 'root' })
export class ContactosService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  async obtenerContactos(): Promise<ContactoVisible[]> {
    const usuarioId = this.auth.usuario()?.id;
    const { data, error } = await this.supabase
      .from('contactos')
      .select(CONTACTO_CON_COMPARTICIONES)
      .order('nombre');
    if (error) {
      throw error;
    }
    return data.map((fila) => this.visible(fila, usuarioId));
  }

  /** `null` si no existe o la persona no puede verlo (la RLS no distingue los dos casos). */
  async obtenerContacto(id: string): Promise<ContactoVisible | null> {
    const usuarioId = this.auth.usuario()?.id;
    const { data, error } = await this.supabase
      .from('contactos')
      .select(CONTACTO_CON_COMPARTICIONES)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data ? this.visible(data, usuarioId) : null;
  }

  async agregarContacto(datos: DatosContacto): Promise<Contacto> {
    const { data, error } = await this.supabase.from('contactos').insert(datos).select().single();
    if (error) {
      throw error;
    }
    return data;
  }

  async editarContacto(id: string, datos: DatosContacto): Promise<Contacto> {
    const { data, error } = await this.supabase
      .from('contactos')
      .update(datos)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  async eliminarContacto(id: string): Promise<void> {
    const { error } = await this.supabase.from('contactos').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  private visible(fila: FilaConComparticiones, usuarioId: string | undefined): ContactoVisible {
    const { contactos_compartidos, ...contacto } = fila;
    // La RLS solo deja ver contactos propios o compartidos con la persona, así que una de las dos
    // se cumple siempre; si no, el rol mínimo.
    const rol =
      contacto.propietario_id === usuarioId
        ? 'propietario'
        : (contactos_compartidos.find((c) => c.usuario_id === usuarioId)?.rol ?? 'lector');
    return { ...contacto, rol };
  }
}
