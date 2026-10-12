import { Contacto, ContactoVisible } from './contacto';
import { SortContactsPipe } from './sort-contacts.pipe';
import { contactoDePrueba, contactoVisibleDePrueba } from './testing/contactos-de-prueba';

const contacto = (nombre: string, apellidos: string): Contacto =>
  contactoDePrueba({ nombre, apellidos });
const nombreCompleto = (c: Contacto) => `${c.nombre} ${c.apellidos}`;

describe('SortContactsPipe', () => {
  const pipe = new SortContactsPipe();
  const contactos = [
    contacto('Tim', 'Cook'),
    contacto('bill', 'Gates'),
    contacto('Elon', 'Musk'),
    contacto('Bill', 'Clinton'),
  ];

  it('ordena por nombre y apellidos, sin distinguir mayúsculas, de forma ascendente', () => {
    expect(pipe.transform(contactos, 'asc').map(nombreCompleto)).toEqual([
      'Bill Clinton',
      'bill Gates',
      'Elon Musk',
      'Tim Cook',
    ]);
  });

  it('ordena de forma descendente con cualquier otro sentido', () => {
    expect(pipe.transform(contactos, 'desc').map(nombreCompleto)).toEqual([
      'Tim Cook',
      'Elon Musk',
      'bill Gates',
      'Bill Clinton',
    ]);
  });

  it('no reordena el array que recibe', () => {
    const original = [...contactos];
    pipe.transform(contactos, 'asc');
    expect(contactos).toEqual(original);
  });

  it('devuelve una lista vacía mientras los contactos no han llegado', () => {
    expect(pipe.transform(undefined, 'asc')).toEqual([]);
    expect(pipe.transform(null, 'asc')).toEqual([]);
  });

  it('devuelve el mismo tipo de contacto que recibe, con todos sus campos (también el rol)', () => {
    const visibles: ContactoVisible[] = pipe.transform(
      [contactoVisibleDePrueba('lector', { nombre: 'Tim' })],
      'asc',
    );

    expect(visibles[0].rol).toBe('lector');
  });
});
