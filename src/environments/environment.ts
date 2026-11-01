// Producción: el proyecto de Supabase publicado. La publishable key es pública por diseño
// (viaja en el JS del navegador); lo que protege los datos son las políticas RLS, no la clave.
export const environment = {
  supabaseUrl: 'https://zckmejrnscenxwiqykkh.supabase.co',
  supabasePublishableKey: 'sb_publishable_Dn4i5OCgsn8KRuXrVX_70A_oXKbs-Bc',
  // Vacío a propósito: sin clave no se pinta el captcha ni se carga el script. Activarlo en el
  // proyecto publicado sin esta clave rompería la demo.
  captchaSiteKey: '',
};
