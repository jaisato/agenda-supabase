import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth/auth.service';
import { AvatarService } from './avatar.service';
import { SUPABASE } from './supabase/supabase.client';
import { Database } from './supabase/database.types';

/** Una fila de `perfiles`. */
export type Perfil = Database['public']['Tables']['perfiles']['Row'];

const COLUMNAS = 'id, email, nombre, avatar_ruta, creado_en';

const EXTENSION_DE: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * El perfil de la persona con la sesión abierta. `perfil` se mantiene al entrar y al salir, para
 * que la barra pueda mostrar el nombre sin esperar a abrir `/perfil`.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  private readonly avatares = inject(AvatarService);

  readonly perfil = signal<Perfil | null>(null);
  /** URL firmada del avatar de la sesión, o null si no hay foto. */
  readonly urlAvatar = signal<string | null>(null);

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

    effect((onCleanup) => {
      // Cuando una firma está a punto de caducar, AvatarService avisa y la URL se vuelve a pedir.
      this.avatares.renovacion();
      const ruta = this.perfil()?.avatar_ruta ?? null;
      if (!ruta) {
        this.urlAvatar.set(null);
        return;
      }
      let vigente = true;
      onCleanup(() => {
        vigente = false;
      });
      void this.avatares.urlDe(ruta).then((url) => {
        if (vigente) {
          this.urlAvatar.set(url);
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

  /**
   * Sube el fichero a `{id}/avatar.jpg|png|webp` (la extensión sale del tipo, no del nombre) y
   * guarda esa ruta. Si cambia la extensión, borra el objeto anterior.
   */
  async subirAvatar(archivo: File): Promise<Perfil> {
    const id = this.auth.usuario()?.id;
    if (!id) {
      throw new Error('No hay sesión');
    }
    const extension = EXTENSION_DE[archivo.type];
    if (!extension) {
      throw new Error('El avatar debe ser JPEG, PNG o WebP');
    }
    const ruta = `${id}/avatar.${extension}`;
    const anterior = this.perfil()?.avatar_ruta ?? null;
    const { error } = await this.supabase.storage.from('avatares').upload(ruta, archivo, {
      upsert: true,
      contentType: archivo.type,
    });
    if (error) {
      throw error;
    }
    if (anterior && anterior !== ruta) {
      const { error: errorBorrado } = await this.supabase.storage
        .from('avatares')
        .remove([anterior]);
      if (errorBorrado) {
        throw errorBorrado;
      }
      this.avatares.olvidar(anterior);
    }
    this.avatares.olvidar(ruta);
    return this.guardarRuta(id, ruta);
  }

  /** Quita el fichero y deja `avatar_ruta` a null. */
  async quitarAvatar(): Promise<Perfil> {
    const id = this.auth.usuario()?.id;
    if (!id) {
      throw new Error('No hay sesión');
    }
    const ruta = this.perfil()?.avatar_ruta ?? null;
    if (ruta) {
      const { error } = await this.supabase.storage.from('avatares').remove([ruta]);
      if (error) {
        throw error;
      }
      this.avatares.olvidar(ruta);
    }
    return this.guardarRuta(id, null);
  }

  private async guardarRuta(id: string, ruta: string | null): Promise<Perfil> {
    const { data, error } = await this.supabase
      .from('perfiles')
      .update({ avatar_ruta: ruta })
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
