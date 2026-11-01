import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatosContacto } from '../contacto';
import { contactoVisibleDePrueba } from '../testing/contactos-de-prueba';
import { FormularioContactoComponent } from './formulario-contacto.component';

type Campo = keyof DatosContacto;

const tim: DatosContacto = {
  nombre: 'Tim',
  apellidos: 'Cook',
  email: 'tim.cook@apple.com',
  telefono: '555-123456',
  facebook: 'tim.cook',
  twitter: '@timcook',
};
const campos = Object.keys(tim) as Campo[];

describe('FormularioContactoComponent', () => {
  let fixture: ComponentFixture<FormularioContactoComponent>;
  let elemento: HTMLElement;
  const campo = (id: Campo) => elemento.querySelector<HTMLInputElement>(`input#${id}`)!;
  const boton = () => elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const errores = () =>
    Array.from(elemento.querySelectorAll('.msg-error'), (error) => error.textContent?.trim());
  const escribir = async (valores: Partial<DatosContacto>) => {
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
  const emitidos = () => {
    const guardados: DatosContacto[] = [];
    fixture.componentInstance.guardar.subscribe((datos) => guardados.push(datos));
    return guardados;
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(FormularioContactoComponent);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('sin valor inicial los campos empiezan vacíos y el botón dice «Añadir»', () => {
    expect(campos.map((id) => campo(id).value)).toEqual(['', '', '', '', '', '']);
    expect(boton().textContent?.trim()).toBe('Añadir');
  });

  it('deshabilita «Añadir» hasta que hay un nombre; el resto de campos puede quedar vacío', async () => {
    expect(boton().disabled).toBe(true);
    expect(campo('apellidos').required).toBe(false);
    expect(campo('email').required).toBe(false);
    expect(campo('facebook').required).toBe(false);
    expect(campo('twitter').required).toBe(false);

    await escribir({ nombre: 'Tim' });

    expect(boton().disabled).toBe(false);
  });

  it('«Nombre» es obligatorio: sin él no se puede añadir aunque el resto esté relleno', async () => {
    await escribir({ ...tim, nombre: '' });

    expect(campo('nombre').required).toBe(true);
    expect(boton().disabled).toBe(true);
  });

  it('un nombre de solo espacios no se puede enviar', async () => {
    await escribir({ nombre: '   ' });
    await tocar('nombre');

    expect(boton().disabled).toBe(true);
    expect(errores()).toEqual(['El nombre no puede ser solo espacios']);
  });

  it('un email mal formado no se puede enviar; vacío sí', async () => {
    await escribir({ nombre: 'Tim', email: 'no-es-un-email' });
    await tocar('email');

    expect(campo('email').type).toBe('email');
    expect(boton().disabled).toBe(true);
    expect(errores()).toEqual(['Escribe un email válido']);

    await escribir({ email: '' });
    expect(boton().disabled).toBe(false);
  });

  it('cada campo admite como mucho la longitud que deja la base de datos: si se pasa, no se puede añadir', async () => {
    // Los check de contactos en supabase/migrations/20261011114625_inicial.sql.
    expect(campos.map((id) => campo(id).maxLength)).toEqual([100, 100, 254, 30, 100, 100]);

    // El navegador no deja teclear más; un valor puesto por código lo frena el validador.
    await escribir({ ...tim, nombre: 'x'.repeat(101) });

    expect(boton().disabled).toBe(true);
  });

  it('mientras enviando es true, el botón no se puede pulsar aunque el formulario sea válido', async () => {
    await escribir(tim);

    fixture.componentRef.setInput('enviando', true);
    await fixture.whenStable();

    expect(boton().disabled).toBe(true);
  });

  it('muestra el aviso de nombre obligatorio solo tras tocar el campo vacío', async () => {
    expect(errores()).toEqual([]);

    await tocar('nombre');
    expect(errores()).toEqual(['El nombre es un campo obligatorio']);

    await escribir({ nombre: 'Tim' });
    expect(errores()).toEqual([]);
  });

  it('al pulsar «Añadir» emite los datos con los valores del formulario', async () => {
    const guardados = emitidos();

    await escribir(tim);
    boton().click();

    expect(guardados).toEqual([tim]);
  });

  it('al pulsar «Añadir» recorta los espacios de los extremos', async () => {
    const guardados = emitidos();

    await escribir({
      nombre: '  Tim  ',
      apellidos: ' Cook ',
      email: ' tim.cook@apple.com ',
      telefono: ' 555-123456 ',
      facebook: ' tim.cook ',
      twitter: ' @timcook ',
    });
    boton().click();

    expect(guardados).toEqual([tim]);
  });

  describe('con valor inicial', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('inicial', tim);
      fixture.componentRef.setInput('textoBoton', 'Guardar');
      await fixture.whenStable();
    });

    it('pinta sus valores en los campos', () => {
      expect(campos.map((id) => campo(id).value)).toEqual(campos.map((id) => tim[id]));
    });

    it('el botón dice lo que indica textoBoton', () => {
      expect(boton().textContent?.trim()).toBe('Guardar');
    });

    it('el formulario ya es válido y, sin tocar nada, emite los valores iniciales', () => {
      const guardados = emitidos();

      expect(boton().disabled).toBe(false);
      boton().click();

      expect(guardados).toEqual([tim]);
    });

    it('emite los valores editados', async () => {
      const guardados = emitidos();

      await escribir({ telefono: '555-000000' });
      boton().click();

      expect(guardados).toEqual([{ ...tim, telefono: '555-000000' }]);
    });

    it('si el valor inicial trae más campos (un contacto entero), emite solo los seis del formulario', async () => {
      const contacto = contactoVisibleDePrueba('editor', tim);
      fixture.componentRef.setInput('inicial', contacto);
      await fixture.whenStable();
      const guardados = emitidos();

      boton().click();

      expect(guardados).toEqual([tim]);
    });
  });
});
