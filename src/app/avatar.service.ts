import { Injectable, inject, signal } from '@angular/core';

import { SUPABASE } from './supabase/supabase.client';

const UNA_HORA_S = 3600;
// Se renueva cuando quedan menos de cinco minutos: una URL recién entregada no debe caducar
// mientras el navegador la está pidiendo.
const MARGEN_MS = 5 * 60 * 1000;

interface Firma {
  url: string;
  /** Instante (`Date.now()`) en que Storage deja de servir la URL. */
  caduca: number;
}

/**
 * URLs firmadas del bucket privado `avatares`. No lee `perfiles`: quien llama ya trae la ruta, así
 * el detalle de un contacto no carga el perfil de la sesión.
 *
 * Cada firma vale una hora. La caché guarda cuándo caduca y `urlDe` vuelve a firmar cuando quedan
 * menos de cinco minutos; sin eso, con la aplicación abierta más de una hora los avatares dejaban
 * de cargar hasta recargar la página. Un temporizador sube `renovacion` en ese momento: los effects
 * que guardan la URL en un signal (la barra, el perfil y el detalle) lo leen y la vuelven a pedir.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly supabase = inject(SUPABASE);
  private readonly cache = new Map<string, Firma>();
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

  /** Sube cada vez que alguna firma está a punto de caducar. Léelo en el effect que llame a `urlDe`. */
  readonly renovacion = signal(0);

  async urlDe(ruta: string | null | undefined): Promise<string | null> {
    if (!ruta) {
      return null;
    }
    const guardada = this.cache.get(ruta);
    if (guardada && !this.aPuntoDeCaducar(guardada)) {
      return guardada.url;
    }
    const { data, error } = await this.supabase.storage
      .from('avatares')
      .createSignedUrl(ruta, UNA_HORA_S);
    if (error || !data?.signedUrl) {
      return null;
    }
    const firma: Firma = { url: data.signedUrl, caduca: Date.now() + UNA_HORA_S * 1000 };
    this.cache.set(ruta, firma);
    this.programarRenovacion(ruta, firma);
    return firma.url;
  }

  /** La misma ruta, tras sustituir el fichero, necesita otra firma. */
  olvidar(ruta: string | null | undefined): void {
    if (!ruta) {
      return;
    }
    this.cache.delete(ruta);
    clearTimeout(this.temporizadores.get(ruta));
    this.temporizadores.delete(ruta);
  }

  private aPuntoDeCaducar(firma: Firma): boolean {
    return firma.caduca - MARGEN_MS <= Date.now();
  }

  private programarRenovacion(ruta: string, firma: Firma): void {
    clearTimeout(this.temporizadores.get(ruta));
    const enMs = Math.max(0, firma.caduca - MARGEN_MS - Date.now());
    this.temporizadores.set(
      ruta,
      setTimeout(() => {
        this.temporizadores.delete(ruta);
        this.renovacion.update((valor) => valor + 1);
      }, enMs),
    );
  }
}
