import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';
import { MockInstance } from 'vitest';

import { Comparticion, ContactoVisible, Rol } from '../contacto';
import { ContactosService } from '../contactos.service';
import { MensajesService } from '../mensajes.service';
import { SUPABASE } from '../supabase/supabase.client';
import { contactoVisibleDePrueba } from '../testing/contactos-de-prueba';
import { SupabaseFalso, crearSupabaseFalso } from '../testing/supabase-falso';
import { CompartirContactoComponent } from './compartir-contacto.component';

// Lo que entrega el resolver: el contacto entero (Tim Cook, de u1) y el rol de quien lo abre.
const propio = contactoVisibleDePrueba('propietario', { id: 'c1' });
const deOtro = (rol: 'lector' | 'editor') =>
  contactoVisibleDePrueba(rol, { id: 'c1', propietario_id: 'u2' });
// Lo que devuelve PostgREST: cada compartición con el perfil embebido.
const fila = (usuario_id: string, rol: Rol, email: string) => ({
  usuario_id,
  rol,
  perfiles: { email },
});
const filaB = fila('u2', 'lector', 'b@x.es');
const filaC = fila('u3', 'editor', 'c@x.es');
// La fila de contactos_compartidos que devuelve la RPC compartir_contacto.
const compartidoCon = (usuario_id: string, rol: Rol) => ({
  contacto_id: 'c1',
  usuario_id,
  rol,
  creado_en: '2026-10-01T10:00:00+00:00',
});

// Lo que contesta la base de datos a una consulta que la RLS no deja hacer.
const sinPermiso = new PostgrestError({
  message: 'permission denied for table contactos_compartidos',
  details: '',
  hint: '',
  code: '42501',
});
// Los tres errores de la RPC compartir_contacto, con su mensaje en español.
const noEsElPropietario = new PostgrestError({
  message: 'Solo el propietario puede compartir el contacto',
  details: '',
  hint: '',
  code: '42501',
});
const sinUsuario = new PostgrestError({
  message: 'No hay ningún usuario con ese email',
  details: '',
  hint: '',
  code: 'PT404',
});
const conUnoMismo = new PostgrestError({
  message: 'No puedes compartir un contacto contigo mismo',
  details: '',
  hint: '',
  code: '22023',
});
const avisoSoloPropietario = { tipo: 'error', texto: 'Solo el propietario puede compartir' };

