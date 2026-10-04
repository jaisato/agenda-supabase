import { Contacto } from './contacto';
import { SortContactsPipe } from './sort-contacts.pipe';

const contacto = (nombre: string, apellidos: string): Contacto => ({
  nombre,
  apellidos,
  email: '',
  telefono: '',
  facebook: '',
  twitter: '',
});
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
});
