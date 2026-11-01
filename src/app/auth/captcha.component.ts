import { AfterViewInit, Component, ElementRef, signal, viewChild } from '@angular/core';

import { environment } from '../../environments/environment';

interface HCaptchaApi {
  render(elemento: HTMLElement, opciones: Record<string, unknown>): string;
  reset(widgetId?: string): void;
}

let carga: Promise<void> | null = null;

/** El script solo se pide si hay clave de sitio. Un fallo no debe tumbar el formulario. */
function cargarHcaptcha(): Promise<void> {
  const api = (window as Window & { hcaptcha?: HCaptchaApi }).hcaptcha;
  if (api) {
    return Promise.resolve();
  }
  if (carga) {
    return carga;
  }
  carga = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      carga = null;
      reject(new Error('hcaptcha'));
    };
    document.head.appendChild(script);
  });
  return carga;
}

/** Widget de hCaptcha. Sin clave (producción y los tests) no pinta nada ni carga el script. */
@Component({
  selector: 'app-captcha',
  templateUrl: './captcha.component.html',
})
export class CaptchaComponent implements AfterViewInit {
  private readonly contenedor = viewChild<ElementRef<HTMLElement>>('contenedor');
  // Lo que devuelve render(): hace falta para reiniciar el widget tras cada envío.
  private widgetId: string | undefined;

  readonly token = signal('');
  protected readonly fallo = signal(false);

  ngAfterViewInit(): void {
    if (!environment.captchaSiteKey) {
      return;
    }
    void this.montar();
  }

  /** Con clave de sitio, el formulario espera un token. Sin clave, no estorba. */
  bloqueaEnvio(): boolean {
    return environment.captchaSiteKey.length > 0 && !this.token();
  }

  /** Solo se manda a Auth cuando el widget ha contestado. */
  tokenSiHay(): string | undefined {
    return this.token() || undefined;
  }

  /**
   * Un token solo vale para una petición a Auth: tras cada envío, acertado o no, el widget vuelve
   * a pedir la comprobación. Sin clave de sitio no hay widget y solo se vacía el token.
   */
  reiniciar(): void {
    this.token.set('');
    const api = (window as Window & { hcaptcha?: HCaptchaApi }).hcaptcha;
    if (!api || this.widgetId === undefined) {
      return;
    }
    try {
      api.reset(this.widgetId);
    } catch {
      // El widget ya no está en la página (el formulario se ha ocultado): no hay nada que reiniciar.
    }
  }

  private async montar(): Promise<void> {
    try {
      await cargarHcaptcha();
      const elemento = this.contenedor()?.nativeElement;
      const api = (window as Window & { hcaptcha?: HCaptchaApi }).hcaptcha;
      if (!elemento || !api) {
        this.fallo.set(true);
        return;
      }
      this.widgetId = api.render(elemento, {
        sitekey: environment.captchaSiteKey,
        callback: (token: string) => this.token.set(token),
        'expired-callback': () => this.token.set(''),
        'error-callback': () => this.token.set(''),
      });
    } catch {
      this.fallo.set(true);
    }
  }
}
