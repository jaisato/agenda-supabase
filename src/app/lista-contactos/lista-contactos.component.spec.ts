import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Contacto } from '../contacto';
import { ListaContactosComponent } from './lista-contactos.component';

const contacto = (id: number, nombre: string, apellidos: string): Contacto => ({
  id,
  nombre,
  apellidos,
  email: '',
  telefono: '',
  facebook: '',
  twitter: '',
});
const tim = contacto(11, 'Tim', 'Cook');
const bill = contacto(12, 'Bill', 'Gates');
const elon = contacto(13, 'Elon', 'Musk');

describe('ListaContactosComponent', () => {
  let fixture: ComponentFixture<ListaContactosComponent>;
  let elemento: HTMLElement;
  const nombres = () => Array.from(elemento.querySelectorAll('li'), (li) => li.textContent?.trim());

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
    const seleccionados: Contacto[] = [];
    fixture.componentInstance.contactoSeleccionado.subscribe((c) => seleccionados.push(c));

    elemento.querySelectorAll('li')[1].click();

    expect(seleccionados).toEqual([elon]);
  });
});
