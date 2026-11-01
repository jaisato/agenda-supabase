import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth/auth.service';
import { SUPABASE } from './supabase/supabase.client';
import { Database } from './supabase/database.types';

/** Una fila de `perfiles`. */
export type Perfil = Database['public']['Tables']['perfiles']['Row'];

const COLUMNAS = 'id, email, nombre, creado_en';

/**
 * El perfil de la persona con la sesión abierta. `perfil` se mantiene al entrar y al salir, para
 * que la barra pueda mostrar el nombre sin esperar a abrir `/perfil`.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  readonly perfil = signal<Perfil | null>(null);

  constructor() {
    effect((onCleanup) => {
      const usuario = this.auth.usuario();
      if (!usuario) {
        this.perfil.set(null);
        return;
      }
      let vigente = true;
      onCleanup(() => {
        vigente = false;
      });
      void this.leer()
        .then((perfil) => {
          if (vigente) {
            this.perfil.set(perfil);
          }
        })
        .catch(() => {
          if (vigente) {
            this.perfil.set(null);
          }
        });
    });
  }

  async cargar(): Promise<Perfil> {
    const perfil = await this.leer();
    this.perfil.set(perfil);
    return perfil;
  }

  private async leer(): Promise<Perfil> {
    const id = this.auth.usuario()?.id;
    if (!id) {
      throw new Error('No hay sesión');
    }
    const { data, error } = await this.supabase
      .from('perfiles')
      .select(COLUMNAS)
      .eq('id', id)
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  /** Cadena vacía o solo espacios se guarda como null: el nombre es opcional. */
  async guardarNombre(nombre: string): Promise<Perfil> {
    const id = this.auth.usuario()?.id;
    if (!id) {
      throw new Error('No hay sesión');
    }
    const limpio = nombre.trim() || null;
    const { data, error } = await this.supabase
      .from('perfiles')
      .update({ nombre: limpio })
      .eq('id', id)
      .select(COLUMNAS)
      .single();
    if (error) {
      throw error;
    }
    this.perfil.set(data);
    return data;
  }
}
