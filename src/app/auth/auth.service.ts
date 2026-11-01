import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';

import { SUPABASE } from '../supabase/supabase.client';
import { ProveedorOAuth } from './oauth-proveedores';

/**
 * Sesión de la persona usuaria sobre Supabase Auth. Las operaciones lanzan el `error` de Supabase
 * si lo hay; quien las llama lo muestra con `MensajesService.deError()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);

  readonly sesion = signal<Session | null>(null);
  readonly usuario = computed(() => this.sesion()?.user ?? null);
  /**
   * Se resuelve cuando `getSession()` ha contestado y `sesion()` ya refleja la sesión guardada
   * en el navegador. Los guards lo esperan: sin esto, recargar una ruta privada con sesión
   * mandaría a `/entrar` antes de saber si hay sesión.
   */
  readonly listo: Promise<void>;

  constructor() {
    this.supabase.auth.onAuthStateChange((_evento, sesion) => this.sesion.set(sesion));
    this.listo = this.supabase.auth.getSession().then(({ data }) => this.sesion.set(data.session));
  }

  async registrar(email: string, password: string, captchaToken?: string): Promise<void> {
    const { error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: this.urlDe('auth/confirmar'),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) {
      throw error;
    }
  }

  async entrar(email: string, password: string, captchaToken?: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (error) {
      throw error;
    }
    this.sesion.set(data.session);
  }

  /**
   * Google o GitHub. La vuelta es la misma ruta PKCE que el enlace del correo. No hay petición
   * previa: supabase-js redirige el navegador a /auth/v1/authorize, y si el proveedor está apagado
   * en el proyecto es GoTrue quien responde, con un JSON de error. Por eso los botones solo se
   * pintan para los proveedores de `OAUTH_PROVEEDORES`.
   */
  async entrarCon(proveedor: ProveedorOAuth): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: this.urlDe('auth/confirmar') },
    });
    if (error) {
      throw error;
    }
  }

  async salir(): Promise<void> {
    // Solo este dispositivo: sin scope 'local', signOut() cierra la sesión en todos.
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) {
      throw error;
    }
    this.sesion.set(null);
  }

  async recuperar(email: string, captchaToken?: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: this.urlDe('auth/nueva-contrasena'),
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) {
      throw error;
    }
  }

  async nuevaContrasena(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) {
      throw error;
    }
  }

  /**
   * Pide el cambio de email. Con `double_confirm_changes`, no surte efecto hasta que se confirman
   * el correo nuevo y el actual. El perfil sigue mostrando el email de ahora.
   */
  async cambiarEmail(email: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser(
      { email },
      { emailRedirectTo: this.urlDe('auth/confirmar') },
    );
    if (error) {
      throw error;
    }
  }

  async canjearCodigo(code: string): Promise<void> {
    const { error } = await this.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
  }

  /** URL absoluta de una ruta de la aplicación, respetando `<base href>` (GitHub Pages). */
  urlDe(ruta: string): string {
    return new URL(ruta, document.baseURI).href;
  }
}
