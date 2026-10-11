import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Contacto } from '../contacto';
import { FormularioContactoComponent } from './formulario-contacto.component';

// Los campos del formulario: el id lo asigna json-server.
type Formulario = Omit<Contacto, 'id'>;
type Campo = keyof Formulario;

const tim: Formulario = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};

describe('FormularioContactoComponent', () => {
  let fixture: ComponentFixture<FormularioContactoComponent>;
  let elemento: HTMLElement;
  const campo = (id: Campo) => elemento.querySelector<HTMLInputElement>(`input#${id}`)!;
  const anadir = () => elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const errores = () =>
    Array.from(elemento.querySelectorAll('.msg-error'), (error) => error.textContent?.trim());
  const escribir = async (valores: Partial<Formulario>) => {
    for (const [id, valor] of Object.entries(valores)) {
      campo(id as Campo).value = valor ?? '';
      campo(id as Campo).dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
  };
  // Un campo pasa a «touched» al perder el foco.
  const tocar = async (id: Campo) => {
    campo(id).dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(FormularioContactoComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('deshabilita «Añadir» hasta que todos los campos tienen valor', async () => {
    expect(anadir().disabled).toBe(true);

    const { twitter, ...todosMenosTwitter } = tim;
    await escribir(todosMenosTwitter);
    expect(anadir().disabled).toBe(true);

    await escribir({ twitter });
    expect(anadir().disabled).toBe(false);
  });

  it('«Nombre» es obligatorio: sin él no se puede añadir aunque el resto esté relleno', async () => {
    await escribir({ ...tim, nombre: '' });

    expect(campo('nombre').required).toBe(true);
    expect(anadir().disabled).toBe(true);
  });

  it('muestra los mensajes de campo obligatorio solo tras tocar el campo vacío', async () => {
    expect(errores()).toEqual([]);

    await tocar('nombre');
    expect(errores()).toEqual(['El nombre es un campo obligatorio']);

    await tocar('apellidos');
    expect(errores()).toEqual([
      'El nombre es un campo obligatorio',
      'El campo apellidos es obligatorio',
    ]);

    await escribir({ nombre: 'Tim' });
    expect(errores()).toEqual(['El campo apellidos es obligatorio']);
  });

  it('al pulsar «Añadir» emite el contacto con los valores del formulario', async () => {
    const emitidos: Contacto[] = [];
    fixture.componentInstance.nuevoContacto.subscribe((contacto) => emitidos.push(contacto));

    await escribir(tim);
    anadir().click();

    expect(emitidos).toEqual([tim]);
  });
});
