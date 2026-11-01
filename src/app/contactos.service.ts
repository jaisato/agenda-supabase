import { Injectable, inject } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';

import { AuthService } from './auth/auth.service';
import {
  Comparticion,
  Contacto,
  ContactoVisible,
  DatosContacto,
  InvitacionPendiente,
  InvitacionPorEmail,
  PropietarioVisible,
  ResultadoCompartir,
  Rol,
} from './contacto';
import { SUPABASE } from './supabase/supabase.client';

// Un contacto con las comparticiones embebidas. La RLS decide qué comparticiones llegan: el
// propietario ve todas las de sus contactos; quien recibe un contacto, solo la suya, y de ella
// sale su rol.
const CONTACTO_CON_COMPARTICIONES =
  '*, contactos_compartidos(usuario_id, rol), propietario:perfiles!contactos_propietario_id_fkey(nombre, email, avatar_ruta)';

type FilaConComparticiones = Contacto & {
  contactos_compartidos: { usuario_id: string; rol: Rol }[];
  propietario: { nombre: string | null; email: string; avatar_ruta?: string | null } | null;
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

  /**
   * Comparte el contacto con ese email. Solo el propietario puede. La RPC normaliza el email y, si
   * ya había una compartición, le cambia el rol sin tocar el estado. Una fila nueva queda
   * `pendiente`. Si el email no tiene cuenta, guarda una invitación (`sin_cuenta`) en vez de fallar.
   * Lanza el error de la RPC: `42501` (no es el propietario) o `22023` (email vacío o el propio).
   * `PT404` ya no sale de esta RPC; se sigue traduciendo por si una versión antigua lo devolviera.
   */
  async compartir(contactoId: string, email: string, rol: Rol): Promise<ResultadoCompartir> {
    const { data, error } = await this.supabase.rpc('compartir_contacto', {
      p_contacto_id: contactoId,
      p_email: email,
      p_rol: rol,
    });
    if (error) {
      throw error;
    }
    if (!data) {
      throw new PostgrestError({
        message: 'La compartición no devolvió resultado',
        details: '',
        hint: '',
        code: 'PGRST116',
      });
    }
    // Una fila antigua de la RPC no trae email ni sin_cuenta: el email es el pedido y hay cuenta.
    return {
      usuario_id: data.usuario_id,
      rol: data.rol ?? rol,
      estado: data.estado ?? 'pendiente',
      email: data.email ?? email,
      sin_cuenta: data.sin_cuenta ?? false,
    };
  }

  /** Invitaciones de la persona con la sesión. Solo el nombre del contacto, no sus datos. */
  async invitaciones(): Promise<InvitacionPendiente[]> {
    const { data, error } = await this.supabase.rpc('invitaciones_pendientes');
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /**
   * Acepta una invitación propia. Si la fila ya no está pendiente, la RLS no la toca y aquí se
   * lanza `42501`: PostgREST no distingue «cero filas» de un update filtrado.
   */
  async aceptar(contactoId: string): Promise<void> {
    const usuarioId = this.auth.usuario()?.id;
    if (!usuarioId) {
      throw new PostgrestError({ message: 'No hay sesión', details: '', hint: '', code: '42501' });
    }
    const { data, error } = await this.supabase
      .from('contactos_compartidos')
      .update({ estado: 'aceptada' })
      .eq('contacto_id', contactoId)
      .eq('usuario_id', usuarioId)
      .eq('estado', 'pendiente')
      .select('contacto_id')
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      throw new PostgrestError({
        message: 'La invitación ya no está pendiente',
        details: '',
        hint: '',
        code: '42501',
      });
    }
  }

  async cambiarRol(contactoId: string, usuarioId: string, rol: Rol): Promise<void> {
    const { error } = await this.supabase
      .from('contactos_compartidos')
      .update({ rol })
      .eq('contacto_id', contactoId)
      .eq('usuario_id', usuarioId);
    if (error) {
      throw error;
    }
  }

  /** Quita el acceso de esa persona al contacto: lo hace el propietario o la propia persona. */
  async dejarDeCompartir(contactoId: string, usuarioId: string): Promise<void> {
    const { error } = await this.supabase
      .from('contactos_compartidos')
      .delete()
      .eq('contacto_id', contactoId)
      .eq('usuario_id', usuarioId);
    if (error) {
      throw error;
    }
  }

  /** Invitaciones a emails que todavía no tienen cuenta. Solo el propietario las ve. */
  async listarInvitacionesEmail(contactoId: string): Promise<InvitacionPorEmail[]> {
    const { data, error } = await this.supabase
      .from('invitaciones_contacto')
      .select('email, rol')
      .eq('contacto_id', contactoId)
      .order('email');
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /** Borra una invitación por email. Lo hace el propietario. */
  async revocarInvitacion(contactoId: string, email: string): Promise<void> {
    const { error } = await this.supabase
      .from('invitaciones_contacto')
      .delete()
      .eq('contacto_id', contactoId)
      .eq('email', email);
    if (error) {
      throw error;
    }
  }

  /** Las personas con acceso al contacto, con su email. Solo el propietario las ve todas. */
  async listarComparticiones(contactoId: string): Promise<Comparticion[]> {
    const { data, error } = await this.supabase
      .from('contactos_compartidos')
      .select('usuario_id, rol, estado, perfiles(email)')
      .eq('contacto_id', contactoId);
    if (error) {
      throw error;
    }
    return data.map(({ usuario_id, rol, estado, perfiles }) => ({
      usuario_id,
      rol,
      estado,
      email: perfiles.email,
    }));
  }

  private visible(fila: FilaConComparticiones, usuarioId: string | undefined): ContactoVisible {
    const { contactos_compartidos, propietario, ...contacto } = fila;
    // La RLS solo deja ver contactos propios o compartidos con la persona, así que una de las dos
    // se cumple siempre; si no, el rol mínimo. El perfil del dueño llega embebido: quien recibe el
    // contacto es su contraparte y la política de perfiles se lo deja ver.
    const rol =
      contacto.propietario_id === usuarioId
        ? 'propietario'
        : (contactos_compartidos.find((c) => c.usuario_id === usuarioId)?.rol ?? 'lector');
    return { ...contacto, rol, propietario: this.propietarioDe(propietario) };
  }

  private propietarioDe(
    propietario: { nombre: string | null; email: string; avatar_ruta?: string | null } | null,
  ): PropietarioVisible {
    if (!propietario) {
      return { nombre: null, email: '', avatar_ruta: null };
    }
    return {
      nombre: propietario.nombre,
      email: propietario.email,
      avatar_ruta: propietario.avatar_ruta ?? null,
    };
  }
}
