// Desarrollo: el stack local de la CLI (`npx supabase start`). La clave es la que la CLI
// imprime con `npx supabase status -o env` (PUBLISHABLE_KEY); es la misma en cualquier máquina.
export const environment = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  // Clave de sitio de pruebas de hCaptcha: el widget siempre pasa. El secreto gemelo está en
  // config.toml y solo vale tras el siguiente `supabase start`.
  captchaSiteKey: '10000000-ffff-ffff-ffff-000000000001',
  // En config.toml Google y GitHub están con enabled = false: sin sus credenciales locales, los
  // botones no se pintan. Al activarlos allí, añadir aquí 'google' o 'github'.
  oauthProveedores: [] as Array<'google' | 'github'>,
  // Mismo proyecto de Sentry que producción, etiquetado como development para filtrarlo. Déjalo
  // vacío ('') si no quieres que el desarrollo local envíe nada.
  sentry: {
    dsn: 'https://39614323e4644643d3725bdabd73281e@o4512305721376768.ingest.de.sentry.io/4512390926434384',
    environment: 'development',
    tracesSampleRate: 1.0,
  },
};
