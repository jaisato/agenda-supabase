// Datos de demostración: dos usuarios, cinco contactos y dos comparticiones. Es idempotente: se
// puede ejecutar las veces que haga falta (también para restaurar la demo) y no duplica nada.
//
//   SUPABASE_URL=<url del proyecto> SUPABASE_SECRET_KEY=<clave secreta> npm run seed:demo
//
// En local, con el stack en marcha (`npx supabase start`), las dos salen de `supabase status`:
//
//   eval "$(npx supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY|SECRET_KEY)=')"
//   SUPABASE_URL=$API_URL SUPABASE_SECRET_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY} npm run seed:demo
//
// La clave secreta se salta la RLS y da acceso a la API de administración de usuarios: solo vive
// en el entorno de quien ejecuta el script. Nunca va al repositorio, al navegador ni a la salida.
import { createClient } from '@supabase/supabase-js';

const faltan = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter((nombre) => !process.env[nombre]);
if (faltan.length > 0) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}.`);
  console.error('Uso: SUPABASE_URL=<url> SUPABASE_SECRET_KEY=<clave secreta> npm run seed:demo');
  process.exit(1);
}

const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: clave } = process.env;
const supabase = createClient(url, clave, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO = 'demo@jasato.com';
const INVITADO = 'invitado@jasato.com';

// La contraseña de demo es pública (está en el README). La de invitado cambia en cada ejecución:
// esa cuenta solo existe para dar y recibir comparticiones, nadie entra con ella.
const USUARIOS = [
  { email: DEMO, password: 'agenda-demo-2026' },
  { email: INVITADO, password: crypto.randomUUID() },
];

const TIM_COOK = '11111111-1111-4111-8111-000000000001';
const ADA_LOVELACE = '11111111-1111-4111-8111-000000000005';

// Identificadores fijos: así el upsert actualiza los mismos contactos en cada ejecución.
const CONTACTOS = [
  {
    id: TIM_COOK,
    propietario: DEMO,
    nombre: 'Tim',
    apellidos: 'Cook',
    email: 'tim.cook@gmail.com',
    telefono: '555-123456',
    facebook: 'tim.cook',
    twitter: '@timcook',
  },
  {
    id: '11111111-1111-4111-8111-000000000002',
    propietario: DEMO,
    nombre: 'Bill',
    apellidos: 'Gates',
    email: 'bill.gates@msn.com',
    telefono: '555-123456',
    facebook: 'bill.gates',
    twitter: '@BillGates',
  },
  {
    id: '11111111-1111-4111-8111-000000000003',
    propietario: DEMO,
    nombre: 'Elon',
    apellidos: 'Musk',
    email: 'elon.musk@tesla.com',
    telefono: '393-209423',
    facebook: 'elon.musk',
    twitter: '@elonmusk',
  },
  {
    id: '11111111-1111-4111-8111-000000000004',
    propietario: DEMO,
    nombre: 'Steve',
    apellidos: 'Jobs',
    email: 'steve.jobs@apple.com',
    telefono: '303-23032',
    facebook: 'steve.jobs',
    twitter: '@stevejobs',
  },
  {
    id: ADA_LOVELACE,
    propietario: INVITADO,
    nombre: 'Ada',
    apellidos: 'Lovelace',
    email: 'ada@analytical.engine',
    telefono: '000-000000',
    facebook: 'ada.lovelace',
    twitter: '@ada',
  },
];

// Demo ve a Ada y puede editarla; invitado ve a Tim Cook pero no puede editarlo.
const COMPARTICIONES = [
  { contacto_id: ADA_LOVELACE, con: DEMO, rol: 'editor' },
  { contacto_id: TIM_COOK, con: INVITADO, rol: 'lector' },
];

const USUARIOS_POR_PAGINA = 200;

/** Devuelve el dato de una respuesta de Supabase o lanza su error, indicando el paso. */
function dato({ data, error }, paso) {
  if (error) {
    throw new Error(`${paso}: ${error.message}`);
  }
  return data;
}

/**
 * El usuario con ese email, o `null`. Recorre las páginas de `listUsers` hasta encontrarlo o hasta
 * que una venga vacía. No se fía de `nextPage` (auth-js solo lee la primera cifra del número de
 * página) ni de que una página incompleta sea la última (el servidor podría limitar `perPage`).
 */
async function buscarUsuario(email) {
  for (let pagina = 1; ; pagina++) {
    const { users } = dato(
      await supabase.auth.admin.listUsers({ page: pagina, perPage: USUARIOS_POR_PAGINA }),
      'listar usuarios',
    );
    if (users.length === 0) {
      return null;
    }
    const encontrado = users.find((usuario) => usuario.email?.toLowerCase() === email);
    if (encontrado) {
      return encontrado;
    }
  }
}

/** Deja el usuario creado, con esa contraseña y el email confirmado (no hace falta correo). */
async function asegurarUsuario({ email, password }) {
  const existente = await buscarUsuario(email);
  if (existente) {
    dato(
      await supabase.auth.admin.updateUserById(existente.id, { password, email_confirm: true }),
      `actualizar ${email}`,
    );
    return { email, id: existente.id, accion: 'actualizado' };
  }
  const { user } = dato(
    await supabase.auth.admin.createUser({ email, password, email_confirm: true }),
    `crear ${email}`,
  );
  return { email, id: user.id, accion: 'creado' };
}

async function sembrar() {
  const usuarios = [];
  for (const usuario of USUARIOS) {
    usuarios.push(await asegurarUsuario(usuario));
  }
  const idDe = (email) => usuarios.find((usuario) => usuario.email === email).id;

  // El trigger de auth.users ya ha creado los perfiles, así que las claves ajenas se cumplen.
  const contactos = dato(
    await supabase
      .from('contactos')
      .upsert(
        CONTACTOS.map(({ propietario, ...datos }) => ({
          ...datos,
          propietario_id: idDe(propietario),
        })),
        { onConflict: 'id' },
      )
      .select('id'),
    'guardar contactos',
  );

  // Los contactos que demo e invitado hayan creado después (la cuenta demo es pública) se borran.
  const sobrantes = dato(
    await supabase
      .from('contactos')
      .delete()
      .in('propietario_id', [idDe(DEMO), idDe(INVITADO)])
      .not('id', 'in', `(${CONTACTOS.map(({ id }) => id).join(',')})`)
      .select('id'),
    'borrar contactos sobrantes',
  );

  const comparticiones = dato(
    await supabase
      .from('contactos_compartidos')
      .upsert(
        COMPARTICIONES.map(({ contacto_id, con, rol }) => ({
          contacto_id,
          usuario_id: idDe(con),
          rol,
        })),
        { onConflict: 'contacto_id,usuario_id' },
      )
      .select('contacto_id'),
    'guardar comparticiones',
  );

  console.log(`Datos de demostración listos en ${url}`);
  console.log(
    `  usuarios:       ${usuarios.length} (${usuarios.map((u) => `${u.email} ${u.accion}`).join(', ')})`,
  );
  console.log(`  contactos:      ${contactos.length} (${sobrantes.length} sobrantes borrados)`);
  console.log(`  comparticiones: ${comparticiones.length}`);
}

try {
  await sembrar();
} catch (error) {
  console.error(`No se pudieron preparar los datos de demostración. ${error.message}`);
  process.exitCode = 1;
}
