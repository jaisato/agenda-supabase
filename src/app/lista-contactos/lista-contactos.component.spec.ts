import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContactoVisible, RolVisible } from '../contacto';
import { contactoVisibleDePrueba } from '../testing/contactos-de-prueba';
import { ListaContactosComponent } from './lista-contactos.component';

const contacto = (
  id: string,
  nombre: string,
  apellidos: string,
  rol: RolVisible = 'propietario',
): ContactoVisible => contactoVisibleDePrueba(rol, { id, nombre, apellidos });
const tim = contacto('c1', 'Tim', 'Cook');
const bill = contacto('c2', 'Bill', 'Gates');
const elon = contacto('c3', 'Elon', 'Musk');

describe('ListaContactosComponent', () => {
  let fixture: ComponentFixture<ListaContactosComponent>;
  let elemento: HTMLElement;
  // El nombre de cada <li>, sin la etiqueta del rol.
  const nombres = () =>
    Array.from(elemento.querySelectorAll('li'), (li) => li.firstChild?.textContent?.trim());
  const roles = () =>
    Array.from(elemento.querySelectorAll('li'), (li) => li.querySelector('.rol')?.textContent);

  beforeEach(async () => {
    fixture = TestBed.createComponent(ListaContactosComponent);
    elemento = fixture.nativeElement;
    fixture.componentRef.setInput('contactos', [tim, bill, elon]);
    await fixture.whenStable();
  });

  it('muestra los contactos ordenados alfabéticamente', () => {
    expect(nombres()).toEqual(['Bill Gates', 'Elon Musk', 'Tim Cook']);
    expect(elemento.querySelector('button.icono i')?.className).toBe('fa fa-sort-alpha-desc');
  });

  it('invierte el orden y el icono al pulsar el botón de ordenación', async () => {
    elemento.querySelector<HTMLButtonElement>('button.icono')?.click();
    await fixture.whenStable();

    expect(nombres()).toEqual(['Tim Cook', 'Elon Musk', 'Bill Gates']);
    expect(elemento.querySelector('button.icono i')?.className).toBe('fa fa-sort-alpha-asc');
  });

  it('se repinta cuando cambia el input', async () => {
    fixture.componentRef.setInput('contactos', [tim]);
    await fixture.whenStable();

    expect(nombres()).toEqual(['Tim Cook']);
  });

  it('emite el contacto en el que se hace clic', () => {
    const seleccionados: ContactoVisible[] = [];
    fixture.componentInstance.contactoSeleccionado.subscribe((c) => seleccionados.push(c));

    elemento.querySelectorAll('li')[1].click();

    expect(seleccionados).toEqual([elon]);
  });

  it('pone la etiqueta del rol a los contactos que no son propios y a los propios no', async () => {
    fixture.componentRef.setInput('contactos', [
      contacto('c1', 'Tim', 'Cook', 'propietario'),
      contacto('c2', 'Bill', 'Gates', 'lector'),
      contacto('c3', 'Elon', 'Musk', 'editor'),
    ]);
    await fixture.whenStable();

    // Orden alfabético: Bill, Elon, Tim.
    expect(nombres()).toEqual(['Bill Gates', 'Elon Musk', 'Tim Cook']);
    expect(roles()).toEqual(['lector', 'editor', undefined]);
  });

  it('identifica cada contacto por su id: con copias de los mismos contactos conserva los <li>', async () => {
    const antes = Array.from(elemento.querySelectorAll('li'));

    fixture.componentRef.setInput('contactos', [{ ...tim }, { ...bill }, { ...elon }]);
    await fixture.whenStable();

    const despues = Array.from(elemento.querySelectorAll('li'));
    expect(despues).toHaveLength(antes.length);
    antes.forEach((li, i) => expect(despues[i]).toBe(li));
  });
});
