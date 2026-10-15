import { Contacto, ContactoVisible, RolVisible } from '../contacto';

/**
 * Una fila completa de `contactos` para las pruebas. Lo que no se indica toma un valor de relleno
 * (Tim Cook, de `u1`), así que cada prueba escribe solo lo que le importa.
 */
export function contactoDePrueba(campos: Partial<Contacto> = {}): Contacto {
  return {
    id: 'c1',
    propietario_id: 'u1',
    nombre: 'Tim',
    apellidos: 'Cook',
    email: 'tim.cook@apple.com',
    telefono: '555-123456',
    facebook: 'tim.cook',
    twitter: '@timcook',
    creado_en: '2026-10-01T10:00:00+00:00',
    actualizado_en: '2026-10-01T10:00:00+00:00',
    ...campos,
  };
}

/** Lo mismo, tal como lo devuelve `ContactosService`: con el rol de quien lo ve. */
export function contactoVisibleDePrueba(
  rol: RolVisible,
  campos: Partial<Contacto> = {},
): ContactoVisible {
  return { ...contactoDePrueba(campos), rol };
}
