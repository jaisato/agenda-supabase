import { expect, test } from '@playwright/test';

// La cuenta es pública (README). Con el captcha local activo, la clave de prueba de hCaptcha
// pasa al marcar la casilla.
test('la demo entra y ve a Tim Cook', async ({ page }) => {
  await page.goto('/entrar');
  await page.locator('#email').fill('demo@jasato.com');
  await page.locator('#password').fill('agenda-demo-2026');

  // La clave de prueba de hCaptcha pasa al marcar la casilla. Sin captcha (site key vacía) no hay
  // iframe y el botón ya se puede pulsar. Hay dos iframes (casilla y reto): se pulsa solo la casilla.
  const casilla = page
    .frameLocator('iframe[title="Widget containing checkbox for hCaptcha security challenge"]')
    .locator('#checkbox');
  if (
    (await page
      .locator('iframe[title="Widget containing checkbox for hCaptcha security challenge"]')
      .count()) > 0
  ) {
    await casilla.click();
  }

  const entrar = page.getByRole('button', { name: 'Entrar', exact: true });
  await expect(entrar).toBeEnabled();
  await entrar.click();

  await expect(page.getByRole('button', { name: /Tim Cook/ })).toBeVisible();
});
