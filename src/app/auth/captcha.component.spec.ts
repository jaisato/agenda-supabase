import { TestBed } from '@angular/core/testing';

import { CaptchaComponent } from './captcha.component';

// Los specs compilan environment.ts, con la site key vacía: es el caso de la demo publicada.
describe('CaptchaComponent', () => {
  it('sin site key no carga el script, no bloquea el envío y no manda token', async () => {
    const fixture = TestBed.createComponent(CaptchaComponent);
    await fixture.whenStable();
    const captcha = fixture.componentInstance;

    expect(document.querySelector('script[src*="hcaptcha"]')).toBeNull();
    expect(captcha.bloqueaEnvio()).toBe(false);
    expect(captcha.tokenSiHay()).toBeUndefined();
  });

  it('reiniciar vacía el token aunque no haya widget', async () => {
    const fixture = TestBed.createComponent(CaptchaComponent);
    await fixture.whenStable();
    const captcha = fixture.componentInstance;
    captcha.token.set('token-gastado');
    expect(captcha.tokenSiHay()).toBe('token-gastado');

    captcha.reiniciar();

    expect(captcha.token()).toBe('');
    expect(captcha.tokenSiHay()).toBeUndefined();
  });
});