describe('CompartirContactoComponent', () => {
  let falso: SupabaseFalso;
  let fixture: ComponentFixture<CompartirContactoComponent>;
  let elemento: HTMLElement;
  let mensajes: MensajesService;
  let navegar: MockInstance<Router['navigate']>;
  const formulario = () => elemento.querySelector<HTMLFormElement>('form')!;
  const campoEmail = () => elemento.querySelector<HTMLInputElement>('form input#email')!;
  const campoRol = () => elemento.querySelector<HTMLSelectElement>('form select#rol')!;
  const boton = () => elemento.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  // La lista de personas con acceso: una fila por compartición.
  const filas = () => Array.from(elemento.querySelectorAll('tbody tr'));
  const emails = () => filas().map((f) => f.querySelector('td')?.textContent?.trim());
  const selectorDe = (indice: number) =>
    filas()[indice].querySelector<HTMLSelectElement>('select')!;
  const roles = () => filas().map((_, indice) => selectorDe(indice).value);
  const revocar = (indice: number) => filas()[indice].querySelector<HTMLButtonElement>('button')!;
  const consultasDeLaTabla = () =>
    falso.consultas.filter((consulta) => consulta.tabla === 'contactos_compartidos');
  // Deja que terminen las promesas pendientes y el repintado que provocan.
  const reposar = async () => {
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();
  };
  // Abre la pantalla como el router: el resolver entrega el contacto como input.
  const abrir = async (contacto: ContactoVisible | null) => {
    fixture = TestBed.createComponent(CompartirContactoComponent);
    elemento = fixture.nativeElement;
    fixture.componentRef.setInput('contacto', contacto);
    await reposar();
  };
  // Escribe en el formulario real (y elige el rol, si se indica).
  const escribir = async (email: string, rol?: Rol) => {
    campoEmail().value = email;
    campoEmail().dispatchEvent(new Event('input'));
    if (rol) {
      campoRol().value = rol;
      campoRol().dispatchEvent(new Event('change'));
    }
    await fixture.whenStable();
  };
  const enviar = async () => {
    boton().click();
    await reposar();
  };
  const cambiarRol = async (indice: number, rol: Rol) => {
    selectorDe(indice).value = rol;
    selectorDe(indice).dispatchEvent(new Event('change'));
    await reposar();
  };
  const hayComparticiones = (...registros: object[]) =>
    falso.respuestaDe('contactos_compartidos', { data: registros, error: null });

  beforeEach(() => {
    falso = crearSupabaseFalso();
    hayComparticiones(filaB, filaC);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SUPABASE, useValue: falso.cliente }],
    });
    mensajes = TestBed.inject(MensajesService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('con un contacto propio', () => {
    it('pide las comparticiones del contacto y pinta la lista: el email, el rol y «Revocar» de cada persona', async () => {
      await abrir(propio);

      expect(falso.consultas).toEqual([
        {
          tabla: 'contactos_compartidos',
          cadena: [
            { metodo: 'select', args: ['usuario_id, rol, perfiles(email)'] },
            { metodo: 'eq', args: ['contacto_id', 'c1'] },
          ],
        },
      ]);
      expect(emails()).toEqual(['b@x.es', 'c@x.es']);
      expect(roles()).toEqual(['lector', 'editor']);
      expect(filas().map((f) => f.querySelector('button')?.textContent?.trim())).toEqual([
        'Revocar',
        'Revocar',
      ]);
      expect(mensajes.mensaje()).toBeNull();
      expect(navegar).not.toHaveBeenCalled();
    });

    it('pinta de qué contacto se trata, el formulario con el rol «lector» elegido y el enlace «Volver» a /mis-contactos', async () => {
      await abrir(propio);

      expect(elemento.querySelector('h5')?.textContent?.trim()).toBe('Tim Cook');
      expect(campoEmail().value).toBe('');
      // El email es el de otra persona: que el navegador no ofrezca el propio.
      expect(campoEmail().getAttribute('autocomplete')).toBe('off');
      expect(Array.from(campoRol().options, (opcion) => opcion.value)).toEqual([
        'lector',
        'editor',
      ]);
      expect(campoRol().value).toBe('lector');
      expect(boton().textContent?.trim()).toBe('Compartir');
      const volver = Array.from(elemento.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Volver',
      );
      expect(volver?.getAttribute('href')).toBe('/mis-contactos');
    });

    it('ordena a las personas por email, venga como venga de la base de datos', async () => {
      hayComparticiones(filaC, filaB);

      await abrir(propio);

      expect(emails()).toEqual(['b@x.es', 'c@x.es']);
      expect(roles()).toEqual(['lector', 'editor']);
    });

    it('si no está compartido con nadie, lo dice en lugar de pintar la lista', async () => {
      hayComparticiones();

      await abrir(propio);

      expect(filas()).toEqual([]);
      expect(elemento.textContent).toContain('Este contacto no está compartido con nadie.');
    });

    it('mientras carga la lista no dice que no hay nadie', async () => {
      let terminarCarga!: (lista: Comparticion[]) => void;
      vi.spyOn(TestBed.inject(ContactosService), 'listarComparticiones').mockReturnValue(
        new Promise<Comparticion[]>((resolver) => (terminarCarga = resolver)),
      );
      await abrir(propio);
      expect(elemento.textContent).not.toContain('Este contacto no está compartido con nadie.');
      expect(filas()).toEqual([]);

      terminarCarga([{ usuario_id: 'u2', rol: 'lector', email: 'b@x.es' }]);
      await reposar();

      expect(emails()).toEqual(['b@x.es']);
    });

    it('si no se puede cargar la lista, avisa del error y no pinta ni la lista ni «no está compartido con nadie»', async () => {
      falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });

      await abrir(propio);

      expect(mensajes.mensaje()).toEqual({
        tipo: 'error',
        texto: 'No tienes permiso para hacer eso',
      });
      expect(filas()).toEqual([]);
      expect(elemento.textContent).not.toContain('no está compartido con nadie');
      // Se queda en la pantalla, con el formulario.
      expect(navegar).not.toHaveBeenCalled();
      expect(formulario()).not.toBeNull();
    });

    describe('compartir', () => {
      it('deshabilita «Compartir» hasta que hay un email válido', async () => {
        await abrir(propio);
        expect(boton().disabled).toBe(true);

        await escribir('no-es-un-email');
        expect(boton().disabled).toBe(true);

        await escribir('b@x.es');
        expect(boton().disabled).toBe(false);
      });

      it('al enviar comparte con el email y el rol elegidos, avisa y recarga la lista', async () => {
        hayComparticiones();
        falso.respuestaRpc('compartir_contacto', {
          data: compartidoCon('u2', 'editor'),
          error: null,
        });
        const compartir = vi.spyOn(TestBed.inject(ContactosService), 'compartir');
        await abrir(propio);
        expect(emails()).toEqual([]);
        // Lo que dirá la base de datos al volver a pedir la lista.
        hayComparticiones(fila('u2', 'editor', 'b@x.es'));

        await escribir('b@x.es', 'editor');
        await enviar();

        expect(compartir).toHaveBeenCalledExactlyOnceWith('c1', 'b@x.es', 'editor');
        expect(falso.cliente.rpc).toHaveBeenCalledExactlyOnceWith('compartir_contacto', {
          p_contacto_id: 'c1',
          p_email: 'b@x.es',
          p_rol: 'editor',
        });
        expect(mensajes.mensaje()).toEqual({
          tipo: 'exito',
          texto: 'Compartido con b@x.es como editor',
        });
        // La lista se vuelve a pedir y se repinta con la persona nueva.
        expect(consultasDeLaTabla()).toHaveLength(2);
        expect(emails()).toEqual(['b@x.es']);
        expect(roles()).toEqual(['editor']);
        expect(navegar).not.toHaveBeenCalled();
      });

      it('tras compartir deja el formulario listo para otra persona: sin email y con el rol que se había elegido', async () => {
        falso.respuestaRpc('compartir_contacto', {
          data: compartidoCon('u4', 'editor'),
          error: null,
        });
        await abrir(propio);
        await escribir('d@x.es', 'editor');

        await enviar();

        expect(campoEmail().value).toBe('');
        expect(campoRol().value).toBe('editor');
        // Vacío pero sin quejarse: el campo no se ha tocado desde el reinicio.
        expect(elemento.querySelector('.msg-error')).toBeNull();
        expect(boton().disabled).toBe(true);
      });

      it.each([
        { error: noEsElPropietario, texto: 'No tienes permiso para hacer eso' },
        { error: sinUsuario, texto: 'No hay ningún usuario con ese email' },
        { error: conUnoMismo, texto: 'No puedes compartir un contacto contigo mismo' },
      ])(
        'si la RPC falla con $error.code, avisa con «$texto», se queda en la pantalla con el email escrito y no recarga la lista',
        async ({ error, texto }) => {
          falso.respuestaRpc('compartir_contacto', { data: null, error });
          await abrir(propio);

          await escribir('b@x.es', 'editor');
          await enviar();

          expect(mensajes.mensaje()).toEqual({ tipo: 'error', texto });
          expect(navegar).not.toHaveBeenCalled();
          expect(campoEmail().value).toBe('b@x.es');
          expect(campoRol().value).toBe('editor');
          expect(consultasDeLaTabla()).toHaveLength(1);
          expect(emails()).toEqual(['b@x.es', 'c@x.es']);
        },
      );

      it('al reintentar, el aviso del intento anterior desaparece mientras espera y el resultado lo sustituye', async () => {
        falso.respuestaRpc('compartir_contacto', { data: null, error: sinUsuario });
        await abrir(propio);
        await escribir('b@x.es');
        await enviar();
        expect(mensajes.mensaje()?.tipo).toBe('error');
        let terminarComparticion!: (comparticion: Comparticion) => void;
        vi.spyOn(TestBed.inject(ContactosService), 'compartir').mockReturnValue(
          new Promise<Comparticion>((resolver) => (terminarComparticion = resolver)),
        );

        await enviar();
        expect(mensajes.mensaje()).toBeNull();
        terminarComparticion({ usuario_id: 'u2', rol: 'lector', email: 'b@x.es' });
        await reposar();

        expect(mensajes.mensaje()).toEqual({
          tipo: 'exito',
          texto: 'Compartido con b@x.es como lector',
        });
      });

      it('mientras espera la respuesta no deja enviar otra vez y, al contestar, vuelve a permitirlo', async () => {
        let fallar!: (error: PostgrestError) => void;
        const compartir = vi
          .spyOn(TestBed.inject(ContactosService), 'compartir')
          .mockReturnValue(new Promise<Comparticion>((_resolver, rechazar) => (fallar = rechazar)));
        await abrir(propio);
        await escribir('b@x.es');

        await enviar();
        expect(boton().disabled).toBe(true);
        // Intro dentro de un campo: envía el formulario sin pasar por el botón deshabilitado.
        formulario().dispatchEvent(new Event('submit'));
        await reposar();
        expect(compartir).toHaveBeenCalledOnce();

        fallar(sinUsuario);
        await reposar();
        expect(boton().disabled).toBe(false);
      });
    });

    describe('cambiar el rol', () => {
      it('actualiza el rol de esa persona y solo el suyo, sin volver a pedir la lista', async () => {
        hayComparticiones(filaB, filaC, fila('u4', 'lector', 'd@x.es'));
        await abrir(propio);

        await cambiarRol(0, 'editor');

        expect(consultasDeLaTabla().slice(1)).toEqual([
          {
            tabla: 'contactos_compartidos',
            cadena: [
              { metodo: 'update', args: [{ rol: 'editor' }] },
              { metodo: 'eq', args: ['contacto_id', 'c1'] },
              { metodo: 'eq', args: ['usuario_id', 'u2'] },
            ],
          },
        ]);
        expect(roles()).toEqual(['editor', 'editor', 'lector']);
        expect(emails()).toEqual(['b@x.es', 'c@x.es', 'd@x.es']);
        expect(mensajes.mensaje()).toBeNull();
      });

      it('el cambio es de la persona de la fila que se toca (la segunda: u3)', async () => {
        await abrir(propio);

        await cambiarRol(1, 'lector');

        expect(consultasDeLaTabla()[1].cadena).toEqual([
          { metodo: 'update', args: [{ rol: 'lector' }] },
          { metodo: 'eq', args: ['contacto_id', 'c1'] },
          { metodo: 'eq', args: ['usuario_id', 'u3'] },
        ]);
      });

      it('si falla, avisa del error y el selector vuelve al rol que tenía', async () => {
        await abrir(propio);
        falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });

        await cambiarRol(0, 'editor');

        expect(mensajes.mensaje()).toEqual({
          tipo: 'error',
          texto: 'No tienes permiso para hacer eso',
        });
        // La base de datos sigue con «lector»: el selector no puede quedarse en «editor».
        expect(roles()).toEqual(['lector', 'editor']);
        expect(navegar).not.toHaveBeenCalled();
      });

      it('tras un cambio que ha salido bien, si el siguiente falla, el selector vuelve al rol ya guardado', async () => {
        await abrir(propio);
        await cambiarRol(0, 'editor');
        falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });

        await cambiarRol(0, 'lector');

        expect(mensajes.mensaje()?.tipo).toBe('error');
        // En la base de datos es «editor» desde el primer cambio, no el «lector» de la carga.
        expect(roles()).toEqual(['editor', 'editor']);
      });

      it('quita el aviso anterior', async () => {
        await abrir(propio);
        mensajes.error('Algo ha fallado');

        await cambiarRol(0, 'editor');

        expect(mensajes.mensaje()).toBeNull();
      });
    });

    describe('revocar', () => {
      it('quita el acceso de esa persona y la saca de la lista', async () => {
        const dejarDeCompartir = vi.spyOn(TestBed.inject(ContactosService), 'dejarDeCompartir');
        await abrir(propio);

        revocar(0).click();
        await reposar();

        expect(dejarDeCompartir).toHaveBeenCalledExactlyOnceWith('c1', 'u2');
        expect(consultasDeLaTabla().slice(1)).toEqual([
          {
            tabla: 'contactos_compartidos',
            cadena: [
              { metodo: 'delete', args: [] },
              { metodo: 'eq', args: ['contacto_id', 'c1'] },
              { metodo: 'eq', args: ['usuario_id', 'u2'] },
            ],
          },
        ]);
        expect(emails()).toEqual(['c@x.es']);
        expect(roles()).toEqual(['editor']);
        expect(mensajes.mensaje()).toBeNull();
      });

      it('al revocar a la última persona, la pantalla dice que no está compartido con nadie', async () => {
        hayComparticiones(filaB);
        await abrir(propio);

        revocar(0).click();
        await reposar();

        expect(filas()).toEqual([]);
        expect(elemento.textContent).toContain('Este contacto no está compartido con nadie.');
      });

      it('si falla, avisa del error y deja a la persona en la lista', async () => {
        await abrir(propio);
        falso.respuestaDe('contactos_compartidos', { data: null, error: sinPermiso });

        revocar(0).click();
        await reposar();

        expect(mensajes.mensaje()).toEqual({
          tipo: 'error',
          texto: 'No tienes permiso para hacer eso',
        });
        expect(emails()).toEqual(['b@x.es', 'c@x.es']);
      });

      it('quita el aviso anterior', async () => {
        await abrir(propio);
        mensajes.error('Algo ha fallado');

        revocar(0).click();
        await reposar();

        expect(mensajes.mensaje()).toBeNull();
      });
    });
  });

  describe('sin ser el propietario', () => {
    // Quien tiene el contacto compartido lo ve en «Compartidos conmigo», sin botón «Compartir»;
    // si abre la dirección a mano, la RLS le ocultaría las comparticiones de los demás.
    it.each([['lector' as const], ['editor' as const]])(
      'un %s que abre /contactos/:id/compartir a mano vuelve a /mis-contactos con el aviso, sin pintar nada ni pedir nada',
      async (rol) => {
        await abrir(deOtro(rol));

        expect(mensajes.mensaje()).toEqual(avisoSoloPropietario);
        expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
        expect(formulario()).toBeNull();
        expect(filas()).toEqual([]);
        expect(falso.cliente.from).not.toHaveBeenCalled();
      },
    );

    // El dueño lo borró (con él, las comparticiones) y el resolver ya no lo encuentra.
    it('si el contacto no existe o ya no se ve (el resolver entrega null), pasa lo mismo', async () => {
      await abrir(null);

      expect(mensajes.mensaje()).toEqual(avisoSoloPropietario);
      expect(navegar).toHaveBeenCalledExactlyOnceWith(['/mis-contactos'], { replaceUrl: true });
      expect(formulario()).toBeNull();
      expect(falso.cliente.from).not.toHaveBeenCalled();
    });
  });
});
