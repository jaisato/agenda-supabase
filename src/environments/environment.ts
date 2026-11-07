// Producción: el proyecto de Supabase publicado. La publishable key es pública por diseño
// (viaja en el JS del navegador); lo que protege los datos son las políticas RLS, no la clave.
export const environment = {
  supabaseUrl: 'https://zckmejrnscenxwiqykkh.supabase.co',
  supabasePublishableKey: 'sb_publishable_Dn4i5OCgsn8KRuXrVX_70A_oXKbs-Bc',
  // Vacío a propósito: sin clave no se pinta el captcha ni se carga el script. Activarlo en el
  // proyecto publicado sin esta clave rompería la demo.
  captchaSiteKey: '',
  // Vacío hasta que Google o GitHub tengan client id y secreto en el dashboard: con un proveedor
  // apagado, signInWithOAuth no devuelve error, redirige a un JSON de error de GoTrue. Al
  // activarlos, añadir aquí 'google' o 'github' y los botones aparecen.
  oauthProveedores: [] as Array<'google' | 'github'>,
  // Sentry (proyecto alten-xy/agenda-supabase). El DSN es una clave pública de cliente, como la de
  // Supabase: solo sirve para enviar eventos. Sin DSN el SDK no arranca.
  sentry: {
    dsn: 'https://39614323e4644643d3725bdabd73281e@o4512305721376768.ingest.de.sentry.io/4512390926434384',
    environment: 'production',
    // Trazas de carga y navegación: una de cada cinco sesiones basta para ver tiempos reales.
    tracesSampleRate: 0.2,
  },
};
